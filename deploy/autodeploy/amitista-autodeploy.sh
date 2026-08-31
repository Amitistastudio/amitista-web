#!/usr/bin/env bash
set -uo pipefail

WEB=/root/website
BOTS=/opt/amitista/discord-bot
SHIELD=/root/dev/amitista-shield
DEV=/root/dev/amitista-dev
DEV_LIVE=/var/www/dev.amitista.com
ENCHANGE_LIVE=/opt/enchange
TOKEN_FILE=/root/.gh-oauth
ORG=Amitistastudio
STATE=/var/lib/amitista/autodeploy
GITHUB_STATE=/var/lib/amitista/admin/github.json
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

DRY=""; FORCE=""; ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --force)   FORCE=1 ;;
    --only)    shift; ONLY="${1:-}"; [ -n "$ONLY" ] || { echo "--only needs a component name" >&2; exit 2; } ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

log()  { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
step() { printf '\n== %s\n' "$*"; }
warn() { printf '%s WARN %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die()  { printf '%s FAIL %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "needs root — it installs services and restarts units"
mkdir -p "$STATE"

exec 9>/var/lock/amitista-autodeploy.lock
flock -n 9 || { log "another deploy holds the lock; leaving it to finish"; exit 0; }

TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE" 2>/dev/null || true)"
[ -n "$TOKEN" ] || die "no GitHub token at $TOKEN_FILE"

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

changed_between() { git -C "$1" diff --name-only "$2" "$3" 2>/dev/null; }
touches()         { printf '%s\n' "$1" | grep -qE "$2"; }

settle_check() {
  local units=("$@") dead=()
  sleep 5
  for u in "${units[@]}"; do
    [ "$(systemctl is-active "$u")" = "active" ] || dead+=("$u")
  done
  printf '%s' "${dead[*]}"
}

DIRTY_SEEN=()

scan_checkout() {
  local dir="$1" repo="$2" dirty
  dirty="$(git -C "$dir" status --porcelain --untracked-files=no 2>/dev/null | sed 's/^...//')"
  [ -z "$dirty" ] && return 0
  warn "$repo: tracked files are modified in the checkout. A commit touching any"
  warn "$repo: of these will abort the fast-forward and stop deploys silently:"
  printf '%s\n' "$dirty" | sed 's/^/        /' >&2
  DIRTY_SEEN+=("$repo")
  return 1
}

uncovered() {
  local repo="$1" pattern="$2" rest
  rest="$(printf '%s\n' "$CHANGED" | grep -v '^$' | grep -vE "$pattern")"
  [ -z "$rest" ] && return 0
  log "$repo: changed, but no component owns these — nothing was deployed for them:"
  printf '%s\n' "$rest" | sed 's/^/        /'
}

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

  systemctl restart amitista-contact
  local relay; relay="$(settle_check amitista-contact)"
  [ -n "$relay" ] && warn "amitista-contact did not come back after the bot restart"

  log "three bot units running, contact relay re-probed"
}

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

  local before_pid; before_pid="$(systemctl show -p MainPID --value "$unit" 2>/dev/null || true)"

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
  local after_pid; after_pid="$(systemctl show -p MainPID --value "$unit" 2>/dev/null || true)"
  if [ -n "$before_pid" ] && [ "$before_pid" != "0" ] && [ "$before_pid" = "$after_pid" ]; then
    warn "$unit is still process $before_pid — the installer never restarted it, so it is"
    warn "$unit: running the code it had before this deploy. Check its install.sh for"
    warn "$unit: 'systemctl enable --now', which does nothing to an already-running unit."
    return 1
  fi

  log "$unit running"
}

deploy_dev() {
  step "amitista-dev site"
  if [ -n "$DRY" ]; then log "(dry run) would export HEAD from $DEV and rsync it to $DEV_LIVE"; return 0; fi

  local export_dir; export_dir="$(mktemp -d)"
  if ! git -C "$DEV" archive HEAD | tar -x -C "$export_dir"; then
    warn "could not export $DEV at HEAD; refusing to deploy"
    rm -rf "$export_dir"
    return 1
  fi

  local snap="$STATE/dev-$STAMP.tar.gz"
  tar czf "$snap" -C "$DEV_LIVE" . 2>/dev/null || true

  if ! rsync -a --delete --exclude='README.md' --exclude='src/' "$export_dir"/ "$DEV_LIVE"/; then
    warn "rsync to $DEV_LIVE failed; the live copy may be half-updated"
    rm -rf "$export_dir"
    return 1
  fi
  rm -rf "$export_dir"
  chown -R www-data:www-data "$DEV_LIVE"

  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' -L --max-time 20 https://dev.amitista.com/ 2>/dev/null)"
  if [ "$code" != "200" ]; then
    warn "dev.amitista.com answered $code after deploying; rolling back"
    rm -rf "${DEV_LIVE:?}"/*
    tar xzf "$snap" -C "$DEV_LIVE"
    chown -R www-data:www-data "$DEV_LIVE"
    return 1
  fi
  log "live, and answering 200 (through the redirect to /dashboard/)"
}

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

FAILED=()
DEPLOYED=()
MOVED=()

DEPLOY_HOOK="${DEPLOY_HOOK:-http://127.0.0.1:8798/deploy}"

report_deploy() {
  [ -n "$DRY" ] && return 0
  local ok="$1" token payload
  token="$(sed -n 's/^DEPLOYHOOK_TOKEN=//p' "$BOTS/.env" 2>/dev/null | tr -d '\r\n')"
  [ -n "$token" ] || return 0
  payload="$(printf '%s\n' ${MOVED[@]+"${MOVED[@]}"} | OK="$ok" TOOK="$SECONDS" \
    DEPLOYED="${DEPLOYED[*]-}" FAILED="${FAILED[*]-}" python3 -c '
import json, os, sys, time
moved = [line.rstrip("\n").split("\t") for line in sys.stdin if line.strip()]
head = moved[0] if moved else ["", "", "", ""]
note = ["%s %s -> %s  %s" % (r, b[:7], a[:7], s) for r, b, a, s in moved[1:]]
if os.environ.get("FAILED", "").strip():
    note.insert(0, "failed: " + os.environ["FAILED"].strip())
print(json.dumps({
    "at": int(time.time()),
    "ok": os.environ.get("OK") == "yes",
    "components": os.environ.get("DEPLOYED", "").split(),
    "repo": head[0], "from": head[1], "to": head[2], "subject": head[3],
    "duration": int(os.environ.get("TOOK") or 0),
    "note": "\n".join(note),
}))')" || return 0

  if [ ${#DEPLOYED[@]} -gt 0 ]; then
    mkdir -p "$STATE"
    printf '%s\n' "$payload" >> "$STATE/deploys.jsonl"
  fi
  curl -fsS -m 5 -X POST "$DEPLOY_HOOK" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    --data "$payload" >/dev/null 2>&1 || warn "the bot was not told about this deploy"
}

run() {
  local label="$1"; shift
  if "$@"; then DEPLOYED+=("$label"); else FAILED+=("$label"); fi
}

sync_repo() {
  local dir="$1" repo="$2" gate="${3:-ci}"
  git -C "$dir" fetch --quiet origin main 2>/dev/null || { warn "$repo: fetch failed"; return 2; }
  local head_now after
  head_now="$(git -C "$dir" rev-parse HEAD)"
  after="$(git -C "$dir" rev-parse origin/main)"

  local ahead; ahead="$(git -C "$dir" rev-list --count "$after..$head_now" 2>/dev/null || echo 0)"
  if [ "${ahead:-0}" -gt 0 ]; then
    warn "$repo: $ahead local commit(s) are not on origin/main, so nothing is deployed."
    warn "$repo: Push them and CI will gate them like anything else."
    return 1
  fi

  local marker="$STATE/deployed-$repo.sha" before
  before="$(cat "$marker" 2>/dev/null || true)"
  if [ -z "$before" ] || ! git -C "$dir" cat-file -e "${before}^{commit}" 2>/dev/null; then
    before="$head_now"
  fi

  if [ "$before" = "$after" ]; then
    [ -n "$DRY" ] || printf '%s\n' "$after" > "$marker"
    return 1
  fi

  local verdict="no gate"
  if [ "$gate" = "ci" ]; then
    verdict="$(ci_is_green "$repo" "$after")"
    local green=$?
    if [ $green -ne 0 ] && [ -z "$FORCE" ]; then
      log "$repo: ${after:0:7} is not deployable yet (CI $verdict)"
      return 1
    fi
  fi
  [ "$before" != "$head_now" ] && log "$repo: catching up a commit made straight in this checkout"
  log "$repo: ${before:0:7} -> ${after:0:7} (CI $verdict)"
  git -C "$dir" --no-pager log --oneline "$before..$after" | sed 's/^/    /'
  [ -n "$DRY" ] || git -C "$dir" merge --ff-only --quiet origin/main || { warn "$repo: cannot fast-forward"; return 2; }
  CHANGED="$(changed_between "$dir" "$before" "$after")"
  MOVED+=("$repo"$'\t'"$before"$'\t'"$after"$'\t'"$(git -C "$dir" log -1 --format=%s "$after" 2>/dev/null)")
  [ -n "$DRY" ] || printf '%s\n' "$after" > "$marker"
  return 0
}

if [ -n "$ONLY" ]; then
  step "redeploying $ONLY from the current checkout"
  case "$ONLY" in
    website)     run website     deploy_website ;;
    studio-bot)  run studio-bot  deploy_studio_bot ;;
    enchange)    run enchange    deploy_enchange ;;
    admin-api)   run admin-api   deploy_api admin-api amitista-admin ;;
    api-gateway) run api-gateway deploy_api api-gateway amitista-api ;;
    shield)      run shield      deploy_shield ;;
    dev)         run dev         deploy_dev ;;
    *) die "unknown component: $ONLY (website, studio-bot, enchange, admin-api, api-gateway, shield, dev)" ;;
  esac
  if [ ${#FAILED[@]} -gt 0 ]; then report_deploy no; die "$ONLY did not come up and was rolled back"; fi
  report_deploy yes
  log "$ONLY redeployed"
  exit 0
fi

step "amitista-web"
scan_checkout "$WEB" amitista-web || true
sync_repo "$WEB" amitista-web; SYNC=$?
[ $SYNC -eq 2 ] && FAILED+=("amitista-web (sync)")
if [ $SYNC -eq 0 ]; then
  touches "$CHANGED" '^(src/|public/|brand/|index\.html|vite\.config\.js|package(-lock)?\.json|scripts/)' \
    && run website deploy_website
  touches "$CHANGED" '^deploy/admin-api/' \
    && run admin-api deploy_api admin-api amitista-admin
  touches "$CHANGED" '^deploy/api-gateway/' \
    && run api-gateway deploy_api api-gateway amitista-api
  touches "$CHANGED" '^deploy/(ai-relay|contact-relay)/' \
    && warn "ai-relay or contact-relay changed and neither has an install.sh — deploy those by hand"
  uncovered amitista-web '^(src/|public/|brand/|index\.html|vite\.config\.js|package(-lock)?\.json|scripts/|deploy/autodeploy/|deploy/errorwatch/|deploy/admin-api/|deploy/api-gateway/|deploy/(ai-relay|contact-relay)/)'
fi

step "amitista-bots"
scan_checkout "$BOTS" amitista-bots || true
sync_repo "$BOTS" amitista-bots; SYNC=$?
[ $SYNC -eq 2 ] && FAILED+=("amitista-bots (sync)")
if [ $SYNC -eq 0 ]; then
  touches "$CHANGED" '^(bot\.js|src/|assets/|package(-lock)?\.json)' \
    && run studio-bot deploy_studio_bot
  touches "$CHANGED" '^enchange/' \
    && run enchange deploy_enchange
  uncovered amitista-bots '^(bot\.js|src/|assets/|package(-lock)?\.json|enchange/)'
fi

step "amitista-shield"
scan_checkout "$SHIELD" amitista-shield || true
sync_repo "$SHIELD" amitista-shield; SYNC=$?
[ $SYNC -eq 2 ] && FAILED+=("amitista-shield (sync)")
if [ $SYNC -eq 0 ]; then
  touches "$CHANGED" '^(src/|bin/|feed/|evaluator/|index\.js|package(-lock)?\.json)' \
    && run shield deploy_shield
  uncovered amitista-shield '^(src/|bin/|feed/|evaluator/|index\.js|package(-lock)?\.json)'
fi

step "amitista-dev"
scan_checkout "$DEV" amitista-dev || true
sync_repo "$DEV" amitista-dev nogate; SYNC=$?
[ $SYNC -eq 2 ] && FAILED+=("amitista-dev (sync)")
[ $SYNC -eq 0 ] && run dev deploy_dev

step "scan"
RESCAN=0
for pair in "$WEB amitista-web" "$BOTS amitista-bots" "$SHIELD amitista-shield" "$DEV amitista-dev"; do
  set -- $pair
  scan_checkout "$1" "$2" || RESCAN=1
done
if [ $RESCAN -eq 0 ]; then
  log "all four checkouts clean"
else
  warn "a deploy has left a checkout dirty — commit, ignore or stop writing those"
  warn "files, or the next commit touching one of them will block the deploy"
fi

if [ -z "$DRY" ]; then
  "$SELF_DIR/github-state.py" "$GITHUB_STATE" \
    "amitista-web=$WEB" "amitista-bots=$BOTS" "amitista-shield=$SHIELD" \
    | sed 's/^/       /' || warn "could not refresh the panel's repository snapshot"
fi

step "result"
[ ${#DEPLOYED[@]} -gt 0 ] && log "deployed: ${DEPLOYED[*]}"

if [ ${#FAILED[@]} -gt 0 ]; then
  report_deploy no
  die "failed: ${FAILED[*]}"
fi

if [ ${#DEPLOYED[@]} -eq 0 ]; then
  log "nothing to deploy"
  exit 0
fi

report_deploy yes
log "all good"
