#!/usr/bin/env python3

import http.client
import json
import os
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

workspace = tempfile.mkdtemp(prefix="admin-logs-test-")
os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "3" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")
os.environ["ADMIN_ORIGIN"] = "https://amitista.com"
os.environ["ADMIN_RATE_PER_IP"] = "500"
os.environ["ADMIN_LOCKOUT_AFTER"] = "200"
os.environ["ADMIN_ACCOUNT_LOCKOUT_AFTER"] = "200"

import admin_api
from admin_store import DEFAULT_ROLES, PERMISSIONS

ORIGIN = "https://amitista.com"
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
HELPER = "helper"
HELPER_PASSWORD = "secondaccount42"

users = admin_api.users
users.bootstrap_owner(OWNER, OWNER_PASSWORD)
users.create(HELPER, "viewer", None, OWNER, password=HELPER_PASSWORD, must_change=False)

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


def caching_of(path, cookie):
    _, headers, _, _ = request("GET", path, cookie=cookie)
    return headers.get("Cache-Control")


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


print("=== the permission ===")

check("logs.read is a permission", "logs.read" in PERMISSIONS)
check("an owner holds it", "logs.read" in DEFAULT_ROLES["owner"])
check("an admin holds it", "logs.read" in DEFAULT_ROLES["admin"])
check("a viewer does not", "logs.read" not in DEFAULT_ROLES["viewer"])

print("\n=== sorting one entry out from another ===")

check("a sign-in is a sign-in", admin_api.log_family("signin.ok") == "signin")
check("two-factor counts as sign-in", admin_api.log_family("twofactor.on") == "signin")
check("an account change is accounts", admin_api.log_family("user.created") == "accounts")
check("a password change is accounts", admin_api.log_family("password.changed") == "accounts")
check("an order is projects", admin_api.log_family("order.close") == "orders")
check("a released file is projects", admin_api.log_family("project.file.add") == "orders")
check("a ticket is support", admin_api.log_family("support.opened") == "support")
check("a board is boards", admin_api.log_family("board.member") == "boards")
check("a cover is site", admin_api.log_family("page.covered") == "site")
check("an API key is platform", admin_api.log_family("token.created") == "platform")
check("GitHub is GitHub", admin_api.log_family("github.accessQueued") == "github")
check("anything unknown lands in other", admin_api.log_family("weather.changed") == "other")
check(
    "every family a prefix names is a real family",
    all(family in admin_api.LOG_FAMILY_IDS for _, family in admin_api.LOG_FAMILY_PREFIXES),
)

check("a refused sign-in is a security line", admin_api.log_severity("signin.failed") == "security")
check("a deleted account is a security line", admin_api.log_severity("user.deleted") == "security")
check("a sign-in matters", admin_api.log_severity("signin.ok") == "important")
check("a board reminder is routine", admin_api.log_severity("board.reminders") == "routine")
check(
    "every severity a line can carry is offered",
    {admin_api.log_severity(action) for action in admin_api.LOG_TITLES}
    <= set(admin_api.LOG_SEVERITIES),
)

print("\n=== saying it in plain words ===")

check("a known action reads plainly", admin_api.log_title("signin.failed") == "Wrong password")
check("an unknown action still reads", admin_api.log_title("weather.turnedCold") == "Weather turned cold")
check("an empty action says something", admin_api.log_title("") == "Recorded")
check(
    "every title a family names is written out",
    all(admin_api.log_title(action) == title for action, title in admin_api.LOG_TITLES.items()),
)
check("a flag reads yes or no", admin_api.log_value(True) == "yes" and admin_api.log_value(False) == "no")
check("nothing reads as a dash", admin_api.log_value(None) == "—")
check("a list reads as a list", admin_api.log_value(["a", "b"]) == "a, b")
check("a long list is cut short", "and 3 more" in admin_api.log_value(list(range(15))))
check("a nested list is counted, not printed", admin_api.log_value([[["deep"]]]) == "1 items")
check("a table reads as pairs", admin_api.log_value({"role": "viewer"}) == "role viewer")
check("a long string is trimmed", len(admin_api.log_value("x" * 900)) == 240)
check("a key reads as words", admin_api.log_field_label("legacyRef") == "old reference")
check("an unnamed key is still spaced out", admin_api.log_field_label("lastUsed") == "last used")

check("a reference is the subject", admin_api.log_subject({"ref": "TCK-1", "name": "n"}) == "TCK-1")
check("a name will do", admin_api.log_subject({"name": "Poster"}) == "Poster")
check("nothing to name is no subject", admin_api.log_subject({"on": True}) is None)
check("a number is not a subject", admin_api.log_subject({"id": 4}) is None)

row = admin_api.log_row(
    {"at": "2026-09-01T10:00:00Z", "actor": "amitista", "action": "user.created", "detail": {"name": "n", "role": "viewer"}, "ip": "1.2.3.4"}
)
check("a row keeps when", row["at"] == "2026-09-01T10:00:00Z")
check("a row keeps who", row["actor"] == "amitista")
check("a row keeps where from", row["ip"] == "1.2.3.4")
check("a row is sorted and titled", (row["family"], row["title"]) == ("accounts", "Account created"))
check("a row carries its detail as fields", row["fields"] == [["name", "n"], ["role", "viewer"]])
check("an actorless row still reads", admin_api.log_row({"action": "signin.ok"})["actor"] == "—")
check("a broken detail is not a crash", admin_api.log_row({"action": "signin.ok", "detail": "x"})["fields"] == [])
twins = {"at": "2026-09-01T10:00:00Z", "actor": "a", "action": "signin.failed", "detail": {}, "ip": "1.1.1.1"}
check("the same line twice reads the same", admin_api.log_row(twins)["id"] == admin_api.log_row(dict(twins))["id"])
check(
    "a different line reads differently",
    admin_api.log_row(twins)["id"] != admin_api.log_row(dict(twins, ip="1.1.1.2"))["id"],
)

print("\n=== who may read it ===")

helper_session = sign_in(HELPER, HELPER_PASSWORD)
status, _, raw, _ = request("GET", "/logs", cookie=helper_session)
check("a viewer is refused the log", status == 403)
status, _, raw, _ = request("GET", "/logs/summary", cookie=helper_session)
check("a viewer is refused the figures", status == 403)
status, _, raw, _ = request("GET", "/logs")
check("a stranger is refused", status == 401)

owner_session = sign_in(OWNER, OWNER_PASSWORD)
status, _, raw, _ = request("GET", "/logs", cookie=owner_session)
check("the owner may read it", status == 200)

print("\n=== the log itself ===")

for index in range(8):
    admin_api.audit.record("amitista", "board.changed", {"board": "b%d" % index}, "10.0.0.1")
admin_api.audit.record("helper", "order.close", {"ref": "ORD-7788"}, "10.0.0.2")
admin_api.audit.record("helper", "signin.failed", None, "10.0.0.3")

status, _, raw, _ = request("GET", "/logs?limit=200", cookie=owner_session)
page = as_json(raw)
entries = page.get("entries") or []
check("the log comes back", status == 200 and bool(entries))
check("newest is first", entries[0]["action"] == "signin.failed")
check("a sign-in of our own is in there", any(entry["action"] == "signin.ok" for entry in entries))
check("every row has an id", all(entry.get("id") for entry in entries))
check("ids do not repeat", len({entry["id"] for entry in entries}) == len(entries))
check("the total is counted", page.get("total") == len(entries))
check("one page of everything needs no next", page.get("next") is None)

status, _, raw, _ = request("GET", "/logs?family=orders", cookie=owner_session)
picked = as_json(raw).get("entries") or []
check("a family filters", picked and all(entry["family"] == "orders" for entry in picked))
check("the order is in it", any(entry["subject"] == "ORD-7788" for entry in picked))

status, _, raw, _ = request("GET", "/logs?action=board.changed", cookie=owner_session)
picked = as_json(raw).get("entries") or []
check("one action filters", len(picked) == 8)

status, _, raw, _ = request("GET", "/logs?actor=HELPER", cookie=owner_session)
picked = as_json(raw).get("entries") or []
check(
    "an actor filters, whatever the case",
    picked and all(entry["actor"].lower() == "helper" for entry in picked),
)
check(
    "their own lines are all there",
    {"order.close", "signin.failed", "signin.ok"} <= {entry["action"] for entry in picked},
)

status, _, raw, _ = request("GET", "/logs?severity=security", cookie=owner_session)
picked = as_json(raw).get("entries") or []
check("a severity filters", picked and all(entry["severity"] == "security" for entry in picked))

status, _, raw, _ = request("GET", "/logs?q=ORD-7788", cookie=owner_session)
picked = as_json(raw).get("entries") or []
check("a search finds a reference", len(picked) == 1 and picked[0]["action"] == "order.close")

status, _, raw, _ = request("GET", "/logs?q=10.0.0.3", cookie=owner_session)
picked = as_json(raw).get("entries") or []
check("a search finds an address", len(picked) == 1)

status, _, raw, _ = request("GET", "/logs?q=" + "nothingiscalledthis", cookie=owner_session)
check("a search that matches nothing says so", (as_json(raw).get("entries") or []) == [])

status, _, raw, _ = request("GET", "/logs?family=weather", cookie=owner_session)
check("an unknown family is refused", status == 400)
status, _, raw, _ = request("GET", "/logs?severity=loud", cookie=owner_session)
check("an unknown severity is refused", status == 400)
status, _, raw, _ = request("GET", "/logs?since=later", cookie=owner_session)
check("an unreadable since is refused", status == 400)
status, _, raw, _ = request("GET", "/logs?before=nonsense", cookie=owner_session)
check("an unreadable page is refused", status == 400)

status, _, raw, _ = request("GET", "/logs?since=253402300799000", cookie=owner_session)
check("a window past everything is empty", (as_json(raw).get("entries") or []) == [])
status, _, raw, _ = request("GET", "/logs?since=1", cookie=owner_session)
check("a window before everything holds it all", len(as_json(raw).get("entries") or []) > 0)

print("\n=== paging, while the log is still being written ===")

status, _, raw, _ = request("GET", "/logs?limit=5", cookie=owner_session)
first = as_json(raw)
check("a short page is short", len(first.get("entries") or []) == 5)
check("a short page offers the next one", bool(first.get("next")))

admin_api.audit.record("amitista", "shield.mode", {"mode": "block"}, "10.0.0.9")

status, _, raw, _ = request("GET", "/logs?limit=5&before=%s" % first["next"], cookie=owner_session)
second = as_json(raw)
seen = {entry["id"] for entry in first["entries"]}
check("the next page is new ground", not (seen & {entry["id"] for entry in second["entries"] or []}))
check(
    "a line written mid-read does not push the page along",
    all(entry["action"] != "shield.mode" for entry in second.get("entries") or []),
)

status, _, raw, _ = request("GET", "/logs?limit=3", cookie=owner_session)
named = {entry["id"]: entry["action"] for entry in as_json(raw).get("entries") or []}
admin_api.audit.record("amitista", "page.covered", {"path": "/team"}, "10.0.0.8")
status, _, raw, _ = request("GET", "/logs?limit=6", cookie=owner_session)
again = {entry["id"]: entry["action"] for entry in as_json(raw).get("entries") or []}
check(
    "a row keeps its id when a newer line lands",
    named and all(again.get(key) == action for key, action in named.items()),
)

walked = []
cursor = None
for _ in range(20):
    suffix = "&before=%s" % cursor if cursor else ""
    status, _, raw, _ = request("GET", "/logs?limit=4" + suffix, cookie=owner_session)
    page = as_json(raw)
    walked.extend(entry["id"] for entry in page.get("entries") or [])
    cursor = page.get("next")
    if not cursor:
        break
check("paging ends", cursor is None)
check("paging repeats nothing", len(walked) == len(set(walked)))
status, _, raw, _ = request("GET", "/logs?limit=200&before=%s" % walked[0], cookie=owner_session)
check("paging reached the bottom", len(walked) >= len(as_json(raw).get("entries") or []))

status, _, raw, _ = request("GET", "/logs?limit=4", cookie=owner_session)
head = as_json(raw).get("entries") or []
status, _, raw, _ = request(
    "GET",
    "/logs?limit=4&before=%s-%s-0" % (head[1]["at"], "0" * 10),
    cookie=owner_session,
)
swept = as_json(raw).get("entries") or []
check(
    "a page whose line was swept away never repeats one already read",
    status == 200 and not ({entry["id"] for entry in swept} & {entry["id"] for entry in head[:2]}),
)

status, _, raw, _ = request("GET", "/logs?limit=9999", cookie=owner_session)
check("a greedy limit is capped, not refused", status == 200)
status, _, raw, _ = request("GET", "/logs?limit=nine", cookie=owner_session)
check("a nonsense limit falls back", status == 200)

print("\n=== the figures above it ===")

status, _, raw, _ = request("GET", "/logs/summary", cookie=owner_session)
summary = as_json(raw)
counts = summary.get("counts") or {}
check("the figures come back", status == 200 and bool(counts))
check("every family is listed, empty ones too", len(summary.get("families") or []) == len(admin_api.LOG_FAMILIES))
check("each family carries a count", all("count" in family for family in summary.get("families") or []))
check(
    "the families add up to the total",
    sum(family["count"] for family in summary["families"]) == counts["total"],
)
check(
    "the severities add up too",
    counts["security"] + counts["important"] + counts["routine"] == counts["total"],
)
check("the busiest names are named", any(entry["name"] == "amitista" for entry in summary.get("actors") or []))
check("the commonest actions are named", bool(summary.get("actions")))
check("an action carries its plain words", all(entry.get("label") for entry in summary["actions"]))
check("today is counted", counts.get("day") == counts.get("total"))
check("the newest is stamped", bool(counts.get("newest")))
check("how much is kept is said", counts.get("limit") is None and summary.get("limit") == admin_api.AUDIT_KEEP)

status, _, raw, _ = request("GET", "/logs/summary?since=253402300799000", cookie=owner_session)
empty = as_json(raw)
check("an empty window counts nothing", (empty.get("counts") or {}).get("total") == 0)
check("an empty window still lists every family", len(empty.get("families") or []) == len(admin_api.LOG_FAMILIES))
check("an empty window still knows what is kept", (empty.get("counts") or {}).get("kept", 0) > 0)
check("an empty window has no newest", (empty.get("counts") or {}).get("newest") is None)

check("the log is never cached", caching_of("/logs", owner_session) == "no-store")

status, _, raw, _ = request("POST", "/logs", {}, cookie=owner_session)
check("the log cannot be written to", status in (404, 405))

server.shutdown()

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
