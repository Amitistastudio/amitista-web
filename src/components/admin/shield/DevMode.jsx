import React from 'react';
import {
  SlidersHorizontal,
  ShieldCheck,
  ShieldAlert,
  Stethoscope,
  Server,
  Play,
} from 'lucide-react';
import {
  SHIELD_MODE_LABEL,
  SHIELD_MODE_NOTE,
  formatAgo,
  formatCount,
  formatStamp,
} from '../../../lib/admin';
import { Button, Empty, Notice, Panel, Pill, Row } from '../ui';
import { Confirm } from '../api/shared';
import { Unreachable } from './shared';

function uptime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export default function DevMode({ shield, canManage, busy, onMode, onSelfTest }) {
  const state = shield?.state ?? null;
  const mode = state?.mode ?? null;
  const health = state?.health ?? null;
  const policy = state?.policy ?? null;
  const flags = state?.flags ?? null;
  const service = shield?.service ?? null;

  return (
    <div className="w-full flex flex-col gap-6">
      <Unreachable shield={shield} />

      <Panel title="Mode" icon={SlidersHorizontal}>
        {!state ? (
          <Empty>The mode can only be read while the evaluator is answering.</Empty>
        ) : (
          <div className="px-4 sm:px-6 py-5">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className="text-2xl font-normal text-white leading-none">
                {SHIELD_MODE_LABEL[mode] ?? mode}
              </span>
              <Pill tone={mode === 'block' ? 'rose' : 'amber'}>{mode}</Pill>
            </div>

            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-6 max-w-2xl">
              {SHIELD_MODE_NOTE[mode] ?? 'The evaluator did not say which mode it is in.'}
            </p>

            {canManage ? (
              <div className="flex items-center gap-3 flex-wrap">
                {(state.modes ?? ['monitor', 'block']).map((option) => {
                  if (option === mode) {
                    return (
                      <Button key={option} type="button" disabled>
                        {option === 'block' ? (
                          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
                        ) : (
                          <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2} />
                        )}
                        Already {option}
                      </Button>
                    );
                  }
                  return (
                    <Confirm
                      key={option}
                      label={`Switch to ${option}`}
                      danger={option === 'monitor'}
                      onConfirm={() => onMode(option)}
                    >
                      {option === 'monitor'
                        ? 'Yes, stop refusing anything'
                        : 'Yes, start refusing attacks'}
                    </Confirm>
                  );
                })}
              </div>
            ) : (
              <p className="text-[12px] text-neutral-600 font-normal">
                Changing the mode needs the shield.manage permission.
              </p>
            )}

            {mode === 'monitor' && (
              <div className="mt-6">
                <Notice>
                  Nothing is being refused. Every rule still runs and every flag is still written,
                  so the Flags tab shows what block mode would have stopped.
                </Notice>
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel
        title="Are the hooks actually in?"
        icon={Stethoscope}
        action={
          canManage ? (
            <Button type="button" onClick={onSelfTest} disabled={busy || !shield?.reachable}>
              <Play className="h-3.5 w-3.5" strokeWidth={2} />
              {busy ? 'Running…' : 'Run self-test'}
            </Button>
          ) : null
        }
      >
        {!health ? (
          <Empty>No self-test has been run since the evaluator started.</Empty>
        ) : (
          <div>
            <div className="px-4 sm:px-6 py-4 border-b border-[#17171d]">
              <div className="flex items-center gap-3 flex-wrap">
                <Pill tone={health.healthy ? 'green' : 'rose'}>
                  {health.healthy ? 'every hook is in' : 'degraded'}
                </Pill>
                {health.preloaded ? <Pill tone="purple">preloaded</Pill> : null}
                <span className="text-[12px] text-neutral-600 font-normal">
                  {state?.healthAt ? `${formatStamp(state.healthAt)} · ${formatAgo(state.healthAt)}` : ''}
                </span>
              </div>
              {!health.healthy && (
                <p className="text-[13px] text-rose-300/90 font-normal leading-relaxed mt-3">
                  Not hooked: {(health.unprotected ?? []).join(', ') || 'unknown'}. Calls to those
                  are not inspected, which looks exactly like having no attacks.
                </p>
              )}
            </div>

            {(health.probes ?? []).map((probe) => (
              <Row
                key={`${probe.specifier}-${probe.name}`}
                label={`${probe.label} — ${probe.specifier}.${probe.name}`}
                value={probe.hooked ? 'hooked' : 'not hooked'}
                tone={probe.hooked ? 'text-emerald-400' : 'text-rose-400'}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="What this evaluator is running" icon={Server}>
        {!state ? (
          <Empty>Nothing to show while the evaluator is not answering.</Empty>
        ) : (
          <div>
            <Row label="Package version" value={state.version ?? '—'} />
            <Row label="Started" value={state.started ? formatStamp(state.started) : '—'} />
            <Row label="Up for" value={uptime(state.uptimeSeconds)} />
            <Row
              label="Rate limit"
              value={
                policy?.rateLimit
                  ? `${policy.rateLimit.max}/${Math.round((policy.rateLimit.windowMs ?? 60000) / 1000)}s`
                  : '—'
              }
            />
            <Row
              label="Burst ceiling"
              value={policy?.rateLimit?.burstMax ? `${policy.rateLimit.burstMax}/s` : '—'}
            />
            <Row label="Baseline learning" value={policy?.learn === false ? 'off' : 'on'} />
            <Row label="Block page" value={policy?.blockPage === false ? 'off — JSON only' : 'on'} />
            <Row label="Ignored" value={policy?.ignores ?? '—'} />
            <Row label="Flags written" value={formatCount(flags?.written ?? 0)} />
            <Row
              label="Flags dropped"
              value={formatCount(flags?.dropped ?? 0)}
              tone={(flags?.dropped ?? 0) > 0 ? 'text-amber-300' : 'text-white'}
            />
            <Row label="Flag file" value={shield?.flagFile ?? '—'} />
            {service ? (
              <Row
                label={service.unit}
                value={`${service.state}${service.detail ? ` · ${service.detail}` : ''}`}
                tone={service.state === 'active' ? 'text-emerald-400' : 'text-rose-400'}
              />
            ) : null}
          </div>
        )}
      </Panel>

      <Panel title="Why monitor is the default" icon={SlidersHorizontal}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            A tool that refuses traffic on day one gets turned off on day two. Monitor mode earns the
            right to block: run it, read the flags, and only switch once the list is attacks rather
            than the application doing its job.
          </p>
          <p>
            Baseline deviations never refuse, whatever the mode, unless learn.enforce is turned on
            deliberately. They carry the highest false-positive risk in the package.
          </p>
        </div>
      </Panel>
    </div>
  );
}
