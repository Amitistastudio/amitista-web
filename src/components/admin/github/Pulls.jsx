import React from 'react';
import { GitPullRequest } from 'lucide-react';
import { formatAgo } from '../../../lib/admin';
import { Empty, Panel, Pill } from '../ui';
import { GithubLink, listOf, repositoriesIn } from './shared';

// What is actually stopping this going in, in the order the answers matter. A
// draft is nobody's problem yet; conflicts are the author's; a red run is the
// author's too; everything else is the reviewer's. Each verdict says what to do
// rather than naming the state, because "dirty" and "unstable" are GitHub's
// words for things nobody would guess at.
function verdict(pull) {
  if (pull.looked === false) {
    return {
      tone: 'neutral',
      label: 'not looked at',
      detail:
        'Too many open at once to look into them all this round. It is listed, and gets a verdict ' +
        'once the ones above it are dealt with.',
    };
  }

  if (pull.draft) {
    return {
      tone: 'neutral',
      label: 'draft',
      detail: 'Still a draft, so it is not asking for anything yet.',
    };
  }

  if (pull.mergeable === false || pull.mergeState === 'dirty') {
    return {
      tone: 'rose',
      label: 'conflicts',
      detail: `It no longer applies cleanly to ${pull.base}. The author needs to merge ${pull.base} in or rebase on it before anyone can merge this.`,
    };
  }

  const ci = pull.ci ?? 'unknown';
  if (ci.startsWith('completed/') && ci !== 'completed/success') {
    return {
      tone: 'rose',
      label: 'checks failed',
      detail: `CI did not pass (${ci}). Nothing should go in on a red run — the deploy would refuse it anyway.`,
    };
  }
  if (ci === 'none') {
    return {
      tone: 'amber',
      label: 'no run',
      detail: 'No workflow run has been recorded for the head of this branch.',
    };
  }
  if (ci !== 'unknown' && !ci.startsWith('completed/')) {
    return { tone: 'amber', label: 'checks running', detail: `CI is still going (${ci}). Wait for it.` };
  }

  if (pull.mergeState === 'unstable') {
    return {
      tone: 'amber',
      label: 'a check is unhappy',
      detail:
        'Something GitHub does not treat as required is failing. It can still be merged, but it is ' +
        'worth knowing why before doing so.',
    };
  }
  if (pull.mergeState === 'behind') {
    return {
      tone: 'amber',
      label: 'behind',
      detail: `${pull.base} has moved on since this branched. Update it first so what is tested is what is merged.`,
    };
  }
  if (pull.mergeState === 'blocked') {
    return {
      tone: 'amber',
      label: 'blocked',
      detail: 'GitHub is holding it — usually a required review that has not been given.',
    };
  }
  if (pull.mergeable === null || pull.mergeState === 'unknown') {
    return {
      tone: 'neutral',
      label: 'working it out',
      detail: 'GitHub has not finished deciding whether this merges cleanly. It settles in a moment.',
    };
  }

  return {
    tone: 'green',
    label: 'ready',
    detail: 'It applies cleanly and its checks passed. Nothing is in the way but a decision.',
  };
}

const STATUS_MARK = { added: '+', removed: '−', renamed: '→', modified: '·' };

function Changed({ files, total }) {
  const [open, setOpen] = React.useState(false);
  if (files.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((held) => !held)}
        aria-expanded={open}
        className="text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-500 hover:text-white transition-colors"
      >
        {open ? 'Hide what changed' : `What changed · ${files.length} file${files.length === 1 ? '' : 's'}`}
      </button>

      {open && (
        <ul className="mt-2 border border-[#1c1c22] bg-[#0d0d11] divide-y divide-[#17171d] max-h-72 overflow-y-auto">
          {files.map((file) => (
            <li key={file.path} className="flex items-baseline gap-3 px-3 py-2">
              <span className="text-neutral-600 w-3 shrink-0 text-center">
                {STATUS_MARK[file.status] ?? '·'}
              </span>
              <span className="font-mono text-[11px] text-neutral-400 break-all flex-1">
                {file.path}
              </span>
              <span className="text-[11px] tabular-nums shrink-0">
                <span className="text-emerald-400">+{file.added}</span>{' '}
                <span className="text-rose-400">−{file.removed}</span>
              </span>
            </li>
          ))}
          {typeof total === 'number' && total > files.length && (
            <li className="px-3 py-2 text-[11px] text-neutral-600">
              and {total - files.length} more — open it on GitHub for the rest.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function Pull({ pull, repo }) {
  const state = verdict(pull);
  const files = listOf(pull, 'changed');

  return (
    <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[11px] text-neutral-500 font-mono">
              {repo} #{pull.number}
            </span>
            <Pill tone={state.tone}>{state.label}</Pill>
            {pull.draft && <Pill tone="neutral">draft</Pill>}
          </div>

          <p className="text-[13px] text-white font-medium leading-snug break-words">{pull.title}</p>

          <p className="text-[11px] text-neutral-500 mt-1.5 font-mono break-all">
            {pull.head} → {pull.base}
          </p>

          <p className="text-[11px] text-neutral-500 mt-1">
            {pull.author ? `${pull.author} · ` : ''}opened {formatAgo(pull.created)}
            {typeof pull.commits === 'number'
              ? ` · ${pull.commits} commit${pull.commits === 1 ? '' : 's'}`
              : ''}
            {typeof pull.additions === 'number' ? (
              <>
                {' · '}
                <span className="text-emerald-400 tabular-nums">+{pull.additions}</span>{' '}
                <span className="text-rose-400 tabular-nums">−{pull.deletions}</span>
                {typeof pull.files === 'number'
                  ? ` in ${pull.files} file${pull.files === 1 ? '' : 's'}`
                  : ''}
              </>
            ) : null}
            {pull.reviewers?.length > 0 ? ` · waiting on ${pull.reviewers.join(', ')}` : ''}
          </p>
        </div>

        <GithubLink href={pull.url} title={`Open pull request #${pull.number} on GitHub`} />
      </div>

      <p className="text-[12px] text-neutral-400 leading-relaxed mt-3">{state.detail}</p>

      <Changed files={files} total={pull.files} />
    </div>
  );
}

export default function Pulls({ data }) {
  const repositories = repositoriesIn(data);
  const withPulls = repositories.filter((repo) => listOf(repo, 'pulls').length > 0);
  const all = withPulls.flatMap((repo) =>
    listOf(repo, 'pulls').map((pull) => ({ ...pull, repo: repo.name })),
  );
  const ready = all.filter((pull) => verdict(pull).label === 'ready').length;
  const stuck = all.filter((pull) => verdict(pull).tone === 'rose').length;

  if (all.length === 0) {
    return (
      <Panel title="Open pull requests" icon={GitPullRequest}>
        <Empty>
          Nothing open across the three repositories. Work here lands straight on main, so an empty
          list is the normal state rather than a sign anything failed.
        </Empty>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title="Open pull requests" icon={GitPullRequest}>
        <div className="px-4 sm:px-6 py-4 text-[13px] text-neutral-400 leading-relaxed">
          {all.length} open.{' '}
          {ready > 0 && <span className="text-emerald-400">{ready} ready to merge. </span>}
          {stuck > 0 && (
            <span className="text-rose-400">
              {stuck} need{stuck === 1 ? 's' : ''} the author before anyone can merge{' '}
              {stuck === 1 ? 'it' : 'them'}.{' '}
            </span>
          )}
          {ready === 0 && stuck === 0 && 'None of them are waiting on a decision yet.'}
        </div>
      </Panel>

      {withPulls.map((repo) => {
        const pulls = listOf(repo, 'pulls');
        return (
          <Panel
            key={repo.name}
            title={repo.name}
            icon={GitPullRequest}
            action={
              <span className="flex items-center gap-3">
                <Pill tone="amber">{pulls.length}</Pill>
                <GithubLink
                  href={repo.facts?.url ? `${repo.facts.url}/pulls` : null}
                  title={`Open ${repo.name}'s pull requests on GitHub`}
                >
                  ALL
                </GithubLink>
              </span>
            }
          >
            {pulls.map((pull) => (
              <Pull key={pull.number} pull={pull} repo={repo.name} />
            ))}
          </Panel>
        );
      })}
    </div>
  );
}
