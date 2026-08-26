import React from 'react';
import { Monitor, Smartphone, Languages } from 'lucide-react';
import { DEVICE_LABEL, formatCount } from '../../../lib/admin';
import { Panel } from '../ui';
import { Ranked, Split, Note } from './shared';

const DEVICE_TONE = {
  desktop: 'bg-purple-500/70',
  mobile: 'bg-emerald-500/70',
  tablet: 'bg-sky-500/70',
  unknown: 'bg-neutral-600',
};

export default function Tech({ data }) {
  const devices = data?.devices ?? [];
  const total = devices.reduce((sum, row) => sum + (row.count ?? 0), 0);
  const split = devices.map((row) => ({
    id: row.name,
    name: DEVICE_LABEL[row.name] ?? row.name,
    count: row.count,
    tone: DEVICE_TONE[row.name] ?? DEVICE_TONE.unknown,
  }));

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel
        title={`What they were on — ${data?.label ?? 'the last 24 hours'}`}
        icon={Smartphone}
        action={
          <span className="text-[11px] text-neutral-500 font-normal tabular-nums">
            {formatCount(total)} people
          </span>
        }
      >
        <Split rows={split} total={total} empty="Nobody has been seen in this window." />
        <Note>
          Worked out from what the browser says about itself. A phone held sideways is still a
          phone here, and anything unusual enough not to match lands in the unknown pile rather than
          being guessed at.
        </Note>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Browsers" icon={Monitor}>
          <Ranked
            rows={data?.browsers ?? []}
            empty="No browser has been seen in this window."
            unit="people"
          />
        </Panel>

        <Panel title="Systems" icon={Languages}>
          <Ranked
            rows={data?.systems ?? []}
            empty="No system has been seen in this window."
            unit="people"
            tone="bg-emerald-500/60"
          />
        </Panel>
      </div>

      <Panel title="Why this matters" icon={Monitor}>
        <Note>
          These are the browsers the site actually has to work in. If a version of Safari or a phone
          size shows up here in numbers, that is the one worth testing against before a release —
          rather than whatever happens to be open on your own machine.
        </Note>
      </Panel>
    </div>
  );
}
