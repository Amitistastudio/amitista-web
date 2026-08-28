import React from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  Archive,
  Clock,
  Globe,
  HardDrive,
  Rocket,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  TRAFFIC_DEFAULT,
  TRAFFIC_WINDOWS,
  fetchTraffic,
  formatAgo,
  formatBytes,
  formatCount,
  formatStamp,
  formatUptime,
  peakOf,
  pointLabel,
  releaseLabel,
  seriesOf,
  shareOf,
  swingOf,
} from '../../lib/admin';
import { RELAY_PROBE_TTL_MS, deliverySettling, restartedRecently } from './developer/shared';
import {
  Bar,
  Dot,
  Figure,
  Hero,
  Notice,
  Panel,
  RankedBar,
  Row,
  Sparkline,
  UsageBar,
  WindowSwitch,
} from './ui';

const OVERALL_TONE = {
  operational: 'text-emerald-400',
  unknown: 'text-neutral-500',
};

const OVERALL_DOT = {
  operational: 'active',
  unknown: 'unknown',
};

const OVERALL_LABEL = {
  operational: 'All systems operational',
  degraded: 'Something is degraded',
  down: 'Something is down',
  unknown: 'Nothing checked yet',
};

function findConcerns(data, can) {
  const found = [];
  const add = (level, text) => found.push({ level, text });

  const status = data.status ?? null;
  const api = data.api ?? null;
  const totals = api?.totals ?? null;

  if (data.stale) {
    add('warn', 'This reading is over fifteen minutes old — check the snapshot timer.');
  }

  if (status && status.overall && status.overall !== 'operational' && status.overall !== 'unknown') {
    add('bad', `Monitoring reports the site as ${status.overall}.`);
  }

  for (const check of Array.isArray(status?.checks) ? status.checks : []) {
    if (check.status && check.status !== 'up') {
      add('bad', `The ${check.name} check is ${check.status}.`);
    }
  }

  if ((totals?.serverError ?? 0) > 0) {
    add('bad', `${totals.serverError} request${totals.serverError === 1 ? '' : 's'} failed with a server error.`);
  }

  if (can('services.read')) {
    for (const service of Array.isArray(data.services) ? data.services : []) {
      if (service.state !== 'active') {
        add('bad', `${service.name} is ${service.state}.`);
      } else if (restartedRecently(service)) {
        const times = `${service.restarts} time${service.restarts === 1 ? '' : 's'}`;
        add('warn', `${service.name} has restarted ${times}, most recently ${formatAgo(service.since)}.`);
      }
    }

    const disk = data.disk ?? null;
    if (disk && disk.percent > 90) add('bad', `The disk is ${disk.percent}% full.`);
    else if (disk && disk.percent > 75) add('warn', `The disk is ${disk.percent}% full.`);

    const certificate = data.certificate ?? null;
    if (certificate && certificate.daysLeft < 14) {
      add('bad', `The certificate expires in ${certificate.daysLeft} days.`);
    } else if (certificate && certificate.daysLeft < 30) {
      add('warn', `The certificate expires in ${certificate.daysLeft} days.`);
    }

    const backups = data.backups ?? null;
    if (backups?.created) {
      const age = Date.now() - Date.parse(backups.created);
      if (Number.isFinite(age) && age > 48 * 3600 * 1000) {
        add('warn', `The newest backup is ${Math.floor(age / 86400000)} days old.`);
      }
    }

    const relay = data.relay ?? null;
    if (relay && !relay.reachable) {
      add('bad', 'The enquiry relay is not answering.');
    } else if (relay && !relay.webhook) {
      const settling = deliverySettling(data);
      if (settling) {
        add('warn', `Enquiry delivery is unconfirmed while ${settling} settles — the relay rechecks within ${Math.round(RELAY_PROBE_TTL_MS / 60000)} minutes.`);
      } else {
        add('bad', 'The enquiry relay cannot hand enquiries to the bot, so nothing is delivered.');
      }
    }
  }

  if (can('releases.read')) {
    const rollback = Array.isArray(data.rollbackTargets) ? data.rollbackTargets : [];
    if (rollback.length === 0) add('warn', 'There is no release to roll back to.');
    for (const release of Array.isArray(data.releases) ? data.releases : []) {
      if (!release.current && !release.hasIndex) {
        add('warn', `Release ${release.name} has no index.html and cannot be rolled back to.`);
      }
    }
  }

  return found.sort((left, right) => (left.level === right.level ? 0 : left.level === 'bad' ? -1 : 1));
}

function Attention({ concerns }) {
  if (concerns.length === 0) {
    return (
      <div className="border border-emerald-500/30 bg-emerald-500/5 px-4 sm:px-6 py-4 flex items-center gap-3">
        <Check className="h-4 w-4 text-emerald-400 shrink-0" strokeWidth={2} />
        <p className="text-[13px] text-emerald-200/80 font-normal">
          Nothing needs attention right now.
        </p>
      </div>
    );
  }

  const serious = concerns.filter((entry) => entry.level === 'bad').length;

  return (
    <section className="border border-[#282832] bg-[#0a0a0d]">
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-[#282832]">
        <div className="flex items-center gap-3 min-w-0">
          <AlertTriangle
            className={`h-4 w-4 shrink-0 ${serious ? 'text-rose-400' : 'text-amber-300'}`}
            strokeWidth={1.5}
          />
          <h2 className="text-[11px] font-semibold text-neutral-300 tracking-[0.18em] uppercase truncate">
            Needs attention
          </h2>
        </div>
        <span className="text-[11px] text-neutral-500 font-normal tabular-nums shrink-0">
          {concerns.length} thing{concerns.length === 1 ? '' : 's'}
        </span>
      </div>
      {concerns.map((entry) => (
        <div
          key={entry.text}
          className="flex items-start gap-3 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full shrink-0 mt-[7px] ${
              entry.level === 'bad' ? 'bg-rose-500' : 'bg-amber-400'
            }`}
          />
          <p className="text-[13px] text-neutral-300 font-normal leading-relaxed">{entry.text}</p>
        </div>
      ))}
    </section>
  );
}

function Pair({ children }) {
  const items = React.Children.toArray(children);
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{items}</div>;
}

export default function OverviewPanel({ data, permissions = [], role = null }) {
  const [table, setTable] = React.useState(false);
  const [span, setSpan] = React.useState(TRAFFIC_DEFAULT);
  const [traffic, setTraffic] = React.useState(null);
  const [trafficError, setTrafficError] = React.useState(null);
  const [reading, setReading] = React.useState(false);
  const scope = Array.isArray(data.scope) ? data.scope : null;

  React.useEffect(() => {
    let dropped = false;
    setReading(true);
    fetchTraffic(span)
      .then((result) => {
        if (dropped) return;
        setTraffic(result);
        setTrafficError(null);
      })
      .catch((failure) => {
        if (!dropped) setTrafficError(failure.message);
      })
      .finally(() => {
        if (!dropped) setReading(false);
      });
    return () => {
      dropped = true;
    };
  }, [span]);

  const can = (permission) =>
    permissions.includes(permission) && (scope === null || scope.includes(permission));
  const privileged = role === 'owner' || role === 'admin';
  const releases = Array.isArray(data.releases) ? data.releases : [];
  const services = Array.isArray(data.services) ? data.services : [];
  const timers = Array.isArray(data.timers) ? data.timers : [];
  const rollback = Array.isArray(data.rollbackTargets) ? data.rollbackTargets : [];
  const status = data.status ?? null;
  const disk = data.disk ?? null;
  const backups = data.backups ?? null;
  const certificate = data.certificate ?? null;
  const relay = data.relay ?? null;
  const api = data.api ?? null;

  const totals = api?.totals ?? null;
  const site = api?.site ?? null;
  const hourly = Array.isArray(api?.hourly) ? api.hourly : [];
  const endpoints = Array.isArray(api?.endpoints) ? api.endpoints : [];
  const missing = Array.isArray(api?.notFound) ? api.notFound : [];
  const agents = Array.isArray(api?.agents) ? api.agents : [];
  const hours = api?.window ?? 24;

  const live = traffic && Array.isArray(traffic.points) && traffic.points.length > 0;
  const step = live ? traffic.step : 'hour';
  const points = live
    ? traffic.points
    : hourly.map((entry) => ({ at: entry.hour, site: entry.requests ?? 0 }));
  const counts = seriesOf(points, 'site');
  const marks = points.map((point) => pointLabel(point, step));
  const top = peakOf(points, 'site');
  const peak = top.value;
  const peakAt = top.at ? pointLabel(top.at, step) : null;
  const spanTotals = live ? traffic.totals : null;
  const chosen = TRAFFIC_WINDOWS.find((entry) => entry.id === span) ?? TRAFFIC_WINDOWS[2];

  const overall = status?.overall ?? 'unknown';
  const upCount = services.filter((service) => service.state === 'active').length;
  const restarts = services.filter(restartedRecently).reduce((sum, service) => sum + service.restarts, 0);
  const swing = swingOf(counts);

  const checks = Array.isArray(status?.checks) ? status.checks : [];
  const passing = checks.filter((check) => check.status === 'up').length;
  const busiest = endpoints[0]?.requests ?? 0;
  const loudest = agents[0]?.requests ?? 0;
  const probed = missing[0]?.requests ?? 0;

  return (
    <div className="w-full flex flex-col gap-6">
      {privileged && <Attention concerns={findConcerns(data, can)} />}

      {api ? (
        <Panel
          title={`Traffic — ${chosen.title}`}
          icon={Activity}
          action={
            <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
              <span className="hidden sm:inline text-[11px] text-neutral-500 font-normal">
                read {formatAgo(api.generated ?? data.generated)}
              </span>
              <WindowSwitch
                options={TRAFFIC_WINDOWS}
                active={span}
                onPick={setSpan}
                disabled={reading}
                label="How far back to read the traffic"
              />
            </div>
          }
        >
          {trafficError && (
            <div className="px-4 sm:px-6 pt-5">
              <Notice tone="rose">{trafficError}</Notice>
            </div>
          )}

          {live && traffic.partial && (
            <div className="px-4 sm:px-6 pt-5">
              <Notice>
                Only {traffic.covered} hour{traffic.covered === 1 ? '' : 's'} of history have been
                kept so far, so this window is not full yet. The snapshot timer adds an hour at a
                time and keeps a month.
              </Notice>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
            <div className="px-4 sm:px-6 py-7 border-b lg:border-b-0 lg:border-r border-[#17171d]">
              <Hero
                value={formatCount(
                  live ? spanTotals.site : site?.requests ?? totals?.requests ?? 0,
                )}
                label="requests reached the site"
                footnote={`${formatCount(
                  live ? spanTotals.api : totals?.requests ?? 0,
                )} of them went to the API`}
              />
              {swing !== null && (
                <p className="text-[12px] text-neutral-500 font-normal mt-3">
                  <span className="text-neutral-300 tabular-nums">
                    {swing > 0 ? '↑' : swing < 0 ? '↓' : '→'} {Math.abs(swing)}%
                  </span>{' '}
                  in the latest half of this window against the half before
                </p>
              )}
              <div className="flex items-center gap-2.5 mt-6 pt-5 border-t border-[#17171d]">
                <Dot state={OVERALL_DOT[overall] ?? 'failed'} />
                <span className={`text-[13px] font-medium ${OVERALL_TONE[overall] ?? 'text-rose-400'}`}>
                  {OVERALL_LABEL[overall] ?? overall}
                </span>
              </div>
              <p className="text-[11px] text-neutral-600 font-normal mt-1.5 pl-[18px]">
                checked {formatAgo(status?.checked)}
              </p>
            </div>

            <div
              className={`px-4 sm:px-6 py-7 flex flex-col justify-center transition-opacity ${
                reading ? 'opacity-50' : 'opacity-100'
              }`}
            >
              <Sparkline
                points={counts}
                labels={marks}
                unit={step === 'day' ? 'requests per day' : 'requests per hour'}
                height={150}
              />
              <div className="flex items-baseline justify-between gap-4 mt-3">
                <span className="text-[10px] text-neutral-600 tracking-wider uppercase shrink-0">
                  {marks[0] ?? '—'}
                </span>
                <span className="text-[11px] text-neutral-500 font-normal text-center truncate">
                  {peak > 0
                    ? `busiest ${step === 'day' ? 'day' : 'hour'} ${formatCount(peak)} at ${peakAt}`
                    : 'nothing recorded in this window'}
                </span>
                <span className="text-[10px] text-neutral-600 tracking-wider uppercase shrink-0">
                  now
                </span>
              </div>

              <button
                type="button"
                onClick={() => setTable((open) => !open)}
                aria-expanded={table}
                className="self-start text-[11px] text-neutral-500 hover:text-neutral-300 font-normal mt-4 underline underline-offset-2 transition-colors"
              >
                {table
                  ? 'Hide the breakdown'
                  : step === 'day'
                    ? 'Read it day by day'
                    : 'Read it hour by hour'}
              </button>

              {table && (
                <div className="mt-3 max-h-52 overflow-y-auto border border-[#17171d]">
                  <table className="w-full text-left border-collapse">
                    <caption className="sr-only">
                      Requests for each {step} of {chosen.title}
                    </caption>
                    <thead>
                      <tr className="border-b border-[#17171d]">
                        <th className="px-4 py-2 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">
                          {step === 'day' ? 'Day' : 'Hour'}
                        </th>
                        <th className="px-4 py-2 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase text-right">
                          Requests
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {points.map((point, index) => (
                        <tr key={point.at ?? index} className="border-b border-[#17171d] last:border-b-0">
                          <td className="px-4 py-1.5 text-[12px] text-neutral-400">
                            {marks[index]}
                          </td>
                          <td className="px-4 py-1.5 text-[12px] text-neutral-300 tabular-nums text-right">
                            {formatCount(counts[index])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 border-t border-[#17171d] -mb-px -mr-px">
            {[
              [
                'To the API',
                formatCount(live ? spanTotals.api : totals?.requests ?? 0),
                'text-white',
              ],
              ['Served', formatBytes(live ? spanTotals.bytes : totals?.bytes ?? 0), 'text-white'],
              [
                'Refused',
                formatCount(live ? spanTotals.clientError : totals?.clientError ?? 0),
                (live ? spanTotals.clientError : totals?.clientError ?? 0) > 0
                  ? 'text-amber-300'
                  : 'text-white',
              ],
              [
                'Rate limited',
                formatCount(live ? spanTotals.rateLimited : totals?.rateLimited ?? 0),
                (live ? spanTotals.rateLimited : totals?.rateLimited ?? 0) > 0
                  ? 'text-amber-300'
                  : 'text-white',
              ],
              [
                'Errors',
                formatCount(live ? spanTotals.serverError : totals?.serverError ?? 0),
                (live ? spanTotals.serverError : totals?.serverError ?? 0) > 0
                  ? 'text-rose-400'
                  : 'text-white',
              ],
            ].map(([label, value, tone]) => (
              <div key={label} className="px-4 sm:px-6 py-5 border-r border-b border-[#17171d]">
                <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-2">
                  {label}
                </p>
                <p className={`text-[22px] font-normal tabular-nums leading-none ${tone}`}>{value}</p>
              </div>
            ))}
          </div>

          {live && (
            <p className="px-4 sm:px-6 py-3 border-t border-[#17171d] text-[11px] text-neutral-600 font-normal">
              Counted across the whole site for {chosen.title}. The endpoint, client and miss
              breakdowns below are always the last {hours} hours, read straight from the access log.
            </p>
          )}
        </Panel>
      ) : (
        <Notice>
          No traffic has been read yet. The figures come out of the access log, gathered by the
          snapshot timer every couple of minutes.
        </Notice>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {can('services.read') ? (
          <>
            <Figure
              label="Services"
              value={`${upCount}/${services.length || 0}`}
              tone={upCount === services.length && services.length > 0 ? 'text-emerald-400' : 'text-rose-400'}
              hint={restarts > 0 ? `${restarts} restart${restarts === 1 ? '' : 's'} counted` : 'no restarts'}
            />
            <Figure
              label="Disk"
              value={disk ? `${disk.percent}%` : '—'}
              tone={
                !disk ? 'text-neutral-500' : disk.percent > 90 ? 'text-rose-400' : disk.percent > 75 ? 'text-amber-300' : 'text-white'
              }
              hint={disk ? `${formatBytes(disk.free)} free` : 'not readable'}
            />
            <Figure
              label="Certificate"
              value={certificate ? `${certificate.daysLeft}d` : '—'}
              tone={
                !certificate
                  ? 'text-neutral-500'
                  : certificate.daysLeft < 14
                    ? 'text-rose-400'
                    : certificate.daysLeft < 30
                      ? 'text-amber-300'
                      : 'text-white'
              }
              hint={certificate ? 'until renewal is due' : 'not readable'}
            />
          </>
        ) : (
          <>
            <Figure
              label="Busiest hour"
              value={formatCount(peak)}
              hint={peak > 0 ? formatStamp(peakAt) : `nothing in ${hours}h`}
            />
            <Figure
              label="Checks passing"
              value={`${passing}/${checks.length || 0}`}
              tone={
                checks.length === 0
                  ? 'text-neutral-500'
                  : passing === checks.length
                    ? 'text-emerald-400'
                    : 'text-rose-400'
              }
              hint={status?.checked ? `checked ${formatAgo(status.checked)}` : 'nothing checked yet'}
            />
            <Figure
              label="Per hour"
              value={formatCount(Math.round((site?.requests ?? 0) / Math.max(1, hours)))}
              hint={`averaged across the ${hours}h`}
            />
          </>
        )}
        <Figure
          label="Not found"
          value={formatCount(live ? spanTotals.notFound : site?.notFound ?? 0)}
          tone={(live ? spanTotals.notFound : site?.notFound ?? 0) > 0 ? 'text-amber-300' : 'text-white'}
          hint={live ? `across the site, ${chosen.title}` : `across the site, ${hours}h`}
        />
      </div>

      {endpoints.length > 0 && (
        <Panel title="Busiest endpoints" icon={Activity}>
          {endpoints.slice(0, 6).map((entry) => (
            <RankedBar
              key={entry.path}
              name={entry.label}
              detail={entry.path}
              value={formatCount(entry.requests)}
              percent={shareOf(entry.requests, busiest)}
            />
          ))}
        </Panel>
      )}

      {can('security.read') && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Where the misses go" icon={AlertTriangle}>
          {missing.length === 0 && <Row label="Nothing missing" value="—" />}
          {missing.slice(0, 6).map((entry) => (
            <RankedBar
              key={entry.path}
              name={entry.path}
              value={formatCount(entry.requests)}
              percent={shareOf(entry.requests, probed)}
              tone="bg-amber-400/60"
            />
          ))}
        </Panel>

        <Panel title="Loudest clients" icon={Users}>
          {agents.length === 0 && <Row label="Nothing reported" value="—" />}
          {agents.slice(0, 6).map((entry) => (
            <RankedBar
              key={entry.agent}
              name={entry.agent}
              value={formatCount(entry.requests)}
              percent={shareOf(entry.requests, loudest)}
            />
          ))}
        </Panel>
      </div>
      )}

      <Pair>
        {can('releases.read') && (
        <Panel title="Live release" icon={Rocket}>
          <Row label="Serving" value={releaseLabel(data.currentRelease)} />
          <Row label="Directory" value={<span className="font-mono text-[12px]">{data.currentRelease ?? '—'}</span>} />
          <Row
            label="Rollback targets"
            value={rollback.length}
            tone={rollback.length ? 'text-white' : 'text-amber-300'}
          />
          <Row label="Host" value={<span className="font-mono text-[12px]">{data.host ?? '—'}</span>} />
        </Panel>
        )}

        {can('services.read') && (
        <Panel title="Services" icon={Server}>
          {services.length === 0 && <Row label="Nothing reported" value="—" />}
          {services.map((service) => {
            const uptime = formatUptime(service.since);
            return (
              <div
                key={service.unit}
                className="flex items-center justify-between gap-6 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Dot state={service.state} />
                  <div className="min-w-0">
                    <span className="block text-[13px] text-white font-normal truncate">
                      {service.name}
                    </span>
                    <span className="block text-[11px] text-neutral-600 font-mono truncate">
                      {service.unit}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="block text-[13px] font-medium text-white">
                    {uptime ?? service.state}
                  </span>
                  {restartedRecently(service) ? (
                    <span className="block text-[10px] text-amber-300 tracking-wider uppercase">
                      {service.restarts} restart{service.restarts === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="block text-[10px] text-neutral-600 tracking-wider uppercase">
                      {service.detail || service.state}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </Panel>
        )}
      </Pair>

      {can('releases.read') && (
      <Panel title="Releases" icon={Archive}>
        <div className="rail overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[540px]">
            <thead>
              <tr className="border-b border-[#17171d]">
                <th className="px-4 sm:px-6 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">Release</th>
                <th className="px-4 sm:px-6 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">Built</th>
                <th className="px-4 sm:px-6 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">Size</th>
                <th className="px-4 sm:px-6 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">State</th>
              </tr>
            </thead>
            <tbody>
              {releases.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 sm:px-6 py-4 text-[13px] text-neutral-500">
                    No releases readable.
                  </td>
                </tr>
              )}
              {releases.map((release) => (
                <tr key={release.name} className="border-b border-[#17171d] last:border-b-0">
                  <td className="px-4 sm:px-6 py-3 text-[12px] font-mono text-white whitespace-nowrap">{release.name}</td>
                  <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-400 whitespace-nowrap">{formatStamp(release.created)}</td>
                  <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-400 tabular-nums whitespace-nowrap">{formatBytes(release.bytes)}</td>
                  <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                    {release.current ? (
                      <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-emerald-400">
                        <Dot state="active" /> live
                      </span>
                    ) : release.hasIndex ? (
                      <span className="text-[12px] text-neutral-400">rollback target</span>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-rose-400">
                        <Dot state="failed" /> no index.html
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      )}

      {can('services.read') && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Timers" icon={Clock}>
          {timers.length === 0 && <Row label="Nothing reported" value="—" />}
          {timers.map((timer) => (
            <div
              key={timer.unit}
              className="flex items-center justify-between gap-6 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Dot state={timer.state} />
                <div className="min-w-0">
                  <span className="block text-[13px] text-white font-normal truncate">{timer.name}</span>
                  <span className="block text-[11px] text-neutral-600 font-normal truncate">
                    last ran {formatAgo(timer.last)}
                  </span>
                </div>
              </div>
              <span className="text-[12px] text-neutral-400 text-right shrink-0">
                {timer.next ? `next ${formatStamp(timer.next)}` : timer.state}
              </span>
            </div>
          ))}
        </Panel>

        <Panel title="Certificate" icon={ShieldCheck}>
          {certificate ? (
            <>
              <Row label="Domain" value={certificate.domain} />
              <Row label="Expires" value={formatStamp(certificate.expires)} />
              <Row
                label="Days left"
                value={certificate.daysLeft}
                tone={certificate.daysLeft < 14 ? 'text-rose-400' : certificate.daysLeft < 30 ? 'text-amber-300' : 'text-white'}
              />
              <div className="px-4 sm:px-6 py-5">
                <Bar
                  percent={shareOf(certificate.daysLeft, 90)}
                  tone={
                    certificate.daysLeft < 14
                      ? 'bg-rose-500/80'
                      : certificate.daysLeft < 30
                        ? 'bg-amber-400/80'
                        : 'bg-emerald-500/70'
                  }
                />
                <p className="text-[11px] text-neutral-600 font-normal mt-2">
                  of a ninety day certificate, renewed automatically at thirty
                </p>
              </div>
            </>
          ) : (
            <Row label="Certificate" value="not readable" tone="text-neutral-500" />
          )}
        </Panel>
      </div>
      )}

      {can('services.read') && (
      <Panel title="Disk and backups" icon={HardDrive}>
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="border-b lg:border-b-0 lg:border-r border-[#17171d]">
            {disk ? (
              <>
                <Row
                  label="Root filesystem"
                  value={`${formatBytes(disk.used)} of ${formatBytes(disk.total)}`}
                  tone={disk.percent > 90 ? 'text-rose-400' : disk.percent > 75 ? 'text-amber-300' : 'text-white'}
                />
                <Row label="Free" value={formatBytes(disk.free)} />
                <div className="px-4 sm:px-6 py-5">
                  <UsageBar percent={disk.percent ?? 0} />
                  <p className="text-[11px] text-neutral-600 font-normal mt-2">
                    {disk.percent}% used
                  </p>
                </div>
              </>
            ) : (
              <Row label="Root filesystem" value="not readable" tone="text-neutral-500" />
            )}
          </div>

          <div>
            {backups ? (
              <>
                <Row label="Archives kept" value={backups.count} />
                <Row label="Newest" value={`${formatStamp(backups.created)} — ${formatAgo(backups.created)}`} />
                <Row label="Newest size" value={formatBytes(backups.bytes)} />
                <Row label="All archives" value={formatBytes(backups.totalBytes)} />
              </>
            ) : (
              <Row label="Backups" value="not readable" tone="text-neutral-500" />
            )}
          </div>
        </div>
      </Panel>
      )}

      <Panel title="Monitoring" icon={Globe}>
        <div
          className={`grid grid-cols-1 border-b border-[#17171d] -mr-px ${
            can('services.read') ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          }`}
        >
          {[
            [
              'Overall',
              status?.overall ?? 'unknown',
              status?.overall === 'operational'
                ? 'text-emerald-400'
                : !status || status.overall === 'unknown'
                  ? 'text-neutral-500'
                  : 'text-rose-400',
            ],
            ['Last checked', formatStamp(status?.checked), 'text-white'],
            ...(can('services.read')
              ? [
                  [
                    'Enquiry relay',
                    relay?.reachable
                      ? relay.webhook
                        ? 'up, delivering'
                        : deliverySettling(data)
                          ? 'up, rechecking delivery'
                          : 'up, not delivering'
                      : 'unreachable',
                    relay?.reachable && relay.webhook
                      ? 'text-emerald-400'
                      : relay?.reachable && deliverySettling(data)
                        ? 'text-amber-300'
                        : 'text-rose-400',
                  ],
                ]
              : []),
          ].map(([label, value, tone]) => (
            <div key={label} className="px-4 sm:px-6 py-5 border-r border-[#17171d]">
              <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-2">
                {label}
              </p>
              <p className={`text-[15px] font-normal leading-none ${tone}`}>{value}</p>
            </div>
          ))}
        </div>

        {Array.isArray(status?.checks) && status.checks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 -mb-px -mr-px">
            {status.checks.map((check) => (
              <div
                key={check.id}
                className="flex items-center justify-between gap-4 px-4 sm:px-6 py-4 border-r border-b border-[#17171d]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Dot state={check.status === 'up' ? 'active' : check.status === 'down' ? 'failed' : 'unknown'} />
                  <span className="text-[13px] text-neutral-300 font-normal truncate">{check.name}</span>
                </div>
                <span className="text-[12px] text-neutral-500 tabular-nums shrink-0">
                  {Number.isFinite(check.uptime) ? `${check.uptime.toFixed(2)}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Row label="Individual checks" value="none reported" tone="text-neutral-500" />
        )}
      </Panel>
    </div>
  );
}
