'use strict';

const { resolve, sep } = require('path');
const { taintedPart } = require('./context');
const { matches, match } = require('../feed');

const SHELL_META = /[;&|`$(){}<>\n\r]|\$\(|\|\||&&/;
const TRAVERSAL = /(^|[/\\])\.\.([/\\]|$)/;
const ABSOLUTE = /^([/\\]|[a-zA-Z]:[/\\])/;
const NULL_BYTE = /\0/;

const SQL_META = [
  /(^|[^\w])('|")\s*(or|and)\s/i,
  /\b(or|and)\b\s+['"\d]\s*=\s*['"\d]/i,
  /\bunion\b[\s\S]{0,40}\bselect\b/i,
  /--\s|#\s|\/\*/,
  /;\s*(drop|delete|update|insert|alter|truncate)\b/i,
  /\bsleep\s*\(|\bpg_sleep\s*\(|\bbenchmark\s*\(/i,
];

const PROTO_HOSTS = /^(file|gopher|dict|ftp|data):/i;
const INTERNAL_HOST = /^(127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|localhost$|\[::1\]|172\.(1[6-9]|2\d|3[01])\.)/i;

// Hosts that are not addresses but resolve inside the perimeter anyway. The
// cloud metadata names are the ones worth spelling out: reaching them is the
// single highest-value SSRF target on a hosted box.
const INTERNAL_NAME = /(^|\.)(local|internal|localdomain|localhost|home\.arpa)$|^metadata\.google\.internal$|^instance-data$/i;

// Mongo operators that take a *program* rather than a value. Everything else in
// a query object is data; these three are the ones where caller-supplied text
// becomes code the database runs.
const CODE_OPERATORS = new Set(['$where', '$function', '$accumulator', '$expr']);

const QUERY_OPERATOR = /^\$[a-z]/i;

function finding(id, severity, detail, fragment, sink) {
  return { id, severity, detail, fragment, sink, at: 'runtime' };
}

function judgeCommand(value, taint) {
  const text = typeof value === 'string' ? value : null;
  if (!text) return null;
  const fragment = taintedPart(text, taint);
  if (!fragment) return null;
  if (NULL_BYTE.test(fragment)) {
    return finding('command', 'critical', 'null byte in request data reaching a shell command', fragment, 'child_process');
  }
  if (SHELL_META.test(fragment)) {
    return finding('command', 'critical', 'request data carrying shell metacharacters reached a shell command', fragment, 'child_process');
  }
  if (matches('shellMeta', fragment)) {
    return finding('command', 'critical', 'request data matching a published command-injection signature reached a shell command', fragment, 'child_process');
  }
  return null;
}

// An argv array is not parsed by a shell, so metacharacters in it are harmless.
// What is not harmless is the caller deciding an argument *is a flag*: one
// tainted `--upload-pack=…` or `-o ProxyCommand=…` turns a safe execFile into
// the command injection the array form was supposed to prevent.
function judgeArgv(args, taint) {
  if (!Array.isArray(args)) return null;
  for (const arg of args) {
    if (typeof arg !== 'string') continue;
    const fragment = taintedPart(arg, taint);
    if (!fragment) continue;
    if (NULL_BYTE.test(fragment)) {
      return finding('command', 'high', 'null byte in a request-derived command argument', fragment, 'child_process');
    }
    if (arg.startsWith('-') && fragment.startsWith('-')) {
      return finding('command', 'high', 'request data chose a command-line option rather than a value', fragment, 'child_process');
    }
  }
  return null;
}

// A path is confined if it resolves inside one of the declared roots. Resolving
// is what makes this stronger than the syntax rules above it: a path assembled
// out of symlink-free pieces that never contains ".." can still land outside,
// and an application that declares where its files live gets that caught.
function confined(text, roots) {
  const resolved = resolve(text);
  return roots.some((root) => {
    const base = resolve(root);
    return resolved === base || resolved.startsWith(base.endsWith(sep) ? base : base + sep);
  });
}

function judgePath(value, taint, options = {}) {
  const text = typeof value === 'string' ? value : null;
  if (!text) return null;
  const fragment = taintedPart(text, taint);
  if (!fragment) return null;

  const roots = options && options.root
    ? (Array.isArray(options.root) ? options.root : [options.root])
    : null;

  if (NULL_BYTE.test(fragment)) {
    return finding('filesystem', 'critical', 'null byte in a request-derived path', fragment, 'fs');
  }
  if (roots && roots.length) {
    // With roots declared, confinement is the whole question — a path that
    // stays inside them is fine however it is spelled, and one that leaves is
    // a finding even when it contains nothing suspicious to look at. The
    // published signatures below still apply; the syntax rules do not, because
    // a "../" that lands back inside the root is not an escape.
    if (!confined(text, roots)) {
      return finding('filesystem', 'high',
        `request data built a path that resolves outside ${roots.join(', ')}`, fragment, 'fs');
    }
  } else if (TRAVERSAL.test(fragment)) {
    return finding('filesystem', 'high', 'request data containing a parent-directory segment reached a filesystem path', fragment, 'fs');
  }
  if (ABSOLUTE.test(fragment)) {
    return finding('filesystem', 'high', 'request data supplying an absolute path reached a filesystem call', fragment, 'fs');
  }
  const published = match('pathPatterns', fragment);
  if (published) {
    return finding(published.id, published.severity,
      published.detail || `request data matched the published path signature "${published.label}"`, fragment, 'fs');
  }
  return null;
}

// Drivers accept the statement either as a string or wrapped in a config object
// — pg's query({ text, values }) and mysql2's query({ sql, values }). Reading
// only args[0] as a string meant the object form was never judged at all, which
// is the form every connection-pool helper and query builder happens to use.
function sqlText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.sql === 'string') return value.sql;
    if (typeof value.query === 'string') return value.query;
  }
  return null;
}

function judgeSql(value, taint) {
  const text = sqlText(value);
  if (!text) return null;
  const fragment = taintedPart(text, taint);
  if (!fragment) return null;
  if (SQL_META.some((pattern) => pattern.test(fragment))) {
    return finding('sql', 'critical', 'request data carrying SQL control characters was concatenated into a query', fragment, 'database');
  }
  if (matches('sqlMeta', fragment)) {
    return finding('sql', 'critical', 'request data matching a published SQL-injection signature was concatenated into a query', fragment, 'database');
  }
  return null;
}

// Dotted-quad is only one of the ways to write an address. 2130706433,
// 0x7f000001 and 017700000001 are all 127.0.0.1 to a resolver, and were all
// external as far as a regex over the printed host was concerned.
function normalizeHost(host) {
  if (typeof host !== 'string' || !host) return null;
  let text = host.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (mapped) return mapped[1];

  if (/^\d+$/.test(text) || /^0x[0-9a-f]+$/.test(text) || /^0[0-7]+$/.test(text)) {
    let value = null;
    try {
      value = text.startsWith('0x') ? parseInt(text, 16)
        : text.startsWith('0') && text.length > 1 ? parseInt(text, 8)
          : parseInt(text, 10);
    } catch {
      value = null;
    }
    if (Number.isInteger(value) && value >= 0 && value <= 0xffffffff) {
      text = [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join('.');
    }
  }

  return text;
}

function internalHost(host) {
  const text = normalizeHost(host);
  if (!text) return false;
  if (INTERNAL_HOST.test(text) || INTERNAL_HOST.test(`[${text}]`)) return true;
  if (INTERNAL_NAME.test(text)) return true;
  if (text === '::1' || text === '::') return true;
  // Unique-local (fc00::/7) and link-local (fe80::/10) IPv6.
  if (/^f[cd][0-9a-f]{2}:/.test(text) || /^fe[89ab][0-9a-f]:/.test(text)) return true;
  if (/^0\d*\./.test(text)) return true;
  return matches('internalHosts', text);
}

function urlText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  if (value instanceof URL) return value.href;
  if (typeof value.url === 'string') return value.url;
  if (typeof value.href === 'string') return value.href;

  // http.request(options) — assembled back into a URL so one judge covers both
  // call shapes and the reported fragment still points at the caller's data.
  const host = value.hostname || value.host;
  if (typeof host === 'string' && host) {
    const protocol = typeof value.protocol === 'string' ? value.protocol : 'http:';
    const port = value.port ? `:${value.port}` : '';
    const path = typeof value.path === 'string' ? value.path : (value.pathname || '');
    return `${protocol}//${host}${port}${path}`;
  }
  return null;
}

function judgeUrl(value, taint) {
  const text = urlText(value);
  if (!text) return null;
  const fragment = taintedPart(text, taint);
  if (!fragment) return null;

  if (PROTO_HOSTS.test(text) || matches('urlSchemes', text)) {
    return finding('ssrf', 'critical', 'request data selected a non-HTTP scheme for an outbound request', fragment, 'fetch');
  }
  let host = null;
  try {
    host = new URL(text).hostname;
  } catch {
    return null;
  }
  if (internalHost(host)) {
    return finding('ssrf', 'high', 'request data pointed an outbound request at an internal address', fragment, 'fetch');
  }
  return null;
}

// vm and friends run whatever string they are handed. There is no such thing as
// a safe metacharacter here, so the presence of request data in the source is
// the whole finding.
function judgeCode(value, taint) {
  const text = typeof value === 'string' ? value : (value && typeof value.code === 'string' ? value.code : null);
  if (!text) return null;
  const fragment = taintedPart(text, taint);
  if (!fragment) return null;
  return finding('eval', 'critical', 'request data was compiled and run as program source', fragment, 'vm');
}

// Document-store queries are objects, so the string judges never saw them. Two
// things matter: caller data landing in an operator that takes code, and the
// caller having chosen the operator itself.
function judgeQuery(value, taint, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return null;

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);

  for (const [key, child] of entries) {
    if (CODE_OPERATORS.has(key)) {
      const code = typeof child === 'string' ? child
        : typeof child === 'function' ? child.toString() : null;
      if (code) {
        const fragment = taintedPart(code, taint);
        if (fragment) {
          return finding('nosql-operator', 'critical',
            `request data reached the "${key}" operator, which the database evaluates as code`, fragment, 'database');
        }
      }
    }
    if (QUERY_OPERATOR.test(key) && key.length >= 4 && taint.has(key)) {
      return finding('nosql-operator', 'high',
        `the caller supplied the query operator "${key}" itself`, key, 'database');
    }
    const nested = judgeQuery(child, taint, depth + 1);
    if (nested) return nested;
  }

  return null;
}

module.exports = {
  judgeCommand, judgeArgv, judgePath, judgeSql, judgeUrl, judgeCode, judgeQuery,
  internalHost, normalizeHost, sqlText, urlText,
  SHELL_META, TRAVERSAL, SQL_META,
};
