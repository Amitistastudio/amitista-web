'use strict';

const { randomBytes } = require('node:crypto');

// A refused request has two audiences that want completely different things.
// A program wants a status code and a reason string it can branch on. A person
// sitting in a browser wants to be told what happened, that it may be a
// mistake, and who to write to. Both get the same reference, so the visitor
// quoting "AMS-4F2A-9C71" can be matched against the line in the log.

const BLOCK_PAGE = 'https://amitista.com/block';

const HTML_ACCEPT = /\btext\/html\b|\bapplication\/xhtml\+xml\b/i;

function newReference() {
  const raw = randomBytes(4).toString('hex').toUpperCase();
  return `AMS-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

// Only a document navigation is worth redirecting. A fetch() gets Accept: */*,
// and anything with sec-fetch-dest set to something other than "document" is a
// subresource — sending an image tag or an XHR to a full HTML page just turns
// one clear failure into a confusing one.
function wantsPage(req) {
  const headers = (req && req.headers) || {};
  if (headers['x-requested-with']) return false;

  const dest = headers['sec-fetch-dest'];
  if (typeof dest === 'string' && dest !== 'document') return false;

  const accept = headers.accept;
  return typeof accept === 'string' && HTML_ACCEPT.test(accept);
}

function withQuery(base, params) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  if (!query) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${query}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]
  ));
}

function setHeaderSafely(res, name, value) {
  try {
    res.setHeader(name, value);
  } catch {
    // headers already sent — the request is being refused either way
  }
}

// Written with the raw node response rather than res.status().json(), so the
// same code path works on a plain http server, and so a refusal never travels
// back through the res.json wrapper that guardResponse installed.
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  setHeaderSafely(res, 'Content-Type', 'application/json; charset=utf-8');
  setHeaderSafely(res, 'Content-Length', Buffer.byteLength(payload));
  return res.end(payload);
}

function sendPage(req, res, url, reference) {
  res.statusCode = 303;
  setHeaderSafely(res, 'Location', url);
  setHeaderSafely(res, 'Content-Type', 'text/html; charset=utf-8');

  if (req && req.method === 'HEAD') return res.end();

  const note = reference ? ` Reference ${escapeHtml(reference)}.` : '';
  return res.end(
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<title>Blocked by Amitista Security</title>'
    + '<meta name="robots" content="noindex"></head><body>'
    + `<p>You have been blocked by Amitista Security.${note} `
    + `<a href="${escapeHtml(url)}">Continue</a></p></body></html>`,
  );
}

function createDenial(options = {}) {
  const { blockPage = BLOCK_PAGE } = options;

  return function deny(req, res, verdict = {}) {
    const {
      status = 400,
      error = 'Request rejected',
      reason = 'blocked',
      reference = newReference(),
      retryAfter,
    } = verdict;

    const url = blockPage
      ? withQuery(blockPage, { ref: reference, rule: reason, retry: retryAfter })
      : null;

    setHeaderSafely(res, 'Cache-Control', 'no-store');
    setHeaderSafely(res, 'X-Shield-Reference', reference);

    if (url && wantsPage(req)) return sendPage(req, res, url, reference);

    const body = { error, reason, reference };
    if (retryAfter !== undefined) body.retryAfter = retryAfter;
    if (url) body.page = url;
    return sendJson(res, status, body);
  };
}

module.exports = {
  createDenial, newReference, wantsPage, withQuery, BLOCK_PAGE,
};
