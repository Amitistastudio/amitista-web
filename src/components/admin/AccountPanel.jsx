import React from 'react';
import { UserCircle, ShieldCheck, History, MessageCircle } from 'lucide-react';
import { fetchAccount, fetchAccountActivity } from '../../lib/admin';
import { Empty, Notice, Panel, SubNav } from './ui';
import Profile from './account/Profile';
import Security from './account/Security';
import Discord from './account/Discord';
import HistoryView from './account/History';

const TABS = [
  { id: 'profile', label: 'Profile', icon: UserCircle },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'discord', label: 'Discord', icon: MessageCircle },
  { id: 'history', label: 'History', icon: History },
];

function tabFromHash() {
  if (typeof window === 'undefined') return 'profile';
  const raw = window.location.hash.replace('#', '').split('/')[1];
  return TABS.some((entry) => entry.id === raw) ? raw : 'profile';
}

export default function AccountPanel({ onPasswordChanged, onGoTo }) {
  const [account, setAccount] = React.useState(null);
  const [activity, setActivity] = React.useState(null);
  const [activityError, setActivityError] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [tab, setTab] = React.useState(tabFromHash);

  const load = React.useCallback(async () => {
    try {
      setAccount(await fetchAccount());
    } catch (failure) {
      setError(failure.message);
    }
  }, []);

  const loadActivity = React.useCallback(async () => {
    setLoading(true);
    try {
      setActivity(await fetchAccountActivity());
      setActivityError(null);
    } catch (failure) {
      setActivityError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (account && !account.mustChange) loadActivity();
  }, [account, loadActivity]);

  const refresh = React.useCallback(() => {
    load();
    loadActivity();
  }, [load, loadActivity]);

  const pick = React.useCallback((next) => {
    setTab(next);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#account/${next}`);
    }
  }, []);

  React.useEffect(() => {
    function follow() {
      setTab(tabFromHash());
    }
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  if (!account) {
    return (
      <Panel title="Your account" icon={UserCircle}>
        {error ? <Empty>{error}</Empty> : <Empty>Reading your account…</Empty>}
      </Panel>
    );
  }

  if (account.mustChange) {
    return (
      <div className="w-full flex flex-col gap-6">
        {error && <Notice tone="rose">{error}</Notice>}
        <Notice>
          This account is still on the password it was created with. Change it below — the one you
          were handed has been seen by whoever created the account. The rest of your account opens
          once it is your own.
        </Notice>
        <Security account={account} onChanged={load} onPasswordChanged={onPasswordChanged} />
      </div>
    );
  }

  const current = tab;

  return (
    <div className="w-full flex flex-col gap-6">
      <SubNav tabs={TABS} active={current} onPick={pick} label="Account sections" />

      {error && <Notice tone="rose">{error}</Notice>}

      {current === 'profile' && (
        <Profile account={account} activity={activity} onGoTo={onGoTo} onTab={pick} onChanged={load} />
      )}

      {current === 'security' && (
        <Security
          account={account}
          onChanged={refresh}
          onPasswordChanged={onPasswordChanged}
        />
      )}

      {current === 'discord' && <Discord account={account} onChanged={refresh} onGoTo={onGoTo} />}

      {current === 'history' && (
        <HistoryView
          activity={activity}
          error={activityError}
          loading={loading}
          onRefresh={loadActivity}
        />
      )}
    </div>
  );
}
