import React from 'react';
import { Activity, AlertTriangle, Globe } from 'lucide-react';
import { formatBytes, formatCount, formatStamp, formatAgo, keyWorks } from '../../../lib/admin';
import { Bar, Empty, Notice, Panel, Row, Sparkline } from '../ui';

function BusiestKeys({ tokens }) {
  const ranked = [...tokens]
    .filter((token) => (token.requests ?? 0) > 0)
    .sort((left, right) => (right.requests ?? 0) - (left.requests ?? 0))
    .slice(0, 10);
  const peak = Math.max(1, ...ranked.map((token) => token.requests ?? 0));
  const total = tokens.reduce((sum, token) => sum + (token.requests ?? 0), 0);

  return (
    <Panel title="Busiest keys" icon={Activity}>
      {ranked.length === 0 ? (
        <Empty>No key has made a request yet.</Empty>
      ) : (
        <div className="px-4 sm:px-6 py-5 flex flex-col gap-3.5">
          {ranked.map((token) => (
            <div key={token.id}>
              <div className="flex items-baseline justify-between gap-4 mb-1 flex-wrap">
                <span className="text-[13px] text-white font-normal truncate">
                  {token.name}
                  <span className="text-[11px] text-neutral-600 font-normal ml-2">
                    {token.owner ?? '—'}
                    {keyWorks(token) ? '' : ' · not accepted'}
                  </span>
                </span>
                <span className="text-[12px] text-neutral-400 tabular-nums shrink-0">
                  {formatCount(token.requests)}
                  {total > 0 && (
                    <span className="text-neutral-600">
                      {' '}
                      · {Math.round((token.requests / total) * 100)}%
                    </span>
                  )}
                  <span className="text-neutral-600"> · {formatAgo(token.lastUsed)}</span>
                </span>
              </div>
              <Bar
                percent={(token.requests / peak) * 100}
                tone={keyWorks(token) ? 'bg-purple-500/70' : 'bg-neutral-700'}
              />
            </div>
          ))}
        </div>
      )}
      <div className="px-4 sm:px-6 py-4 border-t border-[#17171d]">
        <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">
          Counted by the gateway per key, running totals since each key was made. These are keyed
          calls only, so they will not add up to the endpoint figures above — those include every
          anonymous call to the open API as well.
        </p>
      </div>
    </Panel>
  );
}

export default function Traffic({ data }) {
  const stats = data?.api ?? null;
  const totals = stats?.totals ?? null;
  const endpoints = stats?.endpoints ?? [];
  const tokens = data?.tokens ?? [];

  if (!stats) {
    return (
      <div className="w-full flex flex-col gap-6">
        <Notice>
          No access-log figures have been read yet. Those come from the snapshot timer every couple
          of minutes — if the panel was only just installed, give it a moment. The per-key counts
          below come straight from the gateway and do not depend on it.
        </Notice>
        <BusiestKeys tokens={tokens} />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel
        title={`Traffic — last ${stats.window} hours`}
        icon={Activity}
        action={
          <span className="text-[11px] text-neutral-500 font-normal">
            read {formatStamp(stats.generated ?? data?.generated)}
          </span>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-[#17171d]">
          {[
            ['Requests', formatCount(totals?.requests ?? 0), 'text-white'],
            ['Served', formatBytes(totals?.bytes ?? 0), 'text-white'],
            [
              'Refused',
              formatCount(totals?.clientError ?? 0),
              (totals?.clientError ?? 0) > 0 ? 'text-amber-300' : 'text-white',
            ],
            [
              'Errors',
              formatCount(totals?.serverError ?? 0),
              (totals?.serverError ?? 0) > 0 ? 'text-rose-400' : 'text-white',
            ],
          ].map(([label, value, tone]) => (
            <div key={label} className="px-4 sm:px-6 py-5 border-r border-[#17171d] last:border-r-0">
              <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-2">
                {label}
              </p>
              <p className={`text-[22px] font-normal tabular-nums leading-none ${tone}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="px-4 sm:px-6 py-5">
          <Sparkline points={(stats.hourly ?? []).map((entry) => entry.requests)} />
          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-neutral-600 tracking-wider uppercase">
              {stats.window}h ago
            </span>
            <span className="text-[10px] text-neutral-600 tracking-wider uppercase">now</span>
          </div>
        </div>
      </Panel>

      <BusiestKeys tokens={tokens} />

      <Panel title="By endpoint" icon={Activity}>
        <div className="rail overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[620px]">
            <thead>
              <tr className="border-b border-[#17171d]">
                {['Endpoint', 'Requests', 'OK', 'Refused', 'Errors', 'Rate limited', 'Served'].map(
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
              {endpoints.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 sm:px-6 py-4 text-[13px] text-neutral-500">
                    No API traffic in this window.
                  </td>
                </tr>
              )}
              {endpoints.map((entry) => (
                <tr key={entry.path} className="border-b border-[#17171d] last:border-b-0">
                  <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                    <span className="block text-[13px] text-white font-normal">{entry.label}</span>
                    <span className="block text-[11px] text-neutral-600 font-mono">{entry.path}</span>
                  </td>
                  <td className="px-4 sm:px-6 py-3 text-[13px] text-white tabular-nums">
                    {formatCount(entry.requests)}
                  </td>
                  <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-400 tabular-nums">
                    {formatCount(entry.ok)}
                  </td>
                  <td
                    className={`px-4 sm:px-6 py-3 text-[13px] tabular-nums ${entry.clientError > 0 ? 'text-amber-300' : 'text-neutral-400'}`}
                  >
                    {formatCount(entry.clientError)}
                  </td>
                  <td
                    className={`px-4 sm:px-6 py-3 text-[13px] tabular-nums ${entry.serverError > 0 ? 'text-rose-400' : 'text-neutral-400'}`}
                  >
                    {formatCount(entry.serverError)}
                  </td>
                  <td
                    className={`px-4 sm:px-6 py-3 text-[13px] tabular-nums ${entry.rateLimited > 0 ? 'text-amber-300' : 'text-neutral-400'}`}
                  >
                    {formatCount(entry.rateLimited)}
                  </td>
                  <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-400 tabular-nums">
                    {formatBytes(entry.bytes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!stats.timed && (
          <div className="px-4 sm:px-6 py-4 border-t border-[#17171d] flex gap-3">
            <AlertTriangle className="h-3.5 w-3.5 text-neutral-600 shrink-0 mt-[3px]" strokeWidth={1.5} />
            <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">
              Response times are not shown because the access log does not record them yet. Adding{' '}
              <span className="font-mono">$request_time</span> to the log format starts collecting
              them from that moment on.
            </p>
          </div>
        )}
      </Panel>

      {stats.site && (
        <Panel title="The whole site, same window" icon={Globe}>
          <Row label="All requests" value={formatCount(stats.site.requests)} />
          <Row
            label="Not found"
            value={formatCount(stats.site.notFound)}
            tone={stats.site.notFound > 0 ? 'text-amber-300' : 'text-white'}
          />
          {(stats.notFound ?? []).slice(0, 8).map((entry) => (
            <div
              key={entry.path}
              className="flex items-baseline justify-between gap-6 px-4 sm:px-6 py-2.5 border-b border-[#17171d] last:border-b-0"
            >
              <span className="text-[12px] text-neutral-500 font-mono truncate">{entry.path}</span>
              <span className="text-[12px] text-neutral-500 tabular-nums shrink-0">
                {formatCount(entry.requests)}
              </span>
            </div>
          ))}
        </Panel>
      )}

      <Panel title="What this counts" icon={Activity}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            These rows come from nginx&apos;s access log, so they cover every call that reached the
            server — keyed or not, accepted or refused. The per-key figures elsewhere come from the
            gateway itself and only cover keyed calls, which is why the two never match exactly.
          </p>
          <p>
            The window is rolling and the log is rotated, so this is recent history rather than a
            full record.
          </p>
        </div>
      </Panel>
    </div>
  );
}
