#!/usr/bin/env python3

import json
import os
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from admin_store import ROLES

USERS_JSON = os.environ.get("ADMIN_USERS_JSON", "/var/lib/amitista/admin/session/users.json")
ENV_FILE = os.environ.get("ADMIN_ENV_FILE", "/etc/amitista/admin.env")


def now_iso():
    return datetime.fromtimestamp(time.time(), timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_env(path):
    values = {}
    try:
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip()
    except FileNotFoundError:
        return {}
    except OSError as failure:
        print("Could not read %s: %s" % (path, failure), file=sys.stderr)
        sys.exit(1)
    return values


def read_users(path):
    try:
        with open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        return {"version": 1, "users": {}}
    except (OSError, ValueError) as failure:
        print("Could not read %s: %s" % (path, failure), file=sys.stderr)
        sys.exit(1)
    if not isinstance(payload, dict):
        print("%s does not hold an object." % path, file=sys.stderr)
        sys.exit(1)
    return payload


def write_users(path, payload):
    directory = os.path.dirname(path)
    try:
        stat = os.stat(path)
        mode, uid, gid = stat.st_mode & 0o777, stat.st_uid, stat.st_gid
    except FileNotFoundError:
        mode, uid, gid = 0o600, -1, -1

    handle = tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=directory, prefix=".store-", suffix=".tmp", delete=False
    )
    try:
        json.dump(payload, handle, separators=(",", ":"), sort_keys=True)
        handle.flush()
        os.fsync(handle.fileno())
        handle.close()
        os.chmod(handle.name, mode)
        if uid != -1:
            os.chown(handle.name, uid, gid)
        os.replace(handle.name, path)
    except BaseException:
        try:
            os.unlink(handle.name)
        except OSError:
            pass
        raise


def owner_in(records):
    for name, record in sorted(records.items()):
        if isinstance(record, dict) and record.get("role") == "owner":
            return name
    return None


def main():
    dry_run = "--dry-run" in sys.argv

    payload = read_users(USERS_JSON)
    records = payload.get("users")
    if not isinstance(records, dict):
        records = {}
        payload["users"] = records

    existing = owner_in(records)
    if existing is not None:
        print("%s is already an owner record in the store. Nothing to do." % existing)
        return 0

    meta = payload.get("owner")
    meta = meta if isinstance(meta, dict) else {}

    env = read_env(ENV_FILE)
    name = env.get("ADMIN_USER", "").strip()
    secret = env.get("ADMIN_PASSWORD", "").strip()

    if not name or not secret:
        print(
            "ADMIN_USER and ADMIN_PASSWORD are not both set in %s, so there is no owner to move.\n"
            "If this panel has never been set up, run admin_api.py --credentials instead." % ENV_FILE,
            file=sys.stderr,
        )
        return 1

    if len(secret.split("$")) != 6 or not secret.startswith("scrypt$"):
        print("ADMIN_PASSWORD in %s is not a scrypt hash." % ENV_FILE, file=sys.stderr)
        return 1

    if name in records:
        print(
            "There is already an account called %r that is not the owner. Rename or remove it first." % name,
            file=sys.stderr,
        )
        return 1

    record = {
        "password": secret,
        "role": "owner",
        "permissions": sorted(ROLES["owner"]),
        "disabled": False,
        "tokenVersion": int(meta.get("tokenVersion") or 1),
        "created": meta.get("created") or now_iso(),
        "createdBy": None,
        "lastSignIn": meta.get("lastSignIn"),
        "lastIp": meta.get("lastIp"),
        "mustChange": False,
        "note": "",
        "expires": None,
    }
    if isinstance(meta.get("totp"), dict):
        record["totp"] = meta["totp"]

    records[name] = record
    payload.pop("owner", None)

    if dry_run:
        shown = dict(record)
        shown["password"] = "<scrypt hash from %s>" % ENV_FILE
        if "totp" in shown:
            shown["totp"] = "<carried over: %s>" % ", ".join(sorted(shown["totp"]))
        print("Would write this record as %r in %s:" % (name, USERS_JSON))
        print(json.dumps(shown, indent=2, sort_keys=True))
        print()
        print("Would drop the top-level 'owner' key.")
        return 0

    backup = "%s.bak-owner-%s" % (USERS_JSON, datetime.now().strftime("%Y%m%d-%H%M%S"))
    try:
        shutil.copy2(USERS_JSON, backup)
        print("Backed up %s to %s" % (USERS_JSON, backup))
    except FileNotFoundError:
        pass
    except OSError as failure:
        print("Could not back up %s: %s" % (USERS_JSON, failure), file=sys.stderr)
        return 1

    write_users(USERS_JSON, payload)
    print("Moved the owner %r into %s as an ordinary record." % (name, USERS_JSON))
    print("Their password, two-step setup and token version came across, so open sessions survive.")
    print()
    print("Now deploy the new admin_api.py and admin_store.py, restart the service, and check you")
    print("can still sign in. Once that works, delete ADMIN_USER and ADMIN_PASSWORD from %s." % ENV_FILE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
