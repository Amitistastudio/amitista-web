#!/bin/bash

set -uo pipefail

APEX="${AMITISTA_APEX:-amitista.com}"
ORIGIN_V4="${AMITISTA_ORIGIN_V4:-}"
REALIP_CONF=/etc/nginx/conf.d/10-cloudflare-realip.conf
ALERT_ENV=/etc/amitista/alerts.env

FAILURES=()
fail() { FAILURES+=("$1"); echo "FAIL  $1" >&2; }
ok()   { echo "ok    $1"; }

UPSTREAM=$(mktemp)
trap 'rm -f "$UPSTREAM"' EXIT

{ curl -sS https://www.cloudflare.com/ips-v4 --max-time 20; echo;
  curl -sS https://www.cloudflare.com/ips-v6 --max-time 20; } 2>/dev/null \
  | grep -vE '^\s*$' | sort -u >"$UPSTREAM"

NS=$(dig +short NS "$APEX" 2>/dev/null | head -1)
if [ -z "$NS" ]; then
  fail "could not find the authoritative nameservers for $APEX"
  NS=""
fi

in_cloudflare() {
  python3 - "$UPSTREAM" "$1" <<'PY' 2>/dev/null
import ipaddress, sys
nets = [ipaddress.ip_network(l.strip()) for l in open(sys.argv[1]) if l.strip()]
addr = ipaddress.ip_address(sys.argv[2])
sys.exit(0 if any(addr in n for n in nets) else 1)
PY
}

record_check() {
  local host=$1 rrtype=$2
  local addrs leaked=()
  addrs=$(dig +short "@$NS" "$host" "$rrtype" 2>/dev/null | grep -vE '\.$')

  if [ -z "$addrs" ]; then
    ok "$host has no $rrtype record"
    return
  fi
  for a in $addrs; do
    in_cloudflare "$a" || leaked+=("$a")
  done
  if [ ${#leaked[@]} -eq 0 ]; then
    ok "$host $rrtype is proxied"
  else
    fail "$host $rrtype is NOT proxied — it publishes ${leaked[*]}, so that hostname bypasses Cloudflare and exposes the origin"
  fi
}

if [ -n "$NS" ] && [ -s "$UPSTREAM" ]; then
  record_check "$APEX"      A
  record_check "$APEX"      AAAA
  record_check "www.$APEX"  A
  record_check "www.$APEX"  AAAA
fi

EDGE=$(dig +short "@$NS" "$APEX" A 2>/dev/null | head -1)
if [ -n "$EDGE" ]; then
  HEADERS=$(curl -sS -I "https://$APEX/" --resolve "$APEX:443:$EDGE" --max-time 20 2>/dev/null)
  if grep -qi '^cf-ray:' <<<"$HEADERS"; then
    ok "the edge serves $APEX (cf-ray present)"
  else
    fail "$APEX did not come back through Cloudflare when asked at its published address"
  fi
fi

if [ ! -s "$UPSTREAM" ]; then
  fail "could not fetch Cloudflare's published IP ranges — drift is unverified this run"
else
  LIVE=$(mktemp)
  grep -oE 'set_real_ip_from [0-9a-fA-F:./]+' "$REALIP_CONF" \
    | awk '{print $2}' | tr -d ';' | sort -u >"$LIVE"
  MISSING=$(comm -13 "$LIVE" "$UPSTREAM" | tr '\n' ' ')
  STALE=$(comm -23 "$LIVE" "$UPSTREAM" | tr '\n' ' ')
  rm -f "$LIVE"
  if [ -n "$MISSING" ]; then
    fail "Cloudflare publishes ranges missing from $REALIP_CONF: ${MISSING% } — visitors behind them share one rate-limit bucket. Add them by hand."
  fi
  if [ -n "$STALE" ]; then
    fail "$REALIP_CONF trusts ranges Cloudflare no longer publishes: ${STALE% } — remove them by hand."
  fi
  [ -z "$MISSING$STALE" ] && ok "real-IP trust list matches Cloudflare's published ranges ($(wc -l <"$UPSTREAM") ranges)"
fi

if [ -z "$ORIGIN_V4" ]; then
  fail "AMITISTA_ORIGIN_V4 is not set, so the direct-to-IP check did not run — put the origin address in /etc/amitista/cf.env"
elif curl -sS -o /dev/null -k "https://$ORIGIN_V4/" --max-time 15 >/dev/null 2>&1; then
  fail "the origin answered a direct-to-IP request — the edge can be skipped by anyone who knows the address"
else
  ok "origin drops direct-to-IP requests"
fi

if [ ${#FAILURES[@]} -eq 0 ]; then
  echo "cf-posture-check: all checks passed"
  exit 0
fi

SUMMARY=""
for f in ${FAILURES+"${FAILURES[@]}"}; do SUMMARY+="- $f"$'\n'; done

if [ -r "$ALERT_ENV" ]; then
  . "$ALERT_ENV"
  if [ -n "${ALERT_WEBHOOK:-}" ]; then
    python3 - "$ALERT_WEBHOOK" "$SUMMARY" <<'PY' 2>/dev/null || echo "cf-posture-check: could not send the alert" >&2
import json, sys, urllib.request
url, summary = sys.argv[1], sys.argv[2]
body = json.dumps({'content': f'**amitista.com Cloudflare posture**\n{summary}'}).encode()
req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'})
urllib.request.urlopen(req, timeout=10)
PY
  fi
fi

exit 1
