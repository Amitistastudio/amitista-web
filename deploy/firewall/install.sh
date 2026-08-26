#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SRC/.." && pwd)"
TARGET=/opt/amitista/firewall
STATE_DIR=/var/lib/amitista/admin/session
STAGED="$STATE_DIR/firewall.conf"
LIVE=/etc/nginx/conf.d/amitista-firewall.conf
SNIPPET=/etc/nginx/snippets/amitista-firewall.conf
SITE=/etc/nginx/sites-enabled/amitista.com.conf
LOG=/var/log/amitista/firewall.log
ACCOUNT=amitista-admin

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m  warning: %s\033[0m\n' "$*"; }
die() { printf '\033[31minstall failed: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "needs root — it installs units and writes nginx config"
command -v nginx >/dev/null || die "nginx is not on this box"

say "Files"
install -d -m 755 "$TARGET"
install -m 750 "$SRC/apply-firewall.sh" "$TARGET/apply-firewall.sh"
install -m 750 "$SRC/firewall-off.sh" "$TARGET/firewall-off.sh"
install -m 644 "$SRC/empty.conf" "$TARGET/empty.conf"
bash -n "$TARGET/apply-firewall.sh" || die "apply-firewall.sh does not parse"
bash -n "$TARGET/firewall-off.sh" || die "firewall-off.sh does not parse"

say "nginx snippet"
install -m 644 "$REPO/nginx/snippets/amitista-firewall.conf" "$SNIPPET"

say "Log"
install -d -m 750 -o www-data -g "$ACCOUNT" "$(dirname "$LOG")"
if [ ! -f "$LOG" ]; then
  install -m 640 -o www-data -g "$ACCOUNT" /dev/null "$LOG"
else
  chown www-data:"$ACCOUNT" "$LOG"
  chmod 640 "$LOG"
fi
install -m 644 "$REPO/logrotate/amitista" /etc/logrotate.d/amitista
logrotate -d /etc/logrotate.d/amitista >/dev/null 2>&1 || warn "logrotate is unhappy with /etc/logrotate.d/amitista"

say "Edge config"
if [ -s "$STAGED" ]; then
  echo "  seeding from the panel's staged config"
  install -m 644 -o root -g root "$STAGED" "$LIVE"
elif [ ! -f "$LIVE" ]; then
  echo "  the panel has not staged one yet — installing the empty ruleset"
  install -m 644 -o root -g root "$TARGET/empty.conf" "$LIVE"
else
  echo "  keeping the existing $LIVE"
fi

if ! grep -q 'amitista-firewall.conf' "$SITE" 2>/dev/null; then
  warn "$SITE does not include the firewall snippet yet — nothing is enforced at the edge.
  Add this line to the amitista.com server block, beside the security-headers include:

      include /etc/nginx/snippets/amitista-firewall.conf;

  then run: nginx -t && systemctl reload nginx"
fi

say "Units"
install -m 644 "$SRC/amitista-firewall.service" /etc/systemd/system/amitista-firewall.service
install -m 644 "$SRC/amitista-firewall.path" /etc/systemd/system/amitista-firewall.path
systemctl daemon-reload
systemctl enable --now amitista-firewall.path

say "Checking"
nginx -t || die "nginx will not take the config — $LIVE is the new part"
systemctl reload nginx

systemctl is-enabled --quiet amitista-firewall.path || warn "amitista-firewall.path is not enabled"
runuser -u "$ACCOUNT" -- test -r "$LOG" || warn "$ACCOUNT cannot read $LOG — the panel's Traffic tab will show no edge matches"

say "Done"
cat <<'EOF'
  The panel writes /var/lib/amitista/admin/session/firewall.conf; amitista-firewall.path
  picks it up, validates it and reloads nginx. Recovery, if a rule locks you out:

      /opt/amitista/firewall/firewall-off.sh
EOF
