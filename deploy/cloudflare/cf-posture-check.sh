#!/bin/bash
# Verify that the site is actually behind Cloudflare, and stays there.
#
# Three things this catches, all of which have a history of being wrong:
#
#   1. A hostname that resolves past the edge. The apex A record can be proxied
#      while the AAAA record is not, in which case every IPv6 visitor bypasses
#      Cloudflare and the origin address is published in DNS. That is not a
#      hypothetical: it was the state of this zone on 14 Aug 2026, in the hour
#      after the nameserver move, and nothing on the box would have reported it.
#
#   2. Cloudflare's published IP ranges drifting away from the trust list in
#      /etc/nginx/conf.d/10-cloudflare-realip.conf. If that list goes stale,
#      real-IP restoration silently stops working for the new ranges and every
#      visitor behind them collapses into one rate-limit bucket.
#
#      This only ever reports the drift. It does not rewrite the conf. That
#      file decides who is allowed to assert a client address by sending a
#      CF-Connecting-IP header, so it is a trust boundary, and a trust boundary
#      does not get widened automatically on the strength of an HTTP response.
#
#   3. The origin answering for its own address. The catch-all in the site conf
#      returns 444 to anything whose Host is not ours, which is what stops an
#      attacker who has found the origin from skipping the edge. If that ever
#      regresses, the edge stops being worth having.
#
# ON NOT USING THE SYSTEM RESOLVER. Every lookup here goes straight to the
# zone's authoritative nameservers. The first version of this script asked the
# box's resolver and reported a bypass that did not exist: the records had
# already been proxied, but 1.1.1.1 was still handing out the pre-migration
# origin address from cache, on some queries and not others. A recursive
# resolver answers with what it cached, which is a fact about the resolver and
# not about the zone. Asking the authoritative server is the only lookup whose
# answer means what this check needs it to mean.
#
# Alerts go to the same webhook the healthcheck uses.

set -uo pipefail

APEX="${AMITISTA_APEX:-amitista.com}"
# The origin address is deliberately not in this file: the repository is public
# and the whole point of check 4 below is that the address is hard to find.
# It lives in /etc/amitista/cf.env, which the unit reads.
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

# One authoritative nameserver for the zone, resolved once and reused.
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

# --- 1. is every published address a Cloudflare address? --------------------

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

# --- 2. does the edge actually answer, and is real-IP restoration intact? ----
#
# cf-ray is added by Cloudflare and cannot be forged by the origin, so its
# presence proves the request was served through the edge. --resolve pins the
# address so this does not depend on the local resolver either.

EDGE=$(dig +short "@$NS" "$APEX" A 2>/dev/null | head -1)
if [ -n "$EDGE" ]; then
  HEADERS=$(curl -sS -I "https://$APEX/" --resolve "$APEX:443:$EDGE" --max-time 20 2>/dev/null)
  if grep -qi '^cf-ray:' <<<"$HEADERS"; then
    ok "the edge serves $APEX (cf-ray present)"
  else
    fail "$APEX did not come back through Cloudflare when asked at its published address"
  fi
fi

# --- 3. published ranges vs the real-IP trust list ---------------------------

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

# --- 4. does the origin still refuse to answer for its own address? ---------
#
# A dropped connection is the pass condition, so curl's exit status is the
# signal and its printed code is not consulted. Comparing the printed body of
# a failed transfer is how the first version of this check reported a false
# failure.

if [ -z "$ORIGIN_V4" ]; then
  fail "AMITISTA_ORIGIN_V4 is not set, so the direct-to-IP check did not run — put the origin address in /etc/amitista/cf.env"
elif curl -sS -o /dev/null -k "https://$ORIGIN_V4/" --max-time 15 >/dev/null 2>&1; then
  fail "the origin answered a direct-to-IP request — the edge can be skipped by anyone who knows the address"
else
  ok "origin drops direct-to-IP requests"
fi

# --- report -----------------------------------------------------------------

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
