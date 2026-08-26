'use strict';

const assert = require('node:assert');
const http = require('node:http');

// Hooks must be installed before the sink modules are destructured — this
// mirrors the documented `node -r @amitista/shield/register` startup.
const shield = require('../index');

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const express = require('express');

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

function build(mode) {
  const app = express();
  app.use(express.json());
  app.use(shield.protect({ mode, onFinding: () => {}, feed: false }));

  app.post('/run', (req, res) => {
    const out = execSync(`echo ${req.body.cmd}`).toString();
    res.json({ out });
  });

  app.get('/file', (req, res) => {
    try {
      res.send(fs.readFileSync(`/var/shield-test/${req.query.name}`, 'utf8'));
    } catch {
      res.send('missing');
    }
  });

  app.get('/fetch', async (req, res) => {
    try {
      await fetch(req.query.url);
    } catch {
      // network failure is irrelevant; the hook fires before the request leaves
    }
    res.send('done');
  });

  app.get('/safe', (req, res) => {
    res.json({ out: execSync('echo hello').toString().trim() });
  });

  app.use(shield.errorHandler());
  return app;
}

function request(server, path, { method = 'GET', body = null, headers = {} } = {}) {
  const { port } = server.address();
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method,
        headers: payload
          ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers }
          : headers },
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
  fs.mkdirSync('/var/shield-test', { recursive: true });
  fs.writeFileSync('/var/shield-test/notes.txt', 'benign content');

  // ---------- monitor mode ----------
  const monitor = await listen(build('monitor'));

  shield.clear();
  const injected = await request(monitor, '/run', { method: 'POST', body: { cmd: 'hi; whoami' } });
  const commandFindings = shield.findings();

  check('catches command injection through a live request', () => {
    assert.strictEqual(commandFindings.length, 1, `got ${JSON.stringify(commandFindings)}`);
    assert.strictEqual(commandFindings[0].id, 'command');
    assert.strictEqual(commandFindings[0].severity, 'critical');
    assert.strictEqual(commandFindings[0].call, 'child_process.execSync');
    assert.strictEqual(commandFindings[0].fragment, 'hi; whoami');
  });

  check('monitor mode lets the request complete', () => {
    assert.strictEqual(injected.status, 200);
    assert.match(injected.body, /whoami|root/);
  });

  shield.clear();
  await request(monitor, '/file?name=../../etc/passwd');
  check('catches path traversal', () => {
    const found = shield.findings();
    assert.strictEqual(found.length, 1, `got ${JSON.stringify(found)}`);
    assert.strictEqual(found[0].id, 'filesystem');
    assert.strictEqual(found[0].severity, 'high');
  });

  shield.clear();
  await request(monitor, '/file?name=notes.txt');
  check('leaves a benign filename alone', () => {
    assert.deepStrictEqual(shield.findings(), []);
  });

  shield.clear();
  await request(monitor, '/fetch?url=http://169.254.169.254/latest/meta-data');
  check('catches SSRF at the cloud metadata address', () => {
    const found = shield.findings();
    assert.strictEqual(found.length, 1, `got ${JSON.stringify(found)}`);
    assert.strictEqual(found[0].id, 'ssrf');
  });

  shield.clear();
  await request(monitor, '/fetch?url=https://example.com/ok');
  check('leaves an ordinary outbound URL alone', () => {
    assert.deepStrictEqual(shield.findings(), []);
  });

  shield.clear();
  const safe = await request(monitor, '/safe');
  check('ignores a shell command built from no request data', () => {
    assert.deepStrictEqual(shield.findings(), []);
    assert.match(safe.body, /hello/);
  });

  check('sets security headers automatically', () => {
    assert.strictEqual(safe.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(safe.headers['x-frame-options'], 'DENY');
    assert.strictEqual(safe.headers['referrer-policy'], 'no-referrer');
    assert.strictEqual(safe.headers['x-powered-by'], undefined, 'x-powered-by should be removed');
  });

  monitor.close();

  // ---------- block mode ----------
  const blocking = await listen(build('block'));

  shield.clear();
  const blocked = await request(blocking, '/run', { method: 'POST', body: { cmd: 'hi; whoami' } });

  check('block mode rejects the request with 400', () => {
    assert.strictEqual(blocked.status, 400);
    const body = JSON.parse(blocked.body);
    assert.strictEqual(body.error, 'Request rejected');
    assert.strictEqual(body.reason, 'command');
    assert.match(body.reference, /^AMS-[0-9A-F]{4}-[0-9A-F]{4}$/);
    assert.strictEqual(body.page, `${shield.BLOCK_PAGE}?ref=${body.reference}&rule=command`);
  });

  check('the reference on the wire matches the one in the finding', () => {
    const body = JSON.parse(blocked.body);
    assert.strictEqual(blocked.headers['x-shield-reference'], body.reference);
    assert.strictEqual(shield.findings()[0].reference, body.reference);
  });

  check('block mode actually prevents the command from running', () => {
    assert.ok(!/root|whoami/.test(blocked.body), `command output leaked: ${blocked.body}`);
    assert.strictEqual(shield.findings()[0].blocked, true);
  });

  shield.clear();
  const browser = await request(blocking, '/run', {
    method: 'POST',
    body: { cmd: 'hi; whoami' },
    headers: { accept: 'text/html,application/xhtml+xml', 'sec-fetch-dest': 'document' },
  });

  check('a browser navigation is sent to the block page instead of raw JSON', () => {
    assert.strictEqual(browser.status, 303);
    const location = browser.headers.location;
    assert.ok(location.startsWith(`${shield.BLOCK_PAGE}?`), `got ${location}`);
    assert.match(location, /[?&]rule=command\b/);
    assert.match(location, /[?&]ref=AMS-[0-9A-F]{4}-[0-9A-F]{4}/);
    assert.strictEqual(
      new URL(location).searchParams.get('ref'),
      browser.headers['x-shield-reference'],
    );
  });

  check('the block page fallback body carries no command output', () => {
    assert.ok(/blocked by Amitista Security/i.test(browser.body), browser.body);
    assert.ok(!/root|whoami/.test(browser.body), `command output leaked: ${browser.body}`);
  });

  shield.clear();
  const xhr = await request(blocking, '/run', {
    method: 'POST',
    body: { cmd: 'hi; whoami' },
    headers: { accept: 'text/html', 'sec-fetch-dest': 'empty' },
  });

  check('a subresource or fetch still gets JSON, not a redirect', () => {
    assert.strictEqual(xhr.status, 400);
    assert.strictEqual(xhr.headers.location, undefined);
    assert.strictEqual(JSON.parse(xhr.body).reason, 'command');
  });

  shield.clear();
  const noPage = await listen((() => {
    const app = express();
    app.use(express.json());
    app.use(shield.protect({ mode: 'block', blockPage: false, onFinding: () => {}, feed: false }));
    app.get('/file', (req, res) => {
      res.send(fs.readFileSync(`/var/shield-test/${req.query.name}`, 'utf8'));
    });
    app.use(shield.errorHandler({ blockPage: false }));
    return app;
  })());

  const optedOut = await request(noPage, '/file?name=../../etc/passwd', {
    headers: { accept: 'text/html', 'sec-fetch-dest': 'document' },
  });

  check('blockPage: false keeps the refusal local to the app', () => {
    assert.strictEqual(optedOut.status, 400);
    assert.strictEqual(optedOut.headers.location, undefined);
    assert.strictEqual(JSON.parse(optedOut.body).page, undefined);
  });
  noPage.close();

  shield.clear();
  const stillFine = await request(blocking, '/safe');
  check('block mode does not disturb legitimate traffic', () => {
    assert.strictEqual(stillFine.status, 200);
    assert.match(stillFine.body, /hello/);
    assert.deepStrictEqual(shield.findings(), []);
  });

  shield.clear();
  const benign = await request(blocking, '/file?name=notes.txt');
  check('block mode serves a benign file normally', () => {
    assert.strictEqual(benign.status, 200);
    assert.strictEqual(benign.body, 'benign content');
  });

  blocking.close();
  shield.stop();
  fs.rmSync('/var/shield-test', { recursive: true, force: true });

  console.log(`${passed} passed${process.exitCode ? '' : ', 0 failed'}`);
})();
