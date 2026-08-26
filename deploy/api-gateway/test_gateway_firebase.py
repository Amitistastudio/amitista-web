#!/usr/bin/env python3

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "admin-api"))

import gateway_store_firebase as gw
from firestore_double import MemoryDb

mem = MemoryDb()
gw.DB_FACTORY = lambda: mem

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    if not condition:
        failures.append(label)
    print("[%s] %s" % ("PASS" if condition else "FAIL", label))


LIVE_KEY = "amk_live_examplesecret"
mem.set("admin_tokens", "tok1", {
    "name": "gateway",
    "prefix": LIVE_KEY[:13],
    "hash": gw.hash_token(LIVE_KEY),
    "scopes": ["api.status"],
    "environment": "live",
    "revoked": False,
    "expires": None,
})

table = gw.FirestoreTokenTable(60)
match = table.match(LIVE_KEY)
check("known key matches", match is not None and match["id"] == "tok1")
check("matched scopes carried", match["scopes"] == ["api.status"])
check("unknown key rejected", table.match("amk_live_wrong") is None)

mem.set("admin_tokens", "tok2", {
    "name": "revoked-one",
    "hash": gw.hash_token("amk_live_revoked"),
    "scopes": ["api.status"],
    "environment": "live",
    "revoked": True,
    "expires": None,
})
table.reload(force=True)
revoked = table.match("amk_live_revoked")
check("revoked token still returned for handler to reject", revoked is not None and revoked["revoked"] is True)

usage = gw.FirestoreUsage()
usage.hit("tok1", "/v1/status")
usage.hit("tok1", "/v1/status")
usage.reject("tok2")
usage.flush(force=True)

stored = {identifier: data for identifier, data in mem.list("api_usage")}
check("usage flushed to firestore", "tok1" in stored and "tok2" in stored)
check("request count persisted", stored["tok1"]["requests"] == 2)
check("path breakdown persisted", stored["tok1"]["paths"].get("/v1/status") == 2)
check("reject count persisted", stored["tok2"]["rejected"] == 1)

reloaded = gw.FirestoreUsage()
reloaded.hit("tok1", "/v1/status")
reloaded.flush(force=True)
after = {identifier: data for identifier, data in mem.list("api_usage")}
check("counters are cumulative across restart", after["tok1"]["requests"] == 3)

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
