'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const shield = require('@amitista/shield');
const express = require('express');

const SHIELD_ROOT = path.dirname(require.resolve('@amitista/shield'));
const shieldModule = (relative) => require(path.join(SHIELD_ROOT, relative));

const { judgeCommand, judgeSql, judgePath, judgeUrl } = shieldModule('src/runtime/detect');
const { inspectRequest } = shieldModule('src/runtime/shape');
const { inspectPayload, judgeHtml, judgeRedirect } = shieldModule('src/runtime/response');

const { RULES, LAYERS } = require('./rules');
const { createFlagLog, KEEP } = require('./flags');

const PORT = Number(process.env.SHIELD_DEMO_PORT || 8093);
const HOST = process.env.SHIELD_DEMO_HOST || '127.0.0.1';
const MAX_INPUT = 2000;

const STATE_DIR = process.env.SHIELD_DEMO_STATE || '/var/lib/amitista/shield';
const FLAGS_PATH = process.env.SHIELD_DEMO_FLAGS || path.join(STATE_DIR, 'flags.jsonl');
const MODE_PATH = process.env.SHIELD_DEMO_MODE_FILE || path.join(STATE_DIR, 'mode');
const POLICY_PATH = process.env.SHIELD_DEMO_POLICY || path.join(STATE_DIR, 'policy.json');
const CONTROL_TOKEN = (process.env.SHIELD_DEMO_CONTROL_TOKEN || '').trim();

const TUNINGS = ['enforce', 'record', 'silence'];
const MAX_PATHS = 12;
const MAX_NOTE = 200;

const MODES = ['monitor', 'block'];
const HISTORY_MAX = 500;
const LIVE_MAX = 200;

let packageVersion = null;
try {
  packageVersion = shieldModule('package.json').version || null;
} catch {
  /* a vendored copy without its manifest still runs */
}

const SCENARIOS = {
  shell: {
    label: 'Shell command',
    template: (input) => `sh -c "echo ${input}"`,
    judge: (rendered, taint) => judgeCommand(rendered, taint),
  },
  sql: {
    label: 'Database query',
    template: (input) => `SELECT * FROM users WHERE name = '${input}'`,
    judge: (rendered, taint) => judgeSql(rendered, taint),
  },
  file: {
    label: 'Filesystem path',
    template: (input) => `/var/data/uploads/${input}`,
    judge: (rendered, taint) => judgePath(rendered, taint),
  },
  fetch: {
    label: 'Outbound request',
    template: (input) => input,
    judge: (rendered, taint) => judgeUrl(rendered, taint),
  },
  html: {
    label: 'HTML response',
    template: (input) => `<p>Hello ${input}</p>`,
    judge: (rendered, taint) => judgeHtml(rendered, taint, 'text/html'),
  },
  redirect: {
    label: 'Redirect target',
    template: (input) => input,
    judge: (rendered, taint) => judgeRedirect(rendered, taint),
  },
};

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function decodeVariants(value) {
  const out = new Set([value]);
  try {
    const decoded = decodeURIComponent(value);
    if (decoded !== value) out.add(decoded);
  } catch {
    /* malformed encoding is still request data */
  }
  return out;
}

function evaluate(scenarioId, input) {
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) return null;

  const taint = decodeVariants(input);
  const rendered = scenario.template(input);
  const findings = [];

  const sink = scenario.judge(rendered, taint);
  if (sink) findings.push({ ...sink, layer: sink.at === 'response' ? 'response' : 'runtime' });

  for (const finding of inspectRequest({ body: { input }, query: {}, params: {} })) {
    findings.push({ ...finding, layer: 'request' });
  }

  let parsed = null;
  try {
    parsed = JSON.parse(input);
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed === 'object') {
    for (const finding of inspectRequest({ body: parsed, query: {}, params: {} })) {
      findings.push({ ...finding, layer: 'request' });
    }
    for (const finding of inspectPayload(parsed)) {
      findings.push({ ...finding, layer: 'response' });
    }
  }

  findings.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3));

  const worst = findings[0] || null;
  const verdict = !worst
    ? 'allowed'
    : (worst.severity === 'critical' || worst.severity === 'high') ? 'blocked' : 'flagged';

  return {
    scenario: scenarioId,
    label: scenario.label,
    rendered: rendered.slice(0, 400),
    verdict,
    findings: findings.slice(0, 6).map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      layer: finding.layer,
      label: finding.label,
      detail: finding.detail,
      fragment: typeof finding.fragment === 'string' ? finding.fragment.slice(0, 120) : null,
    })),
  };
}

const flagLog = createFlagLog(FLAGS_PATH);
flagLog.start();

function readMode() {
  const requested = (process.env.SHIELD_DEMO_MODE || '').trim();
  if (MODES.includes(requested)) return requested;
  try {
    const stored = fs.readFileSync(MODE_PATH, 'utf8').trim();
    if (MODES.includes(stored)) return stored;
  } catch {
    /* no stored mode yet */
  }
  return 'block';
}

function persistMode(next) {
  try {
    fs.mkdirSync(path.dirname(MODE_PATH), { recursive: true });
    fs.writeFileSync(MODE_PATH, `${next}\n`, { mode: 0o640 });
    return true;
  } catch {
    return false;
  }
}

let mode = readMode();
let health = null;
let healthAt = null;
const started = new Date().toISOString();

async function refreshHealth() {
  try {
    health = await shield.selfTest();
  } catch (failure) {
    health = { healthy: false, probes: [], unprotected: [], error: failure.message };
  }
  healthAt = new Date().toISOString();
  return health;
}

const ABUSE_RULES = new Set(['rate-limit', 'rate-block', 'burst', 'concurrency']);

const RULE_IDS = new Set(RULES.map((rule) => rule.id));

function readPolicy() {
  try {
    const parsed = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.rules && typeof parsed.rules === 'object') {
      return { rules: parsed.rules };
    }
  } catch {
    /* no policy yet, or one that is not worth honouring */
  }
  return { rules: {} };
}

function persistPolicy() {
  try {
    fs.mkdirSync(path.dirname(POLICY_PATH), { recursive: true });
    fs.writeFileSync(POLICY_PATH, `${JSON.stringify(policy, null, 2)}\n`, { mode: 0o640 });
    return true;
  } catch {
    return false;
  }
}

const policy = readPolicy();

function underPath(target, prefix) {
  if (target === prefix) return true;
  return target.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

function tuningFor(id, target) {
  const rule = policy.rules[id];
  if (!rule || !TUNINGS.includes(rule.mode) || rule.mode === 'enforce') return null;
  const paths = Array.isArray(rule.paths) ? rule.paths : [];
  if (paths.length && !paths.some((prefix) => underPath(target || '/', prefix))) return null;
  return rule.mode;
}

function clientIp(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.ip || (req.socket && req.socket.remoteAddress) || null;
}

function stamp(finding, req, extra) {
  const entry = { ...finding, ...extra };
  if (!entry.reference) {
    try {
      const context = req && req.res && req.res.locals && req.res.locals.shield;
      if (context) entry.reference = context.reference;
    } catch {
      /* a flag without a reference is still worth keeping */
    }
  }
  if (!entry.ip) entry.ip = clientIp(req);
  return entry;
}

const POLICY = {
  blockPage: false,
  rateLimit: { max: 60, windowMs: 60_000, burstMax: 12, trustProxy: true },
  learn: false,
  verify: false,
  ignore: (finding, req) => {
    if (req.path === '/evaluate' && !ABUSE_RULES.has(finding.id)) return true;

    const tuning = tuningFor(finding.id, req.path);
    if (!tuning) return false;

    if (tuning === 'record') {
      const entry = stamp(finding, req, { blocked: false, tuned: 'record' });
      flagLog.record(entry);
      process.stdout.write(`shield-demo recorded ${entry.severity} ${entry.id} ${entry.path}\n`);
    }
    return true;
  },
  onFinding: (finding, req) => {
    const entry = stamp(finding, req);
    flagLog.record(entry);
    process.stdout.write(
      `shield-demo ${entry.blocked ? 'BLOCKED' : 'flagged'} ${entry.severity} ${entry.id} ${entry.path}\n`,
    );
  },
};

const guards = new Map();

function guard(name) {
  if (!guards.has(name)) guards.set(name, shield.protect({ ...POLICY, mode: name }));
  return guards.get(name);
}

function feedSummary() {
  try {
    const { registry } = shieldModule('src/feed');
    if (!registry || typeof registry.summary !== 'function') return null;
    return registry.summary();
  } catch {
    return null;
  }
}

function controlAllowed(req) {
  if (!CONTROL_TOKEN) return false;
  const presented = String(req.get('X-Shield-Control') || '');
  const a = Buffer.from(presented);
  const b = Buffer.from(CONTROL_TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

const control = express.Router();

control.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!CONTROL_TOKEN) {
    return res.status(503).json({ error: 'No control token is configured on the evaluator.' });
  }
  if (!controlAllowed(req)) return res.status(403).json({ error: 'Not allowed.' });
  return next();
});

control.get('/state', (req, res) => {
  const asked = Number.parseInt(String(req.query.limit || ''), 10);
  const limit = Number.isFinite(asked) ? Math.max(1, Math.min(HISTORY_MAX, asked)) : 200;

  res.json({
    mode,
    modes: MODES,
    started,
    uptimeSeconds: Math.round(process.uptime()),
    version: packageVersion,
    health,
    healthAt,
    live: shield.findings().slice(-LIVE_MAX).reverse(),
    history: flagLog.read(limit).reverse(),
    historyKept: KEEP,
    baselines: shield.baselines(),
    flags: flagLog.stats(),
    feed: feedSummary(),
    rules: RULES,
    layers: LAYERS,
    tunings: TUNINGS,
    tuned: policy.rules,
    policy: {
      rateLimit: POLICY.rateLimit,
      learn: false,
      blockPage: false,
      ignores: '/evaluate, except the abuse rules',
    },
    scenarios: Object.entries(SCENARIOS).map(([id, scenario]) => ({
      id,
      label: scenario.label,
      example: scenario.template('«your input»'),
    })),
    maxInput: MAX_INPUT,
  });
});

control.post('/mode', (req, res) => {
  const next = typeof req.body?.mode === 'string' ? req.body.mode.trim() : '';
  if (!MODES.includes(next)) {
    return res.status(400).json({ error: 'mode must be "monitor" or "block".' });
  }
  const was = mode;
  mode = next;
  guard(mode);
  const persisted = persistMode(mode);
  process.stdout.write(`shield-demo mode ${was} -> ${mode}\n`);
  return res.json({ mode, was, persisted });
});

control.post('/policy', (req, res) => {
  const body = req.body || {};
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const mode = typeof body.mode === 'string' ? body.mode.trim() : '';

  if (!RULE_IDS.has(id)) return res.status(400).json({ error: 'That is not a rule this build has.' });
  if (!TUNINGS.includes(mode)) {
    return res.status(400).json({ error: 'mode must be enforce, record or silence.' });
  }

  const paths = Array.isArray(body.paths)
    ? body.paths
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.startsWith('/'))
      .slice(0, MAX_PATHS)
    : [];
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE) : '';

  const was = policy.rules[id] || null;
  if (mode === 'enforce' && !paths.length) {
    delete policy.rules[id];
  } else {
    policy.rules[id] = {
      mode,
      paths,
      note,
      at: new Date().toISOString(),
      by: typeof body.by === 'string' ? body.by.trim().slice(0, 64) : null,
    };
  }

  const persisted = persistPolicy();
  process.stdout.write(`shield-demo policy ${id} -> ${mode}${paths.length ? ` on ${paths.join(' ')}` : ''}\n`);
  return res.json({ id, mode, paths, was, persisted, tuned: policy.rules });
});

control.post('/clear', (req, res) => {
  shield.clear();
  const cleared = flagLog.clear();
  return res.json({ cleared });
});

control.post('/selftest', async (req, res) => {
  const report = await refreshHealth();
  return res.json({ health: report, healthAt });
});

app.use('/admin', control);

app.use((req, res, next) => guard(mode)(req, res, next));

app.post('/evaluate', (req, res) => {
  const body = req.body || {};
  const scenarioId = typeof body.scenario === 'string' ? body.scenario : 'shell';
  const input = typeof body.input === 'string' ? body.input : '';

  if (!SCENARIOS[scenarioId]) {
    return res.status(400).json({
      error: 'Unknown scenario',
      scenarios: Object.keys(SCENARIOS),
    });
  }
  if (input.length > MAX_INPUT) {
    return res.status(413).json({ error: `Input is limited to ${MAX_INPUT} characters` });
  }

  const result = evaluate(scenarioId, input);
  res.set('Cache-Control', 'no-store');
  return res.json({
    ...result,
    note: 'Nothing here is executed. The strings above are handed to the same rule engine the package runs, and only its verdict is returned.',
  });
});

app.get('/evaluate', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    scenarios: Object.entries(SCENARIOS).map(([id, scenario]) => ({
      id,
      label: scenario.label,
      example: scenario.template('«your input»'),
    })),
    maxInput: MAX_INPUT,
    method: 'POST',
  });
});

app.use(shield.errorHandler());

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const server = app.listen(PORT, HOST, () => {
  process.stdout.write(`shield-demo listening on ${HOST}:${PORT} in ${mode} mode\n`);
});

shield.harden(server);

void refreshHealth().then((report) => {
  if (!report.healthy) process.stderr.write(`shield-demo: runtime hooks degraded\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    flagLog.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
