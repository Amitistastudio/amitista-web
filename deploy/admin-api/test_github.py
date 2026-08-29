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
QUEUE = os.path.join(workspace, "github-queue")

os.environ["ADMIN_GITHUB_QUEUE"] = QUEUE
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

# ------------------------------------------------- what GitHub itself said

write_snapshot(
    [
        repo(
            facts={
                "description": "the site",
                "private": True,
                "sizeKb": 4798,
                "openIssues": 0,
                "defaultBranch": "main",
                "url": "https://github.com/Amitistastudio/amitista-web",
                "language": "JavaScript",
            },
            pulls=[
                {
                    "number": 7,
                    "title": "Something in flight",
                    "author": "blxr",
                    "draft": False,
                    "created": stamp(3600),
                    "head": "a-branch",
                    "base": "main",
                    "url": "https://github.com/Amitistastudio/amitista-web/pull/7",
                }
            ],
            branches=[
                {"name": "main", "sha": "a" * 40, "protected": False, "default": True, "ahead": 0, "behind": 0},
                {"name": "old-work", "sha": "d" * 40, "protected": False, "default": False, "ahead": 1, "behind": 20},
            ],
            runs=[
                {"name": "CI", "status": "completed", "conclusion": "success", "sha": "abc1234",
                 "branch": "main", "event": "push", "created": stamp(600), "seconds": 33,
                 "url": "https://github.com/x/y/actions/runs/1", "subject": "a commit"},
                {"name": "CI", "status": "completed", "conclusion": "failure", "sha": "def5678",
                 "branch": "main", "event": "push", "created": stamp(9000), "seconds": 54,
                 "url": "https://github.com/x/y/actions/runs/2", "subject": "an older commit"},
            ],
        )
    ]
)
status, body = read(insider)
only = body["repositories"][0]
check("repository facts survive", only["facts"]["sizeKb"] == 4798)
check("the GitHub url survives", only["facts"]["url"].endswith("/amitista-web"))
check("an open pull request survives whole", only["pulls"][0]["number"] == 7)
check("a drifted branch keeps both counts", only["branches"][1]["ahead"] == 1 and only["branches"][1]["behind"] == 20)
check("the default branch is marked", only["branches"][0]["default"] is True)
check("run history survives", len(only["runs"]) == 2)
check("a failed run keeps its conclusion", only["runs"][1]["conclusion"] == "failure")
check("run duration survives", only["runs"][0]["seconds"] == 33)

# Issues reach the panel whole. The projection itself — and the fact that a pull
# request is not an issue — is pinned in test_github_state.py, next to the code
# that does it.
write_snapshot(
    [
        repo(
            issues=[
                {
                    "number": 12,
                    "title": "The estimate form does not verify Turnstile",
                    "author": "blxr",
                    "labels": [{"name": "bug", "colour": "d73a4a"}],
                    "assignees": ["blxr"],
                    "milestone": "v2",
                    "comments": 3,
                    "created": stamp(7200),
                    "updated": stamp(600),
                    "url": "https://github.com/Amitistastudio/amitista-web/issues/12",
                    "body": "The widget renders but nothing checks the token.",
                    "clipped": False,
                }
            ]
        ),
        repo(name="amitista-bots", issues=[]),
    ]
)
status, body = read(insider)
web = next(entry for entry in body["repositories"] if entry["name"] == "amitista-web")
check("issues reach the panel", len(web["issues"]) == 1)
check("an issue keeps its number", web["issues"][0]["number"] == 12)
check("an issue keeps its body", "nothing checks the token" in web["issues"][0]["body"])
check("an issue keeps its labels", web["issues"][0]["labels"][0]["colour"] == "d73a4a")
check("an issue keeps its assignees", web["issues"][0]["assignees"] == ["blxr"])
check("an issue keeps the link to open it", web["issues"][0]["url"].endswith("/issues/12"))
check(
    "a repository with no issues says so with an empty list",
    next(e for e in body["repositories"] if e["name"] == "amitista-bots")["issues"] == [],
)

# The collector's conditional-request bookkeeping is of no use to the panel and
# grows without bound, so it must not be handed out.
with open(SNAPSHOT, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "generated": stamp(5),
            "repositories": [repo()],
            "etags": {"/repos/x/y": 'W/"abc"'},
            "rate": {"remaining": 4887, "limit": 5000},
            "detail": stamp(120),
        },
        handle,
    )
status, body = read(insider)
check("the etag map is not handed to the panel", "etags" not in body)
check("the rate limit is handed to the panel", body["rate"]["remaining"] == 4887)
check("when GitHub was last asked is handed to the panel", body["detail"] == stamp(120))

# GitHub being unreachable must not empty the panel — the collector carries the
# last known answer forward and says so.
write_snapshot([repo(pulls=[{"number": 3, "title": "kept"}])])
with open(SNAPSHOT, "r", encoding="utf-8") as handle:
    carried = json.load(handle)
carried["note"] = "GitHub could not be reached in full"
with open(SNAPSHOT, "w", encoding="utf-8") as handle:
    json.dump(carried, handle)
status, body = read(insider)
check("a carried-forward answer is still shown", body["repositories"][0]["pulls"][0]["number"] == 3)
check("and the reason is passed on", "could not be reached" in body["note"])

# ------------------------------------------------------- asking for access

# This service holds no GitHub token and could not carry any of this out if it
# wanted to. All it can do is leave a file for the collector, which is root and
# checks the whole thing again before acting on it. So what is pinned here is
# the two halves of that: nothing reaches the queue that should not, and what
# does reach it is written down honestly enough for root to act on.

write_snapshot([repo(), repo(name="amitista-studio-bot", path="/opt/amitista/studio-bot")])


def queued():
    try:
        return sorted(name for name in os.listdir(QUEUE) if name.endswith(".json"))
    except OSError:
        return []


def intents():
    out = []
    for name in queued():
        with open(os.path.join(QUEUE, name), "r", encoding="utf-8") as handle:
            out.append(json.load(handle))
    return out


def ask(path, body, cookie=insider):
    status, raw, _ = request("POST", path, body, cookie=cookie)
    return status, json.loads(raw or b"{}")

status, _ = ask("/github/access", {"repo": "amitista-web", "login": "octocat", "permission": "push"}, cookie=None)
check("a stranger cannot ask for access", status == 401)
check("and nothing was written down", queued() == [])

status, _ = ask("/github/access", {"repo": "amitista-web", "login": "octocat", "permission": "push"}, cookie=outsider)
check("an admin who is not named cannot ask for access", status == 403)

status, _ = ask("/github/access", {"repo": "amitista-web", "login": "octocat", "permission": "push"}, cookie=owner)
check("nor can an owner, who holds every permission", status == 403)
check("still nothing was written down", queued() == [])

# ---- what is refused before it can be written down

for bad, why in (
    ({"repo": "amitista-web", "login": "octo cat", "permission": "push"}, "a login with a space"),
    ({"repo": "amitista-web", "login": "-octocat", "permission": "push"}, "a login starting with a hyphen"),
    ({"repo": "amitista-web", "login": "octo--cat", "permission": "push"}, "a login with a double hyphen"),
    ({"repo": "amitista-web", "login": "a" * 40, "permission": "push"}, "a login past GitHub's ceiling"),
    ({"repo": "amitista-web", "login": "../../etc/passwd", "permission": "push"}, "a path pretending to be a login"),
    ({"repo": "amitista-web", "login": "octocat", "permission": "owner"}, "a permission GitHub does not have"),
    ({"repo": "amitista-web", "login": "octocat", "permission": "write"}, "GitHub's display name for a permission"),
    ({"repo": "amitista-web", "login": "octocat"}, "no permission at all"),
    ({"repo": "not-a-repo", "login": "octocat", "permission": "push"}, "a repository not on this box"),
    ({"login": "octocat", "permission": "push"}, "no repository at all"),
):
    status, body = ask("/github/access", bad)
    check("%s is refused" % why, status == 400)
check("none of the refused requests were written down", queued() == [])

# ---- what is accepted

status, body = ask("/github/access", {"repo": "amitista-web", "login": "octocat", "permission": "push"})
check("a whole request is accepted", status == 200)
check("and comes back as queued, not as done", "queued" in body and "done" not in body)
check("one file is waiting", len(queued()) == 1)

first = intents()[0]
check("the queued file says what to do", first["action"] == "grant")
check("and to which repository", first["repo"] == "amitista-web")
check("and to whom", first["login"] == "octocat")
check("and at what level", first["permission"] == "push")
check("and who asked for it", first["by"] == INSIDER)
check("and when", first["at"].endswith("Z"))
check("and carries an id of its own", len(first["id"]) >= 8)

status, body = ask("/github/access/remove", {"repo": "amitista-studio-bot", "login": "octocat"})
check("a removal is accepted", status == 200)
check("and needs no permission", intents()[1]["action"] == "revoke" and "permission" not in intents()[1])

status, _ = ask("/github/access/invite/cancel", {"repo": "amitista-web", "invite": 4321})
check("cancelling an invitation is accepted", status == 200)
check("and carries the invitation's id as a number", intents()[2]["invite"] == 4321)

for bad, why in (
    ({"repo": "amitista-web", "invite": "4321"}, "an invitation id as text"),
    ({"repo": "amitista-web", "invite": True}, "a boolean pretending to be an id"),
    ({"repo": "amitista-web"}, "no invitation id"),
):
    status, _ = ask("/github/access/invite/cancel", bad)
    check("cancelling with %s is refused" % why, status == 400)

# Order matters and is carried by the filename: two changes to one person's
# access have to be made in the order they were asked for, or the second undoes
# the first.
check("the queue is drained in the order it was written", queued() == sorted(queued()))
check("three requests are waiting in total", len(queued()) == 3)

# The panel is told what is waiting, so it can say "asked for" rather than
# implying the change has happened.
status, body = read(insider)
check("what is waiting travels to the panel", len(body["queued"]) == 3)
check("and says who asked", body["queued"][0]["by"] == INSIDER)

for name in queued():
    os.unlink(os.path.join(QUEUE, name))
status, body = read(insider)
check("an empty queue is an empty list, not a missing key", body["queued"] == [])

# ------------------------------------------------------------- read only

# Everything but access. The repositories route in particular must stay a read:
# it is the one every section is built on, and a write on it would mean this
# service could change something without root's say-so.
for method in ("POST", "DELETE", "PUT"):
    status, _, _ = request(method, "/github/repositories", {} if method != "DELETE" else None, cookie=insider)
    check("the group offers no %s" % method.lower(), status in (400, 404, 405, 501))

for path in ("/github/access", "/github/access/remove", "/github/access/invite/cancel"):
    status, _, _ = request("GET", path, cookie=insider)
    check("%s cannot be reached with a GET" % path, status in (400, 404, 405, 501))

server.shutdown()

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
