import React from 'react';
import { ListChecks, MessageSquare, RefreshCw } from 'lucide-react';
import { BOARD_COLOUR, fetchMyWork, updateCard } from '../../lib/admin';
import { Button, Empty, Notice, Panel, Pill } from './ui';
import { clock, dayWords, startOfDay } from './boards/when';

// Buckets, not one long list. A due date is only useful as an answer to "is
// this my problem today", so the sort the server already does by date is
// turned into the four answers that actually change what you do next.
const BUCKETS = [
  { id: 'overdue', title: 'Overdue', tone: 'rose' },
  { id: 'today', title: 'Today', tone: 'amber' },
  { id: 'soon', title: 'Next seven days', tone: 'neutral' },
  { id: 'later', title: 'Later', tone: 'neutral' },
  { id: 'undated', title: 'No date', tone: 'neutral' },
];

function bucketFor(due, now) {
  if (!due) return 'undated';
  const at = new Date(due).getTime();
  if (!Number.isFinite(at)) return 'undated';
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86400000);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days < 7) return 'soon';
  return 'later';
}

function Task({ entry, onDone, busy }) {
  const { board, column, card } = entry;
  const shade = BOARD_COLOUR[board?.colour] ?? BOARD_COLOUR.purple;
  const [done, total] = card.steps ?? [0, 0];

  return (
    <div className="flex items-start gap-3 px-4 sm:px-6 py-3.5 border-b border-[#17171d] last:border-b-0">
      <button
        type="button"
        onClick={() => onDone(entry)}
        disabled={busy}
        aria-label={`Mark "${card.title}" done`}
        title="Mark done"
        className="tap mt-[2px] h-4 w-4 shrink-0 border border-[#3a3a46] hover:border-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
      />

      <div className="min-w-0 flex-1">
        <a
          href={`#boards/${board?.id}/${card.id}`}
          className="text-[13px] text-white font-medium leading-snug hover:text-purple-300 transition-colors break-words"
        >
          {card.title}
        </a>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11px] text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${shade.dot}`} />
            {board?.name}
          </span>
          {column && <span>· {column}</span>}
          {total > 0 && (
            <span className="tabular-nums">
              · {done}/{total} done
            </span>
          )}
          {card.comments > 0 && (
            <span className="inline-flex items-center gap-1">
              ·<MessageSquare className="h-3 w-3" strokeWidth={2} />
              {card.comments}
            </span>
          )}
        </div>

        {card.labels?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {card.labels.map((label) => (
              <span
                key={label.id}
                className="inline-flex items-center border px-2 py-[2px] text-[10px] font-semibold tracking-[0.1em] uppercase border-[#282832] text-neutral-400"
              >
                {label.name ?? label.id}
              </span>
            ))}
          </div>
        )}
      </div>

      {card.due && (
        <span
          className="text-[11px] text-neutral-500 tabular-nums shrink-0 text-right"
          title={clock(card.due)}
        >
          {dayWords(card.due)}
        </span>
      )}
    </div>
  );
}

export default function MyWorkPanel() {
  const [work, setWork] = React.useState(null);
  const [you, setYou] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(null);
  const alive = React.useRef(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const answer = await fetchMyWork();
      if (!alive.current) return;
      setWork(Array.isArray(answer.work) ? answer.work : []);
      setYou(answer.you ?? null);
      setError(null);
    } catch (failure) {
      if (!alive.current) return;
      setError(failure.message);
      setWork((held) => held ?? []);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  // Ticking a card off removes it straight away, because waiting on a round
  // trip to cross something out feels broken. If the write fails the card comes
  // back exactly where it was, and the reason is shown rather than swallowed.
  const finish = React.useCallback(async (entry) => {
    const key = `${entry.board.id}/${entry.card.id}`;
    setBusy(key);
    setWork((held) => held.filter((row) => `${row.board.id}/${row.card.id}` !== key));
    try {
      await updateCard(entry.board.id, entry.card.id, { done: true });
      if (alive.current) setError(null);
    } catch (failure) {
      if (!alive.current) return;
      setWork((held) => [...held, entry]);
      setError(failure.message);
    } finally {
      if (alive.current) setBusy(null);
    }
  }, []);

  if (work === null) {
    return error === null ? (
      <p className="text-[13px] text-neutral-500 font-normal">Reading your work…</p>
    ) : (
      <Notice tone="rose">{error}</Notice>
    );
  }

  const now = Date.now();
  const sorted = [...work].sort((a, b) => (a.card.due ?? '~').localeCompare(b.card.due ?? '~'));
  const grouped = BUCKETS.map((bucket) => ({
    ...bucket,
    rows: sorted.filter((entry) => bucketFor(entry.card.due, now) === bucket.id),
  })).filter((bucket) => bucket.rows.length > 0);

  const overdue = grouped.find((bucket) => bucket.id === 'overdue')?.rows.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[11px] text-neutral-600">
          {work.length === 0
            ? 'nothing assigned to you'
            : `${work.length} open ${work.length === 1 ? 'card' : 'cards'} assigned to you`}
          {you ? ` · ${you}` : ''}
        </p>
        <Button type="button" className="ml-auto" disabled={loading} onClick={load}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
          Refresh
        </Button>
      </div>

      {error && <Notice tone="rose">{error}</Notice>}

      {overdue > 0 && (
        <Notice tone="rose">
          {overdue === 1 ? 'One card is' : `${overdue} cards are`} past their due date.
        </Notice>
      )}

      {work.length === 0 ? (
        <Panel title="Your work" icon={ListChecks}>
          <Empty>
            Nothing is assigned to you right now. Cards land here the moment someone puts your name
            on one, from any board you have a seat on — and leave again when they are marked done.
          </Empty>
        </Panel>
      ) : (
        <div className={`space-y-4 transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
          {grouped.map((bucket) => (
            <Panel
              key={bucket.id}
              title={bucket.title}
              icon={ListChecks}
              action={<Pill tone={bucket.tone}>{bucket.rows.length}</Pill>}
            >
              {bucket.rows.map((entry) => (
                <Task
                  key={`${entry.board.id}/${entry.card.id}`}
                  entry={entry}
                  onDone={finish}
                  busy={busy === `${entry.board.id}/${entry.card.id}`}
                />
              ))}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
