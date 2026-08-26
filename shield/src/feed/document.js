'use strict';

const { createPublicKey, verify: verifySignature } = require('node:crypto');
const { KEYS, FORMAT } = require('./keys');

// The envelope carries the document as a *string*, not as an object:
//
//   { "document": "{\"format\":1,...}", "signature": { ... } }
//
// The signature covers those exact bytes. Signing a nested object instead would
// mean the signer and the verifier had to independently agree on a canonical
// serialisation — key order, number formatting, unicode escaping — and any
// disagreement between the Python signer and this Node verifier would either
// reject every valid document or, far worse, verify a document that does not
// say what was signed. A string has one byte sequence and there is nothing to
// agree about.

const MAX_ENVELOPE_BYTES = 512 * 1024;

// Ed25519 is not configurable here on purpose. Reading the algorithm out of the
// document and dispatching on it hands an attacker the choice of algorithm,
// which is how signature schemes get downgraded to ones nobody meant to allow.
const ALGORITHM = 'ed25519';

const parsedKeys = new Map();

function publicKey(keyId) {
  if (parsedKeys.has(keyId)) return parsedKeys.get(keyId);
  const pem = Object.prototype.hasOwnProperty.call(KEYS, keyId) ? KEYS[keyId] : null;
  let key = null;
  if (pem) {
    try {
      key = createPublicKey(pem);
    } catch {
      key = null;
    }
  }
  parsedKeys.set(keyId, key);
  return key;
}

class Rejected extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'FeedRejected';
    this.reason = reason;
  }
}

const reject = (reason) => { throw new Rejected(reason); };

// Compares two dotted numeric versions. Only the numeric prefix of each part is
// read, so a prerelease such as 0.5.0-rc.1 compares as 0.5.0 rather than
// failing to parse and being treated as older than everything.
function olderThan(version, minimum) {
  const parts = (value) => String(value).split('.').map((part) => parseInt(part, 10) || 0);
  const left = parts(version);
  const right = parts(minimum);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const a = left[i] || 0;
    const b = right[i] || 0;
    if (a !== b) return a < b;
  }
  return false;
}

// Verifies an envelope and returns the parsed document.
//
// `state` carries what this install already knows: the highest serial it has
// ever accepted, and the version of the running package. Both are checks that
// a valid signature alone cannot make — a correctly signed *old* document is
// exactly what an attacker who can serve bytes would replay, and it is
// indistinguishable from a current one by signature.
function open(raw, state = {}) {
  const { serial: knownSerial = 0, packageVersion = '0.0.0', now = Date.now() } = state;

  if (typeof raw !== 'string') reject('feed body was not text');
  if (Buffer.byteLength(raw) > MAX_ENVELOPE_BYTES) reject('feed body is larger than the envelope limit');

  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return reject('feed body is not JSON');
  }
  if (!envelope || typeof envelope !== 'object') reject('feed envelope is not an object');

  const { document: text, signature } = envelope;
  if (typeof text !== 'string') reject('feed envelope carries no document string');
  if (!signature || typeof signature !== 'object') reject('feed envelope carries no signature');
  if (signature.alg !== ALGORITHM) reject(`signature algorithm is not ${ALGORITHM}`);

  const key = publicKey(signature.keyId);
  if (!key) reject(`signed by an unknown key: ${String(signature.keyId).slice(0, 64)}`);

  let value;
  try {
    value = Buffer.from(String(signature.value), 'base64');
  } catch {
    return reject('signature is not base64');
  }
  // Ed25519 signatures are always 64 bytes. Checking here keeps a truncated or
  // padded value from reaching the verifier at all.
  if (value.length !== 64) reject('signature is not the right length');

  let good = false;
  try {
    good = verifySignature(null, Buffer.from(text, 'utf8'), key, value);
  } catch {
    good = false;
  }
  if (!good) reject('signature does not match the document');

  // Nothing below this line runs on unverified bytes.

  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return reject('signed document is not JSON');
  }
  if (!document || typeof document !== 'object') reject('signed document is not an object');

  if (document.format !== FORMAT) {
    reject(`document format ${JSON.stringify(document.format)} is not the format this package reads`);
  }

  // The document names the package it is for. Without this, a feed signed for
  // some other Amitista product would be applied by this one.
  if (document.package && document.package !== '@amitista/shield') {
    reject(`document is addressed to ${document.package}`);
  }

  if (document.minPackage && olderThan(packageVersion, document.minPackage)) {
    reject(`document needs package ${document.minPackage}, this is ${packageVersion}`);
  }

  const serial = Number(document.serial);
  if (!Number.isSafeInteger(serial) || serial < 1) reject('document has no usable serial');
  // Rollback defence. A signature stays valid forever, so the one thing a
  // network attacker can always do is serve a genuine older document — one
  // published before a rule they care about existed. Refusing to move
  // backwards is what makes that useless.
  if (serial < knownSerial) reject(`document serial ${serial} is older than the accepted ${knownSerial}`);

  const expires = Date.parse(document.expires);
  if (!Number.isFinite(expires)) reject('document has no usable expiry');
  // And an expiry bounds how long that replay stays useful even at the same
  // serial: a signer that stops publishing goes quiet, and every install falls
  // back to its built-in rules rather than trusting a year-old snapshot.
  if (expires <= now) reject('document has expired');

  const issued = Date.parse(document.issued);
  if (Number.isFinite(issued) && issued - now > 24 * 60 * 60 * 1000) {
    reject('document is issued more than a day in the future');
  }

  return { document, serial, expires, keyId: signature.keyId };
}

module.exports = { open, Rejected, olderThan, MAX_ENVELOPE_BYTES };
