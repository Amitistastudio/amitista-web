#!/usr/bin/env python3

"""Give the stored `dev` role the developer.read permission.

Adding a permission to DEFAULT_ROLES only reaches a role that has never been
retuned in the panel: role_table() lets a stored override replace the shipped
default outright, so an owner who has edited `dev` once keeps the exact list
they saved and never picks up anything added later.

This walks the stored roles and adds developer.read to any that should have it,
leaving every other permission alone. It is idempotent — running it twice
changes nothing the second time — and it touches only roles that already exist.

    python3 migrate_add_developer_role.py --dry-run
    python3 migrate_add_developer_role.py
"""

import json
import os
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone

USERS_JSON = os.environ.get("ADMIN_USERS_JSON", "/var/lib/amitista/admin/session/users.json")

PERMISSION = "developer.read"

# Only roles named here are touched. Owner needs nothing: it resolves to every
# permission at read time, so it already has this one.
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

    # Stored per-user permission lists are a cache: _merge() re-resolves them
    # from the role table on every read, so the role is the only thing to fix.
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
