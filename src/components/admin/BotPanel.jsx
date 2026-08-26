import React from 'react';
import { Bot, RefreshCw, Check as CheckIcon } from 'lucide-react';
import {
  clearBotPresence,
  fetchBot,
  formatAgo,
  restartBot,
  setBotPresence,
} from '../../lib/admin';
import { Button, Check, Empty, Notice, Panel } from './ui';
import Health from './bot/Health';

const REFRESH_MS = 30000;
const RESTART_POLL_MS = 1000;
const RESTART_WAIT_MS = 60000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function BotPanel({ canManage }) {
  const [health, setHealth] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [note, setNote] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [live, setLive] = React.useState(true);
  const [readAt, setReadAt] = React.useState(null);
  const [restart, setRestart] = React.useState(null);

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const answer = await fetchBot();
      setHealth(answer);
      setError(null);
      setReadAt(Date.now());
    } catch (failure) {
      if (!quiet) setError(failure.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!live || busy) return undefined;
    const poll = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      load(true);
    }, REFRESH_MS);
    return () => clearInterval(poll);
  }, [live, busy, load]);

  const act = React.useCallback(
    async (work, done) => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const answer = await work();
        setNote(done(answer));
        await load(true);
        setReadAt(Date.now());
      } catch (failure) {
        setError(failure.message);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const runRestart = React.useCallback(async () => {
    const before = health?.pid ?? null;
    const startedAt = Date.now();

    setBusy(true);
    setError(null);
    setNote(null);
    setRestart({ phase: 'asking', before });

    try {
      const answer = await restartBot('restarted from the studio panel');
      setRestart({ phase: 'waiting', before, inMs: answer?.inMs ?? null });

      const deadline = startedAt + RESTART_WAIT_MS;
      let latest = null;

      while (Date.now() < deadline) {
        await wait(RESTART_POLL_MS);

        let fresh = null;
        try {
          fresh = await fetchBot();
        } catch {
          setRestart((current) => ({ ...current, phase: 'down' }));
          continue;
        }

        if (before !== null && fresh.pid === before) continue;

        latest = fresh;
        setHealth(fresh);
        setReadAt(Date.now());

        if (fresh.ready) {
          setRestart({ phase: 'back', before, data: fresh, tookMs: Date.now() - startedAt });
          return;
        }

        setRestart((current) => ({ ...current, phase: 'starting', before, data: fresh }));
      }

      setRestart(
        latest
          ? { phase: 'partial', before, data: latest, tookMs: Date.now() - startedAt }
          : { phase: 'lost', before, tookMs: Date.now() - startedAt },
      );
    } catch (failure) {
      setError(failure.message);
      setRestart(null);
    } finally {
      setBusy(false);
    }
  }, [health?.pid]);

  if (loading && !health) {
    return (
      <Panel title="Bot" icon={Bot}>
        <Empty>Reaching the bot…</Empty>
      </Panel>
    );
  }

  if (!health) {
    return (
      <div className="w-full flex flex-col gap-6">
        <Notice tone="rose">{error ?? 'The bot could not be reached.'}</Notice>
        <Panel title="Bot" icon={Bot}>
          <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
            <p className="mb-3">
              The panel talks to the bot over a loopback-only control port on the same machine. This
              message means the bot is not answering there — usually because its process is down, or
              because it was started without its control token.
            </p>
            <Button type="button" onClick={() => load()} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              Try again
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-center justify-end gap-3 flex-wrap">
        {readAt && (
          <span className="hidden sm:inline text-[11px] text-neutral-600 font-normal">
            read {formatAgo(readAt)}
          </span>
        )}
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

      {error && <Notice tone="rose">{error}</Notice>}
      {note && (
        <Notice tone="emerald" icon={CheckIcon}>
          {note}
        </Notice>
      )}

      <Health
        data={health}
        canManage={canManage}
        busy={busy}
        restart={restart}
        onPresence={(text, emoji) =>
          act(
            () => setBotPresence(text, emoji),
            () => 'The bot is showing that status now.',
          )
        }
        onClearPresence={() =>
          act(
            () => clearBotPresence(),
            () => 'The custom status is gone.',
          )
        }
        onRestart={runRestart}
      />
    </div>
  );
}
