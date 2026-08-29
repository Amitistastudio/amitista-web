import React from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  KeyRound,
  Mail,
  Plus,
  ShieldAlert,
  UserPlus,
  X,
} from 'lucide-react';
import {
  formatAgo,
  queueGithubAccess,
  queueGithubInviteCancel,
  queueGithubRevoke,
} from '../../../lib/admin';
import { Button, Empty, Figure, Notice, Panel, Pill, Select, TextInput } from '../ui';
import { GithubLink, listOf, REPO_ROLES, roleApi, roleLabel, roleRank } from './shared';

const DAY = 86400000;
const INVITE_STALE_DAYS = 7;

// How often to look again while something is waiting to be carried out. The
// deploy ticks about once a minute, so this catches the outcome within a few
// seconds of it happening without anyone watching for a tick they cannot see.
const WATCH_MS = 15000;

const ageDays = (at) => (at ? Math.floor((Date.now() - Date.parse(at)) / DAY) : null);

const peopleIn = (data) => (data?.people && typeof data.people === 'object' ? data.people : {});

const listSentence = (parts) =>
  parts.length <= 1
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

// Everyone who can reach anything, and what they hold on each repository.
//
// Built from the per-repository lists as well as the member list, because they
// answer different questions and the difference is the point: an outside
// collaborator is on a repository and not in the organisation, and an owner is
// in the organisation and on every repository without ever having been added to
// one.
function everyone(repositories, members) {
  const rows = new Map();
  const take = (login, extra) => {
    const held = rows.get(login) ?? { login, holds: {}, member: null };
    // Only what is actually there. Object.assign happily writes an undefined
    // over a value, and the same person arrives from two lists — one of which
    // may not carry their avatar.
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined && value !== null) held[key] = value;
    });
    rows.set(login, held);
    return held;
  };

  members.forEach((member) => {
    take(member.login, {
      member: member.role ?? 'member',
      avatar: member.avatar,
      url: member.url,
    });
  });

  repositories.forEach((repo) => {
    listOf(repo, 'access').forEach((entry) => {
      const row = take(entry.login, { avatar: entry.avatar, url: entry.url });
      row.holds[repo.name] = { role: entry.role, direct: entry.direct };
    });
  });

  const strongest = (person) =>
    Math.max(-1, ...Object.values(person.holds).map((held) => roleRank(held.role)));

  return [...rows.values()].sort((a, b) => {
    if (a.member !== b.member) {
      const rank = { owner: 0, member: 1 };
      return (rank[a.member] ?? 2) - (rank[b.member] ?? 2);
    }
    const mine = strongest(a);
    const theirs = strongest(b);
    if (mine !== theirs) return theirs - mine;
    return a.login.localeCompare(b.login);
  });
}

// One line for what somebody holds, so the row says it without being opened.
function summarise(person, repositories) {
  const held = repositories.filter((repo) => person.holds[repo.name]);
  if (held.length === 0) return 'no access to any repository';

  const levels = new Set(held.map((repo) => roleLabel(person.holds[repo.name].role)));
  if (held.length === repositories.length && levels.size === 1) {
    return `${[...levels][0]} on all ${repositories.length}`;
  }
  return listSentence(
    held.map((repo) => `${roleLabel(person.holds[repo.name].role)} on ${repo.name}`),
  );
}

// The section's own verdict list. Not everything unusual — only the things that
// would be worth doing something about, each saying what and why.
function concerns(org, people, repositories, team) {
  const out = [];
  const add = (rank, tone, title, detail) => out.push({ rank, tone, title, detail });

  const weak = Array.isArray(people.withoutTwoFactor) ? people.withoutTwoFactor : [];
  if (weak.length > 0) {
    add(
      0,
      'rose',
      `${listSentence(weak)} ${weak.length === 1 ? 'has' : 'have'} no two-factor authentication`,
      'A password alone is all that stands between that account and every private repository here.',
    );
  } else if (org && !org.twoFactorRequired) {
    add(
      2,
      'amber',
      'The organisation does not require two-factor authentication',
      'Everyone in it has it on today, so requiring it costs nothing now and stops the next person joining without it.',
    );
  }

  if (org && org.defaultPermission && org.defaultPermission !== 'none') {
    const level = roleLabel(org.defaultPermission);
    add(
      org.defaultPermission === 'read' ? 4 : 1,
      org.defaultPermission === 'read' ? 'amber' : 'rose',
      `Anyone joining the organisation gets ${level} on all ${org.privateRepos ?? ''} repositories`.trim(),
      org.defaultPermission === 'read'
        ? 'That is the default base permission. It is the mild setting, but it does mean access is granted by joining rather than by anyone deciding.'
        : 'A new member can push to everything the moment they accept the invitation, without anyone granting it.',
    );
  }

  team.forEach((person) => {
    const admin = Object.entries(person.holds).filter(([, held]) => held.role === 'admin');
    if (admin.length > 0 && person.member !== 'owner') {
      add(
        1,
        'rose',
        `${person.login} has admin on ${listSentence(admin.map(([name]) => name))} without being an owner`,
        'Admin on a repository means being able to delete it and to change who else can reach it. Worth being deliberate about.',
      );
    }
  });

  repositories.forEach((repo) => {
    listOf(repo, 'invites').forEach((invite) => {
      const old = ageDays(invite.created);
      if (invite.expired) {
        add(
          3,
          'amber',
          `${repo.name}: the invitation to ${invite.login} has expired`,
          'It can no longer be accepted. Cancel it and send another if it was meant.',
        );
      } else if (old !== null && old >= INVITE_STALE_DAYS) {
        add(
          4,
          'amber',
          `${repo.name}: ${invite.login} has not answered in ${old} days`,
          'An invitation nobody accepts is usually one that went to the wrong account.',
        );
      }
    });
  });

  return out.sort((a, b) => a.rank - b.rank);
}

function Avatar({ src, size = 'h-7 w-7' }) {
  return src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`${size} rounded-full border border-[#282832] shrink-0`}
    />
  ) : (
    <span className={`${size} rounded-full border border-[#282832] bg-[#111115] shrink-0`} />
  );
}

function Login({ login, url }) {
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="text-[13px] text-white hover:underline break-all"
    >
      {login}
    </a>
  ) : (
    <span className="text-[13px] text-white break-all">{login}</span>
  );
}

function LevelPicker({ id, value, disabled, onChange, label }) {
  return (
    // Select paints its own class list and spreads props after it, so passing
    // className would replace the styling rather than add to it. Width belongs
    // on a wrapper.
    <span className="inline-block w-28">
      <Select id={id} value={value} disabled={disabled} aria-label={label} onChange={onChange}>
        {REPO_ROLES.map((level) => (
          <option key={level.api} value={level.api}>
            {level.label}
          </option>
        ))}
      </Select>
    </span>
  );
}

// One person's access to one repository, with whatever can actually be done
// about it. Controls only appear where they would work: access that comes from
// being an owner cannot be taken away here, and saying so is more use than a
// button that fails.
function RepoAccess({ repo, held, login, self, busy, onGrant, onRevoke }) {
  const current = held ? roleApi(held.role) : null;
  const [wanted, setWanted] = React.useState(current ?? 'pull');

  React.useEffect(() => {
    setWanted(current ?? 'pull');
  }, [current]);

  const note = self
    ? 'Not changeable here — this is the account the deploy uses, and taking its access away would stop the deploy that could put it back.'
    : held && !held.direct
      ? 'Comes from their organisation role. Change that on GitHub, or it comes straight back.'
      : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 border-b border-[#17171d] last:border-b-0">
      <div className="min-w-0">
        <p className="text-[12px] text-neutral-200 font-mono break-all">{repo}</p>
        <p className="text-[11px] text-neutral-500 mt-0.5">
          {held
            ? `${roleLabel(held.role)} · ${held.direct ? 'added to this repository' : 'through the organisation'}`
            : 'no access'}
        </p>
      </div>

      {note ? (
        <p className="text-[11px] text-neutral-600 max-w-[24rem]">{note}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <LevelPicker
            value={wanted}
            disabled={busy}
            label={`Permission for ${login} on ${repo}`}
            onChange={(event) => setWanted(event.target.value)}
          />
          <Button
            type="button"
            disabled={busy || (held && wanted === current)}
            onClick={() => onGrant(repo, login, wanted)}
          >
            {held ? (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                Change
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Give access
              </>
            )}
          </Button>
          {held && (
            <Button type="button" tone="danger" disabled={busy} onClick={() => onRevoke(repo, login)}>
              <X className="h-3.5 w-3.5" strokeWidth={2} />
              Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// One row of the table, and everything about that person underneath it when
// opened. The row and the controls are the same thing on purpose: a separate
// list per repository meant reading the same person four times over.
function PersonRow({ person, repositories, actor, busy, open, onToggle, onGrant, onRevoke }) {
  const self = actor && person.login.toLowerCase() === actor.toLowerCase();
  const span = repositories.length + 2;

  return (
    <>
      <tr
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        aria-expanded={open}
        className="border-b border-[#17171d] cursor-pointer hover:bg-[#101014] focus-visible:bg-[#101014] outline-none transition-colors"
      >
        <td className="px-4 sm:px-6 py-3">
          <span className="flex items-center gap-2.5 min-w-0">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-neutral-500 shrink-0" strokeWidth={2} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-neutral-600 shrink-0" strokeWidth={2} />
            )}
            <Avatar src={person.avatar} />
            <span className="min-w-0">
              <Login login={person.login} url={person.url} />
              <span className="block text-[11px] text-neutral-500 mt-0.5">
                {summarise(person, repositories)}
              </span>
            </span>
          </span>
        </td>
        <td className="px-3 py-3">
          {person.member ? (
            <Pill tone={person.member === 'owner' ? 'purple' : 'neutral'}>{person.member}</Pill>
          ) : (
            <span className="text-[11px] text-neutral-600">outside</span>
          )}
        </td>
        {repositories.map((repo) => {
          const held = person.holds[repo.name];
          return (
            <td key={repo.name} className="px-3 py-3 whitespace-nowrap">
              {held ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`text-[12px] ${held.role === 'admin' ? 'text-rose-300' : 'text-neutral-300'}`}
                  >
                    {roleLabel(held.role)}
                  </span>
                  {!held.direct && (
                    <span
                      title="through the organisation, not added to this repository"
                      className="text-[10px] text-neutral-600"
                    >
                      org
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-[12px] text-neutral-700">—</span>
              )}
            </td>
          );
        })}
      </tr>

      {open && (
        <tr className="border-b border-[#17171d] bg-[#0b0b0e]">
          <td colSpan={span} className="px-4 sm:px-6 py-3">
            {repositories.map((repo) => (
              <RepoAccess
                key={repo.name}
                repo={repo.name}
                held={person.holds[repo.name]}
                login={person.login}
                self={self}
                busy={busy}
                onGrant={onGrant}
                onRevoke={onRevoke}
              />
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

// One form for all of it. Adding a teammate to three repositories used to mean
// filling in three identical forms; each repository is still a separate request
// so that one being refused does not take the others down with it.
function AddSomeone({ repositories, busy, onGrant }) {
  const [login, setLogin] = React.useState('');
  const [permission, setPermission] = React.useState('pull');
  const [wanted, setWanted] = React.useState([]);

  const toggle = (name) =>
    setWanted((held) => (held.includes(name) ? held.filter((x) => x !== name) : [...held, name]));

  const submit = (event) => {
    event.preventDefault();
    const who = login.trim();
    if (!who || wanted.length === 0) return;
    onGrant(wanted, who, permission);
    setLogin('');
    setWanted([]);
  };

  return (
    <form onSubmit={submit} className="px-4 sm:px-6 py-4 border-b border-[#17171d]">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[12rem]">
          <label
            className="block text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-2"
            htmlFor="github-add-login"
          >
            GitHub username
          </label>
          <TextInput
            id="github-add-login"
            value={login}
            autoComplete="off"
            spellCheck={false}
            placeholder="octocat"
            disabled={busy}
            onChange={(event) => setLogin(event.target.value)}
          />
        </div>
        <div>
          <label
            className="block text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-2"
            htmlFor="github-add-level"
          >
            Can
          </label>
          <LevelPicker
            id="github-add-level"
            value={permission}
            disabled={busy}
            label="Permission to give"
            onChange={(event) => setPermission(event.target.value)}
          />
        </div>
        <Button type="submit" tone="solid" disabled={busy || !login.trim() || wanted.length === 0}>
          <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
          Invite
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase">
          To
        </span>
        {repositories.map((repo) => {
          const on = wanted.includes(repo.name);
          return (
            <button
              key={repo.name}
              type="button"
              disabled={busy}
              aria-pressed={on}
              onClick={() => toggle(repo.name)}
              className={`tap border px-3 py-1.5 text-[11px] font-mono transition-colors disabled:opacity-40 ${
                on
                  ? 'border-purple-500/60 bg-purple-500/10 text-purple-200'
                  : 'border-[#282832] bg-[#0a0a0d] text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {repo.name}
            </button>
          );
        })}
        {repositories.length > 1 && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setWanted(
                wanted.length === repositories.length ? [] : repositories.map((repo) => repo.name),
              )
            }
            className="text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-600 hover:text-white transition-colors disabled:opacity-40"
          >
            {wanted.length === repositories.length ? 'none' : 'all'}
          </button>
        )}
      </div>

      <p className="text-[11px] text-neutral-600 leading-relaxed mt-3">
        {REPO_ROLES.find((level) => level.api === permission)?.blurb} They get an invitation per
        repository, and the access begins when they accept it.
        {wanted.length === 0 ? ' Pick at least one repository.' : ''}
      </p>
    </form>
  );
}

function describe(item) {
  if (item.action === 'revoke') return `Remove ${item.login} from ${item.repo}`;
  if (item.action === 'uninvite') return `Cancel an invitation on ${item.repo}`;
  return `${item.login} on ${item.repo} · ${roleLabel(item.permission)}`;
}

export default function People({ data, onRefresh }) {
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState(null);
  const [asked, setAsked] = React.useState(null);
  const [open, setOpen] = React.useState(null);

  const repositories = Array.isArray(data?.repositories) ? data.repositories : [];
  const people = peopleIn(data);
  const org = people.org ?? null;
  const members = Array.isArray(people.members) ? people.members : [];
  const actor = people.actor ?? null;
  const queued = Array.isArray(data?.queued) ? data.queued : [];
  const history = Array.isArray(people.actions) ? people.actions : [];

  const team = everyone(repositories, members);
  const worries = concerns(org, people, repositories, team);
  const invites = repositories.flatMap((repo) =>
    listOf(repo, 'invites').map((invite) => ({ ...invite, repo: repo.name })),
  );
  const outside = team.filter((person) => person.member === null);
  const owners = team.filter((person) => person.member === 'owner').length;

  // While something is waiting to be carried out, look again on a short cycle
  // so the outcome lands on the page by itself. It stops the moment the queue
  // is empty, so an idle panel asks the server nothing.
  const waiting = queued.length;
  React.useEffect(() => {
    if (waiting === 0 || !onRefresh) return undefined;
    const timer = setInterval(onRefresh, WATCH_MS);
    return () => clearInterval(timer);
  }, [waiting, onRefresh]);

  const ask = React.useCallback(async (what, run) => {
    setBusy(true);
    setFailure(null);
    try {
      await run();
      setAsked(what);
    } catch (problem) {
      setFailure(problem.message);
      setAsked(null);
    } finally {
      setBusy(false);
    }
  }, []);

  // One request per repository, and settled rather than all-or-nothing: two of
  // three landing is a real outcome, and reporting it as a failure would send
  // somebody to undo work that was never done. What was asked for and what was
  // refused are both said, separately.
  const grant = async (repos, login, permission) => {
    const wanted = Array.isArray(repos) ? repos : [repos];
    setBusy(true);
    const results = await Promise.allSettled(
      wanted.map((repo) => queueGithubAccess(repo, login, permission)),
    );
    setBusy(false);

    const landed = wanted.filter((unused, index) => results[index].status === 'fulfilled');
    const refused = [
      ...new Set(
        results
          .filter((result) => result.status === 'rejected')
          .map((result) => result.reason?.message ?? 'It was refused.'),
      ),
    ];

    setAsked(
      landed.length > 0
        ? `${login} · ${roleLabel(permission)} on ${listSentence(landed)}`
        : null,
    );
    setFailure(
      refused.length === 0
        ? null
        : wanted.length === 1
          ? refused[0]
          : `${wanted.length - landed.length} of ${wanted.length} could not be asked for: ${refused.join(' ')}`,
    );
  };
  const revoke = (repo, login) =>
    ask(`remove ${login} from ${repo}`, () => queueGithubRevoke(repo, login));
  const uninvite = (repo, invite, login) =>
    ask(`cancel the invitation to ${login} on ${repo}`, () =>
      queueGithubInviteCancel(repo, invite),
    );

  if (repositories.length === 0) {
    return (
      <Panel title="People and access" icon={KeyRound}>
        <Empty>Nothing has been gathered yet. This fills in once the deploy has run.</Empty>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Can reach the code"
          value={team.length}
          hint={`${owners} owner${owners === 1 ? '' : 's'}, ${outside.length} from outside`}
        />
        <Figure
          label="Worth a decision"
          value={worries.length}
          tone={
            worries.length === 0
              ? 'text-emerald-400'
              : worries[0]?.tone === 'rose'
                ? 'text-rose-400'
                : 'text-amber-300'
          }
          hint={worries.length === 0 ? 'nothing stands out' : 'listed below, worst first'}
        />
        <Figure
          label="Invitations out"
          value={invites.length}
          tone={invites.length === 0 ? 'text-neutral-500' : 'text-amber-300'}
          hint={invites.length === 0 ? 'nobody is waiting to accept' : 'decided, not yet held'}
        />
        <Figure
          label="Two-factor"
          value={
            Array.isArray(people.withoutTwoFactor)
              ? `${members.length - people.withoutTwoFactor.length}/${members.length}`
              : '—'
          }
          tone={
            !Array.isArray(people.withoutTwoFactor)
              ? 'text-neutral-500'
              : people.withoutTwoFactor.length === 0
                ? 'text-emerald-400'
                : 'text-rose-400'
          }
          hint={org?.twoFactorRequired ? 'required by the organisation' : 'not required — voluntary'}
        />
      </div>

      {/* Both, when a grant across several repositories partly landed. */}
      {failure && <Notice tone="rose">{failure}</Notice>}
      {asked && (
        <Notice tone="amber" icon={Clock}>
          Asked for: {asked}. Nothing has changed at GitHub yet — the deploy carries these out at
          the end of its next tick, about a minute from now. This page is watching for it and will
          show what happened under “Changes asked for” by itself.
        </Notice>
      )}

      <Panel
        title="Worth a decision"
        icon={ShieldAlert}
        action={
          <Pill tone={worries.length === 0 ? 'green' : worries[0].tone}>
            {worries.length === 0 ? 'clear' : worries.length}
          </Pill>
        }
      >
        {worries.length === 0 ? (
          <Empty>
            Nobody holds more than they need, every account has two-factor authentication on, and no
            invitation is sitting unanswered.
          </Empty>
        ) : (
          worries.map((item) => (
            <div
              key={item.title}
              className="px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={item.tone}>{item.tone === 'rose' ? 'act' : 'consider'}</Pill>
                <p className="text-[13px] text-white font-medium">{item.title}</p>
              </div>
              <p className="text-[12px] text-neutral-500 leading-relaxed mt-1">{item.detail}</p>
            </div>
          ))
        )}
      </Panel>

      <Panel
        title="Who can reach what"
        icon={KeyRound}
        action={
          <span className="text-[11px] text-neutral-600">
            {team.length === 1 ? 'one person' : `${team.length} people`} · open a row to change it
          </span>
        }
      >
        <AddSomeone repositories={repositories} busy={busy} onGrant={grant} />
        {team.length === 0 ? (
          <Empty>Nobody has access to any of these repositories, which cannot be right.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#17171d]">
                  <th className="px-4 sm:px-6 py-3 text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-500">
                    Person
                  </th>
                  <th className="px-3 py-3 text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-500">
                    In the org
                  </th>
                  {repositories.map((repo) => (
                    <th
                      key={repo.name}
                      className="px-3 py-3 text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-500 whitespace-nowrap"
                    >
                      {repo.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.map((person) => (
                  <PersonRow
                    key={person.login}
                    person={person}
                    repositories={repositories}
                    actor={actor}
                    busy={busy}
                    open={open === person.login}
                    onToggle={() => setOpen(open === person.login ? null : person.login)}
                    onGrant={grant}
                    onRevoke={revoke}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {invites.length > 0 && (
        <Panel
          title="Waiting to be accepted"
          icon={Mail}
          action={<Pill tone="amber">{invites.length}</Pill>}
        >
          {invites.map((invite) => (
            <div
              key={`${invite.repo}-${invite.id}`}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Avatar src={invite.avatar} />
                <span className="min-w-0">
                  <span className="text-[13px] text-white break-all">
                    {invite.login ?? 'someone'}
                  </span>
                  <span className="block text-[11px] text-neutral-500 mt-0.5">
                    {invite.repo} · {roleLabel(invite.permission)} · sent{' '}
                    {formatAgo(invite.created)}
                    {invite.by ? ` by ${invite.by}` : ''}
                  </span>
                </span>
              </span>
              <div className="flex items-center gap-2">
                {invite.expired && <Pill tone="rose">expired</Pill>}
                <GithubLink href={invite.url} />
                <Button
                  type="button"
                  tone="danger"
                  disabled={busy}
                  onClick={() => uninvite(invite.repo, invite.id, invite.login)}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                  Cancel
                </Button>
              </div>
            </div>
          ))}
        </Panel>
      )}

      {(queued.length > 0 || history.length > 0) && (
        <Panel
          title="Changes asked for"
          icon={Clock}
          action={
            queued.length > 0 ? (
              <Pill tone="amber">{queued.length} waiting</Pill>
            ) : (
              <Pill tone="neutral">all carried out</Pill>
            )
          }
        >
          {queued.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 sm:px-6 py-3 border-b border-[#17171d]"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Pill tone="amber">waiting</Pill>
                <span className="text-[12px] text-neutral-300 break-words">{describe(item)}</span>
              </span>
              <span className="text-[11px] text-neutral-600">
                asked by {item.by} {formatAgo(item.at)}
              </span>
            </div>
          ))}
          {history.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Pill tone={item.ok ? 'green' : 'rose'}>
                  {item.ok ? (item.result ?? 'done') : 'refused'}
                </Pill>
                <span className="text-[12px] text-neutral-300 break-words">{describe(item)}</span>
              </span>
              <span className="text-[11px] text-neutral-600 break-words">
                {item.error ? `${item.error} · ` : ''}
                asked by {item.by} {formatAgo(item.done ?? item.at)}
              </span>
            </div>
          ))}
        </Panel>
      )}

      {org && (
        <Panel
          title="The organisation"
          icon={Building2}
          action={
            <GithubLink
              // Organisation settings do not live under the organisation's own
              // page — GitHub keeps them under /organizations/<name>/.
              href={
                org.login
                  ? `https://github.com/organizations/${org.login}/settings/member_privileges`
                  : null
              }
              title="Change these on GitHub"
            >
              SETTINGS
            </GithubLink>
          }
        >
          <div className="grid gap-x-8 gap-y-3 px-4 sm:px-6 py-4 sm:grid-cols-2">
            {[
              ['Name', org.name ?? org.login, false],
              ['Plan', org.plan ?? '—', false],
              ['Seats used', org.seats ? `${org.seatsFilled ?? '?'} of ${org.seats}` : '—', false],
              ['Private repositories', org.privateRepos ?? '—', false],
              [
                'Everyone in the org gets',
                org.defaultPermission === 'none'
                  ? 'nothing by default'
                  : roleLabel(org.defaultPermission),
                org.defaultPermission !== 'none',
              ],
              ['Two-factor required', org.twoFactorRequired ? 'yes' : 'no', !org.twoFactorRequired],
              [
                'Members may create repositories',
                org.membersCanCreateRepos ? 'yes' : 'no',
                Boolean(org.membersCanCreateRepos),
              ],
              [
                'Members may fork private ones',
                org.membersCanForkPrivate ? 'yes' : 'no',
                Boolean(org.membersCanForkPrivate),
              ],
            ].map(([label, value, loose]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <span className="text-[12px] text-neutral-500">{label}</span>
                <span className={`text-[12px] text-right ${loose ? 'text-amber-300' : 'text-neutral-200'}`}>
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
