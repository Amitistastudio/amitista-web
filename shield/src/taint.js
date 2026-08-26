'use strict';

const walk = require('acorn-walk');
const { patternNames, staticString } = require('./parse');
const { moduleSink, globalSink, methodSink, SANITIZERS } = require('./sinks');

const SOURCE_PROPS = new Set([
  'body', 'query', 'params', 'headers', 'cookies', 'signedCookies',
  'url', 'originalUrl', 'path', 'hostname', 'ip', 'files', 'file', 'rawBody',
]);

const SOURCE_METHODS = new Set(['get', 'header', 'param']);

function memberPath(node) {
  const parts = [];
  let cursor = node;
  while (cursor && cursor.type === 'MemberExpression') {
    if (cursor.computed) {
      const key = staticString(cursor.property);
      parts.unshift(key === null ? '[…]' : key);
    } else {
      parts.unshift(cursor.property.name);
    }
    cursor = cursor.object;
  }
  if (cursor && cursor.type === 'Identifier') {
    parts.unshift(cursor.name);
    return parts;
  }
  return null;
}

function merge(target, extra) {
  if (!extra) return target;
  for (const value of extra) target.add(value);
  return target;
}

function addTaint(state, name, origins) {
  const existing = state.tainted.get(name);
  if (!existing) {
    state.tainted.set(name, new Set(origins));
    return true;
  }
  const before = existing.size;
  merge(existing, origins);
  return existing.size !== before;
}

function reqSourcePath(node, state) {
  if (!state.reqName || !node || node.type !== 'MemberExpression') return null;
  const path = memberPath(node);
  if (!path || path[0] !== state.reqName || !SOURCE_PROPS.has(path[1])) return null;
  return path.slice(0, 3).join('.');
}

function taintOf(node, state) {
  if (!node) return null;

  switch (node.type) {
    case 'Identifier':
      return state.tainted.get(node.name) || null;

    case 'MemberExpression': {
      const source = reqSourcePath(node, state);
      if (source) return new Set([source]);
      const path = memberPath(node);
      if (path) {
        const seed = state.tainted.get(path[0]);
        if (seed) return seed;
      }
      return taintOf(node.object, state);
    }

    case 'CallExpression': {
      const path = memberPath(node.callee);
      if (path && state.reqName && path[0] === state.reqName && path.length === 2
          && SOURCE_METHODS.has(path[1])) {
        const key = staticString(node.arguments[0]);
        return new Set([`${state.reqName}.${path[1]}(${key ? `'${key}'` : ''})`]);
      }
      if (node.callee.type === 'Identifier' && SANITIZERS.has(node.callee.name)) return null;

      const out = new Set();
      if (node.callee.type === 'MemberExpression') merge(out, taintOf(node.callee.object, state));
      for (const arg of node.arguments) merge(out, taintOf(arg, state));
      return out.size ? out : null;
    }

    case 'TemplateLiteral': {
      const out = new Set();
      for (const expr of node.expressions) merge(out, taintOf(expr, state));
      return out.size ? out : null;
    }

    case 'BinaryExpression': {
      if (node.operator !== '+') return null;
      const out = new Set();
      merge(out, taintOf(node.left, state));
      merge(out, taintOf(node.right, state));
      return out.size ? out : null;
    }

    case 'LogicalExpression':
    case 'ConditionalExpression': {
      const out = new Set();
      if (node.type === 'ConditionalExpression') {
        merge(out, taintOf(node.consequent, state));
        merge(out, taintOf(node.alternate, state));
      } else {
        merge(out, taintOf(node.left, state));
        merge(out, taintOf(node.right, state));
      }
      return out.size ? out : null;
    }

    case 'AwaitExpression':
    case 'TSNonNullExpression':
      return taintOf(node.argument ?? node.expression, state);

    case 'ObjectExpression': {
      const out = new Set();
      for (const prop of node.properties) {
        merge(out, taintOf(prop.type === 'SpreadElement' ? prop.argument : prop.value, state));
      }
      return out.size ? out : null;
    }

    case 'ArrayExpression': {
      const out = new Set();
      for (const element of node.elements) if (element) merge(out, taintOf(element, state));
      return out.size ? out : null;
    }

    case 'SpreadElement':
      return taintOf(node.argument, state);

    default:
      return null;
  }
}

function seedPass(fn, state) {
  let changed = false;

  walk.simple(fn, {
    VariableDeclarator(node) {
      if (node.id.type === 'ObjectPattern' && node.init) {
        const base = reqSourcePath(node.init, state)
          || (node.init.type === 'Identifier' && state.tainted.has(node.init.name)
            ? [...state.tainted.get(node.init.name)][0]
            : null);
        if (base) {
          for (const prop of node.id.properties) {
            if (prop.type !== 'Property' || prop.value.type !== 'Identifier') continue;
            const key = prop.key.name ?? prop.key.value;
            const origin = `${base}.${key}`;
            state.seededReads.add(origin);
            if (addTaint(state, prop.value.name, [origin])) changed = true;
          }
          return;
        }
      }
      const origins = taintOf(node.init, state);
      if (!origins) return;
      for (const name of patternNames(node.id)) {
        if (addTaint(state, name, origins)) changed = true;
      }
    },

    AssignmentExpression(node) {
      const origins = taintOf(node.right, state);
      if (!origins) return;
      for (const name of patternNames(node.left)) {
        if (addTaint(state, name, origins)) changed = true;
      }
    },
  });

  return changed;
}

function resolveSink(node, bindings, state) {
  const callee = node.callee;

  if (callee.type === 'Identifier') {
    const bound = bindings.members.get(callee.name);
    if (bound) {
      const hit = moduleSink(bound.module, bound.prop);
      if (hit) return { ...hit, call: `${callee.name}()` };
    }
    return globalSink(callee.name);
  }

  if (callee.type !== 'MemberExpression') return null;

  const path = memberPath(callee);
  if (path && path.length >= 2) {
    const mod = bindings.modules.get(path[0]);
    if (mod) {
      const hit = moduleSink(mod, path[1]);
      if (hit) return hit;
    }
  }

  const prop = callee.computed ? staticString(callee.property) : callee.property.name;
  if (!prop) return null;

  const ownerNode = callee.object;
  const owner = ownerNode.type === 'Identifier'
    ? ownerNode.name
    : (memberPath(ownerNode) || []).slice(-1)[0] || null;

  if (owner && owner === state.reqName) return null;

  return methodSink(owner, prop);
}

// Mass assignment: handing a whole request object to something that writes it.
// The tell is that the taint origin is the container itself (req.body) rather
// than a named field off it — the handler never chose which keys it accepted,
// so an attacker adds `isAdmin` and the model takes it.
const WHOLE_CONTAINER = /^req\.(body|query)$/;

const ASSIGN_METHODS = new Set([
  'assign', 'create', 'update', 'save', 'set', 'insert', 'merge', 'build',
  'findOneAndUpdate', 'findByIdAndUpdate', 'updateOne', 'updateMany', 'upsert',
]);

function wholeContainerOrigin(node, state) {
  const origins = taintOf(node, state);
  if (!origins) return null;
  return [...origins].find((origin) => WHOLE_CONTAINER.test(origin)) || null;
}

function calleeLabel(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed) {
    const owner = node.object.type === 'Identifier' ? node.object.name : null;
    return owner ? `${owner}.${node.property.name}` : node.property.name;
  }
  return null;
}

function collectMassAssignment(fn, state, push) {
  const consider = (node, label) => {
    for (const arg of node.arguments || []) {
      const origin = wholeContainerOrigin(arg, state);
      if (!origin) continue;
      push({
        id: 'mass-assignment',
        severity: 'medium',
        label: 'unfiltered request object',
        call: label,
        origins: [origin],
        line: node.loc ? node.loc.start.line : 0,
      });
      return;
    }
  };

  walk.simple(fn, {
    NewExpression(node) {
      const label = calleeLabel(node.callee);
      if (label && label !== 'Function') consider(node, `new ${label}()`);
    },
    CallExpression(node) {
      const callee = node.callee;
      if (callee.type !== 'MemberExpression' || callee.computed) return;
      const prop = callee.property.name;
      if (!ASSIGN_METHODS.has(prop)) return;
      consider(node, `${calleeLabel(callee)}()`);
    },
  });
}

function collectFlows(fn, state, bindings) {
  const flows = [];
  const seen = new Set();

  const record = (node, sink) => {
    if (!sink) return;
    const positions = sink.args == null
      ? node.arguments.map((_, index) => index)
      : sink.args;
    const origins = new Set();
    for (const index of positions) merge(origins, taintOf(node.arguments[index], state));
    if (!origins.size) return;
    const line = node.loc ? node.loc.start.line : 0;
    const key = `${sink.call}:${line}:${[...origins].join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    flows.push({
      id: sink.id,
      severity: sink.severity,
      label: sink.label,
      call: sink.call,
      origins: [...origins].sort(),
      line,
    });
  };

  // Sinks are recorded whether or not tainted data reaches them. Authorisation
  // checks need to know a route touches the database at all — keying that off a
  // taint flow would skip every correctly parameterised query, which is exactly
  // the set of routes least likely to have another problem masking the gap.
  const reached = new Set();

  walk.simple(fn, {
    CallExpression(node) {
      const sink = resolveSink(node, bindings, state);
      if (sink) reached.add(sink.id);
      record(node, sink);
    },
    NewExpression(node) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'Function') {
        record(node, {
          id: 'eval', severity: 'critical', label: 'dynamic evaluation',
          call: 'new Function()', args: null,
        });
      }
    },
  });

  collectMassAssignment(fn, state, (finding) => {
    const key = `${finding.call}:${finding.line}:${finding.origins.join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    flows.push(finding);
  });

  return { flows, reached: [...reached] };
}

function collectReads(fn, state) {
  const reads = new Set(state.seededReads);

  walk.simple(fn, {
    MemberExpression(node) {
      const source = reqSourcePath(node, state);
      if (source) reads.add(source);
    },
    CallExpression(node) {
      const path = memberPath(node.callee);
      if (path && state.reqName && path[0] === state.reqName && path.length === 2
          && SOURCE_METHODS.has(path[1])) {
        const key = staticString(node.arguments[0]);
        reads.add(`${state.reqName}.${path[1]}(${key ? `'${key}'` : ''})`);
      }
    },
  });

  const all = [...reads];
  return all
    .filter((read) => !all.some((other) => other !== read && other.startsWith(`${read}.`)))
    .sort();
}

function analyzeHandler(fn, bindings) {
  const empty = { reads: [], flows: [], sinksReached: [] };
  if (!fn || !fn.params) return empty;

  const state = { reqName: null, tainted: new Map(), seededReads: new Set() };
  const first = fn.params[0];

  if (first && first.type === 'Identifier') {
    state.reqName = first.name;
  } else if (first && first.type === 'ObjectPattern') {
    state.reqName = null;
    for (const prop of first.properties) {
      if (prop.type !== 'Property' || prop.value.type !== 'Identifier') continue;
      const key = prop.key.name ?? prop.key.value;
      if (!SOURCE_PROPS.has(key)) continue;
      const origin = `req.${key}`;
      state.seededReads.add(origin);
      addTaint(state, prop.value.name, [origin]);
    }
  }

  if (!state.reqName && !state.tainted.size) return empty;

  for (let pass = 0; pass < 4; pass += 1) {
    if (!seedPass(fn, state)) break;
  }

  const { flows, reached } = collectFlows(fn, state, bindings);
  return { reads: collectReads(fn, state), flows, sinksReached: reached };
}

module.exports = { analyzeHandler, memberPath, taintOf, SOURCE_PROPS };
