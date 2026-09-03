import React from 'react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import CtaPanel from '../components/CtaPanel';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import StageRail from '../components/web1/StageRail';
import { PRINCIPLES } from '../content/process';
import { STUDIO_NAME } from '../siteConfig';

export default function ProcessPage() {
  React.useEffect(() => {
    const previous = document.title;
    document.title = `How we work — ${STUDIO_NAME}`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />

      <main id="main" tabIndex={-1} className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none">
        <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-start text-center">
          <div className="absolute inset-x-0 top-0 h-[560px] z-0 overflow-hidden pointer-events-none">
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

          <div className="absolute inset-x-0 top-[500px] bottom-0 z-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 dot-grid opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608] via-transparent to-[#060608]" />
          </div>

          <div className="relative z-30 w-full flex flex-col items-center pt-24 pb-24 px-6 sm:px-10 md:px-16 lg:px-20">
            <Reveal rise className="w-full flex flex-col items-center">
              <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-[#222228] bg-[#111115]/50 text-xs sm:text-[13px] font-medium text-neutral-300 mb-6 select-none transition-all hover:bg-[#15151a]">
                PROCESS
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[72px] font-normal text-white tracking-tight leading-none mb-6 max-w-4xl">
                How we work
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[540px] text-center leading-relaxed mb-16 tracking-tight">
                Every project runs the same four stages, so you always know where
                yours is — and what is waiting on you rather than on us.
              </p>
            </Reveal>

            <div className="w-full max-w-5xl flex flex-col">
              <StageRail />

              <Reveal className="grid grid-cols-1 md:grid-cols-2 gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]">
                {PRINCIPLES.map((principle) => (
                  <div
                    key={principle.title}
                    className="bg-[#0a0a0d] p-8 flex flex-col justify-center text-left min-h-[220px] hover:bg-[#0c0c10] transition-colors duration-300"
                  >
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">
                      {principle.title}
                    </h2>
                    <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
                      {principle.body}
                    </p>
                  </div>
                ))}
              </Reveal>

              <Reveal className="w-full border border-[#282832] bg-[#0a0a0d] p-8 sm:p-12 flex flex-col text-left">
                <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-4">
                  What this costs
                </span>
                <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[68ch] mb-6">
                  There is no price list, because no two of these are the same
                  job. Each project is quoted on its own and agreed in writing
                  before anything starts. How payment is split, what counts as a
                  revision and what happens if you cancel are all written down.
                </p>
                <div className="flex flex-wrap gap-3">
                  {[
                    { href: '/faq', label: 'READ THE FAQ' },
                    { href: '/terms', label: 'TERMS OF SERVICE' },
                    { href: '/refund', label: 'REFUND POLICY' },
                  ].map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="inline-flex items-center gap-2 border border-[#282832] hover:border-neutral-500 text-neutral-300 hover:text-white font-semibold text-[10px] tracking-[0.2em] px-4 py-2.5 transition-all"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </Reveal>

              <Reveal className="w-full flex mt-10">
                <CtaPanel
                  title="Ready to start?"
                  body="Stage one is a message. Tell us what you need and we will come back with questions."
                  label="START A PROJECT"
                />
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
