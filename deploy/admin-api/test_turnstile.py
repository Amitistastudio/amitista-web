#!/usr/bin/env python3

import io
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import admin_turnstile

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    mark = "ok " if condition else "FAIL"
    print("  [%s] %s" % (mark, label))
    if not condition:
        failures.append(label)


class Reply(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def stub(payload=None, error=None, capture=None):
    def opener(request, timeout=None):
        if capture is not None:
            capture.append(request)
        if error is not None:
            raise error
        return Reply(json.dumps(payload).encode("utf-8"))

    return opener


def configure(secret="secret-value", hostnames="amitista.com,www.amitista.com"):
    if secret is None:
        os.environ.pop("TURNSTILE_SECRET", None)
    else:
        os.environ["TURNSTILE_SECRET"] = secret
    if hostnames is None:
        os.environ.pop("TURNSTILE_HOSTNAMES", None)
    else:
        os.environ["TURNSTILE_HOSTNAMES"] = hostnames


def refused(token, payload=None, error=None, ip=None, action=admin_turnstile.ACTION):
    saved = urllib.request.urlopen
    urllib.request.urlopen = stub(payload, error)
    try:
        admin_turnstile.verify(token, ip, action)
        return None
    except admin_turnstile.VerificationError as failure:
        return failure
    finally:
        urllib.request.urlopen = saved


GOOD = {"success": True, "action": admin_turnstile.ACTION, "hostname": "amitista.com"}

print("\nunconfigured")
configure(secret=None, hostnames=None)
check("live() is false with nothing set", admin_turnstile.live() is False)
check("verification is skipped entirely", refused(None) is None)
check("a junk token is also skipped", refused("anything") is None)

configure(secret="secret-value", hostnames=None)
check("live() is false when hostnames are missing", admin_turnstile.live() is False)
check("a secret without hostnames does not enforce", refused("anything") is None)

print("\nconfigured")
configure()
check("live() is true once both are set", admin_turnstile.live() is True)
check("a valid token passes", refused("token", GOOD) is None)

print("\nmissing or malformed tokens")
for label, token in (
    ("a missing token", None),
    ("an empty token", ""),
    ("a non-string token", 12345),
    ("an oversized token", "x" * (admin_turnstile.TOKEN_LIMIT + 1)),
):
    outcome = refused(token, GOOD)
    check("%s is refused with 403" % label, outcome is not None and outcome.status == 403)

print("\nrejections from siteverify")
outcome = refused("token", {"success": False, "error-codes": ["invalid-input-response"]})
check("success:false is refused with 403", outcome is not None and outcome.status == 403)

outcome = refused("token", {"success": True, "action": "contact", "hostname": "amitista.com"})
check("a mismatched action is refused", outcome is not None and outcome.status == 403)

outcome = refused("token", {"success": True, "action": admin_turnstile.ACTION, "hostname": "evil.example"})
check("a mismatched hostname is refused", outcome is not None and outcome.status == 403)

outcome = refused("token", {"success": True, "action": admin_turnstile.ACTION, "hostname": "AMITISTA.COM"})
check("hostname matching is case-insensitive", outcome is None)

outcome = refused("token", "not-a-dict")
check("a non-object reply is refused", outcome is not None and outcome.status == 403)

print("\nsiteverify being unreachable fails closed")
outcome = refused("token", error=urllib.error.URLError("down"))
check("a network error refuses with 503", outcome is not None and outcome.status == 503)

outcome = refused("token", error=OSError("reset"))
check("a socket error refuses with 503", outcome is not None and outcome.status == 503)

print("\nthe request sent to siteverify")
capture = []
saved = urllib.request.urlopen
urllib.request.urlopen = stub(GOOD, capture=capture)
try:
    admin_turnstile.verify("token-value", "203.0.113.9")
finally:
    urllib.request.urlopen = saved

sent = capture[0] if capture else None
body = sent.data.decode("utf-8") if sent else ""
check("it posts to the canonical siteverify URL", sent is not None and sent.full_url == admin_turnstile.SITEVERIFY_URL)
check("it is a POST", sent is not None and sent.get_method() == "POST")
check("it sends the secret", "secret=secret-value" in body)
check("it sends the token", "response=token-value" in body)
check("it forwards the client address", "remoteip=203.0.113.9" in body)

capture = []
urllib.request.urlopen = stub(GOOD, capture=capture)
try:
    admin_turnstile.verify("token-value", None)
finally:
    urllib.request.urlopen = saved
check("it omits remoteip when there is no address", "remoteip" not in capture[0].data.decode("utf-8"))

configure(secret=None, hostnames=None)

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
