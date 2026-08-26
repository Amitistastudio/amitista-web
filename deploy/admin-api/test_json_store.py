#!/usr/bin/env python3

import hashlib
import json
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from admin_store import (
    TOTP_STEP,
    Audit,
    StoreError,
    Tokens,
    Users,
    doc_name,
    store_backend,
    totp_at,
    verify_password,
)


def at_rest(path):
    if store_backend() == "mongo":
        from mongo_store import raw_doc

        return raw_doc(doc_name(path))
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


workspace = tempfile.mkdtemp(prefix="admin-store-test-")
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"

users = Users(os.path.join(workspace, "users.json"))
tokens = Tokens(os.path.join(workspace, "tokens.json"))
audit = Audit(os.path.join(workspace, "audit.jsonl"))

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    if not condition:
        failures.append(label)
    print("[%s] %s" % ("PASS" if condition else "FAIL", label))


check("empty store has no owner", users.has_owner() is False)
check("empty store lists nothing", users.listing() == [])
check("bootstrap returns the owner name", users.bootstrap_owner(OWNER, OWNER_PASSWORD) == OWNER)
check("owner is a stored record", users.find(OWNER) is not None)
check("has_owner true after bootstrap", users.has_owner() is True)
check("owner password verifies from the store", verify_password(users.find(OWNER)["password"], OWNER_PASSWORD))
check("owner is protected", users.find(OWNER)["protected"] is True)
check("owner counts as one account", users.count() == 1)
check("owner holds every permission", "users.manage" in users.find(OWNER)["permissions"])
check("owner mustChange is false", users.find(OWNER)["mustChange"] is False)
check("owner createdBy is null", users.find(OWNER)["createdBy"] is None)

on_disk = at_rest(os.path.join(workspace, "users.json"))
check("owner lives under users, not a meta key", OWNER in on_disk["users"] and "owner" not in on_disk)
check("stored role is owner", on_disk["users"][OWNER]["role"] == "owner")
check("plaintext password never stored", OWNER_PASSWORD not in json.dumps(on_disk))

try:
    users.bootstrap_owner("second", "anotherpass123")
    check("second bootstrap rejected", False)
except StoreError:
    check("second bootstrap rejected", True)

name, secret, generated = users.create("alice", "admin", None, OWNER, password="supersecret123")
check("create returns cleaned name", name == "alice")
check("supplied password is not flagged generated", generated is False)
check("count reflects new user", users.count() == 2)
check("owner still sorts first", users.listing()[0]["name"] == OWNER)
check("ordinary account is not protected", users.find("alice")["protected"] is False)

record = users.find("alice")
check("password persisted as scrypt hash", record["password"].startswith("scrypt$"))
check("correct password verifies", verify_password(record["password"], "supersecret123"))
check("wrong password rejected", not verify_password(record["password"], "wrongpassword"))
check("admin role resolves permissions", "api.manage" in record["permissions"])

try:
    users.create("alice", "admin", None, OWNER, password="anotherpass123")
    check("duplicate name rejected", False)
except StoreError:
    check("duplicate name rejected", True)

try:
    users.create(OWNER, "admin", None, OWNER, password="anotherpass123")
    check("collision with owner name rejected", False)
except StoreError:
    check("collision with owner name rejected", True)

try:
    users.create("carol", "owner", None, OWNER, password="anotherpass123")
    check("owner role refused without allow_owner", False)
except StoreError as err:
    check("owner role refused without allow_owner", err.status == 403)

nm2, secret2, generated2 = users.create("bob", "viewer", None, OWNER)
check("generated password path works", generated2 is True and len(secret2) >= 12)
check("generated account must change password", users.find("bob")["mustChange"] is True)

users.create("dave", "viewer", None, OWNER, password="tempaccess1234", note="Contractor", expires="2099-12-31")
dave = [u for u in users.listing() if u["name"] == "dave"][0]
check("note persisted", dave["note"] == "Contractor")
check("expiry persisted", dave["expires"] == "2099-12-31")
check("future expiry not expired", dave["expired"] is False)

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

try:
    users.update("bob", {"role": "owner"}, OWNER)
    check("promoting to owner refused without allow_owner", False)
except StoreError as err:
    check("promoting to owner refused without allow_owner", err.status == 403)

version_before = users.find("bob")["tokenVersion"]
new_secret, new_version = users.set_password("bob", "brandnewpass123", OWNER, True)
check("set_password bumps tokenVersion", new_version == version_before + 1)
check("set_password rehashes verifiably", verify_password(users.find("bob")["password"], "brandnewpass123"))

users.change_own_password("bob", "ownchosenpass123")
check("change_own clears mustChange", users.find("bob")["mustChange"] is False)
check("change_own new hash verifies", verify_password(users.find("bob")["password"], "ownchosenpass123"))

for label, action in (
    ("owner update blocked with 403", lambda: users.update(OWNER, {"role": "admin"}, OWNER)),
    ("owner disable blocked with 403", lambda: users.update(OWNER, {"disabled": True}, OWNER)),
    ("owner password reset by others blocked with 403", lambda: users.set_password(OWNER, "unlikelysecret42", OWNER, True)),
    ("owner delete blocked with 403", lambda: users.delete(OWNER)),
):
    try:
        action()
        check(label, False)
    except StoreError as err:
        check(label, err.status == 403)

users.create("erin", "owner", None, OWNER, password="secondownerpass9", allow_owner=True)
check("a second owner can be created", users.find("erin")["role"] == "owner")
check("second owner holds every permission", "users.manage" in users.find("erin")["permissions"])
check("second owner is protected", users.find("erin")["protected"] is True)
check("both owners are listed", users.owners() == sorted([OWNER, "erin"]))

users.update("bob", {"role": "owner"}, OWNER, allow_owner=True)
check("an owner can promote another account", users.find("bob")["role"] == "owner")
check("promotion grants every permission", "users.manage" in users.find("bob")["permissions"])
users.update("bob", {"role": "admin"}, OWNER, allow_owner=True)
check("an owner can be demoted again", users.find("bob")["role"] == "admin")
check("demotion takes users.manage away", "users.manage" not in users.find("bob")["permissions"])

users.set_password("erin", "peerownerpass77", OWNER, True, allow_owner=True)
check("an owner can reset another owner's password", verify_password(users.find("erin")["password"], "peerownerpass77"))

users.update("erin", {"disabled": True}, OWNER, allow_owner=True)
check("an owner can be disabled while another remains", users.find("erin")["disabled"] is True)

for label, action in (
    ("last owner cannot be demoted", lambda: users.update(OWNER, {"role": "admin"}, OWNER, allow_owner=True)),
    ("last owner cannot be disabled", lambda: users.update(OWNER, {"disabled": True}, OWNER, allow_owner=True)),
    ("last owner cannot be expired", lambda: users.update(OWNER, {"expires": "2000-01-01"}, OWNER, allow_owner=True)),
    ("last owner cannot be removed", lambda: users.delete(OWNER, allow_owner=True)),
):
    try:
        action()
        check(label, False)
    except StoreError as err:
        check(label, err.status == 409)

check("the refused change left the owner alone", users.find(OWNER)["role"] == "owner")
check("the refused change left the owner enabled", users.find(OWNER)["disabled"] is False)
check("the refused change left the owner unexpired", users.find(OWNER)["expires"] is None)

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
check("owner still protected after console reset", users.find(OWNER)["protected"] is True)

for label, bad in (
    ("short password rejected", "short1"),
    ("name inside the password rejected", "x%sZQ7" % OWNER),
    ("common word inside the password rejected", "mypassword2026"),
    ("low-variety password rejected", "ababababababab"),
    ("padded password rejected", " leadingspace12 "),
):
    try:
        users.create("policy", "viewer", None, OWNER, password=bad)
        users.delete("policy")
        check(label, False)
    except StoreError:
        check(label, True)

check("a good password is still accepted", users.create("policy", "viewer", None, OWNER, password="quietRiver8chairs")[0] == "policy")
users.delete("policy")

users.delete("alice")
check("deleted account is gone", users.find("alice") is None)

try:
    users.delete("ghost")
    check("deleting missing account 404s", False)
except StoreError as err:
    check("deleting missing account 404s", err.status == 404)

users.note_sign_in(OWNER, "203.0.113.7")
check("owner sign-in ip recorded on the record", users.find(OWNER)["lastIp"] == "203.0.113.7")
check("owner sign-in stamped", users.find(OWNER)["lastSignIn"] is not None)
users.note_sign_in("bob", "203.0.113.8")
check("user sign-in ip recorded", users.find("bob")["lastIp"] == "203.0.113.8")

version = users.bump_version("bob")
check("bump_version increments", version == users.find("bob")["tokenVersion"])
owner_bumped = users.bump_version(OWNER)
check("owner sessions can be ended too", owner_bumped == users.find(OWNER)["tokenVersion"])

check("find on unknown name returns None", users.find("nobody") is None)
check("find on empty name returns None", users.find("") is None)

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

check("wrong 2fa code is bad", users.verify_totp("bob", "000000") == "bad")
check("recovery code accepted once", users.verify_totp("bob", recovery[0]) == "recovery")
check("recovery count decremented", users.totp_state("bob")["recovery"] == len(recovery) - 1)
users.disable_totp("bob")
check("2fa disabled clears state", users.totp_state("bob")["enabled"] is False)

owner_secret, owner_uri = users.start_totp(OWNER)
owner_code = totp_at(owner_secret, int(time.time() // TOTP_STEP))
users.confirm_totp(OWNER, owner_code)
check("owner 2fa stored on the owner record", (users.find(OWNER).get("totp") or {}).get("confirmed") is True)
check("owner 2fa survives a listing", [u for u in users.listing() if u["name"] == OWNER][0]["twoFactor"] is True)
check("owner 2fa recovery codes verify", users.verify_totp(OWNER, "000000") == "bad")
users.disable_totp(OWNER)
check("owner 2fa disabled", users.find(OWNER).get("totp") is None)

reopened = Users(os.path.join(workspace, "users.json"))
check("owner survives a fresh handle", reopened.find(OWNER) is not None)
check("fresh handle sees the owner role", reopened.has_owner() is True)
check("fresh handle keeps the password", verify_password(reopened.find(OWNER)["password"], OWNER_PASSWORD))

PICTURE = b"\x89PNG\r\n\x1a\n" + b"a" * 64
check("an account starts without a picture", users.picture_state("bob")["set"] is False)
picture = users.set_picture("bob", "image/png", PICTURE)
check("a picture reports itself set", picture["set"] is True)
check("a picture records its size", picture["bytes"] == len(PICTURE))
check("a picture hands back a version to cache against", len(picture["hash"]) == 16)
check("a picture reads back as the bytes sent", users.picture("bob") == ("image/png", PICTURE))
check("a picture is written beside the store, never in it", "PNG" not in json.dumps(at_rest(os.path.join(workspace, "users.json"))))
check("a picture shows on the listing", [u for u in users.listing() if u["name"] == "bob"][0]["picture"]["set"] is True)
check("someone else has no picture of their own", users.picture_state(OWNER)["set"] is False)

try:
    users.set_picture("bob", "text/html", b"<script>alert(1)</script>")
    check("a picture that is not an image is refused", False)
except StoreError:
    check("a picture that is not an image is refused", True)

try:
    users.set_picture("bob", "image/png", b"GIF89a" + b"a" * 64)
    check("a file lying about its type is refused", False)
except StoreError:
    check("a file lying about its type is refused", True)

try:
    users.set_picture("bob", "image/png", b"\x89PNG\r\n\x1a\n" + b"a" * (256 * 1024))
    check("a picture over the cap is refused", False)
except StoreError:
    check("a picture over the cap is refused", True)

check("the picture that was already there survived every refusal", users.picture("bob")[1] == PICTURE)
check("removing a picture reports it gone", users.drop_picture("bob") is True)
check("removing it twice says there was nothing", users.drop_picture("bob") is False)
check("the file goes with it", not os.path.exists(os.path.join(workspace, "account-art", hashlib.sha256(b"bob").hexdigest()[:32] + ".png")))

try:
    users.picture("bob")
    check("reading a picture that is gone is a 404", False)
except StoreError as failure:
    check("reading a picture that is gone is a 404", failure.status == 404)

users.create("dana", "viewer", None, OWNER, password="supersecret123")
users.set_picture("dana", "image/png", PICTURE)
dana_file = os.path.join(workspace, "account-art", hashlib.sha256(b"dana").hexdigest()[:32] + ".png")
check("a picture lands under account-art", os.path.exists(dana_file))
users.delete("dana")
check("deleting the account takes the picture with it", not os.path.exists(dana_file))

tid, key, pub = tokens.create("gateway", ["api.status"], "live", None, OWNER)
check("token key carries scheme", key.startswith("amk_live_"))
check("token prefix retained", pub["prefix"] == key[:13])
tokens.revoke(tid, OWNER)
check("token marked revoked", tokens.listing()[0]["revoked"] is True)

audit.record(OWNER, "signin.ok", None, "203.0.113.7")
audit.record(OWNER, "user.created", {"name": "alice"}, "203.0.113.7")
tail = audit.tail(10)
check("audit captured both entries", len(tail) == 2)
check("audit returns newest first", tail[0]["action"] == "user.created")

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
