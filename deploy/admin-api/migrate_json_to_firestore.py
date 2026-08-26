#!/usr/bin/env python3

import hashlib
import json
import os
import sys
from datetime import datetime

USERS_JSON = os.environ.get("ADMIN_USERS_JSON", "/var/lib/amitista/admin/session/users.json")
TOKENS_JSON = os.environ.get("ADMIN_TOKENS", "/var/lib/amitista/tokens/tokens.json")
AUDIT_JSONL = os.environ.get("ADMIN_AUDIT_JSONL", "/var/lib/amitista/admin/session/audit.jsonl")

USERS_COLLECTION = os.environ.get("FIRESTORE_USERS", "admin_users")
META_COLLECTION = os.environ.get("FIRESTORE_META", "admin_meta")
TOKENS_COLLECTION = os.environ.get("FIRESTORE_TOKENS", "admin_tokens")
AUDIT_COLLECTION = os.environ.get("FIRESTORE_AUDIT", "admin_audit")


def load(path, empty):
    try:
        with open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        return empty
    except ValueError:
        return empty
    return payload if isinstance(payload, dict) else empty


def to_ts(entry):
    stamp = entry.get("at")
    if not isinstance(stamp, str) or not stamp:
        return 0.0
    try:
        return datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def main():
    key = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    project = os.environ.get("FIREBASE_PROJECT_ID", "").strip() or None
    if not key:
        print("Set GOOGLE_APPLICATION_CREDENTIALS to the service-account key path first.")
        return 2

    import firebase_admin
    from firebase_admin import credentials, firestore

    firebase_admin.initialize_app(
        credentials.Certificate(key), {"projectId": project} if project else None
    )
    client = firestore.client()

    users = load(USERS_JSON, {})
    records = users.get("users") if isinstance(users.get("users"), dict) else {}
    if isinstance(users.get("owner"), dict) and users["owner"]:
        print(
            "%s still has a top-level 'owner' key. Run migrate_owner_to_store.py first so the\n"
            "owner is an ordinary record, then run this again." % USERS_JSON
        )
        return 2
    written = 0
    ufail = 0
    for name, record in records.items():
        if not isinstance(record, dict):
            continue
        try:
            client.collection(USERS_COLLECTION).document(name).set(record)
            written += 1
        except Exception as error:
            ufail += 1
            print("  skip user %r: %s" % (name, error))
    print("users migrated: %d (failed %d)" % (written, ufail))

    tokens = load(TOKENS_JSON, {})
    trecords = tokens.get("tokens") if isinstance(tokens.get("tokens"), dict) else {}
    tcount = 0
    tfail = 0
    for identifier, record in trecords.items():
        if not isinstance(record, dict):
            continue
        try:
            client.collection(TOKENS_COLLECTION).document(identifier).set(record)
            tcount += 1
        except Exception as error:
            tfail += 1
            print("  skip token %r: %s" % (identifier, error))
    print("tokens migrated: %d (failed %d)" % (tcount, tfail))

    acount = 0
    afail = 0
    try:
        with open(AUDIT_JSONL, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(entry, dict):
                    continue
                entry.setdefault("ts", to_ts(entry))
                doc_id = hashlib.sha256(line.encode("utf-8")).hexdigest()
                try:
                    client.collection(AUDIT_COLLECTION).document(doc_id).set(entry)
                    acount += 1
                except Exception as error:
                    afail += 1
                    print("  skip audit line: %s" % error)
    except FileNotFoundError:
        pass
    print("audit entries migrated: %d (failed %d)" % (acount, afail))
    return 0


if __name__ == "__main__":
    sys.exit(main())
