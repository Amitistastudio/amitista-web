import React from 'react';
import {
  Users,
  UserPlus,
  KeyRound,
  FileText,
  History as HistoryIcon,
  Trash2,
  Search,
  SlidersHorizontal,
  ChevronRight,
  ArrowLeft,
  LogOut,
  Save,
  Power,
  ShieldOff,
  MessageSquare,
  Unlink,
  Download,
  ShieldCheck,
} from 'lucide-react';
import {
  USER_DISCORD_IMAGE,
  clearDiscord,
  clearUserPicture,
  clearTwoFactor,
  createUser,
  deleteUser,
  resetUserPassword,
  signOutUser,
  updateUser,
  fetchUserDiscordProfile,
  formatAgo,
  formatDate,
  formatStamp,
  daysUntil,
  AUDIT_LABELS,
  EXPIRING_SOON_DAYS,
  ROLE_SUMMARIES,
  todayIso,
  userPictureUrl,
} from '../../../lib/admin';
import { Button, Empty, Field, Panel, Pill, Select, SubNav, TextInput } from '../ui';
import {
  INPUT_CLASS,
  OwnerWarning,
  PasswordChoice,
  PermissionGrid,
  RolePicker,
  ROLE_TONE,
  Stat,
  sameSet,
  usePasswordChoice,
} from './shared';

function CreateForm({ roles, permissions, rolePermissions, canManageOwners, onCreated, onError }) {
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState('viewer');
  const [granted, setGranted] = React.useState([]);
  const [note, setNote] = React.useState('');
  const [expires, setExpires] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const choice = usePasswordChoice();

  const custom = role === 'custom';
  const effective = custom ? granted : (rolePermissions?.[role] ?? []);

  async function submit(event) {
    event.preventDefault();
    if (busy || !choice.ready) return;
    setBusy(true);
    onError(null);
    try {
      const created = await createUser({
        name: name.trim(),
        role,
        permissions: custom ? granted : undefined,
        password: choice.chosen ? choice.value : undefined,
        mustChange: choice.chosen ? choice.mustChange : undefined,
        note: note.trim() || undefined,
        expires: expires || undefined,
      });
      setName('');
      setRole('viewer');
      setGranted([]);
      setNote('');
      setExpires('');
      choice.clear();
      onCreated(created);
    } catch (failure) {
      onError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="px-4 sm:px-6 py-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <Field
          label="Name"
          htmlFor="new-account-name"
          hint="Letters, numbers, dots, dashes and underscores."
        >
          <TextInput
            id="new-account-name"
            value={name}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck="false"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Role"
          htmlFor="new-account-role"
          hint={ROLE_SUMMARIES[role] ?? 'Custom lets you tick access one by one.'}
        >
          <RolePicker
            id="new-account-role"
            roles={roles}
            value={role}
            allowOwner={canManageOwners}
            onChange={setRole}
          />
          {role === 'owner' && (
            <OwnerWarning>
              An owner can do everything you can — add and remove accounts, hand the owner role to
              someone else, and remove yours. Give this out only to someone you would trust with the
              whole panel.
            </OwnerWarning>
          )}
        </Field>

        <Field
          label="Note"
          htmlFor="new-account-note"
          hint="Who this is and why they have access. Only the studio sees it."
        >
          <TextInput
            id="new-account-note"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        <Field
          label="Access ends"
          htmlFor="new-account-expires"
          hint="Optional. After this date they are turned away at sign-in. Leave blank for no end date."
        >
          <input
            id="new-account-expires"
            type="date"
            min={todayIso()}
            value={expires}
            onChange={(event) => setExpires(event.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <div className="border-t border-[#17171d] pt-5 mt-1 mb-6">
        <p className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-3">
          Access
        </p>
        <PermissionGrid
          permissions={permissions}
          effective={effective}
          editable={custom}
          onToggle={(permission, on) =>
            setGranted((current) =>
              on ? [...current, permission] : current.filter((entry) => entry !== permission),
            )
          }
        />
      </div>

      <div className="border-t border-[#17171d] pt-5">
        <PasswordChoice
          idPrefix="new-account"
          choice={choice}
          generateNote="A strong password is made for you and shown once, right after the account is created. They will be asked to change it the first time they sign in."
        />
      </div>

      <div className="flex justify-end pt-5">
        <Button type="submit" tone="solid" disabled={busy || !name.trim() || !choice.ready}>
          <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? 'Creating…' : 'Create account'}
        </Button>
      </div>
    </form>
  );
}

function AccessEditor({
  account,
  roles,
  permissions,
  rolePermissions,
  canManageOwners,
  busy,
  onSave,
}) {
  const [role, setRole] = React.useState(account.role);
  const [granted, setGranted] = React.useState(account.permissions ?? []);
  const [confirmed, setConfirmed] = React.useState(false);

  const custom = role === 'custom';
  const effective = custom ? granted : (rolePermissions?.[role] ?? []);
  const changed = role !== account.role || (custom && !sameSet(granted, account.permissions));
  const promoting = role === 'owner' && account.role !== 'owner';
  const demoting = role !== 'owner' && account.role === 'owner';

  return (
    <div>
      <div className="max-w-[280px] mb-1">
        <RolePicker
          id={`role-${account.name}`}
          roles={roles}
          value={role}
          allowOwner={canManageOwners}
          onChange={(next) => {
            setRole(next);
            setConfirmed(false);
          }}
        />
      </div>
      <p className="text-[12px] text-neutral-500 font-normal mb-4 leading-relaxed">
        {ROLE_SUMMARIES[role] ?? 'Tick exactly what this account may do.'}
      </p>

      {promoting && (
        <div className="mb-4">
          <OwnerWarning>
            <span className="text-white font-medium">{account.name}</span> would hold everything you
            hold: every tab, every account, and the owner role itself. They could remove your
            account or take your owner role away. There is no way to make this a lesser owner.
          </OwnerWarning>
          <label className="flex items-start gap-3 cursor-pointer mt-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 sm:h-3.5 sm:w-3.5 accent-purple-500 shrink-0"
            />
            <span className="text-[12px] text-neutral-300 font-normal leading-relaxed">
              I understand, make {account.name} an owner
            </span>
          </label>
        </div>
      )}

      {demoting && (
        <div className="mb-4">
          <OwnerWarning>
            This takes the owner role away from{' '}
            <span className="text-white font-medium">{account.name}</span> and replaces their access
            with the {role} list. The panel keeps at least one owner who can sign in — if they are
            the last one, the server refuses.
          </OwnerWarning>
        </div>
      )}

      <PermissionGrid
        permissions={permissions}
        effective={effective}
        editable={custom}
        onToggle={(permission, on) =>
          setGranted((current) =>
            on ? [...current, permission] : current.filter((entry) => entry !== permission),
          )
        }
      />

      <div className="flex justify-end pt-4">
        <Button
          type="button"
          tone="solid"
          disabled={busy || !changed || (promoting && !confirmed)}
          onClick={() => onSave({ role, permissions: custom ? granted : undefined })}
        >
          <Save className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? 'Saving…' : promoting ? `Make ${account.name} an owner` : 'Save access'}
        </Button>
      </div>
    </div>
  );
}

function DetailsEditor({ account, busy, onSave }) {
  const [note, setNote] = React.useState(account.note ?? '');
  const [expires, setExpires] = React.useState(account.expires ?? '');

  const changed = note !== (account.note ?? '') || expires !== (account.expires ?? '');

  return (
    <div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <Field
          label="Note"
          htmlFor={`note-${account.name}`}
          hint="Who this is and why they have access."
        >
          <TextInput
            id={`note-${account.name}`}
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        <Field
          label="Access ends"
          htmlFor={`expires-${account.name}`}
          hint="Blank means no end date. A date in the past ends their sessions at once."
        >
          <input
            id={`expires-${account.name}`}
            type="date"
            value={expires}
            onChange={(event) => setExpires(event.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={busy || !changed}
          onClick={() => onSave({ note, expires: expires || '' })}
        >
          <Save className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? 'Saving…' : 'Save details'}
        </Button>
      </div>
    </div>
  );
}

function PasswordEditor({ account, busy, onSet }) {
  const choice = usePasswordChoice();

  return (
    <div>
      <PasswordChoice
        idPrefix={`pw-${account.name}`}
        choice={choice}
        heading={null}
        generateNote="A strong password is made for you and shown once. Every session signed in as this account ends straight away."
      />
      <div className="flex justify-end pt-4">
        <Button
          type="button"
          disabled={busy || !choice.ready}
          onClick={() =>
            onSet(choice.chosen ? choice.value : null, choice.mustChange).then((ok) => {
              if (ok) choice.clear();
            })
          }
        >
          <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
          {busy ? 'Setting…' : choice.chosen ? 'Set this password' : 'Generate a password'}
        </Button>
      </div>
    </div>
  );
}

function art(name, kind, version) {
  return `${USER_DISCORD_IMAGE}?name=${encodeURIComponent(name)}&kind=${kind}&v=${encodeURIComponent(version ?? '')}`;
}

function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function MiniFace({ account }) {
  const discord = account.discord ?? {};
  const held = account.picture ?? {};
  const [failed, setFailed] = React.useState(false);
  const source = discord.linked
    ? art(account.name, 'avatar', discord.seen ?? discord.since ?? '')
    : held.set
      ? userPictureUrl(account.name, held.hash)
      : null;

  React.useEffect(() => {
    setFailed(false);
  }, [source]);

  if (!source || failed) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#282832] bg-[#111115] text-[10px] font-semibold text-purple-300/70">
        {initials(account.name)}
      </span>
    );
  }

  return (
    <span className="h-7 w-7 shrink-0 overflow-hidden border border-[#282832] bg-[#111115]">
      <img
        src={source}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function AccountFace({ account, canClear, busy, onClear }) {
  const discord = account.discord ?? {};
  const held = account.picture ?? {};
  const [failed, setFailed] = React.useState(false);
  const source = discord.linked
    ? art(account.name, 'avatar', discord.seen ?? discord.since ?? '')
    : held.set
      ? userPictureUrl(account.name, held.hash)
      : null;
  const portrait = Boolean(source) && !failed;

  React.useEffect(() => {
    setFailed(false);
  }, [source]);

  return (
    <div className="flex shrink-0 flex-col items-center gap-2 self-start">
      <div className="h-[68px] w-[68px] border border-[#282832] bg-[#111115] overflow-hidden">
        {portrait ? (
          <img
            src={source}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[24px] font-semibold text-purple-300/70 tracking-tight">
            {initials(account.name)}
          </span>
        )}
      </div>
      {canClear && held.set && !discord.linked && (
        <button
          type="button"
          disabled={busy}
          onClick={onClear}
          title={`Remove the picture ${account.name} uploaded`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-neutral-600 transition-colors hover:text-rose-300 disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" strokeWidth={2} />
          Remove
        </button>
      )}
    </div>
  );
}

function DiscordRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-6 px-4 sm:px-6 py-2.5 border-b border-[#17171d] last:border-b-0">
      <span className="text-[13px] text-neutral-400 font-normal shrink-0">{label}</span>
      <span className="text-[13px] text-neutral-200 font-normal text-right min-w-0">{children}</span>
    </div>
  );
}

function DiscordAccount({ account, busy, confirming, onConfirm, onClear }) {
  const discord = account.discord ?? {};
  const linked = Boolean(discord.linked);
  const [data, setData] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const version = discord.seen ?? discord.since ?? '';

  React.useEffect(() => {
    let live = true;
    setData(null);
    if (!linked) return undefined;
    setReading(true);
    fetchUserDiscordProfile(account.name)
      .then((answer) => {
        if (live) setData(answer);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setReading(false);
      });
    return () => {
      live = false;
    };
  }, [account.name, linked]);

  const profile = data?.profile ?? null;
  const member = profile?.member ?? null;
  const standing = profile?.standing ?? null;
  const name =
    member?.displayName ||
    profile?.user?.displayName ||
    discord.displayName ||
    discord.username ||
    discord.tag ||
    discord.id;

  if (!linked) {
    return (
      <Panel title="Discord" icon={MessageSquare} action={<Pill>not linked</Pill>}>
        <Empty>
          No Discord account is linked. Only they can link one, from Your account — the bot asks them
          to confirm it in a direct message.
        </Empty>
      </Panel>
    );
  }

  return (
    <Panel title="Discord" icon={MessageSquare} action={<Pill tone="green">linked</Pill>}>
      <div className="relative">
        {profile?.art?.banner && !failed ? (
          <img
            src={art(account.name, 'banner', version)}
            alt=""
            className="h-20 w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="h-20 w-full" style={{ background: profile?.user?.accent ?? '#111115' }} />
        )}

        <div className="px-4 sm:px-6 pb-4 -mt-8 flex items-end gap-4">
          <div className="h-16 w-16 shrink-0 rounded-full border-4 border-[#0a0a0d] bg-[#111115] overflow-hidden">
            {!failed && (
              <img
                src={art(account.name, member?.present ? 'member' : 'avatar', version)}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setFailed(true)}
              />
            )}
          </div>
          <div className="min-w-0 pb-1">
            <p className="text-[15px] text-white font-medium truncate">{name}</p>
            <p className="text-[12px] text-neutral-500 font-mono truncate">
              {profile?.user?.tag ?? discord.tag}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-[#17171d]">
        {data?.botDown && (
          <p className="px-4 sm:px-6 py-3 text-[12px] text-amber-300/80 font-normal border-b border-[#17171d]">
            Showing what the panel last saved — {data.botDown}
          </p>
        )}
        {reading && !profile && (
          <p className="px-4 sm:px-6 py-3 text-[12px] text-neutral-500 font-normal border-b border-[#17171d]">
            Asking the bot…
          </p>
        )}

        {member && (
          <DiscordRow label="In the studio server">
            {member.present ? (
              <>
                <span className="text-emerald-400">yes</span>
                {member.nickname ? (
                  <span className="text-neutral-400"> · nicknamed {member.nickname}</span>
                ) : null}
              </>
            ) : (
              <span className="text-neutral-500">not a member</span>
            )}
          </DiscordRow>
        )}

        {member?.present && (
          <DiscordRow label="Roles">
            {member.roles?.length ? (
              <span className="inline-flex flex-wrap gap-1.5 justify-end">
                {member.roles.map((role) => (
                  <span
                    key={role.id}
                    className="inline-flex items-center gap-1.5 border border-[#282832] px-2 py-[2px] text-[11px] text-neutral-300"
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{
                        background:
                          role.colour && role.colour !== '#000000' ? role.colour : '#4b4b57',
                      }}
                    />
                    {role.name}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-neutral-500">none</span>
            )}
          </DiscordRow>
        )}

        {standing && (
          <DiscordRow label="Standing">
            Level {standing.level}
            {standing.rank ? ` · ${standing.rank} of ${standing.of}` : ''}
            <span className="text-neutral-500">
              {' '}
              · {standing.msgs.toLocaleString('en-GB')} messages
            </span>
          </DiscordRow>
        )}

        {member?.joinedAt && (
          <DiscordRow label="Joined the server">
            {formatStamp(new Date(member.joinedAt).toISOString())}
          </DiscordRow>
        )}

        {member?.timedOutUntil && (
          <DiscordRow label="Timed out until">
            <span className="text-amber-300">
              {formatStamp(new Date(member.timedOutUntil).toISOString())}
            </span>
          </DiscordRow>
        )}

        <DiscordRow label="Discord ID">
          <span className="font-mono text-[12px] break-all">{discord.id}</span>
        </DiscordRow>

        <DiscordRow label="Linked here">{formatDate(discord.since)}</DiscordRow>
      </div>

      <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3">
        <p className="text-[12px] text-neutral-500 font-normal leading-relaxed flex-1 min-w-[220px]">
          Unlinking only breaks the tie between this panel account and that Discord account. It does
          not touch their password, and it does not remove them from the server.
        </p>
        {confirming === 'discord' && (
          <Button type="button" onClick={() => onConfirm(null)}>
            Keep it
          </Button>
        )}
        <Button
          type="button"
          tone="danger"
          disabled={busy}
          onClick={() => {
            if (confirming !== 'discord') {
              onConfirm('discord');
              return;
            }
            onConfirm(null);
            onClear('discord');
          }}
        >
          <Unlink className="h-3.5 w-3.5" strokeWidth={2} />
          {confirming === 'discord' ? 'Really unlink it' : 'Unlink'}
        </Button>
      </div>
    </Panel>
  );
}

function AccountHistory({ name, audit }) {
  const entries = (audit ?? [])
    .filter(
      (entry) =>
        entry.actor === name || entry.detail?.name === name || entry.detail?.account === name,
    )
    .slice(0, 8);

  return (
    <div>
      <p className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-3">
        Recent activity
      </p>
      {entries.length === 0 && (
        <p className="text-[13px] text-neutral-500 font-normal">Nothing recorded for this account.</p>
      )}
      <div className="flex flex-col gap-2">
        {entries.map((entry, index) => (
          <div key={`${entry.at}-${index}`} className="flex items-baseline justify-between gap-4">
            <span className="text-[13px] text-neutral-400 font-normal min-w-0">
              <span className="text-neutral-200">{entry.actor || 'someone'}</span>{' '}
              {AUDIT_LABELS[entry.action] ?? entry.action}
              {(entry.detail?.name ?? entry.detail?.account) &&
              (entry.detail.name ?? entry.detail.account) !== entry.actor ? (
                <span className="text-neutral-500"> — {entry.detail.name ?? entry.detail.account}</span>
              ) : null}
            </span>
            <span className="text-[12px] text-neutral-600 font-normal shrink-0 tabular-nums">
              {formatAgo(entry.at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpiryPill({ account }) {
  if (account.expired) return <Pill tone="rose">expired</Pill>;
  if (!account.expires) return null;
  const left = daysUntil(account.expires);
  if (left === null) return null;
  if (left <= EXPIRING_SOON_DAYS) {
    return <Pill tone="amber">{left === 0 ? 'ends today' : `ends in ${left}d`}</Pill>;
  }
  return <Pill>until {formatDate(account.expires)}</Pill>;
}

function AccountRow({ account, failures, isSelf, selectable, selected, onSelect, onOpen }) {
  const quiet = [
    account.lastSignIn ? `signed in ${formatAgo(account.lastSignIn)}` : 'never signed in',
    account.discord?.linked ? 'discord' : null,
    account.note || null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-4 px-4 sm:px-6 border-b border-[#17171d] last:border-b-0 hover:bg-[#111115] transition-colors">
      {selectable ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
          aria-label={`Select ${account.name}`}
          className="h-4 w-4 sm:h-3.5 sm:w-3.5 accent-purple-500 shrink-0"
        />
      ) : (
        <span className="h-3.5 w-3.5 shrink-0" />
      )}

      <button
        type="button"
        onClick={() => onOpen(account.name)}
        className="flex flex-1 items-center justify-between gap-4 min-w-0 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-3">
          <MiniFace account={account} />
          <span className="min-w-0">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] text-white font-medium">{account.name}</span>
              <Pill tone={ROLE_TONE[account.role] ?? 'neutral'}>{account.role}</Pill>
              {isSelf && <Pill>you</Pill>}
              {account.disabled && <Pill tone="rose">disabled</Pill>}
              {account.mustChange && <Pill tone="amber">first password</Pill>}
              {failures?.lockedFor > 0 && (
                <Pill tone="rose">locked {Math.max(1, Math.round(failures.lockedFor / 60))}m</Pill>
              )}
              {failures?.lockedFor === 0 && failures?.failures > 0 && (
                <Pill tone="amber">
                  {failures.failures} failed sign-in{failures.failures === 1 ? '' : 's'}
                </Pill>
              )}
              <ExpiryPill account={account} />
            </span>
            <span className="block text-[12px] text-neutral-500 font-normal mt-1 truncate">
              {quiet.join(' · ')}
            </span>
          </span>
        </span>

        <span className="flex items-center gap-3 shrink-0">
          {account.twoFactor ? (
            <Pill tone="green">two-step</Pill>
          ) : (
            <span className="text-[11px] text-neutral-600 font-normal hidden sm:inline">
              no two-step
            </span>
          )}
          <ChevronRight className="h-3.5 w-3.5 text-neutral-600" strokeWidth={2} />
        </span>
      </button>
    </div>
  );
}

const DETAIL_TABS = [
  { id: 'access', label: 'Access', icon: SlidersHorizontal },
  { id: 'details', label: 'Details', icon: FileText },
  { id: 'security', label: 'Sign-in', icon: KeyRound },
  { id: 'history', label: 'History', icon: HistoryIcon },
];

const SELF_TABS = DETAIL_TABS.filter((entry) => entry.id === 'access' || entry.id === 'history');

function Detail({
  account,
  roles,
  permissions,
  rolePermissions,
  audit,
  failures,
  canManage,
  canManageOwners,
  isSelf,
  onGoTo,
  onBack,
  onChanged,
  onError,
  onSecret,
  onNotice,
  onGone,
}) {
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(null);
  const [tab, setTab] = React.useState('access');

  async function run(action) {
    if (busy) return false;
    setBusy(true);
    onError(null);
    try {
      await action();
      onChanged();
      return true;
    } catch (failure) {
      onError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const editable = canManage && (!account.protected || canManageOwners);

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-[12px] font-semibold text-neutral-400 tracking-wide hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          All accounts
        </button>

        {editable && !isSelf && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              type="button"
              disabled={busy}
              title={`End every session ${account.name} has open`}
              onClick={() =>
                run(async () => {
                  await signOutUser(account.name);
                  onNotice(`${account.name} has been signed out everywhere.`);
                })
              }
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
              Sign out
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => updateUser({ name: account.name, disabled: !account.disabled }))
              }
            >
              <Power className="h-3.5 w-3.5" strokeWidth={2} />
              {account.disabled ? 'Enable' : 'Disable'}
            </Button>
          </div>
        )}
      </div>

      <section className="border border-[#282832] bg-[#0a0a0d]">
        <div className="flex flex-col gap-5 px-4 sm:px-6 py-6 sm:flex-row sm:items-center sm:gap-6">
          <AccountFace
            account={account}
            canClear={editable && !isSelf}
            busy={busy}
            onClear={() =>
              run(async () => {
                await clearUserPicture(account.name);
                onNotice(`The picture on ${account.name} has been removed.`);
              })
            }
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="text-[26px] sm:text-[30px] font-normal text-white leading-none tracking-tight">
                {account.name}
              </h2>
              <span className="flex flex-wrap items-center gap-2">
                <Pill tone={ROLE_TONE[account.role] ?? 'neutral'}>{account.role}</Pill>
                {isSelf && <Pill>you</Pill>}
                {account.disabled && <Pill tone="rose">disabled</Pill>}
                {account.mustChange && <Pill tone="amber">first password</Pill>}
                {!account.lastSignIn && <Pill>never signed in</Pill>}
                {account.twoFactor && <Pill tone="green">two-step</Pill>}
                {account.discord?.linked && <Pill tone="purple">discord</Pill>}
                <ExpiryPill account={account} />
              </span>
            </div>

            <p className="text-[12px] text-neutral-500 font-normal mt-3 leading-relaxed">
              {account.lastSignIn
                ? `Last signed in ${formatAgo(account.lastSignIn)}`
                : 'Has not signed in yet'}
              {account.lastIp ? ` from ${account.lastIp}` : ''}
              <span className="text-neutral-700"> · </span>
              {account.created ? `created ${formatStamp(account.created)}` : 'created at install'}
              {account.createdBy ? ` by ${account.createdBy}` : ''}
              <span className="text-neutral-700"> · </span>
              {(account.permissions ?? []).length} of {permissions.length} permissions
            </p>
          </div>
        </div>

        {account.note && (
          <p className="px-4 sm:px-6 py-4 text-[13px] text-neutral-300 font-normal leading-relaxed border-t border-[#17171d]">
            {account.note}
          </p>
        )}

        {failures?.failures > 0 && (
          <div className="px-4 sm:px-6 py-4 border-t border-[#17171d]">
            <p className="text-[12px] text-amber-300/80 font-normal leading-relaxed">
              {failures.failures} failed sign-in{failures.failures === 1 ? '' : 's'} on record, the
              last {formatAgo(failures.lastFailure)}
              {failures.addresses.length > 1
                ? `, from ${failures.addresses.length} different addresses`
                : ''}
              .
            </p>
            {failures.lastFailureIp && (
              <p className="text-[11px] text-neutral-600 font-mono mt-1 break-all">
                {failures.lastFailureIp}
              </p>
            )}
          </div>
        )}
      </section>

      {isSelf ? (
        <>
          <Panel title="This one is yours" icon={Users}>
            <p className="px-4 sm:px-6 pt-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
              Your own role, access and password cannot be changed from here — that stops an
              operator locking themselves out by mistake. Everything you can change about yourself
              lives under Your account, where a password change asks for the current one and keeps
              you signed in.
            </p>
            <div className="px-4 sm:px-6 py-5 flex flex-wrap gap-3">
              <Button type="button" tone="solid" onClick={() => onGoTo?.('account')}>
                Open Your account
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
              </Button>
              <Button type="button" onClick={() => onGoTo?.('account', 'security')}>
                <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
                Change my password
              </Button>
            </div>
          </Panel>

          <SubNav
            tabs={SELF_TABS}
            active={tab === 'history' ? 'history' : 'access'}
            onPick={setTab}
            label="Your account, as the panel sees it"
          />

          {tab === 'history' ? (
            <Panel title="History" icon={HistoryIcon}>
              <div className="px-4 sm:px-6 py-6">
                <AccountHistory name={account.name} audit={audit} />
              </div>
            </Panel>
          ) : (
            <Panel
              title="Access"
              icon={SlidersHorizontal}
              action={<Pill>read only</Pill>}
            >
              <div className="px-4 sm:px-6 py-6">
                <PermissionGrid
                  permissions={permissions}
                  effective={account.permissions ?? []}
                  editable={false}
                />
              </div>
            </Panel>
          )}
        </>
      ) : (
        <>
          {account.protected && (
            <p className="border border-amber-500/40 bg-amber-500/10 px-4 sm:px-6 py-4 text-[13px] text-amber-200/80 font-normal leading-relaxed">
              This is an owner account — the same standing as yours. Anything you change here you
              could have done to you. The server refuses to demote, disable, expire or remove the
              last owner who can still sign in.
            </p>
          )}

          <SubNav
            tabs={DETAIL_TABS}
            active={tab}
            onPick={setTab}
            label={`What to change about ${account.name}`}
          />

          {tab === 'access' && (
            <Panel title="Access" icon={SlidersHorizontal}>
              <div className="px-4 sm:px-6 py-6">
                <AccessEditor
                  account={account}
                  roles={roles}
                  permissions={permissions}
                  rolePermissions={rolePermissions}
                  canManageOwners={canManageOwners}
                  busy={busy}
                  onSave={(changes) => run(() => updateUser({ name: account.name, ...changes }))}
                />
              </div>
            </Panel>
          )}

          {tab === 'details' && (
            <Panel title="Details" icon={FileText}>
              <div className="px-4 sm:px-6 py-6">
                <DetailsEditor
                  account={account}
                  busy={busy}
                  onSave={(changes) =>
                    run(async () => {
                      await updateUser({ name: account.name, ...changes });
                      onNotice(`Saved the details for ${account.name}.`);
                    })
                  }
                />
              </div>
            </Panel>
          )}

          {tab === 'security' && (
            <>
              <Panel title="Password" icon={KeyRound}>
                <div className="px-4 sm:px-6 py-6">
                <PasswordEditor
                  account={account}
                  busy={busy}
                  onSet={(password, mustChange) =>
                    run(async () => {
                      const reset = await resetUserPassword(account.name, password, mustChange);
                      if (reset.password) {
                        onSecret({
                          name: account.name,
                          secret: reset.password,
                          headline: 'has a new password.',
                        });
                      } else {
                        onNotice(`${account.name} now has the password you chose.`);
                      }
                    })
                  }
                />
                </div>
              </Panel>

              <Panel title="Two-step verification" icon={ShieldCheck}>
                <div className="px-4 sm:px-6 py-6 flex items-start justify-between gap-4 flex-wrap">
                  <p className="text-[13px] text-neutral-400 font-normal leading-relaxed max-w-md">
                    {account.twoFactor
                      ? 'This account needs a code from an authenticator app as well as a password. Clear it only if they have lost the app and their recovery codes — they will be back to a password alone until they set it up again.'
                      : 'Not set up. Only they can turn it on, from Your account — nobody can enrol a phone on someone else’s behalf.'}
                  </p>
                  {account.twoFactor && (
                    <div className="flex items-center gap-2 shrink-0">
                      {confirming === 'twofactor' && (
                        <Button type="button" onClick={() => setConfirming(null)}>
                          Keep it
                        </Button>
                      )}
                      <Button
                        type="button"
                        tone="danger"
                        disabled={busy}
                        onClick={() => {
                          if (confirming !== 'twofactor') {
                            setConfirming('twofactor');
                            return;
                          }
                          setConfirming(null);
                          run(async () => {
                            await clearTwoFactor(account.name);
                            onNotice(`Two-step cleared for ${account.name}.`);
                          });
                        }}
                      >
                        <ShieldOff className="h-3.5 w-3.5" strokeWidth={2} />
                        {confirming === 'twofactor' ? 'Really clear it' : 'Clear two-step'}
                      </Button>
                    </div>
                  )}
                </div>
              </Panel>

              <DiscordAccount
                account={account}
                busy={busy}
                confirming={confirming}
                onConfirm={setConfirming}
                onClear={() =>
                  run(async () => {
                    await clearDiscord(account.name);
                    onNotice(`Discord link cleared for ${account.name}.`);
                  })
                }
              />

              <Panel title="Ending their access" icon={LogOut}>
                <div className="px-4 sm:px-6 py-6 flex items-start justify-between gap-4 flex-wrap">
                <p className="text-[12px] text-neutral-500 font-normal leading-relaxed max-w-md">
                  Signing them out ends every session on every device but leaves the password alone —
                  the right move for a lost laptop. Removing the account also ends its sessions; its
                  API tokens survive, so revoke those under API.
                </p>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await signOutUser(account.name);
                        onNotice(`${account.name} has been signed out everywhere.`);
                      })
                    }
                  >
                    <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
                    Sign out everywhere
                  </Button>
                  {confirming === 'remove' && (
                    <Button type="button" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  )}
                  <Button
                    type="button"
                    tone="danger"
                    disabled={busy}
                    onClick={() => {
                      if (confirming !== 'remove') {
                        setConfirming('remove');
                        return;
                      }
                      setConfirming(null);
                      run(async () => {
                        await deleteUser(account.name);
                        onNotice(`${account.name} has been removed.`);
                        onGone();
                      });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    {confirming === 'remove' ? `Really remove ${account.name}` : 'Remove'}
                  </Button>
                </div>
                </div>
              </Panel>
            </>
          )}

          {tab === 'history' && (
            <Panel title="History" icon={HistoryIcon}>
              <div className="px-4 sm:px-6 py-6">
                <AccountHistory name={account.name} audit={audit} />
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

export default function People({
  data,
  audit,
  failures,
  canManage,
  self,
  onGoTo,
  onChanged,
  onError,
  onNotice,
  onSecret,
}) {
  const [query, setQuery] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [sort, setSort] = React.useState('name');
  const [view, setView] = React.useState({ mode: 'list', name: null });
  const [picked, setPicked] = React.useState([]);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [bulkConfirm, setBulkConfirm] = React.useState(null);

  const accounts = data?.users ?? [];
  const roles = data?.roles ?? [];
  const permissions = data?.permissions ?? [];
  const canManageOwners = canManage && Boolean(data?.canManageOwners);

  const needle = query.trim().toLowerCase();
  const matched = accounts.filter((account) => {
    if (
      needle &&
      !account.name.toLowerCase().includes(needle) &&
      !(account.note ?? '').toLowerCase().includes(needle)
    ) {
      return false;
    }
    if (roleFilter !== 'all' && account.role !== roleFilter) return false;
    if (statusFilter === 'active' && (account.disabled || account.expired)) return false;
    if (statusFilter === 'disabled' && !account.disabled) return false;
    if (statusFilter === 'expired' && !account.expired) return false;
    if (statusFilter === 'never' && account.lastSignIn) return false;
    if (statusFilter === 'must-change' && !account.mustChange) return false;
    if (statusFilter === 'no-2fa' && account.twoFactor) return false;
    if (statusFilter === 'discord' && !account.discord?.linked) return false;
    if (statusFilter === 'password-only' && account.discord?.linked) return false;
    return true;
  });

  const ORDER = {
    name: (a, b) => a.name.localeCompare(b.name),
    role: (a, b) => (a.role ?? '').localeCompare(b.role ?? '') || a.name.localeCompare(b.name),
    recent: (a, b) => (Date.parse(b.lastSignIn ?? 0) || 0) - (Date.parse(a.lastSignIn ?? 0) || 0),
    stale: (a, b) => (Date.parse(a.lastSignIn ?? 0) || 0) - (Date.parse(b.lastSignIn ?? 0) || 0),
    created: (a, b) => (Date.parse(b.created ?? 0) || 0) - (Date.parse(a.created ?? 0) || 0),
  };

  const shown = [...matched].sort(ORDER[sort] ?? ORDER.name);

  const selectable = shown.filter(
    (account) => canManage && !account.protected && account.name !== self,
  );
  const chosen = picked.filter((name) => selectable.some((account) => account.name === name));
  const allPicked = selectable.length > 0 && chosen.length === selectable.length;

  function toggleAll() {
    setPicked(allPicked ? [] : selectable.map((account) => account.name));
  }

  async function bulk(action, label, names = chosen) {
    setBulkBusy(true);
    onError(null);
    let done = 0;
    let failed = 0;
    for (const name of names) {
      try {
        await action(name);
        done += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkBusy(false);
    setPicked([]);
    setBulkConfirm(null);
    onChanged();
    if (failed > 0) {
      onError(`${label} ${done} of ${done + failed} — ${failed} could not be done.`);
    } else {
      onNotice(`${label} ${done} ${done === 1 ? 'account' : 'accounts'}.`);
    }
  }

  const chosenWithTwoFactor = chosen.filter(
    (name) => accounts.find((account) => account.name === name)?.twoFactor,
  );

  function exportCsv() {
    const columns = [
      'name',
      'role',
      'status',
      'permissions',
      'twoStep',
      'discord',
      'lastSignIn',
      'lastIp',
      'created',
      'createdBy',
      'expires',
      'note',
    ];
    const cell = (value) => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = shown.map((account) =>
      [
        account.name,
        account.role,
        account.disabled ? 'disabled' : account.expired ? 'expired' : 'active',
        (account.permissions ?? []).join(' '),
        account.twoFactor ? 'yes' : 'no',
        account.discord?.linked
          ? account.discord.displayName || account.discord.username || account.discord.tag || ''
          : '',
        account.lastSignIn ?? '',
        account.lastIp ?? '',
        account.created ?? '',
        account.createdBy ?? '',
        account.expires ?? '',
        account.note ?? '',
      ]
        .map(cell)
        .join(','),
    );
    const blob = new Blob([[columns.join(','), ...rows].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `amitista-accounts-${todayIso()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onNotice(`Downloaded ${shown.length} ${shown.length === 1 ? 'account' : 'accounts'} as CSV.`);
  }

  const disabled = accounts.filter((account) => account.disabled).length;
  const never = accounts.filter((account) => !account.lastSignIn).length;
  const protected2fa = accounts.filter((account) => account.twoFactor).length;
  const owners = accounts.filter((account) => account.role === 'owner');
  const managers = accounts.filter((account) =>
    (account.permissions ?? []).includes('users.manage'),
  ).length;

  const back = React.useCallback(() => setView({ mode: 'list', name: null }), []);

  if (view.mode === 'create' && canManage) {
    return (
      <div className="w-full flex flex-col gap-6">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-2 self-start text-[12px] font-semibold text-neutral-400 tracking-wide hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          All accounts
        </button>

        <Panel title="New account" icon={UserPlus}>
          <CreateForm
            roles={roles}
            permissions={permissions}
            rolePermissions={data?.rolePermissions}
            canManageOwners={canManageOwners}
            onError={onError}
            onCreated={(created) => {
              if (created.password) {
                onSecret({ name: created.name, secret: created.password, headline: 'is ready.' });
              } else {
                onNotice(`${created.name} is ready. They sign in with the password you chose.`);
              }
              onChanged();
              setView({ mode: 'detail', name: created.name });
            }}
          />
        </Panel>
      </div>
    );
  }

  const opened = view.mode === 'detail' ? accounts.find((entry) => entry.name === view.name) : null;

  if (opened) {
    return (
      <Detail
        account={opened}
        roles={roles}
        permissions={permissions}
        rolePermissions={data?.rolePermissions}
        audit={audit}
        failures={(failures ?? []).find(
          (entry) => entry.account?.toLowerCase() === opened.name.toLowerCase(),
        )}
        canManage={canManage}
        canManageOwners={canManageOwners}
        isSelf={opened.name === self}
        onGoTo={onGoTo}
        onBack={back}
        onChanged={onChanged}
        onError={onError}
        onSecret={onSecret}
        onNotice={onNotice}
        onGone={back}
      />
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-px bg-[#17171d] border border-[#282832]">
        <Stat label="Accounts" value={accounts.length} />
        <Stat
          label="Owners"
          value={owners.length}
          tone="text-purple-300"
          hint={owners.map((account) => account.name).join(', ') || 'nobody'}
        />
        <Stat label="Can manage" value={managers} hint="can add or remove people" />
        <Stat
          label="With two-step"
          value={`${protected2fa} / ${accounts.length}`}
          tone={protected2fa === accounts.length ? 'text-emerald-400' : 'text-amber-300'}
        />
        <Stat label="Disabled" value={disabled} tone={disabled > 0 ? 'text-rose-400' : 'text-white'} />
        <Stat
          label="Never signed in"
          value={never}
          tone={never > 0 ? 'text-amber-300' : 'text-white'}
        />
      </div>

      <Panel
        title={`Accounts — ${shown.length}${shown.length === accounts.length ? '' : ` of ${accounts.length}`}`}
        icon={Users}
        action={
          <div className="flex items-center gap-2 shrink-0">
            {!canManage && (
              <span className="text-[11px] text-neutral-500 font-normal hidden sm:inline">
                Read only
              </span>
            )}
            <Button
              type="button"
              disabled={shown.length === 0}
              title="Download the accounts you are looking at, with the filters applied"
              onClick={exportCsv}
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2} />
              Export
            </Button>
            {canManage && (
              <Button type="button" tone="solid" onClick={() => setView({ mode: 'create' })}>
                <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
                New account
              </Button>
            )}
          </div>
        }
      >
        <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-600"
              strokeWidth={1.5}
            />
            <input
              type="search"
              value={query}
              placeholder="Search name or note"
              aria-label="Search accounts"
              onChange={(event) => setQuery(event.target.value)}
              className={`${INPUT_CLASS} pl-11`}
            />
          </div>

          <Select
            value={roleFilter}
            aria-label="Filter by role"
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="all">Every role</option>
            {[...roles, 'custom'].map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </Select>

          <Select
            value={statusFilter}
            aria-label="Filter by status"
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="expired">Expired</option>
            <option value="never">Never signed in</option>
            <option value="must-change">Still on their first password</option>
            <option value="no-2fa">Without two-step</option>
            <option value="discord">With Discord linked</option>
            <option value="password-only">Password only</option>
          </Select>

          <Select
            value={sort}
            aria-label="Sort accounts"
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="name">By name</option>
            <option value="role">By role</option>
            <option value="recent">Signed in most recently</option>
            <option value="stale">Quietest first</option>
            <option value="created">Newest account first</option>
          </Select>
        </div>

        {selectable.length > 0 && (
          <div className="px-4 sm:px-6 py-3 border-b border-[#17171d] flex items-center justify-between gap-4 flex-wrap bg-[#08080b]">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allPicked}
                onChange={toggleAll}
                className="h-4 w-4 sm:h-3.5 sm:w-3.5 accent-purple-500"
              />
              <span className="text-[12px] text-neutral-400 font-normal">
                {chosen.length > 0
                  ? `${chosen.length} selected`
                  : `Select all ${selectable.length} you can change`}
              </span>
            </label>

            {chosen.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => bulk((name) => signOutUser(name), 'Signed out')}
                >
                  <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
                  Sign out
                </Button>
                <Button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => bulk((name) => updateUser({ name, disabled: true }), 'Disabled')}
                >
                  <Power className="h-3.5 w-3.5" strokeWidth={2} />
                  Disable
                </Button>
                <Button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => bulk((name) => updateUser({ name, disabled: false }), 'Enabled')}
                >
                  <Power className="h-3.5 w-3.5" strokeWidth={2} />
                  Enable
                </Button>
                {chosenWithTwoFactor.length > 0 && (
                  <>
                    {bulkConfirm === 'twofactor' && (
                      <Button type="button" onClick={() => setBulkConfirm(null)}>
                        Keep it
                      </Button>
                    )}
                    <Button
                      type="button"
                      tone="danger"
                      disabled={bulkBusy}
                      onClick={() => {
                        if (bulkConfirm !== 'twofactor') {
                          setBulkConfirm('twofactor');
                          return;
                        }
                        bulk(
                          (name) => clearTwoFactor(name),
                          'Cleared two-step for',
                          chosenWithTwoFactor,
                        );
                      }}
                    >
                      <ShieldOff className="h-3.5 w-3.5" strokeWidth={2} />
                      {bulkConfirm === 'twofactor'
                        ? `Really clear two-step for ${chosenWithTwoFactor.length}`
                        : 'Clear two-step'}
                    </Button>
                  </>
                )}
                {bulkConfirm === 'remove' && (
                  <Button type="button" onClick={() => setBulkConfirm(null)}>
                    Keep
                  </Button>
                )}
                <Button
                  type="button"
                  tone="danger"
                  disabled={bulkBusy}
                  onClick={() => {
                    if (bulkConfirm !== 'remove') {
                      setBulkConfirm('remove');
                      return;
                    }
                    bulk((name) => deleteUser(name), 'Removed');
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  {bulkConfirm === 'remove' ? `Really remove ${chosen.length}` : 'Remove'}
                </Button>
              </div>
            )}
          </div>
        )}

        {accounts.length === 0 && <Empty>No accounts yet.</Empty>}
        {accounts.length > 0 && shown.length === 0 && <Empty>Nothing matches that.</Empty>}
        {shown.map((account) => (
          <AccountRow
            key={account.name}
            account={account}
            failures={(failures ?? []).find(
              (entry) => entry.account?.toLowerCase() === account.name.toLowerCase(),
            )}
            isSelf={account.name === self}
            onOpen={(name) => setView({ mode: 'detail', name })}
            selectable={selectable.some((entry) => entry.name === account.name)}
            selected={chosen.includes(account.name)}
            onSelect={(on) =>
              setPicked((current) =>
                on ? [...current, account.name] : current.filter((entry) => entry !== account.name),
              )
            }
          />
        ))}
      </Panel>
    </div>
  );
}
