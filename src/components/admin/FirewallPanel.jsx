import React from 'react';
import { RefreshCw, Ban, Activity, Server } from 'lucide-react';
import { Button, Figure, Notice, SubNav } from './ui';
import {
  deleteFirewallRule,
  fetchFirewall,
  restageFirewall,
  saveFirewallRule,
  setFirewallSettings,
} from '../../lib/admin';
import Rules from './firewall/Rules';
import Traffic from './firewall/Traffic';
import Edge from './firewall/Edge';

const REFRESH_MS = 30000;

const TABS = [
  { id: 'rules', label: 'Rules', icon: Ban },
  { id: 'traffic', label: 'Traffic', icon: Activity },
  { id: 'edge', label: 'Layers', icon: Server },
];

function tabFromHash() {
  if (typeof window === 'undefined') return 'rules';
  const raw = window.location.hash.replace('#', '').split('/')[1];
  return TABS.some((entry) => entry.id === raw) ? raw : 'rules';
}

export default function FirewallPanel({ onBadges }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [note, setNote] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [tab, setTab] = React.useState(tabFromHash);

  const load = React.useCallback(async (quiet) => {
    if (!quiet) setLoading(true);
    try {
      const payload = await fetchFirewall();
      setData(payload);
      setError(null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load(false);
  }, [load]);

  React.useEffect(() => {
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  React.useEffect(() => {
    if (!onBadges) return;
    onBadges(data?.totals?.blocking ?? 0);
  }, [data, onBadges]);

  const pick = (next) => {
    setTab(next);
    if (typeof window !== 'undefined') window.location.hash = `firewall/${next}`;
  };

  const act = async (work, done) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await work();
      setNote(done);
      await load(true);
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async (rule) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await saveFirewallRule(rule);
      setNote('Rule saved.');
      await load(true);
      return true;
    } catch (failure) {
      if (failure.status === 409) {
        const ahead =
          typeof window !== 'undefined' &&
          window.confirm(`${failure.message}\n\nSave it anyway?`);
        if (ahead) {
          try {
            await saveFirewallRule({ ...rule, force: true });
            setNote('Rule saved. It matches your own address — keep firewall-off.sh to hand.');
            await load(true);
            return true;
          } catch (second) {
            setError(second.message);
            return false;
          }
        }
      }
      setError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loading && data === null) {
    return <p className="text-[13px] text-neutral-500 font-normal">Reading the firewall…</p>;
  }

  if (data === null) {
    return <Notice tone="rose">{error ?? 'The firewall could not be read.'}</Notice>;
  }

  const totals = data.totals ?? {};
  const canManage = Boolean(data.canManage);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <SubNav tabs={TABS} active={tab} onPick={pick} label="Firewall sections" />
        <Button type="button" className="ml-auto" disabled={loading} onClick={() => load(false)}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
          Refresh
        </Button>
      </div>

      {!data.settings?.enabled && (
        <Notice tone="rose">
          The firewall is switched off. Rules are kept but nothing is blocked or logged.
        </Notice>
      )}

      {error && <Notice tone="rose">{error}</Notice>}
      {note && <Notice tone="emerald">{note}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Blocking" value={totals.blocking ?? 0} tone="text-rose-400" />
        <Figure label="Watching" value={totals.watching ?? 0} tone="text-amber-300" />
        <Figure label="Blocked recently" value={totals.blocked ?? 0} hint="in the panel's window" />
        <Figure label="Watched recently" value={totals.observed ?? 0} hint="in the panel's window" />
      </div>

      {tab === 'rules' && (
        <Rules
          data={data}
          canManage={canManage}
          busy={busy}
          onSave={save}
          onDelete={(id) => act(() => deleteFirewallRule(id), 'Rule removed.')}
        />
      )}

      {tab === 'traffic' && <Traffic data={data} />}

      {tab === 'edge' && (
        <Edge
          data={data}
          canManage={canManage}
          busy={busy}
          onSettings={(fields) => act(() => setFirewallSettings(fields), 'Firewall updated.')}
          onRestage={() => act(() => restageFirewall(), 'Edge config rewritten.')}
        />
      )}
    </div>
  );
}
