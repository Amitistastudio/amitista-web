import React from 'react';
import {
  Check,
  CheckCircle2,
  Circle,
  Trash2,
  Archive,
  ArrowRightLeft,
  ArchiveRestore,
  Plus,
  Copy,
  Link2,
  ExternalLink,
  Paperclip,
  FileText,
  Download,
  Upload,
  Loader2,
  History,
  MessageSquare,
  Tag,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Maximize2,
  UserPlus,
  Search,
  X,
} from 'lucide-react';
import { Button, TextInput, TextArea, Select, Empty, FIELD_CLASS } from '../ui';
import { BOARD_ROLE_LABEL, cardFileUrl } from '../../../lib/admin';
import { FILES_MAX, FILE_TYPES, isImage, readAttachment, sizeWords } from './files';
import { useDraft } from './draft';
import MoveDialog from './Move';
import Viewer from './Viewer';
import { NOTES_MAX, NoteEditor } from './Notes';
import WhenField from './When.jsx';
import { dayWords, gapWords, timeWords } from './when';
import {
  Avatar,
  DUE_TONE,
  Menu,
  MenuItem,
  Progress,
  SaveMark,
  ago,
  capOf,
  dueState,
  isGeneral,
  loadOf,
  shade,
} from './shared';

const ACTIVITY = {
  created: 'made this card',
  copied: 'copied it from another card',
  moved: 'moved it',
  done: 'marked it done',
  reopened: 'reopened it',
  archived: 'archived it',
  restored: 'restored it',
  due: 'changed the due date',
  assigned: 'changed who is on it',
  renamed: 'renamed it',
  commented: 'commented',
  linked: 'added a link',
  attached: 'attached a file',
  detached: 'took a file off',
};

const PASTE_KEYS =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
    ? '\u2318V'
    : 'Ctrl-V';

function Pending({ entry, onForget }) {
  const failed = entry.state === 'failed';
  return (
    <li
      className={`relative border bg-[#0a0a0d] ${failed ? 'border-rose-500/50' : 'border-[#282832]'}`}
    >
      <span className="flex h-28 items-center justify-center overflow-hidden bg-[#111115]">
        {entry.preview ? (
          <img
            src={entry.preview}
            alt=""
            className={`h-full w-full object-cover ${failed ? 'opacity-30' : 'opacity-60'}`}
          />
        ) : (
          <FileText className="h-7 w-7 text-neutral-600" strokeWidth={1.5} />
        )}
        {!failed && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-white/90" strokeWidth={2} />
          </span>
        )}
      </span>
      {!failed && (
        <span className="block truncate px-2 pt-1.5 text-[12px] font-normal text-neutral-300">
          {entry.name}
        </span>
      )}
      <span
        className={`block px-2 pb-1.5 text-[11px] font-normal leading-relaxed ${
          failed ? 'pt-1.5 text-rose-300' : 'text-neutral-600'
        }`}
      >
        {failed ? entry.trouble : entry.state === 'reading' ? 'Reading\u2026' : 'Adding\u2026'}
      </span>
      {failed && (
        <button
          type="button"
          aria-label={`Forget ${entry.name}`}
          onClick={onForget}
          className="absolute right-1 top-1 border border-[#282832] bg-[#0a0a0d]/90 p-1 text-neutral-400 transition-colors hover:text-white"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}
    </li>
  );
}

function FileFace({ board, card, entry }) {
  return (
    <>
      <span className="flex h-28 items-center justify-center overflow-hidden bg-[#111115]">
        {isImage(entry) ? (
          <img
            src={cardFileUrl(board.id, card.id, entry.id, false, entry.thumb)}
            alt={entry.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <FileText className="h-7 w-7 text-neutral-600" strokeWidth={1.5} />
        )}
      </span>
      <span className="block truncate px-2 pt-1.5 text-[12px] font-normal text-neutral-300">
        {entry.name}
      </span>
      <span className="block px-2 pb-1.5 text-[11px] font-normal text-neutral-600">
        {sizeWords(entry.bytes)} · {entry.by}
      </span>
    </>
  );
}

function Label({ children, count }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
      {children}
      {count ? <span className="tabular-nums text-neutral-600">{count}</span> : null}
    </h3>
  );
}

function OnIt({ card, board, you, generals, canWrite, actions }) {
  const [adding, setAdding] = React.useState(false);
  const [find, setFind] = React.useState('');
  const on = card.assignees ?? [];
  const people = React.useMemo(
    () => Object.keys(board.members ?? {}).sort((first, second) => first.localeCompare(second)),
    [board.members],
  );
  const spare = people.filter((name) => !on.includes(name));
  const needle = find.trim().toLowerCase();
  const shown = needle ? spare.filter((name) => name.toLowerCase().includes(needle)) : spare;

  const put = (name, keep) =>
    actions.card.set(card.id, {
      assignees: keep ? [...on, name] : on.filter((entry) => entry !== name),
    });

  return (
    <div>
      <Label count={on.length}>On it</Label>
      {on.length === 0 && !adding && (
        <p className="mb-2 text-[12px] font-normal text-neutral-600">
          Nobody yet{canWrite ? ' — reminders would reach no one.' : '.'}
        </p>
      )}
      {on.length > 0 && (
        <ul className="mb-2 space-y-1">
          {on.map((person) => (
            <li
              key={person}
              className="group flex items-center gap-2 border border-purple-500/30 bg-purple-500/10 px-2 py-1.5 text-[12px] text-white"
            >
              <Avatar name={person} crowned={isGeneral(generals, person)} />
              <span className="min-w-0 flex-1 truncate">
                {person}
                {person === you ? ' (you)' : ''}
              </span>
              {canWrite && (
                <button
                  type="button"
                  aria-label={`Take ${person} off this card`}
                  onClick={() => put(person, false)}
                  className="shrink-0 text-neutral-500 transition-colors hover:text-rose-300"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && !adding && spare.length > 0 && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex w-full items-center gap-2 border border-dashed border-[#3a3a46] px-2 py-1.5 text-[12px] font-medium text-neutral-500 transition-colors hover:border-[#4a4a58] hover:text-neutral-300"
        >
          <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
          Put someone on it
        </button>
      )}
      {canWrite && adding && (
        <div className="border border-[#282832] bg-[#0a0a0d] p-2">
          <p className="mb-2 text-[11px] font-normal text-neutral-600">On this board</p>
          {spare.length > 6 && (
            <div className="relative mb-2">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600"
                strokeWidth={2}
              />
              <input
                autoFocus
                value={find}
                maxLength={40}
                placeholder="Find a name"
                aria-label="Find a name"
                onChange={(event) => setFind(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return;
                  event.stopPropagation();
                  event.preventDefault();
                  setAdding(false);
                  setFind('');
                }}
                className="w-full border border-[#282832] bg-[#111115] py-1.5 pl-7 pr-2 text-[12px] text-white placeholder-neutral-600 outline-none transition-colors focus:border-purple-500/60"
              />
            </div>
          )}
          <ul className="quiet-scroll max-h-48 space-y-1 overflow-y-auto">
            {shown.length === 0 && (
              <li className="px-1 py-1 text-[12px] font-normal text-neutral-600">
                Nobody left to add.
              </li>
            )}
            {shown.map((person) => (
              <li key={person}>
                <button
                  type="button"
                  onClick={() => {
                    setFind('');
                    put(person, true);
                  }}
                  className="flex w-full items-center gap-2 border border-[#282832] bg-[#111115] px-2 py-1.5 text-left text-[12px] text-neutral-300 transition-colors hover:border-[#3f3f4c] hover:text-white"
                >
                  <Avatar name={person} crowned={isGeneral(generals, person)} />
                  <span className="min-w-0 flex-1 truncate">
                    {person}
                    {person === you ? ' (you)' : ''}
                  </span>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600">
                    {BOARD_ROLE_LABEL[board.members?.[person]] ?? board.members?.[person] ?? ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setFind('');
            }}
            className="mt-2 text-[11px] font-medium text-neutral-500 transition-colors hover:text-neutral-200"
          >
            Done
          </button>
        </div>
      )}
      {people.length === 0 && on.length === 0 && (
        <p className="text-[12px] font-normal text-neutral-600">Nobody is on this board yet.</p>
      )}
    </div>
  );
}

function Fold({ label, icon: Icon, count, children, start = false, show = false }) {
  const [open, setOpen] = React.useState(start);

  React.useEffect(() => {
    if (show) setOpen(true);
  }, [show]);

  return (
    <section className="border-t border-[#17171d] py-4">
      <button
        type="button"
        onClick={() => setOpen((held) => !held)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-neutral-600" strokeWidth={2} />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-neutral-600" strokeWidth={2} />
        )}
        <Icon className="h-3.5 w-3.5 text-neutral-500" strokeWidth={2} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
          {label}
        </span>
        {count > 0 && (
          <span className="text-[11px] tabular-nums text-neutral-600">{count}</span>
        )}
      </button>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}

export default function CardDialog({ board, boards, card, you, generals, actions, error, onClose }) {
  const [comment, setComment] = React.useState('');
  const [step, setStep] = React.useState('');
  const [linkUrl, setLinkUrl] = React.useState('');
  const [linkLabel, setLinkLabel] = React.useState('');
  const [showLink, setShowLink] = React.useState(false);
  const [fileTrouble, setFileTrouble] = React.useState(null);
  const [queue, setQueue] = React.useState([]);
  const [over, setOver] = React.useState(false);
  const [writing, setWriting] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [failed, setFailed] = React.useState('');
  const flight = React.useRef({});
  const now = Date.now();
  const busy = actions.busy;
  const canWrite = board.canWrite;
  const column = board.lists.find((entry) => entry.id === card.list);
  const due = dueState(card, now);
  const steps = card.checklist ?? [];
  const ticked = steps.filter((entry) => entry.done).length;
  const files = card.files ?? [];
  const shots = files.filter(isImage);
  const [looking, setLooking] = React.useState(null);

  const values = React.useMemo(
    () => ({ title: card.title, notes: card.notes ?? '' }),
    [card.title, card.notes],
  );

  const clean = React.useCallback((raw) => {
    const out = { ...raw };
    if ('title' in out) {
      const trimmed = out.title.trim();
      if (!trimmed) delete out.title;
      else out.title = trimmed;
    }
    return out;
  }, []);

  const written = useDraft({
    values,
    clean,
    onSave: (changes) => actions.card.set(card.id, changes),
  });

  const send = React.useCallback(async (where, work) => {
    if (flight.current[where]) return false;
    flight.current[where] = true;
    setFailed('');
    try {
      const done = await work();
      if (!done) setFailed(where);
      return done;
    } finally {
      flight.current[where] = false;
    }
  }, []);

  const addStep = React.useCallback(async () => {
    const text = step.trim();
    if (!text) return;
    if (await send('step', () => actions.card.addStep(card.id, text))) setStep('');
  }, [step, send, actions, card.id]);

  const postComment = React.useCallback(async () => {
    const body = comment.trim();
    if (!body) return;
    if (await send('comment', () => actions.card.comment(card.id, body))) setComment('');
  }, [comment, send, actions, card.id]);

  const addLink = React.useCallback(async () => {
    const url = linkUrl.trim();
    if (!url) return;
    const label = linkLabel.trim();
    if (!(await send('link', () => actions.card.addLink(card.id, label, url)))) return;
    setLinkUrl('');
    setLinkLabel('');
    setShowLink(false);
  }, [linkUrl, linkLabel, send, actions, card.id]);
  const fileBox = React.useRef(null);

  const seat = React.useRef(0);

  const forget = React.useCallback((key) => {
    setQueue((held) => {
      const going = held.find((entry) => entry.key === key);
      if (going?.preview) URL.revokeObjectURL(going.preview);
      return held.filter((entry) => entry.key !== key);
    });
  }, []);

  React.useEffect(
    () => () => {
      for (const entry of queue) if (entry.preview) URL.revokeObjectURL(entry.preview);
    },
    [],
  );

  const takeFiles = React.useCallback(
    async (chosen) => {
      const picked = Array.from(chosen ?? []);
      if (!picked.length) return;
      const room = FILES_MAX - (card.files ?? []).length;
      if (room <= 0) {
        setFileTrouble(`A card holds ${FILES_MAX} files. Take one off before adding another.`);
        return;
      }
      setFileTrouble(
        picked.length > room
          ? `A card holds ${FILES_MAX} files, so ${picked.length - room} of these were left off.`
          : null,
      );

      for (const file of picked.slice(0, room)) {
        seat.current += 1;
        const key = `q${seat.current}`;
        setQueue((held) => [
          ...held,
          {
            key,
            name: file.name || 'Pasted image',
            preview: file.type?.startsWith('image/') ? URL.createObjectURL(file) : null,
            state: 'reading',
            trouble: null,
          },
        ]);
        try {
          const ready = await readAttachment(file);
          setQueue((held) =>
            held.map((entry) => (entry.key === key ? { ...entry, state: 'sending' } : entry)),
          );
          const landed = await send('file', () => actions.card.attach(card.id, [ready]));
          if (!landed) throw new Error('That file could not be attached.');
          forget(key);
        } catch (failure) {
          setQueue((held) =>
            held.map((entry) =>
              entry.key === key ? { ...entry, state: 'failed', trouble: failure.message } : entry,
            ),
          );
        }
      }
      if (fileBox.current) fileBox.current.value = '';
    },
    [card.id, card.files, send, actions, forget],
  );

  React.useEffect(() => {
    if (!canWrite) return undefined;
    function paste(event) {
      const spot = event.target;
      const tag = spot?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || spot?.isContentEditable) return;
      const dropped = Array.from(event.clipboardData?.files ?? []);
      if (!dropped.length) return;
      event.preventDefault();
      takeFiles(dropped);
    }
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [canWrite, takeFiles]);

  const { title, notes } = written.draft;

  const heading = React.useRef(null);
  const stepBox = React.useRef(null);
  React.useLayoutEffect(() => {
    const node = heading.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [title]);

  React.useLayoutEffect(() => {
    const node = stepBox.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [step]);

  const carrying = (event) =>
    canWrite && Array.from(event.dataTransfer?.types ?? []).includes('Files');

  return (
    <div
      onDragOver={(event) => {
        if (!carrying(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setOver(false);
      }}
      onDrop={(event) => {
        if (!carrying(event)) return;
        event.preventDefault();
        setOver(false);
        takeFiles(event.dataTransfer.files);
      }}
      className="relative grid gap-x-8 gap-y-6 md:grid-cols-[1fr_260px] md:gap-y-0"
    >
      {over && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-purple-500/70 bg-[#0a0a0d]/92">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-purple-200">
            <Upload className="h-4 w-4" strokeWidth={2} />
            Drop it to put it on this card
          </p>
        </div>
      )}
      <div className="order-1 min-w-0 md:col-start-1 md:row-start-1">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
          <span className="text-neutral-300">{board.name}</span>
          <ChevronRight className="h-3 w-3" strokeWidth={2} />
          <span>{column?.name ?? 'a column'}</span>
          {card.done && (
            <span className="inline-flex items-center gap-1 border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
              <Check className="h-3 w-3" strokeWidth={2.5} />
              Done
            </span>
          )}
          {due && !card.done && (
            <span className={`inline-flex items-center gap-1 border px-2 py-0.5 ${DUE_TONE[due.tone]}`}>
              <CalendarClock className="h-3 w-3" strokeWidth={2} />
              {due.tone === 'late'
                ? `Overdue · ${gapWords(Date.parse(card.due), now)}`
                : `${dayWords(Date.parse(card.due), now)}, ${timeWords(Date.parse(card.due))}`}
            </span>
          )}
          {card.archived && (
            <span className="border border-[#282832] px-2 py-0.5 text-neutral-400">Archived</span>
          )}
        </div>

        <textarea
          ref={heading}
          rows={1}
          value={title}
          maxLength={140}
          disabled={!canWrite}
          aria-label="Card title"
          onChange={(event) => written.set('title', event.target.value)}
          onFocus={() => written.hold('title')}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.currentTarget.blur();
          }}
          onBlur={() => written.release('title', !title.trim())}
          className="w-full resize-none overflow-hidden border border-transparent bg-transparent text-[19px] font-normal leading-snug text-white outline-none transition-colors hover:border-[#282832] focus:border-purple-500/60 disabled:hover:border-transparent"
        />

        <p className="mt-2 text-[11px] font-normal text-neutral-600">
          Made by {card.createdBy} {ago(card.created, now)}
          {card.completed ? ` · finished by ${card.completedBy} ${ago(card.completed, now)}` : ''}
        </p>
      </div>

      <div className="order-3 min-w-0 md:order-none md:col-start-1 md:row-start-2">
        <div className="mt-0 md:mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <Label>Notes</Label>
            <span className="mb-2 flex flex-wrap items-center gap-2">
              <SaveMark
                state={written.state}
                at={written.at}
                disabled={busy}
                onSave={written.save}
                now={now}
              />
              {canWrite && (
                <button
                  type="button"
                  onClick={() => {
                    written.hold('notes');
                    setWriting(true);
                  }}
                  className="inline-flex items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-2 py-[3px] text-[11px] font-semibold tracking-wide text-neutral-400 transition-colors hover:border-[#3f3f4c] hover:text-neutral-100"
                >
                  <Maximize2 className="h-3 w-3" strokeWidth={2} />
                  Write it bigger
                </button>
              )}
            </span>
          </div>
          <TextArea
            rows={4}
            value={notes}
            maxLength={NOTES_MAX}
            disabled={!canWrite}
            placeholder="What is this about? Anything the next person needs to know."
            onChange={(event) => written.set('notes', event.target.value)}
            onFocus={() => written.hold('notes')}
            onBlur={() => written.release('notes')}
          />
          {canWrite && (
            <p className="mt-2 text-[11px] font-normal leading-relaxed text-neutral-600">
              {written.dirty
                ? 'This saves itself a moment after you stop typing — or press Save now, or ⌘/Ctrl + S.'
                : 'Typing here saves itself. **Bold**, __underlined__, # a heading — or press Write it bigger for the buttons.'}
            </p>
          )}
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Label count={steps.length ? `${ticked}/${steps.length}` : 0}>Checklist</Label>
            {steps.length > 0 && (
              <span className="mb-2 w-32">
                <Progress done={ticked} total={steps.length} />
              </span>
            )}
          </div>
          {steps.length > 0 && (
            <ul className="mb-3 space-y-1">
              {steps.map((entry) => (
                <li key={entry.id} className="group flex items-start gap-2">
                  <button
                    type="button"
                    disabled={!canWrite}
                    aria-label={entry.done ? `Untick ${entry.text}` : `Tick ${entry.text}`}
                    onClick={() => actions.card.setStep(card.id, entry.id, { done: !entry.done })}
                    className={`mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center border transition-colors ${
                      entry.done
                        ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-400'
                        : 'border-[#282832] bg-[#0a0a0d] text-transparent hover:border-neutral-600'
                    }`}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </button>
                  <span
                    className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] font-normal leading-relaxed ${
                      entry.done ? 'text-neutral-600 line-through' : 'text-neutral-300'
                    }`}
                  >
                    {entry.text}
                  </span>
                  {canWrite && (
                    <button
                      type="button"
                      aria-label={`Delete ${entry.text}`}
                      onClick={() => actions.card.dropStep(card.id, entry.id)}
                      className="mt-[2px] shrink-0 text-neutral-700 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100 focus:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canWrite && (
            <div className="flex items-start gap-2">
              <textarea
                ref={stepBox}
                rows={1}
                value={step}
                placeholder="Add a step"
                aria-label="Add a step"
                onChange={(event) => setStep(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey || !step.trim()) return;
                  event.preventDefault();
                  addStep();
                }}
                className={`${FIELD_CLASS} max-h-56 resize-none overflow-y-auto leading-relaxed`}
              />
              <Button type="button" disabled={busy || !step.trim()} onClick={addStep}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Add
              </Button>
            </div>
          )}
          {canWrite && failed === 'step' && error && (
            <p className="mt-2 text-[12px] font-normal leading-relaxed text-rose-300">
              {error} Your step is still in the box.
            </p>
          )}
        </div>

        <div className="mt-6">
          <Label count={(card.comments ?? []).length}>Comments</Label>
          {canWrite && (
            <div className="mb-3 flex items-start gap-2">
              <textarea
                rows={1}
                value={comment}
                maxLength={1000}
                placeholder="Leave a note for whoever picks this up"
                aria-label="Leave a comment"
                onChange={(event) => setComment(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey || !comment.trim()) return;
                  event.preventDefault();
                  postComment();
                }}
                className={`${FIELD_CLASS} max-h-56 resize-none overflow-y-auto leading-relaxed`}
              />
              <Button type="button" disabled={busy || !comment.trim()} onClick={postComment}>
                <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
                Post
              </Button>
            </div>
          )}
          {canWrite && failed === 'comment' && error && (
            <p className="mb-3 text-[12px] font-normal leading-relaxed text-rose-300">
              {error} Your comment is still in the box.
            </p>
          )}
          {(card.comments ?? []).length === 0
            ? !canWrite && (
                <p className="text-[12px] font-normal text-neutral-600">Nothing said yet.</p>
              )
            : (
              <ul className="divide-y divide-[#1e1e26] border-t border-[#1e1e26]">
                {[...card.comments].reverse().map((entry) => (
                  <li key={entry.id} className="group flex items-start gap-2 py-2.5">
                    <Avatar name={entry.by} />
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-words text-[13px] font-normal leading-relaxed text-neutral-300">
                        {entry.body}
                      </p>
                      <p className="mt-0.5 text-[11px] text-neutral-600">
                        {entry.by}
                        <span className="px-1.5 text-neutral-700">·</span>
                        {ago(entry.at, now)}
                      </p>
                    </div>
                    {(entry.by === you || board.canAdmin) && (
                      <button
                        type="button"
                        aria-label="Delete comment"
                        onClick={() => actions.card.dropComment(card.id, entry.id)}
                        className="mt-[2px] shrink-0 text-neutral-700 opacity-0 transition-opacity hover:text-rose-400 focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </div>

        <div className="mt-6">
          <Fold
            label="Files"
            icon={Paperclip}
            count={files.length}
            start={files.length > 0}
            show={queue.length > 0}
          >
            {(files.length > 0 || queue.length > 0) && (
              <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {files.map((entry) => (
                  <li
                    key={entry.id}
                    className="group relative border border-[#282832] bg-[#0a0a0d] transition-colors hover:border-[#3f3f4c]"
                  >
                    {isImage(entry) ? (
                      <button
                        type="button"
                        onClick={() => setLooking(shots.findIndex((held) => held.id === entry.id))}
                        className="block w-full text-left"
                      >
                        <FileFace board={board} card={card} entry={entry} />
                      </button>
                    ) : (
                      <a
                        href={cardFileUrl(board.id, card.id, entry.id)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block"
                      >
                        <FileFace board={board} card={card} entry={entry} />
                      </a>
                    )}
                    <span className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <a
                        href={cardFileUrl(board.id, card.id, entry.id, true)}
                        aria-label={`Download ${entry.name}`}
                        className="border border-[#282832] bg-[#0a0a0d]/90 p-1 text-neutral-400 transition-colors hover:text-white"
                      >
                        <Download className="h-3.5 w-3.5" strokeWidth={2} />
                      </a>
                      {canWrite && (
                        <button
                          type="button"
                          aria-label={`Take ${entry.name} off`}
                          onClick={() => actions.card.dropFile(card.id, entry.id)}
                          className="border border-[#282832] bg-[#0a0a0d]/90 p-1 text-neutral-400 transition-colors hover:text-rose-400"
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
                {queue.map((entry) => (
                  <Pending key={entry.key} entry={entry} onForget={() => forget(entry.key)} />
                ))}
              </ul>
            )}
            {canWrite && (
              <>
                <button
                  type="button"
                  disabled={files.length >= FILES_MAX}
                  onClick={() => fileBox.current?.click()}
                  className="flex w-full flex-col items-center gap-1.5 border border-dashed border-[#282832] px-3 py-5 text-center transition-colors hover:border-purple-500/50 hover:bg-purple-500/[0.04] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[#282832] disabled:hover:bg-transparent"
                >
                  <Upload className="h-4 w-4 text-neutral-500" strokeWidth={2} />
                  <span className="text-[12.5px] font-medium text-neutral-300">
                    {files.length >= FILES_MAX
                      ? `A card holds ${FILES_MAX} files`
                      : 'Add a picture or a PDF'}
                  </span>
                  <span className="text-[11px] font-normal leading-relaxed text-neutral-600">
                    Drop one anywhere on this card, or paste a screenshot with {PASTE_KEYS}. Big
                    images are resized before they go.
                  </span>
                </button>
                <input
                  ref={fileBox}
                  type="file"
                  multiple
                  accept={FILE_TYPES.join(',')}
                  className="hidden"
                  onChange={(event) => takeFiles(event.target.files)}
                />
                {fileTrouble && (
                  <p className="mt-2 text-[12px] font-normal leading-relaxed text-amber-300">
                    {fileTrouble}
                  </p>
                )}
              </>
            )}
          </Fold>

          <Fold label="Links" icon={Link2} count={(card.links ?? []).length} start={(card.links ?? []).length > 0}>
            {(card.links ?? []).length > 0 && (
              <ul className="mb-3 space-y-1">
                {card.links.map((entry) => (
                  <li key={entry.id} className="group flex items-center gap-2">
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex min-w-0 flex-1 items-center gap-2 text-[13px] font-normal text-neutral-300 transition-colors hover:text-white"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-500" strokeWidth={2} />
                      <span className="truncate">{entry.label}</span>
                    </a>
                    {canWrite && (
                      <button
                        type="button"
                        aria-label={`Delete ${entry.label}`}
                        onClick={() => actions.card.dropLink(card.id, entry.id)}
                        className="text-neutral-700 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100 focus:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canWrite &&
              (showLink ? (
                <div className="space-y-2">
                  <TextInput
                    autoFocus
                    value={linkUrl}
                    maxLength={400}
                    placeholder="https://"
                    onChange={(event) => setLinkUrl(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <TextInput
                      value={linkLabel}
                      maxLength={60}
                      placeholder="What it is (optional)"
                      onChange={(event) => setLinkLabel(event.target.value)}
                    />
                    <Button
                      type="button"
                      tone="solid"
                      disabled={busy || !linkUrl.trim()}
                      onClick={addLink}
                    >
                      Add
                    </Button>
                  </div>
                  {failed === 'link' && error && (
                    <p className="text-[12px] font-normal leading-relaxed text-rose-300">
                      {error} Your link is still in the box.
                    </p>
                  )}
                </div>
              ) : (
                <Button type="button" onClick={() => setShowLink(true)}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  Add a link
                </Button>
              ))}
          </Fold>

          <Fold label="History" icon={History} count={(card.activity ?? []).length}>
            {(card.activity ?? []).length === 0 ? (
              <Empty>Nothing has happened yet.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {[...card.activity].reverse().map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="text-[12px] font-normal text-neutral-500">
                    <span className="text-neutral-300">{entry.by}</span>{' '}
                    {ACTIVITY[entry.what] ?? entry.what}
                    {entry.detail?.list ? ` to ${entry.detail.list}` : ''}
                    {entry.detail?.title ? ` — “${entry.detail.title}”` : ''}
                    {entry.detail?.label ? ` (${entry.detail.label})` : ''} · {ago(entry.at, now)}
                  </li>
                ))}
              </ul>
            )}
          </Fold>
        </div>
      </div>

      <aside className="order-2 space-y-5 md:order-none md:col-start-2 md:row-start-1 md:row-span-2">
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              tone={card.done ? 'quiet' : 'solid'}
              className="flex-1"
              onClick={() => actions.card.set(card.id, { done: !card.done })}
            >
              {card.done ? (
                <Circle className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {card.done ? 'Reopen' : 'Mark done'}
            </Button>
            <Menu label="More card actions" icon={MoreHorizontal}>
              <MenuItem icon={Copy} onClick={() => actions.card.copy(card.id)}>
                Duplicate card
              </MenuItem>
              <MenuItem
                icon={card.archived ? ArchiveRestore : Archive}
                onClick={() => actions.card.set(card.id, { archived: !card.archived })}
              >
                {card.archived ? 'Restore card' : 'Archive card'}
              </MenuItem>
            </Menu>
          </div>
        )}

        <div>
          <Label>Due</Label>
          <WhenField
            value={card.due}
            now={now}
            done={card.done}
            disabled={!canWrite}
            remind={board.remind}
            assigned={(card.assignees ?? []).length}
            onChange={(iso) => actions.card.set(card.id, { due: iso })}
          />
        </div>

        <OnIt card={card} board={board} you={you} generals={generals} canWrite={canWrite} actions={actions} />

        {(board.labels ?? []).length > 0 && (
          <div>
            <Label>Labels</Label>
            <div className="flex flex-wrap gap-1.5">
              {board.labels.map((label) => {
                const on = (card.labels ?? []).includes(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    disabled={!canWrite}
                    onClick={() =>
                      actions.card.set(card.id, {
                        labels: on
                          ? card.labels.filter((entry) => entry !== label.id)
                          : [...(card.labels ?? []), label.id],
                      })
                    }
                    className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] font-semibold transition-opacity ${
                      shade(label.colour).chip
                    } ${on ? '' : 'opacity-40'}`}
                  >
                    <Tag className="h-3 w-3" strokeWidth={2} />
                    {label.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {canWrite && (
          <div>
            <Label>Column</Label>
            <Select
              value={card.list}
              aria-label="Which column this card sits in"
              onChange={(event) => actions.card.move(card.id, event.target.value, 0)}
            >
              {board.lists.map((entry) => {
                const cap = capOf(entry, card.archived);
                const room =
                  !cap || entry.id === card.list || loadOf(board, entry) < cap;
                return (
                  <option key={entry.id} value={entry.id} disabled={!room}>
                    {entry.name}
                    {entry.done ? ' (finished)' : ''}
                    {room ? '' : ' — full'}
                  </option>
                );
              })}
            </Select>
          </div>
        )}

        {!canWrite && (
          <p className="border border-[#282832] bg-[#0a0a0d] px-3 py-3 text-[12px] font-normal leading-relaxed text-neutral-500">
            You can read this board but not change it. Ask a board owner for edit access.
          </p>
        )}
      </aside>

      {canWrite && (
        <div className="order-5 flex flex-wrap items-center gap-2 border-t border-[#282832] pt-4 md:col-start-2 md:row-start-3">
          <Button type="button" disabled={busy} onClick={() => setSending(true)}>
            <ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Move to another board
          </Button>
          <Button
            type="button"
            tone="danger"
            disabled={busy}
            onClick={() => {
              actions.card.drop(card.id);
              onClose();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            Delete card
          </Button>
          <span className="text-[11px] font-normal text-neutral-600">
            You get ten seconds to undo it.
          </span>
        </div>
      )}

      {looking !== null && shots[looking] && (
        <Viewer
          board={board}
          card={card}
          files={shots}
          at={looking}
          onStep={setLooking}
          onClose={() => setLooking(null)}
        />
      )}

      {sending && (
        <MoveDialog
          boards={boards}
          board={board}
          card={card}
          busy={busy}
          onClose={() => setSending(false)}
          onMove={async (to, list) => {
            setSending(false);
            const done = await actions.card.sendTo(card.id, to, list);
            if (done) onClose();
          }}
        />
      )}

      {writing && (
        <NoteEditor
          title={`Notes — ${card.title}`}
          value={notes}
          disabled={!canWrite || busy}
          state={written.state}
          at={written.at}
          onChange={(next) => written.set('notes', next)}
          onSave={written.save}
          onClose={() => {
            setWriting(false);
            written.release('notes');
          }}
        />
      )}
    </div>
  );
}
