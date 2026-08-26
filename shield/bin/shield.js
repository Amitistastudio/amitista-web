#!/usr/bin/env node
'use strict';

const { scan } = require('../src/scan');
const { render } = require('../src/report');
const { SEVERITY_RANK } = require('../src/sinks');

const USAGE = `
shield — read what your app exposes, and where each route's input can end up

  shield scan [dir]            map every Express route, its guards, and its risky flows

Options
  --json                       machine-readable output
  --min-severity=<level>       critical | high | medium | low   (default: low)
  --fail-on=<level>            exit 1 if a finding at or above this level exists
  --help                       this text

Nothing is uploaded. Nothing is written. It reads your source and prints what it found.
`;

function parseArgs(argv) {
  const options = { dir: null, json: false, minSeverity: 'low', failOn: null, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--json') options.json = true;
    else if (arg.startsWith('--min-severity=')) options.minSeverity = arg.split('=')[1];
    else if (arg.startsWith('--fail-on=')) options.failOn = arg.split('=')[1];
    else if (arg === 'scan') continue;
    else if (!arg.startsWith('-')) options.dir = arg;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  for (const key of ['minSeverity', 'failOn']) {
    const value = options[key];
    if (value && !(value in SEVERITY_RANK)) {
      process.stderr.write(`Unknown severity "${value}". Use critical, high, medium or low.\n`);
      return 2;
    }
  }

  const result = await scan(options.dir || process.cwd());

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${render(result, { minSeverity: options.minSeverity })}\n`);
  }

  if (options.failOn) {
    const ceiling = SEVERITY_RANK[options.failOn];
    const breached = result.routes.some((route) =>
      route.flows.some((flow) => SEVERITY_RANK[flow.severity] <= ceiling));
    if (breached) return 1;
  }

  return 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((err) => {
    process.stderr.write(`shield: ${err.message}\n`);
    process.exitCode = 2;
  });
