import React from 'react';
import { BookMarked, Check as CheckIcon, Copy } from 'lucide-react';
import { Panel } from '../ui';

// Copying a path or a command is the whole point of this screen, so the copy
// affordance sits on the row itself rather than behind a button that would
// double the width of every line.
function CopyRow({ label, value, hint }) {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [value]);

  return (
    <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0 group">
      <div className="min-w-0 flex-1">
        <span className="block text-[12px] text-neutral-500 font-normal">{label}</span>
        <span className="block text-[12.5px] text-white font-mono break-all mt-0.5">{value}</span>
        {hint && (
          <span className="block text-[11px] text-neutral-600 font-normal mt-0.5">{hint}</span>
        )}
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="tap shrink-0 mt-0.5 inline-flex items-center gap-1.5 border border-[#282832] px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase text-neutral-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-neutral-200 hover:bg-[#111115] transition-all"
      >
        {copied ? (
          <CheckIcon className="h-3 w-3" strokeWidth={2} />
        ) : (
          <Copy className="h-3 w-3" strokeWidth={2} />
        )}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export default function Reference({ data }) {
  const sections = data.reference ?? [];

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-neutral-500 font-normal leading-relaxed max-w-2xl">
        Where everything on this box lives, what each unit is called, and the handful of commands
        you need often enough to stop looking up. Hover a row to copy it.
      </p>

      {sections.map((section) => (
        <Panel key={section.title} title={section.title} icon={BookMarked}>
          {section.rows.map((row) => (
            <CopyRow key={row.label} label={row.label} value={row.value} hint={row.hint} />
          ))}
        </Panel>
      ))}
    </div>
  );
}
