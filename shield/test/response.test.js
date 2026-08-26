'use strict';

const assert = require('node:assert');
const http = require('node:http');

const shield = require('../index');
const express = require('express');
const { inspectPayload, judgeRedirect, judgeHtml, cookieFindings, luhn } = require('../src/runtime/response');

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

function request(server, path, { headers = {} } = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

(async () => {
  // ---------- unit ----------
  check('spots a password hash on its way out', () => {
    const found = inspectPayload({ id: 1, email: 'a@b.c', password_hash: '$2b$12$abcdefghijklmnopqrstuv' });
    assert.ok(found.length >= 1, JSON.stringify(found));
    assert.strictEqual(found[0].severity, 'critical');
  });

  check('spots a secret-shaped key even when the value is harmless', () => {
    const found = inspectPayload({ user: { name: 'a', apiKey: 'short' } });
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.strictEqual(found[0].fragment, 'user.apiKey');
  });

  check('leaves an ordinary payload alone', () => {
    const found = inspectPayload({ id: 7, title: 'A post', tags: ['x'], author: { name: 'alice' } });
    assert.deepStrictEqual(found, []);
  });

  check('validates card numbers with a checksum, not just a shape', () => {
    assert.ok(luhn('4242424242424242'), 'a valid test card should pass');
    assert.ok(!luhn('4242424242424243'), 'a mistyped one should not');
    assert.strictEqual(inspectPayload({ ref: '4242424242424243' }).length, 0, 'checksum failure is not a card');
    assert.strictEqual(inspectPayload({ ref: '4242424242424242' }).length, 1, 'a real card is');
  });

  check('flags a caller-chosen absolute redirect target', () => {
    const taint = new Set(['https://evil.example/steal']);
    assert.ok(judgeRedirect('https://evil.example/steal', taint));
    assert.strictEqual(judgeRedirect('/dashboard', taint), null, 'relative paths are fine');
  });

  check('flags reflected markup but not reflected plain text', () => {
    const taint = new Set(['<img src=x onerror=alert(1)>', 'hello world']);
    assert.ok(judgeHtml('<p><img src=x onerror=alert(1)></p>', taint, 'text/html'));
    assert.strictEqual(judgeHtml('<p>hello world</p>', taint, 'text/html'), null);
  });

  check('flags a session cookie missing its flags', () => {
    const found = cookieFindings('connect.sid=abc123; Path=/', true);
    assert.strictEqual(found.length, 1);
    assert.match(found[0].label, /HttpOnly/);
    assert.strictEqual(found[0].severity, 'high');
  });

  check('leaves a non-session cookie alone', () => {
    assert.deepStrictEqual(cookieFindings('theme=dark; Path=/', true), []);
  });

  // ---------- integration ----------
  const app = express();
  app.use(shield.protect({ mode: 'block', onFinding: () => {}, rateLimit: false, feed: false }));

  app.get('/leak', (req, res) => {
    res.json({ id: 1, email: 'a@b.c', password_hash: '$2b$12$abcdefghijklmnopqrstuv' });
  });
  app.get('/clean', (req, res) => res.json({ id: 1, title: 'fine' }));
  app.get('/go', (req, res) => res.redirect(req.query.next));
  app.get('/echo', (req, res) => {
    res.set('content-type', 'text/html');
    res.send(`<p>${req.query.q}</p>`);
  });
  app.get('/login', (req, res) => {
    res.setHeader('Set-Cookie', 'connect.sid=abc123; Path=/');
    res.json({ ok: true });
  });

  const server = await listen(app);

  shield.clear();
  const leaked = await request(server, '/leak');
  check('withholds a response carrying a password hash', () => {
    assert.strictEqual(leaked.status, 500);
    assert.ok(!/\$2b\$/.test(leaked.body), `hash leaked: ${leaked.body}`);
    assert.strictEqual(JSON.parse(leaked.body).reason, 'data-exposure');
  });

  shield.clear();
  const clean = await request(server, '/clean');
  check('lets a clean response through untouched', () => {
    assert.strictEqual(clean.status, 200);
    assert.deepStrictEqual(JSON.parse(clean.body), { id: 1, title: 'fine' });
    assert.deepStrictEqual(shield.findings(), []);
  });

  shield.clear();
  const redirected = await request(server, '/go?next=https://evil.example/steal');
  check('refuses an open redirect', () => {
    assert.strictEqual(redirected.status, 400);
    assert.strictEqual(JSON.parse(redirected.body).reason, 'open-redirect');
    assert.ok(!redirected.headers.location, 'must not emit a Location header');
  });

  shield.clear();
  const internal = await request(server, '/go?next=/dashboard');
  check('allows an internal redirect', () => {
    assert.strictEqual(internal.status, 302);
    assert.strictEqual(internal.headers.location, '/dashboard');
  });

  shield.clear();
  const xssed = await request(server, '/echo?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
  check('refuses reflected markup', () => {
    assert.strictEqual(xssed.status, 400);
    assert.ok(!/onerror/.test(xssed.body), `payload reflected: ${xssed.body}`);
  });

  shield.clear();
  const plain = await request(server, '/echo?q=hello%20there');
  check('allows ordinary reflected text', () => {
    assert.strictEqual(plain.status, 200);
    assert.match(plain.body, /hello there/);
  });

  shield.clear();
  const cookie = await request(server, '/login', { headers: { 'x-forwarded-proto': 'https' } });
  check('hardens a session cookie and reports what was missing', () => {
    const header = String(cookie.headers['set-cookie']);
    assert.match(header, /SameSite=Lax/, 'SameSite should be added');
    assert.match(header, /Secure/, 'Secure should be added on https');
    assert.ok(shield.findings().some((f) => f.id === 'insecure-cookie'));
  });

  check('does not silently add HttpOnly and break a JS-read cookie', () => {
    const header = String(cookie.headers['set-cookie']);
    assert.ok(!/HttpOnly/i.test(header), 'HttpOnly must be reported, not forced');
  });

  server.close();
  shield.stop();
  console.log(`${passed} passed${process.exitCode ? '' : ', 0 failed'}`);
})();
