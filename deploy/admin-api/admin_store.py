#!/usr/bin/env python3

import base64
import fnmatch
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import struct
import tempfile
import threading
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

SCRYPT_N = 16384
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_LEN = 32
SCRYPT_MAXMEM = 64 * 1024 * 1024
SALT_BYTES = 16

MIN_PASSWORD = 12
MAX_PASSWORD = 512
MIN_DISTINCT = 6

BANNED_PASSWORDS = (
    "amitista",
    "password",
    "qwerty",
    "letmein",
    "welcome",
    "admin123",
    "123456",
    "iloveyou",
    "changeme",
)
MAX_NAME = 64
MAX_NOTE = 500

TOKEN_SCHEME = "amk"
TOKEN_BODY_BYTES = 24
PREFIX_KEEP = 13

PERMISSIONS = (
    "overview.read",
    "releases.read",
    "services.read",
    "security.read",
    "users.read",
    "users.manage",
    "api.keys",
    "api.read",
    "api.manage",
    "shield.read",
    "shield.manage",
    "bot.read",
    "bot.manage",
    "support.manage",
    "orders.read",
    "orders.manage",
    "orders.files",
    "pages.manage",
    "firewall.read",
    "firewall.manage",
    "boards.read",
    "boards.own",
    "boards.manage",
    "c2c.logs",
    "transcripts.read",
    "transcripts.manage",
    "developer.read",
    "github.read",
    "github.security",
)

DEFAULT_ROLES = {
    "owner": set(PERMISSIONS),
    "admin": {
        "overview.read",
        "releases.read",
        "services.read",
        "security.read",
        "users.read",
        "api.keys",
        "api.read",
        "api.manage",
        "shield.read",
        "shield.manage",
        "bot.read",
        "bot.manage",
        "support.manage",
        "orders.read",
        "orders.manage",
        "orders.files",
        "firewall.read",
        "firewall.manage",
        "boards.read",
        "boards.manage",
        "c2c.logs",
        "transcripts.read",
        "transcripts.manage",
    },
    "dev": {
        "overview.read",
        "releases.read",
        "services.read",
        "orders.read",
        "api.keys",
        "api.read",
        "shield.read",
        "bot.read",
        "firewall.read",
        "boards.read",
        "boards.manage",
        "transcripts.read",
        "developer.read",
        "github.read",
        },
    "viewer": {
        "overview.read",
        "api.keys",
        "shield.read",
        "boards.read",
    },
}

LOCKED_ROLES = ("owner",)

RESERVED_ROLES = ("owner", "custom")

MAX_ROLES = 12

ROLE_NAME = re.compile(r"^[a-z][a-z0-9-]{1,15}$")

ROLES = {name: set(granted) for name, granted in DEFAULT_ROLES.items()}


def check_role_name(name):
    cleaned = str(name or "").strip().lower()
    if not ROLE_NAME.match(cleaned):
        raise StoreError(
            "A role name is 2 to 16 characters: lowercase letters, numbers and dashes."
        )
    return cleaned


def role_table(stored):
    table = {name: set(granted) for name, granted in DEFAULT_ROLES.items()}
    for name, granted in (stored or {}).items():
        if name in LOCKED_ROLES or not isinstance(granted, list):
            continue
        table[name] = {entry for entry in granted if entry in PERMISSIONS}
    table["owner"] = set(PERMISSIONS)
    return table


SCOPES = ("api.index", "api.shield", "api.status")

SCOPE_ROUTES = {
    "api.index": ["/api/k/v1"],
    "api.shield": ["/api/k/v1/shield", "/api/k/v1/shield/rules"],
    "api.status": ["/api/k/v1/status"],
}

GATEWAY_FREE = ["/api/k/whoami"]

RATE_DEFAULT = 120
RATE_WINDOW = 60
MAX_RATE = 6000
KEYS_PER_OWNER = 25
MAX_ALLOWED_IPS = 24

DISCORD_ID = re.compile(r"^\d{17,20}$")
DISCORD_PREFS = {
    "signin": False,
    "boardDue": True,
    "boardAssigned": True,
    "boardComment": True,
    "boardMoved": True,
}
DISCORD_HELD_BY_QUIET = ("boardDue",)
DISCORD_NICK_MAX = 32
QUIET_OFFSET_MAX = 840

BRAND_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,31}$")
BRAND_NAME = re.compile(r"^[A-Za-z0-9 .,'&()’-]{2,48}$")
BRAND_ACCENT = re.compile(r"^#[0-9a-fA-F]{6}$")
BRANDS_MAX = 100
BRAND_ACCENT_DEFAULT = "#e0245e"

FINDING_VERDICTS = ("open", "false-positive", "confirmed", "accepted")
FINDINGS_MAX = 400
FINDING_TITLE_MAX = 160
FINDING_SOURCE_MAX = 80
FINDING_WHY_MAX = 1000

PAGE_MODES = ("maintenance", "closed")
PAGE_PATH = re.compile(r"^/[a-z0-9/-]*$")
PAGE_PATH_MAX = 80
PAGE_MESSAGE_MAX = 200
PAGE_TAG_MAX = 24
PAGE_UNTIL_DAYS = 365
PAGES_MAX = 200
RESERVED_PAGES = ("/admin", "/block")

FIREWALL_KINDS = ("ip", "country", "agent", "path", "method", "signature")
FIREWALL_EDGE_KINDS = ("ip", "country")
FIREWALL_MODES = ("monitor", "block")
FIREWALL_RULES_MAX = 500
FIREWALL_NOTE_MAX = 200
FIREWALL_VALUE_MAX = 200
FIREWALL_PREFIXES_MAX = 60000
FIREWALL_EVENTS_KEEP = 500
FIREWALL_EVENTS_SWEEP = 50
FIREWALL_HIT_FLUSH = 5
FIREWALL_METHODS = (
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
    "TRACE",
    "CONNECT",
)
COUNTRY_CODE = re.compile(r"^[A-Z]{2}$")

SET_BY_ADMIN = "Whoever runs the panel set what this key may read and when it ends. Ask them to change it."
REVOKED_BY_ADMIN = "Whoever runs the panel revoked this key. Only they can bring it back."
HELD_BY_ADMIN = "Whoever runs the panel issued this key. Ask them to remove it."

RESERVED_NAMES = {"", ".", "..", "owner", "root"}

LAST_OWNER = "Make someone else an owner first. The panel must always keep one owner who can sign in."

AUDIT_KEEP = 4000
AUDIT_SWEEP_EVERY = 250

TOTP_STEP = 30
TOTP_DIGITS = 6
TOTP_DRIFT = 1
TOTP_SECRET_BYTES = 20
TOTP_ISSUER = "Amitista"

RECOVERY_COUNT = 10
RECOVERY_BYTES = 5

HOOK_FORMATS = ("discord", "slack", "generic")

HOOK_EVENTS = ("used", "newIp", "denied", "limited", "revoked", "expired", "changed", "unknown")

HOOK_DEFAULT_EVENTS = ("newIp", "denied", "limited", "revoked", "expired", "changed")

HOOK_ADMIN_EVENTS = ("unknown",)

HOOK_HOSTS = {
    "discord": ("discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"),
    "slack": ("hooks.slack.com",),
}

HOOK_URL_MAX = 500
HOOK_FAIL_LIMIT = 10
HOOK_SECRET_BYTES = 24

EMBED_TITLE_MAX = 200
EMBED_BODY_MAX = 1500
EMBED_LABEL_MAX = 80
EMBED_VALUE_MAX = 400
EMBED_FOOTER_MAX = 120
EMBED_FIELDS_MAX = 10

EMBED_PLACEHOLDERS = (
    "event",
    "key",
    "id",
    "ip",
    "method",
    "path",
    "status",
    "action",
    "actor",
    "detail",
    "at",
    "owner",
    "summary",
    "count",
)

EMBED_DEFAULT = {
    "title": "API — {event}",
    "colour": "#7c3aed",
    "body": "{summary}",
    "fields": [
        {"label": "Key", "value": "{key}"},
        {"label": "Address", "value": "{ip}"},
        {"label": "Path", "value": "{method} {path}"},
    ],
    "footer": "amitista.com",
    "perEvent": True,
}


class StoreError(Exception):

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def now_iso(stamp=None):
    moment = datetime.fromtimestamp(stamp if stamp is not None else time.time(), timezone.utc)
    return moment.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def b64encode(raw):
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def b64decode(text):
    padded = text + "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_LEN,
        maxmem=SCRYPT_MAXMEM,
    )
    return "scrypt$%d$%d$%d$%s$%s" % (SCRYPT_N, SCRYPT_R, SCRYPT_P, b64encode(salt), b64encode(digest))


def verify_password(encoded, password):
    try:
        scheme, n, r, p, salt, expected = encoded.split("$")
        if scheme != "scrypt":
            return False
        salt_bytes = b64decode(salt)
        expected_bytes = b64decode(expected)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt_bytes,
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected_bytes),
            maxmem=SCRYPT_MAXMEM,
        )
    except (ValueError, TypeError, MemoryError, base64.binascii.Error):
        return False
    return hmac.compare_digest(actual, expected_bytes)


def hash_token(key):
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def mint_token(environment):
    body = secrets.token_urlsafe(TOKEN_BODY_BYTES)
    return "%s_%s_%s" % (TOKEN_SCHEME, environment, body)


def check_password(password, name=None):
    if not isinstance(password, str) or len(password) < MIN_PASSWORD:
        raise StoreError("Use at least %d characters." % MIN_PASSWORD)
    if len(password) > MAX_PASSWORD:
        raise StoreError("That password is too long.")
    if password.strip() != password:
        raise StoreError("Do not start or end the password with a space.")
    if len(set(password)) < MIN_DISTINCT:
        raise StoreError("Use at least %d different characters." % MIN_DISTINCT)
    folded = password.casefold()
    if name and str(name).casefold() in folded:
        raise StoreError("Keep the account name out of the password.")
    for banned in BANNED_PASSWORDS:
        if banned in folded:
            raise StoreError("That password contains something too easy to guess.")
    return password


def check_name(name):
    cleaned = (name or "").strip()
    if not cleaned or len(cleaned) > MAX_NAME:
        raise StoreError("Pick a name between 1 and %d characters." % MAX_NAME)
    if cleaned.lower() in RESERVED_NAMES:
        raise StoreError("That name is reserved.")
    for character in cleaned:
        if not (character.isalnum() or character in "-_."):
            raise StoreError("Use letters, numbers, dots, dashes and underscores only.")
    return cleaned


def b32encode(raw):
    return base64.b32encode(raw).decode("ascii").rstrip("=")


def b32decode(text):
    cleaned = "".join(str(text or "").split()).upper()
    cleaned += "=" * (-len(cleaned) % 8)
    return base64.b32decode(cleaned.encode("ascii"))


def totp_secret():
    return b32encode(secrets.token_bytes(TOTP_SECRET_BYTES))


def totp_uri(secret, account, issuer=TOTP_ISSUER):
    label = "%s:%s" % (issuer, account)
    return "otpauth://totp/%s?secret=%s&issuer=%s&algorithm=SHA1&digits=%d&period=%d" % (
        urllib.parse.quote(label, safe=""),
        secret,
        urllib.parse.quote(issuer, safe=""),
        TOTP_DIGITS,
        TOTP_STEP,
    )


def totp_at(secret, counter):
    digest = hmac.new(b32decode(secret), struct.pack(">Q", int(counter)), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return "%0*d" % (TOTP_DIGITS, value % (10 ** TOTP_DIGITS))


def totp_check(secret, code, now=None, seen=0):
    cleaned = "".join(character for character in str(code or "") if character.isdigit())
    if len(cleaned) != TOTP_DIGITS or not secret:
        return None
    moment = time.time() if now is None else now
    counter = int(moment // TOTP_STEP)
    for drift in range(-TOTP_DRIFT, TOTP_DRIFT + 1):
        step = counter + drift
        if step <= int(seen or 0):
            continue
        try:
            candidate = totp_at(secret, step)
        except (ValueError, TypeError, base64.binascii.Error):
            return None
        if hmac.compare_digest(candidate, cleaned):
            return step
    return None


def make_recovery_codes():
    return ["%s-%s" % (secrets.token_hex(RECOVERY_BYTES)[:5], secrets.token_hex(RECOVERY_BYTES)[:5])
            for _ in range(RECOVERY_COUNT)]


def recovery_fingerprint(code):
    cleaned = "".join(str(code or "").split()).lower()
    return hashlib.sha256(cleaned.encode("utf-8")).hexdigest()


def check_google_email(value):
    if not isinstance(value, str):
        raise StoreError("That is not an email address.")
    cleaned = value.strip().lower()
    if not cleaned:
        raise StoreError("Enter the Google address to link.")
    if len(cleaned) > 254:
        raise StoreError("That email address is too long.")
    if cleaned.count("@") != 1:
        raise StoreError("That is not an email address.")
    local, _, domain = cleaned.partition("@")
    if not local or not domain or "." not in domain:
        raise StoreError("That is not an email address.")
    if any(char.isspace() for char in cleaned):
        raise StoreError("That is not an email address.")
    return cleaned


def google_public(link):
    if not isinstance(link, dict) or not link.get("email"):
        return {"linked": False, "email": None, "since": None, "lastUsed": None, "confirmed": False}
    return {
        "linked": True,
        "email": link.get("email"),
        "since": link.get("since"),
        "lastUsed": link.get("lastUsed"),
        "confirmed": bool(link.get("sub")),
    }


def check_discord_identity(value):
    if not isinstance(value, dict):
        raise StoreError("That is not a Discord account.")
    identifier = str(value.get("id") or "").strip()
    if not DISCORD_ID.match(identifier):
        raise StoreError("That is not a Discord account.")
    username = str(value.get("username") or "").strip()[:64]
    tag = str(value.get("tag") or "").strip()[:64] or username or identifier
    display = str(value.get("displayName") or "").strip()[:64] or username
    avatar = str(value.get("avatar") or "").strip()[:300]
    if not avatar.startswith("https://cdn.discordapp.com/"):
        avatar = ""
    return {
        "id": identifier,
        "tag": tag,
        "username": username,
        "displayName": display,
        "avatar": avatar,
    }


def check_minute(value, label):
    try:
        minute = int(value)
    except (TypeError, ValueError):
        raise StoreError("%s is not a time of day." % label)
    if not 0 <= minute < 1440:
        raise StoreError("%s is not a time of day." % label)
    return minute


def check_quiet(value):
    if value is None:
        return None
    if not isinstance(value, dict):
        raise StoreError("That is not a quiet-hours window.")
    if not value.get("on"):
        return None
    start = check_minute(value.get("from"), "The start of quiet hours")
    end = check_minute(value.get("to"), "The end of quiet hours")
    if start == end:
        raise StoreError("Quiet hours that start and end at the same minute would never let a reminder through.")
    try:
        offset = int(value.get("offset") or 0)
    except (TypeError, ValueError):
        raise StoreError("That is not a time zone.")
    if abs(offset) > QUIET_OFFSET_MAX:
        raise StoreError("That is not a time zone.")
    return {"from": start, "to": end, "offset": offset}


def in_quiet(quiet, stamp):
    if not isinstance(quiet, dict):
        return False
    minute = int((float(stamp) + quiet.get("offset", 0) * 60) % 86400) // 60
    start = quiet.get("from")
    end = quiet.get("to")
    if not isinstance(start, int) or not isinstance(end, int) or start == end:
        return False
    if start < end:
        return start <= minute < end
    return minute >= start or minute < end


def check_discord_prefs(value):
    if not isinstance(value, dict):
        raise StoreError("That is not a set of preferences.")
    wanted = {
        name: bool(value.get(name, fallback)) for name, fallback in DISCORD_PREFS.items()
    }
    events = value.get("events")
    if events is None:
        wanted["events"] = []
    elif isinstance(events, (list, tuple)):
        chosen = set(events)
        wanted["events"] = [entry for entry in HOOK_EVENTS if entry in chosen]
    else:
        raise StoreError("That is not a list of events.")
    wanted["quiet"] = check_quiet(value.get("quiet"))
    return wanted


def discord_prefs(link):
    stored = link.get("prefs") if isinstance(link, dict) else None
    if not isinstance(stored, dict):
        stored = {}
    out = {
        name: bool(stored.get(name, fallback)) for name, fallback in DISCORD_PREFS.items()
    }
    events = stored.get("events")
    if not isinstance(events, (list, tuple)):
        events = ["changed"] if stored.get("keys") else []
    chosen = set(events)
    out["events"] = [entry for entry in HOOK_EVENTS if entry in chosen]
    quiet = stored.get("quiet")
    out["quiet"] = quiet if isinstance(quiet, dict) and "from" in quiet and "to" in quiet else None
    return out


def discord_public(link):
    if not isinstance(link, dict) or not link.get("id"):
        return {
            "linked": False,
            "id": None,
            "tag": None,
            "username": None,
            "displayName": None,
            "since": None,
            "seen": None,
            "prefs": discord_prefs(None),
        }
    return {
        "linked": True,
        "id": link.get("id"),
        "tag": link.get("tag"),
        "username": link.get("username"),
        "displayName": link.get("displayName"),
        "since": link.get("since"),
        "seen": link.get("seen"),
        "prefs": discord_prefs(link),
    }


def check_note(value):
    if value is None or value == "":
        return ""
    if not isinstance(value, str):
        raise StoreError("That note is not text.")
    cleaned = value.strip()
    if len(cleaned) > MAX_NOTE:
        raise StoreError("Keep the note under %d characters." % MAX_NOTE)
    return cleaned


def hook_secret():
    return secrets.token_urlsafe(HOOK_SECRET_BYTES)


def check_hook_format(value):
    chosen = str(value or "").strip().lower()
    if chosen not in HOOK_FORMATS:
        raise StoreError("Pick Discord, Slack or a plain endpoint.")
    return chosen


def check_hook_events(values):
    if not isinstance(values, (list, tuple)):
        raise StoreError("Say which events to send.")
    wanted = {entry for entry in values if entry in HOOK_EVENTS}
    if not wanted:
        raise StoreError("Pick at least one thing to be told about.")
    return [entry for entry in HOOK_EVENTS if entry in wanted]


def check_hook_url(value, fmt):
    url = check_text(value, "address")
    if not url:
        raise StoreError("Paste the address the message should go to.")
    if len(url) > HOOK_URL_MAX:
        raise StoreError("That address is too long.")

    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https":
        raise StoreError("The address has to start with https://.")
    if parts.username or parts.password:
        raise StoreError("Leave the username and password out of the address.")
    if parts.port is not None and parts.port != 443:
        raise StoreError("Only the standard https port is allowed.")

    host = (parts.hostname or "").strip().lower()
    if not host:
        raise StoreError("That address has no host in it.")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise StoreError("Give a hostname, not an IP address.")
    if "." not in host or host.endswith((".local", ".internal", ".localhost")):
        raise StoreError("That is not an address the internet can reach.")

    allowed = HOOK_HOSTS.get(fmt)
    if allowed is not None and host not in allowed:
        raise StoreError("A %s hook has to be a %s address." % (fmt, allowed[0]))
    if fmt == "discord" and "/api/webhooks/" not in parts.path:
        raise StoreError("That is not a Discord webhook address — copy it from the channel settings.")
    if fmt == "slack" and not parts.path.startswith("/services/"):
        raise StoreError("That is not a Slack webhook address — copy it from the app settings.")

    return url


def check_embed_text(value, what, limit):
    text = check_text(value, what)
    if len(text) > limit:
        raise StoreError("The %s is too long — keep it under %d characters." % (what, limit))
    return text


def check_embed_template(value):
    if value is None:
        return dict(EMBED_DEFAULT, fields=[dict(entry) for entry in EMBED_DEFAULT["fields"]])
    if not isinstance(value, dict):
        raise StoreError("That is not an embed.")

    colour = str(value.get("colour") or EMBED_DEFAULT["colour"]).strip()
    if not BRAND_ACCENT.match(colour):
        raise StoreError("Pick a colour like #7c3aed.")

    fields = []
    given = value.get("fields")
    if given is not None and not isinstance(given, (list, tuple)):
        raise StoreError("That is not a list of fields.")
    for entry in given or []:
        if not isinstance(entry, dict):
            raise StoreError("That is not a field.")
        label = check_embed_text(entry.get("label"), "field name", EMBED_LABEL_MAX)
        body = check_embed_text(entry.get("value"), "field", EMBED_VALUE_MAX)
        if not label or not body:
            continue
        fields.append({"label": label, "value": body})
    if len(fields) > EMBED_FIELDS_MAX:
        raise StoreError("Discord allows %d fields at most." % EMBED_FIELDS_MAX)

    title = check_embed_text(value.get("title"), "title", EMBED_TITLE_MAX)
    body = check_embed_text(value.get("body"), "description", EMBED_BODY_MAX)
    footer = check_embed_text(value.get("footer"), "footer", EMBED_FOOTER_MAX)

    if not title and not body and not fields:
        raise StoreError("Give the embed a title, some words or at least one field.")

    return {
        "title": title,
        "colour": colour.lower(),
        "body": body,
        "fields": fields,
        "footer": footer,
        "perEvent": bool(value.get("perEvent", True)),
    }


def embed_public(hook, holder=None):
    blank = not isinstance(hook, dict) or not hook.get("url")
    template = None if blank else hook.get("template")
    return {
        "configured": not blank,
        "enabled": bool(not blank and hook.get("enabled")),
        "url": "" if blank else (hook.get("url") or ""),
        "events": list(HOOK_DEFAULT_EVENTS)
        if blank
        else [entry for entry in HOOK_EVENTS if entry in (hook.get("events") or [])],
        "template": check_embed_template(template) if isinstance(template, dict) else dict(
            EMBED_DEFAULT, fields=[dict(entry) for entry in EMBED_DEFAULT["fields"]]
        ),
        "paused": bool(not blank and hook.get("paused")),
        "failures": 0 if blank else int(hook.get("failures") or 0),
        "sent": 0 if blank else int(hook.get("sent") or 0),
        "lastOk": None if blank else hook.get("lastOk"),
        "lastFail": None if blank else hook.get("lastFail"),
        "lastError": None if blank else hook.get("lastError"),
        "updated": None if blank else hook.get("updated"),
        "owner": holder,
    }


def hook_public(hook, holder=None):
    if not isinstance(hook, dict) or not hook.get("url"):
        return {
            "configured": False,
            "enabled": False,
            "format": "discord",
            "url": "",
            "events": list(HOOK_DEFAULT_EVENTS),
            "secret": None,
            "paused": False,
            "failures": 0,
            "sent": 0,
            "lastOk": None,
            "lastFail": None,
            "lastError": None,
            "updated": None,
        }
    return {
        "configured": True,
        "enabled": bool(hook.get("enabled")),
        "format": hook.get("format") or "generic",
        "url": hook.get("url") or "",
        "events": [entry for entry in HOOK_EVENTS if entry in (hook.get("events") or [])],
        "secret": hook.get("secret") if (hook.get("format") == "generic") else None,
        "paused": bool(hook.get("paused")),
        "failures": int(hook.get("failures") or 0),
        "sent": int(hook.get("sent") or 0),
        "lastOk": hook.get("lastOk"),
        "lastFail": hook.get("lastFail"),
        "lastError": hook.get("lastError"),
        "updated": hook.get("updated"),
        "owner": holder,
    }


def check_expiry(value):
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise StoreError("That expiry is not a date.")
    cleaned = value.strip()[:10]
    try:
        datetime.strptime(cleaned, "%Y-%m-%d")
    except ValueError:
        raise StoreError("Use a date like 2026-12-31.")
    return cleaned


def today_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def is_expired(record):
    stamp = (record or {}).get("expires")
    if not stamp:
        return False
    return str(stamp) < today_iso()


def is_owner(record):
    return (record or {}).get("role") == "owner"


def owner_can_sign_in(record):
    return is_owner(record) and not (record or {}).get("disabled") and not is_expired(record)


def resolve_permissions(role, explicit):
    if role in ROLES:
        granted = set(ROLES[role])
    else:
        granted = {name for name in (explicit or []) if name in PERMISSIONS}
    if "api.manage" in granted:
        granted.add("api.keys")
    return sorted(granted)


class JsonFile:

    def __init__(self, path, empty, mode=0o600, group=None, sealer=None):
        self.path = path
        self.empty = empty
        self.mode = mode
        self.group = group
        self.sealer = sealer
        self.lock = threading.RLock()

    def read(self):
        try:
            with open(self.path, encoding="utf-8") as handle:
                payload = json.load(handle)
        except FileNotFoundError:
            return json.loads(json.dumps(self.empty))
        except (OSError, ValueError):
            raise StoreError("The stored data could not be read.", 500)
        if not isinstance(payload, dict):
            return json.loads(json.dumps(self.empty))

        wrapped = "sealed" in payload
        if self.sealer is None:
            if wrapped:
                raise StoreError(
                    "%s is sealed but no vault is configured to open it." % self.path, 500
                )
            return payload

        if not wrapped:
            if self.blank(payload):
                return payload
            raise StoreError(
                "%s is still in the clear while a vault is configured — run "
                "migrate_store_to_vault.py before starting." % self.path,
                500,
            )
        return self.sealer.unseal(payload)

    @staticmethod
    def blank(payload):
        return not any(payload.get(key) for key in ("users", "tokens"))

    def write(self, payload):
        directory = os.path.dirname(self.path)
        os.makedirs(directory, exist_ok=True)
        on_disk = self.sealer.seal(payload) if self.sealer is not None else payload
        handle = tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=directory, prefix=".store-", suffix=".tmp", delete=False
        )
        try:
            json.dump(on_disk, handle, separators=(",", ":"), sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
            handle.close()
            os.chmod(handle.name, self.mode)
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

    def update(self, mutate):
        with self.lock:
            payload = self.read()
            result = mutate(payload)
            self.write(payload)
            return result


class JsonlLog:

    def __init__(self, path, keep, sweep, mode=0o600, group=None):
        self.path = path
        self.keep = keep
        self.sweep = sweep
        self.mode = mode
        self.group = group
        self.lock = threading.Lock()
        self.written = 0

    def trim(self):
        try:
            with open(self.path, encoding="utf-8") as handle:
                lines = handle.readlines()
        except (OSError, ValueError):
            return
        if len(lines) <= self.keep:
            return

        directory = os.path.dirname(self.path)
        handle = tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=directory, prefix=".log-", suffix=".tmp", delete=False
        )
        try:
            handle.writelines(lines[-self.keep :])
            handle.flush()
            os.fsync(handle.fileno())
            handle.close()
            os.chmod(handle.name, self.mode)
            os.replace(handle.name, self.path)
        except BaseException:
            try:
                os.unlink(handle.name)
            except OSError:
                pass

    def append(self, entry):
        line = json.dumps(entry, separators=(",", ":"), sort_keys=True)
        with self.lock:
            try:
                os.makedirs(os.path.dirname(self.path), exist_ok=True)
                existed = os.path.exists(self.path)
                with open(self.path, "a", encoding="utf-8") as handle:
                    handle.write(line + "\n")
                if not existed:
                    os.chmod(self.path, self.mode)
            except OSError:
                return None

            self.written += 1
            if self.sweep > 0 and self.written % self.sweep == 0:
                self.trim()
        return entry

    def tail(self, limit=100):
        try:
            with open(self.path, encoding="utf-8") as handle:
                lines = handle.readlines()
        except (OSError, ValueError):
            return []

        if self.keep and len(lines) > self.keep:
            lines = lines[-self.keep :]

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


def store_backend():
    return os.environ.get("ADMIN_BACKEND", "json").strip().lower() or "json"


def doc_name(path):
    base = os.path.basename(path)
    for suffix in (".json", ".jsonl"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break
    return base or "store"


def open_doc(path, empty, mode=0o600, group=None, sealer=None):
    if store_backend() == "mongo":
        from mongo_store import MongoDoc

        return MongoDoc(doc_name(path), empty, sealer)
    return JsonFile(path, empty, mode, group, sealer)


def open_log(path, keep, sweep, mode=0o600, group=None):
    if store_backend() == "mongo":
        from mongo_store import MongoLog

        return MongoLog(doc_name(path), keep, sweep)
    return JsonlLog(path, keep, sweep, mode, group)


class Audit:

    def __init__(self, path, mode=0o600):
        self.log = open_log(path, AUDIT_KEEP, AUDIT_SWEEP_EVERY, mode)

    def record(self, actor, action, detail=None, ip=None):
        entry = {
            "at": now_iso(),
            "actor": actor,
            "action": action,
            "detail": detail or {},
            "ip": ip,
        }
        return self.log.append(entry)

    def tail(self, limit=100):
        return self.log.tail(limit)


PICTURE_TYPES = {
    "image/png": (".png", (b"\x89PNG\r\n\x1a\n",)),
    "image/jpeg": (".jpg", (b"\xff\xd8\xff",)),
    "image/webp": (".webp", (b"RIFF",)),
    "image/gif": (".gif", (b"GIF87a", b"GIF89a")),
}
# Projects an account has hidden from its own "Your projects" list. Personal to
# the holder, not a state on the project: staff still see everything, and the
# same person sees the same list on any machine they sign in from.
HIDDEN_PROJECTS_MAX = 300
HIDDEN_PROJECT_ID = re.compile(r"^\d{17,20}$")


def hidden_projects_list(value):
    out = []
    for entry in value if isinstance(value, list) else []:
        wanted = str(entry or "").strip()
        if HIDDEN_PROJECT_ID.match(wanted) and wanted not in out:
            out.append(wanted)
        if len(out) >= HIDDEN_PROJECTS_MAX:
            break
    return out


PICTURE_MAX = 256 * 1024


def check_picture_blob(content_type, blob):
    kind = str(content_type or "").lower().split(";", 1)[0].strip()
    known = PICTURE_TYPES.get(kind)
    if known is None:
        raise StoreError("Use a PNG, JPEG, WebP or GIF image.")
    if not isinstance(blob, (bytes, bytearray)) or not blob:
        raise StoreError("That image is empty.")
    data = bytes(blob)
    if len(data) > PICTURE_MAX:
        raise StoreError("Keep the picture under %d KB." % (PICTURE_MAX // 1024))
    if not any(data.startswith(magic) for magic in known[1]):
        raise StoreError("That file is not the image it says it is.")
    if kind == "image/webp" and data[8:12] != b"WEBP":
        raise StoreError("That file is not the image it says it is.")
    return kind, known[0], data


def picture_public(held):
    if not isinstance(held, dict) or not held.get("hash"):
        return {"set": False, "hash": None, "at": None, "bytes": 0, "type": None}
    return {
        "set": True,
        "hash": held.get("hash"),
        "at": held.get("at"),
        "bytes": held.get("bytes") or 0,
        "type": held.get("type"),
    }


class Users:

    def __init__(self, path, group=None, sealer=None, art_dir=None):
        self.file = open_doc(path, {"version": 1, "users": {}}, 0o600, group, sealer)
        self.group = group
        self.art_dir = art_dir or os.path.join(os.path.dirname(path) or ".", "account-art")

    def _stored_roles(self, payload):
        stored = payload.get("roles")
        if not isinstance(stored, dict):
            stored = {}
            payload["roles"] = stored
        return stored

    def refresh_roles(self):
        try:
            stored = self._stored_roles(self.file.read())
        except StoreError:
            stored = {}
        table = role_table(stored)
        ROLES.clear()
        ROLES.update(table)
        return table

    def roles(self):
        return self.refresh_roles()

    def save_role(self, name, permissions, actor):
        cleaned = check_role_name(name)
        if cleaned in LOCKED_ROLES:
            raise StoreError("The owner role always holds everything.")
        if cleaned == "custom":
            raise StoreError("Custom is not a role you can edit.")
        granted = sorted({entry for entry in (permissions or []) if entry in PERMISSIONS})
        if not granted:
            raise StoreError("Give the role at least one permission.")

        def mutate(payload):
            stored = self._stored_roles(payload)
            fresh = cleaned not in stored and cleaned not in DEFAULT_ROLES
            if fresh and len(role_table(stored)) >= MAX_ROLES:
                raise StoreError("There is room for %d roles." % MAX_ROLES)
            stored[cleaned] = granted
            for record in self._records(payload).values():
                if isinstance(record, dict) and record.get("role") == cleaned:
                    record["permissions"] = list(granted)
                    record["updated"] = now_iso()
                    record["updatedBy"] = actor
            return None

        self.file.update(mutate)
        self.refresh_roles()
        return cleaned, granted

    def delete_role(self, name, actor):
        cleaned = check_role_name(name)
        if cleaned in LOCKED_ROLES:
            raise StoreError("The owner role cannot be removed.")

        def mutate(payload):
            stored = self._stored_roles(payload)
            builtin = cleaned in DEFAULT_ROLES
            if cleaned not in stored and not builtin:
                raise StoreError("No such role.", 404)
            if not builtin:
                held = sorted(
                    entry
                    for entry, record in self._records(payload).items()
                    if isinstance(record, dict) and record.get("role") == cleaned
                )
                if held:
                    raise StoreError(
                        "%s still %s that role."
                        % (", ".join(held[:3]), "holds" if len(held) == 1 else "hold")
                    )
            stored.pop(cleaned, None)
            if builtin:
                for record in self._records(payload).values():
                    if isinstance(record, dict) and record.get("role") == cleaned:
                        record["permissions"] = sorted(DEFAULT_ROLES[cleaned])
                        record["updated"] = now_iso()
                        record["updatedBy"] = actor
            return None

        self.file.update(mutate)
        self.refresh_roles()
        return cleaned, cleaned in DEFAULT_ROLES

    def _records(self, payload):
        records = payload.get("users")
        if not isinstance(records, dict):
            records = {}
            payload["users"] = records
        return records

    @staticmethod
    def _merge(name, record):
        merged = dict(record)
        role = merged.get("role") or "viewer"
        merged["name"] = name
        merged["role"] = role
        merged["permissions"] = resolve_permissions(role, merged.get("permissions"))
        merged["protected"] = role == "owner"
        return merged

    def _owner_name(self, records):
        for name, record in sorted(records.items()):
            if isinstance(record, dict) and is_owner(record):
                return name
        return None

    def _last_owner(self, records, name):
        for other, record in records.items():
            if other != name and isinstance(record, dict) and owner_can_sign_in(record):
                return False
        return True

    def has_owner(self):
        return self._owner_name(self._records(self.file.read())) is not None

    def owners(self):
        records = self._records(self.file.read())
        return sorted(name for name, record in records.items()
                      if isinstance(record, dict) and is_owner(record))

    def public(self, name, record):
        return {
            "name": name,
            "role": record.get("role") or "viewer",
            "permissions": record.get("permissions") or [],
            "disabled": bool(record.get("disabled")),
            "created": record.get("created"),
            "createdBy": record.get("createdBy"),
            "updated": record.get("updated"),
            "updatedBy": record.get("updatedBy"),
            "lastSignIn": record.get("lastSignIn"),
            "lastIp": record.get("lastIp"),
            "mustChange": bool(record.get("mustChange")),
            "protected": bool(record.get("protected")),
            "passwordChanged": record.get("passwordChanged"),
            "note": record.get("note") or "",
            "expires": record.get("expires"),
            "expired": is_expired(record),
            "twoFactor": bool((record.get("totp") or {}).get("confirmed")),
            "google": google_public(record.get("google")),
            "discord": discord_public(record.get("discord")),
            "picture": picture_public(record.get("picture")),
        }

    def canonical(self, name):
        wanted = str(name or "").strip()
        if not wanted:
            return None
        records = self._records(self.file.read())
        record = records.get(wanted)
        if isinstance(record, dict):
            return wanted
        lowered = wanted.lower()
        for key in sorted(records):
            if key.lower() == lowered and isinstance(records[key], dict):
                return key
        return None

    def find(self, name):
        if not name:
            return None
        record = self._records(self.file.read()).get(name)
        if not isinstance(record, dict):
            return None
        return self._merge(name, record)

    def listing(self):
        out = []
        for name, record in sorted(self._records(self.file.read()).items()):
            if not isinstance(record, dict):
                continue
            out.append(self.public(name, self._merge(name, record)))
        out.sort(key=lambda entry: (entry["role"] != "owner", entry["name"]))
        return out

    def count(self):
        return len(self._records(self.file.read()))

    def bootstrap_owner(self, name, password):
        cleaned = check_name(name)
        secret = check_password(password, cleaned)

        def mutate(payload):
            records = self._records(payload)
            existing = self._owner_name(records)
            if existing is not None:
                raise StoreError("There is already an owner account (%s)." % existing)
            if cleaned in records:
                raise StoreError("That name is already taken.")
            records[cleaned] = {
                "password": hash_password(secret),
                "role": "owner",
                "permissions": sorted(ROLES["owner"]),
                "disabled": False,
                "tokenVersion": 1,
                "created": now_iso(),
                "createdBy": None,
                "lastSignIn": None,
                "lastIp": None,
                "mustChange": False,
                "note": "",
                "expires": None,
                "passwordChanged": now_iso(),
            }
            return cleaned

        return self.file.update(mutate)

    def create(self, name, role, permissions, actor, password=None, must_change=True, note=None,
               expires=None, allow_owner=False):
        cleaned = check_name(name)
        if role not in ROLES and role != "custom":
            raise StoreError("Pick a role.")
        if role == "owner" and not allow_owner:
            raise StoreError("Only an owner can make another owner.", 403)

        remark = check_note(note)
        until = check_expiry(expires)
        if until is not None and until < today_iso():
            raise StoreError("That expiry has already passed.")

        generated = password is None
        secret = secrets.token_urlsafe(12) if generated else check_password(password, cleaned)

        def mutate(payload):
            records = self._records(payload)
            lowered = cleaned.lower()
            for existing in records:
                if existing == cleaned or existing.lower() == lowered:
                    raise StoreError("That name is already taken.")
            records[cleaned] = {
                "password": hash_password(secret),
                "role": role,
                "permissions": resolve_permissions(role, permissions),
                "disabled": False,
                "tokenVersion": 1,
                "created": now_iso(),
                "createdBy": actor,
                "lastSignIn": None,
                "lastIp": None,
                "mustChange": True if generated else bool(must_change),
                "note": remark,
                "expires": until,
                "passwordChanged": now_iso(),
            }
            return records[cleaned]

        self.file.update(mutate)
        return cleaned, secret, generated

    def update(self, name, changes, actor, allow_owner=False):
        def mutate(payload):
            records = self._records(payload)
            record = records.get(name)
            if not isinstance(record, dict):
                raise StoreError("No such account.", 404)
            was_owner = is_owner(record)
            if was_owner and not allow_owner:
                raise StoreError("Only an owner can change another owner.", 403)

            if "role" in changes:
                role = changes["role"]
                if role == "owner" and not allow_owner:
                    raise StoreError("Only an owner can make another owner.", 403)
                if role not in ROLES and role != "custom":
                    raise StoreError("Pick a role.")
                record["role"] = role
                record["permissions"] = resolve_permissions(role, changes.get("permissions", record.get("permissions")))
            elif "permissions" in changes:
                record["permissions"] = resolve_permissions(record.get("role"), changes["permissions"])

            if "note" in changes:
                record["note"] = check_note(changes["note"])

            if "expires" in changes:
                until = check_expiry(changes["expires"])
                record["expires"] = until
                if until is not None and until < today_iso():
                    record["tokenVersion"] = int(record.get("tokenVersion") or 1) + 1

            if "disabled" in changes:
                disabled = bool(changes["disabled"])
                if disabled != bool(record.get("disabled")):
                    record["disabled"] = disabled
                    record["tokenVersion"] = int(record.get("tokenVersion") or 1) + 1

            if was_owner and not owner_can_sign_in(record) and self._last_owner(records, name):
                raise StoreError(LAST_OWNER, 409)

            record["updated"] = now_iso()
            record["updatedBy"] = actor
            return dict(record)

        return self.file.update(mutate)

    def set_password(self, name, password, actor, must_change, force=False, allow_owner=False):
        secret = secrets.token_urlsafe(12) if password is None else check_password(password, name)

        def mutate(payload):
            records = self._records(payload)
            record = records.get(name)
            if not isinstance(record, dict):
                raise StoreError("No such account.", 404)
            if is_owner(record) and not (force or allow_owner):
                raise StoreError("Only an owner can set another owner's password.", 403)

            record["password"] = hash_password(secret)
            record["tokenVersion"] = int(record.get("tokenVersion") or 1) + 1
            record["mustChange"] = bool(must_change)
            record["updated"] = now_iso()
            record["updatedBy"] = actor
            record["passwordChanged"] = now_iso()
            return int(record["tokenVersion"])

        version = self.file.update(mutate)
        return secret, version

    def change_own_password(self, name, password):
        secret = check_password(password, name)

        def mutate(payload):
            records = self._records(payload)
            record = records.get(name)
            if not isinstance(record, dict):
                raise StoreError("No such account.", 404)
            record["password"] = hash_password(secret)
            record["tokenVersion"] = int(record.get("tokenVersion") or 1) + 1
            record["mustChange"] = False
            record["updated"] = now_iso()
            record["passwordChanged"] = now_iso()
            return int(record["tokenVersion"])

        return self.file.update(mutate)

    def delete(self, name, allow_owner=False):
        gone = {}

        def mutate(payload):
            records = self._records(payload)
            record = records.get(name)
            if not isinstance(record, dict):
                raise StoreError("No such account.", 404)
            if is_owner(record):
                if not allow_owner:
                    raise StoreError("Only an owner can remove another owner.", 403)
                if self._last_owner(records, name):
                    raise StoreError(LAST_OWNER, 409)

            gone["picture"] = record.get("picture")
            del records[name]
            return True

        done = self.file.update(mutate)
        self._picture_unlink(name, gone.get("picture"))
        return done

    def _holder(self, payload, name):
        record = self._records(payload).get(name)
        if not isinstance(record, dict):
            raise StoreError("No such account.", 404)
        return record

    def start_totp(self, name):
        secret = totp_secret()

        def mutate(payload):
            holder = self._holder(payload, name)
            holder["totp"] = {"secret": secret, "confirmed": False, "seen": 0, "recovery": []}
            return secret

        self.file.update(mutate)
        return secret, totp_uri(secret, name)

    def confirm_totp(self, name, code):
        codes = make_recovery_codes()

        def mutate(payload):
            holder = self._holder(payload, name)
            state = holder.get("totp")
            if not isinstance(state, dict) or not state.get("secret"):
                raise StoreError("Start the setup again.", 409)
            if state.get("confirmed"):
                raise StoreError("Two-step is already on for this account.", 409)
            step = totp_check(state["secret"], code, seen=state.get("seen"))
            if step is None:
                raise StoreError("That code is not right. Check your app's clock.")
            state["confirmed"] = True
            state["seen"] = step
            state["since"] = now_iso()
            state["recovery"] = [recovery_fingerprint(entry) for entry in codes]
            holder["tokenVersion"] = int(holder.get("tokenVersion") or 1) + 1
            return True

        self.file.update(mutate)
        return codes

    def verify_totp(self, name, code):
        def mutate(payload):
            holder = self._holder(payload, name)
            state = holder.get("totp")
            if not isinstance(state, dict) or not state.get("confirmed"):
                return "off"

            step = totp_check(state["secret"], code, seen=state.get("seen"))
            if step is not None:
                state["seen"] = step
                return "code"

            fingerprint = recovery_fingerprint(code)
            remaining = [entry for entry in (state.get("recovery") or []) if entry != fingerprint]
            if len(remaining) != len(state.get("recovery") or []):
                state["recovery"] = remaining
                return "recovery"

            return "bad"

        try:
            return self.file.update(mutate)
        except StoreError:
            return "bad"

    def disable_totp(self, name):
        def mutate(payload):
            holder = self._holder(payload, name)
            holder.pop("totp", None)
            holder["tokenVersion"] = int(holder.get("tokenVersion") or 1) + 1
            return True

        return self.file.update(mutate)

    def totp_state(self, name):
        payload = self.file.read()
        try:
            holder = self._holder(payload, name)
        except StoreError:
            return {"enabled": False, "pending": False, "recovery": 0, "since": None}
        state = holder.get("totp")
        if not isinstance(state, dict):
            return {"enabled": False, "pending": False, "recovery": 0, "since": None}
        return {
            "enabled": bool(state.get("confirmed")),
            "pending": bool(state.get("secret")) and not state.get("confirmed"),
            "recovery": len(state.get("recovery") or []),
            "since": state.get("since"),
        }

    def link_google(self, name, email, sub=None):
        address = check_google_email(email)

        def mutate(payload):
            records = self._records(payload)
            holder = self._holder(payload, name)
            for other, record in records.items():
                if other == name or not isinstance(record, dict):
                    continue
                linked = record.get("google")
                if not isinstance(linked, dict):
                    continue
                if linked.get("email") == address or (sub and linked.get("sub") == sub):
                    raise StoreError("That Google account is already linked to %s." % other)
            holder["google"] = {
                "email": address,
                "sub": str(sub) if sub else None,
                "since": now_iso(),
                "lastUsed": None,
            }
            holder["tokenVersion"] = int(holder.get("tokenVersion") or 1) + 1
            return address

        return self.file.update(mutate)

    def unlink_google(self, name):
        def mutate(payload):
            holder = self._holder(payload, name)
            existing = holder.pop("google", None)
            holder["tokenVersion"] = int(holder.get("tokenVersion") or 1) + 1
            return bool(existing)

        return self.file.update(mutate)

    def google_state(self, name):
        payload = self.file.read()
        try:
            holder = self._holder(payload, name)
        except StoreError:
            return google_public(None)
        return google_public(holder.get("google"))

    def find_by_google(self, sub, email):
        address = str(email or "").strip().lower()
        subject = str(sub or "").strip()
        records = self._records(self.file.read())

        for name, record in sorted(records.items()):
            if not isinstance(record, dict):
                continue
            linked = record.get("google")
            if isinstance(linked, dict) and subject and linked.get("sub") == subject:
                return self._merge(name, record), "sub"

        for name, record in sorted(records.items()):
            if not isinstance(record, dict):
                continue
            linked = record.get("google")
            if not isinstance(linked, dict) or linked.get("sub"):
                continue
            if address and linked.get("email") == address:
                return self._merge(name, record), "email"

        return None, None

    def note_google(self, name, sub):
        def mutate(payload):
            holder = self._holder(payload, name)
            linked = holder.get("google")
            if not isinstance(linked, dict):
                raise StoreError("That account has no Google sign-in linked.")
            if linked.get("sub") and linked.get("sub") != str(sub):
                raise StoreError("That account is linked to a different Google account.", 403)
            linked["sub"] = str(sub)
            linked["lastUsed"] = now_iso()
            return True

        return self.file.update(mutate)

    def link_discord(self, name, identity):
        wanted = check_discord_identity(identity)

        def mutate(payload):
            records = self._records(payload)
            holder = self._holder(payload, name)
            for other, record in records.items():
                if other == name or not isinstance(record, dict):
                    continue
                linked = record.get("discord")
                if isinstance(linked, dict) and linked.get("id") == wanted["id"]:
                    raise StoreError("That Discord account is already linked to %s." % other)
            existing = holder.get("discord")
            if isinstance(existing, dict) and existing.get("id") and existing.get("id") != wanted["id"]:
                raise StoreError("This account already has a different Discord account linked.")
            holder["discord"] = dict(wanted, since=now_iso())
            return discord_public(holder["discord"])

        return self.file.update(mutate)

    def refresh_discord(self, name, identity):
        wanted = check_discord_identity(identity)

        def mutate(payload):
            holder = self._holder(payload, name)
            linked = holder.get("discord")
            if not isinstance(linked, dict) or not linked.get("id"):
                raise StoreError("There is no Discord account linked.")
            if linked.get("id") != wanted["id"]:
                raise StoreError("That is a different Discord account.", 403)
            linked.update(
                {
                    "tag": wanted["tag"],
                    "username": wanted["username"],
                    "displayName": wanted["displayName"],
                    "avatar": wanted["avatar"],
                    "seen": now_iso(),
                }
            )
            return discord_public(linked)

        return self.file.update(mutate)

    def set_discord_prefs(self, name, prefs):
        wanted = check_discord_prefs(prefs)

        def mutate(payload):
            holder = self._holder(payload, name)
            linked = holder.get("discord")
            if not isinstance(linked, dict) or not linked.get("id"):
                raise StoreError("There is no Discord account linked.")
            linked["prefs"] = wanted
            return discord_public(linked)

        return self.file.update(mutate)

    def discord_wants(self, name, kind, stamp=None):
        if kind not in DISCORD_PREFS:
            return None
        payload = self.file.read()
        try:
            holder = self._holder(payload, name)
        except StoreError:
            return None
        linked = holder.get("discord")
        if not isinstance(linked, dict) or not linked.get("id"):
            return None
        prefs = discord_prefs(linked)
        if not prefs.get(kind):
            return None
        if kind in DISCORD_HELD_BY_QUIET and in_quiet(
            prefs.get("quiet"), time.time() if stamp is None else stamp
        ):
            return None
        return linked["id"]

    def hidden_projects(self, name):
        payload = self.file.read()
        try:
            holder = self._holder(payload, name)
        except StoreError:
            return []
        return hidden_projects_list(holder.get("hiddenProjects"))

    def hide_project(self, name, project, hidden):
        wanted = str(project or "").strip()
        if not HIDDEN_PROJECT_ID.match(wanted):
            raise StoreError("That is not a project.")

        def mutate(payload):
            holder = self._holder(payload, name)
            current = hidden_projects_list(holder.get("hiddenProjects"))

            if hidden:
                if wanted not in current:
                    if len(current) >= HIDDEN_PROJECTS_MAX:
                        raise StoreError(
                            "You have hidden as many projects as this list holds. "
                            "Show some of them again first."
                        )
                    current.append(wanted)
            else:
                current = [entry for entry in current if entry != wanted]

            holder["hiddenProjects"] = current
            return list(current)

        return self.file.update(mutate)

    def unlink_discord(self, name):
        def mutate(payload):
            holder = self._holder(payload, name)
            return bool(holder.pop("discord", None))

        return self.file.update(mutate)

    def discord_state(self, name):
        payload = self.file.read()
        try:
            holder = self._holder(payload, name)
        except StoreError:
            return discord_public(None)
        return discord_public(holder.get("discord"))

    def find_by_discord(self, identifier):
        wanted = str(identifier or "").strip()
        if not wanted:
            return None
        for name, record in sorted(self._records(self.file.read()).items()):
            if not isinstance(record, dict):
                continue
            linked = record.get("discord")
            if isinstance(linked, dict) and linked.get("id") == wanted:
                return self._merge(name, record)
        return None

    def _picture_file(self, name, suffix):
        stem = hashlib.sha256(str(name).encode("utf-8")).hexdigest()[:32]
        return os.path.join(self.art_dir, "%s%s" % (stem, suffix))

    def _picture_write(self, path, blob):
        os.makedirs(self.art_dir, exist_ok=True)
        handle = tempfile.NamedTemporaryFile(
            mode="wb", dir=self.art_dir, prefix=".picture-", suffix=".tmp", delete=False
        )
        try:
            handle.write(blob)
            handle.flush()
            os.fsync(handle.fileno())
            handle.close()
            os.chmod(handle.name, 0o600)
            os.replace(handle.name, path)
        except BaseException:
            try:
                os.unlink(handle.name)
            except OSError:
                pass
            raise

    def _picture_unlink(self, name, held):
        suffix = (held or {}).get("ext") if isinstance(held, dict) else None
        if not suffix:
            return
        try:
            os.unlink(self._picture_file(name, suffix))
        except OSError:
            pass

    def set_picture(self, name, content_type, blob):
        mime, suffix, data = check_picture_blob(content_type, blob)
        digest = hashlib.sha256(data).hexdigest()[:16]

        def mutate(payload):
            holder = self._holder(payload, name)
            held = holder.get("picture")
            self._picture_write(self._picture_file(name, suffix), data)
            if isinstance(held, dict) and held.get("ext") != suffix:
                self._picture_unlink(name, held)
            holder["picture"] = {
                "type": mime,
                "ext": suffix,
                "bytes": len(data),
                "hash": digest,
                "at": now_iso(),
            }
            return picture_public(holder["picture"])

        return self.file.update(mutate)

    def drop_picture(self, name):
        gone = {}

        def mutate(payload):
            holder = self._holder(payload, name)
            held = holder.pop("picture", None)
            if not isinstance(held, dict):
                return False
            gone["held"] = held
            return True

        dropped = self.file.update(mutate)
        if dropped:
            self._picture_unlink(name, gone.get("held"))
        return dropped

    def picture(self, name):
        payload = self.file.read()
        holder = self._holder(payload, name)
        held = holder.get("picture")
        if not isinstance(held, dict) or not held.get("ext"):
            raise StoreError("There is no picture on that account.", 404)
        try:
            with open(self._picture_file(name, held["ext"]), "rb") as handle:
                data = handle.read()
        except OSError:
            raise StoreError("That picture is no longer on disk.", 404)
        return held.get("type") or "application/octet-stream", data

    def picture_state(self, name):
        payload = self.file.read()
        try:
            holder = self._holder(payload, name)
        except StoreError:
            return picture_public(None)
        return picture_public(holder.get("picture"))

    def hook_state(self, name):
        payload = self.file.read()
        try:
            holder = self._holder(payload, name)
        except StoreError:
            return hook_public(None, name)
        return hook_public(holder.get("hook"), name)

    def set_hook(self, name, fmt, url, events, enabled=True):
        chosen = check_hook_format(fmt)
        address = check_hook_url(url, chosen)
        wanted = check_hook_events(events)

        def mutate(payload):
            holder = self._holder(payload, name)
            existing = holder.get("hook")
            existing = dict(existing) if isinstance(existing, dict) else {}
            changed = existing.get("url") != address or existing.get("format") != chosen
            holder["hook"] = {
                "format": chosen,
                "url": address,
                "events": wanted,
                "enabled": bool(enabled),
                "secret": existing.get("secret") or hook_secret(),
                "created": existing.get("created") or now_iso(),
                "updated": now_iso(),
                "sent": 0 if changed else int(existing.get("sent") or 0),
                "failures": 0,
                "paused": False,
                "lastOk": None if changed else existing.get("lastOk"),
                "lastFail": None if changed else existing.get("lastFail"),
                "lastError": None if changed else existing.get("lastError"),
            }
            return dict(holder["hook"])

        return hook_public(self.file.update(mutate), name)

    def clear_hook(self, name):
        def mutate(payload):
            holder = self._holder(payload, name)
            holder.pop("hook", None)
            return True

        return self.file.update(mutate)

    def _note_slot(self, name, slot, ok, error=None):
        def mutate(payload):
            holder = self._holder(payload, name)
            hook = holder.get(slot)
            if not isinstance(hook, dict):
                return None
            if ok:
                hook["sent"] = int(hook.get("sent") or 0) + 1
                hook["failures"] = 0
                hook["lastOk"] = now_iso()
                hook["lastError"] = None
            else:
                hook["failures"] = int(hook.get("failures") or 0) + 1
                hook["lastFail"] = now_iso()
                hook["lastError"] = str(error or "")[:200]
                if hook["failures"] >= HOOK_FAIL_LIMIT:
                    hook["enabled"] = False
                    hook["paused"] = True
            return dict(hook)

        try:
            return self.file.update(mutate)
        except StoreError:
            return None

    def note_hook(self, name, ok, error=None):
        return self._note_slot(name, "hook", ok, error)

    def note_embed(self, name, ok, error=None):
        return self._note_slot(name, "embed", ok, error)

    def _slot_holders(self, slot):
        out = []
        for name, record in sorted(self._records(self.file.read()).items()):
            if not isinstance(record, dict):
                continue
            hook = record.get(slot)
            if not isinstance(hook, dict) or not hook.get("url") or not hook.get("enabled"):
                continue
            merged = self._merge(name, record)
            out.append(
                {
                    "name": name,
                    "hook": dict(hook),
                    "permissions": merged.get("permissions") or [],
                    "active": not record.get("disabled") and not is_expired(record),
                }
            )
        return out

    def hooks(self):
        return self._slot_holders("hook")

    def embed_hooks(self):
        return self._slot_holders("embed")

    def dm_hooks(self):
        out = []
        for name, record in sorted(self._records(self.file.read()).items()):
            if not isinstance(record, dict):
                continue
            linked = record.get("discord")
            if not isinstance(linked, dict) or not linked.get("id"):
                continue
            wanted = discord_prefs(linked)
            if not wanted["events"]:
                continue
            merged = self._merge(name, record)
            out.append(
                {
                    "name": name,
                    "hook": {"events": wanted["events"], "discord": linked["id"]},
                    "permissions": merged.get("permissions") or [],
                    "active": not record.get("disabled") and not is_expired(record),
                }
            )
        return out

    def set_embed(self, name, url, template, events, enabled=True):
        address = check_hook_url(url, "discord")
        wanted = check_hook_events(events)
        design = check_embed_template(template)

        def mutate(payload):
            holder = self._holder(payload, name)
            existing = holder.get("embed")
            existing = dict(existing) if isinstance(existing, dict) else {}
            changed = existing.get("url") != address
            holder["embed"] = {
                "url": address,
                "template": design,
                "events": wanted,
                "enabled": bool(enabled),
                "created": existing.get("created") or now_iso(),
                "updated": now_iso(),
                "sent": 0 if changed else int(existing.get("sent") or 0),
                "failures": 0,
                "paused": False,
                "lastOk": None if changed else existing.get("lastOk"),
                "lastFail": None if changed else existing.get("lastFail"),
                "lastError": None if changed else existing.get("lastError"),
            }
            return dict(holder["embed"])

        return embed_public(self.file.update(mutate), name)

    def clear_embed(self, name):
        def mutate(payload):
            holder = self._holder(payload, name)
            return bool(holder.pop("embed", None))

        return self.file.update(mutate)

    def embed_state(self, name):
        payload = self.file.read()
        try:
            holder = self._holder(payload, name)
        except StoreError:
            return embed_public(None, name)
        return embed_public(holder.get("embed"), name)

    def note_sign_in(self, name, ip):
        def mutate(payload):
            record = self._records(payload).get(name)
            if isinstance(record, dict):
                record["lastSignIn"] = now_iso()
                record["lastIp"] = ip
            return True

        try:
            self.file.update(mutate)
        except StoreError:
            return

    def bump_version(self, name):
        def mutate(payload):
            records = self._records(payload)
            record = records.get(name)
            if not isinstance(record, dict):
                raise StoreError("No such account.", 404)
            record["tokenVersion"] = int(record.get("tokenVersion") or 1) + 1
            return int(record["tokenVersion"])

        return self.file.update(mutate)


def token_owner(record):
    holder = (record or {}).get("owner")
    return holder if isinstance(holder, str) and holder else None


def token_expired(record):
    stamp = (record or {}).get("expires")
    if not stamp:
        return False
    return str(stamp) <= today_iso()


def check_text(value, label):
    if value is None:
        return ""
    if not isinstance(value, str):
        raise StoreError("That %s is not text." % label)
    return value.strip()


def check_rate(value):
    if value is None or value == "":
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise StoreError("That request limit is not a number.")
    if number < 1 or number > MAX_RATE:
        raise StoreError("Pick a limit between 1 and %d requests a minute." % MAX_RATE)
    return number


def check_scopes(values):
    granted = sorted({scope for scope in (values or []) if scope in SCOPES})
    if not granted:
        raise StoreError("Pick at least one scope.")
    return granted


def parse_network(value):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return ipaddress.ip_network(text, strict=False)
    except ValueError:
        raise StoreError("%s is not an address or a range like 203.0.113.0/24." % text[:60])


def check_allowed_ips(values):
    if values is None or values == "":
        return []
    if isinstance(values, str):
        values = [line for line in values.replace(",", "\n").splitlines()]
    if not isinstance(values, (list, tuple)):
        raise StoreError("That address list is not a list.")

    out = []
    for value in values:
        network = parse_network(value)
        if network is None:
            continue
        text = str(network)
        if text not in out:
            out.append(text)
        if len(out) > MAX_ALLOWED_IPS:
            raise StoreError("Keep the list to %d addresses or ranges." % MAX_ALLOWED_IPS)
    return out


def ip_allowed(allowed, address):
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


class Tokens:

    def __init__(self, path, group=None, sealer=None):
        self.file = open_doc(path, {"version": 1, "tokens": {}}, 0o640, group, sealer)

    def _records(self, payload):
        records = payload.get("tokens")
        if not isinstance(records, dict):
            records = {}
            payload["tokens"] = records
        return records

    def _owned(self, records, identifier, owner):
        record = records.get(identifier)
        if not isinstance(record, dict):
            raise StoreError("No such key.", 404)
        if owner is not None and token_owner(record) != owner:
            raise StoreError("No such key.", 404)
        return record

    @staticmethod
    def addresses(stats):
        seen = stats.get("ips")
        if not isinstance(seen, dict):
            return []
        out = []
        for address, detail in seen.items():
            if not isinstance(detail, dict):
                continue
            out.append(
                {
                    "ip": address,
                    "count": int(detail.get("count") or 0),
                    "first": detail.get("first"),
                    "last": detail.get("last"),
                }
            )
        out.sort(key=lambda entry: entry.get("last") or "", reverse=True)
        return out

    @staticmethod
    def public(identifier, record, usage=None, redact=False):
        stats = usage if isinstance(usage, dict) else {}
        paths = stats.get("paths")
        shown = {
            "id": identifier,
            "name": record.get("name"),
            "note": record.get("note") or "",
            "prefix": record.get("prefix"),
            "environment": record.get("environment") or "live",
            "scopes": record.get("scopes") or [],
            "created": record.get("created"),
            "owner": token_owner(record),
            "expires": record.get("expires"),
            "expired": token_expired(record),
            "revoked": bool(record.get("revoked")),
            "revokedAt": record.get("revokedAt"),
            "rotated": record.get("rotated"),
            "managed": bool(record.get("managed")),
            "adminRevoked": bool(record.get("adminRevoked")),
            "rate": record.get("rate"),
            "effectiveRate": record.get("rate") or RATE_DEFAULT,
            "allowed": list(record.get("allowed") or []),
            "requests": int(stats.get("requests") or 0),
            "blocked": int(stats.get("blocked") or 0),
            "rejected": int(stats.get("rejected") or 0),
            "lastUsed": stats.get("lastUsed"),
            "paths": paths if isinstance(paths, dict) else {},
            "addresses": Tokens.addresses(stats),
        }
        if not redact:
            shown["createdBy"] = record.get("createdBy")
            shown["revokedBy"] = record.get("revokedBy")
            shown["rotatedBy"] = record.get("rotatedBy")
        return shown

    def listing(self, usage=None, owner=None, redact=False):
        payload = self.file.read()
        counters = usage if isinstance(usage, dict) else {}
        out = []
        for identifier, record in self._records(payload).items():
            if not isinstance(record, dict):
                continue
            if owner is not None and token_owner(record) != owner:
                continue
            out.append(self.public(identifier, record, counters.get(identifier), redact))
        out.sort(key=lambda entry: entry.get("created") or "", reverse=True)
        return out

    def _quota(self, records, holder, skip=None):
        if holder is None:
            return
        mine = [key for key, entry in records.items()
                if isinstance(entry, dict) and token_owner(entry) == holder and key != skip]
        if len(mine) >= KEYS_PER_OWNER:
            raise StoreError("That account already holds %d keys. Remove one first." % KEYS_PER_OWNER)

    def create(self, name, scopes, environment, expires, actor, owner=None, note=None, rate=None,
               managed=False, allowed=None):
        cleaned = check_text(name, "name")
        if not cleaned or len(cleaned) > MAX_NAME:
            raise StoreError("Give the key a name.")
        if environment not in ("live", "test"):
            raise StoreError("Pick an environment.")

        granted = check_scopes(scopes)
        ends = check_expiry(expires)
        ceiling = check_rate(rate)
        remark = check_note(note)
        allowlist = check_allowed_ips(allowed)
        holder = (owner or actor) or None

        if ends is not None and ends <= today_iso():
            raise StoreError("Pick a date after today — a key expires at the start of that day.")

        key = mint_token(environment)
        identifier = secrets.token_hex(8)

        def mutate(payload):
            records = self._records(payload)
            self._quota(records, holder)
            records[identifier] = {
                "name": cleaned,
                "note": remark,
                "prefix": key[:PREFIX_KEEP],
                "hash": hash_token(key),
                "scopes": granted,
                "environment": environment,
                "created": now_iso(),
                "createdBy": actor,
                "owner": holder,
                "expires": ends,
                "rate": ceiling,
                "allowed": allowlist,
                "revoked": False,
                "managed": bool(managed),
            }
            return dict(records[identifier])

        record = self.file.update(mutate)
        return identifier, key, self.public(identifier, record)

    def update(self, identifier, changes, actor, owner=None):
        fields = changes if isinstance(changes, dict) else {}
        holder_side = owner is not None

        def mutate(payload):
            records = self._records(payload)
            record = self._owned(records, identifier, owner)
            locked = holder_side and bool(record.get("managed"))

            if "name" in fields:
                cleaned = check_text(fields.get("name"), "name")
                if not cleaned or len(cleaned) > MAX_NAME:
                    raise StoreError("Give the key a name.")
                record["name"] = cleaned

            if "note" in fields:
                record["note"] = check_note(fields.get("note"))

            if "scopes" in fields:
                granted = check_scopes(fields.get("scopes"))
                if locked and granted != (record.get("scopes") or []):
                    raise StoreError(SET_BY_ADMIN)
                record["scopes"] = granted

            if "expires" in fields:
                ends = check_expiry(fields.get("expires"))
                if locked and ends != record.get("expires"):
                    raise StoreError(SET_BY_ADMIN)
                record["expires"] = ends

            if "rate" in fields:
                record["rate"] = check_rate(fields.get("rate"))

            if "allowed" in fields:
                allowlist = check_allowed_ips(fields.get("allowed"))
                if locked and allowlist != list(record.get("allowed") or []):
                    raise StoreError(SET_BY_ADMIN)
                record["allowed"] = allowlist

            if "owner" in fields:
                moved = check_text(fields.get("owner"), "name")[:MAX_NAME]
                if not moved:
                    raise StoreError("Say who holds the key.")
                if moved != token_owner(record):
                    self._quota(records, moved, identifier)
                record["owner"] = moved

            if not holder_side and (
                "scopes" in fields or "expires" in fields or "rate" in fields or "allowed" in fields
            ):
                record["managed"] = True

            record["changed"] = now_iso()
            record["changedBy"] = actor
            return dict(record)

        record = self.file.update(mutate)
        return self.public(identifier, record)

    def rotate(self, identifier, actor, owner=None):
        def mutate(payload):
            record = self._owned(self._records(payload), identifier, owner)
            if owner is not None and record.get("adminRevoked"):
                raise StoreError(REVOKED_BY_ADMIN, 403)
            fresh = mint_token(record.get("environment") or "live")
            record["prefix"] = fresh[:PREFIX_KEEP]
            record["hash"] = hash_token(fresh)
            record["rotated"] = now_iso()
            record["rotatedBy"] = actor
            record["revoked"] = False
            record.pop("revokedAt", None)
            record.pop("revokedBy", None)
            record.pop("adminRevoked", None)
            return fresh, dict(record)

        fresh, record = self.file.update(mutate)
        return fresh, self.public(identifier, record)

    def revoke(self, identifier, actor, owner=None):
        def mutate(payload):
            record = self._owned(self._records(payload), identifier, owner)
            record["revoked"] = True
            record["revokedAt"] = now_iso()
            record["revokedBy"] = actor
            if owner is None:
                record["adminRevoked"] = True
            return dict(record)

        return self.file.update(mutate)

    def restore(self, identifier, actor, owner=None):
        def mutate(payload):
            record = self._owned(self._records(payload), identifier, owner)
            if owner is not None and record.get("adminRevoked"):
                raise StoreError(REVOKED_BY_ADMIN, 403)
            record["revoked"] = False
            record.pop("revokedAt", None)
            record.pop("revokedBy", None)
            record.pop("adminRevoked", None)
            record["changed"] = now_iso()
            record["changedBy"] = actor
            return dict(record)

        return self.public(identifier, self.file.update(mutate))

    def delete(self, identifier, owner=None):
        def mutate(payload):
            records = self._records(payload)
            record = self._owned(records, identifier, owner)
            if owner is not None and record.get("adminRevoked"):
                raise StoreError(REVOKED_BY_ADMIN, 403)
            if owner is not None and record.get("managed"):
                raise StoreError(HELD_BY_ADMIN, 403)
            del records[identifier]
            return dict(record)

        return self.public(identifier, self.file.update(mutate))


def check_brand_slug(value):
    cleaned = check_text(value, "reference").lower()
    if not BRAND_SLUG.match(cleaned):
        raise StoreError("Use 2 to 32 lowercase letters, digits or hyphens for the reference.")
    return cleaned


def check_brand_name(value):
    cleaned = check_text(value, "name")
    if not BRAND_NAME.match(cleaned):
        raise StoreError("Give the customer a plain name of 2 to 48 letters, digits or spaces.")
    return cleaned


def check_accent(value):
    cleaned = check_text(value, "colour")
    if not cleaned:
        return BRAND_ACCENT_DEFAULT
    if not BRAND_ACCENT.match(cleaned):
        raise StoreError("Give the colour as a hex value like #e0245e.")
    return cleaned.lower()


def check_contact(value):
    cleaned = check_text(value, "contact")
    if not cleaned:
        return ""
    if len(cleaned) > 200:
        raise StoreError("That contact link is too long.")
    parsed = urllib.parse.urlsplit(cleaned)
    if parsed.scheme == "mailto" and parsed.path:
        return cleaned
    if parsed.scheme == "https" and parsed.netloc:
        return cleaned
    raise StoreError("The contact link must be an https address or a mailto: address.")


class Brands:

    def __init__(self, path, group=None):
        self.file = open_doc(path, {"version": 1, "brands": {}}, 0o640, group)

    def _records(self, payload):
        records = payload.get("brands")
        if not isinstance(records, dict):
            records = {}
            payload["brands"] = records
        return records

    @staticmethod
    def public(slug, record):
        return {
            "slug": slug,
            "name": record.get("name"),
            "accent": record.get("accent") or BRAND_ACCENT_DEFAULT,
            "contact": record.get("contact") or "",
            "credit": bool(record.get("credit", True)),
            "note": record.get("note") or "",
            "created": record.get("created"),
            "createdBy": record.get("createdBy"),
            "changed": record.get("changed"),
            "changedBy": record.get("changedBy"),
        }

    @staticmethod
    def published(slug, record):
        return {
            "name": record.get("name"),
            "accent": record.get("accent") or BRAND_ACCENT_DEFAULT,
            "contact": record.get("contact") or "",
            "credit": bool(record.get("credit", True)),
        }

    def listing(self):
        payload = self.file.read()
        out = [
            self.public(slug, record)
            for slug, record in self._records(payload).items()
            if isinstance(record, dict)
        ]
        out.sort(key=lambda entry: (entry.get("name") or "").lower())
        return out

    def feed(self):
        payload = self.file.read()
        return {
            "brands": {
                slug: self.published(slug, record)
                for slug, record in self._records(payload).items()
                if isinstance(record, dict)
            }
        }

    def save(self, slug, fields, actor):
        reference = check_brand_slug(slug)
        name = check_brand_name(fields.get("name"))
        accent = check_accent(fields.get("accent"))
        contact = check_contact(fields.get("contact"))
        note = check_note(fields.get("note"))
        credit = bool(fields.get("credit", True))

        def mutate(payload):
            records = self._records(payload)
            existing = records.get(reference)
            if not isinstance(existing, dict):
                if len(records) >= BRANDS_MAX:
                    raise StoreError("There are already %d brands. Remove one first." % BRANDS_MAX)
                existing = {"created": now_iso(), "createdBy": actor}
                records[reference] = existing
            else:
                existing["changed"] = now_iso()
                existing["changedBy"] = actor
            existing["name"] = name
            existing["accent"] = accent
            existing["contact"] = contact
            existing["credit"] = credit
            existing["note"] = note
            return dict(existing)

        return self.public(reference, self.file.update(mutate))

    def delete(self, slug):
        reference = check_brand_slug(slug)

        def mutate(payload):
            records = self._records(payload)
            record = records.get(reference)
            if not isinstance(record, dict):
                raise StoreError("No such brand.", 404)
            del records[reference]
            return dict(record)

        return self.public(reference, self.file.update(mutate))


def check_verdict(value):
    cleaned = check_text(value, "verdict").lower()
    if cleaned not in FINDING_VERDICTS:
        raise StoreError("Pick one of: %s." % ", ".join(FINDING_VERDICTS))
    return cleaned


class Findings:

    def __init__(self, path, group=None):
        self.file = open_doc(path, {"version": 1, "findings": {}}, 0o640, group)

    def _records(self, payload):
        records = payload.get("findings")
        if not isinstance(records, dict):
            records = {}
            payload["findings"] = records
        return records

    @staticmethod
    def public(identifier, record):
        return {
            "id": identifier,
            "title": record.get("title"),
            "source": record.get("source") or "",
            "verdict": record.get("verdict") or "open",
            "why": record.get("why") or "",
            "reference": record.get("reference") or "",
            "added": record.get("added"),
            "addedBy": record.get("addedBy"),
            "changed": record.get("changed"),
            "changedBy": record.get("changedBy"),
            "seen": int(record.get("seen") or 1),
            "lastSeen": record.get("lastSeen"),
        }

    def listing(self):
        payload = self.file.read()
        out = [
            self.public(identifier, record)
            for identifier, record in self._records(payload).items()
            if isinstance(record, dict)
        ]
        order = {name: index for index, name in enumerate(FINDING_VERDICTS)}
        out.sort(key=lambda entry: (order.get(entry["verdict"], 9), (entry.get("title") or "").lower()))
        return out

    def save(self, identifier, fields, actor):
        title = check_text(fields.get("title"), "title")
        if not title or len(title) > FINDING_TITLE_MAX:
            raise StoreError("Give the finding a title of up to %d characters." % FINDING_TITLE_MAX)
        source = check_text(fields.get("source"), "source")[:FINDING_SOURCE_MAX]
        verdict = check_verdict(fields.get("verdict"))
        why = check_text(fields.get("why"), "note")
        if len(why) > FINDING_WHY_MAX:
            raise StoreError("Keep the explanation under %d characters." % FINDING_WHY_MAX)
        reference = check_text(fields.get("reference"), "link")[:200]
        if reference and not reference.startswith("https://"):
            raise StoreError("The link must be an https address.")
        if verdict == "false-positive" and not why:
            raise StoreError("Say why it is a false positive — that is the whole point of the register.")

        key = check_text(identifier, "id")[:32] or secrets.token_hex(8)

        def mutate(payload):
            records = self._records(payload)
            existing = records.get(key)
            if not isinstance(existing, dict):
                if len(records) >= FINDINGS_MAX:
                    raise StoreError("The register is full at %d findings." % FINDINGS_MAX)
                existing = {"added": now_iso(), "addedBy": actor, "seen": 1, "lastSeen": now_iso()}
                records[key] = existing
            else:
                existing["changed"] = now_iso()
                existing["changedBy"] = actor
            existing["title"] = title
            existing["source"] = source
            existing["verdict"] = verdict
            existing["why"] = why
            existing["reference"] = reference
            return dict(existing)

        return self.public(key, self.file.update(mutate))

    def note_seen(self, identifier):
        def mutate(payload):
            record = self._records(payload).get(identifier)
            if not isinstance(record, dict):
                raise StoreError("No such finding.", 404)
            record["seen"] = int(record.get("seen") or 0) + 1
            record["lastSeen"] = now_iso()
            return dict(record)

        return self.public(identifier, self.file.update(mutate))

    def delete(self, identifier):
        def mutate(payload):
            records = self._records(payload)
            record = records.get(identifier)
            if not isinstance(record, dict):
                raise StoreError("No such finding.", 404)
            del records[identifier]
            return dict(record)

        return self.public(identifier, self.file.update(mutate))


def check_page_path(value):
    cleaned = check_text(value, "path").lower()
    if len(cleaned) > 1:
        cleaned = cleaned.rstrip("/")
    if not cleaned.startswith("/"):
        raise StoreError("A page path starts with a slash.")
    if len(cleaned) > PAGE_PATH_MAX:
        raise StoreError("Keep the path under %d characters." % PAGE_PATH_MAX)
    if not PAGE_PATH.match(cleaned):
        raise StoreError("A page path is lowercase letters, digits, dashes and slashes.")
    if cleaned in RESERVED_PAGES:
        raise StoreError("That page cannot be covered.")
    return cleaned


def check_page_mode(value):
    cleaned = check_text(value, "mode").lower()
    if cleaned not in PAGE_MODES:
        raise StoreError("Pick one of: %s." % ", ".join(PAGE_MODES))
    return cleaned


def check_page_message(value):
    cleaned = check_text(value, "message")
    if len(cleaned) > PAGE_MESSAGE_MAX:
        raise StoreError("Keep the message under %d characters." % PAGE_MESSAGE_MAX)
    return cleaned


def check_page_tag(value):
    cleaned = check_text(value, "tag")
    if len(cleaned) > PAGE_TAG_MAX:
        raise StoreError("Keep the tag under %d characters." % PAGE_TAG_MAX)
    return cleaned


def check_page_until(value):
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise StoreError("That reopen time is not a date.")
    cleaned = value.strip().replace("Z", "+00:00")
    try:
        moment = datetime.fromisoformat(cleaned)
    except ValueError:
        raise StoreError("Use a time like 2026-12-31T18:00Z.")
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    stamp = moment.astimezone(timezone.utc).replace(microsecond=0)
    now = datetime.now(timezone.utc)
    if stamp <= now:
        raise StoreError("Pick a reopen time in the future.")
    if stamp > now + timedelta(days=PAGE_UNTIL_DAYS):
        raise StoreError("Keep the reopen time within a year.")
    return stamp.isoformat().replace("+00:00", "Z")


class Maintenance:

    def __init__(self, path, group=None):
        self.file = open_doc(path, {"version": 1, "pages": {}}, 0o640, group)

    def _records(self, payload):
        records = payload.get("pages")
        if not isinstance(records, dict):
            records = {}
            payload["pages"] = records
        return records

    @staticmethod
    def public(path, record):
        return {
            "path": path,
            "mode": record.get("mode"),
            "message": record.get("message") or "",
            "tag": record.get("tag") or "",
            "until": record.get("until"),
            "since": record.get("since"),
            "setBy": record.get("setBy"),
            "changed": record.get("changed"),
            "changedBy": record.get("changedBy"),
        }

    def listing(self):
        payload = self.file.read()
        out = [
            self.public(path, record)
            for path, record in self._records(payload).items()
            if isinstance(record, dict)
        ]
        out.sort(key=lambda entry: entry["path"])
        return out

    def feed(self):
        payload = self.file.read()
        moment = now_iso()
        out = {}
        for path, record in self._records(payload).items():
            if not isinstance(record, dict) or record.get("mode") not in PAGE_MODES:
                continue
            opens = record.get("until")
            if opens and str(opens) <= moment:
                continue
            entry = {
                "mode": record.get("mode"),
                "message": record.get("message") or "",
                "since": record.get("since"),
            }
            if opens:
                entry["until"] = opens
            if record.get("tag"):
                entry["tag"] = record.get("tag")
            out[path] = entry
        return out

    def cover(self, path, mode, message, actor, until=None, tag=None):
        key = check_page_path(path)
        state = check_page_mode(mode)
        note = check_page_message(message)
        opens = check_page_until(until)
        badge = check_page_tag(tag)

        def mutate(payload):
            records = self._records(payload)
            existing = records.get(key)
            if not isinstance(existing, dict):
                if len(records) >= PAGES_MAX:
                    raise StoreError("The cover list is full at %d pages." % PAGES_MAX)
                existing = {"since": now_iso(), "setBy": actor}
                records[key] = existing
            else:
                existing["changed"] = now_iso()
                existing["changedBy"] = actor
            existing["mode"] = state
            existing["message"] = note
            existing["until"] = opens
            existing["tag"] = badge
            return dict(existing)

        return self.public(key, self.file.update(mutate))

    def reopen(self, path):
        key = check_page_path(path)

        def mutate(payload):
            records = self._records(payload)
            record = records.get(key)
            if not isinstance(record, dict):
                raise StoreError("That page is already live.", 404)
            del records[key]
            return dict(record)

        return self.public(key, self.file.update(mutate))


SPACE = "{S}"
QUOTE = "{Q}"
ANGLE = "{LT}"
EQUALS = "{EQ}"

FLAVOURS = {
    "app": {
        SPACE: r"[\s+]",
        QUOTE: r"['\"]",
        ANGLE: r"<",
        EQUALS: r"=",
    },
    "edge": {
        SPACE: r"(?:\s|\+|%20|%09|%0a|%0b|%0c|%0d)",
        QUOTE: r"(?:['\"]|%22|%27)",
        ANGLE: r"(?:<|%3c)",
        EQUALS: r"(?:=|%3d)",
    },
}


def expand(pattern, flavour):
    out = pattern
    for token, replacement in FLAVOURS[flavour].items():
        out = out.replace(token, replacement)
    return out


SIGNATURES = {
    "sqli": {
        "label": "SQL injection",
        "where": "target",
        "body": True,
        "patterns": (
            r"union({S}|/\*)+(all({S}|/\*)+)?select",
            r"\b(or|and)({S}|\()+{Q}?\d{1,4}{Q}?{S}*{EQ}{S}*{Q}?\d{1,4}",
            r"\bsleep{S}*\({S}*\d",
            r"\bbenchmark{S}*\(",
            r"information_schema",
            r"(;|%3b){S}*(drop|truncate|alter){S}+(table|database)\b",
            r"\bwaitfor{S}+delay\b",
        ),
    },
    "xss": {
        "label": "Cross-site scripting",
        "where": "target",
        "body": True,
        "patterns": (
            r"{LT}{S}*script\b",
            r"javascript{S}*(:|%3a)",
            r"\bon(error|load|click|mouseover|focus){S}*{EQ}",
            r"{LT}{S}*iframe\b",
            r"document{S}*(\.|%2e){S}*cookie",
        ),
    },
    "traversal": {
        "label": "Path traversal",
        "where": "target",
        "body": False,
        "patterns": (
            r"(\.\.|%2e%2e)(/|%2f|\\|%5c)",
            r"%2e%2e",
            r"/etc/(passwd|shadow)\b",
            r"win\.ini\b",
            r"/proc/self/environ",
        ),
    },
    "shell": {
        "label": "Command injection",
        "where": "target",
        "body": True,
        "patterns": (
            r"(;|\||&|`|%3b|%7c|%26|%60){S}*(curl|wget|nc|bash|sh|perl|python){S}",
            r"(\$|%24){S}*(\(|%28){S}*\w",
            r"(\||%7c){S}*base64{S}+-d",
        ),
    },
    "probe": {
        "label": "Software probing",
        "where": "path",
        "body": False,
        "patterns": (
            r"/wp-(login|admin|content|includes|json)",
            r"/\.env\b",
            r"/\.git/",
            r"/\.aws/",
            r"/\.ssh/",
            r"/phpmyadmin",
            r"/xmlrpc\.php",
            r"/vendor/phpunit",
            r"/cgi-bin/",
            r"/(config|backup|dump)\.(sql|zip|tar|gz|bak)$",
            r"\.(php|asp|aspx|jsp|cgi)($|\?)",
        ),
    },
    "scanner": {
        "label": "Known scanners",
        "where": "agent",
        "body": False,
        "patterns": (
            r"sqlmap",
            r"nikto",
            r"\bnmap\b",
            r"masscan",
            r"zgrab",
            r"dirbuster",
            r"gobuster",
            r"feroxbuster",
            r"wpscan",
            r"nessus",
            r"acunetix",
            r"netsparker",
            r"havij",
            r"arachni",
        ),
    },
    "tooling": {
        "label": "Scripted clients",
        "where": "agent",
        "body": False,
        "patterns": (
            r"python-requests",
            r"^curl/",
            r"^wget/",
            r"libwww-perl",
            r"go-http-client",
            r"okhttp",
            r"^java/",
        ),
    },
}

SIGNATURE_RE = {
    name: tuple(re.compile(expand(pattern, "app"), re.IGNORECASE) for pattern in entry["patterns"])
    for name, entry in SIGNATURES.items()
}


def signature_catalogue():
    return [
        {
            "id": name,
            "label": entry["label"],
            "where": entry["where"],
            "body": bool(entry["body"]),
            "patterns": len(entry["patterns"]),
        }
        for name, entry in SIGNATURES.items()
    ]


def check_firewall_kind(value):
    cleaned = check_text(value, "kind").lower()
    if cleaned not in FIREWALL_KINDS:
        raise StoreError("Pick one of: %s." % ", ".join(FIREWALL_KINDS))
    return cleaned


def check_firewall_mode(value):
    cleaned = check_text(value, "mode").lower()
    if not cleaned:
        return "monitor"
    if cleaned not in FIREWALL_MODES:
        raise StoreError("Pick one of: %s." % ", ".join(FIREWALL_MODES))
    return cleaned


def check_country(value):
    cleaned = check_text(value, "country").upper()
    if not COUNTRY_CODE.match(cleaned):
        raise StoreError("Use a two-letter country code like DE.")
    return cleaned


def check_firewall_note(value):
    cleaned = check_text(value, "note")
    if len(cleaned) > FIREWALL_NOTE_MAX:
        raise StoreError("Keep the note under %d characters." % FIREWALL_NOTE_MAX)
    return cleaned


def check_pattern(value, label):
    cleaned = check_text(value, label)
    if not cleaned:
        raise StoreError("Give the rule something to match on.")
    if len(cleaned) > FIREWALL_VALUE_MAX:
        raise StoreError("Keep the pattern under %d characters." % FIREWALL_VALUE_MAX)
    if cleaned.strip("*?") == "":
        raise StoreError("A rule of nothing but wildcards would match every request.")
    return cleaned


def check_firewall_value(kind, value):
    if kind == "ip":
        network = parse_network(value)
        if network is None:
            raise StoreError("Give an address or a range like 203.0.113.0/24.")
        if network.prefixlen == 0:
            raise StoreError("A rule covering the whole internet is not a firewall rule.")
        return str(network)
    if kind == "country":
        return check_country(value)
    if kind == "method":
        cleaned = check_text(value, "method").upper()
        if cleaned not in FIREWALL_METHODS:
            raise StoreError("Pick one of: %s." % ", ".join(FIREWALL_METHODS))
        return cleaned
    if kind == "signature":
        cleaned = check_text(value, "signature").lower()
        if cleaned not in SIGNATURES:
            raise StoreError("Pick one of: %s." % ", ".join(sorted(SIGNATURES)))
        return cleaned
    if kind == "path":
        cleaned = check_pattern(value, "path")
        if not cleaned.startswith("/") and not cleaned.startswith("*"):
            raise StoreError("A path rule starts with a slash, or a * wildcard.")
        return cleaned
    return check_pattern(value, "pattern")


def pattern_matches(pattern, subject):
    if not pattern or subject is None:
        return False
    text = str(subject).lower()
    needle = pattern.lower()
    if "*" in needle or "?" in needle:
        return fnmatch.fnmatchcase(text, needle)
    return needle in text


def signature_matches(name, target, agent, body):
    entry = SIGNATURES.get(name)
    if entry is None:
        return False
    where = entry["where"]
    if where == "agent":
        subjects = [agent or ""]
    elif where == "path":
        subjects = [(target or "").split("?", 1)[0]]
    else:
        raw = target or ""
        subjects = [raw, urllib.parse.unquote_plus(raw)]
        if entry["body"] and body:
            subjects.append(body)
    for expression in SIGNATURE_RE[name]:
        for subject in subjects:
            if subject and expression.search(subject):
                return True
    return False


def country_prefixes(geo, code):
    if not isinstance(geo, dict):
        return []
    out = []
    for family in ("v4", "v6"):
        table = geo.get(family)
        if not isinstance(table, dict):
            continue
        shift = int(geo.get("v6Shift") or 64) if family == "v6" else 0
        cls = ipaddress.IPv6Address if family == "v6" else ipaddress.IPv4Address
        for start, end, cc in zip(table["starts"], table["ends"], table["cc"]):
            if cc != code:
                continue
            low = cls((start << shift))
            high = cls(((end + 1) << shift) - 1) if shift else cls(end)
            for network in ipaddress.summarize_address_range(low, high):
                out.append(str(network))
                if len(out) > FIREWALL_PREFIXES_MAX:
                    return out
    return out


class Firewall:

    def __init__(self, path, group=None):
        self.file = open_doc(
            path,
            {"version": 1, "rules": {}, "settings": {"enabled": True, "defaultMode": "monitor"}},
            0o640,
            group,
        )

    def _records(self, payload):
        records = payload.get("rules")
        if not isinstance(records, dict):
            records = {}
            payload["rules"] = records
        return records

    @staticmethod
    def _settings(payload):
        settings = payload.get("settings")
        if not isinstance(settings, dict):
            settings = {}
            payload["settings"] = settings
        settings.setdefault("enabled", True)
        settings.setdefault("defaultMode", "monitor")
        return settings

    @staticmethod
    def layer_of(kind):
        return "edge" if kind in FIREWALL_EDGE_KINDS else "both"

    @staticmethod
    def public(identifier, record):
        kind = record.get("kind")
        return {
            "id": identifier,
            "kind": kind,
            "value": record.get("value"),
            "mode": record.get("mode") or "monitor",
            "enabled": bool(record.get("enabled", True)),
            "note": record.get("note") or "",
            "layer": Firewall.layer_of(kind),
            "since": record.get("since"),
            "setBy": record.get("setBy"),
            "changed": record.get("changed"),
            "changedBy": record.get("changedBy"),
        }

    def settings(self):
        payload = self.file.read()
        settings = self._settings(payload)
        return {
            "enabled": bool(settings.get("enabled", True)),
            "defaultMode": settings.get("defaultMode") or "monitor",
            "changed": settings.get("changed"),
            "changedBy": settings.get("changedBy"),
        }

    def set_settings(self, fields, actor):
        def mutate(payload):
            settings = self._settings(payload)
            if "enabled" in fields:
                settings["enabled"] = bool(fields.get("enabled"))
            if fields.get("defaultMode"):
                settings["defaultMode"] = check_firewall_mode(fields.get("defaultMode"))
            settings["changed"] = now_iso()
            settings["changedBy"] = actor
            return None

        self.file.update(mutate)
        return self.settings()

    def listing(self):
        payload = self.file.read()
        out = [
            self.public(identifier, record)
            for identifier, record in self._records(payload).items()
            if isinstance(record, dict)
        ]
        order = {name: index for index, name in enumerate(FIREWALL_KINDS)}
        out.sort(key=lambda entry: (order.get(entry["kind"], 9), str(entry["value"]).lower()))
        return out

    def active(self):
        payload = self.file.read()
        if not self._settings(payload).get("enabled", True):
            return []
        return [
            self.public(identifier, record)
            for identifier, record in self._records(payload).items()
            if isinstance(record, dict) and record.get("enabled", True)
        ]

    def save(self, identifier, fields, actor):
        kind = check_firewall_kind(fields.get("kind"))
        value = check_firewall_value(kind, fields.get("value"))
        mode = check_firewall_mode(fields.get("mode"))
        note = check_firewall_note(fields.get("note"))
        enabled = bool(fields.get("enabled", True))
        key = check_text(identifier, "id")[:32] or secrets.token_hex(8)

        def mutate(payload):
            records = self._records(payload)
            for other, record in records.items():
                if other == key or not isinstance(record, dict):
                    continue
                if record.get("kind") == kind and record.get("value") == value:
                    raise StoreError("There is already a rule for that.")
            existing = records.get(key)
            if not isinstance(existing, dict):
                if len(records) >= FIREWALL_RULES_MAX:
                    raise StoreError("The rule list is full at %d rules." % FIREWALL_RULES_MAX)
                existing = {"since": now_iso(), "setBy": actor}
                records[key] = existing
            else:
                existing["changed"] = now_iso()
                existing["changedBy"] = actor
            existing["kind"] = kind
            existing["value"] = value
            existing["mode"] = mode
            existing["note"] = note
            existing["enabled"] = enabled
            return dict(existing)

        return self.public(key, self.file.update(mutate))

    def delete(self, identifier):
        def mutate(payload):
            records = self._records(payload)
            record = records.get(identifier)
            if not isinstance(record, dict):
                raise StoreError("No such rule.", 404)
            del records[identifier]
            return dict(record)

        return self.public(identifier, self.file.update(mutate))

    def matches(self, rule, request, country=None):
        kind = rule.get("kind")
        value = rule.get("value")
        if kind == "ip":
            return ip_allowed([value], request.get("ip"))
        if kind == "country":
            return bool(country) and country == value
        if kind == "method":
            return str(request.get("method") or "").upper() == value
        if kind == "agent":
            return pattern_matches(value, request.get("agent"))
        if kind == "path":
            return pattern_matches(value, str(request.get("target") or "").split("?", 1)[0])
        if kind == "signature":
            return signature_matches(
                value, request.get("target"), request.get("agent"), request.get("body")
            )
        return False

    def evaluate(self, request, country=None, rules=None):
        candidates = self.active() if rules is None else rules
        observed = []
        for rule in candidates:
            if not self.matches(rule, request, country):
                continue
            if rule["mode"] == "block":
                return {"action": "blocked", "rule": rule, "observed": observed}
            observed.append(rule)
        if observed:
            return {"action": "observed", "rule": observed[0], "observed": observed}
        return None

    def nginx_conf(self, geo=None, generated=None):
        rules = self.active()
        lines = [
            "# Generated by the Amitista admin panel. Do not edit by hand.",
            "# Written %s" % (generated or now_iso()),
            "",
        ]

        def weight(rule):
            return "1" if rule["mode"] == "block" else "2"

        networks = []
        truncated = []
        for rule in rules:
            if rule["kind"] == "ip":
                networks.append((rule["value"], weight(rule)))
            elif rule["kind"] == "country":
                prefixes = country_prefixes(geo, rule["value"])
                if len(prefixes) > FIREWALL_PREFIXES_MAX:
                    truncated.append(rule["value"])
                    prefixes = prefixes[:FIREWALL_PREFIXES_MAX]
                for prefix in prefixes:
                    networks.append((prefix, weight(rule)))

        lines.append("geo $amitista_fw_ip {")
        lines.append("    default 0;")
        for network, mark in networks:
            lines.append("    %s %s;" % (network, mark))
        lines.append("}")
        lines.append("")

        for name, kinds, source in (
            ("amitista_fw_path", ("path",), "$uri"),
            ("amitista_fw_uri", ("signature",), "$request_uri"),
            ("amitista_fw_agent", ("agent", "signature"), "$http_user_agent"),
            ("amitista_fw_method", ("method",), "$request_method"),
        ):
            lines.append("map %s $%s {" % (source, name))
            lines.append("    default 0;")
            for rule in rules:
                if rule["kind"] not in kinds:
                    continue
                for expression in self.nginx_patterns(rule, name):
                    lines.append("    %s %s;" % (expression, weight(rule)))
            lines.append("}")
            lines.append("")

        verdict = (
            "$amitista_fw_ip$amitista_fw_path$amitista_fw_uri"
            "$amitista_fw_agent$amitista_fw_method"
        )
        lines.append('map "%s" $amitista_fw {' % verdict)
        lines.append('    "~1"    block;')
        lines.append('    "~2"    watch;')
        lines.append("    default pass;")
        lines.append("}")
        lines.append("")
        lines.append("map $amitista_fw $amitista_fw_log {")
        lines.append("    pass    0;")
        lines.append("    default 1;")
        lines.append("}")
        lines.append("")
        lines.append(
            "log_format amitista_fw '$remote_addr %s $amitista_fw [$time_local] "
            "\"$request_method $request_uri\" $status \"$http_user_agent\"';" % verdict
        )
        lines.append("")
        if truncated:
            lines.append("# Truncated country lists: %s" % ", ".join(truncated))
            lines.append("")
        return "\n".join(lines)

    @staticmethod
    def nginx_patterns(rule, target):
        kind = rule["kind"]
        if kind == "method":
            return ['"%s"' % rule["value"]]
        if kind == "signature":
            entry = SIGNATURES.get(rule["value"])
            if entry is None:
                return []
            where = entry["where"]
            if target == "amitista_fw_agent" and where != "agent":
                return []
            if target == "amitista_fw_uri" and where == "agent":
                return []
            return [
                '"~*%s"' % nginx_regex(expand(pattern, "edge")) for pattern in entry["patterns"]
            ]
        if kind == "agent" and target != "amitista_fw_agent":
            return []
        if kind == "path" and target != "amitista_fw_path":
            return []
        return ['"~*%s"' % nginx_regex(glob_to_regex(rule["value"]))]


def nginx_regex(pattern):
    return pattern.replace("\\", "\\\\").replace('"', "\\x22").replace("'", "\\x27")


def glob_to_regex(pattern):
    out = []
    for char in pattern:
        if char == "*":
            out.append(".*")
        elif char == "?":
            out.append(".")
        else:
            out.append(re.escape(char))
    body = "".join(out)
    if "*" not in pattern and "?" not in pattern:
        return body
    return "^%s$" % body


class FirewallEvents:

    def __init__(self, path, mode=0o640, group=None):
        self.log = open_log(path, FIREWALL_EVENTS_KEEP, FIREWALL_EVENTS_SWEEP, mode, group)

    def record(self, verdict, request, country=None, layer="app"):
        rule = verdict["rule"]
        entry = {
            "at": now_iso(),
            "action": verdict["action"],
            "layer": layer,
            "ruleId": rule["id"],
            "kind": rule["kind"],
            "value": rule["value"],
            "mode": rule["mode"],
            "ip": request.get("ip"),
            "country": country,
            "method": request.get("method"),
            "target": str(request.get("target") or "")[:200],
            "agent": str(request.get("agent") or "")[:200],
        }
        return self.log.append(entry)

    def tail(self, limit=200):
        return self.log.tail(limit)


BOARD_ID = re.compile(r"^[a-f0-9]{8,32}$")
BOARD_COLOURS = ("purple", "sky", "emerald", "amber", "rose", "slate")
BOARD_VISIBILITY = ("private", "team", "sealed")
BOARD_OWN = "own"
BOARD_OWN_VISIBILITY = ("private",)
BOARD_ROLES = ("owner", "editor", "viewer")
BOARD_STARTING_LISTS = ("To do", "Doing", "Done")
BOARD_KEYHOLDER_NAMES = tuple(
    part.strip()
    for part in os.environ.get("ADMIN_BOARD_KEYHOLDERS", "blxr").split(",")
    if part.strip()
)
BOARD_KEYHOLDERS = frozenset(name.lower() for name in BOARD_KEYHOLDER_NAMES)
BOARD_HERE_SECONDS = 15

BOARDS_MAX = 60
BOARD_LISTS_MAX = 12
BOARD_CARDS_MAX = 400
BOARD_MEMBERS_MAX = 40
BOARD_LABELS_MAX = 12
CARD_ASSIGNEES_MAX = 8
CARD_CHECKS_MAX = 40
CARD_COMMENTS_MAX = 120
CARD_LINKS_MAX = 12
CARD_ACTIVITY_KEEP = 40
CARD_BULK_MAX = 120
BOARD_BIN_KEEP = 12
BOARD_BIN_HOURS = 24

BOARD_NAME_MAX = 60
BOARD_NOTE_MAX = 240
LIST_NAME_MAX = 32
LIST_CAP_MAX = 99
LIST_SORTS = ("due", "who", "title", "made", "done")
CARD_BULK_ACTIONS = (
    "done",
    "undone",
    "archive",
    "restore",
    "delete",
    "assign",
    "unassign",
    "label",
    "unlabel",
    "due",
    "move",
)
CARD_TITLE_MAX = 140
CARD_NOTES_MAX = 2000
CARD_COMMENT_MAX = 1000
CARD_CHECK_MAX = 2000
CARD_LINK_LABEL_MAX = 60
CARD_LINK_URL_MAX = 400
LABEL_NAME_MAX = 24
DUE_WINDOW_DAYS = 1825
SOON_HOURS = 48

REMIND_WHO = ("assignees", "board", "owners")
REMIND_EVENTS = ("assigned", "comment", "moved", "done")
REMIND_AIMED = ("due", "comment", "moved", "done")
REMIND_STEPS_MAX = 6
REMIND_UNITS = {"m": 60, "h": 3600, "d": 86400, "w": 604800}
REMIND_STEP = re.compile(r"^([0-9]{1,4})([mhdw])$")
REMIND_STEP_MAX = 60 * 86400
REMIND_LEAD_DEFAULT = ("1d", "1h")
REMIND_LATE_DEFAULT = ("1d",)
try:
    REMIND_TICK = min(3600, max(5, int(os.environ.get("ADMIN_REMIND_TICK", "60"))))
except ValueError:
    REMIND_TICK = 60

BOARD_ART_KINDS = ("logo", "banner")
BOARD_ART_TYPES = {
    "image/png": (".png", (b"\x89PNG\r\n\x1a\n",)),
    "image/jpeg": (".jpg", (b"\xff\xd8\xff",)),
    "image/webp": (".webp", (b"RIFF",)),
    "image/gif": (".gif", (b"GIF87a", b"GIF89a")),
}
BOARD_ART_MAX = 512 * 1024

BOARD_FILE_TYPES = {
    "image/png": (".png", (b"\x89PNG\r\n\x1a\n",)),
    "image/jpeg": (".jpg", (b"\xff\xd8\xff",)),
    "image/webp": (".webp", (b"RIFF",)),
    "image/gif": (".gif", (b"GIF87a", b"GIF89a")),
    "application/pdf": (".pdf", (b"%PDF-",)),
}
BOARD_FILE_MAX = 4 * 1024 * 1024
BOARD_THUMB_MAX = 256 * 1024
BOARD_FILES_BYTES_MAX = 64 * 1024 * 1024
CARD_FILES_MAX = 10
FILE_NAME_MAX = 120

BOARD_FACT_LINE_MAX = 120
BOARD_FACT_LINK_MAX = 300
BOARD_FACT_HOST = re.compile(r"^[A-Za-z0-9._:\[\]-]{1,120}$")
BOARD_PURPOSES = (
    {
        "id": "personal",
        "label": "Personal",
        "blurb": "Your own work. Nothing else to fill in.",
        "fields": (),
    },
    {
        "id": "server",
        "label": "Server",
        "blurb": "A game or community server: who owns it, where it runs.",
        "fields": (
            {
                "id": "game",
                "label": "Game or platform",
                "kind": "line",
                "hint": "FiveM, Minecraft, Rust, Discord…",
                "key": True,
            },
            {"id": "owner", "label": "Server owner", "kind": "line", "key": True},
            {"id": "host", "label": "IP or hostname", "kind": "host", "key": True},
            {"id": "port", "label": "Port", "kind": "port", "key": True},
            {
                "id": "contact",
                "label": "How to reach them",
                "kind": "line",
                "hint": "Discord tag, email, phone",
            },
            {"id": "connect", "label": "Connect link", "kind": "link"},
            {"id": "panel", "label": "Host panel", "kind": "link"},
            {"id": "region", "label": "Where it is hosted", "kind": "line"},
            {"id": "slots", "label": "Player slots", "kind": "line"},
            {"id": "renews", "label": "Renews on", "kind": "day"},
        ),
    },
    {
        "id": "client",
        "label": "Client work",
        "blurb": "Paid work for somebody outside the studio.",
        "fields": (
            {"id": "client", "label": "Client", "kind": "line", "key": True},
            {
                "id": "contact",
                "label": "How to reach them",
                "kind": "line",
                "hint": "Discord tag, email, phone",
                "key": True,
            },
            {"id": "deal", "label": "What we are building", "kind": "line", "key": True},
            {
                "id": "stage",
                "label": "Where it stands",
                "kind": "pick",
                "options": ("Talking", "Agreed", "Building", "Handed over", "Paid"),
                "key": True,
            },
            {"id": "price", "label": "Agreed price", "kind": "line"},
            {"id": "due", "label": "Promised for", "kind": "day"},
            {"id": "where", "label": "Where the work lives", "kind": "link"},
        ),
    },
    {
        "id": "bot",
        "label": "Discord bot",
        "blurb": "A bot: which guild it serves and where it runs.",
        "fields": (
            {"id": "bot", "label": "Bot name", "kind": "line", "key": True},
            {
                "id": "guild",
                "label": "Guild id",
                "kind": "line",
                "hint": "Right-click the server, Copy Server ID",
                "key": True,
            },
            {"id": "owner", "label": "Whose bot it is", "kind": "line", "key": True},
            {
                "id": "host",
                "label": "Runs on",
                "kind": "host",
                "hint": "The box or service it lives on",
            },
            {"id": "invite", "label": "Invite link", "kind": "link"},
            {"id": "repo", "label": "Repo", "kind": "link"},
        ),
    },
    {
        "id": "site",
        "label": "Website",
        "blurb": "A domain: where it is hosted and when it renews.",
        "fields": (
            {"id": "domain", "label": "Domain", "kind": "host", "key": True},
            {"id": "owner", "label": "Whose site it is", "kind": "line", "key": True},
            {"id": "hosted", "label": "Hosted on", "kind": "line", "key": True},
            {"id": "live", "label": "Live address", "kind": "link"},
            {"id": "repo", "label": "Repo", "kind": "link"},
            {"id": "renews", "label": "Domain renews", "kind": "day"},
        ),
    },
    {
        "id": "studio",
        "label": "Studio",
        "blurb": "In-house work: the panel, the package, the brand.",
        "fields": (
            {"id": "lead", "label": "Who is leading it", "kind": "line", "key": True},
            {"id": "target", "label": "Aiming for", "kind": "day", "key": True},
            {"id": "where", "label": "Where the work lives", "kind": "link"},
        ),
    },
)
BOARD_PURPOSE_IDS = tuple(entry["id"] for entry in BOARD_PURPOSES)


def fact_fields():
    out = {}
    for purpose in BOARD_PURPOSES:
        for field in purpose["fields"]:
            out.setdefault(field["id"], field)
    return out


BOARD_FACT_FIELDS = fact_fields()


def board_purposes():
    return [
        {
            "id": entry["id"],
            "label": entry["label"],
            "blurb": entry["blurb"],
            "fields": [
                {
                    "id": field["id"],
                    "label": field["label"],
                    "kind": field["kind"],
                    "hint": field.get("hint") or "",
                    "key": bool(field.get("key")),
                    "options": list(field.get("options") or ()),
                }
                for field in entry["fields"]
            ],
        }
        for entry in BOARD_PURPOSES
    ]


def check_id(value, what="card"):
    cleaned = check_text(value, "id")
    if not cleaned or not BOARD_ID.match(cleaned):
        raise StoreError("No such %s." % what, 404)
    return cleaned


def new_board_id():
    return secrets.token_hex(8)


def check_board_name(value):
    cleaned = check_text(value, "name")
    if not cleaned:
        raise StoreError("Give the board a name.")
    if len(cleaned) > BOARD_NAME_MAX:
        raise StoreError("Keep the name under %d characters." % BOARD_NAME_MAX)
    return cleaned


def check_board_note(value):
    cleaned = check_text(value, "description")
    if len(cleaned) > BOARD_NOTE_MAX:
        raise StoreError("Keep the description under %d characters." % BOARD_NOTE_MAX)
    return cleaned


def check_board_colour(value):
    cleaned = check_text(value, "colour").lower() or BOARD_COLOURS[0]
    if cleaned not in BOARD_COLOURS:
        raise StoreError("Pick one of: %s." % ", ".join(BOARD_COLOURS))
    return cleaned


def check_visibility(value, manage=False):
    cleaned = check_text(value, "visibility").lower()
    if cleaned not in BOARD_VISIBILITY:
        raise StoreError("A board is private, team-wide or sealed.")
    if manage == BOARD_OWN and cleaned not in BOARD_OWN_VISIBILITY:
        raise StoreError(
            "Your boards stay private. Opening one to the whole team, or sealing it, takes "
            "Manage boards.",
            403,
        )
    return cleaned


def check_purpose(value):
    cleaned = check_text(value, "purpose").lower() or BOARD_PURPOSE_IDS[0]
    if cleaned not in BOARD_PURPOSE_IDS:
        raise StoreError("Pick one of: %s." % ", ".join(BOARD_PURPOSE_IDS))
    return cleaned


def check_fact(field, value):
    if isinstance(value, bool):
        raise StoreError("%s has to be text." % field["label"])
    if isinstance(value, (int, float)):
        value = str(value)
    cleaned = check_text(value, field["id"])
    if not cleaned:
        return ""
    kind = field["kind"]
    if kind == "host":
        held = cleaned.split("//", 1)[-1].split("/", 1)[0].strip()
        if not held or not BOARD_FACT_HOST.match(held):
            raise StoreError("%s takes a hostname or an IP, with no spaces." % field["label"])
        return held
    if kind == "port":
        if not cleaned.isdigit() or not 1 <= int(cleaned) <= 65535:
            raise StoreError("%s is a number from 1 to 65535." % field["label"])
        return str(int(cleaned))
    if kind == "link":
        if len(cleaned) > BOARD_FACT_LINK_MAX:
            raise StoreError("Keep the address under %d characters." % BOARD_FACT_LINK_MAX)
        return check_link_url(cleaned)
    if kind == "day":
        try:
            datetime.strptime(cleaned, "%Y-%m-%d")
        except ValueError:
            raise StoreError("Use a date like 2026-12-31.")
        return cleaned
    if kind == "pick":
        options = field.get("options") or ()
        held = next((entry for entry in options if entry.lower() == cleaned.lower()), None)
        if held is None:
            raise StoreError("Pick one of: %s." % ", ".join(options))
        return held
    if len(cleaned) > BOARD_FACT_LINE_MAX:
        raise StoreError(
            "Keep %s under %d characters." % (field["label"].lower(), BOARD_FACT_LINE_MAX)
        )
    return cleaned


def check_facts(values):
    if values is None:
        return None
    if not isinstance(values, dict):
        raise StoreError("Those details could not be read.")
    if len(values) > len(BOARD_FACT_FIELDS):
        raise StoreError("That is more detail than a board holds.")
    out = {}
    for key, value in values.items():
        name = check_text(key, "detail").lower()
        field = BOARD_FACT_FIELDS.get(name)
        if field is None:
            raise StoreError("There is no board detail called %s." % (name[:32] or "that"))
        out[name] = check_fact(field, value)
    return out


def check_board_role(value):
    cleaned = check_text(value, "role").lower()
    if cleaned not in BOARD_ROLES:
        raise StoreError("Pick one of: %s." % ", ".join(BOARD_ROLES))
    return cleaned


def check_art_kind(value):
    cleaned = check_text(value, "kind").lower()
    if cleaned not in BOARD_ART_KINDS:
        raise StoreError("Pick one of: %s." % ", ".join(BOARD_ART_KINDS))
    return cleaned


def check_art_focus(value):
    if value is None:
        return None
    if not isinstance(value, dict):
        raise StoreError("A focus point is an x and a y.")
    out = {}
    for axis in ("x", "y"):
        held = value.get(axis, 50)
        if isinstance(held, bool) or not isinstance(held, (int, float)):
            raise StoreError("A focus point is an x and a y between 0 and 100.")
        out[axis] = int(round(max(0.0, min(100.0, float(held)))))
    return out


def check_attachment_blob(content_type, blob):
    kind = check_text(content_type, "type").lower().split(";", 1)[0].strip()
    known = BOARD_FILE_TYPES.get(kind)
    if known is None:
        raise StoreError("A card takes a PNG, JPEG, WebP or GIF image, or a PDF.")
    if not isinstance(blob, (bytes, bytearray)) or not blob:
        raise StoreError("That file is empty.")
    data = bytes(blob)
    if len(data) > BOARD_FILE_MAX:
        raise StoreError("Keep a file under %d MB." % (BOARD_FILE_MAX // (1024 * 1024)))
    if not any(data.startswith(magic) for magic in known[1]):
        raise StoreError("That file is not the %s it says it is." % kind.split("/")[-1].upper())
    if kind == "image/webp" and data[8:12] != b"WEBP":
        raise StoreError("That file is not the WEBP it says it is.")
    return kind, known[0], data


def check_thumb_blob(content_type, blob):
    kind = check_text(content_type, "type").lower().split(";", 1)[0].strip()
    known = BOARD_FILE_TYPES.get(kind)
    if known is None or kind == "application/pdf":
        raise StoreError("A preview has to be an image.")
    if not isinstance(blob, (bytes, bytearray)) or not blob:
        raise StoreError("That preview is empty.")
    data = bytes(blob)
    if len(data) > BOARD_THUMB_MAX:
        raise StoreError("Keep a preview under %d KB." % (BOARD_THUMB_MAX // 1024))
    if not any(data.startswith(magic) for magic in known[1]):
        raise StoreError("That preview is not the image it says it is.")
    if kind == "image/webp" and data[8:12] != b"WEBP":
        raise StoreError("That preview is not the image it says it is.")
    return known[0], kind, data


def check_attachment_name(value, suffix):
    raw = str(value or "").replace("\\", "/")
    cleaned = os.path.basename(raw).strip()
    cleaned = "".join(letter for letter in cleaned if letter.isprintable()).strip()
    cleaned = cleaned.lstrip(".").strip()
    if len(cleaned) > FILE_NAME_MAX:
        stem, dot, tail = cleaned.rpartition(".")
        cleaned = (stem or tail)[: FILE_NAME_MAX - len(suffix)] + (dot and "." + tail or "")
    if not cleaned:
        cleaned = "attachment"
    lowered = cleaned.lower()
    if lowered.endswith(suffix):
        return cleaned
    if suffix == ".jpg" and lowered.endswith(".jpeg"):
        return cleaned[: -len(".jpeg")] + suffix
    return cleaned + suffix


def check_art_blob(content_type, blob):
    kind = check_text(content_type, "type").lower().split(";", 1)[0].strip()
    known = BOARD_ART_TYPES.get(kind)
    if known is None:
        raise StoreError("Use a PNG, JPEG, WebP or GIF image.")
    if not isinstance(blob, (bytes, bytearray)) or not blob:
        raise StoreError("That image is empty.")
    data = bytes(blob)
    if len(data) > BOARD_ART_MAX:
        raise StoreError("Keep the image under %d KB." % (BOARD_ART_MAX // 1024))
    if not any(data.startswith(magic) for magic in known[1]):
        raise StoreError("That file is not the image it says it is.")
    if kind == "image/webp" and data[8:12] != b"WEBP":
        raise StoreError("That file is not the image it says it is.")
    return kind, known[0], data


def check_board_seats(entries, cap=BOARD_MEMBERS_MAX):
    if entries is None:
        return {}
    if not isinstance(entries, list):
        raise StoreError("Nobody was named.")
    seats = {}
    for entry in entries:
        if isinstance(entry, str):
            entry = {"name": entry}
        if not isinstance(entry, dict):
            raise StoreError("Nobody was named.")
        account = check_account_ref(entry.get("name"))
        if account.lower() in BOARD_KEYHOLDERS:
            continue
        seats[account] = check_board_role(entry.get("role") or "editor")
    if len(seats) > cap:
        raise StoreError("A board takes at most %d people." % cap)
    return seats


def check_list_name(value):
    cleaned = check_text(value, "name")
    if not cleaned:
        raise StoreError("Give the column a name.")
    if len(cleaned) > LIST_NAME_MAX:
        raise StoreError("Keep the column name under %d characters." % LIST_NAME_MAX)
    return cleaned


def check_list_cap(value):
    if value is None or value == "" or value is False:
        return None
    try:
        wanted = int(value)
    except (TypeError, ValueError):
        raise StoreError("A column limit is a number.")
    if wanted <= 0:
        return None
    if wanted > LIST_CAP_MAX:
        raise StoreError("Keep the column limit under %d." % LIST_CAP_MAX)
    return wanted


def check_sort_by(value):
    cleaned = check_text(value, "sort").lower()
    if cleaned not in LIST_SORTS:
        raise StoreError("Sort by %s." % ", ".join(LIST_SORTS))
    return cleaned


def check_bulk_ids(value):
    if not isinstance(value, list):
        raise StoreError("That is not a list of cards.")
    out = []
    for entry in value:
        identifier = check_id(entry)
        if identifier not in out:
            out.append(identifier)
    if not out:
        raise StoreError("Pick a card first.")
    if len(out) > CARD_BULK_MAX:
        raise StoreError("Change at most %d cards at a time." % CARD_BULK_MAX)
    return out


def check_card_title(value):
    cleaned = check_text(value, "title")
    if not cleaned:
        raise StoreError("Give the card a title.")
    if len(cleaned) > CARD_TITLE_MAX:
        raise StoreError("Keep the title under %d characters." % CARD_TITLE_MAX)
    return cleaned


def check_card_notes(value):
    cleaned = check_text(value, "notes")
    if len(cleaned) > CARD_NOTES_MAX:
        raise StoreError("Keep the notes under %d characters." % CARD_NOTES_MAX)
    return cleaned


def check_card_comment(value):
    cleaned = check_text(value, "comment")
    if not cleaned:
        raise StoreError("Write something first.")
    if len(cleaned) > CARD_COMMENT_MAX:
        raise StoreError("Keep the comment under %d characters." % CARD_COMMENT_MAX)
    return cleaned


def check_check_text(value):
    cleaned = check_text(value, "step")
    if not cleaned:
        raise StoreError("Give the step a name.")
    if len(cleaned) > CARD_CHECK_MAX:
        raise StoreError("Keep the step under %d characters." % CARD_CHECK_MAX)
    return cleaned


def check_label_name(value):
    cleaned = check_text(value, "label")
    if not cleaned:
        raise StoreError("Give the label a name.")
    if len(cleaned) > LABEL_NAME_MAX:
        raise StoreError("Keep the label under %d characters." % LABEL_NAME_MAX)
    return cleaned


def check_link_label(value, url):
    cleaned = check_text(value, "label")
    if not cleaned:
        cleaned = urllib.parse.urlsplit(url).netloc or "Link"
    if len(cleaned) > CARD_LINK_LABEL_MAX:
        raise StoreError("Keep the link name under %d characters." % CARD_LINK_LABEL_MAX)
    return cleaned


def check_link_url(value):
    url = check_text(value, "address")
    if not url:
        raise StoreError("Paste the address the link should point at.")
    if len(url) > CARD_LINK_URL_MAX:
        raise StoreError("That address is too long.")
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise StoreError("A link has to start with http:// or https://.")
    if parts.username or parts.password:
        raise StoreError("Leave the username and password out of the address.")
    if not (parts.hostname or "").strip():
        raise StoreError("That address has no host in it.")
    return url


def check_due(value):
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise StoreError("That due date is not a date.")
    cleaned = value.strip().replace("Z", "+00:00")
    try:
        moment = datetime.fromisoformat(cleaned)
    except ValueError:
        raise StoreError("Use a date like 2026-12-31T18:00Z.")
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    stamp = moment.astimezone(timezone.utc).replace(microsecond=0)
    if abs(stamp - datetime.now(timezone.utc)) > timedelta(days=DUE_WINDOW_DAYS):
        raise StoreError("Pick a due date within five years.")
    return stamp.isoformat().replace("+00:00", "Z")


def iso_seconds(value):
    try:
        moment = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.timestamp()


def step_seconds(step):
    found = REMIND_STEP.match(str(step or ""))
    return int(found.group(1)) * REMIND_UNITS[found.group(2)] if found else 0


def check_step(value):
    found = REMIND_STEP.match(str(value or "").strip().lower())
    if not found:
        raise StoreError("Write a reminder like 2d, 3h or 15m.")
    seconds = int(found.group(1)) * REMIND_UNITS[found.group(2)]
    if seconds < 60:
        raise StoreError("The closest a reminder gets is one minute.")
    if seconds > REMIND_STEP_MAX:
        raise StoreError("Reminders reach 60 days out at most.")
    return "%d%s" % (int(found.group(1)), found.group(2))


def check_steps(values, side):
    if values is None:
        return []
    if not isinstance(values, (list, tuple)):
        raise StoreError("That is not a list of reminders.")
    out = []
    seen = set()
    for entry in values:
        step = check_step(entry)
        seconds = step_seconds(step)
        if seconds in seen:
            continue
        seen.add(seconds)
        out.append(step)
    if len(out) > REMIND_STEPS_MAX:
        raise StoreError("Keep it to %d reminders %s." % (REMIND_STEPS_MAX, side))
    out.sort(key=step_seconds, reverse=True)
    return out


def remind_default():
    return {
        "on": False,
        "lead": list(REMIND_LEAD_DEFAULT),
        "late": list(REMIND_LATE_DEFAULT),
        "who": "assignees",
        "goes": {},
        "events": list(REMIND_EVENTS),
    }


def check_remind_aim(value, seats, what):
    if isinstance(value, (list, tuple)):
        chosen = []
        for entry in value:
            name = check_account_ref(entry)
            if seats is not None:
                seated = next((seat for seat in seats if seat.lower() == name.lower()), None)
                if seated is None:
                    raise StoreError("%s is not on this board." % name[:32])
                name = seated
            if name not in chosen:
                chosen.append(name)
        if not chosen:
            raise StoreError("Pick at least one person for %s." % what)
        if len(chosen) > BOARD_MEMBERS_MAX:
            raise StoreError("That is more people than a board holds.")
        return sorted(chosen)
    picked = str(value or "assignees").strip()
    if picked not in REMIND_WHO:
        raise StoreError("Say who %s go to." % what)
    return picked


def check_remind_goes(value, seats=None):
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise StoreError("That is not a list of who each one goes to.")
    out = {}
    for thing in REMIND_AIMED:
        picked = value.get(thing)
        if picked is None or picked == "" or picked == "general":
            continue
        out[thing] = check_remind_aim(picked, seats, "the %s ones" % thing)
    return out


def remind_who(setup, thing):
    if not isinstance(setup, dict):
        return "assignees"
    goes = setup.get("goes")
    picked = goes.get(thing) if isinstance(goes, dict) else None
    if picked in REMIND_WHO or isinstance(picked, list):
        return picked
    who = setup.get("who")
    return who if who in REMIND_WHO or isinstance(who, list) else "assignees"


def check_remind(value, seats=None):
    if value is None:
        return remind_default()
    if not isinstance(value, dict):
        raise StoreError("That is not a reminder setup.")
    who = check_remind_aim(value.get("who"), seats, "the reminders")
    chosen = value.get("events")
    if chosen is None:
        events = list(REMIND_EVENTS)
    elif isinstance(chosen, (list, tuple)):
        picked = set(chosen)
        events = [entry for entry in REMIND_EVENTS if entry in picked]
    else:
        raise StoreError("That is not a list of things to be told about.")
    setup = {
        "on": bool(value.get("on")),
        "lead": check_steps(value.get("lead"), "before it is due"),
        "late": check_steps(value.get("late"), "after it is due"),
        "who": who,
        "goes": check_remind_goes(value.get("goes"), seats),
        "events": events,
    }
    if setup["on"] and not (setup["lead"] or setup["late"] or setup["events"]):
        raise StoreError("Reminders are on but there is nothing to send — add a time or an event.")
    return setup


def remind_public(stored):
    if not isinstance(stored, dict):
        return remind_default()
    try:
        return check_remind(stored)
    except StoreError:
        return remind_default()


def check_account_ref(value):
    cleaned = check_text(value, "account")
    if not cleaned or len(cleaned) > MAX_NAME:
        raise StoreError("There is no account by that name.")
    return cleaned


def check_assignees(values, known=None):
    if values is None:
        return None
    if not isinstance(values, list):
        raise StoreError("That is not a list of accounts.")
    out = []
    for entry in values:
        name = check_account_ref(entry)
        if known is not None and name not in known:
            raise StoreError("There is no account called %s." % name[:32])
        if name not in out:
            out.append(name)
    if len(out) > CARD_ASSIGNEES_MAX:
        raise StoreError("A card takes at most %d people." % CARD_ASSIGNEES_MAX)
    return out


class Boards:

    def __init__(self, path, group=None, art_dir=None, file_dir=None):
        self.file = open_doc(path, {"version": 1, "boards": {}}, 0o640, group)
        self.group = group
        self.art_dir = art_dir or os.path.join(os.path.dirname(path) or ".", "board-art")
        self.file_dir = file_dir or os.path.join(os.path.dirname(path) or ".", "board-files")
        self.watch = threading.Lock()
        self.stamp = None
        self.marks = {}
        self.crowd = {}
        self.crowd_watch = threading.Lock()

    def _records(self, payload):
        records = payload.get("boards")
        if not isinstance(records, dict):
            records = {}
            payload["boards"] = records
        return records

    @staticmethod
    def keyholder(actor):
        return str(actor or "").strip().lower() in BOARD_KEYHOLDERS

    @staticmethod
    def _kept_facts(record):
        return {
            key: value
            for key, value in (record.get("facts") or {}).items()
            if key in BOARD_FACT_FIELDS and isinstance(value, str) and value
        }

    @classmethod
    def _facts(cls, record, given):
        held = cls._kept_facts(record)
        for key, value in (given or {}).items():
            if value:
                held[key] = value
            else:
                held.pop(key, None)
        return held

    @staticmethod
    def _people(record):
        seated = dict(record.get("members") or {})
        for name in BOARD_KEYHOLDER_NAMES:
            held = next((entry for entry in seated if entry.lower() == name.lower()), None)
            seated[held or name] = "owner"
        return seated

    @classmethod
    def seat(cls, record, actor, manage=False):
        if cls.keyholder(actor):
            return "owner"
        held = (record.get("members") or {}).get(actor)
        if record.get("visibility") == "sealed":
            return held if held in BOARD_ROLES else None
        if manage and manage != BOARD_OWN:
            return "owner"
        if held in BOARD_ROLES:
            return held
        if record.get("visibility") == "team" and manage != BOARD_OWN:
            return "editor"
        return None

    def _open(self, payload, board_id, actor, manage, need="read"):
        record = self._records(payload).get(check_id(board_id, "board"))
        if not isinstance(record, dict):
            raise StoreError("No such board.", 404)
        seat = self.seat(record, actor, manage)
        if seat is None:
            raise StoreError("No such board.", 404)
        if need in ("write", "admin") and record.get("archived"):
            raise StoreError("That board is archived — restore it before changing anything.", 409)
        if need == "write" and seat == "viewer":
            raise StoreError("You can read this board, not change it.", 403)
        if need == "admin" and seat != "owner":
            raise StoreError("Only a board owner can change that.", 403)
        return record, seat

    @staticmethod
    def _lists(record):
        entries = record.get("lists")
        if not isinstance(entries, list):
            entries = []
            record["lists"] = entries
        return entries

    @staticmethod
    def _cards(record):
        cards = record.get("cards")
        if not isinstance(cards, dict):
            cards = {}
            record["cards"] = cards
        return cards

    def _column(self, record, list_id):
        wanted = check_id(list_id, "column")
        for entry in self._lists(record):
            if entry.get("id") == wanted:
                return entry
        raise StoreError("No such column.", 404)

    def _card(self, record, card_id):
        card = self._cards(record).get(check_id(card_id))
        if not isinstance(card, dict):
            raise StoreError("No such card.", 404)
        return card


    @staticmethod
    def _cap(column):
        held = (column or {}).get("cap")
        if not isinstance(held, int) or held <= 0:
            return None
        return min(held, LIST_CAP_MAX)

    def _load(self, record, column):
        cards = self._cards(record)
        held = 0
        for identifier in (column or {}).get("cards") or []:
            card = cards.get(identifier)
            if isinstance(card, dict) and not card.get("archived"):
                held += 1
        return held

    def _room(self, record, column, coming=1):
        cap = self._cap(column)
        if cap is None:
            return
        if self._load(record, column) + coming <= cap:
            return
        raise StoreError(
            "%s is at its limit of %d %s \u2014 move one out, or change the limit from the "
            "column menu."
            % (column.get("name") or "That column", cap, "card" if cap == 1 else "cards"),
            409,
        )

    @staticmethod
    def _rev(record):
        held = record.get("rev")
        return held if isinstance(held, int) and held >= 0 else 0

    @classmethod
    def _bump(cls, record):
        record["rev"] = cls._rev(record) + 1

    @classmethod
    def _touch(cls, record, actor):
        record["changed"] = now_iso()
        record["changedBy"] = actor
        cls._bump(record)

    @staticmethod
    def _trail(card, actor, what, detail=None):
        entries = card.get("activity")
        if not isinstance(entries, list):
            entries = []
        entries.append({"at": now_iso(), "by": actor, "what": what, "detail": detail or {}})
        card["activity"] = entries[-CARD_ACTIVITY_KEEP:]

    @staticmethod
    def _owners(record):
        return [name for name, held in (record.get("members") or {}).items() if held == "owner"]

    @staticmethod
    def _art(record):
        held = record.get("art")
        if not isinstance(held, dict):
            held = {}
            record["art"] = held
        return held

    def _art_file(self, board_id, kind, suffix):
        return os.path.join(self.art_dir, "%s-%s%s" % (board_id, kind, suffix))

    def _art_write(self, path, blob):
        self._blob_write(self.art_dir, ".art-", path, blob)

    def _blob_write(self, folder, prefix, path, blob):
        os.makedirs(folder, exist_ok=True)
        handle = tempfile.NamedTemporaryFile(
            mode="wb", dir=folder, prefix=prefix, suffix=".tmp", delete=False
        )
        try:
            handle.write(blob)
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
            os.replace(handle.name, path)
        except BaseException:
            try:
                os.unlink(handle.name)
            except OSError:
                pass
            raise

    def _art_unlink(self, board_id, kind, held):
        suffix = (held or {}).get("ext")
        if not suffix:
            return
        try:
            os.unlink(self._art_file(board_id, kind, suffix))
        except OSError:
            pass

    def _art_clear(self, record):
        for kind, held in (record.get("art") or {}).items():
            if isinstance(held, dict):
                self._art_unlink(record.get("id"), kind, held)

    @staticmethod
    def _files(card):
        held = (card or {}).get("files")
        if not isinstance(held, list):
            held = []
            if isinstance(card, dict):
                card["files"] = held
        return held

    def _file_path(self, entry, thumb=False):
        if thumb:
            return os.path.join(self.file_dir, "%s-t%s" % (entry.get("id"), entry.get("thumb")))
        return os.path.join(self.file_dir, "%s%s" % (entry.get("id"), entry.get("ext") or ""))

    def _file_unlink(self, entry):
        if not isinstance(entry, dict) or not entry.get("id"):
            return
        for path in [self._file_path(entry)] + (
            [self._file_path(entry, True)] if entry.get("thumb") else []
        ):
            try:
                os.unlink(path)
            except OSError:
                pass

    def _files_unlink(self, files):
        for entry in files or []:
            self._file_unlink(entry)

    def _files_clear(self, record):
        for card in (record.get("cards") or {}).values():
            if isinstance(card, dict):
                self._files_unlink(card.get("files"))
        for held in record.get("bin") or []:
            if isinstance(held, dict):
                self._files_unlink((held.get("card") or {}).get("files"))

    def _files_weight(self, record):
        held = 0
        for card in (record.get("cards") or {}).values():
            if isinstance(card, dict):
                for entry in card.get("files") or []:
                    held += int(entry.get("bytes") or 0)
        return held

    def _files_copy(self, record, files):
        taken = set()
        for card in (record.get("cards") or {}).values():
            if isinstance(card, dict):
                for entry in card.get("files") or []:
                    taken.add(entry.get("id"))
        made = []
        try:
            for entry in files or []:
                if not isinstance(entry, dict):
                    continue
                identifier = new_board_id()
                while identifier in taken:
                    identifier = new_board_id()
                taken.add(identifier)
                copy = dict(entry, id=identifier)
                try:
                    with open(self._file_path(entry), "rb") as handle:
                        data = handle.read()
                except OSError:
                    continue
                self._blob_write(self.file_dir, ".file-", self._file_path(copy), data)
                if entry.get("thumb"):
                    try:
                        with open(self._file_path(entry, True), "rb") as handle:
                            small = handle.read()
                    except OSError:
                        copy.pop("thumb", None)
                    else:
                        self._blob_write(
                            self.file_dir, ".file-", self._file_path(copy, True), small
                        )
                made.append(copy)
        except BaseException:
            self._files_unlink(made)
            raise
        return made

    def set_art(self, board_id, kind, content_type, blob, actor, manage=False, focus=None):
        wanted = check_art_kind(kind)
        mime, suffix, data = check_art_blob(content_type, blob)
        placed = check_art_focus(focus)
        digest = hashlib.sha256(data).hexdigest()[:16]

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "admin")
            art = self._art(record)
            held = art.get(wanted)
            self._art_write(self._art_file(record["id"], wanted, suffix), data)
            if isinstance(held, dict) and held.get("ext") != suffix:
                self._art_unlink(record["id"], wanted, held)
            art[wanted] = {
                "type": mime,
                "ext": suffix,
                "bytes": len(data),
                "hash": digest,
                "focus": placed or {"x": 50, "y": 50},
                "at": now_iso(),
                "by": actor,
            }
            self._touch(record, actor)
            return self.detail(record, seat, actor)

        return self.file.update(mutate)

    def place_art(self, board_id, kind, focus, actor, manage=False):
        wanted = check_art_kind(kind)
        placed = check_art_focus(focus)
        if placed is None:
            raise StoreError("Say where the image should sit.")

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "admin")
            held = self._art(record).get(wanted)
            if not isinstance(held, dict):
                raise StoreError("There is no %s on this board." % wanted, 404)
            held["focus"] = placed
            self._touch(record, actor)
            return self.detail(record, seat, actor)

        return self.file.update(mutate)

    def drop_art(self, board_id, kind, actor, manage=False):
        wanted = check_art_kind(kind)

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "admin")
            held = self._art(record).pop(wanted, None)
            if not isinstance(held, dict):
                raise StoreError("There is no %s on this board." % wanted, 404)
            self._art_unlink(record["id"], wanted, held)
            self._touch(record, actor)
            return self.detail(record, seat, actor)

        return self.file.update(mutate)

    def art(self, board_id, kind, actor, manage=False):
        wanted = check_art_kind(kind)
        payload = self.file.read()
        record, _ = self._open(payload, board_id, actor, manage)
        held = (record.get("art") or {}).get(wanted)
        if not isinstance(held, dict) or not held.get("ext"):
            raise StoreError("There is no %s on this board." % wanted, 404)
        try:
            with open(self._art_file(record["id"], wanted, held["ext"]), "rb") as handle:
                data = handle.read()
        except OSError:
            raise StoreError("That image is no longer on disk.", 404)
        return held.get("type") or "application/octet-stream", data

    def _finish(self, card, actor, done):
        card["done"] = bool(done)
        card["completed"] = now_iso() if done else None
        card["completedBy"] = actor if done else None
        card["reminded"] = {}
        self._trail(card, actor, "done" if done else "reopened")

    def _next_seq(self, record):
        held = record.get("nextSeq")
        if not isinstance(held, int) or held < 1:
            seen = [
                card.get("seq")
                for card in self._cards(record).values()
                if isinstance(card, dict) and isinstance(card.get("seq"), int)
            ]
            held = (max(seen) if seen else 0) + 1
        record["nextSeq"] = held + 1
        return held

    @staticmethod
    def card_brief(card):
        steps = card.get("checklist") or []
        return {
            "id": card.get("id"),
            "seq": card.get("seq"),
            "list": card.get("list"),
            "title": card.get("title"),
            "due": card.get("due"),
            "done": bool(card.get("done")),
            "labels": list(card.get("labels") or []),
            "assignees": list(card.get("assignees") or []),
            "steps": [len([step for step in steps if step.get("done")]), len(steps)],
            "comments": len(card.get("comments") or []),
        }

    @staticmethod
    def card_public(card):
        return {
            "id": card.get("id"),
            "seq": card.get("seq"),
            "list": card.get("list"),
            "title": card.get("title"),
            "notes": card.get("notes") or "",
            "done": bool(card.get("done")),
            "archived": bool(card.get("archived")),
            "due": card.get("due"),
            "assignees": list(card.get("assignees") or []),
            "labels": list(card.get("labels") or []),
            "checklist": [dict(step) for step in card.get("checklist") or []],
            "comments": [dict(entry) for entry in card.get("comments") or []],
            "links": [dict(entry) for entry in card.get("links") or []],
            "files": [
                {
                    "id": entry.get("id"),
                    "name": entry.get("name"),
                    "type": entry.get("type"),
                    "bytes": entry.get("bytes"),
                    "by": entry.get("by"),
                    "at": entry.get("at"),
                    "thumb": bool(entry.get("thumb")),
                }
                for entry in card.get("files") or []
                if isinstance(entry, dict)
            ],
            "activity": [dict(entry) for entry in card.get("activity") or []],
            "created": card.get("created"),
            "createdBy": card.get("createdBy"),
            "changed": card.get("changed"),
            "changedBy": card.get("changedBy"),
            "completed": card.get("completed"),
            "completedBy": card.get("completedBy"),
        }

    def summary(self, record, seat, actor):
        moment = now_iso()
        soon = now_iso(time.time() + SOON_HOURS * 3600)
        cards = [card for card in self._cards(record).values() if isinstance(card, dict)]
        live = [card for card in cards if not card.get("archived")]
        overdue = [
            card
            for card in live
            if not card.get("done") and card.get("due") and str(card.get("due")) < moment
        ]
        return {
            "id": record.get("id"),
            "name": record.get("name"),
            "note": record.get("note") or "",
            "colour": record.get("colour") or BOARD_COLOURS[0],
            "visibility": record.get("visibility") or "private",
            "purpose": record.get("purpose") or BOARD_PURPOSE_IDS[0],
            "facts": self._kept_facts(record),
            "archived": bool(record.get("archived")),
            "art": {
                kind: dict(held)
                for kind, held in (record.get("art") or {}).items()
                if kind in BOARD_ART_KINDS and isinstance(held, dict)
            },
            "members": self._people(record),
            "granted": {
                name: dict(entry)
                for name, entry in (record.get("granted") or {}).items()
                if name in (record.get("members") or {}) and isinstance(entry, dict)
            },
            "asks": [dict(entry) for entry in self._asks(record)],
            "labels": [dict(label) for label in record.get("labels") or []],
            "remind": remind_public(record.get("remind")),
            "created": record.get("created"),
            "createdBy": record.get("createdBy"),
            "changed": record.get("changed"),
            "changedBy": record.get("changedBy"),
            "rev": self._rev(record),
            "seat": seat,
            "canWrite": seat in ("owner", "editor") and not record.get("archived"),
            "canAdmin": seat == "owner" and not record.get("archived"),
            "counts": {
                "lists": len(self._lists(record)),
                "cards": len(live),
                "done": len([card for card in live if card.get("done")]),
                "archived": len(cards) - len(live),
                "overdue": len(overdue),
                "soon": len(
                    [
                        card
                        for card in live
                        if not card.get("done")
                        and card.get("due")
                        and moment <= str(card.get("due")) <= soon
                    ]
                ),
                "mine": len(
                    [
                        card
                        for card in live
                        if not card.get("done") and actor in (card.get("assignees") or [])
                    ]
                ),
            },
        }

    def detail(self, record, seat, actor):
        out = self.summary(record, seat, actor)
        out["lists"] = [
            {
                "id": entry.get("id"),
                "name": entry.get("name"),
                "done": bool(entry.get("done")),
                "cap": self._cap(entry),
                "cards": [
                    identifier
                    for identifier in entry.get("cards") or []
                    if identifier in self._cards(record)
                ],
            }
            for entry in self._lists(record)
        ]
        out["cards"] = {
            identifier: self.card_public(card)
            for identifier, card in self._cards(record).items()
            if isinstance(card, dict)
        }
        return out

    def listing(self, actor, manage=False, archived=False):
        payload = self.file.read()
        out = []
        for record in self._records(payload).values():
            if not isinstance(record, dict):
                continue
            if bool(record.get("archived")) != bool(archived):
                continue
            seat = self.seat(record, actor, manage)
            if seat is None:
                continue
            out.append(self.summary(record, seat, actor))
        out.sort(key=lambda entry: (entry["name"] or "").lower())
        return out

    def board(self, board_id, actor, manage=False):
        payload = self.file.read()
        record, seat = self._open(payload, board_id, actor, manage)
        return self.detail(record, seat, actor)

    def _marks(self):
        path = getattr(self.file, "path", None)
        key = None
        if path:
            try:
                held = os.stat(path)
                key = (held.st_mtime_ns, held.st_size, held.st_ino)
            except OSError:
                key = None
        with self.watch:
            if key is not None and key == self.stamp:
                return self.marks
            table = {}
            for identifier, record in self._records(self.file.read()).items():
                if not isinstance(record, dict):
                    continue
                table[identifier] = {
                    "rev": self._rev(record),
                    "members": dict(record.get("members") or {}),
                    "visibility": record.get("visibility") or "private",
                    "archived": bool(record.get("archived")),
                }
            self.stamp = key
            self.marks = table
            return table

    def _crowd(self, board_id, actor):
        edge = time.time() - BOARD_HERE_SECONDS
        with self.crowd_watch:
            for held in list(self.crowd):
                self.crowd[held] = {
                    name: at for name, at in self.crowd[held].items() if at > edge
                }
                if not self.crowd[held]:
                    del self.crowd[held]
            here = self.crowd.setdefault(board_id, {})
            here[actor] = time.time()
            return sorted(name for name in here if name != actor)

    def pulse(self, actor, manage=False, watching=None):
        table = self._marks()
        seen = {
            identifier: entry["rev"]
            for identifier, entry in table.items()
            if self.seat(entry, actor, manage) is not None
        }
        out = {"at": now_iso(), "boards": seen}
        if watching and watching in seen:
            out["here"] = self._crowd(watching, actor)
        return out

    def assigned(self, actor, manage=False, limit=200):
        payload = self.file.read()
        out = []
        for record in self._records(payload).values():
            if not isinstance(record, dict) or record.get("archived"):
                continue
            if self.seat(record, actor, manage) is None:
                continue
            columns = {entry.get("id"): entry.get("name") for entry in self._lists(record)}
            palette = {
                label.get("id"): dict(label)
                for label in record.get("labels") or []
                if isinstance(label, dict)
            }
            for card in self._cards(record).values():
                if not isinstance(card, dict) or card.get("archived") or card.get("done"):
                    continue
                if actor not in (card.get("assignees") or []):
                    continue
                brief = self.card_brief(card)
                brief["labels"] = [palette[entry] for entry in brief["labels"] if entry in palette]
                out.append(
                    {
                        "board": {
                            "id": record.get("id"),
                            "name": record.get("name"),
                            "colour": record.get("colour") or BOARD_COLOURS[0],
                            "art": {
                                kind: dict(held)
                                for kind, held in (record.get("art") or {}).items()
                                if kind == "logo" and isinstance(held, dict)
                            },
                        },
                        "column": columns.get(card.get("list")),
                        "card": brief,
                    }
                )
        out.sort(
            key=lambda entry: (
                entry["card"].get("due") or "~",
                (entry["card"].get("title") or "").lower(),
            )
        )
        return out[:limit]

    @classmethod
    def _remind_people(cls, record, card, who):
        seated = cls._people(record)
        if isinstance(who, (list, tuple)):
            held = {name.lower(): name for name in seated}
            return sorted({held[key] for key in (str(name).lower() for name in who) if key in held})
        if who == "board":
            return sorted(seated)
        if who == "owners":
            return sorted(name for name, held in seated.items() if held == "owner")
        return list((card or {}).get("assignees") or [])

    def _remind_jobs(self, payload, stamp, ready):
        out = []
        for record in self._records(payload).values():
            if not isinstance(record, dict) or record.get("archived"):
                continue
            setup = remind_public(record.get("remind"))
            if not setup["on"] or not (setup["lead"] or setup["late"]):
                continue
            columns = {entry.get("id"): entry.get("name") for entry in self._lists(record)}
            for card in self._cards(record).values():
                if not isinstance(card, dict) or card.get("archived") or card.get("done"):
                    continue
                when = iso_seconds(card.get("due"))
                if when is None:
                    continue
                crowd = self._remind_people(record, card, remind_who(setup, "due"))
                if not crowd:
                    continue
                rungs = [("-%s" % step, when - step_seconds(step)) for step in setup["lead"]]
                rungs += [("+%s" % step, when + step_seconds(step)) for step in setup["late"]]
                passed = sorted(
                    [entry for entry in rungs if entry[1] <= stamp], key=lambda entry: entry[1]
                )
                if not passed:
                    continue
                told = card.get("reminded")
                told = told if isinstance(told, dict) else {}
                rung = passed[-1][0]
                stale = [
                    key
                    for key, _ in passed[:-1]
                    if sorted(told.get(key) or []) != sorted(crowd)
                ]
                people = [
                    name
                    for name in crowd
                    if name not in (told.get(rung) or []) and ready(name)
                ]
                if not stale and not people:
                    continue
                out.append(
                    {
                        "board": record.get("id"),
                        "name": record.get("name") or "",
                        "colour": record.get("colour") or BOARD_COLOURS[0],
                        "card": card.get("id"),
                        "seq": card.get("seq"),
                        "title": card.get("title") or "",
                        "column": columns.get(card.get("list")) or "",
                        "due": card.get("due"),
                        "late": rung.startswith("+"),
                        "step": rung[1:],
                        "rung": rung,
                        "keys": [key for key, _ in rungs],
                        "stale": stale,
                        "crowd": crowd,
                        "people": people,
                        "assignees": list(card.get("assignees") or []),
                    }
                )
        return out

    def due_sweep(self, ready, moment=None):
        stamp = float(moment if moment is not None else time.time())
        if not self._remind_jobs(self.file.read(), stamp, ready):
            return []

        def mutate(payload):
            sent = []
            for job in self._remind_jobs(payload, stamp, ready):
                record = self._records(payload).get(job["board"])
                if not isinstance(record, dict):
                    continue
                card = self._cards(record).get(job["card"])
                if not isinstance(card, dict):
                    continue
                told = card.get("reminded")
                told = dict(told) if isinstance(told, dict) else {}
                for key in job["stale"]:
                    told[key] = list(job["crowd"])
                if job["people"]:
                    told[job["rung"]] = sorted(
                        set((told.get(job["rung"]) or []) + job["people"])
                    )
                    sent.append(job)
                card["reminded"] = {
                    key: value for key, value in told.items() if key in job["keys"]
                }
            return sent

        return self.file.update(mutate)

    def notice(self, board_id, card_id=None):
        try:
            wanted = check_id(board_id, "board")
        except StoreError:
            return None
        record = self._records(self.file.read()).get(wanted)
        if not isinstance(record, dict):
            return None
        out = {
            "id": record.get("id"),
            "name": record.get("name") or "",
            "remind": remind_public(record.get("remind")),
            "archived": bool(record.get("archived")),
            "owners": self._owners(record),
        }
        card = self._cards(record).get(card_id) if card_id else None
        if isinstance(card, dict):
            columns = {entry.get("id"): entry.get("name") for entry in self._lists(record)}
            out["card"] = self.card_brief(card)
            out["column"] = columns.get(card.get("list")) or ""
            out["people"] = self._remind_people(record, card, out["remind"]["who"])
            out["crowds"] = {
                thing: self._remind_people(record, card, remind_who(out["remind"], thing))
                for thing in REMIND_AIMED
            }
        return out

    def create(self, name, note, colour, visibility, actor, members=None, purpose=None, facts=None,
               manage=False):
        board_name = check_board_name(name)
        description = check_board_note(note)
        shade = check_board_colour(colour)
        seen_by = check_visibility(visibility or "private", manage)
        seats = check_board_seats(members, BOARD_MEMBERS_MAX - 1)
        about = check_purpose(purpose or BOARD_PURPOSE_IDS[0])
        details = self._facts({}, check_facts(facts))

        def mutate(payload):
            records = self._records(payload)
            if len(records) >= BOARDS_MAX:
                raise StoreError("There are already %d boards." % BOARDS_MAX)
            identifier = new_board_id()
            while identifier in records:
                identifier = new_board_id()
            record = {
                "id": identifier,
                "name": board_name,
                "note": description,
                "colour": shade,
                "visibility": seen_by,
                "purpose": about,
                "facts": details,
                "archived": False,
                "art": {},
                "members": {actor: "owner"},
                "asks": [
                    {
                        "id": new_board_id(),
                        "who": account,
                        "role": role,
                        "by": actor,
                        "at": now_iso(),
                    }
                    for account, role in seats.items()
                    if account != actor and not self.keyholder(account)
                ],
                "labels": [],
                "lists": [
                    {
                        "id": new_board_id(),
                        "name": title,
                        "cards": [],
                        "done": title == BOARD_STARTING_LISTS[-1],
                    }
                    for title in BOARD_STARTING_LISTS
                ],
                "cards": {},
                "nextSeq": 1,
                "rev": 1,
                "created": now_iso(),
                "createdBy": actor,
                "changed": now_iso(),
                "changedBy": actor,
            }
            records[identifier] = record
            return self.detail(record, "owner", actor)

        return self.file.update(mutate)

    def update(self, board_id, changes, actor, manage=False):
        if not isinstance(changes, dict):
            raise StoreError("Nothing to change.")
        wanted = {}
        if "name" in changes:
            wanted["name"] = check_board_name(changes.get("name"))
        if "note" in changes:
            wanted["note"] = check_board_note(changes.get("note"))
        if "colour" in changes:
            wanted["colour"] = check_board_colour(changes.get("colour"))
        if "visibility" in changes:
            wanted["visibility"] = check_visibility(changes.get("visibility"), manage)
        if "purpose" in changes:
            wanted["purpose"] = check_purpose(changes.get("purpose"))
        if "archived" in changes:
            wanted["archived"] = bool(changes.get("archived"))
        if "remind" in changes:
            wanted["remind"] = check_remind(changes.get("remind"))
        given = check_facts(changes.get("facts")) if "facts" in changes else None
        if not wanted and given is None:
            raise StoreError("Nothing to change.")

        def mutate(payload):
            record = self._records(payload).get(check_id(board_id, "board"))
            if not isinstance(record, dict):
                raise StoreError("No such board.", 404)
            seat = self.seat(record, actor, manage)
            if seat is None:
                raise StoreError("No such board.", 404)
            if seat != "owner":
                raise StoreError("Only a board owner can change that.", 403)
            if record.get("archived") and (given is not None or set(wanted) != {"archived"}):
                raise StoreError("Restore the board before changing it.", 409)
            if "remind" in changes:
                wanted["remind"] = check_remind(changes.get("remind"), set(self._people(record)))
            if (
                wanted.get("visibility") == "sealed"
                and not self.keyholder(actor)
                and (record.get("members") or {}).get(actor) != "owner"
            ):
                raise StoreError(
                    "Put yourself on the board as an owner before sealing it, or you will lock "
                    "yourself out of it.",
                    409,
                )
            record.update(wanted)
            if given is not None:
                record["facts"] = self._facts(record, given)
            self._touch(record, actor)
            return self.detail(record, seat, actor)

        return self.file.update(mutate)

    def remove(self, board_id, actor, manage=False):
        def mutate(payload):
            records = self._records(payload)
            identifier = check_id(board_id, "board")
            record = records.get(identifier)
            if not isinstance(record, dict):
                raise StoreError("No such board.", 404)
            seat = self.seat(record, actor, manage)
            if seat is None:
                raise StoreError("No such board.", 404)
            if seat != "owner":
                raise StoreError("Only a board owner can delete it.", 403)
            del records[identifier]
            self._art_clear(record)
            self._files_clear(record)
            return {
                "id": identifier,
                "name": record.get("name"),
                "visibility": record.get("visibility") or "private",
                "cards": len(record.get("cards") or {}),
            }

        return self.file.update(mutate)

    @staticmethod
    def _asks(record):
        held = record.get("asks")
        if not isinstance(held, list):
            return []
        return [entry for entry in held if isinstance(entry, dict) and entry.get("who")]

    def invite_member(self, board_id, name, role, actor, manage=False, known=None):
        account = check_account_ref(name)
        held = check_board_role(role)
        if known is not None and account not in known:
            raise StoreError("There is no account called %s." % account[:32])
        if self.keyholder(account):
            raise StoreError("%s is on every board already, always as an owner." % account, 409)

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "admin")
            members = record.get("members") or {}
            if account in members:
                raise StoreError("%s is already on this board." % account[:32], 409)
            asked = self._asks(record)
            if any(entry.get("who") == account for entry in asked):
                raise StoreError("%s has already been asked." % account[:32], 409)
            if len(members) + len(asked) >= BOARD_MEMBERS_MAX:
                raise StoreError("A board takes at most %d people." % BOARD_MEMBERS_MAX)
            asked.append(
                {
                    "id": new_board_id(),
                    "who": account,
                    "role": held,
                    "by": actor,
                    "at": now_iso(),
                }
            )
            record["asks"] = asked
            self._touch(record, actor)
            return self.detail(record, self.seat(record, actor, manage), actor)

        return self.file.update(mutate)

    def withdraw_member_invite(self, board_id, name, actor, manage=False):
        account = check_account_ref(name)

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "admin")
            asked = self._asks(record)
            if not any(entry.get("who") == account for entry in asked):
                raise StoreError("Nobody by that name is waiting on this board.", 404)
            record["asks"] = [entry for entry in asked if entry.get("who") != account]
            self._touch(record, actor)
            return self.detail(record, self.seat(record, actor, manage), actor)

        return self.file.update(mutate)

    def asked(self, actor):
        out = []
        for record in self._records(self.file.read()).values():
            if not isinstance(record, dict) or record.get("archived"):
                continue
            mine = next(
                (entry for entry in self._asks(record) if entry.get("who") == actor), None
            )
            if not mine:
                continue
            out.append(
                {
                    "id": record.get("id"),
                    "name": record.get("name"),
                    "note": record.get("note") or "",
                    "colour": record.get("colour") or BOARD_COLOURS[0],
                    "purpose": record.get("purpose") or BOARD_PURPOSE_IDS[0],
                    "role": mine.get("role"),
                    "by": mine.get("by"),
                    "at": mine.get("at"),
                    "people": len(self._people(record)),
                }
            )
        out.sort(key=lambda entry: entry.get("at") or "")
        return out

    def answer_ask(self, board_id, actor, accept):
        def mutate(payload):
            record = self._records(payload).get(check_id(board_id, "board"))
            if not isinstance(record, dict):
                raise StoreError("No such board.", 404)
            asked = self._asks(record)
            mine = next((entry for entry in asked if entry.get("who") == actor), None)
            if mine is None:
                raise StoreError("You have not been asked to join this board.", 404)
            record["asks"] = [entry for entry in asked if entry.get("who") != actor]
            if accept:
                if record.get("archived"):
                    raise StoreError("That board is archived.", 409)
                members = record.get("members")
                if not isinstance(members, dict):
                    members = {}
                    record["members"] = members
                if len(members) >= BOARD_MEMBERS_MAX:
                    raise StoreError("A board takes at most %d people." % BOARD_MEMBERS_MAX)
                members[actor] = check_board_role(mine.get("role"))
                granted = record.get("granted")
                if not isinstance(granted, dict):
                    granted = {}
                granted[actor] = {"by": mine.get("by"), "at": now_iso()}
                record["granted"] = granted
            self._touch(record, actor)
            return {
                "board": record.get("id"),
                "name": record.get("name"),
                "asked": mine.get("by"),
                "joined": bool(accept),
            }

        return self.file.update(mutate)

    def set_member(self, board_id, name, role, actor, manage=False):
        account = check_account_ref(name)
        held = check_board_role(role)
        if self.keyholder(account):
            raise StoreError(
                "%s is on every board already, always as an owner." % account,
                409,
            )

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "admin")
            members = record.get("members")
            if not isinstance(members, dict):
                members = {}
                record["members"] = members
            if account not in members:
                raise StoreError(
                    "%s has to accept before joining this board — ask them instead."
                    % account[:32],
                    409,
                )
            was = members.get(account)
            members[account] = held
            if was == "owner" and held != "owner" and not self._owners(record):
                members[account] = was
                raise StoreError("A board needs at least one owner.", 409)
            self._touch(record, actor)
            return self.detail(record, self.seat(record, actor, manage), actor)

        return self.file.update(mutate)

    def set_members(self, board_id, entries, actor, manage=False):
        seats = check_board_seats(entries)
        if not seats:
            raise StoreError("Nobody was named.")

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "admin")
            members = record.get("members")
            if not isinstance(members, dict):
                members = {}
                record["members"] = members
            fresh = [account for account in seats if account not in members]
            if fresh:
                raise StoreError(
                    "%s has to accept before joining this board — ask them instead."
                    % fresh[0][:32],
                    409,
                )
            was = dict(members)
            members.update(seats)
            if not self._owners(record):
                record["members"] = was
                raise StoreError("A board needs at least one owner.", 409)
            self._touch(record, actor)
            return self.detail(record, self.seat(record, actor, manage), actor)

        return self.file.update(mutate)

    def drop_member(self, board_id, name, actor, manage=False):
        account = check_account_ref(name)
        if self.keyholder(account):
            raise StoreError(
                "%s cannot be taken off a board — they hold the keys to all of them." % account,
                409,
            )

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "admin")
            members = record.get("members") or {}
            if account not in members:
                raise StoreError("They are not on this board.", 404)
            was = members.pop(account)
            if was == "owner" and not self._owners(record):
                members[account] = was
                raise StoreError("A board needs at least one owner.", 409)
            record["members"] = members
            granted = record.get("granted")
            if isinstance(granted, dict) and account in granted:
                granted.pop(account, None)
                record["granted"] = granted
            self._touch(record, actor)
            standing = self.seat(record, actor, manage)
            if standing is None:
                return {"id": record.get("id"), "left": True}
            return self.detail(record, standing, actor)

        return self.file.update(mutate)

    def forget_account(self, name):
        account = str(name or "").strip()
        if not account:
            return 0

        def mutate(payload):
            touched = 0
            for record in self._records(payload).values():
                if not isinstance(record, dict):
                    continue
                members = record.get("members") or {}
                shifted = False
                if account in members:
                    members.pop(account)
                    record["members"] = members
                    touched += 1
                    shifted = True
                granted = record.get("granted")
                if isinstance(granted, dict) and account in granted:
                    granted.pop(account, None)
                    record["granted"] = granted
                    touched += 1
                    shifted = True
                waiting = record.get("asks") or []
                if any(entry.get("who") == account for entry in waiting if isinstance(entry, dict)):
                    record["asks"] = [
                        entry
                        for entry in waiting
                        if isinstance(entry, dict) and entry.get("who") != account
                    ]
                    touched += 1
                    shifted = True
                for card in self._cards(record).values():
                    if not isinstance(card, dict):
                        continue
                    people = card.get("assignees") or []
                    if account in people:
                        card["assignees"] = [entry for entry in people if entry != account]
                        touched += 1
                        shifted = True
                if shifted:
                    self._bump(record)
            return touched

        return self.file.update(mutate)

    def add_list(self, board_id, name, actor, manage=False):
        column = check_list_name(name)

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            columns = self._lists(record)
            if len(columns) >= BOARD_LISTS_MAX:
                raise StoreError("A board takes at most %d columns." % BOARD_LISTS_MAX)
            columns.append({"id": new_board_id(), "name": column, "cards": []})
            self._touch(record, actor)
            return self.detail(record, seat, actor)

        return self.file.update(mutate)

    def update_list(self, board_id, list_id, changes, actor, manage=False):
        if not isinstance(changes, dict):
            raise StoreError("Nothing to change.")
        wanted = {}
        if "name" in changes:
            wanted["name"] = check_list_name(changes.get("name"))
        if "done" in changes:
            wanted["done"] = bool(changes.get("done"))
        if "cap" in changes:
            wanted["cap"] = check_list_cap(changes.get("cap"))
        if not wanted:
            raise StoreError("Nothing to change.")

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            column = self._column(record, list_id)
            column.update(wanted)
            if wanted.get("done"):
                cards = self._cards(record)
                for identifier in column.get("cards") or []:
                    card = cards.get(identifier)
                    if isinstance(card, dict) and not card.get("done"):
                        self._finish(card, actor, True)
            self._touch(record, actor)
            return self.detail(record, seat, actor)

        return self.file.update(mutate)

    def remove_list(self, board_id, list_id, actor, manage=False):
        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            columns = self._lists(record)
            if len(columns) <= 1:
                raise StoreError("A board keeps at least one column.", 409)
            column = self._column(record, list_id)
            if column.get("cards"):
                raise StoreError("Move or delete the cards in that column first.", 409)
            record["lists"] = [entry for entry in columns if entry.get("id") != column.get("id")]
            self._touch(record, actor)
            return self.detail(record, seat, actor)

        return self.file.update(mutate)

    def move_list(self, board_id, list_id, index, actor, manage=False):
        try:
            wanted = int(index)
        except (TypeError, ValueError):
            raise StoreError("That is not a position.")

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            columns = self._lists(record)
            column = self._column(record, list_id)
            columns.remove(column)
            columns.insert(max(0, min(wanted, len(columns))), column)
            self._touch(record, actor)
            return self.detail(record, seat, actor)

        return self.file.update(mutate)


    @staticmethod
    def _order(card, by):
        title = (card.get("title") or "").lower()
        done = 1 if card.get("done") else 0
        if by == "due":
            due = str(card.get("due") or "")
            return (done, 0 if due else 1, due, title)
        if by == "who":
            people = sorted(name.lower() for name in card.get("assignees") or [])
            return (0 if people else 1, people[0] if people else "", done, title)
        if by == "made":
            return (str(card.get("created") or ""), title)
        if by == "done":
            return (done, title)
        return (title,)

    def sort_list(self, board_id, list_id, by, actor, manage=False):
        wanted = check_sort_by(by)

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            column = self._column(record, list_id)
            cards = self._cards(record)
            held = [entry for entry in column.get("cards") or [] if entry in cards]
            stray = [entry for entry in column.get("cards") or [] if entry not in cards]
            live = [entry for entry in held if not cards[entry].get("archived")]
            put = [entry for entry in held if cards[entry].get("archived")]
            live.sort(key=lambda entry: self._order(cards[entry], wanted))
            put.sort(key=lambda entry: self._order(cards[entry], wanted))
            column["cards"] = live + put + stray
            self._touch(record, actor)
            return self.detail(record, seat, actor)

        return self.file.update(mutate)

    def add_card(self, board_id, list_id, title, actor, manage=False):
        heading = check_card_title(title)

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            cards = self._cards(record)
            if len(cards) >= BOARD_CARDS_MAX:
                raise StoreError("A board holds at most %d cards." % BOARD_CARDS_MAX)
            column = self._column(record, list_id)
            self._room(record, column)
            identifier = new_board_id()
            while identifier in cards:
                identifier = new_board_id()
            card = {
                "id": identifier,
                "seq": self._next_seq(record),
                "list": column["id"],
                "title": heading,
                "notes": "",
                "done": bool(column.get("done")),
                "archived": False,
                "due": None,
                "assignees": [],
                "labels": [],
                "checklist": [],
                "comments": [],
                "links": [],
                "activity": [],
                "created": now_iso(),
                "createdBy": actor,
                "changed": now_iso(),
                "changedBy": actor,
            }
            if card["done"]:
                card["completed"] = now_iso()
                card["completedBy"] = actor
            self._trail(card, actor, "created", {"list": column.get("name")})
            cards[identifier] = card
            column.setdefault("cards", []).append(identifier)
            self._touch(record, actor)
            return {"board": self.detail(record, seat, actor), "card": self.card_public(card)}

        return self.file.update(mutate)

    def update_card(self, board_id, card_id, changes, actor, manage=False, known=None):
        if not isinstance(changes, dict):
            raise StoreError("Nothing to change.")
        wanted = {}
        if "title" in changes:
            wanted["title"] = check_card_title(changes.get("title"))
        if "notes" in changes:
            wanted["notes"] = check_card_notes(changes.get("notes"))
        if "due" in changes:
            wanted["due"] = check_due(changes.get("due"))
        if "assignees" in changes:
            wanted["assignees"] = check_assignees(changes.get("assignees"), known)
        if "labels" in changes:
            wanted["labels"] = changes.get("labels")
        if "done" in changes:
            wanted["done"] = bool(changes.get("done"))
        if "archived" in changes:
            wanted["archived"] = bool(changes.get("archived"))
        if not wanted:
            raise StoreError("Nothing to change.")

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            card = self._card(record, card_id)
            if "assignees" in wanted:
                held = card.get("assignees") or []
                outside = [
                    name
                    for name in wanted["assignees"]
                    if name not in held and self.seat(record, name) is None
                ]
                if outside:
                    raise StoreError(
                        "%s cannot open this board — put them on it first." % outside[0][:32],
                        409,
                    )
            if "labels" in wanted:
                known_labels = {label.get("id") for label in record.get("labels") or []}
                chosen = wanted["labels"]
                if not isinstance(chosen, list):
                    raise StoreError("That is not a list of labels.")
                wanted["labels"] = [
                    check_id(entry, "label") for entry in chosen if entry in known_labels
                ]
            for field, value in wanted.items():
                if field == "done" and value != bool(card.get("done")):
                    self._finish(card, actor, value)
                elif field == "archived" and value != bool(card.get("archived")):
                    self._trail(card, actor, "archived" if value else "restored")
                elif field == "due" and value != card.get("due"):
                    self._trail(card, actor, "due", {"due": value})
                    card["reminded"] = {}
                elif field == "assignees" and value != (card.get("assignees") or []):
                    self._trail(card, actor, "assigned", {"to": value})
                elif field == "title" and value != card.get("title"):
                    self._trail(card, actor, "renamed", {"title": value})
                card[field] = value
            card["changed"] = now_iso()
            card["changedBy"] = actor
            self._touch(record, actor)
            return self.card_public(card)

        return self.file.update(mutate)

    def move_card(self, board_id, card_id, list_id, index, actor, manage=False):
        try:
            wanted = int(index)
        except (TypeError, ValueError):
            raise StoreError("That is not a position.")

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            card = self._card(record, card_id)
            target = self._column(record, list_id)
            came_from = next(
                (
                    column
                    for column in self._lists(record)
                    if card["id"] in (column.get("cards") or [])
                ),
                None,
            )
            if (came_from or {}).get("id") != target["id"] and not card.get("archived"):
                self._room(record, target)
            for column in self._lists(record):
                column["cards"] = [
                    entry for entry in column.get("cards") or [] if entry != card["id"]
                ]
            seats = target.setdefault("cards", [])
            seats.insert(max(0, min(wanted, len(seats))), card["id"])
            if card.get("list") != target["id"]:
                self._trail(card, actor, "moved", {"list": target.get("name")})
                if target.get("done") and not card.get("done"):
                    self._finish(card, actor, True)
                elif (came_from or {}).get("done") and not target.get("done") and card.get("done"):
                    self._finish(card, actor, False)
            card["list"] = target["id"]
            card["changed"] = now_iso()
            card["changedBy"] = actor
            self._touch(record, actor)
            return self.detail(record, seat, actor)

        return self.file.update(mutate)

    def attach_file(
        self, board_id, card_id, name, content_type, blob, actor, manage=False, thumb=None
    ):
        mime, suffix, data = check_attachment_blob(content_type, blob)
        heading = check_attachment_name(name, suffix)
        small = None
        if thumb is not None and mime != "application/pdf":
            small = check_thumb_blob(thumb[0], thumb[1])

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            card = self._card(record, card_id)
            files = self._files(card)
            if len(files) >= CARD_FILES_MAX:
                raise StoreError(
                    "A card holds %d files. Take one off before adding another." % CARD_FILES_MAX
                )
            if self._files_weight(record) + len(data) > BOARD_FILES_BYTES_MAX:
                raise StoreError(
                    "This board is holding its %d MB of files. Take some off first."
                    % (BOARD_FILES_BYTES_MAX // (1024 * 1024)),
                    409,
                )
            taken = {
                entry.get("id")
                for held in (record.get("cards") or {}).values()
                if isinstance(held, dict)
                for entry in held.get("files") or []
            }
            identifier = new_board_id()
            while identifier in taken:
                identifier = new_board_id()
            entry = {
                "id": identifier,
                "name": heading,
                "type": mime,
                "ext": suffix,
                "bytes": len(data),
                "by": actor,
                "at": now_iso(),
            }
            if small is not None:
                entry["thumb"] = small[0]
                entry["thumbType"] = small[1]
            self._blob_write(self.file_dir, ".file-", self._file_path(entry), data)
            if small is not None:
                self._blob_write(
                    self.file_dir, ".file-", self._file_path(entry, True), small[2]
                )
            files.append(entry)
            self._trail(card, actor, "attached", {"name": heading})
            card["changed"] = now_iso()
            card["changedBy"] = actor
            self._touch(record, actor)
            return self.card_public(card)

        return self.file.update(mutate)

    def remove_file(self, board_id, card_id, file_id, actor, manage=False):
        wanted = check_id(file_id, "file")

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            card = self._card(record, card_id)
            files = self._files(card)
            held = next((entry for entry in files if entry.get("id") == wanted), None)
            if held is None:
                raise StoreError("No such file.", 404)
            card["files"] = [entry for entry in files if entry.get("id") != wanted]
            self._file_unlink(held)
            self._trail(card, actor, "detached", {"name": held.get("name")})
            card["changed"] = now_iso()
            card["changedBy"] = actor
            self._touch(record, actor)
            return self.card_public(card)

        return self.file.update(mutate)

    def attachment(self, board_id, card_id, file_id, actor, manage=False, thumb=False):
        wanted = check_id(file_id, "file")
        payload = self.file.read()
        record, _ = self._open(payload, board_id, actor, manage)
        card = self._card(record, card_id)
        held = next(
            (entry for entry in self._files(card) if entry.get("id") == wanted), None
        )
        if held is None:
            raise StoreError("No such file.", 404)
        small = bool(thumb and held.get("thumb"))
        try:
            with open(self._file_path(held, small), "rb") as handle:
                data = handle.read()
        except OSError:
            raise StoreError("That file is no longer on disk.", 404)
        shown = dict(held)
        if small:
            shown["type"] = held.get("thumbType") or held.get("type")
            shown["ext"] = held.get("thumb")
        return shown, data

    def duplicate_card(self, board_id, card_id, actor, manage=False):
        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            cards = self._cards(record)
            if len(cards) >= BOARD_CARDS_MAX:
                raise StoreError("A board holds at most %d cards." % BOARD_CARDS_MAX)
            card = self._card(record, card_id)
            identifier = new_board_id()
            while identifier in cards:
                identifier = new_board_id()
            heading = "%s copy" % (card.get("title") or "")[: CARD_TITLE_MAX - 5]
            copy = {
                "id": identifier,
                "seq": self._next_seq(record),
                "list": card.get("list"),
                "title": check_card_title(heading),
                "notes": card.get("notes") or "",
                "done": False,
                "archived": False,
                "due": card.get("due"),
                "assignees": list(card.get("assignees") or []),
                "labels": list(card.get("labels") or []),
                "checklist": [
                    {"id": new_board_id(), "text": step.get("text"), "done": False}
                    for step in card.get("checklist") or []
                ],
                "comments": [],
                "links": [dict(entry, id=new_board_id()) for entry in card.get("links") or []],
                "files": [],
                "activity": [],
                "created": now_iso(),
                "createdBy": actor,
                "changed": now_iso(),
                "changedBy": actor,
            }
            column = self._column(record, card.get("list"))
            self._room(record, column)
            copy["files"] = self._files_copy(record, card.get("files"))
            self._trail(copy, actor, "copied", {"title": card.get("title")})
            cards[identifier] = copy
            seats = column.setdefault("cards", [])
            where = seats.index(card["id"]) + 1 if card["id"] in seats else len(seats)
            seats.insert(where, identifier)
            self._touch(record, actor)
            return {"board": self.detail(record, seat, actor), "card": self.card_public(copy)}

        return self.file.update(mutate)


    def _bin(self, record):
        edge = now_iso(time.time() - BOARD_BIN_HOURS * 3600)
        kept = []
        gone = []
        for entry in record.get("bin") or []:
            if isinstance(entry, dict) and str(entry.get("at") or "") >= edge:
                kept.append(entry)
            else:
                gone.append(entry)
        if len(kept) > BOARD_BIN_KEEP:
            gone.extend(kept[:-BOARD_BIN_KEEP])
            kept = kept[-BOARD_BIN_KEEP:]
        for entry in gone:
            if isinstance(entry, dict):
                self._files_unlink((entry.get("card") or {}).get("files"))
        record["bin"] = kept
        return record["bin"]

    def _drop_card(self, record, card, actor):
        held = None
        where = 0
        for column in self._lists(record):
            seats = column.get("cards") or []
            if card["id"] in seats:
                held = column
                where = seats.index(card["id"])
            column["cards"] = [entry for entry in seats if entry != card["id"]]
        del self._cards(record)[card["id"]]
        binned = self._bin(record)
        binned.append(
            {
                "card": card,
                "list": (held or {}).get("id"),
                "index": where,
                "at": now_iso(),
                "by": actor,
            }
        )
        self._bin(record)

    def remove_card(self, board_id, card_id, actor, manage=False):
        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            card = self._card(record, card_id)
            self._drop_card(record, card, actor)
            self._touch(record, actor)
            return {
                "board": self.detail(record, seat, actor),
                "title": card.get("title"),
                "undo": card["id"],
            }

        return self.file.update(mutate)

    def undelete_card(self, board_id, card_id, actor, manage=False):
        wanted = check_id(card_id)

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            binned = self._bin(record)
            held = next(
                (entry for entry in binned if (entry.get("card") or {}).get("id") == wanted), None
            )
            if held is None:
                raise StoreError("That card is gone for good — the undo ran out.", 404)
            cards = self._cards(record)
            if len(cards) >= BOARD_CARDS_MAX:
                raise StoreError("A board holds at most %d cards." % BOARD_CARDS_MAX)
            card = held["card"]
            column = next(
                (entry for entry in self._lists(record) if entry.get("id") == held.get("list")),
                None,
            ) or (self._lists(record) or [None])[0]
            if column is None:
                raise StoreError("That board has no column to put it back in.", 409)
            card["list"] = column["id"]
            cards[card["id"]] = card
            seats = column.setdefault("cards", [])
            seats.insert(max(0, min(int(held.get("index") or 0), len(seats))), card["id"])
            self._trail(card, actor, "restored")
            record["bin"] = [
                entry for entry in binned if (entry.get("card") or {}).get("id") != wanted
            ]
            self._touch(record, actor)
            return {"board": self.detail(record, seat, actor), "card": self.card_public(card)}

        return self.file.update(mutate)

    def bulk_cards(self, board_id, card_ids, action, value, actor, manage=False, known=None):
        wanted = check_text(action, "action").lower()
        if wanted not in CARD_BULK_ACTIONS:
            raise StoreError("That is not something to do to a card.")
        chosen = check_bulk_ids(card_ids)
        if wanted == "due":
            value = check_due(value)
        elif wanted in ("assign", "unassign"):
            value = check_assignees([value], known)
            value = value[0] if value else None
            if not value:
                raise StoreError("Pick somebody first.")
        elif wanted in ("label", "unlabel", "move"):
            value = check_id(value, "column" if wanted == "move" else "label")

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            cards = self._cards(record)
            if wanted in ("assign", "unassign") and self.seat(record, value) is None:
                raise StoreError(
                    "%s cannot open this board — put them on it first." % value[:32], 409
                )
            if wanted in ("label", "unlabel"):
                if value not in {label.get("id") for label in record.get("labels") or []}:
                    raise StoreError("No such label.", 404)
            column = self._column(record, value) if wanted == "move" else None
            picked = [cards[entry] for entry in chosen if isinstance(cards.get(entry), dict)]
            if not picked:
                raise StoreError("Those cards are gone — refresh the board.", 404)
            if column is not None:
                coming = len(
                    [
                        card
                        for card in picked
                        if card.get("list") != column["id"] and not card.get("archived")
                    ]
                )
                if coming:
                    self._room(record, column, coming)
            changed = 0
            for card in picked:
                if wanted in ("done", "undone"):
                    done = wanted == "done"
                    if bool(card.get("done")) == done:
                        continue
                    self._finish(card, actor, done)
                elif wanted in ("archive", "restore"):
                    put = wanted == "archive"
                    if bool(card.get("archived")) == put:
                        continue
                    card["archived"] = put
                    self._trail(card, actor, "archived" if put else "restored")
                elif wanted == "delete":
                    self._drop_card(record, card, actor)
                elif wanted == "assign":
                    people = list(card.get("assignees") or [])
                    if value in people:
                        continue
                    if len(people) >= CARD_ASSIGNEES_MAX:
                        continue
                    people.append(value)
                    card["assignees"] = people
                    self._trail(card, actor, "assigned", {"to": people})
                elif wanted == "unassign":
                    people = list(card.get("assignees") or [])
                    if value not in people:
                        continue
                    people = [name for name in people if name != value]
                    card["assignees"] = people
                    self._trail(card, actor, "assigned", {"to": people})
                elif wanted == "label":
                    labels = list(card.get("labels") or [])
                    if value in labels:
                        continue
                    card["labels"] = labels + [value]
                elif wanted == "unlabel":
                    labels = list(card.get("labels") or [])
                    if value not in labels:
                        continue
                    card["labels"] = [entry for entry in labels if entry != value]
                elif wanted == "due":
                    if card.get("due") == value:
                        continue
                    card["due"] = value
                    card["reminded"] = {}
                    self._trail(card, actor, "due", {"due": value})
                elif wanted == "move":
                    if card.get("list") == column["id"]:
                        continue
                    for entry in self._lists(record):
                        entry["cards"] = [
                            held for held in entry.get("cards") or [] if held != card["id"]
                        ]
                    column.setdefault("cards", []).append(card["id"])
                    card["list"] = column["id"]
                    self._trail(card, actor, "moved", {"list": column.get("name")})
                    if column.get("done") and not card.get("done"):
                        self._finish(card, actor, True)
                if wanted != "delete":
                    card["changed"] = now_iso()
                    card["changedBy"] = actor
                changed += 1
            self._touch(record, actor)
            return {"board": self.detail(record, seat, actor), "changed": changed}

        return self.file.update(mutate)

    def transfer_card(self, board_id, card_id, target_id, list_id, actor, manage=False):
        wanted = check_id(target_id, "board")

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            if wanted == record["id"]:
                raise StoreError("That card is already on this board.", 409)
            target, _ = self._open(payload, wanted, actor, manage, "write")
            card = self._card(record, card_id)
            held = self._cards(target)
            if len(held) >= BOARD_CARDS_MAX:
                raise StoreError(
                    "%s holds at most %d cards." % (target.get("name") or "That board", BOARD_CARDS_MAX)
                )
            column = (
                self._column(target, list_id)
                if list_id
                else next(iter(self._lists(target)), None)
            )
            if column is None:
                raise StoreError("That board has no columns yet.", 409)
            if not card.get("archived"):
                self._room(target, column)
            self._drop_card(record, card, actor)
            record["bin"] = [
                entry
                for entry in record.get("bin") or []
                if (entry.get("card") or {}).get("id") != card["id"]
            ]
            if card["id"] in held:
                identifier = new_board_id()
                while identifier in held:
                    identifier = new_board_id()
                card["id"] = identifier
            names = {
                (label.get("name") or "").strip().lower(): label.get("id")
                for label in target.get("labels") or []
            }
            source = {
                label.get("id"): (label.get("name") or "").strip().lower()
                for label in record.get("labels") or []
            }
            card["labels"] = [
                names[source[entry]]
                for entry in card.get("labels") or []
                if entry in source and source[entry] in names
            ]
            card["assignees"] = [
                name for name in card.get("assignees") or [] if self.seat(target, name) is not None
            ]
            card["seq"] = self._next_seq(target)
            card["list"] = column["id"]
            card["reminded"] = {}
            card["changed"] = now_iso()
            card["changedBy"] = actor
            if column.get("done") and not card.get("done"):
                self._finish(card, actor, True)
            self._trail(card, actor, "sent", {"board": target.get("name"), "list": column.get("name")})
            held[card["id"]] = card
            column.setdefault("cards", []).append(card["id"])
            self._touch(target, actor)
            self._touch(record, actor)
            return {
                "board": self.detail(record, seat, actor),
                "to": {"id": target["id"], "name": target.get("name"), "card": card["id"]},
            }

        return self.file.update(mutate)
    def add_comment(self, board_id, card_id, body, actor, manage=False):
        said = check_card_comment(body)

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            card = self._card(record, card_id)
            comments = card.get("comments")
            if not isinstance(comments, list):
                comments = []
            if len(comments) >= CARD_COMMENTS_MAX:
                raise StoreError("That card already holds %d comments." % CARD_COMMENTS_MAX)
            comments.append({"id": new_board_id(), "by": actor, "at": now_iso(), "body": said})
            card["comments"] = comments
            self._trail(card, actor, "commented")
            self._touch(record, actor)
            return self.card_public(card)

        return self.file.update(mutate)

    def remove_comment(self, board_id, card_id, comment_id, actor, manage=False):
        wanted = check_id(comment_id, "comment")

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            card = self._card(record, card_id)
            comments = card.get("comments") or []
            found = [entry for entry in comments if entry.get("id") == wanted]
            if not found:
                raise StoreError("No such comment.", 404)
            if found[0].get("by") != actor and seat != "owner":
                raise StoreError("You can only delete your own comments.", 403)
            card["comments"] = [entry for entry in comments if entry.get("id") != wanted]
            self._touch(record, actor)
            return self.card_public(card)

        return self.file.update(mutate)

    def add_check(self, board_id, card_id, text, actor, manage=False):
        step = check_check_text(text)

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            card = self._card(record, card_id)
            steps = card.get("checklist")
            if not isinstance(steps, list):
                steps = []
            if len(steps) >= CARD_CHECKS_MAX:
                raise StoreError("That card already holds %d steps." % CARD_CHECKS_MAX)
            steps.append({"id": new_board_id(), "text": step, "done": False})
            card["checklist"] = steps
            card["changed"] = now_iso()
            card["changedBy"] = actor
            self._touch(record, actor)
            return self.card_public(card)

        return self.file.update(mutate)

    def set_check(self, board_id, card_id, check_id_value, changes, actor, manage=False):
        wanted = check_id(check_id_value, "step")
        if not isinstance(changes, dict) or not ({"text", "done"} & set(changes)):
            raise StoreError("Nothing to change.")
        text = check_check_text(changes.get("text")) if "text" in changes else None
        done = bool(changes.get("done")) if "done" in changes else None

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            card = self._card(record, card_id)
            for step in card.get("checklist") or []:
                if step.get("id") != wanted:
                    continue
                if text is not None:
                    step["text"] = text
                if done is not None:
                    step["done"] = done
                card["changed"] = now_iso()
                card["changedBy"] = actor
                self._touch(record, actor)
                return self.card_public(card)
            raise StoreError("No such step.", 404)

        return self.file.update(mutate)

    def remove_check(self, board_id, card_id, check_id_value, actor, manage=False):
        wanted = check_id(check_id_value, "step")

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            card = self._card(record, card_id)
            steps = card.get("checklist") or []
            if not any(step.get("id") == wanted for step in steps):
                raise StoreError("No such step.", 404)
            card["checklist"] = [step for step in steps if step.get("id") != wanted]
            self._touch(record, actor)
            return self.card_public(card)

        return self.file.update(mutate)

    def add_link(self, board_id, card_id, label, url, actor, manage=False):
        address = check_link_url(url)
        name = check_link_label(label, address)

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            card = self._card(record, card_id)
            links = card.get("links")
            if not isinstance(links, list):
                links = []
            if len(links) >= CARD_LINKS_MAX:
                raise StoreError("That card already holds %d links." % CARD_LINKS_MAX)
            links.append(
                {"id": new_board_id(), "label": name, "url": address, "by": actor, "at": now_iso()}
            )
            card["links"] = links
            self._trail(card, actor, "linked", {"label": name})
            self._touch(record, actor)
            return self.card_public(card)

        return self.file.update(mutate)

    def remove_link(self, board_id, card_id, link_id, actor, manage=False):
        wanted = check_id(link_id, "link")

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "write")
            card = self._card(record, card_id)
            links = card.get("links") or []
            if not any(entry.get("id") == wanted for entry in links):
                raise StoreError("No such link.", 404)
            card["links"] = [entry for entry in links if entry.get("id") != wanted]
            self._touch(record, actor)
            return self.card_public(card)

        return self.file.update(mutate)

    def set_label(self, board_id, label_id, name, colour, actor, manage=False):
        title = check_label_name(name)
        shade = check_board_colour(colour)
        wanted = check_id(label_id, "label") if label_id else None

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "admin")
            labels = record.get("labels")
            if not isinstance(labels, list):
                labels = []
                record["labels"] = labels
            if wanted is None:
                if len(labels) >= BOARD_LABELS_MAX:
                    raise StoreError("A board takes at most %d labels." % BOARD_LABELS_MAX)
                labels.append({"id": new_board_id(), "name": title, "colour": shade})
            else:
                for label in labels:
                    if label.get("id") == wanted:
                        label["name"] = title
                        label["colour"] = shade
                        break
                else:
                    raise StoreError("No such label.", 404)
            self._touch(record, actor)
            return self.detail(record, seat, actor)

        return self.file.update(mutate)

    def remove_label(self, board_id, label_id, actor, manage=False):
        wanted = check_id(label_id, "label")

        def mutate(payload):
            record, seat = self._open(payload, board_id, actor, manage, "admin")
            labels = record.get("labels") or []
            if not any(label.get("id") == wanted for label in labels):
                raise StoreError("No such label.", 404)
            record["labels"] = [label for label in labels if label.get("id") != wanted]
            for card in self._cards(record).values():
                if isinstance(card, dict) and wanted in (card.get("labels") or []):
                    card["labels"] = [entry for entry in card["labels"] if entry != wanted]
            self._touch(record, actor)
            return self.detail(record, seat, actor)

        return self.file.update(mutate)


PROJECT_ID = re.compile(r"^(TKT|ORD|PRJ|INV|REQ|APP)-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$")
PROJECT_FILE_MAX = 32 * 1024 * 1024
PROJECT_FILES_PER_PROJECT = 60
PROJECT_VERSIONS_MAX = 20
PROJECT_DOWNLOADS_KEEP = 400
PROJECT_FILE_NAME_MAX = 140
PROJECT_FILE_NOTE_MAX = 300
PROJECT_PEOPLE_MAX = 25
PROJECT_LEDGER_KEEP = 20000
PROJECT_LEDGER_SWEEP = 500

PROJECT_ACCESS = ("studio", "client", "named")

PROJECT_FILE_TYPES = {
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
    "application/gzip": "gz",
    "application/x-tar": "tar",
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "text/plain": "txt",
    "text/markdown": "md",
    "text/csv": "csv",
    "application/json": "json",
    "font/woff2": "woff2",
    "application/octet-stream": "bin",
}


def check_project_id(value):
    wanted = str(value or "").strip().upper()
    if not PROJECT_ID.match(wanted):
        raise StoreError("That is not a project ID.")
    return wanted


def check_file_name(value):
    cleaned = " ".join(str(value or "").split())[:PROJECT_FILE_NAME_MAX]
    if len(cleaned) < 2:
        raise StoreError("Give the file a name.")
    return cleaned


def check_file_access(value):
    wanted = str(value or "").strip().lower()
    if wanted not in PROJECT_ACCESS:
        raise StoreError("Pick one of: %s." % ", ".join(PROJECT_ACCESS))
    return wanted


def check_file_blob(content_type, blob):
    kind = str(content_type or "").strip().lower()
    suffix = PROJECT_FILE_TYPES.get(kind)
    if suffix is None:
        raise StoreError("That kind of file cannot be stored here.")
    if not isinstance(blob, (bytes, bytearray)) or not blob:
        raise StoreError("The file was empty.")
    data = bytes(blob)
    if len(data) > PROJECT_FILE_MAX:
        raise StoreError("Keep the file under %d MB." % (PROJECT_FILE_MAX // (1024 * 1024)))
    return kind, suffix, data


class ProjectFiles:

    def __init__(self, path, ledger_path, group=None, files_dir=None):
        self.file = open_doc(path, {"version": 1, "files": {}}, 0o640, group)
        self.ledger = open_log(
            ledger_path, PROJECT_LEDGER_KEEP, PROJECT_LEDGER_SWEEP, 0o640, group
        )
        self.group = group
        self.dir = files_dir or os.path.join(os.path.dirname(path) or ".", "project-files")

    def _records(self, payload):
        records = payload.get("files")
        if not isinstance(records, dict):
            records = {}
            payload["files"] = records
        return records

    def _path(self, file_id, version, ext):
        return os.path.join(self.dir, "%s.%d.%s" % (file_id, version, ext))

    def _write(self, path, blob):
        os.makedirs(self.dir, exist_ok=True)
        handle = tempfile.NamedTemporaryFile(
            mode="wb", dir=self.dir, prefix=".file-", suffix=".tmp", delete=False
        )
        try:
            handle.write(blob)
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
            os.replace(handle.name, path)
        except BaseException:
            try:
                os.unlink(handle.name)
            except OSError:
                pass
            raise

    def _unlink(self, file_id, version):
        if not isinstance(version, dict):
            return
        try:
            os.unlink(self._path(file_id, int(version.get("v") or 0), str(version.get("ext") or "bin")))
        except OSError:
            pass

    def note(self, project, actor, action, detail=None):
        entry = {
            "at": now_iso(),
            "project": project,
            "actor": actor,
            "action": action,
        }
        if detail:
            entry["detail"] = detail
        self.ledger.append(entry)
        return entry

    def history(self, project, limit=200):
        wanted = check_project_id(project)
        out = []
        for entry in self.ledger.tail(PROJECT_LEDGER_KEEP):
            if entry.get("project") != wanted:
                continue
            out.append(entry)
            if len(out) >= limit:
                break
        return out

    @staticmethod
    def _versions(record):
        held = record.get("versions")
        return held if isinstance(held, list) else []

    @classmethod
    def _latest(cls, record):
        held = cls._versions(record)
        return held[-1] if held else None

    @classmethod
    def brief(cls, record, seen_by="studio"):
        latest = cls._latest(record) or {}
        out = {
            "id": record.get("id"),
            "project": record.get("project"),
            "name": record.get("name"),
            "note": record.get("note") or "",
            "access": record.get("access") or "studio",
            "locked": bool(record.get("locked")),
            "at": record.get("at"),
            "by": record.get("by"),
            "version": latest.get("v") or 0,
            "versions": len(cls._versions(record)),
            "bytes": latest.get("bytes") or 0,
            "type": latest.get("type") or "",
            "ext": latest.get("ext") or "",
            "hash": latest.get("hash") or "",
            "updatedAt": latest.get("at") or record.get("at"),
            "downloads": int(record.get("downloadCount") or 0),
        }
        if seen_by == "studio":
            out["people"] = list(record.get("people") or [])
            out["history"] = [
                {
                    "v": entry.get("v"),
                    "at": entry.get("at"),
                    "by": entry.get("by"),
                    "bytes": entry.get("bytes"),
                    "note": entry.get("note") or "",
                    "downloads": int(entry.get("downloads") or 0),
                }
                for entry in cls._versions(record)
            ]
            out["log"] = list(record.get("downloadLog") or [])[-25:][::-1]
        return out

    @staticmethod
    def readable(record, who):
        access = record.get("access") or "studio"
        if who.get("manage"):
            return True
        if bool(record.get("locked")) and not who.get("manage"):
            return False
        if access == "studio":
            return bool(who.get("staff"))
        if access == "client":
            return bool(who.get("staff")) or bool(who.get("client"))
        named = {str(entry).lower() for entry in (record.get("people") or [])}
        if who.get("name") and str(who["name"]).lower() in named:
            return True
        if who.get("discord") and str(who["discord"]) in named:
            return True
        return bool(who.get("staff"))

    def list(self, project, who):
        wanted = check_project_id(project)
        payload = self.file.read()
        out = []
        for record in self._records(payload).values():
            if not isinstance(record, dict) or record.get("project") != wanted:
                continue
            if not self.readable(record, who):
                continue
            out.append(self.brief(record, "studio" if who.get("staff") else "client"))
        out.sort(key=lambda entry: entry.get("updatedAt") or "", reverse=True)
        return out

    def count(self, project):
        wanted = check_project_id(project)
        return sum(
            1
            for record in self._records(self.file.read()).values()
            if isinstance(record, dict) and record.get("project") == wanted
        )

    def add(self, project, name, content_type, blob, actor, note="", access="studio", order=None):
        wanted = check_project_id(project)
        titled = check_file_name(name)
        picked = check_file_access(access)
        mime, suffix, data = check_file_blob(content_type, blob)
        file_id = secrets.token_hex(16)
        digest = hashlib.sha256(data).hexdigest()[:32]

        def mutate(payload):
            records = self._records(payload)
            held = sum(
                1
                for record in records.values()
                if isinstance(record, dict) and record.get("project") == wanted
            )
            if held >= PROJECT_FILES_PER_PROJECT:
                raise StoreError(
                    "This project already holds %d files." % PROJECT_FILES_PER_PROJECT
                )
            self._write(self._path(file_id, 1, suffix), data)
            records[file_id] = {
                "id": file_id,
                "project": wanted,
                "order": str(order or "")[:20] or None,
                "name": titled,
                "note": str(note or "")[:PROJECT_FILE_NOTE_MAX],
                "access": picked,
                "people": [],
                "locked": False,
                "at": now_iso(),
                "by": actor,
                "downloadCount": 0,
                "downloadLog": [],
                "versions": [
                    {
                        "v": 1,
                        "ext": suffix,
                        "type": mime,
                        "bytes": len(data),
                        "hash": digest,
                        "at": now_iso(),
                        "by": actor,
                        "note": str(note or "")[:PROJECT_FILE_NOTE_MAX],
                        "downloads": 0,
                    }
                ],
            }
            return self.brief(records[file_id])

        made = self.file.update(mutate)
        self.note(wanted, actor, "file.add", {"file": file_id, "name": titled, "bytes": len(data)})
        return made

    def revise(self, file_id, content_type, blob, actor, note=""):
        mime, suffix, data = check_file_blob(content_type, blob)
        digest = hashlib.sha256(data).hexdigest()[:32]

        def mutate(payload):
            record = self._records(payload).get(str(file_id))
            if not isinstance(record, dict):
                raise StoreError("That file is not here.", 404)
            versions = self._versions(record)
            if len(versions) >= PROJECT_VERSIONS_MAX:
                raise StoreError(
                    "That file already has %d versions." % PROJECT_VERSIONS_MAX
                )
            nextv = (versions[-1].get("v") if versions else 0) + 1
            self._write(self._path(record["id"], nextv, suffix), data)
            versions.append(
                {
                    "v": nextv,
                    "ext": suffix,
                    "type": mime,
                    "bytes": len(data),
                    "hash": digest,
                    "at": now_iso(),
                    "by": actor,
                    "note": str(note or "")[:PROJECT_FILE_NOTE_MAX],
                    "downloads": 0,
                }
            )
            record["versions"] = versions
            return self.brief(record)

        made = self.file.update(mutate)
        self.note(
            made["project"],
            actor,
            "file.version",
            {"file": str(file_id), "version": made["version"], "bytes": len(data)},
        )
        return made

    def edit(self, file_id, patch, actor):
        given = patch if isinstance(patch, dict) else {}

        def mutate(payload):
            record = self._records(payload).get(str(file_id))
            if not isinstance(record, dict):
                raise StoreError("That file is not here.", 404)
            changed = []
            if "name" in given:
                record["name"] = check_file_name(given["name"])
                changed.append("name")
            if "note" in given:
                record["note"] = str(given["note"] or "")[:PROJECT_FILE_NOTE_MAX]
                changed.append("note")
            if "access" in given:
                record["access"] = check_file_access(given["access"])
                changed.append("access")
            if "locked" in given:
                record["locked"] = bool(given["locked"])
                changed.append("locked")
            if "people" in given:
                people = []
                for entry in (given["people"] or [])[:PROJECT_PEOPLE_MAX]:
                    cleaned = str(entry or "").strip()[:MAX_NAME]
                    if cleaned and cleaned not in people:
                        people.append(cleaned)
                record["people"] = people
                changed.append("people")
            if not changed:
                raise StoreError("Nothing in that changed.")
            record["changedAt"] = now_iso()
            out = self.brief(record)
            out["changed"] = changed
            return out

        made = self.file.update(mutate)
        self.note(
            made["project"],
            actor,
            "file.edit",
            {"file": str(file_id), "changed": made.get("changed") or []},
        )
        return made

    def remove(self, file_id, actor):
        def mutate(payload):
            records = self._records(payload)
            record = records.get(str(file_id))
            if not isinstance(record, dict):
                raise StoreError("That file is not here.", 404)
            for version in self._versions(record):
                self._unlink(record["id"], version)
            del records[str(file_id)]
            return {"id": str(file_id), "project": record.get("project"), "name": record.get("name")}

        gone = self.file.update(mutate)
        self.note(gone["project"], actor, "file.remove", {"file": gone["id"], "name": gone["name"]})
        return gone

    def find(self, file_id):
        record = self._records(self.file.read()).get(str(file_id))
        return record if isinstance(record, dict) else None

    def blob(self, file_id, version, who):
        record = self.find(file_id)
        if record is None:
            raise StoreError("That file is not here.", 404)
        if not self.readable(record, who):
            raise StoreError("That file is not here.", 404)

        versions = self._versions(record)
        if not versions:
            raise StoreError("That file is not here.", 404)
        if version in (None, "", 0, "0"):
            picked = versions[-1]
        else:
            try:
                wanted = int(version)
            except (TypeError, ValueError):
                raise StoreError("That is not a version.")
            picked = next((entry for entry in versions if entry.get("v") == wanted), None)
            if picked is None:
                raise StoreError("That version is not here.", 404)

        path = self._path(record["id"], int(picked["v"]), str(picked["ext"]))
        try:
            with open(path, "rb") as handle:
                data = handle.read()
        except OSError:
            raise StoreError("That file could not be read back.", 500)

        self._count_download(record["id"], int(picked["v"]), who)
        return str(picked.get("type") or "application/octet-stream"), data, record, picked

    def _count_download(self, file_id, version, who):
        stamp = now_iso()
        actor = who.get("name") or who.get("discord") or "client"
        via = "studio" if who.get("staff") else "client"

        def mutate(payload):
            record = self._records(payload).get(str(file_id))
            if not isinstance(record, dict):
                return None
            record["downloadCount"] = int(record.get("downloadCount") or 0) + 1
            for entry in self._versions(record):
                if entry.get("v") == version:
                    entry["downloads"] = int(entry.get("downloads") or 0) + 1
                    break
            log = record.get("downloadLog")
            if not isinstance(log, list):
                log = []
            log.append({"at": stamp, "by": actor, "via": via, "v": version})
            record["downloadLog"] = log[-PROJECT_DOWNLOADS_KEEP:]
            return record.get("project")

        project = self.file.update(mutate)
        if project:
            self.note(project, actor, "file.download", {"file": str(file_id), "version": version, "via": via})

    def drop_project(self, project, actor):
        wanted = check_project_id(project)

        def mutate(payload):
            records = self._records(payload)
            gone = []
            for file_id, record in list(records.items()):
                if not isinstance(record, dict) or record.get("project") != wanted:
                    continue
                for version in self._versions(record):
                    self._unlink(file_id, version)
                gone.append(file_id)
                del records[file_id]
            return gone

        gone = self.file.update(mutate)
        if gone:
            self.note(wanted, actor, "file.purge", {"files": len(gone)})
        return gone
