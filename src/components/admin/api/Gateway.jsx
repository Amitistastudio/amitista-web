import React from 'react';
import { Server, ShieldCheck, HardDrive, Gauge } from 'lucide-react';
import { SCOPE_LABELS, SCOPE_NOTES, formatCount, formatRate } from '../../../lib/admin';
import { Dot, Empty, Panel, Row } from '../ui';

const GATEWAY_UNITS = ['amitista-api.service', 'nginx.service'];

export default function Gateway({ data }) {
  const gateway = data?.gateway ?? {};
  const tokens = data?.tokens ?? [];
  const services = (data?.services ?? []).filter((service) =>
    GATEWAY_UNITS.includes(service.unit),
  );

  const routes = gateway.routes ?? {};
  const scopes = gateway.scopes ?? Object.keys(routes);
  const overrides = tokens.filter((token) => token.rate);
  const inUse = new Set(tokens.flatMap((token) => token.scopes ?? []));

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel title="The services behind it" icon={Server}>
        {services.length === 0 && (
          <Empty>
            No state reported. The snapshot names the units it watches — if the gateway is not among
            them yet, it appears after the next run of the snapshot timer.
          </Empty>
        )}
        {services.map((service) => (
          <div
            key={service.unit}
            className="flex items-center justify-between gap-6 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Dot state={service.state} />
              <div className="min-w-0">
                <span className="block text-[13px] text-white font-normal">{service.name}</span>
                <span className="block text-[11px] text-neutral-600 font-mono truncate">
                  {service.unit}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="block text-[13px] text-neutral-300 font-normal">
                {service.state}
                {service.detail ? ` · ${service.detail}` : ''}
              </span>
              {service.restarts > 0 && (
                <span className="block text-[11px] text-amber-300 font-normal">
                  {service.restarts} restarts
                </span>
              )}
            </div>
          </div>
        ))}
      </Panel>

      <Panel title="What is reachable" icon={ShieldCheck}>
        <Row label="Keyed base" value={gateway.base ?? '/api/k'} />
        <Row label="Same keys, public path" value={gateway.mirror ?? '/api/v1'} />
        <Row label="Open, no key" value={(gateway.open ?? []).join(', ') || '—'} />
        <Row label="Needs a key but no scope" value={(gateway.free ?? []).join(', ') || '—'} />
        <div className="px-4 sm:px-6 py-5 border-t border-[#17171d]">
          <p className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-3">
            Scope to path
          </p>
          <div className="flex flex-col gap-3">
            {scopes.map((scope) => (
              <div key={scope} className="flex items-start justify-between gap-6 flex-wrap">
                <div className="min-w-0">
                  <span className="block text-[13px] text-white font-normal">
                    {SCOPE_LABELS[scope] ?? scope}
                    {!inUse.has(scope) && (
                      <span className="text-[11px] text-neutral-600 font-normal ml-2">
                        no key holds this
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-neutral-600 font-normal">
                    {SCOPE_NOTES[scope] ?? scope}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  {(routes[scope] ?? []).map((path) => (
                    <span key={path} className="block text-[12px] text-neutral-400 font-mono">
                      {path}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Limits in force" icon={Gauge}>
        <Row label="Default per key" value={formatRate(gateway.rate ?? 120)} />
        <Row label="Counted over" value={`${gateway.window ?? 60} seconds, rolling`} />
        <Row label="Highest that can be set" value={formatRate(gateway.maxRate ?? 6000)} />
        <Row label="Keys one account may hold" value={formatCount(gateway.perOwner ?? 25)} />
        <Row
          label="Keys on a raised limit"
          value={formatCount(overrides.length)}
          tone={overrides.length > 0 ? 'text-amber-300' : 'text-white'}
        />
        {overrides.length > 0 && (
          <div className="px-4 sm:px-6 py-4 border-t border-[#17171d]">
            <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">
              {overrides
                .map((token) => `${token.name} — ${formatRate(token.rate)}`)
                .join(' · ')}
            </p>
          </div>
        )}
        <div className="px-4 sm:px-6 py-5 border-t border-[#17171d]">
          <p className="text-[13px] text-neutral-400 font-normal leading-relaxed">
            The limit is held in the gateway&apos;s memory, not on disk, so restarting it forgives
            everyone at once. It is per key rather than per account or per address — two keys are two
            allowances.
          </p>
        </div>
      </Panel>

      <Panel title="How keys are kept" icon={HardDrive}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            A key is stored as a SHA-256 hash plus its first few characters. The prefix is what makes
            rows tellable apart in this panel; the hash is what the gateway compares against. Neither
            can be turned back into a usable key, which is why a lost key can only be rotated.
          </p>
          <p className="mb-3">
            The gateway rereads the store whenever the file changes, so revoking, rotating or
            retiring a key takes hold within about a minute without restarting anything.
          </p>
          <p>
            Counters are held in memory and flushed to disk on a timer. A hard kill can lose the last
            minute of counting — the keys themselves are never at risk, only the statistics.
          </p>
        </div>
      </Panel>
    </div>
  );
}
