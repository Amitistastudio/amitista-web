import React from 'react';
import { CircleDot, MessageSquare } from 'lucide-react';
import { formatAgo } from '../../../lib/admin';
import { Empty, Panel, Pill } from '../ui';
import { GithubLink, listOf, repositoriesIn } from './shared';

// GitHub hands label colours back as bare hex. Painting text on them means
// guessing at contrast for every colour someone invents, so the colour goes on
// a dot and the text stays legible.
function Label({ label }) {
  const colour = /^[0-9a-f]{6}$/i.test(label.colour ?? '') ? `#${label.colour}` : '#6b7280';
  return (
    <span className="inline-flex items-center gap-1.5 border border-[#282832] px-2 py-[2px] text-[10px] font-semibold tracking-[0.08em] uppercase text-neutral-400">
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colour }} />
      {label.name}
    </span>
  );
}

function Issue({ issue, repo }) {
  const [open, setOpen] = React.useState(false);
  const body = (issue.body ?? '').trim();

  return (
    <div className="border-b border-[#17171d] last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 sm:px-6 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[11px] text-neutral-500 font-mono">
              {repo} #{issue.number}
            </span>
            {issue.milestone && <Pill tone="purple">{issue.milestone}</Pill>}
          </div>

          <p className="text-[13px] text-white font-medium leading-snug break-words">
            {issue.title}
          </p>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11px] text-neutral-500">
            <span>
              {issue.author ? `${issue.author} · ` : ''}opened {formatAgo(issue.created)}
            </span>
            {issue.updated !== issue.created && <span>· updated {formatAgo(issue.updated)}</span>}
            {issue.comments > 0 && (
              <span className="inline-flex items-center gap-1">
                ·<MessageSquare className="h-3 w-3" strokeWidth={2} />
                {issue.comments}
              </span>
            )}
            {issue.assignees?.length > 0 && <span>· on {issue.assignees.join(', ')}</span>}
          </div>

          {issue.labels?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {issue.labels.map((label) => (
                <Label key={label.name} label={label} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {body && (
            <button
              type="button"
              onClick={() => setOpen((held) => !held)}
              aria-expanded={open}
              className="tap border border-[#282832] bg-[#0a0a0d] px-3 py-2 text-[11px] font-semibold tracking-[0.14em] text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors"
            >
              {open ? 'HIDE' : 'READ'}
            </button>
          )}
          <GithubLink href={issue.url} title={`Open issue #${issue.number} on GitHub`} />
        </div>
      </div>

      {open && body && (
        <div className="px-4 sm:px-6 pb-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-neutral-400 bg-[#0d0d11] border border-[#1c1c22] p-4 max-h-80 overflow-y-auto">
            {body}
          </pre>
          {issue.clipped && (
            <p className="text-[11px] text-neutral-600 mt-2">
              Shortened — open it on GitHub for the rest.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Issues({ data }) {
  const repositories = repositoriesIn(data);
  // Deliberately the length of the list, not facts.openIssues: GitHub's count
  // includes pull requests, so a repository with no issues at all can report
  // dozens of them.
  const total = repositories.reduce((sum, repo) => sum + listOf(repo, 'issues').length, 0);

  if (repositories.length === 0) {
    return (
      <Panel title="Open issues" icon={CircleDot}>
        <Empty>
          No repositories have been read yet. This fills in once the deploy has written a snapshot.
        </Empty>
      </Panel>
    );
  }

  if (total === 0) {
    return (
      <Panel title="Open issues" icon={CircleDot}>
        <Empty>
          Nothing open across the three repositories. Issues raised on GitHub show up here within a
          few minutes — that is how often GitHub is asked, rather than every deploy tick.
        </Empty>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {repositories
        .filter((repo) => listOf(repo, 'issues').length > 0)
        .map((repo) => {
          const issues = listOf(repo, 'issues');
          return (
            <Panel
              key={repo.name}
              title={repo.name}
              icon={CircleDot}
              action={
                <span className="flex items-center gap-3">
                  <Pill tone="amber">{issues.length}</Pill>
                  <GithubLink
                    href={repo.facts?.url ? `${repo.facts.url}/issues` : null}
                    title={`Open ${repo.name}'s issues on GitHub`}
                  >
                    ALL
                  </GithubLink>
                </span>
              }
            >
              {issues.map((issue) => (
                <Issue key={issue.number} issue={issue} repo={repo.name} />
              ))}
            </Panel>
          );
        })}
    </div>
  );
}
