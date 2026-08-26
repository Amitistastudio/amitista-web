#!/usr/bin/env python3

import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import admin_hooks

from admin_store import HOOK_FAIL_LIMIT, StoreError, Users, check_hook_url

workspace = tempfile.mkdtemp(prefix="admin-hooks-test-")
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
DISCORD = "https://discord.com/api/webhooks/123/abcdef"
SLACK = "https://hooks.slack.com/services/T0/B0/xyz"
PLAIN = "https://hooks.example.com/amitista"

users = Users(os.path.join(workspace, "users.json"))
users.bootstrap_owner(OWNER, OWNER_PASSWORD)

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    if not condition:
        failures.append(label)
    print("[%s] %s" % ("PASS" if condition else "FAIL", label))


def refuses(label, call):
    try:
        call()
    except StoreError:
        check(label, True)
        return
    except admin_hooks.HookError:
        check(label, True)
        return
    check(label, False)


check("a discord webhook is accepted", check_hook_url(DISCORD, "discord") == DISCORD)
check("a slack webhook is accepted", check_hook_url(SLACK, "slack") == SLACK)
check("a plain https endpoint is accepted", check_hook_url(PLAIN, "generic") == PLAIN)

refuses("http is refused", lambda: check_hook_url("http://hooks.example.com/x", "generic"))
refuses("a bare address is refused", lambda: check_hook_url("https://127.0.0.1/x", "generic"))
refuses("an ipv6 literal is refused", lambda: check_hook_url("https://[::1]/x", "generic"))
refuses("a non-standard port is refused", lambda: check_hook_url("https://example.com:8080/x", "generic"))
refuses("credentials in the address are refused", lambda: check_hook_url("https://a:b@example.com/x", "generic"))
refuses("a .local host is refused", lambda: check_hook_url("https://box.local/x", "generic"))
refuses("a bare hostname is refused", lambda: check_hook_url("https://localhost/x", "generic"))
refuses("a discord hook must be discord", lambda: check_hook_url(PLAIN, "discord"))
refuses("a slack hook must be slack", lambda: check_hook_url(PLAIN, "slack"))
refuses("a discord address must be a webhook path", lambda: check_hook_url("https://discord.com/x", "discord"))
refuses("an empty address is refused", lambda: check_hook_url("", "generic"))
refuses("an over-long address is refused", lambda: check_hook_url("https://example.com/" + ("a" * 600), "generic"))

refuses("loopback by name is refused at send time", lambda: admin_hooks.reachable("localhost"))
refuses("a private address is refused at send time", lambda: admin_hooks.reachable("localtest.me"))
refuses("a name that does not resolve is refused", lambda: admin_hooks.reachable("nothing.invalid"))

state = users.set_hook(OWNER, "discord", DISCORD, ["denied", "limited", "nonsense"])
check("the hook is stored", state["configured"] is True)
check("the format is kept", state["format"] == "discord")
check("unknown event names are dropped", state["events"] == ["denied", "limited"])
check("a discord hook hides the signing secret", state["secret"] is None)
check("it starts enabled", state["enabled"] is True)

refuses("an empty event list is refused", lambda: users.set_hook(OWNER, "discord", DISCORD, []))
refuses("a bad format is refused", lambda: users.set_hook(OWNER, "carrier-pigeon", DISCORD, ["denied"]))

plain = users.set_hook(OWNER, "generic", PLAIN, ["changed"])
check("a plain hook gets a signing secret", isinstance(plain["secret"], str) and len(plain["secret"]) > 20)
check("changing the address resets the counters", plain["sent"] == 0)

kept = plain["secret"]
again = users.set_hook(OWNER, "generic", PLAIN, ["changed", "denied"])
check("the secret survives an edit", again["secret"] == kept)

users.note_hook(OWNER, True)
check("a delivery is counted", users.hook_state(OWNER)["sent"] == 1)
users.note_hook(OWNER, False, "The endpoint answered 500.")
state = users.hook_state(OWNER)
check("a failure is counted", state["failures"] == 1)
check("the failure reason is kept", state["lastError"] == "The endpoint answered 500.")
users.note_hook(OWNER, True)
check("a success clears the failures", users.hook_state(OWNER)["failures"] == 0)

for _ in range(HOOK_FAIL_LIMIT):
    users.note_hook(OWNER, False, "nope")
state = users.hook_state(OWNER)
check("repeated failures pause the hook", state["paused"] is True)
check("a paused hook stops sending", state["enabled"] is False)
check("a paused hook is not listed for delivery", users.hooks() == [])

users.set_hook(OWNER, "generic", PLAIN, ["changed", "unknown"])
listed = users.hooks()
check("saving again clears the pause", len(listed) == 1)
check("the owner's permissions come with it", "api.read" in listed[0]["permissions"])

event = {
    "at": "2026-08-08T12:00:00Z",
    "kind": "denied",
    "id": "abc123",
    "key": "CI reader",
    "owner": OWNER,
    "ip": "203.0.113.7",
    "method": "GET",
    "path": "/v1/status",
    "status": 403,
}

discord = admin_hooks.build("discord", [event], False)
check("discord gets one embed per event", len(discord["embeds"]) == 1)
check("discord never pings anyone", discord["allowed_mentions"] == {"parse": []})
check("discord carries the address", any(f["value"] == "203.0.113.7" for f in discord["embeds"][0]["fields"]))

slack = admin_hooks.build("slack", [event], False)
check("slack has a text fallback", "203.0.113.7" in slack["text"])
check("slack has blocks", len(slack["blocks"]) == 2)

generic = admin_hooks.build("generic", [event], False)
check("a plain payload keeps the raw event", generic["events"][0]["ip"] == "203.0.113.7")
check("a plain payload counts them", generic["count"] == 1)

many = [dict(event, at="2026-08-08T12:00:%02dZ" % index) for index in range(14)]
check("discord caps the embeds", len(admin_hooks.build("discord", many, False)["embeds"]) == 11)
check("discord says how many were left out", admin_hooks.build("discord", many, False)["embeds"][-1]["title"] == "and 4 more")
check("slack says how many were left out", "and 4 more" in admin_hooks.build("slack", many, False)["text"])
check("a plain payload keeps them all", len(admin_hooks.build("generic", many, False)["events"]) == 14)

signature = admin_hooks.sign("topsecret", b'{"a":1}')
check("the signature is prefixed", signature.startswith("sha256="))
check("the signature changes with the body", admin_hooks.sign("topsecret", b'{"a":2}') != signature)
check("no secret means no signature", admin_hooks.sign(None, b"{}") is None)

events_path = os.path.join(workspace, "events.jsonl")
with open(events_path, "w", encoding="utf-8") as handle:
    handle.write(json.dumps({"at": "2026-08-08T12:00:00Z", "kind": "used", "owner": OWNER}) + "\n")
    handle.write("not json at all\n")
    handle.write(json.dumps({"at": "2026-08-08T12:00:01Z", "kind": "nonsense", "owner": OWNER}) + "\n")
    handle.write(json.dumps({"at": "2026-08-08T12:00:02Z", "kind": "denied", "owner": OWNER}) + "\n")

read = admin_hooks.read_events(events_path)
check("rubbish lines are skipped", len(read) == 2)
check("unknown kinds are skipped", all(entry["kind"] in ("used", "denied") for entry in read))
check("the newest is first", read[0]["kind"] == "denied")
check("a missing file reads as empty", admin_hooks.read_events(os.path.join(workspace, "nope.jsonl")) == [])

runner = admin_hooks.Runner(events_path, users)
runner.offset = 0
fresh = runner._fresh_lines()
check("the runner reads what was written", len(fresh) == 3)
check("the runner does not re-read", runner._fresh_lines() == [])

torn = os.path.join(workspace, "torn.jsonl")
whole = json.dumps({"at": "2026-08-08T12:00:00Z", "kind": "denied", "owner": OWNER})
half = json.dumps({"at": "2026-08-08T12:00:01Z", "kind": "limited", "owner": OWNER})
with open(torn, "w", encoding="utf-8") as handle:
    handle.write(whole + "\n")
    handle.write(half[:20])

tailing = admin_hooks.Runner(torn, users)
tailing.offset = 0
check("a half-written line is left alone", [e["kind"] for e in tailing._fresh_lines()] == ["denied"])
with open(torn, "a", encoding="utf-8") as handle:
    handle.write(half[20:] + "\n")
check("it is read once it is finished", [e["kind"] for e in tailing._fresh_lines()] == ["limited"])
check("and not a third time", tailing._fresh_lines() == [])

holders = users.hooks()
mine = {"kind": "changed", "owner": OWNER, "at": "2026-08-08T13:00:00Z"}
theirs = {"kind": "changed", "owner": "someone-else", "at": "2026-08-08T13:00:00Z"}
unwanted = {"kind": "used", "owner": OWNER, "at": "2026-08-08T13:00:00Z"}
orphan = {"kind": "unknown", "owner": None, "at": "2026-08-08T13:00:00Z"}

check("an owner gets their own event", len(runner._recipients(holders, mine)) == 1)
check("nobody gets somebody else's event", runner._recipients(holders, theirs) == [])
check("an unticked kind is not sent", runner._recipients(holders, unwanted) == [])
check("an unowned event reaches an api admin", len(runner._recipients(holders, orphan)) == 1)

budget = admin_hooks.Budget(limit=2, window=300)
check("the first send is allowed", budget.take(OWNER) is True)
check("the second send is allowed", budget.take(OWNER) is True)
check("the third is held back", budget.take(OWNER) is False)
check("another account is unaffected", budget.take("someone-else") is True)

users.clear_hook(OWNER)
check("clearing leaves nothing configured", users.hook_state(OWNER)["configured"] is False)
check("a cleared hook is not delivered to", users.hooks() == [])

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
