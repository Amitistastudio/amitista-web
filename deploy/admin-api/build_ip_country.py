#!/usr/bin/env python3
import gzip
import ipaddress
import json
import os
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone

SOURCES = {
    "afrinic": "https://ftp.afrinic.net/pub/stats/afrinic/delegated-afrinic-extended-latest",
    "apnic": "https://ftp.apnic.net/pub/stats/apnic/delegated-apnic-extended-latest",
    "arin": "https://ftp.arin.net/pub/stats/arin/delegated-arin-extended-latest",
    "lacnic": "https://ftp.lacnic.net/pub/stats/lacnic/delegated-lacnic-extended-latest",
    "ripencc": "https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-extended-latest",
}

OUT_PATH = os.environ.get("ADMIN_GEO", "/var/lib/amitista/admin/ipcountry.json")
TIMEOUT = 120
ATTEMPTS = 3
KEEP_STATUS = ("allocated", "assigned")
V6_SHIFT = 64

def fetch(url):
    last = None
    for attempt in range(ATTEMPTS):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "amitista-admin/1.0"})
            with urllib.request.urlopen(request, timeout=TIMEOUT) as handle:
                raw = handle.read()
            if raw[:2] == b"\x1f\x8b":
                raw = gzip.decompress(raw)
            return raw.decode("utf-8", "replace")
        except (urllib.error.URLError, OSError, ValueError) as failure:
            last = failure
    raise RuntimeError("could not fetch %s (%s)" % (url, last))

def parse(text, v4, v6):
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("|")
        if len(parts) < 7:
            continue
        country, kind, start, value, status = parts[1], parts[2], parts[3], parts[4], parts[6]
        if status not in KEEP_STATUS:
            continue
        country = country.strip().upper()
        if len(country) != 2 or not country.isalpha():
            continue

        if kind == "ipv4":
            try:
                first = int(ipaddress.IPv4Address(start))
                count = int(value)
            except ValueError:
                continue
            if count <= 0:
                continue
            v4.append((first, first + count - 1, country))
        elif kind == "ipv6":
            try:
                network = ipaddress.IPv6Network("%s/%s" % (start, value), strict=False)
            except ValueError:
                continue
            first = int(network.network_address) >> V6_SHIFT
            last = int(network.broadcast_address) >> V6_SHIFT
            v6.append((first, last, country))

def compress(ranges):
    ranges.sort(key=lambda item: (item[0], item[1]))
    starts = []
    ends = []
    codes = []
    for first, last, country in ranges:
        if starts and first <= ends[-1]:
            if last <= ends[-1]:
                continue
            first = ends[-1] + 1
        if starts and country == codes[-1] and first == ends[-1] + 1:
            ends[-1] = last
            continue
        starts.append(first)
        ends.append(last)
        codes.append(country)
    return {"starts": starts, "ends": ends, "cc": codes}

def write_atomic(path, payload, group):
    out_dir = os.path.dirname(path) or "."
    os.makedirs(out_dir, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=out_dir, prefix=".ipcountry-", suffix=".tmp", delete=False
    )
    try:
        json.dump(payload, handle, separators=(",", ":"))
        handle.flush()
        os.fsync(handle.fileno())
        handle.close()
        os.chmod(handle.name, 0o644)
        if group:
            try:
                shutil.chown(handle.name, group=group)
            except (LookupError, PermissionError, OSError):
                pass
        os.replace(handle.name, path)
    except BaseException:
        try:
            os.unlink(handle.name)
        except OSError:
            pass
        raise

def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else OUT_PATH
    group = os.environ.get("ADMIN_GROUP", "amitista-admin")

    v4 = []
    v6 = []
    used = []
    failed = []

    for name, url in sorted(SOURCES.items()):
        try:
            text = fetch(url)
        except RuntimeError as failure:
            failed.append(name)
            print("  %-8s failed: %s" % (name, failure), file=sys.stderr)
            continue
        before = (len(v4), len(v6))
        parse(text, v4, v6)
        used.append(name)
        print("  %-8s %d v4, %d v6" % (name, len(v4) - before[0], len(v6) - before[1]))

    if len(used) < 3:
        raise SystemExit("only %d of %d registries answered — keeping the existing table" % (len(used), len(SOURCES)))

    payload = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "registries": used,
        "missing": failed,
        "v6Shift": V6_SHIFT,
        "v4": compress(v4),
        "v6": compress(v6),
    }

    write_atomic(out_path, payload, group)
    print(
        "wrote %s — %d v4 ranges, %d v6 ranges%s"
        % (
            out_path,
            len(payload["v4"]["starts"]),
            len(payload["v6"]["starts"]),
            "" if not failed else " (without %s)" % ", ".join(failed),
        )
    )

if __name__ == "__main__":
    main()
