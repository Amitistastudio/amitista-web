import React from 'react';
import { History, RefreshCw, Info } from 'lucide-react';
import { AUDIT_LABELS, formatStamp, formatAgo } from '../../../lib/admin';
import { Button, Empty, Panel, Pill, Select } from '../ui';

const KEY_ACTION = /^(token|hook)\./;

const TONE = {
  'token.created': 'green',
  'token.restored': 'green',
  'token.rotated': 'amber',
  'token.updated': 'neutral',
  'token.revoked': 'rose',
  'token.deleted': 'rose',
  'hook.saved': 'purple',
  'hook.tested': 'neutral',
  'hook.removed': 'neutral',
};

const GROUPS = [
  { id: 'all', label: 'Everything' },
  { id: 'made', label: 'Made and rotated', match: /^token\.(created|rotated)$/ },
  { id: 'stopped', label: 'Stopped and removed', match: /^token\.(revoked|deleted)$/ },
  { id: 'changed', label: 'Changed', match: /^token\.(updated|restored)$/ },
  { id: 'alerts', label: 'Alert settings', match: /^hook\./ },
];

function describe(entry) {
  const detail = entry.detail ?? {};
  const bits = [];
  if (detail.name) bits.push(detail.name);
  else if (detail.id) bits.push(detail.id);
  if (detail.owner) bits.push(`held by ${detail.owner}`);
  if (Array.isArray(detail.scopes) && detail.scopes.length) bits.push(detail.scopes.join(', '));
  if (Array.isArray(detail.fields) && detail.fields.length) bits.push(`changed ${detail.fields.join(', ')}`);
  return bits.join(' · ');
}

export default function Events({ security, loading, onRefresh }) {
  const [group, setGroup] = React.useState('all');

  const all = (security?.audit ?? []).filter((entry) => KEY_ACTION.test(entry.action ?? ''));
  const chosen = GROUPS.find((entry) => entry.id === group);
  const shown = chosen?.match ? all.filter((entry) => chosen.match.test(entry.action)) : all;

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel
        title={`Key history — ${shown.length}`}
        icon={History}
        action={
          <div className="flex items-center gap-2">
            <div className="w-[190px]">
              <Select
                value={group}
                aria-label="Filter key history"
                onChange={(event) => setGroup(event.target.value)}
              >
                {GROUPS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="button" onClick={onRefresh} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              {loading ? 'Reading…' : 'Refresh'}
            </Button>
          </div>
        }
      >
        {shown.length === 0 && (
          <Empty>
            {all.length === 0
              ? 'Nothing has happened to a key yet, or the entries have aged out of the log.'
              : 'Nothing of that kind in the log.'}
          </Empty>
        )}

        {shown.map((entry, index) => (
          <div
            key={`${entry.at}-${index}`}
            className="px-4 sm:px-6 py-3.5 border-b border-[#17171d] last:border-b-0"
          >
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <Pill tone={TONE[entry.action] ?? 'neutral'}>
                {(entry.action ?? '').replace('token.', '').replace('hook.', 'alerts ')}
              </Pill>
              <span className="text-[13px] text-white font-normal">
                <span className="text-neutral-200">{entry.actor}</span>{' '}
                {AUDIT_LABELS[entry.action] ?? entry.action}
              </span>
              <span className="text-[11px] text-neutral-600 font-normal ml-auto whitespace-nowrap">
                {formatAgo(entry.at)} · {formatStamp(entry.at)}
              </span>
            </div>
            {describe(entry) && (
              <p className="text-[12px] text-neutral-500 font-normal">{describe(entry)}</p>
            )}
          </div>
        ))}
      </Panel>

      <Panel title="What this log does and does not keep" icon={Info}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            Every change to a key is written here as it happens, with who did it and from where. It
            is append-only and rotates once it gets long, so it is recent history rather than a
            permanent record — export from Review if you need to keep something.
          </p>
          <p className="mb-3">
            Removing a key deletes its row and its counters, but not its entries here. That is
            deliberate: a key that vanished should still be explainable afterwards.
          </p>
          <p>
            No key material is ever written to it. Entries carry the key&apos;s id and name, never
            anything that could be used to make a call.
          </p>
        </div>
      </Panel>
    </div>
  );
}
