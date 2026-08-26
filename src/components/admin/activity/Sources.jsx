import React from 'react';
import { Signpost, ExternalLink, Compass } from 'lucide-react';
import { SOURCE_LABEL, SOURCE_NOTE, SOURCE_TONE, formatCount, shortUri } from '../../../lib/admin';
import { Panel, Row } from '../ui';
import { Ranked, Split, Note } from './shared';

const ORDER = ['search', 'social', 'other', 'direct', 'internal'];

export default function Sources({ data }) {
  const sources = data?.sources ?? {};
  const total = ORDER.reduce((sum, name) => sum + (sources[name] ?? 0), 0);
  const rows = ORDER.map((name) => ({
    id: name,
    name: SOURCE_LABEL[name] ?? name,
    count: sources[name] ?? 0,
    tone: SOURCE_TONE[name] ?? 'bg-purple-500/70',
  }));

  const referrers = data?.referrers ?? [];
  const urls = data?.urls ?? [];
  const found = (sources.search ?? 0) + (sources.social ?? 0) + (sources.other ?? 0);

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel
        title={`How people got here — ${data?.label ?? 'the last 24 hours'}`}
        icon={Signpost}
        action={
          <span className="text-[11px] text-neutral-500 font-normal tabular-nums">
            {formatCount(total)} page{total === 1 ? '' : 's'}
          </span>
        }
      >
        <Split rows={rows} total={total} empty="No page was opened in this window." />
        <div className="border-t border-[#17171d]">
          {ORDER.filter((name) => (sources[name] ?? 0) > 0).map((name) => (
            <div key={name} className="px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0">
              <p className="text-[13px] text-white font-normal mb-1">{SOURCE_LABEL[name]}</p>
              <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">
                {SOURCE_NOTE[name]}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Sites that sent people"
        icon={Compass}
        action={
          <span className="text-[11px] text-neutral-500 font-normal tabular-nums">
            {formatCount(found)} from elsewhere
          </span>
        }
      >
        <Ranked
          rows={referrers}
          empty="Nowhere outside this site linked here in this window."
          unit="pages"
        />
        <Note>
          Counted by the site that sent them, with the www dropped. Browsers hide the referrer on
          plenty of links now — anything they hide lands in the typed-or-bookmarked pile instead, so
          treat this as a floor rather than the whole picture.
        </Note>
      </Panel>

      <Panel title="The exact links" icon={ExternalLink}>
        <Ranked
          rows={urls}
          empty="No referring address was recorded."
          unit="pages"
          tone="bg-sky-500/60"
          label={(row) => shortUri(row.name, 78)}
        />
      </Panel>

      <Panel title="Moving around the site" icon={Signpost}>
        <Row label="Pages opened from another page here" value={formatCount(sources.internal ?? 0)} />
        <Row label="Pages opened with no referrer at all" value={formatCount(sources.direct ?? 0)} />
      </Panel>
    </div>
  );
}
