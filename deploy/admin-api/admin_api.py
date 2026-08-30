#!/usr/bin/env python3

import base64
import bisect
import calendar
import getpass
import hashlib
import hmac
import ipaddress
import json
import logging
import os
import re
import secrets
import signal
import socket
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import admin_hooks
import admin_review

from admin_vault import Sealer, Secrets, VaultError, build_vault

from admin_store import (
    AUDIT_KEEP,
    PROJECT_ACCESS,
    PROJECT_FILE_MAX,
    PROJECT_FILES_PER_PROJECT,
    PROJECT_FILE_TYPES,
    PROJECT_ID,
    PROJECT_VERSIONS_MAX,
    ProjectFiles,
    BOARD_ART_KINDS,
    BOARD_KEYHOLDERS,
    BOARD_ART_MAX,
    BOARD_FILE_MAX,
    BOARD_FILE_TYPES,
    BOARD_THUMB_MAX,
    CARD_FILES_MAX,
    BOARD_COLOURS,
    BOARD_MEMBERS_MAX,
    BOARD_OWN,
    BOARD_OWN_VISIBILITY,
    BOARD_ROLES,
    BOARD_VISIBILITY,
    BOARDS_MAX,
    BOARD_CARDS_MAX,
    BOARD_LISTS_MAX,
    Boards,
    board_purposes,
    BRAND_ACCENT_DEFAULT,
    Brands,
    DISCORD_ID,
    DISCORD_NICK_MAX,
    EMBED_BODY_MAX,
    EMBED_DEFAULT,
    EMBED_FIELDS_MAX,
    EMBED_FOOTER_MAX,
    EMBED_LABEL_MAX,
    EMBED_PLACEHOLDERS,
    EMBED_TITLE_MAX,
    EMBED_VALUE_MAX,
    check_embed_template,
    FINDING_VERDICTS,
    Findings,
    FIREWALL_KINDS,
    FIREWALL_METHODS,
    FIREWALL_MODES,
    FIREWALL_RULES_MAX,
    Firewall,
    FirewallEvents,
    GATEWAY_FREE,
    HOOK_ADMIN_EVENTS,
    HOOK_DEFAULT_EVENTS,
    HOOK_EVENTS,
    HOOK_FORMATS,
    KEYS_PER_OWNER,
    Maintenance,
    MAX_ALLOWED_IPS,
    MAX_RATE,
    PERMISSIONS,
    PICTURE_MAX,
    RATE_DEFAULT as GATEWAY_RATE,
    RATE_WINDOW as GATEWAY_WINDOW,
    REMIND_AIMED,
    REMIND_EVENTS,
    REMIND_STEP,
    REMIND_STEPS_MAX,
    REMIND_TICK,
    REMIND_WHO,
    DEFAULT_ROLES,
    LOCKED_ROLES,
    ROLES,
    SCOPES,
    SCOPE_ROUTES,
    StoreError,
    check_firewall_kind,
    check_firewall_mode,
    check_firewall_value,
    signature_catalogue,
    b64decode,
    b64encode,
    hash_password,
    is_expired,
    is_owner,
    remind_who,
    verify_password,
)

import admin_turnstile

try:
    import admin_google
except ImportError as failure:
    admin_google = None
    GOOGLE_IMPORT_ERROR = str(failure)
else:
    GOOGLE_IMPORT_ERROR = None

ADMIN_BACKEND = os.environ.get("ADMIN_BACKEND", "json").strip().lower() or "json"
if ADMIN_BACKEND not in ("json", "mongo", "firestore"):
    raise SystemExit(
        "ADMIN_BACKEND must be 'json', 'mongo' or 'firestore', not %r" % ADMIN_BACKEND
    )
if ADMIN_BACKEND == "firestore":
    from admin_store_firebase import Audit, Tokens, Users

    if admin_google is not None and admin_google.enabled():
        raise SystemExit(
            "ADMIN_GOOGLE=on needs the json backend — the firestore store has no Google account linkage yet"
        )
else:
    from admin_store import Audit, Tokens, Users

MAX_BODY = 4 * 1024
BOARD_BODY_MAX = 16 * 1024
BOARD_ART_BODY_MAX = 1024 * 1024
BOARD_FILE_BODY_MAX = 6 * 1024 * 1024
UPLOADED_BYTES = re.compile(r'"data:[^"]*"')
PICTURE_BODY_MAX = 512 * 1024
PROJECT_FILE_BODY_MAX = 48 * 1024 * 1024
COOKIE_NAME = "amitista_admin"
PENDING_COOKIE = "amitista_admin_step"
PENDING_SECONDS = 300
GATE_COOKIE = "amitista_admin_gate"
PREFIX = "/api/admin"

PASSWORD_CHANGE_ROUTES = frozenset(
    (
        "/healthz",
        "/session",
        "/gate",
        "/account",
        "/account/password",
        "/login",
        "/logout",
        "/login/google/start",
        "/login/google/callback",
        "/login/google/verify",
    )
)

USER_LIMIT = 128
PASSWORD_LIMIT = 512

GATE_STALE = "That verification has expired. Confirm you are a person once more."
GATE_SPENT = "That verification has been used up. Confirm you are a person once more."

log = logging.getLogger("admin-api")

def env_int(name, default):
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default

def env_flag(name):
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")

ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "").strip()

OVERVIEW_PATH = os.environ.get("ADMIN_OVERVIEW", "/var/lib/amitista/admin/overview.json")
HISTORY_PATH = os.environ.get("ADMIN_HISTORY", "/var/lib/amitista/admin/history.json")
SECURITY_PATH = os.environ.get("ADMIN_SECURITY", "/var/lib/amitista/admin/security.json")
ANALYTICS_PATH = os.environ.get("ADMIN_ANALYTICS", "/var/lib/amitista/admin/analytics.json")
PERF_PATH = os.environ.get("ADMIN_PERF", "/var/lib/amitista/admin/perf.json")
# Groups handed out by account rather than by permission. A permission cannot
# express this: an owner resolves to every permission at read time, so any owner
# would hold whatever we invented. The account name is the one thing an owner
# cannot grant themselves from inside the panel.
#
# Worth being plain about what this is not — it is a gate against panel users.
# Anyone with root on this box can read this file and edit the list.
PRIVATE_GROUPS = {
    "github": ("blxr",),
}

def private_groups_for(name):
    key = (name or "").strip().lower()
    return sorted(group for group, allowed in PRIVATE_GROUPS.items() if key in allowed)

GITHUB_PATH = os.environ.get("ADMIN_GITHUB", "/var/lib/amitista/admin/github.json")
# The deploy ticks about once a minute. Ten minutes without a refresh means
# the timer is not running, which is worth saying out loud rather than
# quietly showing an hour-old commit as if it were current.
GITHUB_STALE_AFTER = env_int("ADMIN_GITHUB_STALE", 600)

INSTALLS_PATH = os.environ.get("ADMIN_SHIELD_INSTALLS", "/var/lib/amitista/shield-feed/state/installs.json")
BRANDS_PUBLIC = os.environ.get("ADMIN_BRANDS_PUBLIC", "/var/www/amitista.com/shared/shield-brands.json")
BRANDS_GROUP = os.environ.get("ADMIN_BRANDS_GROUP", "www-data")
STATUS_PATH = os.environ.get("ADMIN_STATUS", "/var/www/amitista.com/shared/status.json")
REVOKE_PATH = os.environ.get("ADMIN_REVOKED", "/var/lib/amitista/admin/session/revoked-before")
STATE_DIR = os.environ.get("ADMIN_STATE", "/var/lib/amitista/admin/session")
TOKENS_PATH = os.environ.get("ADMIN_TOKENS", "/var/lib/amitista/tokens/tokens.json")
USAGE_PATH = os.environ.get("ADMIN_API_USAGE", "/var/lib/amitista/api/usage.json")
EVENTS_PATH = os.environ.get("ADMIN_API_EVENTS", "/var/lib/amitista/api/events.jsonl")
EVENTS_SHOWN = env_int("ADMIN_API_EVENTS_SHOWN", 300)
OWN_ACTIVITY_SHOWN = env_int("ADMIN_OWN_ACTIVITY_SHOWN", 200)
OWN_SIGNINS_SHOWN = env_int("ADMIN_OWN_SIGNINS_SHOWN", 20)
ALLOWED_ORIGIN = os.environ.get("ADMIN_ORIGIN", "https://amitista.com").strip()
GATEWAY_GROUP = os.environ.get("ADMIN_GATEWAY_GROUP", "amitista-api")

SHIELD_URL = os.environ.get("ADMIN_SHIELD_URL", "http://127.0.0.1:8093").strip().rstrip("/")
SHIELD_TOKEN = os.environ.get("SHIELD_DEMO_CONTROL_TOKEN", "").strip()
SHIELD_FLAGS = os.environ.get("ADMIN_SHIELD_FLAGS", "/var/lib/amitista/shield/flags.jsonl")
SHIELD_UNIT = os.environ.get("ADMIN_SHIELD_UNIT", "amitista-shield-demo.service")
SHIELD_TIMEOUT = 6
SHIELD_MAX_BYTES = 4 * 1024 * 1024
SHIELD_HISTORY = 200
SHIELD_MODES = ("monitor", "block")
SHIELD_TUNINGS = ("enforce", "record", "silence")
SHIELD_MAX_PATHS = 12
SHIELD_LOOPBACK = ("127.0.0.1", "localhost", "::1")

def loopback_only(url):
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "http":
        return False
    return parts.hostname in SHIELD_LOOPBACK

if SHIELD_URL and not loopback_only(SHIELD_URL):
    log.error("ADMIN_SHIELD_URL must be an http loopback address; ignoring it")
    SHIELD_URL = ""

BOT_URL = os.environ.get("ADMIN_BOT_URL", "http://127.0.0.1:8793").strip().rstrip("/")
BOT_TOKEN = os.environ.get("BOTCTL_TOKEN", "").strip()
BOT_TIMEOUT = 10
BOT_MAX_BYTES = 2 * 1024 * 1024
BOT_QUEUES = ("tickets", "orders", "applications")
BOT_STATUSES = ("open", "closed")
BOT_SETUP_SECTIONS = ("welcome", "autorole", "counterUsers", "counterClients")
BOT_LEVEL_SORTS = ("xp", "msgs", "voiceMin", "reacts")
BOT_MOD_ACTIONS = ("lock", "unlock", "purge", "timeout", "untimeout", "kick", "ban", "unban")

DISCORD_LINK_SECONDS = env_int("ADMIN_DISCORD_LINK_SECONDS", 600)
DISCORD_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
DISCORD_CODE_LENGTH = 8
DISCORD_CDN = "https://cdn.discordapp.com/"
GITHUB_CDN = "https://avatars.githubusercontent.com/"
DISCORD_ART = ("avatar", "banner", "decoration", "member", "bot")
DISCORD_ART_BOT = "*bot*"
DISCORD_ART_SECONDS = 900
DISCORD_ART_BYTES = 3 * 1024 * 1024
DISCORD_ART_KEEP = 60
DISCORD_ART_TYPES = ("image/png", "image/jpeg", "image/gif", "image/webp")
DISCORD_ART_AGENT = "Amitista-Panel/1.0 (+https://amitista.com)"
DM_EVENTS_MAX = 8

# Hosted ticket transcripts. The bot owns the store (SQLite under
# /var/lib/amitista/transcripts); the panel and the public page both read it
# through botctl, so nothing here touches that file directly.
TRANSCRIPT_LIMIT = 40
TRANSCRIPT_LIMIT_MAX = 200
TRANSCRIPT_QUERY_MAX = 200
TRANSCRIPT_KINDS = ("ticket", "project", "application", "channel")
TRANSCRIPT_CODE = re.compile(r"^[a-z0-9][a-z0-9-]{4,79}$")
TRANSCRIPT_ID = re.compile(r"^[0-9a-f]{32}$")
TRANSCRIPT_FILE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
# A transcript is one JSON document with every message in it, so the 2 MB
# ceiling the rest of the bot bridge uses is too small by an order of magnitude.
TRANSCRIPT_BYTES = 16 * 1024 * 1024

SUPPORT_STAGES = ("new", "active", "waiting", "resolved")
SUPPORT_PRIORITIES = ("low", "normal", "high", "urgent")
SUPPORT_MESSAGES = 50
SUPPORT_MESSAGES_MAX = 100
SUPPORT_BODY_MAX = 1500
SUPPORT_REASON_MAX = 300
SUPPORT_TEXT_MAX = 4000
SUPPORT_ANSWER_MAX = 1000
SUPPORT_CHECKS_MAX = 10
SUPPORT_ATTACHMENTS_MAX = 10
SUPPORT_WRITES = env_int("ADMIN_SUPPORT_WRITES", 20)
SUPPORT_WRITE_WINDOW = env_int("ADMIN_SUPPORT_WINDOW", 300)

if BOT_URL and not loopback_only(BOT_URL):
    log.error("ADMIN_BOT_URL must be an http loopback address; ignoring it")
    BOT_URL = ""

# The enchange (c2c) exchange bot's read-only control port. Its database is
# 0700 to the `enchange` user, so the panel asks the bot rather than reading
# the file — see /opt/enchange/src/web/control.ts.
ENCHANGE_URL = os.environ.get("ADMIN_ENCHANGE_URL", "http://127.0.0.1:8796").strip().rstrip("/")
ENCHANGE_TOKEN = os.environ.get("ENCHANGE_TOKEN", "").strip()
ENCHANGE_TIMEOUT = 10
ENCHANGE_MAX_BYTES = 4 * 1024 * 1024
ENCHANGE_LIMIT = 100
ENCHANGE_LIMIT_MAX = 500
ENCHANGE_SEVERITIES = ("security", "important", "medium")

if ENCHANGE_URL and not loopback_only(ENCHANGE_URL):
    log.error("ADMIN_ENCHANGE_URL must be an http loopback address; ignoring it")
    ENCHANGE_URL = ""

LISTEN_HOST = os.environ.get("LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = env_int("LISTEN_PORT", 8788)

SESSION_HOURS = env_int("ADMIN_SESSION_HOURS", 12)
IDLE_MINUTES = env_int("ADMIN_IDLE_MINUTES", 60)
RENEW_AFTER = env_int("ADMIN_RENEW_AFTER", 300)
RATE_PER_IP = env_int("ADMIN_RATE_PER_IP", 10)
RATE_WINDOW = env_int("ADMIN_RATE_WINDOW", 900)
LOCKOUT_AFTER = env_int("ADMIN_LOCKOUT_AFTER", 5)
LOCKOUT_SECONDS = env_int("ADMIN_LOCKOUT_SECONDS", 900)
ACCOUNT_LOCKOUT_AFTER = env_int("ADMIN_ACCOUNT_LOCKOUT_AFTER", 12)

GATE_SECONDS = env_int("ADMIN_GATE_SECONDS", 1800)
GATE_ATTEMPTS = env_int("ADMIN_GATE_ATTEMPTS", 20)
GATE_WINDOW = env_int("ADMIN_GATE_WINDOW", 900)
GATE_SIGNINS = env_int("ADMIN_GATE_SIGNINS", 5)

INSECURE_COOKIE = env_flag("ADMIN_INSECURE_COOKIE")

if INSECURE_COOKIE and ALLOWED_ORIGIN.lower().startswith("https://"):
    raise SystemExit(
        "ADMIN_INSECURE_COOKIE drops the Secure flag and ADMIN_ORIGIN is https — refusing to start"
    )

IDLE_SECONDS = max(60, IDLE_MINUTES * 60)
SESSION_SECONDS = max(IDLE_SECONDS, SESSION_HOURS * 3600)

TRUSTED_PROXIES = ("127.0.0.1", "::1", "::ffff:127.0.0.1")

ALERT_WEBHOOK = os.environ.get("ALERT_WEBHOOK", "").strip()
ALERT_TIMEOUT = 6
ALERT_COLOURS = {"signin": 0x8B5CF6, "lockout": 0xEF4444, "account": 0x22C55E, "token": 0xF59E0B}

def usable_webhook(url):
    if not url:
        return False
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https":
        return False
    return parts.hostname in ("discord.com", "discordapp.com", "canary.discord.com")

if ALERT_WEBHOOK and not usable_webhook(ALERT_WEBHOOK):
    log.error("ALERT_WEBHOOK is not an https Discord webhook; ignoring it")
    ALERT_WEBHOOK = ""

def post_alert(kind, title, fields, webhook=None):
    target = webhook or ALERT_WEBHOOK
    body = json.dumps(
        {
            "username": "Amitista Admin",
            "allowed_mentions": {"parse": []},
            "embeds": [
                {
                    "title": title,
                    "color": ALERT_COLOURS.get(kind, 0x8B5CF6),
                    "fields": [{"name": name, "value": value, "inline": True} for name, value in fields],
                }
            ],
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        target,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "amitista-admin-api/1.0"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=ALERT_TIMEOUT).close()
    except (urllib.error.URLError, OSError):
        log.warning("could not deliver the %s alert", kind)

def alert(kind, title, fields):
    target = alert_webhook()
    if not target or not usable_webhook(target):
        return
    threading.Thread(target=post_alert, args=(kind, title, fields, target), daemon=True).start()

def stamp():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

vault = None
vault_secrets = None
vault_fault = None

try:
    vault = build_vault()
except VaultError as failure:
    vault_fault = failure.message
    log.error("the vault is not usable: %s", failure.message)

if vault is not None:
    vault_secrets = Secrets(vault)
    user_sealer = Sealer(vault, "users")
    token_sealer = Sealer(vault, "tokens")
else:
    user_sealer = None
    token_sealer = None

users = Users(os.path.join(STATE_DIR, "users.json"), sealer=user_sealer)
users.refresh_roles()
tokens = Tokens(TOKENS_PATH, GATEWAY_GROUP, sealer=token_sealer)
audit = Audit(os.path.join(STATE_DIR, "audit.jsonl"))
brands = Brands(os.path.join(STATE_DIR, "brands.json"))
findings = Findings(os.path.join(STATE_DIR, "findings.json"))
maintenance = Maintenance(os.path.join(STATE_DIR, "maintenance.json"))
boards = Boards(os.path.join(STATE_DIR, "boards.json"))
firewall = Firewall(os.path.join(STATE_DIR, "firewall.json"))
project_files = ProjectFiles(
    os.path.join(STATE_DIR, "project-files.json"),
    os.path.join(STATE_DIR, "project-ledger.jsonl"),
)
firewall_events = FirewallEvents(os.path.join(STATE_DIR, "firewall-events.jsonl"))
hooks = admin_hooks.Runner(EVENTS_PATH, users, dm=lambda holder, events: dm_events(holder, events))

FIREWALL_CONF = os.environ.get("ADMIN_FIREWALL_CONF", os.path.join(STATE_DIR, "firewall.conf"))
FIREWALL_STATUS = os.environ.get(
    "ADMIN_FIREWALL_STATUS", os.path.join(STATE_DIR, "firewall-apply.json")
)
FIREWALL_LOG = os.environ.get("ADMIN_FIREWALL_LOG", "/var/log/amitista/firewall.log")
FIREWALL_GEO = os.environ.get("ADMIN_GEO", "/var/lib/amitista/admin/ipcountry.json")
FIREWALL_EDGE_SHOWN = env_int("ADMIN_FIREWALL_EDGE_SHOWN", 300)
FIREWALL_LOG_BYTES = env_int("ADMIN_FIREWALL_LOG_BYTES", 4 * 1024 * 1024)

LOOPBACK = ("127.0.0.1", "::1")

FIREWALL_LOG_LINE = re.compile(
    r"^(?P<ip>\S+) (?P<marks>[0-9]{5}) (?P<verdict>\w+) \[(?P<when>[^\]]+)\] "
    r'"(?P<method>[A-Z]+) (?P<target>[^"]*)" (?P<status>\d{3}) "(?P<agent>[^"]*)"'
)

MARK_FIELDS = ("ip", "path", "signature", "agent", "method")

_geo_cache = {"mtime": None, "table": None}
_geo_lock = threading.Lock()

def firewall_geo():
    try:
        mtime = os.path.getmtime(FIREWALL_GEO)
    except OSError:
        return None
    with _geo_lock:
        if _geo_cache["mtime"] == mtime:
            return _geo_cache["table"]
        try:
            with open(FIREWALL_GEO, encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, ValueError):
            payload = None
        if isinstance(payload, dict):
            for family in ("v4", "v6"):
                table = payload.get(family)
                if not isinstance(table, dict) or not isinstance(table.get("starts"), list):
                    payload = None
                    break
        else:
            payload = None
        _geo_cache["mtime"] = mtime
        _geo_cache["table"] = payload
        return payload

def firewall_country(address):
    geo = firewall_geo()
    if geo is None:
        return None
    try:
        if ":" in str(address):
            value = int(ipaddress.IPv6Address(address)) >> int(geo.get("v6Shift") or 64)
            table = geo["v6"]
        else:
            value = int(ipaddress.IPv4Address(address))
            table = geo["v4"]
    except ValueError:
        return None
    index = bisect.bisect_right(table["starts"], value) - 1
    if index < 0 or value > table["ends"][index]:
        return None
    code = table["cc"][index]
    return code if isinstance(code, str) and len(code) == 2 else None

def firewall_stage():
    try:
        body = firewall.nginx_conf(firewall_geo())
    except StoreError as failure:
        log.error("firewall config could not be built: %s", failure.message)
        return None
    directory = os.path.dirname(FIREWALL_CONF)
    try:
        os.makedirs(directory, exist_ok=True)
        handle = tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=directory, prefix=".fwconf-", delete=False
        )
        handle.write(body)
        handle.flush()
        os.fsync(handle.fileno())
        handle.close()
        os.chmod(handle.name, 0o644)
        os.replace(handle.name, FIREWALL_CONF)
    except OSError as failure:
        log.error("firewall config could not be staged: %s", failure)
        return None
    return FIREWALL_CONF

def firewall_apply_status():
    try:
        with open(FIREWALL_STATUS, encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, ValueError):
        return {"state": "unknown", "at": None, "detail": "The applier has not reported yet."}
    if not isinstance(payload, dict):
        return {"state": "unknown", "at": None, "detail": "The applier wrote something unreadable."}
    return {
        "state": payload.get("state") or "unknown",
        "at": payload.get("at"),
        "detail": payload.get("detail") or "",
    }

def firewall_request(handler, body=None):
    return {
        "ip": handler.client_ip(),
        "method": handler.command,
        "target": handler.path,
        "agent": handler.headers.get("User-Agent") or "",
        "body": body,
    }

def firewall_screen(handler, body=None):
    ip = handler.client_ip()
    if ip in LOOPBACK:
        return None
    try:
        rules = firewall.active()
    except StoreError:
        return None
    if not rules:
        return None
    if body is not None:
        rules = [rule for rule in rules if rule["kind"] == "signature"]
        if not rules:
            return None
    request = firewall_request(handler, body)
    country = firewall_country(ip)
    verdict = firewall.evaluate(request, country, rules)
    if verdict is None:
        return None
    firewall_events.record(verdict, request, country, "app")
    if verdict["action"] == "blocked":
        log.info(
            "firewall blocked %s on %s (%s %s)",
            ip,
            request["target"][:80],
            verdict["rule"]["kind"],
            verdict["rule"]["value"],
        )
    return verdict

def firewall_edge_events(limit=FIREWALL_EDGE_SHOWN):
    try:
        size = os.path.getsize(FIREWALL_LOG)
        with open(FIREWALL_LOG, "rb") as handle:
            if size > FIREWALL_LOG_BYTES:
                handle.seek(size - FIREWALL_LOG_BYTES)
                handle.readline()
            lines = handle.read().decode("utf-8", "replace").splitlines()
    except OSError:
        return []

    out = []
    for line in lines[-limit:]:
        match = FIREWALL_LOG_LINE.match(line)
        if match is None:
            continue
        marks = match.group("marks")
        matched = [
            MARK_FIELDS[index] for index, mark in enumerate(marks) if mark in ("1", "2")
        ]
        try:
            when = datetime.strptime(match.group("when"), "%d/%b/%Y:%H:%M:%S %z")
        except ValueError:
            continue
        out.append(
            {
                "at": when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "action": "blocked" if match.group("verdict") == "block" else "observed",
                "layer": "edge",
                "matched": matched,
                "ip": match.group("ip"),
                "method": match.group("method"),
                "target": match.group("target")[:200],
                "status": int(match.group("status")),
                "agent": match.group("agent")[:200],
            }
        )
    out.reverse()
    return out

DECOY_HASH = hash_password(secrets.token_urlsafe(32))

def session_secret():
    if vault is None:
        return ADMIN_SECRET
    if vault_fault is not None:
        raise VaultError(vault_fault)
    return vault_secrets.get("session")

def secret_bytes():
    return session_secret().encode("utf-8")

def alert_webhook():
    if vault is None:
        return ALERT_WEBHOOK
    try:
        return vault_secrets.get("alerts", "")
    except VaultError:
        return ""

def configured():
    try:
        if len(session_secret()) < 32:
            return False
    except VaultError:
        return False
    try:
        return users.has_owner()
    except (StoreError, VaultError):
        return False

class Revocations:

    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.before = self._load()

    def _load(self):
        try:
            with open(self.path, encoding="ascii") as handle:
                return float(handle.read().strip())
        except (OSError, ValueError):
            return 0.0

    def cutoff(self):
        with self.lock:
            return self.before

    def revoke(self, now):
        with self.lock:
            self.before = now
            try:
                os.makedirs(os.path.dirname(self.path), exist_ok=True)
                tmp = "%s.tmp" % self.path
                with open(tmp, "w", encoding="ascii") as handle:
                    handle.write("%.6f" % now)
                os.replace(tmp, self.path)
            except OSError:
                log.warning("could not persist the revocation cutoff — sessions end at restart")

revocations = Revocations(REVOKE_PATH)

def sign(body):
    return b64encode(hmac.new(secret_bytes(), body.encode("ascii"), hashlib.sha256).digest())

def session_ceiling(started):
    return float(started) + SESSION_SECONDS


def token_expiry(now, started):
    return int(min(now + IDLE_SECONDS, session_ceiling(started)))


def issue_token(user, version, now, started=None):
    start = float(now if started is None else started)
    payload = {
        "u": user,
        "v": int(version),
        "iat": round(now, 6),
        "sat": round(start, 6),
        "exp": token_expiry(now, start),
    }
    body = b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return "%s.%s" % (body, sign(body))

def read_token(token, now):
    if not token or token.count(".") != 1:
        return None
    body, signature = token.split(".")
    try:
        if not hmac.compare_digest(sign(body), signature):
            return None
        payload = json.loads(b64decode(body).decode("utf-8"))
    except (ValueError, TypeError, UnicodeDecodeError, base64.binascii.Error):
        return None
    if not isinstance(payload, dict):
        return None

    expires = payload.get("exp")
    if not isinstance(expires, int) or expires <= now:
        return None

    issued = payload.get("iat")
    if not isinstance(issued, (int, float)) or issued < revocations.cutoff():
        return None

    started = payload.get("sat")
    if not isinstance(started, (int, float)):
        started = issued
    if started > issued or now >= session_ceiling(started):
        return None
    payload["sat"] = float(started)

    name = payload.get("u")
    if not isinstance(name, str) or not name:
        return None

    try:
        record = users.find(name)
    except StoreError:
        return None
    if record is None or record.get("disabled") or is_expired(record):
        return None

    version = payload.get("v")
    if not isinstance(version, int) or version != int(record.get("tokenVersion") or 1):
        return None

    payload["record"] = record
    return payload

def sign_pending(body):
    return b64encode(hmac.new(secret_bytes(), ("step." + body).encode("ascii"), hashlib.sha256).digest())


def issue_pending(user, version, now, subject):
    payload = {
        "p": user,
        "v": int(version),
        "g": str(subject),
        "iat": round(now, 6),
        "exp": int(now + PENDING_SECONDS),
    }
    body = b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return "%s.%s" % (body, sign_pending(body))


def read_pending(token, now):
    if not token or token.count(".") != 1:
        return None
    body, signature = token.split(".")
    try:
        if not hmac.compare_digest(sign_pending(body), signature):
            return None
        payload = json.loads(b64decode(body).decode("utf-8"))
    except (ValueError, TypeError, UnicodeDecodeError, base64.binascii.Error):
        return None
    if not isinstance(payload, dict):
        return None

    expires = payload.get("exp")
    if not isinstance(expires, int) or expires <= now:
        return None

    issued = payload.get("iat")
    if not isinstance(issued, (int, float)) or issued < revocations.cutoff():
        return None

    name = payload.get("p")
    if not isinstance(name, str) or not name:
        return None
    subject = payload.get("g")
    if not isinstance(subject, str) or not subject:
        return None

    try:
        record = users.find(name)
    except StoreError:
        return None
    if record is None or record.get("disabled") or is_expired(record):
        return None

    version = payload.get("v")
    if not isinstance(version, int) or version != int(record.get("tokenVersion") or 1):
        return None

    linked = record.get("google")
    if not isinstance(linked, dict) or linked.get("sub") != subject:
        return None

    payload["record"] = record
    return payload


def gate_live():
    return admin_turnstile.live()


def sign_gate(body):
    return b64encode(hmac.new(secret_bytes(), ("gate." + body).encode("ascii"), hashlib.sha256).digest())


def issue_gate(now, ip):
    payload = {
        "ip": str(ip or ""),
        "id": secrets.token_urlsafe(9),
        "iat": round(now, 6),
        "exp": int(now + GATE_SECONDS),
    }
    body = b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return "%s.%s" % (body, sign_gate(body))


def read_gate(token, now, ip):
    if not token or token.count(".") != 1:
        return None
    body, signature = token.split(".")
    try:
        if not hmac.compare_digest(sign_gate(body), signature):
            return None
        payload = json.loads(b64decode(body).decode("utf-8"))
    except (ValueError, TypeError, UnicodeDecodeError, base64.binascii.Error):
        return None
    if not isinstance(payload, dict):
        return None

    expires = payload.get("exp")
    if not isinstance(expires, int) or expires <= now:
        return None

    issued = payload.get("iat")
    if not isinstance(issued, (int, float)) or issued < revocations.cutoff():
        return None

    if payload.get("ip") != str(ip or ""):
        return None

    if not isinstance(payload.get("id"), str) or not payload["id"]:
        return None

    return payload


def google_ready():
    return admin_google is not None and admin_google.enabled()


def account_password(name):
    try:
        record = users.find(name)
    except StoreError:
        return None
    if record is None:
        return None
    return record.get("password")

class RateLimit:

    def __init__(self, per_ip, window):
        self.per_ip = per_ip
        self.window = window
        self.by_ip = {}
        self.lock = threading.Lock()

    @staticmethod
    def _trim(stamps, cutoff):
        while stamps and stamps[0] < cutoff:
            stamps.popleft()

    def check(self, ip):
        now = time.monotonic()
        cutoff = now - self.window
        with self.lock:
            for known in [key for key, seen in self.by_ip.items() if not seen or seen[-1] < cutoff]:
                del self.by_ip[known]

            mine = self.by_ip.setdefault(ip, deque())
            self._trim(mine, cutoff)

            if len(mine) >= self.per_ip:
                return True

            mine.append(now)
            return False

class Lockout:

    def __init__(self, after, seconds):
        self.after = after
        self.seconds = seconds
        self.by_ip = {}
        self.lock = threading.Lock()

    def _sweep(self, now):
        stale = [ip for ip, (count, until, seen) in self.by_ip.items() if until < now and seen < now - self.seconds]
        for ip in stale:
            del self.by_ip[ip]

    def blocked(self, ip):
        now = time.monotonic()
        with self.lock:
            self._sweep(now)
            count, until, seen = self.by_ip.get(ip, (0, 0.0, now))
            remaining = until - now
            return int(remaining) + 1 if remaining > 0 else 0

    def failed(self, ip):
        now = time.monotonic()
        with self.lock:
            self._sweep(now)
            count, until, seen = self.by_ip.get(ip, (0, 0.0, now))
            count += 1
            if count >= self.after:
                self.by_ip[ip] = (0, now + self.seconds, now)
                return True
            self.by_ip[ip] = (count, until, now)
            return False

    def passed(self, ip):
        with self.lock:
            self.by_ip.pop(ip, None)

    def snapshot(self):
        now = time.monotonic()
        with self.lock:
            self._sweep(now)
            out = []
            for ip, (count, until, seen) in self.by_ip.items():
                remaining = int(until - now)
                out.append(
                    {
                        "key": ip,
                        "ip": ip,
                        "failures": count,
                        "lockedFor": remaining if remaining > 0 else 0,
                    }
                )
            out.sort(key=lambda entry: (-entry["lockedFor"], -entry["failures"]))
            return out[:25]

class Passes:

    def __init__(self, allowance, seconds):
        self.allowance = allowance
        self.seconds = seconds
        self.used = {}
        self.lock = threading.Lock()

    def _sweep(self, now):
        for key in [key for key, (_, seen) in self.used.items() if seen < now - self.seconds]:
            del self.used[key]

    def charge(self, key):
        now = time.monotonic()
        with self.lock:
            self._sweep(now)
            count, _ = self.used.get(key, (0, now))
            if count >= self.allowance:
                return False
            self.used[key] = (count + 1, now)
            return True

    def spend(self, key):
        with self.lock:
            self.used[key] = (self.allowance, time.monotonic())


class LinkCodes:

    def __init__(self, seconds, alphabet, length):
        self.seconds = seconds
        self.alphabet = alphabet
        self.length = length
        self.open = {}
        self.lock = threading.Lock()

    def _sweep(self, now):
        stale = [name for name, entry in self.open.items() if entry["expires"] <= now]
        for name in stale:
            del self.open[name]

    def start(self, account):
        now = time.time()
        with self.lock:
            self._sweep(now)
            code = "".join(secrets.choice(self.alphabet) for _ in range(self.length))
            entry = {"code": code, "started": now, "expires": now + self.seconds}
            self.open[account] = entry
            return dict(entry)

    def current(self, account):
        now = time.time()
        with self.lock:
            self._sweep(now)
            entry = self.open.get(account)
            return dict(entry) if entry else None

    def drop(self, account):
        with self.lock:
            entry = self.open.pop(account, None)
            return dict(entry) if entry else None

class Artwork:

    def __init__(self, seconds, keep):
        self.seconds = seconds
        self.keep = keep
        self.by_account = {}
        self.by_url = {}
        self.lock = threading.Lock()

    def remember(self, account, urls):
        now = time.time()
        with self.lock:
            self.by_account[account] = {"urls": dict(urls), "at": now}

    def url(self, account, kind):
        now = time.time()
        with self.lock:
            held = self.by_account.get(account)
            if held is None or now - held["at"] > self.seconds:
                return None
            return held["urls"].get(kind)

    def blob(self, url):
        now = time.time()
        with self.lock:
            held = self.by_url.get(url)
            if held is not None and now - held["at"] <= self.seconds:
                return held["type"], held["data"]
        fetched = fetch_art(url)
        if fetched is None:
            return None
        with self.lock:
            if len(self.by_url) >= self.keep:
                self.by_url.clear()
            self.by_url[url] = {"type": fetched[0], "data": fetched[1], "at": now}
        return fetched

    def forget(self, account):
        with self.lock:
            self.by_account.pop(account, None)

limiter = RateLimit(RATE_PER_IP, RATE_WINDOW)
gate_limiter = RateLimit(GATE_ATTEMPTS, GATE_WINDOW)
gate_passes = Passes(GATE_SIGNINS, GATE_SECONDS)
lockout = Lockout(LOCKOUT_AFTER, LOCKOUT_SECONDS)
account_lockout = Lockout(ACCOUNT_LOCKOUT_AFTER, LOCKOUT_SECONDS)
link_codes = LinkCodes(DISCORD_LINK_SECONDS, DISCORD_CODE_ALPHABET, DISCORD_CODE_LENGTH)
artwork = Artwork(DISCORD_ART_SECONDS, DISCORD_ART_KEEP)
support_writes = RateLimit(SUPPORT_WRITES, SUPPORT_WRITE_WINDOW)

TRACK_LOOKUPS = 20
TRACK_WINDOW = 300
track_lookups = RateLimit(TRACK_LOOKUPS, TRACK_WINDOW)

TRANSCRIPT_LOOKUPS = 30
TRANSCRIPT_WINDOW = 300
transcript_lookups = RateLimit(TRANSCRIPT_LOOKUPS, TRANSCRIPT_WINDOW)

class Rejected(Exception):

    def __init__(self, status, message, needs=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.needs = needs

    def payload(self):
        body = {"message": self.message}
        if self.needs:
            body["needs"] = self.needs
        return body

def read_json_file(path):
    try:
        with open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        log.warning("could not read %s", path)
        return None
    return payload if isinstance(payload, dict) else None

OVERVIEW_ALWAYS = ("generated", "stale", "status")

OVERVIEW_GATED = {
    "releases.read": ("currentRelease", "releases", "rollbackTargets", "host"),
    "services.read": ("services", "timers", "disk", "backups", "certificate", "relay"),
}

API_ALWAYS = ("window", "generated", "timed", "totals", "site", "endpoints", "hourly")

API_GATED = {
    "security.read": ("notFound", "agents"),
}

def narrow_overview(payload, granted):
    held = set(granted or ())

    out = {name: payload[name] for name in OVERVIEW_ALWAYS if name in payload}
    for permission, names in OVERVIEW_GATED.items():
        if permission in held:
            out.update({name: payload[name] for name in names if name in payload})

    api = payload.get("api")
    if isinstance(api, dict):
        trimmed = {name: api[name] for name in API_ALWAYS if name in api}
        for permission, names in API_GATED.items():
            if permission in held:
                trimmed.update({name: api[name] for name in names if name in api})
        out["api"] = trimmed
    elif "api" in payload:
        out["api"] = api

    out["scope"] = sorted(
        permission
        for permission in list(OVERVIEW_GATED) + list(API_GATED)
        if permission in held
    )
    return out

def build_overview(granted=None):
    snapshot = read_json_file(OVERVIEW_PATH)
    status = read_json_file(STATUS_PATH)

    if snapshot is None:
        payload = {
            "generated": None,
            "stale": True,
            "releases": [],
            "services": [],
            "timers": [],
            "backups": None,
            "disk": None,
            "certificate": None,
            "relay": None,
            "status": status,
        }
        return narrow_overview(payload, granted)

    payload = dict(snapshot)
    payload["status"] = status
    payload["stale"] = False

    generated = snapshot.get("generated")
    if isinstance(generated, str):
        age = age_of(generated)
        payload["stale"] = True if age is None else age > 900

    return narrow_overview(payload, granted)

# The GitHub group of the panel.
#
# Reads the snapshot the deploy writes each tick and says nothing the deploy did
# not already establish. It cannot ask GitHub itself: the token is root-only and
# this service runs under ProtectHome, so /root does not exist as far as it is
# concerned. That is the arrangement, not a limitation to be worked around.
#
# One thing here does ask for a change to be made — who may reach a repository,
# and at what level. It still does not talk to GitHub. It writes what it wants
# into a queue directory, and the collector, which is root and does hold the
# token, decides each tick whether to carry it out. The collector re-checks
# every field rather than trusting this file, because this service is the less
# privileged of the two and a queue is exactly what an attacker who had it would
# reach for. So the worst this service can do on its own is fill a directory
# with requests that get refused.

GITHUB_QUEUE = os.environ.get("ADMIN_GITHUB_QUEUE", "/var/lib/amitista/admin/github-queue")

# What GitHub takes for a repository collaborator, weakest first.
GITHUB_ROLES = ("pull", "triage", "push", "maintain", "admin")

# GitHub's own rule for a login: alphanumerics and single inner hyphens, up to
# thirty-nine characters. Checked because the login ends up in a URL path.
GITHUB_LOGIN = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$")

# Enough that nobody hits it by working, few enough that a stuck collector
# cannot be used to fill the disk a request at a time.
GITHUB_QUEUE_LIMIT = 50

def age_of(generated):
    """How long ago a collector wrote a snapshot, in seconds.

    The stamp is UTC and says so with its Z, so it is converted with
    calendar.timegm rather than time.mktime. mktime reads a struct as local
    time, and the correction that used to follow it — time.timezone — is the
    standard offset and takes no account of summer time. So for the half of the
    year this box is on summer time every snapshot read an hour older than it
    was, which is past every staleness ceiling here: the panel spent the summer
    reporting a snapshot written seconds ago as stale, and telling the reader
    the deploy timer had stopped when it had not.
    """
    if not isinstance(generated, str):
        return None
    try:
        return time.time() - calendar.timegm(time.strptime(generated, "%Y-%m-%dT%H:%M:%SZ"))
    except ValueError:
        return None


def build_github():
    snapshot = read_json_file(GITHUB_PATH)
    if snapshot is None:
        return {
            "generated": None,
            "stale": True,
            "collected": False,
            "org": None,
            "branch": None,
            "repositories": [],
        }

    payload = dict(snapshot)
    payload["collected"] = True
    # Conditional-request bookkeeping for the collector. Of no use to the panel,
    # and it grows with every path ever asked for, so it does not travel.
    payload.pop("etags", None)
    repositories = payload.get("repositories")
    payload["repositories"] = repositories if isinstance(repositories, list) else []

    age = age_of(payload.get("generated"))
    payload["stale"] = True if age is None else age > GITHUB_STALE_AFTER
    payload["queued"] = github_queued()
    payload["reviewer"] = admin_review.configured()
    for repo in payload["repositories"]:
        if isinstance(repo, dict):
            github_strip_patches(repo)
    return payload


def github_strip_patches(repo):
    """Take the diffs back out before the snapshot travels.

    The collector keeps a patch per changed file so that a review has something
    to read. The panel does not display one, and there can be tens of kilobytes
    of them, so every reader of the snapshot would be paying for something none
    of them use. Whether it was clipped stays, because that is the one thing the
    panel does say out loud.
    """
    for pull in repo.get("pulls") or []:
        if not isinstance(pull, dict):
            continue
        for entry in pull.get("changed") or []:
            if isinstance(entry, dict):
                entry.pop("patch", None)

def github_avatar_for(login):
    """The avatar the collector last saw for a login.

    Resolved out of the same snapshot the panel is already drawing rather than
    from a URL the browser hands over, so the panel can only ever ask for an
    image of somebody it is showing, and this service still needs no GitHub
    token of its own.
    """
    wanted = str(login or "").strip().lower()
    if not wanted:
        return None
    snapshot = read_json_file(GITHUB_PATH)
    if not isinstance(snapshot, dict):
        return None

    def found_in(entries):
        for entry in entries or []:
            if not isinstance(entry, dict):
                continue
            if str(entry.get("login") or "").strip().lower() != wanted:
                continue
            held = github_art(entry.get("avatar"))
            if held:
                return held
        return None

    people = snapshot.get("people")
    if isinstance(people, dict):
        for key in ("members", "invites"):
            held = found_in(people.get(key))
            if held:
                return held

    for repo in snapshot.get("repositories") or []:
        if not isinstance(repo, dict):
            continue
        for key in ("access", "invites", "stats"):
            held = found_in(repo.get(key))
            if held:
                return held
    return None


def github_pull_for(repo, number):
    """One open pull request out of the snapshot, diff and all.

    Read from the file rather than from build_github, which strips the patches
    that are the only reason to look it up here.
    """
    snapshot = read_json_file(GITHUB_PATH)
    if not isinstance(snapshot, dict):
        return None
    for entry in snapshot.get("repositories") or []:
        if not isinstance(entry, dict) or entry.get("name") != repo:
            continue
        for pull in entry.get("pulls") or []:
            if isinstance(pull, dict) and pull.get("number") == number:
                return pull
    return None


def github_queued():
    """Access changes that have been asked for and not yet carried out.

    Read back out of the queue directory rather than remembered, because the
    collector is what empties it: a request is pending exactly as long as its
    file is still there, and no bookkeeping on this side could say so as
    truthfully.
    """
    out = []
    try:
        names = sorted(name for name in os.listdir(GITHUB_QUEUE) if name.endswith(".json"))
    except OSError:
        return out
    for name in names[:GITHUB_QUEUE_LIMIT]:
        intent = read_json_file(os.path.join(GITHUB_QUEUE, name))
        if isinstance(intent, dict):
            out.append(intent)
    return out

def github_queue(session, intent):
    """Leave a request for the collector, and say nothing about the outcome.

    Everything checked here is checked again by the collector, which is the
    side that matters. This copy exists so that a mistake comes back as an
    answer to the request that made it, instead of surfacing a minute later as
    a line in a log.
    """
    if intent["action"] != "uninvite":
        login = intent.get("login")
        if not isinstance(login, str) or not GITHUB_LOGIN.match(login):
            raise Rejected(400, "That is not a GitHub username.")
    if intent["action"] == "grant" and intent.get("permission") not in GITHUB_ROLES:
        raise Rejected(400, "That is not a permission GitHub takes.")

    snapshot = read_json_file(GITHUB_PATH)
    repositories = (snapshot or {}).get("repositories")
    known = {
        entry.get("name")
        for entry in (repositories if isinstance(repositories, list) else [])
        if isinstance(entry, dict)
    }
    if intent.get("repo") not in known:
        raise Rejected(400, "There is no such repository on this box.")

    if len(github_queued()) >= GITHUB_QUEUE_LIMIT:
        raise Rejected(
            429,
            "There are already %d access changes waiting. The deploy carries them out about "
            "once a minute — if they are not clearing, it has stopped." % GITHUB_QUEUE_LIMIT,
        )

    intent = dict(intent)
    intent["id"] = secrets.token_hex(8)
    intent["at"] = stamp()
    intent["by"] = session["record"]["name"]

    try:
        os.makedirs(GITHUB_QUEUE, exist_ok=True)
        handle = tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=GITHUB_QUEUE, prefix=".queue-", suffix=".tmp",
            delete=False,
        )
        try:
            json.dump(intent, handle)
            handle.flush()
            os.fsync(handle.fileno())
            handle.close()
            os.chmod(handle.name, 0o640)
            # Named after the moment it was asked for, so the collector drains
            # them in the order they were made — two changes to one person's
            # access have to land the way they were asked for or the second
            # undoes the first.
            os.replace(handle.name, os.path.join(GITHUB_QUEUE, "%f-%s.json" % (time.time(), intent["id"])))
        except BaseException:
            try:
                os.unlink(handle.name)
            except OSError:
                pass
            raise
    except OSError as failure:
        log.warning("github queue write failed: %s", failure)
        raise Rejected(503, "The request could not be written down. Nothing has been changed.")

    log.info(
        "github access queued by %s: %s %s %s",
        intent["by"], intent["action"], intent.get("repo"), intent.get("login") or intent.get("invite"),
    )
    return {"queued": intent, "waiting": len(github_queued())}

# The developer group of the panel. Everything below is a projection of the
# snapshot the admin-snapshot timer already writes — nothing here collects
# anything of its own, so it costs a file read and cannot wedge the box.
#
# It is a separate route from /overview on purpose: the group is gated on
# developer.read alone, so an owner can take overview.read off a developer
# without the group going dark, and can take developer.read off without
# touching the dashboard.

PERF_PAGE_FIELDS = ("path", "ttfb", "fcp", "lcp", "cls", "longTaskMs", "bytes", "lcpElement", "injected", "over")

def developer_perf():
    # /var/lib/amitista/perf is 0750 root:root and this service runs as
    # amitista-admin, so the numbers arrive the same way the reference does:
    # collected by the snapshot timer, read back here as a file.
    snapshot = read_json_file(PERF_PATH)
    if not isinstance(snapshot, dict):
        return None

    latest = snapshot.get("latest")
    if not isinstance(latest, dict):
        return None

    pages = []
    for page in latest.get("pages") or []:
        if isinstance(page, dict) and isinstance(page.get("path"), str):
            pages.append({name: page.get(name) for name in PERF_PAGE_FIELDS})

    runs = []
    for run in snapshot.get("runs") or []:
        if isinstance(run, dict) and isinstance(run.get("pages"), dict):
            runs.append(
                {
                    "at": run.get("at"),
                    "release": run.get("release"),
                    "pages": {
                        path: values
                        for path, values in run["pages"].items()
                        if isinstance(path, str) and isinstance(values, dict)
                    },
                }
            )

    problems = latest.get("problems")
    return {
        "generated": snapshot.get("generated"),
        "profile": snapshot.get("profile"),
        "budgets": snapshot.get("budgets") if isinstance(snapshot.get("budgets"), dict) else None,
        "totalRuns": snapshot.get("totalRuns"),
        "latest": {
            "at": latest.get("at"),
            "release": latest.get("release"),
            "pages": pages,
            "problems": [str(item) for item in problems] if isinstance(problems, list) else [],
        },
        "baseline": snapshot.get("baseline") if isinstance(snapshot.get("baseline"), dict) else None,
        "runs": runs,
    }

REFERENCE_FIELDS = ("label", "value", "hint", "state", "detail", "bytes", "changed", "unit")

def developer_reference(snapshot):
    # The rows are resolved against the box by the snapshot collector, which
    # runs as root and can see every path in them. This service cannot: it runs
    # as amitista-admin under ProtectHome, so /root does not exist inside its
    # namespace and half the list would read as missing if it looked for itself.
    # So it only projects what the collector saw, and says nothing when the
    # collector has not run yet rather than falling back to a written-out list
    # that nothing keeps honest.
    sections = snapshot.get("reference")
    if not isinstance(sections, list):
        return []

    out = []
    for section in sections:
        if not isinstance(section, dict):
            continue
        title = section.get("title")
        rows = section.get("rows")
        if not isinstance(title, str) or not isinstance(rows, list):
            continue

        clean = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            if not isinstance(row.get("label"), str) or not isinstance(row.get("value"), str):
                continue
            clean.append({name: row.get(name) for name in REFERENCE_FIELDS})

        if clean:
            out.append({"title": title, "rows": clean})

    return out

def developer_releases(snapshot):
    # overview.json lists releases newest first, so the build before entry n is
    # entry n+1. The delta is what that deploy actually changed in size, which
    # is the cheapest available answer to "did that build do anything".
    releases = snapshot.get("releases")
    if not isinstance(releases, list):
        releases = []

    out = []
    for index, release in enumerate(releases):
        if not isinstance(release, dict):
            continue
        entry = dict(release)
        previous = releases[index + 1] if index + 1 < len(releases) else None
        here = release.get("bytes")
        there = previous.get("bytes") if isinstance(previous, dict) else None
        entry["delta"] = (
            here - there
            if isinstance(here, int) and isinstance(there, int)
            else None
        )
        out.append(entry)

    targets = snapshot.get("rollbackTargets")
    return {
        "current": snapshot.get("currentRelease"),
        "host": snapshot.get("host"),
        "releases": out,
        "rollbackTargets": targets if isinstance(targets, list) else [],
    }

def build_developer():
    snapshot = read_json_file(OVERVIEW_PATH)
    if not isinstance(snapshot, dict):
        snapshot = {}

    api = snapshot.get("api")
    if not isinstance(api, dict):
        api = {}

    stale = True
    generated = snapshot.get("generated")
    if isinstance(generated, str):
        age = age_of(generated)
        stale = True if age is None else age > 900

    return {
        "generated": generated,
        "stale": stale,
        "host": snapshot.get("host"),
        "status": read_json_file(STATUS_PATH),
        "health": {
            "services": snapshot.get("services") if isinstance(snapshot.get("services"), list) else [],
            "timers": snapshot.get("timers") if isinstance(snapshot.get("timers"), list) else [],
            "disk": snapshot.get("disk"),
            "backups": snapshot.get("backups"),
            "certificate": snapshot.get("certificate"),
            "relay": snapshot.get("relay"),
        },
        "endpoints": {
            "window": api.get("window"),
            "generated": api.get("generated"),
            "timed": bool(api.get("timed")),
            "totals": api.get("totals") or {},
            "site": api.get("site") or {},
            "endpoints": api.get("endpoints") if isinstance(api.get("endpoints"), list) else [],
            "hourly": api.get("hourly") if isinstance(api.get("hourly"), list) else [],
            "notFound": api.get("notFound") if isinstance(api.get("notFound"), list) else [],
        },
        "releases": developer_releases(snapshot),
        "reference": developer_reference(snapshot),
        "perf": developer_perf(),
    }

def read_usage():
    if os.environ.get("ADMIN_BACKEND", "json").strip().lower() == "firestore":
        try:
            import admin_store_firebase

            return admin_store_firebase.list_api_usage()
        except Exception:
            return {}
    payload = read_json_file(USAGE_PATH)
    if not isinstance(payload, dict):
        return {}
    counters = payload.get("tokens")
    return counters if isinstance(counters, dict) else {}

def read_key_events(owner, wide, limit=None):
    entries = admin_hooks.read_events(EVENTS_PATH, limit or EVENTS_SHOWN)
    out = []
    for entry in entries:
        kind = entry.get("kind")
        if kind == "unknown":
            if not wide:
                continue
        elif entry.get("owner") != owner:
            continue
        out.append(
            {
                "at": entry.get("at"),
                "kind": kind,
                "id": entry.get("id"),
                "key": entry.get("key"),
                "ip": entry.get("ip"),
                "method": entry.get("method"),
                "path": entry.get("path"),
                "status": entry.get("status"),
                "agent": entry.get("agent"),
                "detail": entry.get("detail"),
                "repeated": entry.get("repeated"),
            }
        )
    return out


def key_change_events(owner, limit=60):
    out = []
    for entry in audit.tail(400):
        action = entry.get("action") or ""
        if not action.startswith("token."):
            continue
        detail = entry.get("detail") or {}
        if detail.get("owner") != owner:
            continue
        out.append(
            {
                "at": entry.get("at"),
                "kind": "changed",
                "id": detail.get("id"),
                "key": detail.get("name"),
                "ip": entry.get("ip"),
                "actor": entry.get("actor"),
                "action": action,
                "detail": ", ".join(detail.get("fields") or []) or None,
            }
        )
        if len(out) >= limit:
            break
    return out


def hook_facts():
    return {
        "formats": list(HOOK_FORMATS),
        "events": list(HOOK_EVENTS),
        "defaults": list(HOOK_DEFAULT_EVENTS),
        "adminOnly": list(HOOK_ADMIN_EVENTS),
        "placeholders": list(EMBED_PLACEHOLDERS),
        "embedLimits": {
            "title": EMBED_TITLE_MAX,
            "body": EMBED_BODY_MAX,
            "label": EMBED_LABEL_MAX,
            "value": EMBED_VALUE_MAX,
            "footer": EMBED_FOOTER_MAX,
            "fields": EMBED_FIELDS_MAX,
        },
        "embedDefault": dict(EMBED_DEFAULT, fields=[dict(entry) for entry in EMBED_DEFAULT["fields"]]),
    }


def gateway_facts():
    return {
        "base": "/api/k",
        "mirror": "/api/v1",
        "open": [
            "/api/v1/shield/feed",
            "/api/v1/shield/feed/status",
            "/api/v1/shield/brands",
        ],
        "scopes": list(SCOPES),
        "routes": {scope: list(paths) for scope, paths in SCOPE_ROUTES.items()},
        "free": list(GATEWAY_FREE),
        "environments": ["live", "test"],
        "rate": GATEWAY_RATE,
        "window": GATEWAY_WINDOW,
        "maxRate": MAX_RATE,
        "perOwner": KEYS_PER_OWNER,
        "maxAllowed": MAX_ALLOWED_IPS,
    }

TRAFFIC_WINDOWS = {
    "1h": {"hours": 1, "step": "hour", "label": "the last hour"},
    "6h": {"hours": 6, "step": "hour", "label": "the last six hours"},
    "24h": {"hours": 24, "step": "hour", "label": "the last 24 hours"},
    "7d": {"hours": 24 * 7, "step": "day", "label": "the last seven days"},
    "30d": {"hours": 24 * 30, "step": "day", "label": "the last thirty days"},
}

TRAFFIC_DEFAULT = "24h"

TRAFFIC_FIELDS = ("site", "api", "bytes", "clientError", "serverError", "rateLimited", "notFound")

def hour_key(moment):
    return moment.replace(minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")

def parse_hour(key):
    try:
        return datetime.strptime(key, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None

def blank_point():
    return {name: 0 for name in TRAFFIC_FIELDS}

def read_history():
    payload = read_json_file(HISTORY_PATH) or {}
    hours = payload.get("hours")
    return (hours if isinstance(hours, dict) else {}), payload.get("generated")

def build_traffic(window):
    chosen = window if window in TRAFFIC_WINDOWS else TRAFFIC_DEFAULT
    shape = TRAFFIC_WINDOWS[chosen]
    hours, generated = read_history()

    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    span = shape["hours"]
    buckets = {}
    order = []

    for offset in range(span - 1, -1, -1):
        moment = now - timedelta(hours=offset)
        label = hour_key(moment) if shape["step"] == "hour" else moment.strftime("%Y-%m-%d")
        if label not in buckets:
            buckets[label] = blank_point()
            order.append(label)
        stored = hours.get(hour_key(moment))
        if not isinstance(stored, dict):
            continue
        into = buckets[label]
        for name in TRAFFIC_FIELDS:
            try:
                into[name] += int(stored.get(name) or 0)
            except (TypeError, ValueError):
                continue

    points = [dict(buckets[label], at=label) for label in order]
    totals = blank_point()
    for point in points:
        for name in TRAFFIC_FIELDS:
            totals[name] += point[name]

    known = [parse_hour(key) for key in hours]
    oldest = min([moment for moment in known if moment is not None], default=None)
    covered = None
    if oldest is not None:
        covered = max(0, int((now - oldest).total_seconds() // 3600) + 1)

    return {
        "window": chosen,
        "label": shape["label"],
        "step": shape["step"],
        "hours": span,
        "points": points,
        "totals": totals,
        "generated": generated,
        "covered": covered,
        "partial": covered is not None and covered < span,
        "windows": [
            {"id": name, "label": TRAFFIC_WINDOWS[name]["label"], "hours": TRAFFIC_WINDOWS[name]["hours"]}
            for name in ("1h", "6h", "24h", "7d", "30d")
        ],
    }

VISIT_FIELDS = (
    "hits", "pageviews", "sessions", "bounces", "bytes", "humanHits", "botHits",
    "assets", "probes", "notFound", "errors", "internal",
)

VISIT_MAPS = ("pages", "entries", "referrers", "urls", "bots", "probes", "broken", "probeCountries")

VISIT_SOURCES = ("direct", "internal", "search", "social", "other")

VISIT_TOP = 15

HEAT_DAYS = 7

def blank_visit():
    return {name: 0 for name in VISIT_FIELDS}

def ranked(mapping, limit=VISIT_TOP):
    rows = sorted(mapping.items(), key=lambda item: (-item[1], item[0]))[:limit]
    return [{"name": name, "count": count} for name, count in rows]

def sum_maps(pool, name):
    out = {}
    for entry in pool:
        source = entry.get(name)
        if not isinstance(source, dict):
            continue
        for key, value in source.items():
            try:
                out[key] = out.get(key, 0) + int(value)
            except (TypeError, ValueError):
                continue
    return out

def gather_visitors(pool):
    out = {}
    for entry in pool:
        ids = entry.get("ids")
        if not isinstance(ids, dict):
            continue
        for identifier, seat in ids.items():
            if not isinstance(seat, list) or len(seat) < 5:
                continue
            held = out.get(identifier)
            if held is None:
                out[identifier] = list(seat)
                continue
            try:
                held[4] += int(seat[4])
            except (TypeError, ValueError):
                continue
            if not held[0] and seat[0]:
                held[0] = seat[0]
    return out

def facet(visitors, index):
    out = {}
    for seat in visitors.values():
        value = seat[index] if index < len(seat) else None
        if not value:
            continue
        out[value] = out.get(value, 0) + 1
    return out

def country_rows(visitors):
    tally = {}
    for seat in visitors.values():
        code = seat[0] if seat else None
        if not code:
            continue
        row = tally.setdefault(code, [0, 0])
        row[0] += 1
        try:
            row[1] += int(seat[4])
        except (TypeError, ValueError, IndexError):
            continue
    ordered = sorted(tally.items(), key=lambda item: (-item[1][0], -item[1][1], item[0]))
    return [{"name": code, "count": people, "views": views} for code, (people, views) in ordered]

def sum_hours(entries):
    totals = blank_visit()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        for name in VISIT_FIELDS:
            try:
                totals[name] += int(entry.get(name) or 0)
            except (TypeError, ValueError):
                continue
    return totals

def visit_labels(now, span, step):
    keys = [hour_key(now - timedelta(hours=offset)) for offset in range(span - 1, -1, -1)]
    if step != "day":
        return keys, keys
    labels = []
    for offset in range(span - 1, -1, -1):
        label = (now - timedelta(hours=offset)).strftime("%Y-%m-%d")
        if label not in labels:
            labels.append(label)
    return keys, labels

DETAIL_SPAN = 24 * 7

def visit_pool(detail, days, keys, labels, rolled):
    if rolled:
        return [days[label] for label in labels if isinstance(days.get(label), dict)]
    return [detail[key] for key in keys if isinstance(detail.get(key), dict)]

def split_broken(mapping):
    rows = []
    for key, count in sorted(mapping.items(), key=lambda item: (-item[1], item[0]))[:VISIT_TOP]:
        path, _, origin = key.partition("\t")
        rows.append({"path": path, "from": origin or None, "count": count})
    return rows

def visit_heat(hours, now):
    grid = [[0] * 24 for _ in range(7)]
    for offset in range(HEAT_DAYS * 24 - 1, -1, -1):
        moment = now - timedelta(hours=offset)
        entry = hours.get(hour_key(moment))
        if not isinstance(entry, dict):
            continue
        try:
            grid[moment.weekday()][moment.hour] += int(entry.get("pageviews") or 0)
        except (TypeError, ValueError):
            continue
    return grid

def build_analytics(window):
    chosen = window if window in TRAFFIC_WINDOWS else TRAFFIC_DEFAULT
    shape = TRAFFIC_WINDOWS[chosen]
    payload = read_json_file(ANALYTICS_PATH) or {}

    hours = payload.get("hours")
    hours = hours if isinstance(hours, dict) else {}
    detail = payload.get("detail")
    detail = detail if isinstance(detail, dict) else {}
    days = payload.get("days")
    days = days if isinstance(days, dict) else {}

    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    span = shape["hours"]
    step = shape["step"]

    rolled = span > DETAIL_SPAN
    keys, labels = visit_labels(now, span, step)
    pool = visit_pool(detail, days, keys, labels, rolled)
    totals = sum_hours([hours.get(key) for key in keys])
    visitors = gather_visitors(pool)
    totals["visitors"] = len(visitors)

    earlier_keys, earlier_labels = visit_labels(now - timedelta(hours=span), span, step)
    earlier_pool = visit_pool(detail, days, earlier_keys, earlier_labels, rolled)
    previous = sum_hours([hours.get(key) for key in earlier_keys])
    previous["visitors"] = len(gather_visitors(earlier_pool))

    points = []
    for label in labels:
        if step == "day":
            slice_keys = [key for key in keys if key.startswith(label)]
            entry = sum_hours([hours.get(key) for key in slice_keys])
            entry["visitors"] = len(
                gather_visitors(visit_pool(detail, days, slice_keys, [label], rolled))
            )
        else:
            entry = sum_hours([hours.get(label)])
            entry["visitors"] = len(
                gather_visitors(visit_pool(detail, days, [label], [label], False))
            )
        entry["at"] = label
        points.append(entry)

    sources = {name: 0 for name in VISIT_SOURCES}
    for entry in pool:
        found = entry.get("sources")
        if not isinstance(found, dict):
            continue
        for name in VISIT_SOURCES:
            try:
                sources[name] += int(found.get(name) or 0)
            except (TypeError, ValueError):
                continue

    known = [parse_hour(key) for key in hours]
    oldest = min([moment for moment in known if moment is not None], default=None)
    covered = None
    if oldest is not None:
        covered = max(0, int((now - oldest).total_seconds() // 3600) + 1)

    reach = len(pool)
    expected = len(labels) if rolled else len(keys)

    pages = sum_maps(pool, "pages")
    entries = sum_maps(pool, "entries")
    places = country_rows(visitors)
    placed = sum(row["count"] for row in places)

    return {
        "window": chosen,
        "label": shape["label"],
        "step": step,
        "hours": span,
        "collected": bool(payload),
        "generated": payload.get("generated"),
        "covered": covered,
        "partial": covered is not None and covered < span,
        "detailCovered": reach,
        "detailExpected": expected,
        "detailPartial": reach < expected,
        "detailStep": "day" if rolled else "hour",
        "detailHours": payload.get("detailHours"),
        "keptDays": payload.get("keptDays"),
        "gapMinutes": payload.get("gapMinutes"),
        "capped": bool(payload.get("capped")),
        "totals": totals,
        "previous": previous,
        "points": points,
        "sources": sources,
        "pages": [
            {"path": row["name"], "count": row["count"]}
            for row in ranked(pages, VISIT_TOP)
        ],
        "entries": [
            {"path": row["name"], "count": row["count"]}
            for row in ranked(entries, VISIT_TOP)
        ],
        "referrers": ranked(sum_maps(pool, "referrers")),
        "urls": ranked(sum_maps(pool, "urls")),
        "bots": ranked(sum_maps(pool, "bots")),
        "probes": ranked(sum_maps(pool, "probes")),
        "probeCountries": ranked(sum_maps(pool, "probeCountries")),
        "broken": split_broken(sum_maps(pool, "broken")),
        "countries": places,
        "countryCount": len(places),
        "placed": placed,
        "unplaced": max(0, len(visitors) - placed),
        "devices": ranked(facet(visitors, 1), 8),
        "browsers": ranked(facet(visitors, 2), 12),
        "systems": ranked(facet(visitors, 3), 12),
        "heat": visit_heat(hours, now),
        "heatDays": HEAT_DAYS,
        "recent": payload.get("recent") or [],
        "geo": payload.get("geo") or {"available": False},
        "windows": [
            {"id": name, "label": TRAFFIC_WINDOWS[name]["label"], "hours": TRAFFIC_WINDOWS[name]["hours"]}
            for name in ("1h", "6h", "24h", "7d", "30d")
        ],
    }

KEY_USAGE_FIELDS = ("requests", "rejected", "blocked")

def key_usage_series(identifier, window):
    chosen = window if window in TRAFFIC_WINDOWS else TRAFFIC_DEFAULT
    shape = TRAFFIC_WINDOWS[chosen]
    counters = read_usage().get(identifier)
    stored = (counters or {}).get("hours")
    stored = stored if isinstance(stored, dict) else {}

    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    buckets = {}
    order = []

    for offset in range(shape["hours"] - 1, -1, -1):
        moment = now - timedelta(hours=offset)
        label = hour_key(moment) if shape["step"] == "hour" else moment.strftime("%Y-%m-%d")
        if label not in buckets:
            buckets[label] = {name: 0 for name in KEY_USAGE_FIELDS}
            order.append(label)
        entry = stored.get(hour_key(moment))
        if not isinstance(entry, dict):
            continue
        for name in KEY_USAGE_FIELDS:
            try:
                buckets[label][name] += int(entry.get(name) or 0)
            except (TypeError, ValueError):
                continue

    points = [dict(buckets[label], at=label) for label in order]
    totals = {name: sum(point[name] for point in points) for name in KEY_USAGE_FIELDS}
    return {
        "id": identifier,
        "window": chosen,
        "label": shape["label"],
        "step": shape["step"],
        "points": points,
        "totals": totals,
        "recorded": bool(stored),
    }

def account_failures(limit=600):
    seen = {}
    for entry in audit.tail(limit):
        action = entry.get("action") or ""
        if not action.startswith("signin."):
            continue
        name = entry.get("actor") or "—"
        record = seen.setdefault(
            name,
            {
                "account": name,
                "failures": 0,
                "barred": 0,
                "badCode": 0,
                "recovery": 0,
                "lastFailure": None,
                "lastFailureIp": None,
                "lastSuccess": None,
                "addresses": [],
            },
        )
        when = entry.get("at")
        address = entry.get("ip")

        if action in ("signin.failed", "signin.badCode", "signin.googleRefused"):
            record["failures"] += 1
            if action == "signin.badCode":
                record["badCode"] += 1
            if record["lastFailure"] is None or (when or "") > record["lastFailure"]:
                record["lastFailure"] = when
                record["lastFailureIp"] = address
            if address and address not in record["addresses"]:
                record["addresses"].append(address)
        elif action == "signin.barred":
            record["barred"] += 1
        elif action == "signin.recovery":
            record["recovery"] += 1
        elif action == "signin.ok":
            if record["lastSuccess"] is None or (when or "") > record["lastSuccess"]:
                record["lastSuccess"] = when

    held = {entry["key"]: entry for entry in account_lockout.snapshot()}
    out = []
    for name, record in seen.items():
        locked = held.get(name.lower())
        record["lockedFor"] = (locked or {}).get("lockedFor") or 0
        record["pending"] = (locked or {}).get("failures") or 0
        record["addresses"] = record["addresses"][:8]
        if record["failures"] or record["barred"] or record["recovery"] or record["lockedFor"]:
            out.append(record)

    out.sort(key=lambda entry: (-entry["lockedFor"], -entry["failures"], entry["account"]))
    return out

OWN_REFUSALS = (
    "signin.failed",
    "signin.badCode",
    "signin.barred",
    "signin.googleRefused",
    "password.failed",
    "twofactor.failed",
)

OWN_SUCCESSES = ("signin.ok", "signin.recovery")


def about_account(action, detail, name):
    if action.startswith("user.") or action == "twofactor.cleared":
        return detail.get("name") == name
    if action in ("google.cleared", "discord.cleared", "picture.cleared"):
        return detail.get("account") == name
    return False


def password_changed_at(name, record):
    stored = record.get("passwordChanged")
    if stored:
        return stored
    for entry in audit.tail(AUDIT_KEEP):
        action = entry.get("action")
        detail = entry.get("detail")
        if action == "password.changed" and entry.get("actor") == name:
            return entry.get("at")
        if action == "user.password" and isinstance(detail, dict) and detail.get("name") == name:
            return entry.get("at")
    return None


def own_activity(name, limit=OWN_ACTIVITY_SHOWN):
    lowered = name.lower()
    out = []
    for entry in audit.tail(AUDIT_KEEP):
        detail = entry.get("detail")
        if not isinstance(detail, dict):
            detail = {}
        actor = entry.get("actor")
        action = entry.get("action") or ""
        mine = isinstance(actor, str) and actor.lower() == lowered
        if not mine and not about_account(action, detail, name):
            continue
        out.append(
            {
                "at": entry.get("at"),
                "action": action,
                "detail": detail,
                "ip": entry.get("ip"),
                "actor": actor,
                "byOther": not mine,
            }
        )
        if len(out) >= limit:
            break
    return out


def own_key_summary(name):
    held = tokens.listing(read_usage(), name, True)
    used = [key.get("lastUsed") for key in held if key.get("lastUsed")]
    return {
        "held": len(held),
        "live": sum(1 for key in held if not key["revoked"] and not key["expired"]),
        "revoked": sum(1 for key in held if key["revoked"]),
        "expired": sum(1 for key in held if key["expired"] and not key["revoked"]),
        "limit": KEYS_PER_OWNER,
        "requests": sum(int(key.get("requests") or 0) for key in held),
        "blocked": sum(int(key.get("blocked") or 0) for key in held),
        "lastUsed": max(used) if used else None,
    }


def read_security_report():
    payload = read_json_file(SECURITY_PATH) or {}
    return {
        "generated": payload.get("generated"),
        "csp": payload.get("csp"),
        "bans": payload.get("fail2ban"),
        "collected": bool(payload),
    }

def publish_brands():
    try:
        payload = brands.feed()
    except StoreError as failure:
        return False, failure.message

    payload["generated"] = stamp()
    payload["endpoint"] = "/api/v1/shield/brands"
    directory = os.path.dirname(BRANDS_PUBLIC)
    try:
        os.makedirs(directory, exist_ok=True)
        tmp = "%s.tmp" % BRANDS_PUBLIC
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"), sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp, 0o644)
        os.replace(tmp, BRANDS_PUBLIC)
    except OSError as failure:
        log.warning("could not publish the brand list to %s: %s", BRANDS_PUBLIC, failure)
        return False, (
            "The brand was saved, but the public copy at %s could not be written, so blocked "
            "visitors will still see the studio." % BRANDS_PUBLIC
        )
    return True, None

def brand_facts():
    return {
        "accent": BRAND_ACCENT_DEFAULT,
        "published": BRANDS_PUBLIC,
        "endpoint": "/api/v1/shield/brands",
        "page": "%s/block" % (ALLOWED_ORIGIN or "https://amitista.com"),
    }

def shield_installs():
    payload = read_json_file(INSTALLS_PATH) or {}
    records = payload.get("installs")
    if not isinstance(records, dict):
        return {"installs": [], "generated": payload.get("generated"), "collected": bool(payload)}

    out = []
    for identifier, record in records.items():
        if not isinstance(record, dict):
            continue
        out.append(
            {
                "id": identifier,
                "version": record.get("version"),
                "mode": record.get("mode"),
                "serial": record.get("serial"),
                "agent": record.get("agent"),
                "address": record.get("address"),
                "first": record.get("first"),
                "last": record.get("last"),
                "polls": int(record.get("polls") or 0),
                "notModified": int(record.get("notModified") or 0),
                "named": bool(record.get("named")),
            }
        )
    out.sort(key=lambda entry: entry.get("last") or "", reverse=True)
    return {"installs": out, "generated": payload.get("generated"), "collected": True}

class ShieldDown(Exception):

    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason

SHIELD_REASONS = {
    "not-configured": "The panel has no address for the evaluator.",
    "no-token": "The panel has no control token, so the evaluator will not answer it.",
    "unreachable": "The evaluator is not answering on its control port.",
    "refused": "The evaluator refused the panel's control token.",
    "unset": "The evaluator has no control token configured.",
    "malformed": "The evaluator answered with something that was not JSON.",
    "too-large": "The evaluator answered with more than the panel will read.",
}

class BotDown(Exception):

    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason

BOT_REASONS = {
    "not-configured": "The panel has no address for the bot.",
    "no-token": "The panel has no control token, so the bot will not answer it.",
    "unreachable": "The bot is not answering on its control port.",
    "refused": "The bot refused the panel's control token.",
    "malformed": "The bot answered with something that was not JSON.",
    "too-large": "The bot answered with more than the panel will read.",
}

class EnchangeDown(Exception):

    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason

ENCHANGE_REASONS = {
    "not-configured": "The panel has no address for the exchange bot.",
    "no-token": "The panel has no control token, so the exchange bot will not answer it.",
    "unreachable": "The exchange bot is not answering on its control port.",
    "refused": "The exchange bot refused the panel's control token.",
    "malformed": "The exchange bot answered with something that was not JSON.",
    "too-large": "The exchange bot answered with more than the panel will read.",
}


def enchange_fetch(path):
    """Read-only GET against the exchange bot's control port.

    Deliberately has no payload argument. Nothing the panel does to the logs
    changes them, and an endpoint that cannot POST cannot be talked into it.
    """
    if not ENCHANGE_URL:
        raise EnchangeDown("not-configured")
    if not ENCHANGE_TOKEN:
        raise EnchangeDown("no-token")

    request = urllib.request.Request(
        ENCHANGE_URL + path,
        headers={"Accept": "application/json", "X-Enchange-Control": ENCHANGE_TOKEN},
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=ENCHANGE_TIMEOUT) as response:
            raw = response.read(ENCHANGE_MAX_BYTES + 1)
    except urllib.error.HTTPError as failure:
        if failure.code == 401:
            raise EnchangeDown("refused")
        raise Rejected(failure.code if failure.code < 500 else 502,
                       "The exchange bot refused that.")
    except (urllib.error.URLError, OSError, ValueError):
        raise EnchangeDown("unreachable")

    if len(raw) > ENCHANGE_MAX_BYTES:
        raise EnchangeDown("too-large")
    try:
        answer = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise EnchangeDown("malformed")
    if not isinstance(answer, dict):
        raise EnchangeDown("malformed")
    return answer


def spaced_code(code):
    return "%s-%s" % (code[:4], code[4:])


def seen_user(value):
    if not isinstance(value, dict) or not value.get("id"):
        return None
    return {
        "id": str(value.get("id"))[:20],
        "tag": str(value.get("tag") or "")[:64],
        "username": str(value.get("username") or "")[:64],
        "displayName": str(value.get("displayName") or "")[:64],
    }


def discord_art(value):
    url = str(value or "")
    return url if url.startswith(DISCORD_CDN) and len(url) <= 400 else None


def github_art(value):
    url = str(value or "")
    return url if url.startswith(GITHUB_CDN) and len(url) <= 400 else None


def remote_art(value):
    """The two content CDNs this service will fetch an image from.

    fetch_art is reachable from a request, so the host is the whole of the
    defence: anything not on this list is not fetched at all, whatever the
    panel asked for.
    """
    return discord_art(value) or github_art(value)


def fetch_art(url):
    if not remote_art(url):
        return None
    request = urllib.request.Request(
        url,
        headers={"Accept": "image/*", "User-Agent": DISCORD_ART_AGENT},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=BOT_TIMEOUT) as response:
            kind = str(response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if kind not in DISCORD_ART_TYPES:
                log.warning("discord served %r for artwork, not an image", kind[:40])
                return None
            raw = response.read(DISCORD_ART_BYTES + 1)
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError):
        return None
    if len(raw) > DISCORD_ART_BYTES:
        return None
    return kind, raw


def guild_card(value):
    if not isinstance(value, dict) or not value.get("id"):
        return None
    return {"id": str(value.get("id"))[:20], "name": str(value.get("name") or "")[:100]}


def bot_card(value):
    if not isinstance(value, dict) or not value.get("id"):
        return None
    guild = value.get("guild") if isinstance(value.get("guild"), dict) else None
    return {
        "id": str(value.get("id"))[:20],
        "tag": str(value.get("tag") or "")[:64],
        "username": str(value.get("username") or "")[:64],
        "profile": "https://discord.com/users/%s" % str(value.get("id"))[:20],
        "guild": guild_card(guild),
    }


def discord_profile(answer):
    user = answer.get("user") if isinstance(answer.get("user"), dict) else {}
    member = answer.get("member") if isinstance(answer.get("member"), dict) else {}
    standing = answer.get("standing") if isinstance(answer.get("standing"), dict) else None

    art = {
        "avatar": discord_art(user.get("avatar")),
        "banner": discord_art(user.get("banner")),
        "decoration": discord_art(user.get("decoration")),
        "member": discord_art(member.get("avatar")),
    }

    roles = []
    for entry in member.get("roles") or []:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "")[:64]
        colour = str(entry.get("colour") or "")
        if not name:
            continue
        roles.append({
            "id": str(entry.get("id") or "")[:20],
            "name": name,
            "colour": colour if re.match(r"^#[0-9a-fA-F]{6}$", colour) else None,
        })

    return {
        "art": art,
        "user": {
            "id": str(user.get("id") or "")[:20],
            "tag": str(user.get("tag") or "")[:64],
            "username": str(user.get("username") or "")[:64],
            "displayName": str(user.get("displayName") or "")[:64],
            "accent": user.get("accent") if re.match(r"^#[0-9a-fA-F]{6}$", str(user.get("accent") or "")) else None,
            "createdAt": user.get("createdAt") if isinstance(user.get("createdAt"), int) else None,
        },
        "member": {
            "present": bool(member.get("present")),
            "nickname": str(member.get("nickname") or "")[:64] or None,
            "displayName": str(member.get("displayName") or "")[:64] or None,
            "joinedAt": member.get("joinedAt") if isinstance(member.get("joinedAt"), int) else None,
            "boostingSince": member.get("boostingSince") if isinstance(member.get("boostingSince"), int) else None,
            "timedOutUntil": member.get("timedOutUntil") if isinstance(member.get("timedOutUntil"), int) else None,
            "renameable": bool(member.get("renameable")),
            "roles": roles[:30],
        },
        "standing": standing,
        "guild": guild_card(answer.get("guild")),
    }


def support_stamp(value):
    return value if isinstance(value, int) and value > 0 else None


def support_ticket(value):
    if not isinstance(value, dict) or not value.get("id"):
        return None

    stage = str(value.get("stage") or "new")
    priority = str(value.get("priority") or "normal")
    number = value.get("number")

    return {
        "id": str(value.get("id"))[:20],
        "ref": str(value.get("ref") or "")[:24],
        "number": number if isinstance(number, int) else 0,
        "category": str(value.get("category") or "")[:32],
        "categoryLabel": str(value.get("categoryLabel") or "")[:64],
        "subject": str(value.get("subject") or "")[:200],
        "status": "closed" if value.get("status") == "closed" else "open",
        "stage": stage if stage in SUPPORT_STAGES else "new",
        "stageLabel": str(value.get("stageLabel") or "")[:48],
        "stageNote": str(value.get("stageNote") or "")[:160],
        "priority": priority if priority in SUPPORT_PRIORITIES else "normal",
        "priorityLabel": str(value.get("priorityLabel") or "")[:32],
        "claimed": bool(value.get("claimed")),
        "createdAt": support_stamp(value.get("createdAt")),
        "closedAt": support_stamp(value.get("closedAt")),
        "closedReason": str(value.get("closedReason") or "")[:SUPPORT_REASON_MAX] or None,
        "via": "web" if value.get("via") == "web" else "discord",
        "channelGone": bool(value.get("channelGone")),
        "lastMessageAt": support_stamp(value.get("lastMessageAt")),
        "lastMessageMine": bool(value.get("lastMessageMine")) if value.get("lastMessageMine") is not None else None,
        # One flattened line of whatever was said last, so the inbox can be
        # triaged without opening every ticket. The bot trims it to 160 already.
        "preview": str(value.get("preview") or "")[:160] or None,
    }


ORDER_STAGES = ("new", "review", "proposal", "build", "delivered")
STAGE_KEY_SHAPE = re.compile(r"^[a-z][a-z0-9-]{1,23}$")


def stage_key(value, fallback="new"):
    wanted = str(value or "")[:24]
    return wanted if STAGE_KEY_SHAPE.match(wanted) else fallback


def support_admin_ticket(value):
    row = support_ticket(value)
    if row is None:
        return None
    if value.get("kind") == "order":
        row["kind"] = "order"
        stage = str(value.get("stage") or "new")
        row["stage"] = stage_key(stage)
        row["priority"] = None
        row["priorityLabel"] = None
    else:
        row["kind"] = "support"
    user = value.get("user") or {}
    row["user"] = {
        "id": str(user.get("id") or "")[:20] or None,
        "name": str(user.get("name") or "")[:80] or "unknown",
        "tag": str(user.get("tag") or "")[:120] or None,
    }
    claimed_by = value.get("claimedBy")
    row["claimedBy"] = str(claimed_by)[:20] if claimed_by else None
    row["claimedByName"] = str(value.get("claimedByName") or "")[:80] or None
    last_by = value.get("lastMessageBy")
    row["lastMessageBy"] = str(last_by)[:20] if last_by else None
    return row


ORDER_STAGE_KEYS = ("new", "review", "proposal", "build", "delivered")
ORDER_HOLD_KEYS = ("hold", "awaiting", "declined")
ORDER_STATES = ORDER_STAGE_KEYS + ORDER_HOLD_KEYS
ORDER_PRIORITIES = ("low", "normal", "high", "urgent")
ORDER_SHAREABLE = ("brief", "budget", "deadline", "pages", "refs", "priority", "lead")
ORDER_EDITABLE = {
    "name": 100,
    "brief": 1000,
    "deadline": 150,
    "budget": 150,
    "pages": 300,
    "refs": 300,
}
ORDER_EVENT_KINDS = (
    "announced",
    "noted",
    "unnoted",
    "opened",
    "workflow",
    "visibility",
    "linked",
    "invoiced",
    "binned",
    "restored",
    "claimed",
    "released",
    "stage",
    "held",
    "priority",
    "edited",
    "shared",
    "closed",
    "retired",
    "recoded",
    "tracking-on",
    "tracking-off",
)
ORDER_TRACK_CODE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z \-]{6,30}$")
ORDER_MESSAGES = 50
ORDER_NOTE_MAX = 1200


def order_text(value, limit):
    return str(value or "")[:limit]


def order_count_map(value, keys):
    if not isinstance(value, dict):
        return {}
    out = {}
    for key, count in value.items():
        name = str(key)[:32]
        if keys is not None and name not in keys:
            continue
        if isinstance(count, int) and count >= 0:
            out[name] = count
    return out


def order_stage_list(value):
    out = []
    for entry in (value or [])[:12]:
        if not isinstance(entry, dict):
            continue
        key = str(entry.get("value") or "")[:24]
        if not STAGE_KEY_SHAPE.match(key):
            continue
        out.append({"value": key, "label": order_text(entry.get("label"), 48)})
    return out


def order_row(value):
    if not isinstance(value, dict) or not value.get("id"):
        return None

    stage = str(value.get("stage") or "new")
    priority = str(value.get("priority") or "normal")
    number = value.get("number")
    step = value.get("step")
    steps = value.get("steps")
    user = value.get("user") or {}
    claimed_by = value.get("claimedBy")

    visibility = str(value.get("visibility") or "client")

    return {
        "id": str(value.get("id"))[:20],
        "ref": order_text(value.get("ref"), 24),
        "code": order_id_code(value.get("code")),
        "project": order_id_code(value.get("project"), "PRJ"),
        "order": order_id_code(value.get("order"), "ORD"),
        "request": order_id_code(value.get("request"), "REQ"),
        "legacyRef": order_text(value.get("legacyRef"), 24) or None,
        "fromTicket": order_id_code(value.get("fromTicket"), "TKT"),
        "about": order_id_code(value.get("about"), "PRJ"),
        "visibility": visibility if visibility in ORDER_VISIBILITY else "client",
        "workflow": order_text(value.get("workflow"), 24) or "studio",
        "workflowName": order_text(value.get("workflowName"), 60),
        "kind": "request" if value.get("kind") == "request" else "order",
        "track": order_text(value.get("track"), 24),
        "number": number if isinstance(number, int) else 0,
        "category": order_text(value.get("category"), 32),
        "categoryLabel": order_text(value.get("categoryLabel"), 64),
        "subject": order_text(value.get("subject"), 200),
        "name": order_text(value.get("name"), 200),
        "status": "closed" if value.get("status") == "closed" else "open",
        "stage": stage_key(stage),
        "stageLabel": order_text(value.get("stageLabel"), 48),
        "stageNote": order_text(value.get("stageNote"), 160),
        "priority": priority if priority in ORDER_PRIORITIES else "normal",
        "priorityLabel": order_text(value.get("priorityLabel"), 32),
        "step": step if isinstance(step, int) and step >= 0 else 0,
        "steps": steps if isinstance(steps, int) and steps > 0 else len(ORDER_STAGE_KEYS),
        "held": bool(value.get("held")),
        "finished": bool(value.get("finished")),
        "retired": bool(value.get("retired")),
        "claimed": bool(value.get("claimed")),
        "claimedBy": str(claimed_by)[:20] if claimed_by else None,
        "claimedByName": order_text(value.get("claimedByName"), 80) or None,
        "user": {
            "id": str(user.get("id") or "")[:20] or None,
            "name": order_text(user.get("name"), 80) or "unknown",
            "tag": order_text(user.get("tag"), 120) or None,
        },
        "budget": order_text(value.get("budget"), 200),
        "deadline": order_text(value.get("deadline"), 200),
        "shared": [key for key in (value.get("shared") or []) if key in ORDER_SHAREABLE],
        "trackOff": bool(value.get("trackOff")),
        "createdAt": support_stamp(value.get("createdAt")),
        "updatedAt": support_stamp(value.get("updatedAt")),
        "closedAt": support_stamp(value.get("closedAt")),
        "closedReason": order_text(value.get("closedReason"), 300) or None,
        "channelGone": bool(value.get("channelGone")),
        "lastMessageAt": support_stamp(value.get("lastMessageAt")),
    }


def order_note(value):
    if not isinstance(value, dict):
        return None
    note_id = value.get("id")
    if not isinstance(note_id, int):
        return None
    return {
        "id": note_id,
        "at": support_stamp(value.get("at")),
        "byName": order_text(value.get("byName"), 80) or None,
        "body": order_text(value.get("body"), ORDER_NOTE_MAX),
        "shared": bool(value.get("shared")),
    }


def track_update(value):
    if not isinstance(value, dict):
        return None
    note_id = value.get("id")
    if not isinstance(note_id, int):
        return None
    body = order_text(value.get("body"), ORDER_NOTE_MAX)
    if not body:
        return None
    return {"id": note_id, "at": support_stamp(value.get("at")), "body": body}


def order_event(value):
    if not isinstance(value, dict):
        return None
    kind = str(value.get("kind") or "")
    if kind not in ORDER_EVENT_KINDS:
        return None
    return {
        "kind": kind,
        "at": support_stamp(value.get("at")),
        "byName": order_text(value.get("byName"), 80) or None,
        "from": order_text(value.get("from"), 40) or None,
        "to": order_text(value.get("to"), 40) or None,
        "note": order_text(value.get("note"), 300) or None,
        "open": bool(value.get("open")),
    }


def order_detail(value, notes):
    row = order_row(value)
    if row is None:
        return None
    row["brief"] = order_text(value.get("brief"), 4000)
    row["pages"] = order_text(value.get("pages"), 600)
    row["refs"] = order_text(value.get("refs"), 600)
    row["noteLog"] = (
        [entry for entry in (order_note(item) for item in (value.get("noteLog") or [])[:100]) if entry]
        if notes
        else []
    )
    row["closedVia"] = order_text(value.get("closedVia"), 16) or None
    row["channelDeletedAt"] = support_stamp(value.get("channelDeletedAt"))
    row["events"] = [
        entry
        for entry in (order_event(item) for item in (value.get("events") or [])[:250])
        if entry
    ]
    row["custom"] = order_custom_values(value.get("custom"))
    row["links"] = order_links(value.get("links"))
    return row


FILE_ID = re.compile(r"^[0-9a-f]{32}$")
ORDER_VISIBILITY = ("public", "client", "private")


def client_project(row):
    return {
        "id": row["id"],
        "project": row["project"],
        "order": row["order"],
        "request": row["request"],
        "ref": row["ref"],
        "name": row["name"] or row["subject"],
        "categoryLabel": row["categoryLabel"],
        "status": row["status"],
        "stage": row["stage"],
        "stageLabel": row["stageLabel"],
        "stageNote": row["stageNote"],
        "step": row["step"],
        "steps": row["steps"],
        "held": row["held"],
        "finished": row["finished"],
        "visibility": row["visibility"],
        "createdAt": row["createdAt"],
        "updatedAt": row["updatedAt"],
        "closedAt": row["closedAt"],
        "track": row["track"],
        "trackOff": row["trackOff"],
    }
ORDER_WORKFLOW_ID = re.compile(r"^[a-z][a-z0-9-]{1,23}$")
ORDER_STAGE_KEY = re.compile(r"^[a-z][a-z0-9-]{1,23}$")
ORDER_FIELD_KEY = re.compile(r"^[a-z][a-z0-9-]{1,31}$")
ORDER_FIELD_KINDS = ("text", "long", "number", "date", "choice", "url", "money", "toggle")
ORDER_STAGE_TONES = ("waiting", "reading", "sent", "building", "done")
ORDER_WORKFLOW_STAGES_MAX = 12
ORDER_FIELD_OPTIONS_MAX = 20
ORDER_FIELD_VALUE_MAX = 600
ORDER_CUSTOM_MAX = 40
ORDER_SEARCH_MAX = 40
SEARCH_QUERY_MAX = 64
LOOKUP_QUERY_MAX = 32


def order_id_code(value, prefix=None):
    wanted = str(value or "").strip().upper()
    if not PROJECT_ID.match(wanted):
        return None
    if prefix and not wanted.startswith(prefix + "-"):
        return None
    return wanted


def order_visibility_list(value):
    out = []
    for entry in (value or [])[:6]:
        if not isinstance(entry, dict):
            continue
        key = str(entry.get("value") or "")[:16]
        if key not in ORDER_VISIBILITY:
            continue
        out.append(
            {
                "value": key,
                "label": order_text(entry.get("label"), 40),
                "note": order_text(entry.get("note"), 160),
            }
        )
    return out


def order_workflow_stage(value):
    if not isinstance(value, dict):
        return None
    key = str(value.get("key") or "").strip().lower()
    if not ORDER_STAGE_KEY.match(key):
        return None
    label = order_text(value.get("label"), 48)
    if not label:
        return None
    tone = str(value.get("tone") or "")
    return {
        "key": key,
        "label": label,
        "note": order_text(value.get("note"), 160),
        "tone": tone if tone in ORDER_STAGE_TONES else "reading",
        "terminal": bool(value.get("terminal")),
    }


def order_workflow(value):
    if not isinstance(value, dict):
        return None
    identifier = str(value.get("id") or "").strip().lower()
    if not ORDER_WORKFLOW_ID.match(identifier):
        return None
    stages = [
        entry
        for entry in (
            order_workflow_stage(item)
            for item in (value.get("stages") or [])[:ORDER_WORKFLOW_STAGES_MAX]
        )
        if entry
    ]
    if len(stages) < 2:
        return None
    used = value.get("inUse")
    return {
        "id": identifier,
        "name": order_text(value.get("name"), 60) or identifier,
        "builtin": bool(value.get("builtin")),
        "stages": stages,
        "inUse": used if isinstance(used, int) and used >= 0 else 0,
    }


def order_workflow_list(value):
    return [entry for entry in (order_workflow(item) for item in (value or [])[:24]) if entry]


def order_field(value):
    if not isinstance(value, dict):
        return None
    key = str(value.get("key") or "").strip().lower()
    if not ORDER_FIELD_KEY.match(key):
        return None
    kind = str(value.get("kind") or "")
    place = value.get("place")
    return {
        "key": key,
        "label": order_text(value.get("label"), 60) or key,
        "kind": kind if kind in ORDER_FIELD_KINDS else "text",
        "help": order_text(value.get("help"), 160),
        "options": [
            order_text(option, 48)
            for option in (value.get("options") or [])[:ORDER_FIELD_OPTIONS_MAX]
            if order_text(option, 48)
        ],
        "share": bool(value.get("share")),
        "place": place if isinstance(place, int) and 0 <= place <= 999 else 0,
    }


def order_field_list(value):
    return [entry for entry in (order_field(item) for item in (value or [])[:ORDER_CUSTOM_MAX]) if entry]


def order_custom_values(value):
    if not isinstance(value, dict):
        return {}
    out = {}
    for key, held in list(value.items())[:ORDER_CUSTOM_MAX]:
        name = str(key)[:32]
        if not ORDER_FIELD_KEY.match(name):
            continue
        out[name] = order_text(held, ORDER_FIELD_VALUE_MAX)
    return out


def order_links(value):
    if not isinstance(value, dict):
        return {
            "ticket": None,
            "about": None,
            "project": None,
            "order": None,
            "request": None,
            "legacyRef": None,
            "requests": [],
            "invoices": [],
        }
    requests = []
    for entry in (value.get("requests") or [])[:20]:
        if not isinstance(entry, dict):
            continue
        requests.append(
            {
                "id": str(entry.get("id") or "")[:20],
                "code": order_id_code(entry.get("code")) or order_text(entry.get("code"), 24),
                "name": order_text(entry.get("name"), 120),
                "status": "closed" if entry.get("status") == "closed" else "open",
                "at": support_stamp(entry.get("at")),
            }
        )
    invoices = []
    for entry in (value.get("invoices") or [])[:40]:
        if not isinstance(entry, dict):
            continue
        total = entry.get("total")
        invoices.append(
            {
                "number": order_text(entry.get("number"), 24),
                "total": total if isinstance(total, (int, float)) else None,
                "currency": order_text(entry.get("currency"), 8),
                "at": support_stamp(entry.get("at")),
            }
        )
    return {
        "ticket": order_id_code(value.get("ticket"), "TKT"),
        "about": order_id_code(value.get("about"), "PRJ"),
        "project": order_id_code(value.get("project"), "PRJ"),
        "order": order_id_code(value.get("order"), "ORD"),
        "request": order_id_code(value.get("request"), "REQ"),
        "legacyRef": order_text(value.get("legacyRef"), 24) or None,
        "requests": requests,
        "invoices": invoices,
    }


def order_lookup_card(value):
    if not isinstance(value, dict) or not value.get("id"):
        return None
    stage = str(value.get("stage") or "")
    priority = str(value.get("priority") or "normal")
    visibility = str(value.get("visibility") or "client")
    step = value.get("step")
    steps = value.get("steps")
    return {
        "id": str(value.get("id"))[:20],
        "matched": order_id_code(value.get("matched")),
        "code": order_id_code(value.get("code")),
        "project": order_id_code(value.get("project"), "PRJ"),
        "order": order_id_code(value.get("order"), "ORD"),
        "request": order_id_code(value.get("request"), "REQ"),
        "kind": "request" if value.get("kind") == "request" else "project",
        "name": order_text(value.get("name"), 200),
        "category": order_text(value.get("category"), 64),
        "status": "closed" if value.get("status") == "closed" else "open",
        "visibility": visibility if visibility in ORDER_VISIBILITY else "client",
        "stage": order_text(stage, 24),
        "stageLabel": order_text(value.get("stageLabel"), 48),
        "stageNote": order_text(value.get("stageNote"), 160),
        "held": bool(value.get("held")),
        "finished": bool(value.get("finished")),
        "step": step if isinstance(step, int) and step >= 0 else 0,
        "steps": steps if isinstance(steps, int) and steps > 0 else 1,
        "priority": priority if priority in ORDER_PRIORITIES else "normal",
        "priorityLabel": order_text(value.get("priorityLabel"), 32),
        "lead": order_text(value.get("lead"), 80) or None,
        "client": order_text(value.get("client"), 80) or None,
        "openedAt": support_stamp(value.get("openedAt")),
        "updatedAt": support_stamp(value.get("updatedAt")),
        "closedAt": support_stamp(value.get("closedAt")),
        "retired": bool(value.get("retired")),
    }


def search_row(value, kind):
    row = order_row(value) if kind == "project" else support_admin_ticket(value)
    if row is None:
        return None
    why = str(value.get("why") or "text")
    row["why"] = why if why in ("id", "track", "text") else "text"
    row["on"] = order_id_code(value.get("on"))
    row["entity"] = kind
    return row


def order_stats(value):
    if not isinstance(value, dict):
        return None

    days = []
    for entry in (value.get("days") or [])[:31]:
        if not isinstance(entry, dict):
            continue
        opened = entry.get("opened")
        closed = entry.get("closed")
        days.append(
            {
                "at": support_stamp(entry.get("at")),
                "opened": opened if isinstance(opened, int) and opened >= 0 else 0,
                "closed": closed if isinstance(closed, int) and closed >= 0 else 0,
            }
        )

    leads = {}
    for key, count in (value.get("byLead") or {}).items():
        if isinstance(count, int) and count >= 0:
            leads[str(key)[:80]] = count

    def whole(key):
        found = value.get(key)
        return found if isinstance(found, int) and found >= 0 else 0

    def span(key):
        found = value.get(key)
        return found if isinstance(found, int) and found >= 0 else None

    return {
        "total": whole("total"),
        "open": whole("open"),
        "closed": whole("closed"),
        "delivered": whole("delivered"),
        "declined": whole("declined"),
        "unclaimed": whole("unclaimed"),
        "held": whole("held"),
        "tracked": whole("tracked"),
        "byStage": order_count_map(value.get("byStage"), None),
        "byCategory": order_count_map(value.get("byCategory"), None),
        "byPriority": order_count_map(value.get("byPriority"), set(ORDER_PRIORITIES)),
        "byLead": leads,
        "days": days,
        "medianLifetime": span("medianLifetime"),
        "medianWait": span("medianWait"),
        "stages": order_stage_list(value.get("stages")),
        "stages": order_stage_list(value.get("stages")),
        "stageOrder": [
            key for key in (value.get("stageOrder") or [])[:12] if STAGE_KEY_SHAPE.match(str(key))
        ],
        "categories": {
            str(key)[:32]: order_text(label, 64)
            for key, label in (value.get("categories") or {}).items()
        },
        "priorities": {
            str(key)[:16]: order_text(label, 32)
            for key, label in (value.get("priorities") or {}).items()
            if str(key) in ORDER_PRIORITIES
        },
    }


def track_step(value):
    if not isinstance(value, dict):
        return None
    key = str(value.get("key") or "")[:24]
    if not STAGE_KEY_SHAPE.match(key):
        return None
    return {
        "key": key,
        "label": order_text(value.get("label"), 48),
        "note": order_text(value.get("note"), 160),
        "done": bool(value.get("done")),
        "at": bool(value.get("at")),
    }


def track_event(value):
    if not isinstance(value, dict):
        return None
    kind = str(value.get("kind") or "")
    if kind not in ORDER_EVENT_KINDS:
        return None
    return {
        "kind": kind,
        "at": support_stamp(value.get("at")),
        "from": order_text(value.get("from"), 40) or None,
        "to": order_text(value.get("to"), 40) or None,
        "note": order_text(value.get("note"), 300) or None,
    }


def transcript_row(value):
    """One archived transcript, as the panel's global search shows it."""
    if not isinstance(value, dict):
        return None
    code = str(value.get("code") or "")
    if not TRANSCRIPT_CODE.match(code):
        return None

    return {
        "entity": "transcript",
        "id": str(value.get("id") or "")[:40],
        "code": code,
        "url": str(value.get("url") or "")[:300],
        "kind": str(value.get("kind") or "")[:24],
        "ref": order_text(value.get("ref"), 24),
        "subject": order_text(value.get("subject"), 140),
        "channel": order_text(value.get("channel"), 100),
        "closedAt": int(value.get("closedAt") or 0),
        "messages": int(value.get("messages") or 0),
        "hit": order_text(value.get("hit"), 180),
    }


def track_order(value):
    if not isinstance(value, dict) or not value.get("ref"):
        return None

    stage = str(value.get("stage") or "new")
    step = value.get("step")
    steps = value.get("steps")
    shared = [key for key in (value.get("shared") or []) if key in ORDER_SHAREABLE]

    out = {
        "ref": order_text(value.get("ref"), 24),
        "name": order_text(value.get("name"), 200),
        "category": order_text(value.get("category"), 64),
        "status": "closed" if value.get("status") == "closed" else "open",
        "retired": bool(value.get("retired")),
        "stage": stage_key(stage),
        "stageLabel": order_text(value.get("stageLabel"), 48),
        "stageNote": order_text(value.get("stageNote"), 160),
        "held": bool(value.get("held")),
        "step": step if isinstance(step, int) and step >= 0 else 0,
        "steps": steps if isinstance(steps, int) and steps > 0 else len(ORDER_STAGE_KEYS),
        "track": [
            entry for entry in (track_step(item) for item in (value.get("track") or [])[:8]) if entry
        ],
        "openedAt": support_stamp(value.get("openedAt")),
        "updatedAt": support_stamp(value.get("updatedAt")),
        "closedAt": support_stamp(value.get("closedAt")),
        "timeline": [
            entry for entry in (track_event(item) for item in (value.get("timeline") or [])[:20]) if entry
        ],
        "updates": [
            entry for entry in (track_update(item) for item in (value.get("updates") or [])[:10]) if entry
        ],
        "shared": shared,
    }

    for key in shared:
        text = order_text(value.get(key), 1200)
        if text:
            out[key] = text

    return out


def support_file(value):
    if not isinstance(value, dict) or not value.get("name"):
        return None
    size = value.get("size")
    return {
        "name": str(value.get("name"))[:120],
        "size": size if isinstance(size, int) and size >= 0 else 0,
        "kind": str(value.get("kind") or "")[:60] or None,
    }


def support_message(value):
    if not isinstance(value, dict) or not value.get("id"):
        return None

    files = []
    for entry in (value.get("attachments") or [])[:SUPPORT_ATTACHMENTS_MAX]:
        cleaned = support_file(entry)
        if cleaned:
            files.append(cleaned)

    return {
        "id": str(value.get("id"))[:32],
        "at": support_stamp(value.get("at")),
        "author": str(value.get("author") or "someone")[:80],
        "authorId": str(value.get("authorId") or "")[:20] or None,
        "bot": bool(value.get("bot")),
        "mine": bool(value.get("mine")),
        "kind": "system" if value.get("kind") == "system" else "message",
        "staff": bool(value.get("staff")),
        "body": str(value.get("body") or "")[:SUPPORT_TEXT_MAX],
        "edited": bool(value.get("edited")),
        "attachments": files,
    }


def support_option(value):
    if not isinstance(value, dict) or not value.get("value"):
        return None
    return {
        "value": str(value.get("value"))[:32],
        "label": str(value.get("label") or "")[:120],
        "description": str(value.get("description") or "")[:160] or None,
        "default": bool(value.get("default")),
    }


def support_field(value):
    if not isinstance(value, dict) or not value.get("id"):
        return None
    top = value.get("max")
    return {
        "id": str(value.get("id"))[:32],
        "label": str(value.get("label") or "")[:120],
        "hint": str(value.get("hint") or "")[:160] or None,
        "placeholder": str(value.get("placeholder") or "")[:120] or None,
        "max": top if isinstance(top, int) and 0 < top <= SUPPORT_ANSWER_MAX else SUPPORT_ANSWER_MAX,
        "required": bool(value.get("required")),
        "para": bool(value.get("para")),
    }


def support_category(value):
    if not isinstance(value, dict) or not value.get("key"):
        return None

    fields = [entry for entry in (support_field(f) for f in value.get("fields") or []) if entry]

    urgency = value.get("urgency")
    if isinstance(urgency, list):
        urgency = [entry for entry in (support_option(u) for u in urgency) if entry]
    else:
        urgency = None

    checks = value.get("checks")
    if isinstance(checks, dict):
        options = [entry for entry in (support_option(o) for o in checks.get("options") or []) if entry]
        checks = {
            "label": str(checks.get("label") or "")[:120],
            "hint": str(checks.get("hint") or "")[:160] or None,
            "required": bool(checks.get("required")),
            "options": options,
        } if options else None
    else:
        checks = None

    return {
        "key": str(value.get("key"))[:32],
        "label": str(value.get("label") or "")[:64],
        "short": str(value.get("short") or "")[:32],
        "blurb": str(value.get("blurb") or "")[:160],
        "confidential": bool(value.get("confidential")),
        "fields": fields,
        "urgency": urgency,
        "checks": checks,
        "uploads": bool(value.get("uploads")),
    }


def dm_account(name, kind, title, fields, body="", eyebrow=None):
    try:
        target = users.discord_wants(name, kind)
    except StoreError:
        target = None
    if not target:
        return False
    try:
        answer = bot_fetch(
            "/link/notify",
            {
                "user": target,
                "kind": eyebrow or kind,
                "title": title,
                "fields": list(fields),
                "body": body,
            },
        )
    except (BotDown, Rejected) as failure:
        log.warning("could not DM %s about %s: %s", name, kind, failure)
        return False
    if not answer.get("delivered"):
        log.info("%s has %s notices on, but Discord would not take the DM", name, kind)
    return bool(answer.get("delivered"))


def dm_events(holder, events):
    target = (holder.get("hook") or {}).get("discord")
    if not target:
        return False

    shown = events[:DM_EVENTS_MAX]
    payload = []
    for event in shown:
        kind = event.get("kind") or "used"
        payload.append(
            {
                "kind": kind,
                "label": admin_hooks.EVENT_LABEL.get(kind, kind),
                "summary": admin_hooks.describe(event),
                "at": str(event.get("at") or "")[:40],
            }
        )

    try:
        answer = bot_fetch(
            "/link/events",
            {"user": target, "events": payload, "more": max(0, len(events) - len(shown))},
        )
    except (BotDown, Rejected) as failure:
        log.warning("could not DM %s their API events: %s", holder.get("name"), failure)
        return False
    return bool(answer.get("delivered"))


def dm(name, kind, title, fields, body="", eyebrow=None):
    threading.Thread(
        target=dm_account, args=(name, kind, title, fields, body, eyebrow), daemon=True
    ).start()


BOT_NOTIFY_BODY = 400
REMIND_UNIT_WORDS = {"m": "minute", "h": "hour", "d": "day", "w": "week"}
REMIND_EVENT_KIND = {
    "assigned": "boardAssigned",
    "comment": "boardComment",
    "moved": "boardMoved",
    "done": "boardMoved",
}
REMIND_EVENT_EYEBROW = {
    "assigned": "put on a card",
    "comment": "new comment",
    "moved": "card moved",
    "done": "card finished",
}
REMIND_WHO_WORDS = {
    "assignees": "whoever is on the card",
    "board": "everyone on the board",
    "owners": "the board owners",
}
REMIND_NAMES_SHOWN = 3
REMIND_AIM_WORDS = {
    "due": "a due date coming up",
    "comment": "a comment",
    "moved": "a card moving column",
    "done": "a card finished",
}


def who_words(who):
    if isinstance(who, (list, tuple)):
        names = [str(name) for name in who]
        if not names:
            return "nobody"
        if len(names) > REMIND_NAMES_SHOWN:
            return "%s and %d more" % (
                ", ".join(names[:REMIND_NAMES_SHOWN]),
                len(names) - REMIND_NAMES_SHOWN,
            )
        if len(names) == 1:
            return names[0]
        return "%s and %s" % (", ".join(names[:-1]), names[-1])
    return REMIND_WHO_WORDS.get(who, str(who))


def step_words(step):
    found = REMIND_STEP.match(str(step or ""))
    if not found:
        return step
    count = int(found.group(1))
    word = REMIND_UNIT_WORDS.get(found.group(2), found.group(2))
    return "%d %s%s" % (count, word, "" if count == 1 else "s")


def due_words(job):
    if job.get("late"):
        return "%s overdue" % step_words(job["step"])
    return "due in %s" % step_words(job["step"])


def when_words(value):
    try:
        moment = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return str(value or "—")
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return "<t:%d:f> (<t:%d:R>)" % (int(moment.timestamp()), int(moment.timestamp()))


def board_link(board_id, card_id=None):
    root = ALLOWED_ORIGIN or "https://amitista.com"
    if card_id:
        return "%s/admin#boards/%s/%s" % (root, board_id, card_id)
    return "%s/admin#boards/%s" % (root, board_id)


def remind_fields(job):
    fields = [("Board", job["name"]), ("Column", job["column"] or "—")]
    if job.get("due"):
        fields.append(("Due", when_words(job["due"])))
    others = [name for name in job.get("assignees") or []]
    if others:
        fields.append(("On the card", ", ".join(others[:6])))
    return fields


def remind_send(job):
    heading = "#%s %s" % (job.get("seq"), job["title"]) if job.get("seq") else job["title"]
    for name in job["people"]:
        dm_account(
            name,
            "boardDue",
            "%s — %s" % (heading[:80], due_words(job)),
            remind_fields(job),
            board_link(job["board"], job["card"]),
            eyebrow="board reminder",
        )


class Reminders:

    def __init__(self, tick=None):
        self.tick = int(tick or REMIND_TICK)
        self.stopping = threading.Event()
        self.thread = None

    def start(self):
        if not BOT_URL or not BOT_TOKEN:
            log.info("no bot control address — board reminders will not be sent")
            return
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.stopping.set()

    def sweep(self, moment=None):
        seen = {}

        def ready(name):
            if name not in seen:
                try:
                    seen[name] = bool(users.discord_wants(name, "boardDue", moment))
                except StoreError:
                    seen[name] = False
            return seen[name]

        jobs = boards.due_sweep(ready, moment)
        for job in jobs:
            remind_send(job)
        if jobs:
            log.info(
                "sent %d board reminder%s", len(jobs), "" if len(jobs) == 1 else "s"
            )
        return jobs

    def _loop(self):
        while not self.stopping.wait(self.tick):
            try:
                self.sweep()
            except Exception:
                log.exception("board reminder sweep failed")


reminders = Reminders()


def aimed_apart(setup):
    said = [
        "%s to %s"
        % (
            REMIND_AIM_WORDS.get(thing, thing),
            who_words(remind_who(setup, thing)),
        )
        for thing in REMIND_AIMED
        if thing != "due"
        and thing in setup["events"]
        and remind_who(setup, thing) != remind_who(setup, "due")
    ]
    return [("Sent apart from that", ", ".join(said))] if said else []


def board_event(board_id, card_id, event, actor, detail=None):
    try:
        seen = boards.notice(board_id, card_id)
    except StoreError:
        return
    if not seen or seen.get("archived"):
        return
    setup = seen["remind"]
    if not setup["on"] or event not in setup["events"]:
        return
    kind = REMIND_EVENT_KIND.get(event)
    if not kind:
        return
    crowds = seen.get("crowds")
    crowds = crowds if isinstance(crowds, dict) else {}
    aimed = crowds[event] if event in crowds else (seen.get("people") or [])
    people = [name for name in aimed if name != actor]
    if event == "assigned":
        people = [name for name in (detail or {}).get("added") or [] if name != actor]
    if not people:
        return
    card = seen.get("card") or {}
    heading = "#%s %s" % (card.get("seq"), card.get("title")) if card.get("seq") else card.get("title")
    fields = [("Board", seen["name"]), ("Column", seen.get("column") or "—"), ("By", actor)]
    if card.get("due"):
        fields.append(("Due", when_words(card["due"])))
    body = (detail or {}).get("body") or ""
    threading.Thread(
        target=board_event_send,
        args=(people, kind, event, str(heading or "")[:80], fields, board_id, card_id, body),
        daemon=True,
    ).start()


def board_ask_send(name, record, actor, role):
    dm_account(
        name,
        "boardAssigned",
        str(record.get("name") or "")[:80],
        [("Board", record.get("name") or "—"), ("Asked by", actor), ("As", role or "editor")],
        board_link(record.get("id")),
        eyebrow="asked to join a board",
    )


def board_event_send(people, kind, event, heading, fields, board_id, card_id, body=""):
    line = board_link(board_id, card_id)
    said = " ".join(str(body or "").split())
    room = BOT_NOTIFY_BODY - len(line) - 3
    if said and room > 40:
        line = "%s · %s" % (line, said if len(said) <= room else said[: room - 1] + "…")
    for name in people:
        dm_account(
            name,
            kind,
            heading,
            fields,
            line,
            eyebrow=REMIND_EVENT_EYEBROW.get(event, "board"),
        )


def bot_fetch(path, payload=None, max_bytes=None):
    ceiling = max_bytes or BOT_MAX_BYTES
    if not BOT_URL:
        raise BotDown("not-configured")
    if not BOT_TOKEN:
        raise BotDown("no-token")

    headers = {"Accept": "application/json", "X-Amitista-Botctl": BOT_TOKEN}

    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        BOT_URL + path,
        data=body,
        headers=headers,
        method="POST" if payload is not None else "GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=BOT_TIMEOUT) as response:
            raw = response.read(ceiling + 1)
    except urllib.error.HTTPError as failure:
        if failure.code == 401:
            raise BotDown("refused")
        detail = None
        try:
            detail = json.loads(failure.read(MAX_BODY).decode("utf-8")).get("message")
        except (OSError, ValueError, AttributeError):
            detail = None
        raise Rejected(failure.code if failure.code < 500 else 502,
                       detail or "The bot refused that.")
    except (urllib.error.URLError, OSError, ValueError):
        raise BotDown("unreachable")

    if len(raw) > ceiling:
        raise BotDown("too-large")
    try:
        answer = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise BotDown("malformed")
    if not isinstance(answer, dict):
        raise BotDown("malformed")
    return answer

def shield_fetch(path, payload=None, control=True):
    if not SHIELD_URL:
        raise ShieldDown("not-configured")
    if control and not SHIELD_TOKEN:
        raise ShieldDown("no-token")

    headers = {"Accept": "application/json"}
    if control:
        headers["X-Shield-Control"] = SHIELD_TOKEN

    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        SHIELD_URL + path,
        data=body,
        headers=headers,
        method="POST" if payload is not None else "GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=SHIELD_TIMEOUT) as response:
            raw = response.read(SHIELD_MAX_BYTES + 1)
    except urllib.error.HTTPError as failure:
        if failure.code == 403:
            raise ShieldDown("refused")
        if failure.code == 503:
            raise ShieldDown("unset")
        detail = None
        try:
            detail = json.loads(failure.read(MAX_BODY).decode("utf-8")).get("error")
        except (OSError, ValueError, AttributeError):
            detail = None
        raise Rejected(failure.code if failure.code < 500 else 502,
                       detail or "The evaluator refused that.")
    except (urllib.error.URLError, OSError, ValueError):
        raise ShieldDown("unreachable")

    if len(raw) > SHIELD_MAX_BYTES:
        raise ShieldDown("too-large")
    try:
        answer = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise ShieldDown("malformed")
    if not isinstance(answer, dict):
        raise ShieldDown("malformed")
    return answer

def read_flag_file(limit=SHIELD_HISTORY):
    try:
        with open(SHIELD_FLAGS, encoding="utf-8") as handle:
            lines = handle.readlines()
    except OSError:
        return None

    out = []
    for line in lines[-limit:]:
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if isinstance(entry, dict):
            out.append(entry)
    out.reverse()
    return out

def shield_service():
    snapshot = read_json_file(OVERVIEW_PATH) or {}
    for entry in snapshot.get("services") or []:
        if entry.get("unit") == SHIELD_UNIT:
            return entry
    return None

def shield_state():
    payload = {
        "unit": SHIELD_UNIT,
        "service": shield_service(),
        "configured": bool(SHIELD_URL and SHIELD_TOKEN),
        "modes": list(SHIELD_MODES),
    }

    try:
        state = shield_fetch("/admin/state?limit=%d" % SHIELD_HISTORY)
        payload["reachable"] = True
    except ShieldDown as down:
        state = None
        payload["reachable"] = False
        payload["reason"] = down.reason
        payload["message"] = SHIELD_REASONS.get(down.reason, "The evaluator could not be read.")

    history = None
    source = None
    if isinstance(state, dict) and isinstance(state.get("history"), list):
        history = state.pop("history")
        source = "service"
    else:
        if isinstance(state, dict):
            state.pop("history", None)
        history = read_flag_file()
        if history is not None:
            source = "file"

    payload["state"] = state
    payload["history"] = history or []
    payload["historySource"] = source
    payload["flagFile"] = SHIELD_FLAGS
    return payload

class Handler(BaseHTTPRequestHandler):
    server_version = "amitista-admin-api"
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

    def query(self, name, limit=64):
        parts = self.path.split("?", 1)
        if len(parts) < 2:
            return ""
        found = urllib.parse.parse_qs(parts[1], keep_blank_values=True).get(name)
        return (found[0] if found else "")[:limit].strip()

    def reply(self, status, payload=None, cookie=None, extra=()):
        if cookie is None:
            cookie = self.renewal_cookie()
        body = b"" if payload is None else json.dumps(payload).encode("utf-8")
        self.send_response(status)
        if body:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        for spare in extra:
            if spare:
                self.send_header("Set-Cookie", spare)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def send_blob(self, kind, data):
        cookie = self.renewal_cookie()
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "private, max-age=600")
        self.send_header("X-Content-Type-Options", "nosniff")
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)

    def send_file(self, entry, data, download=False):
        name = str(entry.get("name") or "attachment")
        plain = "".join(
            letter for letter in name if 32 <= ord(letter) < 127 and letter not in '"\\'
        ).strip()
        if not plain:
            plain = "attachment%s" % (entry.get("ext") or "")
        self.send_response(200)
        self.send_header("Content-Type", entry.get("type") or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header(
            "Content-Disposition",
            "%s; filename=\"%s\"; filename*=UTF-8''%s"
            % (
                "attachment" if download else "inline",
                plain,
                urllib.parse.quote(name, safe=""),
            ),
        )
        self.send_header("Cache-Control", "private, max-age=600")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; sandbox")
        cookie = self.renewal_cookie()
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)

    def send_transcript_file(self, name, data, kind="text/html; charset=utf-8"):
        """Hands back a transcript the browser saves rather than renders.

        A transcript is other people's words in a document served from this
        origin, so it must never be rendered here: `attachment` plus a sandbox
        CSP keeps it out of the site's origin even if a browser ignores the
        disposition.
        """
        safe = name if TRANSCRIPT_FILE.match(name or "") else "transcript.html"
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Content-Disposition", 'attachment; filename="%s"' % safe)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "sandbox; default-src 'none'; img-src data: https:; style-src 'unsafe-inline'")
        self.end_headers()
        self.wfile.write(data)

    def session_cookie(self, token, max_age):
        parts = [
            "%s=%s" % (COOKIE_NAME, token),
            "Path=/",
            "HttpOnly",
            "SameSite=Strict",
            "Max-Age=%d" % max_age,
        ]
        if not INSECURE_COOKIE:
            parts.append("Secure")
        return "; ".join(parts)

    def gate_cookie(self, token, max_age):
        parts = [
            "%s=%s" % (GATE_COOKIE, token),
            "Path=/",
            "HttpOnly",
            "SameSite=Strict",
            "Max-Age=%d" % max_age,
        ]
        if not INSECURE_COOKIE:
            parts.append("Secure")
        return "; ".join(parts)

    def pending_cookie(self, token, max_age):
        parts = [
            "%s=%s" % (PENDING_COOKIE, token),
            "Path=/",
            "HttpOnly",
            "SameSite=Strict",
            "Max-Age=%d" % max_age,
        ]
        if not INSECURE_COOKIE:
            parts.append("Secure")
        return "; ".join(parts)

    def land(self, target, cookies=()):
        body = (
            "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
            "<meta http-equiv=\"refresh\" content=\"0;url=%s\">"
            "<title>Signing in</title></head><body>Signing in…</body></html>" % target
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        for cookie in cookies:
            if cookie:
                self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def bounce(self, location):
        self.send_response(302)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def renewal_cookie(self):
        session = getattr(self, "held_session", None)
        if session is None:
            return None
        now = time.time()
        if now - float(session.get("iat") or 0) < RENEW_AFTER:
            return None
        started = float(session.get("sat") or now)
        expires = token_expiry(now, started)
        if expires <= now:
            return None
        token = issue_token(session["u"], session["v"], now, started)
        return self.session_cookie(token, int(expires - now))

    def current_session(self):
        header = self.headers.get("Cookie")
        if not header:
            return None
        try:
            jar = SimpleCookie()
            jar.load(header)
        except Exception:
            return None
        morsel = jar.get(COOKIE_NAME)
        if morsel is None:
            return None
        session = read_token(morsel.value, int(time.time()))
        if session is not None:
            self.held_session = session
        return session

    def current_gate(self):
        header = self.headers.get("Cookie")
        if not header:
            return None
        try:
            jar = SimpleCookie()
            jar.load(header)
        except Exception:
            return None
        morsel = jar.get(GATE_COOKIE)
        if morsel is None:
            return None
        return read_gate(morsel.value, int(time.time()), self.client_ip())

    def require_gate(self):
        if not gate_live():
            return None

        pass_held = self.current_gate()
        if pass_held is None:
            raise Rejected(403, GATE_STALE, needs="gate")

        if not gate_passes.charge(pass_held["id"]):
            log.warning("a front-door pass ran out of sign-ins at %s", self.client_ip())
            raise Rejected(403, GATE_SPENT, needs="gate")

        return pass_held

    def require_session(self):
        session = self.current_session()
        if session is None:
            raise Rejected(401, "Not signed in.")
        return session

    def require(self, permission):
        session = self.require_session()
        if permission not in (session["record"].get("permissions") or []):
            raise Rejected(403, "You do not have access to that.")
        return session

    def require_private(self, group):
        """A group handed out by account name rather than by permission.

        Deliberately not a permission: an owner resolves to every permission at
        read time, so any permission invented for this would be held by every
        owner the moment it existed. The account list is the one thing an owner
        cannot grant themselves from inside the panel.
        """
        session = self.require_session()
        if group not in private_groups_for(session["record"]["name"]):
            raise Rejected(403, "You do not have access to that.")
        return session

    def allowed(self, permission):
        session = self.current_session()
        if session is None:
            return False
        return permission in (session["record"].get("permissions") or [])

    def is_owner_session(self, session):
        return is_owner(session["record"])

    def not_over_an_owner(self, session, name):
        record = users.find(name)
        if record is None:
            raise Rejected(404, "No such account.")
        if is_owner(record) and not self.is_owner_session(session):
            raise Rejected(403, "Only an owner can do that to another owner.")
        return record

    def account_names(self):
        if not self.allowed("users.read"):
            return []
        return [entry.get("name") for entry in users.listing() if entry.get("name")]

    def known_account(self, name):
        cleaned = str(name or "").strip()[:USER_LIMIT]
        if not cleaned or users.find(cleaned) is None:
            raise Rejected(400, "There is no account by that name.")
        return cleaned

    def guard_stale_password(self, route):
        if route in PASSWORD_CHANGE_ROUTES:
            return
        session = self.current_session()
        if session is not None and session["record"].get("mustChange"):
            raise Rejected(403, "Change your password before using the rest of the panel.")

    def check_origin(self):
        if not ALLOWED_ORIGIN:
            return
        origin = self.headers.get("Origin")
        if origin != ALLOWED_ORIGIN:
            raise Rejected(403, "Blocked.")

    def read_body(self):
        kind = (self.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if kind != "application/json":
            raise Rejected(415, "Send JSON.")

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise Rejected(400, "Malformed request.")
        if length <= 0:
            raise Rejected(400, "Empty request.")
        route = self.route()
        if route.startswith("/projects/files/"):
            ceiling = PROJECT_FILE_BODY_MAX
        elif route == "/boards/cards/file":
            ceiling = BOARD_FILE_BODY_MAX
        elif route.startswith("/boards/art"):
            ceiling = BOARD_ART_BODY_MAX
        elif route == "/account/picture":
            ceiling = PICTURE_BODY_MAX
        elif route.startswith("/boards"):
            ceiling = BOARD_BODY_MAX
        else:
            ceiling = MAX_BODY
        if length > ceiling:
            raise Rejected(413, "Request too large.")

        try:
            raw = self.rfile.read(length)
        except socket.timeout:
            raise Rejected(408, "The request took too long.")
        self.body_read = True
        if len(raw) != length:
            raise Rejected(400, "Malformed request.")

        text = UPLOADED_BYTES.sub('"data:"', raw.decode("utf-8", "replace"))
        verdict = firewall_screen(self, text)
        if verdict is not None and verdict["action"] == "blocked":
            raise Rejected(403, "Refused by the website firewall.")

        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise Rejected(400, "Malformed request.")
        if not isinstance(data, dict):
            raise Rejected(400, "Malformed request.")
        return data

    def guard_firewall(self):
        verdict = firewall_screen(self)
        if verdict is not None and verdict["action"] == "blocked":
            raise Rejected(403, "Refused by the website firewall.")

    def do_GET(self):
        self.held_session = None
        try:
            self.guard_firewall()
            self.handle_get()
        except Rejected as rejected:
            self.reply(rejected.status, rejected.payload())
        except VaultError as failure:
            log.error("vault unreachable on GET: %s", failure.message)
            self.reply(failure.status, {"message": "The panel cannot reach its vault."})
        except StoreError as failure:
            self.reply(failure.status, {"message": failure.message})
        except socket.timeout:
            self.close_connection = True
        except Exception:
            log.exception("unhandled error on GET")
            self.reply(500, {"message": "Something went wrong at our end."})

    def do_POST(self):
        self.held_session = None
        self.body_read = False
        try:
            pending = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            pending = -1
        try:
            self.guard_firewall()
            self.handle_post()
        except Rejected as rejected:
            self.reply(rejected.status, rejected.payload())
        except VaultError as failure:
            log.error("vault unreachable on POST: %s", failure.message)
            self.reply(failure.status, {"message": "The panel cannot reach its vault."})
        except StoreError as failure:
            self.reply(failure.status, {"message": failure.message})
        except socket.timeout:
            self.close_connection = True
        except Exception:
            log.exception("unhandled error on POST")
            self.reply(500, {"message": "Something went wrong at our end."})
        finally:
            if pending != 0 and not self.body_read:
                self.close_connection = True

    def c2c_reply(self, path):
        """Answers with the exchange bot's payload, or with why it could not.

        A 503 with a reason, never an empty list: "no entries" and "the bot is
        not running" look identical in a table, and the second one is the
        answer someone opening a log page at 3am actually needs.
        """
        try:
            return enchange_fetch(path)
        except EnchangeDown as failure:
            raise Rejected(503, ENCHANGE_REASONS.get(failure.reason, "The exchange bot is unavailable."))

    def handle_c2c_logs(self):
        wanted = []

        limit = self.query("limit", 8)
        try:
            limit = max(1, min(int(limit or ENCHANGE_LIMIT), ENCHANGE_LIMIT_MAX))
        except ValueError:
            limit = ENCHANGE_LIMIT
        wanted.append(("limit", limit))

        for name, size in (("before", 20), ("since", 20)):
            raw = self.query(name, size)
            if raw:
                try:
                    wanted.append((name, int(raw)))
                except ValueError:
                    raise Rejected(400, "That is not a valid %s." % name)

        for name, size in (("channel", 40), ("event", 40)):
            raw = self.query(name, size)
            if raw:
                wanted.append((name, raw))

        severity = self.query("severity", 16)
        if severity:
            if severity not in ENCHANGE_SEVERITIES:
                raise Rejected(400, "That is not a severity.")
            wanted.append(("severity", severity))

        search = self.query("q", 120).strip()
        if search:
            wanted.append(("q", search))

        self.reply(200, self.c2c_reply("/logs?" + urllib.parse.urlencode(wanted)))

    # Access changes. Each one is written down and answered; none of them is
    # carried out here. What comes back says what was asked for, not what
    # happened — the panel is careful to word it that way too, because a change
    # that GitHub goes on to refuse would otherwise have been reported as done.

    def handle_github_avatar(self):
        """Re-serve a GitHub avatar from this origin.

        The panel cannot hot-link avatars.githubusercontent.com: the site is
        served under img-src 'self' data:, so the browser refuses the image.
        Same answer as the Discord artwork above — fetch it here, cache it, and
        hand it back same-origin.
        """
        self.require_private("github")
        url = github_avatar_for(self.query("login", 64))
        if url is None:
            raise Rejected(404, "Not found.")

        fetched = artwork.blob(url)
        if fetched is None:
            raise Rejected(502, "GitHub would not hand over that image.")

        self.send_blob(fetched[0], fetched[1])

    def handle_github_review(self):
        """What a model makes of one pull request.

        A GET rather than a POST, and deliberately: asking costs a model call
        the first time and nothing afterwards, and nothing about the pull
        request changes either way. Nothing here writes to GitHub.

        The diff is read out of the snapshot the deploy writes, because this
        service holds no GitHub token and could not fetch one. So a pull request
        the collector has not looked into deeply cannot be reviewed, and says so
        rather than being reviewed on its file names alone.
        """
        session = self.require_private("github")
        repo = self.query("repo", 100)
        raw = self.query("number", 12)
        if not raw.isdigit():
            raise Rejected(400, "No pull request was named.")
        number = int(raw)

        pull = github_pull_for(repo, number)
        if pull is None:
            raise Rejected(404, "That pull request is not in the snapshot.")

        held = admin_review.cached(repo, number, pull.get("sha"))
        if held is not None:
            self.reply(200, {"review": held, "fresh": False})
            return

        try:
            answer = admin_review.review(pull, repo)
        except admin_review.ReviewError as refusal:
            raise Rejected(refusal.status, refusal.message)

        admin_review.remember(repo, number, answer)
        audit.record(
            session["record"]["name"],
            "github.reviewed",
            {"repo": repo, "number": number, "findings": len(answer["findings"])},
            self.client_ip(),
        )
        self.reply(200, {"review": answer, "fresh": True})

    def handle_github_grant(self):
        session = self.require_private("github")
        data = self.read_body()
        answer = github_queue(
            session,
            {
                "action": "grant",
                "repo": data.get("repo"),
                "login": str(data.get("login") or "").strip(),
                "permission": data.get("permission"),
            },
        )
        audit.record(
            session["record"]["name"],
            "github.accessQueued",
            {
                "repo": data.get("repo"),
                "login": answer["queued"].get("login"),
                "permission": answer["queued"].get("permission"),
            },
            self.client_ip(),
        )
        self.reply(200, answer)

    def handle_github_revoke(self):
        session = self.require_private("github")
        data = self.read_body()
        answer = github_queue(
            session,
            {
                "action": "revoke",
                "repo": data.get("repo"),
                "login": str(data.get("login") or "").strip(),
            },
        )
        audit.record(
            session["record"]["name"],
            "github.accessRevokeQueued",
            {"repo": data.get("repo"), "login": answer["queued"].get("login")},
            self.client_ip(),
        )
        self.reply(200, answer)

    def handle_github_uninvite(self):
        session = self.require_private("github")
        data = self.read_body()
        invite = data.get("invite")
        if not isinstance(invite, int) or isinstance(invite, bool):
            raise Rejected(400, "No invitation was named.")
        answer = github_queue(
            session,
            {"action": "uninvite", "repo": data.get("repo"), "invite": invite},
        )
        audit.record(
            session["record"]["name"],
            "github.inviteCancelQueued",
            {"repo": data.get("repo"), "invite": invite},
            self.client_ip(),
        )
        self.reply(200, answer)

    def handle_transcripts(self):
        self.require("transcripts.read")
        wanted = []

        search = self.query("q", TRANSCRIPT_QUERY_MAX).strip()
        if search:
            wanted.append(("q", search))

        kind = self.query("kind", 24)
        if kind:
            if kind not in TRANSCRIPT_KINDS:
                raise Rejected(400, "That is not a transcript type.")
            wanted.append(("kind", kind))

        for name in ("from", "to", "offset"):
            raw = self.query(name, 20)
            if raw:
                try:
                    wanted.append((name, max(0, int(raw))))
                except ValueError:
                    raise Rejected(400, "That is not a valid %s." % name)

        limit = self.query("limit", 8)
        try:
            limit = max(1, min(int(limit or TRANSCRIPT_LIMIT), TRANSCRIPT_LIMIT_MAX))
        except ValueError:
            limit = TRANSCRIPT_LIMIT
        wanted.append(("limit", limit))

        self.reply(200, self.bot_or_refuse("/transcripts?" + urllib.parse.urlencode(wanted)))

    def handle_transcript_entry(self):
        self.require("transcripts.read")
        wanted = self.query("id", 40)
        if not TRANSCRIPT_ID.match(wanted):
            raise Rejected(400, "That is not a transcript.")
        self.reply(
            200,
            self.bot_or_refuse(
                "/transcripts/entry?id=%s" % urllib.parse.quote(wanted),
                max_bytes=TRANSCRIPT_BYTES,
            ),
        )

    def handle_transcript_summary(self):
        self.require("transcripts.read")
        self.reply(200, self.bot_or_refuse("/transcripts/summary"))

    def handle_transcript_delete(self):
        session = self.require("transcripts.manage")
        name = session["record"]["name"]
        data = self.read_body()

        wanted = str(data.get("id") or "")[:40]
        if not TRANSCRIPT_ID.match(wanted):
            raise Rejected(400, "That is not a transcript.")

        answer = self.bot_or_refuse("/transcripts/delete", {"id": wanted, "actor": name})
        audit.record(name, "transcript.deleted", {"code": answer.get("code")}, self.client_ip())
        self.reply(200, answer)

    def handle_c2c_summary(self):
        since = self.query("since", 20)
        path = "/logs/summary"
        if since:
            try:
                path += "?since=%d" % int(since)
            except ValueError:
                raise Rejected(400, "That is not a valid since.")
        self.reply(200, self.c2c_reply(path))

    def session_payload(self, session):
        record = session["record"]
        return {
            "signedIn": True,
            "user": record["name"],
            "role": record.get("role"),
            "permissions": record.get("permissions") or [],
            "viewerPermissions": sorted(ROLES.get("viewer", ())),
            "private": private_groups_for(record["name"]),
            "mustChange": bool(record.get("mustChange")),
            "expires": session["exp"],
        }

    def handle_get(self):
        route = self.route()

        if route == "/api/maintenance":
            self.reply(200, {"pages": maintenance.feed(), "generated": stamp()})
            return

        if route == "/api/track":
            self.handle_track()
            return

        if route == "/api/transcript":
            self.handle_transcript()
            return

        if route == "/api/transcript/file":
            self.handle_transcript_file()
            return

        self.guard_stale_password(route)

        if route == "/healthz":
            self.reply(200, {"ok": True, "configured": configured()})
            return

        if route == "/login/google/start":
            self.handle_google_start()
            return

        if route == "/login/google/callback":
            self.handle_google_callback()
            return

        if route == "/session":
            session = self.current_session()
            if session is None:
                self.reply(
                    200,
                    {
                        "signedIn": False,
                        "configured": configured(),
                        "google": google_ready(),
                        "gate": gate_live(),
                        "gated": gate_live() and self.current_gate() is not None,
                    },
                )
            else:
                self.reply(200, self.session_payload(session))
            return

        if route == "/overview":
            session = self.require("overview.read")
            self.reply(200, build_overview(session["record"].get("permissions") or []))
            return

        if route == "/developer":
            self.require("developer.read")
            self.reply(200, build_developer())
            return

        if route == "/github/repositories":
            self.require_private("github")
            self.reply(200, build_github())
            return

        if route == "/github/avatar":
            self.handle_github_avatar()
            return

        if route == "/github/review":
            self.handle_github_review()
            return

        if route == "/transcripts":
            self.handle_transcripts()
            return

        if route == "/transcripts/entry":
            self.handle_transcript_entry()
            return

        if route == "/transcripts/summary":
            self.handle_transcript_summary()
            return

        if route == "/c2c/logs":
            self.require("c2c.logs")
            self.handle_c2c_logs()
            return

        if route == "/c2c/logs/summary":
            self.require("c2c.logs")
            self.handle_c2c_summary()
            return

        if route == "/account":
            session = self.require_session()
            record = session["record"]
            started = float(session.get("sat") or session.get("iat") or time.time())
            self.reply(
                200,
                {
                    "name": record["name"],
                    "role": record.get("role"),
                    "permissions": record.get("permissions") or [],
                    "created": record.get("created"),
                    "createdBy": record.get("createdBy"),
                    "updated": record.get("updated"),
                    "updatedBy": record.get("updatedBy"),
                    "lastSignIn": record.get("lastSignIn"),
                    "lastIp": record.get("lastIp"),
                    "note": record.get("note") or "",
                    "expires": record.get("expires"),
                    "expired": is_expired(record),
                    "disabled": bool(record.get("disabled")),
                    "passwordChanged": password_changed_at(record["name"], record),
                    "mustChange": bool(record.get("mustChange")),
                    "protected": bool(record.get("protected")),
                    "sessionExpires": session["exp"],
                    "session": {
                        "started": started,
                        "expires": session["exp"],
                        "ceiling": session_ceiling(started),
                        "idleMinutes": IDLE_MINUTES,
                        "hours": SESSION_HOURS,
                        "renewAfter": RENEW_AFTER,
                        "ip": self.client_ip(),
                        "now": time.time(),
                    },
                    "keys": own_key_summary(record["name"]) if self.allowed("api.keys") else None,
                    "twoFactor": users.totp_state(record["name"]),
                    "google": users.google_state(record["name"]),
                    "googleAuth": google_ready(),
                    "discord": users.discord_state(record["name"]),
                    "picture": users.picture_state(record["name"]),
                },
            )
            return

        if route == "/account/discord/image":
            self.handle_discord_image()
            return

        if route == "/account/picture":
            self.handle_picture_read()
            return

        if route == "/users/picture":
            self.handle_users_picture_read()
            return

        if route == "/users/discord/image":
            self.handle_users_discord_image()
            return

        if route == "/account/support":
            self.handle_support()
            return

        if route == "/account/support/ticket":
            self.handle_support_ticket()
            return

        if route == "/support/queue":
            self.handle_support_queue()
            return

        if route == "/support/queue/ticket":
            self.handle_support_queue_ticket()
            return

        if route == "/orders":
            self.handle_orders()
            return

        if route == "/orders/stats":
            self.handle_orders_stats()
            return

        if route == "/orders/order":
            self.handle_orders_order()
            return

        if route == "/orders/thread":
            self.handle_orders_thread()
            return

        if route == "/orders/lookup":
            self.handle_orders_lookup()
            return

        if route == "/orders/pulse":
            self.handle_orders_pulse()
            return

        if route == "/orders/workflows":
            self.handle_orders_workflows()
            return

        if route == "/orders/fields":
            self.handle_orders_fields()
            return

        if route == "/search":
            self.handle_search()
            return

        if route == "/projects/files":
            self.handle_project_files()
            return

        if route == "/projects/file":
            self.handle_project_file()
            return

        if route == "/projects/ledger":
            self.handle_project_ledger()
            return

        if route == "/projects/mine":
            self.handle_projects_mine()
            return

        if route == "/projects/mine/files":
            self.handle_projects_mine_files()
            return

        if route == "/account/activity":
            session = self.require_session()
            name = session["record"]["name"]
            entries = own_activity(name)
            mine = [entry for entry in entries if not entry["byOther"]]
            signins = [entry for entry in mine if entry["action"] in OWN_SUCCESSES]
            refused = [entry for entry in mine if entry["action"] in OWN_REFUSALS]
            self.reply(
                200,
                {
                    "entries": entries,
                    "signIns": signins[:OWN_SIGNINS_SHOWN],
                    "refused": refused[:OWN_SIGNINS_SHOWN],
                    "refusedTotal": len(refused),
                    "previousSignIn": signins[1]["at"] if len(signins) > 1 else None,
                    "kept": AUDIT_KEEP,
                    "generated": stamp(),
                },
            )
            return

        if route == "/users":
            session = self.require("users.read")
            table = users.roles()
            self.reply(
                200,
                {
                    "users": users.listing(),
                    "roles": sorted(table),
                    "permissions": list(PERMISSIONS),
                    "rolePermissions": {name: sorted(granted) for name, granted in table.items()},
                    "builtinRoles": sorted(DEFAULT_ROLES),
                    "lockedRoles": list(LOCKED_ROLES),
                    "canManageOwners": self.is_owner_session(session),
                },
            )
            return

        if route == "/boards":
            self.handle_boards()
            return

        if route == "/boards/board":
            self.handle_board()
            return

        if route == "/boards/mine":
            self.handle_boards_mine()
            return

        if route == "/boards/pulse":
            self.handle_boards_pulse()
            return

        if route == "/boards/art":
            self.handle_board_art_read()
            return

        if route == "/boards/cards/file":
            self.handle_card_file_read()
            return

        if route == "/boards/face":
            self.handle_board_face()
            return

        if route == "/pages":
            self.require("pages.manage")
            history = [
                entry
                for entry in audit.tail(400)
                if str(entry.get("action") or "").startswith("page.")
            ][:40]
            self.reply(200, {"pages": maintenance.listing(), "history": history})
            return

        if route == "/firewall":
            self.handle_firewall()
            return

        if route == "/keys":
            session = self.require("api.keys")
            holder = session["record"]["name"]
            self.reply(
                200,
                {
                    "keys": tokens.listing(read_usage(), holder, True),
                    "owner": holder,
                    "scopes": list(SCOPES),
                    "gateway": gateway_facts(),
                },
            )
            return

        if route == "/key-events":
            session = self.require("api.keys")
            holder = session["record"]["name"]
            wide = self.allowed("api.read")
            calls = read_key_events(holder, wide)
            changes = key_change_events(holder)
            merged = sorted(
                calls + changes, key=lambda entry: entry.get("at") or "", reverse=True
            )
            self.reply(
                200,
                {
                    "events": merged[:EVENTS_SHOWN],
                    "keys": [
                        {"id": key["id"], "name": key["name"], "prefix": key["prefix"]}
                        for key in tokens.listing(None, holder, True)
                    ],
                    "webhook": users.hook_state(holder),
                    "embed": users.embed_state(holder),
                    "discord": users.discord_state(holder),
                    "hooks": hook_facts(),
                    "wide": wide,
                    "generated": stamp(),
                },
            )
            return

        if route == "/tokens":
            self.require("api.read")
            self.reply(
                200,
                {
                    "tokens": tokens.listing(read_usage()),
                    "scopes": list(SCOPES),
                    "gateway": gateway_facts(),
                },
            )
            return

        if route == "/api-stats":
            self.require("api.read")
            snapshot = read_json_file(OVERVIEW_PATH) or {}
            self.reply(
                200,
                {
                    "api": snapshot.get("api"),
                    "generated": snapshot.get("generated"),
                    "tokens": tokens.listing(read_usage()),
                    "scopes": list(SCOPES),
                    "gateway": gateway_facts(),
                    "services": (snapshot.get("services") or []),
                    "accounts": self.account_names(),
                },
            )
            return

        if route == "/traffic":
            self.require("overview.read")
            self.reply(200, build_traffic(self.query("window", 8)))
            return

        if route == "/analytics":
            self.require("overview.read")
            self.reply(200, build_analytics(self.query("window", 8)))
            return

        if route == "/key-usage":
            identifier = self.query("id", 64)
            if not identifier:
                raise Rejected(400, "Say which key.")
            if self.allowed("api.read"):
                self.require_session()
            else:
                session = self.require("api.keys")
                holder = session["record"]["name"]
                mine = {entry["id"] for entry in tokens.listing(None, holder, True)}
                if identifier not in mine:
                    raise Rejected(404, "No such key.")
            self.reply(200, key_usage_series(identifier, self.query("window", 8)))
            return

        if route == "/shield":
            self.require("shield.read")
            self.reply(200, shield_state())
            return

        if route == "/shield/installs":
            self.require("shield.read")
            self.reply(200, shield_installs())
            return

        if route == "/bot":
            self.handle_bot_health()
            return

        if route == "/bot/queues":
            self.handle_bot_queues()
            return

        if route == "/bot/actions":
            self.handle_bot_actions()
            return

        if route == "/bot/guild":
            self.handle_bot_guild()
            return

        if route == "/bot/members":
            self.handle_bot_members()
            return

        if route == "/bot/levels":
            self.handle_bot_levels()
            return

        if route == "/bot/giveaways":
            self.handle_bot_giveaways()
            return

        if route == "/bot/community":
            self.handle_bot_community()
            return

        if route == "/bot/setup":
            self.handle_bot_setup()
            return

        if route == "/brands":
            self.require("shield.read")
            self.reply(
                200,
                {
                    "brands": brands.listing(),
                    "facts": brand_facts(),
                    "canManage": self.allowed("shield.manage"),
                },
            )
            return

        if route == "/security":
            self.require("security.read")
            self.reply(
                200,
                {
                    "lockouts": lockout.snapshot(),
                    "accounts": account_failures(),
                    "audit": audit.tail(60),
                },
            )
            return

        if route == "/security-report":
            self.require("security.read")
            payload = read_security_report()
            payload["findings"] = findings.listing()
            payload["verdicts"] = list(FINDING_VERDICTS)
            self.reply(200, payload)
            return

        raise Rejected(404, "Not found.")

    def handle_post(self):
        route = self.route()
        self.guard_stale_password(route)

        if route == "/logout":
            self.check_origin()
            session = self.current_session()
            if session is not None:
                name = session["record"]["name"]
                try:
                    users.bump_version(name)
                except StoreError:
                    pass
                log.info("%s signed out from %s", name, self.client_ip())
            self.reply(204, None, self.session_cookie("", 0))
            return

        if route == "/gate":
            self.handle_gate()
            return

        if route == "/login":
            self.handle_login()
            return

        if route == "/login/google/verify":
            self.handle_google_verify()
            return

        self.check_origin()

        if route == "/account/google/link":
            self.handle_google_link()
            return

        if route == "/account/google/unlink":
            self.handle_google_unlink()
            return

        if route == "/users/google/clear":
            self.handle_google_clear()
            return

        if route == "/account/discord/start":
            self.handle_discord_start()
            return

        if route == "/account/discord/check":
            self.handle_discord_check()
            return

        if route == "/account/discord/profile":
            self.handle_discord_profile()
            return

        if route == "/account/discord/nickname":
            self.handle_discord_nickname()
            return

        if route == "/account/discord/prefs":
            self.handle_discord_prefs()
            return

        if route == "/account/discord/cancel":
            self.handle_discord_cancel()
            return

        if route == "/account/discord/unlink":
            self.handle_discord_unlink()
            return

        if route == "/projects/mine/hide":
            self.handle_projects_mine_hide()
            return

        if route == "/account/picture":
            self.handle_picture_set()
            return

        if route == "/account/picture/delete":
            self.handle_picture_delete()
            return

        if route == "/users/picture/clear":
            self.handle_picture_clear()
            return

        if route == "/users/discord/clear":
            self.handle_discord_clear()
            return

        if route == "/users/discord/profile":
            self.handle_users_discord_profile()
            return

        if route == "/transcripts/delete":
            self.handle_transcript_delete()
            return

        if route == "/roles/save":
            self.handle_role_save()
            return

        if route == "/roles/delete":
            self.handle_role_delete()
            return

        if route == "/account/support/open":
            self.handle_support_open()
            return

        if route == "/account/support/reply":
            self.handle_support_reply()
            return

        if route == "/support/queue/reply":
            self.handle_support_queue_reply()
            return

        if route == "/support/queue/claim":
            self.handle_support_queue_claim()
            return

        if route == "/support/queue/close":
            self.handle_support_queue_close()
            return

        if route == "/support/queue/status":
            self.handle_support_queue_status()
            return

        if route == "/support/queue/priority":
            self.handle_support_queue_priority()
            return

        if route == "/orders/reply":
            self.handle_orders_reply()
            return

        if route == "/orders/claim":
            self.handle_orders_claim()
            return

        if route == "/orders/close":
            self.handle_orders_close()
            return

        if route == "/orders/stage":
            self.handle_orders_stage()
            return

        if route == "/orders/priority":
            self.handle_orders_priority()
            return

        if route == "/orders/edit":
            self.handle_orders_edit()
            return

        if route == "/orders/share":
            self.handle_orders_share()
            return

        if route == "/orders/note":
            self.handle_orders_note()
            return

        if route == "/orders/note/remove":
            self.handle_orders_note_remove()
            return

        if route == "/orders/note/share":
            self.handle_orders_note_share()
            return

        if route == "/orders/tracking":
            self.handle_orders_tracking()
            return

        if route == "/orders/recode":
            self.handle_orders_recode()
            return

        if route == "/orders/visibility":
            self.handle_orders_visibility()
            return

        if route == "/orders/custom":
            self.handle_orders_custom()
            return

        if route == "/orders/link":
            self.handle_orders_link()
            return

        if route == "/orders/workflow":
            self.handle_orders_workflow_set()
            return

        if route == "/orders/workflow/save":
            self.handle_orders_workflow_save()
            return

        if route == "/orders/workflow/remove":
            self.handle_orders_workflow_remove()
            return

        if route == "/orders/field/save":
            self.handle_orders_field_save()
            return

        if route == "/orders/field/remove":
            self.handle_orders_field_remove()
            return

        if route == "/projects/files/add":
            self.handle_project_files_add()
            return

        if route == "/projects/files/version":
            self.handle_project_files_version()
            return

        if route == "/projects/files/edit":
            self.handle_project_files_edit()
            return

        if route == "/projects/files/remove":
            self.handle_project_files_remove()
            return

        if route == "/account/support/close":
            self.handle_support_close()
            return

        if route == "/account/password":
            self.handle_own_password()
            return

        if route == "/sessions/revoke-all":
            self.handle_revoke_all()
            return

        if route == "/account/2fa/start":
            self.handle_totp_start()
            return

        if route == "/account/2fa/confirm":
            self.handle_totp_confirm()
            return

        if route == "/account/2fa/disable":
            self.handle_totp_disable()
            return

        if route == "/users/2fa/clear":
            self.handle_totp_clear()
            return

        if route.startswith("/shield/"):
            action = route.split("/", 2)[2]
            handlers = {
                "mode": self.handle_shield_mode,
                "policy": self.handle_shield_policy,
                "clear": self.handle_shield_clear,
                "selftest": self.handle_shield_selftest,
                "evaluate": self.handle_shield_evaluate,
            }
            handler = handlers.get(action)
            if handler is not None:
                handler()
                return

        if route.startswith("/bot/"):
            action = route.split("/", 2)[2]
            handlers = {
                "presence": self.handle_bot_presence,
                "queues/close": self.handle_bot_queue_close,
                "queues/delete": self.handle_bot_queue_delete,
                "moderation": self.handle_bot_moderation,
                "restart": self.handle_bot_restart,
                "levels": self.handle_bot_level_save,
                "giveaways/end": self.handle_bot_giveaway_end,
                "setup": self.handle_bot_setup_save,
            }
            handler = handlers.get(action)
            if handler is not None:
                handler()
                return

        if route == "/brands/save":
            self.handle_brand_save()
            return

        if route == "/brands/delete":
            self.handle_brand_delete()
            return

        if route == "/brands/publish":
            self.handle_brand_publish()
            return

        if route == "/boards/create":
            self.handle_board_create()
            return

        if route == "/boards/update":
            self.handle_board_update()
            return

        if route == "/boards/delete":
            self.handle_board_delete()
            return

        if route == "/boards/remind/test":
            self.handle_board_remind_test()
            return

        if route == "/boards/cards/file":
            self.handle_card_file_set()
            return

        if route == "/boards/cards/file/delete":
            self.handle_card_file_delete()
            return

        if route == "/boards/art":
            self.handle_board_art_set()
            return

        if route == "/github/access":
            self.handle_github_grant()
            return

        if route == "/github/access/remove":
            self.handle_github_revoke()
            return

        if route == "/github/access/invite/cancel":
            self.handle_github_uninvite()
            return

        if route == "/boards/art/focus":
            self.handle_board_art_place()
            return

        if route == "/boards/art/delete":
            self.handle_board_art_delete()
            return

        if route == "/boards/members":
            self.handle_board_member()
            return

        if route == "/boards/members/ask":
            self.handle_board_member_ask()
            return

        if route == "/boards/members/ask/cancel":
            self.handle_board_member_ask_cancel()
            return

        if route == "/boards/members/ask/reply":
            self.handle_board_member_ask_reply()
            return

        if route == "/boards/members/remove":
            self.handle_board_member_remove()
            return

        if route == "/boards/lists/create":
            self.handle_board_list_create()
            return

        if route == "/boards/lists/update":
            self.handle_board_list_update()
            return

        if route == "/boards/lists/delete":
            self.handle_board_list_delete()
            return

        if route == "/boards/lists/move":
            self.handle_board_list_move()
            return

        if route == "/boards/lists/sort":
            self.handle_board_list_sort()
            return

        if route == "/boards/cards/create":
            self.handle_board_card_create()
            return

        if route == "/boards/cards/update":
            self.handle_board_card_update()
            return

        if route == "/boards/cards/duplicate":
            self.handle_board_card_duplicate()
            return

        if route == "/boards/cards/move":
            self.handle_board_card_move()
            return

        if route == "/boards/cards/delete":
            self.handle_board_card_delete()
            return

        if route == "/boards/cards/undelete":
            self.handle_board_card_undelete()
            return

        if route == "/boards/cards/bulk":
            self.handle_board_cards_bulk()
            return

        if route == "/boards/cards/transfer":
            self.handle_board_card_transfer()
            return

        if route == "/boards/cards/comment":
            self.handle_board_comment()
            return

        if route == "/boards/cards/comment/delete":
            self.handle_board_comment_delete()
            return

        if route == "/boards/cards/check":
            self.handle_board_check()
            return

        if route == "/boards/cards/check/update":
            self.handle_board_check_update()
            return

        if route == "/boards/cards/check/delete":
            self.handle_board_check_delete()
            return

        if route == "/boards/cards/link":
            self.handle_board_link()
            return

        if route == "/boards/cards/link/delete":
            self.handle_board_link_delete()
            return

        if route == "/boards/labels":
            self.handle_board_label()
            return

        if route == "/boards/labels/delete":
            self.handle_board_label_delete()
            return

        if route == "/pages/cover":
            self.handle_page_cover()
            return

        if route == "/pages/reopen":
            self.handle_page_reopen()
            return

        if route == "/firewall/rule":
            self.handle_firewall_save()
            return

        if route == "/firewall/rule/delete":
            self.handle_firewall_delete()
            return

        if route == "/firewall/settings":
            self.handle_firewall_settings()
            return

        if route == "/firewall/restage":
            self.handle_firewall_restage()
            return

        if route == "/findings/save":
            self.handle_finding_save()
            return

        if route == "/findings/delete":
            self.handle_finding_delete()
            return

        if route == "/users/create":
            self.handle_user_create()
            return

        if route == "/users/update":
            self.handle_user_update()
            return

        if route == "/users/password":
            self.handle_user_password()
            return

        if route == "/users/sign-out":
            self.handle_user_sign_out()
            return

        if route == "/users/delete":
            self.handle_user_delete()
            return

        if route == "/keys/embed":
            self.handle_embed_save()
            return

        if route == "/keys/embed/test":
            self.handle_embed_test()
            return

        if route == "/keys/embed/delete":
            self.handle_embed_delete()
            return

        if route == "/keys/embed/preview":
            self.handle_embed_preview()
            return

        if route == "/keys/webhook":
            self.handle_hook_save()
            return

        if route == "/keys/webhook/test":
            self.handle_hook_test()
            return

        if route == "/keys/webhook/delete":
            self.handle_hook_delete()
            return

        if route.startswith("/keys/") or route.startswith("/tokens/"):
            manage = route.startswith("/tokens/")
            action = route.split("/", 2)[2]
            handlers = {
                "create": self.handle_key_create,
                "update": self.handle_key_update,
                "rotate": self.handle_key_rotate,
                "revoke": self.handle_key_revoke,
                "restore": self.handle_key_restore,
                "delete": self.handle_key_delete,
            }
            handler = handlers.get(action)
            if handler is not None:
                handler(manage)
                return

        raise Rejected(404, "Not found.")

    def handle_gate(self):
        self.check_origin()

        if not gate_live():
            self.reply(200, {"gate": False, "passed": True})
            return

        ip = self.client_ip()
        if gate_limiter.check(ip):
            log.warning("front-door check from %s — rate limited", ip)
            raise Rejected(429, "Too many verification attempts. Try again later.")

        data = self.read_body()

        try:
            admin_turnstile.verify(data.get(admin_turnstile.FIELD), ip, admin_turnstile.ACTION)
        except admin_turnstile.VerificationError as failure:
            raise Rejected(failure.status, failure.message, needs="gate")

        log.info("front-door check passed from %s", ip)
        self.reply(
            200,
            {"gate": True, "passed": True},
            self.gate_cookie(issue_gate(time.time(), ip), GATE_SECONDS),
        )

    def handle_login(self):
        self.check_origin()
        pass_held = self.require_gate()

        if not configured():
            raise Rejected(503, "The admin panel is not set up yet.")

        ip = self.client_ip()

        if limiter.check(ip):
            log.warning("failed sign-in from %s — rate limited", ip)
            raise Rejected(429, "Too many attempts. Try again later.")

        held = lockout.blocked(ip)
        if held:
            log.warning("failed sign-in from %s — still locked out", ip)
            raise Rejected(429, "Too many failed attempts. Try again in %d minutes." % max(1, held // 60))

        data = self.read_body()
        user = str(data.get("username") or "").strip()
        password = str(data.get("password") or "")

        if not user or not password:
            raise Rejected(400, "Enter a username and a password.")
        if len(user) > USER_LIMIT or len(password) > PASSWORD_LIMIT:
            raise Rejected(400, "Those credentials are not right.")

        # Sign-in matches the stored name without caring about case: someone whose
        # account is "Blxr" gets in typing "blxr" or "BLXR". Everything after this
        # line uses the *stored* spelling, so the session, the audit line and the
        # alert all read the same as the account itself. The account lockout key
        # was already lowercased, so a case-flipping attacker never had a fresh
        # allowance of attempts. Creation refuses a name that differs from an
        # existing one only by case, which is what keeps this lookup unambiguous.
        canonical = users.canonical(user)
        if canonical is not None:
            user = canonical

        account_key = user.lower()
        held = account_lockout.blocked(account_key)
        if held:
            log.warning("failed sign-in for %r from %s — that account is locked out", user[:32], ip)
            raise Rejected(429, "Too many failed attempts for that account. Try again in %d minutes." % max(1, held // 60))

        try:
            record = users.find(user)
        except StoreError:
            record = None

        stored = account_password(user)
        matched = verify_password(stored if stored else DECOY_HASH, password)
        barred = bool(record) and (record.get("disabled") or is_expired(record))
        allowed = bool(record) and not barred and matched

        if matched and barred:
            log.warning(
                "refused sign-in for %r from %s — account is %s",
                user[:32],
                ip,
                "expired" if is_expired(record) else "disabled",
            )
            audit.record(user[:32], "signin.barred", None, ip)
            raise Rejected(403, "That account is not active. Ask whoever runs the panel.")

        if not allowed:
            locked = lockout.failed(ip)
            account_locked = account_lockout.failed(account_key)
            log.warning(
                "failed sign-in for %r from %s%s%s",
                user[:32],
                ip,
                " — locked out" if locked else "",
                " — account locked out" if account_locked else "",
            )
            audit.record(user[:32], "signin.failed", None, ip)
            if account_locked and not locked:
                alert(
                    "lockout",
                    "Admin account locked out",
                    [
                        ("Account", user[:32]),
                        ("After", "%d failed attempts" % ACCOUNT_LOCKOUT_AFTER),
                        ("Locked for", "%d minutes" % max(1, LOCKOUT_SECONDS // 60)),
                        ("Last address", ip),
                        ("When", stamp()),
                    ],
                )
            if locked:
                alert(
                    "lockout",
                    "Admin sign-in locked out",
                    [
                        ("Address", ip),
                        ("After", "%d failed attempts" % LOCKOUT_AFTER),
                        ("Locked for", "%d minutes" % max(1, LOCKOUT_SECONDS // 60)),
                        ("When", stamp()),
                    ],
                )
            raise Rejected(401, "Those credentials are not right.")

        state = (record.get("totp") or {}) if record else {}
        if state.get("confirmed"):
            code = str(data.get("code") or "").strip()[:64]
            if not code:
                self.reply(401, {"message": "Enter the code from your authenticator app.", "needs": "code"})
                return

            outcome = users.verify_totp(user, code)
            if outcome != "code" and outcome != "recovery":
                locked = lockout.failed(ip)
                account_locked = account_lockout.failed(account_key)
                log.warning(
                    "failed sign-in for %r from %s — wrong second step%s%s",
                    user[:32],
                    ip,
                    " — locked out" if locked else "",
                    " — account locked out" if account_locked else "",
                )
                audit.record(user, "signin.badCode", None, ip)
                raise Rejected(401, "That code is not right.")

            if outcome == "recovery":
                left = users.totp_state(user).get("recovery", 0)
                log.warning("%s signed in from %s with a recovery code — %d left", user, ip, left)
                audit.record(user, "signin.recovery", {"remaining": left}, ip)
                alert(
                    "lockout",
                    "Admin signed in with a recovery code",
                    [("User", user), ("Codes left", str(left)), ("Address", ip), ("When", stamp())],
                )

        lockout.passed(ip)
        account_lockout.passed(account_key)
        users.note_sign_in(user, ip)
        audit.record(user, "signin.ok", None, ip)
        log.info("signed in as %s from %s", user, ip)
        alert(
            "signin",
            "Admin signed in",
            [("User", user), ("Role", record.get("role") or "—"), ("Address", ip), ("When", stamp())],
        )

        if pass_held is not None:
            gate_passes.spend(pass_held["id"])

        fresh = users.find(user) or record
        token = issue_token(user, fresh.get("tokenVersion") or 1, time.time())
        self.reply(
            200,
            {
                "signedIn": True,
                "user": user,
                "role": fresh.get("role"),
                "permissions": fresh.get("permissions") or [],
                "viewerPermissions": sorted(ROLES.get("viewer", ())),
                "private": private_groups_for(user),
                "mustChange": bool(fresh.get("mustChange")),
            },
            self.session_cookie(token, SESSION_HOURS * 3600),
        )

    def finish_sign_in(self, user, ip, method):
        known = users.find(user)
        seen_before = (known or {}).get("lastIp")
        lockout.passed(ip)
        account_lockout.passed(user.lower())
        users.note_sign_in(user, ip)
        if seen_before and seen_before != ip:
            dm(
                user,
                "signin",
                "Signed in from a new address",
                [("Address", ip), ("Method", method), ("Last seen at", seen_before), ("When", stamp())],
                "If this was not you, change your password in the panel now.",
            )
        audit.record(user, "signin.ok", {"method": method} if method != "password" else None, ip)
        log.info("signed in as %s from %s via %s", user, ip, method)
        fresh = users.find(user)
        if fresh is None:
            raise Rejected(403, "That account is not active. Ask whoever runs the panel.")
        alert(
            "signin",
            "Admin signed in",
            [
                ("User", user),
                ("Role", fresh.get("role") or "—"),
                ("Method", method),
                ("Address", ip),
                ("When", stamp()),
            ],
        )
        return fresh, issue_token(user, fresh.get("tokenVersion") or 1, time.time())

    def google_refused(self, ip, slug, reason, user=None):
        locked = lockout.failed(ip)
        log.warning(
            "failed Google sign-in%s from %s — %s%s",
            (" for %r" % user[:32]) if user else "",
            ip,
            reason,
            " — locked out" if locked else "",
        )
        audit.record(user or "—", "signin.googleRefused", {"reason": reason}, ip)
        self.land("/admin?signin=%s" % slug, [self.pending_cookie("", 0)])

    def handle_google_start(self):
        if not google_ready():
            raise Rejected(404, "Not found.")

        if gate_live() and self.current_gate() is None:
            self.land("/admin?signin=gate")
            return

        ip = self.client_ip()
        if limiter.check(ip):
            log.warning("failed sign-in from %s — rate limited", ip)
            raise Rejected(429, "Too many attempts. Try again later.")
        held = lockout.blocked(ip)
        if held:
            log.warning("failed sign-in from %s — still locked out", ip)
            raise Rejected(429, "Too many failed attempts. Try again in %d minutes." % max(1, held // 60))

        try:
            target = admin_google.start(ip)
        except admin_google.GoogleError as error:
            raise Rejected(error.status, error.message)
        self.bounce(target)

    def handle_google_callback(self):
        if not google_ready():
            raise Rejected(404, "Not found.")

        ip = self.client_ip()
        if limiter.check(ip):
            log.warning("failed sign-in from %s — rate limited", ip)
            self.land("/admin?signin=busy", [self.pending_cookie("", 0)])
            return
        held = lockout.blocked(ip)
        if held:
            log.warning("failed sign-in from %s — still locked out", ip)
            self.land("/admin?signin=locked", [self.pending_cookie("", 0)])
            return

        query = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
        if query.get("error"):
            self.land("/admin?signin=cancelled", [self.pending_cookie("", 0)])
            return

        code = (query.get("code") or [""])[0]
        state = (query.get("state") or [""])[0]

        try:
            identity = admin_google.finish(code, state, ip)
        except admin_google.GoogleError as error:
            self.google_refused(ip, "failed", error.message)
            return

        try:
            record, matched = users.find_by_google(identity["sub"], identity["email"])
        except StoreError:
            record, matched = None, None

        if record is None:
            self.google_refused(ip, "unlinked", "no account is linked to %s" % identity["email"][:64])
            alert(
                "lockout",
                "Google sign-in refused",
                [
                    ("Google account", identity["email"][:64]),
                    ("Why", "no panel account is linked to it"),
                    ("Address", ip),
                    ("When", stamp()),
                ],
            )
            return

        user = record["name"]
        if record.get("disabled") or is_expired(record):
            self.google_refused(ip, "barred", "account is %s" % ("expired" if is_expired(record) else "disabled"), user)
            return

        account_key = user.lower()
        held = account_lockout.blocked(account_key)
        if held:
            self.google_refused(ip, "locked", "that account is locked out", user)
            return

        try:
            users.note_google(user, identity["sub"])
        except StoreError as failure:
            self.google_refused(ip, "failed", failure.message[:80], user)
            return

        if matched == "email":
            log.info("pinned Google id for %s on first sign-in from %s", user, ip)
            audit.record(user, "google.confirmed", {"email": identity["email"][:64]}, ip)

        if (record.get("totp") or {}).get("confirmed"):
            fresh = users.find(user) or record
            pending_token = issue_pending(user, fresh.get("tokenVersion") or 1, time.time(), identity["sub"])
            log.info("google sign-in for %s from %s — second step required", user, ip)
            self.land("/admin?signin=code", [self.pending_cookie(pending_token, PENDING_SECONDS)])
            return

        fresh, token = self.finish_sign_in(user, ip, "google")
        self.land(
            "/admin?signin=ok",
            [self.session_cookie(token, SESSION_HOURS * 3600), self.pending_cookie("", 0)],
        )

    def handle_google_verify(self):
        if not google_ready():
            raise Rejected(404, "Not found.")
        self.check_origin()

        ip = self.client_ip()
        if limiter.check(ip):
            raise Rejected(429, "Too many attempts. Try again later.")
        held = lockout.blocked(ip)
        if held:
            raise Rejected(429, "Too many failed attempts. Try again in %d minutes." % max(1, held // 60))

        header = self.headers.get("Cookie")
        jar = SimpleCookie()
        if header:
            try:
                jar.load(header)
            except Exception:
                jar = SimpleCookie()
        morsel = jar.get(PENDING_COOKIE)
        step = read_pending(morsel.value, int(time.time())) if morsel is not None else None
        if step is None:
            raise Rejected(401, "That sign-in has expired. Start again.")

        user = step["record"]["name"]
        account_key = user.lower()
        held = account_lockout.blocked(account_key)
        if held:
            raise Rejected(429, "Too many failed attempts for that account. Try again in %d minutes." % max(1, held // 60))

        data = self.read_body()
        code = str(data.get("code") or "").strip()[:64]
        if not code:
            raise Rejected(400, "Enter the code from your authenticator app.")

        outcome = users.verify_totp(user, code)
        if outcome not in ("code", "recovery"):
            locked = lockout.failed(ip)
            account_locked = account_lockout.failed(account_key)
            log.warning(
                "failed sign-in for %r from %s — wrong second step after Google%s%s",
                user[:32],
                ip,
                " — locked out" if locked else "",
                " — account locked out" if account_locked else "",
            )
            audit.record(user, "signin.badCode", {"method": "google"}, ip)
            raise Rejected(401, "That code is not right.")

        if outcome == "recovery":
            left = users.totp_state(user).get("recovery", 0)
            log.warning("%s signed in from %s with a recovery code — %d left", user, ip, left)
            audit.record(user, "signin.recovery", {"remaining": left, "method": "google"}, ip)
            alert(
                "lockout",
                "Admin signed in with a recovery code",
                [("User", user), ("Codes left", str(left)), ("Address", ip), ("When", stamp())],
            )

        fresh, token = self.finish_sign_in(user, ip, "google")
        self.reply(
            200,
            {
                "signedIn": True,
                "user": user,
                "role": fresh.get("role"),
                "permissions": fresh.get("permissions") or [],
                "viewerPermissions": sorted(ROLES.get("viewer", ())),
                "private": private_groups_for(user),
                "mustChange": bool(fresh.get("mustChange")),
            },
            self.session_cookie(token, SESSION_HOURS * 3600),
            [self.pending_cookie("", 0)],
        )

    def handle_google_link(self):
        session = self.require_session()
        record = session["record"]
        data = self.read_body()

        password = str(data.get("password") or "")
        if not password:
            raise Rejected(400, "Enter your password to confirm.")
        if not verify_password(record.get("password") or DECOY_HASH, password):
            ip = self.client_ip()
            log.warning("failed Google link for %s from %s — wrong password", record["name"], ip)
            audit.record(record["name"], "password.failed", {"for": "google.link"}, ip)
            raise Rejected(403, "That password is not right.")

        address = users.link_google(record["name"], data.get("email"))
        audit.record(record["name"], "google.linked", {"email": address}, self.client_ip())
        log.info("%s linked Google sign-in to %s", record["name"], address)
        alert(
            "signin",
            "Google sign-in linked",
            [("User", record["name"]), ("Google account", address), ("Address", self.client_ip()), ("When", stamp())],
        )
        self.reply(200, {"google": users.google_state(record["name"])})

    def handle_google_unlink(self):
        session = self.require_session()
        record = session["record"]
        data = self.read_body()

        password = str(data.get("password") or "")
        if not password:
            raise Rejected(400, "Enter your password to confirm.")
        if not verify_password(record.get("password") or DECOY_HASH, password):
            ip = self.client_ip()
            log.warning("failed Google unlink for %s from %s — wrong password", record["name"], ip)
            audit.record(record["name"], "password.failed", {"for": "google.unlink"}, ip)
            raise Rejected(403, "That password is not right.")

        if not users.unlink_google(record["name"]):
            raise Rejected(400, "There is no Google account linked.")
        audit.record(record["name"], "google.unlinked", None, self.client_ip())
        log.info("%s unlinked Google sign-in", record["name"])
        self.reply(200, {"google": users.google_state(record["name"])})

    # Roles are stored, not hard-coded, since 17 Aug 2026 — an owner can retune
    # admin/dev/viewer and invent new ones. Two rules are enforced in the store
    # rather than here, because they are the ones that would lock the panel out
    # of its own administration: the owner role always resolves to every
    # permission, and saving a role rewrites the permission list of everyone who
    # holds it, so a change takes effect on their next request instead of
    # waiting for each account to be edited by hand.
    #
    # Deleting a built-in role does not delete it: it drops the stored override
    # and puts the shipped default back. Only invented roles are really removed,
    # and only when nobody holds one.

    def handle_role_save(self):
        session = self.require("users.manage")
        if not self.is_owner_session(session):
            raise Rejected(403, "Only an owner can change what a role may do.")

        data = self.read_body()
        wanted = data.get("permissions")
        if not isinstance(wanted, list):
            raise Rejected(400, "Send the permissions as a list.")

        actor = session["record"]["name"]
        try:
            name, granted = users.save_role(data.get("role"), wanted, actor)
        except StoreError as failure:
            raise Rejected(failure.status, failure.message)

        audit.record(actor, "role.saved", {"role": name, "permissions": granted}, self.client_ip())
        log.warning("%s set the %s role to %s", actor, name, ", ".join(granted))
        self.reply(200, {"role": name, "roles": {key: sorted(value) for key, value in users.roles().items()}})

    def handle_role_delete(self):
        session = self.require("users.manage")
        if not self.is_owner_session(session):
            raise Rejected(403, "Only an owner can change what a role may do.")

        data = self.read_body()
        actor = session["record"]["name"]
        try:
            name, builtin = users.delete_role(data.get("role"), actor)
        except StoreError as failure:
            raise Rejected(failure.status, failure.message)

        audit.record(actor, "role.reset" if builtin else "role.deleted", {"role": name}, self.client_ip())
        log.warning("%s %s the %s role", actor, "reset" if builtin else "removed", name)
        self.reply(200, {"role": name, "builtin": builtin, "roles": {key: sorted(value) for key, value in users.roles().items()}})

    def handle_google_clear(self):
        session = self.require("users.manage")
        data = self.read_body()
        name = str(data.get("name") or "").strip()
        if not name:
            raise Rejected(400, "Pick an account.")

        target = users.find(name)
        if target is None:
            raise Rejected(404, "No such account.")
        if is_owner(target) and not self.is_owner_session(session):
            raise Rejected(403, "Only an owner can change another owner.")

        if not users.unlink_google(name):
            raise Rejected(400, "That account has no Google sign-in linked.")
        actor = session["record"]["name"]
        audit.record(actor, "google.cleared", {"account": name}, self.client_ip())
        log.warning("%s cleared Google sign-in for %s", actor, name)
        self.reply(200, {"google": users.google_state(name)})

    def link_password(self, record, password, purpose):
        if not password:
            raise Rejected(400, "Enter your password to confirm.")
        if not verify_password(record.get("password") or DECOY_HASH, password):
            ip = self.client_ip()
            log.warning("failed %s for %s from %s — wrong password", purpose, record["name"], ip)
            audit.record(record["name"], "password.failed", {"for": purpose}, ip)
            raise Rejected(403, "That password is not right.")

    def link_close(self, code, linked, reason=""):
        try:
            bot_fetch("/link/close", {"code": code, "ok": bool(linked), "reason": reason})
        except (BotDown, Rejected):
            log.warning("could not tell the bot a link code was finished")

    def handle_discord_start(self):
        session = self.require_session()
        record = session["record"]
        name = record["name"]
        data = self.read_body()

        self.link_password(record, str(data.get("password") or ""), "discord.link")

        if users.discord_state(name).get("linked"):
            raise Rejected(400, "This account already has a Discord account linked.")

        previous = link_codes.drop(name)
        if previous:
            self.link_close(previous["code"], False, "You asked the panel for a new code.")

        entry = link_codes.start(name)
        try:
            answer = self.bot_or_refuse(
                "/link/open",
                {
                    "code": entry["code"],
                    "account": name,
                    "expires": int(entry["expires"] * 1000),
                    "actor": name,
                },
            )
        except Rejected:
            link_codes.drop(name)
            raise

        audit.record(name, "discord.codeIssued", None, self.client_ip())
        log.info("%s asked for a Discord link code", name)
        self.reply(
            200,
            {
                "status": "waiting",
                "code": spaced_code(entry["code"]),
                "expires": entry["expires"],
                "seconds": DISCORD_LINK_SECONDS,
                "bot": bot_card(answer.get("bot")),
            },
        )

    def handle_discord_check(self):
        session = self.require_session()
        name = session["record"]["name"]
        entry = link_codes.current(name)

        if entry is None:
            self.reply(200, {"status": "idle", "discord": users.discord_state(name)})
            return

        answer = self.bot_or_refuse("/link?code=%s" % urllib.parse.quote(entry["code"]))
        status = str(answer.get("status") or "missing")

        if status == "missing":
            link_codes.drop(name)
            self.reply(200, {"status": "expired", "discord": users.discord_state(name)})
            return

        if answer.get("account") != name:
            link_codes.drop(name)
            log.error("the bot holds link code %s for another account", entry["code"][:2])
            raise Rejected(409, "That code is not yours. Start again.")

        waiting = {
            "status": status,
            "code": spaced_code(entry["code"]),
            "expires": entry["expires"],
            "bot": bot_card(answer.get("bot")),
            "user": seen_user(answer.get("user")),
            "discord": users.discord_state(name),
        }

        if status != "confirmed":
            self.reply(200, waiting)
            return

        identity = answer.get("user")
        if not isinstance(identity, dict) or not identity.get("id"):
            link_codes.drop(name)
            self.link_close(entry["code"], False, "The panel did not recognise that account.")
            raise Rejected(502, "The bot confirmed a code without an account. Start again.")

        try:
            linked = users.link_discord(name, identity)
        except StoreError as failure:
            link_codes.drop(name)
            self.link_close(entry["code"], False, failure.message)
            raise Rejected(failure.status, failure.message)

        link_codes.drop(name)
        self.link_close(entry["code"], True)
        audit.record(name, "discord.linked", {"discord": linked.get("tag")}, self.client_ip())
        log.info("%s linked Discord account %s", name, linked.get("tag"))
        alert(
            "signin",
            "Discord account linked",
            [
                ("User", name),
                ("Discord", "%s (%s)" % (linked.get("tag"), linked.get("id"))),
                ("Address", self.client_ip()),
                ("When", stamp()),
            ],
        )
        self.reply(200, {"status": "linked", "discord": linked})

    def linked_or_refuse(self, name):
        state = users.discord_state(name)
        if not state.get("linked"):
            raise Rejected(400, "Link a Discord account first.")
        return state

    # The two handlers below are the users.read view of somebody else's Discord
    # link. They deliberately mirror the /account/discord/* pair rather than
    # sharing code with it: those run as "whoever is signed in", these run as
    # "an operator looking at another account", and collapsing the two would
    # make it far too easy to lose the permission check on one path. Nothing
    # here can change anything — no nickname, no unlink — it is read-only.
    #
    # The artwork cache is keyed by panel account name, which is why the image
    # handler can hand back a portrait it never fetched itself: the profile
    # call above remembers the URLs first, and a cold image request falls back
    # to fetching the profile again.

    def users_discord_or_refuse(self, wanted):
        name = str(wanted or "").strip()
        if not name:
            raise Rejected(400, "Name that account.")
        state = users.discord_state(name)
        if not state.get("linked"):
            raise Rejected(400, "That account has no Discord linked.")
        return name, state

    def handle_users_discord_profile(self):
        self.require("users.read")
        data = self.read_body()
        name, state = self.users_discord_or_refuse(data.get("name"))
        payload = {"discord": state, "profile": None, "botDown": None}

        try:
            answer = self.bot_or_refuse("/link/profile?user=%s" % urllib.parse.quote(state["id"]))
        except Rejected as refusal:
            payload["botDown"] = refusal.message
            self.reply(200, payload)
            return

        profile = discord_profile(answer)
        artwork.remember(name, {kind: url for kind, url in profile["art"].items() if url})
        payload["profile"] = dict(
            profile, art={kind: bool(url) for kind, url in profile["art"].items()}
        )
        self.reply(200, payload)

    def handle_users_discord_image(self):
        self.require("users.read")
        name, state = self.users_discord_or_refuse(self.query("name", 64))
        kind = self.query("kind", 16) or "avatar"
        if kind not in DISCORD_ART or kind == "bot":
            raise Rejected(404, "Not found.")

        url = artwork.url(name, kind)
        if url is None:
            answer = self.bot_or_refuse("/link/profile?user=%s" % urllib.parse.quote(state["id"]))
            profile = discord_profile(answer)
            artwork.remember(name, {key: value for key, value in profile["art"].items() if value})
            url = profile["art"].get(kind)
        if url is None:
            raise Rejected(404, "Not found.")

        fetched = artwork.blob(url)
        if fetched is None:
            raise Rejected(502, "Discord would not hand over that image.")

        self.send_blob(fetched[0], fetched[1])

    def handle_discord_profile(self):
        session = self.require_session()
        name = session["record"]["name"]
        state = users.discord_state(name)
        payload = {"discord": state, "bot": None, "profile": None, "botDown": None}

        if not state.get("linked"):
            try:
                payload["bot"] = bot_card(self.bot_or_refuse("/link/bot").get("bot"))
            except Rejected as refusal:
                payload["botDown"] = refusal.message
            self.reply(200, payload)
            return

        try:
            answer = self.bot_or_refuse("/link/profile?user=%s" % urllib.parse.quote(state["id"]))
        except Rejected as refusal:
            payload["botDown"] = refusal.message
            self.reply(200, payload)
            return

        profile = discord_profile(answer)
        artwork.remember(name, {kind: url for kind, url in profile["art"].items() if url})
        payload["profile"] = dict(profile, art={kind: bool(url) for kind, url in profile["art"].items()})
        payload["bot"] = bot_card(answer.get("bot"))

        identity = answer.get("user")
        if isinstance(identity, dict):
            try:
                payload["discord"] = users.refresh_discord(name, identity)
            except StoreError as failure:
                log.warning("could not refresh the Discord snapshot for %s: %s", name, failure.message)

        self.reply(200, payload)

    def handle_discord_image(self):
        session = self.require_session()
        name = session["record"]["name"]
        kind = self.query("kind", 16) or "avatar"
        if kind not in DISCORD_ART:
            raise Rejected(404, "Not found.")

        if kind == "bot":
            url = artwork.url(DISCORD_ART_BOT, kind)
            if url is None:
                card = self.bot_or_refuse("/link/bot").get("bot") or {}
                url = discord_art(card.get("avatar"))
                if url:
                    artwork.remember(DISCORD_ART_BOT, {"bot": url})
            if url is None:
                raise Rejected(404, "Not found.")
            fetched = artwork.blob(url)
            if fetched is None:
                raise Rejected(502, "Discord would not hand over that image.")
            self.send_blob(fetched[0], fetched[1])
            return

        state = self.linked_or_refuse(name)
        url = artwork.url(name, kind)
        if url is None:
            answer = self.bot_or_refuse("/link/profile?user=%s" % urllib.parse.quote(state["id"]))
            profile = discord_profile(answer)
            artwork.remember(name, {key: value for key, value in profile["art"].items() if value})
            url = profile["art"].get(kind)
        if url is None:
            raise Rejected(404, "Not found.")

        fetched = artwork.blob(url)
        if fetched is None:
            raise Rejected(502, "Discord would not hand over that image.")

        self.send_blob(fetched[0], fetched[1])

    def handle_discord_nickname(self):
        session = self.require_session()
        name = session["record"]["name"]
        state = self.linked_or_refuse(name)
        data = self.read_body()

        wanted = " ".join(str(data.get("nickname") or "").split())[:DISCORD_NICK_MAX]
        answer = self.bot_or_refuse(
            "/link/nickname", {"user": state["id"], "nickname": wanted, "actor": name}
        )

        artwork.forget(name)
        audit.record(name, "discord.renamed", {"nickname": answer.get("nickname")}, self.client_ip())
        log.info("%s set their Discord nickname to %r", name, answer.get("nickname"))
        self.reply(
            200,
            {"nickname": answer.get("nickname"), "displayName": answer.get("displayName")},
        )

    def handle_discord_prefs(self):
        session = self.require_session()
        name = session["record"]["name"]
        self.linked_or_refuse(name)
        data = self.read_body()

        wanted = data.get("prefs")
        if not isinstance(wanted, dict):
            raise Rejected(400, "Say which notices you want.")

        try:
            state = users.set_discord_prefs(name, wanted)
        except StoreError as failure:
            raise Rejected(failure.status, failure.message)

        audit.record(name, "discord.prefs", dict(state.get("prefs") or {}), self.client_ip())
        self.reply(200, {"discord": state})

    def handle_discord_cancel(self):
        session = self.require_session()
        name = session["record"]["name"]
        entry = link_codes.drop(name)
        if entry:
            self.link_close(entry["code"], False, "The panel cancelled that link request.")
        self.reply(200, {"status": "idle", "discord": users.discord_state(name)})

    def handle_discord_unlink(self):
        session = self.require_session()
        record = session["record"]
        name = record["name"]
        data = self.read_body()

        self.link_password(record, str(data.get("password") or ""), "discord.unlink")

        if not users.unlink_discord(name):
            raise Rejected(400, "There is no Discord account linked.")

        entry = link_codes.drop(name)
        if entry:
            self.link_close(entry["code"], False, "The panel cancelled that link request.")

        audit.record(name, "discord.unlinked", None, self.client_ip())
        log.info("%s unlinked their Discord account", name)
        self.reply(200, {"status": "idle", "discord": users.discord_state(name)})

    def picture_body(self, data):
        raw = data.get("data")
        if not isinstance(raw, str) or not raw.startswith("data:"):
            raise Rejected(400, "Send the image as a data URL.")
        head, _, encoded = raw.partition(",")
        if not encoded or ";base64" not in head:
            raise Rejected(400, "Send the image as a base64 data URL.")
        if len(encoded) > (PICTURE_MAX * 4) // 3 + 64:
            raise Rejected(413, "Keep the picture under %d KB." % (PICTURE_MAX // 1024))
        try:
            blob = base64.b64decode(encoded, validate=True)
        except ValueError:
            raise Rejected(400, "That image could not be read.")
        return head[5:].split(";", 1)[0].strip().lower(), blob

    def handle_picture_read(self):
        session = self.require_session()
        kind, blob = users.picture(session["record"]["name"])
        self.send_blob(kind, blob)

    def handle_picture_set(self):
        session = self.require_session()
        name = session["record"]["name"]
        if users.discord_state(name).get("linked"):
            raise Rejected(
                409,
                "Your picture comes from Discord while an account is linked. Unlink it first to use one of your own.",
            )
        content_type, blob = self.picture_body(self.read_body())
        state = users.set_picture(name, content_type, blob)
        audit.record(name, "picture.set", {"bytes": state.get("bytes")}, self.client_ip())
        self.reply(200, {"picture": state})

    def handle_picture_delete(self):
        session = self.require_session()
        name = session["record"]["name"]
        if not users.drop_picture(name):
            raise Rejected(404, "There is no picture to remove.")
        audit.record(name, "picture.removed", {}, self.client_ip())
        self.reply(200, {"picture": users.picture_state(name)})

    def handle_users_picture_read(self):
        self.require("users.read")
        name = users.canonical(self.query("name", 64))
        if name is None:
            raise Rejected(404, "No such account.")
        kind, blob = users.picture(name)
        self.send_blob(kind, blob)

    def handle_picture_clear(self):
        session = self.require("users.manage")
        data = self.read_body()
        name = str(data.get("name") or "").strip()
        if not name:
            raise Rejected(400, "Pick an account.")

        target = users.find(name)
        if target is None:
            raise Rejected(404, "No such account.")
        if is_owner(target) and not self.is_owner_session(session):
            raise Rejected(403, "Only an owner can change another owner.")

        if not users.drop_picture(name):
            raise Rejected(400, "That account has no picture.")

        actor = session["record"]["name"]
        audit.record(actor, "picture.cleared", {"account": name}, self.client_ip())
        log.warning("%s removed the picture on %s", actor, name)
        self.reply(200, {"picture": users.picture_state(name)})

    def handle_discord_clear(self):
        session = self.require("users.manage")
        data = self.read_body()
        name = str(data.get("name") or "").strip()
        if not name:
            raise Rejected(400, "Pick an account.")

        target = users.find(name)
        if target is None:
            raise Rejected(404, "No such account.")
        if is_owner(target) and not self.is_owner_session(session):
            raise Rejected(403, "Only an owner can change another owner.")

        if not users.unlink_discord(name):
            raise Rejected(400, "That account has no Discord account linked.")

        actor = session["record"]["name"]
        audit.record(actor, "discord.cleared", {"account": name}, self.client_ip())
        log.warning("%s cleared the Discord link for %s", actor, name)
        self.reply(200, {"discord": users.discord_state(name)})

    def support_or_refuse(self):
        session = self.require_session()
        name = session["record"]["name"]
        state = self.linked_or_refuse(name)
        return name, state["id"]

    def support_write_or_refuse(self, name):
        if support_writes.check(name):
            raise Rejected(429, "That is a lot of messages at once. Give it a few minutes.")

    def handle_support(self):
        session = self.require_session()
        name = session["record"]["name"]
        state = users.discord_state(name)

        payload = {
            "discord": state,
            "tickets": [],
            "categories": [],
            "open": 0,
            "closed": 0,
            "guild": None,
            "botDown": None,
        }

        if not state.get("linked"):
            self.reply(200, payload)
            return

        try:
            answer = self.bot_or_refuse("/support?user=%s" % urllib.parse.quote(state["id"]))
        except Rejected as refusal:
            payload["botDown"] = refusal.message
            self.reply(200, payload)
            return

        payload["tickets"] = [
            row for row in (support_ticket(entry) for entry in answer.get("tickets") or []) if row
        ]
        payload["categories"] = [
            row for row in (support_category(entry) for entry in answer.get("categories") or []) if row
        ]
        payload["open"] = sum(1 for row in payload["tickets"] if row["status"] == "open")
        payload["closed"] = len(payload["tickets"]) - payload["open"]
        payload["guild"] = guild_card(answer.get("guild"))
        self.reply(200, payload)

    def handle_support_ticket(self):
        _, discord_id = self.support_or_refuse()
        wanted = self.query("id", 20)
        if not DISCORD_ID.match(wanted):
            raise Rejected(400, "That is not a ticket.")

        answer = self.bot_or_refuse(
            "/support/ticket?user=%s&id=%s&limit=%d"
            % (urllib.parse.quote(discord_id), urllib.parse.quote(wanted), SUPPORT_MESSAGES)
        )

        ticket = support_ticket(answer.get("ticket"))
        if ticket is None:
            raise Rejected(502, "The bot answered without a ticket.")

        self.reply(
            200,
            {
                "ticket": ticket,
                "messages": [
                    row
                    for row in (support_message(entry) for entry in answer.get("messages") or [])
                    if row
                ],
                "readable": bool(answer.get("readable")),
            },
        )

    def handle_support_open(self):
        name, discord_id = self.support_or_refuse()
        data = self.read_body()
        self.support_write_or_refuse(name)

        category = str(data.get("category") or "").strip()[:32]
        if not category:
            raise Rejected(400, "Pick a kind of support.")

        payload = {"user": discord_id, "category": category, "actor": name}

        for key, value in data.items():
            if key in ("category", "checks", "urgency", "user", "actor"):
                continue
            if not isinstance(key, str) or not key.isalnum() or len(key) > 32:
                continue
            payload[key] = str(value or "")[:SUPPORT_ANSWER_MAX]

        urgency = str(data.get("urgency") or "").strip()
        if urgency:
            payload["urgency"] = urgency[:16]

        checks = data.get("checks")
        if isinstance(checks, list):
            payload["checks"] = [str(entry)[:32] for entry in checks[:SUPPORT_CHECKS_MAX]]

        answer = self.bot_or_refuse("/support/open", payload)
        ticket = support_ticket(answer.get("ticket"))
        if ticket is None:
            raise Rejected(502, "The bot opened something it would not describe.")

        audit.record(name, "support.opened", {"ref": ticket["ref"], "category": ticket["category"]}, self.client_ip())
        log.info("%s opened support ticket %s from the panel", name, ticket["ref"])
        self.reply(200, {"ticket": ticket})

    def handle_support_reply(self):
        name, discord_id = self.support_or_refuse()
        data = self.read_body()
        self.support_write_or_refuse(name)

        wanted = str(data.get("id") or "").strip()
        if not DISCORD_ID.match(wanted):
            raise Rejected(400, "That is not a ticket.")

        body = str(data.get("body") or "").strip()[:SUPPORT_BODY_MAX]
        if not body:
            raise Rejected(400, "Write something first.")

        answer = self.bot_or_refuse(
            "/support/reply", {"user": discord_id, "id": wanted, "body": body, "actor": name}
        )
        self.reply(200, {"sent": True, "ticket": support_ticket(answer.get("ticket"))})

    def handle_support_close(self):
        name, discord_id = self.support_or_refuse()
        data = self.read_body()
        self.support_write_or_refuse(name)

        wanted = str(data.get("id") or "").strip()
        if not DISCORD_ID.match(wanted):
            raise Rejected(400, "That is not a ticket.")

        reason = " ".join(str(data.get("reason") or "").split())[:SUPPORT_REASON_MAX]

        answer = self.bot_or_refuse(
            "/support/close", {"user": discord_id, "id": wanted, "reason": reason, "actor": name}
        )
        ticket = support_ticket(answer.get("ticket"))

        audit.record(
            name,
            "support.closed",
            {"ref": ticket["ref"] if ticket else None},
            self.client_ip(),
        )
        log.info("%s closed support ticket %s from the panel", name, ticket["ref"] if ticket else wanted)
        self.reply(200, {"closed": True, "ticket": ticket})

    def support_staff_actor(self):
        session = self.require("support.manage")
        name = session["record"]["name"]
        state = users.discord_state(name)
        return name, state["id"] if state.get("linked") else None

    def support_queue_id(self, data):
        wanted = str(data.get("id") or "").strip()
        if not DISCORD_ID.match(wanted):
            raise Rejected(400, "That is not a ticket.")
        return wanted

    def handle_support_queue(self):
        self.require("support.manage")

        payload = {
            "tickets": [],
            "open": 0,
            "closed": 0,
            "unclaimed": 0,
            "awaiting": 0,
            "orderStages": [],
            "guild": None,
            "botDown": None,
        }

        try:
            answer = self.bot_or_refuse("/support/all")
        except Rejected as refusal:
            payload["botDown"] = refusal.message
            self.reply(200, payload)
            return

        payload["tickets"] = [
            row for row in (support_admin_ticket(entry) for entry in answer.get("tickets") or []) if row
        ]
        payload["open"] = sum(1 for row in payload["tickets"] if row["status"] == "open")
        payload["closed"] = len(payload["tickets"]) - payload["open"]
        payload["unclaimed"] = sum(
            1 for row in payload["tickets"] if row["status"] == "open" and not row["claimed"]
        )
        payload["awaiting"] = sum(
            1 for row in payload["tickets"] if row["status"] == "open" and row["stage"] == "new"
        )
        payload["orderStages"] = [
            {"value": str(entry.get("value"))[:16], "label": str(entry.get("label") or "")[:48]}
            for entry in (answer.get("orderStages") or [])[:12]
            if isinstance(entry, dict) and STAGE_KEY_SHAPE.match(str(entry.get("value") or ""))
        ]
        payload["guild"] = guild_card(answer.get("guild"))
        self.reply(200, payload)

    def handle_support_queue_ticket(self):
        self.require("support.manage")
        wanted = self.query("id", 20)
        if not DISCORD_ID.match(wanted):
            raise Rejected(400, "That is not a ticket.")

        answer = self.bot_or_refuse(
            "/support/all/ticket?id=%s&limit=%d" % (urllib.parse.quote(wanted), SUPPORT_MESSAGES)
        )

        ticket = support_admin_ticket(answer.get("ticket"))
        if ticket is None:
            raise Rejected(502, "The bot answered without a ticket.")

        self.reply(
            200,
            {
                "ticket": ticket,
                "messages": [
                    row
                    for row in (support_message(entry) for entry in answer.get("messages") or [])
                    if row
                ],
                "readable": bool(answer.get("readable")),
            },
        )

    def handle_support_queue_reply(self):
        name, _ = self.support_staff_actor()
        data = self.read_body()
        self.support_write_or_refuse(name)

        wanted = self.support_queue_id(data)
        body = str(data.get("body") or "").strip()[:SUPPORT_BODY_MAX]
        if not body:
            raise Rejected(400, "Write something first.")

        answer = self.bot_or_refuse(
            "/support/all/reply", {"id": wanted, "name": name, "body": body, "actor": name}
        )
        ticket = support_admin_ticket(answer.get("ticket"))
        log.info("%s answered support ticket %s for the team", name, ticket["ref"] if ticket else wanted)
        self.reply(200, {"sent": True, "ticket": ticket})

    def handle_support_queue_claim(self):
        name, discord_id = self.support_staff_actor()
        data = self.read_body()
        self.support_write_or_refuse(name)

        wanted = self.support_queue_id(data)
        if not discord_id:
            raise Rejected(403, "Claiming needs a linked Discord account with a staff role.")

        answer = self.bot_or_refuse(
            "/support/all/claim", {"id": wanted, "staff": discord_id, "actor": name}
        )
        ticket = support_admin_ticket(answer.get("ticket"))
        audit.record(
            name,
            "support.claimed" if answer.get("claimed") else "support.released",
            {"ref": ticket["ref"] if ticket else None},
            self.client_ip(),
        )
        self.reply(200, {"claimed": bool(answer.get("claimed")), "ticket": ticket})

    def handle_support_queue_close(self):
        name, discord_id = self.support_staff_actor()
        data = self.read_body()
        self.support_write_or_refuse(name)

        wanted = self.support_queue_id(data)
        reason = " ".join(str(data.get("reason") or "").split())[:SUPPORT_REASON_MAX]

        payload = {"id": wanted, "reason": reason, "actor": name}
        if discord_id:
            payload["staff"] = discord_id

        answer = self.bot_or_refuse("/support/all/close", payload)
        ticket = support_admin_ticket(answer.get("ticket"))
        audit.record(
            name,
            "support.staffClosed",
            {"ref": ticket["ref"] if ticket else None},
            self.client_ip(),
        )
        log.info("%s closed support ticket %s for the team", name, ticket["ref"] if ticket else wanted)
        self.reply(200, {"closed": True, "ticket": ticket})

    def handle_support_queue_status(self):
        name, _ = self.support_staff_actor()
        data = self.read_body()
        self.support_write_or_refuse(name)

        wanted = self.support_queue_id(data)
        status = str(data.get("status") or "").strip()[:16]
        if status not in SUPPORT_STAGES and not STAGE_KEY_SHAPE.match(status):
            raise Rejected(400, "That is not a ticket status.")

        answer = self.bot_or_refuse(
            "/support/all/status", {"id": wanted, "status": status, "name": name, "actor": name}
        )
        ticket = support_admin_ticket(answer.get("ticket"))
        audit.record(
            name,
            "support.status",
            {"ref": ticket["ref"] if ticket else None, "status": status},
            self.client_ip(),
        )
        self.reply(200, {"ticket": ticket})

    def handle_support_queue_priority(self):
        name, _ = self.support_staff_actor()
        data = self.read_body()
        self.support_write_or_refuse(name)

        wanted = self.support_queue_id(data)
        priority = str(data.get("priority") or "").strip()[:16]
        if priority not in SUPPORT_PRIORITIES:
            raise Rejected(400, "That is not a priority.")

        answer = self.bot_or_refuse(
            "/support/all/priority", {"id": wanted, "priority": priority, "name": name, "actor": name}
        )
        ticket = support_admin_ticket(answer.get("ticket"))
        audit.record(
            name,
            "support.priority",
            {"ref": ticket["ref"] if ticket else None, "priority": priority},
            self.client_ip(),
        )
        self.reply(200, {"ticket": ticket})

    def order_actor(self):
        session = self.require("orders.manage")
        name = session["record"]["name"]
        state = users.discord_state(name)
        return name, state["id"] if state.get("linked") else None

    def order_id(self, data):
        wanted = str(data.get("id") or "").strip()
        if not DISCORD_ID.match(wanted):
            raise Rejected(400, "That is not an order.")
        return wanted

    def order_reply(self, answer):
        row = order_row(answer.get("ticket"))
        self.reply(200, {"order": row})

    def project_actor(self):
        session = self.require_session()
        name = session["record"]["name"]
        state = users.discord_state(name)
        return session, name, state["id"] if state.get("linked") else None

    def project_who(self, project=None, order=None):
        session = self.current_session()
        if session is None:
            raise Rejected(401, "Sign in first.")
        held = session["record"].get("permissions") or []
        name = session["record"]["name"]
        state = users.discord_state(name)
        discord = state["id"] if state.get("linked") else None
        staff = "orders.read" in held
        client = False
        if project and discord and not staff:
            client = self.owns_project(discord, project)
        elif project and discord and staff:
            client = True
        return {
            "name": name,
            "discord": discord,
            "staff": staff,
            "manage": "orders.files" in held or "orders.manage" in held,
            "client": client,
            "order": order,
        }

    def owns_channel(self, discord_id, channel_id):
        """Is that project record the caller's own? Asked by channel id.

        `owns_project` answers the same question for a PRJ- code; hiding works
        off the record id instead, because a project opened before the ID
        upgrade has no PRJ- code and would otherwise be unhideable.
        """
        if not re.match(r"^\d{17,20}$", str(channel_id or "")):
            return False
        try:
            answer = self.bot_or_refuse("/orders/order?id=%s" % urllib.parse.quote(str(channel_id)))
        except Rejected as refusal:
            # "The bot is unreachable" is not "that is not your project" — say so,
            # or hiding silently reports a missing project every time it is down.
            if refusal.status >= 500:
                raise
            return False
        order = answer.get("order")
        if not isinstance(order, dict):
            return False
        user = order.get("user") or {}
        return str(user.get("id") or "") == str(discord_id)

    def owns_project(self, discord_id, project):
        try:
            answer = self.bot_or_refuse(
                "/orders/search?q=%s&limit=5" % urllib.parse.quote(str(project))
            )
        except Rejected:
            return False
        for entry in answer.get("results") or []:
            if not isinstance(entry, dict):
                continue
            if order_id_code(entry.get("project"), "PRJ") != project:
                continue
            user = entry.get("user") or {}
            if str(user.get("id") or "") == str(discord_id):
                return True
        return False

    def project_of_order(self, order_id, session=None):
        answer = self.bot_or_refuse("/orders/order?id=%s" % urllib.parse.quote(order_id))
        order = answer.get("order") or {}
        project = order_id_code(order.get("project"), "PRJ")
        if not project:
            raise Rejected(409, "That order has no project ID yet.")
        return project, order

    def handle_search(self):
        session = self.require_session()
        held = session["record"].get("permissions") or []
        wanted = self.query("q", SEARCH_QUERY_MAX).strip()
        payload = {"query": wanted, "projects": [], "tickets": [], "transcripts": [], "botDown": None}
        if len(wanted) < 2:
            self.reply(200, payload)
            return
        if not {"orders.read", "support.manage", "transcripts.read"} & set(held):
            raise Rejected(403, "You do not have access to that.")

        try:
            answer = self.bot_or_refuse(
                "/search?q=%s&limit=%d" % (urllib.parse.quote(wanted), ORDER_SEARCH_MAX)
            )
        except Rejected as refusal:
            payload["botDown"] = refusal.message
            self.reply(200, payload)
            return

        if "orders.read" in held:
            payload["projects"] = [
                row
                for row in (search_row(entry, "project") for entry in answer.get("projects") or [])
                if row
            ]
        if "support.manage" in held:
            payload["tickets"] = [
                row
                for row in (search_row(entry, "ticket") for entry in answer.get("tickets") or [])
                if row
            ]
        if "transcripts.read" in held:
            payload["transcripts"] = [
                row for row in (transcript_row(entry) for entry in answer.get("transcripts") or []) if row
            ]
        self.reply(200, payload)

    def handle_orders_lookup(self):
        self.require("orders.read")
        wanted = self.query("q", LOOKUP_QUERY_MAX).strip()
        if len(wanted) < 6:
            raise Rejected(400, "Type at least the first six characters of an ID.")

        answer = self.bot_or_refuse("/orders/lookup?q=%s" % urllib.parse.quote(wanted))
        card = order_lookup_card(answer.get("card"))
        if card is None:
            raise Rejected(404, "Nothing answers to that.")
        self.reply(200, {"card": card})

    def handle_orders_pulse(self):
        self.require("orders.read")
        try:
            answer = self.bot_or_refuse("/orders/pulse")
        except Rejected as refusal:
            self.reply(200, {"orders": {}, "at": None, "botDown": refusal.message})
            return

        marks = {}
        for key, held in (answer.get("orders") or {}).items():
            if isinstance(held, (int, float)) and held >= 0:
                marks[str(key)[:20]] = int(held)
        self.reply(200, {"orders": marks, "at": support_stamp(answer.get("at")), "botDown": None})

    def handle_orders_workflows(self):
        self.require("orders.read")
        answer = self.bot_or_refuse("/orders/workflows")
        self.reply(200, {"workflows": order_workflow_list(answer.get("workflows"))})

    def handle_orders_fields(self):
        self.require("orders.read")
        answer = self.bot_or_refuse("/orders/fields")
        self.reply(200, {"fields": order_field_list(answer.get("fields"))})

    def handle_orders_visibility(self):
        name, _ = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)
        visibility = str(data.get("visibility") or "").strip().lower()
        if visibility not in ORDER_VISIBILITY:
            raise Rejected(400, "That is not a visibility setting.")

        answer = self.bot_or_refuse(
            "/orders/visibility",
            {"id": wanted, "visibility": visibility, "name": name, "actor": name},
        )
        audit.record(name, "order.visibility", {"order": wanted, "visibility": visibility}, self.client_ip())
        self.order_reply(answer)

    def handle_orders_custom(self):
        name, _ = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)
        given = data.get("fields")
        if not isinstance(given, dict) or not given:
            raise Rejected(400, "Nothing to change.")
        fields = {}
        for key, held in list(given.items())[:ORDER_CUSTOM_MAX]:
            name_key = str(key)[:32]
            if not ORDER_FIELD_KEY.match(name_key):
                continue
            if isinstance(held, bool):
                fields[name_key] = held
            else:
                fields[name_key] = str(held or "")[:ORDER_FIELD_VALUE_MAX]
        if not fields:
            raise Rejected(400, "Nothing to change.")

        answer = self.bot_or_refuse(
            "/orders/custom", {"id": wanted, "fields": fields, "name": name, "actor": name}
        )
        audit.record(name, "order.fields", {"order": wanted, "fields": sorted(fields)}, self.client_ip())
        self.order_reply(answer)

    def handle_orders_link(self):
        name, _ = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)
        given = data.get("links")
        if not isinstance(given, dict) or not given:
            raise Rejected(400, "Nothing to change.")

        links = {}
        if "ticket" in given:
            links["ticket"] = str(given["ticket"] or "")[:24]
        if "about" in given:
            links["about"] = str(given["about"] or "")[:24]
        if not links:
            raise Rejected(400, "Nothing to change.")

        answer = self.bot_or_refuse(
            "/orders/link", {"id": wanted, "links": links, "name": name, "actor": name}
        )
        audit.record(name, "order.link", {"order": wanted, "links": sorted(links)}, self.client_ip())
        self.reply(
            200,
            {"order": order_row(answer.get("ticket")), "links": order_links(answer.get("links"))},
        )

    def handle_orders_workflow_set(self):
        name, _ = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)
        workflow = str(data.get("workflow") or "").strip().lower() or "studio"
        if not ORDER_WORKFLOW_ID.match(workflow):
            raise Rejected(400, "That is not a workflow.")

        answer = self.bot_or_refuse(
            "/orders/workflow", {"id": wanted, "workflow": workflow, "name": name, "actor": name}
        )
        audit.record(name, "order.workflow", {"order": wanted, "workflow": workflow}, self.client_ip())
        self.order_reply(answer)

    def workflow_body(self, data):
        given = data.get("workflow")
        if not isinstance(given, dict):
            raise Rejected(400, "Send a workflow.")
        identifier = str(given.get("id") or "").strip().lower()
        if not ORDER_WORKFLOW_ID.match(identifier):
            raise Rejected(400, "A workflow id is 2 to 24 lowercase letters, numbers or dashes.")
        stages = []
        seen = set()
        for entry in (given.get("stages") or [])[:ORDER_WORKFLOW_STAGES_MAX]:
            cleaned = order_workflow_stage(entry)
            if cleaned is None or cleaned["key"] in seen:
                continue
            seen.add(cleaned["key"])
            stages.append(cleaned)
        if len(stages) < 2:
            raise Rejected(400, "A workflow needs at least two stages.")
        return {
            "id": identifier,
            "name": str(given.get("name") or "")[:60],
            "stages": stages,
        }

    def handle_orders_workflow_save(self):
        name, _ = self.order_actor()
        data = self.read_body()
        workflow = self.workflow_body(data)

        answer = self.bot_or_refuse(
            "/orders/workflow/save", {"workflow": workflow, "name": name, "actor": name}
        )
        audit.record(name, "order.workflow.save", {"workflow": workflow["id"]}, self.client_ip())
        self.reply(200, {"workflows": order_workflow_list(answer.get("workflows"))})

    def handle_orders_workflow_remove(self):
        name, _ = self.order_actor()
        data = self.read_body()
        identifier = str(data.get("id") or "").strip().lower()
        if not ORDER_WORKFLOW_ID.match(identifier):
            raise Rejected(400, "That is not a workflow.")

        answer = self.bot_or_refuse(
            "/orders/workflow/remove", {"id": identifier, "name": name, "actor": name}
        )
        audit.record(name, "order.workflow.remove", {"workflow": identifier}, self.client_ip())
        self.reply(200, {"workflows": order_workflow_list(answer.get("workflows"))})

    def handle_orders_field_save(self):
        name, _ = self.order_actor()
        data = self.read_body()
        given = data.get("field")
        if not isinstance(given, dict):
            raise Rejected(400, "Send a field.")
        cleaned = order_field(given)
        if cleaned is None:
            raise Rejected(400, "A field key is 2 to 32 lowercase letters, numbers or dashes.")
        if not cleaned["label"]:
            raise Rejected(400, "Give the field a label.")

        answer = self.bot_or_refuse(
            "/orders/field/save", {"field": cleaned, "name": name, "actor": name}
        )
        audit.record(name, "order.field.save", {"field": cleaned["key"]}, self.client_ip())
        self.reply(200, {"fields": order_field_list(answer.get("fields"))})

    def handle_orders_field_remove(self):
        name, _ = self.order_actor()
        data = self.read_body()
        key = str(data.get("key") or "").strip().lower()
        if not ORDER_FIELD_KEY.match(key):
            raise Rejected(400, "That is not a field.")

        answer = self.bot_or_refuse(
            "/orders/field/remove", {"key": key, "name": name, "actor": name}
        )
        audit.record(name, "order.field.remove", {"field": key}, self.client_ip())
        self.reply(200, {"fields": order_field_list(answer.get("fields"))})

    def handle_project_files(self):
        self.require("orders.read")
        wanted = self.query("id", 20)
        if not DISCORD_ID.match(wanted):
            raise Rejected(400, "That is not an order.")
        project, _ = self.project_of_order(wanted)
        who = self.project_who(project, wanted)
        self.reply(
            200,
            {
                "project": project,
                "files": project_files.list(project, who),
                "limits": {
                    "bytes": PROJECT_FILE_MAX,
                    "files": PROJECT_FILES_PER_PROJECT,
                    "versions": PROJECT_VERSIONS_MAX,
                    "types": sorted(set(PROJECT_FILE_TYPES.values())),
                },
                "access": list(PROJECT_ACCESS),
                "canManage": bool(who["manage"]),
            },
        )

    def file_body(self, data):
        head, _, encoded = str(data.get("data") or "").partition(",")
        if not head.startswith("data:") or not encoded:
            raise Rejected(400, "Send the file as a data URL.")
        try:
            blob = base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError, base64.binascii.Error):
            raise Rejected(400, "That file could not be read.")
        return head[5:].split(";", 1)[0].strip().lower(), blob

    def handle_project_files_add(self):
        session = self.require("orders.files")
        name = session["record"]["name"]
        data = self.read_body()
        order = self.order_id(data)
        project, _ = self.project_of_order(order)
        content_type, blob = self.file_body(data)

        try:
            made = project_files.add(
                project,
                data.get("name"),
                content_type,
                blob,
                name,
                note=data.get("note") or "",
                access=data.get("access") or "studio",
                order=order,
            )
        except StoreError as refusal:
            raise Rejected(refusal.status, str(refusal))

        audit.record(name, "project.file.add", {"project": project, "file": made["id"]}, self.client_ip())
        if self.client_sees(made):
            self.notify_project(order, name, "file-added", made["name"])
        self.reply(200, {"file": made})

    def handle_project_files_version(self):
        session = self.require("orders.files")
        name = session["record"]["name"]
        data = self.read_body()
        file_id = str(data.get("file") or "").strip()
        if not FILE_ID.match(file_id):
            raise Rejected(400, "That is not a file.")
        content_type, blob = self.file_body(data)

        try:
            made = project_files.revise(file_id, content_type, blob, name, note=data.get("note") or "")
        except StoreError as refusal:
            raise Rejected(refusal.status, str(refusal))

        audit.record(
            name, "project.file.version", {"file": file_id, "version": made["version"]}, self.client_ip()
        )
        held = project_files.find(file_id)
        if held and held.get("order") and self.client_sees(made):
            self.notify_project(
                held["order"], name, "file-updated", "%s v%d" % (made["name"], made["version"])
            )
        self.reply(200, {"file": made})

    def handle_project_files_edit(self):
        session = self.require("orders.files")
        name = session["record"]["name"]
        data = self.read_body()
        file_id = str(data.get("file") or "").strip()
        if not FILE_ID.match(file_id):
            raise Rejected(400, "That is not a file.")

        patch = {}
        for key in ("name", "note", "access", "locked", "people"):
            if key in data:
                patch[key] = data[key]
        if not patch:
            raise Rejected(400, "Nothing to change.")

        try:
            made = project_files.edit(file_id, patch, name)
        except StoreError as refusal:
            raise Rejected(refusal.status, str(refusal))

        audit.record(
            name, "project.file.edit", {"file": file_id, "changed": made.get("changed")}, self.client_ip()
        )
        self.reply(200, {"file": made})

    def handle_project_files_remove(self):
        session = self.require("orders.files")
        name = session["record"]["name"]
        data = self.read_body()
        file_id = str(data.get("file") or "").strip()
        if not FILE_ID.match(file_id):
            raise Rejected(400, "That is not a file.")

        try:
            gone = project_files.remove(file_id, name)
        except StoreError as refusal:
            raise Rejected(refusal.status, str(refusal))

        audit.record(name, "project.file.remove", {"file": file_id}, self.client_ip())
        self.reply(200, {"removed": gone})

    def handle_project_file(self):
        self.require_session()
        file_id = self.query("file", 40)
        if not FILE_ID.match(file_id):
            raise Rejected(404, "That file is not here.")
        held = project_files.find(file_id)
        if held is None:
            raise Rejected(404, "That file is not here.")

        who = self.project_who(held.get("project"), held.get("order"))
        try:
            kind, data, record, version = project_files.blob(file_id, self.query("v", 8), who)
        except StoreError as refusal:
            raise Rejected(refusal.status, str(refusal))

        self.send_download(kind, data, "%s.%s" % (record["name"], version["ext"]))

    def send_download(self, kind, data, filename):
        cookie = self.renewal_cookie()
        safe = re.sub(r'[^A-Za-z0-9._ -]', "", str(filename))[:120] or "download"
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Content-Disposition", 'attachment; filename="%s"' % safe)
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)

    def handle_project_ledger(self):
        self.require("orders.read")
        wanted = self.query("id", 20)
        if not DISCORD_ID.match(wanted):
            raise Rejected(400, "That is not an order.")
        project, _ = self.project_of_order(wanted)
        self.reply(200, {"project": project, "entries": project_files.history(project, 200)})

    @staticmethod
    def client_sees(file_row):
        return not file_row.get("locked") and file_row.get("access") in ("client", "named")

    def notify_project(self, order_id, actor, kind, detail):
        if not order_id:
            return
        try:
            self.bot_or_refuse(
                "/orders/announce",
                {"id": order_id, "kind": kind, "detail": detail, "name": actor, "actor": actor},
            )
        except Rejected:
            return

    def handle_projects_mine(self):
        session = self.require_session()
        name = session["record"]["name"]
        state = users.discord_state(name)
        payload = {"discord": state, "projects": [], "botDown": None}
        if not state.get("linked"):
            self.reply(200, payload)
            return

        try:
            answer = self.bot_or_refuse("/orders")
        except Rejected as refusal:
            payload["botDown"] = refusal.message
            self.reply(200, payload)
            return

        hidden = users.hidden_projects(name)

        mine = []
        for entry in answer.get("tickets") or []:
            if not isinstance(entry, dict):
                continue
            user = entry.get("user") or {}
            if str(user.get("id") or "") != str(state["id"]):
                continue
            row = order_row(entry)
            if row is None:
                continue
            if row["visibility"] == "private":
                continue
            project = client_project(row)
            # Hiding is the holder's own view, so the row still ships — the
            # panel decides whether to draw it, and can unhide without a reload.
            project["hidden"] = project["id"] in hidden
            mine.append(project)

        payload["projects"] = mine
        payload["hidden"] = len([project for project in mine if project["hidden"]])
        self.reply(200, payload)

    def handle_projects_mine_hide(self):
        session = self.require_session()
        name = session["record"]["name"]
        state = users.discord_state(name)
        if not state.get("linked"):
            raise Rejected(403, "Link your Discord account first.")

        data = self.read_body()
        wanted = str(data.get("id") or "")[:20]
        hidden = bool(data.get("hidden"))

        if not self.owns_channel(state["id"], wanted):
            raise Rejected(404, "No project of yours has that ID.")

        self.reply(200, {"hidden": users.hide_project(name, wanted, hidden)})

    def handle_projects_mine_files(self):
        session = self.require_session()
        name = session["record"]["name"]
        state = users.discord_state(name)
        if not state.get("linked"):
            raise Rejected(403, "Link your Discord account first.")
        project = order_id_code(self.query("id", 24), "PRJ")
        if not project:
            raise Rejected(400, "That is not a project ID.")
        if not self.owns_project(state["id"], project):
            raise Rejected(404, "No project of yours has that ID.")

        who = {
            "name": name,
            "discord": state["id"],
            "staff": False,
            "manage": False,
            "client": True,
        }
        self.reply(200, {"project": project, "files": project_files.list(project, who)})

    def handle_orders(self):
        self.require("orders.read")

        payload = {
            "orders": [],
            "open": 0,
            "closed": 0,
            "unclaimed": 0,
            "awaiting": 0,
            "stages": [],
            "botDown": None,
        }

        try:
            answer = self.bot_or_refuse("/orders")
        except Rejected as refusal:
            payload["botDown"] = refusal.message
            self.reply(200, payload)
            return

        payload["orders"] = [
            row for row in (order_row(entry) for entry in answer.get("tickets") or []) if row
        ]
        payload["open"] = sum(1 for row in payload["orders"] if row["status"] == "open")
        payload["closed"] = len(payload["orders"]) - payload["open"]
        payload["unclaimed"] = sum(
            1 for row in payload["orders"] if row["status"] == "open" and not row["claimed"]
        )
        payload["awaiting"] = sum(
            1 for row in payload["orders"] if row["status"] == "open" and row["stage"] == "new"
        )
        payload["stages"] = order_stage_list(answer.get("stages"))
        self.reply(200, payload)

    def handle_orders_stats(self):
        self.require("orders.read")

        try:
            answer = self.bot_or_refuse("/orders/stats")
        except Rejected as refusal:
            self.reply(200, {"stats": None, "botDown": refusal.message})
            return

        self.reply(200, {"stats": order_stats(answer), "botDown": None})

    def handle_orders_order(self):
        session = self.require("orders.read")
        wanted = self.query("id", 20)
        if not DISCORD_ID.match(wanted):
            raise Rejected(400, "That is not an order.")

        answer = self.bot_or_refuse("/orders/order?id=%s" % urllib.parse.quote(wanted))

        notes = "orders.manage" in (session["record"].get("permissions") or [])
        order = order_detail(answer.get("order"), notes)
        if order is None:
            raise Rejected(502, "The bot answered without an order.")

        self.reply(
            200,
            {
                "order": order,
                "shareable": [
                    key for key in (answer.get("shareable") or []) if key in ORDER_SHAREABLE
                ],
                "editable": [
                    key for key in (answer.get("editable") or []) if key in ORDER_EDITABLE
                ],
                "stages": order_stage_list(answer.get("stages")),
            },
        )

    def handle_orders_thread(self):
        self.require("orders.read")
        wanted = self.query("id", 20)
        if not DISCORD_ID.match(wanted):
            raise Rejected(400, "That is not an order.")

        answer = self.bot_or_refuse(
            "/orders/thread?id=%s&limit=%d" % (urllib.parse.quote(wanted), ORDER_MESSAGES)
        )

        self.reply(
            200,
            {
                "messages": [
                    row
                    for row in (support_message(entry) for entry in answer.get("messages") or [])
                    if row
                ],
                "readable": bool(answer.get("readable")),
            },
        )

    def handle_orders_reply(self):
        name, _ = self.order_actor()
        data = self.read_body()
        self.support_write_or_refuse(name)

        wanted = self.order_id(data)
        body = str(data.get("body") or "").strip()
        if not body:
            raise Rejected(400, "Write something first.")

        answer = self.bot_or_refuse(
            "/orders/reply", {"id": wanted, "name": name, "body": body, "actor": name}
        )
        row = order_row(answer.get("ticket"))
        audit.record(name, "order.reply", {"ref": row["ref"] if row else None}, self.client_ip())
        self.reply(200, {"order": row, "id": str(answer.get("id") or "")[:20]})

    def handle_orders_claim(self):
        name, discord_id = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)
        if not discord_id:
            raise Rejected(403, "Link your Discord account before claiming a project.")

        answer = self.bot_or_refuse(
            "/orders/claim", {"id": wanted, "staff": discord_id, "actor": name}
        )
        row = order_row(answer.get("ticket"))
        audit.record(
            name,
            "order.claim",
            {"ref": row["ref"] if row else None, "claimed": bool(answer.get("claimed"))},
            self.client_ip(),
        )
        self.reply(200, {"order": row, "claimed": bool(answer.get("claimed"))})

    def handle_orders_close(self):
        name, discord_id = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)
        reason = str(data.get("reason") or "").strip()[:300]

        answer = self.bot_or_refuse(
            "/orders/close",
            {"id": wanted, "staff": discord_id or "", "reason": reason, "actor": name},
        )
        row = order_row(answer.get("ticket"))
        audit.record(name, "order.close", {"ref": row["ref"] if row else None}, self.client_ip())
        self.reply(200, {"order": row})

    def handle_orders_stage(self):
        name, _ = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)

        stage = str(data.get("stage") or "").strip()[:16]
        if stage not in ORDER_HOLD_KEYS and not STAGE_KEY_SHAPE.match(stage):
            raise Rejected(400, "That is not a stage.")

        answer = self.bot_or_refuse(
            "/orders/stage", {"id": wanted, "stage": stage, "name": name, "actor": name}
        )
        row = order_row(answer.get("ticket"))
        audit.record(
            name,
            "order.stage",
            {"ref": row["ref"] if row else None, "stage": stage},
            self.client_ip(),
        )
        self.reply(200, {"order": row})

    def handle_orders_priority(self):
        name, _ = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)

        priority = str(data.get("priority") or "").strip()[:16]
        if priority not in ORDER_PRIORITIES:
            raise Rejected(400, "That is not a priority.")

        answer = self.bot_or_refuse(
            "/orders/priority", {"id": wanted, "priority": priority, "name": name, "actor": name}
        )
        row = order_row(answer.get("ticket"))
        audit.record(
            name,
            "order.priority",
            {"ref": row["ref"] if row else None, "priority": priority},
            self.client_ip(),
        )
        self.reply(200, {"order": row})

    def handle_orders_edit(self):
        name, _ = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)

        sent = data.get("fields")
        if not isinstance(sent, dict) or not sent:
            raise Rejected(400, "Nothing to change.")

        fields = {}
        for key, limit in ORDER_EDITABLE.items():
            if key not in sent:
                continue
            fields[key] = str(sent.get(key) or "").replace("\r", "").strip()[:limit]

        if not fields:
            raise Rejected(400, "Nothing to change.")
        if "name" in fields and not fields["name"]:
            raise Rejected(400, "A project needs a name.")

        answer = self.bot_or_refuse(
            "/orders/edit", {"id": wanted, "fields": fields, "name": name, "actor": name}
        )
        row = order_row(answer.get("ticket"))
        changed = [key for key in (answer.get("changed") or []) if key in ORDER_EDITABLE]
        audit.record(
            name,
            "order.edit",
            {"ref": row["ref"] if row else None, "changed": changed},
            self.client_ip(),
        )
        self.reply(200, {"order": row, "changed": changed})

    def handle_orders_share(self):
        name, _ = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)

        sent = data.get("fields")
        if not isinstance(sent, list):
            raise Rejected(400, "Send the list of fields to share.")

        fields = [key for key in ORDER_SHAREABLE if key in sent]

        answer = self.bot_or_refuse(
            "/orders/share", {"id": wanted, "fields": fields, "name": name, "actor": name}
        )
        row = order_row(answer.get("ticket"))
        shared = [key for key in (answer.get("shared") or []) if key in ORDER_SHAREABLE]
        audit.record(
            name,
            "order.share",
            {"ref": row["ref"] if row else None, "shared": shared},
            self.client_ip(),
        )
        self.reply(200, {"order": row, "shared": shared})

    def handle_orders_tracking(self):
        name, _ = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)
        on = bool(data.get("on"))

        answer = self.bot_or_refuse(
            "/orders/tracking", {"id": wanted, "on": on, "name": name, "actor": name}
        )
        row = order_row(answer.get("ticket"))
        audit.record(
            name,
            "order.tracking",
            {"ref": row["ref"] if row else None, "tracking": on},
            self.client_ip(),
        )
        self.reply(200, {"order": row, "tracking": bool(answer.get("tracking"))})

    def handle_orders_recode(self):
        name, _ = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)

        answer = self.bot_or_refuse(
            "/orders/recode", {"id": wanted, "name": name, "actor": name}
        )
        row = order_row(answer.get("ticket"))
        audit.record(name, "order.recode", {"ref": row["ref"] if row else None}, self.client_ip())
        self.reply(200, {"order": row, "track": order_text(answer.get("track"), 24)})

    def handle_orders_note(self):
        name, _ = self.order_actor()
        data = self.read_body()
        self.support_write_or_refuse(name)

        wanted = self.order_id(data)
        body = str(data.get("body") or "").replace("\r", "").strip()[:ORDER_NOTE_MAX]
        if not body:
            raise Rejected(400, "Write the note first.")

        shared = bool(data.get("shared"))
        answer = self.bot_or_refuse(
            "/orders/note",
            {"id": wanted, "body": body, "shared": shared, "name": name, "actor": name},
        )
        row = order_row(answer.get("ticket"))
        audit.record(
            name,
            "order.note",
            {"ref": row["ref"] if row else None, "shared": shared},
            self.client_ip(),
        )
        self.reply(200, {"order": row, "note": order_note(answer.get("note"))})

    def handle_orders_note_remove(self):
        name, _ = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)

        note = data.get("note")
        if not isinstance(note, int):
            raise Rejected(400, "That is not a note.")

        answer = self.bot_or_refuse(
            "/orders/note/remove", {"id": wanted, "note": note, "name": name, "actor": name}
        )
        row = order_row(answer.get("ticket"))
        audit.record(name, "order.note.remove", {"ref": row["ref"] if row else None}, self.client_ip())
        self.reply(200, {"order": row})

    def handle_orders_note_share(self):
        name, _ = self.order_actor()
        data = self.read_body()
        wanted = self.order_id(data)

        note = data.get("note")
        if not isinstance(note, int):
            raise Rejected(400, "That is not a note.")

        on = bool(data.get("on"))
        answer = self.bot_or_refuse(
            "/orders/note/share",
            {"id": wanted, "note": note, "on": on, "name": name, "actor": name},
        )
        row = order_row(answer.get("ticket"))
        audit.record(
            name,
            "order.note.share",
            {"ref": row["ref"] if row else None, "shared": on},
            self.client_ip(),
        )
        self.reply(200, {"order": row, "note": order_note(answer.get("note"))})

    def handle_track(self):
        code = self.query("code", 40)
        if not code or not ORDER_TRACK_CODE.match(code):
            raise Rejected(400, "That is not a tracking code.")

        if track_lookups.check(self.client_ip()):
            raise Rejected(429, "Too many lookups from here. Wait a few minutes and try again.")

        try:
            answer = self.bot_or_refuse("/orders/track?code=%s" % urllib.parse.quote(code))
        except Rejected as refusal:
            if refusal.status in (400, 403, 404):
                raise Rejected(404, "No project matches that code.")
            raise

        order = track_order(answer.get("order"))
        if order is None:
            raise Rejected(404, "No project matches that code.")

        self.reply(200, {"order": order})

    def transcript_code(self):
        code = self.query("code", 80)
        if not code or not TRANSCRIPT_CODE.match(code):
            raise Rejected(400, "That is not a transcript link.")
        if transcript_lookups.check(self.client_ip()):
            raise Rejected(429, "Too many lookups from here. Wait a few minutes and try again.")
        return code

    def transcript_from_bot(self, path):
        try:
            return self.bot_or_refuse(path, max_bytes=TRANSCRIPT_BYTES)
        except Rejected as refusal:
            if refusal.status in (400, 403, 404):
                raise Rejected(404, "No transcript matches that link.")
            raise

    def handle_transcript(self):
        code = self.transcript_code()
        answer = self.transcript_from_bot("/transcripts/doc?code=%s" % urllib.parse.quote(code))
        if not isinstance(answer, dict) or not answer.get("transcript"):
            raise Rejected(404, "No transcript matches that link.")
        self.reply(200, answer)

    def handle_transcript_file(self):
        code = self.transcript_code()
        answer = self.transcript_from_bot("/transcripts/html?code=%s" % urllib.parse.quote(code))
        html = answer.get("html") if isinstance(answer, dict) else None
        if not html:
            raise Rejected(404, "No transcript matches that link.")
        self.send_transcript_file(str(answer.get("name") or "transcript.html"), html.encode("utf-8"))

    def handle_own_password(self):
        session = self.require_session()
        record = session["record"]
        data = self.read_body()

        current = str(data.get("current") or "")
        fresh = str(data.get("password") or "")

        stored = account_password(record["name"])
        if not stored or not verify_password(stored, current):
            audit.record(record["name"], "password.failed", None, self.client_ip())
            raise Rejected(401, "That is not your current password.")

        if verify_password(stored, fresh):
            raise Rejected(400, "Pick a password you are not already using.")

        version = users.change_own_password(record["name"], fresh)
        audit.record(record["name"], "password.changed", None, self.client_ip())

        token = issue_token(record["name"], version, time.time())
        self.reply(200, {"changed": True}, self.session_cookie(token, SESSION_HOURS * 3600))

    def handle_totp_start(self):
        session = self.require_session()
        name = session["record"]["name"]

        if users.totp_state(name).get("enabled"):
            raise Rejected(409, "Two-step is already on. Turn it off before setting it up again.")

        secret, uri = users.start_totp(name)
        audit.record(name, "twofactor.started", None, self.client_ip())
        self.reply(200, {"secret": secret, "uri": uri})

    def handle_totp_confirm(self):
        session = self.require_session()
        name = session["record"]["name"]
        data = self.read_body()

        codes = users.confirm_totp(name, str(data.get("code") or "").strip()[:64])
        audit.record(name, "twofactor.on", None, self.client_ip())
        log.info("two-step turned on for %s", name)
        alert(
            "account",
            "Two-step verification turned on",
            [("User", name), ("Address", self.client_ip()), ("When", stamp())],
        )

        fresh = users.find(name)
        token = issue_token(name, (fresh or {}).get("tokenVersion") or 1, time.time())
        self.reply(200, {"enabled": True, "recovery": codes}, self.session_cookie(token, SESSION_HOURS * 3600))

    def handle_totp_disable(self):
        session = self.require_session()
        name = session["record"]["name"]
        data = self.read_body()

        if not users.totp_state(name).get("enabled"):
            raise Rejected(409, "Two-step is not on for this account.")

        stored = account_password(name)
        if not stored or not verify_password(stored, str(data.get("password") or "")):
            audit.record(name, "twofactor.failed", None, self.client_ip())
            raise Rejected(401, "That is not your password.")

        if users.verify_totp(name, str(data.get("code") or "").strip()[:64]) not in ("code", "recovery"):
            audit.record(name, "twofactor.failed", None, self.client_ip())
            raise Rejected(401, "That code is not right.")

        users.disable_totp(name)
        audit.record(name, "twofactor.off", None, self.client_ip())
        log.warning("two-step turned off for %s from %s", name, self.client_ip())
        alert(
            "lockout",
            "Two-step verification turned off",
            [("User", name), ("Address", self.client_ip()), ("When", stamp())],
        )

        fresh = users.find(name)
        token = issue_token(name, (fresh or {}).get("tokenVersion") or 1, time.time())
        self.reply(200, {"enabled": False}, self.session_cookie(token, SESSION_HOURS * 3600))

    def handle_totp_clear(self):
        session = self.require("users.manage")
        data = self.read_body()

        name = str(data.get("name") or "").strip()
        if not name:
            raise Rejected(400, "Which account?")
        if name == session["record"]["name"]:
            raise Rejected(400, "Turn your own two-step off under your account.")
        self.not_over_an_owner(session, name)

        if not users.totp_state(name).get("enabled") and not users.totp_state(name).get("pending"):
            raise Rejected(409, "Two-step is not set up for that account.")

        users.disable_totp(name)
        audit.record(session["record"]["name"], "twofactor.cleared", {"name": name}, self.client_ip())
        log.warning("two-step cleared for %s by %s", name, session["record"]["name"])
        self.reply(200, {"name": name, "enabled": False})

    def handle_revoke_all(self):
        session = self.require("users.manage")
        revocations.revoke(time.time())
        audit.record(session["record"]["name"], "sessions.revokedAll", None, self.client_ip())
        log.info("every session ended by %s", session["record"]["name"])
        self.reply(204, None, self.session_cookie("", 0))

    def shield_or_refuse(self, path, payload=None, control=True):
        try:
            return shield_fetch(path, payload, control)
        except ShieldDown as down:
            raise Rejected(503, SHIELD_REASONS.get(down.reason, "The evaluator could not be reached."))

    def handle_shield_mode(self):
        session = self.require("shield.manage")
        data = self.read_body()

        mode = str(data.get("mode") or "").strip()
        if mode not in SHIELD_MODES:
            raise Rejected(400, "Pick monitor or block.")

        answer = self.shield_or_refuse("/admin/mode", {"mode": mode})
        actor = session["record"]["name"]
        audit.record(actor, "shield.mode", {"mode": mode, "was": answer.get("was")}, self.client_ip())
        log.warning("shield mode set to %s by %s", mode, actor)
        self.reply(200, answer)

    def handle_shield_policy(self):
        session = self.require("shield.manage")
        data = self.read_body()
        actor = session["record"]["name"]

        identifier = str(data.get("id") or "").strip()
        mode = str(data.get("mode") or "").strip()
        if not identifier:
            raise Rejected(400, "Which rule?")
        if mode not in SHIELD_TUNINGS:
            raise Rejected(400, "Pick enforce, record or silence.")

        paths = data.get("paths")
        cleaned = []
        if isinstance(paths, list):
            for entry in paths[:SHIELD_MAX_PATHS]:
                if not isinstance(entry, str):
                    continue
                value = entry.strip()
                if value.startswith("/"):
                    cleaned.append(value[:200])

        note = data.get("note")
        payload = {
            "id": identifier,
            "mode": mode,
            "paths": cleaned,
            "note": str(note).strip()[:200] if isinstance(note, str) else "",
            "by": actor,
        }

        answer = self.shield_or_refuse("/admin/policy", payload)
        audit.record(
            actor,
            "shield.tuned",
            {"rule": identifier, "mode": mode, "paths": cleaned},
            self.client_ip(),
        )
        log.warning("shield rule %s set to %s by %s", identifier, mode, actor)
        self.reply(200, answer)

    def handle_shield_clear(self):
        session = self.require("shield.manage")
        answer = self.shield_or_refuse("/admin/clear", {})
        actor = session["record"]["name"]
        audit.record(actor, "shield.cleared", None, self.client_ip())
        log.info("shield flags cleared by %s", actor)
        self.reply(200, answer)

    def handle_shield_selftest(self):
        session = self.require("shield.manage")
        answer = self.shield_or_refuse("/admin/selftest", {})
        audit.record(session["record"]["name"], "shield.selfTest", None, self.client_ip())
        self.reply(200, answer)

    def handle_shield_evaluate(self):
        self.require("shield.read")
        data = self.read_body()

        scenario = str(data.get("scenario") or "").strip()
        value = data.get("input")
        if not scenario:
            raise Rejected(400, "Pick a scenario.")
        if not isinstance(value, str):
            raise Rejected(400, "Send the input as text.")

        answer = self.shield_or_refuse(
            "/evaluate", {"scenario": scenario, "input": value}, control=False
        )
        self.reply(200, answer)

    def bot_or_refuse(self, path, payload=None, max_bytes=None):
        try:
            return bot_fetch(path, payload, max_bytes)
        except BotDown as down:
            raise Rejected(503, BOT_REASONS.get(down.reason, "The bot could not be reached."))

    def bot_actor(self, permission="bot.manage"):
        session = self.require(permission)
        return session["record"]["name"]

    def handle_bot_health(self):
        self.require("bot.read")
        self.reply(200, self.bot_or_refuse("/health"))

    def handle_bot_queues(self):
        self.require("bot.read")
        kind = self.query("kind")
        status = self.query("status")
        if kind and kind not in BOT_QUEUES:
            raise Rejected(400, "Unknown queue.")
        if status and status not in BOT_STATUSES:
            raise Rejected(400, "Pick open or closed.")
        limit = self.query("limit") or "50"
        self.reply(
            200,
            self.bot_or_refuse(
                "/queues?kind=%s&status=%s&limit=%s"
                % (
                    urllib.parse.quote(kind),
                    urllib.parse.quote(status),
                    urllib.parse.quote(limit),
                )
            ),
        )

    def bot_guild_query(self, route):
        guild = self.query("guild", 32)
        if not guild:
            raise Rejected(400, "Which server?")
        return "%s?guild=%s" % (route, urllib.parse.quote(guild))

    def handle_bot_guild(self):
        self.require("bot.read")
        self.reply(200, self.bot_or_refuse(self.bot_guild_query("/guild")))

    def handle_bot_members(self):
        self.require("bot.read")
        query = self.bot_guild_query("/members")
        self.reply(
            200,
            self.bot_or_refuse(
                "%s&q=%s&limit=%s"
                % (
                    query,
                    urllib.parse.quote(self.query("q", 64)),
                    urllib.parse.quote(self.query("limit") or "50"),
                )
            ),
        )

    def handle_bot_levels(self):
        self.require("bot.read")
        sort = self.query("sort", 16)
        if sort and sort not in BOT_LEVEL_SORTS:
            raise Rejected(400, "Unknown sort.")
        query = self.bot_guild_query("/levels")
        self.reply(
            200,
            self.bot_or_refuse(
                "%s&sort=%s&limit=%s"
                % (query, urllib.parse.quote(sort), urllib.parse.quote(self.query("limit") or "50"))
            ),
        )

    def handle_bot_giveaways(self):
        self.require("bot.read")
        self.reply(200, self.bot_or_refuse(self.bot_guild_query("/giveaways")))

    def handle_bot_community(self):
        self.require("bot.read")
        self.reply(200, self.bot_or_refuse(self.bot_guild_query("/community")))

    def handle_bot_setup(self):
        self.require("bot.read")
        self.reply(200, self.bot_or_refuse(self.bot_guild_query("/setup")))

    def handle_bot_level_save(self):
        actor = self.bot_actor()
        data = self.read_body()

        guild = str(data.get("guild") or "").strip()
        user = str(data.get("user") or "").strip()
        if not guild:
            raise Rejected(400, "Which server?")
        if not user:
            raise Rejected(400, "Which person?")

        payload = {"guild": guild, "user": user, "actor": actor}
        if data.get("reset") is True:
            payload["reset"] = True
        else:
            try:
                payload["xp"] = int(data.get("xp"))
            except (TypeError, ValueError):
                raise Rejected(400, "XP must be a whole number.")

        answer = self.bot_or_refuse("/levels", payload)
        audit.record(
            actor,
            "bot.levelChanged",
            {"guild": guild, "user": user, "xp": answer.get("xp"), "reset": answer.get("reset", False)},
            self.client_ip(),
        )
        log.warning("bot levels changed for %s on %s by %s", user, guild, actor)
        self.reply(200, answer)

    def handle_bot_giveaway_end(self):
        actor = self.bot_actor()
        data = self.read_body()

        guild = str(data.get("guild") or "").strip()
        identifier = str(data.get("id") or "").strip()
        if not guild:
            raise Rejected(400, "Which server?")
        if not identifier:
            raise Rejected(400, "Which giveaway?")

        reroll = data.get("reroll") is True
        answer = self.bot_or_refuse(
            "/giveaways/end", {"guild": guild, "id": identifier, "reroll": reroll, "actor": actor}
        )
        audit.record(
            actor,
            "bot.giveawayDrawn",
            {"guild": guild, "id": identifier, "reroll": reroll, "prize": answer.get("prize")},
            self.client_ip(),
        )
        log.warning("bot giveaway %s %s by %s", identifier, "rerolled" if reroll else "ended", actor)
        self.reply(200, answer)

    def handle_bot_setup_save(self):
        actor = self.bot_actor()
        data = self.read_body()

        guild = str(data.get("guild") or "").strip()
        section = str(data.get("section") or "").strip()
        patch = data.get("patch")
        if not guild:
            raise Rejected(400, "Which server?")
        if section not in BOT_SETUP_SECTIONS:
            raise Rejected(400, "Unknown setup section.")
        if not isinstance(patch, dict) or not patch:
            raise Rejected(400, "Nothing to change.")

        answer = self.bot_or_refuse(
            "/setup", {"guild": guild, "section": section, "patch": patch, "actor": actor}
        )
        audit.record(
            actor,
            "bot.setupChanged",
            {"guild": guild, "section": section, "changed": sorted(patch.keys())},
            self.client_ip(),
        )
        log.warning("bot setup %s changed on %s by %s", section, guild, actor)
        self.reply(200, answer)

    def handle_bot_actions(self):
        self.require("bot.read")
        limit = self.query("limit") or "50"
        self.reply(200, self.bot_or_refuse("/actions?limit=%s" % urllib.parse.quote(limit)))

    def handle_bot_presence(self):
        actor = self.bot_actor()
        data = self.read_body()

        if data.get("clear") is True:
            answer = self.bot_or_refuse("/presence", {"clear": True, "actor": actor})
            audit.record(actor, "bot.presenceCleared", None, self.client_ip())
            log.info("bot status cleared by %s", actor)
            self.reply(200, answer)
            return

        body = data.get("text")
        if not isinstance(body, str) or not body.strip():
            raise Rejected(400, "Give the status some text.")
        emoji = data.get("emoji")
        if emoji is not None and not isinstance(emoji, str):
            raise Rejected(400, "Send the emoji as text.")

        answer = self.bot_or_refuse(
            "/presence", {"text": body, "emoji": emoji or "", "actor": actor}
        )
        audit.record(actor, "bot.presenceSet", {"text": body[:128]}, self.client_ip())
        log.info("bot status set by %s", actor)
        self.reply(200, answer)

    def handle_bot_queue_close(self):
        actor = self.bot_actor()
        data = self.read_body()

        kind = str(data.get("kind") or "").strip()
        identifier = str(data.get("id") or "").strip()
        if kind not in BOT_QUEUES:
            raise Rejected(400, "Unknown queue.")
        if not identifier:
            raise Rejected(400, "Which one?")

        reason = data.get("reason")
        answer = self.bot_or_refuse(
            "/queues/close",
            {
                "kind": kind,
                "id": identifier,
                "reason": str(reason).strip()[:200] if isinstance(reason, str) else "",
                "actor": actor,
            },
        )
        audit.record(
            actor,
            "bot.queueClosed",
            {"kind": kind, "id": identifier, "number": (answer.get("entry") or {}).get("number")},
            self.client_ip(),
        )
        log.warning("bot %s %s closed by %s", kind, identifier, actor)
        self.reply(200, answer)

    def handle_bot_queue_delete(self):
        actor = self.bot_actor()
        data = self.read_body()

        kind = str(data.get("kind") or "").strip()
        identifier = str(data.get("id") or "").strip()
        if kind not in BOT_QUEUES:
            raise Rejected(400, "Unknown queue.")
        if not identifier:
            raise Rejected(400, "Which one?")

        answer = self.bot_or_refuse("/queues/delete", {"kind": kind, "id": identifier, "actor": actor})
        audit.record(
            actor,
            "bot.queueDeleted",
            {"kind": kind, "id": identifier, "number": answer.get("number")},
            self.client_ip(),
        )
        log.warning("bot %s record %s deleted by %s", kind, identifier, actor)
        self.reply(200, answer)

    def handle_bot_moderation(self):
        actor = self.bot_actor()
        data = self.read_body()

        guild = str(data.get("guild") or "").strip()
        action = str(data.get("action") or "").strip()
        if not guild:
            raise Rejected(400, "Which server?")
        if action not in BOT_MOD_ACTIONS:
            raise Rejected(400, "Unknown moderation action.")

        payload = {"guild": guild, "action": action, "actor": actor}
        for field in ("user", "channel", "reason"):
            value = data.get(field)
            if isinstance(value, str) and value.strip():
                payload[field] = value.strip()[:300]
        for field in ("minutes", "amount", "deleteDays"):
            if field in data:
                try:
                    payload[field] = int(data[field])
                except (TypeError, ValueError):
                    raise Rejected(400, "%s must be a whole number." % field)

        answer = self.bot_or_refuse("/moderation", payload)
        detail = {"guild": guild, "action": action}
        for field in ("user", "channel", "minutes", "amount"):
            if field in payload:
                detail[field] = payload[field]
        audit.record(actor, "bot.moderation", detail, self.client_ip())
        log.warning("bot moderation %s on %s by %s", action, guild, actor)
        alert(
            "lockout",
            "Moderation action from the panel",
            [
                ("By", actor),
                ("Action", action),
                ("Server", guild),
                ("Target", str(payload.get("user") or payload.get("channel") or "—")),
                ("When", stamp()),
            ],
        )
        self.reply(200, answer)

    def handle_bot_restart(self):
        actor = self.bot_actor()
        data = self.read_body()
        reason = data.get("reason")

        answer = self.bot_or_refuse(
            "/restart",
            {"actor": actor, "reason": str(reason).strip()[:200] if isinstance(reason, str) else ""},
        )
        audit.record(actor, "bot.restarted", None, self.client_ip())
        log.warning("bot restart requested by %s", actor)
        alert(
            "lockout",
            "Bot restarted from the panel",
            [("By", actor), ("When", stamp())],
        )
        self.reply(200, answer)

    def handle_brand_save(self):
        session = self.require("shield.manage")
        data = self.read_body()
        actor = session["record"]["name"]

        record = brands.save(data.get("slug"), data, actor)
        published, warning = publish_brands()
        audit.record(
            actor,
            "brand.saved",
            {"slug": record.get("slug"), "name": record.get("name"), "published": published},
            self.client_ip(),
        )
        log.info("shield brand %s saved by %s", record.get("slug"), actor)
        self.reply(200, {"brand": record, "published": published, "warning": warning})

    def handle_brand_delete(self):
        session = self.require("shield.manage")
        data = self.read_body()
        actor = session["record"]["name"]

        record = brands.delete(data.get("slug"))
        published, warning = publish_brands()
        audit.record(
            actor,
            "brand.deleted",
            {"slug": record.get("slug"), "name": record.get("name")},
            self.client_ip(),
        )
        log.warning("shield brand %s removed by %s", record.get("slug"), actor)
        self.reply(200, {"brand": record, "published": published, "warning": warning})

    def handle_brand_publish(self):
        session = self.require("shield.manage")
        published, warning = publish_brands()
        audit.record(
            session["record"]["name"], "brand.published", {"ok": published}, self.client_ip()
        )
        self.reply(200, {"published": published, "warning": warning, "at": stamp()})

    def handle_finding_save(self):
        session = self.require("security.read")
        data = self.read_body()
        actor = session["record"]["name"]

        record = findings.save(data.get("id"), data, actor)
        audit.record(
            actor,
            "finding.saved",
            {"id": record.get("id"), "title": record.get("title"), "verdict": record.get("verdict")},
            self.client_ip(),
        )
        self.reply(200, {"finding": record})

    def handle_finding_delete(self):
        session = self.require("security.read")
        data = self.read_body()
        actor = session["record"]["name"]

        identifier = str(data.get("id") or "").strip()[:32]
        if not identifier:
            raise Rejected(400, "Which finding?")

        record = findings.delete(identifier)
        audit.record(
            actor, "finding.deleted", {"id": identifier, "title": record.get("title")}, self.client_ip()
        )
        self.reply(200, {"finding": record})

    def handle_page_cover(self):
        session = self.require("pages.manage")
        data = self.read_body()
        actor = session["record"]["name"]

        record = maintenance.cover(
            data.get("path"),
            data.get("mode"),
            data.get("message"),
            actor,
            until=data.get("until"),
            tag=data.get("tag"),
        )
        audit.record(
            actor,
            "page.covered",
            {
                "path": record["path"],
                "mode": record["mode"],
                "message": record["message"],
                "until": record["until"],
            },
            self.client_ip(),
        )
        log.info("%s put %s under %s", actor, record["path"], record["mode"])
        self.reply(200, {"page": record})

    def handle_page_reopen(self):
        session = self.require("pages.manage")
        data = self.read_body()
        actor = session["record"]["name"]

        record = maintenance.reopen(data.get("path"))
        audit.record(actor, "page.reopened", {"path": record["path"]}, self.client_ip())
        log.info("%s reopened %s", actor, record["path"])
        self.reply(200, {"page": record})

    def board_actor(self):
        session = self.require_session()
        held = session["record"].get("permissions") or []
        if "boards.manage" in held:
            return session["record"]["name"], True
        if "boards.read" in held:
            return session["record"]["name"], False
        if "boards.own" in held:
            return session["record"]["name"], BOARD_OWN
        raise Rejected(403, "You do not have access to that.")

    @staticmethod
    def audience_kept(record, who):
        if not isinstance(who, list):
            return who
        if (record or {}).get("visibility") == "sealed":
            return "%d picked" % len(who)
        return list(who)

    @staticmethod
    def board_kept(record, detail):
        if (record or {}).get("visibility") != "sealed":
            return detail
        return {
            key: value
            for key, value in detail.items()
            if key
            in (
                "board",
                "visibility",
                "purpose",
                "fields",
                "archived",
                "cards",
                "kind",
                "on",
                "lead",
                "late",
                "who",
                "goes",
                "events",
            )
        }

    @staticmethod
    def board_mark(record):
        if (record or {}).get("visibility") == "sealed":
            return "a sealed board"
        return (record or {}).get("name")

    def board_known(self):
        return {entry.get("name") for entry in users.listing() if entry.get("name")}

    def board_generals(self, seated):
        held = {name.lower() for name in seated}
        return sorted(
            entry.get("name")
            for entry in users.listing()
            if entry.get("role") == "owner" and (entry.get("name") or "").lower() in held
        )

    def board_staff(self, seated):
        held = {name.lower() for name in seated}
        return sorted(
            entry.get("name")
            for entry in users.listing()
            if "boards.manage" in (entry.get("permissions") or ())
            and (entry.get("name") or "").lower() in held
        )


    def board_account(self, name):
        cleaned = str(name or "").strip()[:USER_LIMIT]
        if not cleaned or cleaned not in self.board_known():
            raise Rejected(400, "There is no account by that name.")
        return cleaned

    def handle_boards(self):
        actor, reach = self.board_actor()
        manage = reach is True
        own = reach == BOARD_OWN
        archived = self.query("archived", 8) in ("1", "true", "yes", "on")
        listing = boards.listing(actor, reach, archived=archived)
        owns = any(entry.get("seat") == "owner" for entry in listing)
        shown = (
            sorted(self.board_known())
            if manage or own or owns or self.allowed("users.read")
            else []
        )
        self.reply(
            200,
            {
                "boards": listing,
                "asks": boards.asked(actor),
                "archived": archived,
                "you": actor,
                "canManage": manage,
                "canCreate": manage or self.allowed("boards.own"),
                "canSeeTeam": not own,
                "accounts": shown,
                "colours": list(BOARD_COLOURS),
                "roles": list(BOARD_ROLES),
                "generals": self.board_generals(
                    set(shown) | {name for entry in listing for name in (entry.get("members") or {})}
                ),
                "staff": self.board_staff(
                    set(shown) | {name for entry in listing for name in (entry.get("members") or {})}
                ),
                "visibility": list(BOARD_OWN_VISIBILITY if own else BOARD_VISIBILITY),
                "purposes": board_purposes(),
                "keyholders": sorted(BOARD_KEYHOLDERS),
                "art": list(BOARD_ART_KINDS),
                "limits": {
                    "boards": BOARDS_MAX,
                    "cards": BOARD_CARDS_MAX,
                    "lists": BOARD_LISTS_MAX,
                    "members": BOARD_MEMBERS_MAX,
                    "art": BOARD_ART_MAX,
                    "file": BOARD_FILE_MAX,
                    "files": CARD_FILES_MAX,
                    "reminders": REMIND_STEPS_MAX,
                },
                "fileTypes": sorted(BOARD_FILE_TYPES),
                "remind": {
                    "who": list(REMIND_WHO),
                    "events": list(REMIND_EVENTS),
                    "aimed": list(REMIND_AIMED),
                    "sending": bool(BOT_URL and BOT_TOKEN),
                },
            },
        )

    def handle_board(self):
        actor, manage = self.board_actor()
        record = boards.board(self.query("id", 40), actor, manage)
        self.reply(
            200,
            {
                "board": record,
                "you": actor,
                "purposes": board_purposes(),
                "generals": self.board_generals(record.get("members") or {}),
                "staff": self.board_staff(record.get("members") or {}),
            },
        )

    def board_people(self, entries):
        if entries is None:
            return None
        if not isinstance(entries, list):
            raise Rejected(400, "Nobody was named.")
        if len(entries) > BOARD_MEMBERS_MAX:
            raise Rejected(400, "A board takes at most %d people." % BOARD_MEMBERS_MAX)
        known = self.board_known()
        out = []
        for entry in entries:
            held = {"name": entry} if isinstance(entry, str) else entry
            if not isinstance(held, dict):
                raise Rejected(400, "Nobody was named.")
            name = str(held.get("name") or "").strip()[:USER_LIMIT]
            if not name or name not in known:
                raise Rejected(400, "There is no account by that name.")
            out.append({"name": name, "role": held.get("role") or "editor"})
        return out

    def board_art_body(self, data):
        kind = str(data.get("kind") or "").strip().lower()
        if kind not in BOARD_ART_KINDS:
            raise Rejected(400, "Pick one of: %s." % ", ".join(BOARD_ART_KINDS))
        raw = data.get("data")
        if not isinstance(raw, str) or not raw.startswith("data:"):
            raise Rejected(400, "Send the image as a data URL.")
        head, _, encoded = raw.partition(",")
        if not encoded or ";base64" not in head:
            raise Rejected(400, "Send the image as a base64 data URL.")
        if len(encoded) > (BOARD_ART_MAX * 4) // 3 + 64:
            raise Rejected(413, "Keep the image under %d KB." % (BOARD_ART_MAX // 1024))
        try:
            blob = base64.b64decode(encoded, validate=True)
        except ValueError:
            raise Rejected(400, "That image could not be read.")
        return kind, head[5:].split(";", 1)[0].strip().lower(), blob, data.get("focus")

    @staticmethod
    def data_url(raw, ceiling, what):
        if not isinstance(raw, str) or not raw.startswith("data:"):
            raise Rejected(400, "Send the %s as a data URL." % what)
        head, _, encoded = raw.partition(",")
        if not encoded or ";base64" not in head:
            raise Rejected(400, "Send the %s as a base64 data URL." % what)
        if len(encoded) > (ceiling * 4) // 3 + 64:
            raise Rejected(413, "That %s is too large." % what)
        try:
            blob = base64.b64decode(encoded, validate=True)
        except ValueError:
            raise Rejected(400, "That %s could not be read." % what)
        return head[5:].split(";", 1)[0].strip().lower(), blob

    def card_file_body(self, data):
        held = self.data_url(data.get("data"), BOARD_FILE_MAX, "file")
        raw = data.get("thumb")
        return held, self.data_url(raw, BOARD_THUMB_MAX, "preview") if raw else None

    def handle_card_file_read(self):
        actor, manage = self.board_actor()
        entry, data = boards.attachment(
            self.query("id", 40),
            self.query("card", 40),
            self.query("file", 40),
            actor,
            manage,
            thumb=self.query("thumb", 4) == "1",
        )
        self.send_file(entry, data, download=self.query("get", 4) == "1")

    def handle_card_file_set(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        held, thumb = self.card_file_body(data)
        card = boards.attach_file(
            data.get("id"),
            data.get("card"),
            data.get("name"),
            held[0],
            held[1],
            actor,
            manage,
            thumb=thumb,
        )
        self.reply(200, {"card": card})

    def handle_card_file_delete(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        card = boards.remove_file(data.get("id"), data.get("card"), data.get("file"), actor, manage)
        self.reply(200, {"card": card})

    def handle_board_art_place(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        record = boards.place_art(data.get("id"), data.get("kind"), data.get("focus"), actor, manage)
        self.reply(200, {"board": record})

    def handle_board_face(self):
        self.require("boards.read")
        name = users.canonical(self.query("name", 64))
        if name is None:
            raise Rejected(404, "Not found.")

        state = users.discord_state(name)
        if state.get("linked") and state.get("id"):
            url = artwork.url(name, "avatar")
            if url is None:
                try:
                    answer = self.bot_or_refuse(
                        "/link/profile?user=%s" % urllib.parse.quote(state["id"])
                    )
                    profile = discord_profile(answer)
                    artwork.remember(
                        name, {key: value for key, value in profile["art"].items() if value}
                    )
                    url = profile["art"].get("avatar")
                except Rejected:
                    url = None
            if url is not None:
                fetched = artwork.blob(url)
                if fetched is not None:
                    self.send_blob(fetched[0], fetched[1])
                    return

        kind, blob = users.picture(name)
        self.send_blob(kind, blob)

    def handle_board_art_read(self):
        actor, manage = self.board_actor()
        kind, blob = boards.art(self.query("id", 40), self.query("kind", 16), actor, manage)
        self.send_blob(kind, blob)

    def handle_board_art_set(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        kind, content_type, blob, focus = self.board_art_body(data)
        record = boards.set_art(
            data.get("id"), kind, content_type, blob, actor, manage, focus=focus
        )
        audit.record(
            actor,
            "board.art",
            self.board_kept(
                record, {"board": record["id"], "name": record["name"], "kind": kind, "bytes": len(blob)}
            ),
            self.client_ip(),
        )
        self.reply(200, {"board": record})

    def handle_board_art_delete(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        kind = str(data.get("kind") or "").strip().lower()
        record = boards.drop_art(data.get("id"), kind, actor, manage)
        audit.record(
            actor,
            "board.artRemoved",
            self.board_kept(record, {"board": record["id"], "name": record["name"], "kind": kind}),
            self.client_ip(),
        )
        self.reply(200, {"board": record})

    def handle_board_create(self):
        actor, reach = self.board_actor()
        if reach is not True and not self.allowed("boards.own"):
            raise Rejected(403, "You do not have access to that.")
        data = self.read_body()
        record = boards.create(
            data.get("name"),
            data.get("note"),
            data.get("colour"),
            data.get("visibility"),
            actor,
            self.board_people(data.get("people")),
            purpose=data.get("purpose"),
            facts=data.get("facts"),
            manage=reach,
        )
        for entry in record.get("asks") or []:
            threading.Thread(
                target=board_ask_send,
                args=(entry.get("who"), record, actor, entry.get("role")),
                daemon=True,
            ).start()
        audit.record(
            actor,
            "board.created",
            self.board_kept(
                record,
                {
                    "board": record["id"],
                    "name": record["name"],
                    "visibility": record["visibility"],
                    "purpose": record["purpose"],
                },
            ),
            self.client_ip(),
        )
        log.info("%s created board %r", actor, self.board_mark(record))
        self.reply(200, {"board": record})

    def handle_board_update(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        changes = {
            key: data[key]
            for key in (
                "name",
                "note",
                "colour",
                "visibility",
                "purpose",
                "archived",
                "facts",
                "remind",
            )
            if key in data
        }
        record = boards.update(data.get("id"), changes, actor, manage)
        if "remind" in changes:
            setup = record["remind"]
            audit.record(
                actor,
                "board.reminders",
                self.board_kept(
                    record,
                    {
                        "board": record["id"],
                        "name": record["name"],
                        "on": setup["on"],
                        "lead": list(setup["lead"]),
                        "late": list(setup["late"]),
                        "who": self.audience_kept(record, setup["who"]),
                        "goes": {
                            thing: self.audience_kept(record, value)
                            for thing, value in setup["goes"].items()
                        },
                        "events": list(setup["events"]),
                    },
                ),
                self.client_ip(),
            )
        if "visibility" in changes or "archived" in changes or "purpose" in changes:
            audit.record(
                actor,
                "board.changed",
                self.board_kept(
                    record,
                    {
                        "board": record["id"],
                        "name": record["name"],
                        "visibility": record["visibility"],
                        "purpose": record["purpose"],
                        "archived": record["archived"],
                    },
                ),
                self.client_ip(),
            )
        if changes.get("facts"):
            audit.record(
                actor,
                "board.details",
                self.board_kept(
                    record,
                    {
                        "board": record["id"],
                        "name": record["name"],
                        "fields": sorted(str(key)[:32] for key in (changes["facts"] or {})),
                    },
                ),
                self.client_ip(),
            )
        self.reply(200, {"board": record})

    def handle_board_delete(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        removed = boards.remove(data.get("id"), actor, manage)
        audit.record(
            actor,
            "board.deleted",
            self.board_kept(
                removed,
                {"board": removed["id"], "name": removed["name"], "cards": removed["cards"]},
            ),
            self.client_ip(),
        )
        log.info(
            "%s deleted board %r with %d cards", actor, self.board_mark(removed), removed["cards"]
        )
        self.reply(200, {"deleted": True, "board": removed})

    def handle_board_member(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        if data.get("people") is not None:
            people = self.board_people(data.get("people"))
            record = boards.set_members(data.get("id"), people, actor, manage)
            audit.record(
                actor,
                "board.member",
                self.board_kept(
                    record,
                    {
                        "board": record["id"],
                        "name": record["name"],
                        "people": {entry["name"]: entry["role"] for entry in people},
                    },
                ),
                self.client_ip(),
            )
            self.reply(200, {"board": record})
            return

        name = self.board_account(data.get("name"))
        record = boards.set_member(data.get("id"), name, data.get("role"), actor, manage)
        audit.record(
            actor,
            "board.member",
            self.board_kept(
                record,
                {
                    "board": record["id"],
                    "name": record["name"],
                    "account": name,
                    "role": data.get("role"),
                },
            ),
            self.client_ip(),
        )
        self.reply(200, {"board": record})

    def handle_board_member_ask(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        name = self.board_account(data.get("name"))
        record = boards.invite_member(
            data.get("id"), name, data.get("role"), actor, manage, known=self.board_known()
        )
        audit.record(
            actor,
            "board.member",
            self.board_kept(
                record,
                {
                    "board": record["id"],
                    "name": record["name"],
                    "asked": name,
                    "role": data.get("role"),
                },
            ),
            self.client_ip(),
        )
        asked = next(
            (entry for entry in record.get("asks") or [] if entry.get("who") == name), {}
        )
        threading.Thread(
            target=board_ask_send, args=(name, record, actor, asked.get("role")), daemon=True
        ).start()
        self.reply(200, {"board": record})

    def handle_board_member_ask_cancel(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        record = boards.withdraw_member_invite(data.get("id"), data.get("name"), actor, manage)
        self.reply(200, {"board": record})

    def handle_board_member_ask_reply(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        result = boards.answer_ask(data.get("id"), actor, bool(data.get("accept")))
        audit.record(
            actor,
            "board.member",
            {
                "board": result["board"],
                "name": result["name"],
                "account": actor,
                "joined": result["joined"],
            },
            self.client_ip(),
        )
        if result.get("asked") and result["asked"] != actor:
            dm_account(
                result["asked"],
                "boardAssigned",
                str(result.get("name") or "")[:80],
                [("Board", result.get("name") or "—"), ("Who", actor)],
                board_link(result["board"]),
                eyebrow="joined a board" if result["joined"] else "turned a board down",
            )
        self.reply(200, {"joined": result["joined"], "board": result["board"]})

    def handle_board_member_remove(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        name = str(data.get("name") or "").strip()[:USER_LIMIT]
        record = boards.drop_member(data.get("id"), name, actor, manage)
        audit.record(
            actor,
            "board.memberRemoved",
            {"board": record.get("id"), "account": name},
            self.client_ip(),
        )
        self.reply(200, {"board": record} if not record.get("left") else {"left": True})

    def handle_board_list_create(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        self.reply(200, {"board": boards.add_list(data.get("id"), data.get("name"), actor, manage)})

    def handle_board_list_update(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        changes = {key: data[key] for key in ("name", "done", "cap") if key in data}
        record = boards.update_list(data.get("id"), data.get("list"), changes, actor, manage)
        self.reply(200, {"board": record})

    def handle_board_list_delete(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        self.reply(200, {"board": boards.remove_list(data.get("id"), data.get("list"), actor, manage)})

    def handle_board_list_move(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        record = boards.move_list(data.get("id"), data.get("list"), data.get("index"), actor, manage)
        self.reply(200, {"board": record})

    def handle_board_list_sort(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        record = boards.sort_list(data.get("id"), data.get("list"), data.get("by"), actor, manage)
        self.reply(200, {"board": record})

    def handle_board_remind_test(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        record = boards.board(data.get("id"), actor, manage)
        seen = {"id": record["id"], "name": record["name"], "remind": record["remind"]}
        linked = users.discord_state(actor)
        if not linked.get("linked"):
            raise Rejected(
                409, "Link your Discord under Your account before asking for a test."
            )
        if not linked.get("prefs", {}).get("boardDue"):
            raise Rejected(
                409,
                "Turn board reminders on under Your account → Discord and this will reach you.",
            )
        setup = seen["remind"]
        sent = dm_account(
            actor,
            "boardDue",
            "A test reminder from %s" % (seen["name"] or "a board")[:60],
            [
                ("Board", seen["name"]),
                ("Reminders", "on" if setup["on"] else "off — nothing real will send yet"),
                (
                    "Before it is due",
                    ", ".join(step_words(step) for step in setup["lead"]) or "nothing set",
                ),
                (
                    "After it is due",
                    ", ".join(step_words(step) for step in setup["late"]) or "nothing set",
                ),
                ("Goes to", who_words(remind_who(setup, "due"))),
            ]
            + aimed_apart(setup),
            board_link(seen["id"]),
            eyebrow="board reminder",
        )
        if not sent:
            raise Rejected(
                502, "Discord would not take the DM. Open a DM with the bot and try again."
            )
        self.reply(200, {"sent": True})

    def handle_board_card_create(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        result = boards.add_card(data.get("id"), data.get("list"), data.get("title"), actor, manage)
        self.reply(200, result)

    def handle_boards_mine(self):
        actor, manage = self.board_actor()
        self.reply(200, {"work": boards.assigned(actor, manage), "you": actor})

    def handle_boards_pulse(self):
        actor, manage = self.board_actor()
        self.reply(200, boards.pulse(actor, manage, watching=self.query("board", 40) or None))

    def handle_board_card_duplicate(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        self.reply(200, boards.duplicate_card(data.get("id"), data.get("card"), actor, manage))

    def handle_board_card_update(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        changes = {
            key: data[key]
            for key in ("title", "notes", "due", "assignees", "labels", "done", "archived")
            if key in data
        }
        watched = "assignees" in changes or "done" in changes
        was = boards.notice(data.get("id"), data.get("card")) if watched else None
        before = (was or {}).get("card") or {}
        card = boards.update_card(
            data.get("id"), data.get("card"), changes, actor, manage, known=self.board_known()
        )
        if watched:
            held = set(before.get("assignees") or [])
            added = [name for name in card.get("assignees") or [] if name not in held]
            if added:
                board_event(data.get("id"), data.get("card"), "assigned", actor, {"added": added})
            if card.get("done") and not before.get("done"):
                board_event(data.get("id"), data.get("card"), "done", actor)
        self.reply(200, {"card": card})

    def handle_board_card_move(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        was = boards.notice(data.get("id"), data.get("card"))
        record = boards.move_card(
            data.get("id"), data.get("card"), data.get("list"), data.get("index"), actor, manage
        )
        now = boards.notice(data.get("id"), data.get("card"))
        if was and now and (was.get("column") or "") != (now.get("column") or ""):
            board_event(
                data.get("id"),
                data.get("card"),
                "done" if (now.get("card") or {}).get("done") and not (was.get("card") or {}).get("done") else "moved",
                actor,
                {"body": "Moved from **%s** to **%s**." % (was.get("column") or "—", now.get("column") or "—")},
            )
        self.reply(200, {"board": record})

    def handle_board_card_delete(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        result = boards.remove_card(data.get("id"), data.get("card"), actor, manage)
        log.info("%s deleted card %r", actor, result["title"])
        self.reply(
            200, {"board": result["board"], "title": result["title"], "undo": result["undo"]}
        )

    def handle_board_card_undelete(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        result = boards.undelete_card(data.get("id"), data.get("card"), actor, manage)
        log.info("%s put back card %r", actor, (result["card"] or {}).get("title"))
        self.reply(200, result)

    def handle_board_cards_bulk(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        result = boards.bulk_cards(
            data.get("id"),
            data.get("cards"),
            data.get("action"),
            data.get("value"),
            actor,
            manage,
            known=self.board_known(),
        )
        log.info("%s ran %r over %d cards", actor, data.get("action"), result["changed"])
        self.reply(200, result)

    def handle_board_card_transfer(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        result = boards.transfer_card(
            data.get("id"), data.get("card"), data.get("to"), data.get("list"), actor, manage
        )
        board_event(
            result["to"]["id"],
            result["to"]["card"],
            "moved",
            actor,
            {"body": "Moved here from another board."},
        )
        self.reply(200, result)
    def handle_board_comment(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        card = boards.add_comment(data.get("id"), data.get("card"), data.get("body"), actor, manage)
        said = (card.get("comments") or [{}])[-1].get("body") or ""
        board_event(data.get("id"), data.get("card"), "comment", actor, {"body": said})
        self.reply(200, {"card": card})

    def handle_board_comment_delete(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        card = boards.remove_comment(
            data.get("id"), data.get("card"), data.get("comment"), actor, manage
        )
        self.reply(200, {"card": card})

    def handle_board_check(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        card = boards.add_check(data.get("id"), data.get("card"), data.get("text"), actor, manage)
        self.reply(200, {"card": card})

    def handle_board_check_update(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        changes = {key: data[key] for key in ("text", "done") if key in data}
        card = boards.set_check(
            data.get("id"), data.get("card"), data.get("step"), changes, actor, manage
        )
        self.reply(200, {"card": card})

    def handle_board_check_delete(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        card = boards.remove_check(data.get("id"), data.get("card"), data.get("step"), actor, manage)
        self.reply(200, {"card": card})

    def handle_board_link(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        card = boards.add_link(
            data.get("id"), data.get("card"), data.get("label"), data.get("url"), actor, manage
        )
        self.reply(200, {"card": card})

    def handle_board_link_delete(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        card = boards.remove_link(data.get("id"), data.get("card"), data.get("link"), actor, manage)
        self.reply(200, {"card": card})

    def handle_board_label(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        record = boards.set_label(
            data.get("id"), data.get("label"), data.get("name"), data.get("colour"), actor, manage
        )
        self.reply(200, {"board": record})

    def handle_board_label_delete(self):
        actor, manage = self.board_actor()
        data = self.read_body()
        record = boards.remove_label(data.get("id"), data.get("label"), actor, manage)
        self.reply(200, {"board": record})

    def firewall_payload(self):
        rules = firewall.listing()
        app_events = firewall_events.tail(FIREWALL_EDGE_SHOWN)
        edge_events = firewall_edge_events()
        events = sorted(
            app_events + edge_events, key=lambda entry: entry.get("at") or "", reverse=True
        )[:FIREWALL_EDGE_SHOWN]

        counts = {}
        for entry in app_events:
            identifier = entry.get("ruleId")
            if not identifier:
                continue
            tally = counts.setdefault(identifier, {"seen": 0, "blocked": 0, "last": None})
            tally["seen"] += 1
            if entry.get("action") == "blocked":
                tally["blocked"] += 1
            if not tally["last"] or (entry.get("at") or "") > tally["last"]:
                tally["last"] = entry.get("at")

        for rule in rules:
            tally = counts.get(rule["id"]) or {"seen": 0, "blocked": 0, "last": None}
            rule["seen"] = tally["seen"]
            rule["blocked"] = tally["blocked"]
            rule["lastSeen"] = tally["last"]

        blocked = len([entry for entry in events if entry.get("action") == "blocked"])
        address = self.client_ip()
        geo = firewall_geo()
        return {
            "rules": rules,
            "settings": firewall.settings(),
            "signatures": signature_catalogue(),
            "kinds": list(FIREWALL_KINDS),
            "modes": list(FIREWALL_MODES),
            "methods": list(FIREWALL_METHODS),
            "limit": FIREWALL_RULES_MAX,
            "events": events,
            "totals": {
                "rules": len(rules),
                "blocking": len([rule for rule in rules if rule["mode"] == "block" and rule["enabled"]]),
                "watching": len([rule for rule in rules if rule["mode"] == "monitor" and rule["enabled"]]),
                "off": len([rule for rule in rules if not rule["enabled"]]),
                "events": len(events),
                "blocked": blocked,
                "observed": len(events) - blocked,
            },
            "edge": firewall_apply_status(),
            "geo": {"available": geo is not None, "path": FIREWALL_GEO},
            "you": {"ip": address, "country": firewall_country(address)},
            "canManage": self.allowed("firewall.manage"),
        }

    def handle_firewall(self):
        self.require("firewall.read")
        self.reply(200, self.firewall_payload())

    def firewall_self_check(self, rule, force):
        if rule["mode"] != "block" or not rule["enabled"] or force:
            return
        address = self.client_ip()
        request = {
            "ip": address,
            "method": "GET",
            "target": "/admin",
            "agent": self.headers.get("User-Agent") or "",
            "body": None,
        }
        if firewall.matches(rule, request, firewall_country(address)):
            raise Rejected(
                409,
                "That rule matches the address you are signed in from — it would lock you "
                "out of the panel. Send it again with force to go ahead anyway.",
            )

    def handle_firewall_save(self):
        session = self.require("firewall.manage")
        data = self.read_body()
        actor = session["record"]["name"]

        kind = check_firewall_kind(data.get("kind"))
        self.firewall_self_check(
            {
                "kind": kind,
                "value": check_firewall_value(kind, data.get("value")),
                "mode": check_firewall_mode(data.get("mode")),
                "enabled": bool(data.get("enabled", True)),
            },
            bool(data.get("force")),
        )

        record = firewall.save(data.get("id"), data, actor)
        firewall_stage()
        audit.record(
            actor,
            "firewall.rule.saved",
            {
                "id": record["id"],
                "kind": record["kind"],
                "value": record["value"],
                "mode": record["mode"],
                "enabled": record["enabled"],
            },
            self.client_ip(),
        )
        log.info("%s saved firewall rule %s %s (%s)", actor, record["kind"], record["value"], record["mode"])
        self.reply(200, {"rule": record, "edge": firewall_apply_status()})

    def handle_firewall_delete(self):
        session = self.require("firewall.manage")
        data = self.read_body()
        actor = session["record"]["name"]
        identifier = str(data.get("id") or "").strip()
        if not identifier:
            raise Rejected(400, "Which rule?")

        record = firewall.delete(identifier)
        firewall_stage()
        audit.record(
            actor,
            "firewall.rule.deleted",
            {"id": identifier, "kind": record["kind"], "value": record["value"]},
            self.client_ip(),
        )
        log.info("%s removed firewall rule %s %s", actor, record["kind"], record["value"])
        self.reply(200, {"rule": record, "edge": firewall_apply_status()})

    def handle_firewall_settings(self):
        session = self.require("firewall.manage")
        data = self.read_body()
        actor = session["record"]["name"]

        settings = firewall.set_settings(data, actor)
        firewall_stage()
        audit.record(actor, "firewall.settings", dict(settings), self.client_ip())
        log.info("%s set the firewall to enabled=%s", actor, settings["enabled"])
        self.reply(200, {"settings": settings, "edge": firewall_apply_status()})

    def handle_firewall_restage(self):
        session = self.require("firewall.manage")
        actor = session["record"]["name"]
        if firewall_stage() is None:
            raise Rejected(500, "The firewall config could not be written.")
        audit.record(actor, "firewall.restaged", {}, self.client_ip())
        self.reply(200, {"edge": firewall_apply_status()})

    def handle_user_create(self):
        session = self.require("users.manage")
        data = self.read_body()

        chosen = data.get("password") or None
        role = str(data.get("role") or "viewer")
        name, secret, generated = users.create(
            data.get("name"),
            role,
            data.get("permissions"),
            session["record"]["name"],
            chosen,
            True if chosen is None else bool(data.get("mustChange", True)),
            data.get("note"),
            data.get("expires"),
            allow_owner=self.is_owner_session(session),
        )
        audit.record(
            session["record"]["name"],
            "user.created",
            {"name": name, "role": role},
            self.client_ip(),
        )
        log.info("account %s created by %s", name, session["record"]["name"])
        if role == "owner":
            audit.record(
                session["record"]["name"], "user.ownerGranted", {"name": name}, self.client_ip()
            )
            log.warning("account %s created as an owner by %s", name, session["record"]["name"])
        alert(
            "account",
            "New owner account" if role == "owner" else "Admin account created",
            [
                ("Account", name),
                ("Role", role),
                ("By", session["record"]["name"]),
                ("When", stamp()),
            ],
        )

        self.reply(201, {"name": name, "password": secret if generated else None, "generated": generated})

    def handle_user_update(self):
        session = self.require("users.manage")
        data = self.read_body()

        name = str(data.get("name") or "").strip()
        if not name:
            raise Rejected(400, "Which account?")
        if name == session["record"]["name"]:
            raise Rejected(400, "You cannot change your own role or access here.")

        changes = {}
        if "role" in data:
            changes["role"] = str(data.get("role") or "")
        if "permissions" in data:
            changes["permissions"] = data.get("permissions")
        if "disabled" in data:
            changes["disabled"] = bool(data.get("disabled"))
        if "note" in data:
            changes["note"] = data.get("note")
        if "expires" in data:
            changes["expires"] = data.get("expires")
        if not changes:
            raise Rejected(400, "Nothing to change.")

        before = users.find(name)
        was_owner = is_owner(before)
        users.update(name, changes, session["record"]["name"],
                     allow_owner=self.is_owner_session(session))
        audit.record(
            session["record"]["name"],
            "user.updated",
            {"name": name, "changes": sorted(changes)},
            self.client_ip(),
        )

        role = changes.get("role")
        if role == "owner" and not was_owner:
            audit.record(
                session["record"]["name"], "user.ownerGranted", {"name": name}, self.client_ip()
            )
            log.warning("%s made %s an owner", session["record"]["name"], name)
            alert(
                "account",
                "New owner",
                [
                    ("Account", name),
                    ("By", session["record"]["name"]),
                    ("Address", self.client_ip()),
                    ("When", stamp()),
                ],
            )
        elif was_owner and role is not None and role != "owner":
            audit.record(
                session["record"]["name"],
                "user.ownerRemoved",
                {"name": name, "role": role},
                self.client_ip(),
            )
            log.warning("%s took the owner role from %s", session["record"]["name"], name)
            alert(
                "account",
                "Owner role taken away",
                [
                    ("Account", name),
                    ("Now", role),
                    ("By", session["record"]["name"]),
                    ("When", stamp()),
                ],
            )

        self.reply(200, {"updated": True})

    def handle_user_password(self):
        session = self.require("users.manage")
        data = self.read_body()

        name = str(data.get("name") or "").strip()
        if not name:
            raise Rejected(400, "Which account?")
        if name == session["record"]["name"]:
            raise Rejected(400, "Change your own password under your account, with the current one.")

        chosen = data.get("password") or None
        must_change = True if chosen is None else bool(data.get("mustChange", True))

        secret, version = users.set_password(
            name,
            chosen,
            session["record"]["name"],
            must_change,
            allow_owner=self.is_owner_session(session),
        )
        audit.record(session["record"]["name"], "user.password", {"name": name}, self.client_ip())
        log.info("password for %s set by %s", name, session["record"]["name"])
        self.reply(200, {"name": name, "password": secret if chosen is None else None, "generated": chosen is None})

    def handle_user_sign_out(self):
        session = self.require("users.manage")
        data = self.read_body()

        name = str(data.get("name") or "").strip()
        if not name:
            raise Rejected(400, "Which account?")
        if name == session["record"]["name"]:
            raise Rejected(400, "Use sign out for your own session.")
        self.not_over_an_owner(session, name)

        version = users.bump_version(name)
        audit.record(session["record"]["name"], "user.signedOut", {"name": name}, self.client_ip())
        log.info("sessions for %s ended by %s", name, session["record"]["name"])
        self.reply(200, {"name": name, "tokenVersion": version})

    def handle_user_delete(self):
        session = self.require("users.manage")
        data = self.read_body()

        name = str(data.get("name") or "").strip()
        if not name:
            raise Rejected(400, "Which account?")
        if name == session["record"]["name"]:
            raise Rejected(400, "You cannot remove your own account.")

        removed = users.find(name)
        users.delete(name, allow_owner=self.is_owner_session(session))
        boards.forget_account(name)
        audit.record(session["record"]["name"], "user.deleted", {"name": name}, self.client_ip())
        if is_owner(removed):
            audit.record(
                session["record"]["name"], "user.ownerRemoved", {"name": name}, self.client_ip()
            )
            log.warning("owner account %s removed by %s", name, session["record"]["name"])
            alert(
                "account",
                "Owner account removed",
                [
                    ("Account", name),
                    ("By", session["record"]["name"]),
                    ("Address", self.client_ip()),
                    ("When", stamp()),
                ],
            )
        log.info("account %s removed by %s", name, session["record"]["name"])
        self.reply(200, {"deleted": True})

    def handle_hook_save(self):
        session = self.require("api.keys")
        data = self.read_body()
        holder = session["record"]["name"]

        wanted = data.get("events")
        if isinstance(wanted, list) and "unknown" in wanted and not self.allowed("api.read"):
            wanted = [entry for entry in wanted if entry != "unknown"]

        fmt = str(data.get("format") or "")
        address = data.get("url")
        try:
            admin_hooks.guard(address, fmt)
        except admin_hooks.HookError as failure:
            raise Rejected(400, failure.message)

        state = users.set_hook(holder, fmt, address, wanted, data.get("enabled", True))
        hooks.forget()
        audit.record(
            holder,
            "hook.saved",
            {"format": state.get("format"), "events": state.get("events")},
            self.client_ip(),
        )
        log.info("%s set an api webhook (%s)", holder, state.get("format"))
        self.reply(200, {"webhook": state})

    def handle_hook_test(self):
        session = self.require("api.keys")
        holder = session["record"]["name"]
        state = users.hook_state(holder)
        if not state.get("configured"):
            raise Rejected(404, "There is no address saved yet.")
        if not admin_hooks.tests.take(holder):
            raise Rejected(429, "That is a lot of tests in a short time. Give it a minute.")

        stored = {
            "format": state.get("format"),
            "url": state.get("url"),
            "secret": state.get("secret"),
        }

        try:
            answered = admin_hooks.send(stored, [admin_hooks.sample_event(holder)], True)
        except admin_hooks.HookError as failure:
            users.note_hook(holder, False, failure.message)
            self.reply(200, {"sent": False, "message": failure.message,
                             "webhook": users.hook_state(holder)})
            return

        users.note_hook(holder, True)
        audit.record(holder, "hook.tested", {"format": stored["format"]}, self.client_ip())
        self.reply(
            200,
            {
                "sent": True,
                "status": answered,
                "message": "Sent — it should be there now.",
                "webhook": users.hook_state(holder),
            },
        )

    def handle_hook_delete(self):
        session = self.require("api.keys")
        holder = session["record"]["name"]
        users.clear_hook(holder)
        hooks.forget()
        audit.record(holder, "hook.removed", None, self.client_ip())
        self.reply(200, {"webhook": users.hook_state(holder)})

    def handle_embed_save(self):
        session = self.require("api.keys")
        data = self.read_body()
        holder = session["record"]["name"]

        wanted = data.get("events")
        if isinstance(wanted, list) and "unknown" in wanted and not self.allowed("api.read"):
            wanted = [entry for entry in wanted if entry != "unknown"]

        address = data.get("url")
        try:
            admin_hooks.guard(address, "discord")
        except admin_hooks.HookError as failure:
            raise Rejected(400, failure.message)

        state = users.set_embed(holder, address, data.get("template"), wanted, data.get("enabled", True))
        hooks.forget()
        audit.record(holder, "embed.saved", {"events": state.get("events")}, self.client_ip())
        log.info("%s set an api embed webhook", holder)
        self.reply(200, {"embed": state})

    def handle_embed_test(self):
        session = self.require("api.keys")
        holder = session["record"]["name"]
        state = users.embed_state(holder)
        if not state.get("configured"):
            raise Rejected(404, "There is no address saved yet.")
        if not admin_hooks.tests.take(holder):
            raise Rejected(429, "That is a lot of tests in a short time. Give it a minute.")

        stored = {"url": state.get("url"), "template": state.get("template")}
        try:
            answered = admin_hooks.send_embed(stored, [admin_hooks.sample_event(holder)], True)
        except admin_hooks.HookError as failure:
            users.note_embed(holder, False, failure.message)
            self.reply(200, {"sent": False, "message": failure.message,
                             "embed": users.embed_state(holder)})
            return

        users.note_embed(holder, True)
        audit.record(holder, "embed.tested", None, self.client_ip())
        self.reply(
            200,
            {
                "sent": True,
                "status": answered,
                "message": "Sent — it should be there now.",
                "embed": users.embed_state(holder),
            },
        )

    def handle_embed_delete(self):
        session = self.require("api.keys")
        holder = session["record"]["name"]
        users.clear_embed(holder)
        hooks.forget()
        audit.record(holder, "embed.removed", None, self.client_ip())
        self.reply(200, {"embed": users.embed_state(holder)})

    def handle_embed_preview(self):
        self.require("api.keys")
        data = self.read_body()
        try:
            template = check_embed_template(data.get("template"))
        except StoreError as failure:
            raise Rejected(failure.status, failure.message)
        sample = admin_hooks.sample_event(self.require_session()["record"]["name"])
        self.reply(200, {"preview": admin_hooks.as_embed(template, [sample], False), "template": template})

    def notify_key(self, action, record, identifier, actor):
        holder = None
        if isinstance(record, dict):
            holder = record.get("owner")
        if not holder:
            return
        named = (record.get("name") if isinstance(record, dict) else None) or identifier
        hooks.notify(
            {
                "at": stamp(),
                "kind": "changed",
                "id": identifier,
                "key": named,
                "owner": holder,
                "ip": self.client_ip(),
                "actor": actor,
                "action": action,
            }
        )


    def key_scope(self, manage):
        if manage:
            session = self.require("api.manage")
            return session, None
        session = self.require("api.keys")
        return session, session["record"]["name"]

    def wanted_key(self, data):
        identifier = str(data.get("id") or "").strip()[:64]
        if not identifier:
            raise Rejected(400, "Which key?")
        return identifier

    def handle_key_create(self, manage):
        session, owner = self.key_scope(manage)
        data = self.read_body()
        actor = session["record"]["name"]

        holder = owner or actor
        if manage:
            asked = str(data.get("owner") or "").strip()
            if asked and asked != actor:
                holder = self.known_account(asked)

        identifier, key, record = tokens.create(
            data.get("name"),
            data.get("scopes"),
            str(data.get("environment") or "live"),
            data.get("expires") or None,
            actor,
            owner=holder,
            note=data.get("note"),
            rate=data.get("rate") if manage else None,
            managed=manage and holder != actor,
            allowed=data.get("allowed"),
        )
        audit.record(
            actor,
            "token.created",
            {
                "id": identifier,
                "name": record.get("name"),
                "owner": record.get("owner"),
                "scopes": record.get("scopes"),
            },
            self.client_ip(),
        )
        log.info("api key %s created by %s for %s", identifier, actor, holder)
        self.notify_key("token.created", record, identifier, actor)
        alert(
            "token",
            "API key created",
            [
                ("Key", record.get("name") or identifier),
                ("Owner", record.get("owner") or "—"),
                ("Scopes", ", ".join(record.get("scopes") or []) or "—"),
                ("By", actor),
                ("When", stamp()),
            ],
        )

        self.reply(201, {"token": record, "key": key})

    def handle_key_update(self, manage):
        session, owner = self.key_scope(manage)
        data = self.read_body()
        actor = session["record"]["name"]
        identifier = self.wanted_key(data)

        changes = {}
        for field in ("name", "note", "scopes", "expires", "allowed"):
            if field in data:
                changes[field] = data.get(field)
        if manage and "rate" in data:
            changes["rate"] = data.get("rate")
        if manage and "owner" in data:
            changes["owner"] = self.known_account(data.get("owner"))
        if not changes:
            raise Rejected(400, "Nothing to change.")

        record = tokens.update(identifier, changes, actor, owner)
        audit.record(
            actor,
            "token.updated",
            {"id": identifier, "name": record.get("name"), "owner": record.get("owner"),
             "fields": sorted(changes)},
            self.client_ip(),
        )
        self.notify_key("token.updated", record, identifier, actor)
        self.reply(200, {"token": record})

    def handle_key_rotate(self, manage):
        session, owner = self.key_scope(manage)
        data = self.read_body()
        actor = session["record"]["name"]
        identifier = self.wanted_key(data)

        key, record = tokens.rotate(identifier, actor, owner)
        audit.record(
            actor,
            "token.rotated",
            {"id": identifier, "name": record.get("name"), "owner": record.get("owner")},
            self.client_ip(),
        )
        log.info("api key %s rotated by %s", identifier, actor)
        alert(
            "token",
            "API key rotated",
            [
                ("Key", record.get("name") or identifier),
                ("Owner", record.get("owner") or "—"),
                ("By", actor),
                ("When", stamp()),
            ],
        )
        self.notify_key("token.rotated", record, identifier, actor)
        self.reply(200, {"token": record, "key": key})

    def handle_key_revoke(self, manage):
        session, owner = self.key_scope(manage)
        data = self.read_body()
        actor = session["record"]["name"]
        identifier = self.wanted_key(data)

        record = tokens.revoke(identifier, actor, owner)
        detail = record if isinstance(record, dict) else {}
        audit.record(
            actor,
            "token.revoked",
            {"id": identifier, "name": detail.get("name"), "owner": detail.get("owner")},
            self.client_ip(),
        )
        self.notify_key("token.revoked", detail, identifier, actor)
        self.reply(200, {"revoked": True})

    def handle_key_restore(self, manage):
        session, owner = self.key_scope(manage)
        data = self.read_body()
        actor = session["record"]["name"]
        identifier = self.wanted_key(data)

        record = tokens.restore(identifier, actor, owner)
        audit.record(
            actor,
            "token.restored",
            {"id": identifier, "name": record.get("name"), "owner": record.get("owner")},
            self.client_ip(),
        )
        self.notify_key("token.restored", record, identifier, actor)
        self.reply(200, {"token": record})

    def handle_key_delete(self, manage):
        session, owner = self.key_scope(manage)
        data = self.read_body()
        actor = session["record"]["name"]
        identifier = self.wanted_key(data)

        record = tokens.delete(identifier, owner)
        detail = record if isinstance(record, dict) else {}
        audit.record(
            actor,
            "token.deleted",
            {"id": identifier, "name": detail.get("name"), "owner": detail.get("owner")},
            self.client_ip(),
        )
        self.notify_key("token.deleted", detail, identifier, actor)
        self.reply(200, {"deleted": True})


    def log_message(self, fmt, *args):
        pass

def ask_password():
    password = getpass.getpass("Password: ")
    if len(password) < 12:
        print("Use at least 12 characters.", file=sys.stderr)
        return None
    if password != getpass.getpass("Repeat password: "):
        print("Those did not match.", file=sys.stderr)
        return None
    return password


def make_owner():
    try:
        if users.has_owner():
            print(
                "There is already an owner account. Use --set-password <account> to reset it.",
                file=sys.stderr,
            )
            return 1
    except StoreError as failure:
        print(failure.message, file=sys.stderr)
        return 1

    user = input("Username: ").strip()
    if not user:
        print("A username is required.", file=sys.stderr)
        return 1

    password = ask_password()
    if password is None:
        return 1

    try:
        name = users.bootstrap_owner(user, password)
    except StoreError as failure:
        print(failure.message, file=sys.stderr)
        return 1

    audit.record("console", "user.created", {"name": name, "role": "owner"}, None)
    print()
    print("Owner account %s created in the store." % name)
    if len(ADMIN_SECRET) < 32:
        print("Add this to /etc/amitista/admin.env, then restart the service:")
        print()
        print("ADMIN_SECRET=%s" % secrets.token_hex(32))
    return 0


def check_owner():
    try:
        return 0 if users.has_owner() else 1
    except StoreError:
        return 1


def make_secret():
    print("ADMIN_SECRET=%s" % secrets.token_hex(32))
    print("Replacing it in /etc/amitista/admin.env signs everyone out.", file=sys.stderr)
    return 0


def set_password(name):
    if not name:
        print("Usage: admin_api.py --set-password <account>", file=sys.stderr)
        return 1
    try:
        if users.find(name) is None:
            print("There is no account called %s." % name, file=sys.stderr)
            return 1
    except StoreError as failure:
        print(failure.message, file=sys.stderr)
        return 1

    password = ask_password()
    if password is None:
        return 1

    try:
        users.set_password(name, password, "console", False, force=True)
    except StoreError as failure:
        print(failure.message, file=sys.stderr)
        return 1

    audit.record("console", "user.password", {"name": name}, None)
    print("Password set for %s. Their existing sessions have ended." % name)
    return 0

def clear_two_factor(name):
    if not name:
        print("Usage: admin_api.py --clear-2fa <account>", file=sys.stderr)
        return 1
    state = users.totp_state(name)
    if not state.get("enabled") and not state.get("pending"):
        print("Two-step is not set up for %s." % name, file=sys.stderr)
        return 1
    try:
        users.disable_totp(name)
    except StoreError as failure:
        print(failure.message, file=sys.stderr)
        return 1
    audit.record("console", "twofactor.cleared", {"name": name}, None)
    print("Two-step cleared for %s. Their sessions have ended; they sign in with the password alone." % name)
    return 0


def argument_after(flag):
    position = sys.argv.index(flag)
    return sys.argv[position + 1] if len(sys.argv) > position + 1 else ""


def main():
    if "--credentials" in sys.argv:
        sys.exit(make_owner())

    if "--check-owner" in sys.argv:
        sys.exit(check_owner())

    if "--secret" in sys.argv:
        sys.exit(make_secret())

    if "--set-password" in sys.argv:
        sys.exit(set_password(argument_after("--set-password")))

    if "--clear-2fa" in sys.argv:
        sys.exit(clear_two_factor(argument_after("--clear-2fa")))

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s", stream=sys.stdout)

    if len(ADMIN_SECRET) < 32:
        log.warning("ADMIN_SECRET is not a 32-character secret — answering 503 until it is")
    elif not configured():
        log.warning("no owner account in the store — run admin_api.py --credentials as root")

    if not os.path.exists(FIREWALL_CONF):
        if firewall_stage() is None:
            log.warning("could not stage %s — the edge firewall will not load", FIREWALL_CONF)

    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
    server.daemon_threads = True

    hooks.start()
    reminders.start()

    def stop(signum, frame):
        log.info("shutting down")
        hooks.stop()
        reminders.stop()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    log.info("listening on %s:%s", LISTEN_HOST, LISTEN_PORT)
    server.serve_forever()
    server.server_close()

if __name__ == "__main__":
    main()
