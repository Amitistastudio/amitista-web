import React from 'react';
import { Activity, Gauge, ShieldCheck, TriangleAlert } from 'lucide-react';
import { formatAgo, formatBytes } from '../../../lib/admin';
import { Bar, Empty, Notice, Panel, WindowSwitch } from '../ui';
import { Scroller, Td, Th } from './shared';

const TRENDED = [
  { id: 'lcp', label: 'LCP', title: 'Largest contentful paint' },
  { id: 'fcp', label: 'FCP', title: 'First contentful paint' },
  { id: 'ttfb', label: 'TTFB', title: 'Time to first byte' },
  { id: 'cls', label: 'CLS', title: 'Cumulative layout shift' },
];

const COLUMNS = [
  { id: 'lcp', label: 'LCP' },
  { id: 'fcp', label: 'FCP' },
  { id: 'ttfb', label: 'TTFB' },
  { id: 'cls', label: 'CLS' },
  { id: 'longTaskMs', label: 'Long tasks' },
  { id: 'bytes', label: 'Size' },
];

function format(metric, value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  if (metric === 'bytes') return formatBytes(value);
  if (metric === 'cls') return String(Number(value.toFixed(3)));
  return `${Math.round(value)} ms`;
}

function budgetOf(budgets, metric) {
  const limit = budgets?.[metric];
  return typeof limit === 'number' && limit > 0 ? limit : null;
}

function BudgetSparkline({ points, budget, metric, route, height = 46 }) {
  const values = points.map((point) => point.value);
  const peak = Math.max(...values, 0);
  const showLine = budget !== null && budget <= peak * 1.25;
  const ceiling = Math.max(peak * 1.12, showLine ? budget * 1.05 : 0, 1);
  const line = showLine ? (budget / ceiling) * 100 : null;

  return (
    <div className="relative w-full" style={{ height }}>
      {line !== null && line <= 100 && (
        <span
          className="absolute inset-x-0 border-t border-dotted border-neutral-700/70 pointer-events-none z-10"
          style={{ bottom: `${line}%` }}
        />
      )}
      <div
        className="flex items-end gap-[2px] w-full h-full"
        role="img"
        aria-label={`${route} ${metric.toUpperCase()} over the last ${values.length} runs, latest ${format(metric, values[values.length - 1])}${budget ? `, budget ${format(metric, budget)}` : ''}`}
      >
        {points.map((point, index) => {
          const over = budget !== null && point.value > budget;
          const edge =
            index < 3 ? 'left-0' : index > points.length - 4 ? 'right-0' : 'left-1/2 -translate-x-1/2';
          return (
            <div key={index} className="group relative flex-1 h-full flex items-end outline-none">
              <span
                className={`w-full rounded-t-[3px] transition-colors ${
                  over
                    ? 'bg-rose-500/80 group-hover:bg-rose-400'
                    : 'bg-purple-500/70 group-hover:bg-purple-400'
                }`}
                style={{ height: `${Math.max(3, Math.min(100, (point.value / ceiling) * 100))}%` }}
              />
              <span
                className={`pointer-events-none absolute bottom-full mb-2 z-20 hidden group-hover:block group-focus:block whitespace-nowrap border border-[#282832] bg-[#111115] px-2.5 py-1.5 ${edge}`}
              >
                <span className="block text-[12px] text-white font-medium tabular-nums leading-none">
                  {format(metric, point.value)}
                </span>
                <span className="block text-[10px] text-neutral-500 font-normal mt-1 leading-none">
                  {formatAgo(point.at)}
                  {point.release ? ` · ${point.release}` : ''}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tile({ route, metric, points, budget, baseline }) {
  const current = points.length > 0 ? points[points.length - 1].value : null;
  const delta =
    typeof current === 'number' && typeof baseline === 'number' ? current - baseline : null;
  const share = budget && typeof current === 'number' ? Math.round((current / budget) * 100) : null;
  const peak = points.length > 0 ? Math.max(...points.map((point) => point.value)) : null;
  const breaches = budget ? points.filter((point) => point.value > budget).length : 0;

  return (
    <div className="border border-[#282832] bg-[#0a0a0d] p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-white font-mono truncate">{route}</span>
        {share !== null && (
          <span className="text-[11px] text-neutral-600 tabular-nums shrink-0">
            {share}% of budget
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-[22px] text-white font-semibold tabular-nums leading-none">
          {format(metric, current)}
        </span>
        {delta !== null && Math.abs(delta) > 0 && (
          <span className="text-[11px] text-neutral-500 tabular-nums">
            {delta > 0 ? '↑' : '↓'} {format(metric, Math.abs(delta))} vs baseline
          </span>
        )}
        {delta === 0 && <span className="text-[11px] text-neutral-600">level with baseline</span>}
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-3 mb-1.5 text-[10px] tabular-nums">
          {breaches > 0 ? (
            <span className="text-rose-400">
              over budget in {breaches} of {points.length} runs
            </span>
          ) : (
            <span className="text-neutral-700">inside budget every run</span>
          )}
          {peak !== null && (
            <span className="text-neutral-700 shrink-0">peak {format(metric, peak)}</span>
          )}
        </div>
        <BudgetSparkline
          points={points}
          budget={budget}
          metric={metric}
          route={route}
        />
      </div>
    </div>
  );
}

export default function Performance({ data }) {
  const perf = data.perf ?? null;
  const [metric, setMetric] = React.useState('lcp');

  if (!perf || !perf.latest) {
    return (
      <Panel title="Performance" icon={Activity}>
        <Empty>
          No performance snapshot yet. amitista-perf.timer drives Chromium over five routes about
          every six hours, and the collector picks its results up on the next run.
        </Empty>
      </Panel>
    );
  }

  const budgets = perf.budgets ?? null;
  const pages = perf.latest.pages ?? [];
  const problems = perf.latest.problems ?? [];
  const runs = perf.runs ?? [];
  const routes = pages.map((page) => page.path);
  const budget = budgetOf(budgets, metric);

  const seriesFor = (route) =>
    runs
      .map((run) => ({ at: run.at, release: run.release, value: run.pages?.[route]?.[metric] }))
      .filter((point) => typeof point.value === 'number');

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <p className="text-[13px] text-neutral-500 font-normal leading-relaxed text-pretty max-w-2xl">
          What a real browser measures on five routes, run against fixed budgets about every six
          hours. Every number here was taken over the network from this box, not modelled.
        </p>
        <p className="text-[11px] text-neutral-600 tabular-nums">
          {perf.profile} profile · last run {formatAgo(perf.latest.at)}
          {perf.latest.release ? ` on ${perf.latest.release}` : ''} · {perf.totalRuns} runs recorded
        </p>
      </div>

      {problems.length > 0 ? (
        <Notice tone="amber" icon={TriangleAlert}>
          <span className="block font-semibold mb-1.5">
            {problems.length} thing{problems.length === 1 ? '' : 's'} the last run flagged
          </span>
          <ul className="space-y-1">
            {problems.map((problem) => (
              <li key={problem} className="text-[12.5px]">
                {problem}
              </li>
            ))}
          </ul>
        </Notice>
      ) : (
        <Notice tone="emerald" icon={ShieldCheck}>
          Every page inside budget on the last run, and every optimisation the monitor checks for is
          still in place — the preload headers, the speculation rules, and no edge-injected scripts.
        </Notice>
      )}

      <Panel title="Last run" icon={Gauge}>
        <Scroller min={700}>
          <thead>
            <tr className="border-b border-[#282832]">
              <Th>Route</Th>
              {COLUMNS.map((column) => (
                <Th key={column.id} align="right">
                  <span className="block">{column.label}</span>
                  {budgetOf(budgets, column.id) && (
                    <span className="block text-[10px] text-neutral-700 font-normal tracking-normal normal-case mt-0.5">
                      {format(column.id, budgetOf(budgets, column.id))}
                    </span>
                  )}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => {
              const lcpBudget = budgetOf(budgets, 'lcp');
              const over = page.over ?? [];
              return (
                <tr key={page.path} className="border-b border-[#17171d] last:border-b-0">
                  <Td>
                    <span className="block text-[12.5px] text-white font-mono">{page.path}</span>
                    {lcpBudget && typeof page.lcp === 'number' && (
                      <span className="block w-28 mt-1.5">
                        <Bar
                          percent={(page.lcp / lcpBudget) * 100}
                          tone={over.includes('lcp') ? 'bg-rose-500' : 'bg-purple-500/70'}
                        />
                      </span>
                    )}
                  </Td>
                  {COLUMNS.map((column) => {
                    const breached = over.includes(column.id);
                    return (
                      <Td key={column.id} className="text-right align-top">
                        <span
                          className={`inline-flex items-center gap-1 text-[12.5px] tabular-nums ${
                            breached ? 'text-rose-400' : 'text-neutral-300'
                          }`}
                        >
                          {breached && <TriangleAlert className="h-3 w-3" strokeWidth={2} />}
                          {format(column.id, page[column.id])}
                        </span>
                        {breached && (
                          <span className="block text-[10px] text-rose-400/80 mt-0.5">over budget</span>
                        )}
                      </Td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </Scroller>
      </Panel>

      <Panel
        title="Trend"
        icon={Activity}
        action={
          <WindowSwitch
            label="Metric"
            options={TRENDED.map((entry) => ({
              id: entry.id,
              label: entry.label,
              title: entry.title,
            }))}
            active={metric}
            onPick={setMetric}
          />
        }
      >
        {runs.length === 0 ? (
          <Empty>Only one run recorded so far — a trend needs a second.</Empty>
        ) : (
          <div className="px-4 sm:px-6 py-5 space-y-4">
            <p className="text-[11px] text-neutral-600 leading-relaxed">
              Each bar is one run, oldest left — the last {runs.length} of {perf.totalRuns}{' '}
              recorded. Each chart is scaled to its own route, so compare shapes rather than
              heights; the dotted line is the {format(metric, budget)} budget, drawn when a route
              runs close enough to it to cross. Hover a bar for its value, when it ran and which
              release it tested.
              {perf.baseline?.at ? ` Baseline taken ${formatAgo(perf.baseline.at)}.` : ''}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {routes.map((route) => (
                <Tile
                  key={route}
                  route={route}
                  metric={metric}
                  budget={budget}
                  points={seriesFor(route)}
                  baseline={perf.baseline?.pages?.[route]?.[metric]}
                />
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
