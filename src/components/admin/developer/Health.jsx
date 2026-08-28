import React from 'react';
import {
  Archive,
  Clock,
  Globe,
  HardDrive,
  Server,
  ShieldCheck,
} from 'lucide-react';
import {
  formatAgo,
  formatBytes,
  formatStamp,
  formatUptime,
} from '../../../lib/admin';
import { Dot, Empty, Figure, Notice, Panel, Row, UsageBar } from '../ui';
import {
  CERT_URGENT_DAYS,
  CERT_WARN_DAYS,
  DISK_URGENT,
  DISK_WARN,
  TONE_TEXT,
  deliverySettling,
  healthConcerns,
  restartedRecently,
  serviceTone,
  timerTone,
} from './shared';

export default function Health({ data }) {
  const health = data.health ?? {};
  const services = health.services ?? [];
  const timers = health.timers ?? [];
  const disk = health.disk ?? null;
  const backups = health.backups ?? null;
  const certificate = health.certificate ?? null;
  const relay = health.relay ?? null;

  const concerns = healthConcerns(health, data.stale);
  const worst = concerns.some((entry) => entry.tone === 'rose')
    ? 'rose'
    : concerns.length > 0
      ? 'amber'
      : 'green';

  const down = services.filter((service) => service.state !== 'active').length;
  const restarting = services.filter(restartedRecently).length;
  const settling = deliverySettling(health);

  return (
    <div className="space-y-6">
      {concerns.length === 0 ? (
        <Notice tone="emerald" icon={ShieldCheck}>
          Nothing is asking for attention. Every service is up, every timer has run recently, and
          the disk, certificate and backups are all inside their limits.
        </Notice>
      ) : (
        <Notice tone={worst === 'rose' ? 'rose' : 'amber'}>
          <span className="block font-semibold mb-1.5">
            {concerns.length} thing{concerns.length === 1 ? '' : 's'} to look at
          </span>
          <ul className="space-y-1">
            {concerns.map((entry, index) => (
              <li key={index} className={TONE_TEXT[entry.tone]}>
                {entry.text}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Services"
          value={`${services.length - down}/${services.length}`}
          tone={down ? 'text-rose-400' : 'text-emerald-400'}
          hint={restarting ? `${restarting} has restarted` : 'all up'}
        />
        <Figure
          label="Disk used"
          value={disk && Number.isFinite(disk.percent) ? `${disk.percent.toFixed(1)}%` : '—'}
          tone={
            disk && disk.percent >= DISK_URGENT
              ? 'text-rose-400'
              : disk && disk.percent >= DISK_WARN
                ? 'text-amber-300'
                : 'text-white'
          }
          hint={disk ? `${formatBytes(disk.free)} free` : undefined}
        />
        <Figure
          label="Certificate"
          value={certificate ? `${certificate.daysLeft}d` : '—'}
          tone={
            certificate && certificate.daysLeft < CERT_URGENT_DAYS
              ? 'text-rose-400'
              : certificate && certificate.daysLeft < CERT_WARN_DAYS
                ? 'text-amber-300'
                : 'text-white'
          }
          hint="until expiry"
        />
        <Figure
          label="Last backup"
          value={backups ? formatAgo(backups.created) : 'never'}
          tone={backups ? 'text-white' : 'text-amber-300'}
          hint={backups ? `${backups.count} kept` : undefined}
        />
      </div>

      <Panel title="Services" icon={Server}>
        {services.length === 0 && <Empty>The snapshot listed no services.</Empty>}
        {services.map((service) => {
          const uptime = formatUptime(service.since);
          const tone = serviceTone(service);
          return (
            <div
              key={service.unit}
              className="flex items-center justify-between gap-6 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Dot state={service.state} />
                <div className="min-w-0">
                  <span className="block text-[13px] text-white font-normal truncate">
                    {service.name}
                  </span>
                  <span className="block text-[11px] text-neutral-600 font-mono truncate">
                    {service.unit}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className={`block text-[13px] font-medium ${TONE_TEXT[tone] ?? 'text-white'}`}>
                  {uptime ?? service.state}
                </span>
                <span
                  className={`block text-[10px] tracking-wider uppercase ${
                    restartedRecently(service) ? 'text-amber-300' : 'text-neutral-600'
                  }`}
                >
                  {(service.restarts ?? 0) > 0
                    ? `${service.restarts} restart${service.restarts === 1 ? '' : 's'}`
                    : service.detail || service.state}
                </span>
              </div>
            </div>
          );
        })}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Timers" icon={Clock}>
          {timers.length === 0 && <Empty>The snapshot listed no timers.</Empty>}
          {timers.map((timer) => {
            const tone = timerTone(timer);
            return (
              <div
                key={timer.unit}
                className="flex items-center justify-between gap-6 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Dot state={timer.state} />
                  <div className="min-w-0">
                    <span className="block text-[13px] text-white font-normal truncate">
                      {timer.name}
                    </span>
                    <span
                      className={`block text-[11px] font-normal truncate ${
                        tone === 'green' ? 'text-neutral-600' : TONE_TEXT[tone]
                      }`}
                    >
                      last ran {formatAgo(timer.last)}
                    </span>
                  </div>
                </div>
                <span className="text-[12px] text-neutral-400 text-right shrink-0">
                  {timer.next ? `next ${formatStamp(timer.next)}` : timer.state}
                </span>
              </div>
            );
          })}
        </Panel>

        <div className="space-y-6">
          <Panel title="Disk" icon={HardDrive}>
            {disk ? (
              <>
                <div className="px-4 sm:px-6 py-4">
                  <UsageBar percent={disk.percent} />
                </div>
                <Row label="Used" value={formatBytes(disk.used)} />
                <Row label="Free" value={formatBytes(disk.free)} />
                <Row label="Total" value={formatBytes(disk.total)} />
              </>
            ) : (
              <Empty>The disk was not readable.</Empty>
            )}
          </Panel>

          <Panel title="Certificate" icon={ShieldCheck}>
            {certificate ? (
              <>
                <Row label="Domain" value={certificate.domain} />
                <Row label="Expires" value={formatStamp(certificate.expires)} />
                <Row
                  label="Days left"
                  value={certificate.daysLeft}
                  tone={
                    certificate.daysLeft < CERT_URGENT_DAYS
                      ? 'text-rose-400'
                      : certificate.daysLeft < CERT_WARN_DAYS
                        ? 'text-amber-300'
                        : 'text-white'
                  }
                />
              </>
            ) : (
              <Empty>No certificate was found.</Empty>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Backups" icon={Archive}>
          {backups ? (
            <>
              <Row label="Newest" value={<span className="font-mono text-[12px]">{backups.latest}</span>} />
              <Row label="Taken" value={`${formatStamp(backups.created)} · ${formatAgo(backups.created)}`} />
              <Row label="Size" value={formatBytes(backups.bytes)} />
              <Row label="Kept" value={`${backups.count} · ${formatBytes(backups.totalBytes)} total`} />
            </>
          ) : (
            <Empty>No backup has been recorded.</Empty>
          )}
        </Panel>

        <Panel title="Contact relay" icon={Globe}>
          {relay ? (
            <>
              <Row
                label="Reachable"
                value={relay.reachable ? 'yes' : 'no'}
                tone={relay.reachable ? 'text-emerald-400' : 'text-rose-400'}
              />
              <Row
                label="Delivery to bot"
                value={
                  relay.webhook ? 'live' : settling ? `rechecking after ${settling} restarted` : 'not delivering'
                }
                tone={
                  relay.webhook ? 'text-emerald-400' : settling ? 'text-amber-300' : 'text-rose-400'
                }
              />
            </>
          ) : (
            <Empty>The relay was not checked.</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}
