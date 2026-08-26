'use strict';

// A security tool must know when it is not working. The dangerous state is not
// "unprotected" — it is "unprotected while every log line says otherwise".
//
// This is a functional probe, not a heuristic. It asks the ESM loader for the
// same namespace an application's `import { execSync } from 'node:child_process'`
// would receive, and checks whether the function in it is ours. If the app's
// graph already linked without a preload, the facade holds the originals and no
// amount of patching the CJS object afterwards will change that.
//
// The probe is also a repair: on a CJS app it forces the facade into existence
// while the patched values are current, so any later dynamic import is covered.

const PROBES = [
  { specifier: 'node:child_process', name: 'execSync', label: 'shell commands' },
  { specifier: 'node:fs', name: 'readFileSync', label: 'filesystem paths' },
  { specifier: 'node:http', name: 'request', label: 'outbound requests' },
  { specifier: 'node:vm', name: 'runInNewContext', label: 'dynamic evaluation' },
];

async function selfTest() {
  const results = [];

  for (const probe of PROBES) {
    try {
      const namespace = await import(probe.specifier);
      const target = namespace[probe.name];
      results.push({
        ...probe,
        hooked: Boolean(target && target.__shieldOriginal),
      });
    } catch (err) {
      results.push({ ...probe, hooked: false, error: err.message });
    }
  }

  const fetchHooked = typeof globalThis.fetch === 'function'
    && Boolean(globalThis.fetch.__shieldOriginal);
  results.push({ specifier: 'global', name: 'fetch', label: 'outbound requests', hooked: fetchHooked });

  const broken = results.filter((entry) => !entry.hooked);

  return {
    healthy: broken.length === 0,
    preloaded: Boolean(globalThis.__shieldPreloaded),
    probes: results,
    unprotected: broken.map((entry) => entry.label),
  };
}

function warning(report) {
  return [
    '',
    '  ┌─ shield: RUNTIME PROTECTION IS DEGRADED ─────────────────────────────',
    '  │',
    `  │  Not hooked: ${report.unprotected.join(', ')}`,
    '  │',
    '  │  This process imported those builtins before shield could patch them,',
    '  │  so calls to them are NOT being inspected. Findings will stay empty and',
    '  │  nothing will be blocked, which looks identical to having no attacks.',
    '  │',
    '  │  Fix — start the process with shield preloaded:',
    '  │',
    '  │      node --import @amitista/shield/register server.js',
    '  │      node -r  @amitista/shield/register server.js      (CommonJS)',
    '  │',
    '  └──────────────────────────────────────────────────────────────────────',
    '',
  ].join('\n');
}

module.exports = { selfTest, warning, PROBES };
