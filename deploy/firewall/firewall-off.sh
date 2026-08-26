#!/bin/bash
set -uo pipefail

STATE=${FIREWALL_STATE:-/var/lib/amitista/admin/session/firewall.json}
STAGED=${FIREWALL_STAGED:-/var/lib/amitista/admin/session/firewall.conf}
LIVE=${FIREWALL_LIVE:-/etc/nginx/conf.d/amitista-firewall.conf}

echo "Turning the website firewall off at both layers."

if [ -f "$STATE" ]; then
    python3 - "$STATE" <<'PY'
import json
import os
import sys
import tempfile

path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    payload = json.load(handle)
settings = payload.setdefault("settings", {})
settings["enabled"] = False
directory = os.path.dirname(path)
handle = tempfile.NamedTemporaryFile(
    mode="w", encoding="utf-8", dir=directory, prefix=".fw-off-", delete=False
)
json.dump(payload, handle, separators=(",", ":"), sort_keys=True)
handle.close()
os.chmod(handle.name, 0o640)
os.replace(handle.name, path)
print("app layer disabled in %s" % path)
PY
else
    echo "no rule file at $STATE — nothing to disable in the app layer"
fi

EMPTY=${FIREWALL_EMPTY:-$(dirname "$0")/empty.conf}
[ -r "$EMPTY" ] || { echo "no empty ruleset at $EMPTY" >&2; exit 1; }
install -m 644 "$EMPTY" "$STAGED"

install -m 0644 -o root -g root "$STAGED" "$LIVE"

if nginx -t; then
    systemctl reload nginx
    echo "edge layer cleared and nginx reloaded"
else
    echo "nginx refused the cleared config — leaving it in place for inspection" >&2
    exit 1
fi
