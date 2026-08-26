import React from 'react';
import {
  KeySquare,
  RefreshCw,
  BarChart3,
  Users,
  ScrollText,
  Route,
  ClipboardCheck,
} from 'lucide-react';
import { fetchApiStats, fetchSecurity, keyWorks } from '../../lib/admin';
import { Button, Empty, Notice, Panel, SubNav } from './ui';
import { MintedKey } from './api/shared';
import AllKeys from './api/AllKeys';
import Traffic from './api/Traffic';
import Owners from './api/Owners';
import Gateway from './api/Gateway';
import Events from './api/Events';
import ApiReview from './api/ApiReview';

const TABS = [
  { id: 'keys', label: 'Keys', icon: KeySquare },
  { id: 'traffic', label: 'Traffic', icon: BarChart3 },
  { id: 'owners', label: 'Owners', icon: Users },
  { id: 'events', label: 'Events', icon: ScrollText, needs: 'history' },
  { id: 'gateway', label: 'Gateway', icon: Route },
  { id: 'review', label: 'Review', icon: ClipboardCheck },
];

function tabFromHash() {
  if (typeof window === 'undefined') return 'keys';
  const raw = window.location.hash.replace('#', '').split('/')[1];
  return TABS.some((entry) => entry.id === raw) ? raw : 'keys';
}

export default function ApiAdminPanel({ canManage, canSeeHistory, self, onBadges }) {
  const [data, setData] = React.useState(null);
  const [security, setSecurity] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [minted, setMinted] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingHistory, setLoadingHistory] = React.useState(false);
  const [tab, setTab] = React.useState(tabFromHash);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchApiStats());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = React.useCallback(async () => {
    if (!canSeeHistory) return;
    setLoadingHistory(true);
    try {
      setSecurity(await fetchSecurity());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoadingHistory(false);
    }
  }, [canSeeHistory]);

  React.useEffect(() => {
    load();
    loadHistory();
  }, [load, loadHistory]);

  const pick = React.useCallback((next) => {
    setTab(next);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#api-admin/${next}`);
    }
  }, []);

  React.useEffect(() => {
    function follow() {
      setTab(tabFromHash());
    }
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const tokens = data?.tokens ?? [];
  const attention = tokens.filter(
    (token) =>
      (token.expired && !token.revoked) ||
      (keyWorks(token) && !token.note) ||
      (keyWorks(token) && !token.lastUsed),
  ).length;

  React.useEffect(() => {
    onBadges?.({ review: attention });
  }, [onBadges, attention]);

  if (loading && !data) {
    return (
      <Panel title="API" icon={KeySquare}>
        <Empty>Reading the keys and the traffic…</Empty>
      </Panel>
    );
  }

  const allowed = TABS.filter((entry) => entry.needs !== 'history' || canSeeHistory);
  const current = allowed.some((entry) => entry.id === tab) ? tab : allowed[0].id;

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SubNav
          tabs={allowed}
          active={current}
          onPick={pick}
          badges={{ review: attention }}
          label="API admin sections"
        />
        <Button
          type="button"
          onClick={() => {
            load();
            loadHistory();
          }}
          disabled={loading}
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {error && <Notice tone="rose">{error}</Notice>}

      {minted && (
        <MintedKey
          name={minted.name}
          value={minted.key}
          rotated={minted.rotated}
          onDone={() => setMinted(null)}
        />
      )}

      {current === 'keys' && (
        <AllKeys
          data={data}
          canManage={canManage}
          self={self}
          onChanged={() => {
            load();
            loadHistory();
          }}
          onError={setError}
          onMinted={setMinted}
        />
      )}

      {current === 'traffic' && <Traffic data={data} />}

      {current === 'owners' && <Owners data={data} />}

      {current === 'events' && (
        <Events security={security} loading={loadingHistory} onRefresh={loadHistory} />
      )}

      {current === 'gateway' && <Gateway data={data} />}

      {current === 'review' && <ApiReview data={data} />}
    </div>
  );
}
