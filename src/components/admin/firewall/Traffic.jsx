import React from 'react';
import { Activity } from 'lucide-react';
import { Empty, Panel, Pill } from '../ui';

const MARK_LABEL = {
  ip: 'address',
  path: 'path',
  signature: 'signature',
  agent: 'agent',
  method: 'method',
};

function when(value) {
  if (!value) return '—';
  return value.replace('T', ' ').replace('Z', '');
}

export default function Traffic({ data }) {
  const events = data.events ?? [];

  return (
    <Panel title="Recent matches" icon={Activity}>
      {events.length === 0 ? (
        <Empty>
          Nothing has matched a rule yet. Blocked and watched requests both land here — the edge
          layer from the nginx log, the app layer from the panel's own record.
        </Empty>
      ) : (
        <ul className="divide-y divide-[#282832]">
          {events.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="px-4 sm:px-6 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <Pill tone={entry.action === 'blocked' ? 'rose' : 'amber'}>
                  {entry.action === 'blocked' ? 'Blocked' : 'Watched'}
                </Pill>
                <Pill tone={entry.layer === 'edge' ? 'purple' : 'neutral'}>
                  {entry.layer === 'edge' ? 'nginx' : 'panel'}
                </Pill>
                <span className="font-mono text-neutral-300">{entry.ip}</span>
                {entry.country && <span className="text-neutral-500">{entry.country}</span>}
                <span className="text-neutral-600 font-mono ml-auto">{when(entry.at)}</span>
              </div>
              <p className="text-[12px] text-neutral-400 font-mono mt-1 break-all">
                {entry.method} {entry.target}
                {entry.status ? ` → ${entry.status}` : ''}
              </p>
              <p className="text-[11px] text-neutral-600 font-normal mt-1">
                {entry.layer === 'edge'
                  ? `matched on ${(entry.matched ?? []).map((mark) => MARK_LABEL[mark] ?? mark).join(', ') || 'a rule'}`
                  : `matched ${entry.kind} ${entry.value}`}
                {entry.agent ? ` · ${entry.agent.slice(0, 90)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
