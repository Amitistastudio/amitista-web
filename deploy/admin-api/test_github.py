#!/usr/bin/env python3

"""The GitHub group of the panel.

Two things are worth holding still here. The gate is by account name rather
than by permission, because an owner resolves to every permission at read time
and so would hold any permission invented for this — that has to keep being
true, including for owners. And the verdicts have to survive a snapshot that is
missing, stale, or written by a newer collector than this code knows about,
because the panel showing something confidently wrong is the failure this whole
group exists to prevent.
"""

import http.client
import json
import os
import sys
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

workspace = tempfile.mkdtemp(prefix="admin-github-test-")
SNAPSHOT = os.path.join(workspace, "github.json")

os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "7" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")
os.environ["ADMIN_ORIGIN"] = "https://amitista.com"
os.environ["ADMIN_GITHUB"] = SNAPSHOT
os.environ["ADMIN_RATE_PER_IP"] = "5000"
os.environ["ADMIN_LOCKOUT_AFTER"] = "500"
os.environ["ADMIN_ACCOUNT_LOCKOUT_AFTER"] = "500"

import admin_api

ORIGIN = "https://amitista.com"
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
# The account PRIVATE_GROUPS names for the github group.
INSIDER = "blxr"
INSIDER_PASSWORD = "insiderpass88"
OUTSIDER = "helper"
OUTSIDER_PASSWORD = "secondaccount42"

users = admin_api.users
users.bootstrap_owner(OWNER, OWNER_PASSWORD)
users.create(INSIDER, "viewer", None, OWNER, password=INSIDER_PASSWORD, must_change=False)
users.create(OUTSIDER, "admin", None, OWNER, password=OUTSIDER_PASSWORD, must_change=False)

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
    out = (response.status, response.read(), response.headers.get_all("Set-Cookie") or [])
    connection.close()
    return out


def sign_in(name, password):
    status, raw, jar = request("POST", "/login", {"username": name, "password": password})
    for part in jar:
        if part.startswith(admin_api.COOKIE_NAME + "="):
            return part.split(";", 1)[0]
    raise SystemExit("could not sign in as %s: %s %s" % (name, status, raw[:200]))


def stamp(seconds_ago):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - seconds_ago))


def write_snapshot(repositories, generated_ago=5):
    with open(SNAPSHOT, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "generated": stamp(generated_ago),
                "org": "Amitistastudio",
                "branch": "main",
                "repositories": repositories,
            },
            handle,
        )


def repo(**overrides):
    entry = {
        "name": "amitista-web",
        "path": "/root/website",
        "branch": "main",
        "present": True,
        "local": "a" * 40,
        "remote": "a" * 40,
        "behind": 0,
        "ahead": 0,
        "dirty": [],
        "ci": "completed/success",
        "green": True,
        "synced": True,
    }
    entry.update(overrides)
    return entry


def read(cookie):
    status, raw, _ = request("GET", "/github/repositories", cookie=cookie)
    return status, json.loads(raw or b"{}")


insider = sign_in(INSIDER, INSIDER_PASSWORD)
outsider = sign_in(OUTSIDER, OUTSIDER_PASSWORD)
owner = sign_in(OWNER, OWNER_PASSWORD)

# ------------------------------------------------------------------ the gate

status, _, _ = request("GET", "/github/repositories")
check("a stranger is turned away", status == 401)

status, _ = read(outsider)
check("an admin who is not named cannot read it", status == 403)

# The point of the private group: an owner holds every permission, so if this
# were a permission the owner would be inside it. The owner is not named.
check("an owner holds every permission", "users.manage" in (users.find(OWNER).get("permissions") or []))
status, _ = read(owner)
check("an owner who is not named still cannot read it", status == 403)

check("the named account is the only one in the group", admin_api.private_groups_for(INSIDER) == ["github"])
check("an unnamed account is in no group", admin_api.private_groups_for(OUTSIDER) == [])
check("the gate is not case sensitive", admin_api.private_groups_for(INSIDER.upper()) == ["github"])

write_snapshot([repo()])
status, body = read(insider)
check("the named account can read it", status == 200)

# ------------------------------------------------------------ a missing file

os.unlink(SNAPSHOT)
status, body = read(insider)
check("a missing snapshot is not an error", status == 200)
check("a missing snapshot says it was not collected", body["collected"] is False)
check("a missing snapshot counts as stale", body["stale"] is True)
check("a missing snapshot lists no repositories", body["repositories"] == [])

with open(SNAPSHOT, "w", encoding="utf-8") as handle:
    handle.write("{ this is not json")
status, body = read(insider)
check("an unreadable snapshot is not an error", status == 200)
check("an unreadable snapshot says it was not collected", body["collected"] is False)

# --------------------------------------------------------------- staleness

write_snapshot([repo()], generated_ago=5)
status, body = read(insider)
check("a fresh snapshot is not stale", body["stale"] is False)
check("a fresh snapshot says it was collected", body["collected"] is True)

write_snapshot([repo()], generated_ago=admin_api.GITHUB_STALE_AFTER + 60)
status, body = read(insider)
check("an old snapshot is stale", body["stale"] is True)

with open(SNAPSHOT, "w", encoding="utf-8") as handle:
    json.dump({"generated": "not a date", "repositories": []}, handle)
status, body = read(insider)
check("an unparseable timestamp is treated as stale", body["stale"] is True)

with open(SNAPSHOT, "w", encoding="utf-8") as handle:
    json.dump({"generated": stamp(5), "repositories": "not a list"}, handle)
status, body = read(insider)
check("a malformed repository list becomes an empty one", body["repositories"] == [])

# -------------------------------------------------------- what it passes on

write_snapshot(
    [
        repo(),
        repo(
            name="amitista-shield",
            path="/root/dev/amitista-shield",
            local="b" * 40,
            remote="c" * 40,
            behind=2,
            synced=False,
            ci="completed/failure",
            green=False,
        ),
        repo(name="amitista-bots", path="/opt/amitista/discord-bot", dirty=["data/state.json"]),
    ]
)
status, body = read(insider)
check("every repository in the snapshot is passed on", len(body["repositories"]) == 3)

shield = next(entry for entry in body["repositories"] if entry["name"] == "amitista-shield")
check("a repository behind main keeps its count", shield["behind"] == 2)
check("a failed CI verdict is passed through whole", shield["ci"] == "completed/failure")
check("a failed CI verdict is not green", shield["green"] is False)

bots = next(entry for entry in body["repositories"] if entry["name"] == "amitista-bots")
check("a dirty checkout keeps its file list", bots["dirty"] == ["data/state.json"])

# A newer collector may add fields this code has never heard of. Dropping them
# silently would mean the panel quietly ignoring something the deploy thought
# was worth reporting.
write_snapshot([repo(somethingNew={"deep": [1, 2]})])
status, body = read(insider)
check("unknown fields survive the round trip", body["repositories"][0]["somethingNew"] == {"deep": [1, 2]})

# ------------------------------------------------------------- read only

for method in ("POST", "DELETE", "PUT"):
    status, _, _ = request(method, "/github/repositories", {} if method != "DELETE" else None, cookie=insider)
    check("the group offers no %s" % method.lower(), status in (400, 404, 405, 501))

server.shutdown()

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
