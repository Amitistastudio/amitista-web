import React from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchGithubRepositories, formatAgo } from '../../lib/admin';
import { Button, Notice } from './ui';
import Repositories from './github/Repositories';
import Issues from './github/Issues';
import Pulls from './github/Pulls';
import Organization from './github/Organization';
import People from './github/People';

export const GITHUB_VIEWS = [
  'github',
  'github-issues',
  'github-pulls',
  'github-org',
  'github-people',
];

const VIEWS = {
  github: Repositories,
  'github-issues': Issues,
  'github-pulls': Pulls,
  'github-org': Organization,
  'github-people': People,
};

// The group and its gate are real — only the accounts named in PRIVATE_GROUPS
// on the server can reach it, and the server checks rather than trusting the
// nav to hide it.
//
// Nothing in here can change a repository's contents. It reads the snapshot the
// deploy writes and reports it; there is no button that pushes, merges or
// deploys, and adding one would mean handing this service a token it cannot
// read.
//
// People and access is the one section that asks for a change, and it does not
// make one either. It posts what it wants to the admin API, which writes it to
// a queue directory, and the deploy — root, holding the token — decides at the
// end of its next tick whether to carry it out. So a change here is a request
// with about a minute of latency, and the section says so rather than
// pretending otherwise.
//
// The sections are nav entries rather than tabs inside one, so AdminPage
// renders this component for every one of them. That keeps it mounted while you
// move between them, which is the point: both read the one snapshot the deploy
// writes, and it is fetched once rather than again per section.
//
// The collector also still gathers pull requests, branches and workflow-run
// history: it costs nothing to keep, because conditional requests mean
// unchanged data is not charged against the rate limit, so the sections that
// read those come back by restoring their components from 2c2f34d rather than
// by rebuilding anything.
export default function GithubPanel({ view }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const alive = React.useRef(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const answer = await fetchGithubRepositories();
      if (!alive.current) return;
      setData(answer);
      setError(null);
    } catch (failure) {
      if (!alive.current) return;
      setError(failure.message);
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

  if (data === null) {
    return error === null ? (
      <p className="text-[13px] text-neutral-500 font-normal">Reading the server…</p>
    ) : (
      <Notice tone="rose">{error}</Notice>
    );
  }

  // Two ages, because they answer different questions and can drift apart: the
  // checkout comparison is local and always current, while the GitHub half is
  // whatever the last conditional request came back with. Both are shown so
  // that "I just opened an issue and it is not here" has an answer on the page
  // rather than needing one from me.
  const rate = data.rate ?? {};
  const View = VIEWS[view] ?? Repositories;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[11px] text-neutral-600 tabular-nums">
          {data.collected ? `checkouts read ${formatAgo(data.generated)}` : 'not collected yet'}
          {data.detail ? ` · GitHub asked ${formatAgo(data.detail)}` : ''}
          {data.org ? ` · ${data.org}` : ''}
          {typeof rate.remaining === 'number'
            ? ` · ${rate.remaining} API requests left this hour`
            : ''}
        </p>
        <Button type="button" className="ml-auto" disabled={loading} onClick={load}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
          Refresh
        </Button>
      </div>

      {!data.collected && (
        <Notice tone="amber">
          The deploy has not written a snapshot yet. It is written at the end of every deploy tick,
          so this fills in within a minute or two of the timer running.
        </Notice>
      )}
      {data.collected && data.stale && (
        <Notice tone="amber">
          This was taken {formatAgo(data.generated)} and the deploy normally refreshes it every
          minute. The deploy timer may have stopped — everything below could be well out of date.
        </Notice>
      )}
      {data.note && <Notice tone="amber">{data.note}</Notice>}
      {error && <Notice tone="rose">{error}</Notice>}

      <div className={`transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`}>
        {/* Handed down so a section that has asked for something can watch for
            it to land, rather than leaving somebody to press Refresh at a
            deploy tick they cannot see. */}
        <View data={data} onRefresh={load} />
      </div>
    </div>
  );
}
