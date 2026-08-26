import React from 'react';
import { Bell, Send, Save, Trash2, Info, ShieldCheck } from 'lucide-react';
import {
  deleteKeyHook,
  formatAgo,
  formatCount,
  formatStamp,
  saveKeyHook,
  testKeyHook,
  HOOK_FORMAT_HINT,
  HOOK_FORMAT_LABEL,
  HOOK_FORMAT_NOTE,
  HOOK_PLACEHOLDER,
  KEY_EVENT_LABEL,
  KEY_EVENT_NOTE,
} from '../../../lib/admin';
import { Button, Check, Empty, Field, Notice, Panel, Pill, Select, TextInput } from '../ui';
import { CopyButton, Confirm } from './shared';
import EmbedHook from './EmbedHook';
import DmAlerts from './DmAlerts';

const FORMATS = ['discord', 'slack', 'generic'];

function sameList(left, right) {
  if (left.length !== right.length) return false;
  return left.every((entry) => right.includes(entry));
}

export default function Alerts({ state, embed, discord, facts, wide, onChanged, onEmbedChanged, onDiscordChanged }) {
  const saved = state ?? null;
  const kinds = (facts?.events ?? []).filter(
    (kind) => wide || !(facts?.adminOnly ?? []).includes(kind),
  );

  const [format, setFormat] = React.useState(saved?.format ?? 'discord');
  const [url, setUrl] = React.useState(saved?.url ?? '');
  const [events, setEvents] = React.useState(saved?.events ?? facts?.defaults ?? []);
  const [enabled, setEnabled] = React.useState(saved?.enabled ?? true);
  const [busy, setBusy] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [outcome, setOutcome] = React.useState(null);

  React.useEffect(() => {
    setFormat(saved?.format ?? 'discord');
    setUrl(saved?.url ?? '');
    setEvents(saved?.events?.length ? saved.events : facts?.defaults ?? []);
    setEnabled(saved?.configured ? Boolean(saved.enabled) : true);
  }, [saved, facts]);

  const dirty =
    !saved?.configured ||
    format !== saved.format ||
    url.trim() !== (saved.url ?? '') ||
    enabled !== Boolean(saved.enabled) ||
    !sameList(events, saved.events ?? []);

  const toggle = (kind, on) =>
    setEvents((held) => (on ? [...new Set([...held, kind])] : held.filter((e) => e !== kind)));

  const save = async () => {
    setBusy('save');
    setError(null);
    setOutcome(null);
    try {
      const payload = await saveKeyHook({ format, url: url.trim(), events, enabled });
      if (onChanged) onChanged(payload.webhook);
      setOutcome({ ok: true, message: 'Saved. Send a test to be sure it lands.' });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setError(null);
    setOutcome(null);
    try {
      const payload = await testKeyHook();
      if (onChanged) onChanged(payload.webhook);
      setOutcome({ ok: Boolean(payload.sent), message: payload.message });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    setError(null);
    setOutcome(null);
    try {
      const payload = await deleteKeyHook();
      if (onChanged) onChanged(payload.webhook);
      setOutcome({ ok: true, message: 'Removed. Nothing is being sent anywhere now.' });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(null);
    }
  };

  if (!saved) {
    return (
      <Panel title="Alerts" icon={Bell}>
        <Empty>Reading your alert settings…</Empty>
      </Panel>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      {error && <Notice tone="rose">{error}</Notice>}
      {outcome && (
        <Notice tone={outcome.ok ? 'emerald' : 'amber'} icon={outcome.ok ? ShieldCheck : undefined}>
          {outcome.message}
        </Notice>
      )}

      {saved?.paused && (
        <Notice tone="rose">
          These alerts were switched off after {formatCount(saved.failures)} failures in a row
          {saved.lastError ? ` — ${saved.lastError}` : ''}. Fix the address and save again to start
          them.
        </Notice>
      )}

      <Panel
        title="Where alerts go"
        icon={Bell}
        action={
          saved?.configured ? (
            <Pill tone={saved.enabled ? 'green' : 'neutral'}>{saved.enabled ? 'on' : 'off'}</Pill>
          ) : (
            <Pill>not set up</Pill>
          )
        }
      >
        <div className="px-4 sm:px-6 py-5">
          <Field label="Kind" hint={HOOK_FORMAT_NOTE[format]} htmlFor="hook-format">
            <Select
              id="hook-format"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
            >
              {FORMATS.map((entry) => (
                <option key={entry} value={entry}>
                  {HOOK_FORMAT_LABEL[entry]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Address" hint={HOOK_FORMAT_HINT[format]} htmlFor="hook-url">
            <TextInput
              id="hook-url"
              type="url"
              value={url}
              spellCheck={false}
              autoComplete="off"
              placeholder={HOOK_PLACEHOLDER[format]}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>

          <Field label="Tell me about" hint="Anything you leave unticked is still written to the log.">
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
            hint="Untick to keep the address saved but stop the messages."
            onChange={setEnabled}
          />

          <div className="flex items-center gap-3 flex-wrap mt-5">
            <Button type="button" tone="solid" onClick={save} disabled={busy !== null || !url.trim()}>
              <Save className="h-3.5 w-3.5" strokeWidth={2} />
              {busy === 'save' ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              onClick={test}
              disabled={busy !== null || !saved?.configured || dirty}
            >
              <Send className="h-3.5 w-3.5" strokeWidth={2} />
              {busy === 'test' ? 'Sending…' : 'Send test'}
            </Button>
            {saved?.configured && (
              <Confirm label="Remove" danger icon={Trash2} onConfirm={remove}>
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
        <Panel title="How it has been going" icon={Bell}>
          <div className="px-4 sm:px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
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
            <div>
              <p className="text-[11px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-1">
                Set up
              </p>
              <p className="text-[13px] text-neutral-300">{formatStamp(saved.updated)}</p>
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

      {saved?.configured && saved.format === 'generic' && saved.secret && (
        <Panel title="Signing secret" icon={ShieldCheck}>
          <div className="px-4 sm:px-6 py-5">
            <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-4">
              Every plain POST carries an <code className="font-mono text-neutral-300">
                X-Amitista-Signature
              </code>{' '}
              header — <code className="font-mono text-neutral-300">sha256=</code> and the HMAC of
              the exact body, keyed with this. Check it before you trust the contents, or anyone who
              guesses your address can feed you whatever they like.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <code className="flex-1 min-w-[240px] bg-[#060608] border border-[#282832] px-4 py-3 text-[13px] text-white font-mono break-all">
                {saved.secret}
              </code>
              <CopyButton value={saved.secret} />
            </div>
          </div>
        </Panel>
      )}

      <DmAlerts discord={discord} facts={facts} wide={wide} onChanged={onDiscordChanged} />

      <EmbedHook state={embed} facts={facts} wide={wide} onChanged={onEmbedChanged} />

      <Panel title="What the panel will and will not send to" icon={Info}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            https only, on the standard port, to a hostname the internet can resolve to a public
            address. Anything pointing at this machine or inside the network is refused when you
            save it and again every time a message goes out, and a redirect is never followed.
          </p>
          <p className="mb-3">
            Messages are batched every few seconds rather than sent one per event, and there is a
            ceiling on how many go out in five minutes so a flood cannot be turned into a flood
            somewhere else. After ten failures in a row the alerts switch themselves off and say so
            here.
          </p>
          <p>
            The address is yours alone — it is stored on your account, and other people&apos;s keys
            never appear in what you get sent.
          </p>
        </div>
      </Panel>
    </div>
  );
}
