import React from 'react';
import {
  RefreshCw,
  ShieldHalf,
  Check as CheckIcon,
  Flag,
  ScanSearch,
  Boxes,
  Palette,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react';
import {
  clearShieldFlags,
  countBySeverity,
  evaluateShield,
  fetchBrands,
  fetchShield,
  fetchShieldInstalls,
  runShieldSelfTest,
  setShieldMode,
  setShieldPolicy,
} from '../../lib/admin';
import { Button, Check, Empty, Notice, Panel, SubNav } from './ui';
import Flags from './shield/Flags';
import Detect from './shield/Detect';
import DevMode from './shield/DevMode';
import DevTools from './shield/DevTools';
import Brands from './shield/Brands';
import Installs from './shield/Installs';

const REFRESH_MS = 30000;

const TABS = [
  { id: 'flags', label: 'Flags', icon: Flag },
  { id: 'detect', label: 'Detection', icon: ScanSearch },
  { id: 'installs', label: 'Installs', icon: Boxes },
  { id: 'brands', label: 'Brands', icon: Palette },
  { id: 'mode', label: 'Mode', icon: SlidersHorizontal },
  { id: 'tools', label: 'Tools', icon: Wrench },
];

function tabFromHash() {
  if (typeof window === 'undefined') return 'flags';
  const raw = window.location.hash.replace('#', '').split('/')[1];
  return TABS.some((entry) => entry.id === raw) ? raw : 'flags';
}

export default function ShieldPanel({ canManage, onBadges }) {
  const [shield, setShield] = React.useState(null);
  const [installs, setInstalls] = React.useState(null);
  const [brands, setBrands] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [note, setNote] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [reading, setReading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [verbose, setVerbose] = React.useState(false);
  const [live, setLive] = React.useState(true);
  const [tab, setTab] = React.useState(tabFromHash);

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setShield(await fetchShield());
      setError(null);
    } catch (failure) {
      if (!quiet) setError(failure.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadInstalls = React.useCallback(async () => {
    setReading(true);
    try {
      setInstalls(await fetchShieldInstalls());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setReading(false);
    }
  }, []);

  const loadBrands = React.useCallback(async () => {
    try {
      setBrands(await fetchBrands());
    } catch (failure) {
      setError(failure.message);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (tab === 'installs' && installs === null) loadInstalls();
    if (tab === 'brands' && brands === null) loadBrands();
  }, [tab, installs, brands, loadInstalls, loadBrands]);

  React.useEffect(() => {
    if (!live) return undefined;
    const poll = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      load(true);
    }, REFRESH_MS);
    return () => clearInterval(poll);
  }, [live, load]);

  const pick = React.useCallback((next) => {
    setTab(next);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#shield/${next}`);
    }
  }, []);

  React.useEffect(() => {
    function follow() {
      setTab(tabFromHash());
    }
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const act = React.useCallback(
    async (work, done) => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const answer = await work();
        setNote(done(answer));
        await load();
      } catch (failure) {
        setError(failure.message);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const changeMode = React.useCallback(
    (mode) =>
      act(
        () => setShieldMode(mode),
        (answer) =>
          answer.persisted === false
            ? `Now in ${mode} mode, but it could not be written down — a restart will forget it.`
            : `Now in ${mode} mode.`,
      ),
    [act],
  );

  const clear = React.useCallback(
    () =>
      act(
        () => clearShieldFlags(),
        (answer) =>
          answer.cleared === false
            ? 'The in memory flags are gone, but the file could not be emptied.'
            : 'Every flag has been cleared.',
      ),
    [act],
  );

  const selfTest = React.useCallback(
    () =>
      act(
        () => runShieldSelfTest(),
        (answer) =>
          answer.health?.healthy
            ? 'Every hook is in place.'
            : 'The self test came back degraded — see the probes below.',
      ),
    [act],
  );

  const tune = React.useCallback(
    (id, mode, paths, ruleNote) =>
      act(
        () => setShieldPolicy(id, mode, paths, ruleNote),
        (answer) => {
          const where = answer.paths?.length ? ` under ${answer.paths.join(', ')}` : '';
          if (mode === 'enforce') return `${id} is enforcing again.`;
          if (mode === 'record') return `${id} now records without refusing${where}.`;
          return `${id} is silenced${where} — it will not be recorded either.`;
        },
      ),
    [act],
  );

  const counts = countBySeverity(shield?.history ?? []);
  const serious = counts.critical + counts.high;

  React.useEffect(() => {
    onBadges?.({ flags: serious });
  }, [onBadges, serious]);

  if (loading && !shield) {
    return (
      <Panel title="Shield" icon={ShieldHalf}>
        <Empty>Reading the evaluator…</Empty>
      </Panel>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SubNav
          tabs={TABS}
          active={tab}
          onPick={pick}
          badges={{ flags: serious }}
          label="Shield sections"
        />
        <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
          <Check
            checked={live}
            onChange={setLive}
            label="Live"
            hint={`every ${Math.round(REFRESH_MS / 1000)}s`}
          />
          <Button type="button" onClick={() => load()} disabled={loading || busy}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && <Notice tone="rose">{error}</Notice>}
      {note && (
        <Notice tone="emerald" icon={CheckIcon}>
          {note}
        </Notice>
      )}

      {tab === 'flags' && (
        <Flags
          shield={shield}
          loading={loading}
          verbose={verbose}
          onVerbose={setVerbose}
          canManage={canManage}
          onRefresh={load}
          onClear={clear}
        />
      )}

      {tab === 'detect' && (
        <Detect shield={shield} canManage={canManage} busy={busy} onTune={tune} />
      )}

      {tab === 'installs' && (
        <Installs data={installs} loading={reading} onRefresh={loadInstalls} />
      )}

      {tab === 'brands' && (
        <Brands
          data={brands}
          canManage={canManage}
          onChanged={loadBrands}
          onError={setError}
          onNotice={(value) => {
            setError(null);
            setNote(value);
          }}
        />
      )}

      {tab === 'mode' && (
        <DevMode
          shield={shield}
          canManage={canManage}
          busy={busy}
          onMode={changeMode}
          onSelfTest={selfTest}
        />
      )}

      {tab === 'tools' && <DevTools shield={shield} onEvaluate={evaluateShield} />}
    </div>
  );
}
