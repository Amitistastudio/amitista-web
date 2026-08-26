import React from 'react';
import { ArrowRightLeft, Check, Search } from 'lucide-react';
import { Button, Notice, Select, SearchInput } from '../ui';
import { BoardMark, Dialog, shade } from './shared';
import { fetchBoard } from '../../../lib/admin';

export default function MoveDialog({ boards, board, card, busy, onClose, onMove }) {
  const [wanted, setWanted] = React.useState('');
  const [picked, setPicked] = React.useState(null);
  const [target, setTarget] = React.useState(null);
  const [column, setColumn] = React.useState('');
  const [reading, setReading] = React.useState(false);
  const [failed, setFailed] = React.useState(null);

  const choices = React.useMemo(() => {
    const text = wanted.trim().toLowerCase();
    return (boards ?? [])
      .filter((entry) => entry.id !== board.id && entry.canWrite)
      .filter((entry) => !text || `${entry.name} ${entry.note ?? ''}`.toLowerCase().includes(text));
  }, [boards, board.id, wanted]);

  React.useEffect(() => {
    if (!picked) return undefined;
    let dropped = false;
    setReading(true);
    setFailed(null);
    fetchBoard(picked)
      .then((result) => {
        if (dropped) return;
        setTarget(result.board);
        setColumn(result.board.lists[0]?.id ?? '');
      })
      .catch((failure) => {
        if (!dropped) setFailed(failure.message);
      })
      .finally(() => {
        if (!dropped) setReading(false);
      });
    return () => {
      dropped = true;
    };
  }, [picked]);

  const going = (card.assignees ?? []).filter((name) => target && !(name in (target.members ?? {})));
  const marks = (board.labels ?? []).filter((label) => (card.labels ?? []).includes(label.id));
  const kept = marks.filter((label) =>
    (target?.labels ?? []).some((entry) => entry.name.toLowerCase() === label.name.toLowerCase()),
  );

  return (
    <Dialog
      title={`Move “${card.title}” to another board`}
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            tone="solid"
            disabled={busy || reading || !target}
            onClick={() => onMove(picked, column || null)}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Move it
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {failed && <Notice tone="rose">{failed}</Notice>}

        {(boards ?? []).length > 6 && (
          <SearchInput
            value={wanted}
            placeholder="Search boards"
            onChange={(event) => setWanted(event.target.value)}
          />
        )}

        {choices.length === 0 ? (
          <p className="border border-[#282832] bg-[#0a0a0d] px-3 py-4 text-[12px] font-normal text-neutral-500">
            {wanted.trim() ? (
              <span className="inline-flex items-center gap-2">
                <Search className="h-3.5 w-3.5" strokeWidth={2} />
                No board by that name.
              </span>
            ) : (
              'There is no other board you can write to. Make one first, or ask to be put on one.'
            )}
          </p>
        ) : (
          <div className="quiet-scroll flex max-h-[38vh] flex-col gap-1 overflow-y-auto">
            {choices.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setPicked(entry.id)}
                className={`flex items-center gap-3 border px-3 py-2 text-left transition-colors ${
                  picked === entry.id
                    ? 'border-purple-500/50 bg-purple-500/10'
                    : 'border-[#282832] bg-[#0a0a0d] hover:border-[#3f3f4c]'
                }`}
              >
                {entry.art?.logo ? (
                  <BoardMark board={entry} />
                ) : (
                  <span className={`h-8 w-1 shrink-0 ${shade(entry.colour).stripe}`} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-normal text-neutral-100">
                    {entry.name}
                  </span>
                  <span className="block truncate text-[11px] font-normal text-neutral-600">
                    {entry.counts.cards} cards · {entry.counts.lists} columns
                  </span>
                </span>
                {picked === entry.id && (
                  <Check className="h-4 w-4 shrink-0 text-purple-300" strokeWidth={2} />
                )}
              </button>
            ))}
          </div>
        )}

        {picked && (
          <div>
            <label
              htmlFor="board-move-column"
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500"
            >
              Which column
            </label>
            <Select
              id="board-move-column"
              value={column}
              disabled={reading || !target}
              aria-label="Which column it lands in"
              onChange={(event) => setColumn(event.target.value)}
            >
              {reading && <option value="">Reading the board…</option>}
              {(target?.lists ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                  {entry.done ? ' (finished)' : ''}
                </option>
              ))}
            </Select>
          </div>
        )}

        {target && (going.length > 0 || marks.length > kept.length) && (
          <Notice tone="amber">
            {going.length > 0 && (
              <span className="block">
                {going.join(', ')} {going.length === 1 ? 'is' : 'are'} not on {target.name}, so the
                card leaves them behind.
              </span>
            )}
            {marks.length > kept.length && (
              <span className="block">
                A label only follows the card if {target.name} has one by the same name.
              </span>
            )}
          </Notice>
        )}
      </div>
    </Dialog>
  );
}
