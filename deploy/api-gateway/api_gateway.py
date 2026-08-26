#!/usr/bin/env python3

import hashlib
import hmac
import ipaddress
import json
import logging
import os
import signal
import socket
import sys
import tempfile
import threading
import time
from collections import deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PREFIX = "/api/k"

log = logging.getLogger("api-gateway")

def env_int(name, default):
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default

TOKENS_PATH = os.environ.get("GATEWAY_TOKENS", "/var/lib/amitista/tokens/tokens.json")
USAGE_PATH = os.environ.get("GATEWAY_USAGE", "/var/lib/amitista/api/usage.json")
EVENTS_PATH = os.environ.get("GATEWAY_EVENTS", "/var/lib/amitista/api/events.jsonl")
SITE_ROOT = os.environ.get("GATEWAY_SITE", "/var/www/amitista.com")
USAGE_GROUP = os.environ.get("GATEWAY_USAGE_GROUP", "amitista-admin")

LISTEN_HOST = os.environ.get("LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = env_int("LISTEN_PORT", 8789)

RATE_PER_TOKEN = env_int("GATEWAY_RATE", 120)
RATE_WINDOW = env_int("GATEWAY_RATE_WINDOW", 60)
FLUSH_SECONDS = env_int("GATEWAY_FLUSH", 60)

EVENTS_FLUSH = env_int("GATEWAY_EVENTS_FLUSH", 5)
EVENTS_KEEP = env_int("GATEWAY_EVENTS_KEEP", 4000)
EVENTS_QUEUE = 500
EVENTS_SWEEP_EVERY = 250
EVENTS_SAME_SECONDS = env_int("GATEWAY_EVENTS_SAME", 60)
EVENTS_SAME_KEEP = 500
EVENTS_ALWAYS = ("newIp",)
LOG_ACCEPTED = os.environ.get("GATEWAY_LOG_ACCEPTED", "1").strip().lower() not in ("0", "false", "no", "off")
ADDRESSES_KEEP = 40
AGENT_KEEP = 120

MAX_KEY = 256

RESOURCES = {
    "/v1": ("api.index", "current/api/v1/index.json"),
    "/v1/openapi.json": ("api.index", "current/api/v1/openapi.json"),
    "/v1/shield": ("api.shield", "current/api/v1/shield.json"),
    "/v1/shield/rules": ("api.shield", "/var/lib/amitista/shield-feed/rules.json"),
    "/v1/status": ("api.status", "shared/status.json"),
}

RESOURCES.update(
    {
        "%s.json" % route: entry
        for route, entry in RESOURCES.items()
        if not route.endswith(".json")
    }
)

HOURS_KEEP = env_int("GATEWAY_HOURS_KEEP", 24 * 31)

def hour_stamp():
    return (
        datetime.now(timezone.utc)
        .replace(minute=0, second=0, microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )

def allowed_here(allowed, address):
    if not allowed:
        return True
    try:
        candidate = ipaddress.ip_address(str(address or "").strip())
    except ValueError:
        return False
    for entry in allowed:
        try:
            if candidate in ipaddress.ip_network(entry, strict=False):
                return True
        except ValueError:
            continue
    return False

def stamp():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def hash_token(key):
    return hashlib.sha256(key.encode("utf-8")).hexdigest()

def key_shape(key):
    parts = str(key or "").split("_")
    if len(parts) >= 3 and parts[0] == "amk":
        return "shaped like one of ours (%s_%s_…)" % (parts[0], parts[1][:8])
    return "not one of our keys"

class TokenTable:

    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.by_hash = {}
        self.mtime = None
        self.reload()

    def reload(self):
        try:
            current = os.stat(self.path).st_mtime
        except OSError:
            with self.lock:
                self.by_hash = {}
                self.mtime = None
            return

        if self.mtime is not None and current == self.mtime:
            return

        try:
            with open(self.path, encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, ValueError):
            log.warning("could not read the token store")
            return

        records = payload.get("tokens") if isinstance(payload, dict) else None
        table = {}
        if isinstance(records, dict):
            for identifier, record in records.items():
                if not isinstance(record, dict):
                    continue
                digest = record.get("hash")
                if not isinstance(digest, str) or not digest:
                    continue
                rate = record.get("rate")
                allowed = record.get("allowed")
                table[digest] = {
                    "id": identifier,
                    "name": record.get("name"),
                    "owner": record.get("owner"),
                    "scopes": record.get("scopes") or [],
                    "revoked": bool(record.get("revoked")),
                    "expires": record.get("expires"),
                    "environment": record.get("environment") or "live",
                    "rate": int(rate) if isinstance(rate, int) and rate > 0 else None,
                    "allowed": [entry for entry in allowed if isinstance(entry, str)]
                    if isinstance(allowed, list)
                    else [],
                }

        with self.lock:
            self.by_hash = table
            self.mtime = current

    def match(self, key):
        self.reload()
        digest = hash_token(key)
        with self.lock:
            for known, record in self.by_hash.items():
                if hmac.compare_digest(known, digest):
                    return dict(record)
        return None

class Usage:

    def __init__(self, path, group):
        self.path = path
        self.group = group
        self.lock = threading.Lock()
        self.counters = self._load()
        self.dirty = False

    def _load(self):
        try:
            with open(self.path, encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, ValueError):
            return {}
        counters = payload.get("tokens") if isinstance(payload, dict) else None
        return counters if isinstance(counters, dict) else {}

    def _entry(self, identifier):
        entry = self.counters.get(identifier)
        if not isinstance(entry, dict):
            entry = {
                "requests": 0,
                "rejected": 0,
                "blocked": 0,
                "lastUsed": None,
                "paths": {},
                "ips": {},
                "hours": {},
            }
            self.counters[identifier] = entry
        entry.setdefault("paths", {})
        if not isinstance(entry.get("ips"), dict):
            entry["ips"] = {}
        if not isinstance(entry.get("hours"), dict):
            entry["hours"] = {}
        return entry

    def _note_hour(self, entry, field):
        hours = entry["hours"]
        key = hour_stamp()
        bucket = hours.get(key)
        if not isinstance(bucket, dict):
            bucket = {"requests": 0, "rejected": 0, "blocked": 0}
            hours[key] = bucket
        bucket[field] = int(bucket.get(field) or 0) + 1
        if len(hours) > HOURS_KEEP:
            for stale in sorted(hours)[: len(hours) - HOURS_KEEP]:
                del hours[stale]

    def _note_ip(self, entry, ip):
        if not ip:
            return False
        seen = entry["ips"]
        known = seen.get(ip)
        if not isinstance(known, dict):
            if len(seen) >= ADDRESSES_KEEP:
                oldest = sorted(seen.items(), key=lambda pair: (pair[1] or {}).get("last") or "")
                for stale, unused in oldest[: len(seen) - ADDRESSES_KEEP + 1]:
                    del seen[stale]
            seen[ip] = {"first": stamp(), "last": stamp(), "count": 1}
            return True
        known["last"] = stamp()
        known["count"] = int(known.get("count") or 0) + 1
        return False

    def hit(self, identifier, path, ip=None):
        with self.lock:
            entry = self._entry(identifier)
            entry["requests"] = int(entry.get("requests") or 0) + 1
            entry["lastUsed"] = stamp()
            paths = entry["paths"]
            paths[path] = int(paths.get(path) or 0) + 1
            fresh = self._note_ip(entry, ip)
            self._note_hour(entry, "requests")
            self.dirty = True
            return fresh

    def reject(self, identifier, ip=None, field="rejected"):
        with self.lock:
            entry = self._entry(identifier)
            entry[field] = int(entry.get(field) or 0) + 1
            self._note_ip(entry, ip)
            self._note_hour(entry, field)
            self.dirty = True


    def flush(self, force=False):
        with self.lock:
            if not self.dirty and not force:
                return
            payload = {"generated": stamp(), "tokens": json.loads(json.dumps(self.counters))}
            self.dirty = False

        directory = os.path.dirname(self.path)
        try:
            os.makedirs(directory, exist_ok=True)
            handle = tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=directory, prefix=".usage-", suffix=".tmp", delete=False
            )
            try:
                json.dump(payload, handle, separators=(",", ":"))
                handle.flush()
                os.fsync(handle.fileno())
                handle.close()
                os.chmod(handle.name, 0o640)
                if self.group:
                    try:
                        import shutil

                        shutil.chown(handle.name, group=self.group)
                    except (LookupError, PermissionError, OSError):
                        pass
                os.replace(handle.name, self.path)
            except BaseException:
                try:
                    os.unlink(handle.name)
                except OSError:
                    pass
                raise
        except OSError:
            log.warning("could not persist usage counters")

class Events:

    def __init__(self, path, group, keep=EVENTS_KEEP):
        self.path = path
        self.group = group
        self.keep = keep
        self.lock = threading.Lock()
        self.queue = deque(maxlen=EVENTS_QUEUE)
        self.recent = {}
        self.written = 0
        self.dropped = 0

    def add(self, entry):
        kind = entry.get("kind")
        slot = (kind, entry.get("id") or entry.get("ip"), entry.get("path"))
        now = time.monotonic()
        with self.lock:
            if kind not in EVENTS_ALWAYS:
                held = self.recent.get(slot)
                if held is not None and now - held[0] < EVENTS_SAME_SECONDS:
                    held[1] += 1
                    return
                if len(self.recent) >= EVENTS_SAME_KEEP:
                    for stale in sorted(self.recent, key=lambda key: self.recent[key][0])[:50]:
                        del self.recent[stale]
                self.recent[slot] = [now, 0, dict(entry)]

            if len(self.queue) == self.queue.maxlen:
                self.dropped += 1
            self.queue.append(entry)

    def _summaries(self, now):
        out = []
        for slot in list(self.recent):
            held = self.recent[slot]
            if now - held[0] < EVENTS_SAME_SECONDS:
                continue
            if held[1]:
                summary = dict(held[2])
                summary["at"] = stamp()
                summary["repeated"] = held[1]
                out.append(summary)
            del self.recent[slot]
        return out

    def _own(self, path):
        try:
            os.chmod(path, 0o640)
        except OSError:
            return
        if not self.group:
            return
        try:
            import shutil

            shutil.chown(path, group=self.group)
        except (LookupError, PermissionError, OSError):
            pass

    def _trim(self):
        try:
            with open(self.path, encoding="utf-8", errors="replace") as handle:
                lines = handle.readlines()
        except OSError:
            return
        if len(lines) <= self.keep:
            return

        directory = os.path.dirname(self.path)
        handle = tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=directory, prefix=".events-", suffix=".tmp", delete=False
        )
        try:
            handle.writelines(lines[-self.keep:])
            handle.flush()
            os.fsync(handle.fileno())
            handle.close()
            self._own(handle.name)
            os.replace(handle.name, self.path)
        except BaseException:
            try:
                os.unlink(handle.name)
            except OSError:
                pass

    def flush(self):
        with self.lock:
            batch = list(self.queue) + self._summaries(time.monotonic())
            if not batch:
                return
            self.queue.clear()
            missed = self.dropped
            self.dropped = 0

            if missed:
                log.warning("dropped %d api events while under load", missed)

            try:
                os.makedirs(os.path.dirname(self.path), exist_ok=True)
                existed = os.path.exists(self.path)
                with open(self.path, "a", encoding="utf-8") as handle:
                    for entry in batch:
                        handle.write(json.dumps(entry, separators=(",", ":"), sort_keys=True) + "\n")
                if not existed:
                    self._own(self.path)
            except OSError:
                log.warning("could not write the api event log")
                return

            self.written += len(batch)
            if self.written >= EVENTS_SWEEP_EVERY:
                self.written = 0
                self._trim()


class RateLimit:

    def __init__(self, per_token, window):
        self.per_token = per_token
        self.window = window
        self.by_token = {}
        self.lock = threading.Lock()

    def check(self, identifier, allowance=None):
        now = time.monotonic()
        cutoff = now - self.window
        ceiling = allowance if isinstance(allowance, int) and allowance > 0 else self.per_token
        with self.lock:
            for known in [key for key, seen in self.by_token.items() if not seen or seen[-1] < cutoff]:
                del self.by_token[known]

            mine = self.by_token.setdefault(identifier, deque())
            while mine and mine[0] < cutoff:
                mine.popleft()

            if len(mine) >= ceiling:
                return True

            mine.append(now)
            return False

GATEWAY_BACKEND = os.environ.get("GATEWAY_BACKEND", "file").strip().lower() or "file"
if GATEWAY_BACKEND not in ("file", "firestore"):
    raise SystemExit("GATEWAY_BACKEND must be 'file' or 'firestore', not %r" % GATEWAY_BACKEND)
if GATEWAY_BACKEND == "firestore":
    from gateway_store_firebase import FirestoreTokenTable, FirestoreUsage

    table = FirestoreTokenTable(FLUSH_SECONDS)
    usage = FirestoreUsage(USAGE_GROUP)
else:
    table = TokenTable(TOKENS_PATH)
    usage = Usage(USAGE_PATH, USAGE_GROUP)
limiter = RateLimit(RATE_PER_TOKEN, RATE_WINDOW)
events = Events(EVENTS_PATH, USAGE_GROUP)

class Rejected(Exception):

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message

def expired(record):
    when = record.get("expires")
    if not isinstance(when, str) or not when:
        return False
    try:
        moment = datetime.strptime(when[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    return moment < datetime.now(timezone.utc)

TRUSTED_PROXIES = ("127.0.0.1", "::1", "::ffff:127.0.0.1")


class Handler(BaseHTTPRequestHandler):
    server_version = "amitista-api-gateway"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    timeout = 15

    def client_ip(self):
        forwarded = self.headers.get("X-Real-IP")
        if forwarded and self.client_address[0] in TRUSTED_PROXIES:
            return forwarded.strip()
        return self.client_address[0]

    def route(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        if path.startswith(PREFIX):
            path = path[len(PREFIX):]
        return path or "/"

    def reply(self, status, payload=None, raw=None):
        if raw is not None:
            body = raw
        else:
            body = b"" if payload is None else json.dumps(payload).encode("utf-8")
        self.send_response(status)
        if body:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def note(self, kind, record, status, detail=None):
        held = record if isinstance(record, dict) else {}
        events.add(
            {
                "at": stamp(),
                "kind": kind,
                "id": held.get("id"),
                "key": held.get("name"),
                "owner": held.get("owner"),
                "ip": self.client_ip(),
                "method": self.command,
                "path": self.route(),
                "status": status,
                "agent": (self.headers.get("User-Agent") or "")[:AGENT_KEEP] or None,
                "detail": detail,
            }
        )

    def accepted(self, record, route):
        fresh = usage.hit(record["id"], route, self.client_ip())
        if fresh:
            self.note("newIp", record, 200, "not seen for this key before")
        elif LOG_ACCEPTED:
            self.note("used", record, 200)

    def presented_key(self):
        header = self.headers.get("Authorization") or ""
        if header.lower().startswith("bearer "):
            return header[7:].strip()[:MAX_KEY]
        alternative = self.headers.get("X-API-Key") or ""
        return alternative.strip()[:MAX_KEY]

    def authenticate(self):
        key = self.presented_key()
        if not key:
            raise Rejected(401, "Send an API token as a bearer token or X-API-Key header.")

        record = table.match(key)
        if record is None:
            log.warning("unknown api token presented from %s", self.client_ip())
            self.note("unknown", None, 401, key_shape(key))
            raise Rejected(401, "That token is not recognised.")

        if record.get("revoked"):
            usage.reject(record["id"], self.client_ip())
            self.note("revoked", record, 403)
            raise Rejected(403, "That token has been revoked.")

        if expired(record):
            usage.reject(record["id"], self.client_ip())
            self.note("expired", record, 403)
            raise Rejected(403, "That token has expired.")

        if not allowed_here(record.get("allowed"), self.client_ip()):
            usage.reject(record["id"], self.client_ip(), "blocked")
            self.note("denied", record, 403, "address not on the allow list for this key")
            log.warning(
                "api token %s presented from %s, which is not on its allow list",
                record["id"],
                self.client_ip(),
            )
            raise Rejected(403, "That token is not allowed from this address.")

        if limiter.check(record["id"], record.get("rate")):
            usage.reject(record["id"], self.client_ip())
            self.note("limited", record, 429, "over %s a minute" % (record.get("rate") or RATE_PER_TOKEN))
            raise Rejected(429, "Too many requests for this token.")

        return record

    def serve_file(self, relative):
        path = relative if os.path.isabs(relative) else os.path.join(SITE_ROOT, relative)
        try:
            with open(path, "rb") as handle:
                return handle.read()
        except OSError:
            log.warning("could not read %s", path)
            raise Rejected(503, "That resource is not available right now.")

    def do_GET(self):
        try:
            self.handle_get()
        except Rejected as rejected:
            self.reply(rejected.status, {"message": rejected.message})
        except socket.timeout:
            self.close_connection = True
        except Exception:
            log.exception("unhandled error")
            self.reply(500, {"message": "Something went wrong at our end."})

    def do_POST(self):
        self.reply(405, {"message": "This API is read only."})

    def handle_get(self):
        route = self.route()

        if route == "/healthz":
            self.reply(200, {"ok": True, "tokens": len(table.by_hash)})
            return

        record = self.authenticate()

        if route == "/whoami":
            self.accepted(record, route)
            self.reply(
                200,
                {
                    "token": record.get("name"),
                    "environment": record.get("environment"),
                    "scopes": record.get("scopes"),
                    "expires": record.get("expires"),
                },
            )
            return

        resource = RESOURCES.get(route)
        if resource is None:
            raise Rejected(404, "No such endpoint.")

        scope, relative = resource
        if scope not in (record.get("scopes") or []):
            usage.reject(record["id"], self.client_ip())
            self.note("denied", record, 403, "needs the %s scope" % scope)
            raise Rejected(403, "This token does not carry the %s scope." % scope)

        body = self.serve_file(relative)
        self.accepted(record, route)
        self.reply(200, raw=body)

    def log_message(self, fmt, *args):
        pass

def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s", stream=sys.stdout)

    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
    server.daemon_threads = True

    stopping = threading.Event()

    def flusher():
        waited = 0
        while not stopping.wait(EVENTS_FLUSH):
            events.flush()
            waited += EVENTS_FLUSH
            if waited >= FLUSH_SECONDS:
                waited = 0
                usage.flush()

    threading.Thread(target=flusher, daemon=True).start()

    def stop(signum, frame):
        log.info("shutting down")
        stopping.set()
        events.flush()
        usage.flush(force=True)
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    log.info("listening on %s:%s with %d tokens", LISTEN_HOST, LISTEN_PORT, len(table.by_hash))
    server.serve_forever()
    usage.flush(force=True)
    server.server_close()

if __name__ == "__main__":
    main()
