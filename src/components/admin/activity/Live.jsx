import React from 'react';
import { Radar } from 'lucide-react';
import {
  DEVICE_LABEL,
  SOURCE_LABEL,
  countryFlag,
  countryName,
  formatAgo,
  formatStamp,
} from '../../../lib/admin';
import { Empty, Panel, Pill } from '../ui';
import { Note } from './shared';

const SOURCE_TONE = {
  search: 'green',
  social: 'purple',
  other: 'purple',
  internal: 'neutral',
  direct: 'neutral',
};

export default function Live({ data }) {
  const rows = Array.isArray(data?.recent) ? data.recent : [];

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel
        title="The last pages opened"
        icon={Radar}
        action={
          <span className="text-[11px] text-neutral-500 font-normal">
            read {formatAgo(data?.generated)}
          </span>
        }
      >
        {rows.length === 0 ? (
          <Empty>Nobody has opened a page recently.</Empty>
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-[#17171d]">
                  {['When', 'Page', 'From', 'Where', 'On', 'Person'].map((head) => (
                    <th
                      key={head}
                      className="px-4 sm:px-6 py-3 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase whitespace-nowrap"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={`${row.at}-${row.visitor}-${index}`}
                    className="border-b border-[#17171d] last:border-b-0"
                  >
                    <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                      <span className="block text-[13px] text-white font-normal">
                        {formatAgo(row.at)}
                      </span>
                      <span className="block text-[11px] text-neutral-600">
                        {formatStamp(row.at)}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-300 font-mono max-w-[240px] truncate">
                      {row.path}
                    </td>
                    <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                      <Pill tone={SOURCE_TONE[row.source] ?? 'neutral'}>
                        {row.referer ?? SOURCE_LABEL[row.source] ?? row.source}
                      </Pill>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-300 whitespace-nowrap">
                      {row.country ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-[15px] leading-none">{countryFlag(row.country)}</span>
                          {countryName(row.country)}
                        </span>
                      ) : (
                        <span className="text-neutral-600">unplaced</span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[13px] text-neutral-400 whitespace-nowrap">
                      {row.browser}
                      <span className="text-neutral-600">
                        {' '}
                        · {DEVICE_LABEL[row.device] ?? row.device}
                      </span>
                      <span className="block text-[11px] text-neutral-600">{row.system}</span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[12px] text-neutral-500 font-mono whitespace-nowrap">
                      {row.visitor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Note>
          The most recent pages people opened, newest first, from the last time the log was read —
          so it trails real time by a couple of minutes rather than streaming. The person column is
          a hash, not an address: the same code twice is the same visitor coming back, and it cannot
          be turned back into who they are.
        </Note>
      </Panel>
    </div>
  );
}
