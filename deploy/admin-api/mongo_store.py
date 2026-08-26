#!/usr/bin/env python3

import copy
import json
import os
import threading

from admin_store import StoreError

URI_ENV = "ADMIN_MONGO_URI"
DB_ENV = "ADMIN_MONGO_DB"
CA_ENV = "ADMIN_MONGO_CA"

DOCS_COLLECTION = os.environ.get("MONGO_DOCS", "admin_docs")
SERVER_TIMEOUT_MS = 5000
MAX_WRITE_ATTEMPTS = 8
MISSING = -1

# A socket that never answers is worse than one that fails: without this a
# half-open connection parks a request thread until the OS gives up.
SOCKET_TIMEOUT_MS = 10000
# A ceiling on server-side execution. Without it one pathological query can hold
# a connection, and the pool, for as long as the server is willing to run it.
MAX_TIME_MS = 5000
# The admin API is a small threaded server; an unbounded pool lets a burst of
# requests open far more connections than mongod should have to carry.
MAX_POOL_SIZE = 20
# The JSON log keeps a bounded file on disk; the Mongo one needs the same
# ceiling applied to the read side.
MAX_TAIL = 1000

DB_FACTORY = None
_shared = {}
_connect_lock = threading.Lock()


def get_db():
    if DB_FACTORY is not None:
        return DB_FACTORY()
    with _connect_lock:
        if "db" not in _shared:
            _shared["db"] = _connect()
    return _shared["db"]


def reset():
    with _connect_lock:
        client = _shared.pop("client", None)
        _shared.pop("db", None)
    if client is not None:
        try:
            client.close()
        except Exception:
            pass


def _connect():
    uri = os.environ.get(URI_ENV, "").strip()
    name = os.environ.get(DB_ENV, "").strip()
    if not uri or not name:
        raise StoreError(
            "%s and %s must be set to use the mongo backend." % (URI_ENV, DB_ENV), 500
        )
    try:
        from pymongo import MongoClient
    except ImportError as exc:
        raise StoreError("The mongo backend needs pymongo installed.", 500) from exc
    options = {
        "appname": "amitista-admin",
        "serverSelectionTimeoutMS": SERVER_TIMEOUT_MS,
        "connectTimeoutMS": SERVER_TIMEOUT_MS,
        "socketTimeoutMS": SOCKET_TIMEOUT_MS,
        "maxPoolSize": MAX_POOL_SIZE,
        "tz_aware": False,
        # An account store must not silently lose a write that the caller was
        # told succeeded, so acknowledge from a majority and let retryable
        # writes cover a stepdown rather than surfacing it as a failed save.
        "retryWrites": True,
        "w": "majority",
    }
    # TLS is opt-in because the supported deployment is loopback-only, where it
    # buys nothing. The moment mongod moves to another host this must be set:
    # ADMIN_MONGO_TLS=1, with ADMIN_MONGO_CA pointing at the CA bundle.
    if _flag("ADMIN_MONGO_TLS"):
        options["tls"] = True
        authority = os.environ.get(CA_ENV, "").strip()
        if authority:
            options["tlsCAFile"] = authority
    client = MongoClient(uri, **options)
    _shared["client"] = client
    return client[name]


def _flag(name):
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def _key(name):
    # Every _id this module uses is an internal constant, but coercing to str
    # means a name that ever became caller-controlled still lands as a literal
    # rather than as a dict pymongo would read as query operators.
    return {"_id": str(name)}


def ping():
    try:
        get_db().command("ping")
    except StoreError:
        raise
    except Exception as exc:
        raise StoreError("The database is not reachable.", 503) from exc
    return True


def raw_doc(name):
    doc = get_db()[DOCS_COLLECTION].find_one(_key(name), max_time_ms=MAX_TIME_MS)
    if not isinstance(doc, dict):
        raise FileNotFoundError(name)
    data = doc.get("data")
    return _readable(data) if isinstance(data, dict) else {}


def _readable(value):
    if isinstance(value, dict):
        return {str(key): _readable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_readable(item) for item in value]
    return value


class MongoDoc:

    def __init__(self, name, empty, sealer=None):
        self.name = name
        self.empty = empty
        self.sealer = sealer
        self.lock = threading.RLock()

    def _collection(self):
        return get_db()[DOCS_COLLECTION]

    def _empty(self):
        return json.loads(json.dumps(self.empty))

    @staticmethod
    def blank(payload):
        return not any(payload.get(key) for key in ("users", "tokens"))

    def _open(self, stored):
        wrapped = "sealed" in stored
        if self.sealer is None:
            if wrapped:
                raise StoreError(
                    "%s is sealed but no vault is configured to open it." % self.name, 500
                )
            return stored
        if not wrapped:
            if self.blank(stored):
                return stored
            raise StoreError(
                "%s is still in the clear while a vault is configured — run "
                "migrate_store_to_vault.py before starting." % self.name,
                500,
            )
        return self.sealer.unseal(stored)

    def _load(self):
        try:
            doc = self._collection().find_one(_key(self.name), max_time_ms=MAX_TIME_MS)
        except StoreError:
            raise
        except Exception as exc:
            raise StoreError("The stored data could not be read.", 500) from exc
        if not isinstance(doc, dict):
            return self._empty(), MISSING
        rev = doc.get("rev")
        if not isinstance(rev, int):
            rev = 0
        stored = doc.get("data")
        if not isinstance(stored, dict):
            return self._empty(), rev
        return self._open(_readable(stored)), rev

    def _seal(self, payload):
        return self.sealer.seal(payload) if self.sealer is not None else payload

    def _commit(self, payload, rev):
        stored = self._seal(payload)
        collection = self._collection()
        if rev == MISSING:
            try:
                collection.insert_one({"_id": str(self.name), "rev": 1, "data": stored})
            except Exception:
                return False
            return True
        result = collection.replace_one(
            {"_id": str(self.name), "rev": rev}, {"rev": rev + 1, "data": stored}
        )
        return result.matched_count == 1

    def read(self):
        return self._load()[0]

    def write(self, payload):
        stored = self._seal(payload)
        with self.lock:
            try:
                self._collection().update_one(
                    _key(self.name), {"$set": {"data": stored}, "$inc": {"rev": 1}}, upsert=True
                )
            except StoreError:
                raise
            except Exception as exc:
                raise StoreError("The stored data could not be written.", 500) from exc

    def update(self, mutate):
        with self.lock:
            for _ in range(MAX_WRITE_ATTEMPTS):
                payload, rev = self._load()
                result = mutate(payload)
                try:
                    committed = self._commit(payload, rev)
                except StoreError:
                    raise
                except Exception as exc:
                    raise StoreError("The stored data could not be written.", 500) from exc
                if committed:
                    return result
        raise StoreError("The stored data is being changed too quickly — try again.", 503)


class MongoLog:

    def __init__(self, name, keep, sweep=0):
        self.name = name
        self.keep = keep
        self.sweep = sweep
        self.lock = threading.Lock()
        self.written = 0

    def _collection(self):
        return get_db()[self.name]

    def append(self, entry):
        try:
            self._collection().insert_one(copy.deepcopy(entry))
        except Exception:
            return None
        with self.lock:
            self.written += 1
            due = self.sweep > 0 and self.written % self.sweep == 0
        if due:
            self.trim()
        return entry

    def trim(self):
        collection = self._collection()
        try:
            if collection.estimated_document_count() <= self.keep:
                return
            marker = None
            cursor = (
                collection.find({}, {"_id": 1})
                .sort("_id", -1)
                .skip(self.keep)
                .limit(1)
                .max_time_ms(MAX_TIME_MS)
            )
            for doc in cursor:
                marker = doc.get("_id")
            if marker is None:
                return
            collection.delete_many({"_id": {"$lte": marker}})
        except Exception:
            return

    def tail(self, limit=100):
        try:
            count = int(limit)
        except (TypeError, ValueError):
            return []
        if count <= 0:
            return []
        # The audit log is the one collection a signed-in reader can ask for by
        # size. Capping it here means a large ?limit cannot turn a panel request
        # into a full-collection scan held in memory.
        count = min(count, MAX_TAIL)
        try:
            cursor = (
                self._collection()
                .find({}, {"_id": 0})
                .sort("_id", -1)
                .limit(count)
                .max_time_ms(MAX_TIME_MS)
            )
            return [_readable(doc) for doc in cursor if isinstance(doc, dict)]
        except Exception:
            return []
