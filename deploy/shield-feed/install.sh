#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=/opt/amitista/shield-feed
ACCOUNT=amitista-shield-feed
STATE_DIR=/var/lib/amitista/shield-feed
KEY_DIR=/etc/amitista/shield-feed

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31minstall failed: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "needs root — it creates a system user and installs a unit"

python3 -c "import cryptography" 2>/dev/null || die "python3-cryptography is not installed"

say "Account"
if ! getent group "$ACCOUNT" >/dev/null; then
  groupadd --system "$ACCOUNT"
fi
if ! getent passwd "$ACCOUNT" >/dev/null; then
  useradd --system --gid "$ACCOUNT" --home-dir /nonexistent --shell /usr/sbin/nologin "$ACCOUNT"
fi

say "Files"
install -d -m 755 "$TARGET"
install -m 755 "$SRC/shield_feed.py" "$TARGET/shield_feed.py"
install -m 750 "$SRC/shield_feed_sign.py" "$TARGET/shield_feed_sign.py"
python3 -m py_compile "$TARGET/shield_feed.py" || die "python syntax check failed for the service"
python3 -m py_compile "$TARGET/shield_feed_sign.py" || die "python syntax check failed for the signer"

install -d -m 755 -o "$ACCOUNT" -g "$ACCOUNT" "$STATE_DIR"

say "Signing key"
install -d -m 700 -o root -g root "$KEY_DIR"
if [ -f "$KEY_DIR/feed-key.pem" ]; then
  echo "    key already present — left alone"
else
  openssl genpkey -algorithm ed25519 -out "$KEY_DIR/feed-key.pem"
  chmod 600 "$KEY_DIR/feed-key.pem"
  openssl pkey -in "$KEY_DIR/feed-key.pem" -pubout -out "$KEY_DIR/feed-key.pub.pem"
  chmod 644 "$KEY_DIR/feed-key.pub.pem"
  echo
  echo "    A NEW KEY WAS GENERATED. Its public half must be pinned in the package"
  echo "    (src/feed/keys.js) or every install will refuse everything signed with it:"
  echo
  sed 's/^/      /' "$KEY_DIR/feed-key.pub.pem"
  echo "    key id:"
  node -e "
    const c=require('crypto'),fs=require('fs');
    const k=c.createPublicKey(fs.readFileSync('$KEY_DIR/feed-key.pub.pem'));
    const der=k.export({type:'spki',format:'der'});
    console.log('      ams-'+c.createHash('sha256').update(der).digest('hex').slice(0,12));
  " 2>/dev/null || echo "      (node not available to compute the fingerprint)"
fi

if [ ! -f "$KEY_DIR/overlay.json" ]; then
  install -m 600 -o root -g root "$SRC/overlay.example.json" "$KEY_DIR/overlay.json"
  echo "    seeded $KEY_DIR/overlay.json from the example"
fi

say "Units"
install -m 644 "$SRC/amitista-shield-feed.service" /etc/systemd/system/amitista-shield-feed.service
systemctl daemon-reload

say "First signing run"
"$TARGET/shield_feed_sign.py" || die "could not sign an initial document"

say "Starting"
systemctl enable --now amitista-shield-feed.service
sleep 1
systemctl is-active --quiet amitista-shield-feed.service || die "service did not come up — journalctl -u amitista-shield-feed"

say "Checking"
curl -fsS http://127.0.0.1:8790/healthz | head -20 || die "the service is not answering"

cat <<'DONE'

Installed. Remaining steps that are not this script's to take:

  1. nginx must proxy /api/v1/shield/feed and /api/v1/shield/rules to
     127.0.0.1:8790 — see deploy/nginx.
  2. Publish a rule by editing /etc/amitista/shield-feed/overlay.json and
     running /opt/amitista/shield-feed/shield_feed_sign.py. Use --dry-run first.
DONE
