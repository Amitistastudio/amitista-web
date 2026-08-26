import React from 'react';
import { Check as CheckIcon, Radio } from 'lucide-react';
import { fetchOrder, fetchOrderStats, fetchOrders } from '../../lib/admin';
import { Notice, SubNav } from './ui';
import Book from './orders/Book';
import Figures from './orders/Figures';
import Lookup from './orders/Lookup';
import Project from './orders/Project';
import Settings from './orders/Settings';
import { useOrderLive } from './orders/live';

const TABS = [
  { id: 'figures', label: 'Overview' },
  { id: 'book', label: 'Projects' },
  { id: 'lookup', label: 'Quick lookup' },
  { id: 'settings', label: 'Workflow & fields' },
];

const FRESH_MS = 25000;
const ID_SHAPE = /^\d{17,20}$/;

const PROJECT_TABS = ['overview', 'details', 'files', 'sharing', 'activity'];

function placeFromHash() {
  if (typeof window === 'undefined') return { open: null, tab: 'overview' };
  const parts = window.location.hash.replace('#', '').split('/');
  if (parts[0] !== 'orders') return { open: null, tab: 'overview' };
  return {
    open: ID_SHAPE.test(parts[1] || '') ? parts[1] : null,
    tab: PROJECT_TABS.includes(parts[2]) ? parts[2] : 'overview',
  };
}

function LiveDot({ state, at }) {
  const tone =
    state === 'live'
      ? 'text-emerald-400'
      : state === 'paused'
        ? 'text-neutral-600'
        : 'text-amber-400';
  const word =
    state === 'live' ? 'Live' : state === 'paused' ? 'Paused' : 'Reconnecting';

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide ${tone}`}
      title={at ? `Last checked ${new Date(at).toLocaleTimeString()}` : undefined}
    >
      <Radio className="h-3 w-3" strokeWidth={2.5} />
      {word}
    </span>
  );
}

export default function OrdersPanel({ permissions = [] }) {
  const canManage = permissions.includes('orders.manage');
  const canFiles = permissions.includes('orders.files') || canManage;

  const [tab, setTab] = React.useState('figures');
  const [orders, setOrders] = React.useState([]);
  const [stats, setStats] = React.useState(null);
  const [open, setOpen] = React.useState(() => placeFromHash().open);
  const [projectTab, setProjectTab] = React.useState(() => placeFromHash().tab);
  const [detail, setDetail] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [down, setDown] = React.useState(null);
  const [moved, setMoved] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [book, figures] = await Promise.all([fetchOrders(), fetchOrderStats()]);
      setOrders(book.orders ?? []);
      setDown(book.botDown ?? figures.botDown ?? null);
      setStats(figures.stats ?? null);
      setError(null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOne = React.useCallback(async (id) => {
    try {
      setDetail(await fetchOrder(id));
      setError(null);
    } catch (failure) {
      setError(failure.message);
      setDetail(null);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (open) loadOne(open);
  }, [open, loadOne]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const listen = () => {
      const place = placeFromHash();
      if (place.open) {
        setOpen(place.open);
        setProjectTab(place.tab);
      }
    };
    window.addEventListener('hashchange', listen);
    return () => window.removeEventListener('hashchange', listen);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash.startsWith('#orders')) return;
    const trail = open
      ? `#orders/${open}${projectTab === 'overview' ? '' : `/${projectTab}`}`
      : '#orders';
    window.history.replaceState(null, '', trail);
  }, [open, projectTab]);

  React.useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const onPulse = React.useCallback(
    async (marks) => {
      const changed = new Set(
        orders
          .filter((order) => {
            const mark = marks[order.id];
            return typeof mark === 'number' && mark !== (order.updatedAt ?? 0);
          })
          .map((order) => order.id),
      );
      for (const id of Object.keys(marks)) {
        if (!orders.some((order) => order.id === id)) changed.add(id);
      }

      await load();
      if (open) await loadOne(open);
      if (changed.size) {
        setMoved(changed);
        window.setTimeout(() => setMoved(new Set()), FRESH_MS);
      }
    },
    [orders, open, load, loadOne],
  );

  const live = useOrderLive({ hold: busy, onPulse });

  const badges = {
    book: orders.filter((order) => order.status === 'open' && !order.claimed).length || undefined,
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {error && <Notice tone="rose">{error}</Notice>}
      {notice && !error && (
        <Notice tone="emerald" icon={CheckIcon}>
          {notice}
        </Notice>
      )}
      {down && !error && <Notice tone="amber">{down}</Notice>}

      {open && detail ? (
        <Project
          detail={detail}
          canManage={canManage}
          canFiles={canFiles}
          startOn={projectTab}
          onTab={setProjectTab}
          onBack={() => {
            setOpen(null);
            setProjectTab('overview');
            setDetail(null);
          }}
          onChanged={async () => {
            setBusy(true);
            try {
              await Promise.all([load(), loadOne(open)]);
            } finally {
              setBusy(false);
            }
          }}
          onError={setError}
          onNotice={setNotice}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SubNav tabs={TABS} active={tab} onPick={setTab} badges={badges} label="Orders" />
            </div>
            <LiveDot state={live.state} at={live.at} />
          </div>

          {loading ? (
            <div className="border border-[#282832] bg-[#0a0a0d] px-4 sm:px-6 py-8">
              <p className="text-[13px] text-neutral-400 font-normal">Reading the order book…</p>
            </div>
          ) : tab === 'figures' ? (
            <Figures stats={stats} orders={orders} onOpen={setOpen} />
          ) : tab === 'book' ? (
            <Book orders={orders} onOpen={setOpen} moved={moved} />
          ) : tab === 'lookup' ? (
            <Lookup onOpen={setOpen} />
          ) : (
            <Settings canManage={canManage} onError={setError} onNotice={setNotice} />
          )}
        </>
      )}
    </div>
  );
}
