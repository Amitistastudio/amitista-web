import React from 'react';
import { Server, Globe, PenTool, Code2, ArrowUpRight } from 'lucide-react';
import Reveal from '../Reveal';
import WorkGrid from './WorkGrid';
import { SERVICES } from '../../content/services';

const ICONS = {
  globe: Globe,
  server: Server,
  'pen-tool': PenTool,
};

export default function OverviewSection() {
  return (
    <div id="services" className="w-full bg-[#060608] scroll-mt-20">
      <div className="w-full flex justify-center bg-[#060608]">
        <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-start text-center overflow-hidden">
          <div className="relative z-30 w-full flex flex-col items-center pt-24 pb-12 px-6 sm:px-10 md:px-16 lg:px-20">
            <Reveal rise className="w-full flex flex-col items-center">
            <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-[#222228] bg-[#111115]/50 text-xs sm:text-[13px] font-medium text-neutral-300 mb-6 select-none transition-all hover:bg-[#15151a]">
              SERVICES
            </div>
            <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-[72px] font-normal text-white tracking-tight leading-none mb-6 max-w-4xl">
              What we build
            </h2>
            <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[540px] text-center leading-relaxed mb-16 tracking-tight">
              Most projects land in one of these three. If yours sits somewhere in
              between, ask us anyway and we'll tell you straight if we're the right fit.
            </p>
            </Reveal>
            <Reveal rise className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mb-8">
              {SERVICES.map((service) => {
                const Icon = ICONS[service.icon] ?? Code2;

                return (
                  <a
                    key={service.slug}
                    href={`/services#${service.slug}`}
                    className="flex flex-col justify-center items-center text-center py-10 px-6 bg-[#0a0a0d] border border-[#282832] rounded-none hover:border-neutral-700 hover:bg-[#0c0c10] transition-all duration-300 group"
                  >
                    <Icon
                      size={30}
                      strokeWidth={1.5}
                      className="text-muted mb-6 group-hover:text-violet-400 group-hover:scale-105 transition-all duration-300"
                    />
                    <h3 className="text-lg sm:text-xl font-medium text-white tracking-tight mb-2">
                      {service.name}
                    </h3>
                    <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[240px]">
                      {service.blurb}
                    </p>
                  </a>
                );
              })}
            </Reveal>

            <Reveal className="mb-20">
              <a
                href="/services"
                className="inline-flex items-center gap-2 text-[11px] font-semibold text-neutral-400 hover:text-white tracking-[0.2em] transition-colors group/all"
              >
                <span className="underline underline-offset-4 decoration-[#282832] group-hover/all:decoration-neutral-500">
                  WHAT EACH OF THESE INVOLVES
                </span>
                <ArrowUpRight
                  size={12}
                  strokeWidth={2}
                  className="group-hover/all:text-violet-400 transition-colors"
                />
              </a>
            </Reveal>
            <Reveal rise className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-[#222228] bg-[#111115]/50 text-xs sm:text-[13px] font-medium text-neutral-300 mb-10 select-none transition-all hover:bg-[#15151a]">
              SELECTED WORK
            </Reveal>
          </div>
          <WorkGrid id="work" />
        </section>
      </div>
    </div>
  );
}
