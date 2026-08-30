import React from 'react';
import { formatAgo } from '../../../lib/admin';

export const TIMER_GRACE_FLOOR_MS = 15 * 60 * 1000;

export function timerOverdue(timer) {
  const next = typeof timer?.next === 'string' ? Date.parse(timer.next) : NaN;
  if (Number.isNaN(next)) return false;

  const last = typeof timer?.last === 'string' ? Date.parse(timer.last) : NaN;
  const interval = Number.isNaN(last) ? 0 : Math.max(0, next - last);
  const grace = Math.max(TIMER_GRACE_FLOOR_MS, interval * 0.1);

  return Date.now() > next + grace;
}

export const CERT_WARN_DAYS = 30;
export const CERT_URGENT_DAYS = 14;

export const DISK_WARN = 80;
export const DISK_URGENT = 90;

export const BACKUP_STALE_HOURS = 36;

export const RESTART_RECENT_MS = 6 * 60 * 60 * 1000;

export const RELAY_PROBE_TTL_MS = 5 * 60 * 1000;
export const RELAY_DELIVERY_UNIT = 'amitista-bot-website.service';

export function agoMs(value) {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return Date.now() - parsed;
}

export function restartedRecently(service) {
  if ((service?.restarts ?? 0) <= 0) return false;
  const running = agoMs(service?.since);
  return running !== null && running < RESTART_RECENT_MS;
}

export function serviceTone(service) {
  if (service?.state === 'failed') return 'rose';
  if (service?.state !== 'active') return 'amber';
  if (restartedRecently(service)) return 'amber';
  return 'green';
}

export function deliverySettling(health) {
  for (const service of health?.services ?? []) {
    if (service?.unit !== RELAY_DELIVERY_UNIT) continue;
    if (service.state !== 'active') return null;
    const running = agoMs(service.since);
    return running !== null && running < RELAY_PROBE_TTL_MS ? service.name : null;
  }
  return null;
}

export function timerTone(timer) {
  if (timer?.state === 'failed') return 'rose';
  if (timerOverdue(timer)) return 'amber';
  return 'green';
}

export const TONE_TEXT = {
  green: 'text-emerald-400',
  amber: 'text-amber-300',
  rose: 'text-rose-400',
  neutral: 'text-neutral-400',
};

export function healthConcerns(health, stale) {
  const found = [];
  const add = (tone, text) => found.push({ tone, text });

  if (stale) add('amber', 'This snapshot is over 15 minutes old — the collector timer may be stuck.');

  for (const service of health?.services ?? []) {
    if (service.state === 'failed') add('rose', `${service.name} has failed.`);
    else if (service.state !== 'active') add('amber', `${service.name} is ${service.state}.`);
    else if (restartedRecently(service)) {
      const times = `${service.restarts} time${service.restarts === 1 ? '' : 's'}`;
      add('amber', `${service.name} has restarted ${times}, most recently ${formatAgo(service.since)}.`);
    }
  }

  for (const timer of health?.timers ?? []) {
    if (timer.state === 'failed') {
      add('rose', `The ${timer.name.toLowerCase()} timer has failed.`);
      continue;
    }
    if (timerOverdue(timer)) {
      add('amber', `The ${timer.name.toLowerCase()} timer missed its scheduled run.`);
    }
  }

  const disk = health?.disk ?? null;
  if (disk && Number.isFinite(disk.percent)) {
    if (disk.percent >= DISK_URGENT) add('rose', `The disk is ${disk.percent.toFixed(1)}% full.`);
    else if (disk.percent >= DISK_WARN) add('amber', `The disk is ${disk.percent.toFixed(1)}% full.`);
  }

  const certificate = health?.certificate ?? null;
  if (certificate && Number.isFinite(certificate.daysLeft)) {
    if (certificate.daysLeft < CERT_URGENT_DAYS) {
      add('rose', `The certificate expires in ${certificate.daysLeft} days.`);
    } else if (certificate.daysLeft < CERT_WARN_DAYS) {
      add('amber', `The certificate expires in ${certificate.daysLeft} days.`);
    }
  }

  const backups = health?.backups ?? null;
  const backupAge = agoMs(backups?.created);
  if (!backups || backupAge === null) add('amber', 'No backup has been recorded.');
  else if (backupAge > BACKUP_STALE_HOURS * 3600 * 1000) {
    add('amber', `The newest backup is ${Math.round(backupAge / 3600000)} hours old.`);
  }

  const relay = health?.relay ?? null;
  if (relay && relay.reachable === false) {
    add('rose', 'The contact relay is not answering.');
  } else if (relay && relay.webhook === false) {
    const settling = deliverySettling(health);
    if (settling) {
      add('amber', `Enquiry delivery is unconfirmed while ${settling} settles — the relay rechecks within ${Math.round(RELAY_PROBE_TTL_MS / 60000)} minutes.`);
    } else {
      add('rose', 'The contact relay cannot hand enquiries to the bot — enquiries are going nowhere.');
    }
  }

  return found;
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };

export function Th({ children, align = 'left' }) {
  return (
    <th
      className={`px-4 sm:px-6 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase ${ALIGN[align] ?? ALIGN.left}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = '' }) {
  return <td className={`px-4 sm:px-6 py-3 whitespace-nowrap ${className}`}>{children}</td>;
}

export function Scroller({ min = 540, children }) {
  return (
    <div className="rail overflow-x-auto">
      <table className="w-full text-left border-collapse" style={{ minWidth: min }}>
        {children}
      </table>
    </div>
  );
}
