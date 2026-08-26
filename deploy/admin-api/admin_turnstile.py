import json
import logging
import os
import socket
import urllib.error
import urllib.parse
import urllib.request

log = logging.getLogger("admin-api.turnstile")

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TIMEOUT = 10
TOKEN_LIMIT = 2048
ACTION = "admin-login"
FIELD = "cf-turnstile-response"

FAILED = "That did not pass the verification check. Reload the page and try again."
UNAVAILABLE = "The verification check could not be completed. Try again in a moment."


class VerificationError(Exception):

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def _secret():
    return os.environ.get("TURNSTILE_SECRET", "").strip()


def _hostnames():
    raw = os.environ.get("TURNSTILE_HOSTNAMES", "")
    return frozenset(part.strip().lower() for part in raw.split(",") if part.strip())


def live():
    return bool(_secret() and _hostnames())


def verify(token, ip=None, action=ACTION):
    secret = _secret()
    hostnames = _hostnames()

    if not (secret and hostnames):
        if secret:
            log.error("TURNSTILE_SECRET is set but TURNSTILE_HOSTNAMES is empty; verification stays off")
        return

    if not isinstance(token, str) or not token or len(token) > TOKEN_LIMIT:
        raise VerificationError(403, FAILED)

    fields = {"secret": secret, "response": token}
    if ip:
        fields["remoteip"] = ip

    request = urllib.request.Request(
        SITEVERIFY_URL,
        data=urllib.parse.urlencode(fields).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            result = json.loads(response.read(64 * 1024).decode("utf-8"))
    except (urllib.error.URLError, socket.timeout, UnicodeDecodeError, json.JSONDecodeError, OSError):
        log.warning("turnstile could not be reached; refusing the sign-in")
        raise VerificationError(503, UNAVAILABLE)

    if not isinstance(result, dict) or not result.get("success"):
        codes = result.get("error-codes") if isinstance(result, dict) else "malformed"
        log.warning("turnstile refused a sign-in (%s)", codes)
        raise VerificationError(403, FAILED)

    if result.get("action") != action:
        log.warning("turnstile action mismatch (%r)", result.get("action"))
        raise VerificationError(403, FAILED)

    if str(result.get("hostname") or "").lower() not in hostnames:
        log.warning("turnstile hostname mismatch (%r)", result.get("hostname"))
        raise VerificationError(403, FAILED)
