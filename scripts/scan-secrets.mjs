#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RED = '\u001b[31m';
const YEL = '\u001b[33m';
const DIM = '\u001b[2m';
const OFF = '\u001b[0m';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const ROOT = git('rev-parse', '--show-toplevel').trim();
const GITDIR = git('rev-parse', '--absolute-git-dir').trim();
const HISTORY = join(GITDIR, 'secret-scan.log');
const ALLOWLIST = join(ROOT, '.githooks', 'allowed-secrets');

const HISTORY_KEPT = 500;

const RULES = [
  ['aws-access-key-id', 'an AWS access key id', /\bAKIA[0-9A-Z]{16}\b/g],
  ['aws-temporary-key-id', 'a temporary AWS access key id', /\bASIA[0-9A-Z]{16}\b/g],
  [
    'aws-secret-access-key',
    'an AWS secret access key',
    /\baws_?secret_?access_?key["'`\s:=]+["'`]?[A-Za-z0-9/+=]{40}\b/gi,
  ],

  ['github-token', 'a GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g],
  ['github-fine-grained-token', 'a GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g],

  ['slack-token', 'a Slack token', /\bxox[baprse]-[A-Za-z0-9-]{10,}/g],
  [
    'slack-webhook',
    'a Slack webhook URL',
    /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9_]+\/B[A-Za-z0-9_]+\/[A-Za-z0-9]{16,}/g,
  ],

  ['stripe-secret-key', 'a Stripe live secret key', /\bsk_live_[A-Za-z0-9]{16,}\b/g],
  ['stripe-restricted-key', 'a Stripe live restricted key', /\brk_live_[A-Za-z0-9]{16,}\b/g],
  ['stripe-webhook-secret', 'a Stripe webhook signing secret', /\bwhsec_[A-Za-z0-9]{24,}\b/g],

  ['private-key', 'a private key block', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g],
  ['putty-private-key', 'a PuTTY private key', /\bPuTTY-User-Key-File-\d/g],
  ['extended-private-key', 'an extended private key', /\bxprv[A-Za-z0-9]{50,}\b/g],

  ['anthropic-key', 'an Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{24,}\b/g],
  ['openai-key', 'an OpenAI API key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g],
  ['google-api-key', 'a Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['npm-token', 'an npm token', /\bnpm_[A-Za-z0-9]{36}\b/g],
  ['pypi-token', 'a PyPI token', /\bpypi-[A-Za-z0-9_-]{32,}\b/g],
  ['sendgrid-key', 'a SendGrid API key', /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g],
  ['mailgun-key', 'a Mailgun API key', /\bkey-[0-9a-f]{32}\b/g],
  [
    'discord-webhook',
    'a Discord webhook URL',
    /https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/g,
  ],
  [
    'discord-bot-token',
    'a Discord bot token',
    /\b[MNO][A-Za-z\d_-]{23,25}\.[A-Za-z\d_-]{6,7}\.[A-Za-z\d_-]{27,38}\b/g,
  ],

  [
    'database-url',
    'a database URL with a password in it',
    /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp)s?:\/\/[^\s:@/]+:[^\s@/]{3,}@/g,
  ],
];

const GENERIC =
  /\b(?:api[_-]?key|secret|token|password|passwd|pwd|client[_-]?secret|access[_-]?token|auth[_-]?token|private[_-]?key)\b["'`\s]*[:=]\s*["'`]([^"'`\n]{20,})["'`]/gi;

const PLACEHOLDER =
  /^(?:x{3,}|\.{3,}|\*{3,}|<|\$\{|%[A-Z_]+%|process\.env|import\.meta|os\.environ|getenv|your[-_. ]|example|changeme|placeholder|redacted|removed|dummy|sample|fake|none|null|undefined|true|false|sk_test_|pk_test_)/i;

function looksLikeAValue(value) {
  if (PLACEHOLDER.test(value)) return false;
  if (/\s/.test(value)) return false;
  if (/^[A-Z][A-Z0-9_]{3,}$/.test(value)) return false;
  const mixed = /[a-z]/.test(value) && /[A-Z0-9]/.test(value);
  return mixed || value.length >= 32;
}

function allowed() {
  const out = new Map();
  if (!existsSync(ALLOWLIST)) return out;
  for (const raw of readFileSync(ALLOWLIST, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const [print, ...reason] = line.split(/\s+/);
    out.set(print.toLowerCase(), reason.join(' ') || 'no reason recorded');
  }
  return out;
}

const fingerprint = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

const redact = (text) =>
  text.length <= 8 ? `${text.slice(0, 2)}…` : `${text.slice(0, 6)}…${text.slice(-2)}`;

function addedLines(range) {
  let diff;
  try {
    diff = git('diff', '--unified=0', '--no-color', '--no-ext-diff', range, '--');
  } catch {
    return null;
  }

  const out = [];
  let file = null;
  let line = 0;

  for (const text of diff.split('\n')) {
    if (text.startsWith('+++ ')) {
      const path = text.slice(4);
      file = path === '/dev/null' ? null : path.replace(/^b\//, '');
      continue;
    }
    if (text.startsWith('@@')) {
      const at = /^@@ -\S+ \+(\d+)/.exec(text);
      line = at ? Number(at[1]) : 0;
      continue;
    }
    if (text.startsWith('+') && !text.startsWith('+++')) {
      if (file !== null) out.push({ file, line, text: text.slice(1) });
      line += 1;
    }
  }
  return out;
}

function scan(lines) {
  const found = [];
  const seen = new Set();

  const record = (rule, label, match, where) => {
    const print = fingerprint(match);
    const key = `${where.file}:${where.line}:${print}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({
      rule,
      label,
      file: where.file,
      line: where.line,
      print,
      shown: redact(match),
      length: match.length,
    });
  };

  for (const where of lines) {
    for (const [rule, label, pattern] of RULES) {
      pattern.lastIndex = 0;
      for (const hit of where.text.matchAll(pattern)) record(rule, label, hit[0], where);
    }
    GENERIC.lastIndex = 0;
    for (const hit of where.text.matchAll(GENERIC)) {
      if (looksLikeAValue(hit[1])) {
        record('generic-secret', 'a hardcoded secret assignment', hit[1], where);
      }
    }
  }

  return found;
}

function remember(entry) {
  try {
    appendFileSync(HISTORY, `${JSON.stringify(entry)}\n`, 'utf8');
    const lines = readFileSync(HISTORY, 'utf8').split('\n').filter(Boolean);
    if (lines.length > HISTORY_KEPT) {
      writeFileSync(HISTORY, `${lines.slice(-HISTORY_KEPT).join('\n')}\n`, 'utf8');
    }
  } catch {
  }
}

function showHistory(limit) {
  if (!existsSync(HISTORY)) {
    console.log('scan-secrets: nothing scanned on this clone yet.');
    return 0;
  }
  const lines = readFileSync(HISTORY, 'utf8').split('\n').filter(Boolean).slice(-limit);
  if (lines.length === 0) {
    console.log('scan-secrets: nothing scanned on this clone yet.');
    return 0;
  }
  console.log(`\n  Last ${lines.length} scans on this clone — ${HISTORY}\n`);
  for (const raw of lines) {
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    const tone = entry.verdict === 'blocked' ? RED : entry.verdict === 'overridden' ? YEL : DIM;
    console.log(
      `  ${tone}${entry.at}  ${entry.verdict.padEnd(10)}${OFF}` +
        `${DIM}${entry.range}  ${entry.files} file(s)${OFF}`,
    );
    for (const finding of entry.findings ?? []) {
      console.log(
        `      ${finding.file}:${finding.line}  ${finding.label}  ${DIM}${finding.print}${OFF}`,
      );
    }
    if (entry.reason) console.log(`      ${YEL}override: ${entry.reason}${OFF}`);
  }
  console.log('');
  return 0;
}

const args = process.argv.slice(2);

const asJson = args.includes('--json');
const rest = args.filter((arg) => arg !== '--json');

if (rest[0] === '--rules') {
  const rules = RULES.map(([rule, label]) => ({ rule, label }));
  rules.push({ rule: 'generic-secret', label: 'a hardcoded secret assignment' });
  console.log(JSON.stringify(rules));
  process.exit(0);
}

if (rest[0] === '--history') {
  process.exit(showHistory(Number(rest[1]) || 20));
}

let range = rest[0];
let label = range;

if (rest[0] === '--staged') {
  range = '--cached';
  label = 'staged changes';
} else if (!range) {
  try {
    const upstream = git('rev-parse', '--abbrev-ref', '@{u}').trim();
    range = `${upstream}..HEAD`;
    label = range;
  } catch {
    range = 'HEAD';
    label = 'working tree against HEAD';
  }
}

const lines = addedLines(range);
if (lines === null) {
  if (asJson) {
    console.log(JSON.stringify({ error: `${range} is not something git can diff` }));
  } else {
    console.error(`scan-secrets: ${range} is not something git can diff.`);
  }
  process.exit(2);
}

const files = new Set(lines.map((line) => line.file));
const permitted = allowed();
const all = scan(lines);
const waved = all.filter((finding) => permitted.has(finding.print));
const found = all.filter((finding) => !permitted.has(finding.print));

const claimed = (process.env.ALLOW_SECRETS ?? '').trim();
const lazy = /^(?:1|y|yes|true|ok|please|force)$/i.test(claimed);
const override = claimed !== '' && !lazy && claimed.length >= 8 ? claimed : null;

const entry = {
  at: new Date().toISOString(),
  range: label,
  files: files.size,
  lines: lines.length,
  verdict: 'clean',
  findings: found.map(({ file, line, rule, label: what, print, length }) => ({
    file,
    line,
    rule,
    label: what,
    print,
    length,
  })),
};

if (found.length === 0) {
  if (waved.length > 0) {
    entry.allowlisted = waved.map((finding) => ({ file: finding.file, print: finding.print }));
  }
  remember(entry);
  if (asJson) {
    console.log(JSON.stringify({ ...entry, allowlistedCount: waved.length }));
    process.exit(0);
  }
  const extra = waved.length > 0 ? `, ${waved.length} allowlisted` : '';
  console.log(
    `${YEL}scan-secrets: clean — ${files.size} file(s), ${lines.length} added line(s)${extra}${OFF}`,
  );
  process.exit(0);
}

entry.verdict = override ? 'overridden' : 'blocked';
if (override) entry.reason = override;
remember(entry);

if (asJson) {
  console.log(JSON.stringify({ ...entry, allowlistedCount: waved.length }));
  process.exit(override ? 0 : 1);
}

console.error(
  `\n${RED}scan-secrets: ${found.length} finding(s) in the lines these commits add${OFF}\n`,
);
for (const finding of found) {
  console.error(`  ${RED}${finding.file}:${finding.line}${OFF}`);
  console.error(
    `    ${finding.label} — ${finding.shown} ${DIM}(${finding.length} chars, fingerprint ${finding.print})${OFF}\n`,
  );
}

if (override) {
  console.error(`${YEL}  Allowed by ALLOW_SECRETS, and written to the scan history:${OFF}`);
  console.error(`${YEL}    "${override}"${OFF}\n`);
  process.exit(0);
}

if (lazy) {
  console.error(
    `${YEL}  ALLOW_SECRETS=${claimed} is not an override. Give it a reason instead —${OFF}\n` +
      `${YEL}  the reason is what the history keeps, and it is the whole point.${OFF}\n`,
  );
}

console.error(
  `${DIM}  Nothing was pushed.\n\n` +
    `  If one of these is a real credential, rotate it. Rewriting the branch is\n` +
    `  not enough on its own — assume anything that reached a commit is known.\n\n` +
    `  If it is a fixture or a false positive, allow that exact value for good:\n\n` +
    `      echo "${found[0].print}  why this one is fine" >> .githooks/allowed-secrets\n\n` +
    `  Or let this push through once, with a reason the history keeps:\n\n` +
    `      ALLOW_SECRETS="why this one is fine" git push\n\n` +
    `  Previous scans:  node scripts/scan-secrets.mjs --history${OFF}\n`,
);

process.exit(1);
