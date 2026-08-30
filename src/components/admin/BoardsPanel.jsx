import React from 'react';
import {
  SquareKanban,
  Plus,
  RefreshCw,
  ChevronLeft,
  Settings2,
  Archive,
  LayoutGrid,
  Filter,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Button, Notice, Pill, SubNav, SearchInput, TextInput, Select, Field } from './ui';
import ArtField from './boards/Art.jsx';
import People from './boards/People';
import Columns from './boards/Columns';
import CardDialog from './boards/CardDialog';
import Settings from './boards/Settings';
import Tour, { TourButton } from './boards/Tour';
import { useActions } from './boards/actions';
import { useLive } from './boards/live';
import {
  Avatar,
  BoardBanner,
  BoardMark,
  Chip,
  Dialog,
  Live,
  Progress,
  SaveMark,
  UndoBar,
  seenChoices,
  isGeneral,
  keyholderLine,
  seenBy,
  ago,
  plural,
  shade,
  tally,
} from './boards/shared';
import { FactSheet, FactStrip, PurposeMark, PurposePicker } from './boards/Purpose';
import { factHaystack, factLead, purposeIcon, purposeOf } from './boards/facts';
import {
  BOARD_ROLE_LABEL,
  answerBoardAsk,
  createBoard,
  fetchBoard,
  fetchBoards,
  setBoardArt,
} from '../../lib/admin';

const COLOURS = ['purple', 'sky', 'emerald', 'amber', 'rose', 'slate'];
const TABS = [
  { id: 'boards', label: 'Boards', icon: LayoutGrid },
  { id: 'archive', label: 'Archived', icon: Archive },
];
const SORTS = [
  { id: 'touched', label: 'Recently touched' },
  { id: 'name', label: 'Name' },
  { id: 'open', label: 'Most left to do' },
];

function readHash() {
  if (typeof window === 'undefined') return { tab: 'boards', board: null, card: null };
  const parts = window.location.hash.replace('#', '').split('/');
  const second = parts[1] ?? '';
  if (/^[a-f0-9]{8,32}$/.test(second)) {
    return {
      tab: 'boards',
      board: second,
      card: /^[a-f0-9]{8,32}$/.test(parts[2] ?? '') ? parts[2] : null,
    };
  }
  return { tab: TABS.some((tab) => tab.id === second) ? second : 'boards', board: null, card: null };
}

function NewBoard({
  onCreate,
  onClose,
  busy,
  accounts,
  you,
  roles,
  limits,
  keyholders,
  purposes,
  generals,
  choices,
}) {
  const [name, setName] = React.useState('');
  const [note, setNote] = React.useState('');
  const [colour, setColour] = React.useState('purple');
  const [visibility, setVisibility] = React.useState('private');
  const [about, setAbout] = React.useState('personal');
  const [facts, setFacts] = React.useState({});
  const [art, setArt] = React.useState({});
  const [seats, setSeats] = React.useState({});

  const draft = { colour, art: {}, name: name || 'New board' };
  const purpose = purposeOf(purposes, about);
  const kept = Object.fromEntries(
    (purpose.fields ?? [])
      .map((field) => [field.id, (facts[field.id] ?? '').trim()])
      .filter(([, value]) => value),
  );

  return (
    <Dialog
      title="New board"
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            tone="solid"
            disabled={busy || !name.trim()}
            onClick={() =>
              onCreate({
                payload: {
                  name: name.trim(),
                  note: note.trim(),
                  colour,
                  visibility,
                  purpose: about,
                  facts: kept,
                  people: Object.entries(seats).map(([person, role]) => ({ name: person, role })),
                },
                art,
              })
            }
          >
            Create board
          </Button>
        </>
      }
    >
      <Field label="Name" htmlFor="new-board-name">
        <TextInput
          id="new-board-name"
          autoFocus
          value={name}
          maxLength={60}
          placeholder="Shield v2, Site rebuild, Client work…"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="What it is for" htmlFor="new-board-note" hint="Optional, one line.">
        <TextInput
          id="new-board-note"
          value={note}
          maxLength={240}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <Field label="What kind of board" hint="It decides which details the board keeps. You can change it later.">
        <PurposePicker purposes={purposes} value={about} disabled={busy} onPick={setAbout} />
        {(purpose.fields ?? []).length > 0 && (
          <div className="mt-4">
            <FactSheet
              purpose={purpose}
              purposes={purposes}
              values={facts}
              disabled={busy}
              onSet={(id, value) => setFacts((held) => ({ ...held, [id]: value }))}
            />
          </div>
        )}
      </Field>
      <Field label="Logo">
        <ArtField
          kind="logo"
          board={draft}
          colour={colour}
          pending={art.logo}
          disabled={busy}
          onPick={(result) => setArt((held) => ({ ...held, logo: result }))}
          onClear={() => setArt((held) => ({ ...held, logo: undefined }))}
        />
      </Field>
      <Field label="Banner">
        <ArtField
          kind="banner"
          board={draft}
          colour={colour}
          pending={art.banner}
          disabled={busy}
          onPick={(result) => setArt((held) => ({ ...held, banner: result }))}
          onClear={() => setArt((held) => ({ ...held, banner: undefined }))}
        />
      </Field>
      <Field
        label="Colour"
        hint="Stands in wherever there is no logo or banner."
      >
        <div className="flex gap-2">
          {COLOURS.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-label={entry}
              aria-pressed={colour === entry}
              onClick={() => setColour(entry)}
              className={`h-7 w-7 border transition-transform ${shade(entry).stripe} ${
                colour === entry ? 'scale-110 border-white' : 'border-transparent hover:scale-105'
              }`}
            />
          ))}
        </div>
      </Field>
      <Field label="Who can see it" hint="You can change this later, and add people either way.">
        <div className="grid gap-2 sm:grid-cols-3">
          {seenChoices(choices).map((choice) => {
            const Icon = choice.icon;
            const active = visibility === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                aria-pressed={active}
                onClick={() => setVisibility(choice.id)}
                className={`border px-3 py-2.5 text-left transition-colors ${
                  active
                    ? 'border-purple-500/50 bg-purple-500/10'
                    : 'border-[#282832] bg-[#0a0a0d] hover:border-[#3a3a46]'
                }`}
              >
                <span className="mb-1 inline-flex items-center gap-2 text-[12px] font-semibold text-neutral-200">
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  {choice.title}
                </span>
                <span className="block text-[11px] font-normal leading-relaxed text-neutral-500">
                  {choice.body}
                </span>
              </button>
            );
          })}
        </div>
        {visibility === 'sealed' && (
          <p className="mt-2 text-[11px] font-normal leading-relaxed text-purple-200/80">
            {keyholderLine(keyholders)}
          </p>
        )}
      </Field>
      <Field
        label="People"
        hint="You are the owner. Anyone you name here is asked to join the moment the board exists, and lands on it when they accept."
      >
        <People
          members={{
            ...Object.fromEntries((keyholders ?? []).map((name) => [name, 'owner'])),
            [you]: 'owner',
          }}
          asks={Object.entries(seats).map(([who, role]) => ({ id: who, who, role, by: you }))}
          accounts={accounts}
          you={you}
          roles={roles}
          visibility={visibility}
          canAdmin
          busy={busy}
          limit={limits?.members}
          pinned={[you]}
          keyholders={keyholders}
          generals={generals}
          onAsk={(name, role) => {
            setSeats((held) => ({ ...held, [name]: role }));
            return true;
          }}
          onWithdraw={(person) =>
            setSeats((held) => {
              const next = { ...held };
              delete next[person];
              return next;
            })
          }
          onSet={(person, role) =>
            setSeats((held) => (person === you ? held : { ...held, [person]: role }))
          }
          onDrop={(person) =>
            setSeats((held) => {
              const next = { ...held };
              delete next[person];
              return next;
            })
          }
        />
      </Field>
      <p className="text-[12px] font-normal leading-relaxed text-neutral-500">
        It opens with three columns — To do, Doing, Done — and a card dropped in the last one counts
        as finished. Rename them, add your own, or make a different column the finish line.
      </p>
    </Dialog>
  );
}

function Here({ people }) {
  return (
    <span
      title={`${people.join(', ')} ${people.length === 1 ? 'is' : 'are'} looking at this board right now.`}
      className="inline-flex items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-2 py-1"
    >
      <span className="flex -space-x-1.5">
        {people.slice(0, 3).map((name) => (
          <Avatar key={name} name={name} />
        ))}
      </span>
      <span className="text-[11px] font-normal text-neutral-400">
        {people.length > 3 ? `+${people.length - 3} here` : 'here now'}
      </span>
    </span>
  );
}

function BoardCard({ board, purposes, generals, mark, onOpen }) {
  const counts = board.counts ?? {};
  const people = Object.keys(board.members ?? {});
  const purpose = purposeOf(purposes, board.purpose);
  const lead = factLead(purpose, board.facts);
  return (
    <button
      type="button"
      data-tour={mark ? 'boards-tile' : undefined}
      onClick={() => onOpen(board.id)}
      className="flex flex-col items-start border border-[#282832] bg-[#0a0a0d] text-left transition-colors hover:border-[#3f3f4c]"
    >
      {board.art?.banner ? (
        <BoardBanner board={board} className="h-20" />
      ) : (
        <span className={`h-1 w-full ${shade(board.colour).stripe}`} />
      )}
      <span className="flex w-full flex-1 flex-col p-5">
        <span className="mb-1 flex items-center gap-2.5">
          <BoardMark board={board} size="sm" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white">
            {board.name}
          </span>
          {(() => {
            const seen = seenBy(board.visibility);
            const Icon = seen.icon;
            return (
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${
                  board.visibility === 'sealed' ? 'text-purple-300' : 'text-neutral-600'
                }`}
                aria-label={seen.title}
                strokeWidth={2}
              />
            );
          })()}
        </span>

        <span className="mb-2 block min-h-[18px] text-[12px] font-normal leading-relaxed text-neutral-500">
          {board.note || 'No description.'}
        </span>

        <span className="mb-4 flex min-h-[15px] items-center gap-1.5 text-[11px] font-normal text-neutral-600">
          {(board.purpose && board.purpose !== 'personal') || lead ? (
            <>
              <PurposeMark purposes={purposes} board={board} />
              {lead && (
                <span className="min-w-0 truncate">
                  · <span className="text-neutral-400">{lead.text}</span>
                </span>
              )}
            </>
          ) : null}
        </span>

        <span className="mt-auto block">
          <span className="mb-3 block">
            <Progress done={counts.done ?? 0} total={counts.cards ?? 0} />
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone="neutral">
              {counts.cards ? `${counts.done ?? 0} of ${counts.cards} done` : 'No cards yet'}
            </Pill>
            {counts.overdue > 0 && <Pill tone="rose">{counts.overdue} overdue</Pill>}
            {counts.mine > 0 && <Pill tone="purple">{counts.mine} on you</Pill>}
            {board.seat === 'viewer' && <Pill tone="amber">Read only</Pill>}
          </span>
        </span>

        <span className="mt-4 flex items-center gap-2">
          <span className="flex -space-x-1.5">
            {people.slice(0, 4).map((name) => (
              <Avatar key={name} name={name} crowned={isGeneral(generals, name)} />
            ))}
          </span>
          {people.length > 4 && (
            <span className="text-[11px] text-neutral-600">+{people.length - 4}</span>
          )}
          <span className="ml-auto text-[11px] font-normal text-neutral-600">
            {board.changed ? `Touched ${ago(board.changed, Date.now())}` : ''}
          </span>
        </span>
      </span>
    </button>
  );
}

export default function BoardsPanel() {
  const [tab, setTab] = React.useState(() => readHash().tab);
  const [openId, setOpenId] = React.useState(() => readHash().board);
  const [openCard, setOpenCard] = React.useState(() => readHash().card);
  const [index, setIndex] = React.useState(null);
  const [board, setBoard] = React.useState(null);
  const [spec, setSpec] = React.useState(null);
  const [generals, setGenerals] = React.useState([]);
  const [staff, setStaff] = React.useState([]);
  const [settings, setSettings] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [answering, setAnswering] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [beat, setBeat] = React.useState(0);
  const [tour, setTour] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState('touched');
  const [kind, setKind] = React.useState('');
  const [filters, setFilters] = React.useState({
    text: '',
    mine: false,
    hideDone: false,
    label: '',
    archived: false,
  });
  const cancelled = React.useRef(false);
  const indexed = React.useRef(false);

  const go = React.useCallback((next) => {
    const wanted = next.tab ?? 'boards';
    if (next.board) setNotice(null);
    setTab(wanted);
    setOpenId(next.board ?? null);
    setOpenCard(next.card ?? null);
    if (typeof window === 'undefined') return;
    const hash = next.board
      ? `#boards/${next.board}${next.card ? `/${next.card}` : ''}`
      : `#boards/${wanted}`;
    window.history.replaceState(null, '', hash);
  }, []);

  const actions = useActions({
    board,
    setBoard,
    setError,
    onGone: () => go({ tab: 'boards' }),
  });

  const load = React.useCallback(
    async (quiet) => {
      if (!quiet) setLoading(true);
      try {
        if (openId) {
          const result = await fetchBoard(openId);
          if (cancelled.current) return;
          setBoard(result.board);
          if (result.purposes) setSpec(result.purposes);
          if (result.generals) setGenerals(result.generals);
          if (result.staff) setStaff(result.staff);
          if (!quiet || !indexed.current) {
            const listing = await fetchBoards(false);
            if (cancelled.current) return;
            indexed.current = true;
            setIndex(listing);
            if (listing.generals) setGenerals(listing.generals);
            if (listing.staff) setStaff(listing.staff);
          }
        } else {
          const result = await fetchBoards(tab === 'archive');
          if (cancelled.current) return;
          indexed.current = true;
          setIndex(result);
          if (result.purposes) setSpec(result.purposes);
          if (result.generals) setGenerals(result.generals);
          if (result.staff) setStaff(result.staff);
        }
        if (!cancelled.current) setError(null);
      } catch (failure) {
        if (!cancelled.current && !quiet) {
          setError(failure.message);
          if (openId) setBoard(null);
        }
      } finally {
        if (!cancelled.current) setLoading(false);
      }
    },
    [openId, tab],
  );

  const answerAsk = React.useCallback(
    async (id, accept) => {
      setAnswering(true);
      setError(null);
      try {
        const result = await answerBoardAsk(id, accept);
        await load(true);
        if (result?.joined) go({ tab: 'boards', board: id });
      } catch (failure) {
        if (!cancelled.current) setError(failure.message);
      } finally {
        if (!cancelled.current) setAnswering(false);
      }
    },
    [load, go],
  );

  React.useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  React.useEffect(() => {
    function follow() {
      const next = readHash();
      setTab(next.tab);
      setOpenId(next.board);
      setOpenCard(next.card);
    }
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  React.useEffect(() => {
    if (!openId) setBoard(null);
    load();
  }, [openId, tab, load]);

  const onPulse = React.useCallback(
    (map) => {
      if (openId) {
        if (!(openId in map)) {
          setNotice('That board is gone — somebody deleted it, or took you off it.');
          go({ tab: 'boards' });
          return;
        }
        if (map[openId] === board?.rev) return;
      }
      setBeat((held) => held + 1);
      load(true);
    },
    [openId, board?.rev, load, go],
  );

  const live = useLive({ hold: dragging || creating || actions.busy, watching: openId, onPulse });

  React.useEffect(() => {
    if (!openCard || !board || board.cards[openCard]) return;
    go({ tab: 'boards', board: board.id });
  }, [openCard, board, go]);

  const accounts = index?.accounts ?? [];
  const you = index?.you;
  const card = board && openCard ? board.cards[openCard] : null;
  const cardRank = React.useMemo(() => {
    if (!board || !card) return 0;
    const holder = board.lists.find((entry) => entry.cards.includes(card.id));
    if (!holder) return 0;
    let place = 0;
    for (const id of holder.cards) {
      const other = board.cards[id];
      if (!other) continue;
      if (Boolean(other.archived) !== Boolean(card.archived)) continue;
      place += 1;
      if (id === card.id) return place;
    }
    return 0;
  }, [board, card]);

  const boards = React.useMemo(() => {
    const wanted = search.trim().toLowerCase();
    const rows = (index?.boards ?? [])
      .filter((entry) => !kind || (entry.purpose ?? 'personal') === kind)
      .filter(
        (entry) =>
          !wanted ||
          `${entry.name} ${entry.note ?? ''} ${factHaystack(spec, entry)}`
            .toLowerCase()
            .includes(wanted),
      );
    const sorted = [...rows];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'touched') sorted.sort((a, b) => (b.changed ?? '').localeCompare(a.changed ?? ''));
    if (sort === 'open')
      sorted.sort(
        (a, b) =>
          b.counts.cards - b.counts.done - (a.counts.cards - a.counts.done) ||
          a.name.localeCompare(b.name),
      );
    return sorted;
  }, [index, search, sort, kind, spec]);

  const kinds = React.useMemo(() => {
    const seen = new Set((index?.boards ?? []).map((entry) => entry.purpose ?? 'personal'));
    return (spec ?? []).filter((entry) => seen.has(entry.id));
  }, [index, spec]);

  if (openId && board) {
    const counts = tally(board, you);
    const people = Object.keys(board.members ?? {});
    const filtered =
      filters.text || filters.mine || filters.hideDone || filters.label || filters.archived;
    return (
      <div className="space-y-6">
        {error && (
          <Notice tone="rose" icon={AlertTriangle}>
            {error}
          </Notice>
        )}

        {board.art?.banner && <BoardBanner board={board} className="h-32 sm:h-40" />}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => go({ tab: 'boards' })}
              className="mb-2 inline-flex items-center gap-1.5 py-1.5 text-[12px] font-semibold tracking-wide text-neutral-500 transition-colors hover:text-neutral-200 sm:py-0"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
              All boards
            </button>
            <h2
              data-tour="board-head"
              className="flex items-center gap-3 text-2xl font-normal tracking-tight text-white"
            >
              {board.art?.logo ? (
                <BoardMark board={board} size="lg" />
              ) : (
                <span className={`h-5 w-1 ${shade(board.colour).stripe}`} />
              )}
              {board.name}
            </h2>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] font-normal text-neutral-500">
              {board.note && <span>{board.note}</span>}
              <Pill tone={board.visibility === 'team' ? 'purple' : 'neutral'}>
                {seenBy(board.visibility).short}
              </Pill>
              {board.archived && <Pill tone="amber">Archived</Pill>}
              {!board.canWrite && <Pill tone="amber">Read only</Pill>}
              <span>
                {plural(counts.cards, 'card')} · {counts.done} done
                {counts.overdue ? ` · ${counts.overdue} overdue` : ''} · {people.length}{' '}
                {people.length === 1 ? 'person' : 'people'}
              </span>
            </p>
            <div className="mt-3">
              <FactStrip board={board} purposes={spec} onMore={() => setSettings(true)} />
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
            <span className="flex items-center gap-1.5" title={`${people.length} on this board`}>
              <span className="flex -space-x-1.5">
                {people.slice(0, 5).map((name) => (
                  <Avatar key={name} name={name} size="lg" crowned={isGeneral(generals, name)} />
                ))}
              </span>
              {people.length > 5 && (
                <span className="text-[11px] font-normal text-neutral-600">
                  +{people.length - 5}
                </span>
              )}
            </span>
            {live.here.length > 0 && <Here people={live.here} />}
            <span data-tour="board-live" className="flex items-center gap-2">
              <SaveMark
                state={actions.busy ? 'saving' : actions.savedAt ? 'saved' : 'rest'}
                at={actions.savedAt}
              />
              <Live state={live.state} beat={beat} />
            </span>
            <Button type="button" data-tour="board-settings" onClick={() => setSettings(true)}>
              <Settings2 className="h-3.5 w-3.5" strokeWidth={2} />
              {board.seat === 'owner' ? 'People & settings' : 'People'}
            </Button>
            <TourButton onClick={() => setTour(true)} />
            <Button type="button" disabled={loading} onClick={() => load()}>
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              Refresh
            </Button>
          </div>
        </div>

        <div
          data-tour="board-filters"
          className="flex flex-wrap items-center gap-2 border border-[#282832] bg-[#0a0a0d] px-4 py-3"
        >
          <span className="hidden items-center gap-2 pr-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-600 sm:inline-flex">
            <Filter className="h-3.5 w-3.5" strokeWidth={2} />
            Show
          </span>
          <div className="w-full sm:w-auto sm:min-w-[160px] sm:flex-1">
            <SearchInput
              value={filters.text}
              placeholder="Search this board"
              onChange={(event) => setFilters((held) => ({ ...held, text: event.target.value }))}
            />
          </div>
          {(board.labels ?? []).map((label) => (
            <Chip
              key={label.id}
              active={filters.label === label.id}
              onClick={() =>
                setFilters((held) => ({ ...held, label: held.label === label.id ? '' : label.id }))
              }
            >
              <span className={`h-2 w-2 ${shade(label.colour).dot}`} />
              {label.name}
            </Chip>
          ))}
          <Chip active={filters.mine} onClick={() => setFilters((held) => ({ ...held, mine: !held.mine }))}>
            <UserCheck className="h-3 w-3" strokeWidth={2} />
            On me
          </Chip>
          <Chip
            active={filters.hideDone}
            onClick={() => setFilters((held) => ({ ...held, hideDone: !held.hideDone }))}
          >
            <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
            Hide done
          </Chip>
          <Chip
            active={filters.archived}
            onClick={() => setFilters((held) => ({ ...held, archived: !held.archived }))}
          >
            <Archive className="h-3 w-3" strokeWidth={2} />
            Archived{counts.archived ? ` (${counts.archived})` : ''}
          </Chip>
          {filtered && (
            <button
              type="button"
              onClick={() =>
                setFilters({ text: '', mine: false, hideDone: false, label: '', archived: false })
              }
              className="text-[11px] font-semibold tracking-wide text-neutral-500 underline underline-offset-4 transition-colors hover:text-neutral-200"
            >
              Clear
            </button>
          )}
        </div>

        <Columns
          board={board}
          boards={index?.boards}
          you={you}
          filters={filters}
          actions={actions}
          onOpen={(id) => go({ tab: 'boards', board: board.id, card: id })}
          onDragging={setDragging}
        />

        {card && (
          <Dialog
            wide
            title={`${cardRank ? `#${cardRank} · ` : ''}${board.name}`}
            onClose={() => go({ tab: 'boards', board: board.id })}
          >
            <CardDialog
              board={board}
              boards={index?.boards}
              card={card}
              you={you}
              generals={generals}
              actions={actions}
              error={error}
              onClose={() => go({ tab: 'boards', board: board.id })}
            />
          </Dialog>
        )}

        {settings && (
          <Dialog wide title="Board settings" onClose={() => setSettings(false)}>
            <Settings
              board={board}
              accounts={accounts}
              choices={index?.visibility}
              roles={index?.roles}
              limits={index?.limits}
              you={you}
              keyholders={index?.keyholders}
              purposes={spec}
              generals={generals}
              staff={staff}
              here={live.here}
              sending={index?.remind?.sending}
              actions={actions}
              onClose={() => setSettings(false)}
              onGone={(where) => go({ tab: where === 'archive' ? 'archive' : 'boards' })}
            />
          </Dialog>
        )}

        {actions.undo && (
          <UndoBar
            what={actions.undo.what}
            busy={actions.busy}
            onUndo={() => actions.card.restore(actions.undo.cards)}
            onClose={actions.forget}
          />
        )}

        {tour && <Tour onClose={() => setTour(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Notice tone="rose" icon={AlertTriangle}>
          {error}
        </Notice>
      )}

      {notice && (
        <Notice tone="amber" icon={AlertTriangle}>
          {notice}
        </Notice>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-normal tracking-tight text-white">Boards</h2>
          <p className="mt-2 max-w-2xl text-[13px] font-normal leading-relaxed text-neutral-400">
            One board a project. Columns are the stages, cards are the work, and a card dropped in
            the finish column counts as done. Who can see a board is set on the board itself.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Live state={live.state} beat={beat} />
          <TourButton onClick={() => setTour(true)} />
          <Button type="button" disabled={loading} onClick={() => load()}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            Refresh
          </Button>
          {index?.canCreate && (
            <Button type="button" tone="solid" data-tour="boards-new" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New board
            </Button>
          )}
        </div>
      </div>

      <SubNav
        tabs={TABS}
        active={tab}
        onPick={(next) => go({ tab: next })}
        label="Board views"
      />

      {tab !== 'archive' && (index?.asks ?? []).length > 0 && (
        <ul className="space-y-2">
          {index.asks.map((ask) => (
            <li
              key={ask.id}
              className="flex flex-wrap items-center gap-3 border border-dashed border-amber-400/30 bg-amber-400/[0.06] px-4 py-3"
            >
              <BoardMark board={ask} />
              <span className="min-w-0 flex-1 basis-[60%]">
                <span className="block text-[13px] font-medium text-neutral-100">
                  {ask.by} asked you to join {ask.name}
                </span>
                <span className="block text-[11px] font-normal text-neutral-500">
                  As {BOARD_ROLE_LABEL[ask.role] ?? ask.role} · {ask.people} {ask.people === 1 ? 'person' : 'people'} on it
                  {ask.at ? ` · ${ago(ask.at, Date.now())}` : ''}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Button type="button" tone="solid" disabled={answering} onClick={() => answerAsk(ask.id, true)}>
                  <UserCheck className="h-3.5 w-3.5" strokeWidth={2} />
                  Join
                </Button>
                <Button type="button" disabled={answering} onClick={() => answerAsk(ask.id, false)}>
                  No thanks
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <>
          {(index?.boards ?? []).length > 3 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[200px] flex-1">
                <SearchInput
                  value={search}
                  placeholder="Search boards"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="w-[190px] shrink-0">
                <Select value={sort} aria-label="Sort boards" onChange={(event) => setSort(event.target.value)}>
                  {SORTS.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </Select>
              </div>
              {kinds.length > 1 && (
                <div className="flex w-full flex-wrap items-center gap-2">
                  {kinds.map((entry) => {
                    const Icon = purposeIcon(entry.id);
                    return (
                      <Chip
                        key={entry.id}
                        active={kind === entry.id}
                        onClick={() => setKind((held) => (held === entry.id ? '' : entry.id))}
                      >
                        <Icon className="h-3 w-3" strokeWidth={2} />
                        {entry.label}
                      </Chip>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {loading && !index && (
            <div className="border border-[#282832] bg-[#0a0a0d] px-4 sm:px-6 py-8">
              <p className="text-[13px] font-normal text-neutral-400">Reading the boards…</p>
            </div>
          )}

          {index && boards.length === 0 && (
            <div className="border border-[#282832] bg-[#0a0a0d] px-4 sm:px-6 py-12 text-center">
              <SquareKanban className="mx-auto mb-4 h-6 w-6 text-neutral-600" strokeWidth={1.5} />
              <p className="mx-auto max-w-md text-[13px] font-normal leading-relaxed text-neutral-400">
                {search
                  ? 'No board matches that.'
                  : tab === 'archive'
                    ? 'Nothing is archived. Archiving a board hides it from the list and keeps everything on it.'
                    : index.canCreate
                      ? 'No boards yet. Make one for the next thing you are building — it takes a name and nothing else.'
                      : 'No boards are shared with you yet. A board owner has to add you before one shows up here.'}
              </p>
            </div>
          )}

          {index && boards.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {boards.map((entry, place) => (
                  <BoardCard
                    key={entry.id}
                    board={entry}
                    mark={place === 0}
                    purposes={spec}
                    generals={generals}
                    onOpen={(id) => go({ tab: 'boards', board: id })}
                  />
                ))}
              </div>
              <p className="text-[12px] font-normal text-neutral-600">
                {plural(boards.length, 'board')} of {index.limits?.boards ?? 60}
                {tab === 'archive'
                  ? ' · archived boards still take up a place. Open one to restore it, or to delete it for good.'
                  : index.canManage
                    ? ' · you hold Manage boards, so this is every board on the panel.'
                    : index.canSeeTeam === false
                      ? ' · boards you made, plus the ones you were put on.'
                      : ' · boards you are on, plus team-wide ones.'}
              </p>
            </>
          )}
      </>

      {tour && <Tour onClose={() => setTour(false)} />}

      {creating && (
        <NewBoard
          busy={loading}
          accounts={accounts}
          you={you}
          roles={index?.roles}
          limits={index?.limits}
          keyholders={index?.keyholders}
          purposes={spec}
          generals={generals}
          choices={index?.visibility}
          onClose={() => setCreating(false)}
          onCreate={async ({ payload, art }) => {
            let made;
            try {
              made = await createBoard(payload);
            } catch (failure) {
              setError(failure.message);
              return;
            }
            setCreating(false);
            try {
              for (const kind of ['logo', 'banner']) {
                if (art?.[kind]) await setBoardArt(made.id, kind, art[kind].data, art[kind].focus);
              }
            } catch (failure) {
              setError(`The board was made, but its artwork was not saved — ${failure.message}`);
            }
            go({ tab: 'boards', board: made.id });
          }}
        />
      )}
    </div>
  );
}
