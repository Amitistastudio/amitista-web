import React from 'react';
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, X } from 'lucide-react';
import { Select, TextInput } from '../ui';
import {
  factChips,
  factLabels,
  keyFields,
  purposeIcon,
  purposeOf,
  restFields,
  strayFacts,
} from './facts';

const INPUT = {
  line: { maxLength: 120 },
  host: { maxLength: 120, spellCheck: false, placeholder: '1.2.3.4 or play.example.com' },
  port: { maxLength: 5, inputMode: 'numeric', placeholder: '30120' },
  link: { maxLength: 300, type: 'url', spellCheck: false, placeholder: 'https://' },
  day: { type: 'date' },
};

const CHIP =
  'inline-flex items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-2 py-1 text-[11px] font-normal';

export function PurposePicker({ purposes, value, disabled, onPick }) {
  const chosen = purposeOf(purposes, value);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(purposes ?? []).map((entry) => {
          const Icon = purposeIcon(entry.id);
          const active = entry.id === chosen.id;
          return (
            <button
              key={entry.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onPick(entry.id)}
              className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] font-semibold tracking-wide transition-colors disabled:opacity-50 ${
                active
                  ? 'border-purple-500/50 bg-purple-500/15 text-white'
                  : 'border-[#282832] bg-[#0a0a0d] text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              {entry.label}
            </button>
          );
        })}
      </div>
      {chosen?.blurb && (
        <p className="mt-2 text-[12px] font-normal leading-relaxed text-neutral-500">
          {chosen.blurb}
        </p>
      )}
    </>
  );
}

function Cell({ field, value, disabled, onSet, onHold, onRelease }) {
  const id = `fact-${field.id}`;
  const held = value ?? '';
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500"
      >
        {field.label}
      </label>
      {field.kind === 'pick' ? (
        <Select
          id={id}
          value={held}
          disabled={disabled}
          onChange={(event) => onSet(field.id, event.target.value)}
          onBlur={() => onRelease?.(field.id)}
        >
          <option value="">Not set</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : (
        <TextInput
          id={id}
          value={held}
          disabled={disabled}
          onChange={(event) => onSet(field.id, event.target.value)}
          onFocus={() => onHold?.(field.id)}
          onBlur={() => onRelease?.(field.id)}
          {...(INPUT[field.kind] ?? INPUT.line)}
        />
      )}
      {field.hint && (
        <p className="mt-1 text-[11px] font-normal text-neutral-600">{field.hint}</p>
      )}
    </div>
  );
}

export function FactSheet({
  purpose,
  purposes,
  values,
  disabled,
  onSet,
  onHold,
  onRelease,
  onDrop,
}) {
  const [open, setOpen] = React.useState(false);
  const keyed = keyFields(purpose);
  const rest = restFields(purpose);
  const stray = strayFacts(purpose, values);
  const labels = factLabels(purposes);
  const forced = rest.some((field) => (values?.[field.id] ?? '').trim());
  const shown = open || forced;

  if (!keyed.length && !rest.length) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] font-normal leading-relaxed text-neutral-500">
          Nothing else to fill in — a personal board is just yours.
        </p>
        {stray.length > 0 && (
          <Stray keys={stray} labels={labels} disabled={disabled} onDrop={onDrop} />
        )}
      </div>
    );
  }

  const cell = (field) => (
    <Cell
      key={field.id}
      field={field}
      value={values?.[field.id]}
      disabled={disabled}
      onSet={onSet}
      onHold={onHold}
      onRelease={onRelease}
    />
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">{keyed.map(cell)}</div>
      {rest.length > 0 && !forced && (
        <button
          type="button"
          onClick={() => setOpen((held) => !held)}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-neutral-500 transition-colors hover:text-neutral-200"
        >
          {open ? (
            <ChevronUp className="h-3 w-3" strokeWidth={2} />
          ) : (
            <ChevronDown className="h-3 w-3" strokeWidth={2} />
          )}
          {open ? 'Fewer details' : `${rest.length} more details`}
        </button>
      )}
      {shown && <div className="grid gap-3 sm:grid-cols-2">{rest.map(cell)}</div>}
      {stray.length > 0 && (
        <Stray keys={stray} labels={labels} disabled={disabled} onDrop={onDrop} />
      )}
    </div>
  );
}

function Stray({ keys, labels, disabled, onDrop }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-[11px] font-normal leading-relaxed text-neutral-600">
      <span>
        {keys.length === 1 ? 'One detail is' : `${keys.length} details are`} kept from an earlier
        kind. Switch back to see {keys.length === 1 ? 'it' : 'them'}, or drop
        {keys.length === 1 ? ' it' : ' them'}:
      </span>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          title={labels?.[key] ? `${labels[key]} — drop it` : 'Drop it'}
          disabled={disabled || !onDrop}
          onClick={() => onDrop?.(key)}
          className="inline-flex items-center gap-1 border border-[#282832] bg-[#0a0a0d] px-1.5 py-0.5 text-neutral-400 transition-colors hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
        >
          {key}
          <X className="h-2.5 w-2.5" strokeWidth={2} />
        </button>
      ))}
    </p>
  );
}

function Copyable({ label, text }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label.toLowerCase()}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          setDone(false);
        }
      }}
      className={`${CHIP} transition-colors hover:border-[#3f3f4c]`}
    >
      <span className="text-neutral-600">{label}</span>
      <span className="tabular-nums text-neutral-200">{text}</span>
      {done ? (
        <Check className="h-3 w-3 text-emerald-400" strokeWidth={2.5} />
      ) : (
        <Copy className="h-3 w-3 text-neutral-600" strokeWidth={2} />
      )}
    </button>
  );
}

function FactChip({ chip }) {
  if (chip.copy) return <Copyable label={chip.label} text={chip.copy} />;
  const body = (
    <>
      <span className="text-neutral-600">{chip.label}</span>
      <span className="text-neutral-200">{chip.text}</span>
    </>
  );
  if (chip.href) {
    return (
      <a
        href={chip.href}
        target="_blank"
        rel="noreferrer noopener"
        className={`${CHIP} transition-colors hover:border-[#3f3f4c]`}
      >
        {body}
        <ExternalLink className="h-3 w-3 text-neutral-600" strokeWidth={2} />
      </a>
    );
  }
  return <span className={CHIP}>{body}</span>;
}

export function PurposeMark({ purposes, board, className = '' }) {
  const purpose = purposeOf(purposes, board?.purpose);
  const Icon = purposeIcon(purpose.id);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2} />
      {purpose.label}
    </span>
  );
}

export function FactStrip({ board, purposes, onMore }) {
  const purpose = purposeOf(purposes, board?.purpose);
  const chips = factChips(purpose, board?.facts);
  if (purpose.id === 'personal' && !chips.length) return null;

  const keyed = new Set(keyFields(purpose).map((field) => field.id));
  const shown = chips.filter((chip) => keyed.has(chip.id) || chip.href);
  const rest = chips.length - shown.length;
  const Icon = purposeIcon(purpose.id);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`${CHIP} font-semibold text-neutral-300`}>
        <Icon className="h-3 w-3" strokeWidth={2} />
        {purpose.label}
      </span>
      {shown.map((chip) => (
        <FactChip key={chip.id} chip={chip} />
      ))}
      {!chips.length && (
        <span className="text-[11px] font-normal text-neutral-600">
          No details filled in yet.
        </span>
      )}
      {rest > 0 && onMore && (
        <button
          type="button"
          onClick={onMore}
          className="text-[11px] font-semibold tracking-wide text-neutral-500 underline underline-offset-4 transition-colors hover:text-neutral-200"
        >
          +{rest} more
        </button>
      )}
    </div>
  );
}
