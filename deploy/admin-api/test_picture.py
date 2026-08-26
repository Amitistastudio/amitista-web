#!/usr/bin/env python3

import base64
import http.client
import json
import os
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

workspace = tempfile.mkdtemp(prefix="admin-picture-")
os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "3" * 64
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
GUEST = "guest"
GUEST_PASSWORD = "thirdaccount777"

PNG = b"\x89PNG\r\n\x1a\n" + b"picture-bytes" * 8
GIF = b"GIF89a" + b"moving-bytes" * 8


def data_url(kind, blob):
    return "data:%s;base64,%s" % (kind, base64.b64encode(blob).decode("ascii"))


users = admin_api.users
users.bootstrap_owner(OWNER, OWNER_PASSWORD)
users.create(HELPER, "admin", None, OWNER, password=HELPER_PASSWORD, must_change=False)
users.create(GUEST, "viewer", None, OWNER, password=GUEST_PASSWORD, must_change=False)

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
    out = (response.status, dict(response.getheaders()), response.read())
    connection.close()
    return out


def as_json(raw):
    try:
        return json.loads(raw.decode("utf-8"))
    except ValueError:
        return {}


def sign_in(name, password):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    connection.request(
        "POST",
        "/api/admin/login",
        body=json.dumps({"username": name, "password": password}),
        headers={"Content-Type": "application/json", "Origin": ORIGIN},
    )
    response = connection.getresponse()
    response.read()
    for part in response.headers.get_all("Set-Cookie") or []:
        if part.startswith(admin_api.COOKIE_NAME + "="):
            connection.close()
            return part.split(";", 1)[0]
    connection.close()
    raise SystemExit("could not sign in as %s" % name)


session = sign_in(OWNER, OWNER_PASSWORD)
helper = sign_in(HELPER, HELPER_PASSWORD)
guest = sign_in(GUEST, GUEST_PASSWORD)

print("=== a picture of your own ===")
check("an account starts without one", request("GET", "/account/picture", cookie=session)[0] == 404)
check("the account reads back as picture-less", as_json(request("GET", "/account", cookie=session)[2])["picture"]["set"] is False)

status, _, raw = request("POST", "/account/picture", {"data": data_url("image/png", PNG)}, cookie=session)
check("a picture can be set", status == 200)
state = as_json(raw)["picture"]
check("the answer says it is set", state["set"] is True)
check("the answer carries a version to cache against", bool(state["hash"]))
check("the answer records the size", state["bytes"] == len(PNG))

status, headers, raw = request("GET", "/account/picture", cookie=session)
check("the picture reads back", status == 200 and raw == PNG)
check("it comes back as the type it was sent as", headers.get("Content-Type") == "image/png")
check("it is never cached by a shared cache", "private" in (headers.get("Cache-Control") or ""))
check("the account payload now says it is set", as_json(request("GET", "/account", cookie=session)[2])["picture"]["set"] is True)

check("a second picture replaces the first", request("POST", "/account/picture", {"data": data_url("image/gif", GIF)}, cookie=session)[0] == 200)
check("the newer one is what is served", request("GET", "/account/picture", cookie=session)[2] == GIF)
check("only one file is kept per account", len([f for f in os.listdir(os.path.join(workspace, "account-art")) if not f.startswith(".")]) == 1)

print("\n=== what is refused ===")
check("something that is not an image is refused", request("POST", "/account/picture", {"data": data_url("text/html", b"<script>alert(1)</script>")}, cookie=session)[0] == 400)
check("a file lying about its type is refused", request("POST", "/account/picture", {"data": data_url("image/png", GIF)}, cookie=session)[0] == 400)
check("anything but a data URL is refused", request("POST", "/account/picture", {"data": "https://example.com/a.png"}, cookie=session)[0] == 400)
big = data_url("image/png", b"\x89PNG\r\n\x1a\n" + b"a" * (300 * 1024))
check("one over the cap is refused", request("POST", "/account/picture", {"data": big}, cookie=session)[0] in (413, 400))
check("a signed-out visitor cannot set one", request("POST", "/account/picture", {"data": data_url("image/png", PNG)})[0] == 401)
check("a signed-out visitor cannot read one", request("GET", "/account/picture")[0] == 401)
check("the picture that was there survived every refusal", request("GET", "/account/picture", cookie=session)[2] == GIF)

print("\n=== Discord owns the picture while it is linked ===")
users.link_discord(OWNER, {"id": "412345678901234567", "tag": "someone", "username": "someone", "displayName": "Some One", "avatar": "https://cdn.discordapp.com/avatars/412345678901234567/a.png"})
status, _, raw = request("POST", "/account/picture", {"data": data_url("image/png", PNG)}, cookie=session)
check("setting one is refused while Discord is linked", status == 409)
check("the refusal says why", "Discord" in as_json(raw).get("message", ""))
check("the one already stored is still there", request("GET", "/account/picture", cookie=session)[0] == 200)
users.unlink_discord(OWNER)
check("unlinking hands the picture back", request("POST", "/account/picture", {"data": data_url("image/png", PNG)}, cookie=session)[0] == 200)

print("\n=== other people's pictures ===")
check("an account that may read people can see one", request("GET", "/users/picture?name=%s" % OWNER, cookie=helper)[0] == 200)
check("it is the same picture", request("GET", "/users/picture?name=%s" % OWNER, cookie=helper)[2] == PNG)
check("an account that may not read people cannot", request("GET", "/users/picture?name=%s" % OWNER, cookie=guest)[0] == 403)
check("a signed-out visitor cannot", request("GET", "/users/picture?name=%s" % OWNER)[0] == 401)
check("an account with no picture is a 404", request("GET", "/users/picture?name=%s" % HELPER, cookie=helper)[0] == 404)
check("an account that does not exist is a 404", request("GET", "/users/picture?name=nobody", cookie=helper)[0] == 404)
check("the listing carries the state", [entry for entry in as_json(request("GET", "/users", cookie=helper)[2])["users"] if entry["name"] == OWNER][0]["picture"]["set"] is True)

print("\n=== the face a board shows ===")
request("POST", "/account/picture", {"data": data_url("image/png", PNG)}, cookie=session)
check("anyone who can see boards can see a face", request("GET", "/boards/face?name=%s" % OWNER, cookie=guest)[0] == 200)
check("it is the picture that was set", request("GET", "/boards/face?name=%s" % OWNER, cookie=guest)[2] == PNG)
check("it comes back as an image", request("GET", "/boards/face?name=%s" % OWNER, cookie=guest)[1].get("Content-Type") == "image/png")
check("somebody without a picture has no face", request("GET", "/boards/face?name=%s" % HELPER, cookie=guest)[0] == 404)
check("an account that does not exist has no face", request("GET", "/boards/face?name=nobody", cookie=guest)[0] == 404)
check("a signed-out visitor gets nothing", request("GET", "/boards/face?name=%s" % OWNER)[0] == 401)
check("the name is matched however it is typed", request("GET", "/boards/face?name=%s" % OWNER.upper(), cookie=guest)[0] == 200)

users.link_discord(OWNER, {"id": "412345678901234567", "tag": "someone", "username": "someone", "displayName": "Some One", "avatar": "https://cdn.discordapp.com/avatars/412345678901234567/a.png"})
check("with Discord linked and the bot away, the face falls back to the picture", request("GET", "/boards/face?name=%s" % OWNER, cookie=guest)[2] == PNG)
users.unlink_discord(OWNER)

print("\n=== removing one ===")
check("clearing someone else's needs users.manage", request("POST", "/users/picture/clear", {"name": OWNER}, cookie=helper)[0] == 403)
request("POST", "/account/picture", {"data": data_url("image/png", PNG)}, cookie=helper)
check("an owner can clear someone else's", request("POST", "/users/picture/clear", {"name": HELPER}, cookie=session)[0] == 200)
check("clearing one that is not there is refused", request("POST", "/users/picture/clear", {"name": HELPER}, cookie=session)[0] == 400)
check("the person sees it gone", request("GET", "/account/picture", cookie=helper)[0] == 404)
check("you can remove your own", request("POST", "/account/picture/delete", cookie=session)[0] == 200)
check("and then there is none", request("GET", "/account/picture", cookie=session)[0] == 404)
check("removing one twice is a 404", request("POST", "/account/picture/delete", cookie=session)[0] == 404)
check("no file is left behind", [f for f in os.listdir(os.path.join(workspace, "account-art")) if not f.startswith(".")] == [])

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
