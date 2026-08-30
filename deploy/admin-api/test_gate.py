#!/usr/bin/env python3

import http.client
import io
import json
import os
import sys
import tempfile
import threading
import time
import urllib.request
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

workspace = tempfile.mkdtemp(prefix="admin-gate-test-")

os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "9" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")
os.environ["ADMIN_ORIGIN"] = "https://amitista.com"
os.environ["ADMIN_RATE_PER_IP"] = "5000"
os.environ["ADMIN_LOCKOUT_AFTER"] = "500"
os.environ["ADMIN_ACCOUNT_LOCKOUT_AFTER"] = "500"
os.environ["ADMIN_GATE_ATTEMPTS"] = "5000"

import admin_api
import admin_turnstile

ORIGIN = "https://amitista.com"
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"

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


class Reply(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def siteverify(payload):
    def opener(request, timeout=None):
        return Reply(json.dumps(payload).encode("utf-8"))

    return opener


PASSES = {"success": True, "action": admin_turnstile.ACTION, "hostname": "amitista.com"}
REFUSES = {"success": False, "error-codes": ["invalid-input-response"]}


def keys(on=True):
    if on:
        os.environ["TURNSTILE_SECRET"] = "secret-value"
        os.environ["TURNSTILE_HOSTNAMES"] = "amitista.com"
    else:
        os.environ.pop("TURNSTILE_SECRET", None)
        os.environ.pop("TURNSTILE_HOSTNAMES", None)


def request(method, path, body=None, cookie=None, origin=ORIGIN):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    headers = {}
    payload = None
    if body is not None:
        payload = json.dumps(body)
        headers["Content-Type"] = "application/json"
    if cookie:
        headers["Cookie"] = cookie
    if origin:
        headers["Origin"] = origin
    connection.request(method, "/api/admin" + path, body=payload, headers=headers)
    response = connection.getresponse()
    out = (response.status, response.read(), response.headers.get_all("Set-Cookie") or [])
    connection.close()
    return out


def cookie_named(jar, name):
    for part in jar:
        if part.startswith(name + "="):
            return part.split(";", 1)[0]
    return None


def solve(payload=PASSES):
    saved = urllib.request.urlopen
    urllib.request.urlopen = siteverify(payload)
    try:
        status, raw, jar = request("POST", "/gate", {admin_turnstile.FIELD: "a-token"})
    finally:
        urllib.request.urlopen = saved
    return status, json.loads(raw or b"{}"), cookie_named(jar, admin_api.GATE_COOKIE)


def login(cookie=None):
    status, raw, jar = request(
        "POST", "/login", {"username": OWNER, "password": OWNER_PASSWORD}, cookie=cookie
    )
    return status, json.loads(raw or b"{}"), cookie_named(jar, admin_api.COOKIE_NAME)


keys(True)

print("\nthe door is shut until the check is passed")

status, body, session = login()
check("signing in without a pass is refused", status == 403 and session is None)
check("the refusal names the gate so the panel can redraw it", body.get("needs") == "gate")
check(
    "the refusal says nothing about the account",
    OWNER not in json.dumps(body) and "password" not in json.dumps(body).lower(),
)

status, body, sent = login(cookie="%s=not-a-real-pass" % admin_api.GATE_COOKIE)
check("a made-up pass is refused", status == 403 and body.get("needs") == "gate")

status, _, _ = request("GET", "/session")
check("the session endpoint says a gate is standing", status == 200)
seen = json.loads(request("GET", "/session")[1])
check("  and reports it as not yet passed", seen.get("gate") is True and seen.get("gated") is False)

print("\npassing it")

status, body, pass_cookie = solve()
check("a solved challenge is accepted", status == 200 and body.get("passed") is True)
check("  and hands back a pass cookie", pass_cookie is not None)

seen = json.loads(request("GET", "/session", cookie=pass_cookie)[1])
check("the session endpoint now reports the pass", seen.get("gated") is True)

status, body, session = login(cookie=pass_cookie)
check("signing in behind the pass works", status == 200 and session is not None)

print("\nwhat a pass is not")

status, body, refused_cookie = solve(REFUSES)
check("a challenge Cloudflare refuses hands back no pass", status == 403 and refused_cookie is None)
check("  and is marked as the gate, not as a dead end", body.get("needs") == "gate")

body_part = pass_cookie.split("=", 1)[1].split(".")[0]
forged = "%s=%s.%s" % (admin_api.GATE_COOKIE, body_part, "x" * 43)
status, body, _ = login(cookie=forged)
check("a pass with the signature swapped out is refused", status == 403)

elsewhere = admin_api.issue_gate(time.time(), "203.0.113.9")
status, body, _ = login(cookie="%s=%s" % (admin_api.GATE_COOKIE, elsewhere))
check("a pass earned at another address is refused", status == 403 and body.get("needs") == "gate")

stale = admin_api.issue_gate(time.time() - admin_api.GATE_SECONDS - 60, "127.0.0.1")
status, body, _ = login(cookie="%s=%s" % (admin_api.GATE_COOKIE, stale))
check("a pass that has run out is refused", status == 403 and body.get("needs") == "gate")

session_shaped = admin_api.issue_token(OWNER, 1, time.time())
status, body, _ = login(cookie="%s=%s" % (admin_api.GATE_COOKIE, session_shaped))
check("a session token presented as a pass is refused", status == 403)

was_ready = admin_api.google_ready
admin_api.google_ready = lambda: True
try:
    status, raw, _ = request("GET", "/login/google/start", cookie=None)
    body = raw.decode("utf-8", "replace")
    check("an ungated Google sign-in is turned away", status == 200)
    check(
        "  back to the panel with a reason, not a bare 403 in an empty tab",
        "/admin?signin=gate" in body,
    )
    check("  and it never reaches Google", "accounts.google.com" not in body)
finally:
    admin_api.google_ready = was_ready

print("\none pass does not buy unlimited guesses")

_, _, budget = solve()
wrong = {"username": OWNER, "password": "definitely-not-the-password"}

seen = []
for _ in range(admin_api.GATE_SIGNINS + 1):
    status, raw, _ = request("POST", "/login", wrong, cookie=budget)
    seen.append((status, json.loads(raw or b"{}").get("needs")))

check(
    "the pass covers exactly GATE_SIGNINS attempts",
    all(needs != "gate" for _, needs in seen[: admin_api.GATE_SIGNINS]),
)
check("  and is spent after that", seen[-1] == (403, "gate"))
check(
    "  which sends the visitor back to the gate, not to a lockout",
    seen[-1][0] == 403,
)

_, _, refreshed = solve()
status, raw, _ = request("POST", "/login", wrong, cookie=refreshed)
check("solving again buys a new allowance", json.loads(raw or b"{}").get("needs") != "gate")

print("\na pass that got someone in is done")

_, _, entry = solve()
status, _, session = login(cookie=entry)
check("the sign-in itself works", status == 200 and session is not None)
status, raw, _ = request("POST", "/login", wrong, cookie=entry)
check(
    "  and the pass it used is retired, not left with attempts on it",
    json.loads(raw or b"{}").get("needs") == "gate",
)

print("\nwith no Turnstile keys on the box")

keys(False)

status, body, session = login()
check("sign-in works exactly as it did before the gate existed", status == 200 and session is not None)

status, body, cookie = request("POST", "/gate", {})
payload = json.loads(body or b"{}")
check("the gate itself reports that it is not standing", status == 200 and payload.get("gate") is False)

seen = json.loads(request("GET", "/session")[1])
check("  and the session endpoint agrees", seen.get("gate") is False)

print("\n%d checks, %d failed" % (total, len(failures)))
for name in failures:
    print("  FAILED: %s" % name)
server.shutdown()
sys.exit(1 if failures else 0)
