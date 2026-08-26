'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

const MIN_LENGTH = 4;
const MAX_VALUES = 512;
const MAX_DEPTH = 6;

const IGNORED_HEADERS = new Set([
  'accept', 'accept-encoding', 'accept-language', 'connection', 'cache-control',
  'upgrade-insecure-requests', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site',
  'sec-fetch-user', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'dnt', 'te',
]);

// Fields a multipart parser hangs off req.file / req.files. The bytes are not
// taint — a file's *contents* reaching a sink is a different problem — but the
// caller-chosen name around them is, and it is the part that ends up in a path.
const FILE_FIELDS = ['originalname', 'filename', 'fieldname', 'path', 'mimetype', 'name', 'type'];

const BASE64 = /^[A-Za-z0-9+/_-]{12,}={0,2}$/;
const PRINTABLE = /^[\x20-\x7e\s]+$/;

// A value is only taint if it survives into the sink recognisably. Percent- and
// base64-encoding are the two transformations that routinely happen *between*
// the request and the sink — a route that decodes its own input would otherwise
// pass a payload no taint value matches. Anything further (hashing, parsing and
// re-serialising, template compilation) still breaks the link; that is stated in
// the limits rather than guessed at here.
function decodeVariants(value) {
  const out = [value];

  let current = value;
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      out.push(decoded);
      current = decoded;
    } catch {
      // malformed percent-encoding is itself request data; the raw form still counts
      break;
    }
  }

  if (value.length % 4 === 0 && BASE64.test(value)) {
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      if (decoded.length >= MIN_LENGTH && PRINTABLE.test(decoded)) out.push(decoded);
    } catch {
      // not base64 after all
    }
  }

  return out;
}

function collect(value, out, depth = 0) {
  if (out.size >= MAX_VALUES || depth > MAX_DEPTH) return out;

  if (typeof value === 'string') {
    if (value.length >= MIN_LENGTH) {
      for (const variant of decodeVariants(value)) {
        if (variant.length >= MIN_LENGTH) out.add(variant);
      }
    }
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) collect(item, out, depth + 1);
    return out;
  }

  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) collect(value[key], out, depth + 1);
  }

  return out;
}

// The cookie header arrives as one string. Collecting only that string means a
// sink holding a single cookie's value never matches it — `text.includes(value)`
// is asking whether the whole header is inside one small argument — so every
// cookie-borne payload was invisible. The pairs are split out here instead.
function collectCookieHeader(header, out) {
  if (typeof header !== 'string' || !header) return;
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    collect(pair.slice(eq + 1).trim(), out);
  }
}

function collectFile(file, out) {
  if (!file || typeof file !== 'object') return;
  for (const field of FILE_FIELDS) collect(file[field], out);
}

function collectFiles(files, out) {
  if (!files) return;
  if (Array.isArray(files)) {
    for (const file of files) collectFile(file, out);
    return;
  }
  if (typeof files !== 'object') return;
  for (const key of Object.keys(files)) {
    const entry = files[key];
    if (Array.isArray(entry)) for (const file of entry) collectFile(file, out);
    else collectFile(entry, out);
  }
}

// req.params only holds what the matched route declared. A handler that reads
// req.path itself — a catch-all, a static-ish file route, a proxy — is holding
// caller-controlled text that nothing else in this function would have added.
// Segments only, never the joined path: a value that begins with "/" would
// match the absolute-path rule inside any longer path that merely contains it,
// and turn every route into a finding about itself.
function collectPath(req, out) {
  const raw = typeof req.path === 'string' ? req.path : String(req.url || '').split('?')[0];
  if (!raw) return;
  for (const segment of raw.split('/')) collect(segment, out);
}

function requestTaint(req) {
  const out = new Set();
  collect(req.params, out);
  collect(req.query, out);
  collect(req.body, out);
  collect(req.cookies, out);
  collect(req.signedCookies, out);
  collectFile(req.file, out);
  collectFiles(req.files, out);
  collectPath(req, out);

  const headers = req.headers || {};
  for (const key of Object.keys(headers)) {
    const name = key.toLowerCase();
    if (IGNORED_HEADERS.has(name)) continue;
    if (name === 'cookie') {
      collectCookieHeader(headers[key], out);
      continue;
    }
    collect(headers[key], out);
  }

  return out;
}

// The taint set is walked on every filesystem, shell, database and outbound
// call the request makes, so the walk itself has to be cheap. Sorting once per
// request by length, longest first, means the first hit is already the most
// specific one and the scan stops there instead of always running to the end.
const SORTED = Symbol('shield.sorted');

function sortedTaint(taint) {
  const cached = taint[SORTED];
  if (cached && cached.size === taint.size) return cached.list;
  const list = [...taint].filter((value) => value.length >= MIN_LENGTH)
    .sort((a, b) => b.length - a.length);
  Object.defineProperty(taint, SORTED, {
    value: { size: taint.size, list }, configurable: true, writable: true, enumerable: false,
  });
  return list;
}

// Returns the longest request-derived substring present in `text`, or null.
// Longest wins so the reported fragment is the most specific one.
function taintedPart(text, taint) {
  if (typeof text !== 'string' || text.length < MIN_LENGTH) return null;
  for (const value of sortedTaint(taint)) {
    if (value.length > text.length) continue;
    if (text.includes(value)) return value;
  }
  return null;
}

const current = () => storage.getStore() || null;

function run(context, fn) {
  return storage.run(context, fn);
}

// AsyncLocalStorage follows await and callbacks, but not a job queue, a worker,
// or a listener registered once at startup and fired later. Work handed across
// one of those boundaries runs with no request context, which makes every sink
// hook a no-op — silently. bind() captures the current context so the far side
// is still inspected, and is a no-op outside a request so it is safe to wrap
// anything with.
function bind(fn) {
  if (typeof fn !== 'function') return fn;
  const context = current();
  if (!context) return fn;
  return function bound(...args) {
    return storage.run(context, () => fn.apply(this, args));
  };
}

module.exports = { storage, run, current, bind, requestTaint, taintedPart, MIN_LENGTH };
