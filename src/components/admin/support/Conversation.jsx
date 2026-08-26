import React from 'react';
import { ArrowLeft, Hand, Lock, MessageSquareOff, RefreshCw } from 'lucide-react';
import {
  SUPPORT_PRIORITY_LEVELS,
  SUPPORT_STAGES,
  formatAgoMs,
} from '../../../lib/admin';
import { Button, Notice, TextArea } from '../ui';
import { LiveDot, ReplyForm, Stream } from './parts';
import { waitingOnUs } from './InboxList';

function Control({ children, ...rest }) {
  return (
    <button
      type="button"
      className="tap inline-flex shrink-0 items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-2.5 py-1.5 text-[11.5px] font-semibold text-neutral-300 transition-colors hover:border-[#3d3d4a] hover:text-white disabled:opacity-40"
      {...rest}
    >
      {children}
    </button>
  );
}

function Picker({ label, value, options, disabled, onPick }) {
  return (
    <label className="inline-flex shrink-0 items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-2 py-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onPick(event.target.value)}
        className="cursor-pointer border-none bg-transparent py-0.5 text-[11.5px] font-semibold text-neutral-200 outline-none disabled:opacity-40"
      >
        {options.map((entry) => (
          <option key={entry.value} value={entry.value} className="bg-[#0a0a0d]">
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Conversation({
  ticket,
  messages,
  readable,
  loading,
  busy,
  error,
  live,
  staff = false,
  stages,
  onBack,
  onRefresh,
  onReply,
  onClaim,
  onClose,
  onStatus,
  onPriority,
}) {
  const [closing, setClosing] = React.useState(false);
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    setClosing(false);
    setReason('');
  }, [ticket.id]);

  const open = ticket.status === 'open';
  const project = ticket.kind === 'order';
  const requester = ticket.user?.name ?? 'you';
  const offered = stages?.length ? stages : SUPPORT_STAGES;
  const needs = staff && waitingOnUs(ticket);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[#17171d] px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to the list"
            className="tap mt-0.5 shrink-0 text-neutral-500 transition-colors hover:text-neutral-200 lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium text-white">{ticket.subject || 'No subject'}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-neutral-500">
              <span className="font-mono text-neutral-400">{ticket.ref}</span>
              <span>{ticket.categoryLabel}</span>
              {staff && (
                <span>
                  {requester}
                  {ticket.user?.tag && ticket.user.tag !== requester ? ` (${ticket.user.tag})` : ''}
                </span>
              )}
              <span>opened {formatAgoMs(ticket.createdAt)}</span>
              {ticket.claimed && (
                <span className="text-purple-300">
                  {ticket.claimedByName ? `with ${ticket.claimedByName}` : 'claimed'}
                </span>
              )}
              {!open && <span className="text-neutral-600">closed {formatAgoMs(ticket.closedAt)}</span>}
              {needs && <span className="text-amber-300">waiting on us</span>}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <LiveDot on={live && open} />
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh"
              className="tap border border-[#282832] bg-[#0a0a0d] p-1.5 text-neutral-400 transition-colors hover:text-white disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
            </button>
          </div>
        </div>

        {open && (staff || onClose) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {staff && (
              <>
                <Control disabled={busy} onClick={onClaim}>
                  <Hand className="h-3.5 w-3.5" strokeWidth={2} />
                  {ticket.claimed ? 'Release' : 'Claim'}
                </Control>
                <Picker
                  label={project ? 'Stage' : 'Status'}
                  value={ticket.stage}
                  options={offered}
                  disabled={busy}
                  onPick={onStatus}
                />
                {!project && (
                  <Picker
                    label="Priority"
                    value={ticket.priority}
                    options={SUPPORT_PRIORITY_LEVELS}
                    disabled={busy}
                    onPick={onPriority}
                  />
                )}
              </>
            )}
            {onClose && (
              <button
                type="button"
                onClick={() => setClosing((held) => !held)}
                className="tap ml-auto inline-flex items-center gap-1.5 border border-rose-500/30 bg-rose-500/[0.07] px-2.5 py-1.5 text-[11.5px] font-semibold text-rose-300 transition-colors hover:bg-rose-500/15"
              >
                <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                Close
              </button>
            )}
          </div>
        )}

        {!open && ticket.closedReason && (
          <p className="mt-2 text-[12px] font-normal text-neutral-500">Closing note: {ticket.closedReason}</p>
        )}
      </div>

      {error && (
        <div className="px-4 pt-3 sm:px-5">
          <Notice tone="rose">{error}</Notice>
        </div>
      )}

      {!readable && (
        <div className="px-4 pt-3 sm:px-5">
          <Notice tone="amber" icon={MessageSquareOff}>
            {ticket.channelGone
              ? 'The channel for this ticket is no longer in Discord, so there is nothing left to read.'
              : 'The bot could not read this channel, so the conversation is not shown.'}
          </Notice>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Stream
          messages={messages}
          requester={requester}
          empty={loading ? 'Reading the channel…' : 'Nothing has been said yet.'}
        />
      </div>

      {closing && open && (
        <div className="border-t border-[#282832] bg-[#08080b] px-4 py-3 sm:px-5">
          <p className="text-[12px] font-normal leading-relaxed text-neutral-500">
            The channel is archived, a transcript is saved and its link is sent to {staff ? requester : 'you'}.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
            <TextArea
              rows={1}
              maxLength={300}
              placeholder="Closing note (optional)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                tone="danger"
                disabled={busy}
                onClick={async () => {
                  const done = await onClose(reason.trim());
                  if (done) {
                    setClosing(false);
                    setReason('');
                  }
                }}
              >
                <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                {busy ? 'Closing…' : `Close ${ticket.ref}`}
              </Button>
              <Button type="button" onClick={() => setClosing(false)}>
                Keep open
              </Button>
            </div>
          </div>
        </div>
      )}

      {open && readable && (
        <ReplyForm
          busy={busy}
          verb={staff ? 'Send as the team' : 'Send'}
          placeholder={
            staff
              ? `Answer ${requester} — it is posted into the ticket channel under your name.`
              : 'Write a reply — it appears in your ticket channel straight away.'
          }
          onReply={onReply}
        />
      )}
    </div>
  );
}
