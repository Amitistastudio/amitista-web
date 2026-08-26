import React from 'react';
import { Plus, ArrowUpRight, Mail } from 'lucide-react';
import Reveal from '../components/Reveal';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { FAQ } from '../content/faq';
import { CONTACT_EMAIL } from '../siteConfig';

function FaqItem({ item }) {
  return (
    <details className="group border-t border-[#1c1c22] first:border-t-0 open:bg-[#0c0c10] transition-colors duration-300">
      <summary className="flex items-start justify-between gap-6 px-6 sm:px-8 py-6 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-[#0c0c10] transition-colors duration-300">
        <span className="text-[15px] sm:text-base font-medium text-white tracking-tight leading-snug">
          {item.q}
        </span>
        <Plus
          size={18}
          strokeWidth={1.5}
          className="text-muted shrink-0 mt-0.5 transition-transform duration-300 group-open:rotate-45 group-open:text-violet-400"
        />
      </summary>

      <div className="px-6 sm:px-8 pb-7 max-w-[620px]">
        <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
          {item.a}
        </p>
        {item.more && (
          <a
            href={item.more.href}
            className="inline-flex items-center gap-2 mt-5 text-[11px] font-semibold text-muted hover:text-white tracking-[0.18em] transition-colors group/more"
          >
            {item.more.label}
            <ArrowUpRight
              size={13}
              strokeWidth={2}
              className="text-muted group-hover/more:text-violet-400 transition-colors"
            />
          </a>
        )}
      </div>
    </details>
  );
}

export default function FaqPage() {
  const total = FAQ.reduce((count, group) => count + group.questions.length, 0);

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />

      <main id="main" tabIndex={-1} className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none">
        <section className="w-full max-w-[1480px] border-x border-[#282832] relative overflow-hidden">
          <div className="absolute inset-0 z-0 pointer-events-none">
            <div className="absolute inset-0 dot-grid opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608] via-transparent to-[#060608]" />
          </div>

          <div className="relative z-10 w-full flex flex-col items-center pt-24 pb-24 px-6 sm:px-10 md:px-16 lg:px-20">
            <div className="w-full max-w-5xl">
              <Reveal rise className="flex flex-col items-start mb-12">
                <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-[#222228] bg-[#111115]/50 text-xs sm:text-[13px] font-medium text-neutral-300 mb-6 select-none transition-all hover:bg-[#15151a]">
                  FAQ
                </div>
                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[68px] font-normal text-white tracking-tight leading-[0.95] mb-6">
                  Questions,
                  <br />
                  answered
                </h1>
                <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[520px] leading-relaxed tracking-tight">
                  The {total} things people ask before they hire us — what it costs,
                  who owns the result, and what happens once it is live. If yours is
                  not here, ask us directly.
                </p>
              </Reveal>

              <Reveal className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-[1px] bg-[#282832] w-full border border-[#282832]">
                <div className="bg-[#0a0a0d]">
                  <nav className="lg:sticky lg:top-24 p-6 sm:p-8 flex flex-col">
                    <span className="text-[11px] font-semibold text-muted tracking-[0.2em] mb-5">
                      CONTENTS
                    </span>
                    <ul className="flex flex-col gap-3">
                      {FAQ.map((group) => (
                        <li key={group.id}>
                          <a
                            href={`#${group.id}`}
                            className="flex items-baseline justify-between gap-3 text-[13px] text-neutral-400 hover:text-white transition-colors tracking-tight"
                          >
                            {group.label}
                            <span className="font-tech text-[11px] text-muted shrink-0">
                              {String(group.questions.length).padStart(2, '0')}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                </div>

                <div className="bg-[#0a0a0d]">
                  {FAQ.map((group) => (
                    <section
                      key={group.id}
                      id={group.id}
                      className="scroll-mt-24 border-b border-[#282832] last:border-b-0"
                    >
                      <h2 className="px-6 sm:px-8 pt-8 pb-5 text-[11px] font-semibold text-muted tracking-[0.2em]">
                        {group.label}
                      </h2>
                      {group.questions.map((item) => (
                        <FaqItem key={item.q} item={item} />
                      ))}
                    </section>
                  ))}
                </div>
              </Reveal>

              <Reveal className="w-full flex mt-10">
                <div className="w-full border border-[#282832] bg-[#0a0a0d] hover:bg-[#0c0c10] transition-colors duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-6 sm:px-8 py-10">
                  <div className="text-left">
                    <h3 className="text-xl sm:text-2xl font-medium text-white tracking-tight mb-2">
                      Still not answered
                    </h3>
                    <p className="text-sm text-neutral-400 font-normal leading-relaxed max-w-[420px]">
                      Ask us the awkward one. We would rather tell you we are the
                      wrong fit than find out three weeks in.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <a
                      href="/contact"
                      className="inline-flex items-center gap-3 border border-white bg-transparent hover:bg-white hover:text-black text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer"
                    >
                      ASK A QUESTION
                    </a>
                    <a
                      href={`mailto:${CONTACT_EMAIL}`}
                      className="inline-flex items-center gap-2 border border-[#282832] hover:border-neutral-500 text-neutral-300 hover:text-white font-semibold text-[11px] tracking-[0.2em] px-5 py-3 transition-all cursor-pointer"
                    >
                      <Mail size={14} strokeWidth={1.5} />
                      EMAIL
                    </a>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
