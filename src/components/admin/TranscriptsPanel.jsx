import React from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileSearch,
  Link2,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { Button, Notice } from './ui';
import { Avatar, Conversation, formatDay, formatSize, formatStamp } from '../transcript/Conversation';
import {
  TRANSCRIPT_KINDS,
  TRANSCRIPT_KIND_LABELS,
  deleteTranscript,
  fetchTranscript,
  fetchTranscriptSummary,
  fetchTranscripts,
} from '../../lib/admin';

const PAGE = 40;
const TYPING_MS = 250;
const HIT_CLASS = 'tx-hit';
const HIT_LIVE = 'tx-hit-live';

const WINDOWS = [
  { id: 'all', label: 'Any time', ms: null },
  { id: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { id: '90d', label: '90 days', ms: 90 * 24 * 60 * 60 * 1000 },
];

const KIND_TONE = {
  ticket: 'text-purple-300',
  project: 'text-emerald-300',
  application: 'text-neutral-400',
  channel: 'text-neutral-500',
};

const Reading = React.memo(Conversation);

function fromHash() {
  if (typeof window === 'undefined') return null;
  const found = /^#transcripts\/([0-9a-f]{32})$/.exec(window.location.hash || '');
  return found ? found[1] : null;
}

function terms(query) {
  const found = String(query || '')
    .toLowerCase()
    .match(/[\p{L}\p{N}_-]{2,64}/gu);
  return found ? [...new Set(found)].slice(0, 8) : [];
}

function safeWords(words) {
  return words.map((word) => word.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|');
}

function Mark({ text, words }) {
  if (!words.length || !text) return text || null;

  const parts = String(text).split(new RegExp(`(${safeWords(words)})`, 'ig'));

  return parts.map((part, index) =>
    words.includes(part.toLowerCase()) ? (
      <span key={index} className="bg-purple-500/25 text-purple-100">
        {part}
      </span>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    ),
  );
}

function Row({ row, active, words, onPick }) {
  const people = row.people?.length ? row.people.slice(0, 2).join(', ') : `${row.participants} people`;

  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(row.id)}
        aria-current={active ? 'true' : undefined}
        className={`relative w-full border-b border-[#17171d] px-4 py-2.5 text-left transition-colors ${
          active ? 'bg-[#15151c]' : 'hover:bg-[#0e0e13]'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-[2px] ${active ? 'bg-purple-400' : 'bg-transparent'}`}
        />

        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-200">
            <Mark text={row.subject || (row.channel?.name ? `#${row.channel.name}` : row.code)} words={words} />
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-neutral-600">{formatDay(row.closedAt)}</span>
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-neutral-600">
          <span className={`font-semibold uppercase tracking-[0.1em] ${KIND_TONE[row.kind] ?? 'text-neutral-500'}`}>
            {TRANSCRIPT_KIND_LABELS[row.kind] ?? row.kind}
          </span>
          {row.ref && <span className="font-mono text-neutral-500">{row.ref}</span>}
          <span>{people}</span>
          <span>{row.messages} messages</span>
        </span>

        {row.hit && (
          <span className="mt-0.5 block truncate text-[12px] text-neutral-500">
            <Mark text={row.hit.replace(/[*_~`|]/g, '').replace(/\s+/g, ' ')} words={words} />
          </span>
        )}
      </button>
    </li>
  );
}

function Matches({ container, doc, words }) {
  const [count, setCount] = React.useState(0);
  const [at, setAt] = React.useState(0);

  React.useEffect(() => {
    const root = container.current;
    if (!root) return;

    for (const old of [...root.querySelectorAll(`.${HIT_CLASS}`)]) {
      const parent = old.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(old.textContent), old);
      parent.normalize();
    }

    if (!words.length || !doc) {
      setCount(0);
      setAt(0);
      return;
    }

    const pattern = new RegExp(safeWords(words), 'ig');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });

    const targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);

    let found = 0;
    for (const node of targets) {
      const text = node.nodeValue;
      pattern.lastIndex = 0;
      if (!pattern.test(text)) continue;

      pattern.lastIndex = 0;
      const holder = document.createDocumentFragment();
      let cursor = 0;
      let hit = pattern.exec(text);

      while (hit) {
        if (hit.index > cursor) holder.appendChild(document.createTextNode(text.slice(cursor, hit.index)));
        const mark = document.createElement('mark');
        mark.className = HIT_CLASS;
        mark.textContent = hit[0];
        holder.appendChild(mark);
        cursor = hit.index + hit[0].length;
        found += 1;
        hit = pattern.exec(text);
      }

      if (cursor < text.length) holder.appendChild(document.createTextNode(text.slice(cursor)));
      node.parentNode?.replaceChild(holder, node);
    }

    setCount(found);
    setAt(found ? 1 : 0);
  }, [container, doc, words]);

  React.useEffect(() => {
    const root = container.current;
    if (!root || !at) return;
    const marks = root.querySelectorAll(`.${HIT_CLASS}`);
    for (const mark of marks) mark.classList.remove(HIT_LIVE);
    const target = marks[at - 1];
    if (!target) return;
    target.classList.add(HIT_LIVE);
    target.scrollIntoView({ block: 'center' });
  }, [container, at, count]);

  if (!words.length) return null;

  return (
    <div className="flex items-center gap-2 border-b border-[#17171d] bg-[#08080b] px-4 py-2 sm:px-5">
      <Search className="h-3.5 w-3.5 shrink-0 text-neutral-600" strokeWidth={2} />
      <span className="text-[11.5px] text-neutral-500">
        {count === 0 ? 'Not said in this one' : `${at} of ${count} match${count === 1 ? '' : 'es'}`}
      </span>
      {count > 1 && (
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous match"
            onClick={() => setAt((now) => (now <= 1 ? count : now - 1))}
            className="tap border border-[#282832] bg-[#0a0a0d] p-1 text-neutral-400 transition-colors hover:text-white"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Next match"
            onClick={() => setAt((now) => (now >= count ? 1 : now + 1))}
            className="tap border border-[#282832] bg-[#0a0a0d] p-1 text-neutral-400 transition-colors hover:text-white"
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </span>
      )}
    </div>
  );
}

function Reader({ id, canManage, words, onBack, onGone }) {
  const [doc, setDoc] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [dropping, setDropping] = React.useState(false);
  const body = React.useRef(null);

  React.useEffect(() => {
    let live = true;
    setBusy(true);
    setDoc(null);
    setConfirming(false);
    fetchTranscript(id)
      .then((answer) => {
        if (!live) return;
        setDoc(answer);
        setError(null);
      })
      .catch((failure) => {
        if (live) setError(failure.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [id]);

  const meta = doc?.transcript ?? null;
  const said = React.useMemo(() => doc?.messages ?? [], [doc]);

  const copy = async () => {
    if (!meta?.url) return;
    try {
      await navigator.clipboard.writeText(meta.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const drop = async () => {
    setDropping(true);
    try {
      await deleteTranscript(id);
      onGone(id);
    } catch (failure) {
      setError(failure.message);
      setDropping(false);
      setConfirming(false);
    }
  };

  if (busy && !doc) {
    return (
      <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-10">
        <p className="text-[13px] font-normal text-neutral-500">Opening the transcript…</p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-3 px-6 py-10">
        <p className="text-[13px] font-normal text-neutral-400">{error ?? 'That transcript could not be opened.'}</p>
        <Button type="button" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Back to the search
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[#17171d] px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to the search"
            className="tap mt-0.5 shrink-0 text-neutral-500 transition-colors hover:text-neutral-200 lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium text-white">
              {meta.subject || `#${doc.channel?.name ?? meta.code}`}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-neutral-500">
              {meta.ref && <span className="font-mono text-neutral-400">{meta.ref}</span>}
              <span className={KIND_TONE[meta.kind] ?? 'text-neutral-500'}>
                {TRANSCRIPT_KIND_LABELS[meta.kind] ?? meta.kind}
              </span>
              {doc.channel?.name && <span>#{doc.channel.name}</span>}
              <span>{doc.stats?.messages ?? meta.messages} messages</span>
              <span>{doc.stats?.participants ?? meta.participants} people</span>
              <span>{formatSize(meta.bytes)}</span>
              <span>closed {formatStamp(meta.closedAt)}</span>
              {meta.closedBy?.name && <span>by {meta.closedBy.name}</span>}
            </p>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="tap inline-flex items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-2.5 py-1.5 text-[11.5px] font-semibold text-neutral-300 transition-colors hover:border-[#3d3d4a] hover:text-white"
          >
            <Link2 className="h-3.5 w-3.5" strokeWidth={2} />
            {copied ? 'Link copied' : 'Copy the link'}
          </button>
          <a
            href={meta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="tap inline-flex items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-2.5 py-1.5 text-[11.5px] font-semibold text-neutral-300 transition-colors hover:border-[#3d3d4a] hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
            Open the page
          </a>
          <a
            href={`/api/transcript/file?code=${encodeURIComponent(meta.code)}`}
            className="tap inline-flex items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-2.5 py-1.5 text-[11.5px] font-semibold text-neutral-300 transition-colors hover:border-[#3d3d4a] hover:text-white"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Download
          </a>
          {canManage && (
            <button
              type="button"
              disabled={dropping}
              onClick={() => setConfirming((held) => !held)}
              className="tap ml-auto inline-flex items-center gap-1.5 border border-rose-500/30 bg-rose-500/[0.07] px-2.5 py-1.5 text-[11.5px] font-semibold text-rose-300 transition-colors hover:bg-rose-500/15 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Delete
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 pt-3 sm:px-5">
          <Notice tone="rose">{error}</Notice>
        </div>
      )}

      {confirming && (
        <div className="border-b border-[#17171d] bg-[#08080b] px-4 py-3 sm:px-5">
          <p className="text-[12px] font-normal leading-relaxed text-neutral-500">
            Deleting {meta.ref || meta.code} removes the transcript and every image in it, and the link stops working
            for whoever holds it. There is no undo.
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" tone="danger" disabled={dropping} onClick={drop}>
              {dropping ? 'Deleting…' : 'Delete it for good'}
            </Button>
            <Button type="button" disabled={dropping} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}

      <Matches container={body} doc={doc} words={words} />

      {doc.participants?.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-[#17171d] px-4 py-2.5 sm:px-5">
          {doc.participants.map((person) => (
            <span key={person.id} className="inline-flex items-center gap-2">
              <Avatar name={person.name} avatar={person.avatar} className="h-5 w-5 rounded-full" />
              <span className="text-[12px] text-neutral-300">{person.name}</span>
              <span className="text-[11px] tabular-nums text-neutral-600">{person.count}</span>
            </span>
          ))}
        </div>
      )}

      <div ref={body} className="min-h-0 flex-1 overflow-y-auto">
        <Reading messages={said} />
      </div>
    </div>
  );
}

export default function TranscriptsPanel({ permissions = [] }) {
  const canManage = permissions.includes('transcripts.manage');

  const [query, setQuery] = React.useState('');
  const [term, setTerm] = React.useState('');
  const [kind, setKind] = React.useState('');
  const [windowId, setWindowId] = React.useState('all');

  const [summary, setSummary] = React.useState(null);
  const [rows, setRows] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [more, setMore] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [open, setOpen] = React.useState(fromHash);

  React.useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), TYPING_MS);
    return () => clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const follow = () => {
      const wanted = fromHash();
      if (wanted) setOpen(wanted);
    };
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const span = WINDOWS.find((entry) => entry.id === windowId) ?? WINDOWS[0];

  const filters = React.useMemo(
    () => ({ q: term, kind, from: span.ms ? Date.now() - span.ms : '', limit: PAGE }),
    [term, kind, span],
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchTranscripts(filters);
      setRows(page.rows ?? []);
      setTotal(page.total ?? 0);
      setError(null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  React.useEffect(() => {
    load();
  }, [load]);

  const readSummary = React.useCallback(() => {
    fetchTranscriptSummary()
      .then(setSummary)
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    readSummary();
  }, [readSummary]);

  const loadMore = async () => {
    setMore(true);
    try {
      const page = await fetchTranscripts({ ...filters, offset: rows.length });
      setRows((current) => [...current, ...(page.rows ?? [])]);
      setTotal(page.total ?? 0);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setMore(false);
    }
  };

  const close = () => {
    setOpen(null);
    if (typeof window !== 'undefined' && fromHash()) {
      window.history.replaceState(null, '', '#transcripts');
    }
  };

  const gone = (id) => {
    close();
    setRows((current) => current.filter((row) => row.id !== id));
    setTotal((current) => Math.max(0, current - 1));
    readSummary();
  };

  const words = React.useMemo(() => terms(term), [term]);
  const counts = summary?.kinds ?? {};

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] font-normal text-neutral-500">
          {(summary?.count ?? 0).toLocaleString()} transcript{summary?.count === 1 ? '' : 's'} ·{' '}
          {(summary?.messages ?? 0).toLocaleString()} messages · {formatSize(summary?.bytes ?? 0)}
          {summary?.newest ? ` · newest ${formatDay(summary.newest)}` : ''}
        </p>
        <p className="text-[11.5px] font-normal text-neutral-600">
          Searched by everything said in them, not just the subject.
        </p>
      </div>

      {error && <Notice tone="rose">{error}</Notice>}

      <div className="grid min-h-[520px] grid-cols-1 overflow-hidden border border-[#282832] bg-[#0a0a0d] lg:h-[calc(100vh-240px)] lg:max-h-[860px] lg:grid-cols-[minmax(320px,380px)_1fr]">
        <div
          className={`min-h-0 flex-col border-b border-[#282832] lg:border-b-0 lg:border-r ${
            open ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="flex items-center gap-2 border-b border-[#17171d] px-3 py-2.5">
            <label className="relative flex min-w-0 flex-1 items-center">
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-neutral-600" strokeWidth={2} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Anything said in it, a name, a reference…"
                aria-label="Search transcripts"
                className="w-full border border-[#282832] bg-[#0a0a0d] py-1.5 pl-8 pr-2 text-[12px] font-normal text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-purple-500/50"
              />
            </label>
            <select
              value={windowId}
              onChange={(event) => setWindowId(event.target.value)}
              aria-label="When"
              className="shrink-0 cursor-pointer border border-[#282832] bg-[#0a0a0d] px-1.5 py-1.5 text-[11.5px] font-semibold text-neutral-300 outline-none"
            >
              {WINDOWS.map((entry) => (
                <option key={entry.id} value={entry.id} className="bg-[#0a0a0d]">
                  {entry.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              aria-label="Refresh"
              className="tap shrink-0 border border-[#282832] bg-[#0a0a0d] p-1.5 text-neutral-400 transition-colors hover:text-white disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
            </button>
          </div>

          <div className="flex flex-wrap gap-1 border-b border-[#17171d] px-3 py-2">
            {TRANSCRIPT_KINDS.map((entry) => {
              const on = entry.id === kind;
              const count = entry.id ? counts[entry.id] ?? 0 : summary?.count ?? 0;
              return (
                <button
                  key={entry.id || 'all'}
                  type="button"
                  onClick={() => setKind(entry.id)}
                  aria-pressed={on}
                  className={`tap shrink-0 whitespace-nowrap border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
                    on
                      ? 'border-purple-500/40 bg-purple-500/15 text-white'
                      : 'border-transparent text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {entry.label}
                  {count > 0 && (
                    <span className={`ml-1.5 tabular-nums ${on ? 'text-purple-200' : 'text-neutral-600'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="px-4 py-10 text-[12.5px] font-normal leading-relaxed text-neutral-500">
                {loading
                  ? 'Searching…'
                  : term
                    ? `Nothing matches “${term}”. Try a phrase from the conversation itself — every message is indexed.`
                    : 'No transcripts yet. One is archived every time a ticket, project or application closes.'}
              </p>
            ) : (
              <>
                <ul>
                  {rows.map((row) => (
                    <Row
                      key={row.id}
                      row={row}
                      words={words}
                      active={row.id === open}
                      onPick={(id) => {
                        setOpen(id);
                        if (typeof window !== 'undefined') {
                          window.history.replaceState(null, '', `#transcripts/${id}`);
                        }
                      }}
                    />
                  ))}
                </ul>
                {rows.length < total && (
                  <div className="px-3 py-3">
                    <Button type="button" disabled={more} onClick={loadMore}>
                      {more ? 'Loading…' : `Show ${Math.min(PAGE, total - rows.length)} more of ${total}`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className={`min-h-0 flex-col ${open ? 'flex' : 'hidden lg:flex'}`}>
          {open ? (
            <Reader id={open} canManage={canManage} words={words} onBack={close} onGone={gone} />
          ) : (
            <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-3 px-6 py-10">
              <FileSearch className="h-6 w-6 text-neutral-700" strokeWidth={1.5} />
              <p className="max-w-sm text-center text-[13px] font-normal leading-relaxed text-neutral-400">
                {total > 0
                  ? `${total.toLocaleString()} transcript${total === 1 ? '' : 's'} in this view. Pick one to read it.`
                  : 'Search on the left, then pick a transcript to read it here.'}
              </p>
              <p className="max-w-sm text-center text-[12px] font-normal text-neutral-600">
                Searching jumps you to the matches inside the conversation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
