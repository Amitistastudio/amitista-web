import React from 'react';
import { GitPullRequest } from 'lucide-react';
import { formatAgo } from '../../../lib/admin';
import { Empty, Panel, Pill } from '../ui';
import { GithubLink, openPulls } from './shared';

function Pull({ pull }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 sm:px-6 py-4 border-b border-[#17171d] last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="text-[11px] text-neutral-500 font-mono">
            {pull.repo} #{pull.number}
          </span>
          {pull.draft && <Pill tone="neutral">draft</Pill>}
        </div>
        <p className="text-[13px] text-white font-medium leading-snug break-words">{pull.title}</p>
        <p className="text-[11px] text-neutral-500 mt-1.5">
          {pull.author ? `${pull.author} · ` : ''}
          opened {formatAgo(pull.created)}
          {pull.head && pull.base ? ` · ${pull.head} → ${pull.base}` : ''}
        </p>
      </div>
      <GithubLink href={pull.url} />
    </div>
  );
}

export default function Pulls({ data }) {
  const pulls = openPulls(data);

  return (
    <Panel
      title="Open pull requests"
      icon={GitPullRequest}
      action={pulls.length > 0 ? <Pill tone="amber">{pulls.length}</Pill> : null}
    >
      {pulls.length === 0 ? (
        <Empty>
          Nothing open across the three repositories. Work here lands straight on main, so an
          empty list is the normal state rather than a sign the check failed.
        </Empty>
      ) : (
        pulls.map((pull) => <Pull key={`${pull.repo}#${pull.number}`} pull={pull} />)
      )}
    </Panel>
  );
}
