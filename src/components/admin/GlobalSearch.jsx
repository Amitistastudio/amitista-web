import React from 'react';
import { createPortal } from 'react-dom';
import { FileSearch, LifeBuoy, Package, Search, X } from 'lucide-react';
import { TRANSCRIPT_KIND_LABELS, searchEverything } from '../../lib/admin';
import { Empty, Pill } from './ui';
import { IdText } from './orders/ids';
import { ago } from './orders/shared';

const DEBOUNCE_MS = 260;
const MIN = 2;

const WHY = {
  id: 'ID match',
  track: 'tracking code',
  text: null,
};

function Group({ title, icon: Icon, rows, onPick }) {
  if (!rows.length) return null;

  return (
    <div className="border-t border-[#17171d] first:border-t-0">
      <div className="flex items-center gap-2 px-4 sm:px-5 py-2.5">
        <Icon className="h-3.5 w-3.5 text-neutral-600" strokeWidth={2} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
          {title} — {rows.length}
        </span>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={`${row.entity}-${row.id}`}>
            <button
              type="button"
              onClick={() => onPick(row)}
              className="w-full border-t border-[#17171d] px-4 sm:px-5 py-3 text-left transition-colors hover:bg-[#111115]"
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <IdText code={row.ref} />
                <Pill tone={row.status === 'closed' ? 'neutral' : 'purple'}>
                  {row.stageLabel || row.status}
                </Pill>
                {WHY[row.why] && <Pill tone="amber">{WHY[row.why]}</Pill>}
              </div>
              <p className="truncate text-[13px] font-normal text-neutral-100">
                {row.name || row.subject || 'Untitled'}
              </p>
              <p className="mt-0.5 truncate text-[12px] font-normal text-neutral-500">
                {row.categoryLabel} · {row.user?.name ?? 'unknown'} ·{' '}
                {row.status === 'closed' ? `closed ${ago(row.closedAt)}` : ago(row.updatedAt ?? row.lastMessageAt)}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TranscriptGroup({ rows, onPick }) {
  if (!rows.length) return null;

  return (
    <div className="border-t border-[#17171d] first:border-t-0">
      <div className="flex items-center gap-2 px-4 sm:px-5 py-2.5">
        <FileSearch className="h-3.5 w-3.5 text-neutral-600" strokeWidth={2} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
          Transcripts — {rows.length}
        </span>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={`transcript-${row.id}`}>
            <button
              type="button"
              onClick={() => onPick(row)}
              className="w-full border-t border-[#17171d] px-4 sm:px-5 py-3 text-left transition-colors hover:bg-[#111115]"
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                {row.ref && <IdText code={row.ref} />}
                <Pill tone="neutral">{TRANSCRIPT_KIND_LABELS[row.kind] ?? row.kind}</Pill>
              </div>
              <p className="truncate text-[13px] font-normal text-neutral-100">
                {row.subject || (row.channel ? `#${row.channel}` : row.code)}
              </p>
              <p className="mt-0.5 truncate text-[12px] font-normal text-neutral-500">
                {row.messages} messages · closed {ago(row.closedAt)}
                {row.hit ? ` · “${row.hit.replace(/[*_~`|]/g, '').replace(/\s+/g, ' ')}”` : ''}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GlobalSearch({ onGo }) {
  const [query, setQuery] = React.useState('');
  const [found, setFound] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [showing, setShowing] = React.useState(false);
  const box = React.useRef(null);

  const wanted = query.trim();

  React.useEffect(() => {
    if (wanted.length < MIN) {
      setFound(null);
      setError(null);
      return undefined;
    }
    let alive = true;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const answer = await searchEverything(wanted);
        if (alive) {
          setFound(answer);
          setError(answer.botDown ?? null);
        }
      } catch (failure) {
        if (alive) {
          setFound(null);
          setError(failure.message);
        }
      } finally {
        if (alive) setBusy(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [wanted]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    function key(event) {
      if (event.key === 'Escape' && showing) {
        event.stopPropagation();
        setShowing(false);
        return;
      }
      if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setShowing(true);
        window.setTimeout(() => box.current?.focus(), 0);
      }
    }

    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [showing]);

  function pick(row) {
    setShowing(false);
    setQuery('');
    setFound(null);
    if (row.entity === 'transcript') return onGo('transcripts', row.id);
    onGo(row.entity === 'ticket' ? 'support' : 'orders', row.id);
  }

  const trigger = (
    <button
      type="button"
      onClick={() => {
        setShowing(true);
        window.setTimeout(() => box.current?.focus(), 0);
      }}
      className="tap inline-flex items-center gap-2 whitespace-nowrap border border-[#282832] bg-[#0a0a0d] px-4 py-2.5 text-[12px] font-semibold tracking-wide text-neutral-300 transition-colors hover:bg-[#111115]"
    >
      <Search className="h-3.5 w-3.5" strokeWidth={2} />
      Search everything
    </button>
  );

  if (!showing || typeof document === 'undefined') return trigger;

  const projects = found?.projects ?? [];
  const tickets = found?.tickets ?? [];
  const transcripts = found?.transcripts ?? [];
  const nothing =
    wanted.length >= MIN && !busy && !projects.length && !tickets.length && !transcripts.length;

  return (
    <>
      {trigger}
      {createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search everything"
          className="fixed inset-0 z-[90] flex items-start justify-center bg-black/70 px-4 pt-[12vh]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowing(false);
          }}
        >
          <div className="w-full max-w-[640px] border border-[#282832] bg-[#0a0a0d] shadow-2xl">
            <div className="flex items-center gap-3 border-b border-[#17171d] px-4 sm:px-5 py-3.5">
              <Search className="h-4 w-4 shrink-0 text-neutral-600" strokeWidth={2} />
              <input
                ref={box}
                type="search"
                value={query}
                autoComplete="off"
                spellCheck={false}
                placeholder="A project ID, a client, a ticket, anything said in one…"
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[14px] font-normal text-white outline-none placeholder:text-neutral-600"
              />
              {busy && <span className="shrink-0 text-[11px] text-neutral-600">…</span>}
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowing(false)}
                className="shrink-0 text-neutral-600 transition-colors hover:text-neutral-200"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {error && <Empty>{error}</Empty>}
              {!error && wanted.length < MIN && (
                <Empty>
                  Type at least two characters. Any ID works — the whole thing, or just the first
                  six characters of one.
                </Empty>
              )}
              {!error && nothing && <Empty>Nothing matches that.</Empty>}
              {!error && (
                <>
                  <Group title="Projects and orders" icon={Package} rows={projects} onPick={pick} />
                  <Group title="Support tickets" icon={LifeBuoy} rows={tickets} onPick={pick} />
                  <TranscriptGroup rows={transcripts} onPick={pick} />
                </>
              )}
            </div>

            <div className="border-t border-[#17171d] px-4 sm:px-5 py-2.5">
              <p className="text-[11px] font-normal text-neutral-600">
                Ctrl/⌘ + K opens this from anywhere in the panel.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
