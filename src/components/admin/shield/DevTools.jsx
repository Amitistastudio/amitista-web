import React from 'react';
import { Wrench, Play, FlaskConical, ShieldX, ExternalLink } from 'lucide-react';
import { VERDICT_TONE } from '../../../lib/admin';
import { DEFENCES, DENIAL, LAYERS } from '../../../content/shieldRules';
import { Button, Empty, Field, Notice, Panel, Pill, Select, TextInput } from '../ui';
import { SeverityPill, Unreachable } from './shared';

const SAMPLES = {
  shell: 'hi; whoami',
  sql: "' OR '1'='1",
  file: '../../etc/passwd',
  fetch: 'http://169.254.169.254/latest/meta-data/',
  html: '<script>alert(1)</script>',
  redirect: 'https://example.evil/login',
};

const VERDICT_NOTE = {
  blocked: 'Block mode would refuse this request and hand the caller a reference code.',
  flagged: 'This is recorded whatever the mode. Nothing is refused on a medium or low finding.',
  allowed: 'No rule fired. Nothing would be recorded and nothing would be refused.',
};

const BLOCK_PATH = (() => {
  try {
    return new URL(DENIAL.blockPage).pathname;
  } catch {
    return '/block';
  }
})();

const REASONS = LAYERS.map((layer) => ({
  id: layer.id,
  name: layer.name,
  rules: DEFENCES.filter((defence) => defence.layer === layer.id),
})).filter((group) => group.rules.length > 0);

const DEFAULT_REASON =
  (DEFENCES.find((defence) => defence.layer === 'request') ?? DEFENCES[0])?.id ?? '';

function newReference() {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  const raw = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `AMS-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function BlockPage({ reason, onReason }) {
  const [opened, setOpened] = React.useState(null);

  const chosen = DEFENCES.find((defence) => defence.id === reason) ?? null;

  function open() {
    const reference = newReference();
    const target = `${BLOCK_PATH}?ref=${encodeURIComponent(reference)}&rule=${encodeURIComponent(reason)}`;
    setOpened({ reference, rule: reason, target });
    if (typeof window !== 'undefined') {
      window.open(target, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <Panel title="Block page" icon={ShieldX}>
      <div className="px-4 sm:px-6 py-5">
        <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-6 max-w-2xl">
          A refused browser navigation is sent to {BLOCK_PATH} with a reference and the id of the
          rule that refused it. Pick a reason and open that page exactly as a blocked visitor would
          see it — nothing is refused here and no flag is raised, the reference is invented for the
          preview.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <Field
            label="Reason"
            htmlFor="shield-block-reason"
            hint="The rule the page will name. It has to be one the site knows, or the page says “not supplied”."
          >
            <Select
              id="shield-block-reason"
              value={reason}
              onChange={(event) => onReason(event.target.value)}
            >
              {REASONS.map((group) => (
                <optgroup key={group.id} label={group.name}>
                  {group.rules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>

          <div className="mb-5">
            <p className="block text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-2">
              What the visitor is told
            </p>
            {chosen ? (
              <div className="border border-[#282832] bg-[#08080b] px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-[13px] text-white font-mono">{chosen.id}</span>
                  <SeverityPill severity={chosen.severity} />
                </div>
                <p className="text-[13px] text-neutral-400 font-normal leading-relaxed">
                  {chosen.summary}
                </p>
              </div>
            ) : (
              <Empty>No rule under that id.</Empty>
            )}
          </div>
        </div>

        <Button type="button" tone="solid" disabled={!chosen} onClick={open}>
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          Test block
        </Button>

        {opened ? (
          <div className="mt-5 border border-[#282832] bg-[#060608] px-4 py-3">
            <p className="text-[12px] text-neutral-500 font-normal leading-relaxed mb-2">
              Opened in a new tab as {opened.reference}. Looking that code up under Flags will find
              nothing — it belongs to a request that never happened.
            </p>
            <a
              href={opened.target}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-purple-300/80 font-mono break-all hover:text-purple-200 transition-colors"
            >
              {opened.target}
            </a>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export default function DevTools({ shield, onEvaluate }) {
  const [scenario, setScenario] = React.useState('shell');
  const [input, setInput] = React.useState(SAMPLES.shell);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [reason, setReason] = React.useState(DEFAULT_REASON);

  const scenarios = shield?.state?.scenarios ?? [];
  const maxInput = shield?.state?.maxInput ?? 2000;
  const chosen = scenarios.find((entry) => entry.id === scenario) ?? null;

  function pick(next) {
    setScenario(next);
    setResult(null);
    setError(null);
    if (SAMPLES[next] !== undefined) setInput(SAMPLES[next]);
  }

  async function run(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const verdict = await onEvaluate(scenario, input);
      setResult(verdict);
      const fired = (verdict.findings ?? []).find((finding) =>
        DEFENCES.some((defence) => defence.id === finding.id),
      );
      if (fired) setReason(fired.id);
    } catch (failure) {
      setError(failure.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  if (!shield?.reachable) {
    return (
      <div className="w-full flex flex-col gap-6">
        <Unreachable shield={shield} />
        <Panel title="Rule bench" icon={Wrench}>
          <Empty>The bench runs inside the evaluator, so it needs that service to be up.</Empty>
        </Panel>
        <BlockPage reason={reason} onReason={setReason} />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <Panel title="Rule bench" icon={Wrench}>
        <form onSubmit={run} className="px-4 sm:px-6 py-5">
          <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-6 max-w-2xl">
            Put a string where request data would land and see what the rule engine makes of it.
            Nothing is executed — the string is rendered into the template below and handed to the
            same judges the middleware uses, and only the verdict comes back.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            <Field label="Where it lands" htmlFor="shield-scenario">
              <Select
                id="shield-scenario"
                value={scenario}
                onChange={(event) => pick(event.target.value)}
              >
                {scenarios.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Input" htmlFor="shield-input" hint={`Up to ${maxInput} characters.`}>
              <TextInput
                id="shield-input"
                value={input}
                maxLength={maxInput}
                spellCheck="false"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="Something a caller might send"
                onChange={(event) => setInput(event.target.value)}
              />
            </Field>
          </div>

          {chosen ? (
            <pre className="bg-[#060608] border border-[#282832] px-4 py-3 text-[12px] text-neutral-400 font-mono overflow-x-auto mb-5">
              {chosen.example}
            </pre>
          ) : null}

          <Button type="submit" tone="solid" disabled={busy}>
            <Play className="h-3.5 w-3.5" strokeWidth={2} />
            {busy ? 'Judging…' : 'Judge it'}
          </Button>
        </form>
      </Panel>

      {error && <Notice tone="rose">{error}</Notice>}

      {result && (
        <Panel title="Verdict" icon={FlaskConical}>
          <div className="px-4 sm:px-6 py-5 border-b border-[#17171d]">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <Pill tone={VERDICT_TONE[result.verdict] ?? 'neutral'}>{result.verdict}</Pill>
              <span className="text-[13px] text-neutral-400 font-normal">{result.label}</span>
            </div>
            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-4">
              {VERDICT_NOTE[result.verdict] ?? ''}
            </p>
            <pre className="bg-[#060608] border border-[#282832] px-4 py-3 text-[12px] text-neutral-300 font-mono overflow-x-auto">
              {result.rendered}
            </pre>
          </div>

          {(result.findings ?? []).length === 0 && (
            <Empty>No rule fired on that input.</Empty>
          )}

          {(result.findings ?? []).map((finding, index) => (
            <div
              key={`${finding.id}-${index}`}
              className="px-4 sm:px-6 py-4 border-b border-[#17171d] last:border-b-0"
            >
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-[13px] text-white font-mono">{finding.id}</span>
                <SeverityPill severity={finding.severity} />
                <Pill>{finding.layer}</Pill>
              </div>
              <p className="text-[13px] text-neutral-400 font-normal leading-relaxed">
                {finding.detail}
              </p>
              {finding.fragment ? (
                <pre className="mt-3 bg-[#060608] border border-[#282832] px-4 py-2.5 text-[12px] text-amber-200/80 font-mono overflow-x-auto">
                  {finding.fragment}
                </pre>
              ) : null}
            </div>
          ))}
        </Panel>
      )}

      <BlockPage reason={reason} onReason={setReason} />

      <Panel title="What this does not prove" icon={Wrench}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            The bench judges a string in isolation. In a real request the same rules also see the
            shape of the body, the rate the caller is going at, and what the handler sends back — so
            a request can be refused here for reasons the bench never shows.
          </p>
          <p>
            The opposite holds too: a string that comes back clean can still be refused live if it
            arrives at a sink the bench does not model.
          </p>
        </div>
      </Panel>
    </div>
  );
}
