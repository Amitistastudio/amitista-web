#!/usr/bin/env python3


import argparse
import base64
import json
import os
import re
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

FORMAT = 1
PACKAGE = "@amitista/shield"

KEY_PATH = os.environ.get("SHIELD_FEED_KEY", "/etc/amitista/shield-feed/feed-key.pem")
KEY_ID = os.environ.get("SHIELD_FEED_KEY_ID", "ams-b0d2c36155e7")
OVERLAY_PATH = os.environ.get("SHIELD_FEED_OVERLAY", "/etc/amitista/shield-feed/overlay.json")
BASE_PATH = os.environ.get(
    "SHIELD_FEED_BASE", "/var/www/amitista.com/current/api/v1/shield/rules.json"
)
STATE_DIR = os.environ.get("SHIELD_FEED_STATE", "/var/lib/amitista/shield-feed")
SERVICE_ACCOUNT = os.environ.get("SHIELD_FEED_ACCOUNT", "amitista-shield-feed")

TTL_DAYS = int(os.environ.get("SHIELD_FEED_TTL_DAYS", "30"))

MIN_PACKAGE = os.environ.get("SHIELD_FEED_MIN_PACKAGE", "0.5.0")

SEVERITIES = {"critical", "high", "medium", "low"}
SINK_KINDS = {"command", "argv", "path", "path2", "sql", "url"}

PATTERN_LISTS_WITH_IDENTITY = ("secretPatterns", "responseValues", "pathPatterns")
PATTERN_LISTS_BARE = ("shellMeta", "sqlMeta", "urlSchemes", "internalHosts", "sensitivePaths")
STRING_LISTS = ("queryOperators", "pollutionKeys")
SINK_LISTS = ("sinks", "sqlDrivers")

MAX_SOURCE = 400
ALLOWED_FLAGS = re.compile(r"^[imsu]*$")
BUDGET_MS = 20
LENGTHS = (20, 28, 64, 200, 400, 800, 1400, 2000)
ALPHABETS = ("a", "0", " ", "/")


def fail(message):
    print(f"\033[31mshield-feed-sign: {message}\033[0m", file=sys.stderr)
    sys.exit(1)


def repeats_a_group(source):
    in_class = False
    i = 0
    while i < len(source):
        char = source[i]
        if char == "\\":
            i += 2
            continue
        if in_class:
            if char == "]":
                in_class = False
        elif char == "[":
            in_class = True
        elif char == ")" and i + 1 < len(source) and source[i + 1] in "*+{":
            return True
        i += 1
    return False


def too_slow(compiled):
    for length in LENGTHS:
        for alphabet in ALPHABETS:
            probe = alphabet * length + "!"
            started = time.perf_counter()
            try:
                compiled.search(probe)
            except Exception:
                return "threw while being probed"
            elapsed = (time.perf_counter() - started) * 1000
            if elapsed > BUDGET_MS:
                return f"took {elapsed:.1f}ms on a {length}-character probe, over the {BUDGET_MS}ms budget"
    return None


def check_pattern(source, flags, where):
    if not isinstance(source, str) or not source:
        fail(f"{where}: pattern is missing")
    if len(source) > MAX_SOURCE:
        fail(f"{where}: pattern is longer than the {MAX_SOURCE}-character limit")
    if not isinstance(flags, str) or not ALLOWED_FLAGS.match(flags):
        fail(f"{where}: flags {flags!r} are not among the ones the package accepts (imsu)")
    if repeats_a_group(source):
        fail(f"{where}: pattern repeats a group, which can backtrack exponentially — the package will refuse it")

    python_flags = 0
    if "i" in flags:
        python_flags |= re.IGNORECASE
    if "m" in flags:
        python_flags |= re.MULTILINE
    if "s" in flags:
        python_flags |= re.DOTALL
    try:
        compiled = re.compile(source, python_flags)
    except re.error as error:
        print(f"  note: {where}: not checkable here ({error}); the client will still gate it")
        return
    slow = too_slow(compiled)
    if slow:
        fail(f"{where}: {slow} — the package will refuse it")


def check_overlay(overlay):
    detections = overlay.get("detections") or {}
    if not isinstance(detections, dict):
        fail("detections must be an object")

    known = set(PATTERN_LISTS_WITH_IDENTITY + PATTERN_LISTS_BARE + STRING_LISTS + SINK_LISTS)
    for kind in detections:
        if kind not in known:
            fail(f"detections.{kind} is not a list the package reads — check the spelling against src/feed/registry.js")

    for kind in PATTERN_LISTS_WITH_IDENTITY:
        for index, entry in enumerate(detections.get(kind) or []):
            where = f"detections.{kind}[{index}]"
            if not isinstance(entry, dict):
                fail(f"{where}: must be an object")
            if not entry.get("id"):
                fail(f"{where}: needs an id")
            if entry.get("severity") not in SEVERITIES:
                fail(f"{where}: severity must be one of {sorted(SEVERITIES)}")
            check_pattern(entry.get("re"), entry.get("flags", ""), where)

    for kind in PATTERN_LISTS_BARE:
        for index, entry in enumerate(detections.get(kind) or []):
            where = f"detections.{kind}[{index}]"
            if not isinstance(entry, dict):
                fail(f"{where}: must be an object with a re")
            check_pattern(entry.get("re"), entry.get("flags", ""), where)

    for kind in STRING_LISTS:
        for index, entry in enumerate(detections.get(kind) or []):
            if not isinstance(entry, str) or not entry:
                fail(f"detections.{kind}[{index}]: must be a non-empty string")

    for kind in SINK_LISTS:
        for index, entry in enumerate(detections.get(kind) or []):
            where = f"detections.{kind}[{index}]"
            if not isinstance(entry, dict):
                fail(f"{where}: must be an object")
            if not entry.get("module") or not entry.get("method"):
                fail(f"{where}: needs a module and a method")
            if entry.get("kind") not in SINK_KINDS:
                fail(f"{where}: kind must be one of {sorted(SINK_KINDS)}")

    policy = overlay.get("policy") or {}
    if not isinstance(policy, dict):
        fail("policy must be an object")
    for index, rule in enumerate(policy.get("disabled") or []):
        if not isinstance(rule, str) or not rule:
            fail(f"policy.disabled[{index}]: must be a rule id")
    for rule, severity in (policy.get("severity") or {}).items():
        if severity not in SEVERITIES:
            fail(f"policy.severity[{rule}]: must be one of {sorted(SEVERITIES)}")


def read_json(path, what, required=True):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        if required:
            fail(f"no {what} at {path}")
        return {}
    except json.JSONDecodeError as error:
        fail(f"{what} at {path} is not valid JSON: {error}")


def next_serial(path, requested):
    current = 0
    try:
        with open(path, "r", encoding="utf-8") as handle:
            current = int(handle.read().strip() or 0)
    except (FileNotFoundError, ValueError):
        current = 0
    serial = requested if requested is not None else current + 1
    if serial <= current and requested is not None:
        fail(f"serial {serial} is not above the last published {current}; the fleet would refuse it")
    return max(serial, current + 1) if requested is None else serial


def write_atomic(path, data, mode=0o644, owner=None):
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    handle, temp = tempfile.mkstemp(dir=directory)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as out:
            out.write(data)
        os.chmod(temp, mode)
        if owner:
            try:
                import pwd

                entry = pwd.getpwnam(owner)
                os.chown(temp, entry.pw_uid, entry.pw_gid)
            except (KeyError, PermissionError):
                pass
        os.replace(temp, path)
    except Exception:
        if os.path.exists(temp):
            os.unlink(temp)
        raise


def main():
    parser = argparse.ArgumentParser(description="Compose and sign the shield rules feed")
    parser.add_argument("--serial", type=int, default=None, help="publish this serial instead of the next one")
    parser.add_argument("--ttl-days", type=int, default=TTL_DAYS)
    parser.add_argument("--dry-run", action="store_true", help="validate and print, write nothing")
    args = parser.parse_args()

    if os.geteuid() != 0 and not args.dry_run:
        fail("needs root — the signing key is root-only")

    base = read_json(BASE_PATH, "base rules catalogue")
    overlay = read_json(OVERLAY_PATH, "overlay", required=False) or {}

    print("Validating the overlay")
    check_overlay(overlay)

    ruleset = base.get("ruleset")
    if not isinstance(ruleset, int):
        fail(f"the base catalogue at {BASE_PATH} has no integer ruleset — has the site been built?")

    serial_path = os.path.join(STATE_DIR, "serial")
    serial = next_serial(serial_path, args.serial)

    issued = datetime.now(timezone.utc).replace(microsecond=0)
    expires = issued + timedelta(days=args.ttl_days)

    document = {
        "format": FORMAT,
        "package": PACKAGE,
        "ruleset": ruleset,
        "serial": serial,
        "issued": issued.isoformat().replace("+00:00", "Z"),
        "expires": expires.isoformat().replace("+00:00", "Z"),
        "minPackage": MIN_PACKAGE,
        "detections": overlay.get("detections") or {},
        "policy": overlay.get("policy") or {},
    }

    text = json.dumps(document, sort_keys=True, separators=(",", ":"))

    try:
        with open(KEY_PATH, "rb") as handle:
            private = serialization.load_pem_private_key(handle.read(), password=None)
    except FileNotFoundError:
        fail(f"no signing key at {KEY_PATH}")
    except PermissionError:
        fail(f"cannot read {KEY_PATH} — run as root")
    if not isinstance(private, Ed25519PrivateKey):
        fail(f"{KEY_PATH} is not an ed25519 key")

    signature = base64.b64encode(private.sign(text.encode("utf-8"))).decode("ascii")
    envelope = {
        "document": text,
        "signature": {"alg": "ed25519", "keyId": KEY_ID, "value": signature},
    }

    counts = {kind: len(value) for kind, value in (document["detections"] or {}).items() if value}
    print(f"  ruleset {ruleset}, serial {serial}, expires {document['expires']}")
    print(f"  detections: {counts or 'none'}")
    print(f"  policy: disabled={document['policy'].get('disabled') or []} "
          f"severity={document['policy'].get('severity') or {}}")

    if args.dry_run:
        print("\nDry run — nothing written.")
        return

    write_atomic(
        os.path.join(STATE_DIR, "feed.signed.json"),
        json.dumps(envelope, indent=2) + "\n",
        owner=SERVICE_ACCOUNT,
    )
    catalogue = dict(base)
    catalogue["serial"] = serial
    catalogue["issued"] = document["issued"]
    catalogue["expires"] = document["expires"]
    catalogue["minPackage"] = MIN_PACKAGE
    catalogue["published"] = document["detections"]
    catalogue["policy"] = document["policy"]
    write_atomic(
        os.path.join(STATE_DIR, "rules.json"),
        json.dumps(catalogue, indent=2) + "\n",
        owner=SERVICE_ACCOUNT,
    )
    write_atomic(serial_path, f"{serial}\n", mode=0o600)

    print(f"\nSigned with {KEY_ID}. Serial {serial} is live once the service reloads (it watches the file).")


if __name__ == "__main__":
    main()
