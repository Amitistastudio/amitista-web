import base64
import hashlib
import json
import os
import secrets
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt
from jwt.algorithms import RSAAlgorithm

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
CERTS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = ("accounts.google.com", "https://accounts.google.com")
SCOPES = "openid email profile"

MODE = os.environ.get("ADMIN_GOOGLE", "off").strip().lower() or "off"
CLIENT_ID = os.environ.get("ADMIN_GOOGLE_CLIENT_ID", "").strip()
CLIENT_SECRET = os.environ.get("ADMIN_GOOGLE_CLIENT_SECRET", "").strip()
REDIRECT_URI = os.environ.get("ADMIN_GOOGLE_REDIRECT", "").strip()
HOSTED_DOMAIN = os.environ.get("ADMIN_GOOGLE_DOMAIN", "").strip().lower()

PENDING_TTL = max(60, int(os.environ.get("ADMIN_GOOGLE_TTL", "600")))
PENDING_MAX = 64
HTTP_TIMEOUT = max(2.0, float(os.environ.get("ADMIN_GOOGLE_TIMEOUT", "10")))
CLOCK_SKEW = 120
CERTS_TTL = 3600
MAX_RESPONSE = 128 * 1024
TOKEN_LIMIT = 8192

if MODE not in ("off", "on"):
    raise SystemExit("ADMIN_GOOGLE must be 'on' or 'off', not %r" % MODE)


class GoogleError(Exception):
    def __init__(self, message, status=400):
        Exception.__init__(self, message)
        self.message = message
        self.status = status


def missing():
    if MODE != "on":
        return None
    absent = [
        name
        for name, value in (
            ("ADMIN_GOOGLE_CLIENT_ID", CLIENT_ID),
            ("ADMIN_GOOGLE_CLIENT_SECRET", CLIENT_SECRET),
            ("ADMIN_GOOGLE_REDIRECT", REDIRECT_URI),
        )
        if not value
    ]
    if absent:
        return "ADMIN_GOOGLE is on but %s not set" % ", ".join(absent)
    if not REDIRECT_URI.startswith("https://"):
        return "ADMIN_GOOGLE_REDIRECT must be https"
    return None


def enabled():
    return MODE == "on" and missing() is None


def b64url(raw):
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


class Pending:
    def __init__(self, ttl=PENDING_TTL, limit=PENDING_MAX):
        self._lock = threading.Lock()
        self._items = {}
        self._ttl = ttl
        self._limit = limit

    def _sweep(self, now):
        stale = [key for key, item in self._items.items() if now - item["at"] > self._ttl]
        for key in stale:
            del self._items[key]

    def issue(self, ip, now=None):
        now = time.time() if now is None else now
        state = secrets.token_urlsafe(32)
        item = {
            "nonce": secrets.token_urlsafe(32),
            "verifier": secrets.token_urlsafe(64),
            "ip": ip,
            "at": now,
        }
        with self._lock:
            self._sweep(now)
            if len(self._items) >= self._limit:
                raise GoogleError("Too many sign-ins in flight. Try again in a minute.", 429)
            self._items[state] = item
        return state, item

    def claim(self, state, now=None):
        now = time.time() if now is None else now
        if not state or len(state) > 128:
            raise GoogleError("That sign-in did not come back cleanly. Start again.", 400)
        with self._lock:
            self._sweep(now)
            item = self._items.pop(state, None)
        if item is None:
            raise GoogleError("That sign-in link has expired. Start again.", 400)
        return item

    def size(self):
        with self._lock:
            return len(self._items)


pending = Pending()


class Certs:
    def __init__(self, url=CERTS_ENDPOINT, ttl=CERTS_TTL):
        self._lock = threading.Lock()
        self._url = url
        self._ttl = ttl
        self._keys = {}
        self._at = 0.0

    def _load(self):
        payload = get_json(self._url)
        keys = {}
        for entry in payload.get("keys") or []:
            if not isinstance(entry, dict):
                continue
            if entry.get("kty") != "RSA" or entry.get("alg") not in (None, "RS256"):
                continue
            kid = entry.get("kid")
            if not kid:
                continue
            try:
                keys[kid] = RSAAlgorithm.from_jwk(json.dumps(entry))
            except (ValueError, TypeError, KeyError):
                continue
        if not keys:
            raise GoogleError("Could not read Google's signing keys.", 502)
        return keys

    def key(self, kid, now=None):
        now = time.time() if now is None else now
        with self._lock:
            fresh = self._keys and now - self._at < self._ttl
            if fresh and kid in self._keys:
                return self._keys[kid]

        keys = self._load()
        with self._lock:
            self._keys = keys
            self._at = now

        key = keys.get(kid)
        if key is None:
            raise GoogleError("That sign-in was signed with an unknown key.", 401)
        return key


certs = Certs()


def get_json(url, data=None):
    body = None
    headers = {"Accept": "application/json", "User-Agent": "amitista-admin"}
    if data is not None:
        body = urllib.parse.urlencode(data).encode("ascii")
        headers["Content-Type"] = "application/x-www-form-urlencoded"

    request = urllib.request.Request(url, data=body, headers=headers, method="POST" if body else "GET")
    context = ssl.create_default_context()
    context.check_hostname = True
    context.verify_mode = ssl.CERT_REQUIRED

    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT, context=context) as response:
            raw = response.read(MAX_RESPONSE + 1)
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read(MAX_RESPONSE).decode("utf-8", "replace"))
            reason = str(detail.get("error") or error.code)[:64]
        except (ValueError, OSError):
            reason = str(error.code)
        raise GoogleError("Google refused the sign-in (%s)." % reason, 401)
    except (urllib.error.URLError, ssl.SSLError, OSError):
        raise GoogleError("Could not reach Google. Try again, or use your password.", 502)

    if len(raw) > MAX_RESPONSE:
        raise GoogleError("Google sent back more than expected.", 502)
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise GoogleError("Google sent back something unreadable.", 502)
    if not isinstance(payload, dict):
        raise GoogleError("Google sent back something unreadable.", 502)
    return payload


def start(ip):
    if not enabled():
        raise GoogleError("Google sign-in is not switched on.", 404)

    state, item = pending.issue(ip)
    challenge = b64url(hashlib.sha256(item["verifier"].encode("ascii")).digest())
    params = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "scope": SCOPES,
        "redirect_uri": REDIRECT_URI,
        "state": state,
        "nonce": item["nonce"],
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "access_type": "online",
        "prompt": "select_account",
    }
    if HOSTED_DOMAIN:
        params["hd"] = HOSTED_DOMAIN
    return "%s?%s" % (AUTH_ENDPOINT, urllib.parse.urlencode(params))


def exchange(code, verifier):
    payload = get_json(
        TOKEN_ENDPOINT,
        {
            "code": code,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
            "code_verifier": verifier,
        },
    )
    raw = payload.get("id_token")
    if not isinstance(raw, str) or not raw or len(raw) > TOKEN_LIMIT:
        raise GoogleError("Google did not return an identity token.", 502)
    return raw


def verify(raw, nonce):
    try:
        header = jwt.get_unverified_header(raw)
    except jwt.PyJWTError:
        raise GoogleError("That sign-in was not readable.", 401)

    if header.get("alg") != "RS256":
        raise GoogleError("That sign-in used an unexpected algorithm.", 401)
    kid = header.get("kid")
    if not kid or not isinstance(kid, str):
        raise GoogleError("That sign-in had no key id.", 401)

    key = certs.key(kid)
    try:
        claims = jwt.decode(
            raw,
            key=key,
            algorithms=["RS256"],
            audience=CLIENT_ID,
            leeway=CLOCK_SKEW,
            options={"require": ["exp", "iat", "aud", "iss", "sub"], "verify_signature": True},
        )
    except jwt.ExpiredSignatureError:
        raise GoogleError("That sign-in took too long. Start again.", 401)
    except jwt.InvalidAudienceError:
        raise GoogleError("That sign-in was issued for a different app.", 401)
    except jwt.PyJWTError:
        raise GoogleError("That sign-in did not check out.", 401)

    if claims.get("iss") not in ISSUERS:
        raise GoogleError("That sign-in did not come from Google.", 401)

    if not nonce or not secrets.compare_digest(str(claims.get("nonce") or ""), nonce):
        raise GoogleError("That sign-in did not match the request. Start again.", 401)

    subject = str(claims.get("sub") or "").strip()
    if not subject or len(subject) > 255:
        raise GoogleError("That Google account has no usable id.", 401)

    email = str(claims.get("email") or "").strip().lower()
    if not email or "@" not in email or len(email) > 254:
        raise GoogleError("That Google account has no email address.", 401)

    if claims.get("email_verified") is not True:
        raise GoogleError("That Google account's email is not verified.", 403)

    if HOSTED_DOMAIN and str(claims.get("hd") or "").strip().lower() != HOSTED_DOMAIN:
        raise GoogleError("That Google account is outside the allowed domain.", 403)

    return {
        "sub": subject,
        "email": email,
        "name": str(claims.get("name") or "")[:120],
        "picture": str(claims.get("picture") or "")[:512],
        "issued": claims.get("iat"),
    }


def finish(code, state, ip):
    if not enabled():
        raise GoogleError("Google sign-in is not switched on.", 404)
    if not code or len(code) > 2048:
        raise GoogleError("That sign-in did not come back cleanly. Start again.", 400)

    item = pending.claim(state)
    raw = exchange(code, item["verifier"])
    identity = verify(raw, item["nonce"])
    identity["startedFrom"] = item["ip"]
    identity["sameAddress"] = item["ip"] == ip
    return identity
