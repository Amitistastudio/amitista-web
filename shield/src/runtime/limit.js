'use strict';

const { matches } = require('../feed');

// Event-loop saturation is measured as timer drift rather than from a delay
// histogram. A histogram's mean and percentiles both dilute a stall across
// every idle sample in the window, so a 400ms freeze inside one second reads as
// ~16ms. Drift is the live value, and the smoothing below means one GC pause
// does not trip shedding while sustained overload ramps into it within a second.
function createLagSampler(intervalMs) {
  const state = { lagMs: 0 };
  let last = process.hrtime.bigint();

  const timer = setInterval(() => {
    const now = process.hrtime.bigint();
    const drift = Number(now - last) / 1e6 - intervalMs;
    last = now;
    state.lagMs = (state.lagMs * 0.7) + (Math.max(0, drift) * 0.3);
  }, intervalMs);

  if (typeof timer.unref === 'function') timer.unref();
  state.stop = () => clearInterval(timer);
  return state;
}

const DEFAULTS = {
  windowMs: 60_000,
  max: 120,
  sensitiveMax: 10,
  burstWindowMs: 1_000,
  burstMax: 20,
  concurrency: 24,
  maxKeys: 20_000,
  blockMs: 60_000,
  maxBlockMs: 60 * 60_000,
  lagThresholdMs: 250,
  lagSampleMs: 100,
  sheddingFactor: 0.35,
  trustProxy: false,
  // Everything above is per client. A credential-stuffing run that rotates
  // addresses never reaches any of those limits — each address sends three
  // requests and leaves — while the endpoint itself sees a rate it has never
  // seen in its life. This is the ceiling for a sensitive route across all
  // clients at once, and it is what makes a distributed attempt visible.
  distributedWindowMs: 60_000,
  distributedMax: 300,
  distributedMinClients: 20,
  // Reported, not refused, unless it is switched on. The finding is about the
  // endpoint rather than about the client in front of you, so enforcing it
  // turns somebody else's attack into a locked door for every real user trying
  // to sign in — which is a decision for the operator, not a default.
  distributedEnforce: false,
};

// Endpoints where a low limit is almost always right, because the legitimate
// rate is a handful per minute and the attack is credential stuffing.
const SENSITIVE = /(^|\/)(login|signin|sign-in|register|signup|sign-up|auth|token|password|reset|forgot|verify|otp|2fa|mfa)(\/|$)/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Without this, /users/1 and /users/2 are separate buckets and the key store
// grows with traffic — turning the limiter into its own memory exhaustion bug.
function normalizePath(path) {
  return path.split('/').map((segment) => {
    if (!segment) return segment;
    if (/^\d+$/.test(segment)) return ':id';
    if (UUID.test(segment)) return ':uuid';
    if (segment.length > 24) return ':val';
    return segment;
  }).join('/');
}

class Bounded {
  constructor(limit) {
    this.map = new Map();
    this.limit = limit;
  }

  get(key) {
    const entry = this.map.get(key);
    if (entry !== undefined) {
      this.map.delete(key);
      this.map.set(key, entry);
    }
    return entry;
  }

  set(key, entry) {
    if (this.map.size >= this.limit && !this.map.has(key)) {
      this.map.delete(this.map.keys().next().value);
    }
    this.map.set(key, entry);
    return entry;
  }

  get size() {
    return this.map.size;
  }
}

const LOOPBACK = /^(?:127\.|::1$|::ffff:127\.)/;

// An IPv6 client is routinely handed a whole /64. Bucketing on the full address
// means the same machine can present a fresh "client" for every request it
// makes, so the prefix is the honest unit for a rate limit.
function normalizeClient(address) {
  if (typeof address !== 'string' || !address) return 'unknown';
  const text = address.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (mapped) return mapped[1];
  if (!text.includes(':')) return text;

  const [head] = text.split('%');
  if (head === '::1') return head;
  const groups = head.split(':');
  // A compressed address that is already shorter than a /64 is used as it is.
  if (groups.includes('') && groups.length <= 4) return head;
  return `${groups.slice(0, 4).join(':')}::/64`;
}

// trustProxy accepts true (take the leftmost forwarded address), a number of
// proxies to count back from the right — the form that cannot be spoofed by a
// client appending its own header — or a function.
function forwardedAddress(req, trustProxy) {
  const raw = req.headers && req.headers['x-forwarded-for'];
  if (typeof raw !== 'string' || !raw) return null;
  const chain = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (!chain.length) return null;
  if (typeof trustProxy === 'number' && trustProxy > 0) {
    return chain[Math.max(0, chain.length - trustProxy)] || null;
  }
  return chain[0];
}

function clientKey(req, trustProxy) {
  if (typeof trustProxy === 'function') {
    return normalizeClient(trustProxy(req) || 'unknown');
  }
  if (trustProxy) {
    const forwarded = forwardedAddress(req, trustProxy);
    if (forwarded) return normalizeClient(forwarded);
  }
  const direct = (req.socket && req.socket.remoteAddress) || req.ip || 'unknown';
  return normalizeClient(direct);
}

// Behind nginx with trustProxy off, every request in the world arrives from
// 127.0.0.1 and shares one bucket: the limit stops protecting anything and
// starts refusing everybody at once. It is a configuration mistake that looks
// exactly like a working limiter from the outside, so it is said out loud.
function warnAboutProxy(req) {
  const direct = (req.socket && req.socket.remoteAddress) || '';
  if (!LOOPBACK.test(String(direct))) return false;
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (typeof forwarded !== 'string' || !forwarded) return false;
  process.stderr.write(
    '[shield] every request is arriving from the loopback address with X-Forwarded-For set, '
    + 'so this process is behind a proxy and the rate limiter is bucketing the whole internet '
    + 'into one client. Set rateLimit.trustProxy (true, or the number of proxies in front of you).\n',
  );
  return true;
}

// Two-bucket weighted sliding window: O(1) memory per key, and no burst at the
// boundary the way a plain fixed window has.
function rate(entry, now, windowMs) {
  const start = Math.floor(now / windowMs) * windowMs;
  if (entry.start !== start) {
    entry.prev = entry.start === start - windowMs ? entry.count : 0;
    entry.count = 0;
    entry.start = start;
  }
  const elapsed = (now - start) / windowMs;
  return entry.prev * (1 - elapsed) + entry.count;
}

function createLimiter(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const routes = config.routes || {};
  const windows = new Bounded(config.maxKeys);
  const clients = new Bounded(config.maxKeys);
  const routeTotals = new Bounded(512);
  let warned = false;

  // lagSource lets a host feed its own health signal in place of timer drift,
  // and makes the shedding path deterministic under test.
  const sampler = config.lagSource ? null : createLagSampler(config.lagSampleMs);
  const currentLag = () => (config.lagSource ? config.lagSource() : sampler.lagMs);

  function loadFactor() {
    return currentLag() > config.lagThresholdMs ? config.sheddingFactor : 1;
  }

  function limitFor(method, path) {
    const key = `${method} ${path}`;
    if (routes[key]) return routes[key];
    if (routes[path]) return routes[path];
    if (SENSITIVE.test(path) || matches('sensitivePaths', path)) {
      return { max: config.sensitiveMax, windowMs: config.windowMs };
    }
    return { max: config.max, windowMs: config.windowMs };
  }

  function client(key) {
    return clients.get(key) || clients.set(key, {
      inflight: 0, blockedUntil: 0, strikes: 0, burstStart: 0, burstCount: 0,
    });
  }

  function reject(id, severity, detail, retryAfterMs, extra = {}) {
    return {
      id,
      severity,
      detail,
      retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      sink: 'rate-limit',
      at: 'request',
      ...extra,
    };
  }

  function penalise(record, now, key) {
    record.strikes += 1;
    const duration = Math.min(config.blockMs * (2 ** (record.strikes - 1)), config.maxBlockMs);
    record.blockedUntil = now + duration;
    // Counting is per process and stays that way — sharing it would mean a
    // network round trip on the hot path of every request. A decision is worth
    // sharing though, and it is one message rather than one per request, so a
    // deployment with several workers can fan blocks out over whatever bus it
    // already has and have them apply everywhere.
    if (typeof config.onBlock === 'function' && key) {
      try {
        config.onBlock(key, record.blockedUntil, duration);
      } catch {
        // an operator's callback must not break the request it was told about
      }
    }
    return duration;
  }

  // The other side of onBlock: what a process does when it hears that another
  // one blocked somebody. Also usable on its own to block a client by hand.
  function block(key, ms) {
    const record = client(normalizeClient(key));
    const until = Date.now() + Math.max(0, ms);
    if (until > record.blockedUntil) record.blockedUntil = until;
    return record.blockedUntil;
  }

  const blockedUntil = (key) => {
    const record = clients.get(normalizeClient(key));
    return record ? record.blockedUntil : 0;
  };

  // One bucket per sensitive route, shared by every client. Distinct clients are
  // counted rather than requests alone, so a busy login page with real users
  // behind it does not read the same as three hundred addresses trying once.
  function distributed(path, ip, now) {
    const entry = routeTotals.get(path) || routeTotals.set(path, { start: 0, count: 0, clients: new Set() });
    if (now - entry.start > config.distributedWindowMs) {
      entry.start = now;
      entry.count = 0;
      entry.clients = new Set();
    }
    entry.count += 1;
    if (entry.clients.size < 4_000) entry.clients.add(ip);
    return entry;
  }

  function check(req, now = Date.now()) {
    if (!warned && !config.trustProxy) warned = warnAboutProxy(req);

    const ip = clientKey(req, config.trustProxy);
    const record = client(ip);

    if (record.blockedUntil > now) {
      return reject('rate-block', 'high',
        'client is temporarily blocked after repeatedly exceeding its rate limit',
        record.blockedUntil - now, { fragment: ip });
    }

    if (record.inflight >= config.concurrency) {
      return reject('concurrency', 'medium',
        `client already has ${record.inflight} requests in flight`, 1_000, { fragment: ip });
    }

    if (now - record.burstStart > config.burstWindowMs) {
      record.burstStart = now;
      record.burstCount = 0;
    }
    record.burstCount += 1;
    if (record.burstCount > config.burstMax) {
      const duration = penalise(record, now, ip);
      return reject('burst', 'high',
        `client sent ${record.burstCount} requests in under ${config.burstWindowMs}ms`,
        duration, { fragment: ip });
    }

    const path = normalizePath(req.path || req.url || '/');
    const sensitive = SENSITIVE.test(path) || matches('sensitivePaths', path);

    if (sensitive) {
      const total = distributed(path, ip, now);
      if (total.count > config.distributedMax && total.clients.size >= config.distributedMinClients) {
        return reject('distributed-abuse', 'high',
          `${path} has taken ${total.count} requests from ${total.clients.size} different clients `
          + `in under ${config.distributedWindowMs}ms, which is the shape of a credential-stuffing run `
          + 'rather than of people signing in',
          config.distributedWindowMs,
          {
            fragment: path,
            limit: config.distributedMax,
            window: config.distributedWindowMs,
            enforce: config.distributedEnforce,
          });
      }
    }

    const { max, windowMs } = limitFor(req.method, path);
    const shed = loadFactor();
    const effective = Math.max(1, Math.floor(max * shed));

    const key = `${ip}|${req.method} ${path}`;
    const entry = windows.get(key) || windows.set(key, { start: 0, count: 0, prev: 0 });
    const used = rate(entry, now, windowMs);

    if (used >= effective) {
      const duration = penalise(record, now, ip);
      return reject('rate-limit', shed < 1 ? 'medium' : 'high',
        shed < 1
          ? `rate limit reduced to ${effective}/${windowMs}ms while the event loop is saturated`
          : `client exceeded ${effective} requests per ${windowMs}ms on ${req.method} ${path}`,
        Math.min(duration, windowMs),
        { fragment: ip, limit: effective, window: windowMs });
    }

    entry.count += 1;
    record.inflight += 1;

    return {
      ok: true,
      ip,
      limit: effective,
      remaining: Math.max(0, effective - Math.ceil(used) - 1),
      reset: Math.ceil((entry.start + windowMs - now) / 1000),
      release() {
        const current = clients.get(ip);
        if (current && current.inflight > 0) current.inflight -= 1;
      },
    };
  }

  function stop() {
    if (sampler) sampler.stop();
  }

  return {
    check, stop, config, normalizePath, block, blockedUntil,
    lag: currentLag,
    size: () => windows.size + clients.size,
  };
}

module.exports = {
  createLimiter, normalizePath, normalizeClient, clientKey, DEFAULTS, SENSITIVE,
};
