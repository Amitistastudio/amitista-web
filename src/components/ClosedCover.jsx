import React from 'react';
import { Lock, Activity, Eye, Mail } from 'lucide-react';
import { POLL_MS, useCountdown } from '../lib/maintenance';
import { CONTACT_EMAIL } from '../siteConfig';

const PATH_LIMIT = 48;

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

export default function ClosedCover({ path = '', message = '', since = null, until = null, tag = '', onPeek }) {
  const card = React.useRef(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [peeking, setPeeking] = React.useState(false);

  React.useEffect(() => {
    card.current?.focus();
    const tick = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(tick);
  }, []);

  const peek = React.useCallback(
    (state) => {
      setPeeking(state);
      onPeek?.(state);
    },
    [onPeek],
  );

  React.useEffect(() => () => onPeek?.(false), [onPeek]);

  const headline = message.trim() || 'This page is closed right now.';
  const big = headline.length <= 60;
  const age = sinceWords(since, now);
  const attempted = path.length > PATH_LIMIT ? `${path.slice(0, PATH_LIMIT)}…` : path || '/';
  const badge = (tag.trim() || 'TEMPORARILY CLOSED').toUpperCase();
  const countdown = useCountdown(until);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="This page is temporarily closed"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 bg-[#060608]/70 transition-opacity duration-300 ${
        peeking ? 'opacity-25' : 'opacity-100'
      }`}
    >
      <div className="relative w-full max-w-lg">
        <div className="aurora absolute -inset-20 pointer-events-none" />

        <div
          ref={card}
          tabIndex={-1}
          className="cover-pop relative border border-rose-500/30 bg-[#0a0a0d] px-8 sm:px-12 pt-14 pb-8 text-center shadow-[0_0_80px_rgba(159,18,57,0.25)] focus:outline-none"
        >
          <span className="tag-drop absolute -top-4 left-1/2 whitespace-nowrap bg-[#060608] border border-rose-500/50 text-rose-300 text-[11px] sm:text-xs font-semibold tracking-[0.3em] px-5 py-2 select-none">
            {badge}
          </span>

          <span className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10">
            <Lock size={22} strokeWidth={2} className="text-rose-300" />
          </span>

          <h1
            className={`font-normal text-white tracking-tight leading-snug mb-4 ${
              big ? 'text-2xl sm:text-4xl' : 'text-xl sm:text-2xl'
            }`}
          >
            {headline}
          </h1>
          <p className="text-sm sm:text-[15px] text-neutral-400 leading-relaxed mb-6">
            The studio has switched this page off for now. The rest of the site
            is open as usual.
          </p>

          {countdown && (
            <p className="text-[11px] font-semibold text-rose-300/90 tracking-[0.3em] mb-6">
              REOPENS IN {countdown.toUpperCase()}
            </p>
          )}

          <div className="w-full bg-black/40 border border-white/10 px-4 py-2.5 mb-6 text-left font-mono text-[11px] sm:text-[12px] leading-relaxed">
            <span className="text-rose-300/90 select-none">$ </span>
            <span className="text-white/75 break-all">GET {attempted}</span>
            <span className="text-white/40"> → 503 · closed{age ? ` ${age}` : ''}</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 border-t border-[#1c1c22] pt-7 mb-5">
            <a
              href="/"
              className="border border-white hover:bg-white hover:text-black text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer"
            >
              BACK TO HOME
            </a>
            <a
              href="/status"
              className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-semibold text-[11px] tracking-[0.2em] px-5 py-3 transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <Activity size={13} strokeWidth={2} />
              STATUS
            </a>
            <button
              type="button"
              aria-pressed={peeking}
              onPointerDown={() => peek(true)}
              onPointerUp={() => peek(false)}
              onPointerLeave={() => peek(false)}
              onPointerCancel={() => peek(false)}
              onKeyDown={(event) => {
                if (event.key === ' ' || event.key === 'Enter') peek(true);
              }}
              onKeyUp={(event) => {
                if (event.key === ' ' || event.key === 'Enter') peek(false);
              }}
              className="text-white/50 hover:text-white font-semibold text-[11px] tracking-[0.2em] px-3 py-3 transition-all cursor-pointer inline-flex items-center gap-2 select-none touch-none"
            >
              <Eye size={14} strokeWidth={2} />
              HOLD TO PEEK
            </button>
          </div>

          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-1.5 text-[11px] text-neutral-600 hover:text-neutral-300 transition-colors"
          >
            <Mail size={12} strokeWidth={2} />
            Need this page? Write to us.
          </a>
        </div>
      </div>

      <div className="relative flex flex-col items-center">
        <span className="block w-px h-10 bg-gradient-to-b from-rose-500/50 to-transparent" />
        <p className="text-[11px] text-white/35 tracking-[0.14em] inline-flex items-center gap-2 mb-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
          THIS TAB CHECKS EVERY {Math.round(POLL_MS / 1000)}S AND RETURNS WHEN THE PAGE DOES
        </p>
        <span className="block w-44 h-px bg-white/10 overflow-hidden">
          <span className="refill block h-full bg-rose-400/70" />
        </span>
      </div>
    </div>
  );
}
