import React from 'react';
import {
  Users,
  FileText,
  Signpost,
  Globe,
  Smartphone,
  Bot,
  Radar,
  RefreshCw,
} from 'lucide-react';
import {
  TRAFFIC_DEFAULT,
  TRAFFIC_WINDOWS,
  fetchAnalytics,
  formatAgo,
} from '../../lib/admin';
import { Button, Empty, Notice, Panel, SubNav, WindowSwitch } from './ui';
import Visitors from './activity/Visitors';
import Pages from './activity/Pages';
import Sources from './activity/Sources';
import Places from './activity/Places';
import Tech from './activity/Tech';
import Robots from './activity/Robots';
import Live from './activity/Live';

const TABS = [
  { id: 'visitors', label: 'Visitors', icon: Users },
  { id: 'pages', label: 'Pages', icon: FileText },
  { id: 'sources', label: 'Sources', icon: Signpost },
  { id: 'places', label: 'Places', icon: Globe },
  { id: 'devices', label: 'Devices', icon: Smartphone },
  { id: 'robots', label: 'Robots', icon: Bot },
  { id: 'recent', label: 'Recent', icon: Radar },
];

function tabFromHash() {
  if (typeof window === 'undefined') return 'visitors';
  const raw = window.location.hash.replace('#', '').split('/')[1];
  return TABS.some((entry) => entry.id === raw) ? raw : 'visitors';
}

export default function ActivityPanel() {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [span, setSpan] = React.useState(TRAFFIC_DEFAULT);
  const [tab, setTab] = React.useState(tabFromHash);
  const [tick, setTick] = React.useState(0);
  const quiet = React.useRef(false);

  React.useEffect(() => {
    let dropped = false;
    if (!quiet.current) setLoading(true);
    fetchAnalytics(span)
      .then((result) => {
        if (dropped) return;
        setData(result);
        setError(null);
      })
      .catch((failure) => {
        if (!dropped) setError(failure.message);
      })
      .finally(() => {
        if (dropped) return;
        setLoading(false);
        quiet.current = false;
      });
    return () => {
      dropped = true;
    };
  }, [span, tick]);

  React.useEffect(() => {
    const poll = setInterval(() => {
      quiet.current = true;
      setTick((value) => value + 1);
    }, 60000);
    return () => clearInterval(poll);
  }, []);

  const pick = React.useCallback((next) => {
    setTab(next);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#activity/${next}`);
    }
  }, []);

  React.useEffect(() => {
    function follow() {
      setTab(tabFromHash());
    }
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  if (loading && !data) {
    return (
      <Panel title="Activity" icon={Users}>
        <Empty>Reading the access log…</Empty>
      </Panel>
    );
  }

  const chosen = TRAFFIC_WINDOWS.find((entry) => entry.id === span) ?? TRAFFIC_WINDOWS[2];
  const shown = { ...(data ?? {}), label: data?.label ?? chosen.title };

  return (
    <div
      className={`w-full flex flex-col gap-6 transition-opacity duration-200 ${
        loading ? 'opacity-60' : 'opacity-100'
      }`}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SubNav tabs={TABS} active={tab} onPick={pick} label="Activity sections" />
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:shrink-0">
          <span className="hidden sm:inline text-[11px] text-neutral-500 font-normal">
            read {formatAgo(data?.generated)}
          </span>
          <WindowSwitch
            options={TRAFFIC_WINDOWS}
            active={span}
            onPick={setSpan}
            disabled={loading}
            label="How far back to read the activity"
          />
          <Button type="button" onClick={() => setTick((value) => value + 1)} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            {loading ? 'Reading…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && <Notice tone="rose">{error}</Notice>}

      {data?.collected === false && (
        <Notice>
          The snapshot has not written a visitor file yet. The access log is read by the snapshot
          timer, which runs as root every couple of minutes — this fills in on its own once a build
          carrying the collector is installed on the server.
        </Notice>
      )}

      {data?.collected !== false && data?.detailPartial && (
        <Notice>
          Only {data.detailCovered} of {data.detailExpected}{' '}
          {data.detailStep === 'day' ? 'days' : 'hours'} in this window have been kept in detail so
          far. The counts along the top are right for everything the server still holds; the lists
          below only cover the part that has been collected. It fills in an hour at a time.
        </Notice>
      )}

      {data?.capped && (
        <Notice>
          More people arrived in a single hour than the collector keeps individually, so the
          visitor counts in that stretch are a floor rather than an exact figure. The request counts
          are unaffected.
        </Notice>
      )}

      {tab === 'visitors' && <Visitors data={shown} />}
      {tab === 'pages' && <Pages data={shown} />}
      {tab === 'sources' && <Sources data={shown} />}
      {tab === 'places' && <Places data={shown} />}
      {tab === 'devices' && <Tech data={shown} />}
      {tab === 'robots' && <Robots data={shown} />}
      {tab === 'recent' && <Live data={shown} />}
    </div>
  );
}
