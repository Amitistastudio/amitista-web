#!/usr/bin/env python3

import http.client
import json
import os
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from admin_store import Maintenance, StoreError

workspace = tempfile.mkdtemp(prefix="admin-maintenance-test-")
os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "2" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")
os.environ["ADMIN_ORIGIN"] = "https://amitista.com"
os.environ["ADMIN_RATE_PER_IP"] = "500"
os.environ["ADMIN_LOCKOUT_AFTER"] = "200"
os.environ["ADMIN_ACCOUNT_LOCKOUT_AFTER"] = "200"

import admin_api

ORIGIN = "https://amitista.com"
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
HELPER = "helper"
HELPER_PASSWORD = "secondaccount42"

users = admin_api.users
users.bootstrap_owner(OWNER, OWNER_PASSWORD)
users.create(HELPER, "admin", None, OWNER, password=HELPER_PASSWORD, must_change=False)

server = ThreadingHTTPServer(("127.0.0.1", 0), admin_api.Handler)
port = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    if not condition:
        failures.append(label)
    print("[%s] %s" % ("PASS" if condition else "FAIL", label))


def request(method, path, body=None, cookie=None, origin=ORIGIN, prefix=True):
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
    connection.request(method, ("/api/admin" + path) if prefix else path, body=payload, headers=headers)
    response = connection.getresponse()
    raw = response.read()
    out = (response.status, dict(response.getheaders()), raw, response.headers.get_all("Set-Cookie") or [])
    connection.close()
    return out


def as_json(raw):
    try:
        return json.loads(raw.decode("utf-8"))
    except ValueError:
        return {}


def sign_in(name, password):
    status, headers, raw, jar = request("POST", "/login", {"username": name, "password": password})
    for part in jar:
        if part.startswith(admin_api.COOKIE_NAME + "="):
            return "%s" % part.split(";", 1)[0]
    raise SystemExit("could not sign in: %s %s" % (status, raw[:200]))


print("=== the store on its own ===")

store = Maintenance(os.path.join(workspace, "maintenance-unit.json"))
check("empty store lists nothing", store.listing() == [])
check("empty store feeds nothing", store.feed() == {})

record = store.cover("/Shield/", "maintenance", "Wait for stage 3", OWNER)
check("path is lowered and trimmed", record["path"] == "/shield")
check("mode is kept", record["mode"] == "maintenance")
check("message is kept", record["message"] == "Wait for stage 3")
check("cover stamps since", bool(record["since"]))
check("cover stamps setBy", record["setBy"] == OWNER)

again = store.cover("/shield", "closed", "", HELPER)
check("re-cover switches mode", again["mode"] == "closed")
check("re-cover stamps changedBy", again["changedBy"] == HELPER)
check("re-cover keeps since", again["since"] == record["since"])

check("home page is coverable", store.cover("/", "closed", "", OWNER)["path"] == "/")
check("feed carries both", set(store.feed()) == {"/shield", "/"})
check("feed rows are mode, message and since", set(store.feed()["/shield"]) == {"mode", "message", "since"})

gone = store.reopen("/shield")
check("reopen returns the record", gone["mode"] == "closed")
check("reopen removes it from the feed", set(store.feed()) == {"/"})
try:
    store.reopen("/shield")
    check("reopening a live page is refused", False)
except StoreError as failure:
    check("reopening a live page is refused", failure.status == 404)

for bad in ("shield", "/Admin", "/block", "/shield?x=1", "/a b", "/" + "x" * 90):
    try:
        store.cover(bad, "maintenance", "", OWNER)
        check("bad path %r refused" % bad, False)
    except StoreError:
        check("bad path %r refused" % bad, True)

try:
    store.cover("/team", "off", "", OWNER)
    check("unknown mode refused", False)
except StoreError:
    check("unknown mode refused", True)

try:
    store.cover("/team", "maintenance", "x" * 201, OWNER)
    check("long message refused", False)
except StoreError:
    check("long message refused", True)

try:
    store.cover("/team", "closed", "", OWNER, until="2020-01-01T00:00Z")
    check("past reopen time refused", False)
except StoreError:
    check("past reopen time refused", True)

try:
    store.cover("/team", "closed", "", OWNER, until="not-a-date")
    check("garbage reopen time refused", False)
except StoreError:
    check("garbage reopen time refused", True)

try:
    store.cover("/team", "closed", "", OWNER, tag="x" * 25)
    check("long tag refused", False)
except StoreError:
    check("long tag refused", True)

import datetime as _dt

future = (_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
timed = store.cover("/team", "closed", "Back soon", OWNER, until=future, tag="Stage 2")
check("reopen time is stored", timed["until"] == future)
check("tag is stored", timed["tag"] == "Stage 2")
check("feed carries the timer", store.feed()["/team"]["until"] == future)
check("feed carries the tag", store.feed()["/team"]["tag"] == "Stage 2")


def lapse(payload):
    payload["pages"]["/team"]["until"] = "2020-01-01T00:00:00Z"
    return None


store.file.update(lapse)
check("a lapsed cover leaves the feed by itself", "/team" not in store.feed())
check("a lapsed cover stays in the listing", any(entry["path"] == "/team" for entry in store.listing()))
store.reopen("/team")

print("=== the public feed needs nothing ===")

status, headers, raw, _ = request("GET", "/api/maintenance", prefix=False, origin=None)
body = as_json(raw)
check("feed answers without a session", status == 200)
check("feed starts empty", body.get("pages") == {})
check("feed is stamped", bool(body.get("generated")))

print("=== the panel routes are owner territory ===")

status, _, _, _ = request("GET", "/pages")
check("pages listing needs a session", status == 401)
status, _, _, _ = request("POST", "/pages/cover", {"path": "/team", "mode": "closed", "message": ""})
check("covering needs a session", status == 401)

helper_session = sign_in(HELPER, HELPER_PASSWORD)
status, _, _, _ = request("GET", "/pages", cookie=helper_session)
check("an admin cannot list covers", status == 403)
status, _, _, _ = request("POST", "/pages/cover", {"path": "/team", "mode": "closed", "message": ""}, cookie=helper_session)
check("an admin cannot cover a page", status == 403)

owner_session = sign_in(OWNER, OWNER_PASSWORD)
status, _, raw, _ = request("GET", "/users", cookie=owner_session)
body = as_json(raw)
check("pages.manage is a known permission", "pages.manage" in body.get("permissions", []))
check("owners hold pages.manage", "pages.manage" in body.get("rolePermissions", {}).get("owner", []))
check("admins do not", "pages.manage" not in body.get("rolePermissions", {}).get("admin", []))

print("=== the owner covers and reopens ===")

status, _, raw, _ = request(
    "POST",
    "/pages/cover",
    {"path": "/team", "mode": "maintenance", "message": "Wait for stage 3"},
    cookie=owner_session,
)
body = as_json(raw)
check("the owner can cover a page", status == 200)
check("the reply carries the page", body.get("page", {}).get("path") == "/team")

status, _, raw, _ = request("GET", "/pages", cookie=owner_session)
body = as_json(raw)
check("the listing shows it", [entry["path"] for entry in body.get("pages", [])] == ["/team"])
check("the listing keeps who set it", body["pages"][0]["setBy"] == OWNER)
check("the listing carries a history", isinstance(body.get("history"), list))
check("history holds the cover just made", any(entry.get("action") == "page.covered" for entry in body["history"]))
check("history is page actions only", all(str(entry.get("action") or "").startswith("page.") for entry in body["history"]))

status, _, raw, _ = request("GET", "/api/maintenance", prefix=False, origin=None, cookie=None)
body = as_json(raw)
check("the public feed shows it", body.get("pages", {}).get("/team", {}).get("mode") == "maintenance")
check("the message rides along", body["pages"]["/team"]["message"] == "Wait for stage 3")
check("the feed never names the actor", "setBy" not in body["pages"]["/team"])

status, _, raw, _ = request("POST", "/pages/cover", {"path": "/admin", "mode": "closed", "message": ""}, cookie=owner_session)
check("the panel itself cannot be covered", status == 400)
status, _, raw, _ = request("POST", "/pages/cover", {"path": "/block", "mode": "closed", "message": ""}, cookie=owner_session)
check("the block page cannot be covered", status == 400)

status, _, raw, _ = request("POST", "/pages/reopen", {"path": "/team"}, cookie=owner_session)
check("the owner can reopen", status == 200)
status, _, raw, _ = request("GET", "/api/maintenance", prefix=False, origin=None)
check("the feed is empty again", as_json(raw).get("pages") == {})
status, _, raw, _ = request("POST", "/pages/reopen", {"path": "/team"}, cookie=owner_session)
check("reopening twice says so", status == 404)

status, _, raw, _ = request("POST", "/pages/cover", {"path": "/team", "mode": "closed", "message": ""}, cookie=owner_session, origin="https://evil.example")
check("a foreign origin is refused", status == 403)

actions = [entry["action"] for entry in admin_api.audit.tail(20)]
check("covering is audited", "page.covered" in actions)
check("reopening is audited", "page.reopened" in actions)

server.shutdown()

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
