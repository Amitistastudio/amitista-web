import React from 'react';
import { KeySquare, BarChart3, ShieldAlert, Bell, BookOpen } from 'lucide-react';
import { fetchKeys, fetchKeyEvents, isRefusal } from '../../lib/admin';
import { Empty, Notice, Panel, SubNav } from './ui';
import { MintedKey } from './api/shared';
import MyKeys from './api/MyKeys';
import MyUsage from './api/MyUsage';
import MyEvents from './api/MyEvents';
import Alerts from './api/Alerts';
import Reference from './api/Reference';

const DAY = 86400000;

const TABS = [
  { id: 'keys', label: 'Keys', icon: KeySquare },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
  { id: 'security', label: 'Security', icon: ShieldAlert },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'reference', label: 'Reference', icon: BookOpen },
];

function tabFromHash() {
  if (typeof window === 'undefined') return 'keys';
  const raw = window.location.hash.replace('#', '').split('/')[1];
  return TABS.some((entry) => entry.id === raw) ? raw : 'keys';
}

function recent(event) {
  const at = Date.parse(event?.at ?? '');
  return !Number.isNaN(at) && Date.now() - at <= DAY;
}

export default function ApiPanel({ onBadges }) {
  const [data, setData] = React.useState(null);
  const [activity, setActivity] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [minted, setMinted] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [reading, setReading] = React.useState(false);
  const [tab, setTab] = React.useState(tabFromHash);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchKeys());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = React.useCallback(async () => {
    setReading(true);
    try {
      setActivity(await fetchKeyEvents());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setReading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    loadActivity();
  }, [load, loadActivity]);

  const pick = React.useCallback((next) => {
    setTab(next);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#api/${next}`);
    }
  }, []);

  React.useEffect(() => {
    function follow() {
      setTab(tabFromHash());
    }
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const keys = data?.keys ?? [];
  const stale = keys.filter((key) => key.revoked || key.expired).length;
  const refused = (activity?.events ?? []).filter((event) => recent(event) && isRefusal(event));
  const refusedCount = refused.length;

  React.useEffect(() => {
    onBadges?.({ keys: stale, security: refusedCount });
  }, [onBadges, stale, refusedCount]);

  if (loading && !data) {
    return (
      <Panel title="API" icon={KeySquare}>
        <Empty>Reading your keys…</Empty>
      </Panel>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <SubNav
        tabs={TABS}
        active={tab}
        onPick={pick}
        badges={{ keys: stale, security: refusedCount }}
        label="API sections"
      />

      {error && <Notice tone="rose">{error}</Notice>}

      {minted && (
        <MintedKey
          name={minted.name}
          value={minted.key}
          rotated={minted.rotated}
          onDone={() => setMinted(null)}
        />
      )}

      {tab === 'keys' && (
        <MyKeys data={data} onChanged={load} onError={setError} onMinted={setMinted} />
      )}

      {tab === 'usage' && <MyUsage data={data} />}

      {tab === 'security' && (
        <MyEvents
          events={activity?.events ?? null}
          keys={keys}
          webhook={activity?.webhook}
          loading={reading}
          onRefresh={loadActivity}
        />
      )}

      {tab === 'alerts' && (
        <Alerts
          state={activity?.webhook}
          embed={activity?.embed}
          discord={activity?.discord}
          facts={activity?.hooks}
          wide={Boolean(activity?.wide)}
          onChanged={(webhook) =>
            setActivity((held) => (held ? { ...held, webhook } : held))
          }
          onEmbedChanged={(embed) =>
            setActivity((held) => (held ? { ...held, embed } : held))
          }
          onDiscordChanged={(discord) =>
            setActivity((held) => (held ? { ...held, discord } : held))
          }
        />
      )}

      {tab === 'reference' && <Reference gateway={data?.gateway} />}
    </div>
  );
}
