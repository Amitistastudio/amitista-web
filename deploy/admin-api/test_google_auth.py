#!/usr/bin/env python3

import json
import os
import sys
import tempfile
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

os.environ["ADMIN_GOOGLE"] = "on"
os.environ["ADMIN_GOOGLE_CLIENT_ID"] = "test-client.apps.googleusercontent.com"
os.environ["ADMIN_GOOGLE_CLIENT_SECRET"] = "test-secret"
os.environ["ADMIN_GOOGLE_REDIRECT"] = "https://amitista.com/api/admin/login/google/callback"

import admin_google
from admin_google import GoogleError
from admin_store import StoreError, Users, doc_name, store_backend
from google_double import FakeGoogle

workspace = tempfile.mkdtemp(prefix="admin-google-test-")
STORE = os.path.join(workspace, "users.json")


def at_rest_text():
    if store_backend() == "mongo":
        from mongo_store import raw_doc

        return json.dumps(raw_doc(doc_name(STORE)), sort_keys=True)
    with open(STORE, encoding="utf-8") as handle:
        return handle.read()
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
CLIENT_ID = os.environ["ADMIN_GOOGLE_CLIENT_ID"]

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    if not condition:
        failures.append(label)
    print("[%s] %s" % ("PASS" if condition else "FAIL", label))


def raises(label, action, expected=GoogleError, status=None):
    try:
        action()
        check(label, False)
    except expected as error:
        if status is not None and getattr(error, "status", None) != status:
            print("     status %r, wanted %r" % (getattr(error, "status", None), status))
            check(label, False)
        else:
            check(label, True)
    except Exception as other:
        print("     raised %r instead" % other)
        check(label, False)


google = FakeGoogle(CLIENT_ID)
google.install(admin_google)

print("=== configuration ===")
check("the module reports itself on", admin_google.enabled())
check("nothing is missing", admin_google.missing() is None)

print()
print("=== the authorise url ===")
url = admin_google.start("203.0.113.9")
parsed = urllib.parse.urlparse(url)
params = dict(urllib.parse.parse_qsl(parsed.query))
check("it points at Google", parsed.netloc == "accounts.google.com")
check("it asks for a code", params.get("response_type") == "code")
check("it carries the client id", params.get("client_id") == CLIENT_ID)
check("it pins the redirect", params.get("redirect_uri") == os.environ["ADMIN_GOOGLE_REDIRECT"])
check("it uses PKCE S256", params.get("code_challenge_method") == "S256")
check("the challenge is unpadded base64url", "=" not in params.get("code_challenge", "="))
check("it carries a nonce", len(params.get("nonce", "")) > 20)
check("it carries state", len(params.get("state", "")) > 20)
check("it does not leak the verifier", "code_verifier" not in params)
check("it asks Google to pick an account", params.get("prompt") == "select_account")

second = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(admin_google.start("203.0.113.9")).query))
check("every start gets a fresh state", second["state"] != params["state"])
check("every start gets a fresh nonce", second["nonce"] != params["nonce"])

print()
print("=== state is single use ===")
state = params["state"]
item = admin_google.pending.claim(state)
check("the state resolves once", item["nonce"] == params["nonce"])
raises("replaying the same state is refused", lambda: admin_google.pending.claim(state), status=400)
raises("an invented state is refused", lambda: admin_google.pending.claim("made-up"), status=400)
raises("an empty state is refused", lambda: admin_google.pending.claim(""), status=400)

expired = admin_google.Pending(ttl=1)
old_state, _ = expired.issue("203.0.113.9", now=time.time() - 60)
raises("an expired state is refused", lambda: expired.claim(old_state), status=400)

flood = admin_google.Pending(limit=2)
flood.issue("203.0.113.9")
flood.issue("203.0.113.9")
raises("in-flight sign-ins are capped", lambda: flood.issue("203.0.113.9"), status=429)

print()
print("=== the identity token ===")
fresh = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(admin_google.start("203.0.113.9")).query))
nonce = fresh["nonce"]

claims = admin_google.verify(google.id_token(nonce), nonce)
check("a good token verifies", claims["sub"] == "1029384756")
check("the email comes back lowercased", claims["email"] == "owner@example.com")

check("the email is normalised", admin_google.verify(google.id_token(nonce, email="Owner@Example.COM"), nonce)["email"] == "owner@example.com")

raises(
    "a token for another app is refused",
    lambda: admin_google.verify(google.id_token(nonce, aud="someone-else.apps.googleusercontent.com"), nonce),
    status=401,
)
raises(
    "a token from another issuer is refused",
    lambda: admin_google.verify(google.id_token(nonce, iss="https://evil.example.com"), nonce),
    status=401,
)
raises(
    "an expired token is refused",
    lambda: admin_google.verify(google.id_token(nonce, exp=int(time.time()) - 3600, iat=int(time.time()) - 7200), nonce),
    status=401,
)
raises(
    "a token with the wrong nonce is refused",
    lambda: admin_google.verify(google.id_token("some-other-nonce"), nonce),
    status=401,
)
raises(
    "a token with no nonce is refused",
    lambda: admin_google.verify(google.id_token(nonce=None), nonce),
    status=401,
)
raises(
    "an unverified email is refused",
    lambda: admin_google.verify(google.id_token(nonce, email_verified=False), nonce),
    status=403,
)
raises(
    "a missing email is refused",
    lambda: admin_google.verify(google.id_token(nonce, email=None), nonce),
    status=401,
)

impostor = FakeGoogle(CLIENT_ID, kid=google.kid)
raises(
    "a token signed by someone else is refused",
    lambda: admin_google.verify(impostor.id_token(nonce), nonce),
    status=401,
)

import jwt as pyjwt

unsigned = pyjwt.encode({"iss": "https://accounts.google.com", "aud": CLIENT_ID, "sub": "1", "email": "owner@example.com", "email_verified": True, "nonce": nonce, "iat": int(time.time()), "exp": int(time.time()) + 600}, key="", algorithm="none")
raises("an alg=none token is refused", lambda: admin_google.verify(unsigned, nonce), status=401)

tampered = google.id_token(nonce)
head, body, signature = tampered.split(".")
raises("a token with a swapped signature is refused", lambda: admin_google.verify("%s.%s.%s" % (head, body, signature[::-1]), nonce), status=401)

print()
print("=== the hosted domain gate ===")
admin_google.HOSTED_DOMAIN = "amitista.com"
raises(
    "an outside account is refused when a domain is set",
    lambda: admin_google.verify(google.id_token(nonce, email="someone@gmail.com"), nonce),
    status=403,
)
check(
    "an in-domain account passes",
    admin_google.verify(google.id_token(nonce, email="me@amitista.com", hd="amitista.com"), nonce)["email"] == "me@amitista.com",
)
admin_google.HOSTED_DOMAIN = ""

print()
print("=== the full round trip ===")
started = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(admin_google.start("203.0.113.9")).query))
google.pending_token = google.id_token(started["nonce"])
identity = admin_google.finish("auth-code-here", started["state"], "203.0.113.9")
check("the round trip returns the identity", identity["email"] == "owner@example.com")
check("it notices the same address", identity["sameAddress"] is True)
sent = google.token_calls[-1]
check("the code went to Google", sent["code"] == "auth-code-here")
check("the verifier went with it", len(sent["code_verifier"]) >= 43)
check("the client secret went with it", sent["client_secret"] == "test-secret")
check("the grant type is right", sent["grant_type"] == "authorization_code")

started = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(admin_google.start("198.51.100.7")).query))
google.pending_token = google.id_token(started["nonce"])
identity = admin_google.finish("code-2", started["state"], "203.0.113.9")
check("a different finishing address is flagged", identity["sameAddress"] is False)

raises("a replayed code is refused", lambda: admin_google.finish("code-2", started["state"], "203.0.113.9"), status=400)

started = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(admin_google.start("203.0.113.9")).query))
google.token_response = {"access_token": "no-id-token-here"}
raises("a response with no id_token is refused", lambda: admin_google.finish("code-3", started["state"], "203.0.113.9"), status=502)
google.token_response = None

started = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(admin_google.start("203.0.113.9")).query))
google.pending_token = google.id_token("a-nonce-from-a-different-flow")
raises(
    "a token bound to another flow is refused",
    lambda: admin_google.finish("code-4", started["state"], "203.0.113.9"),
    status=401,
)

print()
print("=== the store is the allowlist ===")
users = Users(STORE)
users.bootstrap_owner(OWNER, OWNER_PASSWORD)
users.create("helper", "admin", None, OWNER, password="secondaccount42", must_change=False)

record, matched = users.find_by_google("1029384756", "owner@example.com")
check("an unlinked Google account matches nobody", record is None and matched is None)

users.link_google(OWNER, "Owner@Example.com")
check("linking normalises the address", users.google_state(OWNER)["email"] == "owner@example.com")
check("a link starts unconfirmed", users.google_state(OWNER)["confirmed"] is False)

record, matched = users.find_by_google("1029384756", "owner@example.com")
check("the linked address matches by email", record is not None and record["name"] == OWNER)
check("and reports how it matched", matched == "email")

record, matched = users.find_by_google("1029384756", "someone.else@example.com")
check("a different address does not match", record is None)

users.note_google(OWNER, "1029384756")
check("first use pins the Google id", users.google_state(OWNER)["confirmed"] is True)

record, matched = users.find_by_google("1029384756", "owner@example.com")
check("it now matches by id", matched == "sub")

record, matched = users.find_by_google("1029384756", "changed@example.com")
check("the id wins even if the address changed", record is not None and record["name"] == OWNER)

record, matched = users.find_by_google("9999999999", "owner@example.com")
check("a stranger reusing a pinned address matches nobody", record is None)

raises(
    "a second account cannot claim the same Google address",
    lambda: users.link_google("helper", "owner@example.com"),
    expected=StoreError,
)
raises(
    "note_google refuses a different Google id",
    lambda: users.note_google(OWNER, "8888888888"),
    expected=StoreError,
)
raises("an account with no link cannot be noted", lambda: users.note_google("helper", "123"), expected=StoreError)

for bad in ("", "   ", "not-an-email", "two@at@signs.com", "no domain@", "@nolocal.com", "spaces in@mail.com"):
    raises("a bad address is refused: %r" % bad, lambda bad=bad: users.link_google("helper", bad), expected=StoreError)

print()
print("=== linking is a credential change ===")
before = users.find(OWNER)["tokenVersion"]
users.link_google(OWNER, "owner@example.com")
check("linking bumps tokenVersion", users.find(OWNER)["tokenVersion"] > before)
before = users.find(OWNER)["tokenVersion"]
check("unlinking reports it removed one", users.unlink_google(OWNER) is True)
check("unlinking bumps tokenVersion", users.find(OWNER)["tokenVersion"] > before)
check("unlinking twice reports nothing removed", users.unlink_google(OWNER) is False)
check("the state is clear afterwards", users.google_state(OWNER)["linked"] is False)
check("an unknown account has no link", users.google_state("nobody")["linked"] is False)

print()
print("=== the link shows up where the panel looks ===")
users.link_google("helper", "helper@example.com")
listed = {entry["name"]: entry for entry in users.listing()}
check("the listing carries the link", listed["helper"]["google"]["email"] == "helper@example.com")
check("and shows unlinked accounts as such", listed[OWNER]["google"]["linked"] is False)
check("the raw email is stored, not hashed", "helper@example.com" in at_rest_text())

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
