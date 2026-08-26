#!/usr/bin/env python3

import sys
import time

import admin_store_firebase as fb
from admin_store import TOTP_STEP, totp_at, verify_password
from firestore_double import MemoryDb

mem = MemoryDb()
fb.DB_FACTORY = lambda: mem

OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
users = fb.Users(None)
tokens = fb.Tokens(None)
audit = fb.Audit(None)

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    if not condition:
        failures.append(label)
    print("[%s] %s" % ("PASS" if condition else "FAIL", label))


check("no owner before bootstrap", users.has_owner() is False)
check("bootstrap returns the owner name", users.bootstrap_owner(OWNER, OWNER_PASSWORD) == OWNER)
check("owner is a stored record", users.find(OWNER) is not None)
check("owner password verifies from the store", verify_password(users.find(OWNER)["password"], OWNER_PASSWORD))
check("owner is protected", any(u["name"] == OWNER and u["protected"] for u in users.listing()))
check("owner counts as one account", users.count() == 1)
check("owner holds every permission", "users.manage" in users.find(OWNER)["permissions"])
check("owner sorts first", users.listing()[0]["name"] == OWNER)

try:
    users.bootstrap_owner("second", "anotherpass123")
    check("second bootstrap rejected", False)
except fb.StoreError:
    check("second bootstrap rejected", True)

name, secret, generated = users.create("alice", "admin", None, OWNER, password="supersecret123")
check("create returns cleaned name", name == "alice")
check("supplied password is not flagged generated", generated is False)
check("count reflects new user", users.count() == 2)

record = users.find("alice")
check("password persisted as scrypt hash", record["password"].startswith("scrypt$"))
check("correct password verifies", verify_password(record["password"], "supersecret123"))
check("wrong password rejected", not verify_password(record["password"], "wrongpassword"))
check("admin role resolves permissions", "api.manage" in record["permissions"])

try:
    users.create("alice", "admin", None, OWNER, password="anotherpass123")
    check("duplicate name rejected", False)
except fb.StoreError:
    check("duplicate name rejected", True)

try:
    users.create(OWNER, "admin", None, OWNER, password="anotherpass123")
    check("collision with owner rejected", False)
except fb.StoreError:
    check("collision with owner rejected", True)

try:
    users.create("carol", "owner", None, OWNER, password="anotherpass123")
    check("owner role refused without allow_owner", False)
except fb.StoreError as err:
    check("owner role refused without allow_owner", err.status == 403)

nm2, secret2, generated2 = users.create("bob", "viewer", None, OWNER)
check("generated password path works", generated2 is True and len(secret2) >= 12)
check("generated account must change password", users.find("bob")["mustChange"] is True)

users.create("dave", "viewer", None, OWNER, password="tempaccess1234", note="Contractor", expires="2099-12-31")
dave = [u for u in users.listing() if u["name"] == "dave"][0]
check("note persisted", dave["note"] == "Contractor")
check("expiry persisted", dave["expires"] == "2099-12-31")
check("future expiry not expired", dave["expired"] is False)

try:
    users.create("late", "viewer", None, OWNER, password="tempaccess1234", expires="2000-01-01")
    check("past expiry on create rejected", False)
except fb.StoreError:
    check("past expiry on create rejected", True)

try:
    users.create("baddate", "viewer", None, OWNER, password="tempaccess1234", expires="not-a-date")
    check("malformed expiry rejected", False)
except fb.StoreError:
    check("malformed expiry rejected", True)

dave_version = users.find("dave")["tokenVersion"]
users.update("dave", {"expires": "2000-01-01"}, OWNER)
check("setting past expiry bumps tokenVersion", users.find("dave")["tokenVersion"] == dave_version + 1)
check("expired flag reflects past date", users.public("dave", users.find("dave"))["expired"] is True)

before = users.find("alice")["tokenVersion"]
users.update("alice", {"disabled": True}, OWNER)
check("disabling bumps tokenVersion", users.find("alice")["tokenVersion"] == before + 1)
check("account now disabled", users.find("alice")["disabled"] is True)

users.update("bob", {"role": "admin"}, OWNER)
check("role change applied", users.find("bob")["role"] == "admin")
check("role change updates permissions", "api.manage" in users.find("bob")["permissions"])

version_before = users.find("bob")["tokenVersion"]
new_secret, new_version = users.set_password("bob", "brandnewpass123", OWNER, True)
check("set_password bumps tokenVersion", new_version == version_before + 1)
check("set_password rehashes verifiably", verify_password(users.find("bob")["password"], "brandnewpass123"))

users.change_own_password("bob", "ownchosenpass123")
check("change_own clears mustChange", users.find("bob")["mustChange"] is False)
check("change_own new hash verifies", verify_password(users.find("bob")["password"], "ownchosenpass123"))

for label, action in (
    ("owner update blocked with 403", lambda: users.update(OWNER, {"role": "admin"}, OWNER)),
    ("owner password reset by others blocked with 403", lambda: users.set_password(OWNER, "unlikelysecret42", OWNER, True)),
    ("owner delete blocked with 403", lambda: users.delete(OWNER)),
):
    try:
        action()
        check(label, False)
    except fb.StoreError as err:
        check(label, err.status == 403)

users.create("erin", "owner", None, OWNER, password="secondownerpass9", allow_owner=True)
check("a second owner can be created", users.find("erin")["role"] == "owner")
check("both owners are listed", users.owners() == sorted([OWNER, "erin"]))

users.update("bob", {"role": "owner"}, OWNER, allow_owner=True)
check("an owner can promote another account", users.find("bob")["role"] == "owner")
users.update("bob", {"role": "admin"}, OWNER, allow_owner=True)
check("an owner can be demoted again", users.find("bob")["role"] == "admin")

users.set_password("erin", "peerownerpass77", OWNER, True, allow_owner=True)
check("an owner can reset another owner's password", verify_password(users.find("erin")["password"], "peerownerpass77"))

users.update("erin", {"disabled": True}, OWNER, allow_owner=True)
check("an owner can be disabled while another remains", users.find("erin")["disabled"] is True)

for label, action in (
    ("last owner cannot be demoted", lambda: users.update(OWNER, {"role": "admin"}, OWNER, allow_owner=True)),
    ("last owner cannot be disabled", lambda: users.update(OWNER, {"disabled": True}, OWNER, allow_owner=True)),
    ("last owner cannot be removed", lambda: users.delete(OWNER, allow_owner=True)),
):
    try:
        action()
        check(label, False)
    except fb.StoreError as err:
        check(label, err.status == 409)

check("the refused change left the owner alone", users.find(OWNER)["role"] == "owner")
check("the refused change left the owner enabled", users.find(OWNER)["disabled"] is False)

users.update("erin", {"disabled": False}, OWNER, allow_owner=True)
users.delete("erin", allow_owner=True)
check("an owner can be removed while another remains", users.find("erin") is None)
check("removal leaves the remaining owner", users.owners() == [OWNER])

owner_version = users.find(OWNER)["tokenVersion"]
users.change_own_password(OWNER, "ownerchosenpass123")
check("owner can change their own password", verify_password(users.find(OWNER)["password"], "ownerchosenpass123"))
check("owner password change bumps tokenVersion", users.find(OWNER)["tokenVersion"] == owner_version + 1)
users.set_password(OWNER, OWNER_PASSWORD, "console", False, force=True)
check("console can force the owner password", verify_password(users.find(OWNER)["password"], OWNER_PASSWORD))
check("owner still owner after console reset", users.find(OWNER)["role"] == "owner")

users.delete("alice")
check("deleted account is gone", users.find("alice") is None)

try:
    users.delete("ghost")
    check("deleting missing account 404s", False)
except fb.StoreError as err:
    check("deleting missing account 404s", err.status == 404)

users.note_sign_in(OWNER, "203.0.113.7")
check("owner sign-in ip recorded on the record", users.find(OWNER)["lastIp"] == "203.0.113.7")
users.note_sign_in("bob", "203.0.113.8")
check("user sign-in ip recorded", users.find("bob")["lastIp"] == "203.0.113.8")

version = users.bump_version("bob")
check("bump_version increments", version == users.find("bob")["tokenVersion"])

check("find on invalid firestore id returns None not crash", users.find("__bad__") is None)
check("find on slashed id returns None", users.find("a/b") is None)
try:
    users.create("__bad__", "viewer", None, OWNER, password="tempaccess1234")
    check("create with reserved id rejected", False)
except fb.StoreError:
    check("create with reserved id rejected", True)

check("2fa starts disabled", users.totp_state("bob") == {"enabled": False, "pending": False, "recovery": 0, "since": None})
secret, uri = users.start_totp("bob")
check("start_totp returns a secret and uri", bool(secret) and uri.startswith("otpauth://totp/"))
check("2fa now pending", users.totp_state("bob")["pending"] is True and users.totp_state("bob")["enabled"] is False)

v_before_2fa = users.find("bob")["tokenVersion"]
code = totp_at(secret, int(time.time() // TOTP_STEP))
recovery = users.confirm_totp("bob", code)
check("confirm_totp returns recovery codes", isinstance(recovery, list) and len(recovery) > 0)
check("2fa now enabled", users.totp_state("bob")["enabled"] is True)
check("public exposes twoFactor flag", [u for u in users.listing() if u["name"] == "bob"][0]["twoFactor"] is True)
check("confirm bumped tokenVersion", users.find("bob")["tokenVersion"] == v_before_2fa + 1)

try:
    users.confirm_totp("bob", code)
    check("confirm rejected when already on", False)
except fb.StoreError:
    check("confirm rejected when already on", True)

check("wrong 2fa code is bad", users.verify_totp("bob", "000000") == "bad")
check("recovery code accepted once", users.verify_totp("bob", recovery[0]) == "recovery")
check("recovery count decremented", users.totp_state("bob")["recovery"] == len(recovery) - 1)
users.disable_totp("bob")
check("2fa disabled clears state", users.totp_state("bob")["enabled"] is False)
check("public twoFactor false after disable", [u for u in users.listing() if u["name"] == "bob"][0]["twoFactor"] is False)

owner_secret, owner_uri = users.start_totp(OWNER)
owner_code = totp_at(owner_secret, int(time.time() // TOTP_STEP))
users.confirm_totp(OWNER, owner_code)
check("owner 2fa stored on the owner record", (users.find(OWNER).get("totp") or {}).get("confirmed") is True)
check("owner 2fa survives a listing", [u for u in users.listing() if u["name"] == OWNER][0]["twoFactor"] is True)
users.disable_totp(OWNER)
check("owner 2fa disabled", users.find(OWNER).get("totp") is None)

tid, key, pub = tokens.create("gateway", ["api.status"], "live", None, OWNER)
check("token key carries scheme", key.startswith("amk_live_"))
check("raw token key never stored", all(key not in str(value) for _, value in mem.list("admin_tokens")))
check("token prefix retained", pub["prefix"] == key[:13])
check("unknown scope filtered out", tokens.listing()[0]["scopes"] == ["api.status"])
tokens.revoke(tid, OWNER)
check("token marked revoked", tokens.listing()[0]["revoked"] is True)
tokens.delete(tid)
check("token removed", tokens.listing() == [])

audit.record(OWNER, "signin.ok", None, "203.0.113.7")
audit.record(OWNER, "user.created", {"name": "alice"}, "203.0.113.7")
tail = audit.tail(10)
check("audit captured both entries", len(tail) == 2)
check("audit returns newest first", tail[0]["action"] == "user.created")

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
