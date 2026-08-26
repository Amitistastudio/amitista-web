import React from 'react';
import { EyeOff, MessageSquare, Megaphone, Send, Trash2 } from 'lucide-react';
import { addOrderNote, removeOrderNote, shareOrderNote } from '../../../lib/admin';
import { Button, Check, Empty, Panel, Pill, TextArea } from '../ui';
import { ago } from './shared';

const LIMIT = 1200;

function Note({ note, busy, canManage, onShare, onRemove }) {
  const [confirming, setConfirming] = React.useState(false);

  return (
    <li
      className={`px-4 sm:px-6 py-4 border-b border-[#17171d] last:border-b-0 ${
        note.shared ? 'bg-purple-500/[0.04]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap mb-2">
            <span className="text-[13px] text-neutral-200 font-normal">
              {note.byName ?? 'the team'}
            </span>
            <span className="text-[12px] text-neutral-600 font-normal">{ago(note.at)}</span>
            {note.shared ? (
              <Pill tone="purple">the client sees this</Pill>
            ) : (
              <Pill>internal</Pill>
            )}
          </div>
          <p className="text-[13px] text-neutral-300 font-normal leading-relaxed whitespace-pre-wrap break-words">
            {note.body}
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={busy}
              title={note.shared ? 'Hide this from the client' : 'Show this on their track page'}
              onClick={() => onShare(note.id, !note.shared)}
              className="p-2 text-neutral-600 hover:text-purple-300 disabled:opacity-40 transition-colors"
            >
              {note.shared ? (
                <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <Megaphone className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              disabled={busy}
              title={confirming ? 'Click again to delete' : 'Delete this note'}
              onClick={() => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                onRemove(note.id);
              }}
              className={`p-2 disabled:opacity-40 transition-colors ${
                confirming ? 'text-rose-400' : 'text-neutral-600 hover:text-rose-400'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export default function Notes({ orderId, notes, canManage, busy, onRun }) {
  const [body, setBody] = React.useState('');
  const [shared, setShared] = React.useState(false);

  const listed = notes ?? [];
  const visible = listed.filter((note) => note.shared).length;

  function add() {
    const said = body.trim();
    if (!said) return;
    onRun(
      () => addOrderNote(orderId, said, shared),
      shared ? 'Note added — the client can see it.' : 'Note added.',
      () => {
        setBody('');
        setShared(false);
      },
    );
  }

  return (
    <Panel
      title={`Notes — ${listed.length}`}
      icon={MessageSquare}
      action={
        visible > 0 ? (
          <span className="text-[12px] text-neutral-500 font-normal">
            {visible} shown to the client
          </span>
        ) : null
      }
    >
      {canManage && (
        <div className="px-4 sm:px-6 py-5 border-b border-[#17171d] bg-[#08080b] flex flex-col gap-3.5">
          <TextArea
            rows={3}
            value={body}
            disabled={busy}
            maxLength={LIMIT}
            placeholder="What happened, what you agreed, what to chase next…"
            aria-label="Write a note"
            onChange={(event) => setBody(event.target.value)}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Check
              checked={shared}
              disabled={busy}
              label="Show this to the client on their track page"
              onChange={setShared}
            />
            <div className="flex items-center gap-3">
              {body.length > LIMIT - 200 && (
                <span className="text-[12px] text-neutral-500 font-normal tabular-nums">
                  {LIMIT - body.length} left
                </span>
              )}
              <Button type="button" tone="solid" disabled={busy || !body.trim()} onClick={add}>
                <Send className="h-3.5 w-3.5" strokeWidth={2} />
                {busy ? 'Saving…' : 'Add the note'}
              </Button>
            </div>
          </div>

          {shared && (
            <p className="text-[12px] text-purple-300/80 font-normal">
              This one goes on the public track page. Anything you would not send the client belongs
              in an internal note instead.
            </p>
          )}
        </div>
      )}

      {listed.length === 0 ? (
        <Empty>
          No notes yet. They stay internal unless you tick the box, and they never appear in
          Discord.
        </Empty>
      ) : (
        <ul>
          {listed.map((note) => (
            <Note
              key={note.id}
              note={note}
              busy={busy}
              canManage={canManage}
              onShare={(id, on) =>
                onRun(
                  () => shareOrderNote(orderId, id, on),
                  on ? 'The client can see that note now.' : 'That note is internal again.',
                )
              }
              onRemove={(id) => onRun(() => removeOrderNote(orderId, id), 'Note removed.')}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}
