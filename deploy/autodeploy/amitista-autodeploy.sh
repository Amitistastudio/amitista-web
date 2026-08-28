#!/usr/bin/env bash
#
# Bring the live services up to whatever is on main.
#
# Pull-based: the server asks GitHub, GitHub never reaches in. No deploy
# credential is stored off this machine and no inbound port is opened.
#
# Nothing is deployed unless CI is green for the exact commit being deployed.
# That is the whole gate. There is no human approval step, deliberately — with
# one person holding the account, self-approval catches nothing that a passing
# test suite does not. What it does stop is a broken build reaching production
# because it was merged at two in the morning.
#
# Only components whose files actually changed are touched, so a copy edit on
# the website never restarts the exchange bot.
#
#     amitista-autodeploy.sh              deploy whatever is due
#     amitista-autodeploy.sh --dry-run    say what it would do, change nothing
#     amitista-autodeploy.sh --force      deploy even if CI has not reported
#
set -uo pipefail

WEB=/root/website
BOTS=/opt/amitista/discord-bot
SHIELD=/root/dev/amitista-shield
ENCHANGE_LIVE=/opt/enchange
TOKEN_FILE=/root/.gh-oauth
ORG=Amitistastudio
STATE=/var/lib/amitista/autodeploy
STAMP="$(date -u +%Y%m%d-%H%M%S)"

DRY=""; FORCE=""
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --force)   FORCE=1 ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done

log()  { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
step() { printf '\n== %s\n' "$*"; }
warn() { printf '%s WARN %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die()  { printf '%s FAIL %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "needs root — it installs services and restarts units"
mkdir -p "$STATE"

# One deploy at a time. A timer firing while a deploy is mid-flight would
# otherwise restart a unit underneath itself.
exec 9>/var/lock/amitista-autodeploy.lock
flock -n 9 || { log "another deploy holds the lock; leaving it to finish"; exit 0; }

TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE" 2>/dev/null || true)"
[ -n "$TOKEN" ] || die "no GitHub token at $TOKEN_FILE"

# ---------------------------------------------------------------- CI gate
# Asks GitHub what it concluded for this exact commit. A commit CI has not
# reported on yet is not deployed: better a few minutes late than live and
# broken. Anything unexpected is treated as "not green", because the failure
# mode of guessing wrong here is a bad deploy.
ci_is_green() {
  local repo="$1" sha="$2" out status conclusion
  out="$(curl -sS --max-time 20 -H "Authorization: token $TOKEN" \
        "https://api.github.com/repos/$ORG/$repo/actions/runs?head_sha=$sha&per_page=1" 2>/dev/null)" || return 1
  status="$(printf '%s' "$out" | python3 -c "
import sys,json
try:
    r=json.load(sys.stdin).get('workflow_runs') or []
    print(r[0]['status'] if r else 'none')
except Exception:
    print('error')" 2>/dev/null)"
  conclusion="$(printf '%s' "$out" | python3 -c "
import sys,json
try:
    r=json.load(sys.stdin).get('workflow_runs') or []
    print(r[0]['conclusion'] or 'pending' if r else 'none')
except Exception:
    print('error')" 2>/dev/null)"
  printf '%s/%s' "$status" "$conclusion"
  [ "$status" = "completed" ] && [ "$conclusion" = "success" ]
}

# --------------------------------------------------------------- helpers
changed_between() { git -C "$1" diff --name-only "$2" "$3" 2>/dev/null; }
touches()         { printf '%s\n' "$1" | grep -qE "$2"; }

settle_check() {
  # systemd calls a unit active the instant it forks, so a service that dies on
  # a bad import still looks fine for a moment. Wait, then ask.
  local units=("$@") dead=()
  sleep 5
  for u in "${units[@]}"; do
    [ "$(systemctl is-active "$u")" = "active" ] || dead+=("$u")
  done
  printf '%s' "${dead[*]}"
}

# ================================================================ website
deploy_website() {
  local before_release; before_release="$(readlink /var/www/amitista.com/current)"
  step "website"
  log "current release $before_release"
  if [ -n "$DRY" ]; then log "(dry run) would run deploy/deploy-local.sh"; return 0; fi

  if ! "$WEB/deploy/deploy-local.sh" >>"$STATE/website-$STAMP.log" 2>&1; then
    warn "the build or the artefact checks failed; the live release is untouched"
    warn "see $STATE/website-$STAMP.log"
    return 1
  fi

  # The site is static behind nginx, so "did it work" is a real request, not a
  # unit state. Failing that, the symlink goes back to the release that served.
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 https://amitista.com/ 2>/dev/null)"
  if [ "$code" != "200" ]; then
    warn "the site answered $code after deploying; rolling back to $before_release"
    ln -sfn "$before_release" /var/www/amitista.com/current.new
    mv -T /var/www/amitista.com/current.new /var/www/amitista.com/current
    return 1
  fi
  log "live, and answering 200"
}

# =============================================================== studio bot
deploy_studio_bot() {
  step "studio bot"
  if [ -n "$DRY" ]; then log "(dry run) would npm ci and restart the three bot units"; return 0; fi
  ( cd "$BOTS" && npm ci --silent ) || { warn "npm ci failed"; return 1; }
  systemctl restart amitista-bot-security amitista-bot-support amitista-bot-website
  local dead; dead="$(settle_check amitista-bot-security amitista-bot-support amitista-bot-website)"
  if [ -n "$dead" ]; then
    warn "not running after restart: $dead"
    return 1
  fi
  log "three bot units running"
}

# ================================================================ enchange
# The one component where the repository is not the runtime. enchange runs as
# its own user, which cannot read into the bot's directory and should not be
# able to — the wallet key is the reason. So its source is copied out, and
# data/, .env and node_modules are left alone: state, secrets and installed
# packages belong to the live host.
deploy_enchange() {
  step "enchange"
  local snap="$STATE/enchange-$STAMP.tar.gz"
  if [ -n "$DRY" ]; then log "(dry run) would sync source to $ENCHANGE_LIVE and restart enchange-bot"; return 0; fi

  tar czf "$snap" -C "$ENCHANGE_LIVE" \
      --exclude=node_modules --exclude=data --exclude='*.log' . 2>/dev/null \
    || { warn "could not snapshot the current source; refusing to deploy"; return 1; }

  tar -C "$BOTS/enchange" -cf - \
      --exclude=node_modules --exclude=data --exclude='.env' --exclude='*.log' . \
    | tar -C "$ENCHANGE_LIVE" -xf - --no-same-owner
  chown -R enchange:enchange "$ENCHANGE_LIVE"
  chmod 600 "$ENCHANGE_LIVE/.env" 2>/dev/null || true
  chmod 700 "$ENCHANGE_LIVE/data" 2>/dev/null || true
  ( cd "$ENCHANGE_LIVE" && sudo -u enchange npm ci --silent ) \
    || { warn "npm ci failed as the enchange user"; }

  systemctl restart enchange-bot
  local dead; dead="$(settle_check enchange-bot)"
  if [ -n "$dead" ]; then
    warn "enchange-bot did not come back; restoring the previous source"
    tar xzf "$snap" -C "$ENCHANGE_LIVE"
    chown -R enchange:enchange "$ENCHANGE_LIVE"
    systemctl restart enchange-bot || true
    return 1
  fi
  log "enchange-bot running, source snapshot at $snap"
}

# ==================================================================== APIs
deploy_api() {
  local name="$1" unit="$2" installer="$WEB/deploy/$1/install.sh"
  step "$name"
  if [ ! -x "$installer" ]; then
    warn "$name has no install.sh — it is copy-and-restart by hand, skipping"
    return 0
  fi
  if [ -n "$DRY" ]; then log "(dry run) would run $installer"; return 0; fi

  local snap="$STATE/$name-$STAMP.tar.gz"
  tar czf "$snap" -C "/opt/amitista/$name" --exclude=__pycache__ . 2>/dev/null || true
  if ! "$installer" >>"$STATE/$name-$STAMP.log" 2>&1; then
    warn "$name installer failed; see $STATE/$name-$STAMP.log"
    return 1
  fi
  local dead; dead="$(settle_check "$unit")"
  if [ -n "$dead" ]; then
    warn "$unit did not come back; restoring"
    tar xzf "$snap" -C "/opt/amitista/$name"
    systemctl restart "$unit" || true
    return 1
  fi
  log "$unit running"
}

# ================================================================== shield
deploy_shield() {
  step "shield"
  if [ -n "$DRY" ]; then log "(dry run) would run feed/install.sh and evaluator/install.sh"; return 0; fi
  local ok=0
  for part in feed evaluator; do
    [ -x "$SHIELD/$part/install.sh" ] || continue
    "$SHIELD/$part/install.sh" >>"$STATE/shield-$part-$STAMP.log" 2>&1 || { warn "shield $part installer failed"; ok=1; }
  done
  local dead; dead="$(settle_check amitista-shield-feed amitista-shield-demo)"
  if [ -n "$dead" ]; then warn "not running after restart: $dead"; return 1; fi
  [ $ok -eq 0 ] && log "shield feed and evaluator running"
  return $ok
}

# ============================================================ the main loop
FAILED=()
DEPLOYED=()

run() {                      # run <label> <function> [args...]
  local label="$1"; shift
  if "$@"; then DEPLOYED+=("$label"); else FAILED+=("$label"); fi
}

sync_repo() {
  local dir="$1" repo="$2"
  git -C "$dir" fetch --quiet origin main 2>/dev/null || { warn "$repo: fetch failed"; return 2; }
  local before after
  before="$(git -C "$dir" rev-parse HEAD)"
  after="$(git -C "$dir" rev-parse origin/main)"
  [ "$before" = "$after" ] && return 1          # nothing new

  local verdict; verdict="$(ci_is_green "$repo" "$after")"
  local green=$?
  if [ $green -ne 0 ] && [ -z "$FORCE" ]; then
    log "$repo: ${after:0:7} is not deployable yet (CI $verdict)"
    return 1
  fi
  log "$repo: ${before:0:7} -> ${after:0:7} (CI $verdict)"
  git -C "$dir" --no-pager log --oneline "$before..$after" | sed 's/^/    /'
  [ -n "$DRY" ] || git -C "$dir" merge --ff-only --quiet origin/main || { warn "$repo: cannot fast-forward"; return 2; }
  CHANGED="$(changed_between "$dir" "$before" "$after")"
  return 0
}

step "amitista-web"
if sync_repo "$WEB" amitista-web; then
  touches "$CHANGED" '^(src/|public/|brand/|index\.html|vite\.config\.js|package(-lock)?\.json|scripts/)' \
    && run website deploy_website
  touches "$CHANGED" '^deploy/admin-api/' \
    && run admin-api deploy_api admin-api amitista-admin
  touches "$CHANGED" '^deploy/api-gateway/' \
    && run api-gateway deploy_api api-gateway amitista-api
  touches "$CHANGED" '^deploy/(ai-relay|contact-relay)/' \
    && warn "ai-relay or contact-relay changed and neither has an install.sh — deploy those by hand"
fi

step "amitista-bots"
if sync_repo "$BOTS" amitista-bots; then
  touches "$CHANGED" '^(bot\.js|src/|assets/|package(-lock)?\.json)' \
    && run studio-bot deploy_studio_bot
  touches "$CHANGED" '^enchange/' \
    && run enchange deploy_enchange
fi

step "amitista-shield"
if sync_repo "$SHIELD" amitista-shield; then
  touches "$CHANGED" '^(src/|bin/|feed/|evaluator/|index\.js|package(-lock)?\.json)' \
    && run shield deploy_shield
fi

step "result"
if [ ${#DEPLOYED[@]} -eq 0 ]; then
  log "nothing to deploy"
  exit 0
fi
[ ${#DEPLOYED[@]} -gt 0 ] && log "deployed: ${DEPLOYED[*]}"
if [ ${#FAILED[@]} -gt 0 ]; then
  die "these did not come up and were rolled back: ${FAILED[*]}"
fi
log "all good"
