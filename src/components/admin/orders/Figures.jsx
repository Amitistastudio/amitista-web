import React from 'react';
import {
  ChartNoAxesColumn,
  CircleDashed,
  Clock,
  Hourglass,
  ChevronRight,
  Layers,
  PackageCheck,
  UserRoundCheck,
} from 'lucide-react';
import { ORDER_PRIORITY_LEVELS, ORDER_STAGES } from '../../../lib/admin';
import { Empty, Figure, Panel, Pill, RankedBar, Sparkline } from '../ui';
import { StatePill, ago, needs, span, stageTone } from './shared';

function Split({ title, icon, rows, total, tone }) {
  const listed = rows.filter((row) => row.value > 0);
  return (
    <Panel title={title} icon={icon}>
      {listed.length === 0 ? (
        <Empty>Nothing to count yet.</Empty>
      ) : (
        <div className="px-4 sm:px-6 py-5 flex flex-col gap-3.5">
          {listed.map((row) => (
            <RankedBar
              key={row.key}
              name={row.label}
              value={row.value}
              percent={total > 0 ? Math.round((row.value / total) * 100) : 0}
              tone={tone?.(row.key)}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function Attention({ orders, onOpen }) {
  const waiting = orders
    .map((order) => ({ order, why: needs(order) }))
    .filter((entry) => entry.why)
    .sort((one, two) => (one.order.updatedAt ?? 0) - (two.order.updatedAt ?? 0));

  if (waiting.length === 0) {
    return (
      <Panel title="Needs you" icon={Hourglass}>
        <Empty>
          Nothing is stuck. Every live project has a lead and has moved in the last week.
        </Empty>
      </Panel>
    );
  }

  return (
    <Panel title={`Needs you — ${waiting.length}`} icon={Hourglass}>
      {waiting.map(({ order, why }) => (
        <button
          key={order.id}
          type="button"
          onClick={() => onOpen?.(order.id)}
          className="w-full text-left px-4 sm:px-6 py-4 border-b border-[#17171d] last:border-b-0 hover:bg-[#0e0e13] transition-colors group flex items-center justify-between gap-4"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <span className="font-mono text-[11px] text-purple-300/90 tracking-wider">
                {order.ref}
              </span>
              <Pill tone={why.key === 'unclaimed' ? 'rose' : 'amber'}>{why.label}</Pill>
            </div>
            <p className="text-[13px] text-neutral-200 font-normal truncate">
              {order.name || order.subject || 'Untitled project'}
            </p>
            <p className="text-[12px] text-neutral-600 font-normal mt-0.5">
              {order.user?.name ?? 'unknown'} · last moved {ago(order.updatedAt)}
            </p>
          </div>
          <ChevronRight
            className="h-4 w-4 text-neutral-700 group-hover:text-neutral-400 shrink-0"
            strokeWidth={2}
          />
        </button>
      ))}
    </Panel>
  );
}

export default function Figures({ stats, orders = [], onOpen }) {
  if (!stats) {
    return (
      <Panel title="Figures" icon={ChartNoAxesColumn}>
        <Empty>No figures could be read.</Empty>
      </Panel>
    );
  }

  const HOLD_KEYS = ['hold', 'awaiting', 'declined'];
  const stageNames = new Map(
    [...ORDER_STAGES, ...(stats.stages ?? [])].map((entry) => [entry.value, entry.label]),
  );
  const stageKeys = [
    ...(stats.stageOrder?.length ? stats.stageOrder : ORDER_STAGES.map((stage) => stage.value)),
    ...Object.keys(stats.byStage ?? {}),
  ].filter(
    (key, index, all) => !HOLD_KEYS.includes(key) && all.indexOf(key) === index,
  );

  const stageRows = stageKeys
    .map((key) => ({
      key,
      label: stageNames.get(key) ?? key,
      value: stats.byStage?.[key] ?? 0,
    }))
    .filter((row, index) => row.value > 0 || index < ORDER_STAGES.length);

  const holdRows = HOLD_KEYS
    .map((key) => ({
      key,
      label: { hold: 'On hold', awaiting: 'Awaiting client', declined: 'Declined' }[key],
      value: stats.byStage?.[key] ?? 0,
    }))
    .filter((row) => row.value > 0);

  const categoryRows = Object.entries(stats.categories ?? {}).map(([key, label]) => ({
    key,
    label,
    value: stats.byCategory?.[key] ?? 0,
  }));

  const priorityRows = ORDER_PRIORITY_LEVELS.map((level) => ({
    key: level.value,
    label: level.label,
    value: stats.byPriority?.[level.value] ?? 0,
  }));

  const leadRows = Object.entries(stats.byLead ?? {})
    .map(([key, value]) => ({ key, label: key, value }))
    .sort((one, two) => two.value - one.value)
    .slice(0, 8);

  const days = stats.days ?? [];
  const opened = days.map((day) => day.opened);
  const labels = days.map((day) =>
    day.at
      ? new Date(day.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      : '',
  );
  const openedTotal = opened.reduce((sum, value) => sum + value, 0);
  const closedTotal = days.reduce((sum, day) => sum + day.closed, 0);

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#17171d] border border-[#282832]">
        <Figure label="Projects" value={stats.total} hint="every one ever opened" />
        <Figure
          label="Live now"
          value={stats.open}
          tone="text-purple-300"
          hint={stats.held > 0 ? `${stats.held} paused` : 'none paused'}
        />
        <Figure
          label="Delivered"
          value={stats.delivered}
          tone="text-emerald-300"
          hint={stats.declined > 0 ? `${stats.declined} declined` : 'none declined'}
        />
        <Figure
          label="Unclaimed"
          value={stats.unclaimed}
          tone={stats.unclaimed > 0 ? 'text-amber-300' : 'text-white'}
          hint={stats.unclaimed > 0 ? 'nobody leading these' : 'all have a lead'}
        />
      </div>

      <Attention orders={orders} onOpen={onOpen} />

      <Panel title="The last thirty days" icon={ChartNoAxesColumn}>
        {openedTotal === 0 && closedTotal === 0 ? (
          <Empty>Nothing opened or closed in the last month.</Empty>
        ) : (
          <div className="px-4 sm:px-6 py-5">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-4">
              <span className="text-[13px] text-neutral-300 font-normal">
                <span className="text-white tabular-nums">{openedTotal}</span> opened
              </span>
              <span className="text-[13px] text-neutral-300 font-normal">
                <span className="text-white tabular-nums">{closedTotal}</span> closed
              </span>
            </div>
            <Sparkline points={opened} labels={labels} unit="projects opened" height={48} />
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Panel title="How long things take" icon={Clock}>
          <div className="grid grid-cols-2 gap-px bg-[#17171d]">
            <div className="px-5 py-5 bg-[#0a0a0d]">
              <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">
                Typical lifetime
              </p>
              <p className="mt-2 text-[22px] font-light text-white tabular-nums">
                {span(stats.medianLifetime)}
              </p>
              <p className="mt-1 text-[12px] text-neutral-500 font-normal">
                opened to closed, middle value
              </p>
            </div>
            <div className="px-5 py-5 bg-[#0a0a0d]">
              <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">
                Wait for a lead
              </p>
              <p className="mt-2 text-[22px] font-light text-white tabular-nums">
                {span(stats.medianWait)}
              </p>
              <p className="mt-1 text-[12px] text-neutral-500 font-normal">
                {stats.medianWait === null ? 'nothing claimed yet' : 'brief sits before a claim'}
              </p>
            </div>
          </div>
        </Panel>

        <Split
          title="Where they sit"
          icon={Layers}
          rows={stageRows}
          total={stats.total}
          tone={(key) => (stageTone(key) === 'green' ? 'bg-emerald-500/70' : 'bg-purple-500/70')}
        />
      </div>

      {holdRows.length > 0 && (
        <Panel title="Not moving" icon={Hourglass}>
          <div className="px-4 sm:px-6 py-5 flex flex-wrap gap-2.5">
            {holdRows.map((row) => (
              <span key={row.key} className="inline-flex items-center gap-2">
                <Pill tone={row.key === 'declined' ? 'rose' : 'amber'}>{row.label}</Pill>
                <span className="text-[13px] text-neutral-400 font-normal tabular-nums">
                  {row.value}
                </span>
              </span>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Split
          title="What they ask for"
          icon={PackageCheck}
          rows={categoryRows}
          total={stats.total}
        />
        <Split
          title="Priority"
          icon={CircleDashed}
          rows={priorityRows}
          total={stats.total}
          tone={(key) =>
            key === 'urgent'
              ? 'bg-rose-500/70'
              : key === 'high'
                ? 'bg-amber-400/70'
                : 'bg-neutral-600'
          }
        />
      </div>

      <Panel title="Who is leading" icon={UserRoundCheck}>
        {leadRows.length === 0 ? (
          <Empty>Nobody has claimed a project yet.</Empty>
        ) : (
          <div className="px-4 sm:px-6 py-5 flex flex-col gap-3.5">
            {leadRows.map((row) => (
              <RankedBar
                key={row.key}
                name={row.label}
                value={row.value}
                percent={stats.total > 0 ? Math.round((row.value / stats.total) * 100) : 0}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
