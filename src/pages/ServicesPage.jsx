import React from 'react';
import { Globe, Server, PenTool, Check, Code2 } from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import CtaPanel from '../components/CtaPanel';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { SERVICES } from '../content/services';
import { STUDIO_NAME } from '../siteConfig';

const ICONS = {
  globe: Globe,
  server: Server,
  'pen-tool': PenTool,
};

function ListBlock({ label, items }) {
  return (
    <div className="bg-[#0a0a0d] p-8 flex flex-col text-left hover:bg-[#0c0c10] transition-colors duration-300">
      <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-6">
        {label}
      </span>
      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <Check size={14} strokeWidth={2} className="text-violet-400 mt-1 shrink-0" />
            <span className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
              {item}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ServicesPage() {
  React.useEffect(() => {
    const previous = document.title;
    document.title = `Services — ${STUDIO_NAME}`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />

      <main id="main" tabIndex={-1} className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none">
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
                SERVICES
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[72px] font-normal text-white tracking-tight leading-none mb-6 max-w-4xl">
                What we build
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[540px] text-center leading-relaxed mb-16 tracking-tight">
                Three things, and the detail underneath each of them. If your
                project sits somewhere between two of these, ask anyway — we will
                tell you straight if we are not the right fit.
              </p>
            </Reveal>

            <div className="w-full max-w-5xl flex flex-col">
              {SERVICES.map((service, index) => {
                const Icon = ICONS[service.icon] ?? Code2;

                return (
                  <React.Fragment key={service.slug}>
                    <Reveal
                      id={service.slug}
                      className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center justify-between gap-4 scroll-mt-20"
                    >
                      <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                        {String(index + 1).padStart(2, '0')} — {service.name.toUpperCase()}
                      </span>
                      <Icon size={16} strokeWidth={1.5} className="text-muted shrink-0" />
                    </Reveal>

                    <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] p-8 sm:p-12 flex flex-col text-left">
                      <h2 className="text-2xl sm:text-3xl font-medium text-white tracking-tight mb-4">
                        {service.name}
                      </h2>
                      <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[68ch]">
                        {service.summary}
                      </p>
                    </Reveal>

                    <Reveal className="grid grid-cols-1 sm:grid-cols-2 gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]">
                      <ListBlock label="What it covers" items={service.includes} />
                      <ListBlock label="What you end up with" items={service.delivers} />
                    </Reveal>
                  </React.Fragment>
                );
              })}

              <Reveal className="w-full flex mt-10">
                <CtaPanel
                  title="Not sure which of these it is?"
                  body="Describe the problem rather than the solution and we will tell you what it needs."
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
