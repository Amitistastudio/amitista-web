#!/usr/bin/env python3

import json
import os
import shutil
import sys
import tempfile
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from admin_vault import Sealer, VaultError, build_vault

STORES = (
    ("users", os.environ.get("ADMIN_USERS_JSON", "/var/lib/amitista/admin/session/users.json")),
    ("tokens", os.environ.get("ADMIN_TOKENS", "/var/lib/amitista/tokens/tokens.json")),
)


def read_json(path):
    try:
        with open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as failure:
        print("Could not read %s: %s" % (path, failure), file=sys.stderr)
        sys.exit(1)
    if not isinstance(payload, dict):
        print("%s does not hold an object." % path, file=sys.stderr)
        sys.exit(1)
    return payload


def write_json(path, payload):
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


def backup(path):
    copy = "%s.bak-vault-%s" % (path, datetime.now().strftime("%Y%m%d-%H%M%S"))
    shutil.copy2(path, copy)
    os.chmod(copy, 0o600)
    print("  backed up to %s" % copy)
    return copy


def seal_store(sealer, purpose, path, dry_run):
    payload = read_json(path)
    if payload is None:
        print("  %s does not exist yet — nothing to seal" % path)
        return True
    if "sealed" in payload:
        print("  %s is already sealed" % path)
        return True

    envelope = sealer.seal(payload)
    opened = sealer.unseal(envelope)
    if opened != payload:
        print("  REFUSING: %s did not survive a seal/unseal round trip" % path, file=sys.stderr)
        return False

    print("  %s -> sealed (%d bytes of ciphertext)" % (path, len(envelope["sealed"])))
    if dry_run:
        return True
    backup(path)
    write_json(path, envelope)
    return True


def unseal_store(sealer, purpose, path, dry_run):
    payload = read_json(path)
    if payload is None:
        print("  %s does not exist" % path)
        return True
    if "sealed" not in payload:
        print("  %s is already in the clear" % path)
        return True

    opened = sealer.unseal(payload)
    print("  %s -> opened (%d entries)" % (path, len(opened.get("users", opened.get("tokens", {})))))
    if dry_run:
        return True
    backup(path)
    write_json(path, opened)
    return True


def main():
    dry_run = "--dry-run" in sys.argv
    reverse = "--unseal" in sys.argv

    try:
        vault = build_vault()
    except VaultError as failure:
        print(failure.message, file=sys.stderr)
        return 1

    if vault is None:
        print(
            "ADMIN_VAULT is not set to a vault, so there is nothing to seal to.\n"
            "Set ADMIN_VAULT=google, ADMIN_KMS_KEY, GCP_PROJECT_ID and "
            "GOOGLE_APPLICATION_CREDENTIALS first.",
            file=sys.stderr,
        )
        return 1

    action = "Opening" if reverse else "Sealing"
    print("%s the stores with %s%s" % (action, vault.name, " (dry run)" if dry_run else ""))

    ok = True
    for purpose, path in STORES:
        sealer = Sealer(vault, purpose)
        try:
            if reverse:
                ok = unseal_store(sealer, purpose, path, dry_run) and ok
            else:
                ok = seal_store(sealer, purpose, path, dry_run) and ok
        except VaultError as failure:
            print("  %s: %s" % (path, failure.message), file=sys.stderr)
            ok = False

    if not ok:
        return 1

    print()
    if reverse:
        print("The stores are readable again. Unset ADMIN_VAULT before restarting the service,")
        print("or it will refuse to read them.")
    elif not dry_run:
        print("Restart the service. It will now refuse to start against a store in the clear.")
        print("Keep the .bak-vault-* copies only until you have signed in, then shred them —")
        print("they are the plaintext you just moved into the vault.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
