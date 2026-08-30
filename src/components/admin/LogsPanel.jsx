import React from 'react';
import { RefreshCw, ScrollText, ChevronDown, CircleSlash } from 'lucide-react';
import { Button, Empty, Figure, Notice, Panel, Pill, SearchInput, Select } from './ui';
import {
  C2C_SEVERITIES,
  C2C_SEVERITY_TONE,
  fetchC2cLogSummary,
  fetchC2cLogs,
  formatAgoMs,
} from '../../lib/admin';

const REFRESH_MS = 15000;
const PAGE = 60;

const WINDOWS = [
  { id: '24h', label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { id: 'all', label: 'Everything', ms: null },
];

function stamp(ms) {
  if (!ms) return '—';
  const when = new Date(ms);
  return `${when.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} ${when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

function Mention({ id }) {
  if (!id) return null;
  return <span className="text-purple-300/90 tabular-nums">@{id}</span>;
}

function Entry({ entry, open, onToggle }) {
  const tone = C2C_SEVERITY_TONE[entry.severity] ?? 'neutral';
  const detail = entry.detail || '';
  const fields = Array.isArray(entry.fields) ? entry.fields : [];
  const expandable = Boolean(detail || fields.length);

  return (
    <div className="border-b border-[#17171d] last:border-b-0">
      <button
        type="button"
        onClick={expandable ? onToggle : undefined}
        className={`w-full flex items-center gap-3 px-4 sm:px-6 py-2.5 text-left ${expandable ? 'hover:bg-[#101015]' : 'cursor-default'}`}
      >
        <span className="text-[11px] text-neutral-600 tabular-nums shrink-0 w-[104px] hidden sm:block">
          {stamp(entry.at)}
        </span>
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
            tone === 'rose' ? 'bg-rose-500' : tone === 'purple' ? 'bg-purple-400' : 'bg-neutral-600'
          }`}
          aria-hidden="true"
        />
        <span className="text-[13px] text-neutral-200 font-normal truncate min-w-0 flex-1">
          {entry.title}
        </span>
        {entry.ref && (
          <span className="text-[11px] text-neutral-500 tabular-nums shrink-0 hidden md:block">
            {entry.ref}
          </span>
        )}
        <span className="text-[10px] text-neutral-600 uppercase tracking-[0.12em] shrink-0 hidden lg:block">
          {entry.scope}
        </span>
        {entry.backfilled === true ? (
          <span
            title="Rebuilt from the exchange history — it predates the log system"
            className="text-[10px] text-neutral-700 uppercase tracking-[0.12em] shrink-0 hidden xl:block"
          >
            history
          </span>
        ) : (
          entry.delivered === false && (
            <span title="Recorded here, never posted to Discord">
              <CircleSlash className="h-3 w-3 text-amber-500/70 shrink-0" strokeWidth={2} />
            </span>
          )
        )}
        {expandable && (
          <ChevronDown
            className={`h-3.5 w-3.5 text-neutral-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            strokeWidth={2}
          />
        )}
      </button>

      {open && expandable && (
        <div className="px-4 sm:px-6 pb-4 pt-1 space-y-2">
          <div className="text-[11px] text-neutral-600 tabular-nums sm:hidden">{stamp(entry.at)}</div>
          {detail && <p className="text-[13px] text-neutral-400 font-normal">{detail}</p>}
          {entry.actorId && (
            <p className="text-[12px] text-neutral-500 font-normal">
              By <Mention id={entry.actorId} />
            </p>
          )}
          {fields.length > 0 && (
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {fields.map(([key, value], index) => (
                <div key={`${key}-${index}`} className="flex gap-2 min-w-0">
                  <dt className="text-[12px] text-neutral-600 font-normal shrink-0">
                    {String(key).replace(/:$/, '')}
                  </dt>
                  <dd className="text-[12px] text-neutral-300 font-normal break-all min-w-0">
                    {String(value).replace(/`/g, '')}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

export default function LogsPanel() {
  const [summary, setSummary] = React.useState(null);
  const [entries, setEntries] = React.useState([]);
  const [cursor, setCursor] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [more, setMore] = React.useState(false);
  const [open, setOpen] = React.useState(null);

  const [severity, setSeverity] = React.useState('');
  const [channel, setChannel] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [windowId, setWindowId] = React.useState('24h');

  const since = React.useMemo(() => {
    const found = WINDOWS.find((entry) => entry.id === windowId);
    return found?.ms ? Date.now() - found.ms : null;
  }, [windowId]);

  const filters = React.useMemo(
    () => ({ severity, channel, q: search.trim(), since, limit: PAGE }),
    [severity, channel, search, since],
  );

  const load = React.useCallback(
    async (quiet) => {
      if (!quiet) setLoading(true);
      try {
        const [head, page] = await Promise.all([
          fetchC2cLogSummary(since ?? ''),
          fetchC2cLogs(filters),
        ]);
        setSummary(head);
        setEntries(page.entries ?? []);
        setCursor(page.next ?? null);
        setError(null);
      } catch (failure) {
        setError(failure.message);
      } finally {
        setLoading(false);
      }
    },
    [filters, since],
  );

  React.useEffect(() => {
    load(false);
  }, [load]);

  React.useEffect(() => {
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const loadMore = async () => {
    if (cursor === null) return;
    setMore(true);
    try {
      const page = await fetchC2cLogs({ ...filters, before: cursor });
      setEntries((current) => [...current, ...(page.entries ?? [])]);
      setCursor(page.next ?? null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setMore(false);
    }
  };

  if (loading && summary === null && error === null) {
    return <p className="text-[13px] text-neutral-500 font-normal">Reading the exchange logs…</p>;
  }

  if (summary === null) {
    return <Notice tone="rose">{error ?? 'The exchange logs could not be read.'}</Notice>;
  }

  const counts = summary.counts ?? {};
  const day = summary.window ?? {};
  const categories = summary.categories ?? [];
  const channels = categories.flatMap((category) => category.channels ?? []);
  const wired = channels.filter((entry) => entry.channelId).length;
  const guilds = summary.guilds ?? [];
  const homeId = channels.find((entry) => entry.guildId)?.guildId ?? null;
  const home = guilds.find((guild) => guild.id === homeId)?.name ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-40">
          <Select value={windowId} onChange={(event) => setWindowId(event.target.value)}>
            {WINDOWS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" className="ml-auto" disabled={loading} onClick={() => load(false)}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
          Refresh
        </Button>
      </div>

      {error && <Notice tone="rose">{error}</Notice>}

      {wired === 0 && (
        <Notice tone="amber">
          No log channels exist in Discord yet — every entry below is recorded here only. Run{' '}
          <span className="text-neutral-200">/c2clogs setup</span> in whichever server should hold
          them
          {guilds.length > 0 && (
            <>
              {' '}— the bot is in{' '}
              {guilds.map((guild, index) => (
                <React.Fragment key={guild.id}>
                  {index > 0 && (index === guilds.length - 1 ? ' and ' : ', ')}
                  <span className="text-neutral-200">{guild.name}</span>
                </React.Fragment>
              ))}
            </>
          )}
          . It needs <span className="text-neutral-200">Manage Channels</span> there.
        </Notice>
      )}

      {counts.undelivered > 0 && wired > 0 && (
        <Notice tone="amber">
          {counts.undelivered.toLocaleString()} recorded but not yet in a Discord channel — the bot
          re-sends these when it next connects, so they clear on their own. Either way they are all
          here.
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Entries" value={(counts.total ?? 0).toLocaleString()} hint="in this window" />
        <Figure
          label="Security"
          value={(counts.security ?? 0).toLocaleString()}
          tone={counts.security ? 'text-rose-400' : 'text-white'}
        />
        <Figure label="Last 24 hours" value={(day.total ?? 0).toLocaleString()} />
        <Figure
          label="Channels live"
          value={`${wired}/${channels.length}`}
          tone={wired === channels.length ? 'text-emerald-400' : 'text-amber-300'}
        />
      </div>

      <Panel
        title="Log"
        icon={ScrollText}
        action={
          <span className="text-[11px] text-neutral-600 tabular-nums">
            {counts.newest ? `newest ${formatAgoMs(counts.newest)}` : 'nothing yet'}
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 border-b border-[#17171d]">
          <button
            type="button"
            onClick={() => setSeverity('')}
            className={`text-[10px] font-semibold tracking-[0.12em] uppercase border px-2 py-[3px] ${severity === '' ? 'border-purple-500/40 text-purple-300' : 'border-[#282832] text-neutral-500'}`}
          >
            All
          </button>
          {C2C_SEVERITIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSeverity(severity === entry.id ? '' : entry.id)}
              className={`text-[10px] font-semibold tracking-[0.12em] uppercase border px-2 py-[3px] ${
                severity === entry.id
                  ? entry.tone === 'rose'
                    ? 'border-rose-500/40 text-rose-400'
                    : entry.tone === 'purple'
                      ? 'border-purple-500/40 text-purple-300'
                      : 'border-neutral-500/40 text-neutral-300'
                  : 'border-[#282832] text-neutral-500'
              }`}
            >
              {entry.label}
            </button>
          ))}

          <div className="ml-auto w-full sm:w-56">
            <Select value={channel} onChange={(event) => setChannel(event.target.value)}>
              <option value="">Every channel</option>
              {categories.map((category) => (
                <optgroup key={category.key} label={category.name}>
                  {(category.channels ?? []).map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.name}
                      {entry.channelId ? '' : ' (not in Discord)'}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>

          <div className="w-full sm:w-64">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Reference, address, anything"
            />
          </div>
        </div>

        {entries.length === 0 ? (
          <Empty>
            {counts.total ? 'Nothing matches those filters.' : 'Nothing has been recorded yet.'}
          </Empty>
        ) : (
          <div>
            {entries.map((entry) => (
              <Entry
                key={entry.id}
                entry={entry}
                open={open === entry.id}
                onToggle={() => setOpen(open === entry.id ? null : entry.id)}
              />
            ))}
          </div>
        )}

        {cursor !== null && (
          <div className="px-4 sm:px-6 py-3 border-t border-[#17171d]">
            <Button type="button" disabled={more} onClick={loadMore}>
              {more ? 'Reading…' : 'Load older'}
            </Button>
          </div>
        )}
      </Panel>

      <Panel
        title="Where it goes"
        icon={ScrollText}
        action={
          home && (
            <span className="text-[11px] text-neutral-600 truncate max-w-[16rem]">{home}</span>
          )
        }
      >
        <div className="px-4 sm:px-6 py-4 flex flex-wrap gap-2">
          {channels.map((entry) => (
            <Pill key={entry.key} tone={entry.channelId ? 'green' : 'neutral'}>
              {entry.name.replace(/^[^a-z]*/i, '')} · {counts.byChannel?.[entry.key] ?? 0}
            </Pill>
          ))}
        </div>
      </Panel>
    </div>
  );
}
