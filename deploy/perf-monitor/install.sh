#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE=/var/lib/amitista/perf

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31minstall failed: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "needs root — it installs systemd units"
[ -x /opt/node/bin/node ] || die "/opt/node/bin/node is not there"
[ -x /usr/bin/chromium ] || die "/usr/bin/chromium is not there — the monitor drives it over CDP"

say "Creating $STATE"
install -d -m 750 "$STATE"

say "Installing the units"
install -m 644 "$HERE/amitista-perf.service" /etc/systemd/system/amitista-perf.service
install -m 644 "$HERE/amitista-perf.timer" /etc/systemd/system/amitista-perf.timer
systemctl daemon-reload

say "Taking the first measurement as the baseline"
/opt/node/bin/node "$HERE/perf-monitor.mjs" --rebaseline || \
  die "the first run failed — fix that before enabling the timer, or it will alert every six hours"

say "Enabling the timer"
# enable, then restart. `enable --now` starts a stopped unit but leaves a
# running one exactly as it is, so a deploy would install new code into /opt
# and the old process would keep serving it — reporting success the whole
# time. restart starts a stopped unit too, so this covers a first install.
systemctl enable amitista-perf.timer
systemctl restart amitista-perf.timer
systemctl list-timers amitista-perf.timer --no-pager

say "Installed. Re-baseline after any deliberate change with:"
printf '  /opt/node/bin/node %s/perf-monitor.mjs --rebaseline\n' "$HERE"
