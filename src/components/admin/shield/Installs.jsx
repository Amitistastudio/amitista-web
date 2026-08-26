import React from 'react';
import { Boxes, RefreshCw, Info } from 'lucide-react';
import {
  INSTALL_STATE_LABEL,
  INSTALL_STATE_TONE,
  formatAgo,
  formatCount,
  formatStamp,
  installState,
} from '../../../lib/admin';
import { Button, Empty, Figure, Notice, Panel, Pill, SearchInput } from '../ui';

function rank(values) {
  const counts = {};
  values.forEach((value) => {
    const name = value || 'not reported';
    counts[name] = (counts[name] ?? 0) + 1;
  });
  return Object.entries(counts).sort((left, right) => right[1] - left[1]);
}

function Spread({ title, entries, total }) {
  if (entries.length === 0) return null;
  return (
    <Panel title={title} icon={Boxes}>
      {entries.map(([name, count]) => (
        <div
          key={name}
          className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
        >
          <span className="text-[13px] text-neutral-300 font-mono truncate">{name}</span>
          <span className="text-[12px] text-neutral-500 tabular-nums shrink-0">
            {count} of {total}
          </span>
        </div>
      ))}
    </Panel>
  );
}

export default function Installs({ data, loading, onRefresh }) {
  const [query, setQuery] = React.useState('');

  const installs = data?.installs ?? [];
  const collected = data?.collected !== false;

  const now = Date.now();
  const decorated = installs.map((install) => ({ ...install, state: installState(install, now) }));
  const active = decorated.filter((install) => install.state === 'active').length;
  const named = decorated.filter((install) => install.named).length;
  const versions = rank(decorated.map((install) => install.version));
  const modes = rank(decorated.map((install) => install.mode));
  const behind = versions.length > 1 ? versions.slice(1).reduce((sum, [, n]) => sum + n, 0) : 0;

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? decorated.filter((install) =>
        [install.id, install.version, install.mode, install.address, install.agent]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
      )
    : decorated;

  return (
    <div className="w-full flex flex-col gap-6">
      {!collected && (
        <Notice>
          Nothing has been recorded yet. The rules feed writes the inventory as installs poll it, so
          this fills in on its own — the first entries appear within a poll interval of the feed
          service being restarted with this build.
        </Notice>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Figure label="Installs" value={formatCount(decorated.length)} hint="seen in the last month" />
        <Figure
          label="Polling"
          value={formatCount(active)}
          tone={active > 0 ? 'text-emerald-400' : 'text-neutral-500'}
          hint="asked within twelve hours"
        />
        <Figure
          label="Behind"
          value={formatCount(behind)}
          tone={behind > 0 ? 'text-amber-300' : 'text-white'}
          hint="not on the newest version seen"
        />
        <Figure
          label="Identified"
          value={`${formatCount(named)}/${formatCount(decorated.length)}`}
          hint="send an install id"
        />
      </div>

      <Panel
        title={`Installs — ${shown.length}`}
        icon={Boxes}
        action={
          <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
            <span className="hidden sm:inline text-[11px] text-neutral-500 font-normal">
              read {formatAgo(data?.generated)}
            </span>
            <Button type="button" onClick={onRefresh} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              {loading ? 'Reading…' : 'Refresh'}
            </Button>
          </div>
        }
      >
        {decorated.length > 6 && (
          <div className="px-4 sm:px-6 py-4 border-b border-[#17171d]">
            <SearchInput
              value={query}
              placeholder="Filter by id, version, mode or address"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}

        {shown.length === 0 ? (
          <Empty>
            {decorated.length === 0
              ? 'No install has polled the feed yet.'
              : 'Nothing matches that.'}
          </Empty>
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-[#17171d]">
                  {['Install', 'Version', 'Mode', 'State', 'Polls', 'Last seen'].map((head) => (
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
                {shown.map((install) => (
                  <tr key={install.id} className="border-b border-[#17171d] last:border-b-0">
                    <td className="px-4 sm:px-6 py-3">
                      <span className="block text-[13px] text-white font-mono truncate max-w-[220px]">
                        {install.id}
                      </span>
                      <span className="block text-[11px] text-neutral-600 font-normal mt-0.5">
                        {install.named ? install.address : `${install.address} — no install id`}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-300 font-mono whitespace-nowrap">
                      {install.version ?? '—'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                      {install.mode ? (
                        <Pill tone={install.mode === 'block' ? 'green' : 'amber'}>
                          {install.mode}
                        </Pill>
                      ) : (
                        <span className="text-[12px] text-neutral-600">not reported</span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                      <Pill tone={INSTALL_STATE_TONE[install.state]}>
                        {INSTALL_STATE_LABEL[install.state]}
                      </Pill>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-400 tabular-nums whitespace-nowrap">
                      {formatCount(install.polls)}
                      {install.notModified > 0 && (
                        <span className="text-neutral-600">
                          {' '}
                          · {formatCount(install.notModified)} unchanged
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-400 whitespace-nowrap">
                      {formatAgo(install.last)}
                      <span className="block text-[11px] text-neutral-600">
                        first {formatStamp(install.first)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Spread title="Versions in the field" entries={versions} total={decorated.length} />
        <Spread title="Modes in the field" entries={modes} total={decorated.length} />
      </div>

      <Panel title="What this can and cannot see" icon={Info}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            Installs are counted from polls of the rules feed. An install that sends an id is
            counted as itself; one that does not is grouped by its address and user agent, which
            merges everything behind one NAT into a single row and splits one install across a
            changing address. Those rows say so.
          </p>
          <p className="mb-3">
            The id is a random string the package writes beside its own feed cache. It carries no
            hostname, no path and nothing about the customer&apos;s code — that constraint is the
            whole product, and an inventory is not a reason to weaken it.
          </p>
          <p>
            An install running with <code className="text-neutral-300 font-mono text-[12px]">feed: false</code>{' '}
            never polls and therefore never appears here at all. Silence is not evidence of nothing
            running.
          </p>
        </div>
      </Panel>
    </div>
  );
}
