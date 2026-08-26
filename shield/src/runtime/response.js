'use strict';

const { taintedPart } = require('./context');
const { match } = require('../feed');

// Everything here watches what leaves the process, which is a different problem
// from what arrives. A route can be perfectly safe from injection and still hand
// a caller the password hash it selected with SELECT *.

const SECRET_KEYS = /^(password|passwd|pwd|pass|password_?hash|hashed_?password|password_?digest|salt|secret|api_?key|apikey|access_?token|refresh_?token|id_?token|bearer_?token|private_?key|secret_?key|signing_?key|encryption_?key|client_?secret|session_?token|session_?id|csrf_?secret|otp_?secret|totp_?secret|mfa_?secret|recovery_?codes?|backup_?codes?|reset_?token|verification_?token|invite_?token|ssn|social_?security|tax_?id|passport_?number|iban|routing_?number|account_?number|card_?number|cardnumber|cvv|cvc|pin)$/i;

const HASH_VALUE = /^\$(?:2[aby]|argon2(?:id|i|d)|scrypt|pbkdf2[^$]*|6|5|1)\$/;
const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/;
const AWS_KEY = /\bAKIA[0-9A-Z]{16}\b/;
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/;
const CARD = /\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13}|6(?:011|5\d{2})\d{12})\b/;

const MARKUP = /<\s*\/?\s*(?:script|iframe|img|svg|object|embed|link|style|body|meta)\b|javascript:|\bon(?:error|load|click|mouseover|focus|animationstart)\s*=/i;

const HTML_TYPE = /text\/html|application\/xhtml/i;
const JSON_TYPE = /application\/(?:[\w.+-]+\+)?json/i;

const DEFAULTS = {
  maxDepth: 12,
  maxNodes: 20_000,
  maxArray: 1_000,
  maxFindings: 8,
  // Parsing a JSON string back into an object to inspect it is worth doing, but
  // not at any size: past this the reply is a bulk export and the parse costs
  // more than the check is worth.
  maxParseBytes: 1 << 20,
};

function luhn(digits) {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = digits.charCodeAt(i) - 48;
    if (alternate) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function valueFinding(value, path) {
  if (typeof value !== 'string' || value.length < 8) return null;
  if (HASH_VALUE.test(value)) {
    return { kind: 'password-hash', severity: 'critical', detail: 'a password hash is being returned to the caller' };
  }
  if (PRIVATE_KEY.test(value)) {
    return { kind: 'private-key', severity: 'critical', detail: 'a private key block is being returned to the caller' };
  }
  if (AWS_KEY.test(value)) {
    return { kind: 'cloud-key', severity: 'critical', detail: 'a cloud access key is being returned to the caller' };
  }
  if (JWT_VALUE.test(value) && !/^(?:authorization|token|access_?token)$/i.test(path.split('.').pop() || '')) {
    return { kind: 'token', severity: 'high', detail: 'a signed token is embedded in the response body' };
  }
  const card = CARD.exec(value.replace(/[ -]/g, ''));
  if (card && luhn(card[0])) {
    return { kind: 'card-number', severity: 'critical', detail: 'a value passing the card-number checksum is being returned' };
  }
  const published = match('responseValues', value);
  if (published) {
    return {
      kind: published.id,
      severity: published.severity,
      detail: published.detail || `a value matching the published signature "${published.label}" is being returned to the caller`,
    };
  }
  return null;
}

function inspectPayload(body, options = {}) {
  const limits = { ...DEFAULTS, ...options };
  const findings = [];
  let nodes = 0;
  const seen = new WeakSet();

  const visit = (value, path, depth) => {
    if (findings.length >= limits.maxFindings || depth > limits.maxDepth || nodes > limits.maxNodes) return;
    nodes += 1;

    if (typeof value === 'string') {
      const hit = valueFinding(value, path);
      if (hit) {
        findings.push({
          id: 'data-exposure', severity: hit.severity, label: hit.kind,
          detail: hit.detail, fragment: path || '(root)', sink: 'response', at: 'response',
        });
      }
      return;
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length && i < limits.maxArray; i += 1) visit(value[i], `${path}[${i}]`, depth + 1);
      return;
    }

    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    for (const key of Object.keys(value)) {
      const here = path ? `${path}.${key}` : key;
      // A secret-shaped name holding nothing is not a leak. Reporting
      // { password: null } — which is what a serialiser that strips the field
      // leaves behind — trains the reader to skim past this rule, and it is too
      // important a rule to make boring.
      if (SECRET_KEYS.test(key) && value[key] !== null && value[key] !== undefined
        && value[key] !== '' && value[key] !== false) {
        findings.push({
          id: 'data-exposure', severity: 'critical', label: `${key} in response`,
          detail: `the response contains a field named "${key}". Strip it before sending, or select columns explicitly instead of selecting everything.`,
          fragment: here, sink: 'response', at: 'response',
        });
        continue;
      }
      visit(value[key], here, depth + 1);
    }
  };

  visit(body, '', 0);
  return findings;
}

// res.json is not the only way a JSON body leaves. res.send(JSON.stringify(row))
// and a raw res.end(payload) produce exactly the same reply and used to skip the
// leak check entirely, so a string that is really a document is parsed back and
// inspected as one.
function inspectText(text, contentType, options = {}) {
  const limits = { ...DEFAULTS, ...options };
  if (typeof text !== 'string' || text.length > limits.maxParseBytes) return [];

  const trimmed = text.trimStart();
  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (!looksJson) return [];
  if (contentType && !JSON_TYPE.test(String(contentType)) && !/^\s*[[{]/.test(text)) return [];

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  return inspectPayload(parsed, options);
}

function judgeRedirect(target, taint) {
  if (typeof target !== 'string' || !target) return null;
  const fragment = taintedPart(target, taint);
  if (!fragment) return null;

  const external = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(target.trim());
  if (!external) return null;

  return {
    id: 'open-redirect', severity: 'high', label: 'redirect to a caller-supplied host',
    detail: 'the caller chose an absolute redirect target, so this endpoint can be used to send your users to another site under your domain’s name.',
    fragment, sink: 'res.redirect', at: 'response',
  };
}

// Request data landing between <script> and </script> needs no angle bracket of
// its own to be an injection — it is already in a code context, and `";alert(1)//`
// is enough. Checking only for markup missed every one of those.
function inScriptContext(body, index) {
  const before = body.slice(0, index).toLowerCase();
  const open = before.lastIndexOf('<script');
  if (open === -1) return false;
  return before.lastIndexOf('</script') < open;
}

function judgeHtml(body, taint, contentType) {
  if (typeof body !== 'string' || !body) return null;
  const looksHtml = HTML_TYPE.test(contentType || '') || /^\s*<(?:!doctype|html|div|p|h\d|span|body)\b/i.test(body);
  if (!looksHtml) return null;

  const fragment = taintedPart(body, taint);
  if (!fragment) return null;

  if (MARKUP.test(fragment)) {
    return {
      id: 'xss', severity: 'high', label: 'request data reflected as markup',
      detail: 'text from this request is being written into an HTML response with tags or an event handler still in it. Escape it, or send it as JSON instead.',
      fragment: fragment.slice(0, 80), sink: 'res.send', at: 'response',
    };
  }

  if (inScriptContext(body, body.indexOf(fragment)) && /["'`;<]|\$\{/.test(fragment)) {
    return {
      id: 'xss', severity: 'high', label: 'request data reflected inside a script',
      detail: 'text from this request is being written into a <script> block, where it is code rather than content. Serialise it with JSON.stringify into a data attribute, or send it as JSON instead.',
      fragment: fragment.slice(0, 80), sink: 'res.send', at: 'response',
    };
  }

  return null;
}

const SESSION_COOKIE = /^(?:.*(?:session|sess|sid|auth|token|jwt|login|remember).*|connect\.sid)$/i;

function cookieFindings(header, secure) {
  const values = Array.isArray(header) ? header : [header];
  const findings = [];

  for (const raw of values) {
    if (typeof raw !== 'string') continue;
    const name = raw.split('=')[0].trim();
    if (!SESSION_COOKIE.test(name)) continue;

    const missing = [];
    if (!/;\s*httponly/i.test(raw)) missing.push('HttpOnly');
    if (secure && !/;\s*secure/i.test(raw)) missing.push('Secure');
    if (!/;\s*samesite/i.test(raw)) missing.push('SameSite');
    if (!missing.length) continue;

    findings.push({
      id: 'insecure-cookie', severity: missing.includes('HttpOnly') ? 'high' : 'medium',
      label: `session cookie missing ${missing.join(', ')}`,
      detail: `the cookie "${name}" looks like a session cookie. Without ${missing.join(' and ')} it can be read by injected script or sent from another site.`,
      fragment: name, sink: 'set-cookie', at: 'response',
    });
  }

  return findings;
}

// Secure and SameSite are safe to add to a session cookie. HttpOnly is not
// added automatically: an application that reads its own cookie from script
// would break, and silently breaking the host app is worse than the warning.
function hardenCookie(raw, secure) {
  if (typeof raw !== 'string') return raw;
  const name = raw.split('=')[0].trim();
  if (!SESSION_COOKIE.test(name)) return raw;

  let out = raw;
  if (!/;\s*samesite/i.test(out)) out += '; SameSite=Lax';
  if (secure && !/;\s*secure/i.test(out)) out += '; Secure';
  return out;
}

module.exports = {
  inspectPayload, inspectText, judgeRedirect, judgeHtml, cookieFindings, hardenCookie,
  luhn, SECRET_KEYS, SESSION_COOKIE, DEFAULTS, JSON_TYPE, HTML_TYPE,
};
