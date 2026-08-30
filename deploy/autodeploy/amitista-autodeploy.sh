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
#     amitista-autodeploy.sh --only NAME   redeploy one component from the
#                                          current checkout, whether or not main
#                                          moved — for when /opt has drifted
#                                          rather than the repository
#
set -uo pipefail

WEB=/root/website
BOTS=/opt/amitista/discord-bot
SHIELD=/root/dev/amitista-shield
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

# --------------------------------------------------------------- the scan
# Everything below exists because of one silent failure: a deploy wrote its own
# generated files back into the tracked checkout, and the next commit touching
# one of them aborted the fast-forward. Nothing said so. The deploy simply
# stopped happening, and looked exactly like an idle tick for ten minutes.
#
# The pattern generalises past that one bug — anything that leaves the checkout
# dirty arms the same trap — so the checkout is inspected rather than trusted,
# both before a merge is attempted and again after a deploy has run.

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

# A change that matches no component deploys nothing. That is usually correct —
# a README edit should not restart a bot — but it is worth saying out loud,
# because the case where it is wrong (a new directory nobody wired up) is
# otherwise indistinguishable from the case where it is right.
uncovered() {
  local repo="$1" pattern="$2" rest
  rest="$(printf '%s\n' "$CHANGED" | grep -v '^$' | grep -vE "$pattern")"
  [ -z "$rest" ] && return 0
  log "$repo: changed, but no component owns these — nothing was deployed for them:"
  printf '%s\n' "$rest" | sed 's/^/        /'
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

  # The contact relay probes the bot's listener and caches the answer for five
  # minutes, treating a refused connection as definitive. Restarting the bot
  # therefore leaves the relay reporting "enquiries go nowhere" long after the
  # bot is back, which trips the healthcheck into a false alarm — and its own
  # remediation then restarts the relay anyway. Doing it here, deliberately and
  # straight away, is a second of downtime instead of five minutes of a wrong
  # answer.
  systemctl restart amitista-contact
  local relay; relay="$(settle_check amitista-contact)"
  [ -n "$relay" ] && warn "amitista-contact did not come back after the bot restart"

  log "three bot units running, contact relay re-probed"
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

  # Which process was serving before the installer ran. A long-lived Python
  # service holds its code in memory, so installing a new file under it changes
  # nothing until it restarts — and an installer that says `enable --now`
  # rather than `restart` leaves a running unit exactly where it was while
  # reporting success. Same process afterwards means the deploy did not land.
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
MOVED=()

# What this tick did, told to the studio bot so it lands in the GitHub log
# channels beside the push and the CI run that caused it. Loopback only — the
# bot checks a bearer token because any service on this box can reach that port,
# the same reason /api/apply carries one. Never fatal: a bot that is restarting
# is not a reason to fail a deploy that worked.
DEPLOY_HOOK="${DEPLOY_HOOK:-http://127.0.0.1:8798/deploy}"

report_deploy() {
  [ -n "$DRY" ] && return 0
  local ok="$1" token payload
  # The one copy of the secret lives in the bot's .env. Reading it here rather
  # than keeping a second copy is what stops the two drifting apart.
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

  # errorwatch reads this to know when to start counting. Only a tick that
  # actually installed something goes in it: with no new code there is no
  # release to compare two windows of errors against.
  if [ ${#DEPLOYED[@]} -gt 0 ]; then
    mkdir -p "$STATE"
    printf '%s\n' "$payload" >> "$STATE/deploys.jsonl"
  fi
  curl -fsS -m 5 -X POST "$DEPLOY_HOOK" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    --data "$payload" >/dev/null 2>&1 || warn "the bot was not told about this deploy"
}

run() {                      # run <label> <function> [args...]
  local label="$1"; shift
  if "$@"; then DEPLOYED+=("$label"); else FAILED+=("$label"); fi
}

sync_repo() {
  local dir="$1" repo="$2"
  git -C "$dir" fetch --quiet origin main 2>/dev/null || { warn "$repo: fetch failed"; return 2; }
  local head_now after
  head_now="$(git -C "$dir" rev-parse HEAD)"
  after="$(git -C "$dir" rev-parse origin/main)"

  # Commits sitting in the checkout that are not on main yet. Fast-forwarding to
  # origin/main is a no-op when the checkout is ahead of it, so the deploy would
  # go on to build whatever is in the working tree while having asked CI about a
  # different, older commit — the gate answering for code that is not the code
  # being deployed. It also renders backwards in the log, "newer -> older",
  # which is the tell. Wait for the push instead; CI has not seen this yet.
  local ahead; ahead="$(git -C "$dir" rev-list --count "$after..$head_now" 2>/dev/null || echo 0)"
  if [ "${ahead:-0}" -gt 0 ]; then
    warn "$repo: $ahead local commit(s) are not on origin/main, so nothing is deployed."
    warn "$repo: Push them and CI will gate them like anything else."
    return 1
  fi

  # "before" is the last commit this script knows it actually deployed from —
  # not simply HEAD at the top of this tick. A commit made (and pushed)
  # straight in this checkout, on the box, leaves HEAD already equal to
  # origin/main with nothing left for the fetch above to find: comparing
  # against HEAD alone read that as "nothing new", forever, and a real change
  # sat undeployed with no failure and nothing to notice. The marker is what
  # turns that into a catch-up instead of silence. A missing or dangling
  # marker (first run after adding this, or state wiped) falls back to HEAD,
  # which reproduces the old behaviour exactly rather than replaying history.
  local marker="$STATE/deployed-$repo.sha" before
  before="$(cat "$marker" 2>/dev/null || true)"
  if [ -z "$before" ] || ! git -C "$dir" cat-file -e "${before}^{commit}" 2>/dev/null; then
    before="$head_now"
  fi

  if [ "$before" = "$after" ]; then
    [ -n "$DRY" ] || printf '%s\n' "$after" > "$marker"
    return 1          # nothing new
  fi

  local verdict; verdict="$(ci_is_green "$repo" "$after")"
  local green=$?
  if [ $green -ne 0 ] && [ -z "$FORCE" ]; then
    log "$repo: ${after:0:7} is not deployable yet (CI $verdict)"
    return 1
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
    *) die "unknown component: $ONLY (website, studio-bot, enchange, admin-api, api-gateway, shield)" ;;
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
  # deploy/autodeploy/ is owned but has no deploy step: the service runs these
  # files straight out of the checkout, so a fast-forward is the deploy.
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

# A deploy that dirties its own checkout has armed the trap for the next commit,
# not this one, so this is the only moment it is visible before it bites.
step "scan"
RESCAN=0
for pair in "$WEB amitista-web" "$BOTS amitista-bots" "$SHIELD amitista-shield"; do
  set -- $pair
  scan_checkout "$1" "$2" || RESCAN=1
done
if [ $RESCAN -eq 0 ]; then
  log "all three checkouts clean"
else
  warn "a deploy has left a checkout dirty — commit, ignore or stop writing those"
  warn "files, or the next commit touching one of them will block the deploy"
fi

# Hand the admin panel what we just learned. It cannot ask GitHub itself: the
# token is root-only and the admin service runs under ProtectHome, so /root does
# not exist as far as it is concerned. Never fatal — a panel that cannot be
# updated is not a reason to fail a deploy that worked.
if [ -z "$DRY" ]; then
  "$SELF_DIR/github-state.py" "$GITHUB_STATE" \
    "amitista-web=$WEB" "amitista-bots=$BOTS" "amitista-shield=$SHIELD" \
    | sed 's/^/       /' || warn "could not refresh the panel's repository snapshot"
fi

step "result"
[ ${#DEPLOYED[@]} -gt 0 ] && log "deployed: ${DEPLOYED[*]}"

# Failures are checked before the quiet path. A repository that could not be
# fast-forwarded deploys nothing, which used to render as "nothing to deploy"
# and exit 0 — indistinguishable from an idle tick, so a wedged deploy could sit
# unnoticed for as long as it liked. It exits non-zero now, and systemd marks
# the unit failed.
# An idle tick says nothing: this fires only when something was installed or
# something broke, or the channel would carry 1,440 messages a day of silence.
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
