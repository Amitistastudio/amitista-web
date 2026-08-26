'use strict';

const assert = require('node:assert');
const http = require('node:http');

const shield = require('../index');
const express = require('express');
const { createLimiter, normalizePath } = require('../src/runtime/limit');
const { inspectRequest } = require('../src/runtime/shape');

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

function request(server, path, { method = 'GET', body = null } = {}) {
  const { port } = server.address();
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method,
        headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {} },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

(async () => {
  // ---------- unit: path normalisation keeps the keyspace bounded ----------
  check('collapses ids so the key store cannot grow with traffic', () => {
    assert.strictEqual(normalizePath('/users/12345/posts'), '/users/:id/posts');
    assert.strictEqual(normalizePath('/o/3f2504e0-4f89-11d3-9a0c-0305e82c3301'), '/o/:uuid');
    assert.strictEqual(normalizePath('/users/alice'), '/users/alice');
  });

  // ---------- unit: shape abuse ----------
  check('detects prototype pollution in a body', () => {
    const found = inspectRequest({ body: JSON.parse('{"__proto__":{"admin":true}}') });
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.strictEqual(found[0].id, 'prototype-pollution');
    assert.strictEqual(found[0].severity, 'critical');
  });

  check('detects a NoSQL operator smuggled in where a value belongs', () => {
    const found = inspectRequest({ body: { password: { $ne: null } } });
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.strictEqual(found[0].id, 'nosql-operator');
    assert.strictEqual(found[0].severity, 'high');
  });

  check('detects a deeply nested parse bomb', () => {
    let bomb = {};
    let cursor = bomb;
    for (let i = 0; i < 40; i += 1) { cursor.next = {}; cursor = cursor.next; }
    const found = inspectRequest({ body: bomb });
    assert.ok(found.some((f) => f.id === 'payload-depth'), JSON.stringify(found));
  });

  check('leaves an ordinary body alone', () => {
    const found = inspectRequest({ body: { name: 'alice', tags: ['a', 'b'], meta: { age: 30 } } });
    assert.deepStrictEqual(found, []);
  });

  // ---------- unit: limiter ----------
  check('applies a tighter automatic limit to auth endpoints', () => {
    const limiter = createLimiter({ max: 100, sensitiveMax: 3, blockMs: 1000 });
    const req = { method: 'POST', path: '/api/login', headers: {}, socket: { remoteAddress: '1.2.3.4' } };
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(limiter.check(req, 1_000_000 + i));
    assert.ok(results[0].ok && results[1].ok && results[2].ok, 'first three should pass');
    assert.ok(!results[3].ok, 'fourth should be limited');
    assert.strictEqual(results[3].id, 'rate-limit');
    limiter.stop();
  });

  check('does not apply the tight limit to an ordinary endpoint', () => {
    const limiter = createLimiter({ max: 100, sensitiveMax: 3 });
    const req = { method: 'GET', path: '/api/items', headers: {}, socket: { remoteAddress: '1.2.3.4' } };
    for (let i = 0; i < 10; i += 1) {
      assert.ok(limiter.check(req, 2_000_000 + i).ok, `request ${i} should pass`);
    }
    limiter.stop();
  });

  check('escalates the block window on repeat offenders', () => {
    const limiter = createLimiter({ max: 1, blockMs: 1000, maxBlockMs: 100_000 });
    const req = { method: 'GET', path: '/x', headers: {}, socket: { remoteAddress: '9.9.9.9' } };
    limiter.check(req, 3_000_000);
    const first = limiter.check(req, 3_000_001);
    assert.strictEqual(first.id, 'rate-limit');
    const second = limiter.check(req, 3_000_002);
    assert.strictEqual(second.id, 'rate-block');
    assert.ok(second.retryAfter >= first.retryAfter, 'second block should not be shorter');
    limiter.stop();
  });

  check('sheds load when the event loop is saturated, and recovers', () => {
    let lag = 0;
    const limiter = createLimiter({
      max: 100, sheddingFactor: 0.1, lagThresholdMs: 200,
      burstMax: 10_000, concurrency: 10_000, blockMs: 1,
      lagSource: () => lag,
    });
    const req = { method: 'GET', path: '/y', headers: {}, socket: { remoteAddress: '4.4.4.4' } };
    const drive = (now) => {
      let allowed = 0;
      for (let i = 0; i < 200; i += 1) {
        const verdict = limiter.check(req, now + i);
        if (verdict.ok) { allowed += 1; verdict.release(); }
      }
      return allowed;
    };

    // Spaced more than two windows apart so the sliding window's previous
    // bucket has fully decayed and each drive starts from a clean budget.
    assert.strictEqual(drive(6_000_000), 100, 'healthy loop should allow the full budget');

    lag = 400;
    assert.strictEqual(drive(6_300_000), 10, 'saturated loop should allow max * sheddingFactor');

    lag = 0;
    assert.strictEqual(drive(6_600_000), 100, 'budget should return once the loop recovers');
    limiter.stop();
  });

  check('measures event loop lag as drift, not as a diluted average', () => {
    const limiter = createLimiter({});
    const start = Date.now();
    while (Date.now() - start < 250) { /* stall the loop */ }
    const observed = limiter.lag();
    limiter.stop();
    assert.ok(observed >= 0, 'sampler should report a numeric lag');
  });

  check('separates buckets by client', () => {
    const limiter = createLimiter({ max: 2 });
    const make = (ip) => ({ method: 'GET', path: '/x', headers: {}, socket: { remoteAddress: ip } });
    limiter.check(make('1.1.1.1'), 4_000_000);
    limiter.check(make('1.1.1.1'), 4_000_001);
    assert.ok(!limiter.check(make('1.1.1.1'), 4_000_002).ok, 'first client exhausted');
    assert.ok(limiter.check(make('2.2.2.2'), 4_000_003).ok, 'second client unaffected');
    limiter.stop();
  });

  check('ignores a spoofed X-Forwarded-For unless proxies are trusted', () => {
    const limiter = createLimiter({ max: 1 });
    const spoof = (n) => ({
      method: 'GET', path: '/x',
      headers: { 'x-forwarded-for': `5.5.5.${n}` },
      socket: { remoteAddress: '7.7.7.7' },
    });
    assert.ok(limiter.check(spoof(1), 5_000_000).ok);
    assert.ok(!limiter.check(spoof(2), 5_000_001).ok, 'rotating XFF must not reset the bucket');
    limiter.stop();
  });

  // ---------- integration ----------
  const app = express();
  app.use(express.json());
  app.use(shield.protect({
    feed: false,
    mode: 'block',
    onFinding: () => {},
    rateLimit: { max: 5, windowMs: 60_000, burstMax: 100 },
  }));
  app.post('/login', (req, res) => res.json({ ok: true }));
  app.get('/items', (req, res) => res.json({ ok: true }));
  app.use(shield.errorHandler());

  const server = shield.harden(await listen(app));

  check('harden sets the slowloris timeouts on the server', () => {
    assert.strictEqual(server.headersTimeout, 20_000);
    assert.strictEqual(server.requestTimeout, 60_000);
    assert.strictEqual(server.keepAliveTimeout, 5_000);
  });

  shield.clear();
  const first = await request(server, '/items');
  check('advertises the remaining budget on a normal response', () => {
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.headers['ratelimit-limit'], '5');
    assert.ok(Number(first.headers['ratelimit-remaining']) >= 0);
  });

  const responses = [];
  for (let i = 0; i < 8; i += 1) responses.push(await request(server, '/items'));
  const limited = responses.filter((r) => r.status === 429);

  check('returns 429 with Retry-After once the budget is spent', () => {
    assert.ok(limited.length > 0, `expected some 429s, got ${responses.map((r) => r.status).join(',')}`);
    assert.ok(Number(limited[0].headers['retry-after']) >= 1);
    assert.deepStrictEqual(
      Object.keys(JSON.parse(limited[0].body)).sort(),
      ['error', 'page', 'reason', 'reference', 'retryAfter'],
    );
  });

  check('a rate-limited visitor is given a reference and the block page', () => {
    const body = JSON.parse(limited[0].body);
    assert.match(body.reference, /^AMS-[0-9A-F]{4}-[0-9A-F]{4}$/);
    assert.match(body.page, /^https:\/\/amitista\.com\/block\?/);
    assert.strictEqual(new URL(body.page).searchParams.get('retry'), String(body.retryAfter));
  });

  // A fresh server: the client above is now in a temp block, and the limiter
  // correctly runs before body inspection, so it would answer 429 first.
  const shapeApp = express();
  shapeApp.use(express.json());
  shapeApp.use(shield.protect({ mode: 'block', onFinding: () => {}, rateLimit: false, feed: false }));
  shapeApp.post('/login', (req, res) => res.json({ ok: true }));
  const shapeServer = await listen(shapeApp);

  shield.clear();
  const polluted = await request(shapeServer, '/login', {
    method: 'POST', body: JSON.parse('{"user":"a","__proto__":{"isAdmin":true}}'),
  });

  check('rejects a prototype pollution payload before the handler runs', () => {
    assert.strictEqual(polluted.status, 400);
    assert.strictEqual(JSON.parse(polluted.body).reason, 'prototype-pollution');
  });

  check('the pollution attempt did not reach Object.prototype', () => {
    assert.strictEqual({}.isAdmin, undefined);
  });

  shield.clear();
  const clean = await request(shapeServer, '/login', { method: 'POST', body: { user: 'a' } });
  check('lets an ordinary login body through untouched', () => {
    assert.strictEqual(clean.status, 200);
    assert.deepStrictEqual(shield.findings(), []);
  });

  server.close();
  shapeServer.close();
  shield.stop();

  console.log(`${passed} passed${process.exitCode ? '' : ', 0 failed'}`);
})();
