import React from 'react';
import {
  ArrowRight,
  CalendarDays,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Megaphone,
  Package,
  PauseCircle,
  Search,
} from 'lucide-react';
import Reveal from '../components/Reveal';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { STUDIO_NAME } from '../siteConfig';

const ENDPOINT = '/api/track';

const SHARE_LABELS = {
  brief: 'The brief',
  budget: 'Budget',
  deadline: 'Timeline',
  pages: 'Scope',
  refs: 'Reference links',
  priority: 'Priority',
  lead: 'Who is leading it',
};

const EVENT_LABELS = {
  opened: 'Project opened',
  claimed: 'A lead took it on',
  released: 'The lead stepped off',
  stage: 'Moved on',
  held: 'Paused',
  edited: 'Details updated',
  closed: 'Closed',
  retired: 'Archived',
};

function codeFromLocation() {
  if (typeof window === 'undefined') return '';
  return (new URLSearchParams(window.location.search).get('code') || '').trim();
}

function on(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function Step({ step, last }) {
  const Icon = step.done ? CircleCheck : step.at ? CircleDot : CircleDashed;
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <Icon
          className={`h-5 w-5 shrink-0 ${
            step.done ? 'text-emerald-400' : step.at ? 'text-purple-300' : 'text-neutral-700'
          }`}
          strokeWidth={2}
        />
        {!last && (
          <span
            className={`w-px flex-1 my-1 ${step.done ? 'bg-emerald-500/40' : 'bg-[#282832]'}`}
            aria-hidden="true"
          />
        )}
      </div>
      <div className={`pb-6 ${last ? 'pb-0' : ''}`}>
        <p
          className={`text-[15px] font-normal leading-snug ${
            step.at ? 'text-white' : step.done ? 'text-neutral-300' : 'text-neutral-600'
          }`}
        >
          {step.label}
        </p>
        <p className="mt-1 text-[13px] text-neutral-500 font-normal leading-relaxed max-w-md">
          {step.note}
        </p>
      </div>
    </li>
  );
}

function Result({ order }) {
  const shared = order.shared ?? [];
  const closed = order.status === 'closed';
  const delivered = order.stage === 'delivered';

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="border border-[#282832] bg-[#0a0a0d]">
        <div className="px-6 sm:px-8 py-7 border-b border-[#17171d]">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="font-mono text-[12px] text-purple-300/90 tracking-wider">
              {order.ref}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold tracking-wide border ${
                delivered
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : closed
                    ? 'border-[#282832] bg-[#111118] text-neutral-400'
                    : order.held
                      ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                      : 'border-purple-500/30 bg-purple-500/10 text-purple-200'
              }`}
            >
              {order.stageLabel}
            </span>
          </div>

          <h1 className="text-[26px] sm:text-[30px] font-light text-white leading-tight break-words">
            {order.name || 'Your project'}
          </h1>

          <p className="mt-3 text-[14px] text-neutral-400 font-normal leading-relaxed max-w-xl">
            {order.stageNote}
          </p>

          {order.held && !closed && (
            <p className="mt-4 inline-flex items-center gap-2 text-[13px] text-amber-200 font-normal">
              <PauseCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
              This one is paused at the moment.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#17171d]">
          <div className="px-5 py-4 bg-[#0a0a0d]">
            <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">
              Kind of work
            </p>
            <p className="mt-1.5 text-[13px] text-neutral-200 font-normal">{order.category}</p>
          </div>
          <div className="px-5 py-4 bg-[#0a0a0d]">
            <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">
              Started
            </p>
            <p className="mt-1.5 text-[13px] text-neutral-200 font-normal">
              {on(order.openedAt) ?? '—'}
            </p>
          </div>
          <div className="px-5 py-4 bg-[#0a0a0d]">
            <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">
              Progress
            </p>
            <p className="mt-1.5 text-[13px] text-neutral-200 font-normal tabular-nums">
              Step {order.step} of {order.steps}
            </p>
          </div>
          <div className="px-5 py-4 bg-[#0a0a0d]">
            <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">
              {closed ? 'Closed' : 'Last update'}
            </p>
            <p className="mt-1.5 text-[13px] text-neutral-200 font-normal">
              {on(closed ? order.closedAt : order.updatedAt) ?? '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="border border-[#282832] bg-[#0a0a0d]">
        <div className="px-6 sm:px-8 py-5 border-b border-[#17171d]">
          <h2 className="text-[13px] font-semibold text-neutral-300 tracking-[0.15em] uppercase">
            Where it stands
          </h2>
        </div>
        <ol className="px-6 sm:px-8 py-7">
          {(order.track ?? []).map((step, index) => (
            <Step key={step.key} step={step} last={index === (order.track ?? []).length - 1} />
          ))}
        </ol>
        {closed && !delivered && (
          <div className="px-6 sm:px-8 py-4 border-t border-[#17171d]">
            <p className="text-[13px] text-neutral-400 font-normal">
              This project was closed before it finished. If that is not what you expected, get in
              touch and quote {order.ref}.
            </p>
          </div>
        )}
      </div>

      {(order.updates ?? []).length > 0 && (
        <div className="border border-purple-500/25 bg-purple-500/[0.05]">
          <div className="px-6 sm:px-8 py-5 border-b border-purple-500/15 flex items-center gap-2.5">
            <Megaphone className="h-4 w-4 text-purple-300 shrink-0" strokeWidth={2} />
            <h2 className="text-[13px] font-semibold text-purple-200 tracking-[0.15em] uppercase">
              Updates from the studio
            </h2>
          </div>
          <ol className="divide-y divide-purple-500/10">
            {order.updates.map((update) => (
              <li key={update.id} className="px-6 sm:px-8 py-5">
                <p className="text-[14px] text-neutral-100 font-normal leading-relaxed whitespace-pre-wrap break-words">
                  {update.body}
                </p>
                <p className="mt-2 text-[12px] text-purple-300/60 font-normal">{on(update.at)}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {shared.length > 0 && (
        <div className="border border-[#282832] bg-[#0a0a0d]">
          <div className="px-6 sm:px-8 py-5 border-b border-[#17171d]">
            <h2 className="text-[13px] font-semibold text-neutral-300 tracking-[0.15em] uppercase">
              Details
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#17171d]">
            {shared
              .filter((key) => order[key])
              .map((key) => (
                <div key={key} className="px-5 py-4 bg-[#0a0a0d]">
                  <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">
                    {SHARE_LABELS[key] ?? key}
                  </p>
                  <p className="mt-1.5 text-[13px] text-neutral-200 font-normal leading-relaxed whitespace-pre-wrap break-words">
                    {order[key]}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {(order.timeline ?? []).length > 0 && (
        <div className="border border-[#282832] bg-[#0a0a0d]">
          <div className="px-6 sm:px-8 py-5 border-b border-[#17171d]">
            <h2 className="text-[13px] font-semibold text-neutral-300 tracking-[0.15em] uppercase">
              History
            </h2>
          </div>
          <ol className="px-6 sm:px-8 py-6 flex flex-col gap-4">
            {order.timeline.map((event, index) => (
              <li key={`${event.kind}-${event.at}-${index}`} className="flex gap-3.5">
                <CalendarDays
                  className="h-4 w-4 text-neutral-700 shrink-0 mt-0.5"
                  strokeWidth={2}
                />
                <div>
                  <p className="text-[13px] text-neutral-200 font-normal leading-snug">
                    {EVENT_LABELS[event.kind] ?? 'Updated'}
                    {event.to && <span className="text-neutral-500"> — {event.to}</span>}
                  </p>
                  <p className="text-[12px] text-neutral-600 font-normal mt-0.5">{on(event.at)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-[13px] text-neutral-500 font-normal leading-relaxed">
        Something look wrong? Reply in your project channel, or{' '}
        <a href="/contact" className="text-neutral-300 underline underline-offset-4 hover:text-white">
          get in touch
        </a>{' '}
        quoting {order.ref}.
      </p>
    </div>
  );
}

export default function TrackPage() {
  const [code, setCode] = React.useState(codeFromLocation);
  const [order, setOrder] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [asked, setAsked] = React.useState(false);

  const look = React.useCallback(async (wanted) => {
    const trimmed = String(wanted || '').trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    setAsked(true);

    try {
      const response = await fetch(`${ENDPOINT}?code=${encodeURIComponent(trimmed)}`, {
        headers: { Accept: 'application/json' },
      });
      const body = await response.json().catch(() => ({}));

      if (response.ok && body.order) {
        setOrder(body.order);
      } else {
        setOrder(null);
        setError(
          response.status === 429
            ? 'That is a lot of lookups. Give it a few minutes and try again.'
            : typeof body.message === 'string' && body.message
              ? body.message
              : 'No project matches that code.',
        );
      }
    } catch {
      setOrder(null);
      setError('We could not reach the tracker. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    const fromUrl = codeFromLocation();
    if (fromUrl) look(fromUrl);
  }, [look]);

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#060608] font-sans text-white">
      <Header />

      <main
        id="main"
        tabIndex={-1}
        className="flex w-full flex-1 justify-center bg-[#060608] focus:outline-none"
      >
        <section className="relative flex w-full max-w-[1480px] flex-col border-x border-[#282832]">
          <div className="w-full max-w-[860px] mx-auto px-6 sm:px-8 py-16 sm:py-24 flex flex-col gap-10">
            <Reveal>
              <div>
                <p className="inline-flex items-center gap-2.5 text-[11px] font-semibold text-neutral-500 tracking-[0.2em] uppercase">
                  <Package className="h-3.5 w-3.5" strokeWidth={2} />
                  {STUDIO_NAME}
                </p>
                <h1 className="mt-5 text-[34px] sm:text-[44px] font-light text-white leading-[1.1]">
                  Track your project
                </h1>
                <p className="mt-4 text-[15px] text-neutral-400 font-normal leading-relaxed max-w-xl">
                  Enter the tracking code we gave you. It works for as long as the project exists —
                  including after it has been delivered or closed.
                </p>
              </div>
            </Reveal>

            <Reveal>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  look(code);
                }}
                className="flex flex-col sm:flex-row gap-3"
              >
                <label htmlFor="track-code" className="sr-only">
                  Your tracking code
                </label>
                <input
                  id="track-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="AMT-0000-0000-0000"
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck="false"
                  className="flex-1 border border-[#282832] bg-[#0a0a0d] px-4 py-3.5 font-mono text-[14px] tracking-[0.12em] text-white placeholder:text-neutral-700 focus:border-purple-500/50 focus:outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={busy || !code.trim()}
                  className="inline-flex items-center justify-center gap-2 border border-purple-500/40 bg-purple-500/15 px-6 py-3.5 text-[13px] font-semibold tracking-wide text-white hover:bg-purple-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {busy ? 'Looking…' : 'Track it'}
                  {!busy && <ArrowRight className="h-4 w-4" strokeWidth={2} />}
                </button>
              </form>
            </Reveal>

            {error && (
              <Reveal>
                <div className="border border-[#282832] bg-[#0a0a0d] px-6 py-6 flex gap-3.5">
                  <Search className="h-4 w-4 text-neutral-600 shrink-0 mt-0.5" strokeWidth={2} />
                  <div>
                    <p className="text-[14px] text-neutral-200 font-normal">{error}</p>
                    <p className="mt-1.5 text-[13px] text-neutral-500 font-normal leading-relaxed">
                      Check the code against the one we sent you. If it still will not open,{' '}
                      <a
                        href="/contact"
                        className="text-neutral-300 underline underline-offset-4 hover:text-white"
                      >
                        get in touch
                      </a>{' '}
                      and we will look it up for you.
                    </p>
                  </div>
                </div>
              </Reveal>
            )}

            {order && (
              <Reveal>
                <Result order={order} />
              </Reveal>
            )}

            {!order && !error && !asked && (
              <Reveal>
                <p className="text-[13px] text-neutral-600 font-normal leading-relaxed">
                  Do not have a code? It is in the message we sent when your project opened. Ask in
                  your project channel and we will send it again.
                </p>
              </Reveal>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
