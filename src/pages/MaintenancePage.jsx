import React from 'react';
import { ArrowLeft, ArrowUpRight, Activity, Mail, MessageCircle } from 'lucide-react';
import Silk from '../components/Silk';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { CONTACT_EMAIL, DISCORD_INVITE } from '../siteConfig';
import { POLL_MS, useCountdown } from '../lib/maintenance';

const PATH_LIMIT = 48;

const WORDING = {
  maintenance: {
    kicker: 'UNDER MAINTENANCE',
    heading: 'We are working on this page.',
    body: 'It will be back before long. The rest of the site is open as usual.',
    status: '503 · maintenance in progress',
    silk: '#7c3aed',
    accent: 'text-violet-300',
    meaning:
      'The studio has taken this one page down on purpose to work on it. Nothing is broken, and nothing you sent has been lost.',
  },
  closed: {
    kicker: 'TEMPORARILY CLOSED',
    heading: 'This page is closed right now.',
    body: 'The studio has taken it offline on purpose. The rest of the site is open as usual.',
    status: '503 · closed by the studio',
    silk: '#9f1239',
    accent: 'text-rose-300',
    meaning:
      'This page is switched off for now rather than being reworked. It will return when the studio reopens it.',
  },
};

const MEANWHILE = [
  { href: '/work', label: 'Our work', hint: 'Projects and what we built' },
  { href: '/services', label: 'Services', hint: 'What we take on' },
  { href: '/process', label: 'How we work', hint: 'The four stages' },
  { href: '/faq', label: 'FAQ', hint: 'Cost, scope, ownership' },
];

function sinceWords(since, now) {
  const started = Date.parse(since ?? '');
  if (!Number.isFinite(started)) return null;
  const minutes = Math.max(0, Math.floor((now - started) / 60000));
  if (minutes < 1) return 'moments ago';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export default function MaintenancePage({
  path = '',
  mode = 'maintenance',
  message = '',
  since = null,
  until = null,
  tag = '',
}) {
  const wording = WORDING[mode] ?? WORDING.maintenance;
  const attempted = path.length > PATH_LIMIT ? `${path.slice(0, PATH_LIMIT)}…` : path || '/';
  const headline = message.trim() || wording.heading;
  const kicker = (tag.trim() || wording.kicker).toUpperCase();
  const countdown = useCountdown(until);
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1;
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(tick);
  }, []);

  const age = sinceWords(since, now);

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />

      <div className="w-full flex flex-col items-center bg-[#060608] flex-1">
        <main
          id="main"
          tabIndex={-1}
          className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-center text-center overflow-hidden focus:outline-none"
        >
          <Silk
            color={wording.silk}
            speed={0.7}
            scale={1.8}
            noiseIntensity={1.6}
            rotation={-0.4}
            fadeEdge={true}
            className="absolute inset-0 w-full h-full z-0 opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060608] via-transparent to-[#060608]/80 pointer-events-none z-1" />

          <div className="relative z-30 max-w-2xl px-6 flex flex-col items-center py-16">
            <span className="inline-flex items-center gap-2 text-[10px] sm:text-xs font-semibold text-white/70 tracking-[0.35em] mb-5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full animate-pulse ${mode === 'closed' ? 'bg-rose-400' : 'bg-violet-400'}`} />
              {kicker}
            </span>

            <span
              data-text="503"
              className="glitch inline-block text-7xl sm:text-9xl lg:text-[150px] font-bold tracking-tight leading-none mb-6 bg-[linear-gradient(115deg,#ffffff_0%,#ffffff_35%,#d9ccff_65%,#8b5cf6_100%)] bg-clip-text text-transparent drop-shadow-lg"
            >
              503
            </span>

            <h1 className="text-2xl sm:text-3xl font-normal text-white tracking-tight mb-4">
              {headline}
            </h1>
            <p className="text-sm sm:text-base text-white/75 font-normal max-w-md leading-relaxed mb-8">
              {wording.body}
            </p>

            <div className="w-full max-w-md bg-black/40 backdrop-blur-sm border border-white/10 px-4 py-3 mb-8 text-left font-mono text-[12px] sm:text-[13px] leading-relaxed">
              <div className="text-white/80 break-all">
                <span className={`${wording.accent} select-none`}>$ </span>
                GET {attempted}
              </div>
              <div className="text-white/45">
                <span className="select-none">&rarr; </span>
                {wording.status}
                {age ? ` · began ${age}` : ''}
              </div>
              <div className="text-white/45">
                <span className="select-none">&rarr; </span>
                retry: automatic, every {Math.round(POLL_MS / 1000)}s
              </div>
              {countdown && (
                <div className="text-violet-300/90">
                  <span className="select-none">&rarr; </span>
                  reopens in {countdown}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
              <a
                href="/"
                className="border border-white hover:bg-white hover:text-black text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer"
              >
                BACK TO HOME
              </a>
              <a
                href="/status"
                className="bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <Activity size={13} strokeWidth={2} />
                SITE STATUS
              </a>
              {canGoBack && (
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  className="text-white/60 hover:text-white font-semibold text-[11px] tracking-[0.2em] px-2 py-3 transition-all cursor-pointer inline-flex items-center gap-2"
                >
                  <ArrowLeft size={14} strokeWidth={2} />
                  GO BACK
                </button>
              )}
            </div>

            <span className="block w-px h-8 bg-gradient-to-b from-violet-500/50 to-transparent mb-3" />
            <p className="text-[11px] text-white/40 tracking-[0.14em] mb-2">
              This tab checks by itself and comes back the moment the page does.
            </p>
            <span className="block w-44 h-px bg-white/10 overflow-hidden">
              <span className="refill block h-full bg-violet-400/70" />
            </span>
          </div>
        </main>

        <section className="w-full max-w-[1480px] border-x border-t border-[#222228] bg-[#060608] relative z-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[1px] bg-[#282832] border-b border-[#282832]">
            <div className="bg-[#0a0a0d] p-8 flex flex-col text-left min-h-[220px]">
              <h2 className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-5">
                What this means
              </h2>
              <p className="text-sm text-neutral-400 leading-relaxed">{wording.meaning}</p>
              {age && (
                <p className="text-[11px] text-neutral-600 mt-auto pt-4">
                  This cover went up {age}.
                </p>
              )}
            </div>

            <div className="bg-[#0a0a0d] p-8 flex flex-col text-left min-h-[220px]">
              <h2 className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-5">
                Meanwhile
              </h2>
              <ul className="flex flex-col gap-3.5">
                {MEANWHILE.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className="group/page block">
                      <span className="flex items-center gap-1.5 text-[13px] sm:text-sm text-neutral-300 group-hover/page:text-white transition-colors tracking-tight">
                        {item.label}
                        <ArrowUpRight
                          size={12}
                          strokeWidth={2}
                          className="text-neutral-700 group-hover/page:text-violet-400 transition-colors shrink-0"
                        />
                      </span>
                      <span className="block text-[11px] text-muted leading-relaxed mt-0.5">
                        {item.hint}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-[#0a0a0d] p-8 flex flex-col text-left min-h-[220px]">
              <h2 className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-5">
                Need us now
              </h2>
              <p className="text-sm text-neutral-400 leading-relaxed mb-5">
                The studio is still reachable while this page is down.
              </p>
              <div className="flex flex-col gap-3 mt-auto">
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="inline-flex items-center gap-2 text-[13px] text-neutral-300 hover:text-white transition-colors"
                >
                  <Mail size={14} strokeWidth={2} className="text-neutral-600" />
                  {CONTACT_EMAIL}
                </a>
                {DISCORD_INVITE && (
                  <a
                    href={DISCORD_INVITE}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-[13px] text-neutral-300 hover:text-white transition-colors"
                  >
                    <MessageCircle size={14} strokeWidth={2} className="text-neutral-600" />
                    Join the Discord
                  </a>
                )}
                <a
                  href="/contact"
                  className="inline-flex items-center gap-2 text-[13px] text-neutral-300 hover:text-white transition-colors"
                >
                  <ArrowUpRight size={14} strokeWidth={2} className="text-neutral-600" />
                  Start a project
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
}
