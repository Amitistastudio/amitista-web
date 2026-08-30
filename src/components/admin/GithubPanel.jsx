import React from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchGithubRepositories, formatAgo } from '../../lib/admin';
import { Button, Notice } from './ui';
import Repositories from './github/Repositories';
import Issues from './github/Issues';
import Pulls from './github/Pulls';
import Performance from './github/Performance';
import Vitals from './github/Vitals';
import Tracking from './github/Tracking';
import Security from './github/Security';
import Organization from './github/Organization';
import People from './github/People';

export const GITHUB_VIEWS = [
  'github',
  'github-issues',
  'github-pulls',
  'github-performance',
  'github-vitals',
  'github-tracking',
  'github-security',
  'github-org',
  'github-people',
];

const VIEWS = {
  github: Repositories,
  'github-issues': Issues,
  'github-pulls': Pulls,
  'github-performance': Performance,
  'github-vitals': Vitals,
  'github-tracking': Tracking,
  'github-security': Security,
  'github-org': Organization,
  'github-people': People,
};

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
        <View data={data} onRefresh={load} />
      </div>
    </div>
  );
}
