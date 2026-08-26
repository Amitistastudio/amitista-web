import React from 'react';
import {
  Archive,
  ArchiveRestore,
  BellRing,
  CalendarClock,
  Check,
  Copy,
  Link2,
  Palette,
  Pencil,
  Plus,
  Send,
  SquareKanban,
  Tag,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';
import {
  Button,
  Check as Tick,
  Empty,
  Field,
  Notice,
  Pill,
  Select,
  SubNav,
  TextInput,
} from '../ui';
import { Confirm } from '../api/shared';
import {
  BoardMark,
  Progress,
  SaveMark,
  ago,
  keyholderLine,
  plural,
  seenBy,
  seenChoices,
  shade,
  tally,
  whenShort,
} from './shared';
import { useDraft } from './draft';
import { UNITS, clock, sortSteps, stepSeconds, stepWords } from './when';
import { FactSheet, PurposeMark, PurposePicker } from './Purpose';
import { factFields, purposeOf, strayFacts } from './facts';
import { sizeWords } from './files';
import ArtField from './Art';
import People from './People';
import { deleteBoard, testBoardReminder, updateBoard } from '../../../lib/admin';

const COLOURS = ['purple', 'sky', 'emerald', 'amber', 'rose', 'slate'];

const TABS = [
  { id: 'board', label: 'Board', icon: SquareKanban },
  { id: 'people', label: 'People', icon: Users },
  { id: 'remind', label: 'Reminders', icon: BellRing },
  { id: 'look', label: 'Look', icon: Palette },
  { id: 'labels', label: 'Labels', icon: Tag },
  { id: 'danger', label: 'Danger', icon: TriangleAlert },
];

const QUICK = {
  lead: ['1w', '2d', '1d', '3h', '1h', '15m'],
  late: ['15m', '1h', '1d', '3d'],
};

const WHO = [
  { id: 'assignees', short: 'the people on the card', title: 'The people on the card' },
  { id: 'board', short: 'everyone on the board', title: 'Everyone on the board' },
  { id: 'owners', short: 'the board owners', title: 'The board owners' },
  { id: 'people', short: 'people you pick', title: 'People you pick' },
];

const NAMES_SHOWN = 3;

const EVENTS = [
  {
    id: 'assigned',
    label: 'Someone is put on a card',
    short: 'someone is put on a card',
    hint: 'The people just added, and nobody else — this one cannot be pointed anywhere.',
    fixed: 'the people just added',
  },
  {
    id: 'comment',
    label: 'A card gets a comment',
    short: 'a card gets a comment',
    hint: 'Carries the comment itself.',
  },
  {
    id: 'moved',
    label: 'A card moves column',
    short: 'a card moves column',
    hint: 'Says which column it came from.',
  },
  {
    id: 'done',
    label: 'A card is finished',
    short: 'a card is finished',
    hint: 'The tick, however it was ticked.',
  },
];

const aimOf = (setup, thing) => setup.goes?.[thing] ?? setup.who;

function names(list) {
  if (list.length === 0) return 'nobody';
  if (list.length > NAMES_SHOWN) {
    return `${list.slice(0, NAMES_SHOWN).join(', ')} and ${list.length - NAMES_SHOWN} more`;
  }
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

const whoWords = (who) =>
  Array.isArray(who) ? names(who) : (WHO.find((choice) => choice.id === who)?.short ?? who);

function Goes({ thing, setup, picking, disabled, label, onPick }) {
  const held = aimOf(setup, thing);
  const listed = Array.isArray(held);
  return (
    <label className="flex shrink-0 items-center gap-2">
      <span className="text-[11px] font-normal text-neutral-500 sm:hidden">goes to</span>
      <select
        value={listed || picking ? 'people' : held}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onPick(event.target.value)}
        className="min-w-[190px] border border-[#3a3a46] bg-[#15151b] px-2.5 py-1.5 text-[12px] font-medium text-neutral-100 outline-none transition-colors hover:border-[#4a4a58] focus:border-purple-500/60 disabled:opacity-60"
      >
        {WHO.filter((choice) => choice.id !== 'people').map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.short}
          </option>
        ))}
        <option value="people">{listed ? whoWords(held) : 'people you pick…'}</option>
      </select>
    </label>
  );
}

function Crowd({ people, picked, disabled, locked, label, onToggle }) {
  const known = [...people, ...picked.filter((name) => !people.includes(name))];
  if (known.length === 0) {
    return (
      <p className="mt-2 text-[11px] font-normal text-neutral-600">
        Nobody is on this board to pick yet — put people on it under the People tab.
      </p>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {known.map((name) => {
        const on = picked.includes(name);
        const gone = !people.includes(name);
        return (
          <button
            key={name}
            type="button"
            disabled={disabled || (locked && on)}
            aria-pressed={on}
            title={gone ? 'Not on this board any more — they hear nothing' : undefined}
            onClick={() => onToggle(name)}
            className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[12px] font-medium transition-colors disabled:opacity-60 ${
              on
                ? 'border-purple-500/60 bg-purple-500/10 text-purple-200'
                : 'border-[#282832] bg-[#111115] text-neutral-400 hover:border-[#3f3f4c] hover:text-neutral-200'
            } ${gone ? 'line-through' : ''}`}
          >
            {on && <Check className="h-3 w-3" strokeWidth={3} />}
            {name}
          </button>
        );
      })}
      {picked.length === 0 && (
        <span className="text-[11px] font-normal text-amber-300/80">
          Pick at least one, or it keeps going where it went before.
        </span>
      )}
    </div>
  );
}

function queued(board, setup, now) {
  if (!setup.on) return [];
  const rows = [];
  Object.values(board.cards ?? {}).forEach((card) => {
    if (card.archived || card.done || !card.due) return;
    const due = Date.parse(card.due);
    if (Number.isNaN(due)) return;
    const rungs = [
      ...setup.lead.map((step) => ({ step, late: false, at: due - stepSeconds(step) * 1000 })),
      ...setup.late.map((step) => ({ step, late: true, at: due + stepSeconds(step) * 1000 })),
    ];
    rungs
      .filter((rung) => rung.at > now)
      .forEach((rung) => rows.push({ ...rung, card, due }));
  });
  return rows.sort((a, b) => a.at - b.at);
}

function Times({ steps, side, disabled, limit, onChange }) {
  const [open, setOpen] = React.useState(false);
  const [count, setCount] = React.useState('2');
  const [unit, setUnit] = React.useState(side === 'lead' ? 'd' : 'h');
  const full = steps.length >= limit;

  const add = (step) => {
    if (!step || full) return;
    if (steps.some((held) => stepSeconds(held) === stepSeconds(step))) return;
    onChange(sortSteps([...steps, step]));
  };

  const typed = () => {
    const number = Math.floor(Number(count));
    if (!Number.isFinite(number) || number < 1) return;
    add(`${number}${unit}`);
    setCount('2');
  };

  const spare = QUICK[side].filter(
    (step) => !steps.some((held) => stepSeconds(held) === stepSeconds(step)),
  );

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="w-[52px] shrink-0 text-[11px] font-normal text-neutral-500">
        {side === 'lead' ? 'before' : 'after'}
      </span>
      {steps.length === 0 && (
        <span className="text-[11px] font-normal text-neutral-600">nothing yet</span>
      )}
      {steps.map((step) => (
        <span
          key={step}
          className="inline-flex items-center gap-1 border border-[#3a3a46] bg-[#15151b] py-0.5 pl-2 pr-1 text-[12px] font-medium text-neutral-200"
        >
          {stepWords(step)}
          {!disabled && (
            <button
              type="button"
              aria-label={`Drop ${stepWords(step)} ${side === 'lead' ? 'before' : 'after'} it is due`}
              onClick={() => onChange(steps.filter((held) => held !== step))}
              className="p-0.5 text-neutral-600 transition-colors hover:text-rose-400"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          )}
        </span>
      ))}
      {!disabled && !full && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 border border-dashed border-[#3a3a46] px-1.5 py-0.5 text-[11px] font-normal text-neutral-400 transition-colors hover:border-[#4a4a58] hover:text-neutral-100"
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} />
          {open ? 'close' : 'add a time'}
        </button>
      )}
      {full && (
        <span className="text-[11px] font-normal text-amber-300/80">
          that is all {limit} — drop one to add another
        </span>
      )}
      {open && !disabled && !full && (
        <span className="flex w-full flex-wrap items-center gap-1.5 pt-1.5 pl-[52px]">
          {spare.map((step) => (
            <button
              key={step}
              type="button"
              onClick={() => add(step)}
              className="border border-[#282832] px-1.5 py-0.5 text-[11px] font-normal text-neutral-400 transition-colors hover:border-[#3f3f4c] hover:text-neutral-100"
            >
              {stepWords(step)}
            </button>
          ))}
          <span className="inline-block w-[64px]">
            <TextInput
              type="number"
              min="1"
              max="9999"
              value={count}
              aria-label={`How long ${side === 'lead' ? 'before' : 'after'} it is due`}
              onChange={(event) => setCount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.stopPropagation();
                typed();
              }}
            />
          </span>
          <span className="inline-block w-[104px]">
            <Select
              value={unit}
              aria-label="Minutes, hours, days or weeks"
              onChange={(event) => setUnit(event.target.value)}
            >
              {UNITS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </span>
          <Button type="button" onClick={typed}>
            Add
          </Button>
        </span>
      )}
    </span>
  );
}

function Queue({ rows }) {
  if (rows.length === 0) {
    return (
      <p className="text-[12px] font-normal leading-relaxed text-neutral-600">
        Nothing is queued. Reminders need a card with a due date that has not been ticked — give one
        a date and it turns up here.
      </p>
    );
  }
  return (
    <>
      <ul className="divide-y divide-[#17171d] border border-[#282832] bg-[#0a0a0d]">
        {rows.slice(0, 6).map((row) => (
          <li
            key={`${row.card.id}-${row.late ? '+' : '-'}${row.step}`}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-200">
              {row.card.title}
            </span>
            <span
              className={`shrink-0 text-[11px] font-normal ${
                row.late ? 'text-rose-300' : 'text-neutral-500'
              }`}
            >
              {row.late ? `${stepWords(row.step)} overdue` : `${stepWords(row.step)} before`}
            </span>
            <span className="shrink-0 text-[11px] font-normal tabular-nums text-neutral-600">
              {clock(row.at)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] font-normal text-neutral-600">
        {rows.length > 6
          ? `The next 6 of ${rows.length} queued. `
          : `${plural(rows.length, 'reminder')} queued. `}
        Ticking a card, moving its date or finishing it clears the ones it had left.
      </p>
    </>
  );
}

function Swatch({ colour, active, onPick, disabled, size = 'h-7 w-7' }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={colour}
      aria-pressed={active}
      onClick={() => onPick(colour)}
      className={`${size} border transition-transform ${shade(colour).stripe} ${
        active ? 'scale-110 border-white' : 'border-transparent hover:scale-105'
      } disabled:opacity-50`}
    />
  );
}

function CopyChip({ label, text, title, icon: Icon = Copy }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      title={title ?? `Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          setDone(false);
        }
      }}
      className="inline-flex items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-2 py-1 text-[11px] font-normal text-neutral-400 transition-colors hover:border-[#3f3f4c] hover:text-neutral-200"
    >
      {done ? (
        <Check className="h-3 w-3 text-emerald-400" strokeWidth={2.5} />
      ) : (
        <Icon className="h-3 w-3 text-neutral-600" strokeWidth={2} />
      )}
      {done ? 'Copied' : label}
    </button>
  );
}

function Stat({ value, label, tone = 'text-neutral-200' }) {
  return (
    <span className="text-[11px] font-normal text-neutral-600">
      <span className={`text-[12px] font-semibold tabular-nums ${tone}`}>{value}</span> {label}
    </span>
  );
}

function Head({ board, purposes, counts, people, labels }) {
  const seen = seenBy(board.visibility);
  const link =
    typeof window === 'undefined' ? '' : `${window.location.origin}/admin#boards/${board.id}`;
  return (
    <div className="border border-[#282832] bg-[#0a0a0d]">
      <div className="flex flex-wrap items-start gap-3 px-4 py-3.5">
        <BoardMark board={board} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-[15px] font-medium text-white">{board.name}</h3>
            <Pill tone={board.visibility === 'sealed' ? 'purple' : 'neutral'}>{seen.short}</Pill>
            {board.archived && <Pill tone="amber">Archived</Pill>}
            {!board.canWrite && !board.archived && <Pill tone="amber">Read only</Pill>}
          </div>
          <p className="mt-0.5 text-[12px] font-normal leading-relaxed text-neutral-500">
            {board.note || 'No description yet.'}
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-normal text-neutral-500">
          <PurposeMark purposes={purposes} board={board} />
        </span>
      </div>

      <div className="space-y-2.5 border-t border-[#17171d] px-4 py-3">
        <Progress done={counts.done} total={counts.cards} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Stat value={counts.cards} label={counts.cards === 1 ? 'card' : 'cards'} />
          <Stat value={counts.done} label="done" />
          {counts.overdue > 0 && (
            <Stat value={counts.overdue} label="overdue" tone="text-rose-300" />
          )}
          {counts.archived > 0 && (
            <Stat value={counts.archived} label="put away" tone="text-amber-200" />
          )}
          <Stat value={counts.lists} label={counts.lists === 1 ? 'column' : 'columns'} />
          <Stat value={people} label={people === 1 ? 'person' : 'people'} />
          <Stat value={labels} label={labels === 1 ? 'label' : 'labels'} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-normal text-neutral-600">
            {board.createdBy ? `Made by ${board.createdBy} · ` : 'Made '}
            {whenShort(board.created)}
            {board.changedBy
              ? ` · last touched by ${board.changedBy} ${ago(board.changed, Date.now())}`
              : ''}
          </span>
          <CopyChip label="Link" icon={Link2} text={link} title="Copy a link straight to this board" />
          <CopyChip label={board.id} text={board.id} title="Copy the board id" />
        </div>
      </div>
    </div>
  );
}

function LabelRow({ entry, used, can, busy, onSave, onDrop }) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(entry.name);
  const [colour, setColour] = React.useState(entry.colour);

  const open = () => {
    setName(entry.name);
    setColour(entry.colour);
    setEditing(true);
  };

  const keep = () => {
    const cleaned = name.trim();
    setEditing(false);
    if (!cleaned) return;
    if (cleaned === entry.name && colour === entry.colour) return;
    onSave(cleaned, colour);
  };

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <TextInput
          autoFocus
          value={name}
          maxLength={24}
          aria-label={`Rename ${entry.name}`}
          className="max-w-[220px]"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' && event.key !== 'Enter') return;
            event.stopPropagation();
            if (event.key === 'Escape') setEditing(false);
            else keep();
          }}
        />
        <div className="flex gap-1.5">
          {COLOURS.map((entryColour) => (
            <Swatch
              key={entryColour}
              colour={entryColour}
              size="h-5 w-5"
              active={colour === entryColour}
              disabled={busy}
              onPick={setColour}
            />
          ))}
        </div>
        <span className="ml-auto flex items-center gap-2">
          <Button type="button" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="button" tone="solid" disabled={busy || !name.trim()} onClick={keep}>
            Save
          </Button>
        </span>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <span className={`h-3 w-3 shrink-0 ${shade(entry.colour).dot}`} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-200">
        {entry.name}
      </span>
      <span className="shrink-0 text-[11px] font-normal text-neutral-600">
        {used ? `on ${plural(used, 'card')}` : 'on nothing yet'}
      </span>
      {can && (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={`Rename ${entry.name}`}
            disabled={busy}
            onClick={open}
            className="p-1 text-neutral-600 transition-colors hover:text-neutral-200 disabled:opacity-40"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label={`Delete ${entry.name}`}
            title={used ? `Delete it — it comes off ${plural(used, 'card')}` : 'Delete it'}
            disabled={busy}
            onClick={onDrop}
            className="p-1 text-neutral-600 transition-colors hover:text-rose-400 disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </span>
      )}
    </li>
  );
}

export default function Settings({
  board,
  accounts,
  choices,
  you,
  roles,
  limits,
  keyholders,
  purposes,
  generals,
  here,
  sending,
  actions,
  onClose,
  onGone,
}) {
  const [tab, setTab] = React.useState('board');
  const [label, setLabel] = React.useState('');
  const [labelColour, setLabelColour] = React.useState('purple');
  const [tested, setTested] = React.useState(null);
  const can = board.canAdmin;
  const owns = board.seat === 'owner';
  const busy = actions.busy;
  const purpose = purposeOf(purposes, board.purpose);
  const counts = tally(board, you);
  const seated = Object.keys(board.members ?? {}).length;
  const labels = board.labels ?? [];

  const used = React.useMemo(() => {
    const table = {};
    Object.values(board.cards ?? {}).forEach((card) => {
      if (card.archived) return;
      (card.labels ?? []).forEach((id) => {
        table[id] = (table[id] ?? 0) + 1;
      });
    });
    return table;
  }, [board.cards]);

  const weight = React.useMemo(() => {
    let comments = 0;
    let steps = 0;
    let links = 0;
    let files = 0;
    let bytes = 0;
    Object.values(board.cards ?? {}).forEach((card) => {
      comments += (card.comments ?? []).length;
      steps += (card.checklist ?? []).length;
      links += (card.links ?? []).length;
      (card.files ?? []).forEach((entry) => {
        files += 1;
        bytes += entry.bytes ?? 0;
      });
    });
    return { comments, steps, links, files, bytes };
  }, [board.cards]);

  const factKeys = React.useMemo(
    () => [...factFields(purpose).map((field) => field.id), ...strayFacts(purpose, board.facts)],
    [purpose, board.facts],
  );

  const values = React.useMemo(() => {
    const out = { name: board.name, note: board.note ?? '' };
    factKeys.forEach((key) => {
      out[`fact:${key}`] = board.facts?.[key] ?? '';
    });
    return out;
  }, [board.name, board.note, board.facts, factKeys]);

  const clean = React.useCallback((raw) => {
    const out = {};
    const facts = {};
    Object.keys(raw).forEach((key) => {
      if (!key.startsWith('fact:')) {
        out[key] = raw[key];
        return;
      }
      if (typeof raw[key] === 'string') facts[key.slice(5)] = raw[key];
    });
    if ('name' in out) {
      const trimmed = out.name.trim();
      if (!trimmed) delete out.name;
      else out.name = trimmed;
    }
    if (Object.keys(facts).length) out.facts = facts;
    return out;
  }, []);

  const written = useDraft({ values, clean, onSave: (changes) => actions.board.set(changes) });
  const { name, note } = written.draft;

  const facts = React.useMemo(() => {
    const out = {};
    factKeys.forEach((key) => {
      out[key] = written.draft[`fact:${key}`] ?? '';
    });
    return out;
  }, [factKeys, written.draft]);

  const setup = React.useMemo(
    () =>
      board.remind ?? { on: false, lead: [], late: [], who: 'assignees', goes: {}, events: [] },
    [board.remind],
  );
  const steps = setup.lead.length + setup.late.length;
  const rows = React.useMemo(() => queued(board, setup, Date.now()), [board, setup]);
  const aimed = React.useMemo(
    () => ['due', ...EVENTS.filter((entry) => !entry.fixed).map((entry) => entry.id)],
    [],
  );
  const same = React.useMemo(() => {
    const held = aimed.map((thing) => JSON.stringify(aimOf(setup, thing)));
    return held.every((entry) => entry === held[0]) ? aimOf(setup, aimed[0]) : null;
  }, [aimed, setup]);
  const crowd = React.useMemo(
    () => Object.keys(board.members ?? {}).sort((first, second) => first.localeCompare(second)),
    [board.members],
  );
  const [picking, setPicking] = React.useState({});

  const remind = (changes) => actions.board.set({ remind: { ...setup, ...changes } });

  const aim = (thing, picked) => {
    const goes = { ...(setup.goes ?? {}) };
    if (picked) goes[thing] = picked;
    else delete goes[thing];
    remind({ goes });
  };

  const pick = (thing, on) => setPicking((held) => ({ ...held, [thing]: on }));

  const applyAll = (who) => {
    setPicking({});
    remind({ who, goes: {} });
  };

  const chose = (thing, value) => {
    if (value === 'people') {
      pick(thing, true);
      return;
    }
    pick(thing, false);
    if (thing === 'all') {
      applyAll(value);
      return;
    }
    aim(thing, value);
  };

  const toggle = (thing, name) => {
    const held = thing === 'all' ? setup.who : aimOf(setup, thing);
    const was = Array.isArray(held) ? held : [];
    const next = was.includes(name)
      ? was.filter((entry) => entry !== name)
      : [...was, name].sort((first, second) => first.localeCompare(second));
    if (next.length === 0) return;
    if (thing === 'all') {
      applyAll(next);
      return;
    }
    aim(thing, next);
  };

  const held = (thing) => (thing === 'all' ? setup.who : aimOf(setup, thing));

  const showing = (thing) => Array.isArray(held(thing)) || picking[thing] === true;

  const shown = TABS.filter((entry) => entry.id !== 'danger' || owns);

  return (
    <div className="space-y-5">
      <Head
        board={board}
        purposes={purposes}
        counts={counts}
        people={seated}
        labels={labels.length}
      />

      {!can && (
        <Notice tone="amber">
          {owns
            ? 'This board is archived, so nothing on it can be edited. Restore it under Danger to pick it back up, or delete it for good.'
            : 'You can see who is on this board, but only a board owner can change any of it.'}
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubNav
          tabs={shown}
          active={tab}
          onPick={setTab}
          label="Board settings"
          badges={{ people: seated, labels: labels.length }}
        />
        {can && (
          <SaveMark state={written.state} at={written.at} disabled={busy} onSave={written.save} />
        )}
      </div>

      {tab === 'board' && (
        <section>
          <p className="mb-4 text-[12px] font-normal leading-relaxed text-neutral-500">
            {can
              ? 'Everything here saves itself a moment after you stop typing.'
              : 'What this board is and what it keeps.'}
          </p>

          <Field label="Name" htmlFor="board-name">
            <TextInput
              id="board-name"
              value={name}
              maxLength={60}
              disabled={!can}
              onChange={(event) => written.set('name', event.target.value)}
              onFocus={() => written.hold('name')}
              onBlur={() => written.release('name', !name.trim())}
            />
          </Field>

          <Field label="What it is for" htmlFor="board-note">
            <TextInput
              id="board-note"
              value={note}
              maxLength={240}
              disabled={!can}
              placeholder="One line, so nobody has to ask"
              onChange={(event) => written.set('note', event.target.value)}
              onFocus={() => written.hold('note')}
              onBlur={() => written.release('note')}
            />
          </Field>

          <Field
            label="What kind of board"
            hint="Changing the kind never touches the cards, and details you filled in are kept even if you switch away and back."
          >
            <PurposePicker
              purposes={purposes}
              value={board.purpose}
              disabled={!can || busy}
              onPick={(id) => actions.board.set({ purpose: id })}
            />
            {factKeys.length > 0 && (
              <div className="mt-4">
                <FactSheet
                  purpose={purpose}
                  purposes={purposes}
                  values={facts}
                  disabled={!can || busy}
                  onSet={(id, value) => written.set(`fact:${id}`, value)}
                  onHold={(id) => written.hold(`fact:${id}`)}
                  onRelease={(id) => written.release(`fact:${id}`)}
                  onDrop={can ? (id) => actions.board.set({ facts: { [id]: '' } }) : undefined}
                />
              </div>
            )}
          </Field>
        </section>
      )}

      {tab === 'look' && (
        <section>
          <p className="mb-4 text-[12px] font-normal leading-relaxed text-neutral-500">
            A logo shows on the tile, the board header and anywhere the board is named. A banner
            runs across the top of both. Artwork is stored on the board itself, so nobody outside it
            can load it.
          </p>

          <Field
            label="Colour"
            hint="Used wherever there is no logo or banner — the tile stripe, the label swatches and the board mark."
          >
            <div className="flex gap-2">
              {COLOURS.map((colour) => (
                <Swatch
                  key={colour}
                  colour={colour}
                  disabled={!can || busy}
                  active={board.colour === colour}
                  onPick={(chosen) => actions.board.set({ colour: chosen })}
                />
              ))}
            </div>
          </Field>

          <Field label="Logo">
            <ArtField
              kind="logo"
              board={board}
              colour={board.colour}
              disabled={!can || busy}
              onPick={(result) => actions.board.setArt('logo', result.data, result.focus)}
              onClear={() => actions.board.dropArt('logo')}
            />
          </Field>

          <Field label="Banner">
            <ArtField
              kind="banner"
              board={board}
              colour={board.colour}
              disabled={!can || busy}
              onPick={(result) => actions.board.setArt('banner', result.data, result.focus)}
              onClear={() => actions.board.dropArt('banner')}
            />
          </Field>
        </section>
      )}

      {tab === 'people' && (
        <div className="space-y-8">
          <section>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Who can see it
            </h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {seenChoices(choices, board.visibility).map((choice) => {
                const Icon = choice.icon;
                const active = board.visibility === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={!can || busy}
                    aria-pressed={active}
                    onClick={() => actions.board.set({ visibility: choice.id })}
                    className={`border px-4 py-3 text-left transition-colors ${
                      active
                        ? 'border-purple-500/50 bg-purple-500/10'
                        : 'border-[#282832] bg-[#0a0a0d] hover:border-[#3a3a46] disabled:opacity-60'
                    }`}
                  >
                    <span className="mb-1 inline-flex items-center gap-2 text-[12px] font-semibold text-neutral-200">
                      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                      {choice.title}
                    </span>
                    <span className="block text-[12px] font-normal leading-relaxed text-neutral-500">
                      {choice.body}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[12px] font-normal leading-relaxed text-neutral-500">
              {board.visibility === 'sealed' ? (
                <>
                  This board is sealed. Nobody outside the list below can open it, and it is not in
                  anybody else&apos;s boards, work or search — not even a panel owner&apos;s.{' '}
                  {keyholderLine(keyholders)} Seal a board you are on as an owner, or you lock
                  yourself out of it.
                </>
              ) : seenChoices(choices, board.visibility).length === 1 ? (
                <>
                  This board stays private to the people on it. Panel owners and anyone holding{' '}
                  <span className="text-neutral-300">Manage boards</span> can open it. Opening it to
                  the whole team, or sealing it, takes{' '}
                  <span className="text-neutral-300">Manage boards</span>.
                </>
              ) : (
                <>
                  Panel owners and anyone holding{' '}
                  <span className="text-neutral-300">Manage boards</span> can open every private
                  board. Choose <span className="text-neutral-300">Sealed</span> to close that door
                  as well. {keyholderLine(keyholders)}
                </>
              )}
            </p>
          </section>

          <section>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              On this board
            </h3>
            <p className="mb-3 text-[12px] font-normal text-neutral-500">
              Board owners manage people and settings · editors add and move cards · read-only sees
              the board and nothing else. Anyone holding the owner role on the panel wears the
              General owner tag here — it comes with the account, so it is not a seat you hand out.
            </p>
            <People
              members={board.members}
              accounts={accounts}
              you={you}
              roles={roles}
              visibility={board.visibility}
              cards={board.cards}
              keyholders={keyholders}
              generals={generals}
              here={here}
              canAdmin={can}
              busy={busy}
              limit={limits?.members}
              asks={board.asks}
              onAsk={(name, role) => actions.board.ask(name, role)}
              onWithdraw={(name) => actions.board.cancelAsk(name)}
              onSet={(person, role) => actions.board.addMember(person, role)}
              onDrop={(person) => actions.board.dropMember(person)}
              onLeave={() => actions.board.dropMember(you)}
            />
          </section>
        </div>
      )}

      {tab === 'remind' && (
        <div className="space-y-6">
          <section className="border border-[#282832] bg-[#0a0a0d]">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-neutral-200">
                <BellRing
                  className={`h-4 w-4 shrink-0 ${setup.on ? 'text-purple-300' : 'text-neutral-600'}`}
                  strokeWidth={2}
                />
                Discord DMs are {setup.on ? 'on' : 'off'}
                {setup.on && rows.length > 0 && <Pill tone="purple">{rows.length} queued</Pill>}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {tested === 'sent' && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-normal text-emerald-400">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Check your DMs
                  </span>
                )}
                <Button
                  type="button"
                  disabled={busy || tested === 'sending'}
                  onClick={async () => {
                    setTested('sending');
                    const done = await actions.run(async () => {
                      await testBoardReminder(board.id);
                      return null;
                    });
                    setTested(done ? 'sent' : null);
                  }}
                >
                  <Send className="h-3.5 w-3.5" strokeWidth={2} />
                  {tested === 'sending' ? 'Sending…' : 'Send me a test DM'}
                </Button>
                <Button
                  type="button"
                  tone={setup.on ? 'quiet' : 'solid'}
                  disabled={!can || busy || (!setup.on && steps === 0 && setup.events.length === 0)}
                  onClick={() => remind({ on: !setup.on })}
                >
                  {setup.on ? 'Turn them off' : 'Turn them on'}
                </Button>
              </span>
            </div>
            <p className="border-t border-[#17171d] px-4 py-2.5 text-[12px] font-normal leading-relaxed text-neutral-500">
              {setup.on
                ? 'Each row below sends its own DM to the people named beside it. Nothing else on this board sends anything.'
                : 'Nothing on this board sends a DM. Set the rows below, then turn it on. A test goes to you and nobody else, either way.'}{' '}
              Everyone can still turn these off for themselves, and mute them at night, under Your
              account → Discord.
            </p>
          </section>

          {sending === false && (
            <Notice tone="amber">
              The panel cannot reach the Discord bot, so nothing will actually send. The setup here
              is still kept, and starts working the moment the bot is back.
            </Notice>
          )}

          <section>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Send everything to
            </h3>
            <p className="mb-3 text-[12px] font-normal leading-relaxed text-neutral-500">
              A shortcut: pick one and every row below is set to it. Change any single row
              afterwards and only that row moves.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {WHO.map((choice) => {
                const active =
                  choice.id === 'people'
                    ? showing('all') || Array.isArray(same)
                    : same === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={!can || busy}
                    aria-pressed={active}
                    onClick={() => {
                      if (choice.id === 'people') {
                        pick('all', true);
                        return;
                      }
                      applyAll(choice.id);
                    }}
                    className={`border px-3 py-2.5 text-left text-[12px] font-semibold transition-colors ${
                      active
                        ? 'border-purple-500/50 bg-purple-500/10 text-neutral-100'
                        : 'border-[#282832] bg-[#0a0a0d] text-neutral-300 hover:border-[#3a3a46] disabled:opacity-60'
                    }`}
                  >
                    {choice.title}
                  </button>
                );
              })}
            </div>
            {showing('all') && (
              <Crowd
                people={crowd}
                picked={Array.isArray(setup.who) ? setup.who : []}
                disabled={!can || busy}
                locked={Array.isArray(setup.who) && setup.who.length === 1}
                label="Who every row goes to"
                onToggle={(name) => toggle('all', name)}
              />
            )}
          </section>

          <section>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Every DM this board sends
            </h3>
            <div className="flex items-center justify-between gap-4 border border-b-0 border-[#282832] bg-[#111115] px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                What happens
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Who gets the DM
              </span>
            </div>
            <ul className="divide-y divide-[#17171d] border border-[#282832] bg-[#0a0a0d]">
              <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                <span className="min-w-0 flex-1 basis-[260px]">
                  <span className="flex items-center gap-2 text-[13px] font-normal leading-tight text-neutral-200">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-neutral-500" strokeWidth={2} />
                    A card is coming due
                  </span>
                  <span className="mt-1.5 block space-y-1">
                    <Times
                      steps={setup.lead}
                      side="lead"
                      disabled={!can || busy}
                      limit={limits?.reminders ?? 6}
                      onChange={(lead) => remind({ lead })}
                    />
                    <Times
                      steps={setup.late}
                      side="late"
                      disabled={!can || busy}
                      limit={limits?.reminders ?? 6}
                      onChange={(late) => remind({ late })}
                    />
                    {steps === 0 && (
                      <span className="block text-[11px] font-normal text-amber-300/80">
                        No times set, so this row never sends. Add one before it is due.
                      </span>
                    )}
                  </span>
                </span>
                <Goes
                  thing="due"
                  setup={setup}
                  picking={picking.due === true}
                  disabled={!can || busy}
                  label="Who a due date reminder goes to"
                  onPick={(value) => chose('due', value)}
                />
                {showing('due') && (
                  <div className="w-full pb-1">
                    <Crowd
                      people={crowd}
                      picked={Array.isArray(held('due')) ? held('due') : []}
                      disabled={!can || busy}
                      locked={Array.isArray(held('due')) && held('due').length === 1}
                      label="Who a due date reminder goes to"
                      onToggle={(name) => toggle('due', name)}
                    />
                  </div>
                )}
              </li>
              {EVENTS.map((entry) => {
                const on = setup.events.includes(entry.id);
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1"
                  >
                    <span className="min-w-0 flex-1 basis-[220px]">
                      <Tick
                        label={entry.label}
                        hint={entry.hint}
                        disabled={!can || busy}
                        checked={on}
                        onChange={(wanted) =>
                          remind({
                            events: EVENTS.map((known) => known.id).filter((id) =>
                              id === entry.id ? wanted : setup.events.includes(id),
                            ),
                          })
                        }
                      />
                    </span>
                    {on &&
                      (entry.fixed ? (
                        <span className="shrink-0 text-[12px] font-normal text-neutral-500">
                          {entry.fixed}
                        </span>
                      ) : (
                        <Goes
                          thing={entry.id}
                          setup={setup}
                          picking={picking[entry.id] === true}
                          disabled={!can || busy}
                          label={`Who hears when ${entry.short}`}
                          onPick={(value) => chose(entry.id, value)}
                        />
                      ))}
                    {on && !entry.fixed && showing(entry.id) && (
                      <div className="w-full pb-2">
                        <Crowd
                          people={crowd}
                          picked={Array.isArray(held(entry.id)) ? held(entry.id) : []}
                          disabled={!can || busy}
                          locked={Array.isArray(held(entry.id)) && held(entry.id).length === 1}
                          label={`Who hears when ${entry.short}`}
                          onToggle={(name) => toggle(entry.id, name)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[12px] font-normal leading-relaxed text-neutral-600">
              Untick a row and it never sends. The four ticked ones leave the moment they happen,
              and never go back to whoever did it.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              What is queued
            </h3>
            <Queue rows={rows} />
          </section>
        </div>
      )}
      {tab === 'labels' && (
        <section>
          <p className="mb-3 text-[12px] font-normal leading-relaxed text-neutral-500">
            Colour tags for cards — anything you want to filter the board by. Renaming one keeps it
            on every card that already wears it; deleting one takes it off them.
          </p>

          {labels.length === 0 ? (
            <Empty>No labels yet.</Empty>
          ) : (
            <ul className="mb-4 divide-y divide-[#17171d] border border-[#282832] bg-[#0a0a0d]">
              {labels.map((entry) => (
                <LabelRow
                  key={entry.id}
                  entry={entry}
                  used={used[entry.id] ?? 0}
                  can={can}
                  busy={busy}
                  onSave={(chosen, colour) => actions.board.setLabel(entry.id, chosen, colour)}
                  onDrop={() => actions.board.dropLabel(entry.id)}
                />
              ))}
            </ul>
          )}

          {can && (
            <div className="border border-[#282832] bg-[#0a0a0d] p-4">
              <h4 className="mb-3 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                New label
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <TextInput
                  value={label}
                  maxLength={24}
                  placeholder="Label name"
                  aria-label="New label name"
                  className="max-w-[200px]"
                  onChange={(event) => setLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || !label.trim()) return;
                    const chosen = label.trim();
                    setLabel('');
                    actions.board.setLabel(null, chosen, labelColour);
                  }}
                />
                <div className="flex gap-1.5">
                  {COLOURS.map((colour) => (
                    <Swatch
                      key={colour}
                      colour={colour}
                      size="h-6 w-6"
                      active={labelColour === colour}
                      onPick={setLabelColour}
                      disabled={busy}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  disabled={busy || !label.trim()}
                  onClick={() => {
                    const chosen = label.trim();
                    setLabel('');
                    actions.board.setLabel(null, chosen, labelColour);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  Add label
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'danger' && owns && (
        <section>
          <div className="mb-4">
            <Notice tone="rose">
              {board.archived
                ? 'Restoring puts the board back exactly as it was. Deleting takes its cards, comments and history with it — archived or not, there is no undo.'
                : 'Archiving hides a board and keeps everything. Deleting takes its cards, comments and history with it, and there is no undo.'}
            </Notice>
          </div>

          {counts.cards + counts.archived > 0 && (
            <p className="mb-4 text-[12px] font-normal leading-relaxed text-neutral-500">
              Deleting this one would take{' '}
              <span className="text-neutral-300">
                {plural(counts.cards + counts.archived, 'card')}
              </span>
              {weight.comments > 0 && (
                <>
                  , <span className="text-neutral-300">{plural(weight.comments, 'comment')}</span>
                </>
              )}
              {weight.steps > 0 && (
                <>
                  , <span className="text-neutral-300">{plural(weight.steps, 'checklist step')}</span>
                </>
              )}
              {weight.links > 0 && (
                <>
                  , <span className="text-neutral-300">{plural(weight.links, 'link')}</span>
                </>
              )}
              {weight.files > 0 && (
                <>
                  ,{' '}
                  <span className="text-neutral-300">
                    {plural(weight.files, 'file')} ({sizeWords(weight.bytes)})
                  </span>
                </>
              )}{' '}
              and everything written on them.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                const wasArchived = board.archived;
                const done = await actions.run(() =>
                  updateBoard(board.id, { archived: !wasArchived }),
                );
                if (!done) return;
                onClose();
                onGone(wasArchived ? 'boards' : 'archive');
              }}
            >
              {board.archived ? (
                <ArchiveRestore className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <Archive className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {board.archived ? 'Restore board' : 'Archive board'}
            </Button>
            <Confirm
              label="Delete board"
              danger
              icon={Trash2}
              disabled={busy}
              onConfirm={async () => {
                const wasArchived = board.archived;
                const done = await actions.run(async () => {
                  await deleteBoard(board.id);
                  return null;
                });
                if (!done) return;
                onClose();
                onGone(wasArchived ? 'archive' : 'boards');
              }}
            >
              Yes, delete it and its cards
            </Confirm>
          </div>

          <p className="mt-4 text-[12px] font-normal leading-relaxed text-neutral-600">
            {board.archived
              ? 'An archived board still takes up one of the places a board can have, so delete the ones you are done with.'
              : 'Archiving is the safe one — the board leaves the list, keeps everything on it, and comes back whole.'}
          </p>
        </section>
      )}
    </div>
  );
}
