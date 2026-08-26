import React from 'react';
import { Activity, Info } from 'lucide-react';
import {
  formatAgo,
  formatCount,
  formatRate,
  topPaths,
  keyWorks,
  KEY_IDLE_DAYS,
  daysSince,
} from '../../../lib/admin';
import { Bar, Empty, Field, Figure, Panel, Select } from '../ui';
import { EnvPill, StatePill } from './shared';
import KeyTrend from './KeyTrend';

function rollUpPaths(keys) {
  const totals = {};
  keys.forEach((key) => {
    Object.entries(key.paths ?? {}).forEach(([path, count]) => {
      totals[path] = (totals[path] ?? 0) + (Number(count) || 0);
    });
  });
  return topPaths(totals, 10);
}

export default function MyUsage({ data }) {
  const keys = data?.keys ?? [];
  const gateway = data?.gateway ?? null;
  const [chosen, setChosen] = React.useState(null);

  const watched = keys.some((key) => key.id === chosen) ? chosen : keys[0]?.id ?? null;
  const watching = keys.find((key) => key.id === watched) ?? null;

  const requests = keys.reduce((total, key) => total + (key.requests ?? 0), 0);
  const rejected = keys.reduce((total, key) => total + (key.rejected ?? 0), 0);
  const attempts = requests + rejected;
  const refusal = attempts > 0 ? Math.round((rejected / attempts) * 100) : 0;
  const busiest = [...keys].sort((left, right) => (right.requests ?? 0) - (left.requests ?? 0));
  const paths = rollUpPaths(keys);
  const peak = Math.max(1, ...paths.map((entry) => entry.count));
  const idle = keys.filter((key) => {
    if (!keyWorks(key)) return false;
    const since = daysSince(key.lastUsed);
    return since === null || since >= KEY_IDLE_DAYS;
  });

  if (keys.length === 0) {
    return (
      <Panel title="Usage" icon={Activity}>
        <Empty>Nothing to show until you have a key.</Empty>
      </Panel>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Figure label="Requests" value={formatCount(requests)} hint="across all your keys" />
        <Figure
          label="Refused"
          value={formatCount(rejected)}
          tone={rejected > 0 ? 'text-amber-300' : 'text-white'}
        />
        <Figure
          label="Refusal rate"
          value={`${refusal}%`}
          tone={refusal > 20 ? 'text-amber-300' : 'text-white'}
        />
        <Figure label="Default limit" value={formatRate(gateway?.rate ?? 120)} hint="per key" />
      </div>

      {keys.length > 1 && (
        <div className="border border-[#282832] bg-[#0a0a0d] px-4 sm:px-6 pt-5 pb-1">
          <Field label="Which key to chart" htmlFor="usage-key">
            <Select
              id="usage-key"
              value={watched ?? ''}
              onChange={(event) => setChosen(event.target.value)}
            >
              {keys.map((key) => (
                <option key={key.id} value={key.id}>
                  {key.name} — {key.prefix}…
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {watched && <KeyTrend id={watched} name={watching?.name} />}

      <Panel title="By key" icon={Activity}>
        <div className="rail overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[620px]">
            <thead>
              <tr className="border-b border-[#17171d]">
                {['Key', 'State', 'Requests', 'Refused', 'Limit', 'Last used'].map((head) => (
                  <th
                    key={head}
                    className="px-4 sm:px-6 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase whitespace-nowrap"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {busiest.map((key) => (
                <tr key={key.id} className="border-b border-[#17171d] last:border-b-0">
                  <td className="px-4 sm:px-6 py-3">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] text-white font-normal">{key.name}</span>
                      <EnvPill environment={key.environment} />
                    </span>
                    <span className="block text-[11px] text-neutral-600 font-mono mt-0.5">
                      {key.prefix}…
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-3">
                    <StatePill token={key} />
                  </td>
                  <td className="px-4 sm:px-6 py-3 text-[13px] text-white tabular-nums">
                    {formatCount(key.requests)}
                  </td>
                  <td
                    className={`px-4 sm:px-6 py-3 text-[13px] tabular-nums ${key.rejected > 0 ? 'text-amber-300' : 'text-neutral-400'}`}
                  >
                    {formatCount(key.rejected)}
                  </td>
                  <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-400 tabular-nums">
                    {formatRate(key.effectiveRate)}
                  </td>
                  <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-400 whitespace-nowrap">
                    {formatAgo(key.lastUsed)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="What your keys read" icon={Activity}>
        {paths.length === 0 ? (
          <Empty>No calls recorded yet.</Empty>
        ) : (
          <div className="px-4 sm:px-6 py-5 flex flex-col gap-3">
            {paths.map((entry) => (
              <div key={entry.path}>
                <div className="flex items-baseline justify-between gap-4 mb-1">
                  <span className="text-[12px] text-neutral-300 font-mono truncate">
                    {entry.path}
                  </span>
                  <span className="text-[12px] text-neutral-500 tabular-nums shrink-0">
                    {formatCount(entry.count)}
                  </span>
                </div>
                <Bar percent={(entry.count / peak) * 100} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      {idle.length > 0 && (
        <Panel title={`Working but unused — ${idle.length}`} icon={Info}>
          <div className="px-4 sm:px-6 py-5">
            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-3">
              These keys are accepted but have not been used in {KEY_IDLE_DAYS} days, or have never
              been used at all. A key nobody uses is a key nobody notices being stolen.
            </p>
            <p className="text-[12px] text-neutral-500 font-normal">
              {idle.map((key) => key.name).join(', ')}
            </p>
          </div>
        </Panel>
      )}

      <Panel title="Where these numbers come from" icon={Info}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            The gateway counts each call in memory and writes the totals to disk about once a
            minute, so the newest requests can take a moment to appear.
          </p>
          <p className="mb-3">
            The figures above are running totals, not a window — they go back to when the key was
            made, and they survive the service restarting. Removing a key removes its counters with
            it.
          </p>
          <p>
            The chart is different: the gateway also keeps an hour by hour count for the last month,
            so the shape of a window is real rather than inferred. Hours before that history was
            added are simply absent, not zero.
          </p>
        </div>
      </Panel>
    </div>
  );
}
