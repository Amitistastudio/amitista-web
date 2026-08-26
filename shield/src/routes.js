'use strict';

const walk = require('acorn-walk');
const { collectBindings, staticString } = require('./parse');
const { analyzeHandler } = require('./taint');

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']);

const FUNCTION_TYPES = new Set(['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration']);

function joinPath(prefix, tail) {
  const left = (prefix || '').replace(/\/+$/, '');
  const right = (tail || '').replace(/^\/+/, '');
  const joined = `${left}/${right}`.replace(/\/{2,}/g, '/');
  if (joined === '') return '/';
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

function expressNames(bindings) {
  let factory = null;
  let router = null;
  for (const [name, mod] of bindings.modules) {
    if (mod === 'express') factory = name;
  }
  for (const [name, bound] of bindings.members) {
    if (bound.module === 'express' && bound.prop === 'Router') router = name;
  }
  return { factory, router };
}

function findRoots(ast, bindings) {
  const { factory, router } = expressNames(bindings);
  const roots = new Map();

  walk.simple(ast, {
    VariableDeclarator(node) {
      if (node.id.type !== 'Identifier' || !node.init) return;
      const init = node.init;
      if (init.type !== 'CallExpression') return;
      const callee = init.callee;

      if (factory && callee.type === 'Identifier' && callee.name === factory) {
        roots.set(node.id.name, 'app');
        return;
      }
      if (factory && callee.type === 'MemberExpression'
          && callee.object.type === 'Identifier' && callee.object.name === factory
          && !callee.computed && callee.property.name === 'Router') {
        roots.set(node.id.name, 'router');
        return;
      }
      if (router && callee.type === 'Identifier' && callee.name === router) {
        roots.set(node.id.name, 'router');
      }
    },
  });

  return roots;
}

// Naming is the only signal available for whether a middleware authorises.
// Deliberately broad: a false "this is a guard" costs a missed warning, while a
// false "no guard here" costs noise on every route of a correctly built app,
// and noise is what gets a security tool switched off.
const AUTH_NAME = /auth|session|login|logged|token|jwt|passport|protect|require|verify|guard|permission|permit|acl|rbac|role|admin|owner|can|allow|restrict|ensure|current[_-]?user/i;

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const SENSITIVE_SINKS = new Set(['sql', 'filesystem', 'mass-assignment']);

// Body parsers, CORS, loggers and compression are middleware but never an
// authorisation decision. Counting them as "something is guarding this" would
// quietly downgrade every finding on an app that uses express.json().
const INFRA_MIDDLEWARE = /^(json|urlencoded|raw|text|static|cors|compression|helmet|morgan|cookieParser|bodyParser|favicon|serveStatic|multer|csurf)\(?\)?$/i;

const looksLikeAuth = (name) => AUTH_NAME.test(name || '');
const isInfra = (name) => INFRA_MIDDLEWARE.test(name || '');

function authorisationFinding(route, globalGuards) {
  const guards = [...route.guards, ...globalGuards].filter((name) => !isInfra(name));
  if (guards.some(looksLikeAuth)) return null;

  const identified = route.path.includes(':')
    || route.reads.some((read) => /^req\.(params|query)\./.test(read));
  if (!identified) return null;

  const sinks = route.sinksReached || [];
  const touchesData = sinks.some((id) => SENSITIVE_SINKS.has(id))
    || route.flows.some((flow) => SENSITIVE_SINKS.has(flow.id));
  const mutating = MUTATING.has(route.method);

  if (!touchesData && !mutating) return null;

  const unnamed = guards.length > 0;

  return {
    id: 'missing-authorization',
    severity: mutating ? 'high' : 'medium',
    label: mutating
      ? 'record changed by caller-supplied id, with no authorisation'
      : 'record read by caller-supplied id, with no authorisation',
    call: unnamed ? `guards: ${guards.join(', ')}` : 'no middleware',
    origins: route.reads.filter((read) => /^req\.(params|query)\./.test(read)),
    line: route.line,
    detail: mutating
      ? 'A caller who can guess an id can change or delete this record. Nothing in front of this route looks like an authorisation check.'
      : 'A caller who can guess an id can read this record. Legitimate if the data is public — worth confirming that it is.',
  };
}

function guardName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (FUNCTION_TYPES.has(node.type)) return node.id ? node.id.name : '(inline)';
  if (node.type === 'CallExpression') {
    const callee = node.callee;
    if (callee.type === 'Identifier') return `${callee.name}()`;
    if (callee.type === 'MemberExpression' && !callee.computed) return `${callee.property.name}()`;
  }
  if (node.type === 'MemberExpression' && !node.computed) return node.property.name;
  return null;
}

function resolveHandler(node, scope) {
  if (FUNCTION_TYPES.has(node.type)) return { fn: node, name: node.id ? node.id.name : null };
  if (node.type === 'Identifier') {
    const local = scope.get(node.name);
    if (local) return { fn: local, name: node.name };
    return { fn: null, name: node.name };
  }
  if (node.type === 'MemberExpression' && !node.computed) {
    return { fn: null, name: `${guardName(node.object) || '?'}.${node.property.name}` };
  }
  return { fn: null, name: null };
}

function collectLocalFunctions(ast) {
  const scope = new Map();
  walk.simple(ast, {
    FunctionDeclaration(node) {
      if (node.id) scope.set(node.id.name, node);
    },
    VariableDeclarator(node) {
      if (node.id.type === 'Identifier' && node.init && FUNCTION_TYPES.has(node.init.type)) {
        scope.set(node.id.name, node.init);
      }
    },
  });
  return scope;
}

function analyzeSource(source, { file = '<input>' } = {}) {
  const { parse } = require('./parse');
  const ast = parse(source);
  const bindings = collectBindings(ast);
  const roots = findRoots(ast, bindings);
  const scope = collectLocalFunctions(ast);

  const routes = [];
  const mounts = [];
  const globalGuards = [];
  const localPrefix = new Map();

  walk.simple(ast, {
    CallExpression(node) {
      const callee = node.callee;
      if (callee.type !== 'MemberExpression' || callee.computed) return;
      if (callee.object.type !== 'Identifier') return;

      const owner = callee.object.name;
      if (!roots.has(owner)) return;

      const method = callee.property.name;
      const args = node.arguments;
      if (!args.length) return;

      const literalPath = staticString(args[0]);
      const line = node.loc ? node.loc.start.line : 0;

      if (method === 'use') {
        const mountArgs = literalPath !== null ? args.slice(1) : args;
        for (const arg of mountArgs) {
          if (arg.type === 'Identifier') {
            const mod = bindings.modules.get(arg.name);
            if (mod && mod.startsWith('.')) {
              mounts.push({ prefix: literalPath || '/', module: mod, line, binding: arg.name });
              continue;
            }
            if (roots.get(arg.name) === 'router') {
              localPrefix.set(arg.name, literalPath || '/');
              continue;
            }
          }
          if (literalPath === null) {
            const name = guardName(arg);
            if (name) globalGuards.push(name);
          }
        }
        return;
      }

      if (!METHODS.has(method)) return;
      if (literalPath === null) return;

      const rest = args.slice(1);
      if (!rest.length) return;

      const last = rest[rest.length - 1];
      const guards = rest.slice(0, -1).map(guardName).filter(Boolean);
      const { fn, name } = resolveHandler(last, scope);
      const analysis = fn
        ? analyzeHandler(fn, bindings)
        : { reads: [], flows: [], sinksReached: [], external: true };

      routes.push({
        file,
        line,
        owner,
        ownerKind: roots.get(owner),
        method: method.toUpperCase(),
        path: literalPath,
        guards,
        handler: name,
        resolved: Boolean(fn),
        reads: analysis.reads,
        flows: analysis.flows,
        sinksReached: analysis.sinksReached,
      });
    },
  });

  for (const route of routes) {
    const prefix = localPrefix.get(route.owner);
    if (prefix) route.path = joinPath(prefix, route.path);
  }

  return { file, routes, mounts, globalGuards, roots: [...roots.entries()] };
}

module.exports = { analyzeSource, authorisationFinding, joinPath, METHODS, looksLikeAuth };
