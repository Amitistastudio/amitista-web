import React from 'react';
import { Activity, Building2 } from 'lucide-react';
import { formatAgo } from '../../../lib/admin';
import { Empty, Figure, Notice, Panel, Pill } from '../ui';
import { GithubLink, listOf, repositoriesIn, short } from './shared';

const isFailure = (run) =>
  run.status === 'completed' && (run.conclusion === 'failure' || run.conclusion === 'timed_out');

const isPass = (run) => run.status === 'completed' && run.conclusion === 'success';

// Everything here is counted from what the deploy already gathered for the
// other sections. Nothing is asked of GitHub on this account, which is the
// point: a health view that itself costs something is a health view people
// turn off.
function health(repositories) {
  const runs = repositories.flatMap((repo) => listOf(repo, 'runs'));
  const settled = runs.filter((run) => run.status === 'completed');
  const passed = settled.filter(isPass).length;

  return {
    repositories: repositories.length,
    deployed: repositories.filter((repo) => repo.synced && listOf(repo, 'dirty').length === 0)
      .length,
    dirty: repositories.filter((repo) => listOf(repo, 'dirty').length > 0),
    behind: repositories.filter((repo) => repo.present && !repo.synced),
    absent: repositories.filter((repo) => !repo.present),
    red: repositories.filter((repo) => repo.present && repo.ci && !repo.green),
    settled: settled.length,
    passed,
    rate: settled.length === 0 ? null : Math.round((passed / settled.length) * 100),
    failures: runs.filter(isFailure).length,
    issues: repositories.reduce((sum, repo) => sum + listOf(repo, 'issues').length, 0),
    pulls: repositories.reduce((sum, repo) => sum + listOf(repo, 'pulls').length, 0),
    adrift: repositories.flatMap((repo) =>
      listOf(repo, 'branches').filter(
        (branch) => !branch.default && (branch.ahead > 0 || branch.behind > 0),
      ),
    ).length,
  };
}

// Newest first, across every repository at once — which is the only view that
// answers "what has been happening" rather than "what happened in this one".
function timeline(repositories) {
  return repositories
    .flatMap((repo) => listOf(repo, 'commits').map((commit) => ({ ...commit, repo: repo.name })))
    .filter((commit) => commit.at)
    .sort((a, b) => b.at.localeCompare(a.at));
}

function Wrong({ facts }) {
  const notes = [];
  if (facts.absent.length > 0) {
    notes.push(`${facts.absent.map((repo) => repo.name).join(', ')} has no checkout on this box.`);
  }
  if (facts.dirty.length > 0) {
    notes.push(
      `${facts.dirty.map((repo) => repo.name).join(', ')} has modified files in its checkout — the next commit touching one of them will stop its deploys silently.`,
    );
  }
  if (facts.red.length > 0) {
    notes.push(
      `${facts.red.map((repo) => repo.name).join(', ')} is on a commit CI did not pass.`,
    );
  }
  if (notes.length === 0) return null;
  return (
    <Notice tone="rose">
      {notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
    </Notice>
  );
}

export default function Organization({ data }) {
  const repositories = repositoriesIn(data);
  const facts = health(repositories);
  const commits = timeline(repositories);

  if (repositories.length === 0) {
    return (
      <Panel title="Organisation" icon={Building2}>
        <Empty>Nothing has been gathered yet. This fills in once the deploy has run.</Empty>
      </Panel>
    );
  }

  const green = facts.deployed === facts.repositories;

  return (
    <div className="space-y-6">
      <Wrong facts={facts} />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Live on this box"
          value={`${facts.deployed}/${facts.repositories}`}
          tone={green ? 'text-emerald-400' : 'text-amber-300'}
          hint={
            green
              ? 'in sync with main and clean'
              : `${facts.behind.length} behind, ${facts.dirty.length} dirty`
          }
        />
        <Figure
          label="Checks passing"
          value={facts.rate === null ? '—' : `${facts.rate}%`}
          tone={
            facts.rate === null
              ? 'text-neutral-500'
              : facts.rate === 100
                ? 'text-emerald-400'
                : facts.rate >= 80
                  ? 'text-amber-300'
                  : 'text-rose-400'
          }
          hint={
            facts.settled === 0
              ? 'no finished runs recorded'
              : `${facts.passed} of the last ${facts.settled} runs`
          }
        />
        <Figure
          label="Open"
          value={facts.issues + facts.pulls}
          tone={facts.issues + facts.pulls > 0 ? 'text-white' : 'text-neutral-500'}
          hint={`${facts.issues} issue${facts.issues === 1 ? '' : 's'}, ${facts.pulls} pull request${facts.pulls === 1 ? '' : 's'}`}
        />
        <Figure
          label="Branches adrift"
          value={facts.adrift}
          tone={facts.adrift > 0 ? 'text-amber-300' : 'text-neutral-500'}
          hint={facts.adrift === 0 ? 'nothing but the default branches' : 'not level with the default'}
        />
      </div>

      <Panel
        title="Each repository"
        icon={Building2}
        action={
          <Pill tone={green ? 'green' : 'amber'}>{green ? 'all current' : 'needs a look'}</Pill>
        }
      >
        {repositories.map((repo) => {
          const runs = listOf(repo, 'runs');
          const bad = runs.filter(isFailure).length;
          const head = repo.head ?? {};
          return (
            <div
              key={repo.name}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-[13px] text-white font-medium">{repo.name}</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  {head.committed ? `last commit ${formatAgo(head.committed)}` : 'no commits read'}
                  {runs.length > 0
                    ? ` · ${bad === 0 ? `last ${runs.length} runs passed` : `${bad} of last ${runs.length} runs failed`}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {listOf(repo, 'dirty').length > 0 && <Pill tone="rose">dirty</Pill>}
                {repo.present && !repo.synced && <Pill tone="amber">{repo.behind} behind</Pill>}
                {repo.present && repo.synced && listOf(repo, 'dirty').length === 0 && (
                  <Pill tone="green">current</Pill>
                )}
                {!repo.present && <Pill tone="rose">missing</Pill>}
              </div>
            </div>
          );
        })}
      </Panel>

      <Panel
        title="Recent activity"
        icon={Activity}
        action={<Pill tone="neutral">{commits.length}</Pill>}
      >
        {commits.length === 0 ? (
          <Empty>No commits have been read yet.</Empty>
        ) : (
          commits.map((commit) => (
            <div
              key={`${commit.repo}-${commit.sha}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 sm:px-6 py-2.5 border-b border-[#17171d] last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-neutral-300 truncate">{commit.subject}</p>
                <p className="text-[11px] text-neutral-600 mt-0.5">
                  <span className="font-mono">{short(commit.sha)}</span> · {commit.repo} ·{' '}
                  {commit.author ?? commit.login ?? 'unknown'}
                </p>
              </div>
              <span className="text-[11px] text-neutral-600 tabular-nums shrink-0">
                {formatAgo(commit.at)}
              </span>
              <GithubLink href={commit.url} title="Open this commit on GitHub" />
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
