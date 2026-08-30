#!/usr/bin/env bash
set -euo pipefail

HEADERS=/etc/nginx/snippets/amitista-security-headers.conf
LINKS=/etc/nginx/snippets/amitista-preload-links.conf
BACKUPS=/var/backups/amitista-nginx
STAMP="$(date -u +%Y%m%d-%H%M%S)"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31mapply failed: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "needs root — it writes /etc/nginx and reloads nginx"

CONF="$(readlink -f /etc/nginx/sites-enabled/amitista.com.conf || true)"
[ -f "$CONF" ] || die "/etc/nginx/sites-enabled/amitista.com.conf does not resolve to a file"
[ -f "$HEADERS" ] || die "$HEADERS is not there"

say "Backing up to $BACKUPS/$STAMP"
install -d -m 700 "$BACKUPS/$STAMP"
cp -L "$CONF" "$BACKUPS/$STAMP/amitista.com.conf"
cp -L "$HEADERS" "$BACKUPS/$STAMP/amitista-security-headers.conf"
[ -f "$LINKS" ] && cp -L "$LINKS" "$BACKUPS/$STAMP/amitista-preload-links.conf"

restore() {
  cat "$BACKUPS/$STAMP/amitista.com.conf" > "$CONF"
  cat "$BACKUPS/$STAMP/amitista-security-headers.conf" > "$HEADERS"
  if [ -f "$BACKUPS/$STAMP/amitista-preload-links.conf" ]; then
    cat "$BACKUPS/$STAMP/amitista-preload-links.conf" > "$LINKS"
  else
    rm -f "$LINKS"
  fi
}

if [ ! -f "$LINKS" ]; then
  say "Seeding $LINKS"
  cat > "$LINKS" <<'EOF'
set $preload_links_home "</fonts/dm-sans-latin-normal.woff2>; rel=preload; as=font; type=font/woff2; crossorigin";
set $preload_links "</fonts/dm-sans-latin-normal.woff2>; rel=preload; as=font; type=font/woff2; crossorigin";
EOF
fi

say "Patching the live configuration"
python3 - "$CONF" "$HEADERS" <<'PY' || { restore; die "the patch did not apply cleanly (restored the backups)"; }
import pathlib, sys

conf_path, headers_path = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
conf, headers = conf_path.read_text(), headers_path.read_text()
changed = []

def swap(text, old, new, label, expect=1, marker=None):
    already = marker in text if marker else (new in text and old not in text)
    if already:
        print(f"  skip  {label} (already applied)")
        return text
    if text.count(old) != expect:
        raise SystemExit(f"  FAIL  {label}: expected {expect} match, found {text.count(old)}")
    print(f"  ok    {label}")
    changed.append(label)
    return text.replace(old, new, expect)

headers = swap(
    headers,
    '# Two years, subdomains included. Read the note in the runbook before adding\n'
    '# `preload` — that one is effectively irreversible.\n'
    'add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;',
    '# Two years, subdomains included, and preload — added 15 August 2026.\n'
    '#\n'
    '# `preload` is the directive hstspreload.org requires before it will accept a\n'
    '# submission, and the header on its own changes nothing: no browser treats the\n'
    '# site as preloaded until it ships in Chromium\'s list. So setting it here is\n'
    '# reversible. *Submitting* is the step that is not — removal from the list takes\n'
    '# months to reach released browsers, and until it does, any subdomain that\n'
    '# cannot do HTTPS is unreachable rather than merely insecure.\n'
    '#\n'
    '# The precondition for includeSubDomains is that every host under the zone\n'
    '# serves HTTPS. Checked against the authoritative nameserver rather than a\n'
    '# recursive resolver, for the reason in the Cloudflare runbook: the zone\n'
    '# publishes exactly one subdomain, `www`, proxied by Cloudflare on both A and\n'
    '# AAAA and 301ing to the apex over TLS. mta-sts.amitista.com has a vhost on this\n'
    '# box but no DNS record at all, so nothing resolves to a plaintext-only host.\n'
    '# Anything added to the zone later has to be HTTPS from the first minute.\n'
    'add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;',
    "HSTS preload directive",
)

conf = swap(
    conf,
    '    set $corp "same-origin";\n',
    '    set $corp "same-origin";\n'
    '\n'
    '    # $preload_links / $preload_links_home, the Link header the HTML locations\n'
    '    # send. Generated per release because it names the fingerprinted stylesheet;\n'
    '    # see the note in the file itself.\n'
    '    include /etc/nginx/snippets/amitista-preload-links.conf;\n',
    "server-level include of the preload-links snippet",
    marker='include /etc/nginx/snippets/amitista-preload-links.conf;',
)

conf = swap(
    conf,
    '        include /etc/nginx/snippets/amitista-security-headers.conf;\n'
    '        add_header Cache-Control "no-cache, must-revalidate" always;\n'
    '        try_files /home.html /index.html;',
    '        include /etc/nginx/snippets/amitista-security-headers.conf;\n'
    '        add_header Cache-Control "no-cache, must-revalidate" always;\n'
    '\n'
    '        # The font is the only subresource the home page needs off the network —\n'
    '        # its CSS is inlined — so this is the font alone. Cloudflare reads this\n'
    '        # header and replays it as a 103 Early Hints response ahead of the origin\n'
    '        # 200, which is the only way to start the font before the HTML arrives.\n'
    '        # It also works without Early Hints: a Link header is processed before the\n'
    '        # body either way.\n'
    '        add_header Link $preload_links_home always;\n'
    '\n'
    '        # Speculation rules by header rather than by <script type="speculationrules">,\n'
    '        # because script-src \'self\' governs that script type too and an inline one\n'
    '        # would need a hash in the CSP for every page. The header points at a\n'
    '        # same-origin JSON document instead, which needs no CSP change at all.\n'
    '        add_header Speculation-Rules "\\"/speculation-rules.json\\"" always;\n'
    '\n'
    '        try_files /home.html /index.html;',
    "Link + Speculation-Rules on location = /",
)

conf = swap(
    conf,
    '        include /etc/nginx/snippets/amitista-security-headers.conf;\n'
    '        add_header Cache-Control "no-cache, must-revalidate" always;\n'
    '\n'
    '        # $uri first so a real file — /og.png, /favicon.png — still wins.\n'
    '        try_files $uri /routes$uri.html =404;',
    '        include /etc/nginx/snippets/amitista-security-headers.conf;\n'
    '        add_header Cache-Control "no-cache, must-revalidate" always;\n'
    '\n'
    '        # Font and stylesheet. Every route but / links the stylesheet, so both are\n'
    '        # on the critical path here. See `location = /` for what this buys.\n'
    '        add_header Link $preload_links always;\n'
    '        add_header Speculation-Rules "\\"/speculation-rules.json\\"" always;\n'
    '\n'
    '        # $uri first so a real file — /og.png, /favicon.png — still wins.\n'
    '        try_files $uri /routes$uri.html =404;',
    "Link + Speculation-Rules on location /",
)

conf = swap(
    conf,
    '    location = /404.html {\n'
    '        internal;\n'
    '        include /etc/nginx/snippets/amitista-security-headers.conf;\n'
    '        add_header Cache-Control "no-cache, must-revalidate" always;\n'
    '    }',
    '    location = /404.html {\n'
    '        internal;\n'
    '        include /etc/nginx/snippets/amitista-security-headers.conf;\n'
    '        add_header Cache-Control "no-cache, must-revalidate" always;\n'
    '        add_header Link $preload_links always;\n'
    '    }',
    "Link on location = /404.html",
)

conf = swap(
    conf,
    '    location ~* ^/(work|team)/.+\\.(webp|avif|png|jpe?g|gif|svg)$ {\n'
    '        include /etc/nginx/snippets/amitista-security-headers.conf;\n'
    '        add_header Cache-Control "public, max-age=3600" always;',
    '    # These are the unfingerprinted originals — the <img src> fallback the\n'
    '    # manifest points at when a browser takes neither the avif nor the webp\n'
    '    # source. An hour was far too short for files that change when a project\n'
    '    # does, which is a handful of times a year. A week of freshness plus a month\n'
    '    # of stale-while-revalidate means a replaced image is picked up in the\n'
    '    # background on the next visit rather than blocking one.\n'
    '    location ~* ^/(work|team)/.+\\.(webp|avif|png|jpe?g|gif|svg)$ {\n'
    '        include /etc/nginx/snippets/amitista-security-headers.conf;\n'
    '        add_header Cache-Control "public, max-age=604800, stale-while-revalidate=2592000" always;',
    "cache policy for /work and /team images",
)

conf = swap(
    conf,
    '        add_header Cache-Control "public, max-age=86400" always;\n'
    '        try_files $uri =404;\n'
    '    }\n'
    '\n'
    '    # Rewritten by scripts/generate-sitemap.mjs on every build.',
    '        # amitista-logo.png is in the header of all 79 pages, so this one is on\n'
    '        # every navigation. A day meant a revalidation a day per visitor for a file\n'
    '        # that changes when the brand does.\n'
    '        add_header Cache-Control "public, max-age=2592000, stale-while-revalidate=2592000" always;\n'
    '        try_files $uri =404;\n'
    '    }\n'
    '\n'
    '    # Rewritten by scripts/generate-sitemap.mjs on every build.',
    "cache policy for the icon and og images",
)

conf = swap(
    conf,
    '    location ~* ^/(robots\\.txt|sitemap\\.xml)$ {\n'
    '        include /etc/nginx/snippets/amitista-security-headers.conf;\n'
    '        add_header Cache-Control "public, max-age=3600" always;\n'
    '        try_files $uri =404;\n'
    '    }',
    '    location ~* ^/(robots\\.txt|sitemap\\.xml)$ {\n'
    '        include /etc/nginx/snippets/amitista-security-headers.conf;\n'
    '        add_header Cache-Control "public, max-age=3600, stale-while-revalidate=86400" always;\n'
    '        try_files $uri =404;\n'
    '    }\n'
    '\n'
    '    # The document the Speculation-Rules header points at. The media type is the\n'
    '    # load-bearing part: a browser fetches this with Accept:\n'
    '    # application/speculationrules+json and drops the rules on the floor if the\n'
    '    # response comes back as anything else — silently, with the only symptom\n'
    '    # being that navigations are not instant. nginx has no mapping for the\n'
    '    # extension, so it is set here rather than in mime.types.\n'
    '    location = /speculation-rules.json {\n'
    '        include /etc/nginx/snippets/amitista-security-headers.conf;\n'
    '        add_header Cache-Control "public, max-age=3600, stale-while-revalidate=86400" always;\n'
    '        types { }\n'
    '        default_type application/speculationrules+json;\n'
    '        try_files $uri =404;\n'
    '    }',
    "location for /speculation-rules.json",
    marker='location = /speculation-rules.json {',
)

conf = swap(
    conf,
    '        add_header Cache-Control "public, max-age=3600, stale-while-revalidate=86400" always;\n'
    '        default_type application/speculationrules+json;',
    '        # `default_type` alone is not enough: it is only the fallback for a URI whose\n'
    '        # extension nginx cannot map, and mime.types already maps .json to\n'
    '        # application/json — so this location served application/json and every\n'
    '        # browser silently ignored the rules. Emptying the type map for this one\n'
    '        # location is what makes default_type the answer rather than the fallback.\n'
    '        add_header Cache-Control "public, max-age=3600, stale-while-revalidate=86400" always;\n'
    '        types { }\n'
    '        default_type application/speculationrules+json;',
    "empty types map so the speculation rules get their own media type",
    marker='types { }',
)

conf_path.write_text(conf)
headers_path.write_text(headers)
print(f"\n  {len(changed)} change(s) written" if changed else "\n  nothing to do — already applied")
PY

say "Testing the configuration"
if ! nginx -t; then
  restore
  die "nginx rejected the patched configuration (restored the backups)"
fi

say "Reloading"
systemctl reload nginx || { restore; systemctl reload nginx || true; die "reload failed (restored the backups)"; }

sleep 1

say "Checking what is served"
python3 - <<'PY' || die "the served headers are not what was just installed"
import subprocess, sys

def head(path):
    out = subprocess.run(["curl", "-sSI", f"https://amitista.com{path}"],
                         capture_output=True, text=True).stdout.lower()
    return out

def check(name, ok):
    print(("  ok    " if ok else "  FAIL  ") + name)
    return ok

home, route = head("/"), head("/privacy")
rules = head("/speculation-rules.json")

results = [
    check("HSTS carries preload", "includesubdomains; preload" in home),
    check("/ sends a Link preload for the font", "link:" in home and "as=font" in home),
    check("/ does not preload a stylesheet it inlines", "as=style" not in home),
    check("/privacy sends a Link preload for font and stylesheet",
          "as=font" in route and "as=style" in route),
    check("/ sends Speculation-Rules", "speculation-rules:" in home),
    check("/privacy sends Speculation-Rules", "speculation-rules:" in route),
]

if " 404 " in rules.splitlines()[0]:
    print("  note  /speculation-rules.json is not in the live release yet — the header is\n"
          "        installed and inert until deploy/deploy-local.sh publishes a build that\n"
          "        ships public/speculation-rules.json. Nothing to fix in nginx.")
else:
    results.append(check("/speculation-rules.json is served as speculationrules+json",
                         "application/speculationrules+json" in rules))

sys.exit(0 if all(results) else 1)
PY

say "Applied. Backups in $BACKUPS/$STAMP"
