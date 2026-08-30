import React from 'react';
import { Activity, Gauge, GitPullRequest, Timer, TriangleAlert } from 'lucide-react';
import { formatAgo } from '../../../lib/admin';
import { Empty, Figure, Panel, Pill, RankedBar, Sparkline } from '../ui';
import { GithubLink, count, listOf, pullVerdict, repositoriesIn, short } from './shared';

const DAY = 86400000;
const SHOWN = 8;

const AGES = [
  { label: 'today', upto: 1 },
  { label: '1–2 days', upto: 3 },
  { label: '3–6 days', upto: 7 },
  { label: '1–2 weeks', upto: 14 },
  { label: 'over 2 weeks', upto: Infinity },
];

const ageDays = (at) => {
  const parsed = at ? Date.parse(at) : NaN;
  return Number.isNaN(parsed) ? null : Math.floor((Date.now() - parsed) / DAY);
};

const newestFirst = (a, b) => String(b.created ?? '').localeCompare(String(a.created ?? ''));

const UNDECIDED = new Set(['skipped', 'neutral', 'stale']);

function buildState(run) {
  if (run.status !== 'completed') {
    if (run.status === 'in_progress') return { key: 'running', tone: 'amber', label: 'running' };
    return {
      key: 'running',
      tone: 'neutral',
      label:
        typeof run.status === 'string' && run.status.length > 0
          ? run.status.replace(/_/g, ' ')
          : 'pending',
    };
  }
  if (run.conclusion === 'success') return { key: 'passed', tone: 'green', label: 'passed' };
  if (UNDECIDED.has(run.conclusion)) {
    return { key: 'undecided', tone: 'neutral', label: run.conclusion };
  }
  return {
    key: 'failed',
    tone: 'rose',
    label:
      typeof run.conclusion === 'string' && run.conclusion.length > 0
        ? run.conclusion.replace(/_/g, ' ')
        : 'failed',
  };
}

function runHealth(runs) {
  const states = runs.map(buildState);
  const tally = (key) => states.filter((state) => state.key === key).length;
  const passed = tally('passed');
  const failed = tally('failed');
  const settled = passed + failed;
  return {
    total: runs.length,
    settled,
    passed,
    failed,
    running: tally('running'),
    undecided: tally('undecided'),
    rate: settled === 0 ? null : Math.round((passed / settled) * 100),
  };
}

function took(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

const runsOf = (repo) => listOf(repo, 'runs').map((run) => ({ ...run, repo: repo.name }));

const LATEST_ORDER = { failed: 0, running: 1, undecided: 2, passed: 3, none: 4 };

function latestPerRepository(repositories) {
  return repositories
    .map((repo) => {
      const runs = runsOf(repo).sort(newestFirst);
      const run = runs[0] ?? null;
      return {
        name: repo.name,
        run,
        state: run ? buildState(run) : { key: 'none', tone: 'neutral', label: 'no run' },
        health: runHealth(runs),
      };
    })
    .sort(
      (a, b) =>
        LATEST_ORDER[a.state.key] - LATEST_ORDER[b.state.key] || a.name.localeCompare(b.name),
    );
}

function failureHistory(runs) {
  return runs.filter((run) => buildState(run).key === 'failed').sort(newestFirst);
}

function failureReasons(runs) {
  const tally = new Map();
  runs
    .filter((run) => buildState(run).key === 'failed')
    .forEach((run) => {
      const reason = buildState(run).label;
      tally.set(reason, (tally.get(reason) ?? 0) + 1);
    });
  return [...tally.entries()]
    .map(([reason, count_]) => ({ reason, runs: count_ }))
    .sort((a, b) => b.runs - a.runs);
}

function durations(repositories) {
  return repositories
    .map((repo) => {
      const lengths = runsOf(repo)
        .filter((run) => run.status === 'completed' && typeof run.seconds === 'number')
        .map((run) => run.seconds)
        .filter((seconds) => Number.isFinite(seconds) && seconds >= 0);
      return {
        name: repo.name,
        runs: lengths.length,
        middle: median(lengths),
        slowest: lengths.length === 0 ? null : Math.max(...lengths),
        fastest: lengths.length === 0 ? null : Math.min(...lengths),
      };
    })
    .filter((repo) => repo.runs > 0)
    .sort((a, b) => b.middle - a.middle);
}

function churn(pulls) {
  return pulls
    .filter((pull) => typeof pull.additions === 'number' && typeof pull.deletions === 'number')
    .map((pull) => ({ ...pull, lines: pull.additions + pull.deletions }))
    .sort((a, b) => b.lines - a.lines);
}

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

const rateTone = (rate) =>
  rate === null
    ? 'text-neutral-500'
    : rate === 100
      ? 'text-emerald-400'
      : rate >= 80
        ? 'text-amber-300'
        : 'text-rose-400';

function BuildRow({ run, state, repo, children }) {
  const length = took(run.seconds);
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-neutral-500 font-mono">{repo}</span>
          <Pill tone={state.tone}>{state.label}</Pill>
          {run.name && <span className="text-[11px] text-neutral-600 truncate">{run.name}</span>}
        </div>
        <p className="text-[13px] text-white font-medium leading-snug break-words mt-1.5">
          {run.subject || 'no commit message recorded'}
        </p>
        <p className="text-[11px] text-neutral-500 mt-1 tabular-nums">
          <span className="font-mono">{short(run.sha)}</span>
          {run.branch ? ` on ${run.branch}` : ''}
          {run.event ? ` · ${run.event}` : ''}
          {length ? ` · ${state.key === 'running' ? 'going' : 'took'} ${length}` : ''}
          {run.created ? ` · ${formatAgo(run.created)}` : ''}
        </p>
        {children}
      </div>
      <GithubLink
        href={run.url}
        title={
          state.key === 'failed'
            ? `Open the failed run for ${short(run.sha)} on GitHub`
            : 'Open this run on GitHub'
        }
      >
        {state.key === 'failed' ? 'LOGS' : 'OPEN'}
      </GithubLink>
    </div>
  );
}

export default function Performance({ data }) {
  const [full, setFull] = React.useState(false);
  const [allFailures, setAllFailures] = React.useState(false);
  const repositories = repositoriesIn(data);

  if (repositories.length === 0) {
    return (
      <Panel title="Performance" icon={Gauge}>
        <Empty>Nothing has been gathered yet. This fills in once the deploy has run.</Empty>
      </Panel>
    );
  }

  const runs = repositories.flatMap(runsOf);
  const pulls = repositories.flatMap((repo) =>
    listOf(repo, 'pulls').map((pull) => ({ ...pull, repo: repo.name })),
  );

  const health = runHealth(runs);
  const latest = latestPerRepository(repositories);
  const broken = failureHistory(runs);
  const reasons = failureReasons(runs);
  const lengths = durations(repositories);
  const sized = churn(pulls);
  const waiting = spread(pulls);

  const slowest = lengths[0]?.middle ?? 0;
  const lines = sized.reduce((sum, pull) => sum + pull.lines, 0);
  const ages = pulls
    .map((pull) => ageDays(pull.created))
    .filter((old) => old !== null)
    .sort((a, b) => b - a);
  const oldest = ages.length === 0 ? null : ages[0];
  const blocked = pulls.filter((pull) => pullVerdict(pull).tone === 'rose').length;
  const heaviest = sized[0]?.lines ?? 0;
  const failing = latest.filter((repo) => repo.state.key === 'failed');

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Builds passing"
          value={health.rate === null ? '—' : `${health.rate}%`}
          tone={rateTone(health.rate)}
          hint={
            health.settled === 0
              ? 'nothing has decided yet'
              : `${health.passed} of ${count(health.settled, 'build', 'builds')} that decided`
          }
        />
        <Figure
          label="Builds failed"
          value={health.failed}
          tone={health.failed === 0 ? 'text-emerald-400' : 'text-rose-400'}
          hint={
            health.running > 0
              ? `${count(health.running, 'build is', 'builds are')} still going`
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

      <Panel
        title="Latest build per repository"
        icon={Gauge}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone={health.passed > 0 ? 'green' : 'neutral'}>{health.passed} passed</Pill>
            <Pill tone={health.failed > 0 ? 'rose' : 'neutral'}>{health.failed} failed</Pill>
            {health.running > 0 && <Pill tone="amber">{health.running} running</Pill>}
          </span>
        }
      >
        {latest.map((repo) =>
          repo.run === null ? (
            <div
              key={repo.name}
              className="px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-neutral-500 font-mono">{repo.name}</span>
                <Pill tone="neutral">no run</Pill>
              </div>
              <p className="text-[12px] text-neutral-500 leading-relaxed mt-1.5">
                GitHub has recorded no workflow run for this repository. Nothing deploys off a
                repository with no run, so this is worth a look rather than a shrug.
              </p>
            </div>
          ) : (
            <BuildRow key={repo.name} run={repo.run} state={repo.state} repo={repo.name}>
              <p className="text-[11px] text-neutral-600 mt-1">
                {repo.health.settled === 0
                  ? 'nothing else here has decided yet'
                  : `${repo.health.passed}/${repo.health.settled} of the runs held for it passed${
                      repo.health.running > 0 ? ` · ${repo.health.running} still going` : ''
                    }`}
              </p>
            </BuildRow>
          ),
        )}
        <p className="px-4 sm:px-6 py-3 text-[11px] text-neutral-600 leading-relaxed">
          {failing.length > 0
            ? `${count(failing.length, 'repository is', 'repositories are')} sitting on a failed build. Open the run for the logs; nothing deploys off a red commit.`
            : 'Every repository’s newest run either passed or is still going.'}
          {health.undecided > 0
            ? ` ${count(health.undecided, 'run', 'runs')} decided nothing (skipped or superseded) and ${health.undecided === 1 ? 'is' : 'are'} left out of the rate.`
            : ''}
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Builds that did not pass"
          icon={TriangleAlert}
          action={
            broken.length > SHOWN ? (
              <button
                type="button"
                onClick={() => setAllFailures((held) => !held)}
                aria-expanded={allFailures}
                className="text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-500 hover:text-white transition-colors"
              >
                {allFailures ? 'Show less' : `All ${broken.length}`}
              </button>
            ) : (
              <Pill tone={broken.length === 0 ? 'green' : 'rose'}>
                {broken.length === 0 ? 'clear' : broken.length}
              </Pill>
            )
          }
        >
          {broken.length === 0 ? (
            <Empty>
              Every build the snapshot holds either passed or is still going. This fills in the
              moment one does not, newest first, each linking straight at its logs.
            </Empty>
          ) : (
            <>
              {(allFailures ? broken : broken.slice(0, SHOWN)).map((run) => (
                <BuildRow
                  key={`${run.repo}-${run.sha}-${run.created}`}
                  run={run}
                  state={buildState(run)}
                  repo={run.repo}
                />
              ))}
              <p className="px-4 sm:px-6 py-3 text-[11px] text-neutral-600 leading-relaxed">
                {count(broken.length, 'failure', 'failures')} in the{' '}
                {count(health.settled, 'build', 'builds')} that decided
                {reasons.length > 0
                  ? ` · ${reasons.map((reason) => `${reason.runs} ${reason.reason}`).join(', ')}`
                  : ''}
                . The collector keeps the last ten runs per repository, so this reaches back as far
                as those do and no further.
              </p>
            </>
          )}
        </Panel>

        <Panel
          title="How long builds take"
          icon={Timer}
          action={
            <Pill tone="neutral">
              {slowest === 0 ? 'no times' : `${took(slowest)} at worst`}
            </Pill>
          }
        >
          {lengths.length === 0 ? (
            <Empty>
              No finished run came back with a duration, so there is nothing to time. A run still
              going is left out on purpose — it would report however long it has been up to now.
            </Empty>
          ) : (
            <>
              {lengths.map((repo) => (
                <RankedBar
                  key={repo.name}
                  name={repo.name}
                  value={took(repo.middle)}
                  percent={slowest === 0 ? 0 : (repo.middle / slowest) * 100}
                  detail={`${took(repo.fastest)}–${took(repo.slowest)} across ${count(repo.runs, 'finished run', 'finished runs')}`}
                />
              ))}
              <p className="px-4 sm:px-6 py-3 text-[11px] text-neutral-600 leading-relaxed">
                The middle run rather than the average, so one build that hung does not make a fast
                pipeline look slow. The range beneath each is its fastest and slowest.
              </p>
            </>
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
        icon={Activity}
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
