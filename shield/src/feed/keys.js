'use strict';

// The public halves of the keys allowed to sign a rules feed, pinned into the
// package. Pinning is the whole security model: the feed changes what shield
// does inside somebody else's production app, so it is trusted because of the
// key that signed it and never because of where it was downloaded from. TLS
// only says the bytes came from a host; it says nothing about who wrote them,
// and a host is a great deal easier to take than a key that never leaves a
// root-only file.
//
// This is a map rather than a single key so a rotation can overlap: publish
// the new key here, ship the release, wait for installs to update, and only
// then start signing with it. Removing a key is the revocation, and it only
// takes effect for installs that upgrade — which is why the private key being
// hard to steal matters far more than the ability to revoke it.

const KEYS = {
  'ams-b0d2c36155e7':
    '-----BEGIN PUBLIC KEY-----\n'
    + 'MCowBQYDK2VwAyEAH7zP3kKoIl6sMypdAGg2+wspRty2GXK3R6W61BlSp98=\n'
    + '-----END PUBLIC KEY-----\n',
};

const FEED_URL = 'https://amitista.com/api/v1/shield/feed';

// The document format this package understands. A document announcing anything
// else is ignored rather than partially applied — a newer signer must be able
// to add fields without an old install guessing at their meaning.
const FORMAT = 1;

module.exports = { KEYS, FEED_URL, FORMAT };
