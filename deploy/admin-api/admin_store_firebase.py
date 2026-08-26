#!/usr/bin/env python3

import os
import secrets
import time

from admin_store import (
    LAST_OWNER,
    ROLES,
    SCOPES,
    StoreError,
    check_expiry,
    check_name,
    check_note,
    check_password,
    hash_password,
    hash_token,
    is_expired,
    is_owner,
    owner_can_sign_in,
    make_recovery_codes,
    mint_token,
    now_iso,
    recovery_fingerprint,
    resolve_permissions,
    today_iso,
    totp_check,
    totp_secret,
    totp_uri,
)

USERS_COLLECTION = os.environ.get("FIRESTORE_USERS", "admin_users")
META_COLLECTION = os.environ.get("FIRESTORE_META", "admin_meta")
TOKENS_COLLECTION = os.environ.get("FIRESTORE_TOKENS", "admin_tokens")
AUDIT_COLLECTION = os.environ.get("FIRESTORE_AUDIT", "admin_audit")
API_USAGE_COLLECTION = os.environ.get("FIRESTORE_API_USAGE", "api_usage")


def list_api_usage():
    db = get_db()
    out = {}
    for identifier, data in db.list(API_USAGE_COLLECTION):
        if isinstance(data, dict):
            out[identifier] = data
    return out

PREFIX_KEEP = 13
MAX_NAME = 64

DB_FACTORY = None
_shared = {}


def valid_doc_id(doc_id):
    if not isinstance(doc_id, str) or not doc_id or len(doc_id.encode("utf-8")) > 1500:
        return False
    if doc_id in (".", "..") or "/" in doc_id:
        return False
    if doc_id.startswith("__") and doc_id.endswith("__"):
        return False
    return True


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
        if key:
            cred = credentials.Certificate(key)
        else:
            cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, {"projectId": project} if project else None)
    return FirestoreDb(firestore.client(), firestore)


class FirestoreDb:

    def __init__(self, client, firestore_module):
        self.client = client
        self.firestore = firestore_module

    def get(self, collection, doc_id):
        if not valid_doc_id(doc_id):
            return None
        try:
            snap = self.client.collection(collection).document(doc_id).get()
        except StoreError:
            raise
        except Exception:
            raise StoreError("The stored data could not be read.", 500)
        if not snap.exists:
            return None
        return snap.to_dict()

    def set(self, collection, doc_id, data):
        self.client.collection(collection).document(doc_id).set(data)

    def delete(self, collection, doc_id):
        self.client.collection(collection).document(doc_id).delete()

    def list(self, collection):
        out = []
        for snap in self.client.collection(collection).stream():
            data = snap.to_dict()
            if isinstance(data, dict):
                out.append((snap.id, data))
        return out

    def add(self, collection, data):
        ref = self.client.collection(collection).document()
        ref.set(data)
        return ref.id

    def tail(self, collection, order_field, limit):
        query = (
            self.client.collection(collection)
            .order_by(order_field, direction=self.firestore.Query.DESCENDING)
            .limit(limit)
        )
        out = []
        for snap in query.stream():
            data = snap.to_dict()
            if isinstance(data, dict):
                out.append(data)
        return out

    def transact(self, collection, doc_id, mutate):
        if not valid_doc_id(doc_id):
            raise StoreError("That name is reserved.")
        ref = self.client.collection(collection).document(doc_id)
        firestore = self.firestore

        @firestore.transactional
        def run(transaction):
            snap = ref.get(transaction=transaction)
            current = snap.to_dict() if snap.exists else None
            new_data, result = mutate(current)
            if new_data is None:
                transaction.delete(ref)
            else:
                transaction.set(ref, new_data)
            return result

        return run(self.client.transaction())


class Users:

    def __init__(self, path=None, group=None):
        self.db = get_db()

    @staticmethod
    def _merge(name, record):
        merged = dict(record)
        role = merged.get("role") or "viewer"
        merged["name"] = name
        merged["role"] = role
        merged["permissions"] = resolve_permissions(role, merged.get("permissions"))
        merged["protected"] = role == "owner"
        return merged

    def _owner_name(self):
        for name, record in sorted(self.db.list(USERS_COLLECTION), key=lambda kv: kv[0]):
            if isinstance(record, dict) and is_owner(record):
                return name
        return None

    def _last_owner(self, name):
        for other, record in self.db.list(USERS_COLLECTION):
            if other != name and isinstance(record, dict) and owner_can_sign_in(record):
                return False
        return True

    def has_owner(self):
        return self._owner_name() is not None

    def owners(self):
        return sorted(name for name, record in self.db.list(USERS_COLLECTION)
                      if isinstance(record, dict) and is_owner(record))

    def public(self, name, record):
        return {
            "name": name,
            "role": record.get("role") or "viewer",
            "permissions": record.get("permissions") or [],
            "disabled": bool(record.get("disabled")),
            "created": record.get("created"),
            "createdBy": record.get("createdBy"),
            "updated": record.get("updated"),
            "updatedBy": record.get("updatedBy"),
            "lastSignIn": record.get("lastSignIn"),
            "lastIp": record.get("lastIp"),
            "mustChange": bool(record.get("mustChange")),
            "protected": bool(record.get("protected")),
            "passwordChanged": record.get("passwordChanged"),
            "note": record.get("note") or "",
            "expires": record.get("expires"),
            "expired": is_expired(record),
            "twoFactor": bool((record.get("totp") or {}).get("confirmed")),
        }

    def find(self, name):
        if not name:
            return None
        record = self.db.get(USERS_COLLECTION, name)
        if not isinstance(record, dict):
            return None
        return self._merge(name, record)

    def listing(self):
        out = []
        for name, record in sorted(self.db.list(USERS_COLLECTION), key=lambda kv: kv[0]):
            if not isinstance(record, dict):
                continue
            out.append(self.public(name, self._merge(name, record)))
        out.sort(key=lambda entry: (entry["role"] != "owner", entry["name"]))
        return out

    def count(self):
        return len(self.db.list(USERS_COLLECTION))

    def bootstrap_owner(self, name, password):
        cleaned = check_name(name)
        secret = check_password(password, cleaned)
        existing = self._owner_name()
        if existing is not None:
            raise StoreError("There is already an owner account (%s)." % existing)

        def mutate(current):
            if current is not None:
                raise StoreError("That name is already taken.")
            record = {
                "password": hash_password(secret),
                "role": "owner",
                "permissions": sorted(ROLES["owner"]),
                "disabled": False,
                "tokenVersion": 1,
                "created": now_iso(),
                "createdBy": None,
                "lastSignIn": None,
                "lastIp": None,
                "mustChange": False,
                "note": "",
                "expires": None,
                "passwordChanged": now_iso(),
            }
            return record, cleaned

        return self.db.transact(USERS_COLLECTION, cleaned, mutate)

    def create(self, name, role, permissions, actor, password=None, must_change=True, note=None,
               expires=None, allow_owner=False):
        cleaned = check_name(name)
        if role not in ROLES and role != "custom":
            raise StoreError("Pick a role.")
        if role == "owner" and not allow_owner:
            raise StoreError("Only an owner can make another owner.", 403)

        remark = check_note(note)
        until = check_expiry(expires)
        if until is not None and until < today_iso():
            raise StoreError("That expiry has already passed.")

        generated = password is None
        secret = secrets.token_urlsafe(12) if generated else check_password(password, cleaned)

        def mutate(current):
            if current is not None:
                raise StoreError("That name is already taken.")
            record = {
                "password": hash_password(secret),
                "role": role,
                "permissions": resolve_permissions(role, permissions),
                "disabled": False,
                "tokenVersion": 1,
                "created": now_iso(),
                "createdBy": actor,
                "lastSignIn": None,
                "lastIp": None,
                "mustChange": True if generated else bool(must_change),
                "note": remark,
                "expires": until,
                "passwordChanged": now_iso(),
            }
            return record, record

        self.db.transact(USERS_COLLECTION, cleaned, mutate)
        return cleaned, secret, generated

    def update(self, name, changes, actor, allow_owner=False):
        def mutate(current):
            if not isinstance(current, dict):
                raise StoreError("No such account.", 404)
            was_owner = is_owner(current)
            if was_owner and not allow_owner:
                raise StoreError("Only an owner can change another owner.", 403)
            record = dict(current)
            if "role" in changes:
                role = changes["role"]
                if role == "owner" and not allow_owner:
                    raise StoreError("Only an owner can make another owner.", 403)
                if role not in ROLES and role != "custom":
                    raise StoreError("Pick a role.")
                record["role"] = role
                record["permissions"] = resolve_permissions(role, changes.get("permissions", record.get("permissions")))
            elif "permissions" in changes:
                record["permissions"] = resolve_permissions(record.get("role"), changes["permissions"])

            if "note" in changes:
                record["note"] = check_note(changes["note"])

            if "expires" in changes:
                until = check_expiry(changes["expires"])
                record["expires"] = until
                if until is not None and until < today_iso():
                    record["tokenVersion"] = int(record.get("tokenVersion") or 1) + 1

            if "disabled" in changes:
                disabled = bool(changes["disabled"])
                if disabled != bool(record.get("disabled")):
                    record["disabled"] = disabled
                    record["tokenVersion"] = int(record.get("tokenVersion") or 1) + 1

            if was_owner and not owner_can_sign_in(record) and self._last_owner(name):
                raise StoreError(LAST_OWNER, 409)

            record["updated"] = now_iso()
            record["updatedBy"] = actor
            return record, dict(record)

        return self.db.transact(USERS_COLLECTION, name, mutate)

    def set_password(self, name, password, actor, must_change, force=False, allow_owner=False):
        secret = secrets.token_urlsafe(12) if password is None else check_password(password, name)

        def mutate(current):
            if not isinstance(current, dict):
                raise StoreError("No such account.", 404)
            if is_owner(current) and not (force or allow_owner):
                raise StoreError("Only an owner can set another owner's password.", 403)
            record = dict(current)
            record["password"] = hash_password(secret)
            record["tokenVersion"] = int(record.get("tokenVersion") or 1) + 1
            record["mustChange"] = bool(must_change)
            record["updated"] = now_iso()
            record["updatedBy"] = actor
            record["passwordChanged"] = now_iso()
            return record, int(record["tokenVersion"])

        version = self.db.transact(USERS_COLLECTION, name, mutate)
        return secret, version

    def change_own_password(self, name, password):
        secret = check_password(password, name)

        def mutate(current):
            if not isinstance(current, dict):
                raise StoreError("No such account.", 404)
            record = dict(current)
            record["password"] = hash_password(secret)
            record["tokenVersion"] = int(record.get("tokenVersion") or 1) + 1
            record["mustChange"] = False
            record["updated"] = now_iso()
            record["passwordChanged"] = now_iso()
            return record, int(record["tokenVersion"])

        return self.db.transact(USERS_COLLECTION, name, mutate)

    def delete(self, name, allow_owner=False):
        def mutate(current):
            if not isinstance(current, dict):
                raise StoreError("No such account.", 404)
            if is_owner(current):
                if not allow_owner:
                    raise StoreError("Only an owner can remove another owner.", 403)
                if self._last_owner(name):
                    raise StoreError(LAST_OWNER, 409)
            return None, True

        return self.db.transact(USERS_COLLECTION, name, mutate)

    def note_sign_in(self, name, ip):
        def mutate(current):
            if not isinstance(current, dict):
                return current, True
            record = dict(current)
            record["lastSignIn"] = now_iso()
            record["lastIp"] = ip
            return record, True

        try:
            self.db.transact(USERS_COLLECTION, name, mutate)
        except StoreError:
            return

    def _holder_transact(self, name, run):
        def mutate(current):
            if not isinstance(current, dict):
                raise StoreError("No such account.", 404)
            holder = dict(current)
            result = run(holder)
            return holder, result

        return self.db.transact(USERS_COLLECTION, name, mutate)

    def start_totp(self, name):
        secret = totp_secret()

        def run(holder):
            holder["totp"] = {"secret": secret, "confirmed": False, "seen": 0, "recovery": []}
            return secret

        self._holder_transact(name, run)
        return secret, totp_uri(secret, name)

    def confirm_totp(self, name, code):
        codes = make_recovery_codes()

        def run(holder):
            state = holder.get("totp")
            if not isinstance(state, dict) or not state.get("secret"):
                raise StoreError("Start the setup again.", 409)
            if state.get("confirmed"):
                raise StoreError("Two-step is already on for this account.", 409)
            step = totp_check(state["secret"], code, seen=state.get("seen"))
            if step is None:
                raise StoreError("That code is not right. Check your app's clock.")
            state["confirmed"] = True
            state["seen"] = step
            state["since"] = now_iso()
            state["recovery"] = [recovery_fingerprint(entry) for entry in codes]
            holder["tokenVersion"] = int(holder.get("tokenVersion") or 1) + 1
            return True

        self._holder_transact(name, run)
        return codes

    def verify_totp(self, name, code):
        def run(holder):
            state = holder.get("totp")
            if not isinstance(state, dict) or not state.get("confirmed"):
                return "off"
            step = totp_check(state["secret"], code, seen=state.get("seen"))
            if step is not None:
                state["seen"] = step
                return "code"
            fingerprint = recovery_fingerprint(code)
            remaining = [entry for entry in (state.get("recovery") or []) if entry != fingerprint]
            if len(remaining) != len(state.get("recovery") or []):
                state["recovery"] = remaining
                return "recovery"
            return "bad"

        try:
            return self._holder_transact(name, run)
        except StoreError:
            return "bad"

    def disable_totp(self, name):
        def run(holder):
            holder.pop("totp", None)
            holder["tokenVersion"] = int(holder.get("tokenVersion") or 1) + 1
            return True

        return self._holder_transact(name, run)

    def totp_state(self, name):
        holder = self.db.get(USERS_COLLECTION, name)
        if not isinstance(holder, dict):
            return {"enabled": False, "pending": False, "recovery": 0, "since": None}
        state = holder.get("totp")
        if not isinstance(state, dict):
            return {"enabled": False, "pending": False, "recovery": 0, "since": None}
        return {
            "enabled": bool(state.get("confirmed")),
            "pending": bool(state.get("secret")) and not state.get("confirmed"),
            "recovery": len(state.get("recovery") or []),
            "since": state.get("since"),
        }

    def bump_version(self, name):
        def mutate(current):
            if not isinstance(current, dict):
                raise StoreError("No such account.", 404)
            record = dict(current)
            record["tokenVersion"] = int(record.get("tokenVersion") or 1) + 1
            return record, int(record["tokenVersion"])

        return self.db.transact(USERS_COLLECTION, name, mutate)


class Tokens:

    def __init__(self, path=None, group=None):
        self.db = get_db()

    @staticmethod
    def public(identifier, record, usage=None):
        stats = usage or {}
        return {
            "id": identifier,
            "name": record.get("name"),
            "prefix": record.get("prefix"),
            "environment": record.get("environment") or "live",
            "scopes": record.get("scopes") or [],
            "created": record.get("created"),
            "createdBy": record.get("createdBy"),
            "expires": record.get("expires"),
            "revoked": bool(record.get("revoked")),
            "requests": int(stats.get("requests") or 0),
            "lastUsed": stats.get("lastUsed"),
            "rejected": int(stats.get("rejected") or 0),
        }

    def listing(self, usage=None):
        counters = usage if isinstance(usage, dict) else {}
        out = []
        for identifier, record in self.db.list(TOKENS_COLLECTION):
            if isinstance(record, dict):
                out.append(self.public(identifier, record, counters.get(identifier)))
        out.sort(key=lambda entry: entry.get("created") or "", reverse=True)
        return out

    def create(self, name, scopes, environment, expires, actor):
        cleaned = (name or "").strip()
        if not cleaned or len(cleaned) > MAX_NAME:
            raise StoreError("Give the token a name.")
        if environment not in ("live", "test"):
            raise StoreError("Pick an environment.")

        granted = sorted({scope for scope in (scopes or []) if scope in SCOPES})
        if not granted:
            raise StoreError("Pick at least one scope.")

        if expires is not None and not isinstance(expires, str):
            raise StoreError("That expiry is not a date.")

        key = mint_token(environment)
        identifier = secrets.token_hex(8)
        record = {
            "name": cleaned,
            "prefix": key[:PREFIX_KEEP],
            "hash": hash_token(key),
            "scopes": granted,
            "environment": environment,
            "created": now_iso(),
            "createdBy": actor,
            "expires": expires,
            "revoked": False,
        }
        self.db.set(TOKENS_COLLECTION, identifier, record)
        return identifier, key, self.public(identifier, record)

    def revoke(self, identifier, actor):
        def mutate(current):
            if not isinstance(current, dict):
                raise StoreError("No such token.", 404)
            record = dict(current)
            record["revoked"] = True
            record["revokedAt"] = now_iso()
            record["revokedBy"] = actor
            return record, dict(record)

        return self.db.transact(TOKENS_COLLECTION, identifier, mutate)

    def delete(self, identifier):
        def mutate(current):
            if not isinstance(current, dict):
                raise StoreError("No such token.", 404)
            return None, True

        return self.db.transact(TOKENS_COLLECTION, identifier, mutate)


class Audit:

    def __init__(self, path=None, mode=0o600):
        self.db = get_db()

    def record(self, actor, action, detail=None, ip=None):
        entry = {
            "at": now_iso(),
            "actor": actor,
            "action": action,
            "detail": detail or {},
            "ip": ip,
            "ts": time.time(),
        }
        try:
            self.db.add(AUDIT_COLLECTION, entry)
        except Exception:
            return None
        return entry

    def tail(self, limit=100):
        try:
            rows = self.db.tail(AUDIT_COLLECTION, "ts", limit)
        except Exception:
            return []
        return [{key: value for key, value in row.items() if key != "ts"} for row in rows]
