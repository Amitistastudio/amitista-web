#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBROOT=/var/www/amitista.com
RELEASES="$WEBROOT/releases"
CURRENT="$WEBROOT/current"
HASH_SNIPPET=/etc/nginx/snippets/amitista-csp-style-hash.conf
LINK_SNIPPET=/etc/nginx/snippets/amitista-preload-links.conf
FONT_LINK='</fonts/dm-sans-latin-normal.woff2>; rel=preload; as=font; type=font/woff2; crossorigin'
KEEP=5

export PATH=/opt/node/bin:$PATH

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31mdeploy failed: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "needs root — it writes /etc/nginx and reloads nginx"

if [ "${1:-}" != "--no-build" ]; then
  say "Building"
  ( cd "$REPO" && npm run build ) || die "build failed"
fi

DIST="$REPO/dist"
[ -f "$DIST/home.html" ] || die "dist/home.html missing — did prerender run?"
[ -f "$DIST/index.html" ] || die "dist/index.html missing"
[ -f "$DIST/csp-style-hash.txt" ] || die "dist/csp-style-hash.txt missing — prerender did not emit the CSP hash"

HASH="$(cat "$DIST/csp-style-hash.txt")"
[ -n "$HASH" ] || die "CSP hash file is empty"

say "Checking the artefact"
python3 - "$DIST" "$HASH" <<'PY' || die "artefact checks failed"
import sys, pathlib, re, hashlib, base64
dist, hash_claimed = pathlib.Path(sys.argv[1]), sys.argv[2]
home = (dist / "home.html").read_text()
index = (dist / "index.html").read_text()
routes = sorted((dist / "routes").rglob("*.html"))
blank = [p for p in routes if '<div id="root"></div>' in p.read_text()]
styled = [p for p in routes if ' style="' in p.read_text()]

def check(name, ok):
    print(("  ok    " if ok else "  FAIL  ") + name)
    return ok

style = re.search(r"<style>(.*?)</style>", home, re.S)
digest = "sha256-" + base64.b64encode(
    hashlib.sha256(style.group(1).encode()).digest()
).decode() if style else None

module_tags = re.findall(r'<script type="module"[^>]*>|<link rel="modulepreload"[^>]*>', home)

results = [
    check("home.html is prerendered", '<div id="root"></div>' not in home and len(home) > 40000),
    check("home.html has an inlined <style>", style is not None),
    check("hash file matches the inlined stylesheet", digest == hash_claimed),
    check("home.html has no external stylesheet link", '<link rel="stylesheet"' not in home),
    check("home.html carries no style= attribute", ' style="' not in home),
    check(f"all {len(module_tags)} module tags in home.html are deprioritised",
          len(module_tags) > 0 and all('fetchpriority="low"' in t for t in module_tags)),
    check("index.html is still the empty SPA shell", '<div id="root"></div>' in index),
    check("index.html still links the external stylesheet", '<link rel="stylesheet"' in index),
    check("index.html is not deprioritised", "fetchpriority" not in index),
    check(f"all {len(routes)} routes are prerendered, none left an empty shell",
          len(routes) > 70 and not blank),
    check("no route carries a style= attribute the CSP would block",
          not styled),
    check("every document is wrapped in Cloudflare email_off markers",
          all("<body><!--email_off-->" in p.read_text() and "<!--/email_off--></body>" in p.read_text()
              for p in [dist / "home.html", dist / "index.html", dist / "404.html", *routes])),
    check("the speculation rules the header points at are in the artefact",
          (dist / "speculation-rules.json").is_file()),
    check("/work preloads its LCP image from the head",
          'rel="preload" as="image"' in (dist / "routes" / "work.html").read_text()),
]
sys.exit(0 if all(results) else 1)
PY

say "Scanning the artefact for files that must never reach the web root"
LEAKS="$(cd "$DIST" && find . -mindepth 1 \( -path ./.well-known -o -path './.well-known/*' \) -prune -o \( -name '.*' -o -name '*~' -o -name '*#' -o -iname 'env' -o -iname 'environment' -o -iname 'config' -o -iname 'secrets' -o -iname 'credentials' -o -iname 'env.*' -o -iname 'environment.*' -o -iname 'config.*' -o -iname 'secrets.*' -o -iname 'credentials.*' -o -iname '*.bak' -o -iname '*.backup' -o -iname '*.old' -o -iname '*.orig' -o -iname '*.original' -o -iname '*.save' -o -iname '*.swp' -o -iname '*.swo' -o -iname '*.swn' -o -iname '*.tmp' -o -iname '*.temp' -o -iname '*.rej' -o -iname '*.dist' -o -iname '*.log' -o -iname '*.sql' -o -iname '*.sqlite' -o -iname '*.db' -o -iname '*.env' -o -iname '*.ini' -o -iname '*.cfg' -o -iname '*.conf' -o -iname '*.config' -o -iname '*.yml' -o -iname '*.yaml' -o -iname '*.toml' -o -iname '*.key' -o -iname '*.pem' -o -iname '*.crt' -o -iname '*.p12' -o -iname '*.pfx' -o -iname '*.sh' -o -iname '*.bash' -o -iname '*.zip' -o -iname '*.tar' -o -iname '*.tgz' -o -iname '*.rar' -o -iname '*.7z' \) -print)"
if [ -n "$LEAKS" ]; then
  printf '%s\n' "$LEAKS" >&2
  die "dist contains files that must never be published — remove them and rebuild"
fi

CSS_NAME="$(cd "$DIST/assets" && ls -1 index-*.css 2>/dev/null | head -n1)"
[ -n "$CSS_NAME" ] || die "no dist/assets/index-*.css — cannot build the preload Link header"

say "Installing the CSP hash and the preload Link headers"
PREVIOUS_SNIPPET="$(cat "$HASH_SNIPPET" 2>/dev/null || true)"
PREVIOUS_LINKS="$(cat "$LINK_SNIPPET" 2>/dev/null || true)"
cat > "$HASH_SNIPPET" <<EOF
set \$csp_style_hash " '$HASH'";
EOF
cat > "$LINK_SNIPPET" <<EOF
set \$preload_links_home "$FONT_LINK";
set \$preload_links "$FONT_LINK, </assets/$CSS_NAME>; rel=preload; as=style";
EOF

if ! nginx -t >/dev/null 2>&1; then
  printf '%s' "$PREVIOUS_SNIPPET" > "$HASH_SNIPPET"
  printf '%s' "$PREVIOUS_LINKS" > "$LINK_SNIPPET"
  nginx -t || true
  die "nginx rejected a generated snippet (restored the previous ones)"
fi

say "Publishing the release"
PREVIOUS="$(readlink -f "$CURRENT" || true)"
REL="$RELEASES/$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$REL"
cp -a "$DIST/." "$REL"/
rm -f "$REL/csp-style-hash.txt"
chown -R www-data:www-data "$REL"

ln -sfn "$REL" "$CURRENT.tmp"
mv -Tf "$CURRENT.tmp" "$CURRENT"
systemctl reload nginx || die "nginx reload failed"

sleep 2

say "Verifying what the server actually serves"
if ! python3 - <<'PY'
import subprocess, re, sys, hashlib, base64, tempfile, os

def fetch(path):
    fd, hp = tempfile.mkstemp()
    os.close(fd)
    try:
        body = subprocess.run(["curl", "-sk", "-D", hp, f"https://amitista.com{path}"],
                              capture_output=True, text=True).stdout
        with open(hp) as f:
            head = f.read()
    finally:
        os.unlink(hp)
    return head, body

def check(name, ok):
    print(("  ok    " if ok else "  FAIL  ") + name)
    return ok

head, home = fetch("/")
_, other = fetch("/privacy")

style = re.search(r"<style>(.*?)</style>", home, re.S)
served_hash = "sha256-" + base64.b64encode(
    hashlib.sha256(style.group(1).encode()).digest()
).decode() if style else "<no inline style served>"
csp = next((l for l in head.splitlines()
            if l.lower().startswith("content-security-policy:")), "")

results = [
    check("/ returns 200", head.splitlines()[0].split()[1] == "200"),
    check("/ is prerendered", '<div id="root"></div>' not in home),
    check("/ serves an inlined stylesheet", style is not None),
    check(f"/ CSP authorises the served stylesheet ({served_hash[:24]}…)",
          served_hash in csp),
    check("/ CSP still forbids unsafe-inline", "unsafe-inline" not in csp),
    check("/privacy is prerendered, not an empty shell",
          '<div id="root"></div>' not in other and len(other) > 20000),
    check("/privacy still links the external stylesheet", '<link rel="stylesheet"' in other),
    check("/privacy carries no style= attribute", ' style="' not in other),
    check("no Cloudflare email-decode script was injected into /",
          "email-decode" not in home and "/cdn-cgi/l/email-protection" not in home),
    check("no Cloudflare email-decode script was injected into /privacy",
          "email-decode" not in other and "/cdn-cgi/l/email-protection" not in other),
]
sys.exit(0 if all(results) else 1)
PY
then
  printf '\033[31mverification failed — rolling back\033[0m\n' >&2
  if [ -n "$PREVIOUS" ]; then
    ln -sfn "$PREVIOUS" "$CURRENT.tmp"; mv -Tf "$CURRENT.tmp" "$CURRENT"
    printf '%s' "$PREVIOUS_SNIPPET" > "$HASH_SNIPPET"
    printf '%s' "$PREVIOUS_LINKS" > "$LINK_SNIPPET"
    systemctl reload nginx || true
    printf 'rolled back to %s\n' "$PREVIOUS" >&2
  fi
  die "the release was not serving correctly"
fi

( cd "$RELEASES" && ls -1t | tail -n +$((KEEP + 1)) | xargs -r rm -rf )

say "Deployed $REL"
