import React from 'react';
import { Check as CheckIcon, Copy, ExternalLink, Link } from 'lucide-react';
import { ORDER_STAGE_TONE, ORDER_STAGES } from '../../../lib/admin';
import { Pill } from '../ui';

export const MINUTE = 60000;
export const HOUR = 3600000;
export const DAY = 86400000;

export function ago(ms) {
  if (!ms) return '—';
  const gap = Date.now() - ms;
  if (gap < MINUTE) return 'just now';
  if (gap < HOUR) return `${Math.floor(gap / MINUTE)}m ago`;
  if (gap < DAY) return `${Math.floor(gap / HOUR)}h ago`;
  const days = Math.floor(gap / DAY);
  if (days < 31) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function span(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  return `${Math.round(ms / DAY)}d`;
}

export function on(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const STALE_DAYS = 7;

export function needs(order) {
  if (order.status !== 'open') return null;
  if (!order.claimed) return { key: 'unclaimed', label: 'Nobody is leading it' };
  if (order.stage === 'awaiting') return { key: 'awaiting', label: 'Waiting on the client' };
  if (order.stage === 'hold') return { key: 'hold', label: 'Paused' };
  const since = order.updatedAt ?? order.createdAt;
  if (since && Date.now() - since > STALE_DAYS * DAY) {
    return { key: 'stale', label: `Nothing for ${Math.floor((Date.now() - since) / DAY)} days` };
  }
  return null;
}

export function stageTone(stage) {
  return ORDER_STAGE_TONE[stage] ?? 'neutral';
}

export function stageLabel(stage) {
  return ORDER_STAGES.find((entry) => entry.value === stage)?.label ?? stage;
}

export function Label({ children }) {
  return (
    <span className="block text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">
      {children}
    </span>
  );
}

export function Fact({ label, value, tone = 'text-neutral-200', mono = false }) {
  return (
    <div className="px-5 py-4 bg-[#0a0a0d]">
      <Label>{label}</Label>
      <p
        className={`mt-1.5 text-[13px] font-normal leading-snug break-words whitespace-pre-wrap ${tone} ${
          mono ? 'font-mono text-[12px]' : ''
        }`}
      >
        {value || '—'}
      </p>
    </div>
  );
}

export function StageRail({ step, steps, held, closed, delivered }) {
  const total = steps || 5;
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => {
        const reached = delivered ? index < total : index < step - 1;
        const here = index === step - 1;
        return (
          <span
            key={index}
            className={`h-1 flex-1 ${
              closed && !delivered
                ? here
                  ? 'bg-neutral-600'
                  : 'bg-[#1d1d24]'
                : reached
                  ? 'bg-emerald-500/70'
                  : here
                    ? held
                      ? 'bg-amber-400/70'
                      : 'bg-purple-500/70'
                    : 'bg-[#1d1d24]'
            }`}
          />
        );
      })}
    </div>
  );
}

export function StatePill({ order }) {
  if (order.status === 'closed') {
    return <Pill tone={order.stage === 'delivered' ? 'green' : 'neutral'}>{order.stageLabel}</Pill>;
  }
  return <Pill tone={stageTone(order.stage)}>{order.stageLabel}</Pill>;
}

export function trackLink(code) {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://amitista.com';
  return `${origin}/track?code=${encodeURIComponent(code)}`;
}

function copy(text) {
  try {
    window.navigator?.clipboard?.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function TrackCode({ code, className = '' }) {
  const [copied, setCopied] = React.useState(null);

  React.useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!code) return null;

  const link = trackLink(code);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => setCopied(copy(link) ? 'link' : null)}
        title="Copy the full tracking link"
        className="group inline-flex items-center justify-between gap-3 border border-[#282832] bg-[#08080b] px-3.5 py-3 hover:border-purple-500/40 transition-colors text-left w-full max-w-[440px]"
      >
        <span className="min-w-0">
          <span className="block font-mono text-[12px] tracking-[0.12em] text-neutral-200">
            {code}
          </span>
          <span className="block font-mono text-[10px] text-neutral-600 truncate mt-1">{link}</span>
        </span>
        {copied === 'link' ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 shrink-0">
            <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
            Copied
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-neutral-600 group-hover:text-neutral-400 shrink-0">
            <Link className="h-3.5 w-3.5" strokeWidth={2} />
            Copy link
          </span>
        )}
      </button>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setCopied(copy(code) ? 'code' : null)}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <Copy className="h-3 w-3" strokeWidth={2} />
          {copied === 'code' ? 'Code copied' : 'Copy just the code'}
        </button>
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <ExternalLink className="h-3 w-3" strokeWidth={2} />
          Open it
        </a>
      </div>
    </div>
  );
}
