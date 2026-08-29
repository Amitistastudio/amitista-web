import React from 'react';
import { Activity, Building2, TriangleAlert, Users } from 'lucide-react';
import { formatAgo } from '../../../lib/admin';
import { Empty, Figure, Panel, Pill, RankedBar, Sparkline } from '../ui';
import { GithubLink, commitByPerson, listOf, pullVerdict, repositoriesIn, short } from './shared';

const DAY = 86400000;
const WINDOW = 14;
const SHOWN = 8;
const PULL_STALE_DAYS = 7;
const ISSUE_STALE_DAYS = 14;

const ageDays = (at) => (at ? Math.floor((Date.now() - Date.parse(at)) / DAY) : null);

// Two people or one? A commit carries a git name and, separately, the GitHub
// account it was matched to. On these repositories one person appears under
// four different git names and a single account, so the account wins wherever
// there is one — counting the names would report a team that does not exist.
const who = (commit) => commit.login || commit.author || 'unknown';

function everything(repositories) {
  return {
    pulls: repositories.flatMap((repo) =>
      listOf(repo, 'pulls').map((pull) => ({ ...pull, repo: repo.name })),
    ),
    issues: repositories.flatMap((repo) =>
      listOf(repo, 'issues').map((issue) => ({ ...issue, repo: repo.name })),
    ),
    commits: repositories
      .flatMap((repo) => listOf(repo, 'commits').map((commit) => ({ ...commit, repo: repo.name })))
      .filter((commit) => commit.at && commitByPerson(commit))
      .sort((a, b) => b.at.localeCompare(a.at)),
    branches: repositories.flatMap((repo) =>
      listOf(repo, 'branches')
        .filter((branch) => !branch.default && (branch.ahead > 0 || branch.behind > 0))
        .map((branch) => ({ ...branch, repo: repo.name })),
    ),
    runs: repositories.flatMap((repo) => listOf(repo, 'runs')),
  };
}

// The point of the section. Everything else here describes; this decides —
// one ranked list of what is actually waiting on somebody, worst first, each
// saying what would clear it. An empty list is the answer worth having.
function attention(repositories, all) {
  const out = [];
  // id, not title, is what React keys on below: two findings can legitimately
  // describe the same repository in the same words once a new rule is added,
  // and a duplicate key silently drops a row instead of failing loudly.
  const add = (rank, tone, title, detail, url) =>
    out.push({ id: out.length, rank, tone, title, detail, url });

  repositories.forEach((repo) => {
    if (!repo.present) {
      add(0, 'rose', `${repo.name} is not on this box`, `There is no checkout at ${repo.path}, so nothing can deploy.`);
      return;
    }
    if (listOf(repo, 'dirty').length > 0) {
      add(
        0,
        'rose',
        `${repo.name} has a dirty checkout`,
        `${listOf(repo, 'dirty').length} tracked file(s) modified. The next commit touching one of them stops its deploys without saying so.`,
      );
    }
    if (repo.ci && !repo.green && repo.synced) {
      add(1, 'rose', `${repo.name} is live on a red commit`, `Its checks did not pass (${repo.ci}).`);
    }
    if (repo.present && !repo.synced) {
      add(
        3,
        'amber',
        `${repo.name} is ${repo.behind} behind main`,
        repo.green ? 'Checks passed, so the next tick deploys it.' : `Waiting on checks (${repo.ci}).`,
      );
    }
  });

  all.pulls.forEach((pull) => {
    const state = pullVerdict(pull);
    const old = ageDays(pull.created);
    if (state.tone === 'rose') {
      add(1, 'rose', `${pull.repo} #${pull.number} cannot merge`, state.detail, pull.url);
    } else if (state.label === 'ready') {
      add(2, 'green', `${pull.repo} #${pull.number} is ready`, 'Nothing is in the way but a decision.', pull.url);
    } else if (old !== null && old >= PULL_STALE_DAYS) {
      add(3, 'amber', `${pull.repo} #${pull.number} has been open ${old} days`, state.detail, pull.url);
    }
  });

  all.issues.forEach((issue) => {
    const old = ageDays(issue.created);
    if (old !== null && old >= ISSUE_STALE_DAYS) {
      add(
        4,
        'amber',
        `${issue.repo} #${issue.number} has been open ${old} days`,
        issue.assignees?.length ? `On ${issue.assignees.join(', ')}.` : 'Nobody is assigned to it.',
        issue.url,
      );
    }
  });

  all.branches.forEach((branch) => {
    if (branch.ahead > 0) {
      add(
        5,
        'amber',
        `${branch.repo}: ${branch.name} has work nowhere else`,
        `${branch.ahead} commit(s) on it and not on the default branch${branch.behind ? `, which has moved ${branch.behind} since` : ''}.`,
      );
    }
  });

  return out.sort((a, b) => a.rank - b.rank);
}

// Commits a day for the last fortnight, from the commits that were read. Says
// so, because the window is however far back those reach rather than a promise
// about all of history.
function cadence(commits) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: WINDOW }, (unused, index) => start.getTime() - (WINDOW - 1 - index) * DAY);
  const counts = days.map(
    (day) => commits.filter((commit) => Date.parse(commit.at) >= day && Date.parse(commit.at) < day + DAY).length,
  );
  return {
    counts,
    labels: days.map((day) =>
      new Date(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    ),
    total: counts.reduce((sum, value) => sum + value, 0),
  };
}

function people(commits) {
  const tally = new Map();
  commits.forEach((commit) => {
    const name = who(commit);
    const held = tally.get(name) ?? { name, commits: 0, repos: new Set(), last: commit.at };
    held.commits += 1;
    held.repos.add(commit.repo);
    if (commit.at > held.last) held.last = commit.at;
    tally.set(name, held);
  });
  return [...tally.values()].sort((a, b) => b.commits - a.commits);
}

export default function Organization({ data }) {
  const [full, setFull] = React.useState(false);
  const repositories = repositoriesIn(data);

  if (repositories.length === 0) {
    return (
      <Panel title="Organisation" icon={Building2}>
        <Empty>Nothing has been gathered yet. This fills in once the deploy has run.</Empty>
      </Panel>
    );
  }

  const all = everything(repositories);
  const todo = attention(repositories, all);
  const beat = cadence(all.commits);
  const team = people(all.commits);

  const settled = all.runs.filter((run) => run.status === 'completed');
  const passed = settled.filter((run) => run.conclusion === 'success').length;
  const rate = settled.length === 0 ? null : Math.round((passed / settled.length) * 100);
  const current = repositories.filter((repo) => repo.synced && listOf(repo, 'dirty').length === 0).length;
  const worst = todo[0]?.tone;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Needs you"
          value={todo.length}
          tone={
            todo.length === 0
              ? 'text-emerald-400'
              : worst === 'rose'
                ? 'text-rose-400'
                : 'text-amber-300'
          }
          hint={todo.length === 0 ? 'nothing is waiting' : 'listed below, worst first'}
        />
        <Figure
          label="Live on this box"
          value={`${current}/${repositories.length}`}
          tone={current === repositories.length ? 'text-emerald-400' : 'text-amber-300'}
          hint="in sync with main and clean"
        />
        <Figure
          label="Checks passing"
          value={rate === null ? '—' : `${rate}%`}
          tone={
            rate === null
              ? 'text-neutral-500'
              : rate === 100
                ? 'text-emerald-400'
                : rate >= 80
                  ? 'text-amber-300'
                  : 'text-rose-400'
          }
          hint={settled.length === 0 ? 'no finished runs' : `${passed} of the last ${settled.length}`}
        />
        <Figure
          label="Commits this fortnight"
          value={beat.total}
          tone={beat.total > 0 ? 'text-white' : 'text-neutral-500'}
          hint={`across ${team.length} ${team.length === 1 ? 'person' : 'people'}`}
        />
      </div>

      <Panel
        title="Needs attention"
        icon={TriangleAlert}
        action={
          <Pill tone={todo.length === 0 ? 'green' : worst === 'rose' ? 'rose' : 'amber'}>
            {todo.length === 0 ? 'clear' : todo.length}
          </Pill>
        }
      >
        {todo.length === 0 ? (
          <Empty>
            Nothing is waiting on anybody. Every repository is in sync and clean, no pull request is
            stuck, and nothing has been left open long enough to worry about.
          </Empty>
        ) : (
          todo.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={item.tone}>{item.tone === 'rose' ? 'blocked' : item.tone === 'green' ? 'decide' : 'soon'}</Pill>
                  <p className="text-[13px] text-white font-medium">{item.title}</p>
                </div>
                <p className="text-[12px] text-neutral-500 leading-relaxed mt-1">{item.detail}</p>
              </div>
              {item.url && <GithubLink href={item.url} />}
            </div>
          ))
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Commits a day" icon={Activity}>
          <div className="px-4 sm:px-6 py-5">
            <Sparkline points={beat.counts} labels={beat.labels} unit="commits" height={56} />
            <p className="text-[11px] text-neutral-600 mt-3">
              Last {WINDOW} days, from the {all.commits.length} commits read across the three
              repositories.
            </p>
          </div>
        </Panel>

        <Panel title="Who has been committing" icon={Users}>
          {team.length === 0 ? (
            <Empty>No commits have been read yet.</Empty>
          ) : (
            team.map((person) => (
              <RankedBar
                key={person.name}
                name={person.name}
                value={person.commits}
                percent={(person.commits / team[0].commits) * 100}
                detail={`${[...person.repos].join(', ')} · last ${formatAgo(person.last)}`}
              />
            ))
          )}
        </Panel>
      </div>

      <Panel
        title="Recent activity"
        icon={Activity}
        action={
          all.commits.length > SHOWN ? (
            <button
              type="button"
              onClick={() => setFull((held) => !held)}
              className="text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-500 hover:text-white transition-colors"
            >
              {full ? 'Show less' : `All ${all.commits.length}`}
            </button>
          ) : null
        }
      >
        {all.commits.length === 0 ? (
          <Empty>No commits have been read yet.</Empty>
        ) : (
          (full ? all.commits : all.commits.slice(0, SHOWN)).map((commit) => (
            <div
              key={`${commit.repo}-${commit.sha}`}
              className="flex items-baseline gap-3 px-4 sm:px-6 py-2 border-b border-[#17171d] last:border-b-0"
            >
              <span className="font-mono text-[11px] text-neutral-600 shrink-0">
                {short(commit.sha)}
              </span>
              <span className="text-[12px] text-neutral-300 truncate flex-1">{commit.subject}</span>
              <span className="text-[11px] text-neutral-600 tabular-nums shrink-0">
                {formatAgo(commit.at)}
              </span>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
