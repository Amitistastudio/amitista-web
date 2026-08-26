import React from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  MoreHorizontal,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowDownAZ,
  ArrowUpDown,
  CheckCircle2,
  Circle,
  MessageSquare,
  ListTodo,
  Link2,
  Paperclip,
  CalendarClock,
  CalendarPlus,
  Check,
  Copy,
  Archive,
  ArchiveRestore,
  Gauge,
  Square,
  SquareCheck,
  UserCheck,
  UserMinus,
  Users,
  RotateCcw,
  X,
} from 'lucide-react';
import { cardFileUrl } from '../../../lib/admin';
import { isImage } from './files';
import { Button, TextInput, Select, FIELD_CLASS } from '../ui';
import {
  Avatar,
  CAP_MAX,
  DUE_TONE,
  MenuItem,
  PointerMenu,
  capOf,
  dueChoices,
  dueState,
  loadOf,
  plural,
  shade,
} from './shared';
import { Picker as WhenPicker } from './When';
import MoveDialog from './Move';

function indexFromPoint(node, clientY, dragged) {
  if (!node) return 0;
  const tiles = Array.from(node.querySelectorAll('[data-card]')).filter(
    (tile) => tile.dataset.card !== dragged,
  );
  for (let index = 0; index < tiles.length; index += 1) {
    const box = tiles[index].getBoundingClientRect();
    if (clientY < box.top + box.height / 2) return index;
  }
  return tiles.length;
}

function Quick({ card, you, actions, onPick, onSend, onSelect }) {
  const mine = (card.assignees ?? []).includes(you);
  const soon = dueChoices();
  return (
    <>
      <MenuItem
        icon={card.done ? RotateCcw : CheckCircle2}
        onClick={() => actions.card.set(card.id, { done: !card.done })}
      >
        {card.done ? 'Put it back to do' : 'Mark it done'}
      </MenuItem>
      <MenuItem
        icon={mine ? UserMinus : UserCheck}
        onClick={() =>
          actions.card.set(card.id, {
            assignees: mine
              ? (card.assignees ?? []).filter((name) => name !== you)
              : [...(card.assignees ?? []), you],
          })
        }
      >
        {mine ? 'Take it off me' : 'Put it on me'}
      </MenuItem>
      {soon.slice(0, 2).map((choice) => (
        <MenuItem
          key={choice.label}
          icon={CalendarClock}
          onClick={() => actions.card.set(card.id, { due: choice.iso })}
        >
          Due {choice.label.toLowerCase()}
        </MenuItem>
      ))}
      <MenuItem icon={CalendarPlus} onClick={onPick}>
        {card.due ? 'Pick another day\u2026' : 'Pick a day for it\u2026'}
      </MenuItem>
      {card.due && (
        <MenuItem icon={CalendarClock} onClick={() => actions.card.set(card.id, { due: null })}>
          Clear the due date
        </MenuItem>
      )}
      <MenuItem icon={Copy} onClick={() => actions.card.copy(card.id)}>
        Duplicate it
      </MenuItem>
      <MenuItem icon={ArrowRightLeft} onClick={onSend}>
        Move to another board…
      </MenuItem>
      <MenuItem icon={SquareCheck} onClick={onSelect}>
        Pick this and others
      </MenuItem>
      <MenuItem
        icon={card.archived ? ArchiveRestore : Archive}
        onClick={() => actions.card.set(card.id, { archived: !card.archived })}
      >
        {card.archived ? 'Bring it back' : 'Archive it'}
      </MenuItem>
      <MenuItem icon={Trash2} danger onClick={() => actions.card.drop(card.id)}>
        Delete it
      </MenuItem>
    </>
  );
}

function Tile({
  card,
  rank,
  board,
  now,
  dragged,
  onOpen,
  onDragStart,
  onDragEnd,
  canWrite,
  you,
  actions,
  onSend,
  picking: choosing,
  picked,
  onPicked,
}) {
  const labels = (board.labels ?? []).filter((label) => (card.labels ?? []).includes(label.id));
  const shots = (card.files ?? []).filter(isImage);
  const steps = card.checklist ?? [];
  const ticked = steps.filter((step) => step.done).length;
  const due = dueState(card, now);
  const [at, setAt] = React.useState(null);
  const [picking, setPicking] = React.useState(false);
  const root = React.useRef(null);
  const chip = React.useRef(null);
  const anchor = React.useMemo(
    () => ({
      get current() {
        return chip.current ?? root.current;
      },
    }),
    [],
  );

  const reveal = (event) => {
    if (!canWrite) return;
    event.preventDefault();
    event.stopPropagation();
    const box = event.currentTarget.getBoundingClientRect();
    setAt(
      event.clientX || event.clientY
        ? { x: event.clientX, y: event.clientY }
        : { x: box.right - 200, y: box.bottom },
    );
  };

  return (
    <span ref={root} className="group/tile relative block">
    <button
      type="button"
      data-card={card.id}
      draggable={canWrite && !choosing}
      aria-pressed={choosing ? picked : undefined}
      onContextMenu={reveal}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', card.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(card.id);
      }}
      onDragEnd={onDragEnd}
      onClick={(event) => (choosing ? onPicked(card.id, event.shiftKey) : onOpen(card.id))}
      className={`group w-full border bg-[#111115] px-3 py-2.5 text-left transition-colors ${
        picked ? 'border-purple-500/60 bg-purple-500/[0.07]' : 'border-[#282832] hover:border-[#3f3f4c]'
      } ${dragged === card.id ? 'opacity-40' : ''}`}
    >
      {shots.length > 0 && (
        <span className="relative -mx-3 -mt-2.5 mb-2.5 block h-28 overflow-hidden bg-[#0a0a0d]">
          <img
            src={cardFileUrl(board.id, card.id, shots[0].id, false, shots[0].thumb)}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
          />
          {shots.length > 1 && (
            <span className="absolute bottom-1 right-1 border border-[#282832] bg-[#0a0a0d]/90 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-neutral-300">
              +{shots.length - 1}
            </span>
          )}
        </span>
      )}

      {labels.length > 0 && (
        <span className="mb-2 flex flex-wrap gap-1">
          {labels.map((label) => (
            <span
              key={label.id}
              className={`inline-flex items-center border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${shade(label.colour).chip}`}
            >
              {label.name}
            </span>
          ))}
        </span>
      )}

      <span className="flex items-start gap-2">
        {card.done ? (
          <CheckCircle2 className="mt-[3px] h-3.5 w-3.5 shrink-0 text-emerald-500" strokeWidth={2} />
        ) : (
          <Circle className="mt-[3px] h-3.5 w-3.5 shrink-0 text-neutral-700" strokeWidth={2} />
        )}
        <span
          className={`flex-1 text-[13px] font-normal leading-snug ${
            card.done ? 'text-neutral-500 line-through' : 'text-neutral-100'
          }`}
        >
          {card.title}
        </span>
        {rank ? (
          <span className="mt-[2px] shrink-0 text-[10px] font-semibold tabular-nums text-neutral-700 max-sm:mr-6">
            #{rank}
          </span>
        ) : null}
      </span>

      {(due ||
        steps.length > 0 ||
        (card.comments ?? []).length > 0 ||
        (card.links ?? []).length > 0 ||
        (card.files ?? []).length > 0 ||
        (card.assignees ?? []).length > 0) && (
        <span className="mt-2 flex flex-wrap items-center gap-2 pl-5 text-[11px] text-neutral-500">
          {due && !card.done && (
            <span
              ref={chip}
              role={canWrite ? 'button' : undefined}
              tabIndex={canWrite ? 0 : undefined}
              aria-label={canWrite ? `Due ${due.label} \u2014 change it` : undefined}
              onClick={
                canWrite
                  ? (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setPicking(true);
                    }
                  : undefined
              }
              onKeyDown={
                canWrite
                  ? (event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      event.stopPropagation();
                      setPicking(true);
                    }
                  : undefined
              }
              className={`inline-flex items-center gap-1 border px-1.5 py-0.5 ${DUE_TONE[due.tone]} ${
                canWrite ? 'cursor-pointer transition-[filter] hover:brightness-125' : ''
              }`}
            >
              <CalendarClock className="h-3 w-3" strokeWidth={2} />
              {due.tone === 'late' ? 'Overdue' : due.label}
            </span>
          )}
          {steps.length > 0 && (
            <span className={`inline-flex items-center gap-1 ${ticked === steps.length ? 'text-emerald-400' : ''}`}>
              <ListTodo className="h-3 w-3" strokeWidth={2} />
              {ticked}/{steps.length}
            </span>
          )}
          {(card.comments ?? []).length > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" strokeWidth={2} />
              {card.comments.length}
            </span>
          )}
          {(card.links ?? []).length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Link2 className="h-3 w-3" strokeWidth={2} />
              {card.links.length}
            </span>
          )}
          {(card.files ?? []).length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3" strokeWidth={2} />
              {card.files.length}
            </span>
          )}
          {(card.assignees ?? []).length > 0 && (
            <span className="ml-auto flex -space-x-1.5">
              {card.assignees.slice(0, 3).map((name) => (
                <Avatar key={name} name={name} />
              ))}
            </span>
          )}
        </span>
      )}
    </button>
    {canWrite && choosing && (
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-1.5 top-2 ${
          picked ? 'text-purple-300' : 'text-neutral-600'
        }`}
      >
        {picked ? (
          <SquareCheck className="h-4 w-4" strokeWidth={2} />
        ) : (
          <Square className="h-4 w-4" strokeWidth={2} />
        )}
      </span>
    )}
    {canWrite && !choosing && (
      <button
        type="button"
        aria-label={`What to do with ${card.title}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(at)}
        onClick={reveal}
        className={`touch-show absolute right-1 top-1.5 border border-[#282832] bg-[#111115] p-0.5 text-neutral-500 transition-opacity hover:text-neutral-100 focus:opacity-100 group-hover/tile:opacity-100 max-sm:p-1.5 ${
          at ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    )}
    {at && (
      <PointerMenu at={at} onClose={() => setAt(null)}>
        <Quick
          card={card}
          you={you}
          actions={actions}
          onPick={() => setPicking(true)}
          onSend={() => onSend(card.id)}
          onSelect={() => onPicked(card.id, false)}
        />
      </PointerMenu>
    )}
    {picking && canWrite && (
      <WhenPicker
        anchor={anchor}
        value={card.due}
        now={now}
        remind={board.remind}
        assigned={(card.assignees ?? []).length}
        onClose={() => setPicking(false)}
        onChange={(iso) => actions.card.set(card.id, { due: iso })}
      />
    )}
    </span>
  );
}

function Composer({ onAdd, onClose, busy }) {
  const [title, setTitle] = React.useState('');
  const box = React.useRef(null);

  React.useEffect(() => {
    box.current?.focus();
  }, []);

  function submit(keepOpen) {
    const cleaned = title.trim();
    if (!cleaned) {
      onClose();
      return;
    }
    onAdd(cleaned);
    setTitle('');
    if (!keepOpen) onClose();
    else box.current?.focus();
  }

  return (
    <div className="border border-[#282832] bg-[#111115] p-2">
      <textarea
        ref={box}
        rows={2}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit(true);
          }
          if (event.key === 'Escape') onClose();
        }}
        placeholder="What needs doing?"
        maxLength={140}
        className={`${FIELD_CLASS} resize-none`}
      />
      <div className="mt-2 flex items-center gap-2">
        <Button type="button" tone="solid" onClick={() => submit(true)} disabled={busy}>
          Add card
        </Button>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
        <span className="text-[11px] text-neutral-600">Enter adds another</span>
      </div>
    </div>
  );
}

function Column({
  column,
  position,
  total,
  board,
  cards,
  load,
  ranks,
  marking,
  dragged,
  canWrite,
  you,
  actions,
  archived,
  onOpen,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  bodyRef,
  onSend,
  picking,
  picked,
  onPicked,
  onPickAll,
}) {
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(column.name);
  const [composing, setComposing] = React.useState(false);
  const [spot, setSpot] = React.useState(null);
  const [limiting, setLimiting] = React.useState(false);
  const [limit, setLimit] = React.useState('');
  const sealed = React.useRef(false);
  const shown = cards.length;
  const cap = capOf(column, archived);
  const hidden = archived ? 0 : Math.max(0, load - shown);
  const over = cap > 0 && load > cap;
  const brim = cap > 0 && load === cap;
  const full = cap > 0 && load >= cap;
  const carried = dragged ? board.cards[dragged] : null;
  const barred = full && Boolean(carried) && carried.list !== column.id && !carried.archived;
  const tally = archived
    ? String(shown)
    : hidden
      ? `${shown}/${load}`
      : cap
        ? `${load}/${cap}`
        : String(load);
  const reading = archived
    ? `${plural(shown, 'archived card')} — a column limit does not count these`
    : hidden
      ? `${shown} of ${load} shown${cap ? `, the limit is ${cap}` : ''}`
      : cap
        ? `${load} of ${cap} — the column limit`
        : undefined;
  const finished = (column.cards ?? [])
    .map((id) => board.cards[id])
    .filter((entry) => entry && entry.done && !entry.archived);

  function saveLimit() {
    if (sealed.current) return;
    sealed.current = true;
    setLimiting(false);
    const held = column.cap ?? null;
    const cleaned = limit.trim();
    if (cleaned === '') {
      if (held !== null) actions.column.set(column.id, { cap: null });
      return;
    }
    const read = Number(cleaned);
    if (!Number.isFinite(read)) return;
    const wanted = Math.min(CAP_MAX, Math.max(0, Math.round(read))) || null;
    if (wanted === held) return;
    actions.column.set(column.id, { cap: wanted });
  }

  return (
    <section
      id={`board-column-${column.id}`}
      className={`flex w-full scroll-mt-24 flex-col border bg-[#0a0a0d] sm:w-[300px] sm:shrink-0 ${
        barred ? 'border-dashed border-rose-500/50' : 'border-[#282832]'
      }`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header
        onContextMenu={(event) => {
          if (!canWrite || renaming) return;
          event.preventDefault();
          setSpot({ x: event.clientX, y: event.clientY });
        }}
        className={`flex items-center gap-2 border-b px-3 py-2.5 ${
          over ? 'border-rose-500/40 bg-rose-500/[0.07]' : 'border-[#282832]'
        }`}
      >
        {renaming ? (
          <TextInput
            autoFocus
            value={name}
            maxLength={32}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setRenaming(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setRenaming(false);
              if (event.key !== 'Enter') return;
              const cleaned = name.trim();
              setRenaming(false);
              if (cleaned && cleaned !== column.name) actions.column.set(column.id, { name: cleaned });
            }}
          />
        ) : limiting ? (
          <>
            <label
              htmlFor={`board-cap-${column.id}`}
              className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500"
            >
              Most cards
            </label>
            <TextInput
              autoFocus
              id={`board-cap-${column.id}`}
              type="number"
              min="0"
              max={CAP_MAX}
              value={limit}
              placeholder="none"
              onChange={(event) => setLimit(event.target.value)}
              onBlur={saveLimit}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  sealed.current = true;
                  setLimiting(false);
                }
                if (event.key === 'Enter') saveLimit();
              }}
            />
          </>
        ) : (
          <>
            {column.done && (
              <CheckCircle2
                className="h-3.5 w-3.5 shrink-0 text-emerald-500"
                strokeWidth={2}
                aria-label="Cards here count as finished"
              />
            )}
            <h3 className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-300">
              {column.name}
            </h3>
            <span
              title={reading}
              className={`shrink-0 text-[11px] tabular-nums ${
                over ? 'font-semibold text-rose-300' : brim ? 'text-amber-300' : 'text-neutral-600'
              }`}
            >
              {tally}
            </span>
            {canWrite && (
              <button
                type="button"
                aria-label={`${column.name} options`}
                aria-haspopup="menu"
                aria-expanded={Boolean(spot)}
                onClick={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  setSpot({ x: box.right - 208, y: box.bottom + 4 });
                }}
                className="shrink-0 p-1 text-neutral-600 transition-colors hover:text-neutral-200 max-sm:p-2"
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
          </>
        )}
      </header>

      {spot && (
        <PointerMenu at={spot} onClose={() => setSpot(null)}>
          <MenuItem
            icon={Pencil}
            onClick={() => {
              setName(column.name);
              setRenaming(true);
            }}
          >
            Rename column
          </MenuItem>
          <MenuItem
            icon={Plus}
            disabled={full}
            onClick={() => {
              setSpot(null);
              setComposing(true);
            }}
          >
            {full ? `Full — ${load} of ${cap}` : 'Add a card here'}
          </MenuItem>
          <MenuItem
            icon={CheckCircle2}
            onClick={() => actions.column.set(column.id, { done: !column.done })}
          >
            {column.done ? 'Stop finishing cards here' : 'Cards here are finished'}
          </MenuItem>
          <MenuItem
            icon={Gauge}
            onClick={() => {
              sealed.current = false;
              setLimit(column.cap ? String(column.cap) : '');
              setLimiting(true);
            }}
          >
            {column.cap ? `Limit is ${column.cap} — change it` : 'Set a limit…'}
          </MenuItem>
          {column.cap ? (
            <MenuItem icon={X} onClick={() => actions.column.set(column.id, { cap: null })}>
              Drop the limit
            </MenuItem>
          ) : null}
          <MenuItem icon={ArrowUpDown} onClick={() => actions.column.sort(column.id, 'due')}>
            Sort by when it is due
          </MenuItem>
          <MenuItem icon={Users} onClick={() => actions.column.sort(column.id, 'who')}>
            Sort by who is on it
          </MenuItem>
          <MenuItem icon={ArrowDownAZ} onClick={() => actions.column.sort(column.id, 'title')}>
            Sort by name
          </MenuItem>
          <MenuItem
            icon={Archive}
            disabled={finished.length === 0}
            onClick={() =>
              actions.card.bulk(
                finished.map((entry) => entry.id),
                'archive',
              )
            }
          >
            {finished.length ? `Archive ${plural(finished.length, 'done card')}` : 'Nothing done here'}
          </MenuItem>
          <MenuItem icon={SquareCheck} disabled={cards.length === 0} onClick={onPickAll}>
            Pick every card here
          </MenuItem>
          <MenuItem
            icon={ArrowLeft}
            disabled={position === 0}
            onClick={() => actions.column.move(column.id, position - 1)}
          >
            Move left
          </MenuItem>
          <MenuItem
            icon={ArrowRight}
            disabled={position === total - 1}
            onClick={() => actions.column.move(column.id, position + 1)}
          >
            Move right
          </MenuItem>
          <MenuItem icon={Trash2} danger onClick={() => actions.column.drop(column.id)}>
            Delete column
          </MenuItem>
        </PointerMenu>
      )}

      <div
        ref={bodyRef}
        className="quiet-scroll flex max-h-[58vh] min-h-[64px] flex-col gap-2 overflow-y-auto p-2"
      >
        {cards.length === 0 && marking === null && (
          <p className="px-1 py-4 text-center text-[12px] font-normal text-neutral-700">
            {archived ? 'Nothing archived here.' : 'Drop a card here'}
          </p>
        )}
        {cards.map((card, index) => (
          <React.Fragment key={card.id}>
            {marking === index && <span className="h-0.5 w-full bg-purple-500" />}
            <Tile
              card={card}
              rank={ranks[card.id]}
              board={board}
              now={Date.now()}
              dragged={dragged}
              canWrite={canWrite}
              you={you}
              actions={actions}
              onOpen={onOpen}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onSend={onSend}
              picking={picking}
              picked={picked.includes(card.id)}
              onPicked={(id, spread) => onPicked(id, spread, index)}
            />
          </React.Fragment>
        ))}
        {marking !== null && marking >= cards.length && <span className="h-0.5 w-full bg-purple-500" />}
      </div>

      {canWrite && !archived && (
        <div className="border-t border-[#282832] p-2">
          {composing ? (
            <Composer
              busy={actions.busy}
              onClose={() => setComposing(false)}
              onAdd={(title) => actions.card.add(column.id, title)}
            />
          ) : full ? (
            <p className="px-2 py-2 text-[12px] font-normal leading-relaxed text-amber-300/80">
              At its limit of {cap} — move one out, or change the limit from the column menu.
            </p>
          ) : (
            <button
              type="button"
              data-tour={position === 0 ? 'board-add-card' : undefined}
              onClick={() => setComposing(true)}
              className="inline-flex w-full items-center gap-2 px-2 py-2 text-[12px] font-semibold tracking-wide text-neutral-500 transition-colors hover:text-neutral-200"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add a card
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const PAN_SKIP = 'a,button,input,textarea,select,[data-card],[contenteditable="true"],[role="menu"]';

export default function Columns({ board, boards, you, filters, onOpen, onDragging, actions }) {
  const [dragged, setDragged] = React.useState(null);
  const [target, setTarget] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [column, setColumn] = React.useState('');
  const [wide, setWide] = React.useState(false);
  const [panning, setPanning] = React.useState(false);
  const [picked, setPicked] = React.useState([]);
  const [sending, setSending] = React.useState(null);
  const bodies = React.useRef({});
  const rail = React.useRef(null);
  const grab = React.useRef(null);
  const anchor = React.useRef(null);
  const canWrite = board.canWrite;
  const picking = picked.length > 0;

  React.useEffect(() => {
    const node = rail.current;
    if (!node) return undefined;
    const measure = () => setWide(node.scrollWidth > node.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(measure);
    watch.observe(node);
    Array.from(node.children).forEach((child) => watch.observe(child));
    return () => watch.disconnect();
  }, [board.lists, filters]);

  function panStart(event) {
    const node = rail.current;
    if (!node || event.pointerType === 'touch' || event.button !== 0) return;
    if (node.scrollWidth <= node.clientWidth) return;
    if (event.target.closest?.(PAN_SKIP)) return;
    grab.current = { id: event.pointerId, x: event.clientX, left: node.scrollLeft, moved: false };
  }

  function panMove(event) {
    const held = grab.current;
    const node = rail.current;
    if (!held || !node || event.pointerId !== held.id) return;
    if (event.buttons === 0) {
      grab.current = null;
      setPanning(false);
      return;
    }
    const shift = event.clientX - held.x;
    if (!held.moved) {
      if (Math.abs(shift) < 6) return;
      held.moved = true;
      setPanning(true);
      window.getSelection?.()?.removeAllRanges();
      if (node.setPointerCapture) node.setPointerCapture(held.id);
    }
    node.scrollLeft = held.left - shift;
  }

  function panEnd(event) {
    const held = grab.current;
    const node = rail.current;
    if (!held) return;
    grab.current = null;
    setPanning(false);
    if (node?.hasPointerCapture?.(held.id)) node.releasePointerCapture(held.id);
    if (!held.moved || !event || event.type === 'pointercancel') return;
    const swallow = (click) => {
      click.stopPropagation();
      click.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener('click', swallow, true), 0);
  }

  React.useEffect(() => {
    onDragging?.(Boolean(dragged));
  }, [dragged, onDragging]);

  const ranks = React.useMemo(() => {
    const out = {};
    for (const entry of board.lists) {
      let place = 0;
      for (const id of entry.cards) {
        const card = board.cards[id];
        if (!card) continue;
        if (Boolean(card.archived) !== Boolean(filters.archived)) continue;
        place += 1;
        out[id] = place;
      }
    }
    return out;
  }, [board.lists, board.cards, filters.archived]);

  const keeps = React.useCallback(
    (card) => {
      if (!card) return false;
      if (Boolean(card.archived) !== Boolean(filters.archived)) return false;
      if (filters.hideDone && card.done) return false;
      if (filters.mine && !(card.assignees ?? []).includes(you)) return false;
      if (filters.label && !(card.labels ?? []).includes(filters.label)) return false;
      const wanted = filters.text.trim().toLowerCase();
      if (!wanted) return true;
      return `#${ranks[card.id] ?? ''} ${card.title} ${card.notes ?? ''}`.toLowerCase().includes(wanted);
    },
    [filters, you, ranks],
  );

  React.useEffect(() => {
    setPicked((held) => {
      const kept = held.filter((id) => board.cards[id]);
      return kept.length === held.length ? held : kept;
    });
  }, [board.cards]);

  React.useEffect(() => {
    setPicked([]);
    anchor.current = null;
  }, [board.id]);

  React.useEffect(() => {
    if (!picking) return undefined;
    function key(event) {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"]')) return;
      setPicked([]);
      anchor.current = null;
    }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [picking]);

  const shownIn = React.useCallback(
    (listId) => {
      const held = board.lists.find((entry) => entry.id === listId);
      return (held?.cards ?? []).map((id) => board.cards[id]).filter(keeps);
    },
    [board.lists, board.cards, keeps],
  );

  const pick = React.useCallback(
    (listId, id, spread, index) => {
      if (!canWrite) return;
      const held = anchor.current;
      if (spread && held && held.list === listId) {
        const shown = shownIn(listId).map((entry) => entry.id);
        const from = Math.min(held.index, index);
        const to = Math.max(held.index, index);
        const span = shown.slice(from, to + 1);
        anchor.current = { list: listId, index };
        setPicked((was) => [...was, ...span.filter((entry) => !was.includes(entry))]);
        return;
      }
      anchor.current = { list: listId, index };
      setPicked((was) => (was.includes(id) ? was.filter((entry) => entry !== id) : [...was, id]));
    },
    [canWrite, shownIn],
  );

  const bulk = React.useCallback(
    (action, value) => {
      const held = picked;
      setPicked([]);
      anchor.current = null;
      actions.card.bulk(held, action, value ?? null);
    },
    [picked, actions],
  );

  const roomIn = React.useCallback(
    (entry, identifier) => {
      const cap = capOf(entry, filters.archived);
      if (!cap) return true;
      const card = identifier ? board.cards[identifier] : null;
      if (!card || card.list === entry.id || card.archived) return true;
      return loadOf(board, entry) < cap;
    },
    [board, filters.archived],
  );

  function drop(entry, carried) {
    const identifier = dragged ?? carried;
    const at = target && target.list === entry.id ? target.index : 0;
    setDragged(null);
    setTarget(null);
    if (!identifier || !canWrite || !board.cards[identifier]) return;
    if (!roomIn(entry, identifier)) {
      actions.fail(
        `${entry.name} is at its limit of ${entry.cap} cards — move one out, or change the limit from the column menu.`,
      );
      return;
    }
    actions.card.move(identifier, entry.id, at);
  }

  function addColumn() {
    const cleaned = column.trim();
    if (!cleaned) return;
    setColumn('');
    setAdding(false);
    actions.column.add(cleaned);
  }

  return (
    <>
      {board.lists.length > 1 && (
        <nav
          aria-label="Jump to a column"
          className="rail mb-3 flex gap-1.5 border border-[#282832] bg-[#0a0a0d] p-1.5 sm:hidden"
        >
          {board.lists.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() =>
                document
                  .getElementById(`board-column-${entry.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="tap inline-flex shrink-0 items-center gap-2 px-3 py-2 text-[12px] font-medium whitespace-nowrap text-neutral-400 transition-colors hover:bg-white/[0.03] hover:text-neutral-200"
            >
              {entry.name}
              <span className="tabular-nums text-neutral-600">
                {entry.cards.map((id) => board.cards[id]).filter(keeps).length}
              </span>
            </button>
          ))}
        </nav>
      )}

      <div
        ref={rail}
        onPointerDown={panStart}
        onPointerMove={panMove}
        onPointerUp={panEnd}
        onPointerCancel={panEnd}
        data-tour="board-rail"
        className={`quiet-scroll flex flex-col gap-4 pb-4 sm:flex-row sm:items-start sm:overflow-x-auto sm:overscroll-x-contain ${
          wide ? (panning ? 'sm:cursor-grabbing sm:select-none' : 'sm:cursor-grab') : ''
        }`}
      >
        {board.lists.map((entry, position) => (
        <Column
          key={entry.id}
          column={entry}
          position={position}
          total={board.lists.length}
          board={board}
          cards={entry.cards.map((id) => board.cards[id]).filter(keeps)}
          load={entry.cards.filter((id) => board.cards[id] && !board.cards[id].archived).length}
          ranks={ranks}
          you={you}
          marking={target && target.list === entry.id ? target.index : null}
          dragged={dragged}
          canWrite={canWrite}
          actions={actions}
          archived={filters.archived}
          onOpen={onOpen}
          onDragStart={setDragged}
          onDragEnd={() => {
            setDragged(null);
            setTarget(null);
          }}
          onDragOver={(event) => {
            if (!canWrite || !event.dataTransfer.types.includes('text/plain')) return;
            event.preventDefault();
            if (!roomIn(entry, dragged)) {
              event.dataTransfer.dropEffect = 'none';
              setTarget(null);
              return;
            }
            event.dataTransfer.dropEffect = 'move';
            setTarget({
              list: entry.id,
              index: indexFromPoint(bodies.current[entry.id], event.clientY, dragged),
            });
          }}
          onDrop={(event) => {
            event.preventDefault();
            drop(entry, event.dataTransfer.getData('text/plain'));
          }}
          onSend={(id) => setSending(id)}
          picking={picking}
          picked={picked}
          onPicked={(id, spread, index) => pick(entry.id, id, spread, index)}
          onPickAll={() => {
            const shown = shownIn(entry.id).map((card) => card.id);
            anchor.current = null;
            setPicked((held) => [...held, ...shown.filter((id) => !held.includes(id))]);
          }}
          bodyRef={(node) => {
            bodies.current[entry.id] = node;
          }}
        />
      ))}

      {canWrite && (
        <div className="w-full border border-dashed border-[#282832] bg-[#0a0a0d]/50 p-2 sm:w-[300px] sm:shrink-0">
          {adding ? (
            <div className="p-1">
              <TextInput
                autoFocus
                value={column}
                maxLength={32}
                placeholder="Column name"
                onChange={(event) => setColumn(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setAdding(false);
                  if (event.key === 'Enter') addColumn();
                }}
              />
              <div className="mt-2 flex gap-2">
                <Button type="button" tone="solid" disabled={actions.busy || !column.trim()} onClick={addColumn}>
                  <Check className="h-3.5 w-3.5" strokeWidth={2} />
                  Add column
                </Button>
                <Button type="button" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex w-full items-center gap-2 px-2 py-3 text-[12px] font-semibold tracking-wide text-neutral-500 transition-colors hover:text-neutral-200"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add a column
            </button>
          )}
        </div>
        )}
      </div>

      {picking && canWrite && (
        <div className="sticky bottom-3 z-40 flex flex-wrap items-center gap-2 border border-purple-500/40 bg-[#111115] px-3 py-2.5 shadow-2xl">
          <span className="text-[12px] font-semibold tracking-wide text-neutral-200">
            {plural(picked.length, 'card')} picked
          </span>
          <span className="hidden text-[11px] font-normal text-neutral-600 sm:inline">
            shift-click for a run of them
          </span>
          <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Button type="button" disabled={actions.busy} onClick={() => bulk('done')}>
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              Done
            </Button>
            <Button type="button" disabled={actions.busy} onClick={() => bulk('undone')}>
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
              To do
            </Button>
            <Button type="button" disabled={actions.busy} onClick={() => bulk('assign', you)}>
              <UserCheck className="h-3.5 w-3.5" strokeWidth={2} />
              On me
            </Button>
            <label className="sr-only" htmlFor="board-bulk-column">
              Move the picked cards to a column
            </label>
            <span className="w-40 shrink-0">
              <Select
                id="board-bulk-column"
                value=""
                disabled={actions.busy}
                onChange={(event) => event.target.value && bulk('move', event.target.value)}
              >
                <option value="">Move to…</option>
                {board.lists.map((entry) => {
                  const cap = capOf(entry, filters.archived);
                  const coming = picked.filter(
                    (id) =>
                      board.cards[id] &&
                      !board.cards[id].archived &&
                      board.cards[id].list !== entry.id,
                  ).length;
                  const room = !cap || loadOf(board, entry) + coming <= cap;
                  return (
                    <option key={entry.id} value={entry.id} disabled={!room}>
                      {entry.name}
                      {entry.done ? ' (finished)' : ''}
                      {room ? '' : ' — full'}
                    </option>
                  );
                })}
              </Select>
            </span>
            {(board.labels ?? []).length > 0 && (
              <>
                <label className="sr-only" htmlFor="board-bulk-label">
                  Label the picked cards
                </label>
                <span className="w-40 shrink-0">
                  <Select
                    id="board-bulk-label"
                    value=""
                    disabled={actions.busy}
                    onChange={(event) => {
                      const [what, id] = event.target.value.split(':');
                      if (id) bulk(what, id);
                    }}
                  >
                    <option value="">Label…</option>
                    {board.labels.map((label) => (
                      <option key={label.id} value={`label:${label.id}`}>
                        Add {label.name}
                      </option>
                    ))}
                    {board.labels.map((label) => (
                      <option key={`off-${label.id}`} value={`unlabel:${label.id}`}>
                        Take off {label.name}
                      </option>
                    ))}
                  </Select>
                </span>
              </>
            )}
            <Button
              type="button"
              disabled={actions.busy}
              onClick={() => bulk(filters.archived ? 'restore' : 'archive')}
            >
              {filters.archived ? (
                <ArchiveRestore className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <Archive className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {filters.archived ? 'Bring back' : 'Archive'}
            </Button>
            <Button type="button" tone="danger" disabled={actions.busy} onClick={() => bulk('delete')}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Delete
            </Button>
            <button
              type="button"
              aria-label="Stop picking cards"
              onClick={() => {
                setPicked([]);
                anchor.current = null;
              }}
              className="p-1.5 text-neutral-500 transition-colors hover:text-neutral-200"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </span>
        </div>
      )}

      {sending && board.cards[sending] && (
        <MoveDialog
          boards={boards}
          board={board}
          card={board.cards[sending]}
          busy={actions.busy}
          onClose={() => setSending(null)}
          onMove={async (to, list) => {
            const held = sending;
            setSending(null);
            await actions.card.sendTo(held, to, list);
          }}
        />
      )}
    </>
  );
}
