import React from 'react';
import { Check as CheckIcon, Copy } from 'lucide-react';

const KIND_TONE = {
  PRJ: 'text-purple-300/90 border-purple-500/30',
  ORD: 'text-sky-300/90 border-sky-500/30',
  REQ: 'text-amber-300/90 border-amber-500/30',
  TKT: 'text-emerald-300/90 border-emerald-500/30',
  INV: 'text-rose-300/90 border-rose-500/30',
  APP: 'text-neutral-300 border-[#3f3f4c]',
};

export const KIND_WORDS = {
  PRJ: 'Project',
  ORD: 'Order',
  REQ: 'Request',
  TKT: 'Ticket',
  INV: 'Invoice',
  APP: 'Application',
};

export function idKind(code) {
  const head = String(code ?? '').slice(0, 3).toUpperCase();
  return KIND_WORDS[head] ? head : null;
}

function write(text) {
  try {
    window.navigator?.clipboard?.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function IdChip({ code, label, title, className = '' }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!code) return null;

  const kind = idKind(code);
  const tone = KIND_TONE[kind] ?? KIND_TONE.APP;

  return (
    <button
      type="button"
      onClick={() => setCopied(write(code))}
      title={title ?? `Copy ${code}`}
      className={`group inline-flex items-center gap-2 border bg-[#08080b] px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] transition-colors hover:bg-[#111115] ${tone} ${className}`}
    >
      {label && (
        <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
          {label}
        </span>
      )}
      <span>{code}</span>
      {copied ? (
        <CheckIcon className="h-3 w-3 shrink-0 text-emerald-400" strokeWidth={2.5} />
      ) : (
        <Copy
          className="h-3 w-3 shrink-0 text-neutral-700 transition-colors group-hover:text-neutral-400"
          strokeWidth={2}
        />
      )}
    </button>
  );
}

export function IdText({ code, className = '' }) {
  if (!code) return null;
  const tone = KIND_TONE[idKind(code)] ?? KIND_TONE.APP;
  return (
    <span
      className={`inline-flex items-center border bg-[#08080b] px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] ${tone} ${className}`}
    >
      {code}
    </span>
  );
}

export function IdSet({ order, className = '' }) {
  const codes = [
    { code: order.project, label: 'Project' },
    { code: order.order, label: 'Order' },
    { code: order.request, label: 'Request' },
  ].filter((entry) => entry.code);

  if (!codes.length) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {codes.map((entry) => (
        <IdChip key={entry.code} code={entry.code} label={entry.label} />
      ))}
    </div>
  );
}
