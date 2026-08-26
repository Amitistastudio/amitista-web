import React from 'react';
import { Users, UserX, AlertTriangle, ShieldCheck } from 'lucide-react';
import { formatAgo, formatCount, keyWorks, SCOPE_LABELS, SCOPE_NOTES } from '../../../lib/admin';
import { Empty, Notice, Panel } from '../ui';

function rollUp(tokens) {
  const byHolder = new Map();

  tokens.forEach((token) => {
    const name = token.owner ?? '—';
    const entry = byHolder.get(name) ?? {
      name,
      keys: 0,
      working: 0,
      live: 0,
      requests: 0,
      rejected: 0,
      lastUsed: null,
    };
    entry.keys += 1;
    if (keyWorks(token)) entry.working += 1;
    if ((token.environment ?? 'live') === 'live') entry.live += 1;
    entry.requests += token.requests ?? 0;
    entry.rejected += token.rejected ?? 0;
    if (token.lastUsed && (!entry.lastUsed || token.lastUsed > entry.lastUsed)) {
      entry.lastUsed = token.lastUsed;
    }
    byHolder.set(name, entry);
  });

  return [...byHolder.values()].sort((left, right) => right.requests - left.requests);
}

function ScopeMatrix({ rows, tokens, scopes }) {
  const reach = new Map();
  tokens.filter(keyWorks).forEach((token) => {
    const name = token.owner ?? '—';
    const held = reach.get(name) ?? new Set();
    (token.scopes ?? []).forEach((scope) => held.add(scope));
    reach.set(name, held);
  });

  if (scopes.length === 0 || rows.length === 0) return null;

  return (
    <Panel title="Who can read what" icon={ShieldCheck}>
      <div className="rail overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[520px]">
          <thead>
            <tr className="border-b border-[#17171d]">
              <th className="px-4 sm:px-6 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">
                Holder
              </th>
              {scopes.map((scope) => (
                <th
                  key={scope}
                  title={SCOPE_NOTES[scope] ?? scope}
                  className="px-4 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase text-center whitespace-nowrap"
                >
                  {SCOPE_LABELS[scope] ?? scope}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const held = reach.get(row.name) ?? new Set();
              return (
                <tr key={row.name} className="border-b border-[#17171d] last:border-b-0">
                  <td className="px-4 sm:px-6 py-3 text-[13px] text-white font-normal whitespace-nowrap">
                    {row.name}
                  </td>
                  {scopes.map((scope) => (
                    <td key={scope} className="px-4 py-3 text-center">
                      {held.has(scope) ? (
                        <span className="text-emerald-400 text-[13px]">●</span>
                      ) : (
                        <span className="text-neutral-700 text-[13px]">·</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 sm:px-6 py-4 border-t border-[#17171d]">
        <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">
          A dot means at least one key that account holds is still accepted and carries that scope.
          Revoked and expired keys are left out, because they reach nothing.
        </p>
      </div>
    </Panel>
  );
}

export default function Owners({ data }) {
  const tokens = data?.tokens ?? [];
  const accounts = data?.accounts ?? [];
  const scopes = data?.scopes ?? [];
  const rows = rollUp(tokens);

  const holders = new Set(tokens.map((token) => token.owner).filter(Boolean));
  const withoutKeys = accounts.filter((name) => !holders.has(name));
  const orphans = accounts.length > 0 ? [...holders].filter((name) => !accounts.includes(name)) : [];

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel title={`Who holds what — ${rows.length}`} icon={Users}>
        {rows.length === 0 && <Empty>Nobody holds a key yet.</Empty>}
        {rows.length > 0 && (
          <div className="rail overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-[#17171d]">
                  {['Holder', 'Keys', 'Working', 'Live', 'Requests', 'Refused', 'Last used'].map(
                    (head) => (
                      <th
                        key={head}
                        className="px-4 sm:px-6 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase whitespace-nowrap"
                      >
                        {head}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-b border-[#17171d] last:border-b-0">
                    <td className="px-4 sm:px-6 py-3 text-[13px] text-white font-normal whitespace-nowrap">
                      {row.name}
                      {orphans.includes(row.name) && (
                        <span className="block text-[11px] text-rose-400 font-normal">
                          no such account
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[13px] text-white tabular-nums">
                      {formatCount(row.keys)}
                    </td>
                    <td
                      className={`px-4 sm:px-6 py-3 text-[13px] tabular-nums ${row.working > 0 ? 'text-emerald-400' : 'text-neutral-500'}`}
                    >
                      {formatCount(row.working)}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-400 tabular-nums">
                      {formatCount(row.live)}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-300 tabular-nums">
                      {formatCount(row.requests)}
                    </td>
                    <td
                      className={`px-4 sm:px-6 py-3 text-[13px] tabular-nums ${row.rejected > 0 ? 'text-amber-300' : 'text-neutral-400'}`}
                    >
                      {formatCount(row.rejected)}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-400 whitespace-nowrap">
                      {formatAgo(row.lastUsed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ScopeMatrix rows={rows} tokens={tokens} scopes={scopes} />

      {orphans.length > 0 && (
        <Notice tone="rose" icon={UserX}>
          <p className="mb-2">
            {orphans.length === 1 ? 'One key is held' : `${orphans.length} holders are named`} by an
            account that no longer exists: {orphans.join(', ')}. Removing an account does not remove
            its keys, and those keys keep working.
          </p>
          <p>Reassign them to somebody real, or remove them under Every key.</p>
        </Notice>
      )}

      {accounts.length > 0 && (
        <Panel title={`Accounts with no key — ${withoutKeys.length}`} icon={Users}>
          {withoutKeys.length === 0 ? (
            <Empty>Everybody holds at least one.</Empty>
          ) : (
            <div className="px-4 sm:px-6 py-5">
              <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-3">
                Nothing is wrong with this — it just means these people have never needed one. They
                can make their own at any time from their own API tab.
              </p>
              <p className="text-[12px] text-neutral-500 font-normal">{withoutKeys.join(', ')}</p>
            </div>
          )}
        </Panel>
      )}

      {accounts.length === 0 && (
        <Panel title="Cross-checking holders" icon={AlertTriangle}>
          <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
            Telling a real holder from a stale one needs the permission to see accounts as well as
            this one. Without it the table above still adds up, but it cannot say whether a name
            still belongs to anybody.
          </div>
        </Panel>
      )}
    </div>
  );
}
