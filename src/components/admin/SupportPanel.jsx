import React from 'react';
import { Inbox, LifeBuoy, MessageCircle, Plus, RefreshCw, UserCircle } from 'lucide-react';
import {
  claimQueueTicket,
  closeQueueTicket,
  closeSupportTicket,
  fetchSupport,
  fetchSupportQueue,
  fetchSupportQueueTicket,
  fetchSupportTicket,
  markSeenSupport,
  openSupportTicket,
  readSeenSupport,
  replyToQueueTicket,
  replyToSupportTicket,
  setQueueTicketPriority,
  setQueueTicketStatus,
} from '../../lib/admin';
import { Button, Notice, Panel, SubNav } from './ui';
import NewTicket from './support/NewTicket';
import Conversation from './support/Conversation';
import InboxList, { sortForInbox, waitingOnUs } from './support/InboxList';

const LIST_POLL_MS = 15000;
const THREAD_POLL_MS = 6000;
const ID_SHAPE = /^\d{17,20}$/;

const STAFF_FILTERS = [
  { id: 'needs', label: 'Needs you', test: (ticket) => waitingOnUs(ticket) },
  { id: 'open', label: 'Open', test: (ticket) => ticket.status === 'open' },
  { id: 'unclaimed', label: 'Unclaimed', test: (ticket) => ticket.status === 'open' && !ticket.claimed },
  { id: 'projects', label: 'Projects', test: (ticket) => ticket.kind === 'order' },
  { id: 'closed', label: 'Closed', test: (ticket) => ticket.status !== 'open' },
  { id: 'all', label: 'All', test: () => true },
];

const MINE_FILTERS = [
  { id: 'open', label: 'Open', test: (ticket) => ticket.status === 'open' },
  { id: 'closed', label: 'Closed', test: (ticket) => ticket.status !== 'open' },
  { id: 'all', label: 'All', test: () => true },
];

function placeFromHash() {
  if (typeof window === 'undefined') return { tab: 'mine', view: 'list' };
  const parts = window.location.hash.replace('#', '').split('/');
  if (parts[1] === 'queue') {
    return { tab: 'queue', view: ID_SHAPE.test(parts[2] || '') ? parts[2] : 'list' };
  }
  if (parts[1] === 'new') return { tab: 'mine', view: 'new' };
  return { tab: 'mine', view: ID_SHAPE.test(parts[1] || '') ? parts[1] : 'list' };
}

function hashOf(place) {
  if (place.tab === 'queue') {
    return place.view === 'list' ? '#support/queue' : `#support/queue/${place.view}`;
  }
  if (place.view === 'new') return '#support/new';
  return place.view === 'list' ? '#support' : `#support/${place.view}`;
}

function haystack(ticket) {
  return [ticket.subject, ticket.ref, ticket.user?.name, ticket.user?.tag, ticket.categoryLabel, ticket.preview]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function Waiting({ icon: Icon = Inbox, children, hint }) {
  return (
    <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-3 px-6 py-10">
      <Icon className="h-6 w-6 text-neutral-700" strokeWidth={1.5} />
      <p className="max-w-sm text-center text-[13px] font-normal leading-relaxed text-neutral-400">{children}</p>
      {hint && <p className="max-w-sm text-center text-[12px] font-normal text-neutral-600">{hint}</p>}
    </div>
  );
}

export default function SupportPanel({ onGoTo, permissions = [] }) {
  const canManage = permissions.includes('support.manage');
  const [data, setData] = React.useState(null);
  const [queue, setQueue] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [place, setPlace] = React.useState(placeFromHash);
  const [thread, setThread] = React.useState(null);
  const [threadLoading, setThreadLoading] = React.useState(false);
  const [filter, setFilter] = React.useState('open');
  const [query, setQuery] = React.useState('');
  const [seen, setSeen] = React.useState(() =>
    typeof window === 'undefined' ? {} : readSeenSupport(),
  );
  const alive = React.useRef(true);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = React.useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const [mine, team] = await Promise.all([
          fetchSupport(),
          canManage ? fetchSupportQueue() : Promise.resolve(null),
        ]);
        if (!alive.current) return;
        setData(mine);
        setQueue(team);
        setError(null);
      } catch (failure) {
        if (alive.current) setError(failure.message);
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [canManage],
  );

  const readThread = React.useCallback(async (target, quiet = false) => {
    if (!quiet) setThreadLoading(true);
    try {
      const answer =
        target.tab === 'queue'
          ? await fetchSupportQueueTicket(target.view)
          : await fetchSupportTicket(target.view);
      if (!alive.current) return;
      setThread(answer);
      setError(null);
      markSeenSupport(target.view);
      setSeen(readSeenSupport());
    } catch (failure) {
      if (alive.current) setError(failure.message);
    } finally {
      if (alive.current) setThreadLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const poll = setInterval(() => load(true), LIST_POLL_MS);
    function focus() {
      load(true);
    }
    window.addEventListener('focus', focus);
    return () => {
      clearInterval(poll);
      window.removeEventListener('focus', focus);
    };
  }, [load]);

  React.useEffect(() => {
    function follow() {
      setPlace(placeFromHash());
    }
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const go = React.useCallback((next) => {
    setPlace(next);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', hashOf(next));
    }
  }, []);

  const showing = place.view !== 'list' && place.view !== 'new' ? place : null;
  const showingKey = showing ? `${showing.tab}/${showing.view}` : null;

  React.useEffect(() => {
    if (!showingKey) {
      setThread(null);
      return undefined;
    }
    const [tab, view] = showingKey.split('/');
    const target = { tab, view };
    setThread(null);
    readThread(target);
    const poll = setInterval(() => readThread(target, true), THREAD_POLL_MS);
    return () => clearInterval(poll);
  }, [showingKey, readThread]);

  React.useEffect(() => {
    setFilter('open');
    setQuery('');
  }, [place.tab]);

  const linked = Boolean(data?.discord?.linked);

  async function act(work) {
    setBusy(true);
    setError(null);
    try {
      return await work();
    } catch (failure) {
      setError(failure.message);
      return null;
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="border border-[#282832] bg-[#0a0a0d] px-4 py-8 sm:px-6">
        <p className="text-[13px] font-normal text-neutral-400">Reading the tickets…</p>
      </div>
    );
  }

  const staffView = place.tab === 'queue' && canManage;
  const source = staffView ? queue?.tickets ?? [] : data?.tickets ?? [];
  const filters = (staffView ? STAFF_FILTERS : MINE_FILTERS).map((entry) => ({
    ...entry,
    count: source.filter(entry.test).length,
  }));
  const active = filters.find((entry) => entry.id === filter) ?? filters[0];
  const needle = query.trim().toLowerCase();
  const rows = sortForInbox(
    source.filter((ticket) => active.test(ticket) && (!needle || haystack(ticket).includes(needle))),
  );

  const unreadMine = (data?.tickets ?? []).filter(
    (ticket) =>
      ticket.lastMessageAt &&
      ticket.lastMessageAt > (seen[ticket.id] ?? 0) &&
      ticket.lastMessageMine === false,
  ).length;

  const needsTeam = (queue?.tickets ?? []).filter(waitingOnUs).length;

  const nav = canManage ? (
    <SubNav
      tabs={[
        { id: 'mine', label: 'Your tickets', icon: UserCircle },
        { id: 'queue', label: 'Team inbox', icon: Inbox },
      ]}
      active={place.tab}
      onPick={(id) => go({ tab: id, view: 'list' })}
      badges={{ mine: unreadMine, queue: needsTeam }}
      label="Support views"
    />
  ) : null;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {nav ?? (
        <p className="text-[13px] font-normal text-neutral-400">
          Your tickets in {data?.guild?.name ?? 'the studio server'}.
        </p>
      )}
      {linked && !data?.botDown && (
        <Button type="button" tone="solid" onClick={() => go({ tab: 'mine', view: 'new' })}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          New ticket
        </Button>
      )}
    </div>
  );

  const shell = (children) => <div className="flex flex-col gap-4">{header}{children}</div>;

  const down = staffView ? queue?.botDown : data?.botDown;
  if (down) {
    return shell(
      <div className="flex flex-col gap-4">
        <Notice tone="amber">
          The bot is not answering, so {staffView ? 'the queue' : 'your tickets'} cannot be read right now. {down}
        </Notice>
        <Button type="button" onClick={() => load()} disabled={loading} className="self-start">
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
          {loading ? 'Trying…' : 'Try again'}
        </Button>
      </div>,
    );
  }

  if (!staffView && !linked) {
    return shell(
      <Panel title="Support" icon={LifeBuoy}>
        <div className="flex flex-col items-start gap-5 px-4 py-8 sm:px-6">
          <p className="max-w-2xl text-[13px] font-normal leading-relaxed text-neutral-400">
            This tab opens and follows support tickets in the studio Discord server, so it needs to know which
            Discord account is yours. Link one under Your account, and your tickets show up here — you can open new
            ones, read the replies and answer without leaving the panel.
          </p>
          <Button
            type="button"
            tone="solid"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.replaceState(null, '', '#account/discord');
              }
              onGoTo?.('account');
            }}
          >
            <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} />
            Link a Discord account
          </Button>
        </div>
      </Panel>,
    );
  }

  if (place.view === 'new') {
    return shell(
      <NewTicket
        categories={data.categories}
        busy={busy}
        error={error}
        onCancel={() => go({ tab: 'mine', view: 'list' })}
        onOpen={async (payload) => {
          const made = await act(() => openSupportTicket(payload));
          if (!made) return;
          await load(true);
          go({ tab: 'mine', view: made.ticket.id });
        }}
      />,
    );
  }

  const back = () => go({ tab: place.tab, view: 'list' });

  const conversation = () => {
    if (!showing) {
      return (
        <Waiting
          hint={
            staffView
              ? 'The list is ordered so whatever is waiting on us sits at the top.'
              : 'Replies arrive here and in the studio server at the same time.'
          }
        >
          {staffView
            ? needsTeam
              ? `${needsTeam} ticket${needsTeam === 1 ? '' : 's'} waiting on the team.`
              : 'Nothing is waiting on the team.'
            : 'Pick one of your tickets to read the replies and answer.'}
        </Waiting>
      );
    }

    if (!thread) {
      return <Waiting>{threadLoading ? 'Reading the ticket…' : 'That ticket could not be read.'}</Waiting>;
    }

    if (staffView) {
      return (
        <Conversation
          staff
          live
          ticket={thread.ticket}
          messages={thread.messages}
          readable={thread.readable}
          loading={threadLoading}
          busy={busy}
          error={error}
          stages={thread.ticket.kind === 'order' ? queue?.orderStages : undefined}
          onBack={back}
          onRefresh={() => readThread(showing)}
          onReply={async (body) => {
            const sent = await act(() => replyToQueueTicket(showing.view, body));
            if (!sent) return false;
            await readThread(showing, true);
            load(true);
            return true;
          }}
          onClaim={async () => {
            const done = await act(() => claimQueueTicket(showing.view));
            if (done) await readThread(showing, true);
          }}
          onClose={async (reason) => {
            const done = await act(() => closeQueueTicket(showing.view, reason));
            if (!done) return false;
            await readThread(showing, true);
            load(true);
            return true;
          }}
          onStatus={async (status) => {
            const done = await act(() => setQueueTicketStatus(showing.view, status));
            if (done) await readThread(showing, true);
          }}
          onPriority={async (priority) => {
            const done = await act(() => setQueueTicketPriority(showing.view, priority));
            if (done) await readThread(showing, true);
          }}
        />
      );
    }

    return (
      <Conversation
        live
        ticket={thread.ticket}
        messages={thread.messages}
        readable={thread.readable}
        loading={threadLoading}
        busy={busy}
        error={error}
        onBack={back}
        onRefresh={() => readThread(showing)}
        onReply={async (body) => {
          const sent = await act(() => replyToSupportTicket(showing.view, body));
          if (!sent) return false;
          await readThread(showing, true);
          load(true);
          return true;
        }}
        onClose={async (reason) => {
          const done = await act(() => closeSupportTicket(showing.view, reason));
          if (!done) return false;
          await readThread(showing, true);
          load(true);
          return true;
        }}
      />
    );
  };

  return shell(
    <>
      {error && !showing && <Notice tone="rose">{error}</Notice>}

      <div className="grid min-h-[520px] grid-cols-1 overflow-hidden border border-[#282832] bg-[#0a0a0d] lg:h-[calc(100vh-240px)] lg:max-h-[860px] lg:grid-cols-[minmax(300px,360px)_1fr]">
        <div className={`min-h-0 flex-col ${showing ? 'hidden lg:flex' : 'flex'}`}>
          <InboxList
            rows={rows}
            filters={filters}
            filter={active.id}
            onFilter={setFilter}
            query={query}
            onQuery={setQuery}
            activeId={showing?.view ?? null}
            onPick={(id) => go({ tab: place.tab, view: id })}
            seen={seen}
            staff={staffView}
            loading={loading}
            live
            onRefresh={() => load()}
            empty={
              needle
                ? 'Nothing matches that.'
                : staffView
                  ? 'No tickets in this view. Everything opened in Discord or from the panel lands here.'
                  : 'Nothing here. Start a ticket and it appears here and in the studio server at the same time.'
            }
          />
        </div>

        <div className={`min-h-0 flex-col ${showing ? 'flex' : 'hidden lg:flex'}`}>{conversation()}</div>
      </div>
    </>,
  );
}
