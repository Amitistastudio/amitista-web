import React from 'react';
import { FolderGit2 } from 'lucide-react';
import { formatAgo } from '../../../lib/admin';
import { Empty, Panel, Pill, Row } from '../ui';
import { GithubLink, count, listOf, short } from './shared';

// The one question this view answers: is what is on GitHub actually running on
// this box, and if not, what is holding it up? Every branch below ends in a
// plain sentence saying so, because "behind by 2" on its own does not tell you
// whether to wait or to go and fix something.
function verdict(repo) {
  if (!repo.present) {
    return {
      tone: 'rose',
      label: 'missing',
      detail: `There is no checkout at ${repo.path}, so nothing here can deploy.`,
    };
  }

  const dirty = Array.isArray(repo.dirty) ? repo.dirty : [];
  if (dirty.length) {
    return {
      tone: 'rose',
      label: 'blocked',
      detail:
        'Tracked files have been modified in the checkout. The next commit touching any of them ' +
        'will abort the fast-forward, and deploys will stop without saying so.',
    };
  }

  if (repo.ahead > 0) {
    return {
      tone: 'amber',
      label: 'unpushed',
      detail: `${count(repo.ahead, 'commit is', 'commits are')} on this box but not on GitHub.`,
    };
  }

  if (repo.synced) {
    if (repo.green) {
      return {
        tone: 'green',
        label: 'up to date',
        detail: `The checkout is on the same commit as ${repo.branch}, and CI passed for it.`,
      };
    }
    if (repo.ci === 'unknown') {
      return {
        tone: 'amber',
        label: 'up to date',
        detail: 'On the latest commit. GitHub could not be reached, so the CI verdict is unknown.',
      };
    }
    return {
      tone: 'amber',
      label: 'up to date',
      detail: `On the latest commit, but CI did not pass for it (${repo.ci}). It went live anyway, which only happens on a forced deploy.`,
    };
  }

  const waiting = count(repo.behind, 'commit', 'commits');
  if (repo.green) {
    return {
      tone: 'amber',
      label: 'deploying',
      detail: `${waiting} on ${repo.branch} that this box has not taken yet. CI is green, so the next deploy tick will pick them up — about a minute.`,
    };
  }
  if (repo.ci === 'none') {
    return {
      tone: 'amber',
      label: 'no ci run',
      detail: `${waiting} waiting, but GitHub has recorded no workflow run for the newest one. Nothing deploys until a run passes.`,
    };
  }
  if (repo.ci === 'unknown') {
    return {
      tone: 'amber',
      label: 'ci unknown',
      detail: `${waiting} waiting. GitHub could not be reached for a verdict, so the deploy is holding.`,
    };
  }
  if ((repo.ci || '').startsWith('completed/')) {
    return {
      tone: 'rose',
      label: 'ci failed',
      detail: `${waiting} waiting, and CI did not pass for the newest one (${repo.ci}). Nothing will deploy until that is fixed.`,
    };
  }
  return {
    tone: 'neutral',
    label: 'waiting on ci',
    detail: `${waiting} waiting while CI runs (${repo.ci}). The deploy holds until it passes.`,
  };
}

function Repository({ repo }) {
  const state = verdict(repo);
  const dirty = listOf(repo, 'dirty');
  const head = repo.head ?? {};
  const tip = repo.tip ?? {};
  const facts = repo.facts ?? {};
  const pulls = listOf(repo, 'pulls').length;
  const others = listOf(repo, 'branches').filter((branch) => !branch.default).length;

  return (
    <Panel
      title={repo.name}
      icon={FolderGit2}
      action={
        <span className="flex items-center gap-3">
          <Pill tone={state.tone}>{state.label}</Pill>
          <GithubLink href={facts.url} />
        </span>
      }
    >
      <p className="px-4 sm:px-6 py-4 text-[13px] text-neutral-400 font-normal leading-relaxed border-b border-[#17171d]">
        {state.detail}
      </p>

      {facts.description && (
        <p className="px-4 sm:px-6 py-3 text-[12px] text-neutral-500 leading-relaxed border-b border-[#17171d]">
          {facts.description}
        </p>
      )}

      {repo.present && (
        <>
          <Row
            label="On this box"
            value={
              <span className="font-mono text-[12px]">
                {short(repo.local)}
                {head.subject ? <span className="text-neutral-500"> · {head.subject}</span> : null}
              </span>
            }
          />
          {!repo.synced && (
            <Row
              label={`On ${repo.branch}`}
              value={
                <span className="font-mono text-[12px]">
                  {short(repo.remote)}
                  {tip.subject ? <span className="text-neutral-500"> · {tip.subject}</span> : null}
                </span>
              }
              tone="text-amber-300"
            />
          )}
          <Row
            label="CI"
            value={repo.ci === 'none' ? 'no run recorded' : repo.ci}
            tone={repo.green ? 'text-emerald-400' : 'text-amber-300'}
          />
          <Row label="Last commit" value={formatAgo(head.committed)} />
          <Row
            label="Checkout"
            value={<span className="font-mono text-[12px]">{repo.path}</span>}
            tone="text-neutral-400"
          />
          {facts.url && (
            <Row
              label="On GitHub"
              value={[
                facts.private ? 'private' : 'public',
                facts.language,
                typeof facts.sizeKb === 'number' ? `${(facts.sizeKb / 1024).toFixed(1)} MB` : null,
                pulls > 0 ? count(pulls, 'open PR', 'open PRs') : null,
                others > 0 ? count(others, 'other branch', 'other branches') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              tone="text-neutral-400"
            />
          )}
        </>
      )}

      {dirty.length > 0 && (
        <div className="px-4 sm:px-6 py-4 border-t border-[#17171d]">
          <p className="text-[11px] text-neutral-500 tracking-[0.12em] uppercase mb-2">
            Modified in the checkout
          </p>
          <ul className="space-y-1">
            {dirty.map((file) => (
              <li key={file} className="font-mono text-[12px] text-rose-300 break-all">
                {file}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

export default function Repositories({ data }) {
  const repositories = Array.isArray(data.repositories) ? data.repositories : [];

  return (
    <div className="space-y-4">
      {repositories.length === 0 ? (
        <Panel title="Repositories" icon={FolderGit2}>
          <Empty>The snapshot names no repositories.</Empty>
        </Panel>
      ) : (
        repositories.map((repo) => <Repository key={repo.name} repo={repo} />)
      )}
    </div>
  );
}
