#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHIELD_SRC="${SHIELD_SRC:-/root/website/shield}"
TARGET=/opt/amitista/shield-demo
NODE=/opt/node/bin/node
NPM=/opt/node/bin/npm
USER_NAME=amitista-shield
PANEL_GROUP=amitista-admin
STATE_DIR=/var/lib/amitista/shield
ENV_FILE=/etc/amitista/shield.env

die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || die "needs root — it creates a system user and installs a unit"
[ -x "$NODE" ] || die "no node at $NODE"
[ -f "$SHIELD_SRC/index.js" ] || die "no shield checkout at $SHIELD_SRC"

step "Creating the service user"
if ! id "$USER_NAME" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$USER_NAME"
fi

step "Installing to $TARGET"
mkdir -p "$TARGET"
install -m 0644 "$SRC/evaluate.js" "$TARGET/evaluate.js"
install -m 0644 "$SRC/rules.js" "$TARGET/rules.js"
install -m 0644 "$SRC/flags.js" "$TARGET/flags.js"

cat > "$TARGET/package.json" <<'JSON'
{
  "name": "amitista-shield-demo",
  "private": true,
  "version": "1.0.0",
  "dependencies": {
    "express": "^5.1.0"
  }
}
JSON

step "Installing dependencies"
( cd "$TARGET" && "$NPM" install --omit=dev --no-audit --no-fund >/dev/null ) \
  || die "npm install failed"

step "Vendoring the shield package"
VENDOR="$TARGET/node_modules/@amitista/shield"
rm -rf "$VENDOR"
mkdir -p "$VENDOR"
cp -r "$SHIELD_SRC/src" "$SHIELD_SRC/bin" "$VENDOR/"
cp "$SHIELD_SRC/index.js" "$SHIELD_SRC/register.js" "$SHIELD_SRC/register.mjs" \
   "$SHIELD_SRC/package.json" "$VENDOR/"
cp -r "$SHIELD_SRC/node_modules/acorn" "$SHIELD_SRC/node_modules/acorn-walk" \
   "$TARGET/node_modules/" 2>/dev/null || die "acorn is missing from $SHIELD_SRC/node_modules"

step "Fixing ownership"
chown -R root:root "$TARGET"
chmod -R a+rX "$TARGET"

step "Preparing the state directory"
mkdir -p "$STATE_DIR"
if getent group "$PANEL_GROUP" >/dev/null 2>&1; then
  chown "$USER_NAME:$PANEL_GROUP" "$STATE_DIR"
  chmod 2750 "$STATE_DIR"
  [ -e "$STATE_DIR/flags.jsonl" ] && chgrp "$PANEL_GROUP" "$STATE_DIR/flags.jsonl"
else
  chown "$USER_NAME:$USER_NAME" "$STATE_DIR"
  chmod 0700 "$STATE_DIR"
  printf '  no %s group yet — the panel will read flags over the control port only\n' "$PANEL_GROUP"
fi

step "Setting the control token"
mkdir -p "$(dirname "$ENV_FILE")"
if [ -s "$ENV_FILE" ] && grep -q '^SHIELD_DEMO_CONTROL_TOKEN=' "$ENV_FILE"; then
  printf '  keeping the token already in %s\n' "$ENV_FILE"
else
  TOKEN="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  printf 'SHIELD_DEMO_CONTROL_TOKEN=%s\n' "$TOKEN" > "$ENV_FILE"
  printf '  wrote a new token to %s\n' "$ENV_FILE"
fi
chown root:root "$ENV_FILE"
chmod 0600 "$ENV_FILE"

step "Installing the unit"
install -m 0644 "$SRC/amitista-shield-demo.service" /etc/systemd/system/amitista-shield-demo.service
systemctl daemon-reload
systemctl enable amitista-shield-demo.service >/dev/null
systemctl restart amitista-shield-demo.service

sleep 1
systemctl is-active --quiet amitista-shield-demo.service \
  || die "service failed to start — journalctl -u amitista-shield-demo -n 40"

step "Verifying"
RESPONSE="$(curl -sf -X POST http://127.0.0.1:8093/evaluate \
  -H 'content-type: application/json' \
  -d '{"scenario":"shell","input":"hi; whoami"}')" || die "evaluator did not answer"

printf '%s' "$RESPONSE" | grep -q '"verdict":"blocked"' \
  || die "evaluator answered but did not block a command injection: $RESPONSE"

TOKEN="$(sed -n 's/^SHIELD_DEMO_CONTROL_TOKEN=//p' "$ENV_FILE" | head -1)"
STATE="$(curl -sf "http://127.0.0.1:8093/admin/state?limit=1" \
  -H "X-Shield-Control: $TOKEN")" || die "the control port refused the token"

printf '%s' "$STATE" | grep -q '"mode"' \
  || die "the control port answered without a mode: $STATE"

if systemctl is-active --quiet amitista-admin.service; then
  if runuser -u "$PANEL_GROUP" -- python3 /opt/amitista/admin-api/admin_api.py --check-owner >/dev/null 2>&1; then
    step "Restarting the panel so it picks up the control token"
    systemctl restart amitista-admin.service
    sleep 1
    HEALTH="$(curl -fsS --max-time 5 http://127.0.0.1:8788/healthz || true)"
    case "$HEALTH" in
      *'"configured":'*true*) printf '  panel is back: %s\n' "$HEALTH" ;;
      *) printf '\033[33m  warning: the panel came back as %s — check journalctl -u amitista-admin\033[0m\n' "${HEALTH:-unreachable}" ;;
    esac
  else
    printf '\033[33m  not restarting the panel: it has no owner account in its store,\n'
    printf '  so a restart would answer 503 to every sign-in. Once that is sorted:\n'
    printf '    systemctl restart amitista-admin\033[0m\n'
  fi
fi

printf '\n\033[1m==> shield-demo is live on 127.0.0.1:8093, control port included\033[0m\n'
