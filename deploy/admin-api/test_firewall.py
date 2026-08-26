#!/usr/bin/env python3

import http.client
import json
import os
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from admin_store import Firewall, FirewallEvents, StoreError, signature_catalogue

workspace = tempfile.mkdtemp(prefix="admin-firewall-test-")
os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "3" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")
os.environ["ADMIN_ORIGIN"] = "https://amitista.com"
os.environ["ADMIN_RATE_PER_IP"] = "500"
os.environ["ADMIN_LOCKOUT_AFTER"] = "200"
os.environ["ADMIN_ACCOUNT_LOCKOUT_AFTER"] = "200"
os.environ["ADMIN_FIREWALL_CONF"] = os.path.join(workspace, "firewall.conf")
os.environ["ADMIN_FIREWALL_STATUS"] = os.path.join(workspace, "firewall-apply.json")
os.environ["ADMIN_FIREWALL_LOG"] = os.path.join(workspace, "firewall.log")
os.environ["ADMIN_GEO"] = os.path.join(workspace, "ipcountry.json")

import admin_api

ORIGIN = "https://amitista.com"
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
VIEWER = "onlooker"
VIEWER_PASSWORD = "viewerpassphrase9"

users = admin_api.users
users.bootstrap_owner(OWNER, OWNER_PASSWORD)
users.create(VIEWER, "viewer", None, OWNER, password=VIEWER_PASSWORD, must_change=False)

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


def request(method, path, body=None, cookie=None, origin=ORIGIN, prefix=True, agent=None):
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
    if agent:
        headers["User-Agent"] = agent
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

store = Firewall(os.path.join(workspace, "firewall-unit.json"))
check("a new firewall has no rules", store.listing() == [])
check("a new firewall is on", store.settings()["enabled"] is True)
check("a new firewall watches by default", store.settings()["defaultMode"] == "monitor")

rule = store.save("", {"kind": "ip", "value": "203.0.113.5", "mode": "block"}, OWNER)
check("a bare address is stored as a range", rule["value"] == "203.0.113.5/32")
check("an address rule is an edge rule", rule["layer"] == "edge")
check("saving stamps setBy", rule["setBy"] == OWNER)

check("a mode is optional and defaults to watching", store.save("", {"kind": "path", "value": "/x"}, OWNER)["mode"] == "monitor")

try:
    store.save("", {"kind": "ip", "value": "203.0.113.5/32", "mode": "block"}, OWNER)
    check("a duplicate rule is refused", False)
except StoreError:
    check("a duplicate rule is refused", True)

for kind, value in (
    ("ip", "not-an-address"),
    ("ip", "0.0.0.0/0"),
    ("country", "Germany"),
    ("method", "FETCH"),
    ("signature", "nonsense"),
    ("path", "wp-login"),
    ("agent", "***"),
    ("nonsense", "x"),
):
    try:
        store.save("", {"kind": kind, "value": value}, OWNER)
        check("%s rule %r refused" % (kind, value), False)
    except StoreError:
        check("%s rule %r refused" % (kind, value), True)

country = store.save("", {"kind": "country", "value": "de", "mode": "block"}, OWNER)
check("a country code is upper-cased", country["value"] == "DE")

print("\n=== matching ===")

matcher = Firewall(os.path.join(workspace, "firewall-match.json"))
matcher.save("", {"kind": "ip", "value": "198.51.100.0/24", "mode": "block"}, OWNER)
matcher.save("", {"kind": "agent", "value": "*badbot*", "mode": "block"}, OWNER)
matcher.save("", {"kind": "path", "value": "/wp-login.php", "mode": "block"}, OWNER)
matcher.save("", {"kind": "method", "value": "DELETE", "mode": "block"}, OWNER)
matcher.save("", {"kind": "country", "value": "CN", "mode": "block"}, OWNER)
matcher.save("", {"kind": "signature", "value": "sqli", "mode": "block"}, OWNER)
matcher.save("", {"kind": "signature", "value": "probe", "mode": "monitor"}, OWNER)

clean = {"ip": "203.0.113.9", "method": "GET", "target": "/work?ref=news&id=42", "agent": "Mozilla/5.0"}
check("an ordinary request passes", matcher.evaluate(clean) is None)


def verdict(**fields):
    request_fields = dict(clean)
    request_fields.update(fields)
    country_code = request_fields.pop("country", None)
    return matcher.evaluate(request_fields, country_code)


check("an address in range is blocked", verdict(ip="198.51.100.7")["action"] == "blocked")
check("an address outside the range is not", verdict(ip="198.51.101.7") is None)
check("a matching agent is blocked", verdict(agent="x badbot y")["action"] == "blocked")
check("a matching path is blocked", verdict(target="/wp-login.php")["action"] == "blocked")
check("a query string does not defeat a path rule", verdict(target="/wp-login.php?x=1")["action"] == "blocked")
check("a matching method is blocked", verdict(method="DELETE")["action"] == "blocked")
check("a matching country is blocked", verdict(country="CN")["action"] == "blocked")
check("a country only matches when it is known", verdict(country=None) is None)

for label, target in (
    ("plain", "/x?id=1 union select password"),
    ("percent-encoded", "/x?id=1%20UNION%20SELECT%20password"),
    ("plus-encoded", "/x?id=1+union+select+password"),
    ("quoted", "/x?id=1' or 1=1--"),
):
    check("sqli %s is blocked" % label, verdict(target=target)["action"] == "blocked")

check("a probe is watched, not blocked", verdict(target="/.env")["action"] == "observed")
check("a watched rule still names itself", verdict(target="/.env")["rule"]["value"] == "probe")

body = matcher.evaluate({"ip": "203.0.113.9", "method": "POST", "target": "/api/contact", "agent": "Mozilla", "body": "{\"message\":\"1 union select password\"}"})
check("a signature in a body is caught", body is not None and body["action"] == "blocked")

uploaded = json.dumps(
    {"name": "shot.png", "data": "data:image/png;base64,AAAA1+union+select+passwordAAAA"}
)
check("uploaded bytes are seen by the body screen as a body", "union" in uploaded)
check(
    "a signature cannot fire on the bytes of an upload",
    matcher.evaluate(
        {
            "ip": "203.0.113.9",
            "method": "POST",
            "target": "/api/admin/boards/cards/file",
            "agent": "Mozilla",
            "body": admin_api.UPLOADED_BYTES.sub('"data:"', uploaded),
        }
    )
    is None,
)

check("a blocking rule wins over a watching one", verdict(target="/wp-login.php")["rule"]["kind"] == "path")

agent_rule = [entry for entry in matcher.listing() if entry["kind"] == "agent"][0]
off = matcher.save(
    agent_rule["id"], {"kind": "agent", "value": "*badbot*", "mode": "block", "enabled": False}, OWNER
)
check("saving over a rule keeps its id", off["id"] == agent_rule["id"])
check("saving over a rule stamps changedBy", off["changedBy"] == OWNER)
check("a disabled rule stops matching", verdict(agent="x badbot y") is None)

matcher.set_settings({"enabled": False}, OWNER)
check("switching the firewall off stops everything", verdict(ip="198.51.100.7") is None)
matcher.set_settings({"enabled": True}, OWNER)
check("switching it back on restores it", verdict(ip="198.51.100.7")["action"] == "blocked")

print("\n=== the generated nginx config ===")

conf = matcher.nginx_conf()
check("the config declares the address map", "geo $amitista_fw_ip {" in conf)
check("the config carries the blocked range", "198.51.100.0/24 1;" in conf)
check("the config declares the verdict map", "$amitista_fw {" in conf)
check("the config declares the log format", "log_format amitista_fw" in conf)
check("regex keys are quoted so braces survive", '"~*' in conf)
check("no raw quote leaks into a regex key", "['\"]" not in conf)
check("a watching rule is marked 2", " 2;" in conf)
check("a disabled rule is left out", "badbot" not in conf)

empty = Firewall(os.path.join(workspace, "firewall-empty.json")).nginx_conf()
check("an empty firewall still declares every variable", empty.count("map ") >= 5)

print("\n=== events ===")

events = FirewallEvents(os.path.join(workspace, "events.jsonl"))
check("an empty log tails nothing", events.tail() == [])
events.record(verdict(ip="198.51.100.7"), {"ip": "198.51.100.7", "method": "GET", "target": "/", "agent": "curl"}, "DE")
tail = events.tail()
check("a recorded event comes back", len(tail) == 1)
check("the event names the rule", tail[0]["kind"] == "ip")
check("the event keeps the country", tail[0]["country"] == "DE")
check("the event is stamped", bool(tail[0]["at"]))

print("\n=== the catalogue ===")

catalogue = signature_catalogue()
check("every signature is described", len(catalogue) >= 6)
check("each entry says where it looks", all(entry["where"] in ("target", "path", "agent") for entry in catalogue))
check("each entry counts its patterns", all(entry["patterns"] > 0 for entry in catalogue))

print("\n=== over HTTP ===")

owner_session = sign_in(OWNER, OWNER_PASSWORD)
viewer_session = sign_in(VIEWER, VIEWER_PASSWORD)

status, _, raw, _ = request("GET", "/firewall")
check("the firewall needs a session", status == 401)

status, _, raw, _ = request("GET", "/firewall", cookie=viewer_session)
check("a viewer cannot read the firewall", status == 403)

status, _, raw, _ = request("GET", "/firewall", cookie=owner_session)
payload = as_json(raw)
check("the owner can read the firewall", status == 200)
check("the payload carries the rule list", payload.get("rules") == [])
check("the payload carries the signature catalogue", len(payload.get("signatures") or []) >= 6)
check("the payload says whether the caller can manage", payload.get("canManage") is True)
check("the payload reports the caller's address", bool(payload.get("you", {}).get("ip")))
check("the payload reports the edge state", "state" in (payload.get("edge") or {}))

status, _, raw, _ = request(
    "POST", "/firewall/rule", {"kind": "path", "value": "/wp-login.php", "mode": "block"}, cookie=viewer_session
)
check("a viewer cannot add a rule", status == 403)

status, _, raw, _ = request(
    "POST", "/firewall/rule", {"kind": "path", "value": "/wp-login.php", "mode": "block"}, cookie=owner_session
)
saved = as_json(raw).get("rule") or {}
check("the owner can add a rule", status == 200)
check("the saved rule comes back", saved.get("value") == "/wp-login.php")

status, _, raw, _ = request(
    "POST", "/firewall/rule", {"kind": "ip", "value": "999.1.1.1"}, cookie=owner_session
)
check("a bad value is refused over HTTP", status == 400)

status, _, raw, _ = request(
    "POST", "/firewall/rule", {"kind": "ip", "value": "127.0.0.1", "mode": "block"}, cookie=owner_session
)
check("a rule matching your own address is held back", status == 409)

status, _, raw, _ = request(
    "POST",
    "/firewall/rule",
    {"kind": "ip", "value": "127.0.0.1", "mode": "block", "force": True},
    cookie=owner_session,
)
check("force gets it through", status == 200)
lockout = as_json(raw).get("rule", {}).get("id")

status, _, raw, _ = request("POST", "/firewall/rule/delete", {"id": lockout}, cookie=owner_session)
check("the lockout rule can be removed again", status == 200)

status, _, raw, _ = request("POST", "/firewall/rule/delete", {"id": "nosuchrule"}, cookie=owner_session)
check("removing an unknown rule says so", status == 404)

status, _, raw, _ = request("POST", "/firewall/settings", {"defaultMode": "block"}, cookie=owner_session)
check("the default mode can be changed", as_json(raw).get("settings", {}).get("defaultMode") == "block")

status, _, raw, _ = request("POST", "/firewall/restage", {}, cookie=owner_session)
check("the edge config can be rewritten on demand", status == 200)
check("the staged config is on disk", os.path.exists(os.environ["ADMIN_FIREWALL_CONF"]))
staged = open(os.environ["ADMIN_FIREWALL_CONF"], encoding="utf-8").read()
check("the staged config carries the saved rule", "login" in staged)
check(
    "backslashes are doubled for nginx's quoted strings",
    '"~*/wp\\\\-login\\\\.php" 1;' in staged,
)

status, _, raw, _ = request(
    "POST", "/firewall/rule", {"kind": "path", "value": "/x"}, cookie=owner_session, origin="https://evil.example"
)
check("a foreign origin is refused", status == 403)

print("\n=== enforcement against the panel itself ===")

status, _, raw, _ = request(
    "POST", "/firewall/rule", {"kind": "signature", "value": "sqli", "mode": "block"}, cookie=owner_session
)
check("a signature rule can be added", status == 200)

status, _, raw, _ = request("GET", "/firewall", cookie=owner_session)
check("loopback is exempt from the firewall", status == 200)

print("\n=== the edge log reader ===")

with open(os.environ["ADMIN_FIREWALL_LOG"], "w", encoding="utf-8") as handle:
    handle.write(
        '203.0.113.9 01200 block [14/Aug/2026:11:02:03 +0000] "GET /wp-login.php" 403 "curl/8"\n'
        '198.51.100.4 00200 watch [14/Aug/2026:11:02:09 +0000] "GET /.env" 200 "python-requests/2"\n'
        "this line is not a log line\n"
    )

edge = admin_api.firewall_edge_events()
check("both log lines are read", len(edge) == 2)
check("rubbish lines are skipped", all(entry["ip"] for entry in edge))
check("the newest line comes first", edge[0]["ip"] == "198.51.100.4")
check("a block reads as blocked", edge[1]["action"] == "blocked")
check("a watch reads as observed", edge[0]["action"] == "observed")
check("the marks are decoded", edge[1]["matched"] == ["path", "signature"])
check("the timestamp is turned into UTC", edge[1]["at"] == "2026-08-14T11:02:03Z")

status, _, raw, _ = request("GET", "/firewall", cookie=owner_session)
merged = as_json(raw).get("events") or []
check("edge events reach the panel", any(entry["layer"] == "edge" for entry in merged))

actions = [entry["action"] for entry in admin_api.audit.tail(40)]
check("saving a rule is audited", "firewall.rule.saved" in actions)
check("removing a rule is audited", "firewall.rule.deleted" in actions)
check("a settings change is audited", "firewall.settings" in actions)

server.shutdown()

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
