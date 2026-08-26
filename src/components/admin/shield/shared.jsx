import React from 'react';
import { ShieldOff } from 'lucide-react';
import { SEVERITY_TONE, formatAgo, formatStamp } from '../../../lib/admin';
import { Notice, Pill } from '../ui';

export function SeverityPill({ severity }) {
  return <Pill tone={SEVERITY_TONE[severity] ?? 'neutral'}>{severity ?? 'unknown'}</Pill>;
}

export function Unreachable({ shield }) {
  if (shield?.reachable) return null;
  const service = shield?.service;
  return (
    <Notice tone="rose" icon={ShieldOff}>
      <p className="mb-2">
        {shield?.message ?? 'The evaluator could not be read.'}
      </p>
      <p className="text-[12px] opacity-80">
        {service
          ? `${shield.unit} is ${service.state ?? 'in an unknown state'}.`
          : `${shield?.unit ?? 'The evaluator'} does not appear in the latest snapshot, so it is probably not installed yet. Run deploy/shield-demo/install.sh on the server.`}
      </p>
    </Notice>
  );
}

export function FlagRow({ flag, verbose }) {
  return (
    <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] last:border-b-0">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[13px] text-white font-mono">{flag.id}</span>
            <SeverityPill severity={flag.severity} />
            {flag.blocked ? <Pill tone="rose">refused</Pill> : <Pill>recorded</Pill>}
          </div>
          <p className="text-[13px] text-neutral-400 font-normal leading-relaxed">{flag.detail}</p>
        </div>
        <span className="text-[12px] text-neutral-600 font-normal tabular-nums shrink-0">
          {formatAgo(flag.time)}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[11px] text-neutral-600 font-mono">
        <span className="text-neutral-500">
          {flag.method ?? '—'} {flag.path ?? '—'}
        </span>
        {flag.call || flag.sink ? <span>at {flag.call || flag.sink}</span> : null}
        {flag.reference ? <span className="text-purple-300/80">{flag.reference}</span> : null}
        <span>{formatStamp(flag.time)}</span>
      </div>

      {flag.fragment ? (
        <pre className="mt-3 bg-[#060608] border border-[#282832] px-4 py-2.5 text-[12px] text-amber-200/80 font-mono overflow-x-auto">
          {typeof flag.fragment === 'string' ? flag.fragment : JSON.stringify(flag.fragment)}
        </pre>
      ) : null}

      {verbose ? (
        <pre className="mt-3 bg-[#060608] border border-[#282832] px-4 py-2.5 text-[11px] text-neutral-500 font-mono overflow-x-auto">
          {JSON.stringify(flag, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
