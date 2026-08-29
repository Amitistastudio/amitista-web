import React from 'react';
import {
  Building2,
  Check,
  Clock,
  KeyRound,
  Mail,
  ShieldAlert,
  Table2,
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

const ageDays = (at) => (at ? Math.floor((Date.now() - Date.parse(at)) / DAY) : null);

const peopleIn = (data) => (data?.people && typeof data.people === 'object' ? data.people : {});

// Everyone who can reach anything, and what they hold on each repository.
//
// Built from the per-repository lists rather than from the member list, because
// they answer different questions and the difference is the point: an outside
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

  return [...rows.values()].sort((a, b) => {
    const mine = Math.max(-1, ...Object.values(a.holds).map((h) => roleRank(h.role)));
    const theirs = Math.max(-1, ...Object.values(b.holds).map((h) => roleRank(h.role)));
    if (mine !== theirs) return theirs - mine;
    return a.login.localeCompare(b.login);
  });
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
      `${weak.join(', ')} ${weak.length === 1 ? 'has' : 'have'} no two-factor authentication`,
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
        `${person.login} has admin on ${admin.map(([name]) => name).join(', ')} without being an owner`,
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

function Person({ login, avatar, url, children }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {avatar ? (
        <img
          src={avatar}
          alt=""
          loading="lazy"
          className="h-6 w-6 rounded-full border border-[#282832] shrink-0"
        />
      ) : (
        <span className="h-6 w-6 rounded-full border border-[#282832] bg-[#111115] shrink-0" />
      )}
      <span className="min-w-0">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[13px] text-white hover:underline break-all"
          >
            {login}
          </a>
        ) : (
          <span className="text-[13px] text-white break-all">{login}</span>
        )}
        {children}
      </span>
    </span>
  );
}

// One person's access to one repository. The permission select and the remove
// button are only offered where they would work — access that comes from being
// an owner cannot be taken away here, and saying so is more use than a control
// that fails.
function AccessRow({ repo, entry, actor, busy, onGrant, onRevoke }) {
  const [wanted, setWanted] = React.useState(roleApi(entry.role) ?? 'pull');
  const current = roleApi(entry.role);
  const self = actor && entry.login.toLowerCase() === actor.toLowerCase();

  React.useEffect(() => {
    setWanted(roleApi(entry.role) ?? 'pull');
  }, [entry.role]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0">
      <Person login={entry.login} avatar={entry.avatar} url={entry.url}>
        <span className="block text-[11px] text-neutral-500 mt-0.5">
          {entry.direct ? 'added to this repository' : 'through the organisation'}
          {self ? ' · the account this box deploys with' : ''}
        </span>
      </Person>

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={entry.role === 'admin' ? 'rose' : entry.role === 'read' ? 'neutral' : 'amber'}>
          {roleLabel(entry.role)}
        </Pill>

        {entry.direct && !self ? (
          <>
            {/* Select paints its own class list and spreads props after it, so
                passing className would replace the styling rather than add to
                it. The width belongs on a wrapper. */}
            <span className="w-28 inline-block">
              <Select
                value={wanted}
                disabled={busy}
                aria-label={`Permission for ${entry.login} on ${repo}`}
                onChange={(event) => setWanted(event.target.value)}
              >
                {REPO_ROLES.map((level) => (
                  <option key={level.api} value={level.api}>
                    {level.label}
                  </option>
                ))}
              </Select>
            </span>
            <Button
              type="button"
              disabled={busy || wanted === current}
              onClick={() => onGrant(repo, entry.login, wanted)}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2} />
              Change
            </Button>
            <Button
              type="button"
              tone="danger"
              disabled={busy}
              onClick={() => onRevoke(repo, entry.login)}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
              Remove
            </Button>
          </>
        ) : (
          <span className="text-[11px] text-neutral-600 max-w-[22rem]">
            {self
              ? 'Not changeable from here — this is the token the deploy uses, and taking its access away would stop the deploy that could put it back.'
              : 'Not changeable from here — it comes from their organisation role, which is set on GitHub.'}
          </span>
        )}
      </div>
    </div>
  );
}

function AddSomeone({ repo, busy, onGrant }) {
  const [login, setLogin] = React.useState('');
  const [permission, setPermission] = React.useState('pull');

  const submit = (event) => {
    event.preventDefault();
    const wanted = login.trim();
    if (!wanted) return;
    onGrant(repo, wanted, permission);
    setLogin('');
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 px-4 sm:px-6 py-4 border-b border-[#17171d]"
    >
      <div className="flex-1 min-w-[12rem]">
        <label
          className="block text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-2"
          htmlFor={`add-${repo}`}
        >
          GitHub username
        </label>
        <TextInput
          id={`add-${repo}`}
          value={login}
          autoComplete="off"
          spellCheck={false}
          placeholder="octocat"
          disabled={busy}
          onChange={(event) => setLogin(event.target.value)}
        />
      </div>
      <div className="min-w-[9rem]">
        <label
          className="block text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-2"
          htmlFor={`level-${repo}`}
        >
          Can
        </label>
        <Select
          id={`level-${repo}`}
          value={permission}
          disabled={busy}
          onChange={(event) => setPermission(event.target.value)}
        >
          {REPO_ROLES.map((level) => (
            <option key={level.api} value={level.api}>
              {level.label}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" tone="solid" disabled={busy || !login.trim()}>
        <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
        Invite
      </Button>
      <p className="w-full text-[11px] text-neutral-600 leading-relaxed">
        {REPO_ROLES.find((level) => level.api === permission)?.blurb} They get an invitation and the
        access begins when they accept it.
      </p>
    </form>
  );
}

export default function People({ data }) {
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState(null);
  const [asked, setAsked] = React.useState(null);

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

  const grant = (repo, login, permission) =>
    ask(`${login} on ${repo} · ${roleLabel(permission)}`, () =>
      queueGithubAccess(repo, login, permission),
    );
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

  const owners = team.filter((person) => person.member === 'owner').length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Can reach the code"
          value={team.length}
          hint={`${owners} owner${owners === 1 ? '' : 's'}, ${outside.length} from outside`}
        />
        <Figure
          label="Needs a decision"
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
          hint={invites.length === 0 ? 'nobody is waiting to accept' : 'access decided, not yet held'}
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

      {failure && <Notice tone="rose">{failure}</Notice>}
      {asked && !failure && (
        <Notice tone="amber" icon={Clock}>
          Asked for: {asked}. Nothing has changed at GitHub yet — the deploy carries these out at
          the end of its next tick, about a minute from now, and what happened appears at the
          bottom of this page.
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
            <div key={item.title} className="px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={item.tone}>{item.tone === 'rose' ? 'act' : 'consider'}</Pill>
                <p className="text-[13px] text-white font-medium">{item.title}</p>
              </div>
              <p className="text-[12px] text-neutral-500 leading-relaxed mt-1">{item.detail}</p>
            </div>
          ))
        )}
      </Panel>

      <Panel title="Who can reach what" icon={Table2}>
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
                  <tr key={person.login} className="border-b border-[#17171d] last:border-b-0">
                    <td className="px-4 sm:px-6 py-3">
                      <Person login={person.login} avatar={person.avatar} url={person.url} />
                    </td>
                    <td className="px-3 py-3">
                      {person.member ? (
                        <Pill tone={person.member === 'owner' ? 'purple' : 'neutral'}>
                          {person.member}
                        </Pill>
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
              <Person login={invite.login ?? 'someone'} avatar={invite.avatar}>
                <span className="block text-[11px] text-neutral-500 mt-0.5">
                  {invite.repo} · {roleLabel(invite.permission)} · sent {formatAgo(invite.created)}
                  {invite.by ? ` by ${invite.by}` : ''}
                </span>
              </Person>
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

      {repositories.map((repo) => (
        <Panel
          key={repo.name}
          title={repo.name}
          icon={KeyRound}
          action={<Pill tone="neutral">{listOf(repo, 'access').length}</Pill>}
        >
          <AddSomeone repo={repo.name} busy={busy} onGrant={grant} />
          {listOf(repo, 'access').length === 0 ? (
            <Empty>Nobody has access to this repository, which cannot be right.</Empty>
          ) : (
            listOf(repo, 'access').map((entry) => (
              <AccessRow
                key={entry.login}
                repo={repo.name}
                entry={entry}
                actor={actor}
                busy={busy}
                onGrant={grant}
                onRevoke={revoke}
              />
            ))
          )}
        </Panel>
      ))}

      {org && (
        <Panel title="The organisation" icon={Building2}>
          <div className="grid gap-x-6 gap-y-3 px-4 sm:px-6 py-4 sm:grid-cols-2">
            {[
              ['Name', org.name ?? org.login],
              ['Plan', org.plan ?? '—'],
              ['Seats used', org.seats ? `${org.seatsFilled ?? '?'} of ${org.seats}` : '—'],
              ['Private repositories', org.privateRepos ?? '—'],
              [
                'Everyone in the org gets',
                org.defaultPermission === 'none' ? 'nothing by default' : roleLabel(org.defaultPermission),
              ],
              ['Two-factor required', org.twoFactorRequired ? 'yes' : 'no'],
              ['Members may create repositories', org.membersCanCreateRepos ? 'yes' : 'no'],
              ['Members may fork private ones', org.membersCanForkPrivate ? 'yes' : 'no'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <span className="text-[12px] text-neutral-500">{label}</span>
                <span className="text-[12px] text-neutral-200 text-right">{String(value)}</span>
              </div>
            ))}
          </div>
          <div className="px-4 sm:px-6 pb-4">
            {/* Organisation settings do not live under the organisation's own
                page — GitHub keeps them under /organizations/<name>/. */}
            <GithubLink
              href={
                org.login
                  ? `https://github.com/organizations/${org.login}/settings/member_privileges`
                  : null
              }
              title="Change these on GitHub"
            >
              SETTINGS
            </GithubLink>
          </div>
        </Panel>
      )}

      {(queued.length > 0 || history.length > 0) && (
        <Panel
          title="Changes asked for"
          icon={Clock}
          action={queued.length > 0 ? <Pill tone="amber">{queued.length} waiting</Pill> : null}
        >
          {queued.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 sm:px-6 py-3 border-b border-[#17171d]"
            >
              <span className="text-[12px] text-neutral-300">
                {describe(item)}
              </span>
              <span className="text-[11px] text-neutral-600">
                asked by {item.by} {formatAgo(item.at)} · not carried out yet
              </span>
            </div>
          ))}
          {history.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Pill tone={item.ok ? 'green' : 'rose'}>{item.ok ? (item.result ?? 'done') : 'refused'}</Pill>
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
    </div>
  );
}

function describe(item) {
  if (item.action === 'revoke') return `Remove ${item.login} from ${item.repo}`;
  if (item.action === 'uninvite') return `Cancel an invitation on ${item.repo}`;
  return `${item.login} on ${item.repo} · ${roleLabel(item.permission)}`;
}
