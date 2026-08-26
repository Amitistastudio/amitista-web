import React from 'react';
import { KeySquare, Plus, X, Ban, Trash2 } from 'lucide-react';
import {
  revokeKey,
  deleteKey,
  formatCount,
  keyState,
  keyWorks,
} from '../../../lib/admin';
import { Button, Empty, Figure, Panel, SearchInput, Select } from '../ui';
import { Confirm } from './shared';
import { CreateKey } from './KeyForm';
import KeyRow from './KeyRow';

const ORDER = {
  newest: (left, right) => (right.created ?? '').localeCompare(left.created ?? ''),
  busiest: (left, right) => (right.requests ?? 0) - (left.requests ?? 0),
  quietest: (left, right) => (left.requests ?? 0) - (right.requests ?? 0),
  name: (left, right) => (left.name ?? '').localeCompare(right.name ?? ''),
  holder: (left, right) => (left.owner ?? '').localeCompare(right.owner ?? ''),
};

function matches(token, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [token.name, token.owner, token.prefix, token.note, token.id]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle));
}

export default function AllKeys({ data, canManage, self, onChanged, onError, onMinted }) {
  const [creating, setCreating] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [holder, setHolder] = React.useState('all');
  const [environment, setEnvironment] = React.useState('all');
  const [state, setState] = React.useState('all');
  const [order, setOrder] = React.useState('newest');
  const [picked, setPicked] = React.useState([]);
  const [busy, setBusy] = React.useState(false);

  const tokens = data?.tokens ?? [];
  const scopes = data?.scopes ?? [];
  const gateway = data?.gateway ?? null;
  const accounts = data?.accounts ?? [];

  const holders = React.useMemo(
    () => [...new Set(tokens.map((token) => token.owner).filter(Boolean))].sort(),
    [tokens],
  );

  const shown = React.useMemo(() => {
    const filtered = tokens.filter((token) => {
      if (!matches(token, query)) return false;
      if (holder !== 'all' && token.owner !== holder) return false;
      if (environment !== 'all' && (token.environment ?? 'live') !== environment) return false;
      if (state !== 'all' && keyState(token) !== state) return false;
      return true;
    });
    return filtered.sort(ORDER[order] ?? ORDER.newest);
  }, [tokens, query, holder, environment, state, order]);

  const selected = picked.filter((id) => shown.some((token) => token.id === id));
  const working = tokens.filter(keyWorks);
  const requests = tokens.reduce((total, token) => total + (token.requests ?? 0), 0);
  const refused = tokens.reduce((total, token) => total + (token.rejected ?? 0), 0);

  function toggle(id, on) {
    setPicked((current) => (on ? [...current, id] : current.filter((entry) => entry !== id)));
  }

  async function bulk(action, verb) {
    if (busy || selected.length === 0) return;
    setBusy(true);
    onError(null);
    let done = 0;
    try {
      for (const id of selected) {
        await action(id);
        done += 1;
      }
      setPicked([]);
    } catch (failure) {
      onError(
        done === 0
          ? failure.message
          : `${verb} ${done} of ${selected.length}, then stopped: ${failure.message}`,
      );
    } finally {
      onChanged();
      setBusy(false);
    }
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Figure label="Keys" value={formatCount(tokens.length)} hint={`${holders.length} holders`} />
        <Figure
          label="Working"
          value={formatCount(working.length)}
          tone={working.length > 0 ? 'text-emerald-400' : 'text-white'}
        />
        <Figure label="Requests" value={formatCount(requests)} />
        <Figure
          label="Refused"
          value={formatCount(refused)}
          tone={refused > 0 ? 'text-amber-300' : 'text-white'}
        />
      </div>

      <Panel
        title={`Every key — ${shown.length}${shown.length === tokens.length ? '' : ` of ${tokens.length}`}`}
        icon={KeySquare}
        action={
          canManage ? (
            <Button type="button" onClick={() => setCreating((open) => !open)}>
              {creating ? (
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {creating ? 'Cancel' : 'New key'}
            </Button>
          ) : (
            <span className="text-[11px] text-neutral-500 font-normal">Read only</span>
          )
        }
      >
        {creating && canManage && (
          <div className="border-b border-[#17171d]">
            <CreateKey
              scopes={scopes}
              gateway={gateway}
              admin
              accounts={accounts}
              self={self}
              onError={onError}
              onCreated={(made) => {
                setCreating(false);
                onMinted({ name: made.token?.name, key: made.key, rotated: false });
                onChanged();
              }}
            />
          </div>
        )}

        <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              value={query}
              placeholder="Name, holder, prefix or note"
              aria-label="Search keys"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="w-[150px]">
            <Select value={holder} aria-label="Holder" onChange={(event) => setHolder(event.target.value)}>
              <option value="all">Anyone</option>
              {holders.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-[130px]">
            <Select
              value={environment}
              aria-label="Environment"
              onChange={(event) => setEnvironment(event.target.value)}
            >
              <option value="all">Either</option>
              <option value="live">live</option>
              <option value="test">test</option>
            </Select>
          </div>

          <div className="w-[150px]">
            <Select value={state} aria-label="State" onChange={(event) => setState(event.target.value)}>
              <option value="all">Any state</option>
              <option value="active">Active</option>
              <option value="expiring">Ending soon</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
            </Select>
          </div>

          <div className="w-[150px]">
            <Select value={order} aria-label="Order" onChange={(event) => setOrder(event.target.value)}>
              <option value="newest">Newest first</option>
              <option value="busiest">Busiest first</option>
              <option value="quietest">Quietest first</option>
              <option value="name">By name</option>
              <option value="holder">By holder</option>
            </Select>
          </div>
        </div>

        {canManage && selected.length > 0 && (
          <div className="px-4 sm:px-6 py-3 border-b border-[#17171d] bg-[#0d0d11] flex items-center gap-3 flex-wrap">
            <span className="text-[12px] text-neutral-300 font-normal">
              {selected.length} selected
            </span>
            <Confirm
              label="Revoke selected"
              icon={Ban}
              onConfirm={() => bulk((id) => revokeKey(id, false), 'Revoked')}
            >
              Yes, revoke {selected.length}
            </Confirm>
            <Confirm
              label="Remove selected"
              icon={Trash2}
              danger
              onConfirm={() => bulk((id) => deleteKey(id, false), 'Removed')}
            >
              Yes, remove {selected.length}
            </Confirm>
            <Button type="button" onClick={() => setPicked([])}>
              Clear
            </Button>
          </div>
        )}

        {shown.length === 0 && (
          <Empty>
            {tokens.length === 0
              ? 'No keys exist yet. Anyone signed in can make their own under API — this list is everyone’s together.'
              : 'No key matches those filters.'}
          </Empty>
        )}

        {shown.map((token) => (
          <KeyRow
            key={token.id}
            token={token}
            scopes={scopes}
            gateway={gateway}
            admin
            mine={false}
            accounts={canManage ? accounts : []}
            readOnly={!canManage}
            selected={selected.includes(token.id)}
            onSelect={canManage ? toggle : undefined}
            onChanged={onChanged}
            onError={onError}
            onRotated={(made) => {
              onMinted({ name: made.token?.name, key: made.key, rotated: true });
              onChanged();
            }}
          />
        ))}
      </Panel>

      {accounts.length === 0 && canManage && (
        <Panel title="Reassigning a key" icon={KeySquare}>
          <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
            Handing a key to a different account needs the permission to see accounts as well as this
            one. Without it you can still make, change and revoke keys — they just stay with whoever
            already holds them.
          </div>
        </Panel>
      )}
    </div>
  );
}
