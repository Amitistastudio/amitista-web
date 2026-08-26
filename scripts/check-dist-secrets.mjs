import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../dist", import.meta.url));

const BANNED_EXT = new Set(
  ("bak backup old orig original save swp swo swn tmp temp rej dist log sql sqlite db " +
   "env ini cfg conf config yml yaml toml key pem crt p12 pfx sh bash zip tar tgz rar 7z")
    .split(" "),
);

const BANNED_NAME = new Set(["env", "environment", "config", "secrets", "credentials"]);

const ALLOWED_DOTDIR = ".well-known";

const TEXTUAL = new Set([".js", ".mjs", ".css", ".html", ".txt", ".json", ".xml", ".svg", ".map"]);

const SECRETS = [
  [/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/i, "a Discord webhook URL"],
  [/\b[MNO][A-Za-z\d_-]{23,25}\.[A-Za-z\d_-]{6,7}\.[A-Za-z\d_-]{27,38}\b/, "a Discord bot token"],
  [/\bAuthorization["'`\s:=]+Bot\s+[A-Za-z\d_.-]{20,}/i, "a Discord bot authorization header"],
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, "a private key block"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key id"],
  [/\bxox[baprs]-[\w-]{10,}/, "a Slack token"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "a GitHub token"],
  [/\bsk-(?:live|proj)?-?[A-Za-z0-9]{24,}\b/, "an API secret key"],
  [/["'`]?(?:webhook_url|api_?secret|client_?secret|private_?key)["'`]?\s*[:=]\s*["'`][^"'`\n]{16,}["'`]/i,
   "a hardcoded secret assignment"],
];

const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(DIST, full);

    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") && entry.name !== ALLOWED_DOTDIR) {
        findings.push(`${rel}/ — dotted directory that is not ${ALLOWED_DOTDIR}`);
        continue;
      }
      walk(full);
      continue;
    }
    if (!entry.isFile()) continue;

    const bare = entry.name.replace(/\.(?:gz|br)$/, "");
    const ext = extname(bare).slice(1).toLowerCase();
    const stem = basename(bare, extname(bare)).toLowerCase();
    const insideWellKnown = rel.split(/[\\/]/)[0] === ALLOWED_DOTDIR;

    if (bare.startsWith(".") && !insideWellKnown) {
      findings.push(`${rel} — dotfile in the web root`);
    } else if (BANNED_EXT.has(ext)) {
      findings.push(`${rel} — .${ext} file (backup, config or credential shaped)`);
    } else if (BANNED_NAME.has(stem) && !insideWellKnown) {
      findings.push(`${rel} — named "${stem}"`);
    } else if (/[~#]$/.test(bare)) {
      findings.push(`${rel} — editor leftover`);
    }

    if (!TEXTUAL.has(extname(bare).toLowerCase())) continue;
    if (entry.name.endsWith(".gz") || entry.name.endsWith(".br")) continue;
    if (statSync(full).size > 8 * 1024 * 1024) continue;

    const text = readFileSync(full, "utf8");
    for (const [pattern, label] of SECRETS) {
      const hit = text.match(pattern);
      if (!hit) continue;
      const line = text.slice(0, hit.index).split("\n").length;
      findings.push(`${rel}:${line} — ${label} (${hit[0].slice(0, 12)}…)`);
    }
  }
}

try {
  statSync(DIST);
} catch {
  console.error("check-dist-secrets: no dist/ to check — run the build first.");
  process.exit(1);
}

walk(DIST);

if (findings.length > 0) {
  console.error("\n  Refusing the build — dist/ contains things that must never be served:\n");
  for (const finding of findings) console.error(`    ${finding}`);
  console.error(
    "\n  Anything listed here would be uploaded to the web root by a deploy.\n" +
      "  If it is a credential, treat it as compromised and rotate it: a build\n" +
      "  that reached dist/ may already have reached a browser.\n",
  );
  process.exit(1);
}

console.log("check-dist-secrets: clean.");
