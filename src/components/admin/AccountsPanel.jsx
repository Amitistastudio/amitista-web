import React from 'react';
import {
  Users,
  Check as CheckIcon,
  KeyRound,
  History,
  ClipboardCheck,
} from 'lucide-react';
import { fetchSecurity, fetchUsers } from '../../lib/admin';
import { Empty, Notice, Panel, SubNav } from './ui';
import { Secret } from './accounts/shared';
import People from './accounts/People';
import Roles from './accounts/Roles';
import Activity from './accounts/Activity';
import Review from './accounts/Review';

const TABS = [
  { id: 'people', label: 'People', icon: Users },
  { id: 'roles', label: 'Roles', icon: KeyRound },
  { id: 'activity', label: 'Activity', icon: History, needs: 'activity' },
  { id: 'review', label: 'Review', icon: ClipboardCheck },
];

function tabFromHash() {
  if (typeof window === 'undefined') return 'people';
  const raw = window.location.hash.replace('#', '').split('/')[1];
  return TABS.some((entry) => entry.id === raw) ? raw : 'people';
}

export default function AccountsPanel({ canManage, canSeeActivity, self, onGoTo, onSignedOut, onBadges }) {
  const [data, setData] = React.useState(null);
  const [security, setSecurity] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [secret, setSecret] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingActivity, setLoadingActivity] = React.useState(false);
  const [tab, setTab] = React.useState(tabFromHash);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchUsers());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = React.useCallback(async () => {
    if (!canSeeActivity) return;
    setLoadingActivity(true);
    try {
      setSecurity(await fetchSecurity());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoadingActivity(false);
    }
  }, [canSeeActivity]);

  React.useEffect(() => {
    load();
    loadActivity();
  }, [load, loadActivity]);

  const refresh = React.useCallback(() => {
    load();
    loadActivity();
  }, [load, loadActivity]);

  const showSecret = React.useCallback((value) => {
    setNotice(null);
    setSecret(value);
  }, []);

  const showNotice = React.useCallback((value) => {
    setSecret(null);
    setNotice(value);
  }, []);

  const pick = React.useCallback((next) => {
    setTab(next);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#accounts/${next}`);
    }
  }, []);

  React.useEffect(() => {
    function follow() {
      setTab(tabFromHash());
    }
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const accounts = data?.users ?? [];
  const attention = accounts.filter(
    (account) =>
      !account.protected &&
      (account.expired || account.mustChange || !account.lastSignIn || !account.note),
  ).length;

  React.useEffect(() => {
    onBadges?.({ review: attention });
  }, [onBadges, attention]);

  if (loading && !data) {
    return (
      <Panel title="Accounts" icon={Users}>
        <Empty>Reading the accounts…</Empty>
      </Panel>
    );
  }

  const allowed = TABS.filter((entry) => entry.needs !== 'activity' || canSeeActivity);
  const current = allowed.some((entry) => entry.id === tab) ? tab : allowed[0].id;

  return (
    <div className="w-full flex flex-col gap-6">
      <SubNav
        tabs={allowed}
        active={current}
        onPick={pick}
        badges={{ review: attention }}
        label="Accounts sections"
      />

      {error && <Notice tone="rose">{error}</Notice>}
      {notice && (
        <Notice tone="emerald" icon={CheckIcon}>
          {notice}
        </Notice>
      )}

      {secret && (
        <Secret
          name={secret.name}
          secret={secret.secret}
          headline={secret.headline ?? 'is ready.'}
          onDone={() => setSecret(null)}
        />
      )}

      {current === 'people' && (
        <People
          data={data}
          audit={security?.audit}
          failures={security?.accounts}
          canManage={canManage}
          self={self}
          onGoTo={onGoTo}
          onChanged={refresh}
          onError={setError}
          onNotice={showNotice}
          onSecret={showSecret}
        />
      )}

      {current === 'roles' && (
        <Roles
          data={data}
          canManageOwners={canManage && Boolean(data?.canManageOwners)}
          onChanged={refresh}
        />
      )}

      {current === 'activity' && (
        <Activity security={security} loading={loadingActivity} onRefresh={loadActivity} />
      )}

      {current === 'review' && (
        <Review
          data={data}
          canManage={canManage}
          onError={setError}
          onSignedOut={onSignedOut}
        />
      )}
    </div>
  );
}
