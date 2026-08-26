'use strict';

const { SEVERITY_RANK } = require('./sinks');

const PLAIN = process.env.NO_COLOR !== undefined || !process.stdout.isTTY;

const paint = (code) => (text) => (PLAIN ? text : `[${code}m${text}[0m`);

const dim = paint('2');
const bold = paint('1');
const red = paint('31');
const yellow = paint('33');
const blue = paint('34');
const green = paint('32');
const grey = paint('90');

const SEVERITY_COLOR = { critical: red, high: yellow, medium: blue, low: grey };

const METHOD_COLOR = {
  GET: green, POST: yellow, PUT: yellow, PATCH: yellow, DELETE: red,
};

function pad(text, width) {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function severityChip(severity) {
  const color = SEVERITY_COLOR[severity] || grey;
  return color(`● ${pad(severity, 9)}`);
}

function render(result, { minSeverity = 'low' } = {}) {
  const floor = SEVERITY_RANK[minSeverity] ?? SEVERITY_RANK.low;
  const lines = [];

  lines.push('');
  lines.push(`${bold('shield scan')} ${dim('·')} ${dim(result.root)}`);

  const totals = [
    `${result.scanned} files`,
    `${result.matched} with routes`,
    `${result.routes.length} routes`,
    `${result.flows} findings`,
  ];
  lines.push(`  ${dim(totals.join(' · '))}`);

  const chips = Object.entries(result.counts)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => (SEVERITY_COLOR[severity] || grey)(`● ${count} ${severity}`));
  if (chips.length) lines.push(`  ${chips.join('   ')}`);
  lines.push('');

  if (!result.routes.length) {
    lines.push(`  ${dim('No Express routes found. Point shield at the directory holding your app.')}`);
    lines.push('');
    return lines.join('\n');
  }

  const widest = Math.max(...result.routes.map((route) => route.path.length), 20);
  const column = Math.min(widest + 8, 56);

  for (const route of result.routes) {
    const method = (METHOD_COLOR[route.method] || grey)(pad(route.method, 6));
    const location = dim(`${route.file}:${route.line}`);
    lines.push(`  ${method}${pad(route.path, column)}${location}`);

    const detail = (label, value) => lines.push(`  ${' '.repeat(6)}${dim(pad(label, 8))}${value}`);

    if (route.guards.length) detail('guards', route.guards.join(', '));
    else detail('guards', dim('none'));

    if (!route.resolved) {
      detail('handler', `${route.handler || 'unknown'} ${dim('(defined elsewhere — not analysed)')}`);
    } else if (route.reads.length) {
      detail('reads', route.reads.join(', '));
    } else {
      detail('reads', dim('nothing from the request'));
    }

    for (const flow of route.flows) {
      if ((SEVERITY_RANK[flow.severity] ?? 3) > floor) continue;
      const origins = flow.origins.length ? flow.origins.join(' + ') : dim('—');
      lines.push(
        `  ${' '.repeat(6)}${severityChip(flow.severity)}${origins} ${dim('→')} ${bold(flow.call)} ${dim(`:${flow.line}`)}`,
      );
      if (flow.detail) {
        lines.push(`  ${' '.repeat(16)}${dim(flow.detail)}`);
      }
    }

    lines.push('');
  }

  if (result.secrets && result.secrets.length) {
    lines.push(`  ${bold('Credentials in source')}`);
    lines.push('');
    for (const secret of result.secrets) {
      if ((SEVERITY_RANK[secret.severity] ?? 3) > floor) continue;
      lines.push(
        `  ${' '.repeat(6)}${severityChip(secret.severity)}${secret.label} `
        + `${dim(`${secret.file}:${secret.line}`)}  ${dim(secret.fragment)}`,
      );
    }
    lines.push('');
  }

  if (result.errors.length) {
    lines.push(`  ${yellow(`${result.errors.length} file(s) could not be parsed`)}`);
    for (const error of result.errors.slice(0, 5)) {
      lines.push(`    ${dim(`${error.file} — ${error.message}`)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = { render };
