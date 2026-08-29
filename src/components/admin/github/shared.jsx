import React from 'react';
import { ExternalLink } from 'lucide-react';

export const short = (sha) => (typeof sha === 'string' ? sha.slice(0, 7) : '—');

export const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// A workflow run reports two things — whether it has finished, and what it
// concluded — and both matter. A run still going is not a pass, and a run that
// was cancelled is not a failure. Everything here keeps them apart.
export function runTone(run) {
  if (run.status !== 'completed') return 'amber';
  if (run.conclusion === 'success') return 'green';
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out') return 'rose';
  return 'neutral';
}

export function runLabel(run) {
  if (run.status !== 'completed') return run.status?.replace(/_/g, ' ') ?? 'running';
  return run.conclusion?.replace(/_/g, ' ') ?? 'unknown';
}

export const isFailure = (run) =>
  run.status === 'completed' && (run.conclusion === 'failure' || run.conclusion === 'timed_out');

export function duration(seconds) {
  if (typeof seconds !== 'number') return '—';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

export function GithubLink({ href, children = 'OPEN', title }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title ?? 'Open on GitHub in a new tab'}
      className="inline-flex items-center gap-1.5 border border-[#282832] bg-[#0a0a0d] px-3 py-2 text-[11px] font-semibold tracking-[0.14em] text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors shrink-0"
    >
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
      {children}
    </a>
  );
}

// Every section is a view over the same snapshot, so they all need the same
// "which repositories are there" walk.
export const repositoriesIn = (data) =>
  Array.isArray(data?.repositories) ? data.repositories : [];

export const listOf = (repo, key) => (Array.isArray(repo?.[key]) ? repo[key] : []);

export const openPulls = (data) =>
  repositoriesIn(data).flatMap((repo) =>
    listOf(repo, 'pulls').map((pull) => ({ ...pull, repo: repo.name })),
  );

export const allRuns = (data) =>
  repositoriesIn(data).flatMap((repo) =>
    listOf(repo, 'runs').map((run) => ({ ...run, repo: repo.name })),
  );

// The default branch is not drift, and neither is a branch that is level with
// it. Anything else is a branch someone started and did not finish.
export const driftedBranches = (data) =>
  repositoriesIn(data).flatMap((repo) =>
    listOf(repo, 'branches')
      .filter((branch) => !branch.default && (branch.ahead > 0 || branch.behind > 0))
      .map((branch) => ({ ...branch, repo: repo.name })),
  );
