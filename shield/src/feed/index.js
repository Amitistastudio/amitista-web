'use strict';

const registry = require('./registry');
const { subject } = require('./regex');

// What the rule modules call. Each one keeps its own built-in constants and
// tests those exactly as it always has; these helpers only ever ask the extra
// question "and does anything the feed added match too?". Kept in one place so
// that no rule module has to know how the feed is stored, verified or refreshed
// — the whole live-rules mechanism is reachable from a rule module through
// these four functions and nothing else.

// Feed patterns see a bounded prefix of the value. The compile-time budget in
// regex.js is what stops a pathological pattern getting this far; this is the
// second half of that argument, making the cost bounded even if one did.
function matches(kind, value) {
  const list = registry.patterns(kind);
  if (!list.length || typeof value !== 'string') return false;
  const text = subject(value);
  for (const re of list) {
    re.lastIndex = 0;
    try {
      if (re.test(text)) return true;
    } catch {
      // a pattern that throws at match time is not worth a request
    }
  }
  return false;
}

// For the lists whose entries carry an id and a severity, the caller needs the
// entry that matched and not just that one did.
function match(kind, value) {
  const list = registry.patterns(kind);
  if (!list.length || typeof value !== 'string') return null;
  const text = subject(value);
  for (const entry of list) {
    entry.re.lastIndex = 0;
    try {
      if (entry.re.test(text)) return entry;
    } catch {
      // as above
    }
  }
  return null;
}

module.exports = {
  registry,
  matches,
  match,
  merged: registry.merged,
  mergedSet: registry.mergedSet,
  judge: registry.judge,
};
