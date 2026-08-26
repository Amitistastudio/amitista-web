#!/usr/bin/env python3

import base64
import http.client
import json
import os
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from admin_store import BOARD_FACT_FIELDS, BOARD_OWN, BOARD_PURPOSE_IDS, Boards, StoreError, board_purposes

workspace = tempfile.mkdtemp(prefix="admin-boards-test-")
os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "3" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")
os.environ["ADMIN_ORIGIN"] = "https://amitista.com"
os.environ["ADMIN_RATE_PER_IP"] = "5000"
os.environ["ADMIN_LOCKOUT_AFTER"] = "500"
os.environ["ADMIN_ACCOUNT_LOCKOUT_AFTER"] = "500"

import admin_api

ORIGIN = "https://amitista.com"
OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
HELPER = "helper"
HELPER_PASSWORD = "secondaccount42"
GUEST = "guest"
GUEST_PASSWORD = "thirdaccount63"
KEYHOLDER = "blxr"
KEYHOLDER_PASSWORD = "keyholderpass88"
MAKER = "maker"
MAKER_PASSWORD = "ownboardsonly55"
QUIET = "quiet"
QUIET_PASSWORD = "noboardsatall71"

users = admin_api.users
users.bootstrap_owner(OWNER, OWNER_PASSWORD)
users.create(HELPER, "admin", None, OWNER, password=HELPER_PASSWORD, must_change=False)
users.create(GUEST, "viewer", None, OWNER, password=GUEST_PASSWORD, must_change=False)
users.create(KEYHOLDER, "viewer", None, OWNER, password=KEYHOLDER_PASSWORD, must_change=False)
users.create(MAKER, "custom", ["boards.own"], OWNER, password=MAKER_PASSWORD, must_change=False)
users.create(QUIET, "custom", ["overview.read"], OWNER, password=QUIET_PASSWORD, must_change=False)

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


def seat(board_id, name, role, by=OWNER, manage=False):
    store.invite_member(board_id, name, role, by, manage)
    store.answer_ask(board_id, name, True)
    return store.board(board_id, by, manage)


def refused(label, call, status=None):
    try:
        call()
        check(label, False)
    except StoreError as failure:
        check(label, status is None or failure.status == status)


print("=== the store on its own ===")

store = Boards(os.path.join(workspace, "boards-unit.json"))
check("an empty store lists nothing", store.listing(OWNER) == [])

board = store.create("Shield v2", "The security package", "emerald", "private", OWNER)
check("a new board carries three columns", [entry["name"] for entry in board["lists"]] == ["To do", "Doing", "Done"])
check("the creator is its owner", board["members"] == {OWNER: "owner", KEYHOLDER: "owner"})
check("the keyholder is on it without being added", board["members"][KEYHOLDER] == "owner")
check("the creator can change it", board["canAdmin"] is True)
check("a new board holds no cards", board["counts"]["cards"] == 0)

check("its owner sees it listed", len(store.listing(OWNER)) == 1)
check("a stranger does not see a private board", store.listing(HELPER) == [])
refused("a stranger cannot open a private board", lambda: store.board(board["id"], HELPER), 404)
check("boards.manage sees every board", len(store.listing(HELPER, manage=True)) == 1)

todo = board["lists"][0]["id"]
doing = board["lists"][1]["id"]
made = store.add_card(board["id"], todo, "Sign the ruleset", OWNER)
card = made["card"]
check("a card lands in the column asked for", made["board"]["lists"][0]["cards"] == [card["id"]])
check("a card starts unfinished", card["done"] is False)
check("a card records who made it", card["createdBy"] == OWNER)
check("a card opens with an activity line", card["activity"][0]["what"] == "created")

moved = store.move_card(board["id"], card["id"], doing, 0, OWNER)
check("moving empties the old column", moved["lists"][0]["cards"] == [])
check("moving fills the new one", moved["lists"][1]["cards"] == [card["id"]])
check("the card remembers its column", moved["cards"][card["id"]]["list"] == doing)
check("moving is written to the card", moved["cards"][card["id"]]["activity"][-1]["what"] == "moved")

second = store.add_card(board["id"], doing, "Write the block page", OWNER)["card"]
ordered = store.move_card(board["id"], second["id"], doing, 0, OWNER)
check("a card can be dropped above another", ordered["lists"][1]["cards"] == [second["id"], card["id"]])

full = store.update_card(board["id"], card["id"], {"done": True}, OWNER)
check("finishing stamps when", bool(full["completed"]))
check("finishing stamps who", full["completedBy"] == OWNER)
check("finishing is written to the card", full["activity"][-1]["what"] == "done")
check("the board counts what is done", store.board(board["id"], OWNER)["counts"]["done"] == 1)

store.update_card(board["id"], card["id"], {"done": False}, OWNER)
check("reopening clears the stamp", store.board(board["id"], OWNER)["cards"][card["id"]]["completed"] is None)

due = store.update_card(board["id"], card["id"], {"due": "2026-12-31T18:00Z"}, OWNER)
check("a due date is kept in UTC", due["due"] == "2026-12-31T18:00:00Z")
refused("a nonsense due date is refused", lambda: store.update_card(board["id"], card["id"], {"due": "next tuesday"}, OWNER))
refused("a due date centuries out is refused", lambda: store.update_card(board["id"], card["id"], {"due": "2099-01-01T00:00Z"}, OWNER))

refused("an unknown account cannot be assigned", lambda: store.update_card(board["id"], card["id"], {"assignees": ["nobody"]}, OWNER, known={OWNER, HELPER}))
assigned = store.update_card(board["id"], card["id"], {"assignees": [OWNER, OWNER]}, OWNER, known={OWNER, HELPER})
check("assignees are deduplicated", assigned["assignees"] == [OWNER])
check("the board counts my cards", store.board(board["id"], OWNER)["counts"]["mine"] == 1)

labelled = store.set_label(board["id"], None, "Blocked", "rose", OWNER)
label = labelled["labels"][0]["id"]
tagged = store.update_card(board["id"], card["id"], {"labels": [label, "deadbeef"]}, OWNER)
check("a label that is not on the board is dropped", tagged["labels"] == [label])
stripped = store.remove_label(board["id"], label, OWNER)
check("removing a label takes it off the cards", stripped["cards"][card["id"]]["labels"] == [])

spoken = store.add_comment(board["id"], card["id"], "Waiting on the key", OWNER)
check("a comment is kept", spoken["comments"][0]["body"] == "Waiting on the key")
check("a comment records who", spoken["comments"][0]["by"] == OWNER)
step = store.add_check(board["id"], card["id"], "Rotate the signing key", OWNER)["checklist"][0]
check("a step starts undone", step["done"] is False)
ticked = store.set_check(board["id"], card["id"], step["id"], {"done": True}, OWNER)
check("a step can be ticked", ticked["checklist"][0]["done"] is True)
linked = store.add_link(board["id"], card["id"], "", "https://amitista.com/shield", OWNER)
check("a link with no name takes the host", linked["links"][0]["label"] == "amitista.com")
refused("a link has to be http", lambda: store.add_link(board["id"], card["id"], "x", "javascript:alert(1)", OWNER))
refused("an empty comment is refused", lambda: store.add_comment(board["id"], card["id"], "   ", OWNER))
refused("a 3000-character note is refused", lambda: store.update_card(board["id"], card["id"], {"notes": "x" * 3000}, OWNER))

seat(board["id"], HELPER, "viewer")
check("a member can now see it", len(store.listing(HELPER)) == 1)
check("a viewer is read only", store.board(board["id"], HELPER)["canWrite"] is False)
refused("a viewer cannot add a card", lambda: store.add_card(board["id"], todo, "no", HELPER), 403)
refused("a viewer cannot manage members", lambda: store.set_member(board["id"], GUEST, "editor", HELPER), 403)
store.set_member(board["id"], HELPER, "editor", OWNER)
check("an editor can add a card", bool(store.add_card(board["id"], todo, "From the editor", HELPER)["card"]))
refused("an editor still cannot delete the board", lambda: store.remove(board["id"], HELPER), 403)
refused("an editor cannot change visibility", lambda: store.update(board["id"], {"visibility": "team"}, HELPER), 403)

refused("the last owner cannot be demoted", lambda: store.set_member(board["id"], OWNER, "editor", OWNER), 409)
refused("the last owner cannot be removed", lambda: store.drop_member(board["id"], OWNER, OWNER), 409)
store.set_member(board["id"], HELPER, "owner", OWNER)
check("a second owner lets the first step down", store.set_member(board["id"], OWNER, "editor", OWNER)["members"][OWNER] == "editor")
store.set_member(board["id"], OWNER, "owner", HELPER)

team = store.update(board["id"], {"visibility": "team"}, OWNER)
check("a team board is visible to everyone", len(store.listing(GUEST)) == 1)
check("a team board lets a non-member write", store.board(board["id"], GUEST)["canWrite"] is True)
check("a team board does not hand out ownership", store.board(board["id"], GUEST)["canAdmin"] is False)
seat(board["id"], GUEST, "viewer")
check("a named viewer stays read only on a team board", store.board(board["id"], GUEST)["canWrite"] is False)

store.forget_account(GUEST)
check("deleting an account takes it off the board", GUEST not in store.board(board["id"], OWNER)["members"])

archived = store.update(board["id"], {"archived": True}, OWNER)
check("an archived board leaves the live list", store.listing(OWNER) == [])
check("an archived board is in the archive", len(store.listing(OWNER, archived=True)) == 1)
refused("an archived board takes no new cards", lambda: store.add_card(board["id"], todo, "no", OWNER), 409)
check("an archived board hands its owner no admin rights", archived["canAdmin"] is False)
check("but the seat it gives them is still owner", archived["seat"] == "owner")
refused("an archived board will not be renamed", lambda: store.update(board["id"], {"name": "Nope"}, OWNER), 409)
store.update(board["id"], {"archived": False}, OWNER)
check("a board can be restored", len(store.listing(OWNER)) == 1)

binned = store.create("Thrown away", "", "slate", "team", OWNER)
seat(binned["id"], HELPER, "viewer")
store.update(binned["id"], {"archived": True}, OWNER)
refused("a viewer cannot delete an archived board", lambda: store.remove(binned["id"], HELPER), 403)
check("an owner can delete a board while it is archived", store.remove(binned["id"], OWNER)["name"] == "Thrown away")
check("and it is gone from the archive", store.listing(OWNER, archived=True) == [])

refused("a column with cards cannot be deleted", lambda: store.remove_list(board["id"], doing, OWNER), 409)
empty = store.add_list(board["id"], "Later", OWNER)["lists"][-1]["id"]
check("a column can be added", len(store.board(board["id"], OWNER)["lists"]) == 4)
store.remove_list(board["id"], empty, OWNER)
check("an empty column can be deleted", len(store.board(board["id"], OWNER)["lists"]) == 3)
shifted = store.move_list(board["id"], doing, 0, OWNER)
check("a column can be reordered", shifted["lists"][0]["id"] == doing)

print("\n=== columns that mean something ===")

fresh = store.create("Site rebuild", "", "sky", "private", OWNER)
open_list, doing_list, done_list = [entry["id"] for entry in fresh["lists"]]
check("the last starting column is the finish column", fresh["lists"][2]["done"] is True)
check("the other columns are not", fresh["lists"][0]["done"] is False)

first = store.add_card(fresh["id"], open_list, "Rewrite the header", OWNER)["card"]
second = store.add_card(fresh["id"], open_list, "Fix the footer", OWNER)["card"]
check("cards are numbered from one", (first["seq"], second["seq"]) == (1, 2))
check("a card starts unfinished in an open column", first["done"] is False)

landed = store.move_card(fresh["id"], first["id"], done_list, 0, OWNER)
check("dropping a card in the finish column marks it done", landed["cards"][first["id"]]["done"] is True)
check("it records who finished it", landed["cards"][first["id"]]["completedBy"] == OWNER)
returned = store.move_card(fresh["id"], first["id"], doing_list, 0, OWNER)
check("dragging it back out reopens it", returned["cards"][first["id"]]["done"] is False)

sideways = store.update_card(fresh["id"], second["id"], {"done": True}, OWNER)
check("a card finished by hand stays finished when moved between open columns", sideways["done"] is True)
after = store.move_card(fresh["id"], second["id"], doing_list, 0, OWNER)
check("moving between two open columns does not reopen it", after["cards"][second["id"]]["done"] is True)

flagged = store.update_list(fresh["id"], doing_list, {"done": True}, OWNER)
check("flagging a column finishes the cards already in it", flagged["cards"][first["id"]]["done"] is True)
store.update_list(fresh["id"], doing_list, {"done": False}, OWNER)
check("a column can be renamed and re-flagged together", store.update_list(fresh["id"], doing_list, {"name": "In progress"}, OWNER)["lists"][1]["name"] == "In progress")

copied = store.duplicate_card(fresh["id"], second["id"], OWNER)["card"]
check("a copy is named as one", copied["title"].endswith("copy"))
check("a copy takes the next number", copied["seq"] == 3)
check("a copy starts unfinished", copied["done"] is False)
store.add_comment(fresh["id"], second["id"], "Not carried over", OWNER)
carried = store.duplicate_card(fresh["id"], second["id"], OWNER)["card"]
check("a copy carries no comments", carried["comments"] == [])
check("a copy sits beside the original", store.board(fresh["id"], OWNER)["lists"][1]["cards"][:2] == [second["id"], carried["id"]])

held = len(store.assigned(OWNER))
check("nothing on this board is on me yet", [entry for entry in store.assigned(OWNER) if entry["board"]["id"] == fresh["id"]] == [])
store.update_card(fresh["id"], copied["id"], {"assignees": [OWNER], "due": "2026-12-01T09:00Z"}, OWNER)
store.update_card(fresh["id"], carried["id"], {"assignees": [OWNER]}, OWNER)
check("assigning adds to my work", len(store.assigned(OWNER)) == held + 2)
check("my work reaches across boards", len({entry["board"]["id"] for entry in store.assigned(OWNER)}) == 2)
work = [entry for entry in store.assigned(OWNER) if entry["board"]["id"] == fresh["id"]]
check("dated work sorts before undated", work[0]["card"]["id"] == copied["id"])
check("my work names the column it sits in", work[0]["column"] == "In progress")
check("my work names the board", work[0]["board"]["name"] == "Site rebuild")
check("my work carries the checklist tally", work[0]["card"]["steps"] == [0, 0])
store.update_card(fresh["id"], carried["id"], {"done": True}, OWNER)
check("a finished card leaves my work", len(store.assigned(OWNER)) == held + 1)
check("someone else's work is not mine", store.assigned(HELPER) == [])
check("an archived board keeps its work out of the list", (store.update(fresh["id"], {"archived": True}, OWNER) or True) and len(store.assigned(OWNER)) == held)
store.update(fresh["id"], {"archived": False}, OWNER)
store.remove(fresh["id"], OWNER)

refused("an unknown board is a 404", lambda: store.board("00000000", OWNER), 404)
refused("a made-up id is a 404", lambda: store.board("../../etc/passwd", OWNER), 404)
refused("an unknown card is a 404", lambda: store.update_card(board["id"], "00000000", {"done": True}, OWNER), 404)
refused("a board with no name is refused", lambda: store.create("  ", "", "purple", "private", OWNER))
refused("an unknown colour is refused", lambda: store.create("x", "", "chartreuse", "private", OWNER))
refused("an unknown visibility is refused", lambda: store.create("x", "", "purple", "public", OWNER))

gone = store.remove(board["id"], OWNER)
check("deleting says how many cards went with it", gone["cards"] >= 1)
check("the board is gone", store.listing(OWNER) == [])


print("\n=== moving, sorting, limits and undo ===")

flow = store.create("Everyday flow", "", "amber", "private", OWNER)
flow_todo, flow_doing, flow_done = [entry["id"] for entry in flow["lists"]]
check("a column starts with no limit", flow["lists"][0]["cap"] is None)
capped = store.update_list(flow["id"], flow_doing, {"cap": 3}, OWNER)
check("a column takes a limit", capped["lists"][1]["cap"] == 3)
check("a limit survives a read", store.board(flow["id"], OWNER)["lists"][1]["cap"] == 3)
check("a limit is cleared with nothing", store.update_list(flow["id"], flow_doing, {"cap": None}, OWNER)["lists"][1]["cap"] is None)
check("a zero limit means no limit", store.update_list(flow["id"], flow_doing, {"cap": 0}, OWNER)["lists"][1]["cap"] is None)
store.update_list(flow["id"], flow_doing, {"cap": 3}, OWNER)
refused("a limit over the cap is refused", lambda: store.update_list(flow["id"], flow_doing, {"cap": 500}, OWNER))
refused("a limit that is not a number is refused", lambda: store.update_list(flow["id"], flow_doing, {"cap": "loads"}, OWNER))
check("a limit does not stop a card going in", bool(store.add_card(flow["id"], flow_doing, "Over the line", OWNER)["card"]))
store.remove_card(flow["id"], store.board(flow["id"], OWNER)["lists"][1]["cards"][0], OWNER)

beta = store.add_card(flow["id"], flow_todo, "Beta", OWNER)["card"]
alpha = store.add_card(flow["id"], flow_todo, "Alpha", OWNER)["card"]
gamma = store.add_card(flow["id"], flow_todo, "Gamma", OWNER)["card"]
store.update_card(flow["id"], gamma["id"], {"due": "2026-09-01T09:00Z"}, OWNER)
store.update_card(flow["id"], beta["id"], {"due": "2026-10-01T09:00Z"}, OWNER)
sorted_due = store.sort_list(flow["id"], flow_todo, "due", OWNER)
check("sorting by due puts the nearest first", sorted_due["lists"][0]["cards"] == [gamma["id"], beta["id"], alpha["id"]])
sorted_title = store.sort_list(flow["id"], flow_todo, "title", OWNER)
check("sorting by title is alphabetical", sorted_title["lists"][0]["cards"] == [alpha["id"], beta["id"], gamma["id"]])
store.update_card(flow["id"], gamma["id"], {"assignees": [OWNER]}, OWNER)
sorted_who = store.sort_list(flow["id"], flow_todo, "who", OWNER)
check("sorting by who puts the unassigned last", sorted_who["lists"][0]["cards"][0] == gamma["id"])
store.update_card(flow["id"], alpha["id"], {"done": True}, OWNER)
check("sorting by due keeps finished cards last", store.sort_list(flow["id"], flow_todo, "due", OWNER)["lists"][0]["cards"][-1] == alpha["id"])
refused("an unknown sort is refused", lambda: store.sort_list(flow["id"], flow_todo, "vibes", OWNER))
store.update_card(flow["id"], alpha["id"], {"done": False}, OWNER)

bulk = store.bulk_cards(flow["id"], [alpha["id"], beta["id"]], "done", None, OWNER)
check("bulk says how many it changed", bulk["changed"] == 2)
check("bulk finishes the cards it was given", bulk["board"]["cards"][alpha["id"]]["done"] is True)
check("bulk leaves the others alone", bulk["board"]["cards"][gamma["id"]]["done"] is False)
check("running the same bulk twice changes nothing", store.bulk_cards(flow["id"], [alpha["id"], beta["id"]], "done", None, OWNER)["changed"] == 0)
check("bulk can archive", store.bulk_cards(flow["id"], [alpha["id"]], "archive", None, OWNER)["board"]["cards"][alpha["id"]]["archived"] is True)
check("bulk can bring them back", store.bulk_cards(flow["id"], [alpha["id"]], "restore", None, OWNER)["board"]["cards"][alpha["id"]]["archived"] is False)
flow_label = store.set_label(flow["id"], None, "Blocked", "rose", OWNER)["labels"][0]["id"]
check("bulk can label", store.bulk_cards(flow["id"], [alpha["id"], beta["id"]], "label", flow_label, OWNER)["board"]["cards"][beta["id"]]["labels"] == [flow_label])
check("bulk can unlabel", store.bulk_cards(flow["id"], [beta["id"]], "unlabel", flow_label, OWNER)["board"]["cards"][beta["id"]]["labels"] == [])
check("bulk can put people on", store.bulk_cards(flow["id"], [alpha["id"], beta["id"]], "assign", OWNER, OWNER)["board"]["cards"][beta["id"]]["assignees"] == [OWNER])
check("bulk can take people off", store.bulk_cards(flow["id"], [beta["id"]], "unassign", OWNER, OWNER)["board"]["cards"][beta["id"]]["assignees"] == [])
check("bulk can move a column's worth", store.bulk_cards(flow["id"], [alpha["id"], beta["id"]], "move", flow_doing, OWNER)["board"]["lists"][1]["cards"] == [alpha["id"], beta["id"]])
check("bulk can set a due date", store.bulk_cards(flow["id"], [alpha["id"]], "due", "2026-11-05T09:00Z", OWNER)["board"]["cards"][alpha["id"]]["due"] == "2026-11-05T09:00:00Z")
refused("bulk refuses somebody who is not on the board", lambda: store.bulk_cards(flow["id"], [alpha["id"]], "assign", GUEST, OWNER), 409)
refused("bulk refuses a label from another board", lambda: store.bulk_cards(flow["id"], [alpha["id"]], "label", "deadbeef", OWNER), 404)
refused("bulk refuses an action it does not know", lambda: store.bulk_cards(flow["id"], [alpha["id"]], "burn", None, OWNER))
refused("bulk refuses an empty selection", lambda: store.bulk_cards(flow["id"], [], "done", None, OWNER))
refused("bulk refuses more than it will take", lambda: store.bulk_cards(flow["id"], ["%08x" % n for n in range(200)], "done", None, OWNER))
seat(flow["id"], HELPER, "viewer")
refused("a viewer cannot run bulk", lambda: store.bulk_cards(flow["id"], [alpha["id"]], "done", None, HELPER), 403)

deleted = store.remove_card(flow["id"], gamma["id"], OWNER)
check("deleting hands back an undo", deleted["undo"] == gamma["id"])
check("the card is off the board", gamma["id"] not in deleted["board"]["cards"])
put_back = store.undelete_card(flow["id"], gamma["id"], OWNER)
check("undo brings the card back", put_back["card"]["id"] == gamma["id"])
check("undo keeps the title", put_back["card"]["title"] == "Gamma")
check("undo puts it in the column it left", gamma["id"] in put_back["board"]["lists"][0]["cards"])
check("undo is written to the card", put_back["card"]["activity"][-1]["what"] == "restored")
refused("a second undo has nothing to undo", lambda: store.undelete_card(flow["id"], gamma["id"], OWNER), 404)
wiped = store.bulk_cards(flow["id"], [alpha["id"], beta["id"]], "delete", None, OWNER)
check("bulk delete clears them", alpha["id"] not in wiped["board"]["cards"] and beta["id"] not in wiped["board"]["cards"])
check("bulk delete can be undone one at a time", store.undelete_card(flow["id"], beta["id"], OWNER)["card"]["id"] == beta["id"])

far = store.create("Somewhere else", "", "sky", "private", OWNER)
far_first = far["lists"][0]["id"]
far_label = store.set_label(far["id"], None, "Blocked", "sky", OWNER)["labels"][0]["id"]
store.update_card(flow["id"], gamma["id"], {"labels": [flow_label], "assignees": [OWNER]}, OWNER)
store.set_member(flow["id"], HELPER, "editor", OWNER)
store.update_card(flow["id"], gamma["id"], {"assignees": [OWNER, HELPER]}, OWNER)
sent = store.transfer_card(flow["id"], gamma["id"], far["id"], far_first, OWNER)
check("a moved card leaves the board it came from", gamma["id"] not in sent["board"]["cards"])
check("the move names where it went", sent["to"]["name"] == "Somewhere else")
landed_far = store.board(far["id"], OWNER)
moved_card = landed_far["cards"][sent["to"]["card"]]
check("a moved card lands in the column asked for", sent["to"]["card"] in landed_far["lists"][0]["cards"])
check("a moved card keeps its title", moved_card["title"] == "Gamma")
check("a moved card takes the new board's numbering", moved_card["seq"] == 1)
check("a label with the same name follows the card", moved_card["labels"] == [far_label])
check("somebody who is not on the new board comes off the card", moved_card["assignees"] == [OWNER])
check("moving is written to the card", moved_card["activity"][-1]["what"] == "sent")
refused("a card cannot be moved to the board it is on", lambda: store.transfer_card(far["id"], moved_card["id"], far["id"], far_first, OWNER), 409)
refused("a card cannot be moved to a board you cannot open", lambda: store.transfer_card(far["id"], moved_card["id"], board["id"], None, GUEST), 404)
seat(far["id"], HELPER, "viewer")
refused("a viewer cannot move a card off a board", lambda: store.transfer_card(far["id"], moved_card["id"], flow["id"], None, HELPER), 403)
spare = store.add_card(flow["id"], flow_todo, "For the editor", HELPER)["card"]
refused("an editor cannot post a card into a board they only read", lambda: store.transfer_card(flow["id"], spare["id"], far["id"], None, HELPER), 403)
store.remove_card(flow["id"], spare["id"], OWNER)
home = store.transfer_card(far["id"], moved_card["id"], flow["id"], None, OWNER)
check("a move with no column asked for takes the first one", home["to"]["card"] in store.board(flow["id"], OWNER)["lists"][0]["cards"])
check("the label is dropped when the new board has none like it", store.board(flow["id"], OWNER)["cards"][home["to"]["card"]]["labels"] == [flow_label])
store.remove(far["id"], OWNER)
store.remove(flow["id"], OWNER)


print("\n=== artwork and people, on the store ===")

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

seated = store.create("Client work", "", "sky", "private", OWNER, [{"name": HELPER, "role": "editor"}])
check("a new board starts with only its creator on it", seated["members"] == {OWNER: "owner", KEYHOLDER: "owner"})
check("the people named at creation are asked, not seated", [entry["who"] for entry in seated["asks"]] == [HELPER])
refused("somebody who has only been asked cannot open it", lambda: store.board(seated["id"], HELPER), 404)
store.answer_ask(seated["id"], HELPER, True)
check("accepting seats them as they were asked", store.board(seated["id"], HELPER)["seat"] == "editor")
check("accepting clears the request", store.board(seated["id"], OWNER)["asks"] == [])
refused(
    "an unknown account cannot be seated at creation",
    lambda: store.create("x", "", "sky", "private", OWNER, [{"name": "", "role": "editor"}]),
)

refused(
    "a bulk write cannot slip somebody new onto a board",
    lambda: store.set_members(seated["id"], [{"name": HELPER, "role": "owner"}, {"name": GUEST, "role": "viewer"}], OWNER),
    409,
)
seat(seated["id"], GUEST, "viewer")
bulk = store.set_members(seated["id"], [{"name": HELPER, "role": "owner"}, {"name": GUEST, "role": "viewer"}], OWNER)
check("people already on it can be reseated in one write", bulk["members"] == {OWNER: "owner", HELPER: "owner", GUEST: "viewer", KEYHOLDER: "owner"})
demoted = store.set_members(seated["id"], [{"name": OWNER, "role": "editor"}], OWNER)
check("ownership can be handed over", demoted["members"][OWNER] == "editor")
store.set_members(seated["id"], [{"name": OWNER, "role": "owner"}], HELPER)
refused(
    "the last owner cannot be demoted in bulk",
    lambda: store.set_members(seated["id"], [{"name": OWNER, "role": "editor"}, {"name": HELPER, "role": "editor"}], OWNER),
    409,
)
refused("an editor cannot seat anybody", lambda: store.set_members(seated["id"], [{"name": GUEST, "role": "editor"}], GUEST), 403)

arted = store.set_art(seated["id"], "logo", "image/png", PNG, OWNER)
check("a logo is recorded on the board", arted["art"]["logo"]["type"] == "image/png")
check("a logo records its size", arted["art"]["logo"]["bytes"] == len(PNG))
check("a logo records who put it there", arted["art"]["logo"]["by"] == OWNER)
check("a logo is written beside the store", os.path.exists(os.path.join(workspace, "board-art", "%s-logo.png" % seated["id"])))
check("the logo reads back as the bytes sent", store.art(seated["id"], "logo", OWNER) == ("image/png", PNG))
check("a board member can read the logo", store.art(seated["id"], "logo", GUEST)[1] == PNG)
refused("a stranger cannot read the logo", lambda: store.art(seated["id"], "logo", "nobody"), 404)
refused("a read-only seat cannot set artwork", lambda: store.set_art(seated["id"], "logo", "image/png", PNG, GUEST), 403)
refused("a banner that is not an image is refused", lambda: store.set_art(seated["id"], "banner", "image/png", b"<svg/>", OWNER))
refused("an svg is refused outright", lambda: store.set_art(seated["id"], "banner", "image/svg+xml", b"<svg/>", OWNER))
refused("an oversized image is refused", lambda: store.set_art(seated["id"], "banner", "image/png", PNG + b"0" * (512 * 1024), OWNER))
refused("an unknown slot is refused", lambda: store.set_art(seated["id"], "wallpaper", "image/png", PNG, OWNER))
refused("a board with no logo has none to read", lambda: store.art(seated["id"], "banner", OWNER), 404)

check("a logo starts centred", arted["art"]["logo"]["focus"] == {"x": 50, "y": 50})
placed = store.place_art(seated["id"], "logo", {"x": 20, "y": 80}, OWNER)
check("a logo can be moved", placed["art"]["logo"]["focus"] == {"x": 20, "y": 80})
check("moving it does not touch the bytes", placed["art"]["logo"]["hash"] == arted["art"]["logo"]["hash"])
check("moving it counts as a change", placed["rev"] > arted["rev"])
check(
    "a focus point is clamped and rounded",
    store.place_art(seated["id"], "logo", {"x": -40, "y": 217.6}, OWNER)["art"]["logo"]["focus"]
    == {"x": 0, "y": 100},
)
refused("nonsense coordinates are refused", lambda: store.place_art(seated["id"], "logo", {"x": "left"}, OWNER))
refused("a read-only seat cannot move artwork", lambda: store.place_art(seated["id"], "logo", {"x": 10, "y": 10}, GUEST), 403)
refused("a slot with no image cannot be moved", lambda: store.place_art(seated["id"], "banner", {"x": 10, "y": 10}, OWNER), 404)
uploaded = store.set_art(seated["id"], "banner", "image/png", PNG, OWNER, focus={"x": 30, "y": 70})
check("an upload can carry where it should sit", uploaded["art"]["banner"]["focus"] == {"x": 30, "y": 70})
check("replacing an image resets it to centred", store.set_art(seated["id"], "logo", "image/png", PNG, OWNER)["art"]["logo"]["focus"] == {"x": 50, "y": 50})

cleared = store.drop_art(seated["id"], "logo", OWNER)
check("a removed logo leaves the record", "logo" not in cleared["art"])
check("a removed logo leaves the disk", not os.path.exists(os.path.join(workspace, "board-art", "%s-logo.png" % seated["id"])))
refused("a removed logo cannot be read", lambda: store.art(seated["id"], "logo", OWNER), 404)

store.remove(seated["id"], HELPER)
check("deleting a board takes its artwork with it", not os.path.exists(os.path.join(workspace, "board-art", "%s-banner.png" % seated["id"])))


print("\n=== files on a card, on the store ===")

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n"
FILE_DIR = os.path.join(workspace, "board-files")

filed = store.create("Attachments", "", "sky", "private", OWNER, [{"name": HELPER, "role": "editor"}])
store.answer_ask(filed["id"], HELPER, True)
seat(filed["id"], GUEST, "viewer")
filed_list = filed["lists"][0]["id"]
holder = store.add_card(filed["id"], filed_list, "Card with files", OWNER)["card"]

check("a card starts with no files", holder["files"] == [])

shot = store.attach_file(filed["id"], holder["id"], "screen shot.png", "image/png", PNG, OWNER)
entry = shot["files"][0]
check("a file lands on the card", len(shot["files"]) == 1)
check("a file keeps its name", entry["name"] == "screen shot.png")
check("a file records its type", entry["type"] == "image/png")
check("a file records its size", entry["bytes"] == len(PNG))
check("a file records who attached it", entry["by"] == OWNER)
check("attaching leaves an activity line", shot["activity"][-1]["what"] == "attached")
check("the bytes are written beside the store", os.path.exists(os.path.join(FILE_DIR, "%s.png" % entry["id"])))
check("the file reads back as the bytes sent", store.attachment(filed["id"], holder["id"], entry["id"], OWNER)[1] == PNG)
check("a read-only seat can read a file", store.attachment(filed["id"], holder["id"], entry["id"], GUEST)[1] == PNG)
refused("a stranger cannot read a file", lambda: store.attachment(filed["id"], holder["id"], entry["id"], QUIET), 404)
refused("a read-only seat cannot attach a file", lambda: store.attach_file(filed["id"], holder["id"], "x.png", "image/png", PNG, GUEST), 403)

paper = store.attach_file(filed["id"], holder["id"], "the brief.pdf", "application/pdf", PDF, HELPER)
check("a pdf is allowed too", paper["files"][1]["type"] == "application/pdf")

refused("an svg is refused outright", lambda: store.attach_file(filed["id"], holder["id"], "x.svg", "image/svg+xml", b"<svg/>", OWNER))
refused("a zip is refused", lambda: store.attach_file(filed["id"], holder["id"], "x.zip", "application/zip", b"PK\x03\x04", OWNER))
refused("html wearing a pdf name is refused", lambda: store.attach_file(filed["id"], holder["id"], "x.pdf", "application/pdf", b"<html>", OWNER))
refused("a png that is not one is refused", lambda: store.attach_file(filed["id"], holder["id"], "x.png", "image/png", b"<svg/>", OWNER))
refused("an empty file is refused", lambda: store.attach_file(filed["id"], holder["id"], "x.png", "image/png", b"", OWNER))
refused("an oversized file is refused", lambda: store.attach_file(filed["id"], holder["id"], "x.png", "image/png", PNG + b"0" * (4 * 1024 * 1024), OWNER))
check("nothing refused was written to disk", len([name for name in os.listdir(FILE_DIR) if not name.startswith(".")]) == 2)

named = store.attach_file(filed["id"], holder["id"], "../../etc/passwd", "image/jpeg", b"\xff\xd8\xffrest", OWNER)["files"][2]
check("a path in the name is thrown away", named["name"] == "passwd.jpg")
check("the true kind is put back on the name", store.attach_file(filed["id"], holder["id"], "note.pdf", "image/png", PNG, OWNER)["files"][3]["name"] == "note.pdf.png")
check("a jpeg spelling is not doubled", store.attach_file(filed["id"], holder["id"], "photo.JPEG", "image/jpeg", b"\xff\xd8\xffrest", OWNER)["files"][4]["name"] == "photo.jpg")
check("a nameless file still gets one", store.attach_file(filed["id"], holder["id"], "", "image/png", PNG, OWNER)["files"][5]["name"] == "attachment.png")

crowded = store.add_card(filed["id"], filed_list, "Full card", OWNER)["card"]
for index in range(10):
    store.attach_file(filed["id"], crowded["id"], "shot%d.png" % index, "image/png", PNG, OWNER)
refused("a card takes only so many files", lambda: store.attach_file(filed["id"], crowded["id"], "one more.png", "image/png", PNG, OWNER))

copied = store.duplicate_card(filed["id"], holder["id"], OWNER)["card"]
check("a copy carries the files", len(copied["files"]) == 6)
check("a copy holds its own bytes, not the same ones", {item["id"] for item in copied["files"]}.isdisjoint({item["id"] for item in store.board(filed["id"], OWNER)["cards"][holder["id"]]["files"]}))
check("the copy reads back", store.attachment(filed["id"], copied["id"], copied["files"][0]["id"], OWNER)[1] == PNG)
store.remove_card(filed["id"], copied["id"], OWNER)

dropped = store.remove_file(filed["id"], holder["id"], entry["id"], OWNER)
check("a removed file leaves the card", entry["id"] not in [item["id"] for item in dropped["files"]])
check("a removed file leaves the disk", not os.path.exists(os.path.join(FILE_DIR, "%s.png" % entry["id"])))
refused("a removed file cannot be read", lambda: store.attachment(filed["id"], holder["id"], entry["id"], OWNER), 404)
refused("an unknown file id is a 404", lambda: store.remove_file(filed["id"], holder["id"], "ff" * 8, OWNER), 404)

binned = store.add_card(filed["id"], filed_list, "Deleted with a file on it", OWNER)["card"]
kept = store.attach_file(filed["id"], binned["id"], "kept.pdf", "application/pdf", PDF, OWNER)["files"][0]
store.remove_card(filed["id"], binned["id"], OWNER)
check("a binned card keeps its file on disk", os.path.exists(os.path.join(FILE_DIR, "%s.pdf" % kept["id"])))
back = store.undelete_card(filed["id"], binned["id"], OWNER)["card"]
check("undo brings the file back with the card", [item["id"] for item in back["files"]] == [kept["id"]])
check("the file undo brought back still reads", store.attachment(filed["id"], binned["id"], kept["id"], OWNER)[1] == PDF)

store.remove_card(filed["id"], binned["id"], OWNER)
for index in range(12):
    spare = store.add_card(filed["id"], filed_list, "Filler %d" % index, OWNER)["card"]
    store.remove_card(filed["id"], spare["id"], OWNER)
check("a file goes when the undo it sat in runs out", not os.path.exists(os.path.join(FILE_DIR, "%s.pdf" % kept["id"])))

elsewhere = store.create("Somewhere else", "", "amber", "private", OWNER)
travelling = store.add_card(filed["id"], filed_list, "Going away", OWNER)["card"]
carried = store.attach_file(filed["id"], travelling["id"], "carried.png", "image/png", PNG, OWNER)["files"][0]
store.transfer_card(filed["id"], travelling["id"], elsewhere["id"], None, OWNER)
landed = next(iter(store.board(elsewhere["id"], OWNER)["cards"].values()))
check("a transferred card keeps its file", [item["id"] for item in landed["files"]] == [carried["id"]])
check("a transferred file reads on the new board", store.attachment(elsewhere["id"], landed["id"], carried["id"], OWNER)[1] == PNG)
refused("a transferred file is gone from the old board", lambda: store.attachment(filed["id"], travelling["id"], carried["id"], OWNER), 404)
store.remove(elsewhere["id"], OWNER)
check("deleting a board takes the files with it", not os.path.exists(os.path.join(FILE_DIR, "%s.png" % carried["id"])))

store.remove(filed["id"], OWNER)
check("deleting a board leaves nothing behind on disk", [name for name in os.listdir(FILE_DIR) if not name.startswith(".")] == [])


print("\n=== sealed boards ===")

check("the keyholder is known", store.keyholder(KEYHOLDER) is True)
check("the keyholder is matched whatever the case", store.keyholder(KEYHOLDER.upper()) is True)
check("nobody else is a keyholder", store.keyholder(HELPER) is False)

shut = store.create("Sealed work", "Nobody else", "rose", "sealed", OWNER)
check("a board can be created sealed", shut["visibility"] == "sealed")
check("its creator is on it", shut["members"] == {OWNER: "owner", KEYHOLDER: "owner"})
check("its creator can still change it", shut["canAdmin"] is True)

check("boards.manage does not list a sealed board", store.listing(HELPER, manage=True) == [])
refused("boards.manage cannot open a sealed board", lambda: store.board(shut["id"], HELPER, manage=True), 404)
refused(
    "boards.manage cannot change a card on a sealed board",
    lambda: store.add_card(shut["id"], shut["lists"][0]["id"], "Sneaked in", HELPER, manage=True),
    404,
)
refused("boards.manage cannot delete a sealed board", lambda: store.remove(shut["id"], HELPER, manage=True), 404)
check("it is not in a manage holder's pulse", shut["id"] not in store.pulse(HELPER, manage=True)["boards"])
check("nor in their work", store.assigned(HELPER, manage=True) == [])

check("the keyholder lists it", any(entry["id"] == shut["id"] for entry in store.listing(KEYHOLDER)))
check("the keyholder opens it as an owner", store.board(shut["id"], KEYHOLDER)["seat"] == "owner")
check("the keyholder sees it without boards.manage", shut["id"] in store.pulse(KEYHOLDER)["boards"])

seated = seat(shut["id"], HELPER, "editor")
check("a named person gets in", seated["members"][HELPER] == "editor")
check("and they see it listed", any(entry["id"] == shut["id"] for entry in store.listing(HELPER)))
check("with the seat they were given, not owner", store.board(shut["id"], HELPER, manage=True)["seat"] == "editor")
refused(
    "an editor on a sealed board still cannot reseat people",
    lambda: store.set_member(shut["id"], GUEST, "editor", HELPER, manage=True),
    403,
)
store.drop_member(shut["id"], HELPER, OWNER)
check("taking them off closes it again", store.listing(HELPER, manage=True) == [])

opened = store.update(shut["id"], {"visibility": "private"}, OWNER)
check("its owner can unseal it", opened["visibility"] == "private")
check("and then boards.manage sees it again", len(store.listing(HELPER, manage=True)) == 1)
refused(
    "a manage holder who is not on the board cannot seal it out from under themselves",
    lambda: store.update(shut["id"], {"visibility": "sealed"}, HELPER, manage=True),
    409,
)
check("so it stays where it was", store.board(shut["id"], HELPER, manage=True)["visibility"] == "private")
store.update(shut["id"], {"visibility": "sealed"}, OWNER)
check("its own owner can seal it again", store.board(shut["id"], OWNER)["visibility"] == "sealed")
refused("a sealed board is invisible to a stranger too", lambda: store.board(shut["id"], GUEST), 404)
store.remove(shut["id"], OWNER)

refused("a made-up visibility is refused", lambda: store.create("Nope", "", "sky", "everyone", OWNER))


print("\n=== boards of their own ===")

owned = store.create("Their own thing", "", "amber", "private", MAKER, manage=BOARD_OWN)
check("boards.own can make a board", owned["members"] == {MAKER: "owner", KEYHOLDER: "owner"})
check("and it is theirs to run", owned["canAdmin"] is True)
check("it can be renamed like any other", store.update(owned["id"], {"name": "Their own work"}, MAKER, BOARD_OWN)["name"] == "Their own work")
refused(
    "boards.own cannot open a new board to the whole team",
    lambda: store.create("Everyone", "", "sky", "team", MAKER, manage=BOARD_OWN),
    403,
)
refused(
    "boards.own cannot seal one away either",
    lambda: store.create("Hidden", "", "sky", "sealed", MAKER, manage=BOARD_OWN),
    403,
)
refused(
    "nor turn their own board team-wide afterwards",
    lambda: store.update(owned["id"], {"visibility": "team"}, MAKER, BOARD_OWN),
    403,
)

general = store.create("The general board", "", "sky", "team", OWNER)
check("boards.read sees a team-wide board", any(entry["id"] == general["id"] for entry in store.listing(GUEST)))
check("boards.own sees only its own", [entry["id"] for entry in store.listing(MAKER, BOARD_OWN)] == [owned["id"]])
refused("boards.own cannot open a team-wide board", lambda: store.board(general["id"], MAKER, BOARD_OWN), 404)
refused(
    "nor put a card on one",
    lambda: store.add_card(general["id"], general["lists"][0]["id"], "Sneaked in", MAKER, BOARD_OWN),
    404,
)
check("a team-wide board stays out of their pulse", general["id"] not in store.pulse(MAKER, BOARD_OWN)["boards"])
check("and out of their work", store.assigned(MAKER, BOARD_OWN) == [])

seat(general["id"], MAKER, "editor")
check("but a seat on one lets them in", store.board(general["id"], MAKER, BOARD_OWN)["seat"] == "editor")
check("with the seat they were given, not editor by default", store.board(general["id"], MAKER, BOARD_OWN)["canAdmin"] is False)
check("and it joins their list", len(store.listing(MAKER, BOARD_OWN)) == 2)
check("boards.manage still sees the board they made", store.board(owned["id"], HELPER, manage=True)["seat"] == "owner")
store.remove(general["id"], OWNER)
store.remove(owned["id"], MAKER)


print("\n=== who else is here ===")

crowded = store.create("Shared board", "", "sky", "team", OWNER)
alone = store.pulse(OWNER, watching=crowded["id"])
check("watching a board reports who is here", alone["here"] == [])
check("the pulse still carries the boards", crowded["id"] in alone["boards"])

store.pulse(HELPER, watching=crowded["id"])
check("the other person shows up", store.pulse(OWNER, watching=crowded["id"])["here"] == [HELPER])
check("you are never in your own list", HELPER not in store.pulse(HELPER, watching=crowded["id"])["here"])
check("a pulse with no board asks nothing about presence", "here" not in store.pulse(OWNER))

closed = store.create("Just mine", "", "rose", "private", OWNER)
check("a board you cannot see reports no presence", "here" not in store.pulse(GUEST, watching=closed["id"]))
check("a made-up board reports no presence", "here" not in store.pulse(OWNER, watching="deadbeefdeadbeef"))
store.remove(closed["id"], OWNER)

store.crowd[crowded["id"]][HELPER] = 0
check("somebody who wandered off drops out", store.pulse(OWNER, watching=crowded["id"])["here"] == [])
store.remove(crowded["id"], OWNER)


print("\n=== the keyholder is on every board ===")

theirs = store.create("Somebody else's board", "", "amber", "private", HELPER)
check("a board made by anybody carries the keyholder", theirs["members"] == {HELPER: "owner", KEYHOLDER: "owner"})
check("the real owner is untouched", theirs["members"][HELPER] == "owner")
check("the keyholder is not written to the file", KEYHOLDER not in (store.file.read()["boards"][theirs["id"]]["members"]))
check("the keyholder can be given cards", KEYHOLDER in store.board(theirs["id"], HELPER)["members"])

refused(
    "the keyholder cannot be seated by hand",
    lambda: store.set_member(theirs["id"], KEYHOLDER, "viewer", HELPER),
    409,
)
refused(
    "the keyholder cannot be taken off",
    lambda: store.drop_member(theirs["id"], KEYHOLDER, HELPER),
    409,
)
seat(theirs["id"], OWNER, "viewer", by=HELPER)
bulked = store.set_members(theirs["id"], [{"name": KEYHOLDER, "role": "viewer"}, {"name": OWNER, "role": "editor"}], HELPER)
check("a bulk write ignores the keyholder and takes the rest", bulked["members"][OWNER] == "editor")
check("and leaves them an owner", bulked["members"][KEYHOLDER] == "owner")
check("the last-owner guard still counts real owners only", store._owners(store.file.read()["boards"][theirs["id"]]) == [HELPER])
store.remove(theirs["id"], HELPER)


print("\n=== revisions and the pulse ===")

watched = store.create("Live board", "", "sky", "private", OWNER)
check("a new board starts at revision one", watched["rev"] == 1)

pulse = store.pulse(OWNER)
check("the pulse names the boards you can see", watched["id"] in pulse["boards"])
check("the pulse carries the revision", pulse["boards"][watched["id"]] == 1)
check("the pulse is stamped", bool(pulse["at"]))

column = watched["lists"][0]["id"]
dropped = store.add_card(watched["id"], column, "Watch me", OWNER)
check("adding a card moves the revision on", dropped["board"]["rev"] == 2)
check("the pulse follows the card", store.pulse(OWNER)["boards"][watched["id"]] == 2)

unchanged = store.pulse(OWNER)["boards"][watched["id"]]
check("reading does not move the revision", unchanged == 2)

store.update_card(watched["id"], dropped["card"]["id"], {"notes": "typed by somebody else"}, OWNER)
check("a card edit moves the revision", store.pulse(OWNER)["boards"][watched["id"]] == 3)
check("the board it returns agrees", store.board(watched["id"], OWNER)["rev"] == 3)

check("a stranger's pulse is empty of private boards", watched["id"] not in store.pulse(GUEST)["boards"])
seat(watched["id"], GUEST, "viewer")
check("a seat puts the board in their pulse", watched["id"] in store.pulse(GUEST)["boards"])
check("asking and accepting each move the revision", store.pulse(OWNER)["boards"][watched["id"]] == 5)
check("boards.manage pulses every board", watched["id"] in store.pulse(HELPER, manage=True)["boards"])

legacy = store.file.read()
legacy["boards"][watched["id"]].pop("rev")
store.file.write(legacy)
check("a board written before revisions reads as nought", store.board(watched["id"], OWNER)["rev"] == 0)
check("and its next change starts counting", store.update(watched["id"], {"note": "moved on"}, OWNER)["rev"] == 1)

store.remove(watched["id"], OWNER)
check("a deleted board leaves the pulse", watched["id"] not in store.pulse(OWNER)["boards"])


print("\n=== what a board is for ===")

spec = board_purposes()
check("the catalogue names every kind", [entry["id"] for entry in spec] == list(BOARD_PURPOSE_IDS))
check("a personal board asks for nothing", spec[0]["fields"] == [])
check("every kind carries a blurb", all(entry["blurb"] for entry in spec))
check(
    "every field carries a label and a kind",
    all(field["label"] and field["kind"] for entry in spec for field in entry["fields"]),
)
check(
    "a field id never means two different things",
    all(
        len({field["kind"] for entry in spec for field in entry["fields"] if field["id"] == name}) == 1
        for name in BOARD_FACT_FIELDS
    ),
)
server_spec = next(entry for entry in spec if entry["id"] == "server")
check("a server board asks who owns it", "owner" in [field["id"] for field in server_spec["fields"]])
check("a server board asks for the ip", "host" in [field["id"] for field in server_spec["fields"]])
check("a server board asks for the port", "port" in [field["id"] for field in server_spec["fields"]])
check(
    "the ip and the owner are asked for up front",
    all(
        field["key"]
        for field in server_spec["fields"]
        if field["id"] in ("host", "port", "owner", "game")
    ),
)
check(
    "a client board offers where it stands",
    "Handed over"
    in next(
        field["options"]
        for entry in spec
        if entry["id"] == "client"
        for field in entry["fields"]
        if field["id"] == "stage"
    ),
)

plain = store.create("Just mine", "", "slate", "private", OWNER)
check("a board with nothing said is personal", plain["purpose"] == "personal")
check("and holds no details", plain["facts"] == {})

kit = store.create(
    "Kostas roleplay",
    "The FiveM box",
    "amber",
    "private",
    OWNER,
    purpose="server",
    facts={"owner": "Kostas", "host": "http://5.9.108.4/", "port": " 30120 ", "game": "FiveM"},
)
check("a board can be made for a server", kit["purpose"] == "server")
check("the server owner is kept", kit["facts"]["owner"] == "Kostas")
check("a pasted address is trimmed back to the host", kit["facts"]["host"] == "5.9.108.4")
check("the port is kept as a number", kit["facts"]["port"] == "30120")

refused(
    "a nonsense port is refused",
    lambda: store.update(kit["id"], {"facts": {"port": "70000"}}, OWNER),
)
refused(
    "an address with a space in it is refused",
    lambda: store.update(kit["id"], {"facts": {"host": "5.9.108.4 spare"}}, OWNER),
)
refused(
    "a detail the board does not keep is refused",
    lambda: store.update(kit["id"], {"facts": {"password": "hunter2"}}, OWNER),
)
refused(
    "a renewal date has to be a date",
    lambda: store.update(kit["id"], {"facts": {"renews": "next tuesday"}}, OWNER),
)
refused(
    "a link has to be http",
    lambda: store.update(kit["id"], {"facts": {"panel": "javascript:alert(1)"}}, OWNER),
)
refused(
    "a made-up stage is refused",
    lambda: store.update(kit["id"], {"facts": {"stage": "nearly"}}, OWNER),
)

topped = store.update(kit["id"], {"facts": {"region": "Falkenstein", "renews": "2026-09-12"}}, OWNER)
check("a detail can be added on its own", topped["facts"]["region"] == "Falkenstein")
check("without disturbing the others", topped["facts"]["owner"] == "Kostas")
check("a date is kept as a day", topped["facts"]["renews"] == "2026-09-12")
cleared = store.update(kit["id"], {"facts": {"region": ""}}, OWNER)
check("an emptied detail is dropped", "region" not in cleared["facts"])
check("and the rest stay", cleared["facts"]["port"] == "30120")
check("changing details moves the revision on", cleared["rev"] > topped["rev"])

turned = store.update(kit["id"], {"purpose": "personal"}, OWNER)
check("a board can change what it is for", turned["purpose"] == "personal")
check("details from before are kept, not thrown away", turned["facts"]["host"] == "5.9.108.4")
check(
    "switching back shows them again",
    store.update(kit["id"], {"purpose": "server"}, OWNER)["facts"]["owner"] == "Kostas",
)
refused("a made-up kind is refused", lambda: store.update(kit["id"], {"purpose": "spaceship"}, OWNER))

seat(kit["id"], HELPER, "editor")
refused(
    "an editor cannot change the server details",
    lambda: store.update(kit["id"], {"facts": {"host": "1.1.1.1"}}, HELPER),
    403,
)
check("but an editor can read them", store.board(kit["id"], HELPER)["facts"]["host"] == "5.9.108.4")

store.update(kit["id"], {"archived": True}, OWNER)
refused(
    "an archived board will not take a detail",
    lambda: store.update(kit["id"], {"facts": {"slots": "64"}}, OWNER),
    409,
)
store.update(kit["id"], {"archived": False}, OWNER)

legacy = store.file.read()
legacy["boards"][kit["id"]]["facts"]["mystery"] = "left by an older release"
legacy["boards"][kit["id"]]["facts"]["blank"] = ""
store.file.write(legacy)
kept = store.board(kit["id"], OWNER)
check("a detail nothing asks for is not handed out", "mystery" not in kept["facts"])
check("nor an empty one", "blank" not in kept["facts"])
check("and the real ones survive it", kept["facts"]["port"] == "30120")

store.remove(kit["id"], OWNER)
store.remove(plain["id"], OWNER)


print("\n=== who a card can be put on ===")

asking = store.create("Invites", "", "purple", "private", OWNER)
todo_ask = asking["lists"][0]["id"]
job = store.add_card(asking["id"], todo_ask, "Cut the release", OWNER)["card"]
refused(
    "somebody who cannot open the board cannot be put on a card",
    lambda: store.update_card(asking["id"], job["id"], {"assignees": [HELPER]}, OWNER, known={OWNER, HELPER}),
    409,
)
seat(asking["id"], HELPER, "editor")
put = store.update_card(asking["id"], job["id"], {"assignees": [HELPER]}, OWNER, known={OWNER, HELPER})
check("somebody on the board can be put on a card", put["assignees"] == [HELPER])
check("putting somebody on is written to the card", put["activity"][-1]["what"] == "assigned")
check("it lands in their work", any(entry["card"]["id"] == job["id"] for entry in store.assigned(HELPER)))
off = store.update_card(asking["id"], job["id"], {"assignees": []}, OWNER, known={OWNER, HELPER})
check("taking somebody off is allowed", off["assignees"] == [])
mine = store.update_card(asking["id"], job["id"], {"assignees": [OWNER]}, OWNER, known={OWNER, HELPER})
check("you can always put yourself on", mine["assignees"] == [OWNER])
store.remove(asking["id"], OWNER)

print("\n=== over the api ===")

owner_session = sign_in(OWNER, OWNER_PASSWORD)
helper_session = sign_in(HELPER, HELPER_PASSWORD)
guest_session = sign_in(GUEST, GUEST_PASSWORD)

status, _, raw, _ = request("GET", "/boards")
check("boards need a session", status == 401)

status, _, raw, _ = request("GET", "/boards", cookie=owner_session)
check("the owner can list boards", status == 200)
check("the listing says who you are", as_json(raw).get("you") == OWNER)
check("the listing carries the colours", "emerald" in (as_json(raw).get("colours") or []))

status, _, raw, _ = request("POST", "/boards/create", {"name": "Site work", "note": "", "colour": "purple", "visibility": "private"}, cookie=guest_session)
check("a viewer account cannot create a board", status == 403)

status, _, raw, _ = request("POST", "/boards/create", {"name": "Site work", "colour": "purple", "visibility": "private"}, cookie=owner_session)
check("the owner can create a board", status == 200)
made = as_json(raw)["board"]
first = made["lists"][0]["id"]

status, _, raw, _ = request("POST", "/boards/cards/create", {"id": made["id"], "list": first, "title": "Ship the boards tab"}, cookie=owner_session)
check("a card can be added over the api", status == 200)
new_card = as_json(raw)["card"]["id"]

status, _, raw, _ = request("GET", "/boards/board?id=%s" % made["id"], cookie=guest_session)
check("a stranger gets a 404, not a 403", status == 404)

status, _, raw, _ = request("POST", "/boards/cards/update", {"id": made["id"], "card": new_card, "done": True}, cookie=guest_session)
check("a stranger cannot touch a card", status == 404)

status, _, raw, _ = request("GET", "/boards/board?id=%s" % made["id"], cookie=helper_session)
check("an account holding boards.manage sees every board", status == 200)

status, _, raw, _ = request("POST", "/boards/members/ask", {"id": made["id"], "name": "nobody", "role": "editor"}, cookie=owner_session)
check("an unknown account cannot be asked onto a board", status == 400)

status, _, raw, _ = request("POST", "/boards/members", {"id": made["id"], "name": GUEST, "role": "editor"}, cookie=owner_session)
check("nobody can be seated straight onto a board", status == 409)

status, _, raw, _ = request("POST", "/boards/members/ask", {"id": made["id"], "name": GUEST, "role": "editor"}, cookie=owner_session)
check("a person can be asked onto a board over the api", status == 200)
check("asking leaves them off the board", GUEST not in (as_json(raw)["board"]["members"] or {}))
check("the request is on the board", [entry["who"] for entry in as_json(raw)["board"]["asks"]] == [GUEST])

status, _, raw, _ = request("GET", "/boards/board?id=%s" % made["id"], cookie=guest_session)
check("being asked does not let them open it yet", status == 404)

status, _, raw, _ = request("GET", "/boards", cookie=guest_session)
check("the request shows up in their own listing", [entry["id"] for entry in as_json(raw).get("asks") or []] == [made["id"]])
check("the request says who asked", (as_json(raw)["asks"][0] or {}).get("by") == OWNER)

status, _, raw, _ = request("POST", "/boards/members/ask/reply", {"id": made["id"], "accept": True}, cookie=helper_session)
check("somebody who was not asked cannot join a board", status == 404)

status, _, raw, _ = request("POST", "/boards/members/ask/reply", {"id": made["id"], "accept": True}, cookie=guest_session)
check("the person asked can accept", status == 200 and as_json(raw)["joined"] is True)

status, _, raw, _ = request("GET", "/boards/board?id=%s" % made["id"], cookie=guest_session)
check("accepting lets them open it", status == 200)
check("accepting seats them as asked", as_json(raw)["board"]["members"][GUEST] == "editor")
check("accepting clears the request", as_json(raw)["board"]["asks"] == [])

status, _, raw, _ = request("POST", "/boards/members/ask", {"id": made["id"], "name": GUEST, "role": "viewer"}, cookie=owner_session)
check("somebody already on the board cannot be asked", status == 409)

status, _, raw, _ = request("POST", "/boards/cards/update", {"id": made["id"], "card": new_card, "title": "Ship it"}, cookie=guest_session)
check("the member can rename a card", status == 200 and as_json(raw)["card"]["title"] == "Ship it")

status, _, raw, _ = request(
    "POST",
    "/boards/cards/update",
    {"id": made["id"], "card": new_card, "assignees": [HELPER]},
    cookie=owner_session,
)
check("somebody who is not on the board cannot be put on a card", status == 409)

status, _, raw, _ = request(
    "POST",
    "/boards/cards/update",
    {"id": made["id"], "card": new_card, "assignees": [GUEST]},
    cookie=owner_session,
)
check("somebody on the board can be put on a card over the api", status == 200)
check("and the card names them", as_json(raw)["card"]["assignees"] == [GUEST])

status, _, raw, _ = request("POST", "/boards/delete", {"id": made["id"]}, cookie=guest_session)
check("an editor cannot delete the board", status == 403)

status, _, raw, _ = request("POST", "/boards/cards/create", {"id": made["id"], "list": first, "title": "x"}, cookie=owner_session, origin="https://evil.example")
check("a foreign origin is refused", status == 403)

status, _, raw, _ = request("POST", "/boards/cards/comment", {"id": made["id"], "card": new_card, "body": "y" * 2000}, cookie=owner_session)
check("an oversized comment is refused", status in (400, 413))

status, _, raw, _ = request(
    "POST",
    "/boards/cards/update",
    {"id": made["id"], "card": new_card, "notes": "Δοκιμή γραφής. " * 130},
    cookie=owner_session,
)
check("a long note in Greek is not refused as too large", status == 200)
check("the whole note comes back", len(as_json(raw)["card"]["notes"]) > 1800)

status, _, raw, _ = request(
    "POST",
    "/boards/cards/update",
    {"id": made["id"], "card": new_card, "notes": "x" * 20000},
    cookie=owner_session,
)
check("a body past the board limit is still refused", status == 413)

status, _, raw, _ = request(
    "POST",
    "/boards/art",
    {"id": made["id"], "kind": "logo", "data": "data:image/png;base64," + base64.b64encode(PNG).decode("ascii")},
    cookie=owner_session,
)
check("a logo can be uploaded over the api", status == 200)
check("the answer carries the new logo", (as_json(raw)["board"]["art"].get("logo") or {}).get("bytes") == len(PNG))

status, headers, raw, _ = request("GET", "/boards/art?id=%s&kind=logo" % made["id"], cookie=owner_session)
check("the logo comes back as an image", status == 200 and headers.get("Content-Type") == "image/png")
check("the logo comes back byte for byte", raw == PNG)
check("the logo is not cached in shared caches", "private" in (headers.get("Cache-Control") or ""))
check("the logo is served with nosniff", headers.get("X-Content-Type-Options") == "nosniff")

status, _, raw, _ = request(
    "POST",
    "/boards/create",
    {"name": "Private art", "colour": "rose", "visibility": "private"},
    cookie=owner_session,
)
shut = as_json(raw)["board"]
request(
    "POST",
    "/boards/art",
    {"id": shut["id"], "kind": "banner", "data": "data:image/png;base64," + base64.b64encode(PNG).decode("ascii")},
    cookie=owner_session,
)
status, _, raw, _ = request("GET", "/boards/art?id=%s&kind=banner" % shut["id"], cookie=guest_session)
check("someone off the board cannot fetch its artwork", status == 404)
request("POST", "/boards/delete", {"id": shut["id"]}, cookie=owner_session)

status, _, raw, _ = request(
    "POST",
    "/boards/art",
    {"id": made["id"], "kind": "logo", "data": "https://example.com/logo.png"},
    cookie=owner_session,
)
check("a url instead of a data url is refused", status == 400)

status, _, raw, _ = request(
    "POST",
    "/boards/art",
    {"id": made["id"], "kind": "logo", "data": "data:image/png;base64,bm90IGFuIGltYWdl"},
    cookie=owner_session,
)
check("a data url that is not an image is refused", status == 400)

status, _, raw, _ = request(
    "POST",
    "/boards/art",
    {"id": made["id"], "kind": "logo", "data": "data:image/png;base64," + "A" * (700 * 1024)},
    cookie=owner_session,
)
check("an oversized upload is refused", status == 413)

status, _, raw, _ = request("POST", "/boards/art/delete", {"id": made["id"], "kind": "logo"}, cookie=owner_session)
check("a logo can be taken off over the api", status == 200 and "logo" not in as_json(raw)["board"]["art"])

status, _, raw, _ = request(
    "POST",
    "/boards/members",
    {"id": made["id"], "people": [{"name": HELPER, "role": "editor"}, {"name": GUEST, "role": "viewer"}]},
    cookie=owner_session,
)
check("a bulk call cannot seat somebody who has not accepted", status == 409)

request("POST", "/boards/members/ask", {"id": made["id"], "name": HELPER, "role": "editor"}, cookie=owner_session)
request("POST", "/boards/members/ask/reply", {"id": made["id"], "accept": True}, cookie=helper_session)
status, _, raw, _ = request(
    "POST",
    "/boards/members",
    {"id": made["id"], "people": [{"name": HELPER, "role": "editor"}, {"name": GUEST, "role": "viewer"}]},
    cookie=owner_session,
)
check("several people already on it can be reseated in one call", status == 200)
check("each of them keeps the seat asked for", as_json(raw)["board"]["members"] == {OWNER: "owner", HELPER: "editor", GUEST: "viewer", KEYHOLDER: "owner"})

status, _, raw, _ = request(
    "POST",
    "/boards/members",
    {"id": made["id"], "people": [{"name": "ghost", "role": "editor"}]},
    cookie=owner_session,
)
check("an unknown account is refused in bulk", status == 400)

status, _, raw, _ = request(
    "POST",
    "/boards/create",
    {"name": "Kickoff", "colour": "amber", "visibility": "private", "people": [{"name": HELPER, "role": "viewer"}]},
    cookie=owner_session,
)
check("a board can be created with people over the api", status == 200)
seeded = as_json(raw)["board"]
check("the people named at creation are asked, not seated", seeded["members"] == {OWNER: "owner", KEYHOLDER: "owner"})
check("and each of them is waiting on the board", [entry["who"] for entry in seeded["asks"]] == [HELPER])
status, _, raw, _ = request("POST", "/boards/delete", {"id": seeded["id"]}, cookie=owner_session)

status, _, raw, _ = request("POST", "/users/delete", {"name": GUEST}, cookie=owner_session)
check("the account can be deleted", status == 200)
status, _, raw, _ = request("GET", "/boards/board?id=%s" % made["id"], cookie=owner_session)
check("deleting an account clears its seat", GUEST not in ((as_json(raw).get("board") or {}).get("members") or {}))

status, _, raw, _ = request(
    "POST",
    "/boards/create",
    {"name": "Sealed over the api", "colour": "rose", "visibility": "sealed"},
    cookie=owner_session,
)
check("a sealed board can be created over the api", status == 200)
hidden = as_json(raw)["board"]
check("the visibility list offers sealed", "sealed" in (as_json(request("GET", "/boards", cookie=owner_session)[2]).get("visibility") or []))
check("the listing names the keyholders", KEYHOLDER in (as_json(request("GET", "/boards", cookie=owner_session)[2]).get("keyholders") or []))

status, _, raw, _ = request("GET", "/boards", cookie=helper_session)
check(
    "an account holding boards.manage does not see a sealed board in the listing",
    all(entry["id"] != hidden["id"] for entry in as_json(raw)["boards"]),
)
status, _, raw, _ = request("GET", "/boards/board?id=%s" % hidden["id"], cookie=helper_session)
check("and gets a 404 opening it", status == 404)
status, _, raw, _ = request("GET", "/boards/pulse", cookie=helper_session)
check("and it is absent from their pulse", hidden["id"] not in as_json(raw)["boards"])

keyholder_session = sign_in(KEYHOLDER, KEYHOLDER_PASSWORD)
status, _, raw, _ = request("GET", "/boards/board?id=%s" % hidden["id"], cookie=keyholder_session)
check("the keyholder opens a sealed board over the api", status == 200)
check("as its owner", as_json(raw)["board"]["seat"] == "owner")

sealed_trail = [entry for entry in admin_api.audit.tail(60) if (entry.get("detail") or {}).get("board") == hidden["id"]]
check("a sealed board is still audited", bool(sealed_trail))
check("but its name is kept out of the audit log", all("name" not in (entry.get("detail") or {}) for entry in sealed_trail))
check("the audit still says it was sealed", any((entry.get("detail") or {}).get("visibility") == "sealed" for entry in sealed_trail))

status, _, raw, _ = request("POST", "/boards/delete", {"id": hidden["id"]}, cookie=helper_session)
check("boards.manage cannot delete it either", status == 404)
status, _, raw, _ = request("POST", "/boards/delete", {"id": hidden["id"]}, cookie=owner_session)
check("its own owner can delete it", status == 200)


print("\n=== boards of their own, over the api ===")

maker_session = sign_in(MAKER, MAKER_PASSWORD)
quiet_session = sign_in(QUIET, QUIET_PASSWORD)

status, _, raw, _ = request("GET", "/boards", cookie=quiet_session)
check("an account with no board permission is turned away", status == 403)
status, _, raw, _ = request("POST", "/boards/create", {"name": "Nope", "colour": "sky"}, cookie=quiet_session)
check("and cannot make one either", status == 403)

status, _, raw, _ = request("GET", "/boards", cookie=maker_session)
theirs_index = as_json(raw)
check("boards.own reaches the boards tab", status == 200)
check("it is told it can make one", theirs_index.get("canCreate") is True)
check("but not that it manages every board", theirs_index.get("canManage") is False)
check("it is told the team-wide boards are not its to see", theirs_index.get("canSeeTeam") is False)
check("and only private boards are on offer", theirs_index.get("visibility") == ["private"])

status, _, raw, _ = request(
    "POST", "/boards/create", {"name": "The general board", "colour": "sky", "visibility": "team"}, cookie=owner_session
)
general = as_json(raw)["board"]

status, _, raw, _ = request("GET", "/boards", cookie=maker_session)
check("a team-wide board is not in their list", all(entry["id"] != general["id"] for entry in as_json(raw)["boards"]))
status, _, raw, _ = request("GET", "/boards/board?id=%s" % general["id"], cookie=maker_session)
check("nor can they open one", status == 404)
status, _, raw, _ = request(
    "POST",
    "/boards/cards/create",
    {"id": general["id"], "list": general["lists"][0]["id"], "title": "Sneaked in"},
    cookie=maker_session,
)
check("nor put a card on one", status == 404)

status, _, raw, _ = request(
    "POST", "/boards/create", {"name": "Their own work", "colour": "amber", "visibility": "private"}, cookie=maker_session
)
check("boards.own can create a board of its own", status == 200)
theirs = as_json(raw)["board"]
check("and owns what it made", theirs["seat"] == "owner")

status, _, raw, _ = request(
    "POST", "/boards/create", {"name": "Everyone's", "colour": "sky", "visibility": "team"}, cookie=maker_session
)
check("but cannot create a team-wide one", status == 403)
check("with a sentence that says why", "Manage boards" in (as_json(raw).get("message") or ""))

status, _, raw, _ = request("POST", "/boards/update", {"id": theirs["id"], "visibility": "team"}, cookie=maker_session)
check("nor open its own board to the team afterwards", status == 403)

status, _, raw, _ = request(
    "POST",
    "/boards/cards/create",
    {"id": theirs["id"], "list": theirs["lists"][0]["id"], "title": "First thing"},
    cookie=maker_session,
)
check("it can work the board it made", status == 200)

status, _, raw, _ = request(
    "POST", "/boards/members/ask", {"id": theirs["id"], "name": HELPER, "role": "viewer"}, cookie=maker_session
)
check("and ask somebody onto it", status == 200)

status, _, raw, _ = request("GET", "/boards/board?id=%s" % theirs["id"], cookie=helper_session)
check("boards.manage can still open a board made this way", status == 200)

status, _, raw, _ = request("POST", "/boards/delete", {"id": theirs["id"]}, cookie=maker_session)
check("it can delete its own board", status == 200)
request("POST", "/boards/delete", {"id": general["id"]}, cookie=owner_session)

status, _, raw, _ = request("GET", "/boards", cookie=owner_session)
listing = as_json(raw)
offered = listing.get("purposes") or []
check("the listing hands over the kinds a board can be", [entry["id"] for entry in offered] == list(BOARD_PURPOSE_IDS))
check(
    "with the fields each one asks for",
    "host" in [field["id"] for entry in offered if entry["id"] == "server" for field in entry["fields"]],
)

status, _, raw, _ = request(
    "POST",
    "/boards/create",
    {
        "name": "Blxr network",
        "colour": "sky",
        "visibility": "private",
        "purpose": "server",
        "facts": {"owner": "Blxr", "host": "play.blxr.gg", "port": "25565", "game": "Minecraft"},
    },
    cookie=owner_session,
)
check("a server board can be created over the api", status == 200)
kit = as_json(raw)["board"]
check("it comes back as a server", kit["purpose"] == "server")
check("carrying the address", kit["facts"]["host"] == "play.blxr.gg")

status, _, raw, _ = request("GET", "/boards/board?id=%s" % kit["id"], cookie=owner_session)
check("opening a board hands over the kinds too", bool(as_json(raw).get("purposes")))
check("and the details it holds", as_json(raw)["board"]["facts"]["port"] == "25565")

status, _, raw, _ = request(
    "POST",
    "/boards/update",
    {"id": kit["id"], "facts": {"contact": "blxr on Discord", "panel": "https://panel.example.com"}},
    cookie=owner_session,
)
check("details can be filled in over the api", status == 200)
check("and are handed back", as_json(raw)["board"]["facts"]["contact"] == "blxr on Discord")

status, _, raw, _ = request(
    "POST", "/boards/update", {"id": kit["id"], "facts": {"port": "0"}}, cookie=owner_session
)
check("a bad port is refused over the api", status == 400)
check("with a sentence that says why", "1 to 65535" in (as_json(raw).get("message") or ""))

trail = [entry for entry in admin_api.audit.tail(60) if entry.get("action") == "board.details"]
check("filling in details is audited", bool(trail))
check("the audit names which details changed", "panel" in ((trail[-1].get("detail") or {}).get("fields") or []))
check(
    "but never what they were set to",
    "panel.example.com" not in json.dumps(trail[-1].get("detail") or {}),
)
made_trail = [
    entry
    for entry in admin_api.audit.tail(60)
    if entry.get("action") == "board.created" and (entry.get("detail") or {}).get("board") == kit["id"]
]
check("creating a server board says so in the audit", made_trail[0]["detail"]["purpose"] == "server")

status, _, raw, _ = request(
    "POST",
    "/boards/create",
    {"name": "Sealed server", "visibility": "sealed", "purpose": "server", "facts": {"host": "10.0.0.9"}},
    cookie=owner_session,
)
quiet = as_json(raw)["board"]
status, _, raw, _ = request(
    "POST", "/boards/update", {"id": quiet["id"], "facts": {"owner": "nobody you know"}}, cookie=owner_session
)
check("a sealed board takes details too", status == 200)
quiet_trail = [
    entry
    for entry in admin_api.audit.tail(20)
    if (entry.get("detail") or {}).get("board") == quiet["id"]
]
check(
    "and its name still stays out of the audit",
    all("name" not in (entry.get("detail") or {}) for entry in quiet_trail),
)
check(
    "while the audit still says what changed",
    any("owner" in ((entry.get("detail") or {}).get("fields") or []) for entry in quiet_trail),
)
request("POST", "/boards/delete", {"id": quiet["id"]}, cookie=owner_session)
request("POST", "/boards/delete", {"id": kit["id"]}, cookie=owner_session)

status, _, raw, _ = request("GET", "/boards", cookie=owner_session)
listing = as_json(raw)
check("the listing says who wears the general owner tag", listing.get("generals") == [OWNER])
check("an admin account does not wear it", HELPER not in (listing.get("generals") or []))
check("nor does the keyholder, who is only a viewer", KEYHOLDER not in (listing.get("generals") or []))
check("the seats on offer are unchanged", listing.get("roles") == ["owner", "editor", "viewer"])

status, _, raw, _ = request(
    "POST",
    "/boards/create",
    {"name": "Tagged board", "colour": "sky", "visibility": "private"},
    cookie=owner_session,
)
tagged = as_json(raw)["board"]
status, _, raw, _ = request("GET", "/boards/board?id=%s" % tagged["id"], cookie=owner_session)
opened = as_json(raw)
check("opening a board says the same", opened.get("generals") == [OWNER])
check("and only about people on that board", set(opened["generals"]) <= set(opened["board"]["members"]))

status, _, raw, _ = request(
    "POST",
    "/boards/members",
    {"id": tagged["id"], "name": HELPER, "role": "general"},
    cookie=owner_session,
)
check("general is not a seat anybody can hand out", status == 400)
check("and the refusal lists the real seats", "owner, editor, viewer" in (as_json(raw).get("message") or ""))

status, _, raw, _ = request(
    "POST", "/boards/members/ask", {"id": tagged["id"], "name": HELPER, "role": "editor"}, cookie=owner_session
)
check("a normal seat can still be asked for", status == 200)
request("POST", "/boards/members/ask/reply", {"id": tagged["id"], "accept": True}, cookie=helper_session)
status, _, raw, _ = request("GET", "/boards/board?id=%s" % tagged["id"], cookie=owner_session)
check("and adding them did not hand out the tag", as_json(raw).get("generals") == [OWNER])
request("POST", "/boards/delete", {"id": tagged["id"]}, cookie=owner_session)

status, _, raw, _ = request("POST", "/boards/lists/update", {"id": made["id"], "list": first, "cap": 4}, cookie=owner_session)
check("a column limit is set over the api", as_json(raw)["board"]["lists"][0]["cap"] == 4)
status, _, raw, _ = request("POST", "/boards/lists/update", {"id": made["id"], "list": first, "cap": 0}, cookie=owner_session)
check("a column limit is cleared over the api", as_json(raw)["board"]["lists"][0]["cap"] is None)

status, _, raw, _ = request("POST", "/boards/cards/create", {"id": made["id"], "list": first, "title": "Zebra"}, cookie=owner_session)
zebra = as_json(raw)["card"]["id"]
status, _, raw, _ = request("POST", "/boards/cards/create", {"id": made["id"], "list": first, "title": "Aardvark"}, cookie=owner_session)
aardvark = as_json(raw)["card"]["id"]
status, _, raw, _ = request("POST", "/boards/lists/sort", {"id": made["id"], "list": first, "by": "title"}, cookie=owner_session)
check("a column is sorted over the api", status == 200)
check("and the sort took", as_json(raw)["board"]["lists"][0]["cards"].index(aardvark) < as_json(raw)["board"]["lists"][0]["cards"].index(zebra))
status, _, raw, _ = request("POST", "/boards/lists/sort", {"id": made["id"], "list": first, "by": "vibes"}, cookie=owner_session)
check("a sort the api does not know is refused", status == 400)

status, _, raw, _ = request(
    "POST",
    "/boards/cards/bulk",
    {"id": made["id"], "cards": [zebra, aardvark], "action": "archive"},
    cookie=owner_session,
)
check("bulk runs over the api", status == 200 and as_json(raw)["changed"] == 2)
check("and the cards are archived", as_json(raw)["board"]["cards"][zebra]["archived"] is True)
status, _, raw, _ = request(
    "POST",
    "/boards/cards/bulk",
    {"id": made["id"], "cards": [zebra], "action": "assign", "value": "nobody"},
    cookie=owner_session,
)
check("bulk over the api refuses an account that does not exist", status == 400)

status, _, raw, _ = request("POST", "/boards/cards/delete", {"id": made["id"], "card": zebra}, cookie=owner_session)
check("deleting hands back an undo over the api", as_json(raw).get("undo") == zebra)
status, _, raw, _ = request("POST", "/boards/cards/undelete", {"id": made["id"], "card": zebra}, cookie=owner_session)
check("undo works over the api", status == 200 and zebra in as_json(raw)["board"]["cards"])
status, _, raw, _ = request("POST", "/boards/cards/undelete", {"id": made["id"], "card": zebra}, cookie=owner_session)
check("a second undo over the api is a 404", status == 404)

status, _, raw, _ = request("POST", "/boards/create", {"name": "Somewhere to send it", "colour": "sky", "visibility": "private"}, cookie=owner_session)
elsewhere = as_json(raw)["board"]
status, _, raw, _ = request(
    "POST",
    "/boards/cards/transfer",
    {"id": made["id"], "card": aardvark, "to": elsewhere["id"]},
    cookie=owner_session,
)
check("a card moves board over the api", status == 200)
check("and the answer names where it went", as_json(raw)["to"]["name"] == "Somewhere to send it")
check("and it is off the board it left", aardvark not in as_json(raw)["board"]["cards"])
landed_id = as_json(raw)["to"]["card"]
status, _, raw, _ = request("GET", "/boards/board?id=%s" % elsewhere["id"], cookie=owner_session)
check("and it is on the board it went to", landed_id in as_json(raw)["board"]["cards"])
status, _, raw, _ = request(
    "POST",
    "/boards/cards/transfer",
    {"id": elsewhere["id"], "card": landed_id, "to": elsewhere["id"]},
    cookie=owner_session,
)
check("a card cannot be sent to the board it is on, over the api", status == 409)
status, _, raw, _ = request("POST", "/boards/cards/create", {"id": made["id"], "list": first, "title": "Stays put"}, cookie=owner_session)
stuck = as_json(raw)["card"]["id"]
status, _, raw, _ = request(
    "POST",
    "/boards/cards/transfer",
    {"id": made["id"], "card": stuck, "to": "00000000"},
    cookie=owner_session,
)
check("a card cannot be sent to a board that is not there", status == 404)
check("and the card stays where it was", stuck in as_json(request("GET", "/boards/board?id=%s" % made["id"], cookie=owner_session)[2])["board"]["cards"])
request("POST", "/boards/delete", {"id": elsewhere["id"]}, cookie=owner_session)

status, _, raw, _ = request("GET", "/boards/pulse")
check("the pulse needs a session", status == 401)

status, headers, raw, _ = request("GET", "/boards/pulse", cookie=owner_session)
check("the pulse answers over the api", status == 200)
beat = as_json(raw)
check("the pulse lists the board", made["id"] in (beat.get("boards") or {}))
check("the pulse is never cached", "no-store" in (headers.get("Cache-Control") or ""))
held = beat["boards"][made["id"]]

status, _, raw, _ = request("GET", "/boards/pulse", cookie=owner_session)
check("a quiet pulse repeats itself", as_json(raw)["boards"][made["id"]] == held)

status, _, raw, _ = request(
    "POST",
    "/boards/cards/update",
    {"id": made["id"], "card": new_card, "title": "Changed by somebody else"},
    cookie=owner_session,
)
check("the edit lands", status == 200)
status, _, raw, _ = request("GET", "/boards/pulse", cookie=owner_session)
check("the pulse reports the change", as_json(raw)["boards"][made["id"]] > held)

status, _, raw, _ = request("GET", "/boards/pulse", cookie=guest_session)
check("a deleted account gets no pulse at all", status == 401)

print("\n=== files on a card, over the api ===")


def data_url(kind, blob):
    return "data:%s;base64,%s" % (kind, base64.b64encode(blob).decode("ascii"))


status, _, raw, _ = request(
    "POST",
    "/boards/cards/file",
    {"id": made["id"], "card": new_card, "name": "plan.png", "data": data_url("image/png", PNG)},
    cookie=owner_session,
)
check("a file can be attached over the api", status == 200)
attached = as_json(raw)["card"]["files"][0]
check("the card comes back with the file on it", attached["name"] == "plan.png")

status, headers, raw, _ = request(
    "GET",
    "/boards/cards/file?id=%s&card=%s&file=%s" % (made["id"], new_card, attached["id"]),
    cookie=owner_session,
)
check("the file reads back over the api", status == 200 and raw == PNG)
check("it is served as what it is", headers.get("Content-Type") == "image/png")
check("it is served for looking at, not saving", (headers.get("Content-Disposition") or "").startswith("inline"))
check("the served name is the one on the card", 'filename="plan.png"' in (headers.get("Content-Disposition") or ""))
check("the browser is told not to sniff it", headers.get("X-Content-Type-Options") == "nosniff")
check("a file is served under its own locked-down policy", "sandbox" in (headers.get("Content-Security-Policy") or ""))

status, headers, raw, _ = request(
    "GET",
    "/boards/cards/file?id=%s&card=%s&file=%s&get=1" % (made["id"], new_card, attached["id"]),
    cookie=owner_session,
)
check("a file can be asked for as a download", (headers.get("Content-Disposition") or "").startswith("attachment"))

status, _, raw, _ = request(
    "GET", "/boards/cards/file?id=%s&card=%s&file=%s" % (made["id"], new_card, attached["id"])
)
check("reading a file needs a session", status == 401)

status, _, raw, _ = request(
    "GET",
    "/boards/cards/file?id=%s&card=%s&file=%s" % (made["id"], new_card, attached["id"]),
    cookie=sign_in(MAKER, MAKER_PASSWORD),
)
check("a stranger gets a 404 for a file, not a 403", status == 404)

status, _, raw, _ = request(
    "POST",
    "/boards/cards/file",
    {"id": made["id"], "card": new_card, "name": "\u03c3\u03c7\u03ad\u03b4\u03b9\u03bf.png", "data": data_url("image/png", PNG)},
    cookie=owner_session,
)
check("a name in another alphabet is kept", status == 200)
greek = as_json(raw)["card"]["files"][1]
check("the name is kept as it was written", greek["name"] == "\u03c3\u03c7\u03ad\u03b4\u03b9\u03bf.png")

status, headers, raw, _ = request(
    "GET",
    "/boards/cards/file?id=%s&card=%s&file=%s" % (made["id"], new_card, greek["id"]),
    cookie=owner_session,
)
check("a name in another alphabet still serves", status == 200 and raw == PNG)
check("the header carries it escaped", "filename*=UTF-8''" in (headers.get("Content-Disposition") or ""))

status, _, raw, _ = request(
    "POST",
    "/boards/cards/file/delete",
    {"id": made["id"], "card": new_card, "file": greek["id"]},
    cookie=owner_session,
)
check("it can be taken off again", status == 200)

status, _, raw, _ = request(
    "POST",
    "/boards/cards/file",
    {"id": made["id"], "card": new_card, "name": "x.png", "data": "https://example.com/x.png"},
    cookie=owner_session,
)
check("a link is not a file", status == 400)

status, _, raw, _ = request(
    "POST",
    "/boards/cards/file",
    {"id": made["id"], "card": new_card, "name": "x.svg", "data": data_url("image/svg+xml", b"<svg/>")},
    cookie=owner_session,
)
check("an svg is refused over the api", status == 400)

status, _, raw, _ = request(
    "POST",
    "/boards/cards/file",
    {
        "id": made["id"],
        "card": new_card,
        "name": "big.png",
        "data": data_url("image/png", PNG + b"0" * (40 * 1024)),
    },
    cookie=owner_session,
)
check("a file bigger than a board write is let through", status == 200)
heavy = as_json(raw)["card"]["files"][1]

status, _, raw, _ = request(
    "POST",
    "/boards/cards/update",
    {"id": made["id"], "card": new_card, "notes": "n" * (40 * 1024)},
    cookie=owner_session,
)
check("the rest of a board still stops at its own ceiling", status == 413)

status, _, raw, _ = request(
    "POST",
    "/boards/cards/file/delete",
    {"id": made["id"], "card": new_card, "file": heavy["id"]},
    cookie=owner_session,
)
check("a file can be taken off over the api", status == 200 and len(as_json(raw)["card"]["files"]) == 1)

status, _, raw, _ = request(
    "GET",
    "/boards/cards/file?id=%s&card=%s&file=%s" % (made["id"], new_card, heavy["id"]),
    cookie=owner_session,
)
check("a file taken off cannot be read", status == 404)

status, _, raw, _ = request("GET", "/boards", cookie=owner_session)
check("the listing says how many files a card takes", (as_json(raw).get("limits") or {}).get("files") == 10)
check("the listing says what a card will take", "application/pdf" in (as_json(raw).get("fileTypes") or []))

actions = [entry["action"] for entry in admin_api.audit.tail(40)]
check("the pulse is not audited", not any(name == "board.pulse" for name in actions))
check("creating a board is audited", "board.created" in actions)
check("adding a member is audited", "board.member" in actions)
check("card churn is not audited", not any(name.startswith("card.") for name in actions))

status, _, raw, _ = request("POST", "/boards/delete", {"id": made["id"]}, cookie=owner_session)
check("the owner can delete the board", status == 200)

server.shutdown()

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
