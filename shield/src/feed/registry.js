'use strict';

const { compile } = require('./regex');

// The live ruleset, held in one place so the rule modules stay as they are:
// each one keeps its own built-in constants and asks here for anything the feed
// has added on top. Nothing in this file replaces a built-in rule — a feed can
// only ever lengthen a list. That is deliberate. A feed that could *shorten*
// one would mean an attacker who reached the signing key could quietly delete
// the command-injection rule from every install, and the packages would keep
// reporting themselves as healthy while defending nothing.
//
// Turning a rule off is possible, but only through `policy` below, and only in
// a way that is visible in health() and logged when it happens.

const SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

// Every judge the runtime already has. A feed can point a new module or method
// at one of these, but it cannot describe new *behaviour* — only new places to
// apply behaviour that shipped in the package and was reviewed with it.
const SINK_KINDS = new Set(['command', 'argv', 'path', 'path2', 'sql', 'url']);

const state = {
  version: 0,
  serial: 0,
  ruleset: null,
  issued: null,
  expires: null,
  keyId: null,
  source: null,
  policyEnabled: true,
  detections: empty(),
  policy: { disabled: new Set(), severity: new Map() },
  rejected: [],
};

function empty() {
  return {
    secretPatterns: [],
    responseValues: [],
    shellMeta: [],
    sqlMeta: [],
    pathPatterns: [],
    urlSchemes: [],
    internalHosts: [],
    queryOperators: [],
    pollutionKeys: [],
    sensitivePaths: [],
    sinks: [],
    sqlDrivers: [],
  };
}

// Merged lists are rebuilt only when the feed changes, not per request. The
// cache is keyed by the built-in array itself, so two callers passing different
// built-ins for the same kind cannot collide.
const cache = new Map();

function merged(kind, builtins) {
  let entry = cache.get(builtins);
  if (entry && entry.version === state.version) return entry.value;
  const added = state.detections[kind] || [];
  const value = added.length ? builtins.concat(added) : builtins;
  entry = { version: state.version, value };
  cache.set(builtins, entry);
  return value;
}

// Same idea for the two Sets the shape layer uses. A Set is copied rather than
// mutated so the module's own constant is never altered — a test that clears
// the feed must get the original behaviour back exactly.
function mergedSet(kind, builtins) {
  let entry = cache.get(builtins);
  if (entry && entry.version === state.version) return entry.value;
  const added = state.detections[kind] || [];
  const value = added.length ? new Set([...builtins, ...added]) : builtins;
  entry = { version: state.version, value };
  cache.set(builtins, entry);
  return value;
}

// ---------------------------------------------------------------------------
// Parsing. Every entry is validated on its own and a bad one is dropped with a
// reason rather than failing the document: a single malformed rule in a feed
// should cost that rule, not the fifty good ones published beside it.
// ---------------------------------------------------------------------------

function patternList(raw, rejected, { needsIdentity }) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, 200)) {
    if (!item || typeof item !== 'object') continue;
    const re = compile(item.re, item.flags, rejected);
    if (!re) continue;
    if (!needsIdentity) {
      out.push(re);
      continue;
    }
    if (typeof item.id !== 'string' || !item.id) {
      rejected.push({ source: item.re, reason: 'no rule id' });
      continue;
    }
    if (!SEVERITIES.has(item.severity)) {
      rejected.push({ source: item.re, reason: `severity ${JSON.stringify(item.severity)} is not one of the four` });
      continue;
    }
    out.push({
      id: item.id,
      severity: item.severity,
      label: typeof item.label === 'string' ? item.label : item.id,
      detail: typeof item.detail === 'string' ? item.detail : null,
      re,
    });
  }
  return out;
}

function stringList(raw, limit = 200) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value) => typeof value === 'string' && value && value.length <= 128).slice(0, limit);
}

function sinkList(raw, rejected) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, 200)) {
    if (!item || typeof item !== 'object') continue;
    const { module: mod, method, kind } = item;
    if (typeof mod !== 'string' || !mod || mod.length > 128) {
      rejected.push({ source: String(mod), reason: 'sink has no usable module' });
      continue;
    }
    if (typeof method !== 'string' || !method || method.length > 64) {
      rejected.push({ source: mod, reason: 'sink has no usable method' });
      continue;
    }
    if (!SINK_KINDS.has(kind)) {
      rejected.push({ source: `${mod}.${method}`, reason: `sink kind ${JSON.stringify(kind)} is not one this package implements` });
      continue;
    }
    out.push({ module: mod, method, kind, path: stringList(item.path, 8) });
  }
  return out;
}

function parsePolicy(raw, rejected) {
  const disabled = new Set();
  const severity = new Map();
  if (!raw || typeof raw !== 'object') return { disabled, severity };

  for (const id of stringList(raw.disabled, 200)) disabled.add(id);

  const overrides = raw.severity;
  if (overrides && typeof overrides === 'object') {
    for (const [id, value] of Object.entries(overrides).slice(0, 200)) {
      if (!SEVERITIES.has(value)) {
        rejected.push({ source: id, reason: `severity override ${JSON.stringify(value)} is not one of the four` });
        continue;
      }
      severity.set(id, value);
    }
  }
  return { disabled, severity };
}

// ---------------------------------------------------------------------------

// Applies a document that document.js has already verified. Returns a summary
// so the caller can log what actually changed rather than that a poll happened.
function apply(verified, options = {}) {
  const { policy: policyEnabled = true, source = 'feed' } = options;
  const { document, serial, expires, keyId } = verified;
  const rejected = [];
  const raw = document.detections && typeof document.detections === 'object' ? document.detections : {};

  const detections = {
    secretPatterns: patternList(raw.secretPatterns, rejected, { needsIdentity: true }),
    responseValues: patternList(raw.responseValues, rejected, { needsIdentity: true }),
    pathPatterns: patternList(raw.pathPatterns, rejected, { needsIdentity: true }),
    shellMeta: patternList(raw.shellMeta, rejected, { needsIdentity: false }),
    sqlMeta: patternList(raw.sqlMeta, rejected, { needsIdentity: false }),
    urlSchemes: patternList(raw.urlSchemes, rejected, { needsIdentity: false }),
    internalHosts: patternList(raw.internalHosts, rejected, { needsIdentity: false }),
    sensitivePaths: patternList(raw.sensitivePaths, rejected, { needsIdentity: false }),
    queryOperators: stringList(raw.queryOperators),
    pollutionKeys: stringList(raw.pollutionKeys),
    sinks: sinkList(raw.sinks, rejected),
    sqlDrivers: sinkList(raw.sqlDrivers, rejected),
  };

  // A customer can take the detections and refuse the policy. Someone running
  // shield in block mode may reasonably want new rules automatically but not
  // want a remote party able to switch one of their defences off.
  const policy = policyEnabled
    ? parsePolicy(document.policy, rejected)
    : { disabled: new Set(), severity: new Map() };

  state.version += 1;
  state.serial = serial;
  state.ruleset = Number.isFinite(document.ruleset) ? document.ruleset : null;
  state.issued = document.issued || null;
  state.expires = new Date(expires).toISOString();
  state.keyId = keyId;
  state.source = source;
  state.policyEnabled = policyEnabled;
  state.detections = detections;
  state.policy = policy;
  state.rejected = rejected;

  return summary();
}

// Drops back to built-ins only. Used when a cached document has expired and no
// fresh one can be fetched — the package keeps working on the rules it shipped
// with rather than on a stale snapshot of somebody else's intent.
function reset() {
  state.version += 1;
  state.serial = 0;
  state.ruleset = null;
  state.issued = null;
  state.expires = null;
  state.keyId = null;
  state.source = null;
  state.detections = empty();
  state.policy = { disabled: new Set(), severity: new Map() };
  state.rejected = [];
}

function counts() {
  const out = {};
  for (const [kind, list] of Object.entries(state.detections)) {
    if (list.length) out[kind] = list.length;
  }
  return out;
}

function summary() {
  return {
    serial: state.serial,
    ruleset: state.ruleset,
    issued: state.issued,
    expires: state.expires,
    keyId: state.keyId,
    source: state.source,
    policyEnabled: state.policyEnabled,
    added: counts(),
    disabled: [...state.policy.disabled],
    severity: Object.fromEntries(state.policy.severity),
    rejected: state.rejected,
  };
}

// The policy chokepoint. Every finding in the package passes through here on
// its way to being reported, so this is the only place that needs to know a
// rule can be turned off or re-graded.
function judge(id, severity) {
  if (state.policy.disabled.has(id)) return null;
  const override = state.policy.severity.get(id);
  return override || severity;
}

const hasPolicy = () => state.policy.disabled.size > 0 || state.policy.severity.size > 0;

module.exports = {
  apply,
  reset,
  summary,
  judge,
  hasPolicy,
  merged,
  mergedSet,
  patterns: (kind) => state.detections[kind] || [],
  get version() { return state.version; },
  get serial() { return state.serial; },
  SEVERITIES,
  SINK_KINDS,
};
