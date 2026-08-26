import React from 'react';
import { Activity, Loader2 } from 'lucide-react';
import Globe from './Globe';
import { HOSTING_CITY, HOSTING_PROVIDER } from '../../siteConfig';
import { SERVER, distanceKm, guessVisitor, lightFloorMs, runProbe, summarise } from '../../lib/network';

const SAMPLES = 12;
const WARMUPS = 2;

const SERVER_POINT = { ...SERVER, label: HOSTING_CITY };

function format(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 10) return ms.toFixed(1);
  return String(Math.round(ms));
}

export default function LatencyConsole() {
  const [visitor, setVisitor] = React.useState(null);
  const [samples, setSamples] = React.useState([]);
  const [state, setState] = React.useState('idle');
  const [fireToken, setFireToken] = React.useState(0);
  const abortRef = React.useRef(null);

  React.useEffect(() => {
    setVisitor(guessVisitor());
  }, []);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const km = visitor ? distanceKm(visitor, SERVER) : null;
  const floor = km === null ? null : lightFloorMs(km);
  const stats = summarise(samples);

  const overhead = stats && floor !== null ? stats.min - floor : null;

  const start = React.useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSamples([]);
    setState('running');

    const collected = await runProbe({
      samples: SAMPLES,
      warmups: WARMUPS,
      signal: controller.signal,
      onSample: ({ ms, warmup, failed }) => {
        if (warmup || failed) return;
        setSamples((current) => [...current, ms]);
        setFireToken((token) => token + 1);
      },
    });

    if (controller.signal.aborted) return;
    setState(collected.length > 0 ? 'done' : 'failed');
  }, []);

  const running = state === 'running';
  const peak = samples.length > 0 ? Math.max(...samples) : 1;

  return (
    <div className="w-full border-x border-b border-[#282832] bg-[#08080b]">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="relative border-b border-[#282832] p-6 sm:p-8 lg:border-r lg:border-b-0">
          <Globe visitor={visitor} server={SERVER_POINT} fireToken={fireToken} />
          <p className="font-tech absolute inset-x-0 bottom-4 text-center text-[10px] tracking-[0.18em] text-neutral-600 uppercase">
            Drag to spin
          </p>
        </div>

        <div className="flex flex-col justify-center p-6 text-left sm:p-8">
          <span className="font-tech mb-6 text-[11px] tracking-[0.2em] text-muted uppercase">
            Round trip to {HOSTING_CITY}
          </span>

          <div aria-live="polite" className="mb-2 flex items-baseline gap-3">
            <span className="text-6xl leading-none font-normal tracking-tight text-white tabular-nums sm:text-7xl">
              {format(stats?.median ?? null)}
            </span>
            <span className="text-lg font-normal text-neutral-500">ms</span>
          </div>

          <p className="mb-8 text-[13px] leading-relaxed text-neutral-500">
            {state === 'idle' && 'Median of twelve HTTP round trips. Nothing has been measured yet.'}
            {running && `Measuring — ${samples.length} of ${SAMPLES} back.`}
            {state === 'done' &&
              `Median of ${stats.count} round trips. Best ${format(stats.min)} ms, jitter ${format(stats.jitter)} ms.`}
            {state === 'failed' &&
              'Every request failed. Either the connection dropped mid-run or something between here and Frankfurt is blocking them.'}
          </p>

          <div className="mb-8 flex h-20 items-end gap-1.5" aria-hidden="true">
            {Array.from({ length: SAMPLES }, (_, index) => {
              const sample = samples[index];
              return (
                <div
                  key={index}
                  className={`lab-bar flex-1 transition-all duration-300 ${
                    sample === undefined ? 'bg-[#1c1c24]' : 'bg-violet-400/70'
                  }`}
                  style={
                    sample === undefined
                      ? undefined
                      : { '--bar': `${Math.max(4, (sample / peak) * 100)}%` }
                  }
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={start}
            disabled={running}
            className="mb-8 inline-flex w-fit cursor-pointer items-center gap-2.5 border border-white px-6 py-3 text-[11px] font-semibold tracking-[0.2em] text-white transition-all hover:bg-white hover:text-black disabled:cursor-default disabled:border-[#282832] disabled:text-neutral-500 disabled:hover:bg-transparent"
          >
            {running ? (
              <Loader2 size={13} strokeWidth={2} className="animate-spin" aria-hidden="true" />
            ) : (
              <Activity size={13} strokeWidth={2} aria-hidden="true" />
            )}
            {running ? 'MEASURING' : state === 'idle' ? 'MEASURE MY CONNECTION' : 'MEASURE AGAIN'}
          </button>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[#282832] pt-6">
            <Stat
              label="Distance"
              value={km === null ? '—' : `${Math.round(km).toLocaleString('en-GB')} km`}
              note={visitor ? `${visitor.label} → ${HOSTING_CITY}` : 'Working out where you are'}
            />
            <Stat
              label="Light in fibre"
              value={floor === null ? '—' : `${format(floor)} ms`}
              note="The fastest this trip could physically be"
            />
            <Stat
              label="Best sample"
              value={stats ? `${format(stats.min)} ms` : '—'}
              note={
                overhead === null
                  ? 'Nothing measured yet'
                  : `${format(Math.max(0, overhead))} ms above the floor`
              }
            />
            <Stat
              label="Jitter"
              value={stats ? `${format(stats.jitter)} ms` : '—'}
              note="Mean change between one sample and the next"
            />
          </dl>

          {visitor?.precision === 'offset' && (
            <p className="font-tech mt-6 text-[11px] leading-relaxed text-neutral-600">
              Your time zone is not one of the ones we hold a city for, so the distance
              above is measured from your meridian at a guessed latitude. The
              milliseconds are still measured; only the kilometres are estimated.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-[#282832] px-6 py-5 sm:px-8">
        <p className="font-tech text-left text-[11px] leading-relaxed text-neutral-500">
          Real: every millisecond above was measured on your connection just now, by
          fetching a four-byte file from the {HOSTING_PROVIDER} server in {HOSTING_CITY}{' '}
          that sent you this page — twelve times, one after another, with two
          discarded warm-ups first. It is an HTTP round trip rather than an ICMP
          ping, so it includes nginx opening the file. Estimated: your location,
          which comes from your browser's time zone and is never sent anywhere —
          no IP lookup, no location prompt, nothing leaves the page.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, note }) {
  return (
    <div className="flex flex-col">
      <dt className="font-tech mb-1.5 text-[10px] tracking-[0.18em] text-muted uppercase">
        {label}
      </dt>
      <dd className="mb-1 text-xl font-normal tracking-tight text-white tabular-nums">{value}</dd>
      <dd className="text-[11px] leading-snug text-neutral-600">{note}</dd>
    </div>
  );
}
