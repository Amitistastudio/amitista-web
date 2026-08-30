#!/bin/bash
set -uo pipefail

SITE="${AMITISTA_HEALTH_URL:-https://amitista.com}"
RELAY_HEALTH="http://127.0.0.1:8787/healthz"

ALERT_ENV=/etc/amitista/alerts.env

STATUS_DIR="${AMITISTA_STATUS_DIR:-/var/lib/amitista/status}"
STATUS_OUT="${AMITISTA_STATUS_OUT:-/var/www/amitista.com/shared/status.json}"
SNAPSHOT="$(dirname "$0")/status-snapshot.py"

FAILURES=()
FIXED=()

RESULTS=()
record() { RESULTS+=("$1=$2"); }

CERT_DAYS=""
USED=""

fail() { FAILURES+=("$1"); echo "FAIL  $1" >&2; }
ok()   { echo "ok    $1"; }

HOME_BODY=$(mktemp)
trap 'rm -f "$HOME_BODY"' EXIT

CODE=$(curl -sS --max-time 15 -o "$HOME_BODY" -w '%{http_code}' "$SITE/" 2>/dev/null || echo 000)

if [ "$CODE" != "200" ]; then
  fail "the home page returned $CODE"
  record site down

  if ! systemctl is-active --quiet nginx; then
    if systemctl restart nginx 2>/dev/null && sleep 2 && \
       [ "$(curl -sS --max-time 15 -o "$HOME_BODY" -w '%{http_code}' "$SITE/" 2>/dev/null)" = "200" ]; then
      FIXED+=("nginx was not running and was restarted — the site is back up")
    fi
  fi
else
  ok "home page returns 200"
  record site up
fi

if [ "$CODE" = "200" ]; then
  ADVERTISED=$(curl -sSI --max-time 15 "$SITE/" 2>/dev/null | grep -oE "sha256-[A-Za-z0-9+/=]+" | head -1)
  SERVED=$(python3 - "$HOME_BODY" <<'PY' 2>/dev/null
import base64, hashlib, re, sys
html = open(sys.argv[1], encoding='utf-8').read()
for css in re.findall(r'<style[^>]*>(.*?)</style>', html, re.S):
    print('sha256-' + base64.b64encode(hashlib.sha256(css.encode()).digest()).decode())
PY
)
  if [ -z "$ADVERTISED" ]; then
    fail "the home page advertises no CSP style hash — it would render unstyled"
    record styles down
  elif ! grep -qF "$ADVERTISED" <<<"$SERVED"; then
    fail "CSP style hash does not match the served stylesheet — the home page is UNSTYLED"
    record styles down
  else
    ok "home page stylesheet is authorised by the CSP"
    record styles up
  fi
fi

RELAY=$(curl -sS --max-time 10 "$RELAY_HEALTH" 2>/dev/null || echo '')

if ! grep -q '"ok": *true' <<<"$RELAY"; then
  fail "the contact relay is not answering on $RELAY_HEALTH — enquiries are being lost"
  record contact down
  if systemctl restart amitista-contact 2>/dev/null && sleep 2 && \
     curl -sS --max-time 10 "$RELAY_HEALTH" 2>/dev/null | grep -q '"ok": *true'; then
    FIXED+=("the contact relay was down and was restarted")
  fi
elif ! grep -q '"webhook": *true' <<<"$RELAY"; then
  fail "the contact relay cannot hand enquiries to the bot — enquiries go nowhere"
  record contact down
else
  ok "contact relay is up and can reach the bot"
  record contact up
fi

PRIVACY_TITLE=$(curl -sS --max-time 15 "$SITE/privacy" 2>/dev/null | grep -oP '(?<=<title>).*?(?=</title>)' || true)
ROUTES_OK=1
case "$PRIVACY_TITLE" in
  *"Privacy Policy"*) ok "routes carry their own title" ;;
  '')                 fail "/privacy returned no title at all" ; ROUTES_OK=0 ;;
  *)                  fail "/privacy is titled \"$PRIVACY_TITLE\" — per-route shells are not being served" ; ROUTES_OK=0 ;;
esac

NOT_FOUND=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$SITE/definitely-not-a-page-9d3f" 2>/dev/null || echo 000)
if [ "$NOT_FOUND" = "404" ]; then
  ok "unknown URLs return 404"
else
  fail "an unknown URL returned $NOT_FOUND, not 404"
  ROUTES_OK=0
fi

[ "$ROUTES_OK" = "1" ] && record routes up || record routes down

ORIGIN_TLS="${ORIGIN_TLS:-127.0.0.1:443}"
HANDSHAKE=$(echo | openssl s_client -connect "$ORIGIN_TLS" -servername amitista.com 2>/dev/null)
EXPIRY=$(printf '%s\n' "$HANDSHAKE" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$EXPIRY" ]; then
  DAYS=$(( ( $(date -d "$EXPIRY" +%s) - $(date +%s) ) / 86400 ))
  TLS_OK=1

  if [ "$DAYS" -lt 14 ]; then
    fail "the TLS certificate expires in $DAYS days"
    TLS_OK=0
  fi

  CHAIN=$(printf '%s\n' "$HANDSHAKE" | sed -n '/Certificate chain/,/^---/p')
  LEAF_ALG=$(printf '%s\n' "$HANDSHAKE" | openssl x509 -noout -text 2>/dev/null \
             | grep -m1 "Public Key Algorithm" | sed 's/.*: *//')

  if printf '%s\n' "$CHAIN" | grep -qE "ISRG Root X2|Root YE"; then
    fail "the TLS chain is anchored at ISRG Root X2 — a share of visitors cannot verify it"
    TLS_OK=0
  elif ! printf '%s\n' "$CHAIN" | grep -q "ISRG Root X1"; then
    fail "the TLS chain does not reach ISRG Root X1"
    TLS_OK=0
  fi

  if [ "$LEAF_ALG" != "rsaEncryption" ]; then
    fail "the TLS certificate is $LEAF_ALG, not rsaEncryption"
    TLS_OK=0
  fi

  if [ "$TLS_OK" = "1" ]; then
    ok "origin certificate valid for $DAYS more days, on the ISRG Root X1 chain"
    record tls up
  else
    record tls down
  fi

  CERT_DAYS="$DAYS"
else
  fail "could not read the TLS certificate expiry"
  record tls down
fi

USED=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "$USED" -ge 90 ]; then
  fail "the disk is ${USED}% full"
  record disk down
else
  ok "disk ${USED}% used"
  record disk up
fi

if systemctl is-active --quiet mongod && command -v mongosh >/dev/null; then
  if timeout 10 mongosh --quiet --eval 'db.adminCommand({listDatabases:1})' >/dev/null 2>&1; then
    fail "mongod is answering unauthenticated commands — the auth regression is back"
  else
    ok "mongod refuses unauthenticated commands"
  fi

  if [ -r /etc/amitista/mongodump.yaml ] \
     && timeout 10 mongosh --quiet --config /etc/amitista/mongodump.yaml \
          --eval 'db.admin_docs.find({$where:"true"}).toArray()' >/dev/null 2>&1; then
    fail "mongod is running server-side JavaScript again — \$where injection is live"
  else
    ok "mongod refuses server-side JavaScript"
  fi

  if [ -r /etc/amitista/mongodump.yaml ]; then
    CLEAR=$(timeout 10 mongosh --quiet --config /etc/amitista/mongodump.yaml --eval '
      var bad = [];
      ["users","tokens"].forEach(function (id) {
        var d = db.admin_docs.findOne({_id: id});
        if (d && d.data && !("sealed" in d.data)) { bad.push(id); }
      });
      print(bad.join(","));
    ' 2>/dev/null | tr -d '[:space:]')
    if [ -n "$CLEAR" ]; then
      fail "mongo documents are back in the clear: $CLEAR"
    else
      ok "mongo account and token stores are sealed"
    fi
  fi
fi

NEWEST=$(ls -1t /var/backups/amitista/amitista-*.tar.gz.gpg 2>/dev/null | head -1)
if [ -z "$NEWEST" ]; then
  fail "no encrypted backup archive exists"
elif [ -n "$(find "$NEWEST" -mtime +2 2>/dev/null)" ]; then
  fail "the newest backup archive is more than 2 days old"
else
  ok "encrypted backup archive is $(( ( $(date +%s) - $(stat -c %Y "$NEWEST") ) / 3600 ))h old"
fi

LOOSE=""
while read -r SECRET_FILE; do
  [ -e "$SECRET_FILE" ] || continue
  MODE=$(stat -c %a "$SECRET_FILE")
  GBITS=$(( (8#$MODE / 8) % 8 ))
  OBITS=$(( 8#$MODE % 8 ))
  if [ "$OBITS" -ne 0 ] || [ $(( GBITS & 2 )) -ne 0 ]; then
    LOOSE+="$SECRET_FILE is $MODE; "
  fi
done <<'PATHS'
/etc/amitista
/var/lib/amitista/admin/session/users.json
/var/lib/amitista/tokens/tokens.json
/opt/amitista/discord-bot/.env
/etc/amitista/vault-keys.json
/etc/amitista/mongodump.yaml
PATHS
if [ -n "$LOOSE" ]; then
  fail "secret files have loosened: $LOOSE"
else
  ok "secret files keep their permissions"
fi

if [ -n "${AMITISTA_STATUS_DISABLE:-}" ]; then
  :
elif ! mkdir -p "$STATUS_DIR" 2>/dev/null; then
  echo "healthcheck: cannot write to $STATUS_DIR — status history not recorded" >&2
else
  STATUS_LINE=$(
    python3 - "$CERT_DAYS" "$USED" ${RESULTS[@]+"${RESULTS[@]}"} <<'PY' 2>/dev/null
import json, sys
from datetime import datetime, timezone

cert_days, disk_used = sys.argv[1], sys.argv[2]

record = {
    't': datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
    'c': dict(pair.split('=', 1) for pair in sys.argv[3:] if '=' in pair),
}
m = {}
if cert_days:
    m['certDays'] = int(cert_days)
if disk_used:
    m['diskPercent'] = int(disk_used)
if m:
    record['m'] = m

print(json.dumps(record, separators=(',', ':')))
PY
  )

  if [ -n "$STATUS_LINE" ]; then
    echo "$STATUS_LINE" >>"$STATUS_DIR/history.jsonl" \
      || echo "healthcheck: could not append to the status history" >&2
    python3 "$SNAPSHOT" "$STATUS_DIR/history.jsonl" "$STATUS_OUT" \
      || echo "healthcheck: could not rebuild $STATUS_OUT" >&2
  else
    echo "healthcheck: could not build the status record" >&2
  fi
fi

for f in ${FIXED+"${FIXED[@]}"}; do echo "FIXED $f"; done

if [ ${#FAILURES[@]} -eq 0 ] && [ ${#FIXED[@]} -eq 0 ]; then
  echo "amitista-healthcheck: all checks passed"
  exit 0
fi

SUMMARY=""
for f in ${FAILURES+"${FAILURES[@]}"}; do SUMMARY+="- $f"$'\n'; done
for f in ${FIXED+"${FIXED[@]}"}; do SUMMARY+="- (recovered) $f"$'\n'; done

if [ -r "$ALERT_ENV" ]; then
  . "$ALERT_ENV"
  if [ -n "${ALERT_TOKEN:-}" ] && [ -n "${ALERT_URL:-}" ]; then
    python3 - "$ALERT_URL" "$ALERT_TOKEN" "$SUMMARY" <<'PY' 2>/dev/null || echo "healthcheck: could not send the alert" >&2
import json, sys, urllib.request
url, token, summary = sys.argv[1], sys.argv[2], sys.argv[3]
body = json.dumps({'summary': summary}).encode()
req = urllib.request.Request(url, data=body, headers={
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token,
})
urllib.request.urlopen(req, timeout=10)
PY
  elif [ ${#FAILURES[@]} -ne 0 ]; then
    echo "healthcheck: ALERT_URL or ALERT_TOKEN is empty, so these went undelivered:" >&2
    printf '%s' "$SUMMARY" >&2
  fi
elif [ ${#FAILURES[@]} -ne 0 ]; then
  echo "healthcheck: $ALERT_ENV is unreadable, so these went undelivered:" >&2
  printf '%s' "$SUMMARY" >&2
fi

[ ${#FAILURES[@]} -eq 0 ] && exit 0 || exit 1
