'use strict';

const { readFile, readdir } = require('node:fs/promises');
const { join, resolve, dirname, extname, relative } = require('node:path');
const { analyzeSource, authorisationFinding, joinPath } = require('./routes');
const { scanSource } = require('./secrets');
const { SEVERITY_RANK } = require('./sinks');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out',
  'vendor', '.cache', 'tmp', '.shield', 'public', 'static',
]);

const EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

async function collectFiles(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await collectFiles(full, out);
    } else if (EXTENSIONS.has(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function resolveSpec(fromFile, spec, known) {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.jsx`,
    join(base, 'index.js'), join(base, 'index.mjs'), join(base, 'index.cjs'),
  ];
  return candidates.find((candidate) => known.has(candidate)) || null;
}

// Prefixes and middleware both flow from the mounting file into the mounted
// one. Guards have to travel too, or every router in an app that authorises
// centrally with app.use(requireAuth) gets reported as unprotected.
function applyMounts(results) {
  const known = new Set(results.map((entry) => entry.file));
  const prefixes = new Map();
  const guards = new Map();

  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const entry of results) {
      const inheritedPrefix = prefixes.get(entry.file) || '';
      const inheritedGuards = [...(guards.get(entry.file) || []), ...entry.globalGuards];

      for (const mount of entry.mounts) {
        const target = resolveSpec(entry.file, mount.module, known);
        if (!target) continue;

        const nextPrefix = joinPath(inheritedPrefix, mount.prefix);
        if (prefixes.get(target) !== nextPrefix) {
          prefixes.set(target, nextPrefix);
          changed = true;
        }

        const existing = guards.get(target) || [];
        const merged = [...new Set([...existing, ...inheritedGuards])];
        if (merged.length !== existing.length) {
          guards.set(target, merged);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  return { prefixes, guards };
}

function summarize(routes, secrets) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  let flows = 0;
  for (const route of routes) {
    for (const flow of route.flows) {
      counts[flow.severity] = (counts[flow.severity] || 0) + 1;
      flows += 1;
    }
  }
  for (const secret of secrets) {
    counts[secret.severity] = (counts[secret.severity] || 0) + 1;
  }
  return { counts, flows };
}

async function scan(root) {
  const base = resolve(root);
  const files = await collectFiles(base);
  const results = [];
  const errors = [];
  const secrets = [];

  for (const file of files) {
    let source;
    try {
      source = await readFile(file, 'utf8');
    } catch (err) {
      errors.push({ file, message: err.message });
      continue;
    }
    for (const secret of scanSource(source, file)) {
      secrets.push({ ...secret, file: relative(base, secret.file) });
    }

    if (!/\b(express|Router)\b/.test(source)) continue;

    try {
      const analysis = analyzeSource(source, { file });
      if (analysis.routes.length || analysis.mounts.length) results.push(analysis);
    } catch (err) {
      errors.push({ file, message: err.message });
    }
  }

  const { prefixes, guards } = applyMounts(results);
  const routes = [];

  for (const entry of results) {
    const prefix = prefixes.get(entry.file) || '';
    const inheritedGuards = [...(guards.get(entry.file) || []), ...entry.globalGuards];

    for (const route of entry.routes) {
      const resolved = {
        ...route,
        file: relative(base, route.file) || route.file,
        path: prefix ? joinPath(prefix, route.path) : route.path,
        inheritedGuards,
      };

      const missingAuth = authorisationFinding(resolved, inheritedGuards);
      const flows = missingAuth ? [...route.flows, missingAuth] : route.flows;

      resolved.flows = flows.sort(
        (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.line - b.line,
      );
      routes.push(resolved);
    }
  }

  routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  return {
    root: base,
    scanned: files.length,
    matched: results.length,
    routes,
    secrets,
    errors: errors.map((entry) => ({ ...entry, file: relative(base, entry.file) })),
    ...summarize(routes, secrets),
  };
}

module.exports = { scan, collectFiles, applyMounts, resolveSpec };
