#!/usr/bin/env python3

import http.client
import json
import os
import sys
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

BOT_TOKEN = "botctl-support-token"
DISCORD_ID = "412345678901234567"
OTHER_ID = "512345678901234567"
CHANNEL_ID = "912345678901234567"
GONE_ID = "912345678901234568"
AVATAR = "https://cdn.discordapp.com/avatars/%s/a.png?size=256" % DISCORD_ID

calls = []
bot_up = {"ok": True}

TICKET = {
    "id": CHANNEL_ID,
    "ref": "TCK-4821",
    "number": 4821,
    "category": "technical",
    "categoryLabel": "Technical Support",
    "subject": "The site returns a 502",
    "status": "open",
    "stage": "waiting",
    "stageLabel": "Waiting on you",
    "stageNote": "We need a reply before we can go further.",
    "priority": "high",
    "priorityLabel": "High",
    "claimed": True,
    "createdAt": 1786400000000,
    "closedAt": None,
    "closedReason": None,
    "via": "web",
    "channelGone": False,
    "notes": "Internal: this account is on the old plan.",
    "userAvatar": AVATAR,
}

STAFF_TICKET = dict(
    TICKET,
    user={"id": DISCORD_ID, "name": "someone", "tag": "someone#0"},
    claimedBy="612345678901234567",
    claimedByName="Nick",
    lastMessageAt=1786400002000,
    lastMessageBy="612345678901234567",
)

ORDER_TICKET = dict(
    STAFF_TICKET,
    id="912345678901234570",
    kind="order",
    ref="PRJ-7001",
    number=7001,
    category="order",
    categoryLabel="Project · Order",
    subject="Brand site",
    stage="build",
    stageLabel="In development",
    stageNote="Approved and actively being built.",
    priority=None,
    priorityLabel=None,
    via="discord",
)

ORDER_STAGES = [
    {"value": "new", "label": "New inquiry"},
    {"value": "review", "label": "In review"},
    {"value": "proposal", "label": "Proposal sent"},
    {"value": "build", "label": "In development"},
    {"value": "delivered", "label": "Delivered"},
]

CATEGORIES = [
    {
        "key": "technical",
        "label": "Technical Support",
        "short": "Technical",
        "blurb": "Bugs, downtime, errors, something broken",
        "confidential": False,
        "fields": [
            {"id": "subject", "label": "What's broken?", "max": 100, "required": True, "para": False},
            {"id": "details", "label": "What happens?", "max": 1000, "required": True, "para": True},
        ],
        "urgency": [
            {"value": "low", "label": "Low", "description": "A question."},
            {"value": "normal", "label": "Normal", "description": "The usual queue.", "default": True},
            {"value": "high", "label": "High", "description": "This is blocking me."},
            {"value": "urgent", "label": "Urgent", "description": "Something is down."},
        ],
        "checks": {
            "label": "What have you tried?",
            "hint": "Tick what applies.",
            "required": False,
            "options": [{"value": "reload", "label": "Refreshed the page"}],
        },
        "uploads": True,
    },
    {
        "key": "report",
        "label": "Report a User",
        "short": "Report",
        "blurb": "Private, senior staff only",
        "confidential": True,
        "fields": [{"id": "subject", "label": "Who?", "max": 100, "required": True, "para": False}],
        "urgency": None,
        "checks": {
            "label": "Before you send this",
            "required": True,
            "options": [{"value": "truthful", "label": "This is true"}],
        },
        "uploads": True,
    },
]

MESSAGES = [
    {
        "id": "922345678901234567",
        "at": 1786400001000,
        "authorId": DISCORD_ID,
        "author": "someone",
        "bot": False,
        "mine": True,
        "body": "Every page under /docs is 502ing.",
        "edited": False,
        "attachments": [
            {"name": "shot.png", "size": 4096, "kind": "image/png",
             "url": "https://cdn.discordapp.com/attachments/1/2/shot.png"},
        ],
    },
    {
        "id": "922345678901234568",
        "at": 1786400002000,
        "authorId": "612345678901234567",
        "author": "Nick",
        "bot": False,
        "mine": False,
        "body": "Looking now. Can you paste the error text?",
        "edited": True,
        "attachments": [],
    },
    {
        "id": "922345678901234569",
        "at": 1786400003000,
        "authorId": "1521865214184657016",
        "author": "Amitista Studios",
        "bot": True,
        "mine": False,
        "kind": "system",
        "body": "**Ticket closed**",
        "edited": False,
        "attachments": [],
    },
]


class FakeBot(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass

    def answer(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def route(self):
        return urllib.parse.urlparse(self.path).path.rstrip("/") or "/"

    def params(self):
        return urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)

    def do_GET(self):
        if self.headers.get("X-Amitista-Botctl") != BOT_TOKEN:
            return self.answer(401, {"message": "Blocked."})
        if not bot_up["ok"]:
            return self.answer(503, {"message": "The bot is still starting up."})

        route = self.route()
        query = self.params()
        calls.append((route, {key: value[0] for key, value in query.items()}))

        if route == "/support":
            if (query.get("user") or [""])[0] != DISCORD_ID:
                return self.answer(200, {"ok": True, "tickets": [], "categories": CATEGORIES})
            return self.answer(200, {
                "ok": True,
                "tickets": [TICKET, dict(TICKET, id=GONE_ID, ref="TCK-4700", status="closed",
                                         stage="resolved", closedAt=1786300000000,
                                         closedReason="Sorted", channelGone=True)],
                "open": 1,
                "closed": 1,
                "total": 2,
                "categories": CATEGORIES,
                "guild": {"id": "1526981578226663565", "name": "Amitista Studios"},
            })

        if route == "/support/ticket":
            if (query.get("id") or [""])[0] != CHANNEL_ID:
                return self.answer(404, {"message": "No ticket of yours has that reference."})
            return self.answer(200, {"ok": True, "ticket": TICKET, "messages": MESSAGES, "readable": True})

        if route == "/support/all":
            return self.answer(200, {
                "ok": True,
                "tickets": [STAFF_TICKET,
                            dict(STAFF_TICKET, id=GONE_ID, ref="TCK-4700", status="closed",
                                 stage="resolved", closedAt=1786300000000,
                                 closedReason="Sorted", channelGone=True),
                            ORDER_TICKET],
                "open": 2,
                "closed": 1,
                "unclaimed": 1,
                "awaiting": 0,
                "orderStages": ORDER_STAGES,
                "categories": CATEGORIES,
                "guild": {"id": "1526981578226663565", "name": "Amitista Studios"},
            })

        if route == "/support/all/ticket":
            if (query.get("id") or [""])[0] != CHANNEL_ID:
                return self.answer(404, {"message": "No ticket of yours has that reference."})
            return self.answer(200, {"ok": True, "ticket": STAFF_TICKET, "messages": MESSAGES, "readable": True})

        return self.answer(404, {"message": "Not found."})

    def do_POST(self):
        if self.headers.get("X-Amitista-Botctl") != BOT_TOKEN:
            return self.answer(401, {"message": "Blocked."})
        size = int(self.headers.get("Content-Length") or 0)
        data = json.loads(self.rfile.read(size) or b"{}")
        route = self.route()
        calls.append((route, data))

        if route == "/support/open":
            if not data.get("subject"):
                return self.answer(400, {"message": "What's broken? is needed."})
            return self.answer(200, {"ok": True, "ticket": dict(TICKET, subject=data["subject"])})

        if route == "/support/reply":
            if data.get("id") != CHANNEL_ID:
                return self.answer(404, {"message": "No ticket of yours has that reference."})
            return self.answer(200, {"ok": True, "id": "9", "ticket": dict(TICKET, stage="active",
                                                                          stageLabel="In progress")})

        if route == "/support/close":
            return self.answer(200, {"ok": True, "ticket": dict(TICKET, status="closed", stage="resolved",
                                                                closedAt=1786400009000,
                                                                closedReason=data.get("reason") or None)})

        if route == "/support/all/reply":
            if data.get("id") != CHANNEL_ID:
                return self.answer(404, {"message": "No ticket has that reference."})
            return self.answer(200, {"ok": True, "id": "9", "ticket": dict(STAFF_TICKET, stage="waiting")})

        if route == "/support/all/claim":
            if data.get("id") != CHANNEL_ID:
                return self.answer(404, {"message": "No ticket has that reference."})
            return self.answer(200, {"ok": True, "claimed": True,
                                     "ticket": dict(STAFF_TICKET, claimed=True, claimedBy=data.get("staff"))})

        if route == "/support/all/close":
            return self.answer(200, {"ok": True, "ticket": dict(STAFF_TICKET, status="closed", stage="resolved",
                                                                closedAt=1786400009000,
                                                                closedReason=data.get("reason") or None)})

        if route == "/support/all/status":
            return self.answer(200, {"ok": True, "ticket": dict(STAFF_TICKET, stage=data.get("status"))})

        if route == "/support/all/priority":
            return self.answer(200, {"ok": True, "ticket": dict(STAFF_TICKET, priority=data.get("priority"))})

        return self.answer(404, {"message": "Not found."})


bot_server = ThreadingHTTPServer(("127.0.0.1", 0), FakeBot)
threading.Thread(target=bot_server.serve_forever, daemon=True).start()

workspace = tempfile.mkdtemp(prefix="admin-support-flow-")
os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "3" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")
os.environ["ADMIN_ORIGIN"] = "https://amitista.com"
os.environ["ADMIN_RATE_PER_IP"] = "500"
os.environ["ADMIN_LOCKOUT_AFTER"] = "200"
os.environ["ADMIN_ACCOUNT_LOCKOUT_AFTER"] = "200"
os.environ["ADMIN_SUPPORT_WRITES"] = "25"
os.environ["ADMIN_BOT_URL"] = "http://127.0.0.1:%d" % bot_server.server_address[1]
os.environ["BOTCTL_TOKEN"] = BOT_TOKEN

import admin_api

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
    raw = response.read()
    out = (response.status, raw)
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
        "POST", "/api/admin/login",
        body=json.dumps({"username": name, "password": password}),
        headers={"Content-Type": "application/json", "Origin": ORIGIN},
    )
    response = connection.getresponse()
    response.read()
    for part in response.headers.get_all("Set-Cookie") or []:
        if part.startswith(admin_api.COOKIE_NAME + "="):
            connection.close()
            return part.split(";", 1)[0]
    raise SystemExit("could not sign in")


print("\n— before a Discord account is linked —")
owner = sign_in(OWNER, OWNER_PASSWORD)
status, raw = request("GET", "/account/support", cookie=owner)
body = as_json(raw)
check("the tab answers without a linked account", status == 200)
check("it says the account is not linked", body["discord"]["linked"] is False)
check("no tickets are claimed", body["tickets"] == [] and body["categories"] == [])
check("the bot was not called", not any(route.startswith("/support") for route, _ in calls))

status, raw = request("GET", "/account/support/ticket?id=%s" % CHANNEL_ID, cookie=owner)
check("reading a ticket needs a linked account", status == 400)
status, raw = request("POST", "/account/support/open", {"category": "technical"}, cookie=owner)
check("opening a ticket needs a linked account", status == 400)

print("\n— once Discord is linked —")
users.link_discord(OWNER, {"id": DISCORD_ID, "tag": "someone", "username": "someone",
                           "displayName": "Some One", "avatar": AVATAR})

status, raw = request("GET", "/account/support", cookie=owner)
body = as_json(raw)
check("the list comes back", status == 200 and len(body["tickets"]) == 2)
check("open and closed are counted", body["open"] == 1 and body["closed"] == 1)
check("the studio server is named", body["guild"]["name"] == "Amitista Studios")
check("the reference is carried", body["tickets"][0]["ref"] == "TCK-4821")
check("the stage is carried", body["tickets"][0]["stage"] == "waiting")
check("a gone channel is flagged", body["tickets"][1]["channelGone"] is True)
check("staff notes are stripped", "Internal:" not in raw.decode("utf-8"))
check("no Discord CDN address is handed over", "cdn.discordapp.com" not in raw.decode("utf-8"))
check("the bot was asked about the linked account only",
      calls[-1][1].get("user") == DISCORD_ID)

check("the form is offered", len(body["categories"]) == 2)
technical = body["categories"][0]
check("the fields are described", [f["id"] for f in technical["fields"]] == ["subject", "details"])
check("urgency is offered", len(technical["urgency"]) == 4)
check("the default urgency is marked", any(u["default"] for u in technical["urgency"]))
report = body["categories"][1]
check("a confidential category is marked", report["confidential"] is True)
check("a required declaration is marked", report["checks"]["required"] is True)

print("\n— reading one ticket —")
status, raw = request("GET", "/account/support/ticket?id=%s" % CHANNEL_ID, cookie=owner)
body = as_json(raw)
check("the conversation comes back", status == 200 and len(body["messages"]) == 3)
check("an ordinary message is marked as one", body["messages"][0]["kind"] == "message")
check("a bot notice is marked as a system line", body["messages"][2]["kind"] == "system")
check("an unknown kind is not invented", admin_api.support_message(dict(MESSAGES[0], kind="banner"))["kind"] == "message")
check("their own message is marked", body["messages"][0]["mine"] is True)
check("the staff reply is not", body["messages"][1]["mine"] is False)
check("an edit is marked", body["messages"][1]["edited"] is True)
check("attachments keep their name", body["messages"][0]["attachments"][0]["name"] == "shot.png")
check("attachment addresses are dropped",
      "url" not in body["messages"][0]["attachments"][0])
check("no CDN address survives the message sanitiser", "cdn.discordapp.com" not in raw.decode("utf-8"))
check("staff notes are stripped from the ticket too", "Internal:" not in raw.decode("utf-8"))

status, raw = request("GET", "/account/support/ticket?id=nonsense", cookie=owner)
check("a malformed ticket id is refused", status == 400)
status, raw = request("GET", "/account/support/ticket?id=999999999999999999", cookie=owner)
check("someone else's ticket is refused by the bot", status == 404)

print("\n— opening, replying, closing —")
status, raw = request("POST", "/account/support/open",
                      {"category": "technical", "subject": "It broke", "details": "All of it",
                       "urgency": "high", "checks": ["reload"]}, cookie=owner)
body = as_json(raw)
check("a ticket opens", status == 200 and body["ticket"]["subject"] == "It broke")
sent = [data for route, data in calls if route == "/support/open"][-1]
check("the bot is told the linked account", sent["user"] == DISCORD_ID)
check("the panel account is named as the actor", sent["actor"] == OWNER)
check("the answers are passed through", sent["subject"] == "It broke" and sent["details"] == "All of it")
check("the urgency is passed through", sent["urgency"] == "high")

status, raw = request("POST", "/account/support/open",
                      {"category": "technical", "user": OTHER_ID, "actor": "someone-else",
                       "subject": "Sneaky", "details": "x"}, cookie=owner)
sent = [data for route, data in calls if route == "/support/open"][-1]
check("a claimed user id is ignored", sent["user"] == DISCORD_ID)
check("a claimed actor is ignored", sent["actor"] == OWNER)

status, raw = request("POST", "/account/support/open", {"category": ""}, cookie=owner)
check("a missing category is refused", status == 400)
status, raw = request("POST", "/account/support/open",
                      {"category": "technical", "details": "no subject"}, cookie=owner)
check("the bot's own refusal is passed on", status == 400 and b"is needed" in raw)

status, raw = request("POST", "/account/support/reply",
                      {"id": CHANNEL_ID, "body": "  Here is the error  "}, cookie=owner)
body = as_json(raw)
check("a reply is sent", status == 200 and body["sent"] is True)
check("the new stage comes back", body["ticket"]["stage"] == "active")
sent = [data for route, data in calls if route == "/support/reply"][-1]
check("the reply is trimmed", sent["body"] == "Here is the error")

status, raw = request("POST", "/account/support/reply", {"id": CHANNEL_ID, "body": "   "}, cookie=owner)
check("an empty reply is refused", status == 400)
status, raw = request("POST", "/account/support/reply", {"id": "nope", "body": "hi"}, cookie=owner)
check("a malformed ticket id is refused on reply", status == 400)

status, raw = request("POST", "/account/support/close",
                      {"id": CHANNEL_ID, "reason": "Sorted,   thanks"}, cookie=owner)
body = as_json(raw)
check("the ticket closes", status == 200 and body["ticket"]["status"] == "closed")
sent = [data for route, data in calls if route == "/support/close"][-1]
check("the reason is tidied", sent["reason"] == "Sorted, thanks")

trail = [entry for entry in admin_api.audit.tail(50) if entry["action"].startswith("support.")]
check("opening is written to the audit log", any(e["action"] == "support.opened" for e in trail))
check("closing is written to the audit log", any(e["action"] == "support.closed" for e in trail))
check("replying is not", not any(e["action"] == "support.replied" for e in trail))

print("\n— the team queue —")
helper = sign_in(HELPER, HELPER_PASSWORD)
status, raw = request("GET", "/support/queue", cookie=helper)
check("a viewer cannot read the queue", status == 403)
status, raw = request("POST", "/support/queue/reply", {"id": CHANNEL_ID, "body": "hi"}, cookie=helper)
check("a viewer cannot answer for the team", status == 403)

status, raw = request("GET", "/support/queue", cookie=owner)
body = as_json(raw)
check("the queue comes back", status == 200 and len(body["tickets"]) == 3)
check("the queue counts open and closed", body["open"] == 2 and body["closed"] == 1)
check("the requester is named in the queue", body["tickets"][0]["user"]["id"] == DISCORD_ID)
check("the claimer is named in the queue", body["tickets"][0]["claimedByName"] == "Nick")
check("activity is stamped in the queue", body["tickets"][0]["lastMessageAt"] == 1786400002000)
check("support rows are marked as support", body["tickets"][0]["kind"] == "support")
order_row = next(r for r in body["tickets"] if r["kind"] == "order")
check("a project ticket rides along", order_row["ref"] == "PRJ-7001")
check("a project stage survives the sanitiser", order_row["stage"] == "build")
check("projects carry no priority", order_row["priority"] is None and order_row["priorityLabel"] is None)
check("the project stages are offered", {"value": "build", "label": "In development"} in body["orderStages"])
check("staff notes are stripped from the queue", "Internal:" not in raw.decode("utf-8"))
check("no CDN address reaches the queue", "cdn.discordapp.com" not in raw.decode("utf-8"))

status, raw = request("GET", "/support/queue/ticket?id=%s" % CHANNEL_ID, cookie=owner)
body = as_json(raw)
check("any ticket can be read from the queue", status == 200 and body["ticket"]["ref"] == "TCK-4821")
check("the conversation is carried", len(body["messages"]) == 3)
check("staff notes are stripped from a queue thread", "Internal:" not in raw.decode("utf-8"))
check("a staff echo keeps its marking", admin_api.support_message(dict(MESSAGES[1], staff=True))["staff"] is True)

status, raw = request("POST", "/support/queue/reply", {"id": CHANNEL_ID, "body": "  On it  "}, cookie=owner)
body = as_json(raw)
check("a team reply is sent", status == 200 and body["sent"] is True)
sent = [data for route, data in calls if route == "/support/all/reply"][-1]
check("the reply is trimmed and named", sent["body"] == "On it" and sent["name"] == OWNER)

status, raw = request("POST", "/support/queue/claim", {"id": CHANNEL_ID}, cookie=owner)
body = as_json(raw)
check("a linked staff account claims", status == 200 and body["claimed"] is True)
sent = [data for route, data in calls if route == "/support/all/claim"][-1]
check("the claim carries the linked id", sent["staff"] == DISCORD_ID)

users.create("deskhand", "admin", None, OWNER, password="quietharbour42", must_change=False)
desk = sign_in("deskhand", "quietharbour42")
status, raw = request("GET", "/support/queue", cookie=desk)
check("an admin reads the queue", status == 200)
status, raw = request("POST", "/support/queue/claim", {"id": CHANNEL_ID}, cookie=desk)
check("claiming without a linked Discord is refused", status == 403)
status, raw = request("POST", "/support/queue/reply", {"id": CHANNEL_ID, "body": "hello"}, cookie=desk)
check("answering needs no link", status == 200)

calls_before = len([1 for route, _ in calls if route == "/support/all/status"])
status, raw = request("POST", "/support/queue/status", {"id": CHANNEL_ID, "status": "sandwich"}, cookie=owner)
check("an unknown status is refused before the bot", status == 400)
check("the bot was not asked about it",
      len([1 for route, _ in calls if route == "/support/all/status"]) == calls_before)
status, raw = request("POST", "/support/queue/status", {"id": CHANNEL_ID, "status": "resolved"}, cookie=owner)
check("a status change is sent", status == 200 and as_json(raw)["ticket"]["stage"] == "resolved")
status, raw = request("POST", "/support/queue/status", {"id": CHANNEL_ID, "status": "build"}, cookie=owner)
check("a project stage passes the gate", status == 200)
status, raw = request("POST", "/support/queue/priority", {"id": CHANNEL_ID, "priority": "meh"}, cookie=owner)
check("an unknown priority is refused before the bot", status == 400)
status, raw = request("POST", "/support/queue/priority", {"id": CHANNEL_ID, "priority": "urgent"}, cookie=owner)
check("a priority change is sent", status == 200 and as_json(raw)["ticket"]["priority"] == "urgent")

status, raw = request("POST", "/support/queue/close", {"id": CHANNEL_ID, "reason": " done   now "}, cookie=owner)
body = as_json(raw)
check("the team closes a ticket", status == 200 and body["closed"] is True)
sent = [data for route, data in calls if route == "/support/all/close"][-1]
check("the close carries the staff id", sent.get("staff") == DISCORD_ID)
check("the close reason is tidied", sent["reason"] == "done now")

trail = [entry for entry in admin_api.audit.tail(80) if entry["action"].startswith("support.")]
check("the claim is audited", any(e["action"] == "support.claimed" for e in trail))
check("the team close is audited", any(e["action"] == "support.staffClosed" for e in trail))
check("the status change is audited", any(e["action"] == "support.status" for e in trail))

print("\n— limits and refusals —")
refused = 0
for _ in range(30):
    status, raw = request("POST", "/account/support/reply", {"id": CHANNEL_ID, "body": "again"}, cookie=owner)
    if status == 429:
        refused += 1
check("a flood of replies is rate limited", refused > 0)
check("the limit counts attempts, not just successes", refused >= 5)

status, raw = request("GET", "/account/support", cookie=owner)
check("reading is never rate limited by that", status == 200)

helper = sign_in(HELPER, HELPER_PASSWORD)
status, raw = request("GET", "/account/support", cookie=helper)
body = as_json(raw)
check("another account sees its own empty tab", status == 200 and body["discord"]["linked"] is False)
status, raw = request("POST", "/account/support/reply", {"id": CHANNEL_ID, "body": "not mine"}, cookie=helper)
check("an unlinked account cannot reply to anything", status == 400)

status, raw = request("GET", "/account/support")
check("a stranger gets nothing", status == 401)
status, raw = request("POST", "/account/support/open", {"category": "technical"}, cookie=owner, origin="https://evil.example")
check("a cross-site write is refused", status == 403)

print("\n— when the bot is down —")
bot_up["ok"] = False
status, raw = request("GET", "/account/support", cookie=owner)
body = as_json(raw)
check("the tab still answers", status == 200)
check("it says why instead of failing", isinstance(body["botDown"], str) and body["botDown"])
check("the account is still shown as linked", body["discord"]["linked"] is True)
status, raw = request("GET", "/support/queue", cookie=owner)
body = as_json(raw)
check("the queue still answers", status == 200)
check("the queue says why instead of failing", isinstance(body["botDown"], str) and body["botDown"])
bot_up["ok"] = True

print("\n%d checks, %d failed" % (total, len(failures)))
for entry in failures:
    print("  FAILED: %s" % entry)
sys.exit(1 if failures else 0)
