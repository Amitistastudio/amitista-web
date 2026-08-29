import React from 'react';
import { CircleCheck } from 'lucide-react';
import { formatAgo } from '../../../lib/admin';
import { Empty, Notice, Panel, Pill } from '../ui';
import { GithubLink, duration, isFailure, listOf, repositoriesIn, runLabel, runTone } from './shared';

function Run({ run }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0">
      <div className="min-w-0 flex-1 flex items-center gap-3">
        <Pill tone={runTone(run)}>{runLabel(run)}</Pill>
        <div className="min-w-0">
          <p className="text-[13px] text-neutral-300 truncate">{run.subject || run.name}</p>
          <p className="text-[11px] text-neutral-600 font-mono mt-0.5">
            {run.sha} · {run.branch}
            {run.event ? ` · ${run.event}` : ''} · {duration(run.seconds)} ·{' '}
            {formatAgo(run.created)}
          </p>
        </div>
      </div>
      <GithubLink href={run.url} title="Open this run on GitHub" />
    </div>
  );
}

export default function Checks({ data }) {
  const repositories = repositoriesIn(data).filter((repo) => listOf(repo, 'runs').length > 0);
  const failing = repositories.flatMap((repo) => listOf(repo, 'runs').filter(isFailure));

  if (repositories.length === 0) {
    return (
      <Panel title="Recent checks" icon={CircleCheck}>
        <Empty>
          No workflow runs have been read yet. GitHub is asked for these every few minutes rather
          than every deploy tick, so this fills in shortly after the panel is first installed.
        </Empty>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {failing.length > 0 && (
        <Notice tone="rose">
          {failing.length === 1 ? 'One recent run' : `${failing.length} recent runs`} did not pass.
          A commit whose run failed is never deployed — it will sit on main, live nowhere, until
          the run is fixed.
        </Notice>
      )}

      {repositories.map((repo) => {
        const runs = listOf(repo, 'runs');
        const bad = runs.filter(isFailure).length;
        return (
          <Panel
            key={repo.name}
            title={repo.name}
            icon={CircleCheck}
            action={
              <Pill tone={bad > 0 ? 'rose' : 'green'}>
                {bad > 0 ? `${bad} of last ${runs.length} failed` : `last ${runs.length} passed`}
              </Pill>
            }
          >
            {runs.map((run) => (
              <Run key={`${run.sha}-${run.created}`} run={run} />
            ))}
          </Panel>
        );
      })}
    </div>
  );
}
