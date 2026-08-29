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
// writes each tick and reports it; there is no button that pushes, merges or
// deploys, and adding one would mean handing this service a token it currently
// cannot even read.
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] text-neutral-600 tabular-nums">
          {data.collected ? `checked ${formatAgo(data.generated)}` : 'not collected yet'}
          {data.org ? ` · ${data.org}` : ''}
        </span>
        <Button type="button" className="ml-auto" disabled={loading} onClick={load}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
          Refresh
        </Button>
      </div>

      {error && <Notice tone="rose">{error}</Notice>}

      <div className={`transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`}>
        <Repositories data={data} />
      </div>
    </div>
  );
}
