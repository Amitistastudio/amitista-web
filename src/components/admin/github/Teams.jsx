import React from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Info,
  Plus,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import {
  formatAgo,
  queueGithubTeamCreate,
  queueGithubTeamDelete,
  queueGithubTeamMember,
  queueGithubTeamMemberRemove,
  queueGithubTeamRepo,
  queueGithubTeamRepoRemove,
} from '../../../lib/admin';
import { Button, Empty, Figure, Notice, Panel, Pill, Select, TextInput } from '../ui';
import { GithubLink, REPO_ROLES, role, roleApi, roleGist, roleLabel, roleTone } from './shared';

const WATCH_MS = 15000;

const teamsIn = (data) => {
  const people = data?.people;
  const teams = people && typeof people === 'object' ? people.teams : null;
  return Array.isArray(teams) ? teams : [];
};

const listOfIn = (row, key) => (Array.isArray(row?.[key]) ? row[key] : []);

const listSentence = (parts) =>
  parts.length <= 1
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

function Avatar({ src }) {
  return src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="h-6 w-6 rounded-full border border-[#282832] shrink-0"
    />
  ) : (
    <span className="h-6 w-6 rounded-full border border-[#282832] bg-[#111115] shrink-0" />
  );
}

function LevelPicker({ value, disabled, onChange, label }) {
  return (
    // Select paints its own class list and spreads props after it, so passing
    // className would replace the styling rather than add to it.
    <span className="inline-block w-28">
      <Select value={value} disabled={disabled} aria-label={label} onChange={onChange}>
        {REPO_ROLES.map((level) => (
          <option key={level.api} value={level.api}>
            {level.label}
          </option>
        ))}
      </Select>
    </span>
  );
}

// A destructive button that asks once. Not a dialog: the question is small and
// the answer is a second click on the same spot, which is hard to do by
// accident and easy to abandon.
function Confirm({ children, question, busy, onConfirm }) {
  const [armed, setArmed] = React.useState(false);

  React.useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!armed) {
    return (
      <Button type="button" tone="danger" disabled={busy} onClick={() => setArmed(true)}>
        {children}
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[11px] text-rose-300">{question}</span>
      <Button
        type="button"
        tone="danger"
        disabled={busy}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        Yes
      </Button>
      <Button type="button" disabled={busy} onClick={() => setArmed(false)}>
        No
      </Button>
    </span>
  );
}

// What one team can reach, one row per repository — including the ones it
// cannot, because giving a team a repository is the whole point and hiding the
// control until it already has one would be backwards.
function TeamRepo({ team, repo, held, busy, onSet, onUnset }) {
  const current = held ? roleApi(held.permission) : null;
  const [wanted, setWanted] = React.useState(current ?? 'pull');

  React.useEffect(() => {
    setWanted(current ?? 'pull');
  }, [current]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 border-b border-[#17171d] last:border-b-0">
      <div className="min-w-0">
        <p className="text-[12px] text-neutral-200 font-mono break-all">{repo.name}</p>
        <p className="text-[11px] text-neutral-500 mt-0.5">
          {held ? (
            <>
              <span className="text-neutral-300">{roleLabel(held.permission)}</span>
              {role(held.permission) ? ` — ${roleGist(role(held.permission))}` : ''}
            </>
          ) : (
            'this team cannot reach it'
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <LevelPicker
          value={wanted}
          disabled={busy}
          label={`What ${team.name} can do on ${repo.name}`}
          onChange={(event) => setWanted(event.target.value)}
        />
        <Button
          type="button"
          disabled={busy || (held && wanted === current)}
          onClick={() => onSet(team.slug, repo.name, wanted)}
        >
          {held ? (
            <>
              <Check className="h-3.5 w-3.5" strokeWidth={2} />
              Change
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Give it
            </>
          )}
        </Button>
        {held && (
          <Button
            type="button"
            tone="danger"
            disabled={busy}
            onClick={() => onUnset(team.slug, repo.name)}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
            Take away
          </Button>
        )}
      </div>
    </div>
  );
}

function AddMember({ team, busy, onAdd }) {
  const [login, setLogin] = React.useState('');
  const [role_, setRole] = React.useState('member');

  const submit = (event) => {
    event.preventDefault();
    const who = login.trim();
    if (!who) return;
    onAdd(team.slug, who, role_);
    setLogin('');
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 pt-3">
      <div className="flex-1 min-w-[10rem]">
        <TextInput
          value={login}
          autoComplete="off"
          spellCheck={false}
          placeholder="GitHub username"
          disabled={busy}
          onChange={(event) => setLogin(event.target.value)}
        />
      </div>
      <span className="inline-block w-36">
        <Select
          value={role_}
          disabled={busy}
          aria-label={`Role in ${team.name}`}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="member">member</option>
          <option value="maintainer">maintainer</option>
        </Select>
      </span>
      <Button type="submit" disabled={busy || !login.trim()}>
        <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
        Add
      </Button>
    </form>
  );
}

function Team({ team, repositories, actor, busy, open, onToggle, actions }) {
  const reaches = new Map(listOfIn(team, 'repos').map((entry) => [entry.name, entry]));
  const members = listOfIn(team, 'members');
  const summary =
    reaches.size === 0
      ? 'reaches nothing yet'
      : listSentence(
          [...reaches.values()].map((entry) => `${roleLabel(entry.permission)} on ${entry.name}`),
        );

  return (
    <div className="border-b border-[#17171d] last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
        className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 sm:px-6 py-3 cursor-pointer hover:bg-[#101014] focus-visible:bg-[#101014] outline-none transition-colors"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-neutral-500 shrink-0 mt-1" strokeWidth={2} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-neutral-600 shrink-0 mt-1" strokeWidth={2} />
          )}
          <div className="min-w-0">
            <p className="text-[13px] text-white font-medium break-words">{team.name}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {members.length === 1 ? '1 person' : `${members.length} people`} · {summary}
            </p>
            {team.description && (
              <p className="text-[11px] text-neutral-600 mt-1 break-words">{team.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {members.slice(0, 4).map((person) => (
            <Avatar key={person.login} src={person.avatar} />
          ))}
          {members.length > 4 && (
            <span className="text-[11px] text-neutral-600">+{members.length - 4}</span>
          )}
          <GithubLink href={team.url} title={`Open ${team.name} on GitHub`} />
        </div>
      </div>

      {open && (
        <div className="px-4 sm:px-6 pb-4 bg-[#0b0b0e] space-y-5">
          <div>
            <p className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase pt-4 pb-1">
              What this team can reach
            </p>
            {repositories.map((repo) => (
              <TeamRepo
                key={repo.name}
                team={team}
                repo={repo}
                held={reaches.get(repo.name)}
                busy={busy}
                onSet={actions.setRepo}
                onUnset={actions.unsetRepo}
              />
            ))}
          </div>

          <div>
            <p className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase pb-1">
              Who is in it
            </p>
            {members.length === 0 ? (
              <p className="text-[12px] text-neutral-500 py-2">
                Nobody yet, so this team gives nobody anything.
              </p>
            ) : (
              members.map((person) => {
                const self = actor && person.login.toLowerCase() === actor.toLowerCase();
                return (
                  <div
                    key={person.login}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 border-b border-[#17171d] last:border-b-0"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={person.avatar} />
                      <a
                        href={person.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[12px] text-white hover:underline break-all"
                      >
                        {person.login}
                      </a>
                    </span>
                    {self ? (
                      <span className="text-[11px] text-neutral-600">
                        the account this box deploys with
                      </span>
                    ) : (
                      <Button
                        type="button"
                        tone="danger"
                        disabled={busy}
                        onClick={() => actions.removeMember(team.slug, person.login)}
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2} />
                        Take out
                      </Button>
                    )}
                  </div>
                );
              })
            )}
            <AddMember team={team} busy={busy} onAdd={actions.addMember} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-neutral-600 max-w-lg leading-relaxed">
              Deleting a team takes its access away from everyone in it at once. Anything they hold
              in their own right stays.
            </p>
            <Confirm
              busy={busy}
              question={`Delete ${team.name}?`}
              onConfirm={() => actions.remove(team.slug)}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Delete team
            </Confirm>
          </div>
        </div>
      )}
    </div>
  );
}

function NewTeam({ busy, onCreate }) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');

  const submit = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), description.trim());
    setName('');
    setDescription('');
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 px-4 sm:px-6 py-4">
      <div className="flex-1 min-w-[10rem]">
        <label
          className="block text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-2"
          htmlFor="github-team-name"
        >
          Name
        </label>
        <TextInput
          id="github-team-name"
          value={name}
          autoComplete="off"
          placeholder="Designers"
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="flex-[2] min-w-[12rem]">
        <label
          className="block text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-2"
          htmlFor="github-team-desc"
        >
          What it is for
        </label>
        <TextInput
          id="github-team-desc"
          value={description}
          autoComplete="off"
          placeholder="optional"
          disabled={busy}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <Button type="submit" tone="solid" disabled={busy || !name.trim()}>
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Create
      </Button>
    </form>
  );
}

export default function Teams({ data, onRefresh }) {
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState(null);
  const [asked, setAsked] = React.useState(null);
  const [open, setOpen] = React.useState(null);

  const repositories = Array.isArray(data?.repositories) ? data.repositories : [];
  const teams = teamsIn(data);
  const actor = data?.people?.actor ?? null;
  const queued = Array.isArray(data?.queued) ? data.queued : [];
  const pending = queued.filter((item) => (item.action ?? '').startsWith('team-'));

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

  const actions = {
    create: (name, description) =>
      ask(`create the team ${name}`, () => queueGithubTeamCreate(name, description)),
    remove: (team) => ask(`delete the team ${team}`, () => queueGithubTeamDelete(team)),
    setRepo: (team, repo, permission) =>
      ask(`${team} · ${roleLabel(permission)} on ${repo}`, () =>
        queueGithubTeamRepo(team, repo, permission),
      ),
    unsetRepo: (team, repo) =>
      ask(`take ${repo} away from ${team}`, () => queueGithubTeamRepoRemove(team, repo)),
    addMember: (team, login, memberRole) =>
      ask(`add ${login} to ${team}`, () => queueGithubTeamMember(team, login, memberRole)),
    removeMember: (team, login) =>
      ask(`take ${login} out of ${team}`, () => queueGithubTeamMemberRemove(team, login)),
  };

  const reachable = teams.reduce((sum, team) => sum + listOfIn(team, 'repos').length, 0);
  const inATeam = new Set(
    teams.flatMap((team) => listOfIn(team, 'members').map((person) => person.login)),
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <Figure
          label="Teams"
          value={teams.length}
          tone={teams.length === 0 ? 'text-neutral-500' : 'text-white'}
          hint={teams.length === 0 ? 'none yet' : 'each one a named bundle of access'}
        />
        <Figure
          label="People in a team"
          value={inATeam.size}
          hint="their access follows the team"
        />
        <Figure
          label="Repository grants"
          value={reachable}
          hint={`across ${repositories.length} repositories`}
        />
      </div>

      {failure && <Notice tone="rose">{failure}</Notice>}
      {asked && (
        <Notice tone="amber" icon={Clock}>
          Asked for: {asked}. The deploy carries it out at the end of its next tick, about a minute
          from now, and this page is watching for it.
        </Notice>
      )}

      <Notice tone="neutral" icon={Info}>
        A team is the nearest thing to a role of your own that this plan allows. GitHub&apos;s own
        custom repository roles need the Team or Enterprise plan and are not available to this
        organisation — but a team can hold a different one of the five levels on each repository and
        be handed to somebody in one move, which is most of what a custom role is wanted for. What a
        team cannot do is invent a sixth level.
      </Notice>

      <Panel
        title="Teams"
        icon={UsersRound}
        action={teams.length > 0 ? <Pill tone="neutral">{teams.length}</Pill> : null}
      >
        <NewTeam busy={busy} onCreate={actions.create} />
        {teams.length === 0 ? (
          <Empty>
            No teams yet. Make one for a group of people who should all have the same access —
            contractors, designers, whoever — and from then on you change the team rather than
            everybody in it.
          </Empty>
        ) : (
          teams.map((team) => (
            <Team
              key={team.slug}
              team={team}
              repositories={repositories}
              actor={actor}
              busy={busy}
              open={open === team.slug}
              onToggle={() => setOpen(open === team.slug ? null : team.slug)}
              actions={actions}
            />
          ))
        )}
      </Panel>

      {pending.length > 0 && (
        <Panel title="Waiting to be carried out" icon={Clock}>
          {pending.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <span className="text-[12px] text-neutral-300">
                {item.action.replace('team-', '').replace('-', ' ')} ·{' '}
                {item.name ?? item.team}
                {item.repo ? ` · ${item.repo}` : ''}
                {item.login ? ` · ${item.login}` : ''}
                {item.permission ? ` · ${roleLabel(item.permission)}` : ''}
              </span>
              <span className="text-[11px] text-neutral-600">
                asked by {item.by} {formatAgo(item.at)}
              </span>
            </div>
          ))}
        </Panel>
      )}

      {teams.length > 0 && (
        <Panel title="What each level means here" icon={Info}>
          <div className="px-4 sm:px-6 py-4 space-y-2">
            {REPO_ROLES.map((level) => (
              <div key={level.api} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="w-20 shrink-0 text-[12px] font-semibold text-neutral-200">
                  {level.label}
                </span>
                <Pill tone={roleTone(level)}>{roleGist(level)}</Pill>
                <span className="text-[12px] text-neutral-500 flex-1 min-w-[14rem]">
                  {level.blurb}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
