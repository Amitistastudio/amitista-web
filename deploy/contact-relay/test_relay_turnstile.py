#!/usr/bin/env python3

import json
import os
import socket
import sys
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

PASS_SECRET = "1x0000000000000000000000000000000AA"
DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    print("  [%s] %s" % ("ok " if condition else "FAIL", label))
    if not condition:
        failures.append(label)


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class BotStub(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    received = []

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        BotStub.received.append(self.rfile.read(length))
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args):
        pass


bot_port = free_port()
bot = ThreadingHTTPServer(("127.0.0.1", bot_port), BotStub)
threading.Thread(target=bot.serve_forever, daemon=True).start()

os.environ["CONTACT_TOKEN"] = "relay-test-token"
os.environ["CONTACT_BOT_URL"] = "http://127.0.0.1:%d" % bot_port
os.environ["TURNSTILE_SECRET"] = PASS_SECRET
os.environ["TURNSTILE_HOSTNAMES"] = "example.com"
os.environ["RATE_PER_IP"] = "1000"
os.environ["RATE_GLOBAL"] = "1000"

import contact_relay

relay_port = free_port()
relay = ThreadingHTTPServer(("127.0.0.1", relay_port), contact_relay.Handler)
threading.Thread(target=relay.serve_forever, daemon=True).start()

BASE = "http://127.0.0.1:%d" % relay_port


def enquiry(**overrides):
    payload = {
        "form": "contact",
        "name": "A Tester",
        "email": "tester@example.com",
        "message": "This is a genuine enquiry with enough words in it.",
        "botcheck": "",
    }
    payload.update(overrides)
    return payload


def post(payload, path="/api/contact"):
    request = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, {}
    except urllib.error.HTTPError as failure:
        body = failure.read().decode("utf-8", "replace")
        try:
            return failure.code, json.loads(body)
        except json.JSONDecodeError:
            return failure.code, {"raw": body}


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


print("\nthe relay reports its own state")
health = get("/healthz")
check("healthz says verification is live", health.get("verification") is True)

print("\nthe honeypot is enforced on the server, not just in the browser")
BotStub.received.clear()
status, body = post(enquiry(botcheck="http://spam.example"))
check("a filled honeypot is refused with 400", status == 400)
check("it is named as automated", "automated" in str(body.get("message", "")).lower())
check("nothing reached the bot", not BotStub.received)

print("\na submission with no verification token is refused")
BotStub.received.clear()
status, body = post(enquiry())
check("a missing token is refused with 403", status == 403)
check("nothing reached the bot", not BotStub.received)

status, _ = post(enquiry(**{"cf-turnstile-response": ""}))
check("an empty token is refused with 403", status == 403)

status, _ = post(enquiry(**{"cf-turnstile-response": "x" * 4096}))
check("an oversized token is refused with 403", status == 403)

print("\na real siteverify round trip refuses a token with no action")
BotStub.received.clear()
status, body = post(enquiry(**{"cf-turnstile-response": DUMMY_TOKEN}))
check("the testing token is refused with 403", status == 403)
check("nothing reached the bot", not BotStub.received)

print("\nthe same round trip is accepted once the action matches")
contact_relay.TURNSTILE_ACTIONS = contact_relay.TURNSTILE_ACTIONS + (None,)
BotStub.received.clear()
status, body = post(enquiry(**{"cf-turnstile-response": DUMMY_TOKEN}))
check("a verified enquiry is accepted with 204", status == 204)
check("exactly one message reached the bot", len(BotStub.received) == 1)
delivered = BotStub.received[0].decode("utf-8") if BotStub.received else ""
check("the enquiry body was relayed", "A Tester" in delivered)
check("the token is not relayed to the bot", DUMMY_TOKEN not in delivered)
check("the honeypot field is not relayed to the bot", "botcheck" not in delivered)

print("\nverification failing closed when siteverify is unreachable")
contact_relay.TURNSTILE_URL = "https://127.0.0.1:1/turnstile"
BotStub.received.clear()
status, body = post(enquiry(**{"cf-turnstile-response": DUMMY_TOKEN}))
check("an unreachable siteverify refuses with 503", status == 503)
check("nothing reached the bot", not BotStub.received)

print("\nthe rate limiter still runs before siteverify is ever called")
contact_relay.TURNSTILE_URL = "https://127.0.0.1:1/turnstile"
contact_relay.limiter = contact_relay.RateLimit(2, 900, 1000)
BotStub.received.clear()
first, _ = post(enquiry(**{"cf-turnstile-response": DUMMY_TOKEN}))
second, _ = post(enquiry(**{"cf-turnstile-response": DUMMY_TOKEN}))
third, body = post(enquiry(**{"cf-turnstile-response": DUMMY_TOKEN}))
check("the first two are spent on verification", (first, second) == (503, 503))
check("the third is rate limited before siteverify", third == 429)
check("nothing reached the bot", not BotStub.received)

print("\nwith no secret configured the relay behaves exactly as it did before")
contact_relay.TURNSTILE_SECRET = ""
contact_relay.limiter = contact_relay.RateLimit(1000, 900, 1000)
BotStub.received.clear()
check("healthz reports verification off", get("/healthz").get("verification") is False)
status, _ = post(enquiry())
check("an enquiry with no token is accepted", status == 204)
check("it reached the bot", len(BotStub.received) == 1)
status, _ = post(enquiry(botcheck="spam"))
check("the honeypot is still enforced without Turnstile", status == 400)

relay.shutdown()
bot.shutdown()

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
