#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=/opt/amitista/api-gateway
ACCOUNT=amitista-api
ADMIN_ACCOUNT=amitista-admin
TOKENS_DIR=/var/lib/amitista/tokens
USAGE_DIR=/var/lib/amitista/api

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31minstall failed: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "needs root — it creates a system user and installs a unit"

getent passwd "$ADMIN_ACCOUNT" >/dev/null || die "install the admin API first — $ADMIN_ACCOUNT does not exist"

say "Account"
if ! getent group "$ACCOUNT" >/dev/null; then
  groupadd --system "$ACCOUNT"
fi
if ! getent passwd "$ACCOUNT" >/dev/null; then
  useradd --system --gid "$ACCOUNT" --home-dir /nonexistent --shell /usr/sbin/nologin "$ACCOUNT"
fi

say "Files"
install -d -m 755 "$TARGET"
install -m 755 "$SRC/api_gateway.py" "$TARGET/api_gateway.py"
python3 -m py_compile "$TARGET/api_gateway.py" || die "python syntax check failed"

install -d -m 2750 -o "$ADMIN_ACCOUNT" -g "$ACCOUNT" "$TOKENS_DIR"
install -d -m 2750 -o "$ACCOUNT" -g "$ADMIN_ACCOUNT" "$USAGE_DIR"
chmod g+s "$TOKENS_DIR" "$USAGE_DIR"

if [ -f "$TOKENS_DIR/tokens.json" ]; then
  chown "$ADMIN_ACCOUNT:$ACCOUNT" "$TOKENS_DIR/tokens.json"
  chmod 640 "$TOKENS_DIR/tokens.json"
fi

say "Units"
install -m 644 "$SRC/amitista-api.service" /etc/systemd/system/amitista-api.service
systemctl daemon-reload

say "Starting"
# enable, then restart. `enable --now` starts a stopped unit but leaves a
# running one exactly as it is, so a deploy would install new code into /opt
# and the old process would keep serving it — reporting success the whole
# time. restart starts a stopped unit too, so this covers a first install.
systemctl enable amitista-api.service
systemctl restart amitista-api.service
sleep 1
systemctl is-active --quiet amitista-api.service || die "amitista-api.service did not stay up — journalctl -u amitista-api"

HEALTH="$(curl -fsS --max-time 5 http://127.0.0.1:8789/api/k/healthz || true)"
[ -n "$HEALTH" ] || die "the gateway is not answering on 127.0.0.1:8789"
echo "  healthz: $HEALTH"

say "Done"
cat <<'NOTE'
Two things are still needed by hand, and neither is done here because both touch
files that nginx reads as a whole:

  1. In /etc/nginx/nginx.conf, beside the other amitista_* zones:

       limit_req_zone  $binary_remote_addr zone=amitista_gateway:1m rate=120r/m;

  2. In the site's server block:

       include /etc/nginx/snippets/amitista-api-gateway.conf;

Install that snippet first:

  install -m 644 deploy/nginx/snippets/amitista-api-gateway.conf \
    /etc/nginx/snippets/amitista-api-gateway.conf

Then nginx -t before any reload. A missing zone declaration stops nginx from
starting, not just from reloading.
NOTE
