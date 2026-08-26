'use strict';

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const { writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const ROOT = join(__dirname, '..');

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
};

const dir = mkdtempSync(join(tmpdir(), 'shield-esm-'));

// An ESM app in the idiomatic style: named imports of the builtins shield hooks.
writeFileSync(join(dir, 'app.mjs'), `
import shield from '${ROOT}/index.js';
import { execSync } from 'node:child_process';
shield.protect({ mode: 'monitor', feed: false });
setTimeout(() => {
  const health = shield.health();
  process.stdout.write(JSON.stringify({
    healthy: health.healthy,
    preloaded: health.preloaded,
    unprotected: health.unprotected,
  }));
  process.exit(0);
}, 80);
`);

const run = (args) => {
  const out = execFileSync(process.execPath, args, {
    cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out;
};

const runCapturingStderr = (args) => {
  let stdout = '';
  let stderr = '';
  try {
    const proc = require('node:child_process').spawnSync(process.execPath, args, {
      cwd: dir, encoding: 'utf8',
    });
    stdout = proc.stdout || '';
    stderr = proc.stderr || '';
  } catch (err) {
    stderr = String(err);
  }
  return { stdout, stderr };
};

const bare = runCapturingStderr([join(dir, 'app.mjs')]);
const preloaded = runCapturingStderr(['--import', `${ROOT}/register.mjs`, join(dir, 'app.mjs')]);

check('an ESM app without a preload is detected as degraded', () => {
  const report = JSON.parse(bare.stdout);
  assert.strictEqual(report.healthy, false, 'named ESM imports bypass the hooks');
  assert.ok(report.unprotected.includes('shell commands'), JSON.stringify(report));
});

check('the degraded state is announced loudly, not silently', () => {
  assert.match(bare.stderr, /RUNTIME PROTECTION IS DEGRADED/);
  assert.match(bare.stderr, /--import @amitista\/shield\/register/, 'must state the fix');
});

check('--import register restores full coverage', () => {
  const report = JSON.parse(preloaded.stdout);
  assert.strictEqual(report.healthy, true, JSON.stringify(report));
  assert.strictEqual(report.preloaded, true);
  assert.deepStrictEqual(report.unprotected, []);
});

check('a healthy process prints no warning', () => {
  assert.ok(!/DEGRADED/.test(preloaded.stderr), `unexpected warning: ${preloaded.stderr}`);
});

rmSync(dir, { recursive: true, force: true });
console.log(`${passed} passed${process.exitCode ? '' : ', 0 failed'}`);
