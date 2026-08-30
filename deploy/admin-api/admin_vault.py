#!/usr/bin/env python3

import base64
import json
import os
import threading
import time

SEAL_LIMIT = 60 * 1024
SEAL_VERSION = 2

VAULT_BACKEND = os.environ.get("ADMIN_VAULT", "none").strip().lower() or "none"
VAULT_TTL = int(os.environ.get("ADMIN_VAULT_TTL", "60") or 0)
KMS_KEY = os.environ.get("ADMIN_KMS_KEY", "").strip()
SECRET_PROJECT = os.environ.get("GCP_PROJECT_ID", "").strip()

LOCAL_KEYS = os.environ.get("ADMIN_VAULT_KEYS", "/etc/amitista/vault-keys.json").strip()
LOCAL_KEY_BYTES = 32
LOCAL_NONCE_BYTES = 12
LOCAL_ID_LIMIT = 64
SECRET_NAMES = {
    "session": os.environ.get("ADMIN_SECRET_NAME", "amitista-admin-session-secret").strip(),
    "alerts": os.environ.get("ADMIN_ALERT_SECRET_NAME", "amitista-alert-webhook").strip(),
}

VAULT_FACTORY = None


class VaultError(Exception):

    def __init__(self, message, status=503):
        super().__init__(message)
        self.message = message
        self.status = status


def context(purpose):
    return ("amitista:%s" % purpose).encode("utf-8")


class GoogleVault:

    name = "google"

    def __init__(self, key_name=None, project=None):
        self.key_name = key_name or KMS_KEY
        self.project = project or SECRET_PROJECT
        if not self.key_name:
            raise VaultError("ADMIN_KMS_KEY is not set, so nothing can be decrypted.")
        if not self.project:
            raise VaultError("GCP_PROJECT_ID is not set, so no secret can be read.")
        self._lock = threading.Lock()
        self._kms = None
        self._secrets = None

    def _kms_client(self):
        with self._lock:
            if self._kms is None:
                try:
                    from google.cloud import kms
                except ImportError:
                    raise VaultError("google-cloud-kms is not installed on this host.")
                try:
                    self._kms = kms.KeyManagementServiceClient()
                except Exception as failure:
                    raise VaultError("Could not reach Cloud KMS: %s" % failure)
            return self._kms

    def _secret_client(self):
        with self._lock:
            if self._secrets is None:
                try:
                    from google.cloud import secretmanager
                except ImportError:
                    raise VaultError("google-cloud-secret-manager is not installed on this host.")
                try:
                    self._secrets = secretmanager.SecretManagerServiceClient()
                except Exception as failure:
                    raise VaultError("Could not reach Secret Manager: %s" % failure)
            return self._secrets

    def secret(self, name, version="latest"):
        client = self._secret_client()
        path = "projects/%s/secrets/%s/versions/%s" % (self.project, name, version)
        try:
            response = client.access_secret_version(request={"name": path})
        except Exception as failure:
            raise VaultError("Could not read %s from Secret Manager: %s" % (name, failure))
        return response.payload.data.decode("utf-8").strip()

    def seal(self, raw, purpose):
        if len(raw) > SEAL_LIMIT:
            raise VaultError(
                "That store is %d bytes, over the %d-byte limit for a single sealed blob."
                % (len(raw), SEAL_LIMIT),
                500,
            )
        client = self._kms_client()
        try:
            response = client.encrypt(
                request={
                    "name": self.key_name,
                    "plaintext": raw,
                    "additional_authenticated_data": context(purpose),
                }
            )
        except Exception as failure:
            raise VaultError("Cloud KMS refused to encrypt: %s" % failure)
        return base64.b64encode(response.ciphertext).decode("ascii")

    def unseal(self, blob, purpose):
        try:
            ciphertext = base64.b64decode(blob.encode("ascii"))
        except (ValueError, TypeError):
            raise VaultError("The sealed store is not valid base64.", 500)
        client = self._kms_client()
        try:
            response = client.decrypt(
                request={
                    "name": self.key_name,
                    "ciphertext": ciphertext,
                    "additional_authenticated_data": context(purpose),
                }
            )
        except Exception as failure:
            raise VaultError("Cloud KMS refused to decrypt: %s" % failure)
        return response.plaintext


class LocalVault:

    name = "local"

    def __init__(self, path=None):
        self.path = path or LOCAL_KEYS
        self.active, self.keys = self._load(self.path)

    @staticmethod
    def _load(path):
        try:
            with open(path, "rb") as handle:
                raw = json.load(handle)
        except FileNotFoundError:
            raise VaultError("The vault key file %s does not exist." % path)
        except (ValueError, OSError) as failure:
            raise VaultError("The vault key file could not be read: %s" % failure)
        if not isinstance(raw, dict):
            raise VaultError("The vault key file is not an object.")

        active = str(raw.get("active") or "").strip()
        stored = raw.get("keys")
        if not active or not isinstance(stored, dict):
            raise VaultError("The vault key file needs an 'active' id and a 'keys' map.")

        keys = {}
        for key_id, encoded in stored.items():
            clean = str(key_id).strip()
            if not clean or len(clean) > LOCAL_ID_LIMIT:
                raise VaultError("A vault key id is missing or too long.")
            try:
                material = base64.b64decode(str(encoded), validate=True)
            except (ValueError, TypeError):
                raise VaultError("Vault key %r is not valid base64." % clean)
            if len(material) != LOCAL_KEY_BYTES:
                raise VaultError(
                    "Vault key %r is %d bytes, not the %d AES-256 needs."
                    % (clean, len(material), LOCAL_KEY_BYTES)
                )
            keys[clean] = material

        if active not in keys:
            raise VaultError("The active vault key %r is not in the keys map." % active)
        return active, keys

    @staticmethod
    def _aesgcm(material):
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        except ImportError:
            raise VaultError("The local vault needs the 'cryptography' package installed.")
        return AESGCM(material)

    def seal(self, raw, purpose):
        if len(raw) > SEAL_LIMIT:
            raise VaultError(
                "That store is %d bytes, over the %d-byte limit for a single sealed blob."
                % (len(raw), SEAL_LIMIT),
                500,
            )
        nonce = os.urandom(LOCAL_NONCE_BYTES)
        cipher = self._aesgcm(self.keys[self.active])
        body = cipher.encrypt(nonce, raw, context(purpose))
        marker = self.active.encode("utf-8")
        return base64.b64encode(bytes([len(marker)]) + marker + nonce + body).decode("ascii")

    def unseal(self, blob, purpose):
        try:
            packed = base64.b64decode(str(blob).encode("ascii"))
        except (ValueError, TypeError):
            raise VaultError("The sealed store is not valid base64.", 500)
        if not packed:
            raise VaultError("The sealed store is empty.", 500)

        marker_len = packed[0]
        head = 1 + marker_len
        if marker_len == 0 or len(packed) < head + LOCAL_NONCE_BYTES + 16:
            raise VaultError("The sealed store is truncated.", 500)
        try:
            key_id = packed[1:head].decode("utf-8")
        except UnicodeDecodeError:
            raise VaultError("The sealed store names an unreadable key id.", 500)

        material = self.keys.get(key_id)
        if material is None:
            raise VaultError(
                "The sealed store was written with key %r, which is not in the key file." % key_id,
                500,
            )

        nonce = packed[head:head + LOCAL_NONCE_BYTES]
        body = packed[head + LOCAL_NONCE_BYTES:]
        cipher = self._aesgcm(material)
        try:
            return cipher.decrypt(nonce, body, context(purpose))
        except Exception:
            raise VaultError("The sealed store failed authentication and was not opened.", 500)

    def secret(self, name, version="latest"):
        raise VaultError("The local vault stores no secrets — use the env files.", 500)


class Sealer:

    def __init__(self, vault, purpose):
        self.vault = vault
        self.purpose = purpose

    def seal(self, payload):
        raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        return {
            "version": SEAL_VERSION,
            "sealed": self.vault.seal(raw, self.purpose),
            "key": getattr(self.vault, "key_name", ""),
        }

    def unseal(self, envelope):
        blob = envelope.get("sealed")
        if not isinstance(blob, str) or not blob:
            raise VaultError("That store says it is sealed but carries no ciphertext.", 500)
        raw = self.vault.unseal(blob, self.purpose)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise VaultError("The sealed store did not decrypt to readable data.", 500)
        if not isinstance(payload, dict):
            raise VaultError("The sealed store did not decrypt to an object.", 500)
        return payload


class Secrets:

    def __init__(self, vault, ttl=None):
        self.vault = vault
        self.ttl = VAULT_TTL if ttl is None else ttl
        self.lock = threading.Lock()
        self.held = {}

    def get(self, key, default=""):
        name = SECRET_NAMES.get(key, key)
        if not name:
            return default
        now = time.time()
        with self.lock:
            value, fetched = self.held.get(key, (None, 0.0))
            if value is not None and self.ttl and now - fetched < self.ttl:
                return value
        fresh = self.vault.secret(name)
        with self.lock:
            self.held[key] = (fresh, now)
        return fresh

    def forget(self):
        with self.lock:
            self.held.clear()


def build_vault(backend=None):
    chosen = (backend or VAULT_BACKEND).strip().lower()
    if chosen in ("", "none", "off"):
        return None
    if VAULT_FACTORY is not None:
        return VAULT_FACTORY()
    if chosen == "google":
        return GoogleVault()
    if chosen == "local":
        return LocalVault()
    raise VaultError("ADMIN_VAULT must be 'none', 'google' or 'local', not %r" % chosen)
