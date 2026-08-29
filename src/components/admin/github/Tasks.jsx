import React from 'react';
import { ListChecks, Plus, Undo2 } from 'lucide-react';
import { createGithubTask, finishGithubTask } from '../../../lib/admin';
import { Button, Empty, FIELD_CLASS, Field, Notice, Panel, Pill, Select, TextInput } from '../ui';
import { clock, dayWords, startOfDay } from '../boards/when';
import { GithubLink } from './shared';

// A date input hands back a bare day. Cards carry a moment, and midnight reads
// as "the end of the night before" to everyone, so a day picked here means the
// end of that working day, in the picker's own timezone.
function endOfDay(day) {
  if (!day) return null;
  const at = new Date(`${day}T17:00`);
  return Number.isFinite(at.getTime()) ? at.toISOString() : null;
}

function dueTone(due, done) {
  if (done || !due) return 'text-neutral-500';
  const days = Math.round((startOfDay(new Date(due).getTime()) - startOfDay(Date.now())) / 86400000);
  if (days < 0) return 'text-rose-400';
  if (days === 0) return 'text-amber-300';
  return 'text-neutral-500';
}

function Task({ task, board, onToggle, busy }) {
  return (
    <div className="flex items-start gap-3 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0">
      <button
        type="button"
        onClick={() => onToggle(task, !task.done)}
        disabled={busy}
        aria-label={task.done ? `Reopen "${task.title}"` : `Mark "${task.title}" done`}
        title={task.done ? 'Put it back' : 'Mark done'}
        className={`tap mt-[2px] h-4 w-4 shrink-0 border transition-colors disabled:opacity-40 ${
          task.done
            ? 'border-emerald-500/50 bg-emerald-500/30'
            : 'border-[#3a3a46] hover:border-emerald-400 hover:bg-emerald-500/20'
        }`}
      />

      <div className="min-w-0 flex-1">
        <p
          className={`text-[13px] leading-snug break-words ${
            task.done ? 'text-neutral-600 line-through' : 'text-white font-medium'
          }`}
        >
          {task.title}
        </p>
        <p className="text-[11px] text-neutral-600 mt-1">
          #{task.seq}
          {task.column ? ` · ${task.column}` : ''}
          {task.assignees?.length ? ` · ${task.assignees.join(', ')}` : ''}
        </p>
      </div>

      {task.due && (
        <span
          className={`text-[11px] tabular-nums shrink-0 ${dueTone(task.due, task.done)}`}
          title={clock(task.due)}
        >
          {dayWords(task.due)}
        </span>
      )}

      {board && <GithubLink href={`#boards/${board.id}/${task.id}`} title="Open the card">CARD</GithubLink>}
    </div>
  );
}

function AddTask({ repositories, onAdd, busy }) {
  const [repo, setRepo] = React.useState(repositories[0] ?? '');
  const [title, setTitle] = React.useState('');
  const [due, setDue] = React.useState('');

  React.useEffect(() => {
    if (!repositories.includes(repo)) setRepo(repositories[0] ?? '');
  }, [repositories, repo]);

  const submit = async (event) => {
    event.preventDefault();
    if (!title.trim() || !repo) return;
    const kept = await onAdd(repo, title.trim(), endOfDay(due));
    if (kept) {
      setTitle('');
      setDue('');
    }
  };

  return (
    <Panel title="Add a task" icon={Plus}>
      <form onSubmit={submit} className="px-4 sm:px-6 py-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
          <Field label="Repository" htmlFor="task-repo">
            <Select id="task-repo" value={repo} onChange={(event) => setRepo(event.target.value)}>
              {repositories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="What to do" htmlFor="task-title">
            <TextInput
              id="task-title"
              value={title}
              maxLength={140}
              placeholder="Move the build into CI"
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>

          <Field label="When" hint="optional" htmlFor="task-due">
            <input
              id="task-due"
              type="date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
              className={FIELD_CLASS}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" tone="solid" disabled={busy || !title.trim() || !repo}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add task
          </Button>
          <p className="text-[11px] text-neutral-600">
            It becomes a card on the GitHub board, assigned to you — so it also shows up under My
            Work.
          </p>
        </div>
      </form>
    </Panel>
  );
}

export default function Tasks({ data, onChange }) {
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [showDone, setShowDone] = React.useState(false);

  const repositories = Array.isArray(data.repositories) ? data.repositories : [];
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const board = data.board ?? null;

  const open = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);

  const add = React.useCallback(
    async (repo, title, due) => {
      setBusy(true);
      try {
        onChange(await createGithubTask(repo, title, due));
        setError(null);
        return true;
      } catch (failure) {
        setError(failure.message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  const toggle = React.useCallback(
    async (task, next) => {
      setBusy(true);
      try {
        onChange(await finishGithubTask(task.id, next));
        setError(null);
      } catch (failure) {
        setError(failure.message);
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  // Grouped by repository, because that is the axis the tasks were raised on.
  // A repository with nothing outstanding is left out rather than shown empty.
  const grouped = repositories
    .map((name) => ({ name, rows: open.filter((task) => task.repo === name) }))
    .filter((group) => group.rows.length > 0);

  const orphans = open.filter((task) => !repositories.includes(task.repo));

  return (
    <div className="space-y-4">
      {error && <Notice tone="rose">{error}</Notice>}

      {repositories.length === 0 ? (
        <Notice tone="amber">
          No repositories have been read yet, so there is nothing to raise a task against. This
          fills in once the deploy has written a snapshot.
        </Notice>
      ) : (
        <AddTask repositories={repositories} onAdd={add} busy={busy} />
      )}

      {open.length === 0 && done.length === 0 ? (
        <Panel title="Tasks" icon={ListChecks}>
          <Empty>
            Nothing raised yet. A task added here becomes a card on a board called GitHub, labelled
            with its repository and assigned to you — the board is made the first time you add one.
          </Empty>
        </Panel>
      ) : (
        <>
          {grouped.map((group) => (
            <Panel
              key={group.name}
              title={group.name}
              icon={ListChecks}
              action={<Pill tone="amber">{group.rows.length}</Pill>}
            >
              {group.rows.map((task) => (
                <Task key={task.id} task={task} board={board} onToggle={toggle} busy={busy} />
              ))}
            </Panel>
          ))}

          {orphans.length > 0 && (
            <Panel
              title="No longer listed"
              icon={ListChecks}
              action={<Pill tone="neutral">{orphans.length}</Pill>}
            >
              <p className="px-4 sm:px-6 pt-4 text-[12px] text-neutral-500 leading-relaxed">
                Raised against a repository the deploy no longer reports. Kept rather than hidden —
                the work does not stop mattering because the snapshot changed.
              </p>
              {orphans.map((task) => (
                <Task key={task.id} task={task} board={board} onToggle={toggle} busy={busy} />
              ))}
            </Panel>
          )}

          {done.length > 0 && (
            <Panel
              title="Done"
              icon={Undo2}
              action={
                <button
                  type="button"
                  onClick={() => setShowDone((held) => !held)}
                  className="text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-500 hover:text-white transition-colors"
                >
                  {showDone ? 'Hide' : `Show ${done.length}`}
                </button>
              }
            >
              {showDone &&
                done.map((task) => (
                  <Task key={task.id} task={task} board={board} onToggle={toggle} busy={busy} />
                ))}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
