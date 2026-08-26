#!/bin/bash
set -euo pipefail

DEST=/var/backups/amitista
KEEP=14

OFFSITE="${AMITISTA_BACKUP_OFFSITE:-}"

export GNUPGHOME="${AMITISTA_BACKUP_GNUPGHOME:-/root/.gnupg-backup}"
RECIPIENT="${AMITISTA_BACKUP_RECIPIENT:-A0D2BAAFD58D2C7BA28E86A4C06F0D9D580FE0E3}"

command -v gpg >/dev/null || { echo "backup: gpg is not installed, refusing to write a plaintext archive" >&2; exit 1; }
gpg --list-keys "$RECIPIENT" >/dev/null 2>&1 || { echo "backup: no public key for $RECIPIENT, refusing to write a plaintext archive" >&2; exit 1; }

STAMP=$(date -u +%Y%m%d-%H%M%S)
ARCHIVE="$DEST/amitista-$STAMP.tar.gz.gpg"

mkdir -p "$DEST"
chmod 700 "$DEST"

TMP="$DEST/.incomplete-$STAMP.tar.gz"

# The live WiredTiger files under /var/lib/mongodb are not safe to copy from a
# running server, so Mongo is captured with mongodump instead. The dump lands in
# a 0700 staging directory, is folded into the same tar, and is shredded on the
# way out so the only lasting copy is inside the GPG archive.
MONGO_STAGE="$DEST/.mongo-$STAMP"
clean_stage() {
  [ -d "$MONGO_STAGE" ] || return 0
  find "$MONGO_STAGE" -type f -exec shred -u {} + 2>/dev/null || true
  rm -rf "$MONGO_STAGE"
}
trap 'rm -f "$TMP" "$TMP.gpg"; clean_stage' EXIT

MONGO_PATHS=()
if systemctl is-active --quiet mongod && command -v mongodump >/dev/null; then
  # mongodump.yaml authenticates as amitista_backup, which holds read on
  # amitista_admin and nothing else, so a leak of this config cannot write to
  # or administer the database.
  if [ -r /etc/amitista/mongodump.yaml ]; then
    (umask 077; mkdir -p "$MONGO_STAGE")
    if mongodump --config /etc/amitista/mongodump.yaml \
                 --db amitista_admin --out "$MONGO_STAGE" --quiet 2>/dev/null; then
      MONGO_PATHS=("$MONGO_STAGE")
      echo "backup: captured mongodump of amitista_admin"
    else
      echo "backup: WARNING mongodump failed, archive will not contain Mongo" >&2
      clean_stage
    fi
  else
    echo "backup: WARNING /etc/amitista/mongodump.yaml is missing, skipping Mongo" >&2
  fi
else
  echo "backup: mongod is not running, skipping Mongo" >&2
fi

tar --create --gzip --file "$TMP" \
    --exclude='node_modules' \
    --exclude='.ssr-build' \
    --exclude='ipcountry.json' \
    --warning=no-file-changed \
    /root/amitista-repo \
    /etc/nginx \
    /etc/amitista \
    /var/lib/amitista \
    /etc/letsencrypt \
    /etc/fail2ban/jail.local \
    /etc/ssh/sshd_config \
    /etc/ssh/sshd_config.d \
    /etc/sysctl.d \
    /etc/systemd/system/amitista-contact.service \
    /etc/systemd/system/mongod.service.d \
    /etc/mongod.conf \
    /opt/amitista \
    ${MONGO_PATHS[@]+"${MONGO_PATHS[@]}"} \
    "$(readlink -f /var/www/amitista.com/current)" \
    2>/dev/null || {
      status=$?
      [ "$status" -le 1 ] || { echo "backup: tar failed with $status" >&2; exit "$status"; }
    }

# The plaintext dump must not outlive the tar it was made for.
clean_stage

chmod 600 "$TMP"

if ! gzip -t "$TMP" 2>/dev/null; then
  echo "backup: archive failed verification before encryption, keeping older archives" >&2
  exit 1
fi

gpg --batch --yes --quiet --trust-model always \
    --recipient "$RECIPIENT" \
    --output "$TMP.gpg" --encrypt "$TMP"
chmod 600 "$TMP.gpg"
shred -u "$TMP" 2>/dev/null || rm -f "$TMP"

mv "$TMP.gpg" "$ARCHIVE"
trap - EXIT

if ! gpg --batch --list-packets "$ARCHIVE" >/dev/null 2>&1; then
  echo "backup: $ARCHIVE is not readable as an encrypted archive, keeping older archives" >&2
  exit 1
fi

SIZE=$(du -h "$ARCHIVE" | cut -f1)
echo "backup: wrote $ARCHIVE ($SIZE)"

if [ -n "$OFFSITE" ]; then
  if scp -q -o BatchMode=yes "$ARCHIVE" "$OFFSITE/"; then
    echo "backup: copied to $OFFSITE"
  else
    echo "backup: WARNING offsite copy to $OFFSITE failed" >&2
  fi
fi

mapfile -t OLD < <(ls -1t "$DEST"/amitista-*.tar.gz.gpg 2>/dev/null | tail -n "+$((KEEP + 1))")
for f in "${OLD[@]:-}"; do
  [ -n "$f" ] || continue
  rm -f "$f"
  echo "backup: pruned $(basename "$f")"
done

echo "backup: $(ls -1 "$DEST"/amitista-*.tar.gz.gpg 2>/dev/null | wc -l) archives, $(du -sh "$DEST" | cut -f1) total"
