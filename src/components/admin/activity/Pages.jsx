import React from 'react';
import { FileText, Route, Link2 } from 'lucide-react';
import { formatCount } from '../../../lib/admin';
import { Panel } from '../ui';
import { Ranked, Note } from './shared';

export default function Pages({ data }) {
  const pages = (data?.pages ?? []).map((row) => ({ name: row.path, count: row.count }));
  const entries = (data?.entries ?? []).map((row) => ({ name: row.path, count: row.count }));
  const broken = (data?.broken ?? []).map((row) => ({
    name: row.path,
    count: row.count,
    from: row.from,
  }));

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel
        title={`Most opened — ${data?.label ?? 'the last 24 hours'}`}
        icon={FileText}
        action={
          <span className="text-[11px] text-neutral-500 font-normal tabular-nums">
            {formatCount(data?.totals?.pageviews ?? 0)} in all
          </span>
        }
      >
        <Ranked rows={pages} empty="No page was opened in this window." unit="views" />
        <Note>
          Only real pages count here — the bundles, fonts and images a page pulls in are left out,
          and so is everything under /api. A reload counts again.
        </Note>
      </Panel>

      <Panel title="Where people arrive" icon={Route}>
        <Ranked
          rows={entries}
          empty="No visit started in this window."
          unit="visits"
          tone="bg-emerald-500/60"
        />
        <Note>
          The first page of each visit. If a page shows up here that you never advertise, something
          is linking straight to it.
        </Note>
      </Panel>

      <Panel title="Links that led nowhere" icon={Link2}>
        <Ranked
          rows={broken}
          empty="Nothing asked for a missing page from a real link."
          unit="times"
          tone="bg-amber-500/60"
          detail={(row) => (row.from ? `linked from ${row.from}` : null)}
        />
        <Note>
          A page that answered 404 while something genuinely linked to it. Scanners guessing at
          addresses are filtered out, so anything left is a link worth fixing — on this site or on
          whoever else is pointing here.
        </Note>
      </Panel>
    </div>
  );
}
