import json
import time

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm


class FakeGoogle:

    def __init__(self, client_id, kid="test-key-1"):
        self.client_id = client_id
        self.kid = kid
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.token_calls = []
        self.certs_calls = 0
        self.token_response = None
        self.fail_token = None

    def jwks(self):
        raw = json.loads(RSAAlgorithm.to_jwk(self.key.public_key()))
        raw["kid"] = self.kid
        raw["alg"] = "RS256"
        raw["use"] = "sig"
        return {"keys": [raw]}

    def id_token(self, nonce=None, subject="1029384756", email="owner@example.com", **overrides):
        now = int(time.time())
        if "nonce" in overrides:
            nonce = overrides.pop("nonce")
        claims = {
            "iss": "https://accounts.google.com",
            "aud": self.client_id,
            "sub": subject,
            "email": email,
            "email_verified": True,
            "nonce": nonce,
            "iat": now,
            "exp": now + 3600,
            "name": "Test Owner",
        }
        claims.update(overrides)
        for key in [name for name, value in claims.items() if value is None]:
            del claims[key]
        headers = {"kid": overrides.pop("kid", self.kid)}
        signer = overrides.pop("signer", self.key)
        return jwt.encode(claims, signer, algorithm="RS256", headers=headers)

    def install(self, module):
        module.CLIENT_ID = self.client_id
        module.certs = module.Certs()
        original = module.get_json

        def fake(url, data=None):
            if url == module.CERTS_ENDPOINT:
                self.certs_calls += 1
                return self.jwks()
            if url == module.TOKEN_ENDPOINT:
                self.token_calls.append(dict(data or {}))
                if self.fail_token is not None:
                    raise self.fail_token
                if self.token_response is not None:
                    return self.token_response
                return {"id_token": self.pending_token, "token_type": "Bearer"}
            return original(url, data)

        module.get_json = fake
        return original
