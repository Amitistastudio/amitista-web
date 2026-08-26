import React from 'react';
import { ShieldOff, Copy, UserX, Banknote, FileWarning, Ghost, Wrench, Clock, Bot, X, Minus } from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import CtaPanel from '../components/CtaPanel';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { DECLINES, PREAMBLE, HARD_INTRO, CLOSING } from '../content/declines';
import { STUDIO_NAME } from '../siteConfig';

const ICONS = {
  copy: Copy,
  'user-x': UserX,
  banknote: Banknote,
  'file-warning': FileWarning,
  ghost: Ghost,
  wrench: Wrench,
  clock: Clock,
  bot: Bot,
};

export default function DeclinesPage() {
  React.useEffect(() => {
    const previous = document.title;
    document.title = `What we don't take on — ${STUDIO_NAME}`;
    return () => {
      document.title = previous;
    };
  }, []);

  const hard = DECLINES.filter((item) => item.hard);
  const soft = DECLINES.filter((item) => !item.hard);

  const renderGroup = (items, offset) =>
    items.map((item, index) => {
      const Icon = ICONS[item.icon] ?? ShieldOff;
      return (
        <Reveal
          key={item.title}
          delay={index * 50}
          className="border-t border-[#282832] py-8 grid grid-cols-1 sm:grid-cols-[44px_1fr] gap-y-4 sm:gap-x-6"
        >
          <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2">
            <Icon
              size={20}
              strokeWidth={1.5}
              className={item.hard ? 'text-red-400/70' : 'text-muted'}
            />
            <span className="font-tech text-[11px] text-neutral-700 select-none">
              {String(offset + index + 1).padStart(2, '0')}
            </span>
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-medium text-white tracking-tight mb-3 leading-snug">
              {item.title}
            </h3>
            <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[640px]">
              {item.body}
            </p>
          </div>
        </Reveal>
      );
    });

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />

      <main id="main" tabIndex={-1} className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none">
        <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-start text-left overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[520px] z-0 pointer-events-none">
            <Silk
              color="#8864f2"
              speed={4.5}
              scale={1.5}
              noiseIntensity={1.4}
              rotation={-0.2}
              fadeEdge={true}
              className="absolute inset-0 w-full h-full opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608]/40 via-[#060608]/80 to-[#060608]" />
          </div>

          <div className="relative z-30 w-full flex flex-col items-center pt-24 pb-24 px-6 sm:px-10 md:px-16 lg:px-20">
            <Reveal rise className="w-full max-w-3xl flex flex-col items-start mb-16">
              <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-[#222228] bg-[#111115]/50 text-xs sm:text-[13px] font-medium text-neutral-300 mb-6 select-none transition-all hover:bg-[#15151a]">
                BEFORE YOU ASK
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[68px] font-normal text-white tracking-tight leading-[0.95] mb-6">
                What we
                <br />
                don&rsquo;t take on
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[560px] leading-relaxed tracking-tight">
                {PREAMBLE}
              </p>
            </Reveal>

            <div className="w-full max-w-3xl">
              <Reveal className="flex items-center gap-3 mb-2">
                <X size={14} strokeWidth={2.5} className="text-red-400/70" />
                <h2 className="text-[11px] font-semibold text-neutral-400 tracking-[0.2em]">
                  NOT AT ANY PRICE
                </h2>
              </Reveal>
              <p className="text-sm text-muted font-normal leading-relaxed mb-2 max-w-[600px]">
                {HARD_INTRO}
              </p>
              {renderGroup(hard, 0)}

              <Reveal className="flex items-center gap-3 mt-16 mb-2">
                <Minus size={14} strokeWidth={2.5} className="text-muted" />
                <h2 className="text-[11px] font-semibold text-neutral-400 tracking-[0.2em]">
                  NOT HOW WE WORK
                </h2>
              </Reveal>
              <p className="text-sm text-muted font-normal leading-relaxed mb-2 max-w-[600px]">
                These are mostly arrangements rather than subjects. If yours is unusual, it
                is worth a conversation rather than an assumption.
              </p>
              {renderGroup(soft, hard.length)}

              <Reveal className="border-t border-[#282832] pt-8 mt-8">
                <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[640px]">
                  {CLOSING}
                </p>
              </Reveal>

              <div className="mt-14">
                <CtaPanel
                  title="Still sounds like us?"
                  body="Then tell us what you are building. Almost nothing is on that list."
                  label="START A PROJECT"
                  href="/contact"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
