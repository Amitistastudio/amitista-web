#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -m 0644 "$HERE/amitista-errorwatch.service" /etc/systemd/system/amitista-errorwatch.service
install -m 0644 "$HERE/amitista-errorwatch.timer" /etc/systemd/system/amitista-errorwatch.timer

systemctl daemon-reload
systemctl enable amitista-errorwatch.timer
systemctl restart amitista-errorwatch.timer

echo "errorwatch: timer installed and running"
systemctl list-timers amitista-errorwatch.timer --no-pager | sed -n '1,3p'
