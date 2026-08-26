import React from 'react';
import { Paperclip, Send } from 'lucide-react';
import { formatBytes } from '../../../lib/admin';
import { Button, TextArea } from '../ui';
import Rich from './Rich';

const REPLY_MAX = 1500;
const GROUP_MS = 5 * 60 * 1000;

export function LiveDot({ on }) {
  if (!on) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-normal text-neutral-500">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Live
    </span>
  );
}

export function Initial({ name, staff }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
        staff ? 'bg-purple-500/20 text-purple-200' : 'bg-[#17171d] text-neutral-400'
      }`}
    >
      {String(name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

function dayOf(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function clockOf(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function Attachments({ files }) {
  if (!files?.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${index}`}
          className="inline-flex items-center gap-2 border border-[#282832] px-2.5 py-1 text-[11px] font-normal text-neutral-400"
        >
          <Paperclip className="h-3 w-3" strokeWidth={2} />
          {file.name}
          <span className="text-neutral-600">{formatBytes(file.size)}</span>
        </li>
      ))}
    </ul>
  );
}

function Said({ message, name, grouped }) {
  const staff = Boolean(message.staff);

  return (
    <li className={grouped ? 'flex gap-3 pt-1' : 'flex gap-3 pt-4'}>
      <div className="w-7 shrink-0">{!grouped && <Initial name={name} staff={staff} />}</div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="mb-0.5 flex flex-wrap items-baseline gap-2">
            <span className={`text-[12px] font-semibold ${staff ? 'text-purple-200' : 'text-white'}`}>{name}</span>
            {staff && <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">team</span>}
            {message.bot && <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">bot</span>}
            <span className="text-[11px] tabular-nums text-neutral-600">
              {clockOf(message.at)}
              {message.edited ? ' · edited' : ''}
            </span>
          </p>
        )}
        {message.body && (
          <div className="text-[13.5px] leading-relaxed text-neutral-300">
            <Rich text={message.body} />
          </div>
        )}
        <Attachments files={message.attachments} />
      </div>
    </li>
  );
}

function Happened({ message }) {
  return (
    <li className="flex items-center gap-3 py-1.5 pl-10">
      <span className="h-px w-3 shrink-0 bg-[#282832]" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-[11.5px] text-neutral-600">
        <Rich text={message.body} tone="text-neutral-600" />
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-neutral-700">{clockOf(message.at)}</span>
    </li>
  );
}

export function Stream({ messages, requester, empty }) {
  const foot = React.useRef(null);

  React.useEffect(() => {
    foot.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  if (!messages.length) {
    return <p className="px-6 py-10 text-[13px] font-normal text-neutral-500">{empty}</p>;
  }

  const rows = [];
  let last = null;
  let day = '';

  for (const message of messages) {
    const stamped = dayOf(message.at);
    if (stamped && stamped !== day) {
      rows.push({ kind: 'day', key: `day-${message.id}`, label: stamped });
      day = stamped;
      last = null;
    }

    if (message.kind === 'system') {
      rows.push({ kind: 'system', key: message.id, message });
      last = null;
      continue;
    }

    const name = message.mine ? requester : message.author;
    const grouped =
      Boolean(last) &&
      last.name === name &&
      Boolean(last.message.staff) === Boolean(message.staff) &&
      Math.abs(Number(message.at) - Number(last.message.at)) < GROUP_MS;

    rows.push({ kind: 'said', key: message.id, message, name, grouped });
    last = { name, message };
  }

  return (
    <ul className="flex flex-col px-5 py-2 sm:px-6">
      {rows.map((row) => {
        if (row.kind === 'day') {
          return (
            <li key={row.key} className="flex items-center gap-4 py-5">
              <span className="h-px flex-1 bg-[#17171d]" aria-hidden="true" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-600">{row.label}</span>
              <span className="h-px flex-1 bg-[#17171d]" aria-hidden="true" />
            </li>
          );
        }
        if (row.kind === 'system') return <Happened key={row.key} message={row.message} />;
        return <Said key={row.key} message={row.message} name={row.name} grouped={row.grouped} />;
      })}
      <li ref={foot} className="pt-2" />
    </ul>
  );
}

export function ReplyForm({ busy, placeholder, verb, onReply }) {
  const [body, setBody] = React.useState('');
  const left = REPLY_MAX - body.length;

  async function send() {
    if (!body.trim() || busy) return;
    const sent = await onReply(body.trim());
    if (sent) setBody('');
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="border-t border-[#282832] bg-[#08080b] px-4 py-3 sm:px-5"
    >
      <TextArea
        rows={2}
        maxLength={REPLY_MAX}
        placeholder={placeholder}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            send();
          }
        }}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[11px] font-normal text-neutral-600">
          {left < 200 ? `${left} characters left · ` : ''}Ctrl+Enter sends
        </span>
        <Button type="submit" tone="solid" disabled={busy || !body.trim()}>
          <Send className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? 'Sending…' : verb}
        </Button>
      </div>
    </form>
  );
}
