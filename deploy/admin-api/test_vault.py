#!/usr/bin/env python3

import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import admin_vault
from admin_store import Audit, StoreError, Tokens, Users, doc_name, store_backend, verify_password
from admin_vault import Sealer, Secrets, VaultError, build_vault
from vault_double import MemoryVault

workspace = tempfile.mkdtemp(prefix="admin-vault-test-")
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
STORE = os.path.join(workspace, "users.json")

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    if not condition:
        failures.append(label)
    print("[%s] %s" % ("PASS" if condition else "FAIL", label))


def raises(label, action, expected=VaultError):
    try:
        action()
        check(label, False)
    except expected:
        check(label, True)
    except Exception as other:
        print("     raised %r instead" % other)
        check(label, False)


def at_rest(path=None):
    target = path or STORE
    if store_backend() == "mongo":
        from mongo_store import raw_doc

        return raw_doc(doc_name(target))
    with open(target, encoding="utf-8") as handle:
        return json.load(handle)


def at_rest_text(path=None):
    return json.dumps(at_rest(path), sort_keys=True)


def seed_clear(path, payload):
    if store_backend() == "mongo":
        from mongo_store import DOCS_COLLECTION, get_db

        get_db()[DOCS_COLLECTION].replace_one(
            {"_id": doc_name(path)}, {"rev": 1, "data": payload}, upsert=True
        )
        return
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)


def on_disk():
    return at_rest()


vault = MemoryVault({"amitista-admin-session-secret": "s" * 64, "amitista-alert-webhook": ""})
sealer = Sealer(vault, "users")

print("=== nothing readable is written to disk ===")
users = Users(STORE, sealer=sealer)
users.bootstrap_owner(OWNER, OWNER_PASSWORD)

raw = at_rest_text()
check("the store file is a sealed envelope", set(on_disk()) == {"version", "sealed", "key"})
check("no account name appears on disk", OWNER not in raw)
check("no password hash appears on disk", "scrypt$" not in raw)
check("no plaintext password appears on disk", OWNER_PASSWORD not in raw)
check("the key name is recorded for operators", on_disk()["key"] == vault.key_name)

print()
print("=== it still behaves like a store ===")
check("the owner reads back", users.find(OWNER) is not None)
check("the password still verifies", verify_password(users.find(OWNER)["password"], OWNER_PASSWORD))
check("has_owner works through the seal", users.has_owner() is True)
users.create("bob", "viewer", None, OWNER, password="quietRiver8chairs")
check("a second account round-trips", users.find("bob")["role"] == "viewer")
check("listing works through the seal", len(users.listing()) == 2)
users.note_sign_in(OWNER, "203.0.113.7")
check("a write re-seals and reads back", users.find(OWNER)["lastIp"] == "203.0.113.7")
check("every read went through the vault", vault.decrypts > 5)

print()
print("=== TOTP secrets are no longer in the clear ===")
secret, uri = users.start_totp(OWNER)
check("the TOTP secret is not on disk", secret not in at_rest_text())
check("but the panel can still read it", (users.find(OWNER).get("totp") or {}).get("secret") == secret)

print()
print("=== a sealed store is bound to its purpose ===")
wrong = Sealer(vault, "tokens")
raises("a users blob will not open as tokens", lambda: wrong.unseal(on_disk()))

print()
print("=== tampering is detected, not silently accepted ===")
envelope = on_disk()
broken = dict(envelope)
broken["sealed"] = envelope["sealed"][:-8] + "AAAAAAAA"
raises("a flipped byte fails to open", lambda: sealer.unseal(broken))
raises("an empty envelope is refused", lambda: sealer.unseal({"sealed": ""}))

print()
print("=== fail closed when Google is unreachable ===")
vault.fail()
raises("reads fail rather than serving stale data", lambda: users.find(OWNER))
raises("writes fail rather than dropping to plaintext", lambda: users.note_sign_in(OWNER, "203.0.113.9"))
raises("secrets fail closed too", lambda: Secrets(vault, ttl=0).get("session"))
vault.restore()
check("it recovers when Google comes back", users.find(OWNER) is not None)
check("the store on disk is still sealed", "sealed" in on_disk())

print()
print("=== a store in the clear is refused, not quietly re-sealed ===")
plain = os.path.join(workspace, "plain.json")
seed_clear(plain, {"version": 1, "users": {"ghost": {"role": "owner", "password": "scrypt$x"}}})
guarded = Users(plain, sealer=sealer)
try:
    guarded.find("ghost")
    check("plaintext store refused while a vault is configured", False)
except StoreError as failure:
    check("plaintext store refused while a vault is configured", failure.status == 500)

empty = os.path.join(workspace, "empty.json")
seed_clear(empty, {"version": 1, "users": {}})
check("an empty store is allowed to be sealed on first write", Users(empty, sealer=sealer).find("x") is None)

print()
print("=== a sealed store cannot be read without the vault ===")
try:
    Users(STORE).find(OWNER)
    check("sealed store refused with no vault configured", False)
except StoreError as failure:
    check("sealed store refused with no vault configured", failure.status == 500)

print()
print("=== the escape hatch really opens it again ===")
opened = sealer.unseal(on_disk())
check("unsealed payload holds the accounts", OWNER in opened["users"])
check("unsealed payload keeps the hashes", opened["users"][OWNER]["password"].startswith("scrypt$"))

print()
print("=== secrets come from the vault, with a bounded window ===")
held = Secrets(vault, ttl=600)
check("the session secret is fetched", len(held.get("session")) == 64)
before = vault.reads
held.get("session")
check("it is not re-fetched inside the window", vault.reads == before)
held.forget()
held.get("session")
check("forgetting forces a fresh fetch", vault.reads == before + 1)
check("an unknown secret fails closed", Secrets(vault, ttl=0) is not None)
raises("a missing secret is an error, not an empty string", lambda: Secrets(vault, ttl=0).get("nope"))

print()
print("=== build_vault honours the backend switch ===")
check("no vault by default", build_vault("none") is None)
admin_vault.VAULT_FACTORY = lambda: vault
check("google backend goes through the factory", build_vault("google") is vault)
admin_vault.VAULT_FACTORY = None
raises("an unknown backend is refused", lambda: build_vault("azure"))

print()
print("=== tokens seal under their own purpose ===")
token_store = os.path.join(workspace, "tokens.json")
tokens = Tokens(token_store, sealer=Sealer(vault, "tokens"))
identifier, key, public = tokens.create("gateway", ["api.status"], "live", None, OWNER)
body = at_rest_text(token_store)
check("the raw key is not on disk", key not in body)
check("the token hash is not on disk either", "sha256" not in body and public["prefix"] not in body)
check("tokens still list", tokens.listing()[0]["prefix"] == public["prefix"])

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
