#!/bin/bash

set -uo pipefail

CHECK="$(dirname "$0")/cf-posture-check.sh"
COMMENT_TAG="cloudflare-origin"

fetch_ranges() {
  { curl -sS https://www.cloudflare.com/ips-v4 --max-time 20; echo;
    curl -sS https://www.cloudflare.com/ips-v6 --max-time 20; } 2>/dev/null \
    | grep -vE '^\s*$'
}

case "${1:-status}" in

  status)
    echo "--- ufw rules for 80/443 ---"
    ufw status | grep -E '^(80|443)/tcp|# '"$COMMENT_TAG" || echo "(none)"
    echo
    if ufw status | grep -q "$COMMENT_TAG"; then
      echo "lockdown: APPLIED"
    else
      echo "lockdown: NOT applied — 80/443 are open to the internet"
    fi
    ;;

  apply)
    echo "checking that nothing still reaches the origin directly..."
    if ! "$CHECK" >/dev/null 2>&1; then
      echo "REFUSING: cf-posture-check.sh is failing. Run it to see why." >&2
      echo "Applying the lockdown while a hostname bypasses Cloudflare would" >&2
      echo "cut off every visitor using that hostname." >&2
      exit 1
    fi
    echo "posture check passes."

    RANGES=$(fetch_ranges)
    COUNT=$(wc -l <<<"$RANGES")
    if [ "$COUNT" -lt 10 ]; then
      echo "REFUSING: only $COUNT ranges fetched from Cloudflare — that is not a" >&2
      echo "plausible list, and applying it would lock out most of the edge." >&2
      exit 1
    fi
    echo "fetched $COUNT Cloudflare ranges."

    while read -r net; do
      [ -n "$net" ] || continue
      ufw allow from "$net" to any port 80,443 proto tcp comment "$COMMENT_TAG" >/dev/null
    done <<<"$RANGES"
    echo "added $COUNT allow rules."

    ufw delete allow 80/tcp  >/dev/null 2>&1
    ufw delete allow 443/tcp >/dev/null 2>&1
    echo "removed the blanket 80/443 allows."

    echo
    echo "verifying the site still serves through the edge..."
    VERIFIED=1
    for attempt in 1 2 3; do
      sleep 5
      if "$CHECK" >/dev/null 2>&1; then VERIFIED=0; break; fi
      echo "  attempt $attempt failed, retrying..."
    done
    if [ "$VERIFIED" -eq 0 ]; then
      echo "OK — the site is up and still behind Cloudflare."
    else
      echo "The posture check FAILS after three attempts. Run '$0 revert' if the site is down." >&2
      exit 1
    fi
    ;;

  revert)
    while read -r line; do
      [ -n "$line" ] || continue
      ufw --force delete "$line" >/dev/null 2>&1
    done < <(ufw status numbered | grep "$COMMENT_TAG" | grep -oE '^\[\s*[0-9]+\]' | grep -oE '[0-9]+' | sort -rn)
    ufw allow 80/tcp  comment 'http'  >/dev/null
    ufw allow 443/tcp comment 'https' >/dev/null
    echo "reverted: 80/443 are open to the internet again."
    ;;

  *)
    echo "usage: $0 status|apply|revert" >&2
    exit 2
    ;;
esac
