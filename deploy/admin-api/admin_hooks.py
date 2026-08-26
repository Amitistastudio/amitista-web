#!/usr/bin/env python3

import hashlib
import hmac
import ipaddress
import json
import logging
import os
import re
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from datetime import datetime, timezone

from admin_store import HOOK_EVENTS, check_hook_url

log = logging.getLogger("admin-api")

TIMEOUT = 6
MAX_BODY = 4096
MAX_BATCH = 25
SHOWN_PER_MESSAGE = 10
SEND_LIMIT = 12
SEND_WINDOW = 300
TEST_LIMIT = 6
QUEUE_LIMIT = 400
TICK_SECONDS = 5
HOLDER_TTL = 30
USER_AGENT = "amitista-admin-api/1.0"

EVENT_LABEL = {
    "used": "Key used",
    "newIp": "Key used from a new address",
    "denied": "Scope refused",
    "limited": "Rate limit reached",
    "revoked": "Revoked key used",
    "expired": "Expired key used",
    "changed": "Key changed",
    "unknown": "Unrecognised key presented",
}

EVENT_COLOUR = {
    "used": 0x6B7280,
    "newIp": 0x8B5CF6,
    "denied": 0xF59E0B,
    "limited": 0xF59E0B,
    "revoked": 0xEF4444,
    "expired": 0xEF4444,
    "changed": 0x22C55E,
    "unknown": 0xEF4444,
}

EVENT_ICON = {
    "used": ":white_circle:",
    "newIp": ":large_purple_circle:",
    "denied": ":large_orange_diamond:",
    "limited": ":hourglass:",
    "revoked": ":no_entry:",
    "expired": ":no_entry:",
    "changed": ":pencil2:",
    "unknown": ":rotating_light:",
}


class HookError(Exception):

    def __init__(self, message):
        super().__init__(message)
        self.message = message


def stamp():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def reachable(host):
    try:
        found = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise HookError("That hostname does not resolve.")
    if not found:
        raise HookError("That hostname does not resolve.")

    for entry in found:
        raw = entry[4][0]
        try:
            address = ipaddress.ip_address(raw.split("%", 1)[0])
        except ValueError:
            raise HookError("That hostname resolves to something unusable.")
        if not address.is_global or address.is_multicast:
            raise HookError("That hostname points inside the network, which is not allowed.")
    return True


def guard(url, fmt):
    address = check_hook_url(url, fmt)
    reachable(urllib.parse.urlsplit(address).hostname)
    return address


class NoRedirect(urllib.request.HTTPRedirectHandler):

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise HookError("The address redirected somewhere else, which is not allowed.")


opener = urllib.request.build_opener(NoRedirect, urllib.request.ProxyHandler({}))


def describe(event):
    kind = event.get("kind")
    bits = []
    name = event.get("key") or event.get("id")
    if name:
        bits.append(str(name))
    if kind == "changed":
        action = str(event.get("action") or "").replace("token.", "")
        if action:
            bits.append(action)
        if event.get("actor"):
            bits.append("by %s" % event["actor"])
    else:
        path = event.get("path")
        if path:
            bits.append("%s %s" % (event.get("method") or "GET", path))
        if event.get("status"):
            bits.append("HTTP %s" % event["status"])
    if event.get("ip"):
        bits.append("from %s" % event["ip"])
    if event.get("repeated"):
        bits.append("and %s more like it" % event["repeated"])
    return " · ".join(bits) or "no detail"


def as_discord(events, test):
    embeds = []
    for event in events[:SHOWN_PER_MESSAGE]:
        kind = event.get("kind") or "used"
        fields = [("Key", str(event.get("key") or event.get("id") or "—"))]
        if event.get("ip"):
            fields.append(("Address", str(event["ip"])))
        if event.get("path"):
            fields.append(("Path", "%s %s" % (event.get("method") or "GET", event["path"])))
        if event.get("status"):
            fields.append(("Answer", str(event["status"])))
        if event.get("action"):
            fields.append(("Change", str(event["action"]).replace("token.", "")))
        if event.get("actor"):
            fields.append(("By", str(event["actor"])))
        if event.get("detail"):
            fields.append(("Detail", str(event["detail"])[:200]))
        if event.get("repeated"):
            fields.append(("Also", "%s more like it in the minute before" % event["repeated"]))
        fields.append(("When", str(event.get("at") or stamp())))
        embeds.append(
            {
                "title": ("Test — " if test else "") + EVENT_LABEL.get(kind, kind),
                "color": EVENT_COLOUR.get(kind, 0x8B5CF6),
                "fields": [
                    {"name": label, "value": value[:1000] or "—", "inline": True}
                    for label, value in fields
                ],
            }
        )
    extra = len(events) - SHOWN_PER_MESSAGE
    if extra > 0:
        embeds.append(
            {
                "title": "and %d more" % extra,
                "color": 0x6B7280,
                "fields": [{"name": "Where", "value": "The panel keeps the full list.", "inline": False}],
            }
        )
    return {
        "username": "Amitista API",
        "allowed_mentions": {"parse": []},
        "content": "Test message from the Amitista panel." if test else None,
        "embeds": embeds,
    }


def as_slack(events, test):
    heading = "Amitista API — test message" if test else "Amitista API — %d event%s" % (
        len(events),
        "" if len(events) == 1 else "s",
    )
    blocks = [{"type": "section", "text": {"type": "mrkdwn", "text": "*%s*" % heading}}]
    for event in events[:SHOWN_PER_MESSAGE]:
        kind = event.get("kind") or "used"
        blocks.append(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "%s *%s*\n%s"
                    % (
                        EVENT_ICON.get(kind, ":white_circle:"),
                        EVENT_LABEL.get(kind, kind),
                        describe(event),
                    ),
                },
            }
        )
    extra = len(events) - SHOWN_PER_MESSAGE
    if extra > 0:
        blocks.append(
            {
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": "and %d more in the panel" % extra}],
            }
        )
    lines = [heading] + [
        "%s — %s" % (EVENT_LABEL.get(entry.get("kind"), entry.get("kind")), describe(entry))
        for entry in events[:SHOWN_PER_MESSAGE]
    ]
    if extra > 0:
        lines.append("and %d more in the panel" % extra)
    return {"text": "\n".join(lines), "blocks": blocks}


def as_generic(events, test):
    return {
        "source": "amitista",
        "kind": "test" if test else "events",
        "sent": stamp(),
        "count": len(events),
        "events": events,
    }


PLACEHOLDER = re.compile(r"\{([a-z]+)\}")

EMBED_TITLE = 256
EMBED_BODY = 2000
EMBED_LABEL = 256
EMBED_VALUE = 1024
EMBED_FOOTER = 2048


def values_of(event, count):
    kind = event.get("kind") or "used"
    return {
        "event": EVENT_LABEL.get(kind, kind),
        "key": str(event.get("key") or event.get("id") or "—"),
        "id": str(event.get("id") or "—"),
        "ip": str(event.get("ip") or "—"),
        "method": str(event.get("method") or "GET"),
        "path": str(event.get("path") or "—"),
        "status": str(event.get("status") or "—"),
        "action": str(event.get("action") or "—").replace("token.", ""),
        "actor": str(event.get("actor") or "—"),
        "detail": str(event.get("detail") or "—")[:200],
        "at": str(event.get("at") or stamp()),
        "owner": str(event.get("owner") or "—"),
        "summary": describe(event),
        "count": str(count),
    }


def fill(text, values):
    return PLACEHOLDER.sub(lambda found: values.get(found.group(1), found.group(0)), str(text or ""))


def as_embed(template, events, test):
    try:
        colour = int(str(template.get("colour") or "#7c3aed")[1:], 16)
    except ValueError:
        colour = 0x7C3AED

    per_event = bool(template.get("perEvent", True))
    chosen = events[:SHOWN_PER_MESSAGE] if per_event else events[:1]

    embeds = []
    for event in chosen:
        values = values_of(event, len(events))
        embed = {"color": colour}

        title = fill(template.get("title"), values)
        if test:
            title = ("Test — %s" % title).strip(" —")
        if title:
            embed["title"] = title[:EMBED_TITLE]

        body = fill(template.get("body"), values)
        if body:
            embed["description"] = body[:EMBED_BODY]

        fields = []
        for entry in template.get("fields") or []:
            label = fill(entry.get("label"), values)[:EMBED_LABEL]
            value = fill(entry.get("value"), values)[:EMBED_VALUE]
            if label and value:
                fields.append({"name": label, "value": value, "inline": True})
        if fields:
            embed["fields"] = fields

        footer = fill(template.get("footer"), values)
        if footer:
            embed["footer"] = {"text": footer[:EMBED_FOOTER]}

        if len(embed) > 1:
            embeds.append(embed)

    extra = len(events) - len(chosen)
    if extra > 0 and per_event:
        embeds.append({"title": "and %d more" % extra, "color": 0x6B7280})

    if not embeds:
        embeds = [{"title": "Amitista API", "color": colour, "description": describe(events[0]) if events else "—"}]

    return {"username": "Amitista API", "allowed_mentions": {"parse": []}, "embeds": embeds}


def build(fmt, events, test):
    if fmt == "discord":
        return as_discord(events, test)
    if fmt == "slack":
        return as_slack(events, test)
    return as_generic(events, test)


def sign(secret, body):
    if not secret:
        return None
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return "sha256=%s" % digest


def send_embed(hook, events, test=False):
    address = guard(hook.get("url"), "discord")
    payload = as_embed(hook.get("template") or {}, events, test)
    return post(address, payload, {})


def send(hook, events, test=False):
    fmt = hook.get("format") or "generic"
    address = guard(hook.get("url"), fmt)

    headers = {}
    if fmt == "generic":
        headers["X-Amitista-Event-Count"] = str(len(events))
        headers["X-Amitista-Sent"] = stamp()

    return post(address, build(fmt, events, test), headers, secret=hook.get("secret") if fmt == "generic" else None)


def post(address, payload, extra, secret=None):
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }
    headers.update(extra)
    signature = sign(secret, body)
    if signature:
        headers["X-Amitista-Signature"] = signature

    request = urllib.request.Request(address, data=body, headers=headers, method="POST")
    try:
        with opener.open(request, timeout=TIMEOUT) as response:
            response.read(MAX_BODY)
            return response.status
    except HookError:
        raise
    except urllib.error.HTTPError as failure:
        raise HookError("The endpoint answered %s." % failure.code)
    except urllib.error.URLError as failure:
        raise HookError("Could not reach the endpoint: %s" % (failure.reason,))
    except (OSError, ValueError) as failure:
        raise HookError("Could not reach the endpoint: %s" % (failure,))


def sample_event(name):
    return {
        "at": stamp(),
        "kind": "newIp",
        "id": "test",
        "key": "a test, not a real key",
        "owner": name,
        "ip": "203.0.113.7",
        "method": "GET",
        "path": "/v1/status",
        "status": 200,
        "agent": "amitista-admin-api/1.0",
        "detail": "Sent from the panel to prove this address works.",
        "test": True,
    }


class Budget:

    def __init__(self, limit=SEND_LIMIT, window=SEND_WINDOW):
        self.limit = limit
        self.window = window
        self.seen = {}
        self.lock = threading.Lock()

    def take(self, name):
        now = time.monotonic()
        cutoff = now - self.window
        with self.lock:
            for holder in [key for key, stamps in self.seen.items() if not stamps or stamps[-1] < cutoff]:
                del self.seen[holder]
            mine = self.seen.setdefault(name, deque())
            while mine and mine[0] < cutoff:
                mine.popleft()
            if len(mine) >= self.limit:
                return False
            mine.append(now)
            return True


tests = Budget(TEST_LIMIT, SEND_WINDOW)


class Runner:

    def __init__(self, path, users, tick=TICK_SECONDS, dm=None):
        self.path = path
        self.users = users
        self.tick = tick
        self.dm = dm
        self.offset = None
        self.marker = None
        self.pending = deque(maxlen=QUEUE_LIMIT)
        self.lock = threading.Lock()
        self.budget = Budget()
        self.stopping = threading.Event()
        self.thread = None
        self.holders = None
        self.read_at = 0.0

    def start(self):
        self._seek_end()
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.stopping.set()

    def notify(self, event):
        with self.lock:
            self.pending.append(event)

    def _seek_end(self):
        try:
            self.offset = os.path.getsize(self.path)
        except OSError:
            self.offset = 0

    def _fresh_lines(self):
        try:
            size = os.path.getsize(self.path)
        except OSError:
            return []
        if self.offset is None:
            self.offset = size
            return []
        if size < self.offset:
            self.offset = 0
        if size == self.offset:
            return []
        try:
            with open(self.path, "rb") as handle:
                handle.seek(self.offset)
                raw = handle.read()
        except OSError:
            return []

        ended = raw.rfind(b"\n")
        if ended == -1:
            return []
        self.offset += ended + 1
        lines = raw[:ended + 1].decode("utf-8", "replace").splitlines()

        out = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            if not isinstance(entry, dict):
                continue
            when = entry.get("at")
            if self.marker is not None and isinstance(when, str) and when < self.marker:
                continue
            out.append(entry)
        if out:
            latest = max((entry.get("at") or "") for entry in out)
            if latest:
                self.marker = latest
        return out

    def _recipients(self, holders, event):
        kind = event.get("kind")
        out = []
        for holder in holders:
            if not holder.get("active"):
                continue
            hook = holder["hook"]
            if kind not in (hook.get("events") or []):
                continue
            if kind == "unknown":
                if "api.read" not in (holder.get("permissions") or []):
                    continue
            elif event.get("owner") != holder["name"]:
                continue
            out.append(holder)
        return out

    def _deliver(self, channel, holder, events):
        name = holder["name"]
        if not self.budget.take("%s:%s" % (channel, name)):
            log.warning("holding back %s for %s — too many in a short time", channel, name)
            return

        if channel == "dm":
            if self.dm is None:
                return
            try:
                self.dm(holder, events)
            except Exception:
                log.exception("the Discord DM for %s raised", name)
            return

        embedded = channel == "embed"
        note = self.users.note_embed if embedded else self.users.note_hook
        try:
            if embedded:
                send_embed(holder["hook"], events)
            else:
                send(holder["hook"], events)
        except HookError as failure:
            log.warning("%s for %s failed: %s", channel, name, failure.message)
            note(name, False, failure.message)
            self.forget()
            return
        except Exception:
            log.exception("%s for %s raised", channel, name)
            note(name, False, "Something went wrong sending it.")
            self.forget()
            return
        note(name, True)

    def _holders(self):
        now = time.monotonic()
        if self.holders is not None and now - self.read_at < HOLDER_TTL:
            return self.holders
        try:
            self.holders = [
                ("hook", self.users.hooks()),
                ("embed", self.users.embed_hooks()),
                ("dm", self.users.dm_hooks()),
            ]
        except Exception:
            log.exception("could not read the webhook settings")
            return self.holders or []
        self.read_at = now
        return self.holders

    def forget(self):
        self.holders = None

    def _round(self):
        events = self._fresh_lines()
        with self.lock:
            while self.pending:
                events.append(self.pending.popleft())
        if not events:
            return

        channels = self._holders()
        if not channels:
            return

        batches = {}
        for channel, holders in channels:
            for event in events:
                for holder in self._recipients(holders, event):
                    key = (channel, holder["name"])
                    batches.setdefault(key, (channel, holder, []))[2].append(event)

        for channel, holder, wanted in batches.values():
            self._deliver(channel, holder, wanted[:MAX_BATCH])

    def _loop(self):
        while not self.stopping.wait(self.tick):
            try:
                self._round()
            except Exception:
                log.exception("the webhook runner tripped")


def read_events(path, limit=200, keep=None):
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            lines = handle.readlines()
    except FileNotFoundError:
        return []
    except OSError:
        return []

    if keep and len(lines) > keep:
        lines = lines[-keep:]

    out = []
    for line in lines[-limit:]:
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if isinstance(entry, dict) and entry.get("kind") in HOOK_EVENTS:
            out.append(entry)
    out.reverse()
    return out
