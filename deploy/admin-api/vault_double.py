#!/usr/bin/env python3

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from admin_vault import SEAL_LIMIT, VaultError, context


class MemoryVault:

    name = "double"
    key_name = "projects/double/locations/test/keyRings/test/cryptoKeys/admin-store"

    def __init__(self, secrets=None):
        self._key = AESGCM.generate_key(bit_length=256)
        self.secrets = dict(secrets or {})
        self.reachable = True
        self.encrypts = 0
        self.decrypts = 0
        self.reads = 0

    def fail(self):
        self.reachable = False

    def restore(self):
        self.reachable = True

    def _check(self):
        if not self.reachable:
            raise VaultError("The double is pretending Google is unreachable.")

    def secret(self, name, version="latest"):
        self._check()
        self.reads += 1
        if name not in self.secrets:
            raise VaultError("No secret called %s." % name)
        return self.secrets[name]

    def seal(self, raw, purpose):
        self._check()
        if len(raw) > SEAL_LIMIT:
            raise VaultError("Over the sealed-blob limit.", 500)
        self.encrypts += 1
        nonce = os.urandom(12)
        sealed = AESGCM(self._key).encrypt(nonce, raw, context(purpose))
        return base64.b64encode(nonce + sealed).decode("ascii")

    def unseal(self, blob, purpose):
        self._check()
        self.decrypts += 1
        try:
            packed = base64.b64decode(blob.encode("ascii"))
            return AESGCM(self._key).decrypt(packed[:12], packed[12:], context(purpose))
        except Exception:
            raise VaultError("The double could not decrypt that blob.", 500)
