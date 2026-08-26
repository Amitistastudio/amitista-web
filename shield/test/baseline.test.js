'use strict';

const assert = require('node:assert');
const http = require('node:http');
const { mkdtempSync, rmSync, existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const shield = require('../index');
const express = require('express');
const { createBaseline, charClass } = require('../src/runtime/baseline');

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

const req = (overrides = {}) => ({
  method: 'GET', path: '/users/1', params: {}, query: {}, body: {}, headers: {}, ...overrides,
});

(async () => {
  // ---------- unit ----------
  check('classifies values from narrow to broad', () => {
    assert.strictEqual(charClass('12345'), 'digits');
    assert.strictEqual(charClass('abc'), 'alpha');
    assert.strictEqual(charClass('a@b.co'), 'email');
    assert.strictEqual(charClass("1' OR 1=1 --"), 'text');
  });

  check('does not judge a route until it has matured', () => {
    const base = createBaseline({ minSamples: 10, autosave: false });
    for (let i = 0; i < 5; i += 1) base.observe(req({ params: { id: String(i) } }));
    assert.deepStrictEqual(base.judge(req({ params: { id: "1' OR 1=1" } })), [],
      'an immature profile must stay silent rather than guess');
  });

  check('flags a field that has never been sent to this route', () => {
    const base = createBaseline({ minSamples: 5, autosave: false });
    for (let i = 0; i < 5; i += 1) base.observe(req({ params: { id: String(i) } }));
    const found = base.judge(req({ params: { id: '9' }, query: { isAdmin: 'true' } }));
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.strictEqual(found[0].id, 'unexpected-field');
    assert.strictEqual(found[0].fragment, 'query.isAdmin');
  });

  check('flags a value that changes type — the operator-injection shape', () => {
    const base = createBaseline({ minSamples: 5, autosave: false });
    for (let i = 0; i < 5; i += 1) {
      base.observe(req({ method: 'POST', path: '/login', body: { password: `pw${i}` } }));
    }
    const found = base.judge(req({ method: 'POST', path: '/login', body: { password: { $ne: null } } }));
    assert.ok(found.some((f) => f.id === 'unexpected-type'), JSON.stringify(found));
    assert.strictEqual(found[0].severity, 'high');
  });

  check('flags characters a field has never held', () => {
    const base = createBaseline({ minSamples: 5, autosave: false });
    for (let i = 0; i < 5; i += 1) base.observe(req({ params: { id: String(i * 11) } }));
    const found = base.judge(req({ params: { id: "1' OR 1=1 --" } }));
    assert.ok(found.some((f) => f.id === 'unexpected-characters'), JSON.stringify(found));
    assert.strictEqual(found[0].severity, 'high', 'digits widening to text is a strong signal');
  });

  check('accepts values that fit the learned shape', () => {
    const base = createBaseline({ minSamples: 5, autosave: false });
    for (let i = 0; i < 5; i += 1) base.observe(req({ params: { id: String(i) } }));
    assert.deepStrictEqual(base.judge(req({ params: { id: '4242' } })), []);
  });

  check('flags a value far longer than anything seen', () => {
    const base = createBaseline({ minSamples: 5, autosave: false });
    for (let i = 0; i < 5; i += 1) base.observe(req({ query: { q: 'search' } }));
    const found = base.judge(req({ query: { q: 'x'.repeat(400) } }));
    assert.ok(found.some((f) => f.id === 'unexpected-length'), JSON.stringify(found));
  });

  check('a frozen profile cannot be widened by the traffic it judges', () => {
    const base = createBaseline({ minSamples: 5, autosave: false });
    for (let i = 0; i < 5; i += 1) base.observe(req({ params: { id: String(i) } }));
    const attack = req({ params: { id: "1' OR 1=1 --" } });
    for (let i = 0; i < 50; i += 1) base.observe(attack);
    assert.ok(base.judge(attack).length > 0, 'repeating an attack must not teach it as normal');
  });

  // ---------- persistence ----------
  const dir = mkdtempSync(join(tmpdir(), 'shield-baseline-'));

  check('saves and reloads a profile', async () => {
    const base = createBaseline({ dir, minSamples: 3, autosave: false });
    for (let i = 0; i < 3; i += 1) base.observe(req({ params: { id: String(i) } }));
    await base.save();
    assert.ok(existsSync(join(dir, 'baseline.json')), 'baseline.json should be written');
    const raw = JSON.parse(readFileSync(join(dir, 'baseline.json'), 'utf8'));
    assert.strictEqual(raw.version, 1);
    assert.ok(raw.routes['GET /users/:id'], Object.keys(raw.routes).join(','));
  });

  await new Promise((r) => setTimeout(r, 20));

  check('a reloaded profile judges immediately', async () => {
    const fresh = createBaseline({ dir, minSamples: 3, autosave: false });
    await fresh.load();
    const found = fresh.judge(req({ params: { id: "1' OR 1=1" } }));
    assert.ok(found.length > 0, 'a loaded baseline should be usable without relearning');
  });

  // ---------- integration ----------
  const app = express();
  app.use(express.json());
  app.use(shield.protect({
    feed: false,
    mode: 'block',
    onFinding: () => {},
    rateLimit: false,
    learn: { dir: join(dir, 'live'), minSamples: 5, enforce: true, autosave: false },
  }));
  app.post('/login', (req2, res) => res.json({ ok: true }));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const post = (body) => new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const r = http.request({
      host: '127.0.0.1', port: server.address().port, path: '/login', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    r.on('error', reject);
    r.write(payload);
    r.end();
  });

  for (let i = 0; i < 5; i += 1) await post({ email: `a${i}@b.co`, password: `secret${i}` });

  shield.clear();
  const normal = await post({ email: 'z@b.co', password: 'secret9' });
  check('normal traffic still passes after the baseline matures', () => {
    assert.strictEqual(normal.status, 200, normal.body);
    assert.deepStrictEqual(shield.findings(), []);
  });

  shield.clear();
  const operator = await post({ email: 'z@b.co', password: { $ne: null } });
  check('the signature layer still catches a known operator first', () => {
    assert.strictEqual(operator.status, 400, operator.body);
    assert.strictEqual(JSON.parse(operator.body).reason, 'nosql-operator');
  });

  shield.clear();
  // A number where a string has always been: no signature matches this, no
  // operator, no metacharacter. Only knowing the route's normal shape catches it.
  const confused = await post({ email: 'z@b.co', password: 12345 });
  check('the baseline catches type confusion no signature would flag', () => {
    assert.strictEqual(confused.status, 400, confused.body);
    assert.strictEqual(JSON.parse(confused.body).reason, 'unexpected-type');
  });

  check('reports what it has learned', () => {
    const stats = shield.baselines();
    assert.ok(stats.length >= 1);
    assert.ok(stats.some((s) => s.mature >= 1), JSON.stringify(stats));
  });

  server.close();
  shield.stop();
  rmSync(dir, { recursive: true, force: true });
  console.log(`${passed} passed${process.exitCode ? '' : ', 0 failed'}`);
})();
