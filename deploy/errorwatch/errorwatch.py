#!/usr/bin/env python3

"""Count what goes wrong on this box, and say whether a deploy made it worse.

Nothing here acts. It reads, it counts, it posts a card into Discord and it
stops — no restart, no rollback, no ban. A deploy that doubled the 500s is
reported in the same words as a quiet afternoon, and what to do about it is a
person's decision.

It runs as root because that is the only account that can see all of it: nginx
writes its logs to the `adm` group, the Shield and API feeds belong to
`amitista-admin`, and the journal belongs to root. The bot cannot read any of
those (it holds `adm` and nothing else), which is why this exists as a separate
process that hands the bot finished numbers over the loopback rather than the
bot growing the privilege to gather them.

Six sources, counted into one-minute buckets so any window can be summed after
the fact:

    nginx5xx     a 5xx in the site's access log — the site itself failing
    nginxError   nginx's own error log, at error level or worse
    app          the amitista services' own error lines in the journal
    nginx4xx     4xx: scanners move this and nothing else
    rateLimit    requests nginx turned away, and 429s
    shield       Shield flags on the API
    api          the API gateway refusing a key
    csp          Content-Security-Policy violations reported by browsers

Only the first three are "errors" — the site or a service failing, ours to fix,
and what a release is judged against. The rest is the internet arriving. It is
counted, shown beside a release for context and summarised into the website's
own channel, but it never inflates an error rate and never raises a spike.

Three kinds of card:

    release   a deploy has settled, so here is before against after
    spike     errors jumped without a deploy to blame
    digest    every few hours, what the period held, quiet or not

    errorwatch.py [--once] [--dry-run] [--digest] [--state DIR]
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

STATE_DIR = "/var/lib/amitista/errorwatch"
DEPLOY_LOG = "/var/lib/amitista/autodeploy/deploys.jsonl"
BOT_ENV = "/opt/amitista/discord-bot/.env"
ENDPOINT = os.environ.get("ERRORWATCH_ENDPOINT", "http://127.0.0.1:8798/errors")

SOURCES = {
    "access": "/var/log/nginx/amitista.access.log",
    "nginx_error": "/var/log/nginx/amitista.error.log",
    "csp": "/var/log/nginx/amitista.csp.log",
    "shield": "/var/lib/amitista/shield/flags.jsonl",
    "api": "/var/lib/amitista/api/events.jsonl",
}

UNITS = [
    "amitista-admin",
    "amitista-api",
    "amitista-ai",
    "amitista-contact",
    "amitista-bot-support",
    "amitista-bot-website",
    "amitista-bot-security",
    "amitista-shield-feed",
    "amitista-shield-demo",
]

# What a window is measured over, and how long after a deploy to start looking.
# The grace covers the restarts the deploy itself causes: a service coming back
# refuses connections for a second or two, and counting that as the release's
# fault would make every deploy look like a regression.
WINDOW_MINUTES = 15
GRACE_SECONDS = 120
BUCKET_TTL_MINUTES = 6 * 60

# A spike has to be both a multiple of the baseline and worth waking up for, or
# one error against a background of zero reads as an infinite increase.
SPIKE_MULTIPLE = 3.0
SPIKE_FLOOR = 6
SPIKE_QUIET_SECONDS = 30 * 60
DIGEST_SECONDS = 6 * 60 * 60

MAX_READ = 4 * 1024 * 1024
MAX_SIGS = 60
TOP_SIGS = 5
OUTBOX_MAX = 40

# Two audiences, and the split is deliberate. The first three are the site or a
# service failing — ours to fix, and what a release is judged against. The rest
# is the internet arriving: scanners, refused keys, browsers reporting a policy,
# nginx turning a flood away. That is counted and shown, and it never inflates an
# error rate or raises a spike.
ERROR_SOURCES = ("nginx5xx", "nginxError", "app")
WEB_SOURCES = ("nginx4xx", "rateLimit", "shield", "api", "csp")
ALL_SOURCES = ERROR_SOURCES + WEB_SOURCES

LABELS = {
    "nginx5xx": "5xx responses",
    "nginxError": "nginx errors",
    "app": "application errors",
    "nginx4xx": "4xx responses",
    "rateLimit": "rate limited",
    "shield": "Shield flags",
    "api": "API refusals",
    "csp": "CSP violations",
}

ACCESS_LINE = re.compile(r'^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d{3}) ')
NGINX_ERROR_LINE = re.compile(r"^(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] \d+#\d+: (.*)$")
APP_ERROR = re.compile(r"(^|\s)(ERROR|CRITICAL|FATAL)\b|Traceback \(most recent call last\)|unhandled error|UnhandledPromiseRejection")
CONTINUATION = re.compile(r"^\s+(at\s|\.\.\.|File \")|^\s*[\{\}\]]")

HEX = re.compile(r"\b[0-9a-f]{7,}\b", re.I)
NUM = re.compile(r"\d{2,}")


def now():
    return int(time.time())


def minute_of(epoch):
    return int(epoch) // 60


def signature(text, limit=110):
    """Collapse the parts that differ between two of the same error."""
    flat = " ".join(str(text or "").split())
    flat = HEX.sub("«id»", flat)
    flat = NUM.sub("N", flat)
    return flat[: limit - 1] + "…" if len(flat) > limit else flat


def parse_access_time(stamp):
    try:
        return int(datetime.strptime(stamp.split()[0], "%d/%b/%Y:%H:%M:%S").replace(tzinfo=timezone.utc).timestamp())
    except (ValueError, IndexError):
        return None


def parse_nginx_time(stamp):
    try:
        return int(datetime.strptime(stamp, "%Y/%m/%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp())
    except ValueError:
        return None


def parse_iso(stamp):
    text = str(stamp or "").strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp())


def blank_state():
    return {"files": {}, "buckets": {}, "cursor": None, "deploysOffset": 0, "pending": [], "outbox": [], "lastDigest": 0, "lastSpike": 0}


def load_state(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            held = json.load(handle)
    except (OSError, ValueError):
        return blank_state()
    state = blank_state()
    if isinstance(held, dict):
        for key, value in held.items():
            if key in state and isinstance(value, type(state[key])):
                state[key] = value
            elif key in state and state[key] is None:
                state[key] = value
    return state


def save_state(path, state):
    os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
    handle, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as out:
            json.dump(state, out)
        os.replace(tmp, path)
        os.chmod(path, 0o600)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def read_new(state, name, path):
    """New whole lines since last time, following the file across a rotation."""
    saved = state["files"].get(name) or {}
    try:
        stat = os.stat(path)
    except OSError:
        return []

    start = saved.get("offset")
    # First sight of a file is a starting line, not a backlog to report.
    if start is None:
        state["files"][name] = {"offset": stat.st_size, "ino": stat.st_ino}
        return []
    if saved.get("ino") != stat.st_ino or stat.st_size < start:
        start = 0

    if stat.st_size == start:
        state["files"][name] = {"offset": start, "ino": stat.st_ino}
        return []

    length = min(stat.st_size - start, MAX_READ)
    try:
        with open(path, "rb") as handle:
            handle.seek(start)
            chunk = handle.read(length)
    except OSError:
        return []

    consumed = len(chunk)
    text = chunk.decode("utf-8", "replace")
    lines = text.split("\n")
    if text.endswith("\n"):
        lines.pop()
    else:
        partial = lines.pop() if lines else ""
        consumed -= len(partial.encode("utf-8", "replace"))

    state["files"][name] = {"offset": start + consumed, "ino": stat.st_ino}
    return [line for line in lines if line.strip()]


def add(state, at, source, sig):
    if at is None:
        return
    key = str(minute_of(at))
    bucket = state["buckets"].setdefault(key, {"n": {}, "sig": {}})
    bucket["n"][source] = bucket["n"].get(source, 0) + 1
    if sig:
        sigs = bucket["sig"].setdefault(source, {})
        if len(sigs) < MAX_SIGS or sig in sigs:
            sigs[sig] = sigs.get(sig, 0) + 1


def scan_access(state):
    for line in read_new(state, "access", SOURCES["access"]):
        match = ACCESS_LINE.match(line)
        if not match:
            continue
        at = parse_access_time(match.group(2))
        status = int(match.group(4))
        # A request line of "-" or a single word is a client that sent nonsense.
        # Grouping every one of those under "? ?" reads like a parser bug.
        request = match.group(3).split()
        if len(request) < 2:
            add(state, at, "nginx5xx" if status >= 500 else "nginx4xx", f"{status} (malformed request)")
            continue
        path = request[1].split("?")[0]
        method = request[0]
        # The status is the one number in the line worth keeping whole, so it is
        # put back after normalising rather than passed through it.
        if status >= 500:
            add(state, at, "nginx5xx", f"{status} {method} {signature(path)}")
        elif status == 429:
            add(state, at, "rateLimit", f"429 {method} {signature(path)}")
        elif status >= 400:
            add(state, at, "nginx4xx", f"{status} {method} {signature(path)}")


def scan_nginx_error(state):
    for line in read_new(state, "nginx_error", SOURCES["nginx_error"]):
        match = NGINX_ERROR_LINE.match(line)
        if not match or match.group(2) not in ("error", "crit", "alert", "emerg"):
            continue
        message = match.group(3).split(", client:")[0]
        # A request turned away by limit_req is nginx working, not failing.
        source = "rateLimit" if "limiting requests" in message else "nginxError"
        add(state, parse_nginx_time(match.group(1)), source, signature(message))


def scan_csp(state):
    for line in read_new(state, "csp", SOURCES["csp"]):
        try:
            entry = json.loads(line)
            report = json.loads(entry.get("report") or "{}")
        except ValueError:
            continue
        body = report.get("body") or report.get("csp-report") or {}
        directive = body.get("effectiveDirective") or body.get("violated-directive") or "?"
        blocked = body.get("blockedURL") or body.get("blocked-uri") or "?"
        add(state, parse_iso(entry.get("t")), "csp", signature(f"{directive} blocked {blocked}"))


def scan_shield(state):
    for line in read_new(state, "shield", SOURCES["shield"]):
        try:
            flag = json.loads(line)
        except ValueError:
            continue
        add(
            state,
            parse_iso(flag.get("time")),
            "shield",
            signature(f"{flag.get('severity', '?')} {flag.get('id', '?')} {flag.get('method', '')} {flag.get('path', '')}"),
        )


def scan_api(state):
    for line in read_new(state, "api", SOURCES["api"]):
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if int(event.get("status") or 0) < 400:
            continue
        rest = signature("{} {}".format(event.get("kind", "?"), event.get("path", "?")))
        add(state, parse_iso(event.get("at")), "api", "{} {}".format(event.get("status"), rest))


def journal(state, dry_run=False):
    """The services' own error lines, read forward from the last cursor."""
    command = ["journalctl", "--no-pager", "-o", "json", "--output-fields=MESSAGE,_SYSTEMD_UNIT,__REALTIME_TIMESTAMP"]
    for unit in UNITS:
        command += ["-u", unit]
    if state.get("cursor"):
        command += ["--after-cursor", state["cursor"]]
    else:
        command += ["--since", "-10min"]
    try:
        done = subprocess.run(command, capture_output=True, text=True, timeout=60, check=False)
    except (OSError, subprocess.SubprocessError):
        return
    if done.returncode != 0:
        return

    cursor = state.get("cursor")
    for line in done.stdout.splitlines():
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        cursor = entry.get("__CURSOR") or cursor
        message = entry.get("MESSAGE")
        if isinstance(message, list):
            message = "".join(chr(c) for c in message if isinstance(c, int))
        message = str(message or "")
        # A stack frame is part of the error above it, not another error.
        if not message.strip() or CONTINUATION.match(message) or not APP_ERROR.search(message):
            continue
        stamp = entry.get("__REALTIME_TIMESTAMP")
        at = int(int(stamp) / 1_000_000) if str(stamp).isdigit() else now()
        unit = str(entry.get("_SYSTEMD_UNIT") or "?").replace(".service", "")
        add(state, at, "app", signature(f"{unit}: {message}"))

    # The cursor is only moved once the batch is counted, so a crash re-reads
    # rather than skips.
    if cursor:
        state["cursor"] = cursor


def window(state, start, end):
    """Counts and top signatures for [start, end), both epoch seconds."""
    counts = {source: 0 for source in ALL_SOURCES}
    sigs = {source: {} for source in ALL_SOURCES}
    for key, bucket in state["buckets"].items():
        at = int(key) * 60
        if at < minute_of(start) * 60 or at >= end:
            continue
        for source, value in (bucket.get("n") or {}).items():
            if source in counts:
                counts[source] += value
        for source, held in (bucket.get("sig") or {}).items():
            if source not in sigs:
                continue
            for sig, value in held.items():
                sigs[source][sig] = sigs[source].get(sig, 0) + value
    top = {
        source: sorted(held.items(), key=lambda row: (-row[1], row[0]))[:TOP_SIGS]
        for source, held in sigs.items()
        if held
    }
    return {"counts": counts, "top": top, "errors": sum(counts[s] for s in ERROR_SOURCES)}


def prune(state):
    floor = minute_of(now()) - BUCKET_TTL_MINUTES
    for key in [k for k in state["buckets"] if int(k) < floor]:
        del state["buckets"][key]


def token():
    try:
        with open(BOT_ENV, "r", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("DEPLOYHOOK_TOKEN="):
                    return line.split("=", 1)[1].strip()
    except OSError:
        pass
    return ""


def post(state, payload, dry_run=False):
    """Hand one card to the bot. A card that cannot be delivered is kept."""
    if dry_run:
        print(json.dumps(payload, indent=2))
        return True
    secret = token()
    if not secret:
        print("errorwatch: no DEPLOYHOOK_TOKEN in the bot's .env — nothing was sent", file=sys.stderr)
        return False
    # allow_nan=False so a stray infinity fails here, loudly, rather than going
    # out as a body the bot cannot parse.
    try:
        body = json.dumps(payload, allow_nan=False).encode("utf-8")
    except ValueError as err:
        print(f"errorwatch: refusing to send an unserialisable card ({err})", file=sys.stderr)
        return True
    request = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {secret}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, OSError) as err:
        print(f"errorwatch: could not reach the bot ({err}) — held for the next tick", file=sys.stderr)
        return False


def send(state, payload, dry_run=False):
    if post(state, payload, dry_run):
        return True
    outbox = state["outbox"]
    outbox.append(payload)
    del outbox[:-OUTBOX_MAX]
    return False


def drain(state, dry_run=False):
    held, state["outbox"] = state["outbox"], []
    for payload in held:
        if not post(state, payload, dry_run):
            state["outbox"].append(payload)


def read_deploys(state):
    """New deploy reports from the autodeploy timer."""
    fresh = []
    for line in read_new(state, "deploys", DEPLOY_LOG):
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        at = int(entry.get("at") or 0) or now()
        entry["at"] = at
        entry["due"] = at + GRACE_SECONDS + WINDOW_MINUTES * 60
        fresh.append(entry)
    state["pending"].extend(fresh)
    return fresh


def change(before, after):
    """Percentage change, and None where there is nothing to compare against."""
    if before == 0:
        return None if after == 0 else float("inf")
    return (after - before) / before * 100.0


def release_card(deploy, before, after):
    rows = []
    for source in ALL_SOURCES:
        was = before["counts"][source]
        is_now = after["counts"][source]
        if not was and not is_now:
            continue
        pct = change(was, is_now)
        # An increase from nothing has no percentage, and json.dumps would spell
        # the infinity `Infinity`, which is not JSON and which JSON.parse at the
        # other end refuses. The card says "new" from before and after instead.
        rows.append({"source": source, "label": LABELS[source], "before": was, "after": is_now, "pct": None if pct is None or pct == float("inf") else round(pct, 1)})
    worse = [row for row in rows if row["source"] in ERROR_SOURCES and row["after"] > row["before"]]
    verdict = "worse" if worse else ("clean" if after["errors"] == 0 else "steady")
    return {
        "kind": "release",
        "verdict": verdict,
        "deploy": deploy,
        "windowMinutes": WINDOW_MINUTES,
        "graceSeconds": GRACE_SECONDS,
        "before": before["counts"],
        "after": after["counts"],
        "errorsBefore": before["errors"],
        "errorsAfter": after["errors"],
        "rows": rows,
        "top": after["top"],
    }


def settle(state, dry_run=False):
    """Report every deploy whose after-window has finished."""
    kept = []
    for deploy in state["pending"]:
        if deploy.get("due", 0) > now():
            kept.append(deploy)
            continue
        at = deploy["at"]
        before = window(state, at - WINDOW_MINUTES * 60, at)
        after = window(state, at + GRACE_SECONDS, at + GRACE_SECONDS + WINDOW_MINUTES * 60)
        send(state, release_card(deploy, before, after), dry_run)
    state["pending"] = kept


def settling(state):
    return any(deploy.get("due", 0) > now() for deploy in state["pending"])


def check_spike(state, dry_run=False):
    """A jump with no deploy behind it. A settling deploy owns its own window."""
    if settling(state) or now() - int(state.get("lastSpike") or 0) < SPIKE_QUIET_SECONDS:
        return
    end = minute_of(now()) * 60
    recent = window(state, end - 5 * 60, end)
    if recent["errors"] < SPIKE_FLOOR:
        return
    baseline = window(state, end - 65 * 60, end - 5 * 60)
    per_five = baseline["errors"] / 12.0
    if per_five and recent["errors"] < per_five * SPIKE_MULTIPLE:
        return
    state["lastSpike"] = now()
    send(
        state,
        {
            "kind": "spike",
            "minutes": 5,
            "errors": recent["errors"],
            "baseline": round(per_five, 2),
            "counts": recent["counts"],
            "top": recent["top"],
        },
        dry_run,
    )


def maybe_digest(state, force=False, dry_run=False):
    last = int(state.get("lastDigest") or 0)
    if not force and now() - last < DIGEST_SECONDS:
        return
    hours = DIGEST_SECONDS // 3600
    period = window(state, now() - DIGEST_SECONDS, now())
    state["lastDigest"] = now()
    # Two summaries, because they are read by different eyes: what broke goes to
    # the development channel, what the internet did to the website goes to the
    # website one.
    ours = {source: period["counts"][source] for source in ERROR_SOURCES}
    theirs = {source: period["counts"][source] for source in WEB_SOURCES}
    send(state, {"kind": "digest", "hours": hours, "errors": period["errors"], "counts": ours,
                 "top": {k: v for k, v in period["top"].items() if k in ERROR_SOURCES}}, dry_run)
    send(state, {"kind": "webdigest", "hours": hours, "total": sum(theirs.values()), "counts": theirs,
                 "top": {k: v for k, v in period["top"].items() if k in WEB_SOURCES}}, dry_run)


def tick(state, dry_run=False, force_digest=False):
    scan_access(state)
    scan_nginx_error(state)
    scan_csp(state)
    scan_shield(state)
    scan_api(state)
    journal(state, dry_run)
    read_deploys(state)
    drain(state, dry_run)
    settle(state, dry_run)
    check_spike(state, dry_run)
    maybe_digest(state, force_digest, dry_run)
    prune(state)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Count errors and report what a deploy did to them.")
    parser.add_argument("--once", action="store_true", help="run a single tick (the default)")
    parser.add_argument("--dry-run", action="store_true", help="print the cards instead of sending them")
    parser.add_argument("--digest", action="store_true", help="send the period summary now")
    parser.add_argument("--state", default=STATE_DIR)
    args = parser.parse_args(argv)

    path = os.path.join(args.state, "state.json")
    fresh = not os.path.exists(path)
    state = load_state(path)
    # A first run has counted nothing yet, so the period summary would be a
    # summary of no period. Start the clock instead of reporting an empty one.
    if fresh and not state["lastDigest"]:
        state["lastDigest"] = now()
    tick(state, dry_run=args.dry_run, force_digest=args.digest)
    if not args.dry_run:
        save_state(path, state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
