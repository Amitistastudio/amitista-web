import React from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchGithubRepositories, formatAgo } from '../../lib/admin';
import { Button, Notice } from './ui';
import Repositories from './github/Repositories';

export const GITHUB_VIEWS = ['github'];

// The group and its gate are real — only the accounts named in PRIVATE_GROUPS
// on the server can reach it, and the server checks rather than trusting the
// nav to hide it.
//
// Nothing in here can change a repository. It reads the snapshot the deploy
// writes and reports it; there is no button that pushes, merges or deploys, and
// adding one would mean handing this service a token it currently cannot read.
//
// One section for now. The collector still gathers pull requests, branches and
// workflow-run history — it costs nothing to keep, because conditional requests
// mean unchanged data is not charged against the rate limit — so the sections
// that read them come back by restoring their components from 2c2f34d rather
// than by rebuilding anything.
export default function GithubPanel() {
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

  // Two ages, because they answer different questions. The checkout comparison
  // is redone every deploy tick; the things only GitHub can answer are asked
  // every few minutes, and saying so is cheaper than someone wondering why
  // something they just pushed is not reflected yet.
  const rate = data.rate ?? {};

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
        <Repositories data={data} />
      </div>
    </div>
  );
}
