'use strict';

// Credentials committed to source. Provider formats are matched exactly because
// a precise pattern has close to no false positives; the generic assignment rule
// below is the noisy one and is deliberately narrowed hard.

const { merged } = require('./feed');

const PATTERNS = [
  { id: 'aws-access-key', severity: 'critical', label: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'github-token', severity: 'critical', label: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { id: 'slack-token', severity: 'critical', label: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { id: 'stripe-key', severity: 'critical', label: 'Stripe live secret key', re: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { id: 'google-api-key', severity: 'high', label: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'private-key', severity: 'critical', label: 'private key block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: 'discord-token', severity: 'critical', label: 'Discord bot token', re: /\b[MNO][A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b/ },
  { id: 'jwt', severity: 'medium', label: 'hardcoded JSON web token', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { id: 'postgres-url', severity: 'critical', label: 'database URL with a password', re: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:'"]+:[^\s@'"]{3,}@/ },
];

const ASSIGNMENT = /\b(password|passwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*(['"`])([^'"`\n]{8,})\2/gi;

// Values that are obviously not a live credential.
const PLACEHOLDER = /^(?:x{3,}|\*{3,}|\.{3,}|<.*>|\$\{.*\}|change[_-]?me|your[_-]?\w+|example|placeholder|redacted|dummy|test|todo|none|null|undefined|secret|password|hunter2|abc123|123456\d*)$/i;

const IGNORED_LINE = /process\.env|import\.meta\.env|process\[.env.\]|getenv|readFileSync|require\(/;

function entropy(value) {
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) || 0) + 1);
  let total = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    total -= p * Math.log2(p);
  }
  return total;
}

function scanSource(source, file) {
  const findings = [];
  const lines = source.split('\n');
  // Provider credential formats are the part of this file that dates fastest —
  // every new platform mints a new prefix — and they are also the safest thing
  // to publish live, because a wrong one costs a false positive in a report
  // rather than a refused request.
  const patterns = merged('secretPatterns', PATTERNS);

  lines.forEach((line, index) => {
    if (line.length > 4000) return;

    for (const pattern of patterns) {
      const match = pattern.re.exec(line);
      if (!match) continue;
      findings.push({
        id: 'hardcoded-secret',
        kind: pattern.id,
        severity: pattern.severity,
        label: pattern.label,
        file,
        line: index + 1,
        fragment: `${match[0].slice(0, 12)}…`,
      });
    }

    if (IGNORED_LINE.test(line)) return;

    ASSIGNMENT.lastIndex = 0;
    let assigned;
    while ((assigned = ASSIGNMENT.exec(line)) !== null) {
      const [, name, , value] = assigned;
      if (PLACEHOLDER.test(value)) continue;
      if (entropy(value) < 3) continue;
      findings.push({
        id: 'hardcoded-secret',
        kind: 'assigned-credential',
        severity: 'high',
        label: `${name.toLowerCase()} assigned a literal value`,
        file,
        line: index + 1,
        fragment: `${value.slice(0, 4)}…${value.length} chars, entropy ${entropy(value).toFixed(1)}`,
      });
    }
  });

  return findings;
}

module.exports = { scanSource, entropy, PATTERNS };
