import React from 'react';
import { createPortal } from 'react-dom';
import { Check, CloudUpload, Globe, Loader2, Lock, LockKeyhole, Save, Undo2, X } from 'lucide-react';
import { BOARD_COLOUR, boardArtUrl } from '../../../lib/admin';
import { startOfDay as dayStart, timeWords } from './when';
import { faceSource, noFace } from './faces';

export const SEEN_BY = [
  {
    id: 'private',
    icon: Lock,
    title: 'Private',
    short: 'Private',
    body: 'Only the people on it. Panel owners and anyone holding Manage boards can still open it.',
  },
  {
    id: 'team',
    icon: Globe,
    title: 'Team-wide',
    short: 'Team-wide',
    body: 'Everyone with board access can open it and move cards. Put someone on it as read-only to hold them to reading.',
  },
  {
    id: 'sealed',
    icon: LockKeyhole,
    title: 'Sealed',
    short: 'Sealed',
    body: 'Only the people on it, and nobody else at all — other panel owners and Manage boards holders cannot see it, open it or find it in the audit log by name.',
  },
];

export function seenBy(visibility) {
  return SEEN_BY.find((entry) => entry.id === visibility) ?? SEEN_BY[0];
}

export function seenChoices(allowed, current) {
  const kept = Array.isArray(allowed) && allowed.length ? allowed : SEEN_BY.map((entry) => entry.id);
  return SEEN_BY.filter((entry) => kept.includes(entry.id) || entry.id === current);
}

export function keyholderLine(keyholders) {
  const named = (keyholders ?? []).filter(Boolean);
  if (!named.length) return 'Nobody is set up as a keyholder, so a sealed board is reachable only by the people on it.';
  const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
  return `One exception: ${list} can open every board, sealed ones included.`;
}

export function shade(colour) {
  return BOARD_COLOUR[colour] ?? BOARD_COLOUR.purple;
}

export function initials(name) {
  const cleaned = String(name ?? '').trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

export function tally(board, you, now = Date.now()) {
  const cards = Object.values(board?.cards ?? {});
  const live = cards.filter((card) => !card.archived);
  const overdue = live.filter((card) => {
    const at = Date.parse(card.due ?? '');
    return !card.done && Number.isFinite(at) && at < now;
  });
  return {
    lists: (board?.lists ?? []).length,
    cards: live.length,
    done: live.filter((card) => card.done).length,
    archived: cards.length - live.length,
    overdue: overdue.length,
    mine: live.filter((card) => !card.done && (card.assignees ?? []).includes(you)).length,
  };
}

export function plural(count, one) {
  return `${count} ${count === 1 ? one : `${one}s`}`;
}

export function whenShort(stamp) {
  const at = Date.parse(stamp ?? '');
  if (!Number.isFinite(at)) return '';
  const date = new Date(at);
  const day = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (date.getHours() === 0 && date.getMinutes() === 0) return day;
  return `${day} ${timeWords(at)}`;
}

export function ago(stamp, now) {
  const then = typeof stamp === 'number' ? stamp : Date.parse(stamp ?? '');
  if (!Number.isFinite(then)) return '';
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function dueState(card, now) {
  const at = Date.parse(card?.due ?? '');
  if (!Number.isFinite(at)) return null;
  const label = whenShort(card.due);
  if (card.done) return { tone: 'done', label };
  if (at < now) return { tone: 'late', label };
  if (at - now < 48 * 3600000) return { tone: 'soon', label };
  return { tone: 'calm', label };
}

export const DUE_TONE = {
  late: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  soon: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  calm: 'border-[#282832] bg-[#0a0a0d] text-neutral-400',
  done: 'border-[#282832] bg-[#0a0a0d] text-neutral-500 line-through',
};

export function startOfDay(at) {
  return new Date(dayStart(at));
}

export function dueChoices(now = Date.now()) {
  const evening = startOfDay(now);
  evening.setHours(18, 0, 0, 0);
  const tomorrow = new Date(evening);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const week = new Date(evening);
  week.setDate(week.getDate() + 7);
  return [
    { label: 'Today', iso: (evening.getTime() > now ? evening : new Date(now + 3600000)).toISOString() },
    { label: 'Tomorrow', iso: tomorrow.toISOString() },
    { label: 'Next week', iso: week.toISOString() },
  ];
}

export const WORK_GROUPS = [
  { id: 'overdue', label: 'Overdue', tone: 'rose' },
  { id: 'today', label: 'Today', tone: 'amber' },
  { id: 'week', label: 'This week', tone: 'neutral' },
  { id: 'later', label: 'Later', tone: 'neutral' },
  { id: 'undated', label: 'No date', tone: 'neutral' },
];

export function groupWork(work, now = Date.now()) {
  const midnight = startOfDay(now).getTime();
  const tonight = midnight + 86400000;
  const week = midnight + 7 * 86400000;
  const out = Object.fromEntries(WORK_GROUPS.map((group) => [group.id, []]));
  (work ?? []).forEach((entry) => {
    const at = Date.parse(entry.card?.due ?? '');
    if (!Number.isFinite(at)) out.undated.push(entry);
    else if (at < now) out.overdue.push(entry);
    else if (at < tonight) out.today.push(entry);
    else if (at < week) out.week.push(entry);
    else out.later.push(entry);
  });
  return out;
}

const LIVE_TONE = {
  live: ['bg-emerald-400', 'text-neutral-500'],
  fresh: ['bg-emerald-400', 'text-emerald-300'],
  paused: ['bg-neutral-600', 'text-neutral-600'],
  lost: ['bg-amber-400', 'text-amber-300'],
};

const LIVE_HINT = {
  live: 'Changes other people make show up here on their own — nothing to refresh.',
  fresh: 'Somebody just changed something, and the board caught up.',
  paused: 'Held while this tab is in the background. It catches up the moment you come back.',
  lost: 'The panel cannot reach the server. It keeps trying.',
};

export function Live({ state, beat }) {
  const [fresh, setFresh] = React.useState(false);

  React.useEffect(() => {
    if (!beat) return undefined;
    setFresh(true);
    const timer = setTimeout(() => setFresh(false), 4000);
    return () => clearTimeout(timer);
  }, [beat]);

  const mood = state === 'live' && fresh ? 'fresh' : state;
  const [dot, text] = LIVE_TONE[mood] ?? LIVE_TONE.live;
  const label =
    mood === 'fresh'
      ? 'Just updated'
      : mood === 'paused'
        ? 'Paused'
        : mood === 'lost'
          ? 'Reconnecting'
          : 'Live';

  return (
    <span
      title={LIVE_HINT[mood]}
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide transition-colors ${text}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {mood !== 'paused' && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dot}`} />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dot}`} />
      </span>
      {label}
    </span>
  );
}

const SAVE_TONE = {
  dirty: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  saving: 'border-[#282832] bg-[#0a0a0d] text-neutral-400',
  saved: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  failed: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
};

export function SaveMark({ state, at, onSave, disabled, now = Date.now() }) {
  const mood = state === 'rest' ? null : state;
  if (!mood) return null;
  const label =
    mood === 'dirty'
      ? 'Not saved yet'
      : mood === 'saving'
        ? 'Saving…'
        : mood === 'failed'
          ? 'That did not save'
          : `Saved ${ago(at, now)}`;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 border px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.12em] ${SAVE_TONE[mood]}`}
      >
        {mood === 'saving' ? (
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
        ) : mood === 'saved' ? (
          <Check className="h-3 w-3" strokeWidth={2.5} />
        ) : (
          <CloudUpload className="h-3 w-3" strokeWidth={2} />
        )}
        {label}
      </span>
      {(mood === 'dirty' || mood === 'failed') && (
        <button
          type="button"
          disabled={disabled}
          onClick={onSave}
          className="inline-flex items-center gap-1.5 border border-purple-500/50 bg-purple-500/15 px-2.5 py-[3px] text-[11px] font-semibold tracking-wide text-purple-100 transition-colors hover:bg-purple-500/25 disabled:opacity-40"
        >
          <Save className="h-3 w-3" strokeWidth={2} />
          Save now
        </button>
      )}
    </span>
  );
}

export function UndoBar({ what, onUndo, onClose, seconds = 10, busy }) {
  const [left, setLeft] = React.useState(seconds);
  const shut = React.useRef(onClose);

  React.useEffect(() => {
    shut.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    setLeft(seconds);
    const tick = window.setInterval(() => {
      setLeft((held) => {
        if (held <= 1) {
          window.clearInterval(tick);
          shut.current?.();
          return 0;
        }
        return held - 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [what, seconds]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      className="fixed inset-x-0 bottom-6 z-[95] flex justify-center px-4"
    >
      <div className="flex max-w-full items-center gap-3 border border-[#282832] bg-[#111115] px-4 py-2.5 shadow-2xl">
        <span className="min-w-0 truncate text-[12px] font-normal text-neutral-300">{what}</span>
        <button
          type="button"
          disabled={busy}
          onClick={onUndo}
          className="inline-flex shrink-0 items-center gap-1.5 border border-[#3f3f4c] px-2.5 py-1 text-[11px] font-semibold tracking-wide text-neutral-100 transition-colors hover:border-purple-500/60 hover:text-white disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" strokeWidth={2} />
          Undo
        </button>
        <span className="shrink-0 text-[11px] tabular-nums text-neutral-600">{left}s</span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => shut.current?.()}
          className="shrink-0 text-neutral-600 transition-colors hover:text-neutral-200"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function Progress({ done, total, tone = 'bg-emerald-500/70' }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1 flex-1 bg-[#1c1c22]">
        <span className={`block h-full ${tone}`} style={{ width: `${percent}%` }} />
      </span>
      <span className="text-[10px] tabular-nums text-neutral-600">{percent}%</span>
    </span>
  );
}

export function Chip({ active, onClick, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] font-semibold tracking-wide transition-colors ${
        active
          ? 'border-purple-500/50 bg-purple-500/15 text-white'
          : 'border-[#282832] bg-[#0a0a0d] text-neutral-400 hover:text-neutral-200'
      }`}
    >
      {children}
    </button>
  );
}

export function PointerMenu({ at, onClose, children }) {
  const frame = React.useRef(null);
  const [box, setBox] = React.useState(null);

  React.useLayoutEffect(() => {
    if (!frame.current) return;
    setBox({ width: frame.current.offsetWidth, height: frame.current.offsetHeight });
  }, [children]);

  React.useEffect(() => {
    function away(event) {
      if (!frame.current?.contains(event.target)) onClose();
    }
    function key(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  if (typeof document === 'undefined' || !at) return null;

  const width = box?.width ?? 208;
  const height = box?.height ?? 260;
  const left = Math.max(8, Math.min(at.x, window.innerWidth - width - 8));
  const top = at.y + height > window.innerHeight - 8 ? Math.max(8, at.y - height) : at.y;

  return createPortal(
    <span
      ref={frame}
      role="menu"
      onClick={onClose}
      style={{ left, top }}
      className="fixed z-[90] flex w-52 flex-col border border-[#282832] bg-[#0a0a0d] py-1 shadow-2xl"
    >
      {children}
    </span>,
    document.body,
  );
}

export function Menu({ label, icon: Icon, children, align = 'right', className = '' }) {
  const [open, setOpen] = React.useState(false);
  const holder = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    function away(event) {
      if (!holder.current?.contains(event.target)) setOpen(false);
    }
    function key(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <span ref={holder} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((held) => !held)}
        className="p-1 text-neutral-600 transition-colors hover:text-neutral-200"
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </button>
      {open && (
        <span
          role="menu"
          onClick={() => setOpen(false)}
          className={`absolute top-full z-30 mt-1 flex w-52 flex-col border border-[#282832] bg-[#0a0a0d] py-1 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </span>
      )}
    </span>
  );
}

export const CAP_MAX = 99;

export function loadOf(board, column) {
  return (column?.cards ?? []).filter((id) => board.cards[id] && !board.cards[id].archived).length;
}

export function capOf(column, archived) {
  if (archived) return 0;
  const held = Number(column?.cap);
  return Number.isFinite(held) && held > 0 ? held : 0;
}

export function MenuItem({ onClick, icon: Icon, children, danger, disabled }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2 text-left text-[12px] font-medium transition-colors disabled:opacity-40 ${
        danger ? 'text-rose-300 hover:bg-rose-500/10' : 'text-neutral-300 hover:bg-[#141419]'
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
      {children}
    </button>
  );
}

const MARK_SIZE = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-[13px]',
  lg: 'h-14 w-14 text-[15px]',
};

export function focusOf(held) {
  const spot = held?.focus;
  const x = typeof spot?.x === 'number' ? spot.x : 50;
  const y = typeof spot?.y === 'number' ? spot.y : 50;
  return `${Math.max(0, Math.min(100, x))}% ${Math.max(0, Math.min(100, y))}%`;
}

export function BoardMark({ board, size = 'md', className = '' }) {
  const box = MARK_SIZE[size] ?? MARK_SIZE.md;
  const logo = board?.art?.logo;
  if (logo && board?.id) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-[#282832] bg-[#111115] ${box} ${className}`}
      >
        <img
          src={boardArtUrl(board.id, 'logo', logo.hash)}
          alt=""
          loading="lazy"
          style={{ objectPosition: focusOf(logo) }}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-semibold text-black/70 ${
        shade(board?.colour).stripe
      } ${box} ${className}`}
    >
      {initials(board?.name)}
    </span>
  );
}

export function BoardBanner({ board, className = 'h-24' }) {
  const banner = board?.art?.banner;
  if (!banner || !board?.id) return null;
  return (
    <span className={`relative block w-full overflow-hidden bg-[#111115] ${className}`}>
      <img
        src={boardArtUrl(board.id, 'banner', banner.hash)}
        alt=""
        loading="lazy"
        style={{ objectPosition: focusOf(banner) }}
        className="h-full w-full object-cover"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-[#0a0a0d] via-[#0a0a0d]/30 to-transparent" />
    </span>
  );
}

export function isGeneral(generals, name) {
  return (generals ?? []).some((entry) => entry.toLowerCase() === String(name ?? '').toLowerCase());
}

export function GeneralTag({ short, className = '' }) {
  return (
    <span
      title="General owner — they hold the owner role on the panel itself"
      className={`inline-flex items-center border border-amber-300/35 bg-amber-400/10 px-1.5 py-[2px] text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200 ${className}`}
    >
      {short ? 'General' : 'General owner'}
    </span>
  );
}

function CrownMark({ className }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" className={className}>
      <path d="M3 15.4 1.9 6.6 6.9 10.3 10 4.4 13.1 10.3 18.1 6.6 17 15.4Z" />
      <circle cx="1.9" cy="5.2" r="1.55" />
      <circle cx="10" cy="3.1" r="1.75" />
      <circle cx="18.1" cy="5.2" r="1.55" />
      <rect x="2.5" y="14.9" width="15" height="3.2" rx="1" />
    </svg>
  );
}

export function Avatar({ name, size = 'sm', crowned }) {
  const box = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-[11px]';
  const [source, setSource] = React.useState(() => faceSource(name));

  React.useEffect(() => {
    setSource(faceSource(name));
  }, [name]);

  const face = (
    <span
      className={`inline-flex h-full w-full items-center justify-center overflow-hidden rounded-full border bg-[#111115] font-semibold ${
        crowned ? 'border-amber-300/70 text-amber-100' : 'border-[#282832] text-neutral-300'
      }`}
    >
      {source ? (
        <img
          src={source}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => {
            noFace(name);
            setSource(null);
          }}
        />
      ) : (
        initials(name)
      )}
    </span>
  );

  if (!crowned) {
    return (
      <span title={name} className={`relative inline-flex shrink-0 ${box}`}>
        {face}
      </span>
    );
  }

  return (
    <span title={`${name} — general owner`} className={`relative inline-flex shrink-0 ${box}`}>
      {face}
      <CrownMark
        className={`absolute -rotate-[22deg] text-amber-300 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.9))] ${
          size === 'sm' ? '-left-[5px] -top-[4px] h-3 w-3' : '-left-[7px] -top-[5px] h-[15px] w-[15px]'
        }`}
      />
    </span>
  );
}

const STACK = [];

export function useTopEscape(onClose) {
  const shut = React.useRef(onClose);

  React.useEffect(() => {
    shut.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    const token = {};
    STACK.push(token);
    function key(event) {
      if (event.key !== 'Escape') return;
      if (STACK[STACK.length - 1] !== token) return;
      event.stopPropagation();
      shut.current?.();
    }
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      const at = STACK.indexOf(token);
      if (at >= 0) STACK.splice(at, 1);
    };
  }, []);
}

export function Dialog({ title, onClose, children, footer, wide }) {
  const frame = React.useRef(null);
  const shut = React.useRef(onClose);
  const mine = React.useRef({});

  React.useEffect(() => {
    shut.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    const token = mine.current;
    STACK.push(token);
    function key(event) {
      if (event.key !== 'Escape') return;
      if (STACK[STACK.length - 1] !== token) return;
      shut.current?.();
    }
    document.addEventListener('keydown', key);
    const held = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    frame.current?.focus();
    return () => {
      document.removeEventListener('keydown', key);
      const at = STACK.indexOf(token);
      if (at >= 0) STACK.splice(at, 1);
      if (!STACK.length) document.body.style.overflow = held;
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="quiet-scroll fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-10"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={frame}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full border border-[#282832] bg-[#0a0a0d] focus:outline-none ${
          wide ? 'max-w-4xl' : 'max-w-2xl'
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#282832] px-4 sm:px-6 py-4">
          <h2 className="min-w-0 text-[13px] font-semibold tracking-wide text-neutral-200">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-neutral-500 transition-colors hover:text-neutral-200"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="px-4 sm:px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#282832] px-4 sm:px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
