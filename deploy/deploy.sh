#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ -f deploy/deploy.env ]; then
    . deploy/deploy.env
fi

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/amitista.com}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

DRY_RUN=""
SKIP_BUILD=""
for arg in "$@"; do
    case "$arg" in
        --dry-run)    DRY_RUN="--dry-run" ;;
        --skip-build) SKIP_BUILD="1" ;;
        *) echo "unknown argument: $arg" >&2; exit 2 ;;
    esac
done

if [ -z "$DEPLOY_HOST" ]; then
    echo "DEPLOY_HOST is not set. Put it in deploy/deploy.env or pass it in:" >&2
    echo "  DEPLOY_HOST=root@your.server ./deploy/deploy.sh" >&2
    exit 2
fi

if [ -z "$SKIP_BUILD" ]; then
    echo "==> Building"
    npm run build
fi

if [ ! -f dist/index.html ]; then
    echo "dist/index.html is missing — nothing to deploy." >&2
    exit 1
fi

if [ ! -f dist/sitemap.xml ]; then
    echo
    echo "    Warning: dist/sitemap.xml was not generated."
    echo "    SITE_URL is empty in src/siteConfig.js, so the build also left the"
    echo "    Sitemap line out of robots.txt and the Canonical/Policy lines out"
    echo "    of security.txt. The site will work; search engines get less."
    echo
fi
if ! grep -q "^Canonical:" dist/.well-known/security.txt 2>/dev/null; then
    echo "    Warning: security.txt has no Canonical line (same cause as above)."
    echo
fi

RELEASE="$(date -u +%Y%m%d-%H%M%S)"
RELEASE_DIR="$DEPLOY_ROOT/releases/$RELEASE"

SSH="ssh -p $DEPLOY_PORT"

echo "==> Deploying to $DEPLOY_HOST:$RELEASE_DIR"

if [ -n "$DRY_RUN" ]; then
    echo "    (dry run — no files are transferred and no symlink is moved)"
fi

$SSH "$DEPLOY_HOST" "mkdir -p '$DEPLOY_ROOT/releases'"

rsync -az --delete $DRY_RUN \
    -e "$SSH" \
    dist/ "$DEPLOY_HOST:$RELEASE_DIR/"

if [ -n "$DRY_RUN" ]; then
    echo "==> Dry run finished."
    exit 0
fi

$SSH "$DEPLOY_HOST" "ln -sfn '$RELEASE_DIR' '$DEPLOY_ROOT/current.new' && mv -T '$DEPLOY_ROOT/current.new' '$DEPLOY_ROOT/current'"

echo "==> Live: $RELEASE"

$SSH "$DEPLOY_HOST" "cd '$DEPLOY_ROOT/releases' && ls -1dt */ | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf"

echo
echo "Check it with a fresh tab on a page that is not the home page — the SPA"
echo "fallback only shows up as broken on a direct hit or a refresh:"
echo "  https://amitista.com/work/ocean-scanner"
echo
echo "To roll back:"
echo "  $SSH $DEPLOY_HOST \"ls -1dt $DEPLOY_ROOT/releases/*/\""
echo "  $SSH $DEPLOY_HOST \"ln -sfn <release> $DEPLOY_ROOT/current.new && mv -T $DEPLOY_ROOT/current.new $DEPLOY_ROOT/current\""
