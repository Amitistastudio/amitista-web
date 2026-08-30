import React from 'react';
import { CircleAlert, Check, Loader, ShieldCheck } from 'lucide-react';
import { CONTACT_EMAIL } from '../../siteConfig';
import { passGate } from '../../lib/admin';
import { useTurnstile } from '../../lib/useTurnstile';

const WAITING = 'waiting';
const CHECKING = 'checking';
const PASSED = 'passed';
const REFUSED = 'refused';

const BLOCKED_HELP = `The check could not load. It is served by Cloudflare, so a content blocker or a
network that filters third-party scripts will stop it.`;

function Dot({ tone }) {
  const still = tone === 'rose' ? 'bg-rose-500' : tone === 'emerald' ? 'bg-emerald-400' : 'bg-amber-400';
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {tone !== 'emerald' && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping motion-reduce:hidden ${still}`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${still}`} />
    </span>
  );
}

function Status({ tone, icon: Icon, spin, children }) {
  const text = tone === 'rose' ? 'text-rose-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-neutral-400';
  return (
    <p
      role="status"
      aria-live="polite"
      className={`flex items-start gap-2.5 text-[12px] font-normal ${text}`}
    >
      {Icon ? (
        <Icon
          className={`h-3.5 w-3.5 shrink-0 mt-[3px] ${spin ? 'motion-safe:animate-spin' : ''}`}
          strokeWidth={2}
        />
      ) : (
        <span className="mt-[5px]">
          <Dot tone={tone} />
        </span>
      )}
      <span className="leading-relaxed">{children}</span>
    </p>
  );
}

export default function Gate({ onPassed }) {
  const turnstile = useTurnstile('admin-login', { size: 'flexible' });
  const { token, reset } = turnstile;
  const [step, setStep] = React.useState(WAITING);
  const [error, setError] = React.useState(null);
  const spent = React.useRef('');

  React.useEffect(() => {
    if (!token || token === spent.current) return;

    spent.current = token;
    let dropped = false;
    setStep(CHECKING);
    setError(null);

    passGate(token)
      .then(() => {
        if (dropped) return;
        setStep(PASSED);
        window.setTimeout(() => {
          if (!dropped) onPassed();
        }, 550);
      })
      .catch((failure) => {
        if (dropped) return;
        setStep(REFUSED);
        setError(failure.message);
        reset();
      });

    return () => {
      dropped = true;
    };
  }, [token, reset, onPassed]);

  const unkeyed = !turnstile.enabled;
  const blocked = turnstile.state === 'error';
  const expired = turnstile.state === 'expired';

  return (
    <div className="w-full max-w-[440px]">
      <div className="border border-[#282832] bg-[#0a0a0d]">
        <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-4 border-b border-[#282832]">
          <span className="inline-flex items-center gap-2.5 text-[11px] font-semibold text-neutral-300 tracking-[0.2em] uppercase">
            <ShieldCheck className="h-3.5 w-3.5 text-neutral-500" strokeWidth={1.5} />
            Studio panel
          </span>
          <span className="text-[11px] font-mono text-neutral-600 select-none">01 / 02</span>
        </div>

        <div className="p-6 sm:p-8">
          <h1 className="text-[22px] sm:text-[26px] font-normal text-white tracking-tight leading-tight">
            {step === PASSED ? 'Thank you' : 'One check first'}
          </h1>
          <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mt-3">
            {step === PASSED
              ? 'That is all we needed. Opening the sign-in form.'
              : 'This part of the site is private. Cloudflare runs a quick check that there is a person here — most of the time there is nothing to click.'}
          </p>

          {step !== PASSED && !unkeyed && (
            <div className="mt-7 min-h-[74px]">
              <div ref={turnstile.containerRef} />
            </div>
          )}

          <div className="mt-6 border-t border-[#17171d] pt-5">
            {step === PASSED ? (
              <Status tone="emerald" icon={Check}>
                Verified. This stands for the next half hour.
              </Status>
            ) : step === CHECKING ? (
              <Status tone="amber" icon={Loader} spin>
                Confirming that with Cloudflare…
              </Status>
            ) : unkeyed ? (
              <Status tone="rose" icon={CircleAlert}>
                The panel is asking for a check this site was built without a key for. Whoever
                deploys it needs to set VITE_TURNSTILE_SITEKEY and build again.
              </Status>
            ) : blocked ? (
              <Status tone="rose" icon={CircleAlert}>
                {BLOCKED_HELP}
              </Status>
            ) : step === REFUSED ? (
              <Status tone="rose" icon={CircleAlert}>
                {error}
              </Status>
            ) : expired ? (
              <Status tone="amber">That check expired before it was used. Run it once more.</Status>
            ) : turnstile.state === 'loading' ? (
              <Status tone="amber">Loading the check…</Status>
            ) : (
              <Status tone="amber">Waiting on the check above.</Status>
            )}
          </div>
        </div>
      </div>

      {(blocked || unkeyed || step === REFUSED) && (
        <p className="text-[12px] text-neutral-500 font-normal leading-relaxed mt-4">
          Still stuck after a reload?{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Studio panel — the verification check will not pass')}`}
            className="text-neutral-300 hover:text-white underline underline-offset-4 decoration-[#3a3a46] transition-colors"
          >
            Write to us
          </a>{' '}
          and we will get you in another way.
        </p>
      )}
    </div>
  );
}
