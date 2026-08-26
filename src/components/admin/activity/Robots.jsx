import React from 'react';
import { Bot, Radar, ShieldAlert } from 'lucide-react';
import { countryName, formatCount, ratioOf } from '../../../lib/admin';
import { Figure, Panel } from '../ui';
import { Ranked, Split, Note } from './shared';
import WorldMap from './LazyMap';

export default function Robots({ data }) {
  const totals = data?.totals ?? {};
  const human = totals.humanHits ?? 0;
  const bot = totals.botHits ?? 0;
  const probe = totals.probes ?? 0;
  const inside = totals.internal ?? 0;
  const total = human + bot + probe + inside;

  const split = [
    { id: 'human', name: 'People', count: human, tone: 'bg-emerald-500/70' },
    { id: 'bot', name: 'Robots and crawlers', count: bot, tone: 'bg-purple-500/70' },
    { id: 'probe', name: 'Probing for holes', count: probe, tone: 'bg-rose-500/70' },
    { id: 'internal', name: 'This machine itself', count: inside, tone: 'bg-neutral-600' },
  ];

  const places = (data?.probeCountries ?? []).map((row) => ({
    ...row,
    title: countryName(row.name),
  }));

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel title={`Who is really calling — ${data?.label ?? 'the last 24 hours'}`} icon={Bot}>
        <Split rows={split} total={total} empty="Nothing reached the server in this window." />
      </Panel>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <Figure label="Requests from people" value={formatCount(human)} />
        <Figure
          label="Robot share"
          value={ratioOf(bot, total) === null ? '—' : `${ratioOf(bot, total)}%`}
        />
        <Figure
          label="Probes"
          value={formatCount(probe)}
          tone={probe > 0 ? 'text-amber-300' : 'text-white'}
        />
        <Figure
          label="Distinct robots"
          value={formatCount((data?.bots ?? []).length)}
          hint="in the top of the list"
        />
      </div>

      <Panel title="Robots by name" icon={Radar}>
        <Ranked
          rows={data?.bots ?? []}
          empty="No robot called in this window."
          unit="requests"
        />
        <Note>
          Named from what each one says it is, which crawlers are generally honest about. Search
          engines and AI crawlers reading the site is normal and wanted; the point of this list is
          to spot one that has started reading far more than it needs to.
        </Note>
      </Panel>

      <Panel title="What they went looking for" icon={ShieldAlert}>
        <Ranked
          rows={data?.probes ?? []}
          empty="Nothing went looking for a way in."
          unit="tries"
          tone="bg-rose-500/60"
        />
        <Note>
          Addresses that only make sense to someone hunting for an unpatched WordPress, an exposed
          .env or a leftover admin tool. None of this exists here and every one of them got a 404 —
          they are shown because a spike is worth knowing about, and because they are kept out of
          every visitor figure in the other tabs.
        </Note>
      </Panel>

      <Panel title="Where the probing comes from" icon={ShieldAlert}>
        {places.length === 0 ? (
          <Ranked rows={places} empty="No probe has been placed in a country." />
        ) : (
          <WorldMap
            rows={places}
            tone="rose"
            unit="tries"
            secondUnit=""
            caption="Hover a country to read it. Click to keep it open."
          />
        )}
        <Note>
          Worth a glance before banning a country outright: your own security scans show up here
          too, and so does anything routed through a hosting provider abroad.
        </Note>
      </Panel>
    </div>
  );
}
