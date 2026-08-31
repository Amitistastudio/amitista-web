#!/usr/bin/env python3

import http.client
import json
import os
import sys
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

workspace = tempfile.mkdtemp(prefix="admin-rotation-test-")

os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "9" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")
os.environ["ADMIN_SESSIONS"] = os.path.join(workspace, "sessions.json")
os.environ["ADMIN_ORIGIN"] = "https://amitista.com"
os.environ["ADMIN_RATE_PER_IP"] = "5000"
os.environ["ADMIN_LOCKOUT_AFTER"] = "500"
os.environ["ADMIN_ACCOUNT_LOCKOUT_AFTER"] = "500"

import admin_api

ORIGIN = "https://amitista.com"
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"

CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0"

admin_api.users.bootstrap_owner(OWNER, OWNER_PASSWORD)

server = ThreadingHTTPServer(("127.0.0.1", 0), admin_api.Handler)
port = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    print("[%s] %s" % ("PASS" if condition else "FAIL", label))
    if not condition:
        failures.append(label)


def request(method, path, body=None, cookie=None, agent=CHROME):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    headers = {"Origin": ORIGIN}
    payload = None
    if body is not None:
        payload = json.dumps(body)
        headers["Content-Type"] = "application/json"
    if cookie:
        headers["Cookie"] = cookie
    if agent:
        headers["User-Agent"] = agent
    connection.request(method, "/api/admin" + path, body=payload, headers=headers)
    response = connection.getresponse()
    out = (response.status, response.read(), response.headers.get_all("Set-Cookie") or [])
    connection.close()
    return out


def morsel(jar):
    for part in jar:
        if part.startswith(admin_api.COOKIE_NAME + "="):
            return part.split(";", 1)[0]
    return None


def max_age(jar):
    for part in jar:
        if part.startswith(admin_api.COOKIE_NAME + "="):
            for piece in part.split(";"):
                if piece.strip().lower().startswith("max-age="):
                    return int(piece.split("=", 1)[1])
    return None


def login(remember, agent=CHROME):
    status, raw, jar = request(
        "POST",
        "/login",
        {"username": OWNER, "password": OWNER_PASSWORD, "remember": remember},
        agent=agent,
    )
    return status, json.loads(raw or b"{}"), morsel(jar), max_age(jar)


def account(cookie, agent=CHROME):
    status, raw, jar = request("GET", "/account", cookie=cookie, agent=agent)
    return status, json.loads(raw or b"{}"), morsel(jar)


print("=== the box on the sign-in form decides how long the cookie lives ===")
status, body, kept_cookie, kept_age = login(True)
check("signing in with the box ticked works", status == 200 and body.get("signedIn") is True)
check("  and the panel says the session is kept", body.get("remembered") is True)
check("  and the cookie is set to last as long as a browser will hold it", kept_age == 400 * 86400)

status, body, plain_cookie, plain_age = login(False)
check("signing in with it unticked works too", status == 200 and body.get("signedIn") is True)
check("  and the panel says the session is not kept", body.get("remembered") is False)
check("  and the cookie only lasts the usual 12 hours", plain_age == admin_api.SESSION_HOURS * 3600)

status, held, _ = account(kept_cookie)
check("the kept session can read the account", status == 200 and held.get("name") == OWNER)
check("  and it knows it is kept", held["session"]["remembered"] is True)
check("  with no hard limit to count down to", held["session"]["ceiling"] is None)
check("  and it names the browser it is tied to", held["session"]["device"] == "mac/chrome")
check("  and counts the browsers signed in", held["session"]["held"] == 2)

print()
print("=== the cookie is handed back changed as you work ===")
admin_api.RENEW_AFTER = 0

status, _, swapped = account(kept_cookie)
check("using the panel hands back a new cookie", status == 200 and swapped is not None)
check("  which is not the one that was sent", swapped != kept_cookie)

status, _, spare = account(kept_cookie)
check("the cookie it replaced still works while the swap lands", status == 200)
check("  and that request is not given a third cookie", spare is None)

status, _, newest = account(swapped)
check("the new cookie works", status == 200 and newest is not None)

print()
print("=== a cookie that comes back after its turn takes the session down ===")
check("the session is good right up to the replay", account(newest)[0] == 200)
check("a cookie two swaps out of date is refused", account(kept_cookie)[0] == 401)
check("  and the session it belonged to is closed with it", account(newest)[0] == 401)

print()
print("=== a cookie only works on the browser it was made on ===")
status, _, bound, _ = login(True)
check("a fresh session reads the account", account(bound)[0] == 200)
check("the same cookie from another browser is refused", account(bound, agent=EDGE)[0] == 401)
check("  and the session is closed, so the first browser is out too", account(bound)[0] == 401)

print()
print("=== signing out ends this browser and no other ===")
_, _, laptop, _ = login(True)
_, _, phone, _ = login(True, agent=EDGE)
check("both browsers are signed in", account(laptop)[0] == 200 and account(phone, agent=EDGE)[0] == 200)

status, _, _ = request("POST", "/logout", {}, cookie=laptop)
check("signing out on one returns cleanly", status == 204)
check("  that browser is signed out", account(laptop)[0] == 401)
check("  and the other browser is still signed in", account(phone, agent=EDGE)[0] == 200)

print()
print("=== ending every session reaches all of them ===")
_, _, back, _ = login(True)
check("signing in again works", account(back)[0] == 200)
status, _, _ = request("POST", "/sessions/revoke-all", {}, cookie=back)
check("ending every session returns cleanly", status == 204)
check("  this browser is out", account(back)[0] == 401)
check("  and so is the other one", account(phone, agent=EDGE)[0] == 401)
check("  and the list on disk is empty", admin_api.sessions.held_by(OWNER, time.time()) == 0)

print()
print("=== a cookie from before any of this is refused ===")
old_shape = admin_api.b64encode(
    json.dumps(
        {"u": OWNER, "v": admin_api.users.find(OWNER)["tokenVersion"], "iat": time.time(), "sat": time.time(), "exp": int(time.time()) + 3600},
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
)
legacy = "%s=%s.%s" % (admin_api.COOKIE_NAME, old_shape, admin_api.sign(old_shape))
check("a session token with no session behind it is refused", account(legacy)[0] == 401)

server.shutdown()

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
