#!/usr/bin/env bash
set -uo pipefail

WEB=/root/website
BOTS=/opt/amitista/discord-bot
SHIELD=/root/dev/amitista-shield
GITHUB_STATE=/var/lib/amitista/admin/github.json
TOKEN_FILE=/root/.gh-oauth
QUEUE="${ADMIN_GITHUB_QUEUE:-/var/lib/amitista/admin/github-queue}"
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MAX_ROUNDS=5
LOCK_WAIT=90

log()  { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
warn() { printf '%s WARN %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }

[ "$(id -u)" -eq 0 ] || { warn "needs root — the GitHub token is root-only"; exit 1; }

waiting() { compgen -G "$QUEUE/*.json" >/dev/null 2>&1; }

waiting || { log "nothing waiting"; exit 0; }

[ -s "$TOKEN_FILE" ] || {
  warn "no GitHub token at $TOKEN_FILE — leaving the queue for the deploy tick to report"
  exit 1
}

exec 9>/var/lock/amitista-autodeploy.lock
if ! flock -w "$LOCK_WAIT" 9; then
  log "a deploy holds the lock; it drains the queue itself when it finishes"
  exit 0
fi

rounds=0
while waiting && [ "$rounds" -lt "$MAX_ROUNDS" ]; do
  rounds=$((rounds + 1))
  if ! "$SELF_DIR/github-state.py" --drain "$GITHUB_STATE" \
      "amitista-web=$WEB" "amitista-bots=$BOTS" "amitista-shield=$SHIELD" \
      | sed 's/^/       /'; then
    warn "the collector failed; what is left in the queue waits for the next deploy tick"
    exit 1
  fi
done

if waiting; then
  log "still something waiting after $rounds round(s) — the next tick takes it"
fi
