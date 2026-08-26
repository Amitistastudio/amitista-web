import React from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { formatAgoMs } from '../../../lib/admin';
import { LiveDot } from './parts';

const HOUR = 3600000;

export function waitingOnUs(ticket) {
  if (!ticket || ticket.status !== 'open') return false;
  if (ticket.kind === 'order') return ticket.lastMessageMine === true;
  return ticket.stage === 'new' || ticket.lastMessageMine === true;
}

export function rank(ticket) {
  if (ticket.status !== 'open') return 0;
  if (waitingOnUs(ticket)) return 3;
  if (ticket.stage === 'waiting') return 1;
  return 2;
}

export function sortForInbox(rows) {
  return [...rows].sort((a, b) => {
    const gap = rank(b) - rank(a);
    if (gap) return gap;
    return (b.lastMessageAt || b.createdAt || 0) - (a.lastMessageAt || a.createdAt || 0);
  });
}

function ageTone(ticket) {
  if (!waitingOnUs(ticket)) return 'text-neutral-600';
  const since = Date.now() - (ticket.lastMessageAt || ticket.createdAt || Date.now());
  if (since > 24 * HOUR) return 'text-rose-400';
  if (since > 4 * HOUR) return 'text-amber-300';
  return 'text-neutral-500';
}

function shortAgo(ms) {
  const text = formatAgoMs(ms);
  return text.replace(' ago', '').replace('just now', 'now');
}

function Marks({ ticket, staff }) {
  const marks = [];
  if (ticket.kind === 'order') marks.push(['Project', 'text-purple-300']);
  if (ticket.status !== 'open') marks.push(['Closed', 'text-neutral-600']);
  else {
    if (ticket.priority === 'urgent') marks.push(['Urgent', 'text-rose-400']);
    else if (ticket.priority === 'high') marks.push(['High', 'text-amber-300']);
    if (staff && !ticket.claimed) marks.push(['Unclaimed', 'text-amber-300']);
    if (ticket.stage === 'waiting' && !waitingOnUs(ticket))
      marks.push([staff ? 'Waiting on them' : 'Waiting on you', 'text-neutral-500']);
  }

  if (!marks.length) return null;

  return (
    <>
      {marks.map(([label, tone]) => (
        <span key={label} className={`text-[10.5px] font-semibold uppercase tracking-[0.1em] ${tone}`}>
          {label}
        </span>
      ))}
    </>
  );
}

function Row({ ticket, active, unread, staff, onPick }) {
  const needs = waitingOnUs(ticket);
  const closed = ticket.status !== 'open';
  const who = staff ? ticket.user?.name ?? 'unknown' : ticket.categoryLabel;
  const preview = ticket.preview
    ? `${ticket.lastMessageMine === false && staff ? 'You: ' : ''}${ticket.preview}`
    : null;

  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(ticket.id)}
        aria-current={active ? 'true' : undefined}
        className={`relative w-full border-b border-[#17171d] px-4 py-2.5 text-left transition-colors ${
          active ? 'bg-[#15151c]' : 'hover:bg-[#0e0e13]'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-[2px] ${
            active ? 'bg-purple-400' : needs ? 'bg-amber-400/60' : 'bg-transparent'
          }`}
        />

        <span className="flex items-baseline gap-2">
          {unread && <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />}
          <span
            className={`min-w-0 flex-1 truncate text-[13px] ${
              closed ? 'font-normal text-neutral-500' : unread ? 'font-semibold text-white' : 'font-medium text-neutral-200'
            }`}
          >
            {ticket.subject || 'No subject'}
          </span>
          <span className={`shrink-0 text-[11px] tabular-nums ${ageTone(ticket)}`}>
            {shortAgo(ticket.lastMessageAt || ticket.createdAt)}
          </span>
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-neutral-600">
          <span className="font-mono text-neutral-500">{ticket.ref}</span>
          <span>{who}</span>
          <Marks ticket={ticket} staff={staff} />
        </span>

        {preview && <span className="mt-0.5 block truncate text-[12px] text-neutral-500">{preview}</span>}
      </button>
    </li>
  );
}

export default function InboxList({
  rows,
  filters,
  filter,
  onFilter,
  query,
  onQuery,
  activeId,
  onPick,
  seen,
  staff = false,
  loading,
  live,
  onRefresh,
  action,
  empty,
}) {
  return (
    <div className="flex min-h-0 flex-col border-b border-[#282832] lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-2 border-b border-[#17171d] px-3 py-2.5">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-neutral-600" strokeWidth={2} />
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={staff ? 'Subject, ref, requester…' : 'Search your tickets…'}
            aria-label="Search tickets"
            className="w-full border border-[#282832] bg-[#0a0a0d] py-1.5 pl-8 pr-2 text-[12px] font-normal text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-purple-500/50"
          />
        </label>
        <LiveDot on={live} />
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh"
          className="tap shrink-0 border border-[#282832] bg-[#0a0a0d] p-1.5 text-neutral-400 transition-colors hover:text-white disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
        </button>
        {action}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-[#17171d] px-3 py-2">
        {filters.map((entry) => {
          const on = entry.id === filter;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onFilter(entry.id)}
              aria-pressed={on}
              className={`tap shrink-0 whitespace-nowrap border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
                on
                  ? 'border-purple-500/40 bg-purple-500/15 text-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {entry.label}
              {entry.count > 0 && (
                <span className={`ml-1.5 tabular-nums ${on ? 'text-purple-200' : 'text-neutral-600'}`}>
                  {entry.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-[12.5px] font-normal leading-relaxed text-neutral-500">{empty}</p>
        ) : (
          <ul>
            {rows.map((ticket) => (
              <Row
                key={ticket.id}
                ticket={ticket}
                staff={staff}
                active={ticket.id === activeId}
                unread={Boolean(
                  ticket.lastMessageAt &&
                    ticket.lastMessageAt > (seen?.[ticket.id] ?? 0) &&
                    (staff ? true : ticket.lastMessageMine === false),
                )}
                onPick={onPick}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
