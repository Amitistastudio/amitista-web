#!/usr/bin/env python3

import json
import os
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone

USERS_JSON = os.environ.get("ADMIN_USERS_JSON", "/var/lib/amitista/admin/session/users.json")

PERMISSION = "developer.read"

WANTED = ("dev",)


def now_iso():
    return (
        datetime.fromtimestamp(time.time(), timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def main():
    dry = "--dry-run" in sys.argv[1:]

    try:
        with open(USERS_JSON, encoding="utf-8") as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        print("No store at %s — nothing to do." % USERS_JSON)
        return 0
    except (OSError, ValueError) as failure:
        print("Could not read %s: %s" % (USERS_JSON, failure), file=sys.stderr)
        return 1

    roles = payload.get("roles")
    if not isinstance(roles, dict):
        print("The store holds no role overrides — the shipped defaults already apply.")
        return 0

    changed = []
    for name in WANTED:
        granted = roles.get(name)
        if not isinstance(granted, list):
            print("· %s has no stored override — it takes the shipped default." % name)
            continue
        if PERMISSION in granted:
            print("· %s already holds %s." % (name, PERMISSION))
            continue
        roles[name] = sorted(set(granted) | {PERMISSION})
        changed.append(name)
        print("· %s gains %s." % (name, PERMISSION))

    if not changed:
        print("Nothing to change.")
        return 0

    if dry:
        print("\nDry run — %s not written." % USERS_JSON)
        return 0

    backup = "%s.bak-%s" % (USERS_JSON, time.strftime("%Y%m%d-%H%M%S"))
    shutil.copy2(USERS_JSON, backup)

    stat = os.stat(USERS_JSON)
    directory = os.path.dirname(USERS_JSON)
    handle, temporary = tempfile.mkstemp(dir=directory, prefix=".users-", suffix=".json")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as out:
            json.dump(payload, out, indent=1, sort_keys=True)
            out.write("\n")
        os.chmod(temporary, stat.st_mode & 0o777)
        try:
            os.chown(temporary, stat.st_uid, stat.st_gid)
        except PermissionError:
            pass
        os.replace(temporary, USERS_JSON)
    except BaseException:
        if os.path.exists(temporary):
            os.unlink(temporary)
        raise

    print("\nUpdated %s at %s" % (USERS_JSON, now_iso()))
    print("Backup written to %s" % backup)
    print("Restart the panel so it re-reads the roles: systemctl restart amitista-admin")
    return 0


if __name__ == "__main__":
    sys.exit(main())
