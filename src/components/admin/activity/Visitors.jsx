import React from 'react';
import { Users, Eye, Flame, Gauge, Server } from 'lucide-react';
import {
  formatBytes,
  formatCount,
  pointLabel,
  seriesOf,
  deltaOf,
  ratioOf,
  perVisit,
} from '../../../lib/admin';
import { Figure, Hero, Panel, Row, Sparkline } from '../ui';
import { Delta, Heat, Note } from './shared';

export default function Visitors({ data }) {
  const totals = data?.totals ?? {};
  const previous = data?.previous ?? {};
  const points = Array.isArray(data?.points) ? data.points : [];
  const step = data?.step ?? 'hour';
  const marks = points.map((point) => pointLabel(point, step));

  const bounce = ratioOf(totals.bounces ?? 0, totals.sessions ?? 0);
  const depth = perVisit(totals.pageviews ?? 0, totals.sessions ?? 0);
  const botShare = ratioOf(totals.botHits ?? 0, totals.hits ?? 0);

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel title={`Who came by — ${data?.label ?? 'the last 24 hours'}`} icon={Users}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="px-4 sm:px-6 py-7 border-b lg:border-b-0 lg:border-r border-[#17171d]">
            <Hero
              value={formatCount(totals.visitors ?? 0)}
              label={`${totals.visitors === 1 ? 'person' : 'people'} came to the site`}
              footnote={`${formatCount(totals.sessions ?? 0)} visit${
                totals.sessions === 1 ? '' : 's'
              } · ${formatCount(totals.pageviews ?? 0)} page${
                totals.pageviews === 1 ? '' : 's'
              } opened`}
            />
            <div className="mt-4">
              <Delta value={deltaOf(totals.visitors ?? 0, previous.visitors ?? 0)} />
            </div>
          </div>

          <div className="px-4 sm:px-6 py-6">
            <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-3">
              People
            </p>
            <Sparkline points={seriesOf(points, 'visitors')} labels={marks} unit="visitors" height={52} />
            <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mt-6 mb-3">
              Pages opened
            </p>
            <Sparkline points={seriesOf(points, 'pageviews')} labels={marks} unit="pages" height={40} />
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-neutral-600 tracking-wider uppercase">
                {marks[0] ?? ''}
              </span>
              <span className="text-[10px] text-neutral-600 tracking-wider uppercase">now</span>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <Figure
          label="Visits"
          value={formatCount(totals.sessions ?? 0)}
          hint={`a new visit after ${data?.gapMinutes ?? 30} quiet minutes`}
        />
        <Figure
          label="Pages a visit"
          value={depth === null ? '—' : depth.toFixed(1)}
          hint="how far people go past the first page"
        />
        <Figure
          label="Left straight away"
          value={bounce === null ? '—' : `${bounce}%`}
          tone={bounce !== null && bounce >= 70 ? 'text-amber-300' : 'text-white'}
          hint="visits that opened one page and stopped"
        />
        <Figure
          label="Served"
          value={formatBytes(totals.bytes ?? 0)}
          hint="everything the server sent out"
        />
      </div>

      <Panel title={`Busiest times — last ${data?.heatDays ?? 7} days`} icon={Flame}>
        <Heat grid={data?.heat} days={data?.heatDays ?? 7} />
        <Note>
          Pages opened by people, by hour of the day in UTC. It answers when to deploy and when a
          quiet stretch is normal rather than a fault.
        </Note>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="What reached the server" icon={Server}>
          <Row label="Requests of every kind" value={formatCount(totals.hits ?? 0)} />
          <Row label="From people" value={formatCount(totals.humanHits ?? 0)} />
          <Row
            label="From robots"
            value={`${formatCount(totals.botHits ?? 0)}${botShare === null ? '' : ` · ${botShare}%`}`}
          />
          <Row
            label="Probing for holes"
            value={formatCount(totals.probes ?? 0)}
            tone={(totals.probes ?? 0) > 0 ? 'text-amber-300' : 'text-white'}
          />
          <Row label="Files, fonts and images" value={formatCount(totals.assets ?? 0)} />
          <Row
            label="From this machine"
            value={formatCount(totals.internal ?? 0)}
            tone="text-neutral-400"
          />
        </Panel>

        <Panel title="How it went" icon={Gauge}>
          <Row
            label="Pages that were not there"
            value={formatCount(totals.notFound ?? 0)}
            tone={(totals.notFound ?? 0) > 0 ? 'text-amber-300' : 'text-white'}
          />
          <Row
            label="Server errors"
            value={formatCount(totals.errors ?? 0)}
            tone={(totals.errors ?? 0) > 0 ? 'text-rose-400' : 'text-white'}
          />
          <Row
            label="Pages opened, window before"
            value={formatCount(previous.pageviews ?? 0)}
            tone="text-neutral-400"
          />
          <Row
            label="People, window before"
            value={formatCount(previous.visitors ?? 0)}
            tone="text-neutral-400"
          />
          <div className="px-4 sm:px-6 py-4 border-t border-[#17171d] flex items-center gap-3">
            <Eye className="h-3.5 w-3.5 text-neutral-600 shrink-0" strokeWidth={1.5} />
            <Delta
              value={deltaOf(totals.pageviews ?? 0, previous.pageviews ?? 0)}
              suffix="pages against the window before"
            />
          </div>
        </Panel>
      </div>

      <Panel title="What a person means here" icon={Users}>
        <Note>
          A person is one address and one browser together, hashed with a secret this server keeps
          to itself — no address is ever written down. Nobody is tracked between the two, so someone
          on a phone and a laptop counts twice, and a household behind one address counts once.
          Robots, probes and this machine&apos;s own health checks are taken out before any of these
          figures are counted.
        </Note>
      </Panel>
    </div>
  );
}
