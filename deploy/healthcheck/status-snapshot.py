#!/usr/bin/env python3

import json
import os
import sys
import tempfile
from collections import OrderedDict
from datetime import datetime, timedelta, timezone

WINDOW_DAYS = 90

INTERVAL_SECONDS = 300
EXPECTED_PER_DAY = 86400 // INTERVAL_SECONDS

PARTIAL_THRESHOLD = 0.5

CHECKS = [
    {
        "id": "site",
        "name": "Website",
        "detail": "amitista.com answers and returns the home page.",
    },
    {
        "id": "styles",
        "name": "Home page styling",
        "detail": (
            "The stylesheet the home page inlines is the one its security policy "
            "authorises. When these disagree the page loads as unstyled text and "
            "nothing else reports it."
        ),
    },
    {
        "id": "contact",
        "name": "Enquiry delivery",
        "detail": (
            "The service behind the contact and estimate forms is running and has "
            "somewhere to deliver to. When it is down the forms still look like "
            "they worked."
        ),
    },
    {
        "id": "routes",
        "name": "Page routing",
        "detail": "Real pages serve their own content, and unknown addresses return a 404.",
    },
    {
        "id": "tls",
        "name": "Certificate",
        "detail": (
            "The HTTPS certificate has more than 14 days left before it expires, and "
            "the chain it is served on is the one every browser trusts. A chain that "
            "looks fine from the server can still fail for a share of visitors."
        ),
    },
    {
        "id": "disk",
        "name": "Disk",
        "detail": "The server has room left. A full disk takes the site, the forms and the backups together.",
    },
]

def parse_history(path, cutoff):
    records = []
    if not os.path.exists(path):
        return records

    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                stamp = datetime.fromisoformat(record["t"].replace("Z", "+00:00"))
            except (ValueError, KeyError, TypeError):
                continue
            if stamp >= cutoff:
                records.append((stamp, record))

    records.sort(key=lambda pair: pair[0])
    return records

def summarise(records, check_id, today):
    by_day = OrderedDict()
    for offset in range(WINDOW_DAYS - 1, -1, -1):
        day = today - timedelta(days=offset)
        by_day[day.isoformat()] = {"d": day.isoformat(), "u": 0, "t": 0}

    for stamp, record in records:
        state = record.get("c", {}).get(check_id)
        if state is None:
            continue
        key = stamp.date().isoformat()
        if key not in by_day:
            continue
        by_day[key]["t"] += 1
        if state == "up":
            by_day[key]["u"] += 1

    return list(by_day.values())

def uptime(days):
    total = sum(day["t"] for day in days)
    if total == 0:
        return None
    up = sum(day["u"] for day in days)
    if up == total:
        return 100.0
    return min(99.99, round(up / total * 100, 2))

def day_state(day):
    if day["t"] == 0:
        return "none"
    if day["t"] < EXPECTED_PER_DAY * PARTIAL_THRESHOLD:
        return "partial"
    return "up" if day["u"] == day["t"] else "down"

def main():
    history_path = sys.argv[1] if len(sys.argv) > 1 else "/var/lib/amitista/status/history.jsonl"
    out_path = sys.argv[2] if len(sys.argv) > 2 else "/var/www/amitista.com/shared/status.json"

    now = datetime.now(timezone.utc)
    today = now.date()
    cutoff = now - timedelta(days=WINDOW_DAYS)

    records = parse_history(history_path, cutoff)
    latest = records[-1] if records else None

    checks = []
    for spec in CHECKS:
        days = summarise(records, spec["id"], today)
        current = None
        if latest:
            current = latest[1].get("c", {}).get(spec["id"])
        checks.append(
            {
                "id": spec["id"],
                "name": spec["name"],
                "detail": spec["detail"],
                "status": current or "unknown",
                "uptime": uptime(days),
                "samples": sum(day["t"] for day in days),
                "days": [{"d": d["d"], "s": day_state(d), "u": d["u"], "t": d["t"]} for d in days],
            }
        )

    known = [c["status"] for c in checks if c["status"] != "unknown"]
    if not known:
        overall = "unknown"
    elif all(state == "up" for state in known):
        overall = "operational"
    elif all(state == "down" for state in known):
        overall = "down"
    else:
        overall = "degraded"

    snapshot = {
        "generated": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "checked": latest[1]["t"] if latest else None,
        "intervalSeconds": INTERVAL_SECONDS,
        "windowDays": WINDOW_DAYS,
        "overall": overall,
        "checks": checks,
    }

    out_dir = os.path.dirname(out_path)
    os.makedirs(out_dir, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=out_dir, prefix=".status-", suffix=".tmp", delete=False
    )
    try:
        json.dump(snapshot, handle, separators=(",", ":"))
        handle.flush()
        os.fsync(handle.fileno())
        handle.close()
        os.chmod(handle.name, 0o644)
        os.replace(handle.name, out_path)
    except BaseException:
        os.unlink(handle.name)
        raise

    if records:
        tmp_history = f"{history_path}.tmp"
        with open(tmp_history, "w", encoding="utf-8") as handle:
            for _, record in records:
                handle.write(json.dumps(record, separators=(",", ":")) + "\n")
        os.replace(tmp_history, history_path)

if __name__ == "__main__":
    main()
