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

workspace = tempfile.mkdtemp(prefix="admin-github-test-")
SNAPSHOT = os.path.join(workspace, "github.json")
QUEUE = os.path.join(workspace, "github-queue")

os.environ["ADMIN_GITHUB_QUEUE"] = QUEUE
os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "7" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")
os.environ["ADMIN_ORIGIN"] = "https://amitista.com"
os.environ["ADMIN_GITHUB"] = SNAPSHOT
os.environ["ADMIN_GITHUB_WAIT"] = "0"
os.environ["ADMIN_RATE_PER_IP"] = "5000"
os.environ["ADMIN_LOCKOUT_AFTER"] = "500"
os.environ["ADMIN_ACCOUNT_LOCKOUT_AFTER"] = "500"

import admin_api

ORIGIN = "https://amitista.com"
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
INSIDER = "blxr"
INSIDER_PASSWORD = "insiderpass88"
OUTSIDER = "helper"
OUTSIDER_PASSWORD = "secondaccount42"
DEVELOPER = "coder"
DEVELOPER_PASSWORD = "developerpass55"
SCANNER = "auditor"
SCANNER_PASSWORD = "quietwatcher63"

users = admin_api.users
users.bootstrap_owner(OWNER, OWNER_PASSWORD)
users.create(INSIDER, "viewer", None, OWNER, password=INSIDER_PASSWORD, must_change=False)
users.create(OUTSIDER, "admin", None, OWNER, password=OUTSIDER_PASSWORD, must_change=False)
users.create(DEVELOPER, "dev", None, OWNER, password=DEVELOPER_PASSWORD, must_change=False)
users.create(
    SCANNER, "custom", ["github.security"], OWNER, password=SCANNER_PASSWORD, must_change=False
)

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


def write_snapshot(repositories, generated_ago=5, **extra):
    payload = {
        "generated": stamp(generated_ago),
        "org": "Amitistastudio",
        "branch": "main",
        "repositories": repositories,
    }
    payload.update(extra)
    with open(SNAPSHOT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)


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
developer = sign_in(DEVELOPER, DEVELOPER_PASSWORD)
scanner = sign_in(SCANNER, SCANNER_PASSWORD)


def holds(name):
    return set(users.find(name).get("permissions") or [])


write_snapshot([repo()])

status, _, _ = request("GET", "/github/repositories")
check("a stranger is turned away", status == 401)

status, _ = read(outsider)
check("an admin, holding neither github permission, cannot read it", status == 403)

check("an owner holds every permission", "users.manage" in holds(OWNER))
check("so an owner holds both of the group's", {"github.read", "github.security"} <= holds(OWNER))
check("a developer holds the read one", "github.read" in holds(DEVELOPER))
check("and not the security one", "github.security" not in holds(DEVELOPER))
check("an admin holds neither", not ({"github.read", "github.security"} & holds(OUTSIDER)))

status, _ = read(owner)
check("an owner can read it", status == 200)

status, _ = read(developer)
check("so can a developer", status == 200)

check("the security half can be held on its own", holds(SCANNER) == {"github.security"})
status, _ = read(scanner)
check("and opens the snapshot on its own", status == 200)

check("the named account holds neither permission", not ({"github.read", "github.security"} & holds(INSIDER)))
status, body = read(insider)
check("the named account can read it anyway", status == 200)

check("the named account is the only one in the group", admin_api.private_groups_for(INSIDER) == ["github"])
check("an unnamed account is in no group", admin_api.private_groups_for(OUTSIDER) == [])
check("the gate is not case sensitive", admin_api.private_groups_for(INSIDER.upper()) == ["github"])

write_snapshot(
    [
        repo(
            guards={"scan": {"ran": True, "clean": True, "findings": []}},
            alerts={"secretScanning": {"open": 0}},
            access=[{"login": "octocat", "role": "push", "direct": True}],
            invites=[{"login": "invited", "id": 4321}],
        )
    ],
    people={"members": [{"login": "kostis4563"}], "actor": INSIDER},
)

status, body = read(owner)
only = body["repositories"][0]
check("an owner is handed the box's own scan", only["guards"]["scan"]["ran"] is True)
check("and what GitHub is warning about", only["alerts"]["secretScanning"]["open"] == 0)
check("but not who may reach the repository", "access" not in only)
check("nor the invitations still out", "invites" not in only)
check("nor the people in the organisation", "people" not in body)
check("nor what is waiting to be carried out", "queued" not in body)

status, body = read(developer)
only = body["repositories"][0]
check("a developer is handed the repository itself", only["name"] == "amitista-web")
check("but not the box's own scan", "guards" not in only)
check("nor GitHub's warnings", "alerts" not in only)
check("nor who may reach the repository", "access" not in only)
check("nor the invitations still out", "invites" not in only)
check("nor the people in the organisation", "people" not in body)

status, body = read(insider)
only = body["repositories"][0]
check("the named account is handed who may reach the repository", only["access"][0]["login"] == "octocat")
check("and the invitations still out", only["invites"][0]["id"] == 4321)
check("and the people in the organisation", body["people"]["members"][0]["login"] == "kostis4563")
check("and what is waiting, as a list even when empty", body["queued"] == [])
check("but not the box's own scan, holding no github.security", "guards" not in only)
check("nor GitHub's warnings", "alerts" not in only)

status, body = read(scanner)
only = body["repositories"][0]
check("the security half on its own is handed the scan", only["guards"]["scan"]["ran"] is True)
check("and the warnings", "alerts" in only)
check("and still not who may reach the repository", "access" not in only)

write_snapshot([repo()])

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

write_snapshot([repo(somethingNew={"deep": [1, 2]})])
status, body = read(insider)
check("unknown fields survive the round trip", body["repositories"][0]["somethingNew"] == {"deep": [1, 2]})

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

write_snapshot([repo(pulls=[{"number": 3, "title": "kept"}])])
with open(SNAPSHOT, "r", encoding="utf-8") as handle:
    carried = json.load(handle)
carried["note"] = "GitHub could not be reached in full"
with open(SNAPSHOT, "w", encoding="utf-8") as handle:
    json.dump(carried, handle)
status, body = read(insider)
check("a carried-forward answer is still shown", body["repositories"][0]["pulls"][0]["number"] == 3)
check("and the reason is passed on", "could not be reached" in body["note"])

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

status, _ = ask("/github/access", {"repo": "amitista-web", "login": "octocat", "permission": "push"}, cookie=developer)
check("nor can a developer, who can read the group", status == 403)

status, _ = ask("/github/access", {"repo": "amitista-web", "login": "octocat", "permission": "push"}, cookie=owner)
check("nor can an owner, who holds every permission", status == 403)
check("still nothing was written down", queued() == [])

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

check("the queue is drained in the order it was written", queued() == sorted(queued()))
check("three requests are waiting in total", len(queued()) == 3)

status, body = read(insider)
check("what is waiting travels to the panel", len(body["queued"]) == 3)
check("and says who asked", body["queued"][0]["by"] == INSIDER)

status, body = read(developer)
check("but not to a developer, who cannot ask for any of it", "queued" not in body)

for name in queued():
    os.unlink(os.path.join(QUEUE, name))
status, body = read(insider)
check("an empty queue is an empty list, not a missing key", body["queued"] == [])


def collect_one(outcome, wait=5.0):
    limit = time.monotonic() + wait
    while time.monotonic() < limit:
        names = queued()
        if not names:
            time.sleep(0.02)
            continue
        path = os.path.join(QUEUE, names[0])
        with open(path, "r", encoding="utf-8") as handle:
            intent = json.load(handle)
        os.unlink(path)
        with open(SNAPSHOT, "r", encoding="utf-8") as handle:
            snapshot = json.load(handle)
        people = snapshot.setdefault("people", {})
        people.setdefault("actions", []).insert(0, dict(intent, done=stamp(0), **outcome))
        spare = SNAPSHOT + ".collecting"
        with open(spare, "w", encoding="utf-8") as handle:
            json.dump(snapshot, handle)
        os.replace(spare, SNAPSHOT)
        return


def alongside(outcome, path, body):
    hand = threading.Thread(target=collect_one, args=(outcome,), daemon=True)
    hand.start()
    started = time.monotonic()
    status, answer = ask(path, body)
    hand.join(10)
    return status, answer, time.monotonic() - started


admin_api.GITHUB_CARRY_WAIT = 5.0

status, body, spent = alongside(
    {"ok": True, "status": 201, "error": None, "result": "changed"},
    "/github/access",
    {"repo": "amitista-web", "login": "octocat", "permission": "maintain"},
)
check("a change that lands comes back done, not queued", status == 200 and "carried" in body)
check("and says it worked", body["carried"]["ok"] is True)
check("and what became of it", body["carried"]["result"] == "changed")
check("and it is the same request that was asked for", body["carried"]["id"] == body["queued"]["id"])
check("and nothing is left waiting", body["waiting"] == 0 and queued() == [])
check("and it did not sit on the full wait", spent < admin_api.GITHUB_CARRY_WAIT)

status, body, _ = alongside(
    {"ok": False, "status": 404, "error": "Not Found", "result": None},
    "/github/access/remove",
    {"repo": "amitista-web", "login": "ghost"},
)
check("a change GitHub refuses still comes back", status == 200 and "carried" in body)
check("saying it did not work", body["carried"]["ok"] is False)
check("and why", body["carried"]["error"] == "Not Found")

held = admin_api.GITHUB_CARRY_GRACE
admin_api.GITHUB_CARRY_GRACE = 0.4
started = time.monotonic()
status, body = ask("/github/access", {"repo": "amitista-web", "login": "octocat", "permission": "pull"})
spent = time.monotonic() - started
admin_api.GITHUB_CARRY_GRACE = held
check("with nothing collecting, it comes back as queued", status == 200 and "carried" not in body)
check("and gives up rather than holding the request open", spent < admin_api.GITHUB_CARRY_WAIT)
check("and what was asked for is still waiting to be carried out", len(queued()) == 1)

admin_api.GITHUB_CARRY_WAIT = 0.0
for name in queued():
    os.unlink(os.path.join(QUEUE, name))

for method in ("POST", "DELETE", "PUT"):
    status, _, _ = request(method, "/github/repositories", {} if method != "DELETE" else None, cookie=insider)
    check("the group offers no %s" % method.lower(), status in (400, 404, 405, 501))

for path in ("/github/access", "/github/access/remove", "/github/access/invite/cancel"):
    status, _, _ = request("GET", path, cookie=insider)
    check("%s cannot be reached with a GET" % path, status in (400, 404, 405, 501))

check("the discord cdn is fetchable", admin_api.remote_art("https://cdn.discordapp.com/avatars/1/a.png"))
check("the github avatar cdn is fetchable", admin_api.remote_art("https://avatars.githubusercontent.com/u/1?v=4"))

for bad, why in (
    ("https://github.com/octocat.png", "github itself rather than its avatar cdn"),
    ("http://avatars.githubusercontent.com/u/1", "the avatar cdn over plain http"),
    ("https://avatars.githubusercontent.com.evil.test/u/1", "a host that merely starts the same way"),
    ("https://evil.test/https://avatars.githubusercontent.com/u/1", "the cdn buried in a path"),
    ("file:///etc/passwd", "a local file"),
    ("http://169.254.169.254/latest/meta-data/", "the metadata service"),
    ("https://avatars.githubusercontent.com/" + "a" * 400, "a url past the ceiling"),
    ("", "nothing at all"),
    (None, "a missing url"),
):
    check("not fetchable: %s" % why, admin_api.remote_art(bad) is None)

with open(SNAPSHOT, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "generated": stamp(5),
            "org": "Amitistastudio",
            "branch": "main",
            "people": {
                "members": [
                    {"login": "kostis4563", "avatar": "https://avatars.githubusercontent.com/u/1?v=4"},
                    {"login": "nopicture", "avatar": None},
                    {"login": "elsewhere", "avatar": "https://evil.test/u/2.png"},
                ],
            },
            "repositories": [
                dict(
                    repo(),
                    access=[{"login": "collab", "avatar": "https://avatars.githubusercontent.com/u/3?v=4"}],
                    invites=[{"login": "invited", "avatar": "https://avatars.githubusercontent.com/u/4?v=4"}],
                ),
            ],
        },
        handle,
    )

check("a member's avatar resolves", admin_api.github_avatar_for("kostis4563").endswith("/u/1?v=4"))
check("and the lookup is not case sensitive", admin_api.github_avatar_for("KOSTIS4563") is not None)
check("a repository collaborator resolves", admin_api.github_avatar_for("collab").endswith("/u/3?v=4"))
check("somebody still only invited resolves", admin_api.github_avatar_for("invited").endswith("/u/4?v=4"))
check("somebody with no avatar resolves to nothing", admin_api.github_avatar_for("nopicture") is None)
check("an avatar hosted off the cdn resolves to nothing", admin_api.github_avatar_for("elsewhere") is None)
check("a login not in the snapshot resolves to nothing", admin_api.github_avatar_for("stranger") is None)
check("an empty login resolves to nothing", admin_api.github_avatar_for("") is None)

served = []


def fake_fetch(url):
    served.append(url)
    return ("image/png", b"\x89PNG stand-in")


admin_api.fetch_art = fake_fetch
admin_api.artwork.by_url.clear()

status, _, _ = request("GET", "/github/avatar?login=kostis4563")
check("a stranger cannot fetch an avatar", status == 401)

status, _, _ = request("GET", "/github/avatar?login=kostis4563", cookie=outsider)
check("an admin, holding neither github permission, cannot fetch an avatar", status == 403)
check("and nothing was fetched for them", served == [])

status, raw, _ = request("GET", "/github/avatar?login=kostis4563", cookie=insider)
check("the named account is handed the image", status == 200 and raw == b"\x89PNG stand-in")
check("and it came from the avatar cdn", len(served) == 1 and served[0].startswith(admin_api.GITHUB_CDN))

status, raw, _ = request("GET", "/github/avatar?login=kostis4563", cookie=owner)
check("an owner is handed the image", status == 200 and raw == b"\x89PNG stand-in")

status, raw, _ = request("GET", "/github/avatar?login=kostis4563", cookie=developer)
check("so is a developer", status == 200 and raw == b"\x89PNG stand-in")

held = len(served)
request("GET", "/github/avatar?login=kostis4563", cookie=insider)
check("a second look is served from the cache", len(served) == held)

status, _, _ = request("GET", "/github/avatar?login=stranger", cookie=insider)
check("a login not in the snapshot is a 404", status == 404)

status, _, _ = request("GET", "/github/avatar?login=elsewhere", cookie=insider)
check("an avatar hosted off the cdn is a 404", status == 404)

status, _, _ = request("GET", "/github/avatar", cookie=insider)
check("no login at all is a 404", status == 404)
check("and none of the refusals reached the network", len(served) == held)

for method in ("POST", "DELETE", "PUT"):
    status, _, _ = request(method, "/github/avatar", {} if method != "DELETE" else None, cookie=insider)
    check("the avatar route offers no %s" % method.lower(), status in (400, 404, 405, 501))

write_snapshot([
    repo(
        pulls=[{
            "number": 3,
            "title": "a change",
            "sha": "abc123",
            "changed": [
                {"path": "src/app.py", "added": 1, "removed": 0, "patch": "@@ secret diff", "clipped": True},
            ],
        }],
    )
])
status, body = read(insider)
only = body["repositories"][0]["pulls"][0]["changed"][0]
check("the patch is stripped before the snapshot travels", "patch" not in only)
check("but the file is still listed", only["path"] == "src/app.py")
check("and whether it was clipped survives", only["clipped"] is True)
check("the panel is told whether a reviewer is configured", body["reviewer"] is False)

status, _, _ = request("GET", "/github/review?repo=amitista-web&number=3")
check("a stranger cannot ask for a review", status == 401)

status, _, _ = request("GET", "/github/review?repo=amitista-web&number=3", cookie=outsider)
check("an admin, holding neither github permission, cannot either", status == 403)

status, _, _ = request("GET", "/github/review?repo=amitista-web&number=3", cookie=owner)
check("an owner reaches it", status == 503)

status, _, _ = request("GET", "/github/review?repo=amitista-web&number=3", cookie=developer)
check("so does a developer", status == 503)

status, _, _ = request("GET", "/github/review?repo=amitista-web&number=99", cookie=insider)
check("a pull request not in the snapshot is a 404", status == 404)

status, _, _ = request("GET", "/github/review?repo=amitista-web", cookie=insider)
check("and asking without a number is refused", status == 400)

status, _, _ = request("GET", "/github/review?repo=amitista-web&number=abc", cookie=insider)
check("as is a number that is not one", status == 400)

status, raw, _ = request("GET", "/github/review?repo=amitista-web&number=3", cookie=insider)
check("with no model configured it refuses with a 503", status == 503)
check("and says what to set", b"ADMIN_AI_KEY" in (raw or b""))

for method in ("POST", "DELETE", "PUT"):
    status, _, _ = request(
        method, "/github/review?repo=amitista-web&number=3",
        {} if method != "DELETE" else None, cookie=insider,
    )
    check("the review route offers no %s" % method.lower(), status in (400, 404, 405, 501))


server.shutdown()

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
