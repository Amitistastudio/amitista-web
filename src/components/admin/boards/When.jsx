import React from 'react';
import { createPortal } from 'react-dom';
import {
  BellRing,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  X,
} from 'lucide-react';
import { Button } from '../ui';
import { DUE_TONE } from './shared';
import {
  TIME_CHOICES,
  WHEN_EXAMPLES,
  clock,
  dayWords,
  gapWords,
  joinWords,
  monthGrid,
  monthWords,
  parseWhen,
  relativeChoices,
  sameDay,
  startOfDay,
  stepWords,
  timeWords,
  weekdayNames,
  withTime,
} from './when';

const DAYS = weekdayNames();

function toneOf(at, now, done) {
  if (!Number.isFinite(at)) return 'calm';
  if (done) return 'done';
  if (at < now) return 'late';
  if (at - now < 48 * 3600000) return 'soon';
  return 'calm';
}

function faceOf(at) {
  const day = new Date(at);
  return { year: day.getFullYear(), month: day.getMonth() };
}

function Grid({ month, picked, now, onPick, onChoose, onMonth }) {
  const cells = React.useMemo(() => monthGrid(month.year, month.month), [month.year, month.month]);
  const stamp = new Date(Number.isFinite(picked) ? picked : withTime(now, 18, 0));
  const hour = stamp.getHours();
  const minute = stamp.getMinutes();
  const spots = React.useRef(new Map());
  const [wanted, setWanted] = React.useState(null);

  React.useEffect(() => {
    if (wanted === null) return;
    const node = spots.current.get(wanted);
    if (!node) return;
    node.focus();
    setWanted(null);
  }, [wanted, cells]);

  const walk = (event) => {
    const jump = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      PageUp: -28,
      PageDown: 28,
    }[event.key];
    if (!jump) return;
    const from = Number(event.target.dataset.at);
    if (!Number.isFinite(from)) return;
    event.preventDefault();
    const next = startOfDay(from + jump * 86400000 + 43200000);
    onPick(next);
    const node = spots.current.get(next);
    if (node) {
      node.focus();
      return;
    }
    onMonth(faceOf(next));
    setWanted(next);
  };

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-px">
        {DAYS.map((name) => (
          <span
            key={name}
            aria-hidden="true"
            className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-neutral-600"
          >
            {name.slice(0, 2)}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px" onKeyDown={walk}>
        {cells.map((cell) => {
          const chosen = Number.isFinite(picked) && sameDay(cell.at, picked);
          const today = sameDay(cell.at, now);
          const gone = cell.at < startOfDay(now);
          return (
            <button
              key={cell.at}
              type="button"
              data-at={cell.at}
              data-day={cell.inside ? cell.day : ''}
              aria-pressed={chosen}
              aria-label={new Date(cell.at).toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              ref={(node) => {
                if (node) spots.current.set(cell.at, node);
                else spots.current.delete(cell.at);
              }}
              title={`Set it to ${clock(withTime(cell.at, hour, minute))}`}
              onClick={() => onChoose(cell.at)}
              className={`relative h-8 text-[12px] tabular-nums outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-purple-400 ${
                chosen
                  ? 'bg-purple-500/25 font-semibold text-white ring-1 ring-inset ring-purple-400/70'
                  : cell.inside
                    ? `font-normal hover:bg-[#1c1c22] ${gone ? 'text-neutral-600' : 'text-neutral-300'}`
                    : 'font-normal text-neutral-700 hover:bg-[#141419]'
              }`}
            >
              {cell.day}
              {today && !chosen && (
                <span className="absolute inset-x-[38%] bottom-1 h-[2px] bg-purple-400/80" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Strip({ children, flat }) {
  return (
    <h4
      className={`${
        flat ? '' : 'mb-1.5 '
      }text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500`}
    >
      {children}
    </h4>
  );
}

function TimeBox({ at, onSet }) {
  const [text, setText] = React.useState(() => timeWords(at));

  React.useEffect(() => {
    setText(timeWords(at));
  }, [at]);

  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={5}
      spellCheck={false}
      aria-label="Some other time"
      value={text}
      onChange={(event) => {
        const raw = event.target.value.replace(/[^\d:]/g, '').slice(0, 5);
        setText(raw);
        const found = /^(\d{1,2}):(\d{2})$/.exec(raw);
        if (!found) return;
        const hour = Number(found[1]);
        const minute = Number(found[2]);
        if (hour > 23 || minute > 59) return;
        onSet(hour, minute);
      }}
      onBlur={() => setText(timeWords(at))}
      className="w-[54px] border border-[#282832] bg-[#111115] px-2 py-1 text-center text-[11px] tabular-nums text-neutral-300 outline-none transition-colors focus:border-purple-500/60"
    />
  );
}

export function Picker({ anchor, value, now, remind, assigned, onClose, onChange }) {
  const frame = React.useRef(null);
  const [box, setBox] = React.useState(null);
  const [typed, setTyped] = React.useState('');
  const start = Date.parse(value ?? '');
  const [draft, setDraft] = React.useState(() =>
    Number.isFinite(start) ? start : withTime(now + 86400000, 18, 0),
  );
  const [month, setMonth] = React.useState(() => faceOf(Number.isFinite(start) ? start : now));

  const kept = new Date(draft);
  const read = typed.trim()
    ? parseWhen(typed, now, { hour: kept.getHours(), minute: kept.getMinutes() })
    : null;
  const shown = read ? read.at : draft;
  const face = new Date(shown);

  const readAt = read ? read.at : null;
  React.useEffect(() => {
    if (readAt === null) return;
    const face = faceOf(readAt);
    setMonth((was) => (was.year === face.year && was.month === face.month ? was : face));
  }, [readAt]);

  const place = React.useCallback(() => {
    const spot = anchor.current?.getBoundingClientRect();
    if (!spot) return;
    const width = Math.min(324, window.innerWidth - 16);
    const height = frame.current?.offsetHeight ?? 460;
    const left = Math.max(8, Math.min(spot.left, window.innerWidth - width - 8));
    const below = spot.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, spot.top - height - 6) : below;
    setBox({ left, top, width });
  }, [anchor]);

  React.useLayoutEffect(place, [place, typed, month, shown]);

  React.useEffect(() => {
    function away(event) {
      if (frame.current?.contains(event.target)) return;
      if (anchor.current?.contains(event.target)) return;
      onClose();
    }
    function key(event) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      onClose();
    }
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, onClose, place]);

  if (typeof document === 'undefined') return null;

  const settle = (at) => {
    onChange(new Date(at).toISOString());
    onClose();
  };

  const move = (at) => {
    setTyped('');
    setDraft(withTime(at, face.getHours(), face.getMinutes()));
  };

  const choose = (at) => {
    settle(withTime(at, face.getHours(), face.getMinutes()));
  };

  const retime = (hour, minute) => {
    setTyped('');
    setDraft(withTime(shown, hour, minute));
  };

  const ladder = remind?.on
    ? [
        ...(remind.lead ?? []).map((step) => `${stepWords(step)} before`),
        ...(remind.late ?? []).map((step) => `${stepWords(step)} after`),
      ]
    : [];

  return createPortal(
    <div
      ref={frame}
      role="dialog"
      aria-label="Pick a due date"
      style={box ? { left: box.left, top: box.top, width: box.width } : { opacity: 0, top: 0, left: 0 }}
      className="quiet-scroll fixed z-[110] max-h-[calc(100vh-16px)] overflow-y-auto border border-[#3a3a46] bg-[#0a0a0d] shadow-2xl"
    >
      <div className="border-b border-[#17171d] p-3">
        <Strip>Say it in words</Strip>
        <input
          autoFocus
          value={typed}
          maxLength={60}
          spellCheck={false}
          aria-label="Say when, in your own words"
          placeholder="tomorrow 6pm · in 2 days · fri 09:00"
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (read) settle(read.at);
          }}
          className="w-full border border-[#282832] bg-[#111115] px-3 py-2 text-[13px] text-white placeholder-neutral-600 outline-none transition-colors focus:border-purple-500/60"
        />
        {typed.trim() && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] font-normal leading-snug">
            {read ? (
              <>
                <CornerDownLeft className="mt-[2px] h-3 w-3 shrink-0 text-purple-300" strokeWidth={2} />
                <span className="text-neutral-400">
                  Press Enter for <span className="text-neutral-200">{clock(read.at)}</span>
                </span>
              </>
            ) : (
              <span className="text-amber-300/90">
                Not sure what that means. Try {WHEN_EXAMPLES.slice(0, 3).join(', ')} — or pick a day
                below.
              </span>
            )}
          </p>
        )}
      </div>

      <div className="border-b border-[#17171d] px-3 py-2.5">
        <Strip>Or take one of these</Strip>
        <div className="flex flex-wrap gap-1.5">
          {relativeChoices(now).map((choice) => (
            <button
              key={choice.label}
              type="button"
              title={clock(choice.at)}
              onClick={() => settle(choice.at)}
              className="border border-[#282832] bg-[#111115] px-2 py-1 text-[11px] font-medium text-neutral-400 transition-colors hover:border-[#3f3f4c] hover:text-neutral-100"
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-[#17171d] px-3 py-2.5">
        <Strip>At what time</Strip>
        <div className="flex flex-wrap items-center gap-1.5">
          {TIME_CHOICES.map((choice) => {
            const on = face.getHours() === choice.hour && face.getMinutes() === choice.minute;
            return (
              <button
                key={choice.label}
                type="button"
                aria-pressed={on}
                onClick={() => retime(choice.hour, choice.minute)}
                className={`border px-2 py-1 text-[11px] tabular-nums transition-colors ${
                  on
                    ? 'border-purple-400/70 bg-purple-500/20 font-semibold text-white'
                    : 'border-[#282832] bg-[#111115] font-medium text-neutral-400 hover:border-[#3f3f4c] hover:text-neutral-100'
                }`}
              >
                {choice.label}
              </button>
            );
          })}
          <span className="pl-0.5 text-[11px] font-normal text-neutral-600">or</span>
          <TimeBox at={shown} onSet={retime} />
        </div>
      </div>

      <div className="px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <Strip flat>Click a day to set it</Strip>
          <span className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="The month before"
              onClick={() => setMonth(faceOf(new Date(month.year, month.month - 1, 1).getTime()))}
              className="p-1 text-neutral-500 transition-colors hover:text-neutral-100"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            <span className="min-w-[62px] text-center text-[11px] font-semibold text-neutral-200">
              {monthWords(month.year, month.month)}
            </span>
            <button
              type="button"
              aria-label="The month after"
              onClick={() => setMonth(faceOf(new Date(month.year, month.month + 1, 1).getTime()))}
              className="p-1 text-neutral-500 transition-colors hover:text-neutral-100"
            >
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </span>
        </div>
        <Grid month={month} picked={shown} now={now} onPick={move} onChoose={choose} onMonth={setMonth} />
      </div>

      <div className="border-t border-[#17171d] px-3 py-2.5">
        <p className="text-[12px] font-semibold text-white">
          {clock(shown)} <span className="font-normal text-neutral-500">· {gapWords(shown, now)}</span>
        </p>
        {ladder.length > 0 && (
          <p className="mt-1 flex items-start gap-2 text-[11px] font-normal leading-snug text-neutral-500">
            <BellRing className="mt-[2px] h-3 w-3 shrink-0 text-purple-300/70" strokeWidth={2} />
            <span>
              DMs {joinWords(ladder.slice(0, 3))}
              {ladder.length > 3 ? ` and ${ladder.length - 3} more` : ''}.
              {remind.who === 'assignees' && !assigned
                ? ' Nobody is on this card, so nobody would hear about it.'
                : ''}
            </span>
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[#282832] px-3 py-2.5">
        <button
          type="button"
          onClick={() => {
            onChange('');
            onClose();
          }}
          className="text-[11px] font-medium text-neutral-500 transition-colors hover:text-rose-300"
        >
          No due date
        </button>
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-medium text-neutral-500 transition-colors hover:text-neutral-200"
          >
            Cancel
          </button>
          <Button type="button" tone="solid" className="px-3 py-1.5" onClick={() => settle(shown)}>
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            Set it
          </Button>
        </span>
      </div>
    </div>,
    document.body,
  );
}

export default function WhenField({ value, now, disabled, done, remind, assigned, onChange }) {
  const [open, setOpen] = React.useState(false);
  const anchor = React.useRef(null);
  const at = Date.parse(value ?? '');
  const set = Number.isFinite(at);
  const tone = toneOf(at, now, done);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-label={set ? `Due ${clock(at)} — change it` : 'Add a due date'}
        onClick={() => setOpen((was) => !was)}
        className={`flex w-full items-center gap-2.5 border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          set
            ? `${DUE_TONE[tone]} hover:brightness-125`
            : 'border-dashed border-[#3a3a46] bg-[#0a0a0d] text-neutral-500 hover:border-[#4a4a58] hover:text-neutral-300'
        }`}
      >
        {set ? (
          <CalendarClock className="h-4 w-4 shrink-0" strokeWidth={2} />
        ) : (
          <CalendarPlus className="h-4 w-4 shrink-0" strokeWidth={2} />
        )}
        {set ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight">
              {dayWords(at, now)}, {timeWords(at)}
            </span>
            <span className="mt-0.5 block truncate text-[11px] font-normal leading-tight opacity-80">
              {done ? 'finished' : gapWords(at, now)}
            </span>
          </span>
        ) : (
          <span className="flex-1 text-[12px] font-medium">Add a due date</span>
        )}
        {set && !disabled && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear the due date"
            onClick={(event) => {
              event.stopPropagation();
              onChange('');
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.stopPropagation();
              onChange('');
            }}
            className="-mr-1 shrink-0 p-1 opacity-50 transition-opacity hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        )}
      </button>
      {open && !disabled && (
        <Picker
          anchor={anchor}
          value={value}
          now={now}
          remind={remind}
          assigned={assigned}
          onClose={() => setOpen(false)}
          onChange={onChange}
        />
      )}
    </>
  );
}
