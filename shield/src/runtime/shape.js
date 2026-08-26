'use strict';

// Abuse that lives in the *shape* of a request rather than its values:
// keys that rewrite object prototypes, query operators smuggled into a body
// that expected a scalar, payloads built to be expensive to parse.

const { mergedSet } = require('../feed');

const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MONGO_OPERATORS = new Set([
  '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$regex', '$where',
  '$exists', '$or', '$and', '$not', '$nor', '$expr', '$function', '$accumulator',
  '$jsonSchema', '$text', '$elemMatch',
]);

const DEFAULTS = {
  maxDepth: 12,
  maxKeys: 300,
  maxArray: 1000,
  maxStringLength: 64 * 1024,
};

function finding(id, severity, detail, where) {
  return { id, severity, detail, fragment: where, sink: 'request', at: 'request' };
}

function inspect(root, source, limits, findings) {
  const seen = new Set();
  let keyCount = 0;

  // Resolved once per request rather than per key: the merge is cached on the
  // feed's version counter, but the lookup still costs more than a local.
  const pollutionKeys = mergedSet('pollutionKeys', POLLUTION_KEYS);
  const operators = mergedSet('queryOperators', MONGO_OPERATORS);

  const visit = (value, path, depth) => {
    if (findings.length >= 8) return;

    if (depth > limits.maxDepth) {
      findings.push(finding('payload-depth', 'medium',
        `${source} nests deeper than ${limits.maxDepth} levels`, path || source));
      return;
    }

    if (typeof value === 'string') {
      if (value.length > limits.maxStringLength) {
        findings.push(finding('payload-size', 'medium',
          `${source} contains a string longer than ${limits.maxStringLength} bytes`, path));
      }
      return;
    }

    if (Array.isArray(value)) {
      if (value.length > limits.maxArray) {
        findings.push(finding('payload-size', 'medium',
          `${source} contains an array of ${value.length} items`, path));
        return;
      }
      for (let i = 0; i < value.length; i += 1) visit(value[i], `${path}[${i}]`, depth + 1);
      return;
    }

    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    for (const key of Object.keys(value)) {
      keyCount += 1;
      if (keyCount > limits.maxKeys) {
        findings.push(finding('payload-size', 'medium',
          `${source} carries more than ${limits.maxKeys} keys`, path || source));
        return;
      }

      const here = path ? `${path}.${key}` : key;

      if (pollutionKeys.has(key)) {
        findings.push(finding('prototype-pollution', 'critical',
          `${source} contains the key "${key}", which can rewrite object prototypes`, here));
      } else if (key.charCodeAt(0) === 36 && operators.has(key)) {
        findings.push(finding('nosql-operator', 'high',
          `${source} contains the query operator "${key}" where a value was expected`, here));
      } else if (key.includes('\0')) {
        findings.push(finding('null-byte', 'high',
          `${source} contains a key with an embedded null byte`, here));
      }

      visit(value[key], here, depth + 1);
    }
  };

  visit(root, '', 0);
}

function duplicateParams(query, findings) {
  if (!query || typeof query !== 'object') return;
  for (const key of Object.keys(query)) {
    if (!Array.isArray(query[key])) continue;
    findings.push(finding('parameter-pollution', 'low',
      `query parameter "${key}" was supplied ${query[key].length} times, so it arrives as an array`, key));
    return;
  }
}

function inspectRequest(req, options = {}) {
  const limits = { ...DEFAULTS, ...options };
  const findings = [];

  if (req.body && typeof req.body === 'object') inspect(req.body, 'body', limits, findings);
  if (req.query && typeof req.query === 'object') {
    inspect(req.query, 'query', limits, findings);
    duplicateParams(req.query, findings);
  }
  if (req.params && typeof req.params === 'object') inspect(req.params, 'params', limits, findings);

  return findings;
}

module.exports = { inspectRequest, POLLUTION_KEYS, MONGO_OPERATORS, DEFAULTS };
