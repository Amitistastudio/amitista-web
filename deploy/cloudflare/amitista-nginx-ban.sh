#!/bin/bash
# Add or remove an address from the nginx-level ban list, then reload nginx.
#
# Usage: amitista-nginx-ban.sh add|del <ip>
#        amitista-nginx-ban.sh flush
#
# Called by the fail2ban action amitista-nginx-deny. See
# /etc/nginx/conf.d/20-amitista-bans.conf for why nginx and not just iptables.
#
# The config is tested before every reload and the list is rolled back if the
# test fails. A ban that cannot be applied must never be allowed to take the
# site down with it.

set -uo pipefail

LIST=/etc/nginx/snippets/amitista-bans.list
LOCK=/run/lock/amitista-nginx-ban.lock

usage() { echo "usage: $0 add|del <ip> | flush" >&2; exit 2; }

[ $# -ge 1 ] || usage
ACTION=$1

valid_ip() {
  # ipv4 dotted quad, or anything with a colon that is a plausible ipv6.
  # Deliberately strict: this string is written into a config file nginx parses.
  [[ $1 =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] && return 0
  [[ $1 =~ ^[0-9a-fA-F:]+$ && $1 == *:* ]] && return 0
  return 1
}

reload_or_rollback() {
  local backup=$1
  if nginx -t >/dev/null 2>&1; then
    if systemctl reload nginx >/dev/null 2>&1; then
      rm -f "$backup"
      return 0
    fi
    echo "amitista-nginx-ban: nginx reload failed, rolling back" >&2
  else
    echo "amitista-nginx-ban: config test failed, rolling back" >&2
  fi
  mv "$backup" "$LIST"
  systemctl reload nginx >/dev/null 2>&1
  return 1
}

exec 9>"$LOCK" || exit 1
flock 9

case "$ACTION" in
  add)
    [ $# -eq 2 ] || usage
    IP=$2
    valid_ip "$IP" || { echo "amitista-nginx-ban: refusing to write '$IP'" >&2; exit 1; }
    grep -qxF "deny $IP;" "$LIST" && exit 0
    BACKUP=$(mktemp "${LIST}.bak.XXXXXX")
    cp "$LIST" "$BACKUP"
    printf 'deny %s;\n' "$IP" >>"$LIST"
    reload_or_rollback "$BACKUP"
    ;;
  del)
    [ $# -eq 2 ] || usage
    IP=$2
    valid_ip "$IP" || { echo "amitista-nginx-ban: refusing to match '$IP'" >&2; exit 1; }
    grep -qxF "deny $IP;" "$LIST" || exit 0
    BACKUP=$(mktemp "${LIST}.bak.XXXXXX")
    cp "$LIST" "$BACKUP"
    grep -vxF "deny $IP;" "$BACKUP" >"$LIST"
    reload_or_rollback "$BACKUP"
    ;;
  flush)
    BACKUP=$(mktemp "${LIST}.bak.XXXXXX")
    cp "$LIST" "$BACKUP"
    grep -E '^\s*#' "$BACKUP" >"$LIST"
    reload_or_rollback "$BACKUP"
    ;;
  *)
    usage
    ;;
esac
