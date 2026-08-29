import React from 'react';
import {
  ChartColumn,
  CircleDot,
  Clock,
  FileDiff,
  Radar,
  SquareActivity,
  Target,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { formatAgo, githubAvatarUrl } from '../../../lib/admin';
import { Empty, Figure, Notice, Panel, Pill, SearchInput, WindowSwitch } from '../ui';
import {
  GithubLink,
  commitByPerson,
  count,
  isPerson,
  listOf,
  pullVerdict,
  repositoriesIn,
  short,
} from './shared';

const DAY = 86400000;
const SHOWN = 6;

const WINDOWS = [
  { id: 4, label: '4w', title: 'The last four weeks' },
  { id: 12, label: '12w', title: 'The last twelve weeks' },
  { id: 26, label: '26w', title: 'Everything kept — about half a year' },
];

const SORTS = [
  { id: 'commits', label: 'Commits', title: 'Most commits in the window first' },
  { id: 'lines', label: 'Lines', title: 'Most lines added and removed first' },
  { id: 'net', label: 'Net', title: 'Largest net addition first' },
  { id: 'trend', label: 'Trend', title: 'Fastest rising first' },
  { id: 'recent', label: 'Recent', title: 'Most recent commit first' },
];

const SOURCES = [
  { id: 'read', label: 'Read', title: 'The commits in the snapshot, in your timezone' },
  { id: 'all', label: 'All time', title: 'Every commit ever, from the punch card' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WORKDAY = [9, 18];

const num = (value) => (typeof value === 'number' ? value.toLocaleString('en-GB') : '—');

const signed = (value) =>
  typeof value !== 'number'
    ? '—'
    : `${value > 0 ? '+' : value < 0 ? '−' : ''}${num(Math.abs(value))}`;

const key = (login) => String(login ?? '').toLowerCase();

const accountOf = (commit) => (commit.login ? key(commit.login) : null);

const spell = (seconds) => {
  if (typeof seconds !== 'number' || seconds <= 0) return '—';
  if (seconds < 90) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${minutes.toFixed(minutes < 10 ? 1 : 0)}m`;
  return `${(minutes / 60).toFixed(1)}h`;
};

const dateLabel = (week) => {
  const parsed = Date.parse(`${week}T00:00:00Z`);
  return Number.isNaN(parsed)
    ? week
    : new Date(parsed).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

function everything(repositories) {
  return {
    stats: repositories.flatMap((repo) =>
      listOf(repo, 'stats')
        .filter((row) => isPerson(row.login))
        .map((row) => ({ ...row, repo: repo.name })),
    ),
    commits: repositories
      .flatMap((repo) => listOf(repo, 'commits').map((commit) => ({ ...commit, repo: repo.name })))
      .filter((commit) => commit.at && commitByPerson(commit))
      .sort((a, b) => b.at.localeCompare(a.at)),
    pulls: repositories.flatMap((repo) =>
      listOf(repo, 'pulls')
        .filter((pull) => isPerson(pull.author))
        .map((pull) => ({ ...pull, repo: repo.name })),
    ),
    issues: repositories.flatMap((repo) =>
      listOf(repo, 'issues')
        .filter((issue) => isPerson(issue.author))
        .map((issue) => ({ ...issue, repo: repo.name })),
    ),
    runs: repositories.flatMap((repo) =>
      listOf(repo, 'runs').map((run) => ({ ...run, repo: repo.name })),
    ),
    punch: repositories.flatMap((repo) => listOf(repo, 'punch')),
  };
}

function weekAxis(stats, span) {
  const seen = new Set();
  stats.forEach((row) =>
    listOf(row, 'weeks').forEach((week) => {
      if (week.week) seen.add(week.week);
    }),
  );
  return [...seen].sort().slice(-span);
}

const blank = () => ({ commits: 0, added: 0, removed: 0 });

function trendOf(series) {
  if (series.length < 4) return null;
  const half = Math.floor(series.length / 2);
  const prior = series.slice(0, half).reduce((sum, week) => sum + week.commits, 0);
  const recent = series.slice(half).reduce((sum, week) => sum + week.commits, 0);
  if (prior === 0 && recent === 0) return null;
  if (prior === 0) return { pct: null, prior, recent, up: true };
  return { pct: Math.round(((recent - prior) / prior) * 100), prior, recent, up: recent >= prior };
}

function streakOf(series) {
  let current = 0;
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index].commits === 0) break;
    current += 1;
  }
  let best = 0;
  let run = 0;
  series.forEach((week) => {
    run = week.commits > 0 ? run + 1 : 0;
    if (run > best) best = run;
  });
  return { current, best, active: series.filter((week) => week.commits > 0).length };
}

function board(stats, axis) {
  const inside = new Set(axis);
  const tally = new Map();

  stats.forEach((row) => {
    const id = key(row.login);
    if (!id) return;
    const held = tally.get(id) ?? {
      id,
      login: row.login,
      url: row.url,
      repos: new Set(),
      ever: 0,
      weeks: new Map(),
      byRepo: new Map(),
      ...blank(),
    };
    held.repos.add(row.repo);
    held.ever += row.commits ?? 0;
    listOf(row, 'weeks').forEach((week) => {
      if (!inside.has(week.week)) return;
      held.commits += week.commits ?? 0;
      held.added += week.added ?? 0;
      held.removed += week.removed ?? 0;
      const at = held.weeks.get(week.week) ?? blank();
      at.commits += week.commits ?? 0;
      at.added += week.added ?? 0;
      at.removed += week.removed ?? 0;
      held.weeks.set(week.week, at);
      const here = held.byRepo.get(row.repo) ?? blank();
      here.commits += week.commits ?? 0;
      here.added += week.added ?? 0;
      here.removed += week.removed ?? 0;
      held.byRepo.set(row.repo, here);
    });
    tally.set(id, held);
  });

  return [...tally.values()].map((person) => {
    const series = axis.map((week) => person.weeks.get(week) ?? blank());
    return {
      ...person,
      repos: [...person.repos].sort(),
      lines: person.added + person.removed,
      net: person.added - person.removed,
      series,
      trend: trendOf(series),
      streak: streakOf(series),
      last: null,
    };
  });
}

function fallbackBoard(commits) {
  const tally = new Map();
  commits.forEach((commit) => {
    const id = accountOf(commit) || key(commit.author) || 'unknown';
    const held = tally.get(id) ?? {
      id,
      login: commit.login || commit.author || 'unknown',
      url: null,
      repos: new Set(),
      byRepo: new Map(),
      ever: null,
      commits: 0,
      added: null,
      removed: null,
      lines: null,
      net: null,
      series: null,
      trend: null,
      streak: null,
      last: commit,
    };
    held.commits += 1;
    held.repos.add(commit.repo);
    const here = held.byRepo.get(commit.repo) ?? blank();
    here.commits += 1;
    held.byRepo.set(commit.repo, here);
    if (commit.at > held.last.at) held.last = commit;
    tally.set(id, held);
  });
  return [...tally.values()].map((person) => ({ ...person, repos: [...person.repos].sort() }));
}

function openWork(all) {
  const pullsBy = new Map();
  const issuesBy = new Map();
  const assigned = new Map();
  const reviews = new Map();
  const last = new Map();

  const push = (map, id, item) => {
    if (!id) return;
    map.set(id, [...(map.get(id) ?? []), item]);
  };

  all.pulls.forEach((pull) => {
    push(pullsBy, key(pull.author), pull);
    (pull.reviewers ?? []).forEach((login) => push(reviews, key(login), pull));
  });
  all.issues.forEach((issue) => {
    push(issuesBy, key(issue.author), issue);
    (issue.assignees ?? []).forEach((login) => push(assigned, key(login), issue));
  });
  all.commits.forEach((commit) => {
    const id = accountOf(commit);
    if (!id) return;
    if (!last.has(id) || commit.at > last.get(id).at) last.set(id, commit);
  });

  return { pullsBy, issuesBy, assigned, reviews, last };
}

const emptyGrid = () => Array.from({ length: 7 }, () => new Array(24).fill(0));

function sampleGrid(commits) {
  const grid = emptyGrid();
  const stamps = [];
  commits.forEach((commit) => {
    const parsed = Date.parse(commit.at);
    if (Number.isNaN(parsed)) return;
    const when = new Date(parsed);
    grid[when.getDay()][when.getHours()] += 1;
    stamps.push(parsed);
  });
  return { grid, span: stamps.length < 2 ? null : Math.max(...stamps) - Math.min(...stamps) };
}

function punchGrid(punch, shift) {
  const grid = emptyGrid();
  punch.forEach((bucket) => {
    const moved = bucket.hour + shift;
    const hour = ((moved % 24) + 24) % 24;
    const day = (((bucket.day + Math.floor(moved / 24)) % 7) + 7) % 7;
    grid[day][hour] += bucket.commits;
  });
  return { grid, span: null };
}

function summarise(grid) {
  let placed = 0;
  let offHours = 0;
  let weekend = 0;
  const hours = new Array(24).fill(0);

  grid.forEach((row, day) =>
    row.forEach((value, hour) => {
      if (value === 0) return;
      placed += value;
      hours[hour] += value;
      if (hour < WORKDAY[0] || hour >= WORKDAY[1]) offHours += value;
      if (day === 0 || day === 6) weekend += value;
    }),
  );

  return {
    placed,
    offHours,
    weekend,
    busiest: placed === 0 ? null : hours.indexOf(Math.max(...hours)),
    peak: Math.max(1, ...grid.flat()),
  };
}

function byRepository(repositories, axis) {
  const inside = new Set(axis);
  return repositories
    .map((repo) => {
      const rows = listOf(repo, 'stats').filter((row) => isPerson(row.login));
      const people = new Set();
      const totals = rows.reduce((sum, row) => {
        listOf(row, 'weeks').forEach((week) => {
          if (!inside.has(week.week)) return;
          sum.commits += week.commits ?? 0;
          sum.added += week.added ?? 0;
          sum.removed += week.removed ?? 0;
          if ((week.commits ?? 0) > 0) people.add(key(row.login));
        });
        return sum;
      }, blank());
      return {
        name: repo.name,
        commits: totals.commits,
        added: totals.added,
        removed: totals.removed,
        lines: totals.added + totals.removed,
        people: people.size,
      };
    })
    .sort((a, b) => b.lines - a.lines || b.commits - a.commits);
}

function concentration(people, total) {
  if (total === 0 || people.length === 0) return null;
  const shares = people.map((person) => person.commits).sort((a, b) => b - a);
  let carried = 0;
  let carriers = 0;
  for (const share of shares) {
    if (carried >= total * 0.8) break;
    carried += share;
    carriers += 1;
  }
  return { top: Math.round((shares[0] / total) * 100), carriers };
}

function ciTimes(runs) {
  const timed = runs.filter((run) => typeof run.seconds === 'number' && run.seconds > 0);
  if (timed.length === 0) return null;

  const byName = new Map();
  timed.forEach((run) => {
    const name = run.name || 'unnamed workflow';
    const held = byName.get(name) ?? { name, runs: 0, seconds: 0, worst: 0 };
    held.runs += 1;
    held.seconds += run.seconds;
    if (run.seconds > held.worst) held.worst = run.seconds;
    byName.set(name, held);
  });

  const ordered = [...timed].sort((a, b) => b.seconds - a.seconds);
  const middle = timed.map((run) => run.seconds).sort((a, b) => a - b);
  const total = timed.reduce((sum, run) => sum + run.seconds, 0);

  return {
    runs: timed.length,
    average: total / timed.length,
    median: middle[Math.floor(middle.length / 2)],
    slowest: ordered[0],
    spent: total,
    workflows: [...byName.values()]
      .map((flow) => ({ ...flow, average: flow.seconds / flow.runs }))
      .sort((a, b) => b.average - a.average),
  };
}

function Avatar({ login, size = 'h-8 w-8' }) {
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
      className={`${size} rounded-full border border-[#282832] bg-[#111115] shrink-0 flex items-center justify-center text-[10px] font-semibold text-neutral-500 uppercase`}
    >
      {String(login ?? '?').slice(0, 1)}
    </span>
  );
}

function SplitBar({ added, removed, peak }) {
  const width = (value) =>
    peak > 0 ? Math.min(100, Math.max(value > 0 ? 1.5 : 0, (value / peak) * 100)) : 0;
  return (
    <div className="flex h-1.5 w-full bg-[#1c1c22]">
      <span className="bg-emerald-500/70" style={{ width: `${width(added)}%` }} />
      <span className="bg-rose-500/60" style={{ width: `${width(removed)}%` }} />
    </div>
  );
}

function Tip({ index, length, children }) {
  return (
    <span
      className={`pointer-events-none absolute bottom-full mb-2 z-20 hidden group-hover:block whitespace-nowrap border border-[#282832] bg-[#111115] px-2.5 py-1.5 ${
        index < 3 ? 'left-0' : index > length - 4 ? 'right-0' : 'left-1/2 -translate-x-1/2'
      }`}
    >
      {children}
    </span>
  );
}

function Columns({ series, labels, peak, height = 34, tone = 'bg-purple-500/70' }) {
  return (
    <div className="flex items-end gap-[2px] w-full" style={{ height }}>
      {series.map((value, index) => (
        <div key={index} className="group relative flex-1 h-full flex items-end">
          <span
            className={`w-full rounded-t-[3px] transition-colors ${
              value > 0 ? `${tone} group-hover:brightness-125` : 'bg-[#1c1c22]'
            }`}
            style={{
              height: `${peak > 0 ? Math.max(value > 0 ? 10 : 4, (value / peak) * 100) : 4}%`,
            }}
          />
          {labels && (
            <Tip index={index} length={series.length}>
              <span className="block text-[12px] text-white font-medium tabular-nums leading-none">
                {num(value)}
              </span>
              <span className="block text-[10px] text-neutral-500 mt-1 leading-none">
                {labels[index]}
              </span>
            </Tip>
          )}
        </div>
      ))}
    </div>
  );
}

function StackColumns({ series, labels, peak, height = 44 }) {
  return (
    <div className="flex items-end gap-[2px] w-full" style={{ height }}>
      {series.map((week, index) => {
        const total = week.added + week.removed;
        const tall = peak > 0 ? Math.max(total > 0 ? 10 : 4, (total / peak) * 100) : 4;
        const cut = total > 0 ? (week.added / total) * 100 : 0;
        return (
          <div key={index} className="group relative flex-1 h-full flex items-end">
            <span
              className="w-full rounded-t-[3px] overflow-hidden flex flex-col justify-end"
              style={{ height: `${tall}%` }}
            >
              {total === 0 ? (
                <span className="w-full h-full bg-[#1c1c22]" />
              ) : (
                <>
                  <span className="w-full bg-emerald-500/60" style={{ height: `${cut}%` }} />
                  <span className="w-full bg-rose-500/50" style={{ height: `${100 - cut}%` }} />
                </>
              )}
            </span>
            {labels && (
              <Tip index={index} length={series.length}>
                <span className="block text-[12px] tabular-nums leading-none">
                  <span className="text-emerald-400">+{num(week.added)}</span>{' '}
                  <span className="text-rose-400">−{num(week.removed)}</span>
                </span>
                <span className="block text-[10px] text-neutral-500 mt-1 leading-none">
                  {labels[index]}
                </span>
              </Tip>
            )}
          </div>
        );
      })}
    </div>
  );
}

const HEAT = [
  'bg-[#15151b]',
  'bg-purple-500/25',
  'bg-purple-500/45',
  'bg-purple-500/65',
  'bg-purple-400/90',
];

function HeatGrid({ grid, peak }) {
  return (
    <div className="min-w-[540px]">
      <div className="flex gap-[3px] pl-9 mb-1.5">
        {Array.from({ length: 24 }, (unused, hour) => (
          <span
            key={hour}
            className="flex-1 text-[9px] text-neutral-600 tabular-nums text-center leading-none"
          >
            {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
          </span>
        ))}
      </div>
      {grid.map((row, day) => (
        <div key={day} className="flex items-center gap-[3px] mb-[3px]">
          <span className="w-9 shrink-0 text-[10px] text-neutral-600 tracking-wide">
            {DAYS[day]}
          </span>
          {row.map((value, hour) => (
            <div key={hour} className="group relative flex-1">
              <span
                className={`block h-4 rounded-[2px] ${
                  value === 0
                    ? HEAT[0]
                    : HEAT[Math.min(HEAT.length - 1, Math.ceil((value / peak) * (HEAT.length - 1)))]
                }`}
              />
              <span
                className={`pointer-events-none absolute bottom-full mb-2 z-20 hidden group-hover:block whitespace-nowrap border border-[#282832] bg-[#111115] px-2.5 py-1.5 ${
                  hour < 4 ? 'left-0' : hour > 19 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                }`}
              >
                <span className="block text-[12px] text-white font-medium tabular-nums leading-none">
                  {count(value, 'commit', 'commits')}
                </span>
                <span className="block text-[10px] text-neutral-500 mt-1 leading-none">
                  {DAYS[day]} {String(hour).padStart(2, '0')}:00
                </span>
              </span>
            </div>
          ))}
        </div>
      ))}
      <div className="flex items-center gap-2 pl-9 mt-3">
        <span className="text-[10px] text-neutral-600">quiet</span>
        {HEAT.map((shade) => (
          <span key={shade} className={`h-2.5 w-5 rounded-[2px] ${shade}`} />
        ))}
        <span className="text-[10px] text-neutral-600">busiest {num(peak)}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-neutral-300' }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`text-[13px] font-medium tabular-nums ${tone}`}>{value}</span>
      <span className="text-[10px] text-neutral-600 tracking-[0.1em] uppercase">{label}</span>
    </span>
  );
}

function Trend({ trend }) {
  if (!trend) return null;
  if (trend.pct === null) return <Pill tone="purple">new</Pill>;
  if (trend.pct === 0) return <Pill tone="neutral">steady</Pill>;
  return (
    <Pill tone={trend.up ? 'green' : 'amber'}>
      {trend.up ? '▲' : '▼'} {Math.abs(trend.pct)}%
    </Pill>
  );
}

function Detail({ title, items, empty, render }) {
  return (
    <div className="border border-[#1c1c22] bg-[#0c0c10]">
      <p className="px-3 py-2 text-[10px] font-semibold text-neutral-500 tracking-[0.16em] uppercase border-b border-[#1c1c22]">
        {title}
        {items.length > 0 ? ` · ${items.length}` : ''}
      </p>
      {items.length === 0 ? (
        <p className="px-3 py-3 text-[12px] text-neutral-600">{empty}</p>
      ) : (
        items.map((item, index) => (
          <div
            key={`${item.repo}-${item.number}-${index}`}
            className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 py-2.5 border-b border-[#141419] last:border-b-0"
          >
            {render(item)}
          </div>
        ))
      )}
    </div>
  );
}

function Person({ person, axis, peak, linePeak, share, work, open, onToggle }) {
  const mine = {
    pulls: work.pullsBy.get(person.id) ?? [],
    issues: work.issuesBy.get(person.id) ?? [],
    assigned: work.assigned.get(person.id) ?? [],
    reviews: work.reviews.get(person.id) ?? [],
    last: person.last ?? work.last.get(person.id) ?? null,
  };
  const waiting = mine.pulls.length + mine.assigned.length + mine.reviews.length;
  const labels = axis.map((week) => `week of ${dateLabel(week)}`);
  const weekLinePeak = Math.max(1, ...(person.series ?? []).map((w) => w.added + w.removed));

  return (
    <div className="border-b border-[#17171d] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left px-4 sm:px-6 py-4 hover:bg-[#0d0d11] transition-colors"
      >
        <div className="flex items-start gap-3 sm:gap-4">
          <Avatar login={person.login} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="text-[13px] text-white font-medium break-all">{person.login}</span>
              <Trend trend={person.trend} />
              {person.streak && person.streak.current > 1 && (
                <Pill tone="neutral">{person.streak.current} weeks running</Pill>
              )}
              {waiting > 0 && (
                <Pill tone={mine.reviews.length > 0 ? 'amber' : 'neutral'}>
                  {count(waiting, 'open item', 'open items')}
                </Pill>
              )}
            </div>

            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-2">
              <Stat label="commits" value={num(person.commits)} tone="text-white" />
              <Stat
                label="added"
                value={person.added === null ? '—' : `+${num(person.added)}`}
                tone={person.added === null ? 'text-neutral-600' : 'text-emerald-400'}
              />
              <Stat
                label="removed"
                value={person.removed === null ? '—' : `−${num(person.removed)}`}
                tone={person.removed === null ? 'text-neutral-600' : 'text-rose-400'}
              />
              <Stat
                label="net"
                value={signed(person.net)}
                tone={
                  person.net === null
                    ? 'text-neutral-600'
                    : person.net >= 0
                      ? 'text-neutral-300'
                      : 'text-amber-300'
                }
              />
              <Stat label="prs" value={mine.pulls.length} />
              <Stat label="issues" value={mine.issues.length} />
              <Stat
                label="reviews"
                value={mine.reviews.length}
                tone={mine.reviews.length > 0 ? 'text-amber-300' : 'text-neutral-300'}
              />
            </div>

            {person.lines !== null && (
              <div className="mt-2.5 max-w-md">
                <SplitBar added={person.added} removed={person.removed} peak={linePeak} />
              </div>
            )}

            <p className="text-[11px] text-neutral-600 mt-2 truncate">
              {share > 0 ? `${share}% of the window · ` : ''}
              {person.repos.join(', ')}
              {person.streak ? ` · active ${person.streak.active}/${axis.length} weeks` : ''}
              {person.ever !== null && person.ever > person.commits
                ? ` · ${num(person.ever)} commits all told`
                : ''}
              {mine.last
                ? ` · last commit ${formatAgo(mine.last.at)}`
                : ' · no commit in what was read'}
            </p>
          </div>

          {person.series && (
            <div className="hidden sm:block w-32 lg:w-44 shrink-0 pt-1">
              <Columns
                series={person.series.map((week) => week.commits)}
                labels={labels}
                peak={peak}
                height={30}
              />
              <p className="text-[10px] text-neutral-600 text-right mt-1.5 tabular-nums">
                {count(axis.length, 'week', 'weeks')}
              </p>
            </div>
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 sm:px-6 pb-5 space-y-3">
          {person.series && (
            <div className="border border-[#1c1c22] bg-[#0c0c10] px-3 py-3 space-y-3">
              <div>
                <p className="text-[10px] text-neutral-500 tracking-[0.16em] uppercase mb-2">
                  Their commits a week
                </p>
                <Columns
                  series={person.series.map((week) => week.commits)}
                  labels={labels}
                  peak={peak}
                  height={38}
                />
              </div>
              <div>
                <p className="text-[10px] text-neutral-500 tracking-[0.16em] uppercase mb-2">
                  Their lines a week
                </p>
                <StackColumns series={person.series} labels={labels} peak={weekLinePeak} />
              </div>
            </div>
          )}

          {person.byRepo.size > 0 && (
            <div className="border border-[#1c1c22] bg-[#0c0c10]">
              <p className="px-3 py-2 text-[10px] font-semibold text-neutral-500 tracking-[0.16em] uppercase border-b border-[#1c1c22]">
                Split by repository
              </p>
              {[...person.byRepo.entries()]
                .sort((a, b) => b[1].commits - a[1].commits)
                .map(([name, where]) => (
                  <div
                    key={name}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2.5 border-b border-[#141419] last:border-b-0"
                  >
                    <span className="text-[12px] text-neutral-300 flex-1 truncate">{name}</span>
                    <Stat label="commits" value={num(where.commits)} />
                    {person.added !== null && (
                      <span className="text-[11px] tabular-nums">
                        <span className="text-emerald-400">+{num(where.added)}</span>{' '}
                        <span className="text-rose-400">−{num(where.removed)}</span>
                      </span>
                    )}
                  </div>
                ))}
            </div>
          )}

          <Detail
            title="Pull requests they opened"
            items={mine.pulls}
            empty="Nothing of theirs is open."
            render={(pull) => (
              <>
                <span className="text-[11px] text-neutral-500 font-mono shrink-0">
                  {pull.repo} #{pull.number}
                </span>
                <span className="text-[12px] text-neutral-300 truncate flex-1">{pull.title}</span>
                <span className="text-[11px] tabular-nums shrink-0">
                  {typeof pull.additions === 'number' ? (
                    <>
                      <span className="text-emerald-400">+{num(pull.additions)}</span>{' '}
                      <span className="text-rose-400">−{num(pull.deletions)}</span>
                    </>
                  ) : (
                    <span className="text-neutral-600">size unread</span>
                  )}
                </span>
                <Pill tone={pullVerdict(pull).tone}>{pullVerdict(pull).label}</Pill>
                <GithubLink href={pull.url} />
              </>
            )}
          />
          <Detail
            title="Waiting on them to review"
            items={mine.reviews}
            empty="Nobody has asked them to read anything."
            render={(pull) => (
              <>
                <span className="text-[11px] text-neutral-500 font-mono shrink-0">
                  {pull.repo} #{pull.number}
                </span>
                <span className="text-[12px] text-neutral-300 truncate flex-1">{pull.title}</span>
                <span className="text-[11px] text-neutral-600 shrink-0">
                  opened {formatAgo(pull.created)}
                </span>
                <GithubLink href={pull.url} />
              </>
            )}
          />
          <Detail
            title="Issues assigned to them"
            items={mine.assigned}
            empty="None assigned."
            render={(issue) => (
              <>
                <span className="text-[11px] text-neutral-500 font-mono shrink-0">
                  {issue.repo} #{issue.number}
                </span>
                <span className="text-[12px] text-neutral-300 truncate flex-1">{issue.title}</span>
                <span className="text-[11px] text-neutral-600 shrink-0">
                  open {formatAgo(issue.created)}
                </span>
                <GithubLink href={issue.url} />
              </>
            )}
          />
        </div>
      )}
    </div>
  );
}

function Tally({ title, rows, empty }) {
  return (
    <div className="bg-[#0a0a0d] px-4 sm:px-6 py-4">
      <p className="text-[10px] text-neutral-500 tracking-[0.16em] uppercase mb-3">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[12px] text-neutral-600">{empty}</p>
      ) : (
        rows.map(([id, items]) => (
          <div key={id} className="flex items-center gap-2.5 py-1.5">
            <Avatar login={items[0].author} size="h-5 w-5" />
            <span className="text-[12px] text-neutral-300 truncate flex-1">
              {items[0].author ?? 'unknown'}
            </span>
            <span className="text-[12px] text-white tabular-nums">{items.length}</span>
          </div>
        ))
      )}
    </div>
  );
}

const SHARE_TONES = [
  'bg-purple-500/80',
  'bg-emerald-500/70',
  'bg-sky-500/70',
  'bg-amber-500/70',
  'bg-rose-500/70',
  'bg-neutral-500/70',
];

export default function Tracking({ data }) {
  const [span, setSpan] = React.useState(12);
  const [sort, setSort] = React.useState('commits');
  const [source, setSource] = React.useState('read');
  const [query, setQuery] = React.useState('');
  const [opened, setOpened] = React.useState(null);
  const [full, setFull] = React.useState(false);
  const repositories = repositoriesIn(data);

  if (repositories.length === 0) {
    return (
      <Panel title="Performance tracking" icon={Radar}>
        <Empty>Nothing has been gathered yet. This fills in once the deploy has run.</Empty>
      </Panel>
    );
  }

  const all = everything(repositories);
  const measured = all.stats.length > 0;
  const axis = weekAxis(all.stats, span);
  const work = openWork(all);
  const everybody = measured ? board(all.stats, axis) : fallbackBoard(all.commits);
  const repos = byRepository(repositories, axis);
  const ci = ciTimes(all.runs);

  const commits = everybody.reduce((sum, person) => sum + person.commits, 0);
  const added = measured ? everybody.reduce((sum, person) => sum + person.added, 0) : null;
  const removed = measured ? everybody.reduce((sum, person) => sum + person.removed, 0) : null;
  const active = everybody.filter((person) => person.commits > 0).length;
  const spread = concentration(everybody, commits);

  const rising = (person) =>
    person.trend ? (person.trend.pct === null ? Infinity : person.trend.pct) : -Infinity;
  const seen = (person) => (person.last ?? work.last.get(person.id))?.at ?? '';

  const wanted = query.trim().toLowerCase();
  const ranked = [...everybody]
    .filter((person) => wanted === '' || person.login.toLowerCase().includes(wanted))
    .sort((a, b) => {
      if (sort === 'lines') return (b.lines ?? 0) - (a.lines ?? 0) || b.commits - a.commits;
      if (sort === 'net') return (b.net ?? 0) - (a.net ?? 0) || b.commits - a.commits;
      if (sort === 'trend') return rising(b) - rising(a) || b.commits - a.commits;
      if (sort === 'recent') return seen(b).localeCompare(seen(a)) || b.commits - a.commits;
      return b.commits - a.commits || (b.lines ?? 0) - (a.lines ?? 0);
    });

  const weekly = axis.map((unused, index) => ({
    commits: everybody.reduce((sum, person) => sum + (person.series?.[index]?.commits ?? 0), 0),
    added: everybody.reduce((sum, person) => sum + (person.series?.[index]?.added ?? 0), 0),
    removed: everybody.reduce((sum, person) => sum + (person.series?.[index]?.removed ?? 0), 0),
  }));
  const weekPeak = Math.max(1, ...weekly.map((week) => week.commits));
  const weekLinePeak = Math.max(1, ...weekly.map((week) => week.added + week.removed));
  const personPeak = Math.max(
    1,
    ...everybody.flatMap((person) => (person.series ?? []).map((week) => week.commits)),
  );
  const personLinePeak = Math.max(1, ...everybody.map((person) => person.lines ?? 0));
  const repoPeak = Math.max(1, ...repos.map((repo) => repo.lines));
  const matrixPeak = Math.max(
    1,
    ...everybody.flatMap((person) => [...person.byRepo.values()].map((where) => where.commits)),
  );

  const offset = Math.round(-new Date().getTimezoneOffset() / 60);
  const heat =
    source === 'all' && all.punch.length > 0 ? punchGrid(all.punch, offset) : sampleGrid(all.commits);
  const when = summarise(heat.grid);

  const listed = full ? ranked : ranked.slice(0, SHOWN);
  const labels = axis.map((week) => `week of ${dateLabel(week)}`);
  const shares = [...everybody]
    .filter((person) => person.commits > 0)
    .sort((a, b) => b.commits - a.commits);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[12px] text-neutral-500">
          {measured
            ? `Commits and lines are ${count(axis.length, 'week', 'weeks')} of history, per person. Open work is however things stand right now.`
            : 'Commits are from the recent listing. Lines fill in once the deploy has run again.'}
        </p>
        <div className="ml-auto">
          <WindowSwitch
            options={WINDOWS}
            active={span}
            onPick={setSpan}
            disabled={!measured}
            label="How far back"
          />
        </div>
      </div>

      {!measured && (
        <Notice tone="amber">
          The weekly contributor statistics are not in the snapshot yet. They are gathered by the
          deploy, so they appear on the first tick after it next runs — and GitHub itself takes a
          moment to work them out the first time they are asked for, so it may take two. Until then
          this board shows commits from the recent listing and no line counts.
        </Notice>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Commits"
          value={num(commits)}
          tone={commits > 0 ? 'text-white' : 'text-neutral-500'}
          hint={
            measured
              ? `over ${count(axis.length, 'week', 'weeks')}, across ${count(repos.length, 'repository', 'repositories')}`
              : `from the ${all.commits.length} read`
          }
        />
        <Figure
          label="Lines edited"
          value={added === null ? '—' : num(added + removed)}
          tone={added === null ? 'text-neutral-500' : 'text-white'}
          hint={
            added === null ? 'not gathered yet' : `+${num(added)} added · −${num(removed)} removed`
          }
        />
        <Figure
          label="Net change"
          value={added === null ? '—' : signed(added - removed)}
          tone={
            added === null
              ? 'text-neutral-500'
              : added - removed >= 0
                ? 'text-emerald-400'
                : 'text-amber-300'
          }
          hint={
            added === null
              ? 'not gathered yet'
              : added === 0
                ? 'nothing was added'
                : `${Math.round((removed / added) * 100)}% of what went in came back out`
          }
        />
        <Figure
          label="Open on somebody"
          value={all.pulls.length + all.issues.length}
          tone={all.pulls.length + all.issues.length === 0 ? 'text-emerald-400' : 'text-white'}
          hint={`${count(all.pulls.length, 'pull request', 'pull requests')} · ${count(all.issues.length, 'issue', 'issues')}`}
        />
      </div>

      <Panel
        title="Who carried the window"
        icon={Target}
        action={
          <Pill tone={spread === null ? 'neutral' : spread.top > 80 ? 'amber' : 'neutral'}>
            {spread === null ? 'no commits' : `${spread.top}% top`}
          </Pill>
        }
      >
        {commits === 0 ? (
          <Empty>Nothing was committed in this window, so there is no share to divide.</Empty>
        ) : (
          <div className="px-4 sm:px-6 py-5">
            <div className="flex h-3 w-full bg-[#1c1c22] overflow-hidden">
              {shares.map((person, index) => (
                <span
                  key={person.id}
                  title={`${person.login} — ${count(person.commits, 'commit', 'commits')}`}
                  className={SHARE_TONES[index % SHARE_TONES.length]}
                  style={{ width: `${(person.commits / commits) * 100}%` }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
              {shares.map((person, index) => (
                <span key={person.id} className="inline-flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-[2px] ${SHARE_TONES[index % SHARE_TONES.length]}`}
                  />
                  <span className="text-[12px] text-neutral-300">{person.login}</span>
                  <span className="text-[12px] text-neutral-500 tabular-nums">
                    {Math.round((person.commits / commits) * 100)}%
                  </span>
                </span>
              ))}
            </div>
            <p className="text-[11px] text-neutral-600 mt-4">
              {active} of {everybody.length} committed here.
              {spread
                ? ` The busiest wrote ${spread.top}% of them, and ${spread.carriers === 1 ? 'one person accounts' : `${spread.carriers} people account`} for four fifths of the total.`
                : ''}
              {spread && spread.top > 80
                ? ' One person that far ahead is a bus factor, not a compliment.'
                : ''}
            </p>
          </div>
        )}
      </Panel>

      <Panel
        title="Week by week"
        icon={ChartColumn}
        action={<Pill tone={commits > 0 ? 'purple' : 'neutral'}>{num(commits)} commits</Pill>}
      >
        {!measured || axis.length === 0 ? (
          <Empty>
            No weekly statistics have been gathered yet, so there is no history to draw. The board
            below still knows who has been committing.
          </Empty>
        ) : (
          <div className="px-4 sm:px-6 py-5 space-y-5">
            <div>
              <p className="text-[10px] text-neutral-500 tracking-[0.16em] uppercase mb-2">
                Commits
              </p>
              <Columns
                series={weekly.map((week) => week.commits)}
                labels={labels}
                peak={weekPeak}
                height={56}
              />
            </div>
            <div>
              <p className="text-[10px] text-neutral-500 tracking-[0.16em] uppercase mb-2">
                Lines, added over removed
              </p>
              <StackColumns series={weekly} labels={labels} peak={weekLinePeak} height={48} />
            </div>
            <div className="flex justify-between text-[10px] text-neutral-600 tabular-nums">
              <span>week of {dateLabel(axis[0])}</span>
              <span>week of {dateLabel(axis[axis.length - 1])}</span>
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="The board"
        icon={Users}
        action={
          ranked.length > SHOWN ? (
            <button
              type="button"
              onClick={() => setFull((held) => !held)}
              aria-expanded={full}
              className="text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-500 hover:text-white transition-colors"
            >
              {full ? 'Show less' : `All ${ranked.length}`}
            </button>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 border-b border-[#17171d]">
          <div className="w-full sm:w-56">
            <SearchInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a person"
              aria-label="Find a person on the board"
            />
          </div>
          <div className="ml-auto">
            <WindowSwitch options={SORTS} active={sort} onPick={setSort} label="Sort the board" />
          </div>
        </div>

        {ranked.length === 0 ? (
          <Empty>
            {everybody.length === 0
              ? 'Nobody has committed to any of these repositories in what has been read. That is either a quiet window or a collector that has not run — the age at the top of the page says which.'
              : `Nobody on the board matches that.`}
          </Empty>
        ) : (
          listed.map((person) => (
            <Person
              key={person.id}
              person={person}
              axis={axis}
              peak={personPeak}
              linePeak={personLinePeak}
              share={commits === 0 ? 0 : Math.round((person.commits / commits) * 100)}
              work={work}
              open={opened === person.id}
              onToggle={() => setOpened((held) => (held === person.id ? null : person.id))}
            />
          ))
        )}
      </Panel>

      <Panel title="Who works where" icon={SquareActivity}>
        {!measured || repos.length === 0 || everybody.length === 0 ? (
          <Empty>This fills in once the weekly statistics have been gathered.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-4 sm:px-6 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.16em] uppercase">
                    Person
                  </th>
                  {repos.map((repo) => (
                    <th
                      key={repo.name}
                      className="text-right px-3 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.12em] uppercase whitespace-nowrap"
                    >
                      {repo.name.replace(/^amitista-/, '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...everybody]
                  .sort((a, b) => b.commits - a.commits)
                  .map((person) => (
                    <tr key={person.id} className="border-t border-[#17171d]">
                      <td className="px-4 sm:px-6 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <Avatar login={person.login} size="h-5 w-5" />
                          <span className="text-[12px] text-neutral-300 truncate">
                            {person.login}
                          </span>
                        </span>
                      </td>
                      {repos.map((repo) => {
                        const where = person.byRepo.get(repo.name);
                        const weight = where ? where.commits / matrixPeak : 0;
                        return (
                          <td key={repo.name} className="px-3 py-2.5 text-right">
                            <span
                              className={`inline-block min-w-9 px-2 py-1 rounded-[2px] text-[12px] tabular-nums ${
                                !where || where.commits === 0
                                  ? 'text-neutral-700'
                                  : weight > 0.6
                                    ? 'bg-purple-500/40 text-white'
                                    : weight > 0.25
                                      ? 'bg-purple-500/20 text-neutral-200'
                                      : 'bg-purple-500/10 text-neutral-300'
                              }`}
                            >
                              {where && where.commits > 0 ? num(where.commits) : '·'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="When the work happens"
        icon={Clock}
        action={
          <div className="flex items-center gap-3">
            <Pill tone="neutral">
              {when.busiest === null
                ? 'no times'
                : `busiest ${String(when.busiest).padStart(2, '0')}:00`}
            </Pill>
            <WindowSwitch
              options={SOURCES}
              active={source}
              onPick={setSource}
              disabled={all.punch.length === 0}
              label="Which commits"
            />
          </div>
        }
      >
        {when.placed === 0 ? (
          <Empty>No commit carried a time that could be placed.</Empty>
        ) : (
          <>
            <div className="px-4 sm:px-6 py-5 overflow-x-auto">
              <HeatGrid grid={heat.grid} peak={when.peak} />
            </div>
            <div className="px-4 sm:px-6 pb-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <Stat
                label="outside 09–18"
                value={`${Math.round((when.offHours / when.placed) * 100)}%`}
                tone={when.offHours / when.placed > 0.5 ? 'text-amber-300' : 'text-neutral-300'}
              />
              <Stat
                label="at the weekend"
                value={`${Math.round((when.weekend / when.placed) * 100)}%`}
                tone={when.weekend / when.placed > 0.35 ? 'text-amber-300' : 'text-neutral-300'}
              />
              <Stat label="commits placed" value={num(when.placed)} />
              <span className="text-[11px] text-neutral-600">
                {source === 'all' && all.punch.length > 0
                  ? `every commit these repositories have ever had, shifted ${offset >= 0 ? '+' : ''}${offset}h from UTC to your clock`
                  : heat.span === null
                    ? 'the commits in the snapshot, in your timezone'
                    : `the ${all.commits.length} commits read, over ${count(Math.max(1, Math.round(heat.span / DAY)), 'day', 'days')}, in your timezone`}
              </span>
            </div>
          </>
        )}
      </Panel>

      <Panel title="Where the lines went" icon={FileDiff}>
        {!measured ? (
          <Empty>This is drawn from the weekly statistics, which have not been gathered yet.</Empty>
        ) : repos.every((repo) => repo.lines === 0) ? (
          <Empty>
            Nothing was changed in any of these repositories over{' '}
            {count(axis.length, 'week', 'weeks')}.
          </Empty>
        ) : (
          repos.map((repo) => (
            <div
              key={repo.name}
              className="px-4 sm:px-6 py-3.5 border-b border-[#17171d] last:border-b-0"
            >
              <div className="flex items-baseline justify-between gap-4 mb-2">
                <span className="text-[13px] text-white truncate">{repo.name}</span>
                <span className="text-[13px] tabular-nums shrink-0">
                  <span className="text-emerald-400">+{num(repo.added)}</span>{' '}
                  <span className="text-rose-400">−{num(repo.removed)}</span>
                </span>
              </div>
              <SplitBar added={repo.added} removed={repo.removed} peak={repoPeak} />
              <p className="text-[11px] text-neutral-600 mt-1.5">
                {count(repo.commits, 'commit', 'commits')} ·{' '}
                {repo.people === 0 ? 'nobody active' : count(repo.people, 'person', 'people')} · net{' '}
                {signed(repo.added - repo.removed)}
              </p>
            </div>
          ))
        )}
      </Panel>

      <Panel
        title="How long the checks take"
        icon={Timer}
        action={<Pill tone="neutral">{ci === null ? 'no runs' : `${spell(ci.average)} average`}</Pill>}
      >
        {ci === null ? (
          <Empty>
            No workflow run in the snapshot recorded a duration, so there is nothing to time.
          </Empty>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#17171d]">
              {[
                { label: 'Average', value: spell(ci.average) },
                { label: 'Median', value: spell(ci.median) },
                { label: 'Slowest', value: spell(ci.slowest.seconds) },
                { label: 'Runs timed', value: num(ci.runs) },
              ].map((cell) => (
                <div key={cell.label} className="bg-[#0a0a0d] px-4 py-3.5">
                  <p className="text-[10px] text-neutral-500 tracking-[0.14em] uppercase mb-1.5">
                    {cell.label}
                  </p>
                  <p className="text-[15px] text-white tabular-nums">{cell.value}</p>
                </div>
              ))}
            </div>
            {ci.workflows.map((flow) => (
              <div
                key={flow.name}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
              >
                <span className="text-[13px] text-neutral-300 truncate flex-1">{flow.name}</span>
                <span className="text-[11px] text-neutral-600 tabular-nums">
                  {count(flow.runs, 'run', 'runs')} · worst {spell(flow.worst)}
                </span>
                <span className="text-[13px] text-white tabular-nums w-16 text-right">
                  {spell(flow.average)}
                </span>
              </div>
            ))}
            <p className="px-4 sm:px-6 py-3 text-[11px] text-neutral-600">
              {spell(ci.spent)} of machine time across the runs in the snapshot. The slowest was{' '}
              {ci.slowest.repo} on {ci.slowest.branch ?? 'an unnamed branch'},{' '}
              {spell(ci.slowest.seconds)}.
            </p>
          </>
        )}
      </Panel>

      <Panel title="Reading and being read" icon={TrendingUp}>
        <div className="grid sm:grid-cols-2 gap-px bg-[#17171d]">
          <Tally
            title="Pull requests by author"
            rows={[...work.pullsBy.entries()].sort((a, b) => b[1].length - a[1].length)}
            empty="Nothing is open."
          />
          <Tally
            title="Issues by reporter"
            rows={[...work.issuesBy.entries()].sort((a, b) => b[1].length - a[1].length)}
            empty="Nothing is open."
          />
        </div>
        {work.reviews.size > 0 && (
          <div className="px-4 sm:px-6 py-4 border-t border-[#17171d]">
            <p className="text-[10px] text-neutral-500 tracking-[0.16em] uppercase mb-3">
              Asked to review
            </p>
            {[...work.reviews.entries()]
              .sort((a, b) => b[1].length - a[1].length)
              .map(([id, items]) => (
                <div key={id} className="flex items-center gap-2.5 py-1.5">
                  <Avatar login={id} size="h-5 w-5" />
                  <span className="text-[12px] text-neutral-300 truncate flex-1">{id}</span>
                  <span className="text-[11px] text-neutral-600 tabular-nums">
                    opened {work.pullsBy.get(id)?.length ?? 0}
                  </span>
                  <span className="text-[12px] text-amber-300 tabular-nums w-6 text-right">
                    {items.length}
                  </span>
                </div>
              ))}
          </div>
        )}
      </Panel>

      <Panel title="Latest commits" icon={CircleDot}>
        {all.commits.length === 0 ? (
          <Empty>No commits have been read yet.</Empty>
        ) : (
          all.commits.slice(0, SHOWN).map((commit) => (
            <div
              key={`${commit.repo}-${commit.sha}`}
              className="flex items-center gap-3 px-4 sm:px-6 py-2.5 border-b border-[#17171d] last:border-b-0"
            >
              <Avatar login={commit.login} size="h-5 w-5" />
              <span className="font-mono text-[11px] text-neutral-600 shrink-0">
                {short(commit.sha)}
              </span>
              <span className="text-[12px] text-neutral-300 truncate flex-1">{commit.subject}</span>
              <span className="text-[11px] text-neutral-600 shrink-0 hidden sm:inline">
                {commit.repo}
              </span>
              <span className="text-[11px] text-neutral-600 tabular-nums shrink-0">
                {formatAgo(commit.at)}
              </span>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
