#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=/opt/amitista/admin-api
ENV_FILE=/etc/amitista/admin.env
STATE_DIR=/var/lib/amitista/admin
ACCOUNT=amitista-admin

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31minstall failed: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "needs root — it creates a system user and installs units"

say "Account"
if ! getent group "$ACCOUNT" >/dev/null; then
  groupadd --system "$ACCOUNT"
fi
if ! getent passwd "$ACCOUNT" >/dev/null; then
  useradd --system --gid "$ACCOUNT" --home-dir /nonexistent --shell /usr/sbin/nologin "$ACCOUNT"
fi

say "Files"
install -d -m 755 "$TARGET"
MODULES="admin_api.py admin_store.py admin_hooks.py admin_snapshot.py admin_store_firebase.py
         admin_vault.py admin_google.py admin_review.py admin_turnstile.py build_ip_country.py
         migrate_owner_to_store.py migrate_json_to_firestore.py migrate_store_to_vault.py"
for module in $MODULES; do
  install -m 755 "$SRC/$module" "$TARGET/$module"
done
install -m 755 "$SRC/rotate_and_purge.sh" "$TARGET/rotate_and_purge.sh"
for module in $MODULES; do
  python3 -m py_compile "$TARGET/$module" || die "python syntax check failed on $module"
done

install -d -m 750 -o root -g "$ACCOUNT" "$STATE_DIR"
install -d -m 700 -o "$ACCOUNT" -g "$ACCOUNT" "$STATE_DIR/session"
install -d -m 700 -o "$ACCOUNT" -g "$ACCOUNT" "$STATE_DIR/github-queue"
install -d -m 700 -o root -g root /etc/amitista

if [ ! -f "$ENV_FILE" ]; then
  say "Secret"
  echo "No $ENV_FILE yet — generating a session secret."
  TMP="$(mktemp)"
  chmod 600 "$TMP"
  python3 "$TARGET/admin_api.py" --secret 2>/dev/null > "$TMP" || { rm -f "$TMP"; die "could not generate a secret"; }
  grep -q '^ADMIN_SECRET=[0-9a-f]\{64\}$' "$TMP" || { rm -f "$TMP"; die "secret generation produced nothing usable"; }
  install -m 600 -o root -g root "$TMP" "$ENV_FILE"
  rm -f "$TMP"
else
  chown root:root "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "kept the existing $ENV_FILE"
fi

say "Owner account"
if runuser -u "$ACCOUNT" -- python3 "$TARGET/admin_api.py" --check-owner; then
  echo "  an owner account is already in the store"
elif grep -q '^ADMIN_USER=.\+' "$ENV_FILE" && grep -q '^ADMIN_PASSWORD=scrypt\$' "$ENV_FILE"; then
  die "this box still keeps its owner in $ENV_FILE — run
    runuser -u $ACCOUNT -- python3 $TARGET/migrate_owner_to_store.py
  to move it into the store, then run this again"
else
  echo "No owner account yet — creating the first one."
  runuser -u "$ACCOUNT" -- python3 "$TARGET/admin_api.py" --credentials || die "owner setup cancelled"
fi

if grep -q '^ADMIN_USER=.\+\|^ADMIN_PASSWORD=.\+' "$ENV_FILE"; then
  printf '\033[33m  warning: ADMIN_USER/ADMIN_PASSWORD are still in %s and are now ignored — delete them\033[0m\n' "$ENV_FILE"
fi

say "Units"
for unit in amitista-admin.service amitista-admin-snapshot.service amitista-admin-snapshot.timer \
            amitista-admin-geo.service amitista-admin-geo.timer; do
  install -m 644 "$SRC/$unit" "/etc/systemd/system/$unit"
done
systemctl daemon-reload

if [ -d /etc/fail2ban/filter.d ]; then
  say "fail2ban"
  install -m 644 "$SRC/fail2ban-filter-amitista-admin.conf" /etc/fail2ban/filter.d/amitista-admin.conf
  install -m 644 "$SRC/fail2ban-jail-amitista-admin.conf" /etc/fail2ban/jail.d/amitista-admin.conf
  if systemctl is-active --quiet fail2ban; then
    systemctl restart fail2ban
    sleep 2
    fail2ban-client status amitista-admin >/dev/null 2>&1 \
      && echo "  jail active" \
      || printf '\033[33m  warning: the amitista-admin jail did not come up — fail2ban-client status\033[0m\n'
  fi
fi

say "Starting"
systemctl enable amitista-admin.service
systemctl restart amitista-admin.service
systemctl enable amitista-admin-snapshot.timer
systemctl restart amitista-admin-snapshot.timer
systemctl enable amitista-admin-geo.timer
systemctl restart amitista-admin-geo.timer
if [ ! -s "$STATE_DIR/ipcountry.json" ]; then
  say "Country table"
  python3 "$TARGET/build_ip_country.py" || printf '\033[33m  warning: no country table — the Activity places tab stays empty until build_ip_country.py runs\033[0m\n'
fi
systemctl start amitista-admin-snapshot.service

sleep 1
systemctl is-active --quiet amitista-admin.service || die "amitista-admin.service did not stay up — journalctl -u amitista-admin"

HEALTH="$(curl -fsS --max-time 5 http://127.0.0.1:8788/healthz || true)"
[ -n "$HEALTH" ] || die "the admin API is not answering on 127.0.0.1:8788"
echo "  healthz: $HEALTH"

case "$HEALTH" in
  *'"configured":'*true*) ;;
  *) printf '\033[33m  warning: no secret or no owner account — sign-in will answer 503\033[0m\n' ;;
esac

[ -f "$STATE_DIR/overview.json" ] || printf '\033[33m  warning: no snapshot yet — check journalctl -u amitista-admin-snapshot\033[0m\n'

say "Done"
echo "Add the /api/admin/ and /admin blocks to the site's nginx conf, then reload nginx."
