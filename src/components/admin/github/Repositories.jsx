import React from 'react';
import { FolderGit2 } from 'lucide-react';
import { formatAgo } from '../../../lib/admin';
import { Empty, Notice, Panel, Pill, Row } from '../ui';

const short = (sha) => (typeof sha === 'string' ? sha.slice(0, 7) : '—');

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The one question this view answers: is what is on GitHub actually running on
// this box, and if not, what is holding it up? Every branch below ends in a
// plain sentence saying so, because "behind by 2" on its own does not tell you
// whether to wait or to go and fix something.
export function verdict(repo) {
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
  const dirty = Array.isArray(repo.dirty) ? repo.dirty : [];
  const head = repo.head ?? {};
  const tip = repo.tip ?? {};

  return (
    <Panel
      title={repo.name}
      icon={FolderGit2}
      action={<Pill tone={state.tone}>{state.label}</Pill>}
    >
      <p className="px-4 sm:px-6 py-4 text-[13px] text-neutral-400 font-normal leading-relaxed border-b border-[#17171d]">
        {state.detail}
      </p>

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

  if (!data.collected) {
    return (
      <Notice tone="amber">
        The deploy has not written a repository snapshot yet. It is written at the end of every
        deploy tick, so this fills in within a minute or two of the timer running.
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      {data.stale && (
        <Notice tone="amber">
          This snapshot was taken {formatAgo(data.generated)} and the deploy normally refreshes it
          every minute. The deploy timer may have stopped — what is below could be well out of date.
        </Notice>
      )}

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
