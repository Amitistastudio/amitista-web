import React from 'react';
import { Play, Loader2, Copy, Check, CornerDownRight, Radio, KeyRound } from 'lucide-react';
import JsonView from './JsonView';
import { ENDPOINTS } from '../../content/apiMeta';
import { describeField } from '../../content/apiFields';
import { SITE_URL } from '../../siteConfig';

const DEFAULT_ID = 'index';

const SEGMENTS = [
  { key: 'dns', label: 'DNS', colour: 'bg-[#3f3f52]' },
  { key: 'tcp', label: 'Connect', colour: 'bg-[#5b4b96]' },
  { key: 'tls', label: 'TLS', colour: 'bg-[#7c5ce0]' },
  { key: 'ttfb', label: 'Server', colour: 'bg-[#a78bfa]' },
  { key: 'transfer', label: 'Transfer', colour: 'bg-[#cbb9ff]' },
];

function ms(value) {
  if (value === null || value === undefined) return '—';
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return String(Math.round(value));
}

function bytes(value) {
  if (value === null || value === undefined) return '—';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} kB`;
}

function resourceTiming(url, before) {
  if (typeof performance === 'undefined' || !performance.getEntriesByName) return null;

  const entries = performance.getEntriesByName(url, 'resource');
  if (entries.length <= before) return null;

  const entry = entries[entries.length - 1];

  const dns = entry.domainLookupEnd - entry.domainLookupStart;
  const tcp =
    entry.secureConnectionStart > 0
      ? entry.secureConnectionStart - entry.connectStart
      : entry.connectEnd - entry.connectStart;
  const tls = entry.secureConnectionStart > 0 ? entry.connectEnd - entry.secureConnectionStart : 0;
  const ttfb = entry.responseStart - entry.requestStart;
  const transfer = entry.responseEnd - entry.responseStart;

  return {
    dns: Math.max(0, dns),
    tcp: Math.max(0, tcp),
    tls: Math.max(0, tls),
    ttfb: Math.max(0, ttfb),
    transfer: Math.max(0, transfer),
    transferSize: entry.transferSize,
    encodedSize: entry.encodedBodySize,
    decodedSize: entry.decodedBodySize,
    cached: entry.transferSize === 0 && entry.decodedBodySize > 0,
    protocol: entry.nextHopProtocol || null,
  };
}

export function CopyButton({ label, text }) {
  const [done, setDone] = React.useState(false);

  const copy = React.useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      setDone(false);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={copy}
      className="font-tech inline-flex cursor-pointer items-center gap-1.5 border border-[#282832] px-2.5 py-1.5 text-[10px] tracking-[0.15em] text-neutral-400 uppercase transition-colors hover:border-violet-400/40 hover:text-violet-300"
    >
      {done ? <Check size={11} strokeWidth={2.2} /> : <Copy size={11} strokeWidth={2} />}
      {done ? 'Copied' : label}
    </button>
  );
}

export default function ApiExplorer() {
  const [activeId, setActiveId] = React.useState(DEFAULT_ID);
  const [result, setResult] = React.useState(null);
  const [state, setState] = React.useState('idle');
  const [picked, setPicked] = React.useState(null);
  const [token, setToken] = React.useState('');

  const endpoint = ENDPOINTS.find((item) => item.id === activeId) ?? ENDPOINTS[0];
  const needsToken = endpoint.auth === 'token';
  const held = token.trim();

  const run = React.useCallback(async (target, key) => {
    setState('running');
    setPicked(null);
    setResult(null);

    const absolute =
      typeof window === 'undefined'
        ? `${SITE_URL}${target.path}`
        : new URL(target.path, window.location.origin).href;

    const before =
      typeof performance !== 'undefined' && performance.getEntriesByName
        ? performance.getEntriesByName(absolute, 'resource').length
        : 0;

    const started = typeof performance !== 'undefined' ? performance.now() : 0;

    try {
      const response = await fetch(absolute, {
        headers: {
          Accept: 'application/json',
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
      });
      const text = await response.text();
      const elapsed = typeof performance !== 'undefined' ? performance.now() - started : null;

      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }

      const payload = {
        status: response.status,
        ok: response.ok,
        json: parsed,
        text,
        elapsed,
        size: text.length,
        timing: resourceTiming(absolute, before),
        cors: response.headers.get('access-control-allow-origin'),
        cache: response.headers.get('cache-control'),
      };

      setResult(payload);
      setState(parsed === null ? 'failed' : 'done');
    } catch {
      setResult(null);
      setState('failed');
    }
  }, []);

  const heldRef = React.useRef(held);
  heldRef.current = held;

  React.useEffect(() => {
    if (endpoint.auth === 'token' && !heldRef.current) {
      setState('idle');
      setResult(null);
      setPicked(null);
      return;
    }
    run(endpoint, heldRef.current);
  }, [run, endpoint]);

  const running = state === 'running';
  const blocked = needsToken && !held;
  const timing = result?.timing ?? null;
  const total = timing ? SEGMENTS.reduce((sum, segment) => sum + timing[segment.key], 0) : 0;

  const doc = picked ? describeField(endpoint.id, picked.path) : null;
  const pickedValue = picked?.value;

  const pickedType = Array.isArray(pickedValue)
    ? 'array'
    : pickedValue === null
      ? 'null'
      : typeof pickedValue;

  const url = `${SITE_URL}${endpoint.path}`;

  const curl = needsToken
    ? `curl -s ${url} \\\n  -H "Authorization: Bearer $AMITISTA_TOKEN"`
    : `curl -s ${url}`;

  const snippet = needsToken
    ? `await (await fetch('${url}', {\n  headers: { Authorization: \`Bearer \${token}\` },\n})).json()`
    : `await (await fetch('${url}')).json()`;

  return (
    <div className="w-full border border-[#282832] bg-[#08080b]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#282832] px-4 py-3">
        <span className="font-tech flex items-center gap-2 text-[10px] tracking-[0.2em] text-neutral-500 uppercase">
          <span className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#242430]" />
            <span className="h-2 w-2 rounded-full bg-[#242430]" />
            <span className="h-2 w-2 rounded-full bg-[#242430]" />
          </span>
          Explorer
        </span>
        <span className="font-tech text-[11px] text-neutral-600">{SITE_URL}</span>
        <span className="ml-auto flex items-center gap-2">
          <CopyButton label="curl" text={curl} />
          <CopyButton label="fetch" text={snippet} />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#282832] px-4 py-2.5">
        <label
          htmlFor="explorer-token"
          className="font-tech flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-neutral-500 uppercase"
        >
          <KeyRound size={11} strokeWidth={2} />
          Token
        </label>
        <input
          id="explorer-token"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && held) run(endpoint, held);
          }}
          spellCheck={false}
          autoComplete="off"
          placeholder="Paste a token to read the endpoints that need one"
          className="font-tech min-w-0 flex-1 border border-[#282832] bg-[#0a0a0d] px-2.5 py-1.5 text-[11.5px] text-neutral-200 placeholder:text-neutral-700 focus:border-violet-400/40 focus:outline-none"
        />
        <span className="font-tech text-[10px] tracking-[0.12em] text-neutral-600 uppercase">
          Kept in this tab only
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_300px]">
        <div className="border-b border-[#282832] lg:border-r lg:border-b-0">
          <p className="font-tech border-b border-[#282832] px-4 py-2.5 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
            Endpoints
          </p>

          <div className="flex overflow-x-auto lg:block lg:overflow-visible">
            {ENDPOINTS.map((item) => {
              const selected = item.id === endpoint.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveId(item.id)}
                  className={`font-tech relative flex shrink-0 cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-[11.5px] tracking-tight whitespace-nowrap transition-colors lg:w-full ${
                    selected
                      ? 'bg-violet-500/10 text-white'
                      : 'text-neutral-500 hover:bg-white/[0.03] hover:text-neutral-300'
                  }`}
                >
                  {selected && (
                    <span className="absolute top-0 bottom-0 left-0 w-[2px] bg-violet-400" />
                  )}
                  <span className="min-w-0 truncate">{item.path.replace('/api/v1', '') || '/'}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    {item.auth === 'token' && (
                      <KeyRound
                        size={10}
                        strokeWidth={2.2}
                        className={held ? 'text-neutral-600' : 'text-amber-300/70'}
                      />
                    )}
                    {item.live && <Radio size={10} strokeWidth={2.5} className="text-violet-400" />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hidden border-t border-[#282832] px-4 py-3 lg:block">
            <p className="font-tech text-[10px] leading-relaxed tracking-[0.15em] text-neutral-600 uppercase">
              {ENDPOINTS.length} total
              <br />
              {ENDPOINTS.filter((item) => !item.live).length} static
              <br />
              {ENDPOINTS.filter((item) => item.live).length} live
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col border-b border-[#282832] xl:border-r xl:border-b-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#282832] px-4 py-2.5">
            <span className="font-tech text-[10px] tracking-[0.2em] text-violet-300 uppercase">
              Get
            </span>
            <code className="font-tech min-w-0 truncate text-[12px] text-white">
              {endpoint.path}
            </code>

            {needsToken && (
              <span className="font-tech inline-flex items-center gap-1 text-[10px] tracking-[0.15em] text-neutral-600 uppercase">
                <KeyRound size={10} strokeWidth={2.2} />
                Token
              </span>
            )}

            <button
              type="button"
              onClick={() => run(endpoint, held)}
              disabled={running || blocked}
              className="font-tech ml-auto inline-flex cursor-pointer items-center gap-1.5 border border-[#282832] px-2.5 py-1.5 text-[10px] tracking-[0.15em] text-neutral-400 uppercase transition-colors hover:border-violet-400/40 hover:text-violet-300 disabled:cursor-default disabled:text-neutral-700"
            >
              {running ? (
                <Loader2 size={11} strokeWidth={2} className="animate-spin" />
              ) : (
                <Play size={11} strokeWidth={2} />
              )}
              Run
            </button>
          </div>

          <div className="font-tech flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#282832] px-4 py-2 text-[10.5px] tracking-[0.12em] uppercase">
            {result ? (
              <>
                <span className={result.ok ? 'text-emerald-300/90' : 'text-red-400'}>
                  {result.status} {result.ok ? 'OK' : 'Error'}
                </span>
                <span className="text-neutral-500">
                  <span className="text-neutral-300 tabular-nums">{ms(result.elapsed)}</span> ms
                </span>
                <span className="text-neutral-500">
                  <span className="text-neutral-300 tabular-nums">{bytes(result.size)}</span> json
                </span>
                {timing?.transferSize > 0 && (
                  <span className="text-neutral-500">
                    <span className="text-neutral-300 tabular-nums">
                      {bytes(timing.transferSize)}
                    </span>{' '}
                    wire
                  </span>
                )}
                {timing?.cached && <span className="text-amber-300/80">disk cache</span>}
                {timing?.protocol && <span className="text-neutral-600">{timing.protocol}</span>}
                {result.cors === '*' && <span className="text-neutral-600">cors *</span>}
              </>
            ) : (
              <span className="text-neutral-600">
                {running ? 'Requesting…' : blocked ? 'Needs a token' : 'No response'}
              </span>
            )}
          </div>

          <div className="max-h-[300px] min-h-[300px] overflow-auto px-4 py-3 lg:max-h-[440px] lg:min-h-[440px]">
            {result?.json ? (
              <JsonView
                value={result.json}
                active={picked?.path ?? null}
                onPick={(path, value) => setPicked({ path, value })}
              />
            ) : (
              <p className="font-tech text-[12px] leading-relaxed text-neutral-600">
                {running
                  ? 'Waiting for the server…'
                  : blocked
                    ? 'This endpoint needs a token. Paste one above, or pick the feed — it answers without one.'
                    : result?.status === 401
                      ? 'That token was not recognised. Check it under Account → API.'
                      : result?.status === 403
                        ? 'That token is recognised but not allowed here — wrong scope, revoked, expired, or called from an address it is not permitted from.'
                        : result?.status === 429
                          ? 'Too many requests for that token. Wait a minute and try again.'
                          : state === 'failed'
                            ? 'The request failed. If you are reading this offline, that is why.'
                            : ''}
              </p>
            )}
          </div>

          {timing && total > 0 && (
            <div className="border-t border-[#282832] px-4 py-3">
              <div className="mb-2 flex h-1.5 w-full overflow-hidden">
                {SEGMENTS.map((segment) => {
                  const width = (timing[segment.key] / total) * 100;
                  if (width <= 0) return null;
                  return (
                    <span
                      key={segment.key}
                      className={segment.colour}
                      style={{ width: `${width}%` }}
                      title={`${segment.label} ${ms(timing[segment.key])} ms`}
                    />
                  );
                })}
              </div>
              <div className="font-tech flex flex-wrap gap-x-4 gap-y-1 text-[10px] tracking-[0.12em] text-neutral-600 uppercase">
                {SEGMENTS.map((segment) => (
                  <span key={segment.key} className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 ${segment.colour}`} />
                    {segment.label}
                    <span className="text-neutral-400 tabular-nums">
                      {ms(timing[segment.key])}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col">
          <p className="font-tech border-b border-[#282832] px-4 py-2.5 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
            Field
          </p>

          <div className="min-h-[220px] flex-1 px-4 py-4 xl:min-h-0">
            {picked ? (
              <>
                <code className="font-tech mb-3 flex items-start gap-1.5 text-[12px] break-all text-violet-300">
                  <CornerDownRight size={12} strokeWidth={2} className="mt-1 shrink-0 opacity-60" />
                  {picked.path}
                </code>

                <p className="font-tech mb-4 text-[10px] tracking-[0.15em] text-neutral-600 uppercase">
                  {pickedType}
                  {Array.isArray(pickedValue) && ` · ${pickedValue.length}`}
                </p>

                <p className="mb-4 text-[13px] leading-relaxed text-neutral-400">
                  {doc?.note ??
                    'Not documented yet. Its type and current value are above and below — everything on this page is generated from the same content the site renders.'}
                </p>

                {doc?.source && (
                  <p className="font-tech border-t border-[#1e1e26] pt-3 text-[10px] tracking-[0.15em] text-neutral-600 uppercase">
                    Source
                    <br />
                    <span className="text-neutral-400 normal-case">{doc.source}</span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-[13px] leading-relaxed text-neutral-500">
                Click any key in the response and this panel explains what it is, what type it
                holds, and which file on the server it came from.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
