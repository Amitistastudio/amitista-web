import React from 'react';
import { Archive, Rocket, Undo2 } from 'lucide-react';
import { formatBytes, formatStamp, formatAgo, releaseLabel } from '../../../lib/admin';
import { Dot, Empty, Figure, Notice, Panel, Pill, Row } from '../ui';
import { Scroller, Td, Th } from './shared';

function Delta({ bytes }) {
  if (!Number.isFinite(bytes)) return <span className="text-neutral-700">—</span>;
  if (bytes === 0) return <span className="text-neutral-600">no change</span>;
  const grew = bytes > 0;
  return (
    <span className={grew ? 'text-amber-300' : 'text-emerald-400'}>
      {grew ? '+' : '−'}
      {formatBytes(Math.abs(bytes))}
    </span>
  );
}

export default function Releases({ data }) {
  const block = data.releases ?? {};
  const releases = block.releases ?? [];
  const rollback = block.rollbackTargets ?? [];
  const current = releases.find((release) => release.current) ?? null;
  const broken = releases.filter((release) => !release.hasIndex);

  return (
    <div className="space-y-6">
      {broken.length > 0 && (
        <Notice tone="rose">
          {broken.length} release{broken.length === 1 ? '' : 's'} on disk{' '}
          {broken.length === 1 ? 'has' : 'have'} no index.html, so rolling back to{' '}
          {broken.length === 1 ? 'it' : 'them'} would serve nothing:{' '}
          <span className="font-mono text-[12px]">
            {broken.map((release) => release.name).join(', ')}
          </span>
          .
        </Notice>
      )}

      {rollback.length === 0 && releases.length > 0 && (
        <Notice tone="amber" icon={Undo2}>
          There is nothing to roll back to — the live release is the only one on disk. The next
          deploy will have no safety net until a second build lands.
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Serving"
          value={current ? formatAgo(current.created) : '—'}
          hint={current ? 'since this build landed' : undefined}
        />
        <Figure label="On disk" value={releases.length} hint="releases kept" />
        <Figure
          label="Rollback targets"
          value={rollback.length}
          tone={rollback.length ? 'text-white' : 'text-amber-300'}
        />
        <Figure
          label="Build size"
          value={current ? formatBytes(current.bytes) : '—'}
          hint={current && Number.isFinite(current.delta) ? 'latest build' : undefined}
        />
      </div>

      <Panel title="Live release" icon={Rocket}>
        <Row label="Serving" value={releaseLabel(block.current)} />
        <Row
          label="Directory"
          value={<span className="font-mono text-[12px]">{block.current ?? '—'}</span>}
        />
        <Row
          label="Path"
          value={
            <span className="font-mono text-[12px]">
              /var/www/amitista.com/releases/{block.current ?? '—'}
            </span>
          }
        />
        <Row label="Host" value={<span className="font-mono text-[12px]">{block.host ?? '—'}</span>} />
      </Panel>

      <Panel title="Deploy history" icon={Archive}>
        {releases.length === 0 ? (
          <Empty>No releases were readable.</Empty>
        ) : (
          <Scroller min={680}>
            <thead>
              <tr className="border-b border-[#17171d]">
                <Th>Release</Th>
                <Th>Built</Th>
                <Th align="right">Size</Th>
                <Th align="right">Change</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody>
              {releases.map((release) => (
                <tr key={release.name} className="border-b border-[#17171d] last:border-b-0">
                  <Td className="font-mono text-[12px] text-white">{release.name}</Td>
                  <Td className="text-[13px] text-neutral-400">
                    {formatStamp(release.created)}
                    <span className="block text-[11px] text-neutral-600">
                      {formatAgo(release.created)}
                    </span>
                  </Td>
                  <Td className="text-right text-[13px] text-neutral-400 tabular-nums">
                    {formatBytes(release.bytes)}
                  </Td>
                  <Td className="text-right text-[13px] tabular-nums">
                    <Delta bytes={release.delta} />
                  </Td>
                  <Td>
                    {release.current ? (
                      <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-emerald-400">
                        <Dot state="active" /> live
                      </span>
                    ) : !release.hasIndex ? (
                      <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-rose-400">
                        <Dot state="failed" /> no index.html
                      </span>
                    ) : rollback.includes(release.name) ? (
                      <Pill>rollback target</Pill>
                    ) : (
                      <span className="text-[12px] text-neutral-600">kept</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Scroller>
        )}
      </Panel>
    </div>
  );
}
