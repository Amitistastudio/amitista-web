import React from 'react';
import { ChevronDown, History, RefreshCw } from 'lucide-react';
import { Button, Empty, Figure, Notice, Panel, Pill, SearchInput, Select, SubNav } from './ui';
import {
  LOG_SEVERITIES,
  LOG_SEVERITY_TONE,
  fetchLogEntries,
  fetchLogSummary,
  formatAgo,
} from '../../lib/admin';

const REFRESH_MS = 20000;
const PAGE = 60;

const WINDOWS = [
  { id: '24h', label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { id: 'all', label: 'Everything', ms: null },
];

function stamp(value) {
  if (!value) return '—';
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return '—';
  return `${when.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} ${when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

function Entry({ entry, open, onToggle }) {
  const tone = LOG_SEVERITY_TONE[entry.severity] ?? 'neutral';
  const fields = Array.isArray(entry.fields) ? entry.fields : [];
  const expandable = Boolean(fields.length || entry.ip);

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
          {entry.subject && (
            <span className="text-neutral-500"> · {entry.subject}</span>
          )}
        </span>
        <span className="text-[11px] text-purple-300/90 shrink-0 truncate max-w-[9rem] hidden md:block">
          {entry.actor}
        </span>
        <span className="text-[11px] text-neutral-600 tabular-nums shrink-0 hidden lg:block">
          {entry.ip ?? ''}
        </span>
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
          <p className="text-[12px] text-neutral-500 font-normal">
            <span className="text-neutral-300">{entry.actor}</span>
            {entry.ip ? <> from <span className="text-neutral-300 tabular-nums">{entry.ip}</span></> : null}
            <span className="text-neutral-700"> · {entry.action}</span>
          </p>
          {fields.length > 0 && (
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {fields.map(([key, value], index) => (
                <div key={`${key}-${index}`} className="flex gap-2 min-w-0">
                  <dt className="text-[12px] text-neutral-600 font-normal shrink-0">{key}</dt>
                  <dd className="text-[12px] text-neutral-300 font-normal break-all min-w-0">
                    {value}
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

export default function EverythingPanel() {
  const [summary, setSummary] = React.useState(null);
  const [entries, setEntries] = React.useState([]);
  const [cursor, setCursor] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [more, setMore] = React.useState(false);
  const [open, setOpen] = React.useState(null);

  const [family, setFamily] = React.useState('all');
  const [severity, setSeverity] = React.useState('');
  const [actor, setActor] = React.useState('');
  const [action, setAction] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [windowId, setWindowId] = React.useState('7d');

  const since = React.useMemo(() => {
    const found = WINDOWS.find((entry) => entry.id === windowId);
    return found?.ms ? Date.now() - found.ms : null;
  }, [windowId]);

  const filters = React.useMemo(
    () => ({
      family: family === 'all' ? '' : family,
      severity,
      actor,
      action,
      q: search.trim(),
      since,
      limit: PAGE,
    }),
    [family, severity, actor, action, search, since],
  );

  const load = React.useCallback(
    async (quiet) => {
      if (!quiet) setLoading(true);
      try {
        const [head, page] = await Promise.all([
          fetchLogSummary(since ?? ''),
          fetchLogEntries(filters),
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
      const page = await fetchLogEntries({ ...filters, before: cursor });
      setEntries((current) => [...current, ...(page.entries ?? [])]);
      setCursor(page.next ?? null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setMore(false);
    }
  };

  if (loading && summary === null && error === null) {
    return <p className="text-[13px] text-neutral-500 font-normal">Reading the log…</p>;
  }

  if (summary === null) {
    return <Notice tone="rose">{error ?? 'The log could not be read.'}</Notice>;
  }

  const counts = summary.counts ?? {};
  const families = summary.families ?? [];
  const actors = summary.actors ?? [];
  const actions = summary.actions ?? [];
  const kept = counts.kept ?? 0;
  const limit = summary.limit ?? 0;

  const tabs = [
    { id: 'all', label: 'Everything' },
    ...families.map((entry) => ({ id: entry.id, label: entry.label })),
  ];
  const badges = {
    all: counts.total ?? 0,
    ...Object.fromEntries(families.map((entry) => [entry.id, entry.count])),
  };
  const shown = families.find((entry) => entry.id === family);
  const filtered = Boolean(
    severity || actor || action || search.trim() || family !== 'all',
  );

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Entries"
          value={(counts.total ?? 0).toLocaleString()}
          hint="in this window"
        />
        <Figure
          label="Security"
          value={(counts.security ?? 0).toLocaleString()}
          tone={counts.security ? 'text-rose-400' : 'text-white'}
          hint="sign-ins refused, roles and access changed"
        />
        <Figure label="Last 24 hours" value={(counts.day ?? 0).toLocaleString()} />
        <Figure
          label="Held"
          value={kept.toLocaleString()}
          hint={limit ? `the last ${limit.toLocaleString()} are kept` : undefined}
        />
      </div>

      <SubNav tabs={tabs} active={family} onPick={setFamily} badges={badges} label="What it is about" />

      <p className="text-[12px] text-neutral-500 font-normal">
        {shown ? shown.blurb : 'everything the panel recorded, newest first'}
      </p>

      <Panel
        title="Log"
        icon={History}
        action={
          <span className="text-[11px] text-neutral-600 tabular-nums">
            {counts.newest ? `newest ${formatAgo(counts.newest)}` : 'nothing yet'}
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
          {LOG_SEVERITIES.map((entry) => (
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

          <div className="ml-auto w-full sm:w-44">
            <Select value={actor} onChange={(event) => setActor(event.target.value)}>
              <option value="">Everybody</option>
              {actors.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name} · {entry.count}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-full sm:w-52">
            <Select value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="">Anything that happened</option>
              {actions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} · {entry.count}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-full sm:w-56">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, reference, address, anything"
            />
          </div>
        </div>

        {entries.length === 0 ? (
          <Empty>
            {filtered || counts.total
              ? 'Nothing matches those filters.'
              : 'Nothing has been recorded yet.'}
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

      <Panel title="What lands here" icon={History}>
        <div className="px-4 sm:px-6 py-4 flex flex-wrap gap-2">
          {families.map((entry) => (
            <Pill key={entry.id} tone={entry.count ? 'purple' : 'neutral'}>
              {entry.label} · {entry.count}
            </Pill>
          ))}
        </div>
        <p className="px-4 sm:px-6 pb-4 text-[12px] text-neutral-500 font-normal">
          Everything the panel itself recorded. What a client said in a ticket is under
          Transcripts, and the exchange bot keeps its own log under C2C.
        </p>
      </Panel>
    </div>
  );
}
