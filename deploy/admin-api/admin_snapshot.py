#!/usr/bin/env python3

import bisect
import errno
import glob
import hashlib
import ipaddress
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

SITE_ROOT = "/var/www/amitista.com"
RELEASES = os.path.join(SITE_ROOT, "releases")
CURRENT = os.path.join(SITE_ROOT, "current")
BACKUPS = "/var/backups/amitista"
RELAY_HEALTH = "http://127.0.0.1:8787/healthz"

SERVICES = [
    ("nginx.service", "Web server"),
    ("amitista-contact.service", "Contact relay"),
    ("amitista-admin.service", "Admin API"),
    ("amitista-api.service", "API gateway"),
    ("amitista-shield-demo.service", "Shield evaluator"),
    ("amitista-shield-feed.service", "Shield rules feed"),
    ("amitista-ai.service", "AI relay"),
    # amitista-bot.service — the old role-less unit — was stopped and disabled on
    # 26 Aug 2026: it ran every module on the same token as the Support bot, so it
    # was a second gateway session for one identity. Watching a retired unit means
    # a permanent "Discord bot has failed" in the panel, because a unit that was
    # SIGKILLed on its way out stays in `failed` until someone resets it. The three
    # role units below cover its whole module set; see runbooks/bot-restart.sh.
    ("amitista-bot-security.service", "Discord bot — Security"),
    ("amitista-bot-support.service", "Discord bot — Support"),
    ("amitista-bot-website.service", "Discord bot — Website"),
]

TIMERS = [
    ("amitista-healthcheck.timer", "Healthcheck"),
    ("amitista-backup.timer", "Backup"),
    ("amitista-admin-snapshot.timer", "Admin snapshot"),
    ("amitista-admin-geo.timer", "IP-to-country table"),
    ("amitista-cf-posture.timer", "Cloudflare posture"),
    ("amitista-perf.timer", "Performance monitor"),
]

KEEP_RELEASES = 12

def iso(stamp):
    return datetime.fromtimestamp(stamp, timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def tree_size(path):
    total = 0
    for root, _, files in os.walk(path):
        for name in files:
            try:
                total += os.lstat(os.path.join(root, name)).st_size
            except OSError:
                pass
    return total

def read_releases():
    try:
        live = os.path.realpath(CURRENT)
    except OSError:
        live = ""

    try:
        names = sorted(os.listdir(RELEASES), reverse=True)
    except OSError:
        return [], None

    out = []
    for name in names[:KEEP_RELEASES]:
        path = os.path.join(RELEASES, name)
        if not os.path.isdir(path):
            continue
        try:
            mtime = os.stat(path).st_mtime
        except OSError:
            continue
        out.append(
            {
                "name": name,
                "path": path,
                "created": iso(mtime),
                "bytes": tree_size(path),
                "hasIndex": os.path.isfile(os.path.join(path, "index.html")),
                "hasRoutes": os.path.isdir(os.path.join(path, "routes")),
                "current": os.path.realpath(path) == live,
            }
        )

    return out, (os.path.basename(live) if live else None)

def read_backups():
    try:
        entries = []
        for name in os.listdir(BACKUPS):
            path = os.path.join(BACKUPS, name)
            if not os.path.isfile(path):
                continue
            entries.append((os.stat(path).st_mtime, name, os.stat(path).st_size))
    except OSError:
        return None

    if not entries:
        return {"count": 0, "latest": None, "created": None, "bytes": 0, "totalBytes": 0}

    entries.sort(reverse=True)
    newest = entries[0]
    return {
        "count": len(entries),
        "latest": newest[1],
        "created": iso(newest[0]),
        "bytes": newest[2],
        "totalBytes": sum(entry[2] for entry in entries),
    }

def read_disk():
    try:
        usage = shutil.disk_usage("/")
    except OSError:
        return None
    return {
        "total": usage.total,
        "used": usage.used,
        "free": usage.free,
        "percent": round(usage.used / usage.total * 100, 1) if usage.total else None,
    }

def systemctl(unit, properties):
    try:
        result = subprocess.run(
            ["systemctl", "show", unit] + ["--property=%s" % name for name in properties],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return {}
    if result.returncode != 0:
        return {}

    values = {}
    for line in result.stdout.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key] = value.strip()
    return values

def read_services():
    out = []
    for unit, label in SERVICES:
        values = systemctl(unit, ["ActiveState", "SubState", "ActiveEnterTimestamp", "NRestarts"])
        out.append(
            {
                "unit": unit,
                "name": label,
                "state": values.get("ActiveState") or "unknown",
                "detail": values.get("SubState") or "",
                "since": values.get("ActiveEnterTimestamp") or None,
                "restarts": int(values.get("NRestarts") or 0),
            }
        )
    return out

def timer_schedule():
    try:
        result = subprocess.run(
            ["systemctl", "list-timers", "--all", "--output=json"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        entries = json.loads(result.stdout) if result.returncode == 0 else []
    except (OSError, subprocess.SubprocessError, ValueError):
        return {}

    schedule = {}
    if not isinstance(entries, list):
        return schedule

    for entry in entries:
        if isinstance(entry, dict) and isinstance(entry.get("unit"), str):
            schedule[entry["unit"]] = entry
    return schedule

def epoch_micros(value):
    if not isinstance(value, int) or value <= 0:
        return None
    return iso(value / 1_000_000)

def read_timers():
    schedule = timer_schedule()
    out = []
    for unit, label in TIMERS:
        values = systemctl(unit, ["ActiveState"])
        entry = schedule.get(unit) or {}
        out.append(
            {
                "unit": unit,
                "name": label,
                "state": values.get("ActiveState") or "unknown",
                "next": epoch_micros(entry.get("next")),
                "last": epoch_micros(entry.get("last")),
            }
        )
    return out

# The reference rows in the developer group of the panel. This list used to be
# written out by hand in the API, which is how it came to claim /root/bot still
# existed for a day after the bot moved to /opt. Every row is resolved against
# the box on each run instead, so a row that stops being true reads as missing
# rather than reading as fact.
#
# check says how to resolve the row:
#   dir  file  log  — lstat it, and carry the size or the entry count
#   link            — read the symlink and check what it points at is there
#   glob            — count the matches and take the newest
#   repo            — branch, last commit and whether the tree is dirty
#   releases        — how many are kept and which one is live
#   script          — has to exist and be executable
#   install         — compares a source directory against the installed copy
#   none            — a command with nothing on disk to verify
# path overrides value when the row prints a command rather than a path, and
# unit/units name the services worth showing next to where they run from.
REFERENCE = [
    (
        "Where the code lives",
        [
            {
                "label": "Website repo",
                "value": "/root/website",
                "hint": "the site, its deploy tooling and shield/",
                "check": "repo",
            },
            {
                "label": "Bot repo",
                "value": "/opt/amitista/discord-bot",
                "hint": "one directory: source, history and runtime",
                "check": "repo",
            },
            {
                "label": "Site source",
                "value": "/root/website/src",
                "hint": "React, built by Vite",
                "check": "dir",
            },
            {
                "label": "Admin API source",
                "value": "/root/website/deploy/admin-api",
                "hint": "the /opt copy is what runs",
                "check": "dir",
            },
            {
                "label": "Operations manual",
                "value": "/root/runbooks/OPERATIONS.md",
                "hint": "the long answer to anything here",
                "check": "file",
            },
        ],
    ),
    (
        "Where it runs",
        [
            {
                "label": "Served site",
                "value": "/var/www/amitista.com/current",
                "hint": "symlink to the live release",
                "check": "link",
            },
            {
                "label": "Releases",
                "value": "/var/www/amitista.com/releases",
                "hint": "older ones are pruned by the deploy",
                "check": "releases",
            },
            {
                "label": "Shared state",
                "value": "/var/www/amitista.com/shared",
                "hint": "status.json and friends",
                "check": "dir",
            },
            {
                "label": "Admin API",
                "value": "/opt/amitista/admin-api/admin_api.py",
                "hint": "serves this panel",
                "check": "file",
                "unit": "amitista-admin.service",
            },
            {
                "label": "API gateway",
                "value": "/opt/amitista/api-gateway/api_gateway.py",
                "hint": "the token-gated public API",
                "check": "file",
                "unit": "amitista-api.service",
            },
            {
                "label": "Contact relay",
                "value": "/opt/amitista/contact-relay",
                "hint": "the form on the site posts here",
                "check": "dir",
                "unit": "amitista-contact.service",
            },
            {
                "label": "Discord bot",
                "value": "/opt/amitista/discord-bot/bot.js",
                "hint": "four units: core, security, support, website",
                "check": "file",
                "units": [
                    "amitista-bot.service",
                    "amitista-bot-security.service",
                    "amitista-bot-support.service",
                    "amitista-bot-website.service",
                ],
            },
            {
                "label": "Shield evaluator",
                "value": "/opt/amitista/shield-demo",
                "hint": "decides what a request may do",
                "check": "dir",
                "unit": "amitista-shield-demo.service",
            },
            {
                "label": "Shield rules feed",
                "value": "/opt/amitista/shield-feed",
                "hint": "publishes what the evaluator reads",
                "check": "dir",
                "unit": "amitista-shield-feed.service",
            },
            {
                "label": "AI relay",
                "value": "/opt/amitista/ai-relay",
                "hint": "answers site and legal questions",
                "check": "dir",
                "unit": "amitista-ai.service",
            },
        ],
    ),
    (
        "Configuration & data",
        [
            {
                "label": "Environment files",
                "value": "/etc/amitista/*.env",
                "hint": "600 root-only, six of them",
                "check": "glob",
            },
            {
                "label": "Vault keys",
                "value": "/etc/amitista/vault-keys.json",
                "hint": "the key to the sealed store",
                "check": "file",
            },
            {
                "label": "Panel snapshots",
                "value": "/var/lib/amitista/admin/*.json",
                "hint": "everything this group reads",
                "check": "glob",
            },
            {
                "label": "Session store",
                "value": "/var/lib/amitista/admin/session",
                "hint": "users.json, audit.jsonl, boards.json",
                "check": "dir",
            },
            {
                "label": "Backups",
                "value": "/var/backups/amitista",
                "hint": "nightly, GPG encrypted",
                "check": "dir",
            },
        ],
    ),
    (
        "Logs",
        [
            {
                "label": "Site access",
                "value": "/var/log/nginx/amitista.access.log",
                "hint": None,
                "check": "log",
            },
            {
                "label": "Site errors",
                "value": "/var/log/nginx/amitista.error.log",
                "hint": "start here when a page 500s",
                "check": "log",
            },
            {
                "label": "CSP reports",
                "value": "/var/log/nginx/amitista.csp.log",
                "hint": "what the policy blocked",
                "check": "log",
            },
            {
                "label": "Firewall",
                "value": "/var/log/nginx/amitista.firewall.log",
                "hint": None,
                "check": "log",
            },
            {
                "label": "Any service",
                "value": "journalctl -u <unit> -f",
                "hint": "-n 200 --no-pager for a look back",
                "check": "none",
            },
        ],
    ),
    (
        "Everyday commands",
        [
            {
                "label": "Build the site",
                "value": "cd /root/website && npm run build",
                "hint": "postbuild prerenders and emits the API",
                "check": "none",
            },
            {
                "label": "Deploy the site",
                "value": "/root/website/deploy/deploy-local.sh",
                "hint": "builds, verifies, rolls back on failure",
                "check": "script",
            },
            {
                "label": "Lint",
                "value": "cd /root/website && npm run lint",
                "hint": "oxlint",
                "check": "none",
            },
            {
                "label": "Deploy the admin API",
                "value": (
                    "install -o root -g amitista-admin -m 640 "
                    "/root/website/deploy/admin-api/admin_api.py /opt/amitista/admin-api/"
                ),
                "hint": "then systemctl restart amitista-admin — the mode is not optional",
                "path": "/root/website/deploy/admin-api",
                "installed": "/opt/amitista/admin-api",
                "check": "install",
            },
            {
                "label": "Restart the bot",
                "value": "/root/runbooks/bot-restart.sh",
                "hint": "--check parses without touching anything",
                "check": "script",
            },
            {
                "label": "Refresh this panel",
                "value": "systemctl start amitista-admin-snapshot.service",
                "hint": "rebuilds every row here now",
                "check": "none",
                "unit": "amitista-admin-snapshot.timer",
            },
        ],
    ),
]

REFERENCE_ENTRY_CAP = 5000

def count_entries(path):
    total = 0
    try:
        with os.scandir(path) as entries:
            for _ in entries:
                total += 1
                if total >= REFERENCE_ENTRY_CAP:
                    break
    except OSError:
        return None
    return total

def git_facts(path):
    def run(args):
        try:
            result = subprocess.run(
                ["git", "-C", path] + args, capture_output=True, text=True, timeout=5
            )
        except (OSError, subprocess.SubprocessError):
            return None
        return result.stdout if result.returncode == 0 else None

    # --porcelain=v1 --branch answers both questions in one call: the first line
    # carries the branch, every line after it is a file the tree is dirty by.
    status = run(["status", "--porcelain=v1", "--branch"])
    if status is None:
        return None

    lines = status.splitlines()
    branch = None
    if lines and lines[0].startswith("## "):
        branch = lines[0][3:].split("...", 1)[0].strip()
        if branch.startswith("HEAD (no branch)"):
            branch = "detached"
    dirty = len([line for line in lines[1:] if line.strip()])

    commit = None
    committed = None
    head = run(["log", "-1", "--format=%h %cI"])
    if head:
        parts = head.strip().split(" ", 1)
        commit = parts[0] or None
        if len(parts) > 1:
            try:
                committed = iso(datetime.fromisoformat(parts[1]).timestamp())
            except ValueError:
                committed = None

    return {"branch": branch, "dirty": dirty, "commit": commit, "committed": committed}

UNREADABLE = (errno.EACCES, errno.EPERM)

def unreachable(error):
    # This unit is sandboxed, and ProtectHome=yes turns /root into an empty
    # directory it cannot traverse. A row under there is not gone — it simply
    # is not visible from in here, and saying "missing" would be a worse lie
    # than the hand-written list this replaced. EACCES is reported as its own
    # state so the panel can say which it is.
    return getattr(error, "errno", None) in UNREADABLE

def hidden_row(out, note="not visible from the collector's sandbox"):
    out["state"] = "unchecked"
    out["detail"] = note
    return out

def file_digest(path):
    try:
        with open(path, "rb") as handle:
            digest = hashlib.sha256()
            for chunk in iter(lambda: handle.read(65536), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError:
        return None

def install_drift(source, installed):
    # "Is what I edited actually what is running" is the question this row is
    # really asked, and it is the one the panel could never answer before. Only
    # the modules the service loads are compared — tests and one-shot migrations
    # are not part of the install, so drift in one of those is not news here.
    try:
        names = sorted(
            name for name in os.listdir(source)
            if name.endswith(".py")
            and not name.startswith(("test_", "migrate_"))
            and os.path.isfile(os.path.join(source, name))
        )
    except OSError as error:
        return "hidden" if unreachable(error) else None

    behind = []
    for name in names:
        there = os.path.join(installed, name)
        if not os.path.isfile(there):
            continue
        if file_digest(os.path.join(source, name)) != file_digest(there):
            behind.append(name)
    return behind

def reference_unit(names, states):
    names = [name for name in names if isinstance(name, str)]
    if not names:
        return None

    seen = [(name, states.get(name, "unknown")) for name in names]
    if len(seen) == 1:
        name, state = seen[0]
        return {"name": name, "state": state, "detail": state}

    up = [entry for entry in seen if entry[1] == "active"]
    return {
        "name": "%d units" % len(seen),
        "state": "active" if len(up) == len(seen) else "failed",
        "detail": "%d of %d running" % (len(up), len(seen)),
    }

def resolve_reference(row, states, live):
    out = {
        "label": row["label"],
        "value": row["value"],
        "hint": row.get("hint"),
        "state": None,
        "detail": None,
        "bytes": None,
        "changed": None,
    }

    unit = reference_unit(row.get("units") or [row.get("unit")], states)
    if unit:
        out["unit"] = unit

    check = row.get("check", "none")
    if check == "none":
        return out

    target = row.get("path") or row["value"]

    if check == "glob":
        matches = []
        for name in glob.glob(target):
            try:
                matches.append((os.stat(name).st_mtime, name, os.stat(name).st_size))
            except OSError:
                continue
        if not matches:
            try:
                os.listdir(os.path.dirname(target) or "/")
            except OSError as error:
                if unreachable(error):
                    return hidden_row(out)
            out["state"] = "missing"
            out["detail"] = "nothing matches"
            return out
        matches.sort(reverse=True)
        out["state"] = "ok"
        out["detail"] = "%d file%s · newest %s" % (
            len(matches),
            "" if len(matches) == 1 else "s",
            os.path.basename(matches[0][1]),
        )
        out["changed"] = iso(matches[0][0])
        return out

    try:
        info = os.lstat(target)
    except OSError as error:
        if unreachable(error):
            return hidden_row(out)
        out["state"] = "missing"
        out["detail"] = "not on this box"
        return out

    out["state"] = "ok"
    out["changed"] = iso(info.st_mtime)

    if check == "link":
        try:
            points_at = os.readlink(target)
        except OSError:
            points_at = None
        if points_at:
            out["detail"] = "→ %s" % os.path.basename(points_at.rstrip("/"))
        if not os.path.exists(target):
            out["state"] = "missing"
            out["detail"] = "%s — and that is gone" % (out["detail"] or "broken symlink")
        return out

    if check == "releases":
        try:
            names = sorted(os.listdir(target), reverse=True)
        except OSError:
            names = []
        kept = [name for name in names if os.path.isdir(os.path.join(target, name))]
        out["detail"] = "%d kept%s" % (len(kept), (" · live %s" % live) if live else "")
        return out

    if check == "repo":
        facts = git_facts(target)
        if not facts:
            out["detail"] = "%s entries — not a git repo" % count_entries(target)
            return out
        parts = []
        if facts["branch"]:
            parts.append("on %s" % facts["branch"])
        if facts["commit"]:
            parts.append(facts["commit"])
        parts.append("clean" if not facts["dirty"] else "%d uncommitted" % facts["dirty"])
        out["detail"] = " · ".join(parts)
        out["changed"] = facts["committed"] or out["changed"]
        return out

    if check == "install":
        behind = install_drift(target, row.get("installed") or "")
        if behind == "hidden":
            return hidden_row(out)
        if behind is None:
            out["state"] = "missing"
            out["detail"] = "the source is not there to compare"
        elif behind:
            listed = ", ".join(behind[:3])
            if len(behind) > 3:
                listed += " and %d more" % (len(behind) - 3)
            out["state"] = "drifted"
            out["detail"] = "%s not installed to %s yet" % (
                listed,
                row.get("installed") or "the running copy",
            )
        else:
            out["detail"] = "in step with %s" % (row.get("installed") or "the running copy")
        return out

    if check == "script":
        if not os.path.isfile(target):
            out["state"] = "missing"
            out["detail"] = "not a file"
        elif not os.access(target, os.X_OK):
            out["state"] = "missing"
            out["detail"] = "not executable"
        else:
            out["bytes"] = info.st_size
        return out

    if check == "dir":
        total = count_entries(target)
        if total is not None:
            out["detail"] = "%s%d entr%s" % (
                "over " if total >= REFERENCE_ENTRY_CAP else "",
                total,
                "y" if total == 1 else "ies",
            )
        return out

    if check == "log":
        out["bytes"] = info.st_size
        return out

    out["bytes"] = info.st_size
    return out

def read_reference(services, timers, live):
    states = {}
    for entry in list(services) + list(timers):
        if isinstance(entry, dict) and isinstance(entry.get("unit"), str):
            states[entry["unit"]] = entry.get("state") or "unknown"

    return [
        {"title": title, "rows": [resolve_reference(row, states, live) for row in rows]}
        for title, rows in REFERENCE
    ]

def read_certificate():
    candidates = sorted(glob.glob("/etc/letsencrypt/live/*/cert.pem"))
    if not candidates:
        return None

    path = candidates[0]
    try:
        result = subprocess.run(
            ["openssl", "x509", "-in", path, "-noout", "-enddate", "-subject"],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None

    expires = None
    subject = None
    for line in result.stdout.splitlines():
        if line.startswith("notAfter="):
            try:
                parsed = datetime.strptime(line[9:].strip(), "%b %d %H:%M:%S %Y %Z")
                expires = parsed.replace(tzinfo=timezone.utc)
            except ValueError:
                pass
        elif line.startswith("subject="):
            subject = line[8:].strip()

    if expires is None:
        return None

    remaining = expires - datetime.now(timezone.utc)
    return {
        "domain": os.path.basename(os.path.dirname(path)),
        "subject": subject,
        "expires": expires.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "daysLeft": remaining.days,
    }

def read_relay():
    try:
        with urllib.request.urlopen(RELAY_HEALTH, timeout=4) as response:
            payload = json.loads(response.read(4096).decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError):
        return {"reachable": False, "webhook": None}
    return {
        "reachable": True,
        "webhook": bool(payload.get("webhook")) if isinstance(payload, dict) else None,
    }

ACCESS_LOGS = [
    "/var/log/nginx/amitista.access.log",
    "/var/log/nginx/amitista.access.log.1",
]

LOG_LINE = re.compile(
    r'^(?P<ip>\S+) \S+ \S+ \[(?P<when>[^\]]+)\] "(?P<method>[A-Z]+) (?P<path>[^ "]+)[^"]*" '
    r'(?P<status>\d{3}) (?P<bytes>\d+|-) "(?P<referer>[^"]*)" "(?P<agent>[^"]*)"'
    r'(?: (?P<duration>[\d.]+))?'
)

LOG_MAX_BYTES = 24 * 1024 * 1024
STATS_HOURS = 24
TOP_KEEP = 8

API_GROUPS = (
    ("/api/admin", "Admin panel"),
    ("/api/k", "Gated API"),
    ("/api/v1/shield/rules", "Shield rules"),
    ("/api/v1/shield", "Shield"),
    ("/api/v1/status", "Status (v1)"),
    ("/api/v1", "Index (v1)"),
    ("/api/status", "Status"),
    ("/api/contact", "Contact relay"),
)

def tail_bytes(path, limit):
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as handle:
            if size > limit:
                handle.seek(size - limit)
                handle.readline()
            return handle.read().decode("utf-8", "replace").splitlines()
    except OSError:
        return []

def classify(path):
    for prefix, label in API_GROUPS:
        if path == prefix or path.startswith(prefix + "/") or path.startswith(prefix + "?"):
            return prefix, label
    return None, None

def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round(fraction * (len(ordered) - 1)))))
    return round(ordered[index] * 1000)

def blank_group(label):
    return {
        "label": label,
        "requests": 0,
        "ok": 0,
        "redirect": 0,
        "clientError": 0,
        "serverError": 0,
        "rateLimited": 0,
        "bytes": 0,
        "durations": [],
    }

HISTORY_FIELDS = ("site", "api", "bytes", "clientError", "serverError", "rateLimited", "notFound")

def blank_hour():
    return {name: 0 for name in HISTORY_FIELDS}

def read_api_stats():
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=STATS_HOURS)

    geo = load_geo()
    visits = Visits(now, STATS_HOURS, geo, visitor_salt(), local_addresses())

    groups = {}
    hourly = {}
    buckets = {}
    agents = {}
    missing = {}
    answered = {}
    totals = {"requests": 0, "ok": 0, "clientError": 0, "serverError": 0, "rateLimited": 0, "bytes": 0}
    site = {"requests": 0, "notFound": 0}
    timed = False

    for path in ACCESS_LOGS:
        for line in tail_bytes(path, LOG_MAX_BYTES):
            match = LOG_LINE.match(line)
            if match is None:
                continue

            try:
                when = datetime.strptime(match.group("when"), "%d/%b/%Y:%H:%M:%S %z")
            except ValueError:
                continue
            if when < cutoff:
                continue

            status = int(match.group("status"))
            request_path = match.group("path").split("?", 1)[0]

            try:
                sent = int(match.group("bytes"))
            except ValueError:
                sent = 0

            bucket = when.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
            key = bucket.isoformat().replace("+00:00", "Z")
            slot = buckets.setdefault(key, blank_hour())

            site["requests"] += 1
            slot["site"] += 1
            slot["bytes"] += sent

            if 400 <= status < 500:
                slot["clientError"] += 1
                if status == 429:
                    slot["rateLimited"] += 1
            elif status >= 500:
                slot["serverError"] += 1

            if status == 404:
                site["notFound"] += 1
                slot["notFound"] += 1
                missing[request_path] = missing.get(request_path, 0) + 1
            elif status < 400:
                # Counted for every path, not only the ones that 404, because
                # which paths will turn up in `missing` is not known until the
                # whole window has been read. A path in both is a route that
                # works and answers 404 on purpose — /boards/face does it for
                # somebody who has not set a picture — and the panel needs to
                # tell that apart from a route we actually broke.
                answered[request_path] = answered.get(request_path, 0) + 1

            visits.observe(
                when,
                key,
                match.group("ip"),
                match.group("method"),
                request_path,
                status,
                sent,
                match.group("referer"),
                match.group("agent"),
            )

            prefix, label = classify(request_path)
            if prefix is None:
                continue

            slot["api"] += 1
            entry = groups.setdefault(prefix, blank_group(label))
            entry["requests"] += 1
            totals["requests"] += 1
            entry["bytes"] += sent
            totals["bytes"] += sent

            if status < 300:
                entry["ok"] += 1
                totals["ok"] += 1
            elif status < 400:
                entry["redirect"] += 1
            elif status < 500:
                entry["clientError"] += 1
                totals["clientError"] += 1
                if status == 429:
                    entry["rateLimited"] += 1
                    totals["rateLimited"] += 1
            else:
                entry["serverError"] += 1
                totals["serverError"] += 1

            duration = match.group("duration")
            if duration:
                try:
                    entry["durations"].append(float(duration))
                    timed = True
                except ValueError:
                    pass

            hourly[key] = hourly.get(key, 0) + 1

            agent = match.group("agent")[:80] or "—"
            agents[agent] = agents.get(agent, 0) + 1

    endpoints = []
    for prefix, entry in groups.items():
        durations = entry.pop("durations")
        endpoints.append(
            dict(
                entry,
                path=prefix,
                p50=percentile(durations, 0.5),
                p95=percentile(durations, 0.95),
            )
        )
    endpoints.sort(key=lambda item: item["requests"], reverse=True)

    series = []
    for offset in range(STATS_HOURS - 1, -1, -1):
        bucket = (now - timedelta(hours=offset)).replace(minute=0, second=0, microsecond=0)
        key = bucket.isoformat().replace("+00:00", "Z")
        series.append({"hour": key, "requests": hourly.get(key, 0)})

    collected = visits.finish()
    collected["geo"] = geo_facts(geo)

    return {
        "window": STATS_HOURS,
        "generated": iso(now.timestamp()),
        "timed": timed,
        "totals": totals,
        "site": site,
        "endpoints": endpoints,
        "hourly": series,
        "buckets": buckets,
        "visits": collected,
        "agents": [
            {"agent": name, "requests": count}
            for name, count in sorted(agents.items(), key=lambda item: item[1], reverse=True)[:TOP_KEEP]
        ],
        "notFound": [
            {"path": name, "requests": count, "answered": answered.get(name, 0)}
            for name, count in sorted(missing.items(), key=lambda item: item[1], reverse=True)[:TOP_KEEP]
        ],
    }

HISTORY_KEEP_HOURS = 24 * 31

def merge_history(path, buckets):
    payload = {}
    try:
        with open(path, encoding="utf-8") as handle:
            loaded = json.load(handle)
        if isinstance(loaded, dict):
            payload = loaded
    except (OSError, ValueError):
        payload = {}

    hours = payload.get("hours")
    if not isinstance(hours, dict):
        hours = {}

    for key, value in buckets.items():
        if isinstance(value, dict):
            hours[key] = value

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=HISTORY_KEEP_HOURS)).replace(
        minute=0, second=0, microsecond=0
    )
    edge = cutoff.isoformat().replace("+00:00", "Z")
    kept = {key: value for key, value in hours.items() if key >= edge}

    return {
        "generated": iso(datetime.now(timezone.utc).timestamp()),
        "keptHours": HISTORY_KEEP_HOURS,
        "hours": kept,
    }

GEO_PATH = os.environ.get("ADMIN_GEO", "/var/lib/amitista/admin/ipcountry.json")
SALT_PATH = os.environ.get("ADMIN_SALT", "/var/lib/amitista/admin/visitor.salt")

VISIT_GAP_SECONDS = 30 * 60
VISIT_KEEP_HOURS = 24 * 31
DETAIL_KEEP_HOURS = 24 * 8
DAY_KEEP = 31
RECENT_KEEP = 40
IDS_PER_HOUR = 400
IDS_PER_DAY = 4000
DETAIL_TOP = 40
VIEW_LIMIT = 40000
REFERER_KEEP = 180

SITE_HOSTS = ("amitista.com",)

ASSET_SUFFIXES = (
    ".js", ".mjs", ".css", ".map", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif",
    ".ico", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp4", ".webm", ".ogg", ".mp3", ".wasm",
    ".txt", ".xml", ".json", ".pdf", ".zip", ".gz", ".webmanifest",
)

ASSET_PREFIXES = ("/assets/", "/fonts/", "/images/", "/media/", "/static/")

PAGE_STATUS = (200, 304)

BOT_HINT = re.compile(
    r"bot|crawl|spider|slurp|scan|scrap|fetch|monitor|probe|curl|wget|python|java/|go-http|"
    r"okhttp|libwww|perl|ruby|axios|headless|phantom|selenium|puppeteer|playwright|lighthouse|"
    r"pingdom|uptime|semrush|ahrefs|mj12|dotbot|petal|yandex|baidu|bingpreview|facebookexternal|"
    r"whatsapp|telegram|discord|slack|embedly|preview|feedly|rss|censys|shodan|zgrab|masscan|"
    r"nmap|nuclei|expanse|internet-measurement|paloalto|netcraft|archive\.org|ia_archiver",
    re.I,
)

PROBE_HINT = re.compile(
    r"^//|wp-|xmlrpc|phpmyadmin|/\.(?!well-known)|%2e|/vendor/|/cgi-bin/|/actuator|/solr|/druid|"
    r"/jenkins|/adminer|/telescope|/eval-stdin|/boaform|/hudson|myadmin|/setup\.cgi|/HNAP1|"
    r"/owa/|/autodiscover|aws-|aws\.|/credentials|/secrets|\.php|\.asp|\.aspx|\.jsp|\.cgi|\.bak|"
    r"\.sql|\.yml|\.yaml|\.ini|/config\.|/backup|/dump",
    re.I,
)

BROWSER_HINTS = (
    ("Edg", "Edge"),
    ("OPR/", "Opera"),
    ("Opera", "Opera"),
    ("SamsungBrowser", "Samsung Internet"),
    ("Vivaldi", "Vivaldi"),
    ("Brave", "Brave"),
    ("YaBrowser", "Yandex Browser"),
    ("CriOS", "Chrome"),
    ("FxiOS", "Firefox"),
    ("Firefox", "Firefox"),
    ("Chromium", "Chromium"),
    ("Chrome", "Chrome"),
    ("Trident", "Internet Explorer"),
    ("MSIE", "Internet Explorer"),
    ("Safari", "Safari"),
)

SYSTEM_HINTS = (
    ("Windows NT", "Windows"),
    ("Android", "Android"),
    ("iPhone", "iOS"),
    ("iPad", "iPadOS"),
    ("iPod", "iOS"),
    ("CrOS", "ChromeOS"),
    ("Mac OS X", "macOS"),
    ("Macintosh", "macOS"),
    ("Ubuntu", "Linux"),
    ("Linux", "Linux"),
    ("FreeBSD", "BSD"),
    ("X11", "Unix"),
)

SEARCH_HINT = re.compile(
    r"(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|startpage|qwant|mojeek|searx|"
    r"brave|naver|seznam|ask|aol)\.",
    re.I,
)

SOCIAL_HINT = re.compile(
    r"(^|\.)(t\.co|x\.com|twitter|reddit|linkedin|facebook|fb\.com|instagram|youtube|youtu\.be|"
    r"discord|t\.me|telegram|pinterest|tumblr|mastodon|bsky|threads|github|medium|substack|"
    r"dev\.to|producthunt|news\.ycombinator|lobste\.rs|hn\.algolia)",
    re.I,
)

SOURCE_KINDS = ("direct", "internal", "search", "social", "other")

def hour_stamp(moment):
    return moment.replace(minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")

def read_hour_stamp(key):
    try:
        return datetime.strptime(key, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None

def local_addresses():
    found = {"127.0.0.1", "::1"}
    try:
        result = subprocess.run(
            ["ip", "-o", "addr", "show"], capture_output=True, text=True, timeout=5, check=False
        )
    except (OSError, subprocess.SubprocessError):
        return found
    for line in result.stdout.splitlines():
        parts = line.split()
        for index, word in enumerate(parts):
            if word in ("inet", "inet6") and index + 1 < len(parts):
                found.add(parts[index + 1].split("/")[0])
    return found

def load_geo(path=GEO_PATH):
    try:
        with open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    for family in ("v4", "v6"):
        table = payload.get(family)
        if not isinstance(table, dict):
            return None
        for field in ("starts", "ends", "cc"):
            if not isinstance(table.get(field), list):
                return None
        if not len(table["starts"]) == len(table["ends"]) == len(table["cc"]):
            return None
    return payload

def geo_facts(geo, path=GEO_PATH):
    if geo is None:
        return {"available": False, "generated": None, "ranges": 0, "ageDays": None, "path": path}
    try:
        age = round((datetime.now(timezone.utc).timestamp() - os.path.getmtime(path)) / 86400, 1)
    except OSError:
        age = None
    return {
        "available": True,
        "generated": geo.get("generated"),
        "registries": geo.get("registries") or [],
        "missing": geo.get("missing") or [],
        "ranges": len(geo["v4"]["starts"]) + len(geo["v6"]["starts"]),
        "ageDays": age,
        "path": path,
    }

def address_number(ip):
    try:
        if ":" in ip:
            return 6, int(ipaddress.IPv6Address(ip))
        return 4, int(ipaddress.IPv4Address(ip))
    except ValueError:
        return None, None

def country_of(geo, ip):
    if geo is None:
        return None
    family, value = address_number(ip)
    if family is None:
        return None
    if family == 6:
        value >>= int(geo.get("v6Shift") or 64)
        table = geo["v6"]
    else:
        table = geo["v4"]
    index = bisect.bisect_right(table["starts"], value) - 1
    if index < 0 or value > table["ends"][index]:
        return None
    code = table["cc"][index]
    return code if isinstance(code, str) and len(code) == 2 else None

def visitor_salt(path=SALT_PATH):
    try:
        with open(path, "rb") as handle:
            existing = handle.read().strip()
        if len(existing) >= 32:
            return existing
    except OSError:
        pass
    salt = os.urandom(32).hex().encode("ascii")
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(salt)
    except OSError:
        pass
    return salt

def is_asset(path):
    if path.startswith(ASSET_PREFIXES):
        return True
    dot = path.rfind(".")
    return dot > 0 and path[dot:].lower() in ASSET_SUFFIXES

def is_probe(path):
    return bool(PROBE_HINT.search(path))

def is_page(method, path, status):
    if method not in ("GET", "HEAD") or status not in PAGE_STATUS:
        return False
    if path != "/api" and (path.startswith("/api/") or path == "/csp-report"):
        return False
    return not is_asset(path)

def is_site_host(host):
    return any(host == name or host.endswith("." + name) for name in SITE_HOSTS)

def describe_agent(agent):
    text = (agent or "").strip()
    if not text or text == "-":
        return {"bot": True, "label": "no user agent", "browser": "Unknown", "system": "Unknown", "device": "unknown"}
    if BOT_HINT.search(text):
        return {"bot": True, "label": bot_label(text), "browser": "Unknown", "system": "Unknown", "device": "robot"}

    browser = "Other"
    for needle, name in BROWSER_HINTS:
        if needle in text:
            browser = name
            break
    system = "Other"
    for needle, name in SYSTEM_HINTS:
        if needle in text:
            system = name
            break

    if "iPad" in text or "Tablet" in text or ("Android" in text and "Mobile" not in text):
        device = "tablet"
    elif "Mobi" in text or "iPhone" in text or "iPod" in text or "Android" in text:
        device = "mobile"
    else:
        device = "desktop"

    return {"bot": False, "label": browser, "browser": browser, "system": system, "device": device}

GENERIC_TOKENS = ("mozilla", "applewebkit", "khtml", "gecko", "safari", "chrome", "version", "like")

def bot_label(agent):
    match = re.search(r"([A-Za-z0-9_.\-]*(?:bot|crawler|spider|scanner|probe)[A-Za-z0-9_.\-]*)", agent, re.I)
    if match:
        return match.group(1)[:48]
    match = re.search(r"compatible;\s*([A-Za-z0-9_.\-]+)", agent, re.I)
    if match:
        return match.group(1)[:48]
    for token in re.findall(r"[A-Za-z][A-Za-z0-9_.\-]*", agent):
        if token.lower() not in GENERIC_TOKENS:
            return token[:48]
    return (agent.strip() or "unknown")[:48]

def referer_host(value):
    text = (value or "").strip()
    if not text or text == "-":
        return None
    match = re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*://([^/?#]+)", text)
    host = match.group(1) if match else text.split("/")[0]
    host = host.split("@")[-1].split(":")[0].strip().lower()
    if host.startswith("www."):
        host = host[4:]
    return host or None

def points_at(referer, path):
    text = (referer or "").split("?", 1)[0].split("#", 1)[0]
    match = re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*://[^/]*(/.*)?$", text)
    if match is None:
        return text == path
    return (match.group(1) or "/") == path

def source_of(host):
    if host is None:
        return "direct"
    if is_site_host(host):
        return "internal"
    if SEARCH_HINT.search(host):
        return "search"
    if SOCIAL_HINT.search(host):
        return "social"
    return "other"

VISIT_FIELDS = (
    "hits", "pageviews", "visitors", "sessions", "bounces", "bytes", "humanHits", "botHits",
    "assets", "probes", "notFound", "errors", "internal",
)

DETAIL_MAPS = ("pages", "entries", "referrers", "urls", "bots", "probes", "broken", "probeCountries")

def blank_visit_hour():
    return {name: 0 for name in VISIT_FIELDS}

def blank_visit_detail():
    payload = {name: {} for name in DETAIL_MAPS}
    payload["sources"] = {name: 0 for name in SOURCE_KINDS}
    payload["ids"] = {}
    return payload

def tally(mapping, key, amount=1):
    if key is None:
        return
    mapping[key] = mapping.get(key, 0) + amount

def trim_map(mapping, limit=DETAIL_TOP):
    if len(mapping) <= limit:
        return mapping
    ranked = sorted(mapping.items(), key=lambda item: item[1], reverse=True)[:limit]
    return dict(ranked)

class Visits:
    def __init__(self, now, span, geo, salt, local):
        self.now = now
        self.span = span
        self.geo = geo
        self.salt = salt
        self.local = local
        self.counters = {}
        self.detail = {}
        self.views = []
        self.agents = {}
        self.hosts = {}
        self.countries = {}
        self.visitors = {}
        self.capped = False
        self.dropped = 0
        for offset in range(span - 1, -1, -1):
            key = hour_stamp(now - timedelta(hours=offset))
            self.counters[key] = blank_visit_hour()
            self.detail[key] = blank_visit_detail()

    def agent_facts(self, agent):
        known = self.agents.get(agent)
        if known is None:
            known = describe_agent(agent)
            self.agents[agent] = known
        return known

    def host_of(self, referer):
        known = self.hosts.get(referer)
        if known is None:
            known = (referer_host(referer),)
            self.hosts[referer] = known
        return known[0]

    def country(self, ip):
        known = self.countries.get(ip)
        if known is None:
            known = (country_of(self.geo, ip),)
            self.countries[ip] = known
        return known[0]

    def visitor(self, ip, agent):
        cached = self.visitors.get((ip, agent))
        if cached is None:
            digest = hashlib.blake2b(
                self.salt + b"\x00" + ip.encode("utf-8", "replace") + b"\x00" + agent.encode("utf-8", "replace"),
                digest_size=4,
            )
            cached = digest.hexdigest()
            self.visitors[(ip, agent)] = cached
        return cached

    def observe(self, when, key, ip, method, path, status, sent, referer, agent):
        slot = self.counters.setdefault(key, blank_visit_hour())
        detail = self.detail.setdefault(key, blank_visit_detail())

        slot["hits"] += 1
        slot["bytes"] += sent
        if status == 404:
            slot["notFound"] += 1
        elif status >= 500:
            slot["errors"] += 1

        asset = is_asset(path)
        if asset:
            slot["assets"] += 1

        if ip in self.local:
            slot["internal"] += 1
            return

        if is_probe(path):
            slot["probes"] += 1
            tally(detail["probes"], path[:REFERER_KEEP])
            tally(detail["probeCountries"], self.country(ip))
            return

        facts = self.agent_facts(agent)
        if facts["bot"]:
            slot["botHits"] += 1
            tally(detail["bots"], facts["label"])
            return

        slot["humanHits"] += 1
        code = self.country(ip)
        identifier = self.visitor(ip, agent)
        seat = detail["ids"].get(identifier)
        if seat is None:
            if len(detail["ids"]) < IDS_PER_HOUR:
                seat = [code or "", facts["device"], facts["browser"], facts["system"], 0]
                detail["ids"][identifier] = seat
            else:
                self.capped = True

        host = self.host_of(referer)

        if status == 404 and host is not None and not points_at(referer, path):
            tally(detail["broken"], "%s\t%s" % (path[:REFERER_KEEP], referer[:REFERER_KEEP]))

        if not is_page(method, path, status):
            return

        slot["pageviews"] += 1
        tally(detail["pages"], path[:REFERER_KEEP])
        if seat is not None:
            seat[4] += 1

        source = source_of(host)
        detail["sources"][source] = detail["sources"].get(source, 0) + 1
        if source in ("search", "social", "other"):
            tally(detail["referrers"], host)
            tally(detail["urls"], referer[:REFERER_KEEP])

        if len(self.views) < VIEW_LIMIT:
            self.views.append(
                (
                    when.timestamp(),
                    identifier,
                    path[:REFERER_KEEP],
                    code,
                    facts["device"],
                    facts["browser"],
                    facts["system"],
                    host,
                    source,
                )
            )
        else:
            self.dropped += 1

    def sessions(self):
        self.views.sort(key=lambda item: item[0])
        last = {}
        counted = {}
        opened = {}

        for at, identifier, path, unused_code, unused_d, unused_b, unused_s, unused_h, unused_src in self.views:
            previous = last.get(identifier)
            if previous is None or at - previous > VISIT_GAP_SECONDS:
                if previous is not None and counted.get(identifier) == 1:
                    opened[identifier]["bounces"] += 1
                key = hour_stamp(datetime.fromtimestamp(at, timezone.utc))
                slot = self.counters.setdefault(key, blank_visit_hour())
                detail = self.detail.setdefault(key, blank_visit_detail())
                slot["sessions"] += 1
                tally(detail["entries"], path)
                opened[identifier] = slot
                counted[identifier] = 0
            counted[identifier] = counted.get(identifier, 0) + 1
            last[identifier] = at

        for identifier, pages in counted.items():
            if pages == 1:
                opened[identifier]["bounces"] += 1

    def recent(self):
        rows = []
        for entry in self.views[-RECENT_KEEP:][::-1]:
            at, identifier, path, code, device, browser, system, host, source = entry
            rows.append(
                {
                    "at": iso(at),
                    "visitor": identifier,
                    "path": path,
                    "country": code,
                    "device": device,
                    "browser": browser,
                    "system": system,
                    "referer": host,
                    "source": source,
                }
            )
        return rows

    def finish(self):
        self.sessions()
        recent = self.recent()

        for key, detail in self.detail.items():
            self.counters.setdefault(key, blank_visit_hour())["visitors"] = len(detail["ids"])
            for name in DETAIL_MAPS:
                detail[name] = trim_map(detail[name])

        return {
            "hours": self.counters,
            "detail": self.detail,
            "recent": recent,
            "capped": self.capped,
            "dropped": self.dropped,
        }

def combine_detail(entries, id_limit=IDS_PER_DAY):
    out = blank_visit_detail()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        for name in DETAIL_MAPS:
            source = entry.get(name)
            if isinstance(source, dict):
                for key, value in source.items():
                    try:
                        out[name][key] = out[name].get(key, 0) + int(value)
                    except (TypeError, ValueError):
                        continue
        sources = entry.get("sources")
        if isinstance(sources, dict):
            for key, value in sources.items():
                if key in out["sources"]:
                    try:
                        out["sources"][key] += int(value)
                    except (TypeError, ValueError):
                        continue
        ids = entry.get("ids")
        if isinstance(ids, dict):
            for key, value in ids.items():
                if not isinstance(value, list) or len(value) < 5:
                    continue
                seat = out["ids"].get(key)
                if seat is None:
                    if len(out["ids"]) >= id_limit:
                        continue
                    out["ids"][key] = list(value)
                    continue
                try:
                    seat[4] += int(value[4])
                except (TypeError, ValueError):
                    continue
                if not seat[0] and value[0]:
                    seat[0] = value[0]

    for name in DETAIL_MAPS:
        out[name] = trim_map(out[name], DETAIL_TOP * 2)
    return out

def roll_days(detail, now):
    grouped = {}
    for key, value in detail.items():
        moment = read_hour_stamp(key)
        if moment is None:
            continue
        grouped.setdefault(moment.strftime("%Y-%m-%d"), {})[moment.hour] = value

    today = now.strftime("%Y-%m-%d")
    out = {}
    for day, hours in grouped.items():
        expected = now.hour + 1 if day == today else 24
        if day > today or len(hours) < expected:
            continue
        out[day] = combine_detail(list(hours.values()))
    return out

def merge_visits(path, fresh):
    payload = {}
    try:
        with open(path, encoding="utf-8") as handle:
            loaded = json.load(handle)
        if isinstance(loaded, dict):
            payload = loaded
    except (OSError, ValueError):
        payload = {}

    hours = payload.get("hours")
    hours = dict(hours) if isinstance(hours, dict) else {}
    detail = payload.get("detail")
    detail = dict(detail) if isinstance(detail, dict) else {}
    days = payload.get("days")
    days = dict(days) if isinstance(days, dict) else {}

    hours.update(fresh["hours"])
    detail.update(fresh["detail"])

    now = datetime.now(timezone.utc)
    hour_edge = hour_stamp(now - timedelta(hours=VISIT_KEEP_HOURS))
    detail_edge = hour_stamp(now - timedelta(hours=DETAIL_KEEP_HOURS))
    hours = {key: value for key, value in hours.items() if key >= hour_edge}
    detail = {key: value for key, value in detail.items() if key >= detail_edge}

    days.update(roll_days(detail, now))
    day_edge = (now - timedelta(days=DAY_KEEP)).strftime("%Y-%m-%d")
    days = {key: value for key, value in days.items() if key >= day_edge}

    return {
        "generated": iso(now.timestamp()),
        "window": STATS_HOURS,
        "keptHours": VISIT_KEEP_HOURS,
        "detailHours": DETAIL_KEEP_HOURS,
        "keptDays": DAY_KEEP,
        "gapMinutes": VISIT_GAP_SECONDS // 60,
        "sourceKinds": list(SOURCE_KINDS),
        "capped": bool(fresh.get("capped")),
        "dropped": int(fresh.get("dropped") or 0),
        "recent": fresh.get("recent") or [],
        "geo": fresh.get("geo") or {"available": False},
        "hours": hours,
        "detail": detail,
        "days": days,
    }

CSP_LOG = "/var/log/nginx/amitista.csp.log"
CSP_MAX_BYTES = 2 * 1024 * 1024
CSP_HOURS = 24 * 7
CSP_SHOWN = 60
CSP_TOP = 10

def csp_field(report, *names):
    for name in names:
        value = report.get(name)
        if isinstance(value, str) and value:
            return value[:300]
    return None

def normalise_csp(raw):
    try:
        body = json.loads(raw)
    except (TypeError, ValueError):
        return []

    if isinstance(body, dict) and isinstance(body.get("csp-report"), dict):
        report = body["csp-report"]
        return [
            {
                "document": csp_field(report, "document-uri", "documentURI"),
                "directive": csp_field(report, "effective-directive", "violated-directive"),
                "blocked": csp_field(report, "blocked-uri"),
                "disposition": csp_field(report, "disposition"),
                "sample": csp_field(report, "script-sample"),
            }
        ]

    if isinstance(body, list):
        out = []
        for entry in body:
            if not isinstance(entry, dict) or entry.get("type") != "csp-violation":
                continue
            report = entry.get("body")
            if not isinstance(report, dict):
                continue
            out.append(
                {
                    "document": csp_field(report, "documentURL", "document-uri"),
                    "directive": csp_field(report, "effectiveDirective", "effective-directive"),
                    "blocked": csp_field(report, "blockedURL", "blocked-uri"),
                    "disposition": csp_field(report, "disposition"),
                    "sample": csp_field(report, "sample", "script-sample"),
                }
            )
        return out

    return []

def read_csp_reports():
    cutoff = datetime.now(timezone.utc) - timedelta(hours=CSP_HOURS)
    lines = tail_bytes(CSP_LOG, CSP_MAX_BYTES)
    if not lines and not os.path.exists(CSP_LOG):
        return None

    reports = []
    empty = 0
    malformed = 0
    for line in lines:
        try:
            envelope = json.loads(line)
        except ValueError:
            continue
        if not isinstance(envelope, dict):
            continue

        when = envelope.get("t")
        try:
            moment = datetime.strptime(str(when)[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            moment = None
        if moment is not None and moment < cutoff:
            continue

        raw = envelope.get("report")
        if not raw:
            empty += 1
            continue

        for found in normalise_csp(raw):
            if not any(found.get(name) for name in ("document", "directive", "blocked")):
                malformed += 1
                continue
            reports.append(dict(found, at=when))

    directives = {}
    blocked = {}
    documents = {}
    for entry in reports:
        for store, name in ((directives, "directive"), (blocked, "blocked"), (documents, "document")):
            value = entry.get(name) or "—"
            store[value] = store.get(value, 0) + 1

    def ranked(store):
        return [
            {"name": name, "count": count}
            for name, count in sorted(store.items(), key=lambda pair: pair[1], reverse=True)[:CSP_TOP]
        ]

    reports.sort(key=lambda entry: entry.get("at") or "", reverse=True)
    return {
        "window": CSP_HOURS,
        "log": CSP_LOG,
        "total": len(reports),
        "empty": empty,
        "malformed": malformed,
        "reports": reports[:CSP_SHOWN],
        "directives": ranked(directives),
        "blocked": ranked(blocked),
        "documents": ranked(documents),
    }

FAIL2BAN_BINARY = "/usr/bin/fail2ban-client"
FAIL2BAN_TIMEOUT = 8

def fail2ban(*args):
    try:
        finished = subprocess.run(
            [FAIL2BAN_BINARY, *args],
            capture_output=True,
            text=True,
            timeout=FAIL2BAN_TIMEOUT,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if finished.returncode != 0:
        return None
    return finished.stdout

def jail_names():
    output = fail2ban("status")
    if output is None:
        return None
    for line in output.splitlines():
        if "Jail list:" in line:
            names = line.split("Jail list:", 1)[1]
            return [name.strip() for name in names.split(",") if name.strip()]
    return []

def jail_number(text):
    try:
        return int(text.strip())
    except (AttributeError, ValueError):
        return 0

def read_jail(name):
    output = fail2ban("status", name)
    if output is None:
        return None

    jail = {
        "name": name,
        "currentlyFailed": 0,
        "totalFailed": 0,
        "currentlyBanned": 0,
        "totalBanned": 0,
        "banned": [],
    }
    for line in output.splitlines():
        cleaned = line.strip().lstrip("|`- ").strip()
        if cleaned.startswith("Currently failed:"):
            jail["currentlyFailed"] = jail_number(cleaned.split(":", 1)[1])
        elif cleaned.startswith("Total failed:"):
            jail["totalFailed"] = jail_number(cleaned.split(":", 1)[1])
        elif cleaned.startswith("Currently banned:"):
            jail["currentlyBanned"] = jail_number(cleaned.split(":", 1)[1])
        elif cleaned.startswith("Total banned:"):
            jail["totalBanned"] = jail_number(cleaned.split(":", 1)[1])
        elif cleaned.startswith("Banned IP list:"):
            addresses = cleaned.split(":", 1)[1].split()
            jail["banned"] = addresses[:50]
    return jail

def read_fail2ban():
    names = jail_names()
    if names is None:
        return {"available": False, "jails": []}
    jails = [jail for jail in (read_jail(name) for name in names) if jail is not None]
    return {
        "available": True,
        "jails": jails,
        "banned": sum(jail["currentlyBanned"] for jail in jails),
        "totalBanned": sum(jail["totalBanned"] for jail in jails),
    }

PERF_STATE = os.environ.get("AMITISTA_PERF_STATE", "/var/lib/amitista/perf")
PERF_HISTORY = os.path.join(PERF_STATE, "history.jsonl")
PERF_BASELINE = os.path.join(PERF_STATE, "baseline.json")

# Mirrors BUDGETS in deploy/perf-monitor/perf-monitor.mjs. The monitor stays the
# authority on whether a run passed — its own problems list is what the panel
# shows — but the meters need the numbers to draw a bar against, and a budget
# the panel cannot see is a bar with no end.
PERF_BUDGETS = {
    "broadband": {"lcp": 1200, "fcp": 900, "ttfb": 400, "cls": 0.1, "longTaskMs": 400, "bytes": 400000},
    "slow-4g-4x-cpu": {"lcp": 2500, "fcp": 1800, "ttfb": 900, "cls": 0.1, "longTaskMs": 3000, "bytes": 400000},
}

# The table shows a run in full; the trend only charts what can be plotted
# against a budget line, so bytes and long tasks are carried for the latest run
# and left out of the series.
PERF_FULL = ("ttfb", "fcp", "lcp", "cls", "longTaskMs", "bytes")
PERF_TRENDED = ("ttfb", "fcp", "lcp", "cls")
PERF_KEEP = 24

def parse_iso(value):
    if not isinstance(value, str) or not value:
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).timestamp()
    except ValueError:
        return None

def release_at(releases, moment):
    # Which release was serving when the run happened. Only the releases still on
    # disk can be named — the deploy prunes past five — so an older run simply
    # carries no release rather than a guess.
    when = parse_iso(moment)
    if when is None:
        return None
    for release in releases:
        if not isinstance(release, dict):
            continue
        made = parse_iso(release.get("created"))
        if made is not None and made <= when:
            return release.get("name")
    return None

def perf_page(page, keys):
    out = {}
    for key in keys:
        value = page.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        out[key] = value
    return out

def over_budget(page, budget):
    # The same comparisons the monitor makes, so the panel and the alert it sent
    # to Discord never disagree about whether a page is inside budget.
    if not budget:
        return []
    out = []
    for key in PERF_FULL:
        value = page.get(key)
        limit = budget.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and limit and value > limit:
            out.append(key)
    return out

def read_perf(releases):
    try:
        with open(PERF_HISTORY, encoding="utf-8") as handle:
            lines = handle.readlines()
    except OSError:
        return None

    runs = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if isinstance(entry, dict) and isinstance(entry.get("pages"), list):
            runs.append(entry)

    if not runs:
        return None

    latest = runs[-1]
    profile = latest.get("profile")
    budget = PERF_BUDGETS.get(profile)

    pages = []
    for page in latest["pages"]:
        if not isinstance(page, dict) or not isinstance(page.get("path"), str):
            continue
        entry = {"path": page["path"]}
        entry.update(perf_page(page, PERF_FULL))
        entry["lcpElement"] = page.get("lcpElement") if isinstance(page.get("lcpElement"), str) else None
        injected = page.get("injected")
        entry["injected"] = [str(item) for item in injected] if isinstance(injected, list) else []
        entry["over"] = over_budget(entry, budget)
        pages.append(entry)

    # Only runs of the same profile can share a chart: a slow-4g run next to a
    # broadband one on one axis would invent a regression that never happened.
    same = [run for run in runs if run.get("profile") == profile][-PERF_KEEP:]
    series = []
    for run in same:
        moment = run.get("at")
        point = {"at": moment, "release": release_at(releases, moment), "pages": {}}
        for page in run["pages"]:
            if isinstance(page, dict) and isinstance(page.get("path"), str):
                point["pages"][page["path"]] = perf_page(page, PERF_TRENDED)
        series.append(point)

    try:
        with open(PERF_BASELINE, encoding="utf-8") as handle:
            baseline = json.load(handle)
    except (OSError, ValueError):
        baseline = None

    base = None
    if isinstance(baseline, dict) and baseline.get("profile") == profile:
        marks = {}
        for page in baseline.get("pages") or []:
            if isinstance(page, dict) and isinstance(page.get("path"), str):
                marks[page["path"]] = perf_page(page, PERF_TRENDED)
        base = {"at": baseline.get("at"), "pages": marks}

    problems = latest.get("problems")
    return {
        "generated": iso(datetime.now(timezone.utc).timestamp()),
        "profile": profile,
        "budgets": budget,
        "totalRuns": len(runs),
        "latest": {
            "at": latest.get("at"),
            "release": release_at(releases, latest.get("at")),
            "pages": pages,
            "problems": [str(item) for item in problems] if isinstance(problems, list) else [],
        },
        "baseline": base,
        "runs": series,
    }

def write_atomic(path, payload, owner):
    out_dir = os.path.dirname(path)
    os.makedirs(out_dir, exist_ok=True)

    handle = tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=out_dir, prefix=".overview-", suffix=".tmp", delete=False
    )
    try:
        json.dump(payload, handle, separators=(",", ":"))
        handle.flush()
        os.fsync(handle.fileno())
        handle.close()
        os.chmod(handle.name, 0o640)
        if owner:
            try:
                shutil.chown(handle.name, group=owner)
            except (LookupError, PermissionError, OSError):
                os.chmod(handle.name, 0o644)
        os.replace(handle.name, path)
    except BaseException:
        os.unlink(handle.name)
        raise

def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "/var/lib/amitista/admin/overview.json"
    owner = os.environ.get("ADMIN_GROUP", "amitista-admin")
    history_path = os.environ.get(
        "ADMIN_HISTORY", os.path.join(os.path.dirname(out_path), "history.json")
    )
    security_path = os.environ.get(
        "ADMIN_SECURITY", os.path.join(os.path.dirname(out_path), "security.json")
    )
    perf_path = os.environ.get(
        "ADMIN_PERF", os.path.join(os.path.dirname(out_path), "perf.json")
    )
    analytics_path = os.environ.get(
        "ADMIN_ANALYTICS", os.path.join(os.path.dirname(out_path), "analytics.json")
    )

    releases, live = read_releases()
    api = read_api_stats()
    buckets = api.pop("buckets", {})
    visits = api.pop("visits", None)
    services = read_services()
    timers = read_timers()

    payload = {
        "generated": iso(datetime.now(timezone.utc).timestamp()),
        "host": os.uname().nodename,
        "currentRelease": live,
        "releases": releases,
        "rollbackTargets": [r["name"] for r in releases if not r["current"] and r["hasIndex"]],
        "services": services,
        "timers": timers,
        "backups": read_backups(),
        "disk": read_disk(),
        "certificate": read_certificate(),
        "relay": read_relay(),
        "api": api,
        "reference": read_reference(services, timers, live),
    }

    write_atomic(out_path, payload, owner)
    write_atomic(history_path, merge_history(history_path, buckets), owner)

    # The perf monitor keeps its own state under /var/lib/amitista/perf, which
    # the admin API cannot read: it is 0750 root:root and the API runs as
    # amitista-admin. Projecting it here is the only way the panel sees it, and
    # it goes in its own file rather than the overview so the dashboard payload
    # does not carry a chart nothing on it draws.
    perf = read_perf(releases)
    if perf is not None:
        write_atomic(perf_path, perf, owner)

    if visits is not None:
        write_atomic(analytics_path, merge_visits(analytics_path, visits), owner)
    write_atomic(
        security_path,
        {
            "generated": iso(datetime.now(timezone.utc).timestamp()),
            "csp": read_csp_reports(),
            "fail2ban": read_fail2ban(),
        },
        owner,
    )

if __name__ == "__main__":
    main()
