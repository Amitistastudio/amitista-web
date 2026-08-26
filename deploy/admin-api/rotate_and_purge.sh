#!/usr/bin/env bash
set -uo pipefail

TARGET=${ADMIN_API_DIR:-/opt/amitista/admin-api}
STATE=${ADMIN_STATE:-/var/lib/amitista/admin/session}
ENV_DIR=/etc/amitista
STATE_BACKUPS=/root/admin-state-backups
TARBALLS=/var/backups/amitista
ACCOUNT=amitista-admin

APPLY=0
for argument in "$@"; do
  case "$argument" in
    --apply) APPLY=1 ;;
    --dry-run) APPLY=0 ;;
    *) echo "usage: rotate_and_purge.sh [--apply]" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
did() { if [ "$APPLY" -eq 1 ]; then printf '    done: %s\n' "$*"; else printf '    would: %s\n' "$*"; fi; }
die() { printf '\033[31mstopped: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "needs root — it shreds root-owned backups"

if [ "$APPLY" -eq 0 ]; then
  printf '\033[33mDRY RUN — nothing will be changed. Re-run with --apply to do it.\033[0m\n'
fi

say "Checking the vault is live before destroying anything"
if [ "$APPLY" -eq 1 ]; then
  runuser -u "$ACCOUNT" -- python3 "$TARGET/migrate_store_to_vault.py" --dry-run >/dev/null 2>&1 \
    || die "the vault is not answering — refusing to purge the only readable copies"
  grep -q '"sealed"' "$STATE/users.json" 2>/dev/null \
    || die "$STATE/users.json is not sealed yet — run migrate_store_to_vault.py first"
  echo "    vault answers and the store is sealed"
else
  echo "    (skipped in a dry run)"
fi

say "Secrets that must be replaced by hand, in Secret Manager"
cat <<'NOTE'
    These cannot be rotated from here, because rotating them needs the Google
    console and Discord:

      1. amitista-admin-session-secret — add a new version:
           python3 admin_api.py --secret        (prints ADMIN_SECRET=...)
           gcloud secrets versions add amitista-admin-session-secret --data-file=-
         Adding a version signs everyone out. That is the point: the old
         secret is in five tarballs and six backup files.

      2. amitista-alert-webhook / the contact webhook — delete both webhooks in
         Discord, make new ones, and store the new URLs as secret versions.
         A deleted webhook cannot be used by whoever holds the old URL.

    Do those first. This script only removes the local copies.
NOTE

say "Local secret files"
for file in "$ENV_DIR"/admin.env "$ENV_DIR"/alerts.env "$ENV_DIR"/contact.env; do
  [ -f "$file" ] || continue
  did "shred $file ($(stat -c '%a %U:%G' "$file"))"
  [ "$APPLY" -eq 1 ] && shred -u "$file"
done

say "Plaintext state copies in $STATE_BACKUPS"
if [ -d "$STATE_BACKUPS" ]; then
  found=0
  for file in "$STATE_BACKUPS"/*; do
    [ -e "$file" ] || continue
    found=$((found+1))
    did "shred $file"
    [ "$APPLY" -eq 1 ] && shred -u "$file"
  done
  [ "$found" -eq 0 ] && echo "    nothing there"
else
  echo "    $STATE_BACKUPS does not exist"
fi

say "Leftover pre-seal backups beside the live store"
for file in "$STATE"/*.bak-* "$STATE"/../*.bak-*; do
  [ -e "$file" ] || continue
  did "shred $file"
  [ "$APPLY" -eq 1 ] && shred -u "$file"
done

say "Admin state inside the nightly tarballs in $TARBALLS"
if [ -d "$TARBALLS" ]; then
  for archive in "$TARBALLS"/*.tar.gz; do
    [ -e "$archive" ] || continue
    hits=$(tar -tzf "$archive" 2>/dev/null | grep -cE 'var/lib/amitista/admin|etc/amitista' || true)
    if [ "${hits:-0}" -eq 0 ]; then
      echo "    $(basename "$archive") carries no admin state — left alone"
      continue
    fi
    echo "    $(basename "$archive") carries $hits sensitive entries"
    did "rewrite $(basename "$archive") without var/lib/amitista/admin and etc/amitista"
    if [ "$APPLY" -eq 1 ]; then
      work="$(mktemp -d)"
      if tar -xzf "$archive" -C "$work" 2>/dev/null; then
        rm -rf "$work/var/lib/amitista/admin" "$work/etc/amitista"
        if tar -czf "$archive.clean" -C "$work" . 2>/dev/null; then
          chmod 600 "$archive.clean"
          shred -u "$archive"
          mv "$archive.clean" "$archive"
        else
          echo "      could not repack $archive — left as it was" >&2
          rm -f "$archive.clean"
        fi
      else
        echo "      could not unpack $archive — left as it was" >&2
      fi
      rm -rf "$work"
    fi
  done
else
  echo "    $TARBALLS does not exist"
fi

say "Stop the backup timer taking new plaintext copies"
cat <<'NOTE'
    The sealed store is safe to back up — it is ciphertext. /etc/amitista is
    not, and becomes more sensitive once the service-account key lands there.
    Add to the backup script's exclude list:

      --exclude=/etc/amitista
      --exclude=/var/lib/amitista/admin/session/*.bak-*

    and keep backing up var/lib/amitista/admin/session/users.json, which is
    now useless without the KMS key.

    Separately, and outside this panel's scope: these tarballs also carry
    etc/letsencrypt/live and etc/letsencrypt/archive, which are the site's TLS
    private keys. They are root-only and 14MB each, sitting unencrypted on the
    same disk they protect. Worth deciding on deliberately — either exclude
    them (certificates can always be re-issued) or encrypt the tarballs.
NOTE

say "Done"
if [ "$APPLY" -eq 0 ]; then
  echo "Nothing was changed. Re-run with --apply once the two secrets above are rotated."
else
  echo "Local plaintext is gone. Sign in once to confirm the panel still works."
fi
