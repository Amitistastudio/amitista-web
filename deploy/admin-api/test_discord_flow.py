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

BOT_TOKEN = "botctl-test-token"
DISCORD_ID = "412345678901234567"
AVATAR = "https://cdn.discordapp.com/avatars/%s/a.png?size=256" % DISCORD_ID
BANNER = "https://cdn.discordapp.com/banners/%s/b.png?size=512" % DISCORD_ID
BOT_ID = "1521865214184657016"

calls = []
bot_state = {
    "status": "waiting",
    "account": None,
    "code": None,
    "user": {
        "id": DISCORD_ID,
        "tag": "someone",
        "username": "someone",
        "displayName": "Some One",
        "avatar": AVATAR,
    },
    "rename": {"ok": True, "nickname": "Some One", "displayName": "Some One"},
}

CARD = {
    "id": BOT_ID,
    "tag": "Amitista Studios®#5494",
    "username": "Amitista Studios®",
    "avatar": "https://cdn.discordapp.com/avatars/%s/bot.png?size=128" % BOT_ID,
    "profile": "https://discord.com/users/%s" % BOT_ID,
    "guild": {"id": "1526981578226663565", "name": "Amitista Studios®", "icon": None},
}


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

    def do_GET(self):
        if self.headers.get("X-Amitista-Botctl") != BOT_TOKEN:
            return self.answer(403, {"message": "Blocked."})
        route = self.route()
        calls.append((route, None))

        if route == "/link/bot":
            return self.answer(200, {"bot": CARD})

        if route == "/link":
            if bot_state["status"] == "missing":
                return self.answer(200, {"status": "missing"})
            return self.answer(200, {
                "bot": CARD,
                "status": bot_state["status"],
                "code": bot_state["code"],
                "account": bot_state["account"],
                "expires": 0,
                "user": bot_state["user"] if bot_state["status"] != "waiting" else None,
            })

        if route == "/link/profile":
            return self.answer(200, {
                "ok": True,
                "bot": CARD,
                "user": dict(bot_state["user"], banner=BANNER, decoration=None,
                             accent="#5865f2", createdAt=1654103754805),
                "member": {
                    "present": True,
                    "nickname": bot_state["rename"]["nickname"],
                    "displayName": bot_state["rename"]["displayName"],
                    "avatar": AVATAR,
                    "joinedAt": 1750000000000,
                    "boostingSince": None,
                    "timedOutUntil": None,
                    "renameable": True,
                    "roles": [
                        {"id": "r1", "name": "Developer", "colour": "#7c3aed"},
                        {"id": "r2", "name": "Member", "colour": "not-a-colour"},
                    ],
                },
                "standing": {"level": 16, "into": 801, "needed": 2180, "xp": 14601,
                             "msgs": 85, "voiceMin": 2578, "reacts": 0, "rank": 2, "of": 15},
                "guild": CARD["guild"],
            })

        return self.answer(404, {"message": "Not found."})

    def do_POST(self):
        if self.headers.get("X-Amitista-Botctl") != BOT_TOKEN:
            return self.answer(403, {"message": "Blocked."})
        size = int(self.headers.get("Content-Length") or 0)
        data = json.loads(self.rfile.read(size) or b"{}")
        route = self.route()
        calls.append((route, data))

        if route == "/link/open":
            bot_state.update({"status": "waiting", "account": data.get("account"), "code": data.get("code")})
            return self.answer(200, {"ok": True, "code": data.get("code"), "expires": data.get("expires"), "bot": CARD})

        if route in ("/link/close", "/link/cancel"):
            bot_state.update({"status": "missing", "account": None, "code": None})
            return self.answer(200, {"ok": True, "dropped": True})

        if route == "/link/nickname":
            if not bot_state["rename"]["ok"]:
                return self.answer(403, {"message": "Their roles sit above mine, so I cannot rename them."})
            bot_state["rename"]["nickname"] = data.get("nickname") or None
            bot_state["rename"]["displayName"] = data.get("nickname") or "Some One"
            return self.answer(200, {"ok": True, **bot_state["rename"]})

        if route in ("/link/notify", "/link/events"):
            return self.answer(200, {"ok": True, "delivered": True})

        return self.answer(404, {"message": "Not found."})


bot_server = ThreadingHTTPServer(("127.0.0.1", 0), FakeBot)
threading.Thread(target=bot_server.serve_forever, daemon=True).start()

workspace = tempfile.mkdtemp(prefix="admin-discord-flow-")
os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "2" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")
os.environ["ADMIN_ORIGIN"] = "https://amitista.com"
os.environ["ADMIN_RATE_PER_IP"] = "500"
os.environ["ADMIN_LOCKOUT_AFTER"] = "200"
os.environ["ADMIN_ACCOUNT_LOCKOUT_AFTER"] = "200"
os.environ["ADMIN_BOT_URL"] = "http://127.0.0.1:%d" % bot_server.server_address[1]
os.environ["BOTCTL_TOKEN"] = BOT_TOKEN

import admin_api
import admin_hooks

ORIGIN = "https://amitista.com"
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
HELPER = "helper"
HELPER_PASSWORD = "secondaccount42"

admin_api.fetch_art = lambda url: ("image/png", b"\x89PNG-pretend-%s" % url.encode()[:20])

posted = []


def fake_send(hook, events, test=False):
    posted.append(("hook", hook, list(events), test))
    return 204


def fake_send_embed(hook, events, test=False):
    posted.append(("embed", hook, list(events), test))
    return 204


admin_hooks.send = fake_send
admin_hooks.send_embed = fake_send_embed

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


session = sign_in(OWNER, OWNER_PASSWORD)

print("=== the tab opens before anything is linked ===")
status, _, raw, _ = request("POST", "/account/discord/profile", {}, cookie=session)
body = as_json(raw)
check("the profile endpoint answers", status == 200)
check("nothing is linked yet", body["discord"]["linked"] is False)
check("it names the bot to DM", body["bot"]["username"] == "Amitista Studios®")
check("with a link to its profile", body["bot"]["profile"].endswith(BOT_ID))
check("and no profile to draw", body["profile"] is None)
check("a signed-out visitor gets nothing", request("POST", "/account/discord/profile", {})[0] == 401)

print()
print("=== asking for a code ===")
status, _, raw, _ = request("POST", "/account/discord/start", {"password": "wrong"}, cookie=session)
check("the wrong password is refused", status == 403)
status, _, raw, _ = request("POST", "/account/discord/start", {}, cookie=session)
check("no password at all is refused", status == 400)
status, _, raw, _ = request("POST", "/account/discord/start", {"password": OWNER_PASSWORD}, cookie=session)
body = as_json(raw)
check("the right password gets a code", status == 200)
check("the code is spaced for reading", len(body["code"]) == 9 and body["code"][4] == "-")
check("it comes with the bot card", body["bot"]["id"] == BOT_ID)
check("the bot was told to expect it", any(route == "/link/open" for route, _ in calls))
opened = [data for route, data in calls if route == "/link/open"][-1]
check("under this account's name", opened["account"] == OWNER)
check("the code the bot holds has no dash", "-" not in opened["code"])

print()
print("=== waiting on the DM ===")
status, _, raw, _ = request("POST", "/account/discord/check", {}, cookie=session)
body = as_json(raw)
check("the panel reports it waiting", body["status"] == "waiting")
check("and shows nobody yet", body["user"] is None)

bot_state["status"] = "seen"
status, _, raw, _ = request("POST", "/account/discord/check", {}, cookie=session)
body = as_json(raw)
check("once the DM lands it says so", body["status"] == "seen")
check("and names who sent it", body["user"]["tag"] == "someone")
check("still not linked", body["discord"]["linked"] is False)

print()
print("=== confirming links it ===")
bot_state["status"] = "confirmed"
status, _, raw, _ = request("POST", "/account/discord/check", {}, cookie=session)
body = as_json(raw)
check("the panel finishes the link", body["status"] == "linked")
check("the account carries the Discord id", body["discord"]["id"] == DISCORD_ID)
check("and the tag", body["discord"]["tag"] == "someone")
closed = [data for route, data in calls if route == "/link/close"]
check("the bot was told it went through", closed and closed[-1]["ok"] is True)
check("the account endpoint agrees", as_json(request("GET", "/account", cookie=session)[2])["discord"]["linked"] is True)

status, _, raw, _ = request("POST", "/account/discord/check", {}, cookie=session)
check("a second check has nothing left to do", as_json(raw)["status"] == "idle")
status, _, raw, _ = request("POST", "/account/discord/start", {"password": OWNER_PASSWORD}, cookie=session)
check("and you cannot link twice", status == 400)

print()
print("=== the same Discord account cannot go to two panel accounts ===")
helper = sign_in(HELPER, HELPER_PASSWORD)
request("POST", "/account/discord/start", {"password": HELPER_PASSWORD}, cookie=helper)
bot_state["status"] = "confirmed"
bot_state["account"] = HELPER
status, _, raw, _ = request("POST", "/account/discord/check", {}, cookie=helper)
check("the second account is refused", status == 400)
check("with a message naming the holder", OWNER in as_json(raw).get("message", ""))
check("and helper stays unlinked", as_json(request("POST", "/account/discord/profile", {}, cookie=helper)[2])["discord"]["linked"] is False)
refused = [data for route, data in calls if route == "/link/close"][-1]
check("the bot is told it failed", refused["ok"] is False)

print()
print("=== the profile the tab draws ===")
status, _, raw, _ = request("POST", "/account/discord/profile", {}, cookie=session)
body = as_json(raw)
profile = body["profile"]
check("it answers", status == 200)
check("the art is reported as flags, never URLs", profile["art"] == {"avatar": True, "banner": True, "decoration": False, "member": True})
check("no Discord CDN address reaches the browser", "cdn.discordapp.com" not in raw.decode("utf-8"))
check("roles come through", [role["name"] for role in profile["member"]["roles"]] == ["Developer", "Member"])
check("a real colour is kept", profile["member"]["roles"][0]["colour"] == "#7c3aed")
check("a bogus colour is dropped", profile["member"]["roles"][1]["colour"] is None)
check("the level is carried", profile["standing"]["level"] == 16)
check("and the rank", profile["standing"]["rank"] == 2)
check("the guild is named", profile["guild"]["name"] == "Amitista Studios®")
check("the stored snapshot was refreshed", bool(body["discord"]["seen"]))

print()
print("=== artwork comes from the panel, not Discord ===")
status, headers, raw, _ = request("GET", "/account/discord/image?kind=avatar", cookie=session)
check("the avatar is served", status == 200)
check("as an image", headers.get("Content-Type") == "image/png")
check("with something in it", len(raw) > 4)
check("it is not cached publicly", "private" in headers.get("Cache-Control", ""))
check("sniffing is off", headers.get("X-Content-Type-Options") == "nosniff")
check("the banner too", request("GET", "/account/discord/image?kind=banner", cookie=session)[0] == 200)
check("the bot's own avatar too", request("GET", "/account/discord/image?kind=bot", cookie=session)[0] == 200)
check("a kind that does not exist is refused", request("GET", "/account/discord/image?kind=passwd", cookie=session)[0] == 404)
check("a missing one is refused", request("GET", "/account/discord/image?kind=decoration", cookie=session)[0] == 404)
check("and a signed-out visitor gets nothing", request("GET", "/account/discord/image?kind=avatar")[0] == 401)
check("another account cannot read yours", request("GET", "/account/discord/image?kind=avatar", cookie=helper)[0] == 400)

status, headers, raw, _ = request("GET", "/boards/face?name=%s" % OWNER, cookie=helper)
check("a board face is the linked Discord avatar", status == 200 and len(raw) > 4)
check("served as an image", headers.get("Content-Type") == "image/png")

print()
print("=== renaming ===")
status, _, raw, _ = request("POST", "/account/discord/nickname", {"nickname": "  Blxr   Dev "}, cookie=session)
body = as_json(raw)
check("the panel takes it", status == 200)
check("and squashes the spacing", body["nickname"] == "Blxr Dev")
sent = [data for route, data in calls if route == "/link/nickname"][-1]
check("the bot was told who to rename", sent["user"] == DISCORD_ID)
check("and who asked", sent["actor"] == OWNER)
check("a nickname is cut to Discord's limit", len(as_json(request("POST", "/account/discord/nickname", {"nickname": "x" * 90}, cookie=session)[2])["nickname"]) == 32)
bot_state["rename"]["ok"] = False
status, _, raw, _ = request("POST", "/account/discord/nickname", {"nickname": "nope"}, cookie=session)
check("a refusal from Discord is passed on", status == 403)
check("in the bot's own words", "above mine" in as_json(raw).get("message", ""))
bot_state["rename"]["ok"] = True
check("an unlinked account cannot rename", request("POST", "/account/discord/nickname", {"nickname": "x"}, cookie=helper)[0] == 400)

print()
print("=== what the bot may DM you ===")
status, _, raw, _ = request("POST", "/account/discord/prefs", {"prefs": {"signin": True, "events": ["denied", "invented"]}}, cookie=session)
body = as_json(raw)
check("preferences save", status == 200)
check("the flag asked for is on", body["discord"]["prefs"]["signin"] is True)
check("the events asked for are kept", body["discord"]["prefs"]["events"] == ["denied"])
check("and invented ones are dropped", "invented" not in body["discord"]["prefs"]["events"])
check("preferences must be an object", request("POST", "/account/discord/prefs", {"prefs": "yes"}, cookie=session)[0] == 400)
check("an unlinked account has none to set", request("POST", "/account/discord/prefs", {"prefs": {}}, cookie=helper)[0] == 400)

before = len([1 for route, _ in calls if route == "/link/notify"])
check("an opted-in notice is delivered", admin_api.dm_account(OWNER, "signin", "Signed in somewhere new", [("Address", "203.0.113.7")]) is True)
sent = [data for route, data in calls if route == "/link/notify"][-1]
check("addressed to the linked account", sent["user"] == DISCORD_ID)
check("carrying the title", sent["title"] == "Signed in somewhere new")
check("an opted-out notice is not sent", admin_api.dm_account(OWNER, "keys", "Nope", []) is False)
check("nor one for an unlinked account", admin_api.dm_account(HELPER, "signin", "Nope", []) is False)
check("and no extra DMs went out", len([1 for route, _ in calls if route == "/link/notify"]) == before + 1)

print()
print("=== unlinking ===")
check("the wrong password is refused", request("POST", "/account/discord/unlink", {"password": "wrong"}, cookie=session)[0] == 403)
status, _, raw, _ = request("POST", "/account/discord/unlink", {"password": OWNER_PASSWORD}, cookie=session)
check("the right one unlinks", status == 200)
check("and the account is clear", as_json(raw)["discord"]["linked"] is False)
check("unlinking twice is refused", request("POST", "/account/discord/unlink", {"password": OWNER_PASSWORD}, cookie=session)[0] == 400)
check("the artwork goes with it", request("GET", "/account/discord/image?kind=avatar", cookie=session)[0] == 400)

print()
print("=== the embed you design ===")
DESIGN = {
    "title": "API — {event}",
    "colour": "#7c3aed",
    "body": "{summary}",
    "fields": [{"label": "Key", "value": "{key}"}, {"label": "From", "value": "{ip}"}],
    "footer": "amitista.com",
    "perEvent": True,
}
sample = admin_hooks.sample_event(OWNER)
drawn = admin_hooks.as_embed(DESIGN, [sample], False)
embed = drawn["embeds"][0]
check("the colour is a Discord integer", embed["color"] == 0x7C3AED)
check("the title placeholder is filled", embed["title"] == "API — Key used from a new address")
check("the description too", embed["description"] == admin_hooks.describe(sample))
check("fields carry their values", embed["fields"][0]["value"] == sample["key"])
check("and the address", embed["fields"][1]["value"] == sample["ip"])
check("the footer is set", embed["footer"]["text"] == "amitista.com")
check("mentions are off", drawn["allowed_mentions"] == {"parse": []})
check("a test send says so", admin_hooks.as_embed(DESIGN, [sample], True)["embeds"][0]["title"].startswith("Test —"))
check("an unknown placeholder is left alone", admin_hooks.as_embed(dict(DESIGN, title="{nope}"), [sample], False)["embeds"][0]["title"] == "{nope}")
many = admin_hooks.as_embed(DESIGN, [sample] * 12, False)
check("no more than ten embeds go out", len(many["embeds"]) == 11)
check("with the rest counted", many["embeds"][-1]["title"] == "and 2 more")
one = admin_hooks.as_embed(dict(DESIGN, perEvent=False, body="{count} things"), [sample] * 12, False)
check("one embed for the batch when asked", len(one["embeds"]) == 1)
check("and it can count them", one["embeds"][0]["description"] == "12 things")
check("a long title is cut to Discord's limit", len(admin_hooks.as_embed(dict(DESIGN, title="x" * 400), [sample], False)["embeds"][0]["title"]) == 256)

status, _, raw, _ = request("POST", "/keys/embed/preview", {"template": DESIGN}, cookie=session)
check("the panel can preview it", status == 200)
check("the preview is what would be sent", as_json(raw)["preview"]["embeds"][0]["title"] == "API — Key used from a new address")
check("a bad colour is refused", request("POST", "/keys/embed/preview", {"template": dict(DESIGN, colour="purple")}, cookie=session)[0] == 400)
check("too many fields are refused", request("POST", "/keys/embed/preview", {"template": dict(DESIGN, fields=[{"label": "a", "value": "b"}] * 11)}, cookie=session)[0] == 400)
check("an empty design is refused", request("POST", "/keys/embed/preview", {"template": {"title": "", "body": "", "fields": []}}, cookie=session)[0] == 400)

print()
print("=== the second webhook ===")
WEBHOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnop"
check("a non-Discord address is refused", request("POST", "/keys/embed", {"url": "https://example.com/hook", "template": DESIGN, "events": ["denied"]}, cookie=session)[0] == 400)
check("so is a Discord page that is not a webhook", request("POST", "/keys/embed", {"url": "https://discord.com/channels/1/2", "template": DESIGN, "events": ["denied"]}, cookie=session)[0] == 400)
check("and one with no events", request("POST", "/keys/embed", {"url": WEBHOOK, "template": DESIGN, "events": []}, cookie=session)[0] == 400)
status, _, raw, _ = request("POST", "/keys/embed", {"url": WEBHOOK, "template": DESIGN, "events": ["denied", "revoked"], "enabled": True}, cookie=session)
body = as_json(raw)["embed"]
check("a Discord webhook is taken", status == 200)
check("it is configured and on", body["configured"] and body["enabled"])
check("with the events asked for", body["events"] == ["denied", "revoked"])
check("and the design saved", body["template"]["title"] == "API — {event}")
check("the first webhook is untouched", as_json(request("GET", "/key-events", cookie=session)[2])["webhook"]["configured"] is False)

before = len(posted)
status, _, raw, _ = request("POST", "/keys/embed/test", {}, cookie=session)
check("a test send goes out", as_json(raw)["sent"] is True)
check("through the embed sender", posted[-1][0] == "embed" and posted[-1][3] is True)
check("and is counted", as_json(raw)["embed"]["sent"] == 1)

print()
print("=== one event, three destinations ===")
users.link_discord(OWNER, {"id": DISCORD_ID, "tag": "someone", "username": "someone", "displayName": "Some One"})
request("POST", "/keys/webhook", {"format": "discord", "url": WEBHOOK, "events": ["denied"], "enabled": True}, cookie=session)
request("POST", "/account/discord/prefs", {"prefs": {"signin": False, "events": ["denied"]}}, cookie=session)
admin_api.hooks.forget()
posted.clear()
calls.clear()
admin_api.hooks.notify({"at": "2026-08-11T13:00:00Z", "kind": "denied", "id": "k1", "key": "live key",
                        "owner": OWNER, "ip": "203.0.113.9", "method": "GET", "path": "/v1/status", "status": 403})
admin_api.hooks._round()
kinds = sorted(entry[0] for entry in posted)
check("the plain webhook fired", "hook" in kinds)
check("the embed webhook fired", "embed" in kinds)
dmed = [data for route, data in calls if route == "/link/events"]
check("and the DM went out", len(dmed) == 1)
check("to the linked account", dmed[0]["user"] == DISCORD_ID)
check("naming what happened", dmed[0]["events"][0]["label"] == "Scope refused")
check("with the detail", "203.0.113.9" in dmed[0]["events"][0]["summary"])

posted.clear()
calls.clear()
admin_api.hooks.notify({"at": "2026-08-11T13:01:00Z", "kind": "used", "id": "k1", "key": "live key",
                        "owner": OWNER, "ip": "203.0.113.9", "path": "/v1/status", "status": 200})
admin_api.hooks._round()
check("an event nobody asked for goes nowhere", not posted and not [1 for route, _ in calls if route == "/link/events"])

request("POST", "/account/discord/prefs", {"prefs": {"signin": False, "events": []}}, cookie=session)
admin_api.hooks.forget()
posted.clear()
calls.clear()
admin_api.hooks.notify({"at": "2026-08-11T13:02:00Z", "kind": "denied", "id": "k1", "key": "live key",
                        "owner": OWNER, "ip": "203.0.113.9", "path": "/v1/status", "status": 403})
admin_api.hooks._round()
check("turning the DMs off stops them", not [1 for route, _ in calls if route == "/link/events"])
check("while the webhooks keep going", len(posted) == 2)

status, _, raw, _ = request("POST", "/keys/embed/delete", {}, cookie=session)
check("the embed webhook can be removed", as_json(raw)["embed"]["configured"] is False)

print()
print("=== the panel keeps its guards ===")
check("cross-site posts are refused", request("POST", "/account/discord/start", {"password": OWNER_PASSWORD}, cookie=session, origin="https://evil.example")[0] == 403)
check("an owner can clear someone else's link", request("POST", "/users/discord/clear", {"name": HELPER}, cookie=session)[0] == 400)

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
