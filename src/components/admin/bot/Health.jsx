import React from 'react';
import { Activity, Server, Smile, RotateCw, Check as CheckIcon } from 'lucide-react';
import { formatBytes, formatCount, formatUptimeMs } from '../../../lib/admin';
import { Button, Empty, Field, Figure, Notice, Panel, Pill, Row, TextInput } from '../ui';

const STATUS_MAX = 128;

const RESTART_LINES = {
  asking: 'Asking the bot to exit…',
  waiting: 'It is exiting now  waiting for systemd to bring it back…',
  down: 'The control port stopped answering. That is the restart itself — still waiting…',
  starting: 'It is back on the control port and logging in to Discord…',
};

function RestartReport({ restart }) {
  if (!restart) return null;

  const { phase, before, data, tookMs } = restart;

  if (phase !== 'back' && phase !== 'partial' && phase !== 'lost') {
    return (
      <div className="border border-[#282832] px-4 py-3 mb-4 flex items-center gap-3">
        <RotateCw className="h-3.5 w-3.5 text-amber-300 animate-spin shrink-0" strokeWidth={2} />
        <span className="text-[13px] text-neutral-300 font-normal">
          {RESTART_LINES[phase] ?? 'Restarting…'}
        </span>
      </div>
    );
  }

  if (phase === 'lost') {
    return (
      <Notice tone="rose">
        The bot went down and has not come back within a minute. Check{' '}
        <code className="font-mono text-[11px]">systemctl status amitista-bot</code> on the box — it
        may have failed to start rather than merely being slow.
      </Notice>
    );
  }

  const guilds = data?.guilds ?? [];
  const members = guilds.reduce((sum, guild) => sum + (guild.members ?? 0), 0);
  const seconds = Number.isFinite(tookMs) ? (tookMs / 1000).toFixed(1) : null;

  return (
    <div className="mb-4">
      {phase === 'partial' ? (
        <Notice>
          It restarted and is answering, but it had not finished logging in to Discord a minute
          later. What it reported is below.
        </Notice>
      ) : (
        <Notice tone="emerald" icon={CheckIcon}>
          The bot is back{seconds ? ` — ${seconds}s` : ''}.
        </Notice>
      )}
      <div className="border border-[#282832] mt-4">
        <Row label="Process" value={`pid ${before ?? '—'} → ${data?.pid ?? '—'}`} />
        <Row label="Logged in as" value={data?.user?.tag ?? 'not yet'} />
        <Row
          label="Servers"
          value={`${formatCount(guilds.length)} · ${formatCount(members)} members`}
        />
        <Row
          label="Gateway"
          value={data?.ping === null || data?.ping === undefined ? 'no heartbeat yet' : `${data.ping} ms`}
        />
        <Row label="Modules" value={`${formatCount((data?.modules ?? []).length)} loaded`} />
        <Row label="Memory" value={formatBytes(data?.memory?.rss ?? 0)} />
      </div>
    </div>
  );
}

export default function Health({
  data,
  canManage,
  busy,
  restart,
  onPresence,
  onClearPresence,
  onRestart,
}) {
  const [text, setText] = React.useState('');
  const [emoji, setEmoji] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);

  const presence = data?.presence ?? null;

  React.useEffect(() => {
    setText(presence?.text ?? '');
    setEmoji(presence?.emoji ?? '');
  }, [presence?.text, presence?.emoji]);

  if (!data) return <Empty>Reading the bot…</Empty>;

  const guilds = data.guilds ?? [];
  const members = guilds.reduce((sum, guild) => sum + (guild.members ?? 0), 0);
  const state = String(emoji ? `${emoji} ${text}` : text);
  const tooLong = state.length > STATUS_MAX;

  return (
    <div className="w-full flex flex-col gap-6">
      {!data.ready && (
        <Notice>
          The bot is connected to its control port but has not finished logging in to Discord.
          Everything below is what it knew at that moment.
        </Notice>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Figure
          label="State"
          value={data.ready ? 'Online' : 'Starting'}
          tone={data.ready ? 'text-emerald-400' : 'text-amber-300'}
          hint={data.user?.tag ?? '—'}
        />
        <Figure label="Uptime" value={formatUptimeMs(data.uptimeMs)} hint={`pid ${data.pid ?? '—'}`} />
        <Figure
          label="Gateway"
          value={data.ping === null || data.ping === undefined ? '—' : `${data.ping} ms`}
          tone={data.ping !== null && data.ping > 400 ? 'text-amber-300' : 'text-white'}
          hint={data.ping === null ? 'no heartbeat measured yet' : 'round trip to Discord'}
        />
        <Figure
          label="Memory"
          value={formatBytes(data.memory?.rss ?? 0)}
          hint={`heap ${formatBytes(data.memory?.heapUsed ?? 0)}`}
        />
      </div>

      <Panel title={`Servers — ${guilds.length}`} icon={Server}>
        {guilds.length === 0 ? (
          <Empty>The bot is not in any server.</Empty>
        ) : (
          guilds.map((guild) => (
            <Row
              key={guild.id}
              label={guild.name}
              value={`${formatCount(guild.members)} members · ${formatCount(guild.channels)} channels`}
            />
          ))
        )}
        <Row label="Members across every server" value={formatCount(members)} />
      </Panel>

      <Panel
        title="Custom status"
        icon={Smile}
        action={presence ? <Pill tone="purple">showing</Pill> : <Pill>none set</Pill>}
      >
        <div className="px-4 sm:px-6 py-5">
          {!canManage ? (
            <p className="text-[13px] text-neutral-400 font-normal">
              {presence
                ? `The bot is showing “${presence.emoji ? `${presence.emoji} ` : ''}${presence.text}”.`
                : 'The bot has no custom status.'}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-x-4">
                <Field label="Emoji" htmlFor="bot-status-emoji" hint="Unicode only">
                  <TextInput
                    id="bot-status-emoji"
                    value={emoji}
                    maxLength={16}
                    placeholder="🎨"
                    onChange={(event) => setEmoji(event.target.value)}
                  />
                </Field>
                <Field
                  label="Status"
                  htmlFor="bot-status-text"
                  hint={`${state.length}/${STATUS_MAX} characters, emoji included`}
                >
                  <TextInput
                    id="bot-status-text"
                    value={text}
                    maxLength={STATUS_MAX * 2}
                    placeholder="Cooking"
                    onChange={(event) => setText(event.target.value)}
                  />
                </Field>
              </div>

              {tooLong && (
                <p className="text-[12px] text-rose-300 font-normal mb-4">
                  Discord caps a status at {STATUS_MAX} characters — that one is {state.length}.
                </p>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  type="button"
                  tone="solid"
                  disabled={busy || !text.trim() || tooLong}
                  onClick={() => onPresence(text.trim(), emoji.trim())}
                >
                  <CheckIcon className="h-3.5 w-3.5" strokeWidth={2} />
                  Set status
                </Button>
                <Button type="button" disabled={busy || !presence} onClick={onClearPresence}>
                  Clear
                </Button>
              </div>

              <p className="text-[12px] text-neutral-500 font-normal mt-4 leading-relaxed">
                Discord does not render custom emoji in a bot&apos;s status, so only unicode ones are
                accepted. This is the same status <code className="font-mono text-[11px]">/botstatus</code>{' '}
                sets, and it survives a restart.
              </p>
            </>
          )}
        </div>
      </Panel>

      <Panel title="Loaded modules" icon={Activity}>
        <div className="px-4 sm:px-6 py-5 flex flex-wrap gap-2">
          {(data.modules ?? []).map((name) => (
            <span
              key={name}
              className="border border-[#282832] px-2 py-[3px] text-[11px] text-neutral-400 font-mono"
            >
              {name}
            </span>
          ))}
        </div>
      </Panel>

      {canManage && (
        <Panel title="Restart" icon={RotateCw}>
          <div className="px-4 sm:px-6 py-5">
            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-4">
              The bot exits and systemd starts it again within a couple of seconds. Anything
              half-finished in Discord — an open panel, a form someone is filling in — is lost.
              Orders, applications and levels live on disk, so they come back untouched.
            </p>

            <RestartReport restart={restart} />

            {confirming ? (
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  type="button"
                  tone="danger"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    onRestart();
                  }}
                >
                  Yes, restart the bot
                </Button>
                <Button type="button" disabled={busy} onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button type="button" tone="danger" disabled={busy} onClick={() => setConfirming(true)}>
                <RotateCw className={`h-3.5 w-3.5${busy ? ' animate-spin' : ''}`} strokeWidth={2} />
                {busy ? 'Restarting…' : 'Restart the bot'}
              </Button>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
