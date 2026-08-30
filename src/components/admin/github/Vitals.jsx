import React from 'react';
import { Gauge, GitCommitHorizontal, Rocket, TrendingDown, TrendingUp } from 'lucide-react';
import { formatAgo } from '../../../lib/admin';
import { Empty, Figure, Notice, Panel, Pill, RankedBar } from '../ui';
import { GithubLink, count, short } from './shared';

const METRICS = {
  lcp: {
    label: 'LCP',
    name: 'Largest contentful paint',
    unit: 'ms',
    good: 2500,
    poor: 4000,
    blurb: 'when the biggest thing on the page finished drawing',
  },
  cls: {
    label: 'CLS',
    name: 'Cumulative layout shift',
    unit: '',
    good: 0.1,
    poor: 0.25,
    blurb: 'how much the page moved under the reader after it appeared',
  },
  tbt: {
    label: 'TBT',
    name: 'Total blocking time',
    unit: 'ms',
    good: 200,
    poor: 600,
    blurb: 'the lab stand-in for INP — how long an interaction would have queued',
  },
  fcp: {
    label: 'FCP',
    name: 'First contentful paint',
    unit: 'ms',
    good: 1800,
    poor: 3000,
    blurb: 'when anything at all first appeared',
  },
  ttfb: {
    label: 'TTFB',
    name: 'Time to first byte',
    unit: 'ms',
    good: 800,
    poor: 1800,
    blurb: 'how long the server took to start answering',
  },
  longTaskMs: {
    label: 'Long tasks',
    name: 'Time in long tasks',
    unit: 'ms',
    good: 400,
    poor: 1200,
    blurb: 'time spent in work long enough to block the page',
  },
  bytes: {
    label: 'Weight',
    name: 'Transferred',
    unit: 'B',
    good: 400_000,
    poor: 800_000,
    blurb: 'what the page cost to download',
  },
};

const HEADLINE = ['lcp', 'cls', 'tbt'];

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

function say(metric, value) {
  if (!isNumber(value)) return '—';
  const spec = METRICS[metric];
  if (!spec) return String(value);
  if (spec.unit === 'B') {
    return value >= 1024 ? `${Math.round(value / 1024)}kB` : `${value}B`;
  }
  if (spec.unit === 'ms') return `${Math.round(value)}ms`;
  return value.toFixed(3);
}

function sayDelta(metric, delta) {
  if (!isNumber(delta)) return '—';
  return `${delta > 0 ? '+' : '−'}${say(metric, Math.abs(delta))}`;
}

const verdict = (metric, value) => {
  const spec = METRICS[metric];
  if (!spec || !isNumber(value)) return 'unknown';
  if (value <= spec.good) return 'good';
  return value <= spec.poor ? 'fair' : 'poor';
};

const VERDICT_TEXT = {
  good: 'text-emerald-400',
  fair: 'text-amber-300',
  poor: 'text-rose-400',
  unknown: 'text-neutral-500',
};

const VERDICT_BAR = {
  good: 'bg-emerald-500/70',
  fair: 'bg-amber-400/70',
  poor: 'bg-rose-500/70',
  unknown: 'bg-[#2a2a34]',
};

const VERDICT_WORD = { good: 'good', fair: 'needs work', poor: 'poor', unknown: 'not measured' };

const releasesIn = (data) =>
  Array.isArray(data?.performance?.releases) ? data.performance.releases : [];

const pageOf = (release, path) =>
  (release.pages ?? []).find((page) => page.path === path) ?? null;

function routesIn(releases) {
  const seen = [];
  for (const release of releases) {
    for (const page of release.pages ?? []) {
      if (!seen.includes(page.path)) seen.push(page.path);
    }
  }
  return seen;
}

function worstRegression(releases) {
  let worst = null;
  let unconfirmed = null;
  for (const release of releases) {
    for (const move of release.moves ?? []) {
      if (move.delta <= 0) continue;
      const weight = isNumber(move.weight) ? move.weight : move.delta;
      const held = { release, move, weight, confirmed: move.confirmed !== false };
      const slot = held.confirmed ? worst : unconfirmed;
      if (slot === null || weight > slot.weight) {
        if (held.confirmed) worst = held;
        else unconfirmed = held;
      }
    }
  }
  return worst ?? unconfirmed;
}

function blame(release, move) {
  const who = release.pull?.number
    ? `PR #${release.pull.number}`
    : release.short
      ? `Commit ${release.short}`
      : `Release ${release.release}`;
  return `${who} increased ${METRICS[move.metric]?.label ?? move.metric} by ${say(
    move.metric,
    Math.abs(move.delta),
  )} on ${move.path}`;
}

function looksSlower(release, move) {
  const when = release.short ? `The release at ${release.short}` : `Release ${release.release}`;
  return `${when} reads ${say(move.metric, Math.abs(move.delta))} worse on ${
    METRICS[move.metric]?.label ?? move.metric
  } at ${move.path}`;
}

function passes(move) {
  const now = move.runs?.now;
  const before = move.runs?.before;
  if (!isNumber(now) || !isNumber(before)) return 'Measured too few times either side';
  return `${count(now, 'measurement', 'measurements')} of it against ${count(
    before,
    'measurement',
    'measurements',
  )} of the release before it`;
}

function Move({ move }) {
  const worse = move.delta > 0;
  const Icon = worse ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-[3px] text-[11px] tabular-nums ${
        worse ? 'border-rose-500/40 text-rose-300' : 'border-emerald-500/40 text-emerald-300'
      }`}
      title={`${METRICS[move.metric]?.name ?? move.metric} on ${move.path}: ${say(
        move.metric,
        move.from,
      )} → ${say(move.metric, move.to)}`}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2} />
      <span className="font-semibold">{METRICS[move.metric]?.label ?? move.metric}</span>
      {sayDelta(move.metric, move.delta)}
      <span className="text-neutral-500 font-mono">{move.path}</span>
      {move.confirmed === false && <span className="text-neutral-500">measured once</span>}
    </span>
  );
}

function ReleaseRow({ release, routes, expanded, onToggle }) {
  const moves = release.moves ?? [];
  const worse = moves.filter((move) => move.delta > 0);
  const better = moves.filter((move) => move.delta < 0);

  return (
    <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-neutral-500 font-mono">{release.release}</span>
            {release.pull?.number && <Pill tone="purple">PR #{release.pull.number}</Pill>}
            {worse.length > 0 && <Pill tone="rose">{count(worse.length, 'regression', 'regressions')}</Pill>}
            {worse.length === 0 && better.length > 0 && (
              <Pill tone="green">{count(better.length, 'improvement', 'improvements')}</Pill>
            )}
            {release.dirty && <Pill tone="amber">built dirty</Pill>}
          </div>

          <p className="text-[13px] text-white font-medium leading-snug break-words mt-1.5">
            {release.subject || release.pull?.title || 'no commit was recorded for this release'}
          </p>

          <p className="text-[11px] text-neutral-500 mt-1 tabular-nums">
            {release.short ? <span className="font-mono">{short(release.short)}</span> : 'unknown commit'}
            {release.author ? ` · ${release.author}` : ''}
            {release.last ? ` · measured ${formatAgo(release.last)}` : ''}
            {` · ${count(release.runs ?? 0, 'run', 'runs')}`}
            {release.against ? ` · against ${release.against.short ?? release.against.release}` : ''}
          </p>

          {release.dirty && (
            <p className="text-[11px] text-amber-300/80 mt-1.5">
              The checkout had uncommitted changes when this was built, so what was measured is not
              what {release.short ? short(release.short) : 'that commit'} says. Nobody is blamed for
              it.
            </p>
          )}

          {moves.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {moves.map((move) => (
                <Move key={`${move.path}-${move.metric}`} move={move} />
              ))}
            </div>
          )}
          {moves.length === 0 && release.against && (
            <p className="text-[11px] text-neutral-600 mt-2">
              Nothing moved past the noise floor against{' '}
              {release.against.short ?? release.against.release}.
            </p>
          )}
          {!release.against && (
            <p className="text-[11px] text-neutral-600 mt-2">
              The oldest release still measured, so there is nothing behind it to compare against.
            </p>
          )}

          {release.problems?.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {release.problems.map((problem) => (
                <li key={problem} className="text-[11px] text-amber-300/70 leading-snug">
                  · {problem}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={onToggle}
            className="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors mt-2.5"
          >
            {expanded ? 'Hide what it measured' : 'Show what it measured'}
          </button>

          {expanded && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[11px] tabular-nums border-collapse">
                <thead>
                  <tr className="text-neutral-500">
                    <th className="text-left font-normal py-1.5 pr-4">Route</th>
                    {Object.keys(METRICS).map((metric) => (
                      <th key={metric} className="text-right font-normal py-1.5 pl-4" title={METRICS[metric].name}>
                        {METRICS[metric].label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {routes.map((path) => {
                    const page = pageOf(release, path);
                    return (
                      <tr key={path} className="border-t border-[#17171d]">
                        <td className="py-1.5 pr-4 font-mono text-neutral-400">{path}</td>
                        {Object.keys(METRICS).map((metric) => (
                          <td
                            key={metric}
                            className={`text-right py-1.5 pl-4 ${
                              VERDICT_TEXT[verdict(metric, page?.[metric])]
                            }`}
                          >
                            {say(metric, page?.[metric])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {(release.pull?.url || release.commitUrl) && (
          <GithubLink
            href={release.pull?.url ?? release.commitUrl}
            title={
              release.pull?.number
                ? `Open PR #${release.pull.number} on GitHub`
                : 'Open this commit on GitHub'
            }
          >
            {release.pull?.number ? 'PR' : 'COMMIT'}
          </GithubLink>
        )}
      </div>
    </div>
  );
}

export default function Vitals({ data }) {
  const [open, setOpen] = React.useState(null);
  const performance = data?.performance ?? null;
  const releases = releasesIn(data);

  if (performance === null) {
    return (
      <Panel title="Site speed" icon={Gauge}>
        <Empty>
          This snapshot was written by a collector that did not gather measurements. It fills in
          after the next deploy.
        </Empty>
      </Panel>
    );
  }

  if (releases.length === 0) {
    return (
      <div className="space-y-6">
        {performance.note && <Notice tone="amber">{performance.note}</Notice>}
        <Panel title="Site speed" icon={Gauge}>
          <Empty>
            Nothing has been measured against a release yet. The monitor runs six-hourly and after
            every deploy, and a reading can only be attributed once the deploy that published the
            release wrote down which commit it was — so the first entry appears after the next
            deploy of the site.
          </Empty>
        </Panel>
      </div>
    );
  }

  const live = releases[0];
  const routes = routesIn(releases);
  const worst = worstRegression(releases);
  const [primary] = routes;

  return (
    <div className="space-y-6">
      {performance.note && <Notice tone="amber">{performance.note}</Notice>}

      {worst ? (
        <Notice tone={worst.confirmed ? 'rose' : 'amber'} icon={TrendingUp}>
          <span>
            <strong className="font-semibold">
              {worst.confirmed
                ? blame(worst.release, worst.move)
                : looksSlower(worst.release, worst.move)}
            </strong>{' '}
            <span className="opacity-80">
              ({say(worst.move.metric, worst.move.from)} → {say(worst.move.metric, worst.move.to)},
              against {worst.release.against?.short ?? worst.release.against?.release}
              {worst.release.last ? `, measured ${formatAgo(worst.release.last)}` : ''})
            </span>
            {!worst.confirmed && (
              <span className="block mt-1 opacity-80">
                {passes(worst.move)} — not enough to tell a change from a busy box, so nobody is
                named for it yet. The next measurement of either release settles it.
              </span>
            )}
          </span>
        </Notice>
      ) : (
        <Notice tone="emerald" icon={TrendingDown}>
          Nothing has made the site measurably slower across the last{' '}
          {count(releases.length, 'release', 'releases')}.
        </Notice>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {HEADLINE.map((metric) => {
          const value = pageOf(live, primary)?.[metric];
          const state = verdict(metric, value);
          return (
            <Figure
              key={metric}
              label={`${METRICS[metric].label} on ${primary ?? '—'}`}
              value={say(metric, value)}
              tone={VERDICT_TEXT[state]}
              hint={`${VERDICT_WORD[state]} · ${METRICS[metric].blurb}`}
            />
          );
        })}
        <Figure
          label="Releases measured"
          value={releases.length}
          hint={
            performance.measured
              ? `last reading ${formatAgo(performance.measured)}`
              : 'nothing measured yet'
          }
        />
      </div>

      <Panel
        title="Live now"
        icon={Rocket}
        action={
          <span className="text-[11px] text-neutral-600 tabular-nums">
            {performance.profile ? `measured over ${performance.profile}` : ''}
          </span>
        }
      >
        {primary === undefined ? (
          <Empty>The live release has no route measurements in the snapshot.</Empty>
        ) : (
          routes.map((path) => {
            const page = pageOf(live, path);
            const value = page?.lcp;
            const state = verdict('lcp', value);
            return (
              <RankedBar
                key={path}
                name={path}
                detail={`${say('cls', page?.cls)} shift · ${say('tbt', page?.tbt)} blocking · ${say(
                  'bytes',
                  page?.bytes,
                )}`}
                value={say('lcp', value)}
                percent={isNumber(value) ? Math.min(100, (value / METRICS.lcp.poor) * 100) : 0}
                tone={VERDICT_BAR[state]}
              />
            );
          })
        )}
      </Panel>

      <Panel
        title="Release by release"
        icon={GitCommitHorizontal}
        action={
          <span className="text-[11px] text-neutral-600">newest first · up is worse</span>
        }
      >
        {releases.map((release) => (
          <ReleaseRow
            key={release.release}
            release={release}
            routes={routes}
            expanded={open === release.release}
            onToggle={() => setOpen(open === release.release ? null : release.release)}
          />
        ))}
      </Panel>

      <p className="text-[11px] text-neutral-600 leading-relaxed">
        Every figure is the middle of every reading taken while that release was serving, so a
        release measured once carries less weight than one measured six times — the run count is on
        each row for that reason. A change is only listed once it has moved past both an absolute
        floor and a tenth of what it was, which is what keeps a busy minute on the box out of the
        record.
        {performance.unattributed > 0 &&
          ` ${count(performance.unattributed, 'older reading is', 'older readings are')} not listed
          here: they were taken before the deploy started recording which commit each release is.`}
      </p>
    </div>
  );
}
