import React from 'react';
import { GitBranch } from 'lucide-react';
import { Empty, Panel, Pill, Row } from '../ui';
import { count, listOf, repositoriesIn, short } from './shared';

// A branch that is only behind has been left where it was while main moved on;
// a branch that is also ahead is carrying work nothing else has. The second
// kind is the one that quietly gets lost, so it is the one called out.
function describe(branch) {
  if (branch.ahead === undefined || branch.behind === undefined) {
    return { tone: 'neutral', label: 'not compared', detail: 'Too many branches to compare them all this round.' };
  }
  if (branch.ahead === 0 && branch.behind === 0) {
    return { tone: 'green', label: 'level', detail: 'Level with the default branch.' };
  }
  if (branch.ahead === 0) {
    return {
      tone: 'neutral',
      label: `${branch.behind} behind`,
      detail: 'Nothing here that main does not already have — safe to delete.',
    };
  }
  if (branch.behind === 0) {
    return {
      tone: 'amber',
      label: `${branch.ahead} ahead`,
      detail: `${count(branch.ahead, 'commit is', 'commits are')} on this branch and nowhere else.`,
    };
  }
  return {
    tone: 'amber',
    label: `${branch.ahead} ahead, ${branch.behind} behind`,
    detail: `${count(branch.ahead, 'commit is', 'commits are')} on this branch and nowhere else, and main has moved ${branch.behind} commits since.`,
  };
}

export default function Branches({ data }) {
  const repositories = repositoriesIn(data).filter((repo) => listOf(repo, 'branches').length > 0);

  if (repositories.length === 0) {
    return (
      <Panel title="Branches" icon={GitBranch}>
        <Empty>
          No branch listing has been read yet. GitHub is asked for this every few minutes rather
          than every deploy tick.
        </Empty>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {repositories.map((repo) => {
        const branches = listOf(repo, 'branches');
        const others = branches.filter((branch) => !branch.default);
        return (
          <Panel
            key={repo.name}
            title={repo.name}
            icon={GitBranch}
            action={
              <Pill tone={others.length > 0 ? 'amber' : 'neutral'}>
                {others.length === 0 ? 'main only' : count(others.length, 'other branch', 'other branches')}
              </Pill>
            }
          >
            {branches.map((branch) => {
              const state = describe(branch);
              return (
                <Row
                  key={branch.name}
                  label={
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px] text-neutral-300">{branch.name}</span>
                      {branch.default && <Pill tone="purple">default</Pill>}
                      {branch.protected && <Pill tone="neutral">protected</Pill>}
                    </span>
                  }
                  value={
                    <span className="flex flex-col items-end gap-1">
                      <Pill tone={state.tone}>{state.label}</Pill>
                      <span className="text-[11px] text-neutral-600 font-mono">
                        {short(branch.sha)}
                      </span>
                    </span>
                  }
                />
              );
            })}
            {others.length > 0 && (
              <p className="px-4 sm:px-6 py-4 text-[12px] text-neutral-500 leading-relaxed border-t border-[#17171d]">
                {others.map((branch) => `${branch.name}: ${describe(branch).detail}`).join(' ')}
              </p>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
