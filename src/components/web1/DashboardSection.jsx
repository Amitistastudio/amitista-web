import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import Reveal from '../Reveal';
import { STAGES, PRINCIPLES } from '../../content/process';

export default function DashboardSection() {
  return (
    <div id="studio" className="w-full flex justify-center bg-[#060608] border-t border-[#222228] scroll-mt-20">
      <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-start text-center overflow-hidden">
        <div className="relative z-30 w-full flex flex-col items-center pt-24 pb-24 px-6 sm:px-10 md:px-16 lg:px-20">
          <Reveal
            rise
            className="w-full max-w-5xl flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-12"
          >
            <div className="flex flex-col items-start text-left">
              <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-[72px] font-normal text-white tracking-tight leading-none">
                How we <br />
                work
              </h2>
            </div>
            <div className="flex flex-col items-start md:items-end text-left md:text-right max-w-xs text-neutral-400 text-sm sm:text-[15px] font-normal leading-relaxed gap-3">
              Every project runs the same four stages, so you always know where yours is.
              <a
                href="/process"
                className="inline-flex items-center gap-2 text-[11px] font-semibold text-neutral-400 hover:text-white tracking-[0.2em] transition-colors group/all"
              >
                <span className="underline underline-offset-4 decoration-[#282832] group-hover/all:decoration-neutral-500">
                  WHAT EACH STAGE INVOLVES
                </span>
                <ArrowUpRight
                  size={12}
                  strokeWidth={2}
                  className="group-hover/all:text-violet-400 transition-colors"
                />
              </a>
            </div>
          </Reveal>
          <div className="w-full max-w-5xl flex flex-col">
            <Reveal className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]">
              {STAGES.map((stage, stageIndex) => (
                <div
                  key={stage.step}
                  className="bg-[#0a0a0d] p-8 flex flex-col justify-start text-left min-h-[220px]"
                >
                  <div className="flex gap-1.5 mb-8 select-none">
                    {STAGES.map((_, tickIndex) => (
                      <span
                        key={tickIndex}
                        className={`w-3 h-0.5 rounded-sm ${
                          tickIndex === stageIndex ? 'bg-indigo-500' : 'bg-[#282832]'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-5xl font-light text-white tracking-tight mb-1">
                    {stage.step}
                  </span>
                  <span className="text-sm font-medium text-white tracking-tight mb-3">
                    {stage.title}
                  </span>
                  <span className="text-xs sm:text-[13px] text-neutral-400 font-normal leading-relaxed">
                    {stage.blurb}
                  </span>
                </div>
              ))}
            </Reveal>
            <Reveal delay={80} className="grid grid-cols-1 md:grid-cols-2 gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]">
              {PRINCIPLES.map((principle) => (
                <div
                  key={principle.title}
                  className="bg-[#0a0a0d] p-8 flex flex-col justify-center text-left min-h-[260px]"
                >
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-4">
                    {principle.title}
                  </h3>
                  <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
                    {principle.body}
                  </p>
                </div>
              ))}
            </Reveal>
            <Reveal className="w-full flex">
            <a href="/contact" className="w-full border border-[#282832] bg-[#0a0a0d] flex items-center justify-between h-16 px-8 hover:bg-[#0c0c10] transition-colors duration-300 group cursor-pointer">
              <span className="text-sm font-bold text-white tracking-wider">
                Start a project
              </span>
              <div className="w-8 h-8 rounded-none border border-[#282832] flex items-center justify-center bg-[#111115]/50 group-hover:border-neutral-600 transition-all duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors duration-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                </svg>
              </div>
            </a>
            </Reveal>
          </div>
        </div>
      </section>
    </div>
  );
}
