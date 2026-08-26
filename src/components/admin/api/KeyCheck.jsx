import React from 'react';
import { Stethoscope, CheckCircle2, XCircle } from 'lucide-react';
import { SCOPE_LABELS, formatDate } from '../../../lib/admin';
import { Button, FIELD_CLASS, Panel, Pill } from '../ui';

const GATEWAY = '/api/k';

const EXPLAIN = {
  401: 'The gateway does not recognise this key. It may be mistyped, removed, or the older half of a key that has since been rotated.',
  403: 'The key is real, but the gateway will not serve it — it has been revoked or its expiry has passed.',
  429: 'The key is fine, but it has made too many requests in the last minute. Wait a moment and try again.',
};

export default function KeyCheck() {
  const [value, setValue] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);

  async function check(event) {
    event.preventDefault();
    const key = value.trim();
    if (!key || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(`${GATEWAY}/whoami`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
      });
      const body = await response.json().catch(() => ({}));
      setResult({ ok: response.ok, status: response.status, body });
    } catch {
      setResult({ ok: false, status: 0, body: {} });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Check a key" icon={Stethoscope}>
      <form onSubmit={check} noValidate className="px-4 sm:px-6 py-6">
        <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-4">
          Paste a key to ask the gateway what it makes of it. This runs from your browser straight to{' '}
          <span className="font-mono text-neutral-300">{GATEWAY}/whoami</span> — the key is not sent
          to the panel and nothing about it is written down. Use it when something has stopped
          working and you want to know whether the key is the problem.
        </p>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <label
              className="block text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-2"
              htmlFor="check-key"
            >
              Key
            </label>
            <input
              id="check-key"
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              placeholder="amk_live_…"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className={`${FIELD_CLASS} font-mono`}
            />
          </div>
          <Button type="submit" tone="solid" disabled={busy || !value.trim()}>
            <Stethoscope className="h-3.5 w-3.5" strokeWidth={2} />
            {busy ? 'Asking…' : 'Check'}
          </Button>
          {(value || result) && (
            <Button
              type="button"
              onClick={() => {
                setValue('');
                setResult(null);
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {result && result.ok && (
          <div className="mt-5 border border-emerald-500/40 bg-emerald-500/10 px-5 py-4">
            <div className="flex items-center gap-2.5 mb-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0" strokeWidth={1.5} />
              <span className="text-[13px] text-white font-medium">This key works.</span>
            </div>
            <div className="flex flex-col gap-2 text-[13px] text-emerald-200/90 font-normal">
              <p>
                It is <span className="text-white">{result.body.token ?? 'unnamed'}</span>, a{' '}
                {result.body.environment ?? 'live'} key
                {result.body.expires
                  ? `, ending ${formatDate(result.body.expires)}.`
                  : ' with no expiry.'}
              </p>
              <div className="flex flex-wrap gap-1.5 items-center">
                <span>It may read:</span>
                {(result.body.scopes ?? []).map((scope) => (
                  <Pill key={scope} tone="green">
                    {SCOPE_LABELS[scope] ?? scope}
                  </Pill>
                ))}
                {(result.body.scopes ?? []).length === 0 && <span>nothing.</span>}
              </div>
            </div>
          </div>
        )}

        {result && !result.ok && (
          <div className="mt-5 border border-rose-500/40 bg-rose-500/10 px-5 py-4">
            <div className="flex items-center gap-2.5 mb-3">
              <XCircle className="h-4 w-4 text-rose-300 shrink-0" strokeWidth={1.5} />
              <span className="text-[13px] text-white font-medium">
                {result.status === 0
                  ? 'The gateway could not be reached.'
                  : `The gateway said no — ${result.status}.`}
              </span>
            </div>
            <p className="text-[13px] text-rose-200/90 font-normal leading-relaxed">
              {result.body.message ??
                'No reply came back. The gateway may be down — check the Gateway tab if you have access to it.'}
            </p>
            {EXPLAIN[result.status] && (
              <p className="text-[13px] text-rose-200/70 font-normal leading-relaxed mt-2">
                {EXPLAIN[result.status]}
              </p>
            )}
          </div>
        )}
      </form>
    </Panel>
  );
}
