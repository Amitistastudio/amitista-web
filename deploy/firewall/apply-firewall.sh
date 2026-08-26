#!/bin/bash
set -uo pipefail

STAGED=${FIREWALL_STAGED:-/var/lib/amitista/admin/session/firewall.conf}
LIVE=${FIREWALL_LIVE:-/etc/nginx/conf.d/amitista-firewall.conf}
STATUS=${FIREWALL_STATUS:-/var/lib/amitista/admin/session/firewall-apply.json}
BACKUP="$LIVE.last-good"

stamp() {
    date -u +%Y-%m-%dT%H:%M:%SZ
}

report() {
    local state=$1
    local detail=$2
    local tmp
    tmp=$(mktemp "$(dirname "$STATUS")/.fw-apply.XXXXXX")
    printf '{"state":"%s","at":"%s","detail":%s}\n' \
        "$state" "$(stamp)" "$(printf '%s' "$detail" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')" \
        >"$tmp"
    chmod 0644 "$tmp"
    mv "$tmp" "$STATUS"
}

if [ ! -r "$STAGED" ]; then
    report missing "No staged firewall config at $STAGED."
    exit 0
fi

if [ -f "$LIVE" ] && cmp -s "$STAGED" "$LIVE"; then
    report current "Already in step with the panel."
    exit 0
fi

if [ -f "$LIVE" ]; then
    cp -p "$LIVE" "$BACKUP"
fi

install -m 0644 -o root -g root "$STAGED" "$LIVE"

if ! test_output=$(nginx -t 2>&1); then
    if [ -f "$BACKUP" ]; then
        install -m 0644 -o root -g root "$BACKUP" "$LIVE"
    else
        rm -f "$LIVE"
    fi
    nginx -t >/dev/null 2>&1
    report refused "$test_output"
    exit 1
fi

if ! reload_output=$(systemctl reload nginx 2>&1); then
    if [ -f "$BACKUP" ]; then
        install -m 0644 -o root -g root "$BACKUP" "$LIVE"
    else
        rm -f "$LIVE"
    fi
    systemctl reload nginx >/dev/null 2>&1
    report failed "$reload_output"
    exit 1
fi

report applied "Rules are live at the edge."
