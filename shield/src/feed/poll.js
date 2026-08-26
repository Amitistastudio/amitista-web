'use strict';

const https = require('node:https');
const { URL } = require('node:url');
const { randomBytes } = require('node:crypto');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { open, Rejected, MAX_ENVELOPE_BYTES } = require('./document');
const registry = require('./registry');
const { FEED_URL } = require('./keys');
const { version: PACKAGE_VERSION } = require('../../package.json');

const DEFAULTS = {
  enabled: true,
  url: FEED_URL,
  intervalMs: 6 * 60 * 60 * 1000,
  timeoutMs: 5_000,
  dir: '.shield',
  file: 'feed.json',
  policy: true,
};

// A poll that fails must never be louder than the thing it was protecting. The
// backoff exists so an app that cannot reach the feed — offline build agent,
// egress-filtered container, amitista.com down — spends almost nothing on
// retrying, and so a feed outage does not turn into a synchronised retry storm
// from every install at once.
const MIN_INTERVAL_MS = 5 * 60 * 1000;
const BACKOFF_START_MS = 60 * 1000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;

// The request is deliberately not made with global fetch. shield patches that
// global, and an app is free to replace it with something of its own; the one
// request in this package that must behave predictably should not go through
// either. node:https is also the only way to bound the response size while it
// is still arriving rather than after it has all been buffered.
// The install id is a random local string and nothing else — no hostname, no
// path, no package list. It exists so the feed can say "42 installs on 0.4.2,
// two of them still on ruleset 3" instead of guessing from addresses, which
// collapse behind NAT and change under autoscaling. It is written beside the
// feed cache; a read-only working directory simply means the install stays
// anonymous, which is why nothing here throws.
const INSTALL_ID_FILE = 'install.json';
const INSTALL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,63}$/;

function loadInstallId(dir, supplied) {
  if (supplied === false) return null;
  if (typeof supplied === 'string' && INSTALL_ID_PATTERN.test(supplied)) return supplied;

  const path = join(dir, INSTALL_ID_FILE);
  try {
    const held = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof held.id === 'string' && INSTALL_ID_PATTERN.test(held.id)) return held.id;
  } catch {
    // No id yet, or an unreadable one. Mint a fresh one below.
  }

  const minted = `sh-${randomBytes(8).toString('hex')}`;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, `${JSON.stringify({ id: minted }, null, 2)}\n`);
  } catch {
    // Not persisted, so the next restart looks like a new install. Still better
    // than nothing for a running fleet.
  }
  return minted;
}

function get(url, { timeoutMs, etag, installId, mode }) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      reject(new Error(`feed url is not a url: ${url}`));
      return;
    }
    // Plain HTTP is refused rather than downgraded to. The signature means an
    // interceptor cannot forge rules, but it can see which installs are asking
    // and stall the connection, and there is no reason to allow either.
    if (target.protocol !== 'https:') {
      reject(new Error('feed url must be https'));
      return;
    }

    const headers = { accept: 'application/json', 'user-agent': `@amitista/shield/${PACKAGE_VERSION}` };
    if (etag) headers['if-none-match'] = etag;
    if (installId) headers['x-shield-install'] = installId;
    if (mode) headers['x-shield-mode'] = mode;
    headers['x-shield-version'] = PACKAGE_VERSION;

    const request = https.get(target, { headers, timeout: timeoutMs }, (response) => {
      const status = response.statusCode;

      if (status === 304) {
        response.resume();
        resolve({ notModified: true });
        return;
      }
      // Redirects are not followed. The feed lives at a URL this package pins a
      // key for; a 3xx is a sign something is wrong with the deployment, not an
      // instruction worth obeying.
      if (status !== 200) {
        response.resume();
        reject(new Error(`feed responded ${status}`));
        return;
      }

      let size = 0;
      const chunks = [];
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_ENVELOPE_BYTES) {
          request.destroy();
          reject(new Error('feed body is larger than the envelope limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        resolve({ body: Buffer.concat(chunks).toString('utf8'), etag: response.headers.etag || null });
      });
      response.on('error', reject);
    });

    request.on('timeout', () => {
      request.destroy(new Error(`feed did not answer within ${timeoutMs}ms`));
    });
    request.on('error', reject);
  });
}

function createFeed(options = {}) {
  const settings = { ...DEFAULTS, ...(options === true ? {} : options) };
  const intervalMs = Math.max(MIN_INTERVAL_MS, Number(settings.intervalMs) || DEFAULTS.intervalMs);
  const cachePath = join(settings.dir, settings.file);
  const installId =
    settings.enabled === false ? null : loadInstallId(settings.dir, settings.installId);

  const status = {
    enabled: settings.enabled !== false,
    url: settings.url,
    serial: 0,
    source: null,
    lastAttempt: null,
    lastSuccess: null,
    lastError: null,
    rejectedRules: [],
    polls: 0,
    failures: 0,
  };

  let timer = null;
  let etag = null;
  let stopped = false;
  let backoff = BACKOFF_START_MS;

  const record = (verified, source) => {
    const applied = registry.apply(verified, { policy: settings.policy !== false, source });
    status.serial = applied.serial;
    status.source = source;
    status.rejectedRules = applied.rejected;
    return applied;
  };

  // Read synchronously and before the first request is served. Doing this
  // asynchronously would leave a window where the app is already answering
  // traffic under weaker rules than it has sitting on disk, and that window is
  // exactly the moment after a restart when nobody is watching.
  function loadCache() {
    let raw;
    try {
      raw = readFileSync(cachePath, 'utf8');
    } catch {
      return null;
    }
    try {
      const cached = JSON.parse(raw);
      etag = typeof cached.etag === 'string' ? cached.etag : null;
      const verified = open(cached.envelope, {
        serial: 0,
        packageVersion: PACKAGE_VERSION,
      });
      return record(verified, 'cache');
    } catch (error) {
      // A cache that no longer verifies is not an emergency and not worth
      // keeping: an expired document, a rotated-out key, or an upgrade that
      // changed the format all land here. Built-in rules carry on.
      status.lastError = error.reason || error.message;
      return null;
    }
  }

  function saveCache(envelope) {
    try {
      mkdirSync(settings.dir, { recursive: true });
      writeFileSync(cachePath, `${JSON.stringify({ etag, envelope }, null, 2)}\n`);
    } catch {
      // A read-only or missing working directory costs the restart shortcut,
      // nothing else.
    }
  }

  async function refresh() {
    status.lastAttempt = new Date().toISOString();
    status.polls += 1;

    const result = await get(settings.url, {
      timeoutMs: settings.timeoutMs,
      etag,
      installId,
      mode: settings.mode,
    });
    if (result.notModified) {
      status.lastSuccess = status.lastAttempt;
      status.lastError = null;
      return null;
    }

    const verified = open(result.body, {
      serial: registry.serial,
      packageVersion: PACKAGE_VERSION,
    });

    etag = result.etag;
    const applied = record(verified, 'network');
    saveCache(result.body);
    status.lastSuccess = status.lastAttempt;
    status.lastError = null;
    return applied;
  }

  function schedule(delay) {
    if (stopped) return;
    // Jitter so a fleet that restarted together does not stay in lockstep and
    // arrive as one spike every interval.
    const jittered = delay * (0.9 + Math.random() * 0.2);
    timer = setTimeout(tick, jittered);
    // Never hold the process open. A short-lived script that happens to import
    // shield must still exit on its own.
    if (typeof timer.unref === 'function') timer.unref();
  }

  async function tick() {
    try {
      const applied = await refresh();
      backoff = BACKOFF_START_MS;
      if (applied && typeof settings.onUpdate === 'function') {
        try {
          settings.onUpdate(applied);
        } catch {
          // a broken callback must not stop the next poll
        }
      }
      schedule(intervalMs);
    } catch (error) {
      status.failures += 1;
      status.lastError = error.reason || error.message;
      // Fail open, always. Whatever went wrong — no network, a bad signature, a
      // replayed serial — the rules already in force stay in force and the app
      // keeps serving. A security package that stops working when its vendor is
      // unreachable has made itself the outage.
      if (error instanceof Rejected && typeof settings.onReject === 'function') {
        try {
          settings.onReject(error);
        } catch {
          // as above
        }
      }
      backoff = Math.min(BACKOFF_MAX_MS, backoff * 2);
      schedule(backoff);
    }
  }

  function start() {
    if (!status.enabled || timer || stopped) return status;
    loadCache();
    // A small delay rather than an immediate call, so importing shield never
    // adds a network round trip to process startup.
    schedule(2_000);
    return status;
  }

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  return {
    start,
    stop,
    refresh,
    loadCache,
    status: () => ({ ...status, installId, ...registry.summary() }),
  };
}

module.exports = { createFeed, DEFAULTS, MIN_INTERVAL_MS };
