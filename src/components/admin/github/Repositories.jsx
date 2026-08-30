import React from 'react';
import { FolderGit2, GitBranch, Globe, Lock } from 'lucide-react';
import { formatAgo, formatStamp } from '../../../lib/admin';
import { Empty, Figure, Panel, Pill, Row } from '../ui';
import { GithubLink, count, listOf, repositoriesIn, short } from './shared';

function verdict(repo) {
  if (!repo.present) {
    return {
      tone: 'rose',
      label: 'missing',
      detail: `There is no checkout at ${repo.path}, so nothing here can deploy.`,
    };
  }

  const dirty = listOf(repo, 'dirty');
  if (dirty.length) {
    return {
      tone: 'rose',
      label: 'blocked',
      detail:
        'Tracked files have been modified in the checkout. The next commit touching any of them ' +
        'will abort the fast-forward, and deploys will stop without saying so.',
    };
  }

  if (repo.ahead > 0 && repo.behind > 0) {
    return {
      tone: 'rose',
      label: 'diverged',
      detail:
        `${count(repo.ahead, 'commit', 'commits')} on this box that ${repo.branch} has not got, and ` +
        `${count(repo.behind, 'commit', 'commits')} on ${repo.branch} that this box has not. They are ` +
        `different lines of history, so the deploy cannot fast-forward and nothing will go live ` +
        `until the checkout is put back on ${repo.branch}.`,
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

const commitUrl = (repoUrl, sha) => (repoUrl && sha ? `${repoUrl}/commit/${sha}` : null);

const positionOf = (commits, sha) =>
  typeof sha === 'string' && sha ? commits.findIndex((commit) => sha.startsWith(commit.sha)) : -1;

function Commit({ title, sha, facts = {}, url, tone = 'text-white', note }) {
  const at = facts.committed;
  const href = url ?? null;

  return (
    <div className="px-4 sm:px-6 py-4 border-b border-[#17171d]">
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <p className="text-[11px] text-neutral-500 tracking-[0.12em] uppercase">{title}</p>
        <span className="text-[11px] text-neutral-600 tabular-nums shrink-0">{formatAgo(at)}</span>
      </div>

      <div className="flex items-baseline gap-3">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            title="Open this commit on GitHub in a new tab"
            className="font-mono text-[12px] text-neutral-500 hover:text-white transition-colors shrink-0"
          >
            {short(sha)}
          </a>
        ) : (
          <span className="font-mono text-[12px] text-neutral-500 shrink-0">{short(sha)}</span>
        )}
        <p className={`text-[13px] font-normal leading-relaxed break-words ${tone}`}>
          {facts.subject || 'no subject recorded'}
        </p>
      </div>

      <p className="text-[11px] text-neutral-600 mt-1.5">
        {[facts.author, at ? `${formatStamp(at)} UTC` : null, note].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}

function Waiting({ commits, behind, branch, diverged }) {
  return (
    <div className="px-4 sm:px-6 py-4 border-b border-[#17171d]">
      <p className="text-[11px] text-neutral-500 tracking-[0.12em] uppercase mb-3">
        Waiting to deploy
      </p>

      {commits.length === 0 ? (
        <p className="text-[12px] text-neutral-500 leading-relaxed">
          {count(behind, 'commit is', 'commits are')} on {branch} that this box has not got.{' '}
          {diverged
            ? `They cannot be named here because the checkout is not on ${branch} at all — it is on a commit of its own, so there is no run of commits between the two to list.`
            : 'They cannot be named here because the checkout is older than the run of commits GitHub listed.'}{' '}
          {branch} on GitHub has the full list.
        </p>
      ) : (
        <ul className="space-y-2">
          {commits.map((commit) => (
            <li key={commit.sha} className="flex items-baseline gap-3">
              {commit.url ? (
                <a
                  href={commit.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[11px] text-neutral-600 hover:text-white transition-colors shrink-0"
                >
                  {short(commit.sha)}
                </a>
              ) : (
                <span className="font-mono text-[11px] text-neutral-600 shrink-0">
                  {short(commit.sha)}
                </span>
              )}
              <span className="text-[12px] text-amber-200/90 flex-1 break-words">
                {commit.subject}
              </span>
              <span className="text-[11px] text-neutral-600 tabular-nums shrink-0">
                {formatAgo(commit.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Facts({ items }) {
  const shown = items.filter((item) => item.value !== null && item.value !== undefined);
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 sm:px-6 py-4 border-b border-[#17171d]">
      {shown.map((item) => (
        <span key={item.label} className="flex items-baseline gap-2">
          <span className="text-[11px] text-neutral-600 tracking-[0.1em] uppercase">
            {item.label}
          </span>
          <span className="text-[12px] text-neutral-300 tabular-nums">{item.value}</span>
        </span>
      ))}
    </div>
  );
}

function Repository({ repo }) {
  const state = verdict(repo);
  const dirty = listOf(repo, 'dirty');
  const facts = repo.facts ?? {};
  const commits = listOf(repo, 'commits');
  const pulls = listOf(repo, 'pulls').length;
  const issues = listOf(repo, 'issues').length;
  const others = listOf(repo, 'branches').filter((branch) => !branch.default).length;

  const at = positionOf(commits, repo.local);
  const pending = !repo.synced && repo.behind > 0 && at > 0 ? commits.slice(0, at) : [];

  return (
    <Panel
      title={repo.name}
      icon={FolderGit2}
      action={
        <span className="flex items-center gap-3">
          {typeof facts.private === 'boolean' && (
            <Pill tone={facts.private ? 'neutral' : 'amber'}>
              <span className="flex items-center gap-1.5">
                {facts.private ? (
                  <Lock className="h-3 w-3" strokeWidth={2} />
                ) : (
                  <Globe className="h-3 w-3" strokeWidth={2} />
                )}
                {facts.private ? 'private' : 'public'}
              </span>
            </Pill>
          )}
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
          <Commit
            title="Running on this box"
            sha={repo.local}
            facts={repo.head}
            url={commitUrl(facts.url, repo.local)}
            note={repo.synced ? `the tip of ${repo.branch}` : null}
          />

          {!repo.synced && (
            <Commit
              title={`Newest on ${repo.branch}`}
              sha={repo.remote}
              facts={repo.tip}
              url={commitUrl(facts.url, repo.remote)}
              tone="text-amber-300"
              note="not on this box yet"
            />
          )}

          {!repo.synced && repo.behind > 0 && (
            <Waiting
              commits={pending}
              behind={repo.behind}
              branch={repo.branch}
              diverged={repo.ahead > 0}
            />
          )}

          <Row
            label="CI"
            value={repo.ci === 'none' ? 'no run recorded' : repo.ci}
            tone={repo.green ? 'text-emerald-400' : 'text-amber-300'}
          />
          <Row
            label="Checkout"
            value={<span className="font-mono text-[12px]">{repo.path}</span>}
            tone="text-neutral-400"
          />

          <Facts
            items={[
              { label: 'branch', value: repo.branch },
              { label: 'language', value: facts.language ?? null },
              {
                label: 'size',
                value:
                  typeof facts.sizeKb === 'number' ? `${(facts.sizeKb / 1024).toFixed(1)} MB` : null,
              },
              { label: 'open prs', value: pulls || null },
              { label: 'open issues', value: issues || null },
              { label: 'other branches', value: others || null },
            ]}
          />
        </>
      )}

      {dirty.length > 0 && (
        <div className="px-4 sm:px-6 py-4">
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

function Summary({ repositories }) {
  const broken = repositories.filter(
    (repo) =>
      !repo.present ||
      listOf(repo, 'dirty').length > 0 ||
      (repo.ahead > 0 && repo.behind > 0),
  ).length;
  const behind = repositories.reduce((sum, repo) => sum + (repo.behind || 0), 0);
  const unpushed = repositories.reduce((sum, repo) => sum + (repo.ahead || 0), 0);
  const live = repositories.filter(
    (repo) => repo.present && repo.synced && listOf(repo, 'dirty').length === 0,
  ).length;

  const newest = repositories
    .map((repo) => repo.head?.committed)
    .filter(Boolean)
    .sort()
    .pop();

  const headline = broken
    ? {
        tone: 'text-rose-400',
        text: `${count(broken, 'repository needs', 'repositories need')} attention before anything else here will deploy.`,
      }
    : behind
      ? {
          tone: 'text-amber-300',
          text: `${count(behind, 'commit is', 'commits are')} on GitHub and not on this box yet.`,
        }
      : unpushed
        ? {
            tone: 'text-amber-300',
            text: `${count(unpushed, 'commit is', 'commits are')} on this box and not on GitHub.`,
          }
        : {
            tone: 'text-emerald-400',
            text: 'Every checkout is on the tip of its branch with nothing modified.',
          };

  return (
    <Panel title="Where things stand" icon={GitBranch}>
      <p className={`px-4 sm:px-6 py-4 text-[14px] font-normal ${headline.tone}`}>
        {headline.text}
      </p>
      <div className="grid gap-px bg-[#282832] border-t border-[#282832] sm:grid-cols-3">
        <Figure
          label="On the tip"
          value={`${live}/${repositories.length}`}
          tone={live === repositories.length ? 'text-emerald-400' : 'text-white'}
          hint="checkout matches its branch, nothing modified"
        />
        <Figure
          label="Waiting to deploy"
          value={behind}
          tone={behind ? 'text-amber-300' : 'text-white'}
          hint={behind ? 'picked up on the next deploy tick' : 'nothing queued'}
        />
        <Figure
          label="Last commit"
          value={formatAgo(newest)}
          hint={newest ? `${formatStamp(newest)} UTC` : 'no commit read yet'}
        />
      </div>
    </Panel>
  );
}

export default function Repositories({ data }) {
  const repositories = repositoriesIn(data);

  if (repositories.length === 0) {
    return (
      <Panel title="Repositories" icon={FolderGit2}>
        <Empty>The snapshot names no repositories.</Empty>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Summary repositories={repositories} />
      {repositories.map((repo) => (
        <Repository key={repo.name} repo={repo} />
      ))}
    </div>
  );
}
