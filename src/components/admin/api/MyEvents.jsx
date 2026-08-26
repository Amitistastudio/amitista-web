import React from 'react';
import { ShieldAlert, RefreshCw, Globe, Info } from 'lucide-react';
import {
  formatAgo,
  formatCount,
  formatStamp,
  isRefusal,
  KEY_EVENT_LABEL,
  KEY_EVENT_TONE,
} from '../../../lib/admin';
import { Button, Empty, Figure, Notice, Panel, Pill, SearchInput, Select } from '../ui';

const GROUPS = [
  { id: 'all', label: 'Everything' },
  { id: 'refused', label: 'Refusals only' },
  { id: 'newIp', label: 'New addresses' },
  { id: 'changed', label: 'Key changes' },
  { id: 'used', label: 'Accepted calls' },
];

const DAY = 86400000;

function within(event, ms) {
  const at = Date.parse(event?.at ?? '');
  return !Number.isNaN(at) && Date.now() - at <= ms;
}

function matches(event, group) {
  if (group === 'all') return true;
  if (group === 'refused') return isRefusal(event);
  return event.kind === group;
}

function addressRoll(keys) {
  const totals = new Map();
  (keys ?? []).forEach((key) => {
    (key.addresses ?? []).forEach((entry) => {
      const held = totals.get(entry.ip) ?? { ip: entry.ip, count: 0, last: '', keys: new Set() };
      held.count += entry.count ?? 0;
      held.keys.add(key.name);
      if ((entry.last ?? '') > held.last) held.last = entry.last ?? '';
      totals.set(entry.ip, held);
    });
  });
  return [...totals.values()].sort((left, right) => right.count - left.count);
}

export default function MyEvents({ events, keys, webhook, loading, onRefresh }) {
  const [group, setGroup] = React.useState('all');
  const [key, setKey] = React.useState('all');
  const [query, setQuery] = React.useState('');

  const all = events ?? [];
  const shown = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((event) => {
      if (!matches(event, group)) return false;
      if (key !== 'all' && event.id !== key) return false;
      if (!needle) return true;
      return [event.ip, event.path, event.key, event.agent, event.detail]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [all, group, key, query]);

  const today = all.filter((event) => within(event, DAY));
  const refused = today.filter(isRefusal);
  const addresses = addressRoll(keys);
  const quiet = webhook && !webhook.enabled && refused.length > 0;

  if (events === null) {
    return (
      <Panel title="Security" icon={ShieldAlert}>
        <Empty>Reading what your keys have been doing…</Empty>
      </Panel>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Figure label="Last 24 hours" value={formatCount(today.length)} hint="events recorded" />
        <Figure
          label="Refused"
          value={formatCount(refused.length)}
          tone={refused.length > 0 ? 'text-amber-300' : 'text-white'}
          hint="in the last 24 hours"
        />
        <Figure
          label="Addresses"
          value={formatCount(addresses.length)}
          hint="your keys have been called from"
        />
        <Figure
          label="Newest"
          value={all.length > 0 ? formatAgo(all[0].at) : '—'}
          hint={all.length > 0 ? formatStamp(all[0].at) : 'nothing yet'}
        />
      </div>

      {quiet && (
        <Notice icon={Info}>
          Something was turned away in the last day and nothing is set up to tell you. Alerts are the
          next tab.
        </Notice>
      )}

      <Panel
        title={`Activity — ${shown.length}`}
        icon={ShieldAlert}
        action={
          <Button type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            {loading ? 'Reading…' : 'Refresh'}
          </Button>
        }
      >
        <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              value={query}
              placeholder="Address, path or agent"
              aria-label="Search the activity"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="w-[170px]">
            <Select
              value={group}
              aria-label="Kind of event"
              onChange={(event) => setGroup(event.target.value)}
            >
              {GROUPS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[170px]">
            <Select value={key} aria-label="Key" onChange={(event) => setKey(event.target.value)}>
              <option value="all">Any key</option>
              {(keys ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {shown.length === 0 && (
          <Empty>
            {all.length === 0
              ? 'Nothing recorded yet. Every call one of your keys makes, and every call the gateway turns away, lands here.'
              : 'Nothing of that kind in the log.'}
          </Empty>
        )}

        {shown.map((event, index) => (
          <div
            key={`${event.at}-${event.id ?? 'none'}-${index}`}
            className="px-4 sm:px-6 py-3.5 border-b border-[#17171d] last:border-b-0"
          >
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <Pill tone={KEY_EVENT_TONE[event.kind] ?? 'neutral'}>
                {KEY_EVENT_LABEL[event.kind] ?? event.kind}
              </Pill>
              <span className="text-[13px] text-white font-normal">
                {event.key ?? 'a key nobody holds'}
              </span>
              {event.ip && (
                <span className="text-[12px] text-neutral-300 font-mono">{event.ip}</span>
              )}
              {event.status && (
                <span
                  className={`text-[11px] font-mono ${
                    event.status >= 400 ? 'text-amber-300' : 'text-neutral-600'
                  }`}
                >
                  {event.status}
                </span>
              )}
              {event.repeated > 0 && (
                <span className="text-[11px] text-neutral-400 tabular-nums">
                  ×{formatCount(event.repeated + 1)}
                </span>
              )}
              <span className="text-[11px] text-neutral-600 font-normal ml-auto whitespace-nowrap">
                {formatAgo(event.at)} · {formatStamp(event.at)}
              </span>
            </div>
            <p className="text-[12px] text-neutral-500 font-normal">
              {event.kind === 'changed'
                ? `${(event.action ?? '').replace('token.', '')}${
                    event.actor ? ` by ${event.actor}` : ''
                  }`
                : `${event.method ?? 'GET'} ${event.path ?? '—'}`}
              {event.detail ? ` · ${event.detail}` : ''}
              {event.agent ? ` · ${event.agent}` : ''}
            </p>
          </div>
        ))}
      </Panel>

      <Panel title={`Where your keys are called from — ${addresses.length}`} icon={Globe}>
        {addresses.length === 0 ? (
          <Empty>No calls recorded yet.</Empty>
        ) : (
          addresses.slice(0, 25).map((entry) => (
            <div
              key={entry.ip}
              className="flex items-baseline justify-between gap-6 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block text-[13px] text-white font-mono truncate">{entry.ip}</span>
                <span className="block text-[11px] text-neutral-600 font-normal mt-0.5 truncate">
                  {[...entry.keys].join(', ')}
                </span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-[13px] text-neutral-300 tabular-nums">
                  {formatCount(entry.count)}
                </span>
                <span className="block text-[11px] text-neutral-600 mt-0.5">
                  {formatAgo(entry.last)}
                </span>
              </span>
            </div>
          ))
        )}
      </Panel>

      <Panel title="What is kept, and for how long" icon={Info}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            The gateway writes a line for every call your keys make and every call it turns away —
            the time, the address it came from, what was asked for and what it answered. The list
            keeps the most recent few thousand lines and then starts dropping the oldest, so treat
            it as recent history rather than a permanent record.
          </p>
          <p className="mb-3">
            Calls are written in batches every few seconds, so the newest one can take a moment to
            appear here. The same thing happening over and over — the same key, the same path, the
            same answer — is folded into one line with a count beside it rather than a line each,
            so a loop somewhere cannot push the rest of the day out of the list. A call from an
            address that key has not been used from before is never folded.
          </p>
          <p>
            No key material is written to it. A line carries the key&apos;s id and name, never
            anything that could be used to make a call with it.
          </p>
        </div>
      </Panel>
    </div>
  );
}
