'use strict';

const { writeFile, readFile, mkdir } = require('node:fs/promises');
const { join } = require('node:path');
const { normalizePath } = require('./limit');

// Signatures describe attacks that are already known. A baseline describes this
// application, so it catches the request that is simply wrong for the endpoint:
// a field nobody has ever sent, a value that used to always be a number and is
// suddenly an object, an id that has only ever been digits and now holds a quote.

const CLASS_RANK = {
  empty: 0, digits: 1, hex: 2, uuid: 2, alpha: 2, alnum: 3, slug: 4, email: 4, path: 5, text: 6,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function charClass(value) {
  if (!value.length) return 'empty';
  if (/^\d+$/.test(value)) return 'digits';
  if (UUID_RE.test(value)) return 'uuid';
  if (/^[0-9a-f]+$/i.test(value) && value.length >= 8) return 'hex';
  if (/^[a-zA-Z]+$/.test(value)) return 'alpha';
  if (EMAIL_RE.test(value)) return 'email';
  if (/^[a-zA-Z0-9]+$/.test(value)) return 'alnum';
  if (/^[a-zA-Z0-9._-]+$/.test(value)) return 'slug';
  if (/^[a-zA-Z0-9._\-/]+$/.test(value)) return 'path';
  return 'text';
}

const MAX_FIELDS = 120;
const MAX_ROUTES = 400;
const MAX_ENUM = 12;
const ENUM_MIN_SAMPLES = 30;

function flatten(source, prefix, out, depth = 0) {
  if (!source || typeof source !== 'object' || depth > 4) return out;
  for (const key of Object.keys(source)) {
    if (out.size >= MAX_FIELDS) return out;
    const path = `${prefix}.${key}`;
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Record the container as well as descending into it. Without this,
      // { password: { $ne: null } } reads as a brand new field rather than as
      // `password` changing from a string into an object, and the type check —
      // the whole point of the baseline — never fires.
      out.set(path, value);
      flatten(value, path, out, depth + 1);
    } else {
      out.set(path, value);
    }
  }
  return out;
}

function fieldsOf(req) {
  const out = new Map();
  flatten(req.params, 'params', out);
  flatten(req.query, 'query', out);
  if (req.body && typeof req.body === 'object') flatten(req.body, 'body', out);
  return out;
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function createBaseline(options = {}) {
  const {
    dir = '.shield',
    file = 'baseline.json',
    minSamples = 200,
    // A route that has not reached maturity used to be judged by nothing at all,
    // which on a quiet endpoint means never. Once there is enough traffic to
    // have an opinion the profile is consulted early — reported one grade down
    // and never enforced, because it is still a guess.
    warmupSamples = Math.max(20, Math.floor(minSamples / 4)),
    enforce = false,
    autosave = true,
  } = options;

  const SOFTEN = { critical: 'high', high: 'medium', medium: 'low', low: 'low' };

  const routes = new Map();
  let dirty = 0;
  let saving = false;
  let writable = true;

  const keyOf = (req) => `${req.method} ${normalizePath(req.path || req.url || '/')}`;

  function profileFor(key) {
    let profile = routes.get(key);
    if (!profile) {
      if (routes.size >= MAX_ROUTES) return null;
      profile = { samples: 0, frozen: false, fields: {} };
      routes.set(key, profile);
    }
    return profile;
  }

  function observe(req) {
    const key = keyOf(req);
    const profile = profileFor(key);
    if (!profile || profile.frozen) return profile;

    profile.samples += 1;
    const fields = fieldsOf(req);

    for (const [path, value] of fields) {
      if (!profile.fields[path] && Object.keys(profile.fields).length >= MAX_FIELDS) continue;
      const field = profile.fields[path] || (profile.fields[path] = {
        seen: 0, types: {}, classes: {}, min: null, max: null, values: [],
      });

      field.seen += 1;
      const type = typeOf(value);
      field.types[type] = (field.types[type] || 0) + 1;

      if (type === 'string') {
        const cls = charClass(value);
        field.classes[cls] = (field.classes[cls] || 0) + 1;
        field.min = field.min === null ? value.length : Math.min(field.min, value.length);
        field.max = field.max === null ? value.length : Math.max(field.max, value.length);
        if (field.values && field.values.length <= MAX_ENUM && !field.values.includes(value)) {
          if (field.values.length === MAX_ENUM) field.values = null;
          else field.values.push(value);
        }
      }
    }

    // Freezing at maturity is what stops an attacker teaching the baseline that
    // their payload is normal. After this point deviations are reported, never learned.
    if (profile.samples >= minSamples) profile.frozen = true;

    dirty += 1;
    if (autosave && dirty >= 25) void save();
    return profile;
  }

  function judge(req) {
    const key = keyOf(req);
    const profile = routes.get(key);
    if (!profile) return [];
    if (!profile.frozen && profile.samples < warmupSamples) return [];
    const provisional = !profile.frozen;

    const findings = [];
    const fields = fieldsOf(req);

    for (const [path, value] of fields) {
      if (findings.length >= 4) break;
      const field = profile.fields[path];

      if (!field) {
        findings.push({
          id: 'unexpected-field', severity: 'medium', label: `field "${path}" never seen here`,
          detail: `${profile.samples} requests to ${key} have gone by without this field. Something is sending your endpoint an input it was not built to take.`,
          fragment: path, sink: 'baseline', at: 'request',
        });
        continue;
      }

      const type = typeOf(value);
      if (!field.types[type]) {
        const known = Object.keys(field.types).join(', ');
        findings.push({
          id: 'unexpected-type', severity: 'high', label: `"${path}" arrived as ${type}`,
          detail: `this field has only ever been ${known} across ${field.seen} requests. A value changing shape like this is how operator injection and type confusion get in.`,
          fragment: path, sink: 'baseline', at: 'request',
        });
        continue;
      }

      if (type !== 'string') continue;

      const cls = charClass(value);
      const learnedRank = Math.max(...Object.keys(field.classes).map((c) => CLASS_RANK[c] ?? 6));
      if ((CLASS_RANK[cls] ?? 6) > learnedRank) {
        findings.push({
          id: 'unexpected-characters', severity: learnedRank <= 2 ? 'high' : 'medium',
          label: `"${path}" holds characters it never has before`,
          detail: `this field has only ever been ${Object.keys(field.classes).join(', ')}; this request widened it to ${cls}.`,
          fragment: path, sink: 'baseline', at: 'request',
        });
        continue;
      }

      if (field.max !== null && value.length > field.max * 3 + 32) {
        findings.push({
          id: 'unexpected-length', severity: 'medium',
          label: `"${path}" is far longer than it has ever been`,
          detail: `the longest value seen here across ${field.seen} requests was ${field.max} characters; this one is ${value.length}.`,
          fragment: path, sink: 'baseline', at: 'request',
        });
        continue;
      }

      if (field.values && field.seen >= ENUM_MIN_SAMPLES && !field.values.includes(value)) {
        findings.push({
          id: 'unexpected-value', severity: 'medium',
          label: `"${path}" holds a value outside its usual set`,
          detail: `only ${field.values.length} distinct values have ever appeared here across ${field.seen} requests.`,
          fragment: path, sink: 'baseline', at: 'request',
        });
      }
    }

    if (!provisional) return findings;
    return findings.map((entry) => ({
      ...entry,
      severity: SOFTEN[entry.severity] || 'low',
      provisional: true,
      detail: `${entry.detail} (this route is still learning — ${profile.samples} of ${minSamples} requests — so this is reported, never enforced.)`,
    }));
  }

  function snapshot() {
    return {
      version: 1,
      minSamples,
      routes: Object.fromEntries(routes),
    };
  }

  async function save() {
    if (saving || !writable) return false;
    saving = true;
    dirty = 0;
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, file), `${JSON.stringify(snapshot(), null, 2)}\n`);
      return true;
    } catch {
      writable = false;
      return false;
    } finally {
      saving = false;
    }
  }

  async function load() {
    try {
      const raw = JSON.parse(await readFile(join(dir, file), 'utf8'));
      if (!raw || raw.version !== 1) return false;
      routes.clear();
      for (const [key, profile] of Object.entries(raw.routes || {})) routes.set(key, profile);
      return true;
    } catch {
      return false;
    }
  }

  const stats = () => ({
    routes: routes.size,
    mature: [...routes.values()].filter((p) => p.frozen).length,
    warming: [...routes.values()].filter((p) => !p.frozen && p.samples >= warmupSamples).length,
    samples: [...routes.values()].reduce((sum, p) => sum + p.samples, 0),
    enforcing: enforce,
  });

  return {
    observe, judge, save, load, snapshot, stats,
    enforce, minSamples, warmupSamples, keyOf, routes,
  };
}

module.exports = { createBaseline, charClass, fieldsOf, CLASS_RANK };
