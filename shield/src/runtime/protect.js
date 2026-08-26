'use strict';

const { run, bind, requestTaint } = require('./context');
const { install, ShieldBlocked } = require('./hooks');
const { inspectRequest } = require('./shape');
const { createLimiter } = require('./limit');
const { selfTest, warning } = require('./selftest');
const { judgePath } = require('./detect');
const {
  inspectPayload, inspectText, judgeRedirect, judgeHtml, cookieFindings, hardenCookie,
  HTML_TYPE, JSON_TYPE,
} = require('./response');
const { createBaseline } = require('./baseline');
const { createDenial, newReference, BLOCK_PAGE } = require('./denial');
const { createFeed } = require('../feed/poll');
const { judge, registry: feedRegistry } = require('../feed');
const { applyFeedSinks } = require('./hooks');

// A reply large enough to stream is not worth reading in full to check it. The
// interesting part of an HTML page or a JSON document is at the front, and an
// unbounded check would turn every download into a scan of itself.
const MAX_STREAM_BYTES = 256 * 1024;

// Wraps the response object for this request only — no global patching, so the
// wrappers disappear with the request rather than living on the prototype.
function guardResponse(req, res, context, options) {
  const {
    leaks = true, xss = true, redirects = true, cookies = true, files = true,
    ...limits
  } = options;
  const secure = isSecure(req);

  // res.json delegates to res.send, which delegates to res.end. Without a mark
  // the same body would be judged three times and reported three times; with it
  // the outermost method that saw the body wins and the rest pass through.
  const state = { bodyChecked: false, bytes: 0 };

  const blockable = (finding) => {
    const entry = context.report(finding);
    return entry && context.mode === 'block'
      && (entry.severity === 'critical' || entry.severity === 'high');
  };

  // A refusal the handler caught and carried on from. Every method that can
  // finish a response asks this first, so "the app swallowed the exception" is
  // no longer the same thing as "the attack succeeded".
  const swallowed = () => (context.blocked && !context.denied
    ? { status: 400, reason: context.blocked.id }
    : null);

  const contentType = () => (typeof res.getHeader === 'function' ? res.getHeader('content-type') : null);

  const inspectCookieValue = (value) => {
    for (const finding of cookieFindings(value, secure)) context.report(finding);
    return Array.isArray(value)
      ? value.map((raw) => hardenCookie(raw, secure))
      : hardenCookie(value, secure);
  };

  if (cookies && typeof res.setHeader === 'function') {
    const setHeader = res.setHeader.bind(res);
    res.setHeader = function shieldedSetHeader(name, value) {
      if (!context.denied && String(name).toLowerCase() === 'set-cookie') {
        try {
          value = inspectCookieValue(value);
        } catch {
          // never let cookie inspection break a response
        }
      }
      return setHeader(name, value);
    };

    // A handler that writes its headers in one go never touches setHeader, so
    // the cookie check has to sit on this path too.
    if (typeof res.writeHead === 'function') {
      const writeHead = res.writeHead.bind(res);
      res.writeHead = function shieldedWriteHead(...args) {
        const headers = args[args.length - 1];
        if (!context.denied && headers && typeof headers === 'object' && !Array.isArray(headers)) {
          try {
            for (const key of Object.keys(headers)) {
              if (key.toLowerCase() !== 'set-cookie') continue;
              headers[key] = inspectCookieValue(headers[key]);
            }
          } catch {
            // as above
          }
        }
        return writeHead(...args);
      };
    }
  }

  if (redirects && typeof res.redirect === 'function') {
    const redirect = res.redirect.bind(res);
    res.redirect = function shieldedRedirect(...args) {
      const target = typeof args[args.length - 1] === 'string' ? args[args.length - 1] : null;
      try {
        const pending = swallowed();
        if (pending) return context.deny(pending);
        const finding = judgeRedirect(target, context.taint);
        if (finding && blockable(finding)) {
          return context.deny({ status: 400, reason: finding.id });
        }
      } catch {
        // fall through to the real redirect
      }
      return redirect(...args);
    };
  }

  // res.sendFile takes a path the way fs does, but the call never reaches a
  // patched fs method — express opens the file through its own send stream.
  if (files && typeof res.sendFile === 'function') {
    const sendFile = res.sendFile.bind(res);
    res.sendFile = function shieldedSendFile(...args) {
      try {
        const pending = swallowed();
        if (pending) return context.deny(pending);
        const finding = judgePath(args[0], context.taint, context.paths);
        if (finding && blockable({ ...finding, sink: 'res.sendFile', at: 'response' })) {
          return context.deny({ status: 400, reason: finding.id });
        }
      } catch {
        // fall through to the real sendFile
      }
      return sendFile(...args);
    };
  }

  const guardBody = (body) => {
    if (context.denied) return null;
    const pending = swallowed();
    if (pending) return pending;
    if (state.bodyChecked) return null;
    const type = contentType();

    // A Buffer is left to the chunk guard below, which can decode it. Marking
    // it checked here would mean res.send(Buffer) skips both paths and goes out
    // unread, which is how it behaved before.
    if (Buffer.isBuffer(body)) return null;
    state.bodyChecked = true;

    if (leaks && body && typeof body === 'object') {
      let refused = false;
      for (const finding of inspectPayload(body, limits)) {
        if (blockable(finding)) refused = true;
      }
      if (refused) return { status: 500, error: 'Response withheld', reason: 'data-exposure' };
    }

    if (typeof body === 'string') {
      if (xss) {
        const finding = judgeHtml(body, context.taint, type);
        if (finding && blockable(finding)) return { status: 400, reason: finding.id };
      }
      // A body that is a JSON string is the same reply res.json would have
      // sent, and used to skip the leak check purely because of how it was
      // handed over.
      if (leaks) {
        let refused = false;
        for (const finding of inspectText(body, type, limits)) {
          if (blockable(finding)) refused = true;
        }
        if (refused) return { status: 500, error: 'Response withheld', reason: 'data-exposure' };
      }
    }

    return null;
  };

  if (leaks && typeof res.json === 'function') {
    const json = res.json.bind(res);
    res.json = function shieldedJson(body) {
      try {
        const verdict = guardBody(body);
        if (verdict) return context.deny(verdict);
      } catch {
        // never let leak inspection break a response
      }
      return json(body);
    };

    if (typeof res.jsonp === 'function') {
      const jsonp = res.jsonp.bind(res);
      res.jsonp = function shieldedJsonp(body) {
        try {
          const verdict = guardBody(body);
          if (verdict) return context.deny(verdict);
        } catch {
          // as above
        }
        return jsonp(body);
      };
    }
  }

  if ((xss || leaks) && typeof res.send === 'function') {
    const send = res.send.bind(res);
    res.send = function shieldedSend(body) {
      try {
        const verdict = guardBody(body);
        if (verdict) return context.deny(verdict);
      } catch {
        // fall through to the real send
      }
      return send(body);
    };
  }

  // Everything above is express. A handler that writes the socket itself — a
  // template stream, a proxied upstream, res.end(JSON.stringify(row)) — reaches
  // none of it, which is where reflected markup and leaked fields were getting
  // out unseen. Headers are often already on the wire by the time a chunk
  // arrives, so this path always reports and refuses only while it still can.
  const guardChunk = (chunk) => {
    if (context.denied) return null;
    const pending = swallowed();
    if (pending) return pending;
    if (state.bodyChecked) return null;
    if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk)) return null;
    if (state.bytes >= MAX_STREAM_BYTES) return null;

    const type = String(contentType() || '');
    const html = HTML_TYPE.test(type);
    const json = JSON_TYPE.test(type);
    if (!html && !json) return null;

    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    state.bytes += text.length;

    if (xss && html) {
      const finding = judgeHtml(text, context.taint, type);
      if (finding && blockable(finding)) return { status: 400, reason: finding.id };
    }
    if (leaks && json) {
      let refused = false;
      for (const finding of inspectText(text, type, limits)) {
        if (blockable(finding)) refused = true;
      }
      if (refused) return { status: 500, error: 'Response withheld', reason: 'data-exposure' };
    }
    return null;
  };

  for (const name of ['write', 'end']) {
    if (typeof res[name] !== 'function') continue;
    const original = res[name].bind(res);
    res[name] = function shieldedChunk(...args) {
      try {
        const verdict = guardChunk(args[0]);
        if (verdict && !res.headersSent) {
          state.bodyChecked = true;
          return context.deny(verdict);
        }
      } catch {
        // fall through to the real write
      }
      return original(...args);
    };
  }
}

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-DNS-Prefetch-Control': 'off',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const HISTORY_LIMIT = 500;
const history = [];
const limiters = new Set();
const baselines = new Set();

// findings() is a ring buffer, so on a busy process the oldest lines are gone
// by the time anyone looks. Totals are kept separately and never roll: an
// operator asking "has this been happening all week?" should not get an answer
// shaped by how big the buffer is, and a cap that quietly drops history is
// exactly the kind of silence this package is supposed to avoid.
const counters = {
  reported: 0,
  blocked: 0,
  suppressed: 0,
  dropped: 0,
  byId: Object.create(null),
  bySeverity: Object.create(null),
};

let uninstall = null;
let lastSelfTest = null;
let feed = null;
let timeoutHintShown = false;

// Node's out-of-the-box server timeouts leave a slowloris holding a socket for
// five minutes. harden() fixes it in one line, but only if somebody calls it,
// and an unhardened server looks identical to a hardened one from inside a
// request. Said once, with the fix in it.
function hintAboutTimeouts(req) {
  if (timeoutHintShown) return;
  const server = req.socket && req.socket.server;
  if (!server) return;
  timeoutHintShown = true;
  if (server.requestTimeout !== 300_000 && server.headersTimeout !== 60_000) return;
  process.stderr.write(
    '[shield] this server still has node\'s default header and request timeouts '
    + '(60s and 300s), so a client can hold a socket open for five minutes without '
    + 'sending anything. Wrap it once at startup: shield.harden(app.listen(port)).\n',
  );
}

// One poller per process, however many times protect() is mounted. A second
// mount adopts the first one's feed rather than opening its own: two timers
// fetching the same document would double the traffic for nothing, and the two
// could disagree about the accepted serial.
function ensureFeed(options, mode) {
  if (feed || options === false) return feed;
  feed = createFeed({
    mode,
    ...(options === true || options == null ? {} : options),
    onUpdate(applied) {
      // New sinks are only useful once they are actually patched in. Modules
      // the app has not loaded yet are caught by the loader hook instead.
      const installed = applyFeedSinks();
      const added = Object.entries(applied.added).map(([kind, n]) => `${n} ${kind}`).join(', ');
      process.stderr.write(
        `[shield] rules updated — serial ${applied.serial}, ruleset ${applied.ruleset ?? 'n/a'}`
        + `${added ? `, added ${added}` : ', no additions'}`
        + `${installed ? `, ${installed} sink${installed === 1 ? '' : 's'} patched` : ''}\n`,
      );
      // A published policy switching a defence off is the one thing in this
      // package that makes it do less than it was doing a moment ago, and the
      // operator whose app it is deserves to see it in their own log rather
      // than have to go and ask an endpoint.
      if (applied.disabled.length) {
        process.stderr.write(`[shield] published policy has disabled: ${applied.disabled.join(', ')}\n`);
      }
      for (const [id, severity] of Object.entries(applied.severity)) {
        process.stderr.write(`[shield] published policy re-graded ${id} to ${severity}\n`);
      }
      for (const bad of applied.rejected) {
        process.stderr.write(`[shield] refused a published rule (${bad.reason}): ${String(bad.source).slice(0, 80)}\n`);
      }
    },
  });
  feed.start();
  return feed;
}

// Hooks go in as soon as the package is required, not when the middleware is
// mounted. A route file that does `const { exec } = require('child_process')`
// captures the reference at require time, so patching later would miss it.
// This is safe to do eagerly: every hook is a no-op outside a request context,
// so nothing is inspected or blocked until protect() is actually mounted.
function ensureInstalled() {
  if (!uninstall) uninstall = install();
}

function isSecure(req) {
  if (req.secure) return true;
  const proto = req.headers && req.headers['x-forwarded-proto'];
  return typeof proto === 'string' && proto.split(',')[0].trim() === 'https';
}

function applyHeaders(req, res) {
  if (typeof res.setHeader !== 'function') return;
  try {
    for (const [name, value] of Object.entries(BASE_HEADERS)) res.setHeader(name, value);
    if (isSecure(req)) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (typeof res.removeHeader === 'function') res.removeHeader('X-Powered-By');
  } catch {
    // headers already sent — nothing to do
  }
}

function defaultReporter(finding) {
  process.stderr.write(
    `[shield] ${finding.blocked ? 'BLOCKED' : 'flagged'} ${finding.severity} ${finding.id} `
    + `on ${finding.method} ${finding.path}\n`
    + `         ${finding.detail}\n`
    + `         at: ${finding.call || finding.sink}   ${JSON.stringify(finding.fragment)}\n`
    + (finding.reference ? `         reference: ${finding.reference}\n` : ''),
  );
}

// Slowloris and header-flood defence. These live on the http.Server, not on any
// middleware, because the attack never reaches a route handler.
function harden(server, options = {}) {
  const {
    headersTimeout = 20_000,
    requestTimeout = 60_000,
    keepAliveTimeout = 5_000,
    maxHeadersCount = 100,
  } = options;

  server.headersTimeout = headersTimeout;
  server.requestTimeout = requestTimeout;
  server.keepAliveTimeout = keepAliveTimeout;
  server.maxHeadersCount = maxHeadersCount;
  return server;
}

function protect(options = {}) {
  const {
    mode = 'monitor',
    headers = true,
    onFinding = defaultReporter,
    ignore = () => false,
    rateLimit = {},
    shape = {},
    response = {},
    learn = {},
    verify = true,
    blockPage = BLOCK_PAGE,
    feed: feedOptions = {},
    // Where this application's files legitimately live. Declaring it turns the
    // filesystem rule from "does this look like traversal" into "does this
    // resolve inside the directory you named", which is the question that
    // actually has a right answer.
    paths = null,
  } = options;

  if (mode !== 'monitor' && mode !== 'block') {
    throw new Error(`shield: mode must be "monitor" or "block", got "${mode}"`);
  }

  ensureInstalled();
  ensureFeed(feedOptions, mode);

  if (verify) {
    selfTest().then((report) => {
      lastSelfTest = report;
      if (!report.healthy) process.stderr.write(warning(report));
    }).catch(() => {});
  }

  const limiter = rateLimit === false ? null : createLimiter(rateLimit);
  if (limiter) limiters.add(limiter);

  const denial = createDenial({ blockPage });

  const baseline = learn === false ? null : createBaseline(learn);
  if (baseline) {
    baselines.add(baseline);
    void baseline.load();
  }

  const pathOptions = typeof paths === 'string' || Array.isArray(paths)
    ? { root: paths }
    : paths;

  return function shield(req, res, next) {
    if (headers) applyHeaders(req, res);
    if (verify) hintAboutTimeouts(req);

    let cachedTaint = null;
    let cachedBody;
    let reference = null;
    const findings = [];

    const context = {
      mode,
      req,
      findings,
      paths: pathOptions,
      // The finding a sink hook threw on, kept even if the handler catches it.
      blocked: null,
      // Set the moment a refusal starts writing. The response guards below wrap
      // res.end and res.write, and the refusal is written through those same
      // methods — without this flag the denial body would be inspected as if it
      // were the application's own, and a second refusal could be attempted on
      // top of the first.
      denied: false,
      // One reference per request, not per finding: a visitor who trips three
      // rules on the same request quotes one code, and the operator finds all
      // three lines under it.
      get reference() {
        if (!reference) reference = newReference();
        return reference;
      },
      deny(verdict) {
        context.denied = true;
        return denial(req, res, { ...verdict, reference: context.reference });
      },
      // Lazy so it does not matter whether a body parser runs before or after
      // this middleware; the set is rebuilt if the body is populated later.
      get taint() {
        if (!cachedTaint || cachedBody !== req.body) {
          cachedTaint = requestTaint(req);
          cachedBody = req.body;
        }
        return cachedTaint;
      },
      report(finding) {
        // The one place the published policy is applied. Every finding in the
        // package — request shape, rate limit, runtime sink, response guard,
        // baseline — arrives here before it is reported or acted on, so a rule
        // that policy has turned off is off everywhere at once, and a re-graded
        // one carries its new severity into the block decision as well as into
        // the log. Callers must honour a null return; it means suppressed.
        const severity = judge(finding.id, finding.severity);
        if (!severity) {
          counters.suppressed += 1;
          return null;
        }

        const entry = {
          ...finding,
          severity,
          blocked: mode === 'block',
          method: req.method,
          path: req.originalUrl || req.url,
          time: new Date().toISOString(),
        };
        if (mode === 'block') entry.reference = context.reference;
        if (ignore(entry, req)) {
          counters.suppressed += 1;
          return null;
        }
        findings.push(entry);
        history.push(entry);
        if (history.length > HISTORY_LIMIT) {
          history.shift();
          counters.dropped += 1;
        }

        counters.reported += 1;
        if (entry.blocked) counters.blocked += 1;
        counters.byId[entry.id] = (counters.byId[entry.id] || 0) + 1;
        counters.bySeverity[entry.severity] = (counters.bySeverity[entry.severity] || 0) + 1;
        try {
          onFinding(entry, req);
        } catch {
          // a broken reporter must not break the request
        }
        return entry;
      },
    };

    if (res.locals) res.locals.shield = context;

    if (response !== false) guardResponse(req, res, context, response);

    if (limiter) {
      const verdict = limiter.check(req);
      if (!verdict.ok) {
        // Suppressed means suppressed: if policy has turned the limit rule off,
        // the request is not refused either. Blocking on a finding that was
        // never reported would leave an operator with a 429 and nothing in the
        // log explaining it.
        const entry = context.report(verdict);
        // A verdict may report without refusing — the endpoint-wide one does,
        // because the client in front of you is not the one it is about.
        if (entry && mode === 'block' && verdict.enforce !== false) {
          try {
            res.setHeader('Retry-After', String(verdict.retryAfter));
          } catch {
            // headers already sent
          }
          return context.deny({
            status: 429,
            error: 'Too many requests',
            reason: verdict.id,
            retryAfter: verdict.retryAfter,
          });
        }
      } else {
        try {
          res.setHeader('RateLimit-Limit', String(verdict.limit));
          res.setHeader('RateLimit-Remaining', String(verdict.remaining));
          res.setHeader('RateLimit-Reset', String(verdict.reset));
        } catch {
          // headers already sent
        }
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          verdict.release();
        };
        res.once('finish', release);
        res.once('close', release);
      }
    }

    if (shape !== false) {
      const shapeFindings = inspectRequest(req, shape);
      let blocking = null;
      for (const finding of shapeFindings) {
        const entry = context.report(finding);
        if (entry && !blocking && (entry.severity === 'critical' || entry.severity === 'high')) {
          blocking = entry;
        }
      }
      if (mode === 'block' && blocking) {
        return context.deny({ status: 400, reason: blocking.id });
      }
    }

    if (baseline) {
      // Judge before observing. On a route that has not matured yet observe()
      // is what builds the profile; once it has, observe() is a no-op and the
      // profile can no longer be widened by the traffic it is judging.
      let deviation = null;
      for (const finding of baseline.judge(req)) {
        const entry = context.report(finding);
        if (entry && !deviation && entry.severity === 'high') deviation = entry;
      }

      // Learning is deferred to the end of the request so the decision can take
      // the runtime and response layers into account. A request that tripped a
      // real rule is an attack, and teaching the profile that an attack is the
      // normal shape of this route is how a young baseline gets poisoned into
      // permanent silence.
      let learned = false;
      const learnFrom = () => {
        if (learned) return;
        learned = true;
        const attack = findings.some((entry) => entry.severity === 'critical' || entry.severity === 'high');
        if (!attack) baseline.observe(req);
      };
      res.once('finish', learnFrom);
      res.once('close', learnFrom);

      // Baseline enforcement is the highest false-positive risk in the package,
      // so it stays off even in block mode until it is explicitly turned on.
      if (mode === 'block' && baseline.enforce && deviation) {
        return context.deny({ status: 400, reason: deviation.id });
      }
    }

    return run(context, next);
  };
}

// The runtime hooks throw from inside the route handler, so the refusal is
// shaped here rather than in the middleware. res.locals.shield carries the
// request's own reference; without it — a handler that lost res.locals — a
// fresh one is minted so the visitor still has something to quote.
function errorHandler(options = {}) {
  const denial = createDenial({ blockPage: options.blockPage ?? BLOCK_PAGE });

  return function shieldErrorHandler(err, req, res, next) {
    if (!(err instanceof ShieldBlocked)) return next(err);
    if (res.headersSent) return next(err);

    const context = res.locals && res.locals.shield;
    const verdict = { status: 400, reason: err.finding.id };
    if (context && typeof context.deny === 'function') return context.deny(verdict);
    return denial(req, res, verdict);
  };
}

const findings = () => [...history];

// Totals since the process started, unaffected by the ring buffer. `dropped` is
// how many findings have aged out of findings() — if it is not zero, what you
// are reading is a window and not the whole story.
const stats = () => ({
  ...counters,
  byId: { ...counters.byId },
  bySeverity: { ...counters.bySeverity },
  held: history.length,
  historyLimit: HISTORY_LIMIT,
});

const clear = () => {
  history.length = 0;
  counters.reported = 0;
  counters.blocked = 0;
  counters.suppressed = 0;
  counters.dropped = 0;
  counters.byId = Object.create(null);
  counters.bySeverity = Object.create(null);
};

// Block a client everywhere this process is limiting, which is also how a
// deployment with several workers applies a block one of the others decided on.
function block(key, ms = 60_000) {
  let applied = 0;
  for (const limiter of limiters) {
    limiter.block(key, ms);
    applied += 1;
  }
  return applied;
}

function stop() {
  for (const limiter of limiters) limiter.stop();
  limiters.clear();
  for (const baseline of baselines) void baseline.save();
  baselines.clear();
  if (feed) {
    feed.stop();
    feed = null;
  }
  if (uninstall) {
    uninstall();
    uninstall = null;
  }
}

module.exports = {
  protect, errorHandler, harden, findings, stats, clear, stop, selfTest, bind, block,
  health: () => lastSelfTest,
  baselines: () => [...baselines].map((b) => b.stats()),
  feed: () => (feed ? feed.status() : { enabled: false, ...feedRegistry.summary() }),
  refreshFeed: () => (feed ? feed.refresh() : Promise.resolve(null)),
  ShieldBlocked, applyHeaders, install: ensureInstalled,
  BLOCK_PAGE, newReference,
};
