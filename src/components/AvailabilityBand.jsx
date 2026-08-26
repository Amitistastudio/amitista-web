import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { AVAILABILITY } from '../siteConfig';

const STATES = {
  open: {
    dot: 'bg-emerald-400',
    label: 'Available for new projects',
    lead: 'Booking into',
    cta: 'START A PROJECT',
  },
  limited: {
    dot: 'bg-amber-400',
    label: 'Limited availability',
    lead: 'Next opening',
    cta: 'CHECK WITH US',
  },
  closed: {
    dot: 'bg-neutral-500',
    label: 'Not taking on new projects right now',
    lead: 'Booking again from',
    cta: 'ASK ANYWAY',
  },
};

export default function AvailabilityBand() {
  const state = STATES[AVAILABILITY.state] ?? STATES.open;
  const period = AVAILABILITY.period?.trim();

  return (
    <div className="w-full flex justify-center bg-[#060608] border-t border-[#222228]">
      <div className="w-full max-w-[1480px] border-x border-[#282832] px-6 sm:px-10 md:px-16 lg:px-20 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span
              className={`motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${state.dot}`}
            />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${state.dot}`} />
          </span>
          <span className="text-[11px] sm:text-xs font-semibold text-white tracking-[0.16em] uppercase">
            {state.label}
          </span>
          {period && (
            <>
              <span aria-hidden="true" className="text-neutral-700 select-none">
                /
              </span>
              <span className="text-[11px] sm:text-xs font-medium text-neutral-400 tracking-[0.16em] uppercase truncate">
                {state.lead} {period}
              </span>
            </>
          )}
        </div>

        <a
          href="/contact"
          className="inline-flex items-center gap-2 text-[10px] sm:text-[11px] font-semibold text-neutral-400 hover:text-white tracking-[0.2em] transition-colors group/avail shrink-0"
        >
          <span className="underline underline-offset-4 decoration-[#282832] group-hover/avail:decoration-neutral-500">
            {state.cta}
          </span>
          <ArrowUpRight
            size={12}
            strokeWidth={2}
            className="group-hover/avail:text-violet-400 transition-colors"
          />
        </a>
      </div>
    </div>
  );
}
