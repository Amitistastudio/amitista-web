#!/usr/bin/env python3

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

workspace = tempfile.mkdtemp(prefix="admin-reminders-test-")
os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "5" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")
os.environ["ADMIN_ORIGIN"] = "https://amitista.com"

from admin_store import (
    Boards,
    REMIND_STEPS_MAX,
    StoreError,
    check_quiet,
    check_remind,
    check_step,
    check_steps,
    discord_prefs,
    in_quiet,
    iso_seconds,
    remind_default,
    remind_who,
    step_seconds,
)

OWNER = "amitista"
HELPER = "helper"
GUEST = "guest"
KEYHOLDER = "blxr"

DAY = 86400
HOUR = 3600
MINUTE = 60

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    if condition:
        print("  ok   %s" % label)
    else:
        print("  FAIL %s" % label)
        failures.append(label)


def refused(label, call, status=None):
    try:
        call()
        check(label, False)
    except StoreError as failure:
        check(label, status is None or failure.status == status)


def at(offset):
    return 1_800_000_000.0 + offset


def iso(offset):
    from datetime import datetime, timezone

    return (
        datetime.fromtimestamp(at(offset), timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


print("=== reading a ladder ===")

check("a plain step survives", check_step("2d") == "2d")
check("case and space do not matter", check_step("  3H ") == "3h")
check("minutes are seconds", step_seconds("3m") == 180)
check("weeks are seconds", step_seconds("2w") == 2 * 7 * DAY)
refused("seconds are too fine", lambda: check_step("30s"))
refused("half a minute is too fine", lambda: check_step("0m"))
refused("a year out is too far", lambda: check_step("400d"))
refused("nonsense is refused", lambda: check_step("soon"))

check(
    "a ladder comes back longest first",
    check_steps(["2d", "3m", "1d"], "before it is due") == ["2d", "1d", "3m"],
)
check(
    "the same length written twice only counts once",
    check_steps(["1d", "24h", "1440m"], "before it is due") == ["1d"],
)
check("an empty ladder is allowed", check_steps([], "before it is due") == [])
check("no ladder at all is allowed", check_steps(None, "before it is due") == [])
refused(
    "a ladder has a ceiling",
    lambda: check_steps(["%dd" % n for n in range(1, REMIND_STEPS_MAX + 2)], "before it is due"),
)
refused("a ladder is a list", lambda: check_steps("2d", "before it is due"))


print("\n=== reading a setup ===")

check("nothing at all reads as the default", check_remind(None) == remind_default())
check("the default is off", remind_default()["on"] is False)
check("the default goes to whoever is on the card", remind_default()["who"] == "assignees")

setup = check_remind({"on": True, "lead": ["2d", "3m", "1d"], "late": ["1d"], "who": "board"})
check("a setup keeps its ladder sorted", setup["lead"] == ["2d", "1d", "3m"])
check("a setup keeps who it goes to", setup["who"] == "board")
check("a setup with no events named gets them all", len(setup["events"]) == 4)
check(
    "unknown events are dropped, known ones kept in order",
    check_remind({"on": True, "lead": ["1d"], "events": ["comment", "nope", "assigned"]})["events"]
    == ["assigned", "comment"],
)
refused("who has to be one of the three", lambda: check_remind({"on": True, "who": "everyone"}))
refused(
    "reminders cannot be on with nothing to send",
    lambda: check_remind({"on": True, "lead": [], "late": [], "events": []}),
)
check(
    "off with nothing to send is fine",
    check_remind({"on": False, "lead": [], "late": [], "events": []})["on"] is False,
)


print("\n=== pointing one thing somewhere else ===")

check("the default points nothing anywhere", remind_default()["goes"] == {})
check("everything follows the general crowd by default", remind_who(remind_default(), "comment") == "assignees")

apart = check_remind(
    {"on": True, "lead": ["1d"], "who": "assignees", "goes": {"due": "owners", "comment": "board"}}
)
check("a thing can be pointed somewhere else", apart["goes"] == {"due": "owners", "comment": "board"})
check("and that is who it reaches", remind_who(apart, "due") == "owners")
check("while the rest still follow the general crowd", remind_who(apart, "moved") == "assignees")
check("the general crowd is untouched by an override", apart["who"] == "assignees")
check(
    "'the usual' is stored as nothing at all",
    check_remind({"on": True, "lead": ["1d"], "goes": {"comment": "general", "moved": None}})["goes"]
    == {},
)
check(
    "being put on a card cannot be pointed anywhere",
    check_remind({"on": True, "lead": ["1d"], "goes": {"assigned": "owners"}})["goes"] == {},
)
check(
    "a setup written before this reads as nothing pointed",
    check_remind({"on": True, "lead": ["1d"], "who": "board"})["goes"] == {},
)
refused(
    "a thing cannot be pointed at somebody made up",
    lambda: check_remind({"on": True, "lead": ["1d"], "goes": {"due": "everyone"}}),
)
refused(
    "the pointing has to be a mapping",
    lambda: check_remind({"on": True, "lead": ["1d"], "goes": ["due"]}),
)

named = check_remind(
    {"on": True, "lead": ["1d"], "who": ["helper", "blxr"], "goes": {"comment": ["blxr"]}}
)
check("the usual crowd can be named people", named["who"] == ["blxr", "helper"])
check("and so can one thing on its own", named["goes"]["comment"] == ["blxr"])
check("a named crowd is what remind_who hands back", remind_who(named, "comment") == ["blxr"])
check("and the general list is the fallback", remind_who(named, "moved") == ["blxr", "helper"])
check(
    "the same person twice is one person",
    check_remind({"on": True, "lead": ["1d"], "who": ["helper", "helper"]})["who"] == ["helper"],
)
refused(
    "an empty list of people is refused",
    lambda: check_remind({"on": True, "lead": ["1d"], "who": []}),
)
refused(
    "an empty list on one thing is refused too",
    lambda: check_remind({"on": True, "lead": ["1d"], "goes": {"due": []}}),
)
refused(
    "a name that is not on the board is refused",
    lambda: check_remind({"on": True, "lead": ["1d"], "who": ["stranger"]}, {"helper", "blxr"}),
)
check(
    "a seated name is stored the way the board spells it",
    check_remind({"on": True, "lead": ["1d"], "who": ["BLXR"]}, {"Blxr", "helper"})["who"]
    == ["Blxr"],
)


print("\n=== quiet hours ===")

night = check_quiet({"on": True, "from": 22 * 60, "to": 8 * 60, "offset": 180})
check("a window is kept in minutes past midnight", night == {"from": 1320, "to": 480, "offset": 180})
check("off means no window at all", check_quiet({"on": False, "from": 0, "to": 60}) is None)
check("nothing means no window at all", check_quiet(None) is None)
refused("a window that never opens is refused", lambda: check_quiet({"on": True, "from": 60, "to": 60}))
refused("a made-up hour is refused", lambda: check_quiet({"on": True, "from": 2000, "to": 60}))
refused("a made-up zone is refused", lambda: check_quiet({"on": True, "from": 0, "to": 60, "offset": 5000}))


def utc(hour, minute=0):
    return 1_800_000_000.0 - (1_800_000_000.0 % DAY) + hour * HOUR + minute * MINUTE


check("03:00 their time is quiet", in_quiet(night, utc(0)) is True)
check("07:59 their time is quiet", in_quiet(night, utc(4, 59)) is True)
check("08:00 their time is awake", in_quiet(night, utc(5)) is False)
check("21:59 their time is awake", in_quiet(night, utc(18, 59)) is False)
check("22:00 their time is quiet", in_quiet(night, utc(19)) is True)
day = {"from": 9 * 60, "to": 17 * 60, "offset": 0}
check("a window inside one day works too", in_quiet(day, utc(12)) is True)
check("and lets the evening through", in_quiet(day, utc(20)) is False)
check("no window is never quiet", in_quiet(None, utc(3)) is False)

check("linked prefs carry a board default of on", discord_prefs({"id": "1", "prefs": {}})["boardDue"] is True)
check("sign-in notices stay off by default", discord_prefs({"id": "1", "prefs": {}})["signin"] is False)
check(
    "every board notice is on by default, or a ticked row reaches nobody",
    all(
        discord_prefs({"id": "1", "prefs": {}})[kind] is True
        for kind in ("boardDue", "boardAssigned", "boardComment", "boardMoved")
    ),
)
check("a stored no beats the default", discord_prefs({"id": "1", "prefs": {"boardDue": False}})["boardDue"] is False)


print("\n=== the sweep ===")

store = Boards(os.path.join(workspace, "boards-remind.json"))
board = store.create("Ship it", "", "emerald", "private", OWNER)
for who, role in ((HELPER, "editor"), (GUEST, "viewer")):
    store.invite_member(board["id"], who, role, OWNER)
    store.answer_ask(board["id"], who, True)
todo = board["lists"][0]["id"]
done_column = board["lists"][2]["id"]

everyone = lambda name: True
nobody = lambda name: False


def fired(moment, card_id, ready=None):
    return [job for job in store.due_sweep(ready or everyone, moment) if job["card"] == card_id]


def put(card_id, people):
    store.update_card(board["id"], card_id, {"assignees": list(people)}, OWNER)


def make(title, due_at, who=None):
    result = store.add_card(board["id"], todo, title, OWNER)
    card = result["card"]
    store.update_card(board["id"], card["id"], {"due": iso(due_at)}, OWNER)
    put(card["id"], [HELPER] if who is None else who)
    return card["id"]


check("a board starts with reminders off", board["remind"]["on"] is False)
card = make("Sign the ruleset", 3 * DAY)
check("nothing fires while the board is off", store.due_sweep(everyone, at(0)) == [])

store.update(board["id"], {"remind": {"on": True, "lead": ["2d", "1d", "3m"], "late": ["1d"], "who": "assignees"}}, OWNER)
check("the setup is stored as offered", store.board(board["id"], OWNER)["remind"]["lead"] == ["2d", "1d", "3m"])

check("nothing fires before the first rung", store.due_sweep(everyone, at(0)) == [])

jobs = store.due_sweep(everyone, at(DAY + 1))
check("two days out fires once", len(jobs) == 1)
check("and names the rung it fired", jobs[0]["rung"] == "-2d")
check("and goes to whoever is on the card", jobs[0]["people"] == [HELPER])
check("and carries the card title", jobs[0]["title"] == "Sign the ruleset")
check("and the column it sits in", jobs[0]["column"] == "To do")
check("and is not marked late", jobs[0]["late"] is False)
check("the same rung does not fire twice", store.due_sweep(everyone, at(DAY + 90)) == [])

jobs = store.due_sweep(everyone, at(2 * DAY + 1))
check("one day out fires next", len(jobs) == 1 and jobs[0]["rung"] == "-1d")
check("and it does not repeat either", store.due_sweep(everyone, at(2 * DAY + 90)) == [])

jobs = store.due_sweep(everyone, at(3 * DAY - 120))
check("three minutes out fires last", len(jobs) == 1 and jobs[0]["rung"] == "-3m")

jobs = store.due_sweep(everyone, at(4 * DAY + 1))
check("a day overdue fires the late rung", len(jobs) == 1 and jobs[0]["rung"] == "+1d")
check("and it knows it is late", jobs[0]["late"] is True)
check("and there is nothing after the last rung", store.due_sweep(everyone, at(9 * DAY)) == [])

print("\n=== the sweep does not pile up ===")

burst = make("Woke up a week late", 2 * DAY)
jobs = store.due_sweep(everyone, at(9 * DAY))
check("a long outage sends one reminder, not five", len(jobs) == 1)
check("and it is the most recent rung", jobs[0]["rung"] == "+1d")
check("and the card it names is the late one", jobs[0]["card"] == burst)
check("the older rungs are retired silently", store.due_sweep(everyone, at(9 * DAY + 60)) == [])

print("\n=== what stops a reminder ===")

quiet_card = make("Nobody is awake", 3 * DAY)
check("a person who is not ready gets nothing", store.due_sweep(nobody, at(DAY + 1)) == [])
jobs = store.due_sweep(everyone, at(DAY + 2))
check("and hears about it once they are", len(jobs) == 1 and jobs[0]["card"] == quiet_card)

done_card = make("Already finished", 3 * DAY)
store.update_card(board["id"], done_card, {"done": True}, OWNER)
check("a finished card reminds nobody", fired(at(2 * DAY), done_card) == [])

put_away = make("Put away", 3 * DAY)
store.update_card(board["id"], put_away, {"archived": True}, OWNER)
check("an archived card reminds nobody", fired(at(2 * DAY), put_away) == [])

nobody_on_it = make("Unassigned", 3 * DAY, who=[])
check("a card with nobody on it reminds nobody", fired(at(2 * DAY), nobody_on_it) == [])

undated = store.add_card(board["id"], todo, "No date", OWNER)["card"]["id"]
put(undated, [HELPER])
check("a card with no due date reminds nobody", fired(at(2 * DAY), undated) == [])

print("\n=== moving the goalposts ===")

again = make("Moved the date", 3 * DAY)
jobs = store.due_sweep(everyone, at(DAY + 5))
check("it fires on the old date", len(jobs) == 1 and jobs[0]["card"] == again)
store.update_card(board["id"], again, {"due": iso(10 * DAY)}, OWNER)
check("changing the date wipes what was sent", store.due_sweep(everyone, at(DAY + 10)) == [])
jobs = [job for job in store.due_sweep(everyone, at(8 * DAY + 5)) if job["card"] == again]
check("and the ladder starts again from the new date", len(jobs) == 1 and jobs[0]["rung"] == "-2d")

reopened = make("Ticked then untocked", 3 * DAY)
store.due_sweep(everyone, at(DAY + 20))
store.update_card(board["id"], reopened, {"done": True}, OWNER)
store.update_card(board["id"], reopened, {"done": False}, OWNER)
jobs = [job for job in store.due_sweep(everyone, at(DAY + 30)) if job["card"] == reopened]
check("reopening a card puts its reminders back", len(jobs) == 1)

print("\n=== who it reaches ===")

store.update(board["id"], {"remind": {"on": True, "lead": ["1d"], "late": [], "who": "board"}}, OWNER)
wide = make("Everyone should know", 3 * DAY)
jobs = [job for job in store.due_sweep(everyone, at(2 * DAY + 5)) if job["card"] == wide]
check("everyone on the board can be told", len(jobs) == 1)
check(
    "and that is every seat, keyholder included",
    sorted(jobs[0]["people"]) == sorted([OWNER, GUEST, HELPER, KEYHOLDER]),
)

store.update(board["id"], {"remind": {"on": True, "lead": ["1d"], "late": [], "who": "owners"}}, OWNER)
narrow = make("Owners only", 3 * DAY)
jobs = [job for job in store.due_sweep(everyone, at(2 * DAY + 5)) if job["card"] == narrow]
check("or only the owners", sorted(jobs[0]["people"]) == sorted([OWNER, KEYHOLDER]))

store.update(
    board["id"],
    {"remind": {"on": True, "lead": ["1d"], "late": [], "who": "assignees", "goes": {"due": "owners"}}},
    OWNER,
)
pointed = make("Chase the owners", 3 * DAY)
jobs = [job for job in store.due_sweep(everyone, at(2 * DAY + 5)) if job["card"] == pointed]
check(
    "a due date pointed at the owners skips the card",
    sorted(jobs[0]["people"]) == sorted([OWNER, KEYHOLDER]),
)
store.update(
    board["id"],
    {"remind": {"on": True, "lead": ["1d"], "late": [], "who": "owners", "goes": {"due": "assignees"}}},
    OWNER,
)
back = make("Back to the card", 3 * DAY)
jobs = [job for job in store.due_sweep(everyone, at(2 * DAY + 5)) if job["card"] == back]
check("and it beats the general crowd both ways", jobs[0]["people"] == [HELPER])

store.update(
    board["id"],
    {"remind": {"on": True, "lead": ["1d"], "late": [], "who": [GUEST, KEYHOLDER]}},
    OWNER,
)
named_card = make("Two names", 3 * DAY)
jobs = [job for job in store.due_sweep(everyone, at(2 * DAY + 5)) if job["card"] == named_card]
check("a hand-picked pair is who it reaches", sorted(jobs[0]["people"]) == sorted([GUEST, KEYHOLDER]))
refused(
    "a stranger cannot be hand-picked",
    lambda: store.update(
        board["id"], {"remind": {"on": True, "lead": ["1d"], "who": ["nobody-here"]}}, OWNER
    ),
)

print("\n=== who may set it ===")

refused(
    "an editor cannot change the reminders",
    lambda: store.update(board["id"], {"remind": {"on": False}}, HELPER),
    403,
)
refused(
    "a viewer cannot change the reminders",
    lambda: store.update(board["id"], {"remind": {"on": False}}, GUEST),
    403,
)
store.update(board["id"], {"archived": True}, OWNER)
refused(
    "an archived board will not take a new setup",
    lambda: store.update(board["id"], {"remind": {"on": True, "lead": ["1d"]}}, OWNER),
    409,
)
check("and an archived board reminds nobody", store.due_sweep(everyone, at(3 * DAY)) == [])
store.update(board["id"], {"archived": False}, OWNER)

print("\n=== leaving the file alone ===")

quiet_board = store.create("Nothing due", "", "slate", "private", OWNER)
before = os.path.getmtime(store.file.path)
check("a sweep with nothing to do writes nothing", store.due_sweep(everyone, at(0)) == [])
check("and the file is untouched", os.path.getmtime(store.file.path) == before)

held = store.board(board["id"], OWNER)["rev"]
pending = make("Bump check", 3 * DAY)
before_rev = store.board(board["id"], OWNER)["rev"]
store.due_sweep(everyone, at(2 * DAY + 5))
check(
    "sending a reminder does not bump the board revision",
    store.board(board["id"], OWNER)["rev"] == before_rev,
)
check("the board is still there afterwards", held <= before_rev)

print("\n=== what a job carries ===")

store.update(board["id"], {"remind": {"on": True, "lead": ["1d"], "late": [], "who": "assignees"}}, OWNER)
rich = make("Full detail", 3 * DAY, who=[HELPER, GUEST])
jobs = [job for job in store.due_sweep(everyone, at(2 * DAY + 5)) if job["card"] == rich]
job = jobs[0]
check("a job names its board", job["name"] == "Ship it")
check("a job carries the board colour", job["colour"] == "emerald")
check("a job carries the card number", isinstance(job["seq"], int))
check("a job carries the due date", iso_seconds(job["due"]) == at(3 * DAY))
check("a job carries the step, not just the rung", job["step"] == "1d")
check("a job lists everyone on the card", sorted(job["assignees"]) == sorted([GUEST, HELPER]))
check("a job lists everyone it is going to", sorted(job["people"]) == sorted([GUEST, HELPER]))

print("\n=== the notice a handler reads ===")

seen = store.notice(board["id"], rich)
check("a notice carries the board name", seen["name"] == "Ship it")
check("a notice carries the setup", seen["remind"]["on"] is True)
check("a notice carries the column", seen["column"] == "To do")
check("a notice carries the card", seen["card"]["title"] == "Full detail")
check("a notice works out who an event reaches", sorted(seen["people"]) == sorted([GUEST, HELPER]))
check(
    "a notice works out each thing on its own",
    sorted(seen["crowds"]["comment"]) == sorted([GUEST, HELPER]),
)

store.update(
    board["id"],
    {"remind": {"on": True, "lead": ["1d"], "late": [], "who": "assignees", "goes": {"comment": "owners"}}},
    OWNER,
)
seen = store.notice(board["id"], rich)
check("a comment can reach the owners alone", sorted(seen["crowds"]["comment"]) == sorted([OWNER, KEYHOLDER]))
check("while a move still reaches the card", sorted(seen["crowds"]["moved"]) == sorted([GUEST, HELPER]))
check("and the general crowd is still the general crowd", sorted(seen["people"]) == sorted([GUEST, HELPER]))

store.update(
    board["id"],
    {"remind": {"on": True, "lead": ["1d"], "late": [], "who": "assignees", "goes": {"done": [OWNER]}}},
    OWNER,
)
seen = store.notice(board["id"], rich)
check("a thing can be pointed at one person", seen["crowds"]["done"] == [OWNER])
store.drop_member(board["id"], GUEST, OWNER)
store.update(
    board["id"],
    {"remind": {"on": True, "lead": ["1d"], "late": [], "who": [HELPER], "goes": {}}},
    OWNER,
)
seen = store.notice(board["id"], rich)
check("somebody dropped from the board hears nothing", seen["people"] == [HELPER])
check("a notice for no card at all is still a board", store.notice(board["id"])["name"] == "Ship it")
check("a notice for a board that is gone is nothing", store.notice("nosuchboard0000") is None)

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
