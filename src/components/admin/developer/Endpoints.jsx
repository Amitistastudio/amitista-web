import React from 'react';
import { Activity, Gauge, Radar, TriangleAlert } from 'lucide-react';
import { formatAgo, formatBytes, formatCount, formatStamp } from '../../../lib/admin';
import { ROUTE_PATHS } from '../../../content/routeMeta';
import { Empty, Figure, Notice, Panel, Sparkline } from '../ui';
import { Scroller, Td, Th } from './shared';

// A 404 on a path we ship is usually a route we broke. A 404 on
// /wp-admin/install.php is somebody else's scanner. Sorting those apart is most
// of why this list is worth showing a developer at all — the third case, a path
// of ours whose 404 is deliberate, is sorted out further down.
//
// The prefixes come from ROUTE_PATHS rather than a list written out here, so a
// route added to the site starts being recognised without anyone remembering
// to update this file. /api is added by hand: it is served by the gateway, so
// it never appears in the front-end route table.
const OUR_PREFIXES = [
  ...new Set([
    '/api',
    ...ROUTE_PATHS.map((path) => `/${String(path).split('/')[1] ?? ''}`).filter(
      (prefix) => prefix.length > 1,
    ),
  ]),
];

const SCANNER = /(wp-|xmlrpc|\.env|\.git|phpmyadmin|graphql|vendor\/|\.(php|asp|aspx|jsp|cgi)$)/i;

function looksOurs(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (SCANNER.test(path)) return false;
  return OUR_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

// A path of ours that also answered requests in the same window is not broken:
// its 404 is the answer. /api/admin/boards/face gives one for somebody who has
// never set a picture, and the board draws their initials instead. The
// snapshot counts what each path served alongside what it refused, so those
// belong in the list without the alarm. A snapshot old enough not to carry the
// count reads as 0, which is the cautious way round.
const READINGS = {
  broken: 'ours — likely broken',
  answering: 'ours — also answering',
  probe: 'outside probe',
};

function reading(entry) {
  if (!looksOurs(entry.path)) return 'probe';
  return (entry.answered ?? 0) > 0 ? 'answering' : 'broken';
}

function rate(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return (part / whole) * 100;
}

export default function Endpoints({ data }) {
  const stats = data.endpoints ?? {};
  const totals = stats.totals ?? {};
  const site = stats.site ?? {};
  const rows = stats.endpoints ?? [];
  const hourly = stats.hourly ?? [];
  const notFound = stats.notFound ?? [];

  const points = hourly.map((entry) => entry.requests ?? 0);
  const labels = hourly.map((entry) => formatStamp(entry.hour));

  const serverErrors = totals.serverError ?? 0;
  const errorRate = rate(serverErrors, totals.requests);

  const read = notFound.map((entry) => ({ ...entry, reading: reading(entry) }));
  const broken = read.filter((entry) => entry.reading === 'broken');
  const answering = read.filter((entry) => entry.reading === 'answering');
  const probes = read.filter((entry) => entry.reading === 'probe');

  return (
    <div className="space-y-6">
      {serverErrors > 0 && (
        <Notice tone={errorRate >= 1 ? 'rose' : 'amber'}>
          {formatCount(serverErrors)} request{serverErrors === 1 ? '' : 's'} returned a 5xx in the
          last {stats.window ?? 24} hours ({errorRate.toFixed(2)}% of traffic). The endpoint table
          below marks which route, and{' '}
          <span className="font-mono text-[12px]">/var/log/nginx/amitista.error.log</span> has the
          detail.
        </Notice>
      )}

      {broken.length > 0 && (
        <Notice tone="amber" icon={TriangleAlert}>
          <span className="block font-semibold mb-1.5">
            {broken.length} missing path{broken.length === 1 ? ' looks' : 's look'} like ours, not a
            scanner
          </span>
          <ul className="space-y-1">
            {broken.map((entry) => (
              <li key={entry.path} className="font-mono text-[12px]">
                {entry.path}{' '}
                <span className="font-sans text-neutral-500">
                  · {formatCount(entry.requests)} hit{entry.requests === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="API requests"
          value={formatCount(totals.requests ?? 0)}
          hint={`last ${stats.window ?? 24}h`}
        />
        <Figure
          label="Server errors"
          value={formatCount(serverErrors)}
          tone={serverErrors ? 'text-rose-400' : 'text-emerald-400'}
          hint={`${errorRate.toFixed(2)}% of requests`}
        />
        <Figure
          label="Client errors"
          value={formatCount(totals.clientError ?? 0)}
          tone={(totals.clientError ?? 0) > 0 ? 'text-amber-300' : 'text-white'}
          hint={`${rate(totals.clientError, totals.requests).toFixed(1)}% · ${formatCount(totals.rateLimited ?? 0)} rate limited`}
        />
        <Figure
          label="Site 404s"
          value={formatCount(site.notFound ?? 0)}
          tone={broken.length ? 'text-amber-300' : 'text-white'}
          hint={`of ${formatCount(site.requests ?? 0)} page requests`}
        />
      </div>

      <Panel
        title="Requests per hour"
        icon={Activity}
        action={
          <span className="text-[11px] text-neutral-600 tabular-nums">
            snapshot {formatAgo(stats.generated ?? data.generated)}
          </span>
        }
      >
        <div className="px-4 sm:px-6 py-5">
          {points.length === 0 ? (
            <Empty>No hourly figures were recorded.</Empty>
          ) : (
            <Sparkline points={points} labels={labels} height={64} />
          )}
        </div>
      </Panel>

      <Panel
        title="Endpoints"
        icon={Gauge}
        action={
          !stats.timed && (
            <span className="text-[11px] text-neutral-600">
              timing off — p50/p95 unrecorded
            </span>
          )
        }
      >
        {rows.length === 0 ? (
          <Empty>No endpoint figures were recorded.</Empty>
        ) : (
          <Scroller min={720}>
            <thead>
              <tr className="border-b border-[#17171d]">
                <Th>Endpoint</Th>
                <Th align="right">Requests</Th>
                <Th align="right">4xx</Th>
                <Th align="right">5xx</Th>
                <Th align="right">Limited</Th>
                <Th align="right">Sent</Th>
                <Th align="right">p50 / p95</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.path ?? row.label} className="border-b border-[#17171d] last:border-b-0">
                  <Td>
                    <span className="block text-[13px] text-white font-normal">{row.label}</span>
                    <span className="block text-[11px] text-neutral-600 font-mono">{row.path}</span>
                  </Td>
                  <Td className="text-right text-[13px] text-neutral-300 tabular-nums">
                    {formatCount(row.requests ?? 0)}
                  </Td>
                  <Td
                    className={`text-right text-[13px] tabular-nums ${
                      (row.clientError ?? 0) > 0 ? 'text-amber-300' : 'text-neutral-600'
                    }`}
                  >
                    {formatCount(row.clientError ?? 0)}
                  </Td>
                  <Td
                    className={`text-right text-[13px] tabular-nums ${
                      (row.serverError ?? 0) > 0 ? 'text-rose-400 font-semibold' : 'text-neutral-600'
                    }`}
                  >
                    {formatCount(row.serverError ?? 0)}
                  </Td>
                  <Td
                    className={`text-right text-[13px] tabular-nums ${
                      (row.rateLimited ?? 0) > 0 ? 'text-amber-300' : 'text-neutral-600'
                    }`}
                  >
                    {formatCount(row.rateLimited ?? 0)}
                  </Td>
                  <Td className="text-right text-[13px] text-neutral-400 tabular-nums">
                    {formatBytes(row.bytes ?? 0)}
                  </Td>
                  <Td className="text-right text-[13px] text-neutral-400 tabular-nums">
                    {Number.isFinite(row.p50) || Number.isFinite(row.p95)
                      ? `${Number.isFinite(row.p50) ? `${row.p50}ms` : '—'} / ${Number.isFinite(row.p95) ? `${row.p95}ms` : '—'}`
                      : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Scroller>
        )}
      </Panel>

      <Panel title="Missing paths" icon={Radar}>
        {notFound.length === 0 ? (
          <Empty>Nothing 404ed in this window.</Empty>
        ) : (
          <Scroller min={520}>
            <thead>
              <tr className="border-b border-[#17171d]">
                <Th>Path</Th>
                <Th align="right">Hits</Th>
                <Th align="right">Reading</Th>
              </tr>
            </thead>
            <tbody>
              {[...broken, ...answering, ...probes].map((entry) => {
                const alarm = entry.reading === 'broken';
                return (
                  <tr key={entry.path} className="border-b border-[#17171d] last:border-b-0">
                    <Td>
                      <span
                        className={`font-mono text-[12px] ${alarm ? 'text-amber-300' : 'text-neutral-400'}`}
                      >
                        {entry.path}
                      </span>
                    </Td>
                    <Td className="text-right text-[13px] text-neutral-300 tabular-nums">
                      {formatCount(entry.requests ?? 0)}
                    </Td>
                    <Td className="text-right text-[12px]">
                      <span className={alarm ? 'text-amber-300' : 'text-neutral-600'}>
                        {READINGS[entry.reading]}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Scroller>
        )}
      </Panel>
    </div>
  );
}
