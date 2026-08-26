import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Ban,
  RotateCcw,
  Trash2,
  Activity,
  Pencil,
} from 'lucide-react';
import {
  rotateKey,
  revokeKey,
  restoreKey,
  deleteKey,
  formatAgo,
  formatCount,
  formatDate,
  formatRate,
  daysUntil,
  topPaths,
  keyWorks,
} from '../../../lib/admin';
import { Bar, Button, Pill } from '../ui';
import { Confirm, EnvPill, ScopeChips, StatePill } from './shared';
import { KeyEditor } from './KeyForm';
import KeyTrend from './KeyTrend';

const VIEWS = [
  { id: 'edit', label: 'Details', icon: Pencil },
  { id: 'usage', label: 'Usage', icon: Activity },
  { id: 'danger', label: 'Key itself', icon: RefreshCw },
];

function Meta({ token, admin }) {
  const bits = [];
  if (admin && token.owner) bits.push(`held by ${token.owner}`);
  bits.push(`${formatCount(token.requests)} requests`);
  bits.push(`last used ${formatAgo(token.lastUsed)}`);
  if (token.rejected > 0) bits.push(`${formatCount(token.rejected)} refused`);
  if (token.rate) bits.push(`limited to ${formatRate(token.rate)}`);
  if ((token.allowed ?? []).length > 0) {
    bits.push(
      `${token.allowed.length} allowed address${token.allowed.length === 1 ? '' : 'es'}`,
    );
  }
  if (token.expires) {
    const left = daysUntil(token.expires);
    bits.push(
      token.expired
        ? `expired ${formatDate(token.expires)}`
        : `expires ${formatDate(token.expires)}${left !== null && left <= 14 ? ` — ${left}d` : ''}`,
    );
  }
  if (token.rotated) bits.push(`rotated ${formatAgo(token.rotated)}`);
  return <p className="text-[12px] text-neutral-500 font-normal">{bits.join(' · ')}</p>;
}

function Usage({ token }) {
  const paths = topPaths(token.paths);
  const peak = Math.max(1, ...paths.map((entry) => entry.count));
  const total = token.requests + token.rejected;
  const refusalRate = total > 0 ? Math.round((token.rejected / total) * 100) : 0;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        {[
          ['Requests', formatCount(token.requests), 'text-white'],
          ['Refused', formatCount(token.rejected), token.rejected > 0 ? 'text-amber-300' : 'text-white'],
          ['Refusal rate', `${refusalRate}%`, refusalRate > 20 ? 'text-amber-300' : 'text-white'],
          ['Limit', formatRate(token.effectiveRate), 'text-white'],
        ].map(([label, value, tone]) => (
          <div key={label}>
            <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-1.5">
              {label}
            </p>
            <p className={`text-[18px] font-normal tabular-nums leading-none ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-3">
        Where it goes
      </p>
      {paths.length === 0 ? (
        <p className="text-[13px] text-neutral-500 font-normal">
          Nothing recorded yet. Counters are written by the gateway about once a minute.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {paths.map((entry) => (
            <div key={entry.path}>
              <div className="flex items-baseline justify-between gap-4 mb-1">
                <span className="text-[12px] text-neutral-300 font-mono truncate">{entry.path}</span>
                <span className="text-[12px] text-neutral-500 tabular-nums shrink-0">
                  {formatCount(entry.count)}
                </span>
              </div>
              <Bar percent={(entry.count / peak) * 100} />
            </div>
          ))}
        </div>
      )}

      {(token.allowed ?? []).length > 0 && (
        <div className="mt-6 pt-5 border-t border-[#17171d]">
          <p className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-3">
            Allowed addresses
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {token.allowed.map((entry) => (
              <span
                key={entry}
                className="border border-[#282832] px-2 py-[3px] text-[11px] text-neutral-300 font-mono"
              >
                {entry}
              </span>
            ))}
          </div>
          <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">
            Anything else is refused before the scope is even looked at.
            {token.blocked > 0
              ? ` ${formatCount(token.blocked)} request${token.blocked === 1 ? ' has' : 's have'} been turned away for coming from somewhere else.`
              : ' Nothing has been turned away for its address yet.'}
          </p>
        </div>
      )}

      <div className="mt-6">
        <KeyTrend id={token.id} name={null} title="Calls over time" />
      </div>

      <p className="text-[12px] text-neutral-500 font-normal leading-relaxed mt-5">
        Refused counts every request this key was turned away for — a scope it does not hold, an
        expiry that has passed, a revocation, going over its limit, or coming from an address the
        key is not allowed from.
      </p>
    </div>
  );
}

function Danger({ token, mine, onRotated, onChanged, onError }) {
  const [busy, setBusy] = React.useState(false);
  const killed = mine && token.adminRevoked;
  const issued = mine && token.managed;

  async function run(action) {
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      await action();
    } catch (failure) {
      onError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  if (killed) {
    return (
      <p className="text-[13px] text-neutral-400 font-normal leading-relaxed">
        Whoever runs the panel revoked this key. It is refused at the gateway, and only they can
        bring it back or remove it — rotating your way out of somebody else&apos;s revocation would
        defeat the point of it. Ask them if you think it was a mistake.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <p className="text-[13px] text-neutral-400 font-normal leading-relaxed max-w-lg">
          <span className="text-neutral-200">Rotate</span> mints a replacement and kills this one in
          the same step. Use it the moment a key turns up somewhere it should not — in a commit, a
          screenshot, a message. Everything else about the key stays as it is, and if it was revoked
          the replacement comes back working.
        </p>
        <Confirm
          label="Rotate"
          icon={RefreshCw}
          onConfirm={() =>
            run(async () => {
              const made = await rotateKey(token.id, mine);
              onRotated(made);
            })
          }
        >
          Yes, replace the key
        </Confirm>
      </div>

      <div className="flex items-start justify-between gap-6 flex-wrap border-t border-[#17171d] pt-5">
        <p className="text-[13px] text-neutral-400 font-normal leading-relaxed max-w-lg">
          {token.revoked ? (
            <>
              <span className="text-neutral-200">Restoring</span> puts the same key back to work.
              Only do that if you revoked it by mistake — if it actually leaked, rotate instead.
              {token.revokedBy ? ` Revoked by ${token.revokedBy}.` : ''}
            </>
          ) : (
            <>
              <span className="text-neutral-200">Revoking</span> stops the key at once but keeps its
              row and its counters. It can be put back.
            </>
          )}
        </p>
        {token.revoked ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => run(async () => {
              await restoreKey(token.id, mine);
              onChanged();
            })}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            Restore
          </Button>
        ) : (
          <Confirm
            label="Revoke"
            icon={Ban}
            onConfirm={() =>
              run(async () => {
                await revokeKey(token.id, mine);
                onChanged();
              })
            }
          />
        )}
      </div>

      <div className="flex items-start justify-between gap-6 flex-wrap border-t border-[#17171d] pt-5">
        <p className="text-[13px] text-neutral-400 font-normal leading-relaxed max-w-lg">
          {issued ? (
            <>
              This key was issued to you by whoever runs the panel, so only they can remove it. You
              can still rotate it if it leaks, and revoke it if you need it stopped.
            </>
          ) : (
            <>
              <span className="text-neutral-200">Removing</span> deletes the row and its history for
              good. Anything still calling with it starts getting 401s immediately.
            </>
          )}
        </p>
        {!issued && (
          <Confirm
            label="Remove"
            icon={Trash2}
            danger
            onConfirm={() =>
              run(async () => {
                await deleteKey(token.id, mine);
                onChanged();
              })
            }
          >
            Yes, remove it
          </Confirm>
        )}
      </div>
    </div>
  );
}

export default function KeyRow({
  token,
  scopes,
  gateway,
  admin,
  mine,
  accounts,
  readOnly,
  selected,
  onSelect,
  onChanged,
  onRotated,
  onError,
}) {
  const views = readOnly ? VIEWS.filter((entry) => entry.id === 'usage') : VIEWS;
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState(readOnly ? 'usage' : 'edit');

  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="border-b border-[#17171d] last:border-b-0">
      <div className="px-4 sm:px-6 py-4 flex items-start gap-4">
        {onSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(token.id, event.target.checked)}
            aria-label={`Select ${token.name}`}
            className="mt-[6px] h-3.5 w-3.5 accent-purple-500 shrink-0"
          />
        )}

        <button
          type="button"
          onClick={() => setOpen((shown) => !shown)}
          aria-expanded={open}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
            <Chevron className="h-3.5 w-3.5 text-neutral-600 shrink-0" strokeWidth={2} />
            <span className="text-[14px] text-white font-medium">{token.name}</span>
            <EnvPill environment={token.environment} />
            <StatePill token={token} />
            {mine && token.managed && <Pill tone="purple">issued to you</Pill>}
            {!keyWorks(token) && (
              <span className="text-[11px] text-neutral-600 font-normal">not accepted</span>
            )}
          </div>
          <p className="text-[12px] text-neutral-500 font-mono mb-1.5 pl-6">{token.prefix}…</p>
          <div className="pl-6">
            <Meta token={token} admin={admin} />
            {token.note && (
              <p className="text-[12px] text-neutral-500 font-normal italic mt-1">{token.note}</p>
            )}
            <div className="mt-2">
              <ScopeChips scopes={token.scopes} all={scopes} />
            </div>
          </div>
        </button>
      </div>

      {open && (
        <div className="px-4 sm:px-6 pb-6 pl-6">
          <div className="border border-[#17171d] bg-[#08080b]">
            <div className="flex items-center gap-1 border-b border-[#17171d] px-2">
              {views.map((entry) => {
                const Icon = entry.icon;
                const current = view === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setView(entry.id)}
                    className={`inline-flex items-center gap-2 px-3 py-2.5 text-[11px] font-semibold tracking-wide border-b-2 -mb-px transition-colors ${
                      current
                        ? 'border-purple-500 text-white'
                        : 'border-transparent text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    <Icon className="h-3 w-3" strokeWidth={2} />
                    {entry.label}
                  </button>
                );
              })}
            </div>

            <div className="px-5 py-5">
              {view === 'edit' && !readOnly && (
                <KeyEditor
                  token={token}
                  scopes={scopes}
                  gateway={gateway}
                  admin={admin}
                  accounts={accounts}
                  onSaved={onChanged}
                  onError={onError}
                />
              )}
              {view === 'usage' && <Usage token={token} />}
              {view === 'danger' && !readOnly && (
                <Danger
                  token={token}
                  mine={mine}
                  onRotated={onRotated}
                  onChanged={onChanged}
                  onError={onError}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
