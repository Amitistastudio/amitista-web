import React from 'react';
import { ArrowDownWideNarrow, ChevronRight, Package, RadioTower } from 'lucide-react';
import { ORDER_VISIBILITY_TONE } from '../../../lib/admin';
import { Empty, Panel, Pill, SearchInput, Select } from '../ui';
import { StageRail, StatePill, ago, needs } from './shared';
import { IdText } from './ids';

const FILTERS = [
  { id: 'live', label: 'Live' },
  { id: 'mine', label: 'Needs someone' },
  { id: 'moving', label: 'In build' },
  { id: 'held', label: 'Not moving' },
  { id: 'stale', label: 'Gone quiet' },
  { id: 'closed', label: 'Finished' },
  { id: 'all', label: 'Everything' },
];

const SORTS = [
  { id: 'recent', label: 'Last moved' },
  { id: 'opened', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'priority', label: 'Priority' },
  { id: 'stage', label: 'How far along' },
  { id: 'name', label: 'Name' },
];

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

function matches(order, filter) {
  if (filter === 'all') return true;
  if (filter === 'closed') return order.status === 'closed';
  if (filter === 'live') return order.status === 'open';
  if (filter === 'mine') return order.status === 'open' && !order.claimed;
  if (filter === 'moving') return order.status === 'open' && !order.held && order.step > 1;
  if (filter === 'held') return order.status === 'open' && order.held;
  if (filter === 'stale') return needs(order)?.key === 'stale';
  return true;
}

function compare(sort) {
  if (sort === 'opened') return (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0);
  if (sort === 'oldest') return (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0);
  if (sort === 'name') return (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''));
  if (sort === 'priority') {
    return (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2) ||
      (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  }
  if (sort === 'stage') {
    return (a, b) =>
      b.step / Math.max(1, b.steps) - a.step / Math.max(1, a.steps) ||
      (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  }
  return (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0);
}

function Row({ order, onOpen, fresh }) {
  const attention = needs(order);

  return (
    <button
      type="button"
      onClick={() => onOpen(order.id)}
      className={`w-full text-left px-4 sm:px-6 py-4 border-b border-[#17171d] last:border-b-0 hover:bg-[#0e0e13] transition-colors group ${
        fresh ? 'bg-purple-500/[0.06]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap mb-2">
            <IdText code={order.ref} />
            <StatePill order={order} />
            {order.priority !== 'normal' && (
              <Pill tone={order.priority === 'urgent' ? 'rose' : 'amber'}>
                {order.priorityLabel}
              </Pill>
            )}
            {order.visibility !== 'client' && (
              <Pill tone={ORDER_VISIBILITY_TONE[order.visibility] ?? 'neutral'}>
                {order.visibility}
              </Pill>
            )}
            {order.workflow !== 'studio' && <Pill tone="purple">{order.workflowName}</Pill>}
            {order.retired && <Pill>channel gone</Pill>}
            {attention && attention.key === 'stale' && <Pill tone="amber">{attention.label}</Pill>}
            {fresh && <Pill tone="green">just moved</Pill>}
          </div>

          <p className="text-[14px] text-neutral-100 font-normal leading-snug truncate">
            {order.name || order.subject || 'Untitled project'}
          </p>

          <p className="text-[12px] text-neutral-500 font-normal mt-1 truncate">
            {order.categoryLabel} · {order.user?.name ?? 'unknown'} ·{' '}
            {order.claimed ? `led by ${order.claimedByName ?? 'a developer'}` : 'no lead yet'} ·{' '}
            {order.status === 'closed' ? `closed ${ago(order.closedAt)}` : ago(order.updatedAt)}
          </p>

          <div className="mt-3 max-w-[320px]">
            <StageRail
              step={order.step}
              steps={order.steps}
              held={order.held}
              closed={order.status === 'closed'}
              delivered={Boolean(order.finished)}
            />
          </div>
        </div>

        <ChevronRight
          className="h-4 w-4 text-neutral-700 group-hover:text-neutral-400 shrink-0 mt-1"
          strokeWidth={2}
        />
      </div>
    </button>
  );
}

export default function Book({ orders, onOpen, moved }) {
  const [filter, setFilter] = React.useState('live');
  const [sort, setSort] = React.useState('recent');
  const [query, setQuery] = React.useState('');

  const wanted = query.trim().toLowerCase();
  const shown = orders
    .filter((order) => {
      if (!matches(order, filter)) return false;
      if (!wanted) return true;
      return [
        order.ref,
        order.project,
        order.order,
        order.request,
        order.legacyRef,
        order.track,
        order.name,
        order.subject,
        order.user?.name,
        order.user?.tag,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(wanted));
    })
    .slice()
    .sort(compare(sort));

  const counts = Object.fromEntries(
    FILTERS.map((entry) => [entry.id, orders.filter((order) => matches(order, entry.id)).length]),
  );

  return (
    <Panel
      title={`The order book — ${shown.length}`}
      icon={Package}
      action={
        <div className="w-full sm:w-[240px]">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ID, name, client or code"
            aria-label="Search the order book"
          />
        </div>
      }
    >
      <div className="px-4 sm:px-6 py-3.5 border-b border-[#17171d] flex flex-wrap items-center gap-2">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setFilter(entry.id)}
            aria-pressed={filter === entry.id}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-[12px] font-semibold tracking-wide border transition-colors ${
              filter === entry.id
                ? 'border-purple-500/40 bg-purple-500/15 text-white'
                : 'border-[#282832] text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {entry.label}
            <span className="tabular-nums text-neutral-500">{counts[entry.id] ?? 0}</span>
          </button>
        ))}

        <span className="ml-auto inline-flex items-center gap-2">
          <ArrowDownWideNarrow className="h-3.5 w-3.5 text-neutral-600" strokeWidth={2} />
          <span className="w-[150px]">
            <Select
              value={sort}
              aria-label="Sort the order book"
              onChange={(event) => setSort(event.target.value)}
            >
              {SORTS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </span>
        </span>
      </div>

      {shown.length === 0 ? (
        <Empty>
          {wanted
            ? 'Nothing in the book matches that.'
            : filter === 'live'
              ? 'No live projects. Everything is finished.'
              : 'Nothing here.'}
        </Empty>
      ) : (
        shown.map((order) => (
          <Row key={order.id} order={order} onOpen={onOpen} fresh={moved?.has(order.id)} />
        ))
      )}

      {shown.some((order) => order.retired) && (
        <div className="px-4 sm:px-6 py-3 border-t border-[#17171d] flex items-center gap-2">
          <RadioTower className="h-3.5 w-3.5 text-neutral-600 shrink-0" strokeWidth={2} />
          <p className="text-[12px] text-neutral-500 font-normal">
            Projects whose Discord channel was deleted keep their ID and stay trackable.
          </p>
        </div>
      )}
    </Panel>
  );
}
