import React from 'react';
import {
  ChartColumn,
  CircleDot,
  Clock,
  FileDiff,
  GitPullRequest,
  Radar,
  Users,
} from 'lucide-react';
import { formatAgo, githubAvatarUrl } from '../../../lib/admin';
import { Empty, Figure, Notice, Panel, Pill, WindowSwitch } from '../ui';
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

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WORKDAY = [9, 18];

const num = (value) => (typeof value === 'number' ? value.toLocaleString('en-GB') : '—');

const key = (login) => String(login ?? '').toLowerCase();

const accountOf = (commit) => (commit.login ? key(commit.login) : null);

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
    });
    tally.set(id, held);
  });

  return [...tally.values()]
    .map((person) => ({
      ...person,
      repos: [...person.repos].sort(),
      lines: person.added + person.removed,
      series: axis.map((week) => person.weeks.get(week) ?? blank()),
    }))
    .sort((a, b) => b.commits - a.commits || b.lines - a.lines || a.login.localeCompare(b.login));
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
      ever: null,
      commits: 0,
      added: null,
      removed: null,
      lines: null,
      series: null,
      last: commit,
    };
    held.commits += 1;
    held.repos.add(commit.repo);
    if (commit.at > held.last.at) held.last = commit;
    tally.set(id, held);
  });
  return [...tally.values()]
    .map((person) => ({ ...person, repos: [...person.repos].sort() }))
    .sort((a, b) => b.commits - a.commits);
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

function times(commits) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let placed = 0;
  let offHours = 0;
  let weekend = 0;
  const stamps = [];

  commits.forEach((commit) => {
    const parsed = Date.parse(commit.at);
    if (Number.isNaN(parsed)) return;
    const when = new Date(parsed);
    const day = when.getDay();
    const hour = when.getHours();
    grid[day][hour] += 1;
    placed += 1;
    stamps.push(parsed);
    if (hour < WORKDAY[0] || hour >= WORKDAY[1]) offHours += 1;
    if (day === 0 || day === 6) weekend += 1;
  });

  const hours = Array.from({ length: 24 }, (unused, hour) =>
    grid.reduce((sum, row) => sum + row[hour], 0),
  );

  return {
    grid,
    placed,
    offHours,
    weekend,
    busiest: placed === 0 ? null : hours.indexOf(Math.max(...hours)),
    span: stamps.length < 2 ? null : Math.max(...stamps) - Math.min(...stamps),
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
            <span
              className={`pointer-events-none absolute bottom-full mb-2 z-20 hidden group-hover:block whitespace-nowrap border border-[#282832] bg-[#111115] px-2.5 py-1.5 ${
                index < 3
                  ? 'left-0'
                  : index > series.length - 4
                    ? 'right-0'
                    : 'left-1/2 -translate-x-1/2'
              }`}
            >
              <span className="block text-[12px] text-white font-medium tabular-nums leading-none">
                {num(value)}
              </span>
              <span className="block text-[10px] text-neutral-500 mt-1 leading-none">
                {labels[index]}
              </span>
            </span>
          )}
        </div>
      ))}
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

function Person({ person, axis, peak, linePeak, work, open, onToggle }) {
  const mine = {
    pulls: work.pullsBy.get(person.id) ?? [],
    issues: work.issuesBy.get(person.id) ?? [],
    assigned: work.assigned.get(person.id) ?? [],
    reviews: work.reviews.get(person.id) ?? [],
    last: person.last ?? work.last.get(person.id) ?? null,
  };
  const waiting = mine.pulls.length + mine.assigned.length + mine.reviews.length;

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
              {person.repos.join(', ')}
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
                labels={axis.map((week) => `week of ${dateLabel(week)}`)}
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

export default function Tracking({ data }) {
  const [span, setSpan] = React.useState(12);
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
  const people = measured ? board(all.stats, axis) : fallbackBoard(all.commits);
  const repos = byRepository(repositories, axis);
  const clock = times(all.commits);

  const commits = people.reduce((sum, person) => sum + person.commits, 0);
  const added = measured ? people.reduce((sum, person) => sum + person.added, 0) : null;
  const removed = measured ? people.reduce((sum, person) => sum + person.removed, 0) : null;
  const active = people.filter((person) => person.commits > 0).length;

  const weekly = axis.map((unused, index) => ({
    commits: people.reduce((sum, person) => sum + (person.series?.[index]?.commits ?? 0), 0),
    lines: people.reduce(
      (sum, person) =>
        sum + (person.series?.[index]?.added ?? 0) + (person.series?.[index]?.removed ?? 0),
      0,
    ),
  }));
  const weekPeak = Math.max(1, ...weekly.map((week) => week.commits));
  const weekLinePeak = Math.max(1, ...weekly.map((week) => week.lines));
  const personPeak = Math.max(
    1,
    ...people.flatMap((person) => (person.series ?? []).map((week) => week.commits)),
  );
  const personLinePeak = Math.max(1, ...people.map((person) => person.lines ?? 0));
  const repoPeak = Math.max(1, ...repos.map((repo) => repo.lines));
  const heatPeak = Math.max(1, ...clock.grid.flat());
  const listed = full ? people : people.slice(0, SHOWN);

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
          label="People committing"
          value={active}
          tone={active > 0 ? 'text-white' : 'text-neutral-500'}
          hint={
            people.length === active
              ? 'everybody these repositories know'
              : `${people.length - active} more have committed before`
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
                labels={axis.map((week) => `week of ${dateLabel(week)}`)}
                peak={weekPeak}
                height={56}
              />
            </div>
            <div>
              <p className="text-[10px] text-neutral-500 tracking-[0.16em] uppercase mb-2">
                Lines edited
              </p>
              <Columns
                series={weekly.map((week) => week.lines)}
                labels={axis.map((week) => `week of ${dateLabel(week)}`)}
                peak={weekLinePeak}
                height={40}
                tone="bg-emerald-500/60"
              />
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
          people.length > SHOWN ? (
            <button
              type="button"
              onClick={() => setFull((held) => !held)}
              aria-expanded={full}
              className="text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-500 hover:text-white transition-colors"
            >
              {full ? 'Show less' : `All ${people.length}`}
            </button>
          ) : null
        }
      >
        {people.length === 0 ? (
          <Empty>
            Nobody has committed to any of these repositories in what has been read. That is either
            a quiet window or a collector that has not run — the age at the top of the page says
            which.
          </Empty>
        ) : (
          listed.map((person) => (
            <Person
              key={person.id}
              person={person}
              axis={axis}
              peak={personPeak}
              linePeak={personLinePeak}
              work={work}
              open={opened === person.id}
              onToggle={() => setOpened((held) => (held === person.id ? null : person.id))}
            />
          ))
        )}
      </Panel>

      <Panel
        title="When the work happens"
        icon={Clock}
        action={
          <Pill tone="neutral">
            {clock.busiest === null
              ? 'no times'
              : `busiest ${String(clock.busiest).padStart(2, '0')}:00`}
          </Pill>
        }
      >
        {clock.placed === 0 ? (
          <Empty>No commit carried a timestamp that could be read.</Empty>
        ) : (
          <>
            <div className="px-4 sm:px-6 py-5 overflow-x-auto">
              <HeatGrid grid={clock.grid} peak={heatPeak} />
            </div>
            <div className="px-4 sm:px-6 pb-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <Stat
                label="outside 09–18"
                value={`${Math.round((clock.offHours / clock.placed) * 100)}%`}
                tone={clock.offHours / clock.placed > 0.5 ? 'text-amber-300' : 'text-neutral-300'}
              />
              <Stat
                label="at the weekend"
                value={`${Math.round((clock.weekend / clock.placed) * 100)}%`}
                tone={clock.weekend / clock.placed > 0.35 ? 'text-amber-300' : 'text-neutral-300'}
              />
              <Stat label="commits placed" value={num(clock.placed)} />
              <span className="text-[11px] text-neutral-600">
                {clock.span === null
                  ? 'in your timezone'
                  : `over ${count(Math.max(1, Math.round(clock.span / DAY)), 'day', 'days')}, in your timezone`}
              </span>
            </div>
          </>
        )}
      </Panel>

      <Panel title="Where the lines went" icon={FileDiff}>
        {!measured ? (
          <Empty>
            This is drawn from the weekly statistics, which have not been gathered yet.
          </Empty>
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
                {repo.people === 0 ? 'nobody active' : count(repo.people, 'person', 'people')}
              </p>
            </div>
          ))
        )}
      </Panel>

      <Panel title="What is open right now" icon={GitPullRequest}>
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
