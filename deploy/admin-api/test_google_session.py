#!/usr/bin/env python3

import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

workspace = tempfile.mkdtemp(prefix="admin-google-session-")
os.environ["ADMIN_STATE"] = workspace
os.environ["ADMIN_SECRET"] = "0" * 64
os.environ["ADMIN_REVOKED"] = os.path.join(workspace, "revoked-before")

import admin_api
from admin_api import issue_pending, open_session, read_pending, read_token
from admin_store import StoreError

OWNER = "amitista"
OWNER_PASSWORD = "ownerpassphrase17"
SUBJECT = "1029384756"

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    if not condition:
        failures.append(label)
    print("[%s] %s" % ("PASS" if condition else "FAIL", label))


users = admin_api.users
users.bootstrap_owner(OWNER, OWNER_PASSWORD)
users.link_google(OWNER, "owner@example.com", SUBJECT)
version = users.find(OWNER)["tokenVersion"]
now = time.time()

print("=== a two-step token is not a session ===")
step = issue_pending(OWNER, version, now, SUBJECT)
session = open_session(OWNER, version, now, False, None, None)

check("the two-step token reads back", read_pending(step, int(now)) is not None)
check("the session token reads back", read_token(session, int(now)) is not None)
check("a two-step token is NOT accepted as a session", read_token(step, int(now)) is None)
check("a session token is NOT accepted as a two-step", read_pending(session, int(now)) is None)

step_body, step_signature = step.split(".")
session_body, session_signature = session.split(".")
check(
    "the two bodies sign differently",
    step_signature != admin_api.sign(step_body) and session_signature != admin_api.sign_pending(session_body),
)
check(
    "a two-step body re-signed with the session key is refused",
    read_token("%s.%s" % (step_body, admin_api.sign(step_body)), int(now)) is None,
)
check("a tampered two-step token is refused", read_pending("%s.%s" % (step_body, step_signature[::-1]), int(now)) is None)
check("a garbage two-step token is refused", read_pending("not-a-token", int(now)) is None)
check("an empty two-step token is refused", read_pending("", int(now)) is None)

print()
print("=== a two-step token expires on its own clock ===")
check("it is refused once past its expiry", read_pending(step, int(now) + admin_api.PENDING_SECONDS + 1) is None)
check(
    "it is much shorter lived than a session",
    admin_api.PENDING_SECONDS < admin_api.IDLE_SECONDS,
)

print()
print("=== a two-step token is bound to the Google identity ===")
check("a token for another Google id is refused", read_pending(issue_pending(OWNER, version, now, "8888888888"), int(now)) is None)

users.unlink_google(OWNER)
check("unlinking Google kills the two-step token", read_pending(step, int(now)) is None)

users.link_google(OWNER, "owner@example.com", SUBJECT)
rebound = users.find(OWNER)["tokenVersion"]
check("relinking changes tokenVersion", rebound != version)
check("the old two-step token stays dead", read_pending(step, int(now)) is None)

print()
print("=== the ordinary account gates still apply ===")
users.create("helper", "admin", None, OWNER, password="secondaccount42", must_change=False)
users.link_google("helper", "helper@example.com", "5555555555")


def helper_step():
    return issue_pending("helper", users.find("helper")["tokenVersion"], now, "5555555555")


check("a fresh two-step token reads back", read_pending(helper_step(), int(now)) is not None)

users.update("helper", {"disabled": True}, OWNER)
check("a disabled account kills the two-step token", read_pending(helper_step(), int(now)) is None)
users.update("helper", {"disabled": False}, OWNER)

users.update("helper", {"expires": "2020-01-01"}, OWNER)
check("an expired account kills the two-step token", read_pending(helper_step(), int(now)) is None)
users.update("helper", {"expires": None}, OWNER)

check("it works again once the account is well", read_pending(helper_step(), int(now)) is not None)

step = issue_pending(OWNER, users.find(OWNER)["tokenVersion"], now, SUBJECT)

admin_api.revocations.revoke(time.time() + 1)
check("signing out everywhere kills the two-step token", read_pending(step, int(now)) is None)

print()
print("=== an unknown account has no way in ===")
check("a two-step token for a missing account is refused", read_pending(issue_pending("ghost", 1, time.time(), SUBJECT), int(time.time())) is None)

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
