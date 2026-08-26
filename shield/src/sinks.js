'use strict';

// Each sink names the argument positions that are actually an injection point.
// `null` means every argument. This is what keeps a correctly parameterised
// query — query(sql, [values]) — from being reported as an injection.

const MODULE_SINKS = {
  child_process: {
    id: 'command',
    severity: 'critical',
    label: 'shell command',
    props: {
      exec: [0], execSync: [0],
      execFile: [0, 1], execFileSync: [0, 1],
      spawn: [0, 1], spawnSync: [0, 1], fork: [0, 1],
    },
  },
  vm: {
    id: 'eval',
    severity: 'critical',
    label: 'dynamic evaluation',
    props: {
      runInNewContext: [0], runInThisContext: [0], runInContext: [0],
      compileFunction: [0], Script: [0],
    },
  },
  fs: {
    id: 'filesystem',
    severity: 'high',
    label: 'filesystem path',
    props: {
      readFile: [0], readFileSync: [0], writeFile: [0], writeFileSync: [0],
      appendFile: [0], appendFileSync: [0], unlink: [0], unlinkSync: [0],
      rm: [0], rmSync: [0], rmdir: [0], rmdirSync: [0], mkdir: [0], mkdirSync: [0],
      readdir: [0], readdirSync: [0], open: [0], openSync: [0],
      rename: [0, 1], renameSync: [0, 1], copyFile: [0, 1], copyFileSync: [0, 1],
      cp: [0, 1], cpSync: [0, 1], link: [0, 1], linkSync: [0, 1],
      symlink: [0, 1], symlinkSync: [0, 1],
      createReadStream: [0], createWriteStream: [0], stat: [0], statSync: [0],
      lstat: [0], lstatSync: [0], access: [0], accessSync: [0],
      readlink: [0], readlinkSync: [0], realpath: [0], realpathSync: [0],
      opendir: [0], opendirSync: [0], chmod: [0], chmodSync: [0],
      truncate: [0], truncateSync: [0], glob: [0], globSync: [0],
    },
  },
  // The runtime hooks watch these, so the scanner has to name them too or the
  // report says an outbound request is unwatched when it is not.
  http: {
    id: 'ssrf',
    severity: 'high',
    label: 'outbound request',
    props: { request: [0, 1], get: [0, 1] },
  },
};

MODULE_SINKS.https = MODULE_SINKS.http;

MODULE_SINKS['node:child_process'] = MODULE_SINKS.child_process;
MODULE_SINKS['node:vm'] = MODULE_SINKS.vm;
MODULE_SINKS['node:fs'] = MODULE_SINKS.fs;
MODULE_SINKS['fs/promises'] = MODULE_SINKS.fs;
MODULE_SINKS['node:fs/promises'] = MODULE_SINKS.fs;
MODULE_SINKS['node:http'] = MODULE_SINKS.http;
MODULE_SINKS['node:https'] = MODULE_SINKS.https;

const GLOBAL_SINKS = {
  eval: { id: 'eval', severity: 'critical', label: 'dynamic evaluation', args: [0] },
  fetch: { id: 'ssrf', severity: 'high', label: 'outbound request', args: [0] },
};

const METHOD_SINKS = {
  query: { id: 'sql', severity: 'critical', label: 'database query', args: [0] },
  raw: { id: 'sql', severity: 'critical', label: 'database query', args: [0] },
  unprepared: { id: 'sql', severity: 'critical', label: 'database query', args: [0] },
  execute: { id: 'sql', severity: 'high', label: 'database query', args: [0] },
  render: { id: 'render', severity: 'medium', label: 'template render', args: [0] },
  redirect: { id: 'redirect', severity: 'medium', label: 'redirect target', args: null },
  sendFile: { id: 'filesystem', severity: 'high', label: 'filesystem path', args: [0] },
};

const RESPONSE_METHODS = new Set(['send', 'write', 'end']);

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

const SANITIZERS = new Set([
  'parseInt', 'parseFloat', 'Number', 'BigInt', 'Boolean', 'isNaN', 'isFinite',
]);

const shortModule = (mod) => mod.replace(/^node:/, '');

function moduleSink(mod, prop) {
  const entry = MODULE_SINKS[mod];
  if (!entry) return null;
  const args = entry.props[prop];
  if (!args) return null;
  return {
    id: entry.id,
    severity: entry.severity,
    label: entry.label,
    call: `${shortModule(mod)}.${prop}`,
    args,
  };
}

function globalSink(name) {
  const entry = GLOBAL_SINKS[name];
  return entry ? { ...entry, call: `${name}()` } : null;
}

function methodSink(objectName, prop) {
  if (RESPONSE_METHODS.has(prop)) {
    if (objectName !== 'res') return null;
    return {
      id: 'reflect', severity: 'low', label: 'response body',
      call: `res.${prop}()`, args: null,
    };
  }
  const entry = METHOD_SINKS[prop];
  if (!entry) return null;
  const owner = objectName ? `${objectName}.` : '';
  return { ...entry, call: `${owner}${prop}()` };
}

module.exports = {
  MODULE_SINKS,
  GLOBAL_SINKS,
  METHOD_SINKS,
  RESPONSE_METHODS,
  SEVERITY_RANK,
  SANITIZERS,
  moduleSink,
  globalSink,
  methodSink,
  shortModule,
};
