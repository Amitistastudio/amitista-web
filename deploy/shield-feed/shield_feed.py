#!/usr/bin/env python3


import hashlib
import ipaddress
import json
import logging
import os
import re
import signal
import sys
import tempfile
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

log = logging.getLogger("shield-feed")


def env_int(name, default):
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default


STATE_DIR = os.environ.get("SHIELD_FEED_STATE", "/var/lib/amitista/shield-feed")
FEED_PATH = os.path.join(STATE_DIR, "feed.signed.json")
RULES_PATH = os.path.join(STATE_DIR, "rules.json")

LISTEN_HOST = os.environ.get("LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = env_int("LISTEN_PORT", 8790)

MAX_AGE = env_int("SHIELD_FEED_MAX_AGE", 300)

SITE = "https://amitista.com"


def stamp():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class Document:

    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.body = None
        self.etag = None
        self.mtime = None
        self.error = None
        self.load()

    def load(self):
        try:
            stat = os.stat(self.path)
        except OSError as error:
            with self.lock:
                self.body = None
                self.etag = None
                self.mtime = None
                self.error = str(error)
            return

        with self.lock:
            if self.mtime == stat.st_mtime and self.body is not None:
                return

        try:
            with open(self.path, "rb") as handle:
                raw = handle.read()
            json.loads(raw.decode("utf-8"))
        except (OSError, ValueError, UnicodeDecodeError) as error:
            with self.lock:
                self.error = f"{self.path} is unreadable: {error}"
            log.error("%s", self.error)
            return

        digest = hashlib.sha256(raw).hexdigest()[:32]
        with self.lock:
            self.body = raw
            self.etag = f'"{digest}"'
            self.mtime = stat.st_mtime
            self.error = None
        log.info("loaded %s (%d bytes, etag %s)", self.path, len(raw), digest[:8])

    def current(self):
        self.load()
        with self.lock:
            return self.body, self.etag, self.error


feed = Document(FEED_PATH)
rules = Document(RULES_PATH)

counters = {"feed": 0, "rules": 0, "notModified": 0, "missing": 0, "rejected": 0}
counters_lock = threading.Lock()
started = stamp()

INSTALLS_PATH = os.path.join(STATE_DIR, "state", "installs.json")
INSTALLS_KEEP = env_int("SHIELD_FEED_INSTALLS_KEEP", 500)
INSTALLS_FLUSH = env_int("SHIELD_FEED_INSTALLS_FLUSH", 60)
INSTALLS_GROUP = os.environ.get("SHIELD_FEED_INSTALLS_GROUP", "amitista-admin")

TRUSTED_PROXIES = ("127.0.0.1", "::1", "::ffff:127.0.0.1")

INSTALL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{3,63}$")
VERSION_TEXT = re.compile(r"^[0-9][0-9A-Za-z.+-]{0,31}$")
AGENT_VERSION = re.compile(r"@amitista/shield/([0-9][0-9A-Za-z.+-]{0,31})")
MODES = ("monitor", "block", "learn")


class Installs:

    def __init__(self, path, keep=INSTALLS_KEEP):
        self.path = path
        self.keep = keep
        self.lock = threading.Lock()
        self.records = self._load()
        self.dirty = False

    def _load(self):
        try:
            with open(self.path, encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, ValueError):
            return {}
        records = payload.get("installs") if isinstance(payload, dict) else None
        return records if isinstance(records, dict) else {}

    def note(self, identifier, named, facts):
        with self.lock:
            record = self.records.get(identifier)
            if not isinstance(record, dict):
                if len(self.records) >= self.keep:
                    oldest = sorted(
                        self.records.items(), key=lambda pair: (pair[1] or {}).get("last") or ""
                    )
                    for stale, unused in oldest[: len(self.records) - self.keep + 1]:
                        del self.records[stale]
                record = {"first": stamp(), "polls": 0, "notModified": 0}
                self.records[identifier] = record

            record["named"] = bool(named)
            record["last"] = stamp()
            record["polls"] = int(record.get("polls") or 0) + 1
            if facts.get("notModified"):
                record["notModified"] = int(record.get("notModified") or 0) + 1
            for name in ("version", "mode", "serial", "agent", "address"):
                value = facts.get(name)
                if value:
                    record[name] = value
            self.dirty = True

    def flush(self, force=False):
        with self.lock:
            if not self.dirty and not force:
                return
            payload = {
                "generated": stamp(),
                "installs": json.loads(json.dumps(self.records)),
            }
            self.dirty = False

        directory = os.path.dirname(self.path)
        try:
            os.makedirs(directory, exist_ok=True)
            handle = tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=directory, prefix=".installs-", suffix=".tmp",
                delete=False,
            )
            try:
                json.dump(payload, handle, separators=(",", ":"))
                handle.flush()
                os.fsync(handle.fileno())
                handle.close()
                os.chmod(handle.name, 0o640)
                if INSTALLS_GROUP:
                    try:
                        import shutil

                        shutil.chown(handle.name, group=INSTALLS_GROUP)
                    except (LookupError, PermissionError, OSError):
                        os.chmod(handle.name, 0o644)
                os.replace(handle.name, self.path)
            except BaseException:
                try:
                    os.unlink(handle.name)
                except OSError:
                    pass
                raise
        except OSError:
            log.warning("could not persist the install inventory")


installs = Installs(INSTALLS_PATH)


def count(name):
    with counters_lock:
        counters[name] = counters.get(name, 0) + 1


def serial_of(document):
    body, _, _ = document.current()
    if not body:
        return None
    try:
        envelope = json.loads(body.decode("utf-8"))
        return json.loads(envelope["document"]).get("serial")
    except (ValueError, KeyError, UnicodeDecodeError):
        return None


class Handler(BaseHTTPRequestHandler):
    server_version = "amitista-shield-feed"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def route(self):
        return self.path.split("?", 1)[0].rstrip("/") or "/"

    def caller(self):
        peer = self.client_address[0]
        forwarded = (self.headers.get("X-Real-IP") or "").strip()[:64]
        if forwarded and peer in TRUSTED_PROXIES:
            try:
                ipaddress.ip_address(forwarded)
            except ValueError:
                return peer
            return forwarded
        return peer

    def install_facts(self, not_modified):
        agent = (self.headers.get("User-Agent") or "")[:120]
        version = (self.headers.get("X-Shield-Version") or "").strip()[:32]
        if not VERSION_TEXT.match(version):
            found = AGENT_VERSION.search(agent)
            version = found.group(1) if found else ""

        mode = (self.headers.get("X-Shield-Mode") or "").strip().lower()[:16]
        if mode not in MODES:
            mode = ""

        serial = (self.headers.get("If-None-Match") or "").strip()[:64]

        return {
            "version": version or None,
            "mode": mode or None,
            "serial": serial or None,
            "agent": agent or None,
            "address": self.caller(),
            "notModified": not_modified,
        }

    def record_install(self, not_modified=False):
        supplied = (self.headers.get("X-Shield-Install") or "").strip()[:64]
        if INSTALL_ID.match(supplied):
            identifier = supplied
            named = True
        else:
            agent = (self.headers.get("User-Agent") or "")[:120]
            seed = "%s|%s" % (self.caller(), agent)
            identifier = "anon-%s" % hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16]
            named = False
        installs.note(identifier, named, self.install_facts(not_modified))

    def send_json(self, status, payload, cache=False):
        raw = (json.dumps(payload, indent=2) + "\n").encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", f"public, max-age={MAX_AGE}" if cache else "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def send_document(self, document, name):
        body, etag, error = document.current()
        if body is None:
            count("missing")
            log.error("%s is not available: %s", name, error)
            self.send_json(503, {
                "error": "The rules feed is not available.",
                "endpoint": self.route(),
                "generated": stamp(),
            })
            return

        if self.headers.get("If-None-Match") == etag:
            count("notModified")
            self.record_install(True)
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", f"public, max-age={MAX_AGE}")
            self.end_headers()
            return

        count(name)
        self.record_install(False)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("ETag", etag)
        self.send_header("Cache-Control", f"public, max-age={MAX_AGE}")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self):
        self.handle_read()

    def do_HEAD(self):
        self.handle_read()

    def do_POST(self):
        count("rejected")
        self.send_json(405, {"error": "This endpoint is read only."})

    do_PUT = do_POST
    do_DELETE = do_POST
    do_PATCH = do_POST

    def handle_read(self):
        route = self.route()

        if route == "/api/v1/shield/feed":
            self.send_document(feed, "feed")
            return

        if route == "/api/v1/shield/rules":
            self.send_document(rules, "rules")
            return

        if route in ("/api/v1/shield/feed/status", "/healthz"):
            body, _, error = feed.current()
            with counters_lock:
                totals = dict(counters)
            self.send_json(200 if body else 503, {
                "endpoint": "/api/v1/shield/feed/status",
                "generated": stamp(),
                "started": started,
                "ok": body is not None,
                "serial": serial_of(feed),
                "feed": f"{SITE}/api/v1/shield/feed",
                "rules": f"{SITE}/api/v1/shield/rules",
                "served": totals,
                "error": error,
            })
            return

        count("rejected")
        self.send_json(404, {"error": "No such endpoint.", "endpoint": route})

    def log_message(self, fmt, *args):
        pass


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s", stream=sys.stdout)

    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
    server.daemon_threads = True

    stopping = threading.Event()

    def flusher():
        while not stopping.wait(INSTALLS_FLUSH):
            installs.flush()
        installs.flush(True)

    threading.Thread(target=flusher, daemon=True).start()

    def stop(signum, frame):
        log.info("shutting down")
        stopping.set()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGHUP, lambda *_: (feed.load(), rules.load()))

    log.info("listening on %s:%s serving %s", LISTEN_HOST, LISTEN_PORT, FEED_PATH)
    server.serve_forever()
    server.server_close()
    stopping.set()
    installs.flush(True)


if __name__ == "__main__":
    main()
