import React from 'react';
import { connectionTiming } from '../../lib/network';

const SEGMENTS = [
  {
    key: 'dns',
    label: 'DNS',
    colour: 'bg-[#3f3f52]',
    note: 'Turning amitista.com into an address. Zero if your machine already knew it.',
  },
  {
    key: 'tcp',
    label: 'Connect',
    colour: 'bg-[#5b4b96]',
    note: 'Opening the socket to the server. One round trip, and it cannot be less.',
  },
  {
    key: 'tls',
    label: 'TLS',
    colour: 'bg-[#7c5ce0]',
    note: 'Agreeing the encryption. The certificate is checked here.',
  },
  {
    key: 'ttfb',
    label: 'Server',
    colour: 'bg-[#a78bfa]',
    note: 'Request out, first byte back — the round trip plus nginx finding the file.',
  },
  {
    key: 'download',
    label: 'Transfer',
    colour: 'bg-[#cbb9ff]',
    note: 'The rest of the document arriving after that first byte.',
  },
];

function ms(value) {
  if (value < 1) return `${value.toFixed(2)} ms`;
  if (value < 10) return `${value.toFixed(1)} ms`;
  return `${Math.round(value)} ms`;
}

function bytes(value) {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} kB`;
}

export default function ConnectionBreakdown() {
  const [timing, setTiming] = React.useState(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setTiming(connectionTiming());
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!timing) {
    return (
      <div className="w-full border-x border-b border-[#282832] bg-[#08080b] px-6 py-8 sm:px-8">
        <p className="font-tech text-left text-[11px] leading-relaxed text-neutral-500">
          Your browser is not holding a navigation timing entry for this page — which
          usually means you arrived with the back button and it was restored from
          memory rather than loaded. Reload the page and the numbers come back.
        </p>
      </div>
    );
  }

  const total = SEGMENTS.reduce((sum, segment) => sum + timing[segment.key], 0);

  return (
    <div className="w-full border-x border-b border-[#282832] bg-[#08080b] p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-left">
        <div className="flex items-baseline gap-3">
          <span className="text-4xl leading-none font-normal tracking-tight text-white tabular-nums sm:text-5xl">
            {Math.round(total)}
          </span>
          <span className="text-base text-neutral-500">ms to first byte and through</span>
        </div>
        <span className="font-tech text-[11px] text-neutral-600">
          {timing.protocol ? `over ${timing.protocol.toUpperCase()}` : 'protocol not reported'} ·{' '}
          {timing.transferred === 0
            ? 'served from your cache'
            : `${bytes(timing.transferred)} on the wire`}
          {timing.transferred > 0 && timing.decoded > timing.encoded
            ? ` for ${bytes(timing.decoded)} of HTML`
            : ''}
        </span>
      </div>

      <div className="mb-6 flex h-10 w-full overflow-hidden border border-[#282832]">
        {SEGMENTS.map((segment) => {
          const value = timing[segment.key];
          if (value <= 0) return null;
          return (
            <div
              key={segment.key}
              className={`${segment.colour} h-full`}
              style={{ width: `${(value / total) * 100}%` }}
              title={`${segment.label}: ${ms(value)}`}
            />
          );
        })}
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        {SEGMENTS.map((segment) => {
          const value = timing[segment.key];
          return (
            <div key={segment.key} className="flex items-start gap-3 text-left">
              <span
                className={`${segment.colour} mt-1.5 h-2.5 w-2.5 shrink-0`}
                aria-hidden="true"
              />
              <div className="flex flex-col">
                <dt className="mb-0.5 flex items-baseline gap-2">
                  <span className="text-[13px] font-medium text-white">{segment.label}</span>
                  <span className="font-tech text-[11px] text-neutral-400 tabular-nums">
                    {ms(value)}
                  </span>
                </dt>
                <dd className="text-[11px] leading-snug text-neutral-600">{segment.note}</dd>
              </div>
            </div>
          );
        })}
      </dl>

      {timing.reused && (
        <p className="font-tech mt-6 text-left text-[11px] leading-relaxed text-neutral-500">
          DNS and Connect are both zero because this page came down a connection that
          was already open — you arrived from somewhere else on the site. Open
          amitista.com in a new tab and this panel shows what a cold visit costs.
        </p>
      )}
    </div>
  );
}
