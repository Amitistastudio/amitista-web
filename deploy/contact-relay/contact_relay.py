#!/usr/bin/env python3
"""Validates enquiries and hands them to the Discord bot on this box.

The site is a static build. Before this existed, the contact and estimate forms
posted straight from the visitor's browser to a Discord webhook, which meant
the URL had to be compiled into the JavaScript — Vite inlines every VITE_
value — and anybody who opened the site could read it out of the bundle and
post to the channel, or delete the webhook outright. That is the hole this
closes.

Webhooks are gone entirely as of 15 August 2026 — one was revoked on Discord's
side and enquiries silently bounced to mailto until the healthcheck caught it.
Delivery now goes to the bot's own loopback listener (contactweb, in the bot
under /opt/amitista/discord-bot), authenticated by a shared token; the bot
posts to the channel itself, so there is no webhook to revoke and nothing that
can die without the healthcheck seeing exactly where.

What runs here listens on localhost only; nginx proxies POST /api/contact to
it (see deploy/nginx/amitista.com.conf). It takes the form's plain fields,
decides for itself what the Discord message says, and hands the built message
to the bot. Because the payload is built here rather than forwarded, the
endpoint is not an open relay: the worst a caller can do is submit an enquiry,
which is what the form is for. Everything else — mention suppression, field
limits, the rate limit — is enforced on this side of the wire, where it cannot
be edited by whoever is calling.

No third-party packages, deliberately. This has to keep working through an
upgrade of a box that has no Node on it and whose Python is whatever Debian
ships, so it uses the standard library and nothing else.

Configuration, all optional except the first:

    CONTACT_TOKEN     the shared token the bot's contactweb listener expects.
                      Without it the service still starts and answers 503, so
                      the forms fall back to the visitor's email app rather
                      than swallowing an enquiry. It must match CONTACT_TOKEN
                      in the bot's .env.
    CONTACT_BOT_URL   base URL of the bot listener, default
                      http://127.0.0.1:8794. Loopback only; anything else is
                      refused as a misconfiguration.
    LISTEN_HOST       default 127.0.0.1. Do not make this public; there is no
                      authentication here, nginx is the front door.
    LISTEN_PORT       default 8787
    RATE_PER_IP       submissions allowed per IP per window, default 5
    RATE_WINDOW       that window in seconds, default 900
    RATE_GLOBAL       submissions allowed from everyone per window, default 60
"""

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

# Discord rejects the whole message if one embed field runs over 1024
# characters, so text is cut to fit rather than lost to a 400.
FIELD_LIMIT = 1024
SHORT_LIMIT = 256

# Nothing legitimate from these forms is close to this. It is a ceiling on what
# gets read into memory before anything is parsed, and nginx caps the body too —
# both, because either one alone is a single point of failure.
MAX_BODY = 16 * 1024

EMBED_COLOR = 0x8B5CF6

# Per attempt, and there are two of them. The whole exchange has to finish
# inside nginx's proxy_read_timeout for this location — 15s, see
# deploy/nginx/amitista.com.conf — or nginx answers 504 and the relay's own
# error never reaches the visitor. Two attempts plus the pause between them is
# 13s, which fits with a little room. Changing either number means checking it
# against the other; the bot answers only after its own send to Discord has
# completed, and that is well under a second when Discord is answering at all,
# so this is a ceiling rather than a working figure.
DELIVERY_TIMEOUT = 6
RETRY_PAUSE = 1

# Deliberately loose. This is not the place to adjudicate what is a valid
# address — RFC 5322 in a regex is famously a mistake, and a real typo gets
# caught by the reply bouncing, not by us. It only rejects what is obviously
# not an address at all.
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
    """True only for a loopback http(s) address.

    urllib will POST to whatever it is handed — including an address on the
    local network or the open internet. Nothing outside root can set this
    value, so this is not defending against an attacker who edits the config;
    it is defending against the config being wrong. A URL pasted from the
    wrong tab would otherwise send every enquiry — and the shared token with
    it — somewhere unintended, and the first sign of it would be silence in
    the channel.

    A rejected value is treated exactly like no value at all: the service
    answers 503 and the forms fall back to the visitor's email app, so an
    enquiry is never accepted and then dropped.
    """
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
    """Whether the bot's listener is up and can reach the delivery channel.

    `bool(TOKEN)` only ever says the config is filled in, so a bot that is
    down, or a token that no longer matches the bot's, would go on reading as
    healthy while every enquiry failed. A GET on the listener's /healthz posts
    nothing, and the bot checks its own side — logged in to Discord — before
    answering ready.

    Only a definitive refusal counts as dead: 401/403 mean the paired token no
    longer matches and will not fix itself, 404 means the route is gone, and a
    refused connection means nothing is listening on the port at all. A
    timeout leaves the previous answer standing, because the healthcheck reads
    a false here as "enquiries go nowhere" and a slow moment should not raise
    that alarm. The answer is cached so a health probe every minute does not
    become a request to the bot every minute.

    The healthz key this feeds is still named "webhook" — the healthcheck
    script and admin_snapshot.py both read that name, so it now means "the
    delivery path is live" rather than anything about webhooks.
    """
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

# The only Origin a browser is allowed to submit from. Set to "" to disable the
# check entirely; anything else is compared exactly, scheme and host included.
ALLOWED_ORIGIN = os.environ.get("CONTACT_ORIGIN", "https://amitista.com").strip()

# Addresses whose X-Real-IP is believed. nginx is the only thing that should be
# reaching this port, and it overwrites the header on every proxied request.
TRUSTED_PROXIES = ("127.0.0.1", "::1", "::ffff:127.0.0.1")


class RateLimit:
    """Sliding window over the last RATE_WINDOW seconds, per IP and overall.

    In memory on purpose: a restart forgetting who has posted recently is not a
    problem worth a database. The global window is the one that matters most —
    per-IP alone is only ever an inconvenience to someone with more than one
    address, whereas the global cap bounds how much traffic this can ever send
    to Discord no matter how the load is spread.
    """

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
        """Record an attempt. Returns None to allow, or a reason to refuse."""
        now = time.monotonic()
        cutoff = now - self.window
        with self.lock:
            self._trim(self.all, cutoff)

            # Addresses that have gone quiet are dropped here rather than on a
            # timer, so the table cannot grow without bound.
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
    """A request that will not be forwarded, and the reason to send back.

    The message reaches the visitor, so it is written for one: it says what to
    fix, and never anything about the webhook or how this service is put
    together.
    """

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
    """Turn the posted fields into the Discord message.

    This function is the reason the endpoint is safe to expose. The caller
    supplies values, never structure: it cannot choose the channel, the author
    name, the number of embeds, or whether mentions resolve. A form that posts
    `@everyone` in its notes gets the literal text in a field and nobody is
    pinged, because allowed_mentions is set here and there is no way to reach
    past it from outside.
    """
    kind = str(data.get("form") or "contact").strip().lower()
    if kind not in ("contact", "estimate"):
        raise Rejected(400, "Unknown form.")

    # The honeypot. Bots fill every field they can see, including the one the
    # stylesheet hides; a human never touches it.
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

    # One retry, and only for a connection that never got an answer.
    #
    # A dropped connection on the way out is not rare enough to ignore: one on
    # 2 August 2026 lost a real enquiry outright. It is deliberately two
    # attempts rather than a loop with a backoff, because the whole exchange has
    # to fit inside nginx's proxy_read_timeout — see DELIVERY_TIMEOUT above.
    # Past that, nginx closes the request from underneath us and the visitor
    # waits longer only to get less.
    #
    # Only URLError is retried. An HTTPError means the bot read the message and
    # refused it — or Discord refused it on the bot's side — so sending the
    # same bytes again would be refused the same way, and on a 429 it would
    # make the rate limit worse rather than better.
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
            # The bot's own words are for us, not for the visitor: they
            # describe a fault at our end, not theirs. Logged here, generic
            # upstream.
            detail = error.read(2048).decode("utf-8", "replace") if error.fp else ""
            log.error("the bot refused the message: %s %s", error.code, detail[:400])
            if error.code == 429:
                raise Rejected(429, "Too many messages, try again in a minute.")
            raise Rejected(502, "The message could not be delivered.")
        except urllib.error.URLError as error:
            # Logged at both attempts rather than only the last, so a hop that
            # is failing half the time and being papered over by the retry is
            # still visible in the journal.
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

    # A connection that goes quiet mid-request must not hold a worker thread
    # for ever. Without this, a caller that announces Content-Length: 5000 and
    # then sends five bytes parks a thread in rfile.read() until the peer goes
    # away — and ThreadingHTTPServer starts a thread per connection with no
    # ceiling, so enough of those exhaust the process rather than the limit.
    #
    # This is defence in depth rather than a live hole: nginx buffers request
    # bodies before it proxies (proxy_request_buffering is on by default), so
    # a partial body never reaches this process from the internet. It is set
    # because the socket is still open to anything else on localhost, and
    # because the protection above is a default someone could turn off in the
    # nginx config without ever thinking about this file.
    #
    # StreamRequestHandler applies this to the socket in setup(); the reads
    # below raise socket.timeout when it expires.
    timeout = 15

    def client_ip(self):
        # Set by nginx, which overwrites whatever the caller sent. Believed only
        # when the connection itself came from nginx: the header is the rate
        # limiter's key, so anything that could set it freely could rotate its
        # own identity and never be limited at all.
        forwarded = self.headers.get("X-Real-IP")
        if forwarded and self.client_address[0] in TRUSTED_PROXIES:
            return forwarded.strip()
        return self.client_address[0]

    def check_origin(self):
        # Refuse a cross-site submission. A browser attaches Origin to every
        # POST it makes, so a mismatch is another site driving a visitor's
        # browser at this endpoint. A missing Origin is allowed through: no
        # browser omits it here, so it means a direct client such as curl,
        # which is not something anyone can be tricked into running.
        if not ALLOWED_ORIGIN:
            return
        # Sec-Fetch-Site is the same judgement made by the browser itself, and
        # it cannot be set by script. Every browser in use sends it; a direct
        # client such as curl sends nothing, which is why an absent value is
        # allowed. It is checked first because it stays correct even if the
        # JSON content type below is ever relaxed, which is the one change
        # that would otherwise reopen this.
        site = (self.headers.get("Sec-Fetch-Site") or "").strip().lower()
        if site and site != "same-origin":
            raise Rejected(403, "Blocked.")
        origin = self.headers.get("Origin")
        if origin is not None and origin != ALLOWED_ORIGIN:
            raise Rejected(403, "Blocked.")

    def check_content_type(self):
        # The half of the fix that does not depend on Origin. text/plain,
        # form-urlencoded and multipart are the three types a cross-origin POST
        # can use without asking permission first; requiring JSON forces a
        # preflight, which this endpoint answers for nobody.
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
        # For a health check and nothing else. `ok` says the process is up;
        # `webhook` — the key name is a kept contract, see delivery_live —
        # says the bot's listener answers the paired token and can reach the
        # channel, which is a cached GET rather than a posted message. The two
        # are deliberately separate: the healthcheck restarts the relay when
        # `ok` is false, and a restart here cannot revive a bot that is down
        # or a token that no longer matches, so that failure has to arrive as
        # a false `webhook` against a true `ok`.
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
            # The peer stopped talking. Nothing to send and nobody to send it
            # to; the thread just ends. Not a fault, so not a traceback.
            self.close_connection = True
        except Exception:
            # Nothing about an unexpected failure is the visitor's business, and
            # the traceback could quote the payload. It goes to the journal.
            log.exception("unhandled error while relaying an enquiry")
            self.reply(500, {"message": "Something went wrong at our end."})

    def handle_post(self):
        if self.path.rstrip("/") not in ("/api/contact", ""):
            raise Rejected(404, "Not found.")

        # Both before anything is read or parsed, so a cross-site caller never
        # reaches the body at all.
        self.check_origin()
        self.check_content_type()

        # 503 rather than an error: it means "not configured", and the forms
        # answer it by opening the visitor's email app. An enquiry is never
        # accepted and then quietly dropped.
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

        # read() returns short at EOF, so a body that stops early has to be
        # caught by length rather than by an exception. Both endings are the
        # same answer: what arrived is not the request that was announced.
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

        # Validation before the rate limit, so a visitor who mistypes their
        # address and corrects it has not spent an attempt on the typo.
        message = build_message(data)

        refusal = limiter.check(self.client_ip())
        if refusal:
            log.warning("rate limited (%s)", refusal)
            raise Rejected(429, "Too many messages, try again in a few minutes.")

        post_to_bot(message)
        log.info("relayed a %s enquiry", data.get("form") or "contact")

        # Discord answers a good post with 204 and no body; the forms already
        # expect the same shape here.
        self.reply(204)

    def log_message(self, fmt, *args):
        # The default writes a request line per hit to stderr. Quieter, and
        # more to the point: /privacy promises request logs are deleted after
        # fourteen days, and that promise is kept by a logrotate rule covering
        # nginx's logs. Anything this process wrote to the journal would sit
        # outside that rule, so it writes no per-request line at all — the
        # journal gets outcomes, never who submitted or what they said.
        pass


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(message)s",  # journald stamps its own time
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
