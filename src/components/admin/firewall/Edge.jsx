import React from 'react';
import { Server, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button, Check, Notice, Panel, Pill, Row } from '../ui';

const STATE_PILL = {
  applied: { tone: 'green', label: 'Live' },
  current: { tone: 'green', label: 'In step' },
  refused: { tone: 'rose', label: 'Refused' },
  failed: { tone: 'rose', label: 'Failed' },
  missing: { tone: 'amber', label: 'Not staged' },
  unknown: { tone: 'amber', label: 'Unreported' },
};

export default function Edge({ data, canManage, busy, onSettings, onRestage }) {
  const edge = data.edge ?? {};
  const pill = STATE_PILL[edge.state] ?? STATE_PILL.unknown;
  const settings = data.settings ?? {};

  return (
    <div className="space-y-6">
      <Panel
        title="Both layers"
        icon={ShieldAlert}
        action={
          canManage ? (
            <Button type="button" disabled={busy} onClick={onRestage}>
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              Rewrite edge config
            </Button>
          ) : null
        }
      >
        <div className="px-4 sm:px-6 py-5">
          <Check
            checked={Boolean(settings.enabled)}
            disabled={!canManage || busy}
            onChange={(value) => onSettings({ enabled: value })}
            label="Firewall on"
            hint="Off means no rule blocks or logs anything, at either layer."
          />

          <div className="mt-4">
            <p className="text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-2">
              Default mode for new rules
            </p>
            <div className="inline-flex border border-[#282832] bg-[#0a0a0d]">
              {[
                ['monitor', 'Watch'],
                ['block', 'Block'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={!canManage || busy}
                  onClick={() => onSettings({ defaultMode: value })}
                  aria-pressed={settings.defaultMode === value}
                  className={`px-4 py-2 text-[12px] font-semibold tracking-wide transition-colors disabled:opacity-40 ${
                    settings.defaultMode === value
                      ? 'bg-purple-500/15 text-white'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Edge layer (nginx)" icon={Server}>
        <div className="px-4 sm:px-6 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <Pill tone={pill.tone}>{pill.label}</Pill>
            <span className="text-[12px] text-neutral-500 font-mono">{edge.at ?? 'never'}</span>
          </div>

          {edge.detail && (
            <pre className="text-[11px] text-neutral-400 font-mono whitespace-pre-wrap break-all bg-[#0a0a0d] border border-[#282832] px-4 py-3">
              {edge.detail}
            </pre>
          )}

          {(edge.state === 'refused' || edge.state === 'failed') && (
            <Notice tone="rose">
              nginx would not take the generated config, so the edge layer is still running the last
              one it accepted. The app layer is unaffected. Rules of kind address and country only
              act at the edge, so those are not in force until this clears.
            </Notice>
          )}

          {edge.state === 'unknown' && (
            <Notice tone="amber">
              amitista-firewall.path has not reported yet. Until the unit is installed and enabled,
              rules only act in the app layer — the panel and the admin API — and not on the static
              site.
            </Notice>
          )}
        </div>

        <div className="border-t border-[#282832] px-4 sm:px-6 py-4 space-y-2">
          <Row label="Your address" value={data.you?.ip ?? '—'} />
          <Row label="Your country" value={data.you?.country ?? 'unknown'} />
          <Row
            label="Country table"
            value={data.geo?.available ? 'loaded' : 'missing'}
            tone={data.geo?.available ? 'text-white' : 'text-amber-300'}
          />
        </div>
      </Panel>
    </div>
  );
}
