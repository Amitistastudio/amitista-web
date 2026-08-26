import React from 'react';
import {
  Activity,
  AlertTriangle,
  Camera,
  Check as CheckIcon,
  ChevronRight,
  Clock,
  History as HistoryIcon,
  ImagePlus,
  KeySquare,
  MapPin,
  MessageCircle,
  Minus,
  ScrollText,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  AUDIT_LABELS,
  DISCORD_IMAGE,
  PASSWORD_STALE_DAYS,
  RECOVERY_CODES_LOW,
  ROLE_SUMMARIES,
  accountPictureUrl,
  daysSince,
  daysUntil,
  formatAgo,
  formatDate,
  formatStamp,
  groupPermissions,
  removeAccountPicture,
  setAccountPicture,
} from '../../../lib/admin';
import { Bar, Empty, Panel, Pill, Row, UsageBar } from '../ui';
import { LevelKey, LevelTally, PermissionDetail } from '../permissions';
import { ART_TYPES, openArt } from '../boards/art';
import Cropper from '../boards/Cropper';

function remaining(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'ended';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function useCountdown(session) {
  const [now, setNow] = React.useState(() => Date.now() / 1000);

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 15000);
    return () => clearInterval(timer);
  }, []);

  if (!session) return null;

  const skew = typeof session.now === 'number' ? session.now - session.readAt : 0;
  const clock = now + skew;
  return {
    idleLeft: session.expires - clock,
    hardLeft: session.ceiling - clock,
    elapsed: clock - session.started,
  };
}

function agoDays(days) {
  if (days === null) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function addressesFrom(signIns, previous) {
  const held = new Map();

  for (const entry of signIns) {
    const ip = entry.ip ?? null;
    const key = ip ?? 'unrecorded';
    const seen = held.get(key) ?? { key, ip, count: 0, first: null, last: null };
    seen.count += 1;
    if (!seen.first || (entry.at ?? '') < seen.first) seen.first = entry.at ?? null;
    if (!seen.last || (entry.at ?? '') > seen.last) seen.last = entry.at ?? null;
    held.set(key, seen);
  }

  return Array.from(held.values())
    .map((seen) => ({ ...seen, fresh: Boolean(previous && seen.first && seen.first > previous) }))
    .sort((one, two) => String(two.last ?? '').localeCompare(String(one.last ?? '')));
}

function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function standing(account) {
  if (account.disabled) return { dot: 'bg-rose-500', pill: <Pill tone="rose">disabled</Pill> };
  if (account.expired) return { dot: 'bg-rose-500', pill: <Pill tone="rose">expired</Pill> };
  if (account.mustChange) {
    return { dot: 'bg-amber-400', pill: <Pill tone="amber">password not yours yet</Pill> };
  }
  const left = daysUntil(account.expires);
  if (left !== null && left <= 14) {
    return { dot: 'bg-amber-400', pill: <Pill tone="amber">{left}d left</Pill> };
  }
  return { dot: 'bg-emerald-400', pill: <Pill tone="green">active</Pill> };
}

function Avatar({ account, dot, onChanged }) {
  const discord = account.discord ?? {};
  const held = account.picture ?? {};
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [error, setError] = React.useState(null);
  const input = React.useRef(null);

  const linked = Boolean(discord.linked);
  const version = discord.seen ?? discord.since ?? '';
  const source = linked
    ? `${DISCORD_IMAGE}?kind=avatar&v=${encodeURIComponent(version)}`
    : held.set
      ? accountPictureUrl(held.hash)
      : null;
  const mine = !linked && Boolean(onChanged);
  const portrait = Boolean(source) && !failed;

  React.useEffect(() => {
    setFailed(false);
  }, [source]);

  const take = React.useCallback(async (file) => {
    if (!file) return;
    setError(null);
    try {
      const opened = await openArt(file);
      setEditing({
        source: opened.source,
        image: opened.image,
        animated: opened.type === 'image/gif',
        raw: { data: opened.source },
      });
    } catch (failure) {
      setError(failure.message);
    } finally {
      if (input.current) input.current.value = '';
    }
  }, []);

  const keep = React.useCallback(
    async (result) => {
      setError(null);
      setBusy(true);
      try {
        await setAccountPicture(result.data);
        setEditing(null);
        await onChanged();
      } catch (failure) {
        setError(failure.message);
        setEditing(null);
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  const drop = React.useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await removeAccountPicture();
      await onChanged();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  const face = (
    <>
      {portrait ? (
        <img
          src={source}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[26px] sm:text-[32px] font-semibold text-purple-300/70 tracking-tight">
          {initials(account.name)}
        </span>
      )}
      {mine && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="h-5 w-5 text-white" strokeWidth={1.5} />
        </span>
      )}
    </>
  );

  return (
    <div className="flex shrink-0 flex-col items-center gap-2 self-start">
      <div className="relative">
        {mine ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            aria-label={held.set ? 'Change your picture' : 'Add a picture'}
            className="group relative block h-[76px] w-[76px] sm:h-[92px] sm:w-[92px] overflow-hidden border border-[#282832] bg-[#111115] transition-colors hover:border-[#3f3f4c] disabled:cursor-not-allowed"
          >
            {face}
          </button>
        ) : (
          <div className="relative h-[76px] w-[76px] sm:h-[92px] sm:w-[92px] overflow-hidden border border-[#282832] bg-[#111115]">
            {face}
          </div>
        )}
        <span
          className={`absolute -bottom-[6px] -right-[6px] h-3.5 w-3.5 rounded-full border-[3px] border-[#0a0a0d] ${dot}`}
        />
      </div>

      {mine && (
        <span className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-neutral-500 transition-colors hover:text-neutral-200 disabled:opacity-40"
          >
            <ImagePlus className="h-3 w-3" strokeWidth={2} />
            {busy ? 'Working…' : held.set ? 'Change' : 'Add a picture'}
          </button>
          {held.set && !busy && (
            <button
              type="button"
              onClick={drop}
              className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-neutral-600 transition-colors hover:text-rose-300"
            >
              <Trash2 className="h-3 w-3" strokeWidth={2} />
              Remove
            </button>
          )}
        </span>
      )}

      {mine && (
        <input
          ref={input}
          type="file"
          accept={ART_TYPES.join(',')}
          className="hidden"
          onChange={(event) => take(event.target.files?.[0])}
        />
      )}

      {error && (
        <span className="max-w-[180px] text-center text-[11px] font-normal leading-relaxed text-rose-300">
          {error}
        </span>
      )}

      {editing && (
        <Cropper
          kind="logo"
          source={editing.source}
          image={editing.image}
          animated={editing.animated}
          name={account.name}
          busy={busy}
          onApply={keep}
          onKeep={editing.raw ? () => keep(editing.raw) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Jump({ label, icon: Icon, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 bg-[#0a0a0d] px-5 py-4 text-left hover:bg-[#111115] transition-colors"
    >
      <Icon className="h-4 w-4 text-neutral-500 shrink-0 group-hover:text-purple-300" strokeWidth={1.5} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-neutral-200 font-medium leading-tight">{label}</span>
        <span className="block text-[12px] text-neutral-500 font-normal mt-1 truncate">{hint}</span>
      </span>
      <ChevronRight
        className="h-3.5 w-3.5 text-neutral-600 shrink-0 group-hover:text-neutral-300"
        strokeWidth={2}
      />
    </button>
  );
}

function Metric({ label, value, tone = 'text-white', hint, percent, bar, action }) {
  return (
    <div className="bg-[#0a0a0d] px-4 sm:px-6 py-5 flex flex-col">
      <p className="text-[11px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-2">
        {label}
      </p>
      <p className={`text-2xl font-normal tabular-nums leading-none ${tone}`}>{value}</p>
      {typeof percent === 'number' && (
        <div className="mt-3">
          <Bar percent={percent} tone={bar} />
        </div>
      )}
      {hint && <p className="text-[11px] text-neutral-600 font-normal mt-2 leading-relaxed">{hint}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-1 self-start text-[12px] font-semibold text-purple-300 tracking-wide hover:text-purple-200 mt-3"
        >
          {action.label}
          <ChevronRight className="h-3 w-3" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

function Fact({ label, value, by }) {
  return (
    <div className="bg-[#0a0a0d] px-4 sm:px-6 py-4">
      <p className="text-[11px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">{label}</p>
      <p className="text-[13px] text-white font-medium tabular-nums mt-1.5">{value}</p>
      {by && <p className="text-[12px] text-neutral-600 font-normal mt-1">{by}</p>}
    </div>
  );
}

function CheckRow({ state, title, detail, action }) {
  const marks = {
    good: { Icon: CheckIcon, tone: 'text-emerald-400' },
    warn: { Icon: AlertTriangle, tone: 'text-amber-300' },
    idle: { Icon: Minus, tone: 'text-neutral-600' },
  };
  const { Icon, tone } = marks[state] ?? marks.idle;

  return (
    <div
      className={`flex items-start gap-3 px-4 sm:px-6 py-3.5 border-b border-[#17171d] last:border-b-0 ${
        state === 'warn' ? 'bg-amber-500/[0.04]' : ''
      }`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 mt-[3px] ${tone}`} strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-neutral-200 font-normal leading-tight">{title}</p>
        <p className="text-[12px] text-neutral-500 font-normal leading-relaxed mt-1">{detail}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-1 shrink-0 text-[12px] font-semibold text-purple-300 tracking-wide hover:text-purple-200"
        >
          {action.label}
          <ChevronRight className="h-3 w-3" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

function Away({ activity, previous, refusedSince, onGoTo }) {
  const entries = React.useMemo(() => {
    if (!activity || !previous) return [];
    return (activity.entries ?? [])
      .filter((entry) => (entry.at ?? '') > previous && entry.action !== 'signin.ok')
      .slice(0, 4);
  }, [activity, previous]);

  const byOthers = entries.filter((entry) => entry.byOther).length;

  return (
    <Panel
      title="While you were away"
      icon={Activity}
      className="flex flex-col"
      action={
        previous ? (
          <span className="text-[12px] text-neutral-500 font-normal tabular-nums">
            since {formatAgo(previous)}
          </span>
        ) : null
      }
    >
      {!activity && <Empty>Reading the log…</Empty>}

      {activity && !previous && (
        <Empty>
          This is the only sign-in the log holds for you, so there is nothing to compare it with yet.
        </Empty>
      )}

      {activity && previous && (
        <>
          <div className="flex flex-wrap gap-x-8 gap-y-3 px-4 sm:px-6 py-4 border-b border-[#17171d]">
            <span className="text-[13px] text-neutral-400 font-normal">
              <span className={`font-medium ${refusedSince > 0 ? 'text-rose-400' : 'text-white'}`}>
                {refusedSince}
              </span>{' '}
              refused {refusedSince === 1 ? 'attempt' : 'attempts'}
            </span>
            <span className="text-[13px] text-neutral-400 font-normal">
              <span className={`font-medium ${byOthers > 0 ? 'text-amber-300' : 'text-white'}`}>
                {byOthers}
              </span>{' '}
              {byOthers === 1 ? 'change' : 'changes'} by someone else
            </span>
          </div>

          {entries.length === 0 ? (
            <Empty>Nothing has happened on your account since your previous sign-in.</Empty>
          ) : (
            entries.map((entry, index) => (
              <div
                key={`${entry.at}-${index}`}
                className="flex items-baseline justify-between gap-4 px-4 sm:px-6 py-2.5 border-b border-[#17171d] last:border-b-0"
              >
                <p className="text-[13px] text-neutral-300 font-normal min-w-0">
                  <span className="text-white">
                    {entry.byOther ? entry.actor || 'someone' : 'You'}
                  </span>{' '}
                  {AUDIT_LABELS[entry.action] ?? entry.action}
                </p>
                <span className="text-[12px] text-neutral-600 font-normal tabular-nums shrink-0">
                  {formatAgo(entry.at)}
                </span>
              </div>
            ))
          )}

          {onGoTo && (
            <div className="px-4 sm:px-6 py-3.5 border-t border-[#17171d] mt-auto">
              <button
                type="button"
                onClick={onGoTo}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-purple-300 tracking-wide hover:text-purple-200"
              >
                Open the whole log
                <ChevronRight className="h-3 w-3" strokeWidth={2} />
              </button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

const ADDRESSES_SHOWN = 4;

function Addresses({ activity, addresses, current }) {
  const [all, setAll] = React.useState(false);
  const shown = all ? addresses : addresses.slice(0, ADDRESSES_SHOWN);
  const rest = addresses.length - shown.length;

  return (
    <Panel
      title="Where you sign in from"
      icon={MapPin}
      className="flex flex-col"
      action={
        addresses.length > 0 ? (
          <span className="text-[12px] text-neutral-500 font-normal tabular-nums">
            {addresses.length} {addresses.length === 1 ? 'address' : 'addresses'} ·{' '}
            {(activity?.signIns ?? []).length} sign-ins
          </span>
        ) : null
      }
    >
      {!activity && <Empty>Reading the log…</Empty>}

      {activity && addresses.length === 0 && (
        <Empty>No sign-in with an address is recorded yet.</Empty>
      )}

      {shown.map((seen) => (
        <div
          key={seen.key}
          className="flex items-baseline justify-between gap-4 px-4 sm:px-6 py-2.5 border-b border-[#17171d] last:border-b-0"
        >
          <span className="text-[13px] text-neutral-200 font-mono truncate">
            {seen.ip ?? 'not recorded'}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {seen.ip && seen.ip === current && <Pill tone="purple">this session</Pill>}
            {seen.fresh && <Pill tone="amber">new</Pill>}
            <span className="text-[12px] text-neutral-600 font-normal tabular-nums">
              {seen.count}× · {formatAgo(seen.last)}
            </span>
          </span>
        </div>
      ))}

      {rest > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="px-4 sm:px-6 py-2.5 text-left text-[12px] font-semibold text-neutral-400 tracking-wide hover:text-white transition-colors"
        >
          {rest} more
        </button>
      )}
    </Panel>
  );
}

function Access({ role, groups }) {
  const [open, setOpen] = React.useState(false);
  const total = groups.reduce((count, group) => count + group.permissions.length, 0);

  return (
    <Panel title="What you can reach" icon={ShieldCheck} action={<Pill tone="purple">{role}</Pill>}>
      {groups.length === 0 ? (
        <Empty>No access granted.</Empty>
      ) : (
        <div className="px-4 sm:px-6 py-4 space-y-3">
          <LevelTally held={groups.flatMap((group) => group.permissions)} />
          <div className="flex flex-wrap items-center gap-2">
            {groups.map((group) => (
              <span
                key={group.id}
                className="inline-flex items-center gap-2 border border-[#282832] px-2.5 py-[5px] text-[12px] text-neutral-300"
              >
                {group.label}
                <span className="text-[11px] text-neutral-600 font-normal tabular-nums">
                  {group.permissions.length}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {total > 0 && (
        <button
          type="button"
          onClick={() => setOpen((held) => !held)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-4 px-4 sm:px-6 py-3 text-left border-t border-[#17171d] hover:bg-[#111115] transition-colors"
        >
          <span className="text-[12px] font-semibold text-neutral-400 tracking-wide">
            {open ? 'Hide what each one means' : `What these ${total} permissions mean`}
          </span>
          <ChevronRight
            className={`h-3.5 w-3.5 text-neutral-600 shrink-0 transition-transform ${
              open ? 'rotate-90' : ''
            }`}
            strokeWidth={2}
          />
        </button>
      )}

      {open && (
        <div className="border-t border-[#17171d]">
          {ROLE_SUMMARIES[role] && (
            <p className="px-4 sm:px-6 py-4 text-[13px] text-neutral-400 font-normal leading-relaxed border-b border-[#17171d]">
              {ROLE_SUMMARIES[role]}
            </p>
          )}
          <div className="px-4 sm:px-6 pt-4">
            <LevelKey />
          </div>
          <div className="px-4 sm:px-6 pb-4">
            <PermissionDetail permissions={groups.flatMap((group) => group.permissions)} />
          </div>
        </div>
      )}
    </Panel>
  );
}

export default function Profile({ account, activity, onGoTo, onTab, onChanged }) {
  const [showPassed, setShowPassed] = React.useState(false);

  const session = React.useMemo(() => {
    if (!account?.session) return null;
    return { ...account.session, readAt: Date.now() / 1000 };
  }, [account]);

  const clock = useCountdown(session);
  const twoFactor = account.twoFactor ?? {};
  const discord = account.discord ?? {};
  const keys = account.keys;
  const groups = groupPermissions(account.permissions);
  const passwordAge = daysSince(account.passwordChanged);
  const stale = passwordAge !== null && passwordAge >= PASSWORD_STALE_DAYS;
  const refused = activity?.refused ?? [];
  const previous = activity?.previousSignIn ?? null;
  const sincePrevious = previous
    ? refused.filter((entry) => (entry.at ?? '') > previous).length
    : refused.length;
  const state = standing(account);
  const here = session?.ip ?? account.lastIp ?? null;

  const addresses = React.useMemo(
    () => addressesFrom(activity?.signIns ?? [], previous),
    [activity, previous],
  );
  const fresh = addresses.filter((seen) => seen.fresh);

  const idlePercent = clock && session
    ? Math.max(0, Math.min(100, (clock.idleLeft / (session.idleMinutes * 60)) * 100))
    : 0;

  const goSecurity = onTab ? () => onTab('security') : undefined;
  const goHistory = onTab ? () => onTab('history') : undefined;
  const goDiscord = onTab ? () => onTab('discord') : undefined;

  const meta = [
    account.created ? { text: `with the studio since ${formatDate(account.created)}` } : null,
    account.lastSignIn ? { text: `signed in ${formatAgo(account.lastSignIn)}` } : null,
    here ? { text: here, mono: true } : null,
  ].filter(Boolean);

  const checks = [
    {
      id: 'twofactor',
      state: twoFactor.enabled ? 'good' : 'warn',
      title: twoFactor.enabled ? 'Two-step verification is on' : 'Two-step verification is off',
      detail: twoFactor.enabled
        ? `Turned on ${formatAgo(twoFactor.since)}. A stolen password is not enough on its own.`
        : 'It is the single biggest thing you can do for an account that reaches the server.',
      action: twoFactor.enabled ? null : goSecurity && { label: 'Turn it on', onClick: goSecurity },
    },
    {
      id: 'recovery',
      state: twoFactor.enabled
        ? (twoFactor.recovery ?? 0) >= RECOVERY_CODES_LOW
          ? 'good'
          : 'warn'
        : 'idle',
      title: twoFactor.enabled
        ? `${twoFactor.recovery ?? 0} recovery ${twoFactor.recovery === 1 ? 'code' : 'codes'} left`
        : 'Recovery codes',
      detail: twoFactor.enabled
        ? 'Each one signs you in once if you lose your phone. Running low means turning two-step off and on again for a fresh set.'
        : 'You get a set of these when two-step is turned on.',
      action:
        twoFactor.enabled && (twoFactor.recovery ?? 0) < RECOVERY_CODES_LOW && goSecurity
          ? { label: 'Get a fresh set', onClick: goSecurity }
          : null,
    },
    {
      id: 'password-own',
      state: account.mustChange ? 'warn' : 'good',
      title: account.mustChange
        ? 'Still on the password you were handed'
        : 'The password is your own',
      detail: account.mustChange
        ? 'Whoever created this account has seen that password. The rest of the panel stays closed until you set your own.'
        : 'Nobody else was given this one.',
      action: account.mustChange && goSecurity ? { label: 'Change it', onClick: goSecurity } : null,
    },
    {
      id: 'password-age',
      state: passwordAge === null ? 'idle' : stale ? 'warn' : 'good',
      title:
        passwordAge === null
          ? 'Password age is not recorded'
          : stale
            ? `The password is ${passwordAge} days old`
            : `The password was changed ${agoDays(passwordAge)}`,
      detail:
        passwordAge === null
          ? 'The panel only started recording this recently. It will show a real age after the next change.'
          : `A change is worth making past ${PASSWORD_STALE_DAYS} days, or straight away if you have typed it anywhere you are unsure of.`,
      action: stale && goSecurity ? { label: 'Change it', onClick: goSecurity } : null,
    },
    {
      id: 'refused',
      state: !activity ? 'idle' : sincePrevious > 0 ? 'warn' : 'good',
      title: !activity
        ? 'Refused attempts'
        : sincePrevious > 0
          ? `${sincePrevious} refused ${sincePrevious === 1 ? 'attempt' : 'attempts'} on your account`
          : 'No refused attempts on your account',
      detail: !activity
        ? 'Reading the log…'
        : sincePrevious > 0
          ? 'Attempts from an address you do not recognise are worth a password change.'
          : 'Nothing in the log was turned away under your name.',
      action: sincePrevious > 0 && goHistory ? { label: 'Look at them', onClick: goHistory } : null,
    },
    {
      id: 'addresses',
      state: fresh.length > 0 ? 'idle' : 'good',
      title:
        fresh.length > 0
          ? `Signed in from ${fresh.length === 1 ? 'an address' : `${fresh.length} addresses`} not seen before`
          : 'No address you have not used before',
      detail:
        fresh.length > 0
          ? `${fresh.map((seen) => seen.ip).join(', ')} — a home connection changes address on its own, so this is usually you. If it is not, change your password and turn two-step on.`
          : 'Every sign-in in the log came from an address you had already used.',
    },
    {
      id: 'discord',
      state: discord.linked ? 'good' : 'idle',
      title: discord.linked
        ? `Discord linked to ${discord.displayName || discord.tag}`
        : 'No Discord account linked',
      detail: discord.linked
        ? `Connected ${formatAgo(discord.since)}. The bot knows which panel account is yours.`
        : 'Optional. Link one and the bot can DM you about your own account.',
      action: discord.linked ? null : goDiscord && { label: 'Link one', onClick: goDiscord },
    },
  ];

  const needs = checks.filter((check) => check.state === 'warn');
  const passed = checks.filter((check) => check.state !== 'warn');

  return (
    <div className="w-full flex flex-col gap-6">
      <section className="border border-[#282832] bg-[#0a0a0d]">
        <div className="flex flex-col gap-6 px-4 sm:px-6 py-6 sm:flex-row sm:items-center sm:gap-7">
          <Avatar account={account} dot={state.dot} onChanged={onChanged} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <h2 className="text-[30px] sm:text-[38px] font-normal text-white leading-none tracking-tight">
                {account.name}
              </h2>
              <span className="flex flex-wrap items-center gap-2">
                <Pill tone="purple">{account.role}</Pill>
                {state.pill}
                {account.protected && <Pill>protected</Pill>}
              </span>
            </div>

            {meta.length > 0 && (
              <p className="text-[13px] text-neutral-500 font-normal mt-3 leading-relaxed">
                {meta.map((part, index) => (
                  <span key={part.text}>
                    {index > 0 && <span className="text-neutral-700"> · </span>}
                    <span className={part.mono ? 'font-mono text-[12px]' : ''}>{part.text}</span>
                  </span>
                ))}
              </p>
            )}

            {discord.linked && (
              <button
                type="button"
                onClick={goDiscord}
                disabled={!goDiscord}
                className="inline-flex items-center gap-2 mt-3 text-[12px] text-neutral-400 font-normal hover:text-neutral-200 disabled:cursor-default transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5 text-neutral-600" strokeWidth={2} />
                <span className="font-mono">{discord.tag}</span>
              </button>
            )}
          </div>
        </div>

        {account.note && (
          <div className="px-4 sm:px-6 py-4 border-t border-[#17171d]">
            <p className="text-[11px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-2">
              Note on this account
            </p>
            <p className="text-[13px] text-neutral-300 font-normal leading-relaxed">{account.note}</p>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#17171d] border-t border-[#282832]">
          <Metric
            label="Session left"
            value={clock ? remaining(clock.idleLeft) : '—'}
            percent={clock ? idlePercent : undefined}
            bar={idlePercent < 20 ? 'bg-amber-400' : 'bg-purple-500/70'}
            hint={clock ? `${remaining(clock.hardLeft)} before the hard limit` : 'idle timeout'}
          />
          <Metric
            label="Two-step"
            value={twoFactor.enabled ? 'On' : 'Off'}
            tone={twoFactor.enabled ? 'text-emerald-400' : 'text-amber-300'}
            hint={
              twoFactor.enabled
                ? `${twoFactor.recovery ?? 0} recovery ${twoFactor.recovery === 1 ? 'code' : 'codes'} left`
                : 'a password is the whole defence'
            }
            action={twoFactor.enabled ? null : goSecurity && { label: 'Turn it on', onClick: goSecurity }}
          />
          <Metric
            label="Password age"
            value={passwordAge === null ? '—' : `${passwordAge}d`}
            tone={stale ? 'text-amber-300' : 'text-white'}
            hint={
              account.passwordChanged
                ? `changed ${agoDays(passwordAge) ?? formatAgo(account.passwordChanged)}`
                : 'not recorded before today'
            }
            action={stale && goSecurity ? { label: 'Change it', onClick: goSecurity } : null}
          />
          <Metric
            label="Refused attempts"
            value={activity ? sincePrevious : '—'}
            tone={sincePrevious > 0 ? 'text-rose-400' : 'text-white'}
            hint={
              activity?.previousSignIn ? 'since your previous sign-in' : 'on your account, in the log'
            }
            action={sincePrevious > 0 && goHistory ? { label: 'Look at them', onClick: goHistory } : null}
          />
        </div>
      </section>

      <Panel
        title={needs.length > 0 ? 'Needs you' : 'Nothing needs you'}
        icon={needs.length > 0 ? AlertTriangle : ShieldCheck}
        action={
          needs.length > 0 ? (
            <Pill tone="amber">{needs.length} to do</Pill>
          ) : (
            <Pill tone="green">all clear</Pill>
          )
        }
      >
        {needs.map((check) => (
          <CheckRow key={check.id} {...check} />
        ))}

        {needs.length === 0 && (
          <div className="px-4 sm:px-6 py-4 border-b border-[#17171d]">
            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed">
              Every check on this account passed. Nothing here is asking for your attention.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowPassed((held) => !held)}
          aria-expanded={showPassed}
          className="w-full flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 text-left hover:bg-[#111115] transition-colors"
        >
          <span className="text-[12px] font-semibold text-neutral-400 tracking-wide">
            {showPassed
              ? 'Hide the rest'
              : `Show the other ${passed.length} ${passed.length === 1 ? 'check' : 'checks'}`}
          </span>
          <ChevronRight
            className={`h-3.5 w-3.5 text-neutral-600 shrink-0 transition-transform ${
              showPassed ? 'rotate-90' : ''
            }`}
            strokeWidth={2}
          />
        </button>

        {showPassed && (
          <div className="border-t border-[#17171d]">
            {passed.map((check) => (
              <CheckRow key={check.id} {...check} />
            ))}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Away
          activity={activity}
          previous={previous}
          refusedSince={sincePrevious}
          onGoTo={goHistory}
        />
        <Addresses activity={activity} addresses={addresses} current={here} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="The record" icon={ScrollText}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#17171d]">
            <Fact
              label="Created"
              value={formatStamp(account.created)}
              by={`by ${account.createdBy ?? 'the install'}`}
            />
            <Fact
              label="Last changed"
              value={formatStamp(account.updated)}
              by={account.updatedBy ? `by ${account.updatedBy}` : null}
            />
            <Fact
              label="Password changed"
              value={formatStamp(account.passwordChanged)}
              by={
                account.passwordChanged
                  ? (agoDays(passwordAge) ?? formatAgo(account.passwordChanged))
                  : 'not recorded before today'
              }
            />
            <Fact
              label="Access ends"
              value={account.expires ? formatDate(account.expires) : 'no end date'}
              by={
                account.expires
                  ? `${daysUntil(account.expires)} days from today`
                  : 'it stays until someone closes it'
              }
            />
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-4 px-4 sm:px-6 py-4 border-t border-[#17171d]">
            <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">
              Every change to this account, by you or by anyone else, is written to the log.
            </p>
            {goHistory && (
              <button
                type="button"
                onClick={goHistory}
                className="inline-flex items-center gap-1 shrink-0 text-[12px] font-semibold text-purple-300 tracking-wide hover:text-purple-200"
              >
                See what changed
                <ChevronRight className="h-3 w-3" strokeWidth={2} />
              </button>
            )}
          </div>
        </Panel>

        <Panel title="This session" icon={Clock}>
          <Row
            label="Signed in"
            value={`${formatStamp(account.lastSignIn)} · ${formatAgo(account.lastSignIn)}`}
          />
          <Row
            label="From"
            value={<span className="font-mono text-[12px]">{session?.ip ?? account.lastIp ?? '—'}</span>}
          />
          <Row label="Goes idle after" value={`${session?.idleMinutes ?? 60} minutes`} />
          <Row label="Idles out" value={clock ? `in ${remaining(clock.idleLeft)}` : '—'} />
          <Row
            label="Hard limit"
            value={clock ? `in ${remaining(clock.hardLeft)}` : `${session?.hours ?? 12} hours`}
          />
          <div className="px-4 sm:px-6 py-4 border-t border-[#17171d]">
            <Bar percent={idlePercent} tone={idlePercent < 20 ? 'bg-amber-400' : 'bg-purple-500/70'} />
            <p className="text-[12px] text-neutral-500 font-normal leading-relaxed mt-3">
              Using the panel pushes the idle timeout back. The {session?.hours ?? 12}-hour limit does
              not move.
            </p>
          </div>
        </Panel>
      </div>

      <Access role={account.role} groups={groups} />

      {keys && (
        <Panel
          title="Your API keys"
          icon={KeySquare}
          action={
            onGoTo && (
              <button
                type="button"
                onClick={() => onGoTo('api')}
                className="text-[12px] font-semibold text-neutral-400 tracking-wide hover:text-white transition-colors"
              >
                Open the API section
              </button>
            )
          }
        >
          {keys.held === 0 ? (
            <Empty>
              You hold no keys. The API section is where you make one — up to {keys.limit}.
            </Empty>
          ) : (
            <div className="px-4 sm:px-6 py-4">
              <UsageBar percent={Math.round((keys.held / Math.max(1, keys.limit)) * 100)} />
              <p className="text-[12px] text-neutral-500 font-normal mt-3">
                <span className="text-emerald-400 font-medium tabular-nums">{keys.live}</span> live of{' '}
                {keys.limit}
                {keys.revoked > 0 ? ` · ${keys.revoked} revoked` : ''}
                {keys.expired > 0 ? ` · ${keys.expired} expired` : ''} ·{' '}
                <span className="tabular-nums">{keys.requests.toLocaleString('en-GB')}</span> requests
                {keys.blocked > 0 ? (
                  <>
                    {' · '}
                    <span className="text-amber-300 tabular-nums">
                      {keys.blocked.toLocaleString('en-GB')}
                    </span>{' '}
                    refused
                  </>
                ) : ''}
                {keys.lastUsed ? ` · last used ${formatAgo(keys.lastUsed)}` : ' · never used'}
              </p>
            </div>
          )}
        </Panel>
      )}

      {(onTab || onGoTo) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#17171d] border border-[#282832]">
          {onTab && (
            <Jump
              label="Sign-in and password"
              icon={ShieldCheck}
              hint={twoFactor.enabled ? 'two-step is on' : 'two-step is off'}
              onClick={goSecurity}
            />
          )}
          {onTab && (
            <Jump
              label="Discord"
              icon={MessageCircle}
              hint={discord.linked ? `connected as ${discord.tag}` : 'not connected'}
              onClick={goDiscord}
            />
          )}
          {onTab && (
            <Jump
              label="History"
              icon={HistoryIcon}
              hint={
                activity
                  ? `${(activity.signIns ?? []).length} sign-ins · ${activity.refusedTotal ?? refused.length} refused`
                  : 'every sign-in on your account'
              }
              onClick={goHistory}
            />
          )}
          {onGoTo && keys && (
            <Jump
              label="API keys"
              icon={KeySquare}
              hint={keys.held === 0 ? 'none yet' : `${keys.live} live of ${keys.limit}`}
              onClick={() => onGoTo('api')}
            />
          )}
        </div>
      )}
    </div>
  );
}
