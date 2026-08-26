import React from 'react';
import { Globe, MapPin } from 'lucide-react';
import {
  GEO_STALE_DAYS,
  countryFlag,
  countryName,
  formatCount,
  formatStamp,
  shareOf,
} from '../../../lib/admin';
import { Bar, Empty, Notice, Panel } from '../ui';
import { Note } from './shared';
import WorldMap from './LazyMap';

function Lead({ rows, total, countries }) {
  if (total === 0) {
    return (
      <p className="text-[15px] text-neutral-300 font-normal leading-relaxed">
        Nobody has been placed on the map in this window.
      </p>
    );
  }

  const top = rows.slice(0, 3);
  const names = top.map((row) => countryName(row.name));
  const listed =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const share = Math.round(shareOf(
    top.reduce((sum, row) => sum + row.count, 0),
    total,
  ));

  return (
    <p className="text-[15px] text-neutral-300 font-normal leading-relaxed">
      <span className="text-white">{formatCount(total)}</span>{' '}
      {total === 1 ? 'person' : 'people'} from{' '}
      <span className="text-white">{countries}</span>{' '}
      {countries === 1 ? 'country' : 'countries'}.
      {top.length > 0 && (
        <>
          {' '}
          Most came from <span className="text-white">{listed}</span>
          {top.length > 1 ? ` — ${share}% of everyone between them` : ''}.
        </>
      )}
    </p>
  );
}

export default function Places({ data }) {
  const geo = data?.geo ?? { available: false };
  const rows = data?.countries ?? [];
  const total = data?.placed ?? rows.reduce((sum, row) => sum + (row.count ?? 0), 0);
  const stale = geo.available && typeof geo.ageDays === 'number' && geo.ageDays > GEO_STALE_DAYS;
  const peak = Math.max(1, ...rows.map((row) => row.count ?? 0));

  if (!geo.available) {
    return (
      <div className="w-full flex flex-col gap-6">
        <Notice>
          There is no address-to-country table on this server yet, so nothing can be put on the
          map. Nothing is missing from the log — the countries are worked out here, from the five
          regional registries&apos; own published allocation lists. Build it once with{' '}
          <span className="font-mono text-[12px]">
            python3 /opt/amitista/admin-api/build_ip_country.py
          </span>{' '}
          and the weekly timer keeps it current from then on.
        </Notice>
        <Panel title="Where people came from" icon={Globe}>
          <Empty>Waiting on the country table.</Empty>
        </Panel>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      {stale && (
        <Notice>
          The country table was last built {Math.round(geo.ageDays)} days ago. Allocations move
          slowly, so this is not urgent, but the weekly timer looks like it has not run —{' '}
          <span className="font-mono text-[12px]">systemctl status amitista-admin-geo.timer</span>.
        </Notice>
      )}

      <Panel title={`Where people came from — ${data?.label ?? 'the last 24 hours'}`} icon={Globe}>
        <div className="px-4 sm:px-6 pt-6">
          <Lead rows={rows} total={total} countries={data?.countryCount ?? rows.length} />
        </div>
        <WorldMap rows={rows} unit="people" secondUnit="pages opened" />
      </Panel>

      <Panel
        title="Country by country"
        icon={MapPin}
        action={
          data?.unplaced > 0 ? (
            <span className="text-[11px] text-neutral-500 font-normal tabular-nums">
              {formatCount(data.unplaced)} could not be placed
            </span>
          ) : null
        }
      >
        {rows.length === 0 ? (
          <Empty>Nobody has been placed in a country in this window.</Empty>
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[480px]">
              <thead>
                <tr className="border-b border-[#17171d]">
                  {['Country', 'People', 'Pages', 'Share'].map((head, index) => (
                    <th
                      key={head}
                      className={`px-4 sm:px-6 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase whitespace-nowrap ${
                        index === 0 ? '' : 'text-right'
                      }`}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-b border-[#17171d] last:border-b-0">
                    <td className="px-4 sm:px-6 py-3">
                      <span className="inline-flex items-center gap-3">
                        <span className="text-[16px] leading-none">{countryFlag(row.name)}</span>
                        <span className="text-[13px] text-white font-normal">
                          {countryName(row.name)}
                        </span>
                        <span className="text-[11px] text-neutral-600 font-mono">{row.name}</span>
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[13px] text-white tabular-nums text-right">
                      {formatCount(row.count)}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-400 tabular-nums text-right">
                      {formatCount(row.views ?? 0)}
                    </td>
                    <td className="px-4 sm:px-6 py-3 w-[140px]">
                      <Bar percent={shareOf(row.count, peak)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Note>
          Counted by person, not by request, so one visitor reading ten pages counts once — the
          pages column is how much each country actually read. A VPN puts someone wherever the exit
          is, and anyone in a range no registry has handed out is left off rather than guessed at.
        </Note>
      </Panel>

      <Panel title="How the map knows" icon={MapPin}>
        <Note>
          Built on this machine from the allocation lists AFRINIC, APNIC, ARIN, LACNIC and RIPE
          publish — {formatCount(geo.ranges ?? 0)} address ranges, last built{' '}
          {formatStamp(geo.generated)}
          {typeof geo.ageDays === 'number' ? ` (${geo.ageDays} days ago)` : ''}. No address is ever
          sent anywhere to be looked up, and no third-party database is installed. The outlines are
          Natural Earth, which is public domain.
        </Note>
      </Panel>
    </div>
  );
}
