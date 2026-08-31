#!/usr/bin/env python3

import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

workspace = tempfile.mkdtemp(prefix="admin-remember-")
os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "0" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")
os.environ["ADMIN_SESSIONS"] = os.path.join(workspace, "sessions.json")

import admin_api
from admin_api import (
    cookie_life,
    device_mark,
    issue_pending,
    issue_token,
    open_session,
    read_pending,
    read_token,
)

OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
SUBJECT = "1029384756"

HOUR = 3600
DAY = 24 * HOUR
GRACE = admin_api.ROTATE_GRACE

MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
MAC_CHROME_NEXT = MAC_CHROME.replace("Chrome/140", "Chrome/141")
WIN_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0"
IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36"

HERE = "mac/chrome"
THERE = "windows/edge"

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    if not condition:
        failures.append(label)
    print("[%s] %s" % ("PASS" if condition else "FAIL", label))


users = admin_api.users
sessions = admin_api.sessions
users.bootstrap_owner(OWNER, OWNER_PASSWORD)
now = time.time()


def version_of(user):
    return users.find(user)["tokenVersion"]


def opened(user=OWNER, at=None, remembered=True, device=HERE):
    return open_session(user, version_of(user), now if at is None else at, remembered, device, "127.0.0.1")


def token_for(user, at, started, remembered, device=HERE):
    sid, nonce = sessions.open(user, at, remembered, device, "127.0.0.1")
    return issue_token(user, version_of(user), at, started, remembered, sid, nonce)


print("=== an ordinary session is untouched ===")
plain = opened(remembered=False)
check("it reads back while it is fresh", read_token(plain, int(now), HERE) is not None)
check("it is not marked as remembered", read_token(plain, int(now), HERE)["r"] is False)
check("its cookie lives as long as the ceiling", cookie_life(False) == admin_api.SESSION_HOURS * HOUR)
check(
    "it idles out after %d minutes" % admin_api.IDLE_MINUTES,
    read_token(plain, int(now) + admin_api.IDLE_SECONDS + 1, HERE) is None,
)
check(
    "using it pushes the idle timeout back",
    read_token(token_for(OWNER, now + 30 * 60, now, False), int(now) + admin_api.IDLE_SECONDS + 1, HERE) is not None,
)
check(
    "but the %d-hour ceiling does not move" % admin_api.SESSION_HOURS,
    read_token(token_for(OWNER, now + 13 * HOUR, now, False), int(now) + 13 * HOUR, HERE) is None,
)

print()
print("=== a remembered session stays signed in ===")
kept = opened()
check("it reads back while it is fresh", read_token(kept, int(now), HERE) is not None)
check("it is still good an hour later", read_token(kept, int(now) + HOUR + 1, HERE) is not None)
check("it is still good a week later", read_token(kept, int(now) + 7 * DAY, HERE) is not None)
check("it is still good a year later", read_token(kept, int(now) + 365 * DAY, HERE) is not None)
check(
    "there is no hard ceiling on it",
    admin_api.session_ceiling(now, True) is None and admin_api.session_ceiling(now, False) is not None,
)
check("its cookie lives as long as a browser will keep one", cookie_life(True) == 400 * DAY)
check("it is marked as remembered", read_token(kept, int(now), HERE)["r"] is True)

print()
print("=== the cookie is swapped for a new one as you use it ===")
sid, first_nonce = sessions.open(OWNER, now, True, HERE, "127.0.0.1")
first = issue_token(OWNER, version_of(OWNER), now, now, True, sid, first_nonce)
check("the cookie you were given works", read_token(first, int(now), HERE) is not None)

second_nonce = sessions.rotate(sid, first_nonce, now, "127.0.0.1")
second = issue_token(OWNER, version_of(OWNER), now, now, True, sid, second_nonce)
check("the replacement works", read_token(second, int(now), HERE) is not None)
check("the one it replaced still works while the swap lands", read_token(first, int(now) + GRACE - 5, HERE) is not None)
check("a nonce cannot be rotated twice", sessions.rotate(sid, first_nonce, now, None) is None)

print()
print("=== a copied cookie is caught and the session is dropped ===")
check("the old cookie is refused once the swap has settled", read_token(first, int(now) + GRACE + 1, HERE) is None)
check("and the live cookie goes down with it", read_token(second, int(now) + GRACE + 2, HERE) is None)

held = opened()
check("a fresh session reads back", read_token(held, int(now), HERE) is not None)
check("a cookie made up out of nothing is refused", read_token(held.replace(held[10:14], "abcd"), int(now), HERE) is None)

print()
print("=== a cookie only works on the browser it was made on ===")
bound = opened()
check("it works where it was made", read_token(bound, int(now), HERE) is not None)
check("a browser update does not disturb it", device_mark(MAC_CHROME) == device_mark(MAC_CHROME_NEXT))
check("it is refused from another device", read_token(bound, int(now), THERE) is None)
check("and that closes the session", read_token(bound, int(now), HERE) is None)

check("chrome on a mac", device_mark(MAC_CHROME) == "mac/chrome")
check("edge is not read as chrome", device_mark(WIN_EDGE) == "windows/edge")
check("safari on an iphone", device_mark(IPHONE) == "iphone/safari")
check("android is not read as linux", device_mark(ANDROID) == "android/chrome")
check("no user agent at all still gives a mark", device_mark(None) == "other/other")

print()
print("=== the panel holds the list, so sessions can be dropped one at a time ===")
laptop = opened()
phone = opened()
check("both read back", read_token(laptop, int(now), HERE) is not None and read_token(phone, int(now), HERE) is not None)
check("the panel counts them", sessions.held_by(OWNER, now) >= 2)

sessions.close(read_token(laptop, int(now), HERE)["sid"])
check("signing out on one drops that one", read_token(laptop, int(now), HERE) is None)
check("  and leaves the other signed in", read_token(phone, int(now), HERE) is not None)

sessions.close_user(OWNER)
check("ending that account's sessions drops the rest", read_token(phone, int(now), HERE) is None)

stranger = opened()
sessions.clear()
check("ending every session empties the list", read_token(stranger, int(now), HERE) is None)
check("  and the list is empty", sessions.held_by(OWNER, now) == 0)

print()
print("=== a cookie the panel has no record of is refused ===")
orphan = issue_token(OWNER, version_of(OWNER), now, now, True, "notasession", "notanonce")
check("an unknown session id is refused", read_token(orphan, int(now), HERE) is None)
signed = issue_token(OWNER, version_of(OWNER), now, now, True, "", "")
check("an empty session id is refused", read_token(signed, int(now), HERE) is None)

print()
print("=== the choice cannot be forged ===")
kept = opened()
body, signature = kept.split(".")
stripped = admin_api.b64encode(
    admin_api.b64decode(body).decode("utf-8").replace('"r":true,', "").encode("utf-8")
)
check("taking the remembered flag off breaks the signature", read_token("%s.%s" % (stripped, signature), int(now), HERE) is None)
check(
    "a body the panel signed itself is the only one that reads back",
    read_token("%s.%s" % (body, admin_api.sign(body)), int(now) + 7 * DAY, HERE) is not None,
)

print()
print("=== every kill switch still reaches a remembered session ===")
users.create("helper", "admin", None, OWNER, password="secondaccount42", must_change=False)


def helper_kept():
    return opened("helper")


check("a remembered session for the helper reads back", read_token(helper_kept(), int(now), HERE) is not None)

users.update("helper", {"disabled": True}, OWNER)
check("a disabled account kills it", read_token(helper_kept(), int(now), HERE) is None)
users.update("helper", {"disabled": False}, OWNER)

users.update("helper", {"expires": "2020-01-01"}, OWNER)
check("an expired account kills it", read_token(helper_kept(), int(now), HERE) is None)
users.update("helper", {"expires": None}, OWNER)
check("it comes back once the account is well", read_token(helper_kept(), int(now), HERE) is not None)

standing = helper_kept()
users.bump_version("helper")
check("ending that account's sessions from the panel kills it", read_token(standing, int(now), HERE) is None)

kept = opened()
users.change_own_password(OWNER, "adifferentpassphrase19")
check("a password change kills it", read_token(kept, int(now), HERE) is None)

kept = opened()
check("the session left behind by the change is good", read_token(kept, int(now), HERE) is not None)

admin_api.revocations.revoke(time.time() + 1)
check("ending every session kills it", read_token(kept, int(now), HERE) is None)
check("and a week of waiting does not bring it back", read_token(kept, int(now) + 7 * DAY, HERE) is None)

print()
print("=== the Google two-step carries the choice across the redirect ===")
users.link_google(OWNER, "owner@example.com", SUBJECT)
later = time.time() + 10
version = version_of(OWNER)
check(
    "a plain two-step token asks for no remembering",
    read_pending(issue_pending(OWNER, version, later, SUBJECT), int(later))["r"] is False,
)
check(
    "a remembered two-step token says so",
    read_pending(issue_pending(OWNER, version, later, SUBJECT, True), int(later))["r"] is True,
)
check(
    "the two-step token is still short lived either way",
    read_pending(issue_pending(OWNER, version, later, SUBJECT, True), int(later) + admin_api.PENDING_SECONDS + 1) is None,
)

print()
print("=== the list survives a restart, and nothing sensitive is in it ===")
raw = open(os.environ["ADMIN_SESSIONS"], encoding="utf-8").read()
check("it is written to disk", len(raw) > 2)
check("no password or secret is in it", OWNER_PASSWORD not in raw and admin_api.ADMIN_SECRET not in raw)
check("it is not readable by anyone else", oct(os.stat(os.environ["ADMIN_SESSIONS"]).st_mode)[-3:] == "600")

restored = admin_api.Sessions(os.environ["ADMIN_SESSIONS"], admin_api.SESSION_LIMIT)
check("a restart reads it back", restored.held_by(OWNER, time.time()) == sessions.held_by(OWNER, time.time()))

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
