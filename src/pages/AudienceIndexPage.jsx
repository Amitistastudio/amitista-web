import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import CtaPanel from '../components/CtaPanel';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { AUDIENCES } from '../content/audiences';
import { AUDIENCE_ICONS } from './AudiencePage';
import { STUDIO_NAME } from '../siteConfig';

export default function AudienceIndexPage() {
  React.useEffect(() => {
    const previous = document.title;
    document.title = `Who we build for — ${STUDIO_NAME}`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />

      <main id="main" tabIndex={-1} className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none">
        <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-start text-center overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[520px] z-0 pointer-events-none">
            <Silk
              color="#8864f2"
              speed={4.5}
              scale={1.6}
              noiseIntensity={1.4}
              rotation={0.2}
              fadeEdge={true}
              className="absolute inset-0 w-full h-full opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608]/40 via-[#060608]/80 to-[#060608]" />
          </div>

          <div className="relative z-30 w-full flex flex-col items-center pt-24 pb-24 px-6 sm:px-10 md:px-16 lg:px-20">
            <Reveal rise className="w-full max-w-3xl flex flex-col items-center mb-14">
              <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-[#222228] bg-[#111115]/50 text-xs sm:text-[13px] font-medium text-neutral-300 mb-6 select-none">
                WHO WE BUILD FOR
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[68px] font-normal text-white tracking-tight leading-[0.95] mb-6">
                Start from
                <br />
                where you are
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[520px] leading-relaxed tracking-tight">
                The same work described three ways, because the problem you turned up with
                is a better place to start than a list of what we can do.
              </p>
            </Reveal>

            <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-[1px] bg-[#282832] border border-[#282832]">
              {AUDIENCES.map((audience, index) => {
                const Icon = AUDIENCE_ICONS[audience.icon];
                return (
                  <Reveal key={audience.slug} delay={index * 60}>
                    <a
                      href={`/for/${audience.slug}`}
                      className="bg-[#0a0a0d] hover:bg-[#0c0c10] transition-colors duration-300 p-8 flex flex-col text-left h-full group min-h-[280px]"
                    >
                      <div className="flex items-center justify-between mb-6">
                        {Icon && (
                          <Icon
                            size={24}
                            strokeWidth={1.5}
                            className="text-muted group-hover:text-violet-400 group-hover:scale-105 transition-all duration-300"
                          />
                        )}
                        <ArrowUpRight
                          size={16}
                          strokeWidth={1.5}
                          className="text-neutral-700 group-hover:text-violet-400 transition-colors duration-300"
                        />
                      </div>
                      <h2 className="text-lg sm:text-xl font-medium text-white tracking-tight mb-3 leading-snug">
                        {audience.label}
                      </h2>
                      <p className="text-sm text-neutral-400 font-normal leading-relaxed">
                        {audience.title}
                      </p>
                    </a>
                  </Reveal>
                );
              })}
            </div>

            <div className="w-full max-w-4xl mt-10">
              <CtaPanel
                title="None of the three?"
                body="Most projects are not on a list. Tell us what yours is."
                label="START A PROJECT"
                href="/contact"
              />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
