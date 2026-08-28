#!/usr/bin/env python3

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from admin_store import StoreError, Users, check_discord_identity, discord_public

workspace = tempfile.mkdtemp(prefix="admin-discord-test-")
STORE = os.path.join(workspace, "users.json")
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"

MINE = {
    "id": "412345678901234567",
    "tag": "someone",
    "username": "someone",
    "displayName": "Some One",
    "avatar": "https://cdn.discordapp.com/avatars/412345678901234567/abc.png",
}

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    if not condition:
        failures.append(label)
    print("[%s] %s" % ("PASS" if condition else "FAIL", label))


def raises(label, action, status=None):
    try:
        action()
        check(label, False)
    except StoreError as error:
        if status is not None and error.status != status:
            print("     status %r, wanted %r" % (error.status, status))
            check(label, False)
        else:
            check(label, True)
    except Exception as other:
        print("     raised %r instead" % other)
        check(label, False)


users = Users(STORE)
users.bootstrap_owner(OWNER, OWNER_PASSWORD)
users.create("helper", "admin", None, OWNER, password="secondaccount42", must_change=False)

print("=== what counts as a Discord account ===")
check("a snowflake is accepted", check_discord_identity(MINE)["id"] == MINE["id"])
raises("a missing id is refused", lambda: check_discord_identity({"tag": "someone"}))
raises("a short id is refused", lambda: check_discord_identity({"id": "123"}))
raises("a word is not an id", lambda: check_discord_identity({"id": "not-a-snowflake"}))
raises("a string is not an account", lambda: check_discord_identity("412345678901234567"))
check(
    "an avatar from anywhere else is dropped",
    check_discord_identity(dict(MINE, avatar="https://evil.example/pic.png"))["avatar"] == "",
)
check(
    "a missing tag falls back to the username",
    check_discord_identity({"id": MINE["id"], "username": "plain"})["tag"] == "plain",
)
check(
    "a long display name is trimmed",
    len(check_discord_identity(dict(MINE, displayName="x" * 200))["displayName"]) == 64,
)

print()
print("=== an unlinked account ===")
check("reads as unlinked", users.discord_state(OWNER)["linked"] is False)
check("carries no id", users.discord_state(OWNER)["id"] is None)
check("an unknown account has no link", users.discord_state("nobody")["linked"] is False)
check("nothing is found by id", users.find_by_discord(MINE["id"]) is None)
check("an empty id finds nothing", users.find_by_discord("") is None)
check("the public shape is stable", discord_public(None)["linked"] is False)

print()
print("=== linking ===")
linked = users.link_discord(OWNER, MINE)
check("the link comes back public", linked["id"] == MINE["id"])
check("with the tag", linked["tag"] == "someone")
check("and a timestamp", bool(linked["since"]))
check("the state agrees", users.discord_state(OWNER)["linked"] is True)
check("the account is found by id", users.find_by_discord(MINE["id"])["name"] == OWNER)
check(
    "linking the same account again is fine",
    users.link_discord(OWNER, dict(MINE, displayName="Renamed"))["displayName"] == "Renamed",
)
check(
    "linking does not touch tokenVersion",
    users.find(OWNER).get("tokenVersion", 1) == 1,
)

print()
print("=== one Discord account, one panel account ===")
raises("another account cannot claim it", lambda: users.link_discord("helper", MINE))
check("and helper stays unlinked", users.discord_state("helper")["linked"] is False)
raises(
    "an account cannot hold two Discord accounts",
    lambda: users.link_discord(OWNER, dict(MINE, id="512345678901234567")),
)
check("the first link survives that", users.discord_state(OWNER)["id"] == MINE["id"])

print()
print("=== the link shows up where the panel looks ===")
listed = {entry["name"]: entry for entry in users.listing()}
check("the listing carries the link", listed[OWNER]["discord"]["id"] == MINE["id"])
check("and shows unlinked accounts as such", listed["helper"]["discord"]["linked"] is False)

print()
print("=== keeping the snapshot fresh ===")
moved = users.refresh_discord(OWNER, dict(MINE, tag="renamed", displayName="Re Named"))
check("a new tag is taken", moved["tag"] == "renamed")
check("and a new display name", moved["displayName"] == "Re Named")
check("the link date is untouched", moved["since"] == users.discord_state(OWNER)["since"])
check("and it records when it was refreshed", bool(moved["seen"]))
raises(
    "a different Discord account cannot slip in",
    lambda: users.refresh_discord(OWNER, dict(MINE, id="512345678901234567")),
    status=403,
)
raises("an unlinked account cannot be refreshed", lambda: users.refresh_discord("helper", MINE))

print()
print("=== notice preferences ===")
opening = users.discord_state(OWNER)["prefs"]
check("sign-in notices start off", opening["signin"] is False)
check("board reminders start on", opening["boardDue"] is True)
check("being put on a card starts on", opening["boardAssigned"] is True)
check("the chattier board notices start on", opening["boardComment"] is True and opening["boardMoved"] is True)
check("no events are wanted yet", opening["events"] == [])
check("and there are no quiet hours", opening["quiet"] is None)
check("no sign-in notice is wanted yet", users.discord_wants(OWNER, "signin") is None)
check("but a board reminder is", users.discord_wants(OWNER, "boardDue") == MINE["id"])
night = users.set_discord_prefs(OWNER, {"boardDue": True, "quiet": {"on": True, "from": 0, "to": 1439, "offset": 0}})
check("quiet hours are kept", night["prefs"]["quiet"] == {"from": 0, "to": 1439, "offset": 0})
check("and they hold a board reminder back", users.discord_wants(OWNER, "boardDue") is None)
check("without holding a sign-in warning back", users.discord_wants(OWNER, "signin") is None)
users.set_discord_prefs(OWNER, {"signin": True, "quiet": {"on": True, "from": 0, "to": 1439, "offset": 0}})
check("a sign-in warning comes through quiet hours", users.discord_wants(OWNER, "signin") == MINE["id"])
users.set_discord_prefs(OWNER, {"signin": False})
check("dropping the window lets reminders through again", users.discord_wants(OWNER, "boardDue") == MINE["id"])
raises("a window that never opens is refused", lambda: users.set_discord_prefs(OWNER, {"quiet": {"on": True, "from": 60, "to": 60}}))
check("and nothing is on the DM round", users.dm_hooks() == [])
saved = users.set_discord_prefs(OWNER, {"signin": True, "nonsense": True, "events": ["changed", "denied", "invented"]})
check("only the known flags are kept", saved["prefs"]["signin"] is True and "nonsense" not in saved["prefs"])
check("only real events are kept", saved["prefs"]["events"] == ["denied", "changed"])
check("in the panel's own order", saved["prefs"]["events"] == [e for e in ("denied", "changed")])
check("an opted-in flag returns the Discord id", users.discord_wants(OWNER, "signin") == MINE["id"])
check("an invented kind returns nothing", users.discord_wants(OWNER, "invented") is None)
check("an unlinked account wants nothing", users.discord_wants("helper", "signin") is None)
check("an unknown account wants nothing", users.discord_wants("nobody", "signin") is None)
raises("preferences need a linked account", lambda: users.set_discord_prefs("helper", {"signin": True}))
raises("and a real set of preferences", lambda: users.set_discord_prefs(OWNER, "yes"))
raises("events have to be a list", lambda: users.set_discord_prefs(OWNER, {"events": "changed"}))

print()
print("=== the DM round picks them up ===")
rows = users.dm_hooks()
check("the account is on the round", len(rows) == 1 and rows[0]["name"] == OWNER)
check("carrying the Discord id to write to", rows[0]["hook"]["discord"] == MINE["id"])
check("and the events it asked for", rows[0]["hook"]["events"] == ["denied", "changed"])
check("with the account still active", rows[0]["active"] is True)
users.set_discord_prefs(OWNER, {"signin": True, "events": []})
check("clearing the events takes it off the round", users.dm_hooks() == [])

print()
print("=== unlinking ===")
check("unlinking reports it removed one", users.unlink_discord(OWNER) is True)
check("unlinking twice reports nothing removed", users.unlink_discord(OWNER) is False)
check("the state is clear afterwards", users.discord_state(OWNER)["linked"] is False)
check("nothing is found by id any more", users.find_by_discord(MINE["id"]) is None)
check("and the id can move to another account", users.link_discord("helper", MINE)["id"] == MINE["id"])

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
