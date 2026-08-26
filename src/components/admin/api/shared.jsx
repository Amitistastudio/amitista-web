import React from 'react';
import { Copy, Check as CheckIcon, KeyRound } from 'lucide-react';
import {
  SCOPE_LABELS,
  SCOPE_NOTES,
  KEY_STATE_LABEL,
  KEY_STATE_TONE,
  keyState,
} from '../../../lib/admin';
import { Button, Check, Pill } from '../ui';

export function useCopy(value) {
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

  return [copied, copy];
}

export function CopyButton({ value, label = 'Copy' }) {
  const [copied, copy] = useCopy(value);
  return (
    <Button type="button" onClick={copy}>
      {copied ? (
        <CheckIcon className="h-3.5 w-3.5" strokeWidth={2} />
      ) : (
        <Copy className="h-3.5 w-3.5" strokeWidth={2} />
      )}
      {copied ? 'Copied' : label}
    </Button>
  );
}

export function MintedKey({ name, value, rotated, onDone }) {
  const [shown, setShown] = React.useState(false);
  const shell = `export AMITISTA_KEY="${value}"`;
  const call = `curl https://amitista.com/api/k/v1 \\
  -H "Authorization: Bearer $AMITISTA_KEY"`;

  return (
    <div className="border border-emerald-500/40 bg-emerald-500/10 px-4 sm:px-6 py-5">
      <div className="flex items-center gap-3 mb-3">
        <KeyRound className="h-4 w-4 text-emerald-300 shrink-0" strokeWidth={1.5} />
        <span className="text-[13px] text-white font-medium">{name}</span>
      </div>
      <p className="text-[13px] text-emerald-200/90 font-normal leading-relaxed mb-4">
        {rotated
          ? 'The old key stopped working the moment this one was made. Paste this into whatever was using it.'
          : 'This key is live now.'}{' '}
        Only a hash of it is kept, so this is the one and only time it is shown — there is no reveal
        button to come back to.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <code className="flex-1 min-w-[240px] bg-[#060608] border border-[#282832] px-4 py-3 text-[13px] text-white font-mono break-all">
          {value}
        </code>
        <CopyButton value={value} />
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setShown((open) => !open)}
        className="text-[12px] text-emerald-200/80 hover:text-white font-normal mt-4 underline underline-offset-2 transition-colors"
      >
        {shown ? 'Hide the ready-made commands' : 'Show ready-made commands'}
      </button>

      {shown && (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <p className="text-[11px] font-semibold text-emerald-200/70 tracking-[0.15em] uppercase mb-2">
              Put it in your shell
            </p>
            <div className="flex items-start gap-3 flex-wrap">
              <pre className="flex-1 min-w-[240px] bg-[#060608] border border-[#282832] px-4 py-3 text-[12px] text-neutral-300 font-mono overflow-x-auto">
                {shell}
              </pre>
              <CopyButton value={shell} />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-emerald-200/70 tracking-[0.15em] uppercase mb-2">
              Then call it
            </p>
            <div className="flex items-start gap-3 flex-wrap">
              <pre className="flex-1 min-w-[240px] bg-[#060608] border border-[#282832] px-4 py-3 text-[12px] text-neutral-300 font-mono overflow-x-auto">
                {call}
              </pre>
              <CopyButton value={call} />
            </div>
          </div>
          <p className="text-[12px] text-emerald-200/70 font-normal leading-relaxed">
            The first line holds the key in a variable so the second one never has it written into
            your shell history or a file you might commit.
          </p>
        </div>
      )}
    </div>
  );
}

export function StatePill({ token }) {
  const state = keyState(token);
  return <Pill tone={KEY_STATE_TONE[state]}>{KEY_STATE_LABEL[state]}</Pill>;
}

export function EnvPill({ environment }) {
  return <Pill tone={environment === 'live' ? 'purple' : 'neutral'}>{environment ?? 'live'}</Pill>;
}

export function ScopeGrid({ scopes, granted, onToggle, disabled }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
      {scopes.map((scope) => (
        <Check
          key={scope}
          checked={granted.includes(scope)}
          disabled={disabled}
          label={SCOPE_LABELS[scope] ?? scope}
          hint={SCOPE_NOTES[scope] ?? scope}
          onChange={(on) => onToggle(scope, on)}
        />
      ))}
    </div>
  );
}

export function ScopeChips({ scopes, all }) {
  const held = scopes ?? [];
  if (held.length === 0) {
    return <span className="text-[11px] text-neutral-600 font-mono">no scopes</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {(all ?? held).map((scope) => (
        <span
          key={scope}
          title={SCOPE_NOTES[scope] ?? scope}
          className={`text-[10px] font-mono px-1.5 py-[2px] border ${
            held.includes(scope)
              ? 'border-purple-500/30 text-purple-300/90'
              : 'border-[#1c1c22] text-neutral-700 line-through'
          }`}
        >
          {scope}
        </span>
      ))}
    </div>
  );
}

export function Confirm({ label, danger, onConfirm, children, icon: Icon, disabled }) {
  const [armed, setArmed] = React.useState(false);

  React.useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!armed) {
    return (
      <Button type="button" tone={danger ? 'danger' : 'quiet'} onClick={() => setArmed(true)} disabled={disabled}>
        {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2} />}
        {label}
      </Button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Button type="button" onClick={() => setArmed(false)}>
        Cancel
      </Button>
      <Button
        type="button"
        tone={danger ? 'danger' : 'solid'}
        disabled={disabled}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {children ?? `Yes, ${label.toLowerCase()}`}
      </Button>
    </div>
  );
}
