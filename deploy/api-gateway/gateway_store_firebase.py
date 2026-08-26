#!/usr/bin/env python3

import copy
import hashlib
import hmac
import os
import threading
import time
from datetime import datetime, timezone

TOKENS_COLLECTION = os.environ.get("FIRESTORE_TOKENS", "admin_tokens")
USAGE_COLLECTION = os.environ.get("FIRESTORE_API_USAGE", "api_usage")

DB_FACTORY = None
_shared = {}


def get_db():
    if DB_FACTORY is not None:
        return DB_FACTORY()
    if "db" not in _shared:
        _shared["db"] = _firestore_db()
    return _shared["db"]


def _firestore_db():
    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
        key = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        project = os.environ.get("FIREBASE_PROJECT_ID", "").strip() or None
        cred = credentials.Certificate(key) if key else credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, {"projectId": project} if project else None)
    return FirestoreDb(firestore.client())


class FirestoreDb:

    def __init__(self, client):
        self.client = client

    def list(self, collection):
        out = []
        for snap in self.client.collection(collection).stream():
            data = snap.to_dict()
            if isinstance(data, dict):
                out.append((snap.id, data))
        return out

    def set(self, collection, doc_id, data):
        self.client.collection(collection).document(doc_id).set(data)


def stamp():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def hash_token(key):
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


class FirestoreTokenTable:

    def __init__(self, refresh_seconds=60):
        self.db = get_db()
        self.refresh_seconds = refresh_seconds
        self.lock = threading.Lock()
        self.by_hash = {}
        self.checked = None
        self.reload(force=True)

    def reload(self, force=False):
        now = time.monotonic()
        if not force and self.checked is not None and (now - self.checked) < self.refresh_seconds:
            return
        try:
            rows = self.db.list(TOKENS_COLLECTION)
        except Exception:
            with self.lock:
                self.checked = now
            return
        table = {}
        for identifier, record in rows:
            digest = record.get("hash")
            if not isinstance(digest, str) or not digest:
                continue
            rate = record.get("rate")
            table[digest] = {
                "id": identifier,
                "name": record.get("name"),
                "scopes": record.get("scopes") or [],
                "revoked": bool(record.get("revoked")),
                "expires": record.get("expires"),
                "environment": record.get("environment") or "live",
                "rate": int(rate) if isinstance(rate, int) and rate > 0 else None,
            }
        with self.lock:
            self.by_hash = table
            self.checked = now

    def match(self, key):
        self.reload()
        digest = hash_token(key)
        with self.lock:
            for known, record in self.by_hash.items():
                if hmac.compare_digest(known, digest):
                    return dict(record)
        return None


class FirestoreUsage:

    def __init__(self, group=None):
        self.db = get_db()
        self.lock = threading.Lock()
        self.counters = {}
        self.dirty = False
        self._load()

    def _load(self):
        try:
            rows = self.db.list(USAGE_COLLECTION)
        except Exception:
            return
        for identifier, data in rows:
            if not isinstance(data, dict):
                continue
            self.counters[identifier] = {
                "requests": int(data.get("requests") or 0),
                "rejected": int(data.get("rejected") or 0),
                "lastUsed": data.get("lastUsed"),
                "paths": data.get("paths") if isinstance(data.get("paths"), dict) else {},
            }

    def _entry(self, identifier):
        entry = self.counters.get(identifier)
        if not isinstance(entry, dict):
            entry = {"requests": 0, "rejected": 0, "lastUsed": None, "paths": {}}
            self.counters[identifier] = entry
        entry.setdefault("paths", {})
        return entry

    def hit(self, identifier, path):
        with self.lock:
            entry = self._entry(identifier)
            entry["requests"] = int(entry.get("requests") or 0) + 1
            entry["lastUsed"] = stamp()
            paths = entry["paths"]
            paths[path] = int(paths.get(path) or 0) + 1
            self.dirty = True

    def reject(self, identifier):
        with self.lock:
            entry = self._entry(identifier)
            entry["rejected"] = int(entry.get("rejected") or 0) + 1
            self.dirty = True

    def flush(self, force=False):
        with self.lock:
            if not self.dirty and not force:
                return
            snapshot = {identifier: copy.deepcopy(entry) for identifier, entry in self.counters.items()}
            self.dirty = False

        generated = stamp()
        failed = False
        for identifier, entry in snapshot.items():
            entry["generated"] = generated
            try:
                self.db.set(USAGE_COLLECTION, identifier, entry)
            except Exception:
                failed = True
        if failed:
            with self.lock:
                self.dirty = True
