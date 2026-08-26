import React from 'react';
import { Radar, Rss, SlidersHorizontal, Check as CheckIcon } from 'lucide-react';
import {
  SEVERITY_RANK,
  TUNING_LABEL,
  TUNING_NOTE,
  TUNING_TONE,
  formatAgo,
  formatCount,
} from '../../../lib/admin';
import { Button, Empty, Notice, Panel, Pill, Select, TextInput } from '../ui';
import { SeverityPill, Unreachable } from './shared';

function Tuner({ rule, tuned, busy, onApply }) {
  const [mode, setMode] = React.useState(tuned?.mode ?? 'enforce');
  const [paths, setPaths] = React.useState((tuned?.paths ?? []).join(', '));
  const [note, setNote] = React.useState(tuned?.note ?? '');

  React.useEffect(() => {
    setMode(tuned?.mode ?? 'enforce');
    setPaths((tuned?.paths ?? []).join(', '));
    setNote(tuned?.note ?? '');
  }, [tuned]);

  const parsed = paths
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const bad = parsed.filter((entry) => !entry.startsWith('/'));
  const dirty =
    mode !== (tuned?.mode ?? 'enforce') ||
    parsed.join(',') !== (tuned?.paths ?? []).join(',') ||
    note !== (tuned?.note ?? '');

  return (
    <div className="mt-4 border border-[#282832] bg-[#08080b] px-4 py-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <Select value={mode} aria-label={`How to treat ${rule.id}`} onChange={(e) => setMode(e.target.value)}>
          <option value="enforce">Enforcing</option>
          <option value="record">Record only</option>
          <option value="silence">Silenced</option>
        </Select>
        <TextInput
          value={paths}
          spellCheck="false"
          aria-label={`Paths for ${rule.id}`}
          placeholder="/upload, /api/import (blank = everywhere)"
          onChange={(e) => setPaths(e.target.value)}
        />
        <TextInput
          value={note}
          aria-label={`Why ${rule.id} is tuned`}
          placeholder="Why (optional)"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <p className="text-[12px] text-neutral-500 font-normal leading-relaxed mb-3">
        {TUNING_NOTE[mode]}
        {parsed.length > 0 && mode !== 'enforce'
          ? ` Only under ${parsed.join(', ')} — everywhere else it keeps enforcing.`
          : ''}
      </p>

      {bad.length > 0 && (
        <p className="text-[12px] text-rose-400 font-normal mb-3">
          Paths must start with a slash: {bad.join(', ')}
        </p>
      )}

      <Button
        type="button"
        tone={dirty ? 'solid' : 'quiet'}
        disabled={busy || !dirty || bad.length > 0}
        onClick={() => onApply(rule.id, mode, parsed, note)}
      >
        <CheckIcon className="h-3.5 w-3.5" strokeWidth={2} />
        {busy ? 'Applying…' : dirty ? 'Apply' : 'No change'}
      </Button>
    </div>
  );
}

export default function Detect({ shield, canManage, busy, onTune }) {
  const [layer, setLayer] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [openRule, setOpenRule] = React.useState(null);

  const rules = shield?.state?.rules ?? [];
  const layers = shield?.state?.layers ?? {};
  const feed = shield?.state?.feed ?? null;
  const tuned = shield?.state?.tuned ?? {};
  const tunedCount = Object.keys(tuned).length;

  const counted = React.useMemo(() => {
    const out = {};
    for (const flag of shield?.history ?? []) {
      if (!flag?.id) continue;
      out[flag.id] = (out[flag.id] ?? 0) + 1;
    }
    return out;
  }, [shield]);

  const shown = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rules
      .filter((rule) => layer === 'all' || rule.layer === layer)
      .filter((rule) => layer !== 'tuned' || tuned[rule.id])
      .filter(
        (rule) =>
          !needle ||
          rule.id.includes(needle) ||
          (rule.label ?? '').toLowerCase().includes(needle) ||
          (rule.detail ?? '').toLowerCase().includes(needle),
      )
      .sort(
        (left, right) =>
          (SEVERITY_RANK[left.severity] ?? 3) - (SEVERITY_RANK[right.severity] ?? 3),
      );
  }, [rules, layer, query, tuned]);

  if (!shield?.reachable) {
    return (
      <div className="w-full flex flex-col gap-6">
        <Unreachable shield={shield} />
        <Panel title="Rules" icon={Radar}>
          <Empty>
            The rule list is served by the evaluator, so it cannot be shown while that service is
            not answering.
          </Empty>
        </Panel>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      {tunedCount > 0 && (
        <Notice tone="amber" icon={SlidersHorizontal}>
          {tunedCount} rule{tunedCount === 1 ? ' is' : 's are'} tuned away from the default. Anything
          silenced is neither recorded nor refused — worth re-reading now and then.
        </Notice>
      )}

      <Panel title={`What Shield looks for — ${shown.length} rules`} icon={Radar}>
        <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            value={layer}
            aria-label="Filter by layer"
            onChange={(event) => setLayer(event.target.value)}
          >
            <option value="all">Every layer</option>
            {Object.entries(layers).map(([id, entry]) => (
              <option key={id} value={id}>
                {entry.label}
              </option>
            ))}
            {tunedCount > 0 ? <option value="tuned">Tuned only</option> : null}
          </Select>
          <TextInput
            type="search"
            value={query}
            placeholder="Search rules"
            aria-label="Search rules"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {layer !== 'all' && layers[layer] ? (
          <div className="px-4 sm:px-6 py-3 border-b border-[#17171d]">
            <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">
              {layers[layer].detail}
            </p>
          </div>
        ) : null}

        {shown.length === 0 && <Empty>No rule matches that.</Empty>}

        {shown.map((rule) => {
          const setting = tuned[rule.id] ?? null;
          const mode = setting?.mode ?? 'enforce';
          const seen = counted[rule.id] ?? 0;
          const open = openRule === rule.id;
          return (
            <div key={rule.id} className="px-4 sm:px-6 py-4 border-b border-[#17171d] last:border-b-0">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-[13px] text-white font-mono">{rule.id}</span>
                  <SeverityPill severity={rule.severity} />
                  <Pill>{layers[rule.layer]?.label ?? rule.layer}</Pill>
                  {mode === 'enforce' ? (
                    rule.refuses ? <Pill tone="rose">refuses</Pill> : <Pill>records</Pill>
                  ) : (
                    <Pill tone={TUNING_TONE[mode]}>{TUNING_LABEL[mode]}</Pill>
                  )}
                  {setting?.paths?.length ? (
                    <Pill tone="purple">on {setting.paths.join(', ')}</Pill>
                  ) : null}
                </div>
                <span className="text-[12px] text-neutral-600 font-normal tabular-nums shrink-0">
                  {seen > 0 ? `${formatCount(seen)} flagged` : '—'}
                </span>
              </div>

              <p className="text-[13px] text-neutral-300 font-normal leading-relaxed">
                {rule.label}
              </p>
              <p className="text-[13px] text-neutral-500 font-normal leading-relaxed mt-1">
                {rule.detail}
              </p>
              {rule.note ? (
                <p className="text-[12px] text-neutral-600 font-normal leading-relaxed mt-2">
                  {rule.note}
                </p>
              ) : null}

              <div className="flex items-center gap-3 flex-wrap mt-2">
                <p className="text-[11px] text-neutral-700 font-mono">sink: {rule.sink}</p>
                {setting ? (
                  <p className="text-[11px] text-neutral-600 font-normal">
                    tuned {formatAgo(setting.at)}
                    {setting.by ? ` by ${setting.by}` : ''}
                    {setting.note ? ` — ${setting.note}` : ''}
                  </p>
                ) : null}
              </div>

              {canManage ? (
                <>
                  <button
                    type="button"
                    onClick={() => setOpenRule(open ? null : rule.id)}
                    aria-expanded={open}
                    className="mt-3 inline-flex items-center gap-2 text-[12px] font-semibold text-neutral-400 hover:text-neutral-200 transition-colors"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
                    {open ? 'Close' : 'Tune this rule'}
                  </button>
                  {open ? (
                    <Tuner rule={rule} tuned={setting} busy={busy} onApply={onTune} />
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
      </Panel>

      <Panel title="What tuning actually does" icon={SlidersHorizontal}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            <span className="text-neutral-200">Record only</span> is the answer to a false positive.
            The rule keeps judging and keeps writing flags, but stops refusing — so you keep the
            evidence while the traffic gets through. Scope it to a path and the rest of the site
            still enforces.
          </p>
          <p className="mb-3">
            <span className="text-neutral-200">Silenced</span> is stronger and worth being uneasy
            about: nothing is recorded and nothing is refused, so the rule leaves no trace of having
            been right.
          </p>
          <p>
            Both are applied through the suppression hook the package documents, which is what makes
            them reach the runtime rules as well as the request ones. Every change is written to the
            audit log under your name.
          </p>
        </div>
      </Panel>

      <Panel title="Live rules feed" icon={Rss}>
        {feed ? (
          <div>
            <div className="px-4 sm:px-6 py-3 border-b border-[#17171d] flex items-baseline justify-between gap-6">
              <span className="text-[13px] text-neutral-400 font-normal">Serial</span>
              <span className="text-[13px] text-white font-mono tabular-nums">
                {feed.serial ?? 0}
              </span>
            </div>
            <div className="px-4 sm:px-6 py-3 border-b border-[#17171d] flex items-baseline justify-between gap-6">
              <span className="text-[13px] text-neutral-400 font-normal">Policy applied</span>
              <span className="text-[13px] text-white font-normal">
                {feed.policyEnabled === false ? 'no — detections only' : 'yes'}
              </span>
            </div>
            <div className="px-4 sm:px-6 py-3 border-b border-[#17171d] flex items-baseline justify-between gap-6">
              <span className="text-[13px] text-neutral-400 font-normal">Rules turned off by the feed</span>
              <span className="text-[13px] text-white font-mono tabular-nums">
                {(feed.disabled ?? []).length}
              </span>
            </div>
            <div className="px-4 sm:px-6 py-3">
              <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">
                The feed adds patterns and can re-grade or silence a rule upstream, separately from
                the tuning above. It cannot describe new behaviour — every judgement is still code
                that shipped in the package.
              </p>
            </div>
          </div>
        ) : (
          <Empty>
            This build has no rules feed, so the list above is exactly what the package ships with.
          </Empty>
        )}
      </Panel>
    </div>
  );
}
