import { spawn } from 'node:child_process';
import { readFile, readlink, writeFile, mkdir, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { cpus, loadavg } from 'node:os';

const SITE = process.env.AMITISTA_PERF_URL ?? 'https://amitista.com';
const STATE = process.env.AMITISTA_PERF_STATE ?? '/var/lib/amitista/perf';
const HISTORY = join(STATE, 'history.jsonl');
const BASELINE = join(STATE, 'baseline.json');
const WEBROOT = process.env.AMITISTA_WEBROOT ?? '/var/www/amitista.com';
const CURRENT = join(WEBROOT, 'current');
const LEDGER = join(WEBROOT, 'releases.jsonl');
const KEEP_RUNS = 2000;
const CHROMIUM = process.env.AMITISTA_CHROMIUM ?? '/usr/bin/chromium';
const PORT = Number(process.env.AMITISTA_PERF_CDP_PORT ?? 9422);
const PROFILE = `/tmp/amitista-perf-${PORT}`;

const ROUTES = ['/', '/work', '/team', '/services', '/docs/introduction'];

const BUDGETS = {
  broadband: { lcp: 1200, fcp: 900, ttfb: 400, cls: 0.1, longTaskMs: 400, bytes: 400_000 },
  'slow-4g-4x-cpu': { lcp: 2500, fcp: 1800, ttfb: 900, cls: 0.1, longTaskMs: 3000, bytes: 400_000 },
};
const REGRESSION = 1.35;
const MIN_SHIFT_MS = 120;
const QUIET_FRACTION = 0.6;

const QUIET_LOAD = Number(process.env.AMITISTA_PERF_QUIET_LOAD ?? 0.7);
const QUIET_WAIT_MS = Number(process.env.AMITISTA_PERF_QUIET_WAIT_MS ?? 150_000);
const QUIET_POLL_MS = 5_000;

const MEASURE_PASSES = Number(process.env.AMITISTA_PERF_PASSES ?? 2);
const CONFIRM_PASSES = Number(process.env.AMITISTA_PERF_CONFIRM_PASSES ?? 1);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function argOf(flag) {
  const hit = process.argv.find((a) => a === flag || a.startsWith(`${flag}=`));
  return hit ? (hit.includes('=') ? hit.split('=').slice(1).join('=') : true) : null;
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.seq = 0;
    this.pending = new Map();
    this.handlers = new Map();
  }

  static async connect(endpoint) {
    const socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error(`cannot open a CDP socket at ${endpoint}`));
    });

    const cdp = new Cdp(socket);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && cdp.pending.has(message.id)) {
        const { resolve, reject } = cdp.pending.get(message.id);
        cdp.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
        return;
      }
      for (const handler of cdp.handlers.get(message.method) ?? []) handler(message.params);
    };
    return cdp;
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(handler);
  }

  send(method, params = {}, sessionId) {
    const id = (this.seq += 1);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

async function browserEndpoint() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return (await response.json()).webSocketDebuggerUrl;
    } catch {
    }
    await sleep(250);
  }
  throw new Error(`${CHROMIUM} did not open a debugging port on ${PORT}`);
}

const COLLECT = `(async () => {
  const nav = performance.getEntriesByType('navigation')[0] ?? {};
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]));

  const settle = (type, pick) => new Promise((resolve) => {
    let value = null;
    try {
      new PerformanceObserver((list) => { value = pick(list.getEntries(), value); })
        .observe({ type, buffered: true });
    } catch { resolve(null); return; }
    setTimeout(() => resolve(value), 1200);
  });

  const [lcp, cls, longTasks] = await Promise.all([
    settle('largest-contentful-paint', (entries) => {
      const last = entries[entries.length - 1];
      return last ? { at: last.startTime, url: last.url || null, tag: last.element?.tagName ?? null } : null;
    }),
    settle('layout-shift', (entries, seen) =>
      entries.filter((e) => !e.hadRecentInput).reduce((sum, e) => sum + e.value, seen ?? 0)),
    settle('longtask', (entries, seen) => [...(seen ?? []), ...entries.map((e) => e.duration)]),
  ]);

  const tasks = longTasks ?? [];
  return {
    ttfb: Math.round(nav.responseStart ?? 0),
    fcp: Math.round(paint['first-contentful-paint'] ?? 0),
    lcp: lcp ? Math.round(lcp.at) : null,
    lcpElement: lcp ? (lcp.url || lcp.tag) : null,
    cls: Number((cls ?? 0).toFixed(4)),
    load: Math.round(nav.loadEventEnd ?? 0),
    longTaskMs: Math.round(tasks.reduce((sum, d) => sum + d, 0)),
    longestTaskMs: Math.round(Math.max(0, ...tasks)),
    // Total blocking time: the part of each long task past the 50ms a browser
    // is allowed before an interaction would have to wait. The third Core Web
    // Vital is INP, which cannot be measured here because nothing interacts
    // with this page — TBT is the lab stand-in for it, and it is reported under
    // its own name rather than dressed up as INP.
    tbt: Math.round(tasks.reduce((sum, d) => sum + Math.max(0, d - 50), 0)),
  };
})()`;

async function measure(cdp, path, { throttle }) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => cdp.send(method, params, sessionId);

  let bytes = 0;
  let injected = [];
  const onResponse = (params) => {
    if (params.sessionId && params.sessionId !== sessionId) return;
    if (params.response?.url?.includes('/cdn-cgi/')) injected.push(params.response.url);
  };
  const onFinished = (params) => {
    if (params.sessionId && params.sessionId !== sessionId) return;
    bytes += params.encodedDataLength ?? 0;
  };
  cdp.on('Network.responseReceived', onResponse);
  cdp.on('Network.loadingFinished', onFinished);

  try {
    await call('Page.enable');
    await call('Network.enable');
    await call('Runtime.enable');
    await call('Network.setCacheDisabled', { cacheDisabled: true });
    await call('Emulation.setDeviceMetricsOverride', {
      width: 1350, height: 940, deviceScaleFactor: 1, mobile: false,
    });
    if (throttle) {
      await call('Emulation.setCPUThrottlingRate', { rate: 4 });
      await call('Network.emulateNetworkConditions', {
        offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 93_750,
      });
    }

    await call('Page.navigate', { url: `${SITE}${path}` });
    await sleep(throttle ? 9000 : 5000);

    const { result } = await call('Runtime.evaluate', {
      expression: COLLECT, awaitPromise: true, returnByValue: true,
    });

    return { path, ...result.value, bytes, injected };
  } finally {
    cdp.handlers.set('Network.responseReceived',
      (cdp.handlers.get('Network.responseReceived') ?? []).filter((h) => h !== onResponse));
    cdp.handlers.set('Network.loadingFinished',
      (cdp.handlers.get('Network.loadingFinished') ?? []).filter((h) => h !== onFinished));
    await cdp.send('Target.closeTarget', { targetId });
  }
}

async function headers(path) {
  const response = await fetch(`${SITE}${path}`, { redirect: 'manual' });
  const out = {};
  for (const [name, value] of response.headers) out[name.toLowerCase()] = value;
  return { status: response.status, headers: out, body: await response.text() };
}

async function checkInvariants() {
  const problems = [];
  const home = await headers('/');
  const route = await headers('/privacy');
  const rules = await headers('/speculation-rules.json');

  const hsts = home.headers['strict-transport-security'] ?? '';
  if (!/\bpreload\b/.test(hsts)) problems.push('the HSTS header lost its preload directive');
  if (!/includeSubDomains/i.test(hsts)) problems.push('the HSTS header lost includeSubDomains');

  const homeLink = home.headers.link ?? '';
  const routeLink = route.headers.link ?? '';
  if (!homeLink.includes('as=font')) problems.push('/ sends no Link preload for the font');
  if (!routeLink.includes('as=style')) problems.push('/privacy sends no Link preload for the stylesheet');

  const cssMatch = routeLink.match(/<(\/assets\/index-[^>]+\.css)>/);
  if (!cssMatch) {
    problems.push('the Link header on /privacy names no stylesheet');
  } else if (!route.body.includes(cssMatch[1])) {
    problems.push(
      `the Link header preloads ${cssMatch[1]}, which is not the stylesheet /privacy links — ` +
        'a release was published without rewriting the preload snippet',
    );
  }

  if (!home.headers['speculation-rules']) problems.push('/ sends no Speculation-Rules header');
  if (rules.status !== 200) problems.push(`/speculation-rules.json returned ${rules.status}`);
  else if (!(rules.headers['content-type'] ?? '').includes('speculationrules+json')) {
    problems.push(
      `/speculation-rules.json is served as ${rules.headers['content-type']}, so every browser ` +
        'ignores the rules and navigations stop being instant',
    );
  } else {
    try {
      JSON.parse(rules.body);
    } catch {
      problems.push('/speculation-rules.json is not valid JSON');
    }
  }

  for (const [label, page] of [['/', home], ['/privacy', route]]) {
    if (page.body.includes('email-decode') || page.body.includes('/cdn-cgi/l/email-protection')) {
      problems.push(
        `${label} carries Cloudflare's injected email-decode script again — the email_off ` +
          'markers are missing from the artefact',
      );
    }
  }

  const logo = await headers('/amitista-logo.png');
  const maxAge = Number((logo.headers['cache-control'] ?? '').match(/max-age=(\d+)/)?.[1] ?? 0);
  if (maxAge < 86_400) problems.push(`/amitista-logo.png is cacheable for only ${maxAge}s`);

  return problems;
}

function regressions(now, base, profile) {
  const out = [];
  if (!base) return out;
  const budget = BUDGETS[profile];

  for (const page of now) {
    const previous = base.find((p) => p.path === page.path);
    if (!previous) continue;

    for (const metric of ['lcp', 'fcp', 'ttfb']) {
      const then = previous[metric];
      const value = page[metric];
      if (!then || !value) continue;
      if (value <= budget[metric] * QUIET_FRACTION) continue;
      if (value > then * REGRESSION && value - then > MIN_SHIFT_MS) {
        out.push(`${page.path} ${metric.toUpperCase()} ${then}ms → ${value}ms`);
      }
    }

    if (page.cls > previous.cls + 0.05) {
      out.push(`${page.path} CLS ${previous.cls} → ${page.cls}`);
    }
  }
  return out;
}

function overBudget(pages, profile) {
  const budget = BUDGETS[profile];
  const out = [];
  for (const page of pages) {
    if (page.lcp && page.lcp > budget.lcp) out.push(`${page.path} LCP ${page.lcp}ms over ${budget.lcp}ms`);
    if (page.fcp > budget.fcp) out.push(`${page.path} FCP ${page.fcp}ms over ${budget.fcp}ms`);
    if (page.ttfb > budget.ttfb) out.push(`${page.path} TTFB ${page.ttfb}ms over ${budget.ttfb}ms`);
    if (page.cls > budget.cls) out.push(`${page.path} CLS ${page.cls} over ${budget.cls}`);
    if (page.longTaskMs > budget.longTaskMs) {
      out.push(`${page.path} ${page.longTaskMs}ms of long tasks over ${budget.longTaskMs}ms`);
    }
    if (page.bytes > budget.bytes) {
      out.push(`${page.path} ${(page.bytes / 1024).toFixed(0)}kB over ${(budget.bytes / 1024).toFixed(0)}kB`);
    }
    if (page.injected?.length) {
      out.push(`${page.path} loads ${page.injected.length} edge-injected script(s): ${page.injected.join(', ')}`);
    }
  }
  return out;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function liveRelease() {
  let id = null;
  try {
    id = basename(await readlink(CURRENT));
  } catch {
    return null;
  }

  const ledger = await readFile(LEDGER, 'utf8').catch(() => '');
  for (const line of ledger.split('\n').reverse()) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.release === id) return entry;
    } catch {
    }
  }
  return { release: id, sha: null, subject: null, author: null };
}

async function readRuns() {
  const text = await readFile(HISTORY, 'utf8').catch(() => '');
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
    }
  }
  return out;
}

const SHIFT_FRACTION = 0.1;
const MIN_CLS_SHIFT = 0.02;
const SHIFT_FLOOR = { lcp: MIN_SHIFT_MS, fcp: MIN_SHIFT_MS, ttfb: MIN_SHIFT_MS, tbt: 50 };

function busyness() {
  return loadavg()[0] / Math.max(1, cpus().length);
}

async function waitForQuiet() {
  const until = Date.now() + QUIET_WAIT_MS;
  let load = busyness();
  if (load <= QUIET_LOAD) return { load: Number(load.toFixed(2)), waited: 0 };

  const start = Date.now();
  process.stdout.write(`  box is busy (load ${load.toFixed(2)}/core) — waiting for it to settle\n`);
  while (Date.now() < until) {
    await sleep(QUIET_POLL_MS);
    load = busyness();
    if (load <= QUIET_LOAD) break;
  }
  const waited = Date.now() - start;
  process.stdout.write(
    `  ${load <= QUIET_LOAD ? 'settled' : 'still busy'} at ${load.toFixed(2)}/core` +
      ` after ${(waited / 1000).toFixed(0)}s\n`,
  );
  return { load: Number(load.toFixed(2)), waited };
}

function middle(values) {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (!sorted.length) return null;
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

function medianPages(passes) {
  const first = passes[0] ?? [];
  return first.map((page) => {
    const readings = passes.map((pass) => pass.find((entry) => entry.path === page.path));
    const out = { ...page };
    for (const metric of ['ttfb', 'fcp', 'lcp', 'cls', 'load', 'longTaskMs', 'longestTaskMs', 'tbt', 'bytes']) {
      const value = middle(readings.map((entry) => entry?.[metric]));
      if (value !== null) out[metric] = metric === 'cls' ? Number(value.toFixed(4)) : Math.round(value);
    }
    return out;
  });
}

function shifts(now, before) {
  const out = [];
  if (!Array.isArray(before)) return out;

  for (const page of now) {
    const previous = before.find((entry) => entry.path === page.path);
    if (!previous) continue;

    for (const metric of ['lcp', 'fcp', 'ttfb', 'tbt']) {
      const from = previous[metric];
      const to = page[metric];
      if (typeof from !== 'number' || typeof to !== 'number') continue;
      if (metric !== 'tbt' && (!from || !to)) continue;
      const delta = to - from;
      if (Math.abs(delta) < SHIFT_FLOOR[metric]) continue;
      if (Math.abs(delta) < from * SHIFT_FRACTION) continue;
      out.push({ path: page.path, metric, from, to, delta });
    }

    const fromCls = previous.cls;
    const toCls = page.cls;
    if (typeof fromCls === 'number' && typeof toCls === 'number') {
      const delta = Number((toCls - fromCls).toFixed(4));
      if (Math.abs(delta) >= MIN_CLS_SHIFT) {
        out.push({ path: page.path, metric: 'cls', from: fromCls, to: toCls, delta });
      }
    }
  }
  return out;
}

function pullNumber(subject) {
  const hit = /\(#(\d+)\)\s*$/.exec(String(subject ?? ''));
  return hit ? Number(hit[1]) : null;
}

function blameLine(release, moved) {
  if (!release) return null;
  const worse = moved.filter((shift) => shift.delta > 0);
  if (worse.length === 0) return null;

  const who = release.sha ? release.sha.slice(0, 7) : release.release;
  const pull = pullNumber(release.subject);
  const named = pull ? `PR #${pull}` : who;
  const parts = worse.map((shift) =>
    shift.metric === 'cls'
      ? `${shift.metric.toUpperCase()} by ${shift.delta.toFixed(3)} on ${shift.path}`
      : `${shift.metric.toUpperCase()} by ${Math.round(shift.delta)}ms on ${shift.path}`,
  );
  return `${named} increased ${parts.join(', ')}`;
}

async function alertConfig() {
  const env = await readFile('/etc/amitista/alerts.env', 'utf8').catch(() => '');
  const from = (name) =>
    process.env[name] ||
    env.match(new RegExp(`^\\s*(?:export\\s+)?${name}=["']?([^"'\\n]+)`, 'm'))?.[1] ||
    '';
  return { url: from('ALERT_URL'), token: from('ALERT_TOKEN'), webhook: from('ALERT_WEBHOOK') };
}

async function alert(summary) {
  const { url, token, webhook } = await alertConfig();

  if (url && token) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ summary }),
    }).catch((error) => {
      process.stderr.write(`perf-monitor: could not reach the alert relay: ${error.message}\n`);
      return null;
    });
    if (response && response.ok) return;
    if (response) {
      process.stderr.write(`perf-monitor: the alert relay answered ${response.status}\n`);
    }
  }

  if (webhook) {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `**amitista.com performance**\n${summary}` }),
    }).catch(() => process.stderr.write('perf-monitor: could not send the alert\n'));
    return;
  }

  process.stderr.write(`perf-monitor: no alert destination, so this went undelivered:\n${summary}\n`);
}

async function main() {
  const throttle = Boolean(argOf('--slow'));
  const rebase = Boolean(argOf('--rebaseline'));
  const dryRun = Boolean(argOf('--dry-run'));

  const profile = throttle ? 'slow-4g-4x-cpu' : 'broadband';
  const baseline = await readJson(BASELINE, null);
  const comparable = baseline?.profile === profile ? baseline.pages : null;
  const release = await liveRelease();

  const history = await readRuns();
  const before = release
    ? history
        .filter(
          (entry) =>
            entry.profile === profile &&
            entry.release?.release &&
            entry.release.release !== release.release,
        )
        .at(-1)
    : null;

  const quiet = await waitForQuiet();

  const chrome = spawn(CHROMIUM, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    'about:blank',
  ], { stdio: 'ignore' });

  let pages = [];
  let invariants = [];
  let samples = 1;
  try {
    const cdp = await Cdp.connect(await browserEndpoint());
    const pass = async () => {
      const out = [];
      for (const path of ROUTES) out.push(await measure(cdp, path, { throttle }));
      return out;
    };

    const passes = [];
    for (let i = 0; i < Math.max(1, MEASURE_PASSES); i += 1) passes.push(await pass());
    invariants = await checkInvariants();
    pages = medianPages(passes);

    const suspect =
      overBudget(pages, profile).length > 0 ||
      regressions(pages, comparable, profile).length > 0 ||
      (before ? shifts(pages, before.pages).length > 0 : false);

    if (suspect && CONFIRM_PASSES > 0) {
      process.stdout.write(`\n  something moved — measuring ${CONFIRM_PASSES} more time(s) to be sure\n`);
      for (let i = 0; i < CONFIRM_PASSES; i += 1) passes.push(await pass());
      pages = medianPages(passes);
    }

    samples = passes.length;
  } finally {
    chrome.kill();
  }

  if (samples > 1) process.stdout.write(`\n  middle of ${samples} passes:\n`);
  for (const page of pages) {
    process.stdout.write(
      `  ${page.path.padEnd(22)} ttfb ${String(page.ttfb).padStart(4)}ms  ` +
        `fcp ${String(page.fcp).padStart(4)}ms  lcp ${String(page.lcp ?? '—').padStart(4)}ms  ` +
        `cls ${page.cls}  tasks ${page.longTaskMs}ms  ${(page.bytes / 1024).toFixed(0)}kB\n`,
    );
  }

  const problems = [
    ...invariants,
    ...overBudget(pages, profile),
    ...regressions(pages, comparable, profile),
  ];

  if (release) {
    process.stdout.write(
      `\n  release ${release.release}${
        release.sha
          ? ` — ${release.sha.slice(0, 7)} ${release.subject ?? ''}`
          : ' — no commit recorded for it'
      }\n`,
    );
  }

  const moved = before ? shifts(pages, before.pages) : [];

  const run = {
    at: new Date().toISOString(),
    profile,
    release,
    samples,
    load: quiet.load,
    pages,
    problems,
    since: before ? { release: before.release, at: before.at } : null,
    shifts: moved,
  };

  const blamed = blameLine(release, moved);
  if (blamed) process.stdout.write(`\n  ${blamed}\n`);

  if (!dryRun) {
    await mkdir(STATE, { recursive: true });
    await writeFile(HISTORY, `${JSON.stringify(run)}\n`, { flag: 'a' });

    if (history.length + 1 > KEEP_RUNS) {
      const kept = [...history, run].slice(-KEEP_RUNS);
      const tmp = `${HISTORY}.tmp`;
      await writeFile(tmp, kept.map((entry) => `${JSON.stringify(entry)}\n`).join(''));
      await rename(tmp, HISTORY);
    }

    if (rebase || !baseline) {
      const tmp = `${BASELINE}.tmp`;
      await writeFile(tmp, `${JSON.stringify(run, null, 2)}\n`);
      await rename(tmp, BASELINE);
      process.stdout.write(`\n  baseline written to ${BASELINE}\n`);
    }
  }

  if (!problems.length) {
    process.stdout.write('\n  ok — every page inside budget, every optimisation still in place\n');
    return;
  }

  const summary = [
    ...(blamed ? [`${blamed}`, ''] : []),
    ...problems.map((p) => `• ${p}`),
  ].join('\n');
  process.stderr.write(`\n${summary}\n`);
  if (!dryRun && !rebase) await alert(summary);
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`perf-monitor: ${error.message}\n`);
  process.exitCode = 2;
});
