import React from 'react';
import { History, ShieldAlert, RefreshCw, UserX } from 'lucide-react';
import { AUDIT_LABELS, formatAgo, formatStamp } from '../../../lib/admin';
import { Button, Empty, Figure, Panel, Pill, Select } from '../ui';

const GROUPS = [
  { id: 'all', label: 'Everything', match: () => true },
  { id: 'accounts', label: 'Account changes', match: (action) => action.startsWith('user.') },
  { id: 'signin', label: 'Sign-ins', match: (action) => action === 'signin.ok' },
  {
    id: 'refused',
    label: 'Refused attempts',
    match: (action) => action === 'signin.failed' || action === 'signin.barred',
  },
  {
    id: 'passwords',
    label: 'Passwords',
    match: (action) => action.startsWith('password.') || action === 'user.password',
  },
  { id: 'tokens', label: 'API tokens', match: (action) => action.startsWith('token.') },
  { id: 'shield', label: 'Shield', match: (action) => action.startsWith('shield.') },
];

const TONE = {
  'signin.failed': 'rose',
  'signin.barred': 'rose',
  'password.failed': 'rose',
  'user.deleted': 'rose',
  'signin.ok': 'green',
  'user.created': 'green',
  'sessions.revokedAll': 'amber',
  'user.signedOut': 'amber',
  'shield.mode': 'amber',
  'shield.cleared': 'amber',
};

export default function Activity({ security, loading, onRefresh }) {
  const [group, setGroup] = React.useState('all');

  const chosen = GROUPS.find((entry) => entry.id === group) ?? GROUPS[0];
  const entries = (security?.audit ?? []).filter((entry) => chosen.match(entry.action ?? ''));
  const lockouts = security?.lockouts ?? [];
  const accounts = security?.accounts ?? [];
  const held = accounts.filter((entry) => entry.lockedFor > 0);
  const failing = accounts.filter((entry) => entry.failures > 0);
  const attempts = accounts.reduce((sum, entry) => sum + entry.failures, 0);

  return (
    <div className="w-full flex flex-col gap-6">
      {accounts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Figure
            label="Locked accounts"
            value={held.length}
            tone={held.length > 0 ? 'text-rose-400' : 'text-white'}
            hint={held.length > 0 ? 'refusing sign-in right now' : 'none held'}
          />
          <Figure
            label="Failed attempts"
            value={attempts}
            tone={attempts > 0 ? 'text-amber-300' : 'text-white'}
            hint="in the log this view holds"
          />
          <Figure
            label="Accounts hit"
            value={failing.length}
            hint="had at least one failure"
          />
          <Figure
            label="Locked addresses"
            value={lockouts.filter((entry) => entry.lockedFor > 0).length}
            tone={lockouts.some((entry) => entry.lockedFor > 0) ? 'text-rose-400' : 'text-white'}
            hint="held at the panel"
          />
        </div>
      )}

      {accounts.length > 0 && (
        <Panel title={`Failed attempts by account — ${accounts.length}`} icon={UserX}>
          <div className="px-4 sm:px-6 py-3 border-b border-[#17171d]">
            <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">
              An account locks itself after repeated failures, separately from the address lockout,
              so somebody spreading attempts across addresses still runs into it. A name here is
              whatever was typed at the form — it need not be a real account.
            </p>
          </div>
          {accounts.map((entry) => (
            <div
              key={entry.account}
              className="px-4 sm:px-6 py-4 border-b border-[#17171d] last:border-b-0"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap mb-1">
                    <span className="text-[13px] text-white font-normal break-all">
                      {entry.account}
                    </span>
                    {entry.lockedFor > 0 && (
                      <Pill tone="rose">
                        locked {Math.max(1, Math.round(entry.lockedFor / 60))}m
                      </Pill>
                    )}
                    {entry.recovery > 0 && <Pill tone="amber">recovery code used</Pill>}
                    {entry.barred > 0 && <Pill tone="amber">turned away</Pill>}
                  </div>
                  <p className="text-[12px] text-neutral-500 font-normal">
                    {entry.failures} failed
                    {entry.badCode > 0 ? ` (${entry.badCode} on the second step)` : ''}
                    {entry.pending > 0 ? ` · ${entry.pending} since the last lock` : ''}
                    {entry.lastFailure ? ` · last ${formatAgo(entry.lastFailure)}` : ''}
                    {entry.lastSuccess ? ` · signed in ${formatAgo(entry.lastSuccess)}` : ''}
                  </p>
                  {entry.addresses.length > 0 && (
                    <p className="text-[11px] text-neutral-600 font-mono mt-1 break-all">
                      from {entry.addresses.join(', ')}
                    </p>
                  )}
                </div>
                <span className="text-[12px] text-neutral-600 font-normal tabular-nums shrink-0">
                  {formatStamp(entry.lastFailure)}
                </span>
              </div>
            </div>
          ))}
        </Panel>
      )}

      {lockouts.length > 0 && (
        <Panel title={`Addresses being refused — ${lockouts.length}`} icon={ShieldAlert}>
          <div className="px-4 sm:px-6 py-3 border-b border-[#17171d]">
            <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">
              Addresses the panel is refusing after repeated failures. They clear themselves; fail2ban
              bans the persistent ones at the firewall.
            </p>
          </div>
          {lockouts.map((entry) => (
            <div
              key={entry.ip}
              className="flex items-baseline justify-between gap-4 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <span className="text-[13px] text-neutral-300 font-mono break-all">{entry.ip}</span>
              <span className="text-[12px] text-neutral-500 font-normal tabular-nums shrink-0">
                {entry.failures} failed
                {entry.lockedFor > 0
                  ? ` · locked for ${Math.max(1, Math.round(entry.lockedFor / 60))}m`
                  : ''}
              </span>
            </div>
          ))}
        </Panel>
      )}

      <Panel
        title={`Activity — ${entries.length}`}
        icon={History}
        action={
          <div className="flex items-center gap-2 shrink-0">
            <Button type="button" onClick={onRefresh} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              {loading ? 'Reading…' : 'Refresh'}
            </Button>
          </div>
        }
      >
        <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] max-w-[320px]">
          <Select
            value={group}
            aria-label="Filter activity"
            onChange={(event) => setGroup(event.target.value)}
          >
            {GROUPS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </div>

        {!security && <Empty>{loading ? 'Reading the log…' : 'The log could not be read.'}</Empty>}
        {security && entries.length === 0 && <Empty>Nothing recorded under that filter.</Empty>}

        {entries.map((entry, index) => (
          <div
            key={`${entry.at}-${index}`}
            className="px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0 flex items-start justify-between gap-4"
          >
            <div className="min-w-0">
              <p className="text-[13px] text-neutral-300 font-normal">
                <span className="text-white">{entry.actor || 'someone'}</span>{' '}
                {AUDIT_LABELS[entry.action] ?? entry.action}
                {entry.detail?.name ? (
                  <span className="text-neutral-400"> {entry.detail.name}</span>
                ) : null}
                {entry.detail?.mode ? (
                  <span className="text-neutral-400"> {entry.detail.mode}</span>
                ) : null}
                {Array.isArray(entry.detail?.changes) && entry.detail.changes.length > 0 ? (
                  <span className="text-neutral-500"> ({entry.detail.changes.join(', ')})</span>
                ) : null}
              </p>
              <p className="text-[11px] text-neutral-600 font-normal mt-1">
                {formatStamp(entry.at)}
                {entry.ip ? ` · ${entry.ip}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {TONE[entry.action] && <Pill tone={TONE[entry.action]}>{entry.action}</Pill>}
              <span className="text-[12px] text-neutral-600 font-normal tabular-nums">
                {formatAgo(entry.at)}
              </span>
            </div>
          </div>
        ))}
      </Panel>

      <Panel title="What is kept" icon={History}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            The panel keeps its own append-only log on the server, separate from the system journal.
            This view shows the most recent entries — the file holds more.
          </p>
          <p>
            Failed sign-ins are recorded on purpose, including ones the lockout already refused.
            Without those lines fail2ban would never see the evidence it counts.
          </p>
        </div>
      </Panel>
    </div>
  );
}
