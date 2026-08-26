import React from 'react';
import {
  MessageCircle,
  Copy,
  Check as CheckIcon,
  Unplug,
  ShieldCheck,
  ExternalLink,
  Bell,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import {
  DISCORD_IMAGE,
  cancelDiscordLink,
  checkDiscordLink,
  fetchDiscordProfile,
  formatStamp,
  setDiscordNickname,
  setDiscordPrefs,
  startDiscordLink,
  unlinkDiscord,
} from '../../../lib/admin';
import { Bar, Button, Check, Field, Notice, Panel, Pill, Row, Select, TextInput } from '../ui';

const POLL_MS = 3000;

const STEPS = [
  'Confirm it is you with your panel password, and the panel hands you a one-time code.',
  'Open a DM with the bot from the button above and send it the code — nothing else, just the code.',
  'The bot asks whether it is really you. Press confirm, and this page finishes the link.',
];

const NOTICES = [
  {
    id: 'signin',
    label: 'New sign-in addresses',
    hint: 'A DM when your account signs in from an address it has not seen before.',
  },
  {
    id: 'boardDue',
    label: 'Board cards coming due',
    hint: 'The reminders a board owner set — 2 days out, then a day, then whatever else they added.',
  },
  {
    id: 'boardAssigned',
    label: 'Being put on a card',
    hint: 'When somebody adds you to a card on a board you are on.',
  },
  {
    id: 'boardComment',
    label: 'Comments on your cards',
    hint: 'When somebody comments on a card you are on. Chatty — off to start with.',
  },
  {
    id: 'boardMoved',
    label: 'Your cards moving',
    hint: 'When a card you are on changes column or gets ticked. Chatty — off to start with.',
  },
];

const HOURS = Array.from({ length: 48 }, (_, index) => index * 30);

function hourLabel(minute) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function localOffset() {
  return typeof Intl === 'undefined' ? 0 : -new Date().getTimezoneOffset();
}

function offsetLabel(offset) {
  const sign = offset < 0 ? '-' : '+';
  const size = Math.abs(offset);
  const minutes = size % 60;
  return `UTC${sign}${Math.floor(size / 60)}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}

function art(kind, version) {
  return `${DISCORD_IMAGE}?kind=${kind}&v=${encodeURIComponent(version ?? '')}`;
}

function remaining(expires) {
  if (!expires) return null;
  const left = Math.round(expires - Date.now() / 1000);
  return left > 0 ? left : 0;
}

function clock(seconds) {
  const safe = Math.max(0, seconds ?? 0);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function stampFromMs(ms) {
  return ms ? formatStamp(new Date(ms).toISOString()) : '—';
}

function OpenDm({ bot }) {
  if (!bot?.profile) return null;
  return (
    <a
      href={bot.profile}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[12px] font-semibold tracking-wide bg-white text-black hover:bg-neutral-200 transition-colors"
    >
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
      Open a DM with the bot
    </a>
  );
}

function BotCard({ bot, down }) {
  if (down) {
    return (
      <Notice tone="amber">
        The bot is not answering right now, so the panel cannot hand out a code. {down}
      </Notice>
    );
  }
  if (!bot) return null;

  return (
    <div className="border border-[#282832] bg-[#111115] px-5 py-4 flex flex-wrap items-center gap-4">
      <img
        src={art('bot')}
        alt=""
        className="h-12 w-12 rounded-full shrink-0"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-white font-medium truncate">{bot.username}</p>
        <p className="text-[12px] text-neutral-500 font-mono truncate">
          {bot.tag}
          {bot.guild ? ` · ${bot.guild.name}` : ''}
        </p>
      </div>
      <OpenDm bot={bot} />
    </div>
  );
}

function CodeBox({ code, bot }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <p className="text-[30px] sm:text-[38px] font-mono font-semibold text-white tracking-[0.2em] leading-none">
        {code}
      </p>
      <Button type="button" onClick={copy}>
        {copied ? (
          <CheckIcon className="h-3.5 w-3.5" strokeWidth={2} />
        ) : (
          <Copy className="h-3.5 w-3.5" strokeWidth={2} />
        )}
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <OpenDm bot={bot} />
    </div>
  );
}

function Portrait({ profile, version }) {
  const banner = profile?.art?.banner;
  const decoration = profile?.art?.decoration;
  const accent = profile?.user?.accent;

  return (
    <div className="relative">
      {banner ? (
        <img src={art('banner', version)} alt="" className="h-28 w-full object-cover" />
      ) : (
        <div className="h-28 w-full" style={{ background: accent ?? '#1c1c22' }} />
      )}
      <div className="px-4 sm:px-6 pb-5 -mt-10 flex items-end gap-4">
        <div className="relative shrink-0">
          <img
            src={art(profile?.art?.member ? 'member' : 'avatar', version)}
            alt=""
            className="h-20 w-20 rounded-full border-4 border-[#0a0a0d] bg-[#0a0a0d]"
          />
          {decoration && (
            <img
              src={art('decoration', version)}
              alt=""
              className="absolute -inset-[10%] h-[120%] w-[120%] max-w-none pointer-events-none"
            />
          )}
        </div>
        <div className="min-w-0 pb-1">
          <p className="text-[17px] text-white font-medium truncate">
            {profile?.member?.displayName || profile?.user?.displayName || profile?.user?.username}
          </p>
          <p className="text-[12px] text-neutral-500 font-mono truncate">{profile?.user?.tag}</p>
        </div>
      </div>
    </div>
  );
}

function Roles({ roles }) {
  if (!roles?.length) return <span className="text-[13px] text-neutral-500">none yet</span>;
  return (
    <div className="flex flex-wrap gap-2 justify-end">
      {roles.map((role) => (
        <span
          key={role.id}
          className="inline-flex items-center gap-1.5 border border-[#282832] px-2 py-[3px] text-[11px] text-neutral-300"
        >
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ background: role.colour && role.colour !== '#000000' ? role.colour : '#4b4b57' }}
          />
          {role.name}
        </span>
      ))}
    </div>
  );
}

function Standing({ standing }) {
  if (!standing) return null;
  const percent = standing.needed ? Math.round((standing.into / standing.needed) * 100) : 0;

  return (
    <div className="px-4 sm:px-6 py-4 border-b border-[#17171d]">
      <div className="flex items-baseline justify-between gap-6 mb-2">
        <span className="text-[13px] text-neutral-400">
          Level {standing.level}
          {standing.rank ? ` · ${standing.rank} of ${standing.of} in the server` : ''}
        </span>
        <span className="text-[13px] text-neutral-300 font-medium tabular-nums">
          {standing.into.toLocaleString('en-GB')} / {standing.needed.toLocaleString('en-GB')} XP
        </span>
      </div>
      <Bar percent={percent} />
      <p className="text-[11px] text-neutral-600 font-normal mt-2 tabular-nums">
        {standing.msgs.toLocaleString('en-GB')} messages · {standing.voiceMin.toLocaleString('en-GB')}{' '}
        minutes in voice · {standing.reacts.toLocaleString('en-GB')} reactions
      </p>
    </div>
  );
}

function Nickname({ profile, onSaved }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(profile?.member?.nickname ?? '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    setValue(profile?.member?.nickname ?? '');
  }, [profile?.member?.nickname]);

  if (!profile?.member?.present) return null;

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await setDiscordNickname(value);
      setEditing(false);
      onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <Row
        label="Server nickname"
        value={
          <span className="inline-flex items-center gap-3">
            {profile.member.nickname || <span className="text-neutral-500">not set</span>}
            {profile.member.renameable && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 text-[12px] text-purple-300 hover:text-purple-200"
              >
                <Pencil className="h-3 w-3" strokeWidth={2} />
                change
              </button>
            )}
          </span>
        }
      />
    );
  }

  return (
    <form onSubmit={save} className="px-4 sm:px-6 py-4 border-b border-[#17171d]">
      {error && (
        <p role="alert" className="text-[13px] text-rose-400 font-normal mb-3">
          {error}
        </p>
      )}
      <Field label="Server nickname" htmlFor="discord-nickname" hint="Up to 32 characters. Leave it empty to go back to your Discord name.">
        <TextInput
          id="discord-nickname"
          maxLength={32}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
      <div className="flex gap-3">
        <Button type="submit" tone="solid" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(profile.member.nickname ?? '');
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Notices({ discord, onSaved, onGoTo }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const prefs = discord.prefs ?? {};
  const quiet = prefs.quiet ?? null;

  async function keep(changes) {
    setBusy(true);
    setError(null);
    try {
      await setDiscordPrefs({ ...prefs, ...changes });
      onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const window_ = (from, to) =>
    keep({ quiet: { on: true, from, to, offset: quiet?.offset ?? localOffset() } });

  return (
    <Panel title="What the bot DMs you" icon={Bell}>
      <div className="px-4 sm:px-6 py-5">
        {error && (
          <p role="alert" className="text-[13px] text-rose-400 font-normal mb-3">
            {error}
          </p>
        )}
        <p className="text-[13px] text-neutral-500 font-normal leading-relaxed mb-3">
          The bot only ever DMs the account linked here, and never anybody else.
        </p>
        {NOTICES.map((notice) => (
          <Check
            key={notice.id}
            checked={Boolean(prefs[notice.id])}
            disabled={busy}
            label={notice.label}
            hint={notice.hint}
            onChange={(on) => keep({ [notice.id]: on })}
          />
        ))}

        <div className="mt-4 pt-4 border-t border-[#17171d]">
          <Check
            checked={Boolean(quiet)}
            disabled={busy}
            label="Hold card reminders overnight"
            hint="A reminder that falls inside these hours waits until they are over rather than being lost."
            onChange={(on) => (on ? window_(22 * 60, 8 * 60) : keep({ quiet: null }))}
          />
          {quiet && (
            <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
              <span className="text-[13px] text-neutral-500 font-normal">From</span>
              <span className="inline-block w-[104px]">
                <Select
                  value={quiet.from}
                  disabled={busy}
                  aria-label="Quiet hours start"
                  onChange={(event) => window_(Number(event.target.value), quiet.to)}
                >
                  {HOURS.map((minute) => (
                    <option key={minute} value={minute}>
                      {hourLabel(minute)}
                    </option>
                  ))}
                </Select>
              </span>
              <span className="text-[13px] text-neutral-500 font-normal">to</span>
              <span className="inline-block w-[104px]">
                <Select
                  value={quiet.to}
                  disabled={busy}
                  aria-label="Quiet hours end"
                  onChange={(event) => window_(quiet.from, Number(event.target.value))}
                >
                  {HOURS.map((minute) => (
                    <option key={minute} value={minute}>
                      {hourLabel(minute)}
                    </option>
                  ))}
                </Select>
              </span>
              <span className="text-[11px] text-neutral-600 font-normal">
                {offsetLabel(quiet.offset ?? 0)}
                {(quiet.offset ?? 0) !== localOffset() && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        keep({
                          quiet: { on: true, from: quiet.from, to: quiet.to, offset: localOffset() },
                        })
                      }
                      className="text-purple-300 hover:text-purple-200"
                    >
                      set to this device ({offsetLabel(localOffset())})
                    </button>
                  </>
                )}
              </span>
            </div>
          )}
          <p className="text-[13px] text-neutral-500 font-normal leading-relaxed mt-1 pl-7">
            Sign-in warnings and being put on a card still come straight through — those are worth
            waking up for.
          </p>
        </div>

        <p className="text-[13px] text-neutral-500 font-normal leading-relaxed mt-4 pt-4 border-t border-[#17171d]">
          {(prefs.events ?? []).length
            ? `Your API keys also DM you about ${(prefs.events ?? []).length} kind${(prefs.events ?? []).length === 1 ? '' : 's'} of event.`
            : 'Your API keys can DM you here too — key used from a new address, scope refused, rate limits, and the rest.'}{' '}
          <button
            type="button"
            onClick={() => {
              onGoTo?.('api');
              if (typeof window !== 'undefined') window.location.hash = 'api/alerts';
            }}
            className="text-purple-300 hover:text-purple-200"
          >
            Choose them under API → Alerts
          </button>
          .
        </p>
      </div>
    </Panel>
  );
}

export default function Discord({ account, onChanged, onGoTo }) {
  const [data, setData] = React.useState(null);
  const [phase, setPhase] = React.useState('idle');
  const [code, setCode] = React.useState(null);
  const [expires, setExpires] = React.useState(null);
  const [seen, setSeen] = React.useState(null);
  const [left, setLeft] = React.useState(null);
  const [password, setPassword] = React.useState('');
  const [removing, setRemoving] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [note, setNote] = React.useState(null);

  const discord = data?.discord ?? account.discord ?? {};
  const profile = data?.profile ?? null;
  const bot = data?.bot ?? null;
  const linked = Boolean(discord.linked);
  const waiting = phase === 'waiting' || phase === 'seen';
  const version = discord.seen ?? discord.since ?? '';

  const load = React.useCallback(async () => {
    try {
      setData(await fetchDiscordProfile());
    } catch (failure) {
      setError(failure.message);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const apply = React.useCallback(
    (result) => {
      setError(null);
      if (result.status === 'linked') {
        setPhase('idle');
        setCode(null);
        setSeen(null);
        setNote('Linked. Your Discord account is connected to this panel account.');
        load();
        onChanged();
        return;
      }
      if (result.status === 'expired') {
        setPhase('idle');
        setCode(null);
        setSeen(null);
        setNote('That code ran out before it reached the bot. Start again when you are ready.');
        return;
      }
      if (result.status === 'idle') {
        setPhase('idle');
        setCode(null);
        setSeen(null);
        return;
      }
      setPhase(result.status === 'confirmed' ? 'seen' : result.status);
      if (result.code) setCode(result.code);
      if (result.expires) setExpires(result.expires);
      setSeen(result.user ?? null);
    },
    [load, onChanged],
  );

  React.useEffect(() => {
    let live = true;
    if (linked) return undefined;
    checkDiscordLink()
      .then((result) => {
        if (live && result.status !== 'idle') apply(result);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [apply, linked]);

  React.useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => {
      checkDiscordLink()
        .then(apply)
        .catch((failure) => setError(failure.message));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, apply]);

  React.useEffect(() => {
    if (!waiting || !expires) {
      setLeft(null);
      return undefined;
    }
    setLeft(remaining(expires));
    const timer = setInterval(() => setLeft(remaining(expires)), 1000);
    return () => clearInterval(timer);
  }, [waiting, expires]);

  async function start(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await startDiscordLink(password);
      setPassword('');
      setCode(result.code);
      setExpires(result.expires);
      setSeen(null);
      setPhase('waiting');
      if (result.bot) setData((held) => ({ ...(held ?? {}), bot: result.bot }));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      apply(await cancelDiscordLink());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlinkDiscord(password);
      setPassword('');
      setRemoving(false);
      setNote('Unlinked. The bot no longer knows which panel account you are.');
      load();
      onChanged();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const messages = (
    <>
      {error && (
        <p role="alert" className="text-[13px] text-rose-400 font-normal mb-4">
          {error}
        </p>
      )}
      {note && !error && <p className="text-[13px] text-emerald-400 font-normal mb-4">{note}</p>}
    </>
  );

  if (linked) {
    return (
      <div className="w-full flex flex-col gap-6">
        <Panel
          title="Discord"
          icon={MessageCircle}
          action={
            <span className="inline-flex items-center gap-3">
              <button
                type="button"
                onClick={load}
                title="Read it again from Discord"
                className="inline-flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-neutral-300"
              >
                <RefreshCw className="h-3 w-3" strokeWidth={2} />
                refresh
              </button>
              <Pill tone="green">connected</Pill>
            </span>
          }
        >
          {profile ? (
            <Portrait profile={profile} version={version} />
          ) : (
            <div className="px-4 sm:px-6 py-5">
              <p className="text-[15px] text-white font-medium">{discord.displayName || discord.tag}</p>
              <p className="text-[12px] text-neutral-500 font-mono">{discord.tag}</p>
            </div>
          )}

          <div className="border-t border-[#17171d]">
            {data?.botDown && (
              <div className="px-4 sm:px-6 py-4 border-b border-[#17171d]">
                <p className="text-[13px] text-amber-300 font-normal">
                  Showing what the panel last saved — {data.botDown}
                </p>
              </div>
            )}

            {profile?.member?.present === false && (
              <div className="px-4 sm:px-6 py-4 border-b border-[#17171d]">
                <p className="text-[13px] text-neutral-400 font-normal">
                  This account is linked, but it is not in {profile?.guild?.name ?? 'the studio server'}.
                </p>
              </div>
            )}

            <Nickname profile={profile} onSaved={load} />

            {profile?.member?.present && (
              <Row label="Roles" value={<Roles roles={profile.member.roles} />} />
            )}

            <Standing standing={profile?.standing} />

            {profile?.member?.joinedAt && (
              <Row label="Joined the server" value={stampFromMs(profile.member.joinedAt)} />
            )}
            {profile?.member?.boostingSince && (
              <Row label="Boosting since" value={stampFromMs(profile.member.boostingSince)} />
            )}
            {profile?.member?.timedOutUntil && (
              <Row
                label="Timed out until"
                value={stampFromMs(profile.member.timedOutUntil)}
                tone="text-amber-300"
              />
            )}
            {profile?.user?.createdAt && (
              <Row label="Discord account made" value={stampFromMs(profile.user.createdAt)} />
            )}
            <Row label="Discord ID" value={discord.id} />
            <Row label="Connected here" value={formatStamp(discord.since)} />
          </div>

          <div className="px-4 sm:px-6 py-5">
            {messages}
            <p className="text-[13px] text-neutral-500 font-normal leading-relaxed">
              This is a connection, not a way in — signing in to the panel still takes your password,
              and two-step still applies.
            </p>

            {removing ? (
              <form onSubmit={remove} className="mt-4">
                <Field label="Your password" htmlFor="discord-remove-password">
                  <TextInput
                    id="discord-remove-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                <div className="flex gap-3 mt-4">
                  <Button type="submit" tone="danger" disabled={busy || !password}>
                    {busy ? 'Unlinking…' : 'Unlink'}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setRemoving(false);
                      setPassword('');
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="button" onClick={() => setRemoving(true)}>
                  <Unplug className="h-3.5 w-3.5" strokeWidth={2} />
                  Unlink
                </Button>
                <OpenDm bot={bot} />
              </div>
            )}
          </div>
        </Panel>

        <Notices discord={discord} onSaved={load} onGoTo={onGoTo} />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel title="Discord" icon={MessageCircle} action={<Pill tone="amber">not connected</Pill>}>
        <div className="px-4 sm:px-6 py-6">
          {messages}

          <div className="mb-6">
            <BotCard bot={bot} down={data?.botDown} />
          </div>

          {waiting ? (
            <>
              <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-5">
                Send this code to the bot in a direct message. Leave this page open — it finishes the
                link on its own.
              </p>

              <CodeBox code={code ?? '————————'} bot={bot} />

              <div className="mt-6 border border-[#282832] bg-[#111115]">
                {phase === 'seen' && seen ? (
                  <div className="px-5 py-4">
                    <p className="text-[13px] text-white font-normal truncate">
                      {seen.displayName || seen.tag} sent the code
                    </p>
                    <p className="text-[12px] text-amber-300 font-normal mt-1">
                      Now press confirm in the bot’s message.
                    </p>
                  </div>
                ) : (
                  <div className="px-5 py-4">
                    <p className="text-[13px] text-neutral-300 font-normal">
                      Waiting for your direct message…
                    </p>
                    <p className="text-[12px] text-neutral-500 font-normal mt-1">
                      Nothing has reached the bot yet.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-5">
                <Button type="button" onClick={stop} disabled={busy}>
                  Cancel
                </Button>
                {left !== null && (
                  <span className="text-[12px] text-neutral-500 font-normal tabular-nums">
                    {left > 0 ? `Expires in ${clock(left)}` : 'Expired — start again'}
                  </span>
                )}
              </div>
            </>
          ) : (
            <form onSubmit={start}>
              <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-4">
                Connect the Discord account you use in our server, so the bot knows which panel
                account is yours. Three steps, and it never needs your Discord password.
              </p>

              <ol className="mb-6 flex flex-col gap-2">
                {STEPS.map((step, index) => (
                  <li
                    key={step}
                    className="flex gap-3 text-[13px] text-neutral-400 font-normal leading-relaxed"
                  >
                    <span className="text-[12px] text-purple-300 font-mono shrink-0 pt-[2px]">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>

              <Field label="Your password" htmlFor="discord-password">
                <TextInput
                  id="discord-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>

              <Button type="submit" tone="solid" disabled={busy || !password}>
                {busy ? 'Working…' : 'Get my code'}
              </Button>
            </form>
          )}
        </div>
      </Panel>

      <Notice tone="amber" icon={ShieldCheck}>
        The bot only reads direct messages that look like a link code, and a code dies after ten
        minutes or one use. If one ever arrives that you did not ask for, press <em>Not me</em> —
        that kills it, and whoever runs the panel should hear about it.
      </Notice>
    </div>
  );
}
