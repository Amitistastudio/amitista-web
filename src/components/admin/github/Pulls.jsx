import React from 'react';
import { GitMerge, GitPullRequest, History, X } from 'lucide-react';
import { formatAgo, githubAvatarUrl } from '../../../lib/admin';
import { Empty, Notice, Panel, Pill, SearchInput, Select } from '../ui';
import { GithubLink, listOf, pullVerdict, repositoriesIn } from './shared';

const STATUS_MARK = { added: '+', removed: '−', renamed: '→', modified: '·' };

const STATES = [
  { id: 'all', label: 'Everything' },
  { id: 'open', label: 'Open' },
  { id: 'merged', label: 'Merged' },
  { id: 'closed', label: 'Closed' },
];

const STATE_LOOK = {
  open: { tone: 'green', icon: GitPullRequest, label: 'open', colour: 'text-emerald-400' },
  merged: { tone: 'purple', icon: GitMerge, label: 'merged', colour: 'text-purple-400' },
  closed: { tone: 'rose', icon: X, label: 'closed', colour: 'text-rose-400' },
};

const REVIEW_LOOK = [
  { key: 'approved', label: 'approved', colour: 'text-emerald-400' },
  { key: 'changes', label: 'changes requested', colour: 'text-rose-400' },
  { key: 'commented', label: 'commented', colour: 'text-neutral-500' },
  { key: 'dismissed', label: 'dismissed', colour: 'text-amber-300' },
];

const DAY = 86400000;
const PAGE = 25;

const ANYONE = '';

const ciOf = (value) => {
  const ci = typeof value === 'string' ? value : 'unknown';
  if (ci === 'completed/success') return { tone: 'green', label: 'checks passed', short: 'passed' };
  if (ci.startsWith('completed/')) {
    return { tone: 'rose', label: `checks ${ci.slice('completed/'.length)}`, short: 'failed' };
  }
  if (ci === 'none') return { tone: 'neutral', label: 'no run recorded', short: 'no run' };
  if (ci === 'unknown') return { tone: 'neutral', label: 'not recorded', short: '—' };
  return { tone: 'amber', label: 'checks running', short: 'running' };
};

const mergeOf = (row) => {
  if (row.state === 'merged') {
    return { tone: 'purple', label: row.mergedBy ? `merged by ${row.mergedBy}` : 'merged' };
  }
  if (row.state === 'closed') return { tone: 'rose', label: 'closed without merging' };
  if (row.draft) return { tone: 'neutral', label: 'draft, not asking to merge' };
  if (row.mergeable === false || row.mergeState === 'dirty') {
    return { tone: 'rose', label: 'conflicts with the base' };
  }
  if (row.mergeState === 'behind') return { tone: 'amber', label: 'behind the base' };
  if (row.mergeState === 'blocked') return { tone: 'amber', label: 'blocked by a rule' };
  if (row.mergeState === 'unstable') return { tone: 'amber', label: 'mergeable, a check is unhappy' };
  if (row.mergeable === true || row.mergeState === 'clean') {
    return { tone: 'green', label: 'merges cleanly' };
  }
  return { tone: 'neutral', label: 'not worked out yet' };
};

const ageOf = (value) => {
  const parsed = Date.parse(value ?? '');
  return Number.isNaN(parsed) ? null : Date.now() - parsed;
};

const days = (ms) => (ms === null ? null : Math.floor(ms / DAY));

const spanOf = (from, to) => {
  const a = Date.parse(from ?? '');
  const b = Date.parse(to ?? '');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const hours = Math.max(0, Math.round((b - a) / 3600000));
  if (hours < 1) return 'under an hour';
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

const dateOf = (value) => {
  const parsed = Date.parse(value ?? '');
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const ageTone = (ms) => {
  const old = days(ms);
  if (old === null) return 'text-neutral-500';
  if (old >= 14) return 'text-rose-400';
  if (old >= 7) return 'text-amber-300';
  return 'text-neutral-400';
};

function reviewsOf(pull) {
  const rows = listOf(pull, 'reviews');
  const spoken = new Set(rows.map((row) => String(row.login ?? '').toLowerCase()));
  const asked = Array.isArray(pull.reviewers) ? pull.reviewers : [];
  return {
    rows,
    approved: rows.filter((row) => row.state === 'APPROVED'),
    changes: rows.filter((row) => row.state === 'CHANGES_REQUESTED'),
    commented: rows.filter((row) => row.state === 'COMMENTED'),
    dismissed: rows.filter((row) => row.state === 'DISMISSED'),
    pending: asked.filter((login) => !spoken.has(String(login ?? '').toLowerCase())),
    asked,
  };
}

function waitingOn(pull, review) {
  const author = pull.author ? [pull.author] : [];

  if (pull.looked === false) {
    return {
      who: [],
      label: 'not looked into',
      tone: 'neutral',
      why: 'Too many open at once to look into them all this round. It gets a verdict once the ones above it are dealt with.',
    };
  }
  if (pull.draft) {
    return {
      who: author,
      label: 'the author',
      tone: 'neutral',
      why: 'Still a draft, so it is not asking anybody for anything yet.',
    };
  }
  if (pull.mergeable === false || pull.mergeState === 'dirty') {
    return {
      who: author,
      label: 'the author',
      tone: 'rose',
      why: `It no longer applies cleanly to ${pull.base}, so nobody else can move it along.`,
    };
  }

  const ci = pull.ci ?? 'unknown';
  if (ci.startsWith('completed/') && ci !== 'completed/success') {
    return {
      who: author,
      label: 'the author',
      tone: 'rose',
      why: 'CI did not pass. Reviewing a red branch is wasted effort.',
    };
  }
  if (review.changes.length > 0) {
    return {
      who: author,
      label: 'the author',
      tone: 'amber',
      why: `${review.changes.map((row) => row.login).join(', ')} asked for changes and nothing has answered that yet.`,
    };
  }
  if (ci !== 'unknown' && ci !== 'none' && !ci.startsWith('completed/')) {
    return {
      who: [],
      label: 'the checks',
      tone: 'neutral',
      why: 'CI is still going. There is nothing for a person to do until it lands.',
    };
  }
  if (review.pending.length > 0) {
    return {
      who: review.pending,
      label: review.pending.length === 1 ? review.pending[0] : `${review.pending.length} reviewers`,
      tone: 'amber',
      why: `Asked to review and has not answered${pull.updated ? `; last touched ${formatAgo(pull.updated)}` : ''}.`,
    };
  }
  if (review.approved.length > 0) {
    return {
      who: [],
      label: 'a merge',
      tone: 'green',
      why: `Approved by ${review.approved.map((row) => row.login).join(', ')} with nothing in the way. Somebody just has to press the button.`,
    };
  }
  if (review.asked.length === 0) {
    return {
      who: [],
      label: 'somebody to be asked',
      tone: 'amber',
      why: 'No reviewer has been requested, so it is not sitting in anybody’s queue but this one.',
    };
  }
  return {
    who: [],
    label: 'a decision',
    tone: 'neutral',
    why: 'It applies cleanly and its checks passed.',
  };
}

function everyPull(repositories) {
  const seen = new Map();
  repositories.forEach((repo) => {
    listOf(repo, 'history').forEach((row) => {
      seen.set(`${repo.name}#${row.number}`, { ...row, repo: repo.name });
    });
  });
  repositories.forEach((repo) => {
    listOf(repo, 'pulls').forEach((pull) => {
      const id = `${repo.name}#${pull.number}`;
      seen.set(id, { state: 'open', ...(seen.get(id) ?? {}), ...pull, repo: repo.name });
    });
  });
  return [...seen.values()].sort((a, b) =>
    String(b.updated ?? b.created ?? '').localeCompare(String(a.updated ?? a.created ?? '')),
  );
}

function Face({ login, size = 'h-5 w-5' }) {
  const [failed, setFailed] = React.useState(false);
  return !failed && login ? (
    <img
      src={githubAvatarUrl(login)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${size} rounded-full border border-[#282832] bg-[#111115] shrink-0`}
    />
  ) : (
    <span
      className={`${size} rounded-full border border-[#282832] bg-[#111115] shrink-0 flex items-center justify-center text-[9px] font-semibold text-neutral-500 uppercase`}
    >
      {String(login ?? '?').slice(0, 1)}
    </span>
  );
}

function Faces({ logins, tone = 'text-neutral-400' }) {
  if (!logins || logins.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {logins.slice(0, 4).map((login) => (
        <span key={login} className="inline-flex items-center gap-1.5">
          <Face login={login} size="h-4 w-4" />
          <span className={`text-[11px] ${tone}`}>{login}</span>
        </span>
      ))}
      {logins.length > 4 && <span className="text-[11px] text-neutral-600">+{logins.length - 4}</span>}
    </span>
  );
}

function Count({ value, label, tone = 'text-white' }) {
  return (
    <div className="px-4 sm:px-6 py-4">
      <p className={`text-[22px] font-semibold tabular-nums leading-none ${tone}`}>{value}</p>
      <p className="text-[11px] text-neutral-500 mt-1.5 leading-snug">{label}</p>
    </div>
  );
}

function ReviewStrip({ review }) {
  const given = REVIEW_LOOK.map((look) => ({ ...look, rows: review[look.key] })).filter(
    (look) => look.rows.length > 0,
  );

  if (given.length === 0 && review.pending.length === 0) {
    return (
      <p className="text-[12px] text-neutral-600">
        Nobody has reviewed it and nobody has been asked to.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {given.map((look) => (
        <span key={look.key} className="inline-flex flex-wrap items-center gap-2">
          <span
            className={`text-[10px] font-semibold tracking-[0.12em] uppercase ${look.colour}`}
          >
            {look.label}
          </span>
          <Faces logins={look.rows.map((row) => row.login)} />
        </span>
      ))}
      {review.pending.length > 0 && (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-neutral-600">
            asked, no answer
          </span>
          <Faces logins={review.pending} tone="text-neutral-500" />
        </span>
      )}
    </div>
  );
}

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

const approvalOf = (review) => {
  if (review.changes.length > 0) {
    return { tone: 'rose', label: `changes requested by ${review.changes.length}` };
  }
  if (review.approved.length > 0) {
    return { tone: 'green', label: `approved by ${review.approved.length}` };
  }
  if (review.pending.length > 0) {
    return { tone: 'amber', label: `${review.pending.length} yet to answer` };
  }
  if (review.rows.length > 0) return { tone: 'neutral', label: 'looked at, no verdict' };
  return { tone: 'neutral', label: 'no reviews' };
};

function Queued({ pull, review, wait, age, place }) {
  const state = pullVerdict(pull);
  const approval = approvalOf(review);
  const old = days(age);

  return (
    <div className="px-4 sm:px-6 py-5 border-b border-[#17171d] last:border-b-0">
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="text-[11px] font-mono text-neutral-700 tabular-nums pt-1 w-4 shrink-0">
          {place}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[11px] text-neutral-500 font-mono">
              {pull.repo} #{pull.number}
            </span>
            <Pill tone={state.tone}>{state.label}</Pill>
            <Pill tone={approval.tone}>{approval.label}</Pill>
            {pull.draft && <Pill tone="neutral">draft</Pill>}
            <span className={`text-[11px] tabular-nums ${ageTone(age)}`}>
              open {old === null ? '—' : old === 0 ? 'today' : `${old}d`}
            </span>
          </div>

          <p className="text-[13px] text-white font-medium leading-snug break-words">{pull.title}</p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
            <span className="inline-flex items-center gap-1.5">
              <Face login={pull.author} size="h-4 w-4" />
              <span className="text-[11px] text-neutral-400">{pull.author ?? 'unknown'}</span>
            </span>
            <span className="text-[11px] text-neutral-600 font-mono break-all">
              {pull.head} → {pull.base}
            </span>
            {typeof pull.additions === 'number' && (
              <span className="text-[11px] tabular-nums">
                <span className="text-emerald-400">+{pull.additions}</span>{' '}
                <span className="text-rose-400">−{pull.deletions}</span>
                {typeof pull.files === 'number'
                  ? ` in ${pull.files} file${pull.files === 1 ? '' : 's'}`
                  : ''}
              </span>
            )}
          </div>

          <div className="mt-3.5 border-l-2 border-[#282832] pl-3">
            <p className="text-[10px] tracking-[0.14em] uppercase text-neutral-600 font-semibold">
              waiting on
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {wait.who.length > 0 ? (
                <Faces logins={wait.who} tone="text-white" />
              ) : (
                <span className="text-[13px] text-white font-medium">{wait.label}</span>
              )}
              <Pill tone={wait.tone}>{wait.who.length > 0 ? 'their move' : 'nobody in particular'}</Pill>
            </div>
            <p className="text-[12px] text-neutral-400 leading-relaxed mt-1.5">{wait.why}</p>
          </div>

          <div className="mt-3.5">
            <p className="text-[10px] tracking-[0.14em] uppercase text-neutral-600 font-semibold mb-2">
              review
            </p>
            <ReviewStrip review={review} />
          </div>

          <p className="text-[12px] text-neutral-500 leading-relaxed mt-3.5">{state.detail}</p>

          <Changed files={listOf(pull, 'changed')} total={pull.files} />
        </div>

        <GithubLink href={pull.url} title={`Open pull request #${pull.number} on GitHub`} />
      </div>
    </div>
  );
}
function Field({ label, tone, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] tracking-[0.16em] uppercase text-neutral-700 font-semibold mb-1">
        {label}
      </p>
      <p className={`text-[11px] leading-snug ${tone}`}>{children}</p>
    </div>
  );
}

function StatusStrip({ row, review }) {
  const ci = ciOf(row.ci);
  const merge = mergeOf(row);
  const looked = Array.isArray(row.reviews);

  const colour = {
    green: 'text-emerald-400',
    rose: 'text-rose-400',
    amber: 'text-amber-300',
    purple: 'text-purple-300',
    neutral: 'text-neutral-500',
  };

  const verdict = () => {
    if (!looked) return <span className="text-neutral-600">not recorded</span>;
    if (review.changes.length > 0) {
      return (
        <span className="text-rose-400">
          changes requested by {review.changes.map((one) => one.login).join(', ')}
        </span>
      );
    }
    if (review.approved.length > 0) {
      return (
        <span className="text-emerald-400">
          approved by {review.approved.map((one) => one.login).join(', ')}
        </span>
      );
    }
    if (review.pending.length > 0) {
      return (
        <span className="text-amber-300">{review.pending.join(', ')} asked, no answer</span>
      );
    }
    if (review.rows.length > 0) {
      return (
        <span className="text-neutral-400">
          {review.rows.map((one) => one.login).join(', ')} looked, no verdict
        </span>
      );
    }
    return <span className="text-neutral-600">nobody reviewed it</span>;
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mt-3 border-t border-[#17171d] pt-3">
      <Field label="review" tone="text-neutral-400">
        {verdict()}
      </Field>
      <Field label="checks" tone={colour[ci.tone]}>
        {ci.label}
      </Field>
      <Field label="merge" tone={colour[merge.tone]}>
        {merge.label}
      </Field>
    </div>
  );
}

function Past({ row }) {
  const look = STATE_LOOK[row.state] ?? STATE_LOOK.closed;
  const Icon = look.icon;
  const lived = spanOf(row.created, row.merged ?? row.closed);
  const review = reviewsOf(row);

  return (
    <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] last:border-b-0">
      <div className="flex items-start gap-3">
        <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${look.colour}`} strokeWidth={2} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-neutral-500 font-mono">
              {row.repo} #{row.number}
            </span>
            <Pill tone={look.tone}>{look.label}</Pill>
            {row.draft && row.state === 'open' && <Pill tone="neutral">draft</Pill>}
          </div>

          <p className="text-[13px] text-white leading-snug break-words mt-1.5">{row.title}</p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            <span className="inline-flex items-center gap-1.5">
              <Face login={row.author} size="h-4 w-4" />
              <span className="text-[11px] text-neutral-400">{row.author ?? 'unknown'}</span>
            </span>
            <span className="text-[11px] text-neutral-500">
              opened {dateOf(row.created) ?? '—'}
              {row.state === 'merged' && (
                <>
                  {' · '}merged {dateOf(row.merged) ?? '—'}
                  {lived ? ` after ${lived} open` : ''}
                </>
              )}
              {row.state === 'closed' && (
                <>
                  {' · '}closed {dateOf(row.closed) ?? '—'}
                  {lived ? ` after ${lived}` : ''}
                </>
              )}
              {row.state === 'open' && <>{' · '}last touched {formatAgo(row.updated)}</>}
            </span>
          </div>

          <p className="text-[11px] text-neutral-600 mt-1.5 font-mono break-all">
            {row.head} → {row.base}
          </p>

          {row.labels?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {row.labels.map((label) => (
                <span
                  key={label.name}
                  className="text-[10px] px-1.5 py-[2px] border border-[#282832] text-neutral-500"
                >
                  {label.name}
                </span>
              ))}
            </div>
          )}

          <StatusStrip row={row} review={review} />
        </div>

        <GithubLink href={row.url} title={`Open pull request #${row.number} on GitHub`} />
      </div>
    </div>
  );
}

function Chips({ options, active, onPick, label }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onPick(option.id)}
          aria-pressed={active === option.id}
          className={`border px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors ${
            active === option.id
              ? 'border-purple-500/60 text-white bg-purple-500/10'
              : 'border-[#282832] text-neutral-500 hover:text-white hover:border-neutral-600'
          }`}
        >
          {option.label}
          {typeof option.count === 'number' && (
            <span className="ml-2 text-neutral-600 tabular-nums">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

const reviewersOf = (row) => {
  const out = new Set();
  (Array.isArray(row.reviewers) ? row.reviewers : []).forEach((login) => out.add(login));
  listOf(row, 'reviews').forEach((one) => out.add(one.login));
  return [...out].filter(Boolean);
};

function Ledger({ rows, gathered }) {
  const [term, setTerm] = React.useState('');
  const [state, setState] = React.useState('all');
  const [repo, setRepo] = React.useState('all');
  const [author, setAuthor] = React.useState(ANYONE);
  const [reviewer, setReviewer] = React.useState(ANYONE);
  const [shown, setShown] = React.useState(PAGE);

  const reset = () => setShown(PAGE);

  const repos = [...new Set(rows.map((row) => row.repo))].sort();
  const authors = [...new Set(rows.map((row) => row.author).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const reviewers = [...new Set(rows.flatMap(reviewersOf))].sort((a, b) => a.localeCompare(b));

  const wanted = term.trim().toLowerCase();
  const words = wanted.split(/\s+/).filter(Boolean);

  const matches = (row, skip) => {
    if (skip !== 'state' && state !== 'all' && row.state !== state) return false;
    if (skip !== 'repo' && repo !== 'all' && row.repo !== repo) return false;
    if (skip !== 'author' && author !== ANYONE && row.author !== author) return false;
    if (skip !== 'reviewer' && reviewer !== ANYONE && !reviewersOf(row).includes(reviewer)) {
      return false;
    }
    if (words.length === 0) return true;
    const hay = [
      row.title,
      row.author,
      row.repo,
      row.head,
      row.base,
      row.mergedBy,
      row.state,
      `#${row.number}`,
      ...reviewersOf(row),
      ...(row.labels ?? []).map((label) => label.name),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return words.every((word) => hay.includes(word));
  };

  const found = rows.filter((row) => matches(row, null));

  const tally = (skip, test) => rows.filter((row) => matches(row, skip) && test(row)).length;

  const stateOptions = STATES.map((option) => ({
    ...option,
    count: tally('state', (row) => option.id === 'all' || row.state === option.id),
  }));

  const repoOptions = [
    { id: 'all', label: 'Every repository', count: tally('repo', () => true) },
    ...repos.map((name) => ({
      id: name,
      label: name,
      count: tally('repo', (row) => row.repo === name),
    })),
  ];

  const narrowed =
    state !== 'all' || repo !== 'all' || author !== ANYONE || reviewer !== ANYONE || words.length > 0;

  return (
    <Panel
      title="Pull requests"
      icon={History}
      action={<Pill tone="neutral">{rows.length}</Pill>}
    >
      {!gathered && (
        <div className="px-4 sm:px-6 pt-4">
          <Notice tone="amber">
            The closed and merged pull requests are not in the snapshot yet. They are gathered by the
            deploy, so they appear on the first tick after it next runs. Until then this list can
            only show what is still open.
          </Notice>
        </div>
      )}

      <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] space-y-3">
        <SearchInput
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            reset();
          }}
          placeholder="Search titles, people, branches, labels, #number"
          aria-label="Search pull requests"
        />

        <Chips
          options={stateOptions}
          active={state}
          label="Filter by state"
          onPick={(id) => {
            setState(id);
            reset();
          }}
        />

        {repos.length > 1 && (
          <Chips
            options={repoOptions}
            active={repo}
            label="Filter by repository"
            onPick={(id) => {
              setRepo(id);
              reset();
            }}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[10px] tracking-[0.14em] uppercase text-neutral-600 font-semibold mb-1.5">
              Raised by
            </span>
            <Select
              value={author}
              onChange={(event) => {
                setAuthor(event.target.value);
                reset();
              }}
            >
              <option value={ANYONE}>Anybody</option>
              {authors.map((login) => (
                <option key={login} value={login}>
                  {login}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="block text-[10px] tracking-[0.14em] uppercase text-neutral-600 font-semibold mb-1.5">
              Reviewed by or asked of
            </span>
            <Select
              value={reviewer}
              onChange={(event) => {
                setReviewer(event.target.value);
                reset();
              }}
              disabled={reviewers.length === 0}
            >
              <option value={ANYONE}>Anybody</option>
              {reviewers.map((login) => (
                <option key={login} value={login}>
                  {login}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {narrowed && (
          <button
            type="button"
            onClick={() => {
              setTerm('');
              setState('all');
              setRepo('all');
              setAuthor(ANYONE);
              setReviewer(ANYONE);
              reset();
            }}
            className="text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-500 hover:text-white transition-colors"
          >
            Clear the filters
          </button>
        )}
      </div>

      {found.length === 0 ? (
        <Empty>
          Nothing matches. {words.length > 0 && `The search covers the title, who raised it, the repository, the branches, the reviewers, the labels and the number. `}
          Widen it or clear the filters.
        </Empty>
      ) : (
        <>
          <div className="px-4 sm:px-6 py-2.5 text-[11px] text-neutral-600 border-b border-[#17171d]">
            {found.length === rows.length
              ? `All ${found.length}, most recently touched first.`
              : `${found.length} of ${rows.length} shown.`}
          </div>
          {found.slice(0, shown).map((row) => (
            <Past key={`${row.repo}#${row.number}`} row={row} />
          ))}
          {found.length > shown && (
            <div className="px-4 sm:px-6 py-4">
              <button
                type="button"
                onClick={() => setShown((held) => held + PAGE)}
                className="border border-[#282832] px-4 py-2 text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors"
              >
                Show {Math.min(PAGE, found.length - shown)} more
              </button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

export default function Pulls({ data }) {
  const repositories = repositoriesIn(data);
  const past = everyPull(repositories);
  const gathered = repositories.some((repo) => Array.isArray(repo.history));

  const open = repositories
    .flatMap((repo) => listOf(repo, 'pulls').map((pull) => ({ ...pull, repo: repo.name })))
    .map((pull) => {
      const review = reviewsOf(pull);
      return { pull, review, wait: waitingOn(pull, review), age: ageOf(pull.created) ?? 0 };
    })
    .sort((a, b) => b.age - a.age);

  const onAuthor = open.filter((row) => row.wait.label === 'the author').length;
  const onReviewer = open.filter((row) => row.wait.who.length > 0 && row.wait.label !== 'the author')
    .length;
  const mergeable = open.filter((row) => row.wait.label === 'a merge').length;
  const unasked = open.filter((row) => row.wait.label === 'somebody to be asked').length;
  const oldest = open.length > 0 ? days(open[0].age) : null;

  if (open.length === 0 && past.length === 0) {
    return (
      <Panel title="Review queue" icon={GitPullRequest}>
        <Empty>
          Nothing has been raised across the three repositories. Work here lands straight on main, so
          an empty queue is the normal state rather than a sign anything failed.
        </Empty>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title="Review queue" icon={GitPullRequest}>
        {open.length === 0 ? (
          <Empty>
            Nothing is open across the organisation. Everything raised has been dealt with, and the
            record of it is below.
          </Empty>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-[#17171d] border-b border-[#17171d]">
              <Count value={open.length} label="open across the organisation" />
              <Count
                value={onReviewer}
                label="waiting on a reviewer"
                tone={onReviewer > 0 ? 'text-amber-300' : 'text-white'}
              />
              <Count
                value={onAuthor}
                label="waiting on the author"
                tone={onAuthor > 0 ? 'text-rose-400' : 'text-white'}
              />
              <Count
                value={mergeable}
                label="approved and ready to merge"
                tone={mergeable > 0 ? 'text-emerald-400' : 'text-white'}
              />
              <Count
                value={oldest === null ? '—' : `${oldest}d`}
                label="the oldest has been open this long"
                tone={oldest !== null && oldest >= 7 ? 'text-amber-300' : 'text-white'}
              />
            </div>

            <div className="px-4 sm:px-6 py-4 text-[13px] text-neutral-400 leading-relaxed border-b border-[#17171d]">
              Oldest first, because the one that has been sitting there longest is the one nobody is
              going to remember on their own.{' '}
              {mergeable > 0 && (
                <span className="text-emerald-400">
                  {mergeable} {mergeable === 1 ? 'is' : 'are'} approved with nothing in the way.{' '}
                </span>
              )}
              {onAuthor > 0 && (
                <span className="text-rose-400">
                  {onAuthor} {onAuthor === 1 ? 'needs' : 'need'} the author before anybody else can
                  help.{' '}
                </span>
              )}
              {unasked > 0 && (
                <span className="text-amber-300">
                  {unasked} {unasked === 1 ? 'has' : 'have'} no reviewer requested at all.
                </span>
              )}
            </div>

            {open.map((row, index) => (
              <Queued
                key={`${row.pull.repo}#${row.pull.number}`}
                pull={row.pull}
                review={row.review}
                wait={row.wait}
                age={row.age}
                place={index + 1}
              />
            ))}
          </>
        )}
      </Panel>

      <Ledger rows={past} gathered={gathered} />
    </div>
  );
}
