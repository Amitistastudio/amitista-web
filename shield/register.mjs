import { createRequire } from 'node:module';

// ESM links an entire module graph before evaluating any of it, so a builtin's
// named exports are snapshotted before an in-graph import of shield could patch
// them. Loading through --import evaluates this file first, while the app's
// graph is still unlinked, so the facades are built from already-patched values.
//
//   node --import @amitista/shield/register server.js
//
// Deliberately uses createRequire rather than `import 'node:child_process'`:
// importing a builtin here would create its ESM facade from the originals,
// which is the exact failure this file exists to prevent.
const require = createRequire(import.meta.url);

globalThis.__shieldPreloaded = true;

require('./index.js');
