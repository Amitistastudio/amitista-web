#!/usr/bin/env python3

import json
import logging
import os
import re
import signal
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FIELD_LIMIT = 1024
SHORT_LIMIT = 256

MAX_BODY = 16 * 1024

EMBED_COLOR = 0x8B5CF6

DELIVERY_TIMEOUT = 6
RETRY_PAUSE = 1

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

log = logging.getLogger("contact-relay")


def env_int(name, default):
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default


TOKEN = os.environ.get("CONTACT_TOKEN", "").strip()
BOT_URL = os.environ.get("CONTACT_BOT_URL", "http://127.0.0.1:8794").strip().rstrip("/")


def usable_bot_url(url):
    if not url:
        return False
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https"):
        return False
    return parts.hostname in ("127.0.0.1", "localhost", "::1")


if BOT_URL and not usable_bot_url(BOT_URL):
    log.error("CONTACT_BOT_URL is not a loopback address; ignoring it")
    BOT_URL = ""

DELIVERY_PROBE_TTL = 300
_probe_lock = threading.Lock()
_probe_state = {"checked": 0.0, "live": True}


def delivery_live():
    if not (TOKEN and BOT_URL):
        return False
    now = time.monotonic()
    with _probe_lock:
        if now - _probe_state["checked"] < DELIVERY_PROBE_TTL:
            return _probe_state["live"]
        live = _probe_state["live"]
    try:
        request = urllib.request.Request(
            BOT_URL + "/healthz",
            headers={"Authorization": "Bearer " + TOKEN},
            method="GET",
        )
        with urllib.request.urlopen(request, timeout=DELIVERY_TIMEOUT) as response:
            payload = json.loads(response.read(4096).decode("utf-8"))
            live = bool(isinstance(payload, dict) and payload.get("ready"))
    except urllib.error.HTTPError as error:
        if error.code in (401, 403, 404):
            log.error("the bot refused the delivery probe: %s", error.code)
            live = False
    except urllib.error.URLError as error:
        if isinstance(error.reason, ConnectionRefusedError):
            log.error("nothing is listening at the bot's delivery port")
            live = False
        else:
            log.warning("could not probe the bot, keeping the last answer: %s", error)
    except Exception as error:
        log.warning("could not probe the bot, keeping the last answer: %s", error)
    with _probe_lock:
        _probe_state["checked"] = now
        _probe_state["live"] = live
    return live
LISTEN_HOST = os.environ.get("LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = env_int("LISTEN_PORT", 8787)
RATE_PER_IP = env_int("RATE_PER_IP", 5)
RATE_WINDOW = env_int("RATE_WINDOW", 900)
RATE_GLOBAL = env_int("RATE_GLOBAL", 60)

ALLOWED_ORIGIN = os.environ.get("CONTACT_ORIGIN", "https://amitista.com").strip()

TRUSTED_PROXIES = ("127.0.0.1", "::1", "::ffff:127.0.0.1")


class RateLimit:

    def __init__(self, per_ip, window, overall):
        self.per_ip = per_ip
        self.window = window
        self.overall = overall
        self.by_ip = {}
        self.all = deque()
        self.lock = threading.Lock()

    @staticmethod
    def _trim(stamps, cutoff):
        while stamps and stamps[0] < cutoff:
            stamps.popleft()

    def check(self, ip):
        now = time.monotonic()
        cutoff = now - self.window
        with self.lock:
            self._trim(self.all, cutoff)

            for known in [ip for ip, seen in self.by_ip.items() if not seen or seen[-1] < cutoff]:
                del self.by_ip[known]

            mine = self.by_ip.setdefault(ip, deque())
            self._trim(mine, cutoff)

            if len(mine) >= self.per_ip:
                return "per-ip"
            if len(self.all) >= self.overall:
                return "global"

            mine.append(now)
            self.all.append(now)
            return None


limiter = RateLimit(RATE_PER_IP, RATE_WINDOW, RATE_GLOBAL)


class Rejected(Exception):

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def clamp(value, limit=SHORT_LIMIT):
    text = str(value if value is not None else "").strip()
    if not text:
        return "—"
    return text[: limit - 1] + "…" if len(text) > limit else text


def required(data, key, label, limit=SHORT_LIMIT):
    text = str(data.get(key) or "").strip()
    if not text:
        raise Rejected(400, "%s is required." % label)
    if len(text) > limit:
        raise Rejected(400, "%s is too long." % label)
    return text


def build_message(data):
    kind = str(data.get("form") or "contact").strip().lower()
    if kind not in ("contact", "estimate"):
        raise Rejected(400, "Unknown form.")

    if str(data.get("botcheck") or "").strip():
        raise Rejected(400, "That looked automated.")

    name = required(data, "name", "A name")
    email = required(data, "email", "An email address")
    if not EMAIL.match(email):
        raise Rejected(400, "That email address does not look right.")

    if kind == "contact":
        title = "New project enquiry"
        fields = [
            {"name": "Name", "value": clamp(name), "inline": True},
            {"name": "Email", "value": clamp(email), "inline": True},
            {"name": "Project", "value": clamp(data.get("projectType")), "inline": True},
            {"name": "Timeline", "value": clamp(data.get("timeline")), "inline": True},
            {"name": "Details", "value": clamp(data.get("message"), FIELD_LIMIT)},
        ]
    else:
        title = "New estimate"
        fields = [
            {"name": "Name", "value": clamp(name), "inline": True},
            {"name": "Email", "value": clamp(email), "inline": True},
            {"name": "Estimate shown", "value": clamp(data.get("estimate"))},
            {"name": "Configuration", "value": clamp(data.get("configuration"), FIELD_LIMIT)},
            {"name": "Notes", "value": clamp(data.get("notes"), FIELD_LIMIT)},
        ]

    return {
        "username": "Amitista Website",
        "allowed_mentions": {"parse": []},
        "embeds": [{"title": title, "color": EMBED_COLOR, "fields": fields}],
    }


def post_to_bot(message):
    body = json.dumps(message).encode("utf-8")

    for attempt in range(2):
        request = urllib.request.Request(
            BOT_URL + "/enquiry",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + TOKEN,
                "User-Agent": "amitista-contact-relay/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=DELIVERY_TIMEOUT) as response:
                return response.status
        except urllib.error.HTTPError as error:
            detail = error.read(2048).decode("utf-8", "replace") if error.fp else ""
            log.error("the bot refused the message: %s %s", error.code, detail[:400])
            if error.code == 429:
                raise Rejected(429, "Too many messages, try again in a minute.")
            raise Rejected(502, "The message could not be delivered.")
        except urllib.error.URLError as error:
            log.error(
                "could not reach the bot (attempt %d of 2): %s", attempt + 1, error.reason
            )
            if attempt == 0:
                time.sleep(RETRY_PAUSE)

    raise Rejected(502, "The message could not be delivered.")


class Handler(BaseHTTPRequestHandler):
    server_version = "amitista-contact-relay"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    timeout = 15

    def client_ip(self):
        forwarded = self.headers.get("X-Real-IP")
        if forwarded and self.client_address[0] in TRUSTED_PROXIES:
            return forwarded.strip()
        return self.client_address[0]

    def check_origin(self):
        if not ALLOWED_ORIGIN:
            return
        site = (self.headers.get("Sec-Fetch-Site") or "").strip().lower()
        if site and site != "same-origin":
            raise Rejected(403, "Blocked.")
        origin = self.headers.get("Origin")
        if origin is not None and origin != ALLOWED_ORIGIN:
            raise Rejected(403, "Blocked.")

    def check_content_type(self):
        kind = (self.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if kind != "application/json":
            raise Rejected(415, "Send JSON.")

    def reply(self, status, payload=None):
        body = b"" if payload is None else json.dumps(payload).encode("utf-8")
        self.send_response(status)
        if body:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_GET(self):
        if self.path == "/healthz":
            self.reply(200, {"ok": True, "webhook": delivery_live()})
        else:
            self.reply(404, {"message": "Not found."})

    def do_POST(self):
        try:
            self.handle_post()
        except Rejected as rejected:
            self.reply(rejected.status, {"message": rejected.message})
        except socket.timeout:
            self.close_connection = True
        except Exception:
            log.exception("unhandled error while relaying an enquiry")
            self.reply(500, {"message": "Something went wrong at our end."})

    def handle_post(self):
        if self.path.rstrip("/") not in ("/api/contact", ""):
            raise Rejected(404, "Not found.")

        self.check_origin()
        self.check_content_type()

        if not (TOKEN and BOT_URL):
            raise Rejected(503, "The form is not accepting messages right now.")

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise Rejected(400, "Malformed request.")
        if length <= 0:
            raise Rejected(400, "Empty request.")
        if length > MAX_BODY:
            raise Rejected(413, "That message is too long.")

        try:
            raw = self.rfile.read(length)
        except socket.timeout:
            raise Rejected(408, "The request took too long.")
        if len(raw) != length:
            raise Rejected(400, "Malformed request.")

        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise Rejected(400, "Malformed request.")
        if not isinstance(data, dict):
            raise Rejected(400, "Malformed request.")

        message = build_message(data)

        refusal = limiter.check(self.client_ip())
        if refusal:
            log.warning("rate limited (%s)", refusal)
            raise Rejected(429, "Too many messages, try again in a few minutes.")

        post_to_bot(message)
        log.info("relayed a %s enquiry", data.get("form") or "contact")

        self.reply(204)

    def log_message(self, fmt, *args):
        pass


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(message)s",
        stream=sys.stdout,
    )

    if not (TOKEN and BOT_URL):
        log.warning("CONTACT_TOKEN or CONTACT_BOT_URL is not set — answering 503 until it is")

    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
    server.daemon_threads = True

    def stop(signum, frame):
        log.info("shutting down")
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    log.info("listening on %s:%s", LISTEN_HOST, LISTEN_PORT)
    server.serve_forever()
    server.server_close()


if __name__ == "__main__":
    main()
