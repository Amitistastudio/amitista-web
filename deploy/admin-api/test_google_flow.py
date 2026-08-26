#!/usr/bin/env python3

import http.client
import os
import sys
import tempfile
import threading
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

workspace = tempfile.mkdtemp(prefix="admin-google-flow-")
os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "1" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")
os.environ["ADMIN_ORIGIN"] = "https://amitista.com"
os.environ["ADMIN_RATE_PER_IP"] = "500"
os.environ["ADMIN_LOCKOUT_AFTER"] = "200"
os.environ["ADMIN_ACCOUNT_LOCKOUT_AFTER"] = "200"
os.environ["ADMIN_GOOGLE"] = "on"
os.environ["ADMIN_GOOGLE_CLIENT_ID"] = "test-client.apps.googleusercontent.com"
os.environ["ADMIN_GOOGLE_CLIENT_SECRET"] = "test-secret"
os.environ["ADMIN_GOOGLE_REDIRECT"] = "https://amitista.com/api/admin/login/google/callback"

import admin_api
import admin_google
from admin_store import TOTP_STEP, totp_at
from google_double import FakeGoogle
from http.server import ThreadingHTTPServer

OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
SUBJECT = "1029384756"
GOOGLE_EMAIL = "owner@example.com"

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    if not condition:
        failures.append(label)
    print("[%s] %s" % ("PASS" if condition else "FAIL", label))


google = FakeGoogle(os.environ["ADMIN_GOOGLE_CLIENT_ID"])
google.install(admin_google)

users = admin_api.users
users.bootstrap_owner(OWNER, OWNER_PASSWORD)
users.create("helper", "admin", None, OWNER, password="secondaccount42", must_change=False)
users.link_google(OWNER, GOOGLE_EMAIL)

server = ThreadingHTTPServer(("127.0.0.1", 0), admin_api.Handler)
port = server.server_address[1]
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()


def request(method, path, body=None, cookie=None, origin=None):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    headers = {}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if cookie:
        headers["Cookie"] = cookie
    if origin:
        headers["Origin"] = origin
    connection.request(method, "/api/admin" + path, body=body, headers=headers)
    response = connection.getresponse()
    payload = response.read().decode("utf-8", "replace")
    headers = dict(response.getheaders())
    headers["_setcookie"] = response.headers.get_all("Set-Cookie") or []
    out = (response.status, headers, payload, headers["_setcookie"])
    connection.close()
    return out


def cookies(raw):
    found = {}
    for part in raw:
        name, _, rest = part.partition("=")
        value = rest.split(";", 1)[0]
        if value:
            found[name.strip()] = value
    return found


def all_cookies(headers):
    return " | ".join(headers.get("_setcookie", []))


print("=== the panel offers Google sign-in ===")
status, _, payload, _ = request("GET", "/session")
check("the session endpoint answers", status == 200)
check("it advertises Google sign-in", '"google": true' in payload.replace('"google":true', '"google": true'))

print()
print("=== starting a sign-in sends you to Google ===")
status, headers, _, _ = request("GET", "/login/google/start")
location = headers.get("Location", "")
check("it redirects", status == 302)
check("it points at Google", location.startswith("https://accounts.google.com/o/oauth2/v2/auth?"))
check("it does not cache", headers.get("Cache-Control") == "no-store")
check("it leaks no referrer", headers.get("Referrer-Policy") == "no-referrer")

params = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(location).query))
state = params["state"]
nonce = params["nonce"]

print()
print("=== coming back from Google signs you in ===")
google.pending_token = google.id_token(nonce)
status, headers, payload, raw = request("GET", "/login/google/callback?code=abc&state=%s" % state)
jar = cookies(headers["_setcookie"])
check("it answers with a page, not a redirect", status == 200)
check("the page is html", headers.get("Content-Type", "").startswith("text/html"))
check("it lands back on the panel", 'url=/admin?signin=ok' in payload)
check("it sets a session cookie", bool(jar.get(admin_api.COOKIE_NAME)))
check("the session cookie is HttpOnly", "HttpOnly" in all_cookies(headers))
check("the session cookie is SameSite=Strict", "SameSite=Strict" in all_cookies(headers))

session_cookie = "%s=%s" % (admin_api.COOKIE_NAME, jar[admin_api.COOKIE_NAME])
status, _, payload, _ = request("GET", "/session", cookie=session_cookie)
check("the cookie really signs you in", '"signedIn": true' in payload or '"signedIn":true' in payload)
check("it is the right account", ('"user": "%s"' % OWNER) in payload or ('"user":"%s"' % OWNER) in payload)

print()
print("=== the same callback cannot be replayed ===")
status, headers, payload, _ = request("GET", "/login/google/callback?code=abc&state=%s" % state)
check("a replayed state is refused", "signin=failed" in payload)
check("and hands out no session", not cookies(headers["_setcookie"]).get(admin_api.COOKIE_NAME))

print()
print("=== an unlinked Google account gets nowhere ===")
status, headers, _, _ = request("GET", "/login/google/start")
params = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(headers["Location"]).query))
google.pending_token = google.id_token(params["nonce"], subject="7777777777", email="stranger@example.com")
status, headers, payload, _ = request("GET", "/login/google/callback?code=abc&state=%s" % params["state"])
check("a stranger is refused", "signin=unlinked" in payload)
check("and gets no session cookie", not cookies(headers["_setcookie"]).get(admin_api.COOKIE_NAME))

print()
print("=== a disabled account cannot come in through Google ===")
users.link_google("helper", "helper@example.com")
users.update("helper", {"disabled": True}, OWNER)
status, headers, _, _ = request("GET", "/login/google/start")
params = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(headers["Location"]).query))
google.pending_token = google.id_token(params["nonce"], subject="5555555555", email="helper@example.com")
status, headers, payload, _ = request("GET", "/login/google/callback?code=abc&state=%s" % params["state"])
check("a disabled account is refused", "signin=barred" in payload)
check("and gets no session cookie", not cookies(headers["_setcookie"]).get(admin_api.COOKIE_NAME))
users.update("helper", {"disabled": False}, OWNER)

print()
print("=== cancelling at Google is handled ===")
status, headers, payload, _ = request("GET", "/login/google/callback?error=access_denied&state=x")
check("a cancelled sign-in lands quietly", "signin=cancelled" in payload)
check("and gets no session cookie", not cookies(headers["_setcookie"]).get(admin_api.COOKIE_NAME))

print()
print("=== two-step still applies to Google sign-in ===")
secret, _ = users.start_totp(OWNER)


def otp_now(offset=0):
    return totp_at(secret, int(time.time() // TOTP_STEP) + offset)


users.confirm_totp(OWNER, otp_now())
check("two-step is on for the owner", users.totp_state(OWNER)["enabled"] is True)

status, headers, _, _ = request("GET", "/login/google/start")
params = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(headers["Location"]).query))
google.pending_token = google.id_token(params["nonce"], subject=SUBJECT, email=GOOGLE_EMAIL)
status, headers, payload, _ = request("GET", "/login/google/callback?code=abc&state=%s" % params["state"])
jar = cookies(headers["_setcookie"])
check("Google alone does not sign you in", not jar.get(admin_api.COOKIE_NAME))
check("it asks for the second step", "signin=code" in payload)
check("it hands out a two-step cookie", bool(jar.get(admin_api.PENDING_COOKIE)))

step_cookie = "%s=%s" % (admin_api.PENDING_COOKIE, jar[admin_api.PENDING_COOKIE])

status, headers, payload, _ = request(
    "POST", "/login/google/verify", body='{"code":"000000"}', cookie=step_cookie, origin="https://amitista.com"
)
check("a wrong code is refused", status == 401)
check("and hands out no session", not cookies(headers["_setcookie"]).get(admin_api.COOKIE_NAME))

status, headers, payload, _ = request(
    "POST", "/login/google/verify", body='{"code":"%s"}' % otp_now(1), cookie=step_cookie, origin="https://amitista.com"
)
jar = cookies(headers["_setcookie"])
check("the right code signs you in", status == 200)
check("it hands out a session cookie", bool(jar.get(admin_api.COOKIE_NAME)))
check("and clears the two-step cookie", "%s=;" % admin_api.PENDING_COOKIE in all_cookies(headers) or "%s=" % admin_api.PENDING_COOKIE in all_cookies(headers))

status, _, payload, _ = request("GET", "/session", cookie="%s=%s" % (admin_api.COOKIE_NAME, jar[admin_api.COOKIE_NAME]))
check("that session is real", '"signedIn": true' in payload or '"signedIn":true' in payload)

print()
print("=== the two-step step cannot be skipped ===")
status, headers, payload, _ = request(
    "POST", "/login/google/verify", body='{"code":"000000"}', origin="https://amitista.com"
)
check("no two-step cookie means no way in", status == 401)

status, _, _, _ = request("POST", "/login/google/verify", body='{"code":"1"}', cookie=step_cookie, origin="https://evil.example.com")
check("a foreign origin is blocked", status == 403)

print()
print("=== the rate limiter covers the Google routes ===")
for _ in range(600):
    admin_api.limiter.check("127.0.0.1")
status, _, payload, _ = request("GET", "/login/google/start")
check("starting is rate limited", status == 429)
status, _, payload, _ = request("GET", "/login/google/callback?code=a&state=b")
check("the callback is rate limited too", "signin=busy" in payload)

server.shutdown()
server.server_close()

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
