import React from 'react';
import { KeySquare, Plus, X, Info } from 'lucide-react';
import {
  formatCount,
  keyWorks,
  keyState,
  daysSince,
  daysUntil,
  KEY_IDLE_DAYS,
  KEY_EXPIRING_DAYS,
} from '../../../lib/admin';
import { Button, Empty, Figure, Notice, Panel, SearchInput, Select } from '../ui';
import { CreateKey } from './KeyForm';
import KeyRow from './KeyRow';

const ORDER = {
  newest: (left, right) => (right.created ?? '').localeCompare(left.created ?? ''),
  busiest: (left, right) => (right.requests ?? 0) - (left.requests ?? 0),
  name: (left, right) => (left.name ?? '').localeCompare(right.name ?? ''),
};

function nudge(key) {
  if (key.revoked) return null;
  if (key.expired) return 'Expired — the gateway is already turning it away.';
  const left = daysUntil(key.expires);
  if (left !== null && left <= KEY_EXPIRING_DAYS) {
    return `Ends in ${left} ${left === 1 ? 'day' : 'days'} — whatever uses it stops that morning.`;
  }
  if (!key.lastUsed) return 'Never used. If it was a mistake, remove it.';
  const since = daysSince(key.lastUsed);
  if (since !== null && since >= KEY_IDLE_DAYS) {
    return `Not used in ${since} days. A key nobody uses is a key nobody notices being stolen.`;
  }
  return null;
}

export default function MyKeys({ data, onChanged, onError, onMinted }) {
  const [creating, setCreating] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [state, setState] = React.useState('all');
  const [order, setOrder] = React.useState('newest');

  const keys = data?.keys ?? [];
  const scopes = data?.scopes ?? [];
  const gateway = data?.gateway ?? null;
  const working = keys.filter(keyWorks);
  const requests = keys.reduce((total, key) => total + (key.requests ?? 0), 0);
  const room = (gateway?.perOwner ?? 25) - keys.length;
  const busy = keys.length > 5;

  const shown = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return keys
      .filter((key) => {
        if (state !== 'all' && keyState(key) !== state) return false;
        if (!needle) return true;
        return [key.name, key.note, key.prefix]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle));
      })
      .sort(ORDER[order] ?? ORDER.newest);
  }, [keys, query, state, order]);

  const wanted = keys.map((key) => ({ key, note: nudge(key) })).filter((entry) => entry.note);

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Figure label="Keys" value={formatCount(keys.length)} hint={`${Math.max(0, room)} left`} />
        <Figure
          label="Working"
          value={formatCount(working.length)}
          tone={working.length > 0 ? 'text-emerald-400' : 'text-white'}
        />
        <Figure label="Requests" value={formatCount(requests)} hint="since counting began" />
        <Figure
          label="Not accepted"
          value={formatCount(keys.length - working.length)}
          tone={keys.length - working.length > 0 ? 'text-amber-300' : 'text-white'}
          hint="revoked or expired"
        />
      </div>

      {wanted.length > 0 && (
        <Notice icon={Info}>
          <p className="mb-2">
            {wanted.length === 1 ? 'One key wants' : `${wanted.length} keys want`} a look:
          </p>
          <ul className="flex flex-col gap-1">
            {wanted.map(({ key, note }) => (
              <li key={key.id}>
                <span className="text-white">{key.name}</span> — {note}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <Panel
        title={`Your keys — ${keys.length}`}
        icon={KeySquare}
        action={
          room > 0 ? (
            <Button type="button" onClick={() => setCreating((shown_) => !shown_)}>
              {creating ? (
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {creating ? 'Cancel' : 'New key'}
            </Button>
          ) : (
            <span className="text-[11px] text-neutral-500 font-normal">
              You are at the limit of {gateway?.perOwner ?? 25}
            </span>
          )
        }
      >
        {creating && (
          <div className="border-b border-[#17171d]">
            <CreateKey
              scopes={scopes}
              gateway={gateway}
              admin={false}
              self={data?.owner}
              onError={onError}
              onCreated={(made) => {
                setCreating(false);
                onMinted({ name: made.token?.name, key: made.key, rotated: false });
                onChanged();
              }}
            />
          </div>
        )}

        {busy && (
          <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <SearchInput
                value={query}
                placeholder="Name, note or prefix"
                aria-label="Search your keys"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="w-[150px]">
              <Select
                value={state}
                aria-label="State"
                onChange={(event) => setState(event.target.value)}
              >
                <option value="all">Any state</option>
                <option value="active">Active</option>
                <option value="expiring">Ending soon</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </Select>
            </div>
            <div className="w-[150px]">
              <Select
                value={order}
                aria-label="Order"
                onChange={(event) => setOrder(event.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="busiest">Busiest first</option>
                <option value="name">By name</option>
              </Select>
            </div>
          </div>
        )}

        {keys.length === 0 && !creating && (
          <Empty>
            You have no keys yet. A key lets a script of yours read the API without a browser session
            — make one and it appears here.
          </Empty>
        )}

        {keys.length > 0 && shown.length === 0 && <Empty>No key matches that.</Empty>}

        {shown.map((token) => (
          <KeyRow
            key={token.id}
            token={token}
            scopes={scopes}
            gateway={gateway}
            admin={false}
            mine
            onChanged={onChanged}
            onError={onError}
            onRotated={(made) => {
              onMinted({ name: made.token?.name, key: made.key, rotated: true });
              onChanged();
            }}
          />
        ))}
      </Panel>

      <Panel title="What a key is" icon={KeySquare}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            A key is yours. It appears in your list and nobody else&apos;s, and only you or someone
            who runs the panel can change it.
          </p>
          <p className="mb-3">
            The server keeps a hash of it, never the key itself. That is why it is shown once when
            you make it: if you lose it, nobody can look it up — you rotate it and get a new one.
          </p>
          <p>
            Signing out does not stop a key. It carries on working until it expires, is revoked, or
            is removed, which is the point of it.
          </p>
        </div>
      </Panel>
    </div>
  );
}
