import React from 'react';
import { KeyRound, Sparkles, Eye, EyeOff, Copy, Check as CheckIcon } from 'lucide-react';
import { generatePassword, PASSWORD_MIN } from '../../../lib/admin';
import { PermissionPicker } from '../permissions';
import { Button, Check, Field, Select } from '../ui';

export const ROLE_TONE = { owner: 'purple', admin: 'green', viewer: 'neutral', custom: 'amber' };

export const INPUT_CLASS =
  'w-full bg-[#111115] border border-[#282832] px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-purple-500/60 transition-colors';

export function sameSet(left, right) {
  const a = [...(left ?? [])].sort();
  const b = [...(right ?? [])].sort();
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

export function Stat({ label, value, tone = 'text-white', hint }) {
  return (
    <div className="bg-[#0a0a0d] px-5 py-4">
      <p className="text-[11px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-2">
        {label}
      </p>
      <p className={`text-2xl font-normal tabular-nums leading-none ${tone}`}>{value}</p>
      {hint && <p className="text-[11px] text-neutral-600 font-normal mt-2 truncate">{hint}</p>}
    </div>
  );
}

export function usePasswordChoice() {
  const [mode, setMode] = React.useState('generate');
  const [value, setValue] = React.useState('');
  const [repeat, setRepeat] = React.useState('');
  const [mustChange, setMustChange] = React.useState(true);
  const [reveal, setReveal] = React.useState(false);

  const chosen = mode === 'set';
  const short = chosen && value.length > 0 && value.length < PASSWORD_MIN;
  const mismatch = chosen && repeat.length > 0 && value !== repeat;
  const ready = !chosen || (value.length >= PASSWORD_MIN && value === repeat);

  function clear() {
    setMode('generate');
    setValue('');
    setRepeat('');
    setMustChange(true);
    setReveal(false);
  }

  function suggest() {
    const made = generatePassword();
    setValue(made);
    setRepeat(made);
    setReveal(true);
  }

  return {
    mode,
    setMode,
    value,
    setValue,
    repeat,
    setRepeat,
    mustChange,
    setMustChange,
    reveal,
    setReveal,
    chosen,
    short,
    mismatch,
    ready,
    clear,
    suggest,
  };
}

export function PasswordChoice({ idPrefix, choice, generateNote, heading = 'Password' }) {
  return (
    <div>
      {heading && (
        <p className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-3">
          {heading}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <Button
          type="button"
          tone={choice.mode === 'generate' ? 'solid' : 'quiet'}
          onClick={() => choice.setMode('generate')}
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
          Generate one
        </Button>
        <Button
          type="button"
          tone={choice.mode === 'set' ? 'solid' : 'quiet'}
          onClick={() => choice.setMode('set')}
        >
          <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
          Set one myself
        </Button>
      </div>

      {!choice.chosen && (
        <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">{generateNote}</p>
      )}

      {choice.chosen && (
        <>
          <Field
            label="Password"
            htmlFor={`${idPrefix}-password`}
            hint={`At least ${PASSWORD_MIN} characters. It is hashed on the server — nothing readable is kept.`}
          >
            <div className="relative">
              <input
                id={`${idPrefix}-password`}
                type={choice.reveal ? 'text' : 'password'}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                value={choice.value}
                onChange={(event) => choice.setValue(event.target.value)}
                className={`${INPUT_CLASS} pr-[92px] font-mono`}
              />
              <div className="absolute right-0 top-0 h-full flex items-center">
                <button
                  type="button"
                  onClick={() => choice.setReveal((shown) => !shown)}
                  aria-label={choice.reveal ? 'Hide password' : 'Show password'}
                  className="px-3 text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  {choice.reveal ? (
                    <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={1.5} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={choice.suggest}
                  aria-label="Suggest a strong password"
                  className="px-3 text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  <Sparkles className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </Field>

          <Field label="Repeat password" htmlFor={`${idPrefix}-repeat`}>
            <input
              id={`${idPrefix}-repeat`}
              type={choice.reveal ? 'text' : 'password'}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              value={choice.repeat}
              onChange={(event) => choice.setRepeat(event.target.value)}
              className={`${INPUT_CLASS} font-mono`}
            />
          </Field>

          <Check
            checked={choice.mustChange}
            onChange={choice.setMustChange}
            label="Make them change it the first time they sign in"
            hint="Leave this on unless the account is your own."
          />

          {choice.short && (
            <p className="text-[13px] text-amber-300 font-normal mt-3">
              Use at least {PASSWORD_MIN} characters.
            </p>
          )}
          {choice.mismatch && (
            <p className="text-[13px] text-amber-300 font-normal mt-3">Those two do not match.</p>
          )}
        </>
      )}
    </div>
  );
}

export function Secret({ name, secret, headline, onDone }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border border-emerald-500/40 bg-emerald-500/10 px-4 sm:px-6 py-5">
      <p className="text-[13px] text-emerald-200/90 font-normal leading-relaxed mb-4">
        <span className="text-white font-medium">{name}</span> {headline} This password is shown once
        and is not stored anywhere in readable form — copy it now and hand it over yourself.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <code className="flex-1 min-w-[220px] bg-[#060608] border border-[#282832] px-4 py-3 text-[13px] text-white font-mono break-all">
          {secret}
        </code>
        <Button type="button" onClick={copy}>
          {copied ? (
            <CheckIcon className="h-3.5 w-3.5" strokeWidth={2} />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

export function PermissionGrid({ permissions, effective, editable, onToggle }) {
  return (
    <PermissionPicker
      permissions={permissions}
      effective={effective}
      editable={editable}
      onToggle={onToggle}
    />
  );
}

export function RolePicker({ id, roles, value, onChange, allowOwner }) {
  return (
    <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {roles
        .filter((entry) => entry !== 'owner' || allowOwner || value === 'owner')
        .map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      <option value="custom">custom</option>
    </Select>
  );
}

export function OwnerWarning({ children }) {
  return (
    <div className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 mt-3">
      <p className="text-[12px] text-amber-200/90 font-normal leading-relaxed">{children}</p>
    </div>
  );
}
