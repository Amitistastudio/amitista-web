'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const vm = require('node:vm');
const Module = require('node:module');
const { promisify } = require('node:util');
const { current } = require('./context');
const {
  judgeCommand, judgeArgv, judgePath, judgeSql, judgeUrl, judgeCode, judgeQuery,
} = require('./detect');
const { registry } = require('../feed');

const CUSTOM = promisify.custom;

class ShieldBlocked extends Error {
  constructor(finding) {
    super(`Blocked by shield: ${finding.detail}`);
    this.name = 'ShieldBlocked';
    this.status = 400;
    this.statusCode = 400;
    this.expose = false;
    this.finding = finding;
  }
}

// Every judge runs inside a try/catch. A security tool that throws its own bug
// into the host application is worse than the vulnerability it was watching for.
function inspect(judge, args, call) {
  const context = current();
  if (!context) return;

  let finding = null;
  try {
    finding = judge(args, context.taint, context);
  } catch {
    return;
  }
  if (!finding) return;

  // report() returns null when the finding was suppressed — by the caller's own
  // ignore() predicate, or by a rule the published policy has turned off. The
  // return value has to be honoured here or a suppressed rule would still throw
  // and still refuse the request in block mode, which is the opposite of what
  // suppressing it means. The entry is used rather than the raw finding so a
  // severity re-grade applies to what the error carries too.
  const entry = context.report({ ...finding, call });
  if (!entry) return;
  if (context.mode !== 'block') return;

  // Remembered as well as thrown. A handler with a try/catch around its own
  // filesystem or database call swallows this error along with the ones it was
  // written for, and the request would then finish normally — refused in the
  // log and served in reality. The response guards check this mark, so a
  // swallowed refusal still refuses.
  context.blocked = entry;
  throw new ShieldBlocked(entry);
}

function wrap(original, judge, call) {
  const patched = function shielded(...args) {
    inspect(judge, args, call);
    return original.apply(this, args);
  };

  for (const key of Reflect.ownKeys(original)) {
    if (key === 'length' || key === 'name' || key === 'prototype') continue;
    try {
      patched[key] = original[key];
    } catch {
      // non-writable descriptors are not worth failing over
    }
  }

  // promisify(exec) resolves through this symbol and would otherwise bypass the hook
  if (typeof original[CUSTOM] === 'function') {
    const originalCustom = original[CUSTOM];
    patched[CUSTOM] = function shieldedAsync(...args) {
      inspect(judge, args, call);
      return originalCustom.apply(this, args);
    };
  }

  Object.defineProperty(patched, 'name', { value: original.name, configurable: true });
  patched.__shieldOriginal = original;
  return patched;
}

// vm.Script is a class, and a plain function wrapper around a class breaks
// `new` — the wrapper would call the constructor without it and throw. A proxy
// keeps the construct trap, the statics, the prototype and instanceof intact.
function wrapClass(original, judge, call) {
  const patched = new Proxy(original, {
    construct(target, args, newTarget) {
      inspect(judge, args, call);
      return Reflect.construct(target, args, newTarget);
    },
    apply(target, thisArg, args) {
      inspect(judge, args, call);
      return Reflect.apply(target, thisArg, args);
    },
    get(target, prop, receiver) {
      if (prop === '__shieldOriginal') return original;
      return Reflect.get(target, prop, receiver);
    },
  });
  return patched;
}

function patchMethod(target, name, judge, call, wrapper = wrap) {
  const original = target && target[name];
  if (typeof original !== 'function' || original.__shieldOriginal) return null;
  try {
    target[name] = wrapper(original, judge, call);
  } catch {
    return null;
  }
  return () => { target[name] = original; };
}

const patchClass = (target, name, judge, call) => patchMethod(target, name, judge, call, wrapClass);

// Some drivers hand out the object that owns the interesting method rather than
// exposing it on a prototype — mysql's createConnection is the classic case, and
// the old hook here patched the factory with a null judge, which inspected
// nothing at all. Decorating the returned instance is what actually works.
function patchFactory(target, name, decorate) {
  const original = target && target[name];
  if (typeof original !== 'function' || original.__shieldFactory) return null;
  const patched = function shieldedFactory(...args) {
    const instance = original.apply(this, args);
    try {
      decorate(instance);
    } catch {
      // an instance whose shape we do not recognise is left alone
    }
    return instance;
  };
  for (const key of Reflect.ownKeys(original)) {
    if (key === 'length' || key === 'name' || key === 'prototype') continue;
    try {
      patched[key] = original[key];
    } catch {
      // as in wrap()
    }
  }
  patched.__shieldFactory = original;
  try {
    target[name] = patched;
  } catch {
    return null;
  }
  return () => { target[name] = original; };
}

const commandJudge = (args, taint) => judgeCommand(args[0], taint);
const argvJudge = (args, taint) => judgeCommand(args[0], taint) || judgeArgv(args[1], taint);
// The third argument is the request context, which carries whatever the
// application declared about itself — the filesystem roots, for now.
const pathJudge = (args, taint, context) => judgePath(args[0], taint, context && context.paths);
const twoPathJudge = (args, taint, context) => judgePath(args[0], taint, context && context.paths)
  || judgePath(args[1], taint, context && context.paths);
const urlJudge = (args, taint) => judgeUrl(args[0], taint);
// request(url, options, cb) and request(options, cb) are both in wide use, and
// axios, got and node-fetch all reach the network through one of them.
const httpJudge = (args, taint) => judgeUrl(args[0], taint) || judgeUrl(args[1], taint);
const sqlJudge = (args, taint) => judgeSql(args[0], taint);
const codeJudge = (args, taint) => judgeCode(args[0], taint);
const queryJudge = (args, taint) => judgeQuery(args[0], taint) || judgeQuery(args[1], taint);

const SHELL_METHODS = { exec: commandJudge, execSync: commandJudge };
const ARGV_METHODS = {
  execFile: argvJudge, execFileSync: argvJudge, spawn: argvJudge, spawnSync: argvJudge, fork: argvJudge,
};

const FS_SINGLE = [
  'readFile', 'readFileSync', 'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync',
  'unlink', 'unlinkSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync', 'mkdir', 'mkdirSync',
  'readdir', 'readdirSync', 'open', 'openSync', 'createReadStream', 'createWriteStream',
  'stat', 'statSync', 'realpath', 'realpathSync', 'truncate', 'truncateSync',
  'lstat', 'lstatSync', 'access', 'accessSync', 'readlink', 'readlinkSync',
  'opendir', 'opendirSync', 'chmod', 'chmodSync', 'chown', 'chownSync',
  'watch', 'watchFile', 'glob', 'globSync', 'mkdtemp', 'mkdtempSync',
];
const FS_DOUBLE = [
  'rename', 'renameSync', 'copyFile', 'copyFileSync', 'cp', 'cpSync',
  'link', 'linkSync', 'symlink', 'symlinkSync',
];

const VM_METHODS = ['runInNewContext', 'runInThisContext', 'runInContext', 'compileFunction'];

// The judges a published sink is allowed to point at. A feed can name a new
// module and method, but the thing that decides whether a call is dangerous is
// always code that shipped in this package and was reviewed with it. There is
// no way for a document to describe new behaviour, only new places to apply
// behaviour that already exists.
const JUDGES = {
  command: commandJudge,
  argv: argvJudge,
  path: pathJudge,
  path2: twoPathJudge,
  sql: sqlJudge,
  url: urlJudge,
  code: codeJudge,
  query: queryJudge,
};

function patchAll(target, names, judge, prefix, undo) {
  for (const name of names) {
    const revert = patchMethod(target, name, judge, `${prefix}.${name}`);
    if (revert && undo) undo.push(revert);
  }
}

// Connection-level patching for the drivers that hand back an instance instead
// of exposing a prototype.
function decorateConnection(instance, label) {
  if (!instance || typeof instance !== 'object') return;
  for (const name of ['query', 'execute']) {
    patchMethod(instance, name, sqlJudge, `${label}.${name}`);
  }
}

const SQL_DRIVERS = {
  pg: (mod) => {
    for (const name of ['Client', 'Pool']) {
      const proto = mod && mod[name] && mod[name].prototype;
      patchMethod(proto, 'query', sqlJudge, `pg.${name}.query`);
    }
  },
  mysql: (mod) => {
    patchFactory(mod, 'createConnection', (conn) => decorateConnection(conn, 'mysql.connection'));
    patchFactory(mod, 'createPool', (pool) => decorateConnection(pool, 'mysql.pool'));
  },
  mysql2: (mod) => {
    const proto = mod && mod.Connection && mod.Connection.prototype;
    patchMethod(proto, 'query', sqlJudge, 'mysql2.query');
    patchMethod(proto, 'execute', sqlJudge, 'mysql2.execute');
    patchFactory(mod, 'createConnection', (conn) => decorateConnection(conn, 'mysql2.connection'));
    patchFactory(mod, 'createPool', (pool) => decorateConnection(pool, 'mysql2.pool'));
  },
  'better-sqlite3': (mod) => {
    const proto = mod && mod.prototype;
    patchMethod(proto, 'prepare', sqlJudge, 'sqlite.prepare');
    patchMethod(proto, 'exec', sqlJudge, 'sqlite.exec');
  },
  sqlite3: (mod) => {
    const proto = mod && mod.Database && mod.Database.prototype;
    for (const name of ['run', 'get', 'all', 'each', 'exec', 'prepare']) {
      patchMethod(proto, name, sqlJudge, `sqlite3.${name}`);
    }
  },
  // A document store takes objects, so the SQL judges never saw it. This is the
  // path a $where or a caller-chosen operator takes into the database.
  mongodb: (mod) => {
    const proto = mod && mod.Collection && mod.Collection.prototype;
    for (const name of [
      'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
      'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'countDocuments', 'aggregate',
    ]) {
      patchMethod(proto, name, queryJudge, `mongodb.${name}`);
    }
  },
};

SQL_DRIVERS['mysql2/promise'] = SQL_DRIVERS.mysql2;
SQL_DRIVERS['node:mongodb'] = SQL_DRIVERS.mongodb;

// Patches installed from a feed are pushed onto the live install's undo list so
// stop() reverts them like any other. Held at module scope because they arrive
// after install() has already returned.
let activeUndo = null;

// Walks `path` from a module's exports — ['Client', 'prototype'] on a database
// driver, [] for a function hanging off the module itself.
function resolveTarget(exported, path) {
  let target = exported;
  for (const step of path) {
    if (!target || typeof target !== 'object' && typeof target !== 'function') return null;
    target = target[step];
  }
  return target || null;
}

function applySink(exported, sink) {
  const judge = JUDGES[sink.kind];
  if (!judge) return null;
  const target = resolveTarget(exported, sink.path || []);
  if (!target) return null;
  const label = [sink.module, ...(sink.path || []).filter((step) => step !== 'prototype'), sink.method].join('.');
  return patchMethod(target, sink.method, judge, label);
}

// Installs every sink the current feed publishes. Safe to call repeatedly:
// patchMethod refuses to double-wrap a function it has already patched, so a
// feed refresh re-runs this without stacking wrappers on the same method.
function applyFeedSinks() {
  if (!activeUndo) return 0;
  const sinks = [...registry.patterns('sinks'), ...registry.patterns('sqlDrivers')];
  if (!sinks.length) return 0;

  let installed = 0;
  const byModule = new Map();
  for (const sink of sinks) {
    if (!byModule.has(sink.module)) byModule.set(sink.module, []);
    byModule.get(sink.module).push(sink);
  }

  for (const [name, list] of byModule) {
    let exported = null;
    try {
      // Only modules the application has already loaded are patched here. One
      // it has not is caught by the loader hook below if it is ever required,
      // and requiring it ourselves to patch it would mean a rules feed could
      // make a customer's process execute code it never asked to load.
      if (!require.cache[require.resolve(name)]) continue;
      exported = require(name);
    } catch {
      continue;
    }
    for (const sink of list) {
      try {
        const revert = applySink(exported, sink);
        if (revert) {
          activeUndo.push(revert);
          installed += 1;
        }
      } catch {
        // a module whose shape does not match the published sink is left alone
      }
    }
  }
  return installed;
}

function install() {
  const undo = [];
  const add = (fn) => { if (fn) undo.push(fn); };
  activeUndo = undo;

  for (const [name, judge] of Object.entries(SHELL_METHODS)) {
    add(patchMethod(childProcess, name, judge, `child_process.${name}`));
  }
  for (const [name, judge] of Object.entries(ARGV_METHODS)) {
    add(patchMethod(childProcess, name, judge, `child_process.${name}`));
  }

  for (const name of FS_SINGLE) {
    add(patchMethod(fs, name, pathJudge, `fs.${name}`));
    add(patchMethod(fs.promises, name, pathJudge, `fs.promises.${name}`));
  }
  for (const name of FS_DOUBLE) {
    add(patchMethod(fs, name, twoPathJudge, `fs.${name}`));
    add(patchMethod(fs.promises, name, twoPathJudge, `fs.promises.${name}`));
  }

  // Only the global fetch was hooked before, which covered nothing an
  // application actually uses: axios, got and node-fetch all bottom out in
  // http.request, so their outbound requests were never judged.
  for (const [mod, label] of [[http, 'http'], [https, 'https']]) {
    patchAll(mod, ['request', 'get'], httpJudge, label, undo);
  }

  patchAll(vm, VM_METHODS, codeJudge, 'vm', undo);
  add(patchClass(vm, 'Script', codeJudge, 'vm.Script'));

  if (typeof globalThis.fetch === 'function' && !globalThis.fetch.__shieldOriginal) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = wrap(originalFetch, urlJudge, 'fetch');
    add(() => { globalThis.fetch = originalFetch; });
  }

  // Database drivers have no single shared module, so catch them as they load.
  const originalLoad = Module._load;
  if (!originalLoad.__shieldOriginal) {
    const patchedLoad = function shieldedLoad(request, ...rest) {
      const exported = originalLoad.call(this, request, ...rest);
      const driver = SQL_DRIVERS[request];
      if (driver) {
        try {
          driver(exported);
        } catch {
          // a driver whose shape we do not recognise is left alone
        }
      }
      // Published sinks get the same treatment as the built-in drivers: a
      // module named by the feed is patched the moment the app loads it, which
      // is the only point at which patching is still ahead of the app's own
      // reference to it.
      for (const sink of registry.patterns('sinks').concat(registry.patterns('sqlDrivers'))) {
        if (sink.module !== request) continue;
        try {
          const revert = applySink(exported, sink);
          if (revert && activeUndo) activeUndo.push(revert);
        } catch {
          // as above
        }
      }
      return exported;
    };
    patchedLoad.__shieldOriginal = originalLoad;
    Module._load = patchedLoad;
    add(() => { Module._load = originalLoad; });

    for (const [name, driver] of Object.entries(SQL_DRIVERS)) {
      try {
        if (require.cache[require.resolve(name)]) driver(require(name));
      } catch {
        // driver not installed in this app
      }
    }
  }

  return function uninstall() {
    while (undo.length) undo.pop()();
    if (activeUndo === undo) activeUndo = null;
  };
}

module.exports = {
  install, ShieldBlocked, wrap, wrapClass, patchMethod, patchClass, patchFactory,
  applyFeedSinks, JUDGES,
};
