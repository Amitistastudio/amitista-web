'use strict';

const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const { KEYS } = require('../src/feed/keys');
const { open, Rejected, olderThan } = require('../src/feed/document');
const { compile } = require('../src/feed/regex');
const registry = require('../src/feed/registry');
const { createFeed } = require('../src/feed/poll');
const { judgeCommand, judgeSql, judgeUrl } = require('../src/runtime/detect');
const { inspectRequest } = require('../src/runtime/shape');
const { scanSource } = require('../src/secrets');

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
};
const checkAsync = async (name, fn) => {
  try {
    await fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
};

// A throwaway signing key registered under a test-only id, so nothing here
// depends on the real one and the pinned production key is never exercised
// with material that lives in the repository.
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const KEY_ID = 'test-key';
KEYS[KEY_ID] = publicKey.export({ type: 'spki', format: 'pem' });

const { privateKey: strangerKey } = crypto.generateKeyPairSync('ed25519');

const hour = 60 * 60 * 1000;

function envelope(overrides = {}, { signWith = privateKey, keyId = KEY_ID, tamper = null } = {}) {
  const document = {
    format: 1,
    package: '@amitista/shield',
    ruleset: 5,
    serial: 10,
    issued: new Date(Date.now() - hour).toISOString(),
    expires: new Date(Date.now() + 30 * 24 * hour).toISOString(),
    detections: {},
    policy: {},
    ...overrides,
  };
  let text = JSON.stringify(document);
  const value = crypto.sign(null, Buffer.from(text, 'utf8'), signWith).toString('base64');
  if (tamper) text = tamper(text);
  return JSON.stringify({ document: text, signature: { alg: 'ed25519', keyId, value } });
}

const state = { packageVersion: '0.4.0' };

(async () => {
  // ---------- signature ----------

  check('accepts a well-formed document signed by a pinned key', () => {
    const result = open(envelope(), state);
    assert.strictEqual(result.serial, 10);
    assert.strictEqual(result.keyId, KEY_ID);
  });

  check('refuses a document signed by a key that is not pinned', () => {
    assert.throws(() => open(envelope({}, { signWith: strangerKey }), state), (err) => (
      err instanceof Rejected && /does not match/.test(err.reason)
    ));
  });

  check('refuses a document naming a key id that is not pinned', () => {
    assert.throws(() => open(envelope({}, { keyId: 'nobody' }), state), (err) => (
      err instanceof Rejected && /unknown key/.test(err.reason)
    ));
  });

  // The important one: the signature must cover the bytes that are parsed, not
  // a re-serialisation of them. Editing one character of the signed text has to
  // fail even though the result is still valid JSON.
  check('refuses a document whose text was edited after signing', () => {
    const tampered = envelope({}, { tamper: (text) => text.replace('"ruleset":5', '"ruleset":9') });
    assert.throws(() => open(tampered, state), (err) => (
      err instanceof Rejected && /does not match/.test(err.reason)
    ));
  });

  check('refuses an envelope with no signature at all', () => {
    const bare = JSON.stringify({ document: JSON.stringify({ format: 1, serial: 1 }) });
    assert.throws(() => open(bare, state), /no signature/);
  });

  check('refuses a signature offered under a different algorithm', () => {
    const parsed = JSON.parse(envelope());
    parsed.signature.alg = 'hmac-sha256';
    assert.throws(() => open(JSON.stringify(parsed), state), /algorithm is not ed25519/);
  });

  // ---------- freshness ----------

  check('refuses an expired document', () => {
    const stale = envelope({ expires: new Date(Date.now() - hour).toISOString() });
    assert.throws(() => open(stale, state), /expired/);
  });

  check('refuses a replayed older serial', () => {
    const old = envelope({ serial: 4 });
    assert.throws(() => open(old, { ...state, serial: 10 }), /older than the accepted/);
  });

  check('accepts the same serial again, so a re-fetch is not an error', () => {
    assert.strictEqual(open(envelope({ serial: 10 }), { ...state, serial: 10 }).serial, 10);
  });

  check('refuses a document issued far in the future', () => {
    const ahead = envelope({ issued: new Date(Date.now() + 48 * hour).toISOString() });
    assert.throws(() => open(ahead, state), /future/);
  });

  check('refuses a document for a newer package than this one', () => {
    assert.throws(() => open(envelope({ minPackage: '9.0.0' }), state), /needs package 9\.0\.0/);
  });

  check('refuses an unknown document format rather than applying part of it', () => {
    assert.throws(() => open(envelope({ format: 2 }), state), /is not the format/);
  });

  check('refuses a document addressed to another package', () => {
    assert.throws(() => open(envelope({ package: '@amitista/other' }), state), /addressed to/);
  });

  check('compares versions numerically, not as strings', () => {
    assert.strictEqual(olderThan('0.10.0', '0.9.0'), false);
    assert.strictEqual(olderThan('0.9.0', '0.10.0'), true);
    assert.strictEqual(olderThan('0.4.0-rc.1', '0.4.0'), false);
  });

  // ---------- redos gate ----------

  check('compiles an ordinary pattern', () => {
    assert.ok(compile('\\bAKIA[0-9A-Z]{16}\\b', '') instanceof RegExp);
  });

  check('refuses a repeated group, the shape that backtracks exponentially', () => {
    for (const source of ['(a+)+$', '^(?:a|aa)+[!]{2}$', '([a-zA-Z0-9]+\\s?)*!!', '(x|xx){1,40}y']) {
      const rejected = [];
      assert.strictEqual(compile(source, '', rejected), null, `${source} should not have compiled`);
      assert.match(rejected[0].reason, /repeats a group/);
    }
  });

  // The grammar check above cannot see this one: no group is repeated, so it is
  // not exponential, but the adjacent unbounded quantifiers make it polynomial
  // enough to matter. It has to be caught by actually running it, which is the
  // half of the gate the ladder exists for.
  check('refuses a pattern that is only slow once it runs', () => {
    const rejected = [];
    const started = Date.now();
    assert.strictEqual(compile('a*a*a*a*a*b', '', rejected), null);
    assert.match(rejected[0].reason, /backtracking probe/);
    // And the check itself has to come back. A gate that hangs on a bad pattern
    // is worse than no gate, because it takes the whole process with it.
    assert.ok(Date.now() - started < 5000, 'the probe ladder should terminate quickly');
  });

  check('accepts the ordinary patterns a real feed would carry', () => {
    for (const [source, flags] of [
      ['\\bAKIA[0-9A-Z]{16}\\b', ''],
      ['acme_live_[a-z0-9]{16}', ''],
      ['\\bWAITFOR\\s+DELAY\\b', 'i'],
      ['\\.internal$', 'i'],
    ]) {
      assert.ok(compile(source, flags) instanceof RegExp, `${source} should have compiled`);
    }
  });

  check('refuses a pattern longer than the source limit', () => {
    const rejected = [];
    assert.strictEqual(compile('a'.repeat(500), '', rejected), null);
    assert.match(rejected[0].reason, /source limit/);
  });

  check('refuses flags that could change match semantics', () => {
    const rejected = [];
    assert.strictEqual(compile('abc', 'gy', rejected), null);
    assert.match(rejected[0].reason, /unsupported flags/);
  });

  // ---------- detections reaching the rule modules ----------

  const taint = new Set(['curl evil.sh']);

  check('a published command signature is matched by the runtime judge', () => {
    registry.reset();
    assert.strictEqual(judgeCommand('curl evil.sh', taint), null);

    registry.apply(open(envelope({
      serial: 11,
      detections: { shellMeta: [{ re: 'curl\\s+\\S+\\.sh' }] },
    }), state));

    const finding = judgeCommand('curl evil.sh', taint);
    assert.ok(finding, 'the published signature should have matched');
    assert.strictEqual(finding.id, 'command');
    assert.strictEqual(finding.severity, 'critical');
  });

  check('a published query operator is caught by the shape layer', () => {
    registry.reset();
    const before = inspectRequest({ body: { role: { $customOp: 1 } } });
    assert.strictEqual(before.length, 0);

    registry.apply(open(envelope({
      serial: 12,
      detections: { queryOperators: ['$customOp'] },
    }), state));

    const after = inspectRequest({ body: { role: { $customOp: 1 } } });
    assert.strictEqual(after.length, 1);
    assert.strictEqual(after[0].id, 'nosql-operator');
  });

  check('a published secret pattern is found by the analyser', () => {
    registry.reset();
    const source = 'const key = "acme_live_9f8e7d6c5b4a3210";\n';
    assert.strictEqual(scanSource(source, 'a.js').filter((f) => f.kind === 'acme-key').length, 0);

    registry.apply(open(envelope({
      serial: 13,
      detections: {
        secretPatterns: [{
          id: 'acme-key', severity: 'critical', label: 'Acme live key', re: 'acme_live_[a-z0-9]{16}',
        }],
      },
    }), state));

    const found = scanSource(source, 'a.js');
    assert.strictEqual(found.filter((f) => f.kind === 'acme-key').length, 1);
  });

  check('a published internal host widens the ssrf rule', () => {
    registry.reset();
    // Not .internal — that one is recognised without a feed now, so it cannot
    // show that publishing a rule is what made the difference.
    const url = 'http://vault.corp.example/x';
    assert.strictEqual(judgeUrl(url, new Set([url])), null);

    registry.apply(open(envelope({
      serial: 14,
      detections: { internalHosts: [{ re: '\\.corp\\.example$', flags: 'i' }] },
    }), state));

    const finding = judgeUrl(url, new Set([url]));
    assert.ok(finding);
    assert.strictEqual(finding.id, 'ssrf');
  });

  check('a rule the feed could not compile is dropped without losing the rest', () => {
    registry.reset();
    const applied = registry.apply(open(envelope({
      serial: 15,
      detections: {
        sqlMeta: [{ re: '(a+)+$' }, { re: '\\bWAITFOR\\s+DELAY\\b' }],
      },
    }), state));

    assert.strictEqual(applied.added.sqlMeta, 1, 'the sound pattern should still be installed');
    assert.strictEqual(applied.rejected.length, 1);
    assert.ok(judgeSql("x WAITFOR DELAY '0:0:5'", new Set(["x WAITFOR DELAY '0:0:5'"])));
  });

  check('a feed cannot remove a built-in rule by publishing a shorter list', () => {
    registry.reset();
    registry.apply(open(envelope({ serial: 16, detections: { shellMeta: [] } }), state));
    // The built-in metacharacter rule is still there.
    assert.ok(judgeCommand('x; rm -rf /', new Set(['x; rm -rf /'])));
  });

  // ---------- policy ----------

  check('policy turns a rule off and re-grades another', () => {
    registry.reset();
    assert.strictEqual(registry.judge('parameter-pollution', 'low'), 'low');

    registry.apply(open(envelope({
      serial: 17,
      policy: { disabled: ['parameter-pollution'], severity: { 'nosql-operator': 'low' } },
    }), state));

    assert.strictEqual(registry.judge('parameter-pollution', 'low'), null);
    assert.strictEqual(registry.judge('nosql-operator', 'high'), 'low');
    assert.strictEqual(registry.judge('command', 'critical'), 'critical');
  });

  check('policy can be refused locally while detections are still taken', () => {
    registry.reset();
    const applied = registry.apply(open(envelope({
      serial: 18,
      detections: { queryOperators: ['$another'] },
      policy: { disabled: ['command'] },
    }), state), { policy: false });

    assert.strictEqual(registry.judge('command', 'critical'), 'critical', 'policy should have been ignored');
    assert.deepStrictEqual(applied.disabled, []);
    assert.strictEqual(applied.added.queryOperators, 1);
  });

  check('an unusable severity override is refused rather than guessed at', () => {
    registry.reset();
    const applied = registry.apply(open(envelope({
      serial: 19,
      policy: { severity: { command: 'catastrophic' } },
    }), state));
    assert.strictEqual(registry.judge('command', 'critical'), 'critical');
    assert.strictEqual(applied.rejected.length, 1);
  });

  check('reset drops back to the rules the package shipped with', () => {
    registry.apply(open(envelope({ serial: 20, policy: { disabled: ['command'] } }), state));
    assert.strictEqual(registry.judge('command', 'critical'), null);
    registry.reset();
    assert.strictEqual(registry.judge('command', 'critical'), 'critical');
    assert.strictEqual(registry.summary().serial, 0);
  });

  // ---------- polling ----------

  const dir = mkdtempSync(join(tmpdir(), 'shield-feed-'));
  let served = envelope({ serial: 30, detections: { queryOperators: ['$served'] } });
  let status = 200;
  let hits = 0;

  const server = http.createServer((req, res) => {
    hits += 1;
    if (status === 304) {
      res.writeHead(304).end();
      return;
    }
    res.writeHead(status, { 'content-type': 'application/json', etag: '"v1"' });
    res.end(served);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/feed`;

  await checkAsync('refuses to fetch a feed over plain http', async () => {
    registry.reset();
    const feed = createFeed({ url, dir });
    await assert.rejects(() => feed.refresh(), /must be https/);
    feed.stop();
  });

  const poll = require('../src/feed/poll');
  const unreachable = 'https://127.0.0.1:1/feed';

  // The cache is what a restart reads, so it is tested as its own path rather
  // than only as a side effect of a successful fetch: an install that comes
  // back up offline is exactly when it has to work.
  await checkAsync('a cached document is applied at startup, before any request', async () => {
    registry.reset();
    writeFileSync(join(dir, 'feed.json'), JSON.stringify({ etag: '"v1"', envelope: served }));
    const feed = createFeed({ url: unreachable, dir });
    const applied = feed.loadCache();
    assert.ok(applied, 'the cached document should have been applied');
    assert.strictEqual(applied.serial, 30);
    assert.strictEqual(applied.source, 'cache');
    assert.strictEqual(registry.patterns('queryOperators').length, 1);
    feed.stop();
  });

  await checkAsync('a cache signed by a key that is not pinned is discarded', async () => {
    registry.reset();
    const forged = envelope({ serial: 32 }, { signWith: strangerKey });
    writeFileSync(join(dir, 'feed.json'), JSON.stringify({ etag: null, envelope: forged }));
    const feed = createFeed({ url: unreachable, dir });
    assert.strictEqual(feed.loadCache(), null);
    assert.strictEqual(registry.summary().serial, 0);
    feed.stop();
  });

  await checkAsync('an expired cache is discarded and the built-ins stay in force', async () => {
    registry.reset();
    const stale = envelope({ serial: 31, expires: new Date(Date.now() - hour).toISOString() });
    writeFileSync(join(dir, 'feed.json'), JSON.stringify({ etag: null, envelope: stale }));
    const feed = createFeed({ url: unreachable, dir });
    assert.strictEqual(feed.loadCache(), null);
    assert.strictEqual(registry.summary().serial, 0);
    assert.match(feed.status().lastError, /expired/);
    feed.stop();
  });

  await checkAsync('a corrupt cache file is survived rather than thrown', async () => {
    registry.reset();
    writeFileSync(join(dir, 'feed.json'), '{ not json');
    const feed = createFeed({ url: unreachable, dir });
    assert.strictEqual(feed.loadCache(), null);
    assert.strictEqual(registry.summary().serial, 0);
    feed.stop();
  });

  await checkAsync('a poll failure leaves the rules already in force alone', async () => {
    registry.reset();
    writeFileSync(join(dir, 'feed.json'), JSON.stringify({ etag: null, envelope: served }));
    const feed = createFeed({ url: 'https://127.0.0.1:1/nothing', dir, timeoutMs: 250 });
    feed.loadCache();
    assert.strictEqual(registry.patterns('queryOperators').length, 1);

    await assert.rejects(() => feed.refresh());
    // The unreachable feed must not have cost the rules that were already live.
    assert.strictEqual(registry.patterns('queryOperators').length, 1);
    feed.stop();
  });

  await checkAsync('a disabled feed never opens a connection', async () => {
    registry.reset();
    const before = hits;
    const feed = createFeed({ enabled: false, url, dir });
    feed.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(hits, before, 'a disabled feed should not have polled');
    assert.strictEqual(feed.status().enabled, false);
    feed.stop();
  });

  check('the poll interval cannot be set below the floor', () => {
    const feed = createFeed({ enabled: false, intervalMs: 1000, dir });
    feed.stop();
    // No public getter for the resolved interval, so this asserts the floor via
    // the exported constant the resolution uses.
    assert.strictEqual(poll.MIN_INTERVAL_MS, 5 * 60 * 1000);
  });

  server.close();
  registry.reset();
  rmSync(dir, { recursive: true, force: true });

  console.log(`${passed} passed, ${process.exitCode ? 'some failed' : '0 failed'}`);
})();
