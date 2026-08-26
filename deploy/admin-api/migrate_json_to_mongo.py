#!/usr/bin/env python3

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from admin_store import doc_name

STATE_DIR = os.environ.get("ADMIN_STATE", "/var/lib/amitista/admin/session")
TOKENS_PATH = os.environ.get("ADMIN_TOKENS", "/var/lib/amitista/tokens/tokens.json")

DOCS = [
    os.path.join(STATE_DIR, "users.json"),
    TOKENS_PATH,
    os.path.join(STATE_DIR, "brands.json"),
    os.path.join(STATE_DIR, "findings.json"),
    os.path.join(STATE_DIR, "maintenance.json"),
    os.path.join(STATE_DIR, "firewall.json"),
]

LOGS = [
    os.path.join(STATE_DIR, "audit.jsonl"),
    os.path.join(STATE_DIR, "firewall-events.jsonl"),
]

LEGACY = ("admin_users", "admin_tokens", "admin_audit")


def read_doc(path):
    try:
        with open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        return None
    if not isinstance(payload, dict):
        raise SystemExit("%s is not a JSON object" % path)
    return payload


def read_log(path):
    entries = []
    try:
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                if isinstance(entry, dict):
                    entries.append(entry)
    except FileNotFoundError:
        return None
    return entries


def main():
    commit = "--commit" in sys.argv
    os.environ["ADMIN_BACKEND"] = "mongo"

    import mongo_store

    db = mongo_store.get_db()
    docs = db[mongo_store.DOCS_COLLECTION]

    plan = []
    for path in DOCS:
        payload = read_doc(path)
        if payload is None:
            plan.append(("skip", "doc", path, doc_name(path), 0))
            continue
        keys = sum(len(value) for value in payload.values() if isinstance(value, dict))
        plan.append(("load", "doc", path, doc_name(path), keys))
    for path in LOGS:
        entries = read_log(path)
        if entries is None:
            plan.append(("skip", "log", path, doc_name(path), 0))
            continue
        plan.append(("load", "log", path, doc_name(path), len(entries)))

    legacy_found = [name for name in LEGACY if name in db.list_collection_names()]

    print("target database: %s" % db.name)
    for action, kind, path, name, count in plan:
        print("  %-4s %-3s %-56s -> %-16s %5d" % (action, kind, path, name, count))
    if legacy_found:
        print("legacy seed collections to archive and drop: %s" % ", ".join(legacy_found))
    if not commit:
        print("\ndry run — nothing written. re-run with --commit")
        return 0

    if legacy_found:
        archive = os.environ.get(
            "ADMIN_MIGRATE_ARCHIVE", "/var/lib/amitista/admin/mongo-legacy-seed.json"
        )
        dump = {}
        for name in legacy_found:
            dump[name] = [
                {key: value for key, value in row.items() if key != "_id"}
                for row in db[name].find({})
            ]
        os.makedirs(os.path.dirname(archive), exist_ok=True)
        with open(archive, "w", encoding="utf-8") as handle:
            json.dump(dump, handle, default=str, sort_keys=True)
        os.chmod(archive, 0o600)
        print("archived legacy seed to %s" % archive)
        for name in legacy_found:
            db[name].drop()

    written = 0
    for action, kind, path, name, count in plan:
        if action != "load":
            continue
        if kind == "doc":
            payload = read_doc(path)
            docs.replace_one({"_id": name}, {"rev": 1, "data": payload}, upsert=True)
        else:
            entries = read_log(path)
            db[name].delete_many({})
            if entries:
                db[name].insert_many([dict(entry) for entry in entries])
        written += 1
    print("wrote %d stores" % written)

    failures = 0
    for action, kind, path, name, count in plan:
        if action != "load":
            continue
        if kind == "doc":
            stored = docs.find_one({"_id": name}) or {}
            data = stored.get("data") or {}
            actual = sum(len(value) for value in data.values() if isinstance(value, dict))
        else:
            actual = db[name].count_documents({})
        ok = actual == count
        failures += 0 if ok else 1
        print("  verify %-16s expected %5d  got %5d  %s" % (name, count, actual, "ok" if ok else "MISMATCH"))
    if failures:
        print("\n%d store(s) did not verify" % failures)
        return 1
    print("\nall stores verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
