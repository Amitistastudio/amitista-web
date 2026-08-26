import React from 'react';
import {
  Construction,
  RefreshCw,
  Check as CheckIcon,
  DoorOpen,
  Wrench,
  Lock,
  History,
  Files,
  ExternalLink,
} from 'lucide-react';
import { Panel, Notice, Button, TextInput, SearchInput, Pill, Empty, Figure, SubNav, FIELD_CLASS } from './ui';
import { Confirm } from './api/shared';
import { fetchPages, coverPage, reopenPage } from '../../lib/admin';
import { ROUTE_PATHS, PRIVATE_PATHS, labelForPath } from '../../content/routeMeta';
import { LEGAL_GROUPS } from '../../content/legal';

const MODE_PILL = {
  maintenance: { tone: 'amber', label: 'Maintenance' },
  closed: { tone: 'rose', label: 'Closed' },
};

const MESSAGE_MAX = 200;
const TAG_MAX = 24;

const PRESETS = ['Wait for stage 3', 'Back soon', 'Being reworked'];

const TABS = [
  { id: 'covers', label: 'Covers', icon: Wrench },
  { id: 'directory', label: 'Directory', icon: Files },
  { id: 'history', label: 'History', icon: History },
];

const PUBLIC_PATHS = ROUTE_PATHS.filter((path) => !PRIVATE_PATHS.has(path));

const LEGAL_PATHS = new Set([
  '/legal',
  ...LEGAL_GROUPS.flatMap((group) => group.pages.map((page) => page.href)),
]);

const GROUP_ORDER = [
  { id: 'pages', label: 'Site pages' },
  { id: 'docs', label: 'Documentation' },
  { id: 'work', label: 'Work' },
  { id: 'audiences', label: 'Audiences' },
  { id: 'legal', label: 'Legal' },
];

function groupOf(path) {
  if (path.startsWith('/docs')) return 'docs';
  if (path.startsWith('/work')) return 'work';
  if (path.startsWith('/for')) return 'audiences';
  if (LEGAL_PATHS.has(path)) return 'legal';
  return 'pages';
}

function describe(path) {
  if (path === '/') return 'Home';
  return labelForPath(path) ?? path.slice(1).replace(/[/-]/g, ' ');
}

function ago(stamp, now) {
  const then = Date.parse(stamp ?? '');
  if (!Number.isFinite(then)) return null;
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function inWords(stamp, now) {
  const then = Date.parse(stamp ?? '');
  if (!Number.isFinite(then)) return null;
  const minutes = Math.floor((then - now) / 60000);
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

function isoToLocalInput(iso) {
  const time = Date.parse(iso ?? '');
  if (!Number.isFinite(time)) return '';
  const shifted = new Date(time - new Date(time).getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

function localInputToIso(value) {
  const time = Date.parse(value ?? '');
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
}

function eveningIso() {
  const at = new Date();
  at.setHours(20, 0, 0, 0);
  if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
  return at.toISOString();
}

function morningIso() {
  const at = new Date();
  at.setDate(at.getDate() + 1);
  at.setHours(9, 0, 0, 0);
  return at.toISOString();
}

function tabFromHash() {
  if (typeof window === 'undefined') return 'covers';
  const part = window.location.hash.replace('#', '').split('/')[1];
  return TABS.some((tab) => tab.id === part) ? part : 'covers';
}

function ViewLink({ path }) {
  return (
    <a
      href={path}
      target="_blank"
      rel="noreferrer"
      title={`Open ${path} in a new tab`}
      className="inline-flex items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-3 py-2 text-[11px] font-semibold tracking-[0.14em] text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors"
    >
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
      VIEW
    </a>
  );
}

const TIMER_CHIPS = [
  { label: 'In 1 hour', pick: () => new Date(Date.now() + 3600000).toISOString() },
  { label: 'This evening', pick: eveningIso },
  { label: 'Tomorrow 09:00', pick: morningIso },
];

function Editor({ path, initial, busy, onApply, onCancel }) {
  const [mode, setMode] = React.useState(initial?.mode ?? 'maintenance');
  const [message, setMessage] = React.useState(initial?.message ?? '');
  const [tag, setTag] = React.useState(initial?.tag ?? '');
  const [until, setUntil] = React.useState(() => isoToLocalInput(initial?.until));

  return (
    <div className="flex flex-col gap-3 border border-[#282832] bg-[#111115]/50 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          tone={mode === 'maintenance' ? 'solid' : 'quiet'}
          onClick={() => setMode('maintenance')}
          disabled={busy}
        >
          <Wrench className="h-3.5 w-3.5" strokeWidth={2} />
          Maintenance
        </Button>
        <Button
          type="button"
          tone={mode === 'closed' ? 'solid' : 'quiet'}
          onClick={() => setMode('closed')}
          disabled={busy}
        >
          <Lock className="h-3.5 w-3.5" strokeWidth={2} />
          Closed
        </Button>
        <span className="text-[11px] text-neutral-600 ml-auto hidden sm:inline">
          {mode === 'closed'
            ? 'The page shows blurred behind a closed tag with your reason.'
            : 'Violet cover page, reads as being worked on.'}
        </span>
      </div>
      <TextInput
        value={message}
        onChange={(event) => setMessage(event.target.value.slice(0, MESSAGE_MAX))}
        placeholder="Wait for stage 3"
        aria-label={`Cover message for ${path}`}
        disabled={busy}
      />
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setMessage(preset)}
            disabled={busy}
            className={`px-2.5 py-1 border text-[11px] transition-colors cursor-pointer ${
              message === preset
                ? 'border-purple-500/60 text-white bg-purple-500/10'
                : 'border-[#282832] text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {preset}
          </button>
        ))}
        <span className="text-[11px] text-neutral-700 ml-auto">
          {message.length}/{MESSAGE_MAX}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-neutral-500 tracking-[0.14em] uppercase">Tag on the cover</span>
          <TextInput
            value={tag}
            onChange={(event) => setTag(event.target.value.slice(0, TAG_MAX))}
            placeholder={mode === 'closed' ? 'TEMPORARILY CLOSED' : 'UNDER MAINTENANCE'}
            aria-label={`Cover tag for ${path}`}
            disabled={busy}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-neutral-500 tracking-[0.14em] uppercase">Reopens by itself</span>
          <input
            type="datetime-local"
            value={until}
            onChange={(event) => setUntil(event.target.value)}
            aria-label={`Reopen time for ${path}`}
            disabled={busy}
            className={FIELD_CLASS}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {TIMER_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => setUntil(isoToLocalInput(chip.pick()))}
            disabled={busy}
            className="px-2.5 py-1 border border-[#282832] text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
          >
            {chip.label}
          </button>
        ))}
        {until && (
          <button
            type="button"
            onClick={() => setUntil('')}
            disabled={busy}
            className="px-2.5 py-1 border border-[#282832] text-[11px] text-neutral-500 hover:text-rose-300 transition-colors cursor-pointer"
          >
            No timer
          </button>
        )}
        <span className="text-[11px] text-neutral-700 ml-auto">
          {until ? 'The cover lifts itself at that time.' : 'No timer — stays until you reopen it.'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          tone="solid"
          onClick={() => onApply(mode, message, localInputToIso(until), tag)}
          disabled={busy}
        >
          {busy ? 'Applying…' : 'Apply the cover'}
        </Button>
        <Button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <span className="text-[11px] text-neutral-600 ml-auto">
          Visitors keep the theme, with this message on top.
        </span>
      </div>
    </div>
  );
}

export default function PagesPanel() {
  const [covers, setCovers] = React.useState(null);
  const [history, setHistory] = React.useState([]);
  const [error, setError] = React.useState(null);
  const [note, setNote] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const [editing, setEditing] = React.useState(null);
  const [tab, setTab] = React.useState(tabFromHash);
  const [now, setNow] = React.useState(() => Date.now());

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const answer = await fetchPages();
      setCovers(answer.pages ?? []);
      setHistory(answer.history ?? []);
      setNow(Date.now());
      setError(null);
    } catch (failure) {
      if (!quiet) setError(failure.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const pick = React.useCallback((next) => {
    setTab(next);
    window.history.replaceState(null, '', `#pages/${next}`);
  }, []);

  React.useEffect(() => {
    const sync = () => setTab(tabFromHash());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const act = React.useCallback(
    async (work, done) => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const answer = await work();
        setNote(done(answer));
        setEditing(null);
        await load(true);
      } catch (failure) {
        setError(failure.message);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const apply = React.useCallback(
    (path, mode, message, until, tag) =>
      act(
        () => coverPage(path, mode, message, until, tag),
        (answer) =>
          `${answer.page.path} is now ${answer.page.mode === 'closed' ? 'closed' : 'under maintenance'}${
            answer.page.until ? ' with a timer' : ''
          }.`,
      ),
    [act],
  );

  const reopen = React.useCallback(
    (path) => act(() => reopenPage(path), (answer) => `${answer.page.path} is live again.`),
    [act],
  );

  const reopenAll = React.useCallback(
    () =>
      act(
        async () => {
          const paths = (covers ?? []).map((entry) => entry.path);
          for (const path of paths) {
            await reopenPage(path);
          }
          return paths.length;
        },
        (count) => `All ${count} pages are live again.`,
      ),
    [act, covers],
  );

  const byPath = React.useMemo(() => {
    const map = new Map();
    for (const entry of covers ?? []) map.set(entry.path, entry);
    return map;
  }, [covers]);

  const groups = React.useMemo(() => {
    const known = new Set(PUBLIC_PATHS);
    const all = [...PUBLIC_PATHS, ...[...byPath.keys()].filter((path) => !known.has(path))];
    const needle = filter.trim().toLowerCase();
    const shown = needle
      ? all.filter(
          (path) =>
            path === editing ||
            path.includes(needle) ||
            describe(path).toLowerCase().includes(needle),
        )
      : all;
    return GROUP_ORDER.map((group) => ({
      ...group,
      paths: shown.filter((path) => groupOf(path) === group.id).sort((a, b) => a.localeCompare(b)),
    })).filter((group) => group.paths.length > 0);
  }, [byPath, filter, editing]);

  const counts = React.useMemo(() => {
    const list = covers ?? [];
    return {
      total: PUBLIC_PATHS.length,
      covered: list.length,
      maintenance: list.filter((entry) => entry.mode === 'maintenance').length,
      closed: list.filter((entry) => entry.mode === 'closed').length,
    };
  }, [covers]);

  if (loading && covers === null) {
    return (
      <Panel title="Pages" icon={Construction}>
        <Empty>Reading the covers…</Empty>
      </Panel>
    );
  }

  const renderRow = (path, { showGroupHint = false } = {}) => {
    const cover = byPath.get(path);
    const pill = cover ? MODE_PILL[cover.mode] : null;
    const open = editing === path;
    return (
      <div key={path} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col min-w-0">
            <span className="text-sm text-white truncate">{describe(path)}</span>
            <span className="text-[11px] text-neutral-500 font-mono truncate">
              {path}
              {showGroupHint ? ` · ${GROUP_ORDER.find((g) => g.id === groupOf(path))?.label}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {cover && cover.until && !inWords(cover.until, now) && <Pill tone="neutral">Lapsed</Pill>}
            {pill ? <Pill tone={pill.tone}>{pill.label}</Pill> : <Pill tone="green">Live</Pill>}
            <ViewLink path={path} />
            {cover ? (
              <>
                <Button type="button" onClick={() => setEditing(open ? null : path)} disabled={busy}>
                  {open ? 'Never mind' : 'Change'}
                </Button>
                <Confirm label="Reopen" icon={DoorOpen} onConfirm={() => reopen(path)} disabled={busy}>
                  Yes, reopen it
                </Confirm>
              </>
            ) : (
              <Button type="button" onClick={() => setEditing(open ? null : path)} disabled={busy}>
                <Wrench className="h-3.5 w-3.5" strokeWidth={2} />
                {open ? 'Never mind' : 'Cover'}
              </Button>
            )}
          </div>
        </div>
        {cover && !open && cover.message && (
          <p className="text-xs text-neutral-400 leading-relaxed">“{cover.message}”</p>
        )}
        {cover && !open && (
          <p className="text-[11px] text-neutral-600">
            Covered by {cover.setBy}
            {ago(cover.since, now) ? ` · ${ago(cover.since, now)}` : ''}
            {cover.until && inWords(cover.until, now) ? ` · reopens in ${inWords(cover.until, now)}` : ''}
            {cover.until && !inWords(cover.until, now) ? ' · the timer has lapsed, visitors see it live' : ''}
            {cover.changedBy ? ` · last change by ${cover.changedBy}` : ''}
          </p>
        )}
        {open && (
          <Editor
            path={path}
            initial={cover}
            busy={busy}
            onApply={(mode, message, until, tag) => apply(path, mode, message, until, tag)}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Figure label="Public pages" value={String(counts.total)} hint="everything a visitor can reach" />
        <Figure
          label="Covered"
          value={String(counts.covered)}
          tone={counts.covered > 0 ? 'text-amber-300' : 'text-white'}
          hint={counts.covered === 0 ? 'every page is live' : 'hidden behind a cover'}
        />
        <Figure
          label="Maintenance"
          value={String(counts.maintenance)}
          tone={counts.maintenance > 0 ? 'text-amber-300' : 'text-white'}
          hint="being worked on"
        />
        <Figure
          label="Closed"
          value={String(counts.closed)}
          tone={counts.closed > 0 ? 'text-rose-400' : 'text-white'}
          hint="switched off on purpose"
        />
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SubNav
          tabs={TABS}
          active={tab}
          onPick={pick}
          badges={{ covers: counts.covered }}
          label="Pages sections"
        />
        <div className="flex items-center gap-2">
          {tab === 'directory' && (
            <SearchInput
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter pages"
              aria-label="Filter pages"
              className="max-w-[220px]"
            />
          )}
          <Button type="button" onClick={() => load()} disabled={loading || busy}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && <Notice tone="rose">{error}</Notice>}
      {note && (
        <Notice tone="emerald" icon={CheckIcon}>
          {note}
        </Notice>
      )}

      {tab === 'covers' && (
        <Panel
          title="Active covers"
          icon={Wrench}
          action={
            counts.covered > 1 ? (
              <Confirm label="Reopen everything" icon={DoorOpen} onConfirm={reopenAll} disabled={busy}>
                Yes, reopen all {counts.covered}
              </Confirm>
            ) : null
          }
        >
          {counts.covered === 0 ? (
            <Empty>Every page is live. Cover one from the directory.</Empty>
          ) : (
            <div className="flex flex-col divide-y divide-[#1c1c22]">
              {(covers ?? [])
                .slice()
                .sort((a, b) => a.path.localeCompare(b.path))
                .map((entry) => renderRow(entry.path, { showGroupHint: true }))}
            </div>
          )}
        </Panel>
      )}

      {tab === 'directory' &&
        groups.map((group) => (
          <Panel key={group.id} title={`${group.label} · ${group.paths.length}`} icon={Files}>
            <div className="flex flex-col divide-y divide-[#1c1c22]">
              {group.paths.map((path) => renderRow(path))}
            </div>
          </Panel>
        ))}
      {tab === 'directory' && groups.length === 0 && (
        <Panel title="Directory" icon={Files}>
          <Empty>No page matches that filter.</Empty>
        </Panel>
      )}

      {tab === 'history' && (
        <Panel title="Recent changes" icon={History}>
          {history.length === 0 ? (
            <Empty>No covers have been set or lifted yet.</Empty>
          ) : (
            <div className="flex flex-col divide-y divide-[#1c1c22]">
              {history.map((entry, index) => {
                const detail = entry.detail ?? {};
                const covered = entry.action === 'page.covered';
                return (
                  <div key={`${entry.at}-${index}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 flex-wrap">
                    <Pill tone={covered ? (detail.mode === 'closed' ? 'rose' : 'amber') : 'green'}>
                      {covered ? (detail.mode === 'closed' ? 'Closed' : 'Maintenance') : 'Reopened'}
                    </Pill>
                    <span className="text-sm text-white font-mono">{detail.path}</span>
                    {covered && detail.message && (
                      <span className="text-xs text-neutral-400 truncate">“{detail.message}”</span>
                    )}
                    <span className="text-[11px] text-neutral-600 ml-auto whitespace-nowrap">
                      {entry.actor}
                      {ago(entry.at, now) ? ` · ${ago(entry.at, now)}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
