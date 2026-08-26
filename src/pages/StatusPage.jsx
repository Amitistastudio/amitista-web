import React from 'react';
import { Activity, ShieldCheck, RefreshCw } from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { STUDIO_NAME } from '../siteConfig';
import { fetchStatus, relativeTime, statusPreviewMode, LOADING, READY, UNAVAILABLE } from '../lib/status';

const STATE_COPY = {
  operational: {
    dot: 'bg-emerald-400',
    ring: 'border-emerald-500/30',
    title: 'All systems operational',
    body: 'Every check below passed on the most recent run.',
  },
  degraded: {
    dot: 'bg-amber-400',
    ring: 'border-amber-500/30',
    title: 'Something is degraded',
    body: 'At least one check is failing. The rows below say which.',
  },
  down: {
    dot: 'bg-rose-500',
    ring: 'border-rose-500/30',
    title: 'Major outage',
    body: 'Every check is failing. If you need us, email rather than using the form.',
  },
  unknown: {
    dot: 'bg-neutral-500',
    ring: 'border-[#282832]',
    title: 'Not reporting',
    body: 'The monitor has not recorded a result yet.',
  },
};

const DAY_UP = 'bg-emerald-500/80';
const DAY_THIN = 'bg-emerald-500/30';
const DAY_DOWN = 'bg-rose-500';
const DAY_NONE = 'bg-[#1c1c22]';
const DAY_UNMONITORED = 'bg-[#131318]';

const MIN_DOWN = 12;
const MAX_DOWN = 88;

function downShare(day) {
  if (day.total === 0) return 0;
  const failed = day.total - day.up;
  if (failed <= 0) return 0;
  if (failed >= day.total) return 100;
  return Math.min(MAX_DOWN, Math.max(MIN_DOWN, Math.round((failed / day.total) * 100)));
}

function dayVisibility(index, total) {
  const fromEnd = total - index;
  if (fromEnd <= 30) return '';
  if (fromEnd <= 60) return 'hidden sm:flex';
  return 'hidden lg:flex';
}

function DayMark({ day, monitored }) {
  if (!monitored) return <span className={`w-full h-[30%] rounded-[1px] ${DAY_UNMONITORED}`} />;
  if (day.total === 0) return <span className={`w-full h-full rounded-[1px] ${DAY_NONE}`} />;

  const down = downShare(day);
  const base = day.state === 'partial' ? DAY_THIN : DAY_UP;

  if (down === 0) return <span className={`w-full h-full rounded-[1px] ${base}`} />;
  if (down === 100) return <span className={`w-full h-full rounded-[1px] ${DAY_DOWN}`} />;

  return (
    <>
      <span className={`w-full rounded-t-[1px] ${base}`} style={{ height: `${100 - down}%` }} />
      <span className={`w-full rounded-b-[1px] ${DAY_DOWN}`} style={{ height: `${down}%` }} />
    </>
  );
}

function firstMonitored(days) {
  return days.findIndex((day) => day.total > 0);
}

function formatDay(iso) {
  const parsed = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function windowLabel(windowDays, days, start) {
  if (start < 0) return 'Not monitored yet';
  const fromEnd = days.length - start;
  if (fromEnd >= windowDays) return `${windowDays} days ago`;
  return `Since ${formatDay(days[start].date)}`;
}

function formatUptime(value) {
  if (value === null) return '—';
  return `${value.toFixed(2)}%`;
}

function dayTitle(day, monitored) {
  if (day.total === 0) {
    return monitored ? `${day.date} — no samples recorded` : `${day.date} — before monitoring started`;
  }
  const thin = day.state === 'partial' ? ', partial day' : '';
  const failed = day.total - day.up;
  if (failed === 0) return `${day.date} — all ${day.total} checks passed${thin}`;
  return `${day.date} — ${failed} of ${day.total} checks failed${thin}`;
}

function UptimeBar({ check, start }) {
  const total = check.days.length;

  return (
    <div
      className="flex items-stretch gap-[2px] h-9 w-full"
      role="img"
      aria-label={
        check.uptime === null
          ? `${check.name}: no uptime recorded yet`
          : `${check.name}: ${formatUptime(check.uptime)} of ${check.samples} checks passed since ${formatDay(
              check.days[start].date,
            )}`
      }
    >
      {check.days.map((day, index) => {
        const monitored = start >= 0 && index >= start;
        return (
          <span
            key={day.date || index}
            title={dayTitle(day, monitored)}
            className={`flex-1 min-w-[2px] flex flex-col justify-end ${dayVisibility(index, total)}`}
          >
            <DayMark day={day} monitored={monitored} />
          </span>
        );
      })}
    </div>
  );
}

function CheckRow({ check }) {
  const live = check.status === 'up' ? 'bg-emerald-400' : check.status === 'down' ? 'bg-rose-500' : 'bg-neutral-600';
  const start = firstMonitored(check.days);

  return (
    <div className="bg-[#0a0a0d] p-8 flex flex-col text-left hover:bg-[#0c0c10] transition-colors duration-300">
      <div className="flex items-start justify-between gap-6 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`h-2 w-2 rounded-full shrink-0 ${live}`} />
          <h3 className="text-base sm:text-lg font-medium text-white tracking-tight truncate">
            {check.name}
          </h3>
        </div>
        <div className="text-right shrink-0">
          <span className="block text-base sm:text-lg font-medium text-white tabular-nums">
            {formatUptime(check.uptime)}
          </span>
          <span className="block text-[11px] text-muted tracking-wider">
            {check.samples === 0
              ? 'no checks yet'
              : `${check.samples.toLocaleString('en-GB')} check${check.samples === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      <p className="text-[13px] sm:text-sm text-neutral-400 font-normal leading-relaxed mb-6 max-w-[52ch]">
        {check.detail}
      </p>

      <UptimeBar check={check} start={start} />

      <div className="flex items-center justify-between mt-3 text-[10px] sm:text-[11px] font-semibold text-muted tracking-[0.15em] uppercase">
        <span className="sm:hidden">{windowLabel(30, check.days, start)}</span>
        <span className="hidden sm:inline lg:hidden">{windowLabel(60, check.days, start)}</span>
        <span className="hidden lg:inline">{windowLabel(90, check.days, start)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const [state, setState] = React.useState(LOADING);
  const [data, setData] = React.useState(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const previous = document.title;
    document.title = `Status — ${STUDIO_NAME}`;
    return () => {
      document.title = previous;
    };
  }, []);

  const cancelled = React.useRef(false);

  const load = React.useCallback(async () => {
    const result = await fetchStatus();
    if (cancelled.current) return;
    if (result) {
      setData(result);
      setState(READY);
    } else {
      setState(UNAVAILABLE);
    }
    setNow(Date.now());
  }, []);

  React.useEffect(() => {
    cancelled.current = false;
    load();

    const poll = setInterval(load, 300000);
    const tick = setInterval(() => setNow(Date.now()), 30000);

    return () => {
      cancelled.current = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const overall = state === READY ? STATE_COPY[data.overall] : STATE_COPY.unknown;
  const checkedAgo = state === READY ? relativeTime(data.checked, now) : null;
  const preview = statusPreviewMode();

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />

      <main
        id="main"
        tabIndex={-1}
        className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none"
      >
        <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-start text-center overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[560px] z-0 pointer-events-none">
            <Silk
              color="#8864f2"
              speed={4.5}
              scale={1.6}
              noiseIntensity={1.4}
              rotation={0.2}
              fadeEdge={true}
              className="absolute inset-0 w-full h-full opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608]/25 via-[#060608]/65 to-[#060608]" />
          </div>

          <div className="absolute inset-x-0 top-[500px] bottom-0 z-0 pointer-events-none">
            <div className="absolute inset-0 dot-grid opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608] via-transparent to-[#060608]" />
          </div>

          <div className="relative z-30 w-full flex flex-col items-center pt-24 pb-24 px-6 sm:px-10 md:px-16 lg:px-20">
            <Reveal rise className="w-full flex flex-col items-center">
              <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-[#222228] bg-[#111115]/50 text-xs sm:text-[13px] font-medium text-neutral-300 mb-6 select-none transition-all hover:bg-[#15151a]">
                STATUS
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[72px] font-normal text-white tracking-tight leading-none mb-6 max-w-4xl">
                Is it
                <br />
                working?
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[540px] text-center leading-relaxed mb-16 tracking-tight">
                The site checks itself every five minutes and this is what it
                found. Nothing here is typed in by hand — if a row is red, it is
                red because a check failed, including on the days we would rather
                it had not.
              </p>
            </Reveal>

            <div className="w-full max-w-5xl flex flex-col">
              {import.meta.env.DEV && preview && (
                <div className="w-full border border-amber-500/40 bg-amber-500/10 px-6 py-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-left">
                  <span className="text-[11px] font-semibold text-amber-300 tracking-[0.2em] uppercase shrink-0">
                    Preview
                  </span>
                  <p className="text-[13px] text-amber-200/80 font-normal leading-relaxed">
                    {preview === 'fresh'
                      ? 'Every number below is invented, shaped like a monitor that started this morning — which is the state the live page is in. Use ?preview for a full window instead.'
                      : 'Every number below is invented, for looking at the layout with a full window of history. Use ?preview=fresh for the shape the live page is in today.'}{' '}
                    Drop <code>?preview</code> from the address to see the real
                    thing.
                  </p>
                </div>
              )}

              <Reveal className="w-full">
                <div
                  className={`w-full border ${overall.ring} bg-[#0a0a0d] px-8 py-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6 text-left`}
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <span className="relative flex h-3 w-3 shrink-0 mt-1.5">
                      {state === READY && data.overall === 'operational' && (
                        <span
                          className={`motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${overall.dot}`}
                        />
                      )}
                      <span className={`relative inline-flex h-3 w-3 rounded-full ${overall.dot}`} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-2xl sm:text-3xl font-medium text-white tracking-tight mb-2">
                        {state === LOADING ? 'Checking…' : overall.title}
                      </h2>
                      <p className="text-sm text-neutral-400 font-normal leading-relaxed max-w-[46ch]">
                        {state === LOADING
                          ? 'Reading the latest run from the server.'
                          : state === UNAVAILABLE
                            ? 'The status file could not be read. That is either a monitor that has not run yet or a server that cannot answer — and this page cannot tell you which, so it will not guess.'
                            : overall.body}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                    <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase">
                      {checkedAgo ? `Checked ${checkedAgo}` : 'Not yet checked'}
                    </span>
                    <button
                      type="button"
                      onClick={load}
                      className="search-press inline-flex items-center gap-2 border border-[#282832] hover:border-neutral-600 text-neutral-400 hover:text-white px-4 py-2 text-[11px] font-semibold tracking-[0.2em] transition-colors cursor-pointer"
                    >
                      <RefreshCw size={12} strokeWidth={2} />
                      REFRESH
                    </button>
                  </div>
                </div>
              </Reveal>

              {state === READY && (
                <Reveal className="grid grid-cols-1 gap-[1px] bg-[#282832] w-full border-x border-b border-[#282832]">
                  {data.checks.map((check) => (
                    <CheckRow key={check.id} check={check} />
                  ))}
                </Reveal>
              )}

              {state === READY && (
                <Reveal className="w-full border-x border-b border-[#282832] bg-[#0a0a0d] px-8 py-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-left">
                  {[
                    [DAY_UP, 0, 'h-3', 'Up'],
                    [DAY_THIN, 0, 'h-3', 'Partly watched'],
                    [DAY_UP, 34, 'h-3', 'Some failed'],
                    [DAY_UP, 100, 'h-3', 'Failed all day'],
                    [DAY_NONE, 0, 'h-3', 'No samples'],
                    [DAY_UNMONITORED, 0, 'h-[30%]', 'Before monitoring'],
                  ].map(([base, down, height, label]) => (
                    <span key={label} className="inline-flex items-end gap-2">
                      <span className="inline-flex flex-col justify-end h-3">
                        <span className={`inline-flex flex-col justify-end w-[3px] ${height}`}>
                          {down < 100 && (
                            <span
                              className={`w-full rounded-t-[1px] ${base}`}
                              style={{ height: `${100 - down}%` }}
                            />
                          )}
                          {down > 0 && (
                            <span
                              className={`w-full rounded-b-[1px] ${DAY_DOWN}`}
                              style={{ height: `${down}%` }}
                            />
                          )}
                        </span>
                      </span>
                      <span className="text-[10px] sm:text-[11px] font-semibold text-muted tracking-[0.15em] uppercase leading-none">
                        {label}
                      </span>
                    </span>
                  ))}
                </Reveal>
              )}

              <Reveal
                delay={80}
                className="grid grid-cols-1 md:grid-cols-2 gap-[1px] bg-[#282832] w-full border-x border-b border-[#282832]"
              >
                <div className="bg-[#0a0a0d] p-8 flex flex-col text-left">
                  <Activity
                    size={26}
                    strokeWidth={1.5}
                    className="text-muted mb-5"
                    aria-hidden="true"
                  />
                  <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-4">
                    What this cannot tell you
                  </span>
                  <p className="text-sm text-neutral-400 font-normal leading-relaxed">
                    The monitor runs on the same server it is checking, so the one
                    failure it can never record is that server being gone. Those
                    minutes arrive as missing samples, not as failures — which is
                    why a day with too few checks is drawn faintly instead of
                    green, and why a gap here is not a claim that everything was
                    fine.
                  </p>
                </div>
                <div className="bg-[#0a0a0d] p-8 flex flex-col text-left">
                  <ShieldCheck
                    size={26}
                    strokeWidth={1.5}
                    className="text-muted mb-5"
                    aria-hidden="true"
                  />
                  <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-4">
                    How the numbers are counted
                  </span>
                  <p className="text-sm text-neutral-400 font-normal leading-relaxed">
                    Every five minutes, each check passes or fails, and a
                    percentage is the passes over the checks that actually ran in
                    the last {state === READY ? data.windowDays : 90} days. A day
                    is red in the proportion that failed, so one bad run out of
                    three hundred is a red foot rather than a red day — small,
                    but never nothing. A day with a single failure is never
                    rounded up to 100%, and a check that has never run reads as a
                    dash rather than as perfect.
                  </p>
                </div>
              </Reveal>

              <Reveal className="w-full flex">
                <a
                  href="/contact"
                  className="w-full border-x border-b border-[#282832] bg-[#0a0a0d] flex items-center justify-between h-16 px-8 hover:bg-[#0c0c10] transition-colors duration-300 group cursor-pointer"
                >
                  <span className="text-sm font-bold text-white tracking-wider text-left">
                    Something broken that this page says is fine?
                  </span>
                  <div className="w-8 h-8 shrink-0 border border-[#282832] flex items-center justify-center bg-[#111115]/50 group-hover:border-neutral-600 transition-all duration-300">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors duration-300"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
                      />
                    </svg>
                  </div>
                </a>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
