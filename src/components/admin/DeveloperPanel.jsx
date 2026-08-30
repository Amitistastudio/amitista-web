import React from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchDeveloper, formatAgo } from '../../lib/admin';
import { Button, Notice } from './ui';
import Health from './developer/Health';
import Endpoints from './developer/Endpoints';
import Releases from './developer/Releases';
import Performance from './developer/Performance';

export const DEVELOPER_VIEWS = [
  'dev-health',
  'dev-endpoints',
  'dev-performance',
  'dev-releases',
];

const VIEWS = {
  'dev-health': Health,
  'dev-endpoints': Endpoints,
  'dev-performance': Performance,
  'dev-releases': Releases,
};

// One fetch backs all four sections. AdminPage renders this component for every
// developer section, so moving between them keeps it mounted and reuses the
// payload it already has — the snapshot only changes every five minutes anyway.
export default function DeveloperPanel({ view }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const alive = React.useRef(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const answer = await fetchDeveloper();
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

  const View = VIEWS[view] ?? Health;

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
          {data.stale ? (
            <span className="text-amber-300">
              snapshot {formatAgo(data.generated)} — the collector may be stuck
            </span>
          ) : (
            `snapshot ${formatAgo(data.generated)}`
          )}
          {data.host ? ` · ${data.host}` : ''}
        </span>
        <Button type="button" className="ml-auto" disabled={loading} onClick={load}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
          Refresh
        </Button>
      </div>

      {error && <Notice tone="rose">{error}</Notice>}

      <div className={`transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`}>
        <View data={data} />
      </div>
    </div>
  );
}
