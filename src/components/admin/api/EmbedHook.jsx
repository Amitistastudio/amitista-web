import React from 'react';
import { Palette, Save, Send, Trash2, Plus, X } from 'lucide-react';
import {
  deleteEmbedHook,
  formatAgo,
  formatCount,
  saveEmbedHook,
  testEmbedHook,
  KEY_EVENT_LABEL,
  KEY_EVENT_NOTE,
} from '../../../lib/admin';
import { Button, Check, Field, Notice, Panel, Pill, TextArea, TextInput } from '../ui';
import { Confirm } from './shared';

const SAMPLE = {
  event: 'Key used from a new address',
  key: 'live · site widget',
  id: 'k_3f9c',
  ip: '203.0.113.7',
  method: 'GET',
  path: '/v1/status',
  status: '200',
  action: '—',
  actor: '—',
  detail: 'First call from that address.',
  at: '2026-08-11T13:40:00Z',
  owner: 'you',
  summary: 'live · site widget · GET /v1/status · HTTP 200 · from 203.0.113.7',
  count: '1',
};

const PLACEHOLDER = /\{([a-z]+)\}/g;

function fill(text) {
  return String(text ?? '').replace(PLACEHOLDER, (whole, name) => SAMPLE[name] ?? whole);
}

function sameList(left, right) {
  if (left.length !== right.length) return false;
  return left.every((entry) => right.includes(entry));
}

function sameTemplate(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function Preview({ template }) {
  const fields = (template.fields ?? []).filter((entry) => entry.label && entry.value);

  return (
    <div className="bg-[#313338] p-4">
      <div className="flex gap-3 max-w-[520px]">
        <div className="w-1 rounded-[3px] shrink-0" style={{ background: template.colour }} />
        <div className="bg-[#2b2d31] rounded-r-[4px] px-4 py-3 min-w-0 flex-1">
          {template.title && (
            <p className="text-[15px] text-white font-semibold leading-snug mb-1 break-words">
              {fill(template.title)}
            </p>
          )}
          {template.body && (
            <p className="text-[13px] text-[#dbdee1] font-normal leading-relaxed mb-2 whitespace-pre-wrap break-words">
              {fill(template.body)}
            </p>
          )}
          {fields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              {fields.map((entry, index) => (
                <div key={index} className="min-w-0">
                  <p className="text-[12px] text-white font-semibold truncate">{fill(entry.label)}</p>
                  <p className="text-[12px] text-[#dbdee1] break-words">{fill(entry.value)}</p>
                </div>
              ))}
            </div>
          )}
          {template.footer && (
            <p className="text-[11px] text-[#949ba4] font-normal break-words">{fill(template.footer)}</p>
          )}
          {!template.title && !template.body && !fields.length && !template.footer && (
            <p className="text-[12px] text-[#949ba4]">Nothing to show yet — give it a title.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmbedHook({ state, facts, wide, onChanged }) {
  const saved = state ?? null;
  const limits = facts?.embedLimits ?? {};
  const placeholders = facts?.placeholders ?? [];
  const kinds = (facts?.events ?? []).filter(
    (kind) => wide || !(facts?.adminOnly ?? []).includes(kind),
  );

  const blank = facts?.embedDefault ?? { title: '', colour: '#7c3aed', body: '', fields: [], footer: '', perEvent: true };

  const [url, setUrl] = React.useState(saved?.url ?? '');
  const [events, setEvents] = React.useState(saved?.events ?? facts?.defaults ?? []);
  const [enabled, setEnabled] = React.useState(saved?.enabled ?? true);
  const [template, setTemplate] = React.useState(saved?.template ?? blank);
  const [busy, setBusy] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [outcome, setOutcome] = React.useState(null);

  React.useEffect(() => {
    setUrl(saved?.url ?? '');
    setEvents(saved?.events?.length ? saved.events : facts?.defaults ?? []);
    setEnabled(saved?.configured ? Boolean(saved.enabled) : true);
    setTemplate(saved?.template ?? blank);
  }, [saved, facts]);

  const dirty =
    !saved?.configured ||
    url.trim() !== (saved.url ?? '') ||
    enabled !== Boolean(saved.enabled) ||
    !sameList(events, saved.events ?? []) ||
    !sameTemplate(template, saved.template);

  const patch = (changes) => setTemplate((held) => ({ ...held, ...changes }));

  const setField = (index, changes) =>
    setTemplate((held) => ({
      ...held,
      fields: held.fields.map((entry, at) => (at === index ? { ...entry, ...changes } : entry)),
    }));

  const addField = () =>
    setTemplate((held) => ({ ...held, fields: [...held.fields, { label: '', value: '' }] }));

  const dropField = (index) =>
    setTemplate((held) => ({ ...held, fields: held.fields.filter((entry, at) => at !== index) }));

  const toggle = (kind, on) =>
    setEvents((held) => (on ? [...new Set([...held, kind])] : held.filter((entry) => entry !== kind)));

  const run = async (what, action, message) => {
    setBusy(what);
    setError(null);
    setOutcome(null);
    try {
      const payload = await action();
      if (onChanged) onChanged(payload.embed);
      setOutcome({ ok: payload.sent !== false, message: payload.message ?? message });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {error && <Notice tone="rose">{error}</Notice>}
      {outcome && (
        <Notice tone={outcome.ok ? 'emerald' : 'amber'}>{outcome.message}</Notice>
      )}

      {saved?.paused && (
        <Notice tone="rose">
          This one was switched off after {formatCount(saved.failures)} failures in a row
          {saved.lastError ? ` — ${saved.lastError}` : ''}. Fix the address and save again.
        </Notice>
      )}

      <Panel
        title="Your own embed"
        icon={Palette}
        action={
          saved?.configured ? (
            <Pill tone={saved.enabled ? 'green' : 'neutral'}>{saved.enabled ? 'on' : 'off'}</Pill>
          ) : (
            <Pill>not set up</Pill>
          )
        }
      >
        <div className="px-4 sm:px-6 py-5">
          <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-5">
            A second Discord webhook that sends the message you design rather than the panel&apos;s
            own. It runs alongside the one above — both can be on at once, each with its own list of
            what to send.
          </p>

          <Field
            label="Discord webhook address"
            hint="Channel settings → Integrations → Webhooks → Copy webhook URL."
            htmlFor="embed-url"
          >
            <TextInput
              id="embed-url"
              type="url"
              value={url}
              spellCheck={false}
              autoComplete="off"
              placeholder="https://discord.com/api/webhooks/…"
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>

          <Field label="Send it for" hint="Anything you leave unticked is still written to the log.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              {kinds.map((kind) => (
                <Check
                  key={kind}
                  checked={events.includes(kind)}
                  label={KEY_EVENT_LABEL[kind] ?? kind}
                  hint={KEY_EVENT_NOTE[kind]}
                  onChange={(on) => toggle(kind, on)}
                />
              ))}
            </div>
          </Field>

          <Check
            checked={enabled}
            label="Send them"
            hint="Untick to keep it saved but stop the messages."
            onChange={setEnabled}
          />
        </div>
      </Panel>

      <Panel title="What it looks like" icon={Palette}>
        <Preview template={template} />
        <div className="px-4 sm:px-6 py-5">
          <p className="text-[12px] text-neutral-500 font-normal leading-relaxed mb-4">
            Anything in braces is swapped for the real thing when it sends. Available:{' '}
            {placeholders.map((name, index) => (
              <React.Fragment key={name}>
                {index > 0 && ' · '}
                <code className="font-mono text-purple-300">{`{${name}}`}</code>
              </React.Fragment>
            ))}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end mb-1">
            <Field label="Title" htmlFor="embed-title">
              <TextInput
                id="embed-title"
                value={template.title}
                maxLength={limits.title ?? 200}
                onChange={(event) => patch({ title: event.target.value })}
              />
            </Field>
            <Field label="Colour" htmlFor="embed-colour">
              <input
                id="embed-colour"
                type="color"
                value={template.colour}
                onChange={(event) => patch({ colour: event.target.value })}
                className="h-[46px] w-[72px] bg-[#111115] border border-[#282832] cursor-pointer"
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="embed-body">
            <TextArea
              id="embed-body"
              rows={3}
              value={template.body}
              maxLength={limits.body ?? 1500}
              onChange={(event) => patch({ body: event.target.value })}
            />
          </Field>

          <Field label="Fields" hint={`Up to ${limits.fields ?? 10}, shown side by side in Discord.`}>
            <div className="flex flex-col gap-3">
              {template.fields.map((entry, index) => (
                <div key={index} className="flex flex-wrap sm:flex-nowrap gap-3 items-start">
                  <TextInput
                    aria-label={`Field ${index + 1} name`}
                    placeholder="Name"
                    className="sm:w-[34%]"
                    value={entry.label}
                    maxLength={limits.label ?? 80}
                    onChange={(event) => setField(index, { label: event.target.value })}
                  />
                  <TextInput
                    aria-label={`Field ${index + 1} value`}
                    placeholder="{key}"
                    value={entry.value}
                    maxLength={limits.value ?? 400}
                    onChange={(event) => setField(index, { value: event.target.value })}
                  />
                  <Button type="button" onClick={() => dropField(index)} aria-label="Remove this field">
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </Button>
                </div>
              ))}
              {template.fields.length < (limits.fields ?? 10) && (
                <div>
                  <Button type="button" onClick={addField}>
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    Add a field
                  </Button>
                </div>
              )}
            </div>
          </Field>

          <Field label="Footer" htmlFor="embed-footer">
            <TextInput
              id="embed-footer"
              value={template.footer}
              maxLength={limits.footer ?? 120}
              onChange={(event) => patch({ footer: event.target.value })}
            />
          </Field>

          <Check
            checked={Boolean(template.perEvent)}
            label="One embed per event"
            hint="Off means a single embed for the whole batch — use {count} and {summary} in it."
            onChange={(on) => patch({ perEvent: on })}
          />

          <div className="flex items-center gap-3 flex-wrap mt-5">
            <Button
              type="button"
              tone="solid"
              disabled={busy !== null || !url.trim() || !events.length}
              onClick={() =>
                run(
                  'save',
                  () => saveEmbedHook({ url: url.trim(), events, enabled, template }),
                  'Saved. Send a test to be sure it lands.',
                )
              }
            >
              <Save className="h-3.5 w-3.5" strokeWidth={2} />
              {busy === 'save' ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              disabled={busy !== null || !saved?.configured || dirty}
              onClick={() => run('test', testEmbedHook, 'Sent.')}
            >
              <Send className="h-3.5 w-3.5" strokeWidth={2} />
              {busy === 'test' ? 'Sending…' : 'Send test'}
            </Button>
            {saved?.configured && (
              <Confirm
                label="Remove"
                danger
                icon={Trash2}
                onConfirm={() => run('remove', deleteEmbedHook, 'Removed.')}
              >
                Yes, remove it
              </Confirm>
            )}
            {dirty && saved?.configured && (
              <span className="text-[11px] text-neutral-500 font-normal">
                Save first, then the test goes to what is stored.
              </span>
            )}
          </div>
        </div>
      </Panel>

      {saved?.configured && (
        <Panel title="How it has been going" icon={Palette}>
          <div className="px-4 sm:px-6 py-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-1">
                Delivered
              </p>
              <p className="text-[13px] text-white tabular-nums">{formatCount(saved.sent ?? 0)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-1">
                Last one
              </p>
              <p className="text-[13px] text-neutral-300">{formatAgo(saved.lastOk)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-1">
                Failures in a row
              </p>
              <p
                className={`text-[13px] tabular-nums ${
                  (saved.failures ?? 0) > 0 ? 'text-amber-300' : 'text-neutral-300'
                }`}
              >
                {formatCount(saved.failures ?? 0)}
              </p>
            </div>
          </div>
          {saved.lastError && (
            <div className="px-4 sm:px-6 pb-5 -mt-1">
              <p className="text-[12px] text-neutral-500 font-normal">
                Last failure {formatAgo(saved.lastFail)} — {saved.lastError}
              </p>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
