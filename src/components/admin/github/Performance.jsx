import React from 'react';
import { Activity, Gauge, GitPullRequest } from 'lucide-react';
import { formatAgo } from '../../../lib/admin';
import { Empty, Figure, Panel, Pill, RankedBar, Sparkline } from '../ui';
import { GithubLink, count, listOf, pullVerdict, repositoriesIn } from './shared';

const DAY = 86400000;
const SHOWN = 8;

// Open pull requests bucketed by how long they have been waiting. The
// boundaries are days rather than an even scale because that is how a wait is
// actually talked about: something opened this morning is not in the same
// position as something opened a fortnight ago, and the difference between nine
// days and ten matters to nobody.
const AGES = [
  { label: 'today', upto: 1 },
  { label: '1–2 days', upto: 3 },
  { label: '3–6 days', upto: 7 },
  { label: '1–2 weeks', upto: 14 },
  { label: 'over 2 weeks', upto: Infinity },
];

// Guarded rather than trusting the timestamp: a missing or unparseable date
// gives null, and every caller drops those instead of counting them as today.
const ageDays = (at) => {
  const parsed = at ? Date.parse(at) : NaN;
  return Number.isNaN(parsed) ? null : Math.floor((Date.now() - parsed) / DAY);
};

// Only a completed run carries a verdict. Anything queued or still going has
// not decided yet, so it counts as neither a pass nor a failure — otherwise a
// busy minute would read as a drop in quality.
function runHealth(runs) {
  const settled = runs.filter((run) => run.status === 'completed');
  const passed = settled.filter((run) => run.conclusion === 'success').length;
  return {
    total: runs.length,
    settled: settled.length,
    passed,
    failed: settled.length - passed,
    running: runs.length - settled.length,
    rate: settled.length === 0 ? null : Math.round((passed / settled.length) * 100),
  };
}

// Worst first, because the point of the list is which repository to look at.
// Repositories with no finished run are left out rather than shown at zero —
// nothing has failed there, nothing has passed either, and a red bar would say
// the wrong thing.
function byRepository(repositories) {
  return repositories
    .map((repo) => ({ name: repo.name, ...runHealth(listOf(repo, 'runs')) }))
    .filter((repo) => repo.settled > 0)
    .sort((a, b) => a.rate - b.rate || b.settled - a.settled);
}

// GitHub's own words for a run that did not pass, kept as they come back rather
// than flattened into "failed": 'cancelled' and 'timed_out' point at something
// quite different from a test going red, and which one it is decides whether
// anybody needs to do anything.
function failures(runs) {
  const tally = new Map();
  runs
    .filter((run) => run.status === 'completed' && run.conclusion !== 'success')
    .forEach((run) => {
      const reason =
        typeof run.conclusion === 'string' && run.conclusion.length > 0
          ? run.conclusion.replace(/_/g, ' ')
          : 'unrecorded';
      tally.set(reason, (tally.get(reason) ?? 0) + 1);
    });
  return [...tally.entries()]
    .map(([reason, runs_]) => ({ reason, runs: runs_ }))
    .sort((a, b) => b.runs - a.runs);
}

// Lines changed is the honest measure of what a review is being asked to do.
// It is only present on the pull requests the collector looked into, so the
// rest are left out of the sizing rather than counted as zero — a pull request
// of unknown size at the bottom of the list would be read as a small one.
function churn(pulls) {
  return pulls
    .filter((pull) => typeof pull.additions === 'number' && typeof pull.deletions === 'number')
    .map((pull) => ({ ...pull, lines: pull.additions + pull.deletions }))
    .sort((a, b) => b.lines - a.lines);
}

// Labels are built alongside the counts and in the same order, because the
// tooltips only appear when the two arrays are the same length — a mismatch
// degrades to bare bars without saying so.
function spread(pulls) {
  const counts = AGES.map(() => 0);
  pulls.forEach((pull) => {
    const old = ageDays(pull.created);
    if (old === null) return;
    const index = AGES.findIndex((band) => old < band.upto);
    counts[index === -1 ? AGES.length - 1 : index] += 1;
  });
  return { counts, labels: AGES.map((band) => band.label) };
}

export default function Performance({ data }) {
  const [full, setFull] = React.useState(false);
  const repositories = repositoriesIn(data);

  if (repositories.length === 0) {
    return (
      <Panel title="Performance" icon={Gauge}>
        <Empty>Nothing has been gathered yet. This fills in once the deploy has run.</Empty>
      </Panel>
    );
  }

  const runs = repositories.flatMap((repo) => listOf(repo, 'runs'));
  const pulls = repositories.flatMap((repo) =>
    listOf(repo, 'pulls').map((pull) => ({ ...pull, repo: repo.name })),
  );

  const health = runHealth(runs);
  const perRepo = byRepository(repositories);
  const reasons = failures(runs);
  const sized = churn(pulls);
  const waiting = spread(pulls);

  const lines = sized.reduce((sum, pull) => sum + pull.lines, 0);
  const ages = pulls
    .map((pull) => ageDays(pull.created))
    .filter((old) => old !== null)
    .sort((a, b) => b - a);
  const oldest = ages.length === 0 ? null : ages[0];
  const blocked = pulls.filter((pull) => pullVerdict(pull).tone === 'rose').length;
  const worstReason = reasons[0]?.runs ?? 0;
  const heaviest = sized[0]?.lines ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Checks passing"
          value={health.rate === null ? '—' : `${health.rate}%`}
          tone={
            health.rate === null
              ? 'text-neutral-500'
              : health.rate === 100
                ? 'text-emerald-400'
                : health.rate >= 80
                  ? 'text-amber-300'
                  : 'text-rose-400'
          }
          hint={
            health.settled === 0
              ? 'no finished runs'
              : `${health.passed} of ${count(health.settled, 'finished run', 'finished runs')}`
          }
        />
        <Figure
          label="Runs that failed"
          value={health.failed}
          tone={health.failed === 0 ? 'text-emerald-400' : 'text-rose-400'}
          hint={
            health.running > 0
              ? `${count(health.running, 'run is', 'runs are')} still going`
              : 'nothing in flight'
          }
        />
        <Figure
          label="Waiting on review"
          value={pulls.length}
          tone={
            pulls.length === 0 ? 'text-emerald-400' : blocked > 0 ? 'text-rose-400' : 'text-white'
          }
          hint={
            pulls.length === 0
              ? 'nothing open'
              : oldest === null
                ? 'ages unknown'
                : `oldest open ${count(oldest, 'day', 'days')}`
          }
        />
        <Figure
          label="Lines to read"
          value={lines === 0 ? '—' : lines.toLocaleString()}
          tone={lines === 0 ? 'text-neutral-500' : lines > 2000 ? 'text-amber-300' : 'text-white'}
          hint={
            sized.length === 0
              ? 'no sizes recorded'
              : `across ${count(sized.length, 'pull request', 'pull requests')}`
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Checks by repository"
          icon={Gauge}
          action={
            <Pill
              tone={
                health.rate === null
                  ? 'neutral'
                  : health.rate === 100
                    ? 'green'
                    : health.rate >= 80
                      ? 'amber'
                      : 'rose'
              }
            >
              {health.rate === null ? 'no runs' : `${health.rate}%`}
            </Pill>
          }
        >
          {perRepo.length === 0 ? (
            <Empty>
              No workflow run has finished on any of the three repositories yet, so there is nothing
              to work a pass rate out of. Runs still going are not counted either way.
            </Empty>
          ) : (
            perRepo.map((repo) => (
              <RankedBar
                key={repo.name}
                name={repo.name}
                value={`${repo.rate}%`}
                percent={repo.rate}
                detail={`${repo.passed} of ${count(repo.settled, 'finished run', 'finished runs')}${
                  repo.running > 0 ? ` · ${repo.running} still going` : ''
                }`}
              />
            ))
          )}
        </Panel>

        <Panel
          title="Why runs did not pass"
          icon={Activity}
          action={
            <Pill tone={health.failed === 0 ? 'green' : 'rose'}>
              {health.failed === 0 ? 'clear' : health.failed}
            </Pill>
          }
        >
          {reasons.length === 0 ? (
            <Empty>
              Every finished run passed. This stays empty until one does not, and the word GitHub
              uses for it appears here — a cancelled run and a red test read the same in a total and
              mean quite different things.
            </Empty>
          ) : (
            reasons.map((reason) => (
              <RankedBar
                key={reason.reason}
                name={reason.reason}
                value={reason.runs}
                percent={worstReason === 0 ? 0 : (reason.runs / worstReason) * 100}
                detail={`${count(reason.runs, 'run', 'runs')} of the ${health.settled} that finished`}
              />
            ))
          )}
        </Panel>
      </div>

      <Panel title="How long they have been waiting" icon={GitPullRequest}>
        <div className="px-4 sm:px-6 py-5">
          <Sparkline
            points={waiting.counts}
            labels={waiting.labels}
            unit="pull requests"
            height={56}
          />
          <p className="text-[11px] text-neutral-600 mt-3">
            {pulls.length === 0
              ? 'Nothing is open, so every band is empty. Work here lands straight on main.'
              : `${count(pulls.length, 'pull request', 'pull requests')} open, by how long since it was opened${
                  blocked > 0
                    ? ` · ${count(blocked, 'one', 'of them')} cannot merge until the author acts`
                    : ''
                }.`}
          </p>
        </div>
      </Panel>

      <Panel
        title="Biggest first"
        icon={GitPullRequest}
        action={
          sized.length > SHOWN ? (
            <button
              type="button"
              onClick={() => setFull((held) => !held)}
              aria-expanded={full}
              className="text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-500 hover:text-white transition-colors"
            >
              {full ? 'Show less' : `All ${sized.length}`}
            </button>
          ) : null
        }
      >
        {sized.length === 0 ? (
          <Empty>
            {pulls.length === 0
              ? 'Nothing is open across the three repositories.'
              : 'None of the open pull requests came back with line counts, so there is nothing to size them by. Open one on GitHub for what it changes.'}
          </Empty>
        ) : (
          (full ? sized : sized.slice(0, SHOWN)).map((pull) => (
            <div
              key={`${pull.repo}-${pull.number}`}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-neutral-500 font-mono">
                    {pull.repo} #{pull.number}
                  </span>
                  <Pill tone={pullVerdict(pull).tone}>{pullVerdict(pull).label}</Pill>
                </div>
                <p className="text-[13px] text-white font-medium leading-snug break-words mt-1.5">
                  {pull.title}
                </p>
                <p className="text-[11px] text-neutral-500 mt-1 tabular-nums">
                  <span className="text-emerald-400">+{pull.additions}</span>{' '}
                  <span className="text-rose-400">−{pull.deletions}</span>
                  {typeof pull.files === 'number'
                    ? ` in ${count(pull.files, 'file', 'files')}`
                    : ''}
                  {` · opened ${formatAgo(pull.created)}`}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[11px] text-neutral-600 tabular-nums">
                  {heaviest === 0 ? '' : `${Math.round((pull.lines / heaviest) * 100)}%`}
                </span>
                <GithubLink href={pull.url} title={`Open pull request #${pull.number} on GitHub`} />
              </div>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}