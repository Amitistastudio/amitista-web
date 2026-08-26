import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import Reveal from '../Reveal';
import Header from '../web1/Header';
import Footer from '../web1/Footer';
import LegalAssistant from './LegalAssistant';
import { LEGAL_LAST_UPDATED, CONTACT_EMAIL } from '../../siteConfig';
import { LEGAL_GROUPS } from '../../content/legal';

export function Section({ number, title, children }) {
  return (
    <section
      id={`s${number}`}
      className="border-t border-[#1c1c22] pt-8 mb-10 grid grid-cols-1 sm:grid-cols-[52px_1fr] gap-y-3 sm:gap-x-6 scroll-mt-24"
    >
      <span className="font-tech text-[11px] text-muted select-none sm:pt-1.5 tracking-wider">
        §{number}
      </span>
      <div>
        <h2 className="text-lg sm:text-xl font-medium text-white tracking-tight mb-3">
          {title}
        </h2>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </section>
  );
}

export function P({ children }) {
  return (
    <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
      {children}
    </p>
  );
}

export function List({ children }) {
  return (
    <ul className="flex flex-col gap-2 pl-5 list-disc marker:text-muted">
      {children}
    </ul>
  );
}

export function Item({ children }) {
  return (
    <li className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
      {children}
    </li>
  );
}

function Meta({ label, children }) {
  return (
    <div className="px-5 py-4 bg-[#0a0a0d]">
      <span className="block text-[10px] font-semibold text-muted tracking-[0.2em] mb-1.5">
        {label}
      </span>
      <span className="block font-tech text-[12px] text-neutral-300 break-words">
        {children}
      </span>
    </div>
  );
}

export default function LegalLayout({ title, summary, current, updated, children }) {
  const groups = LEGAL_GROUPS.map((group) => ({
    ...group,
    pages: group.pages.filter((page) => page.href !== current),
  })).filter((group) => group.pages.length > 0);

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans relative">
      <Header />
      <main id="main" tabIndex={-1} className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none">
        <div className="w-full max-w-[1480px] border-x border-[#282832] relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[720px] paper-grid opacity-100 pointer-events-none z-0" />
          <div className="absolute inset-x-0 top-0 h-[720px] bg-gradient-to-b from-transparent via-[#060608]/60 to-[#060608] pointer-events-none z-0" />

          <div className="relative z-10 px-6 sm:px-10 md:px-16 lg:px-20 pt-20 pb-24">
            <div className="w-full max-w-3xl mx-auto">
              <a
                href="/"
                className="inline-block text-[11px] font-semibold text-muted hover:text-white tracking-[0.2em] transition-colors mb-10"
              >
                ← BACK TO SITE
              </a>

              <span className="block font-tech text-[11px] text-muted tracking-wider mb-4">
                LEGAL DOCUMENT
              </span>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-normal text-white tracking-tight leading-none mb-5">
                {title}
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal leading-relaxed mb-8 max-w-[640px]">
                {summary}
              </p>

              <Reveal
                rise
                className="grid grid-cols-1 sm:grid-cols-2 gap-[1px] bg-[#282832] border border-[#282832] mb-14"
              >
                <Meta label="LAST UPDATED">{updated ?? LEGAL_LAST_UPDATED}</Meta>
                <Meta label="QUESTIONS">
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="hover:text-white transition-colors underline underline-offset-4 decoration-[#282832]"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </Meta>
              </Reveal>

              {children}

              <LegalAssistant current={current} label={title} />

              <div className="border-t border-[#282832] mt-14 pt-10">
                <div className="flex items-baseline justify-between gap-4 mb-5">
                  <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                    OTHER DOCUMENTS
                  </span>
                  <a
                    href="/legal"
                    className="text-[11px] font-semibold text-muted hover:text-white tracking-[0.2em] transition-colors shrink-0"
                  >
                    ALL FOURTEEN, EXPLAINED →
                  </a>
                </div>
                <div className="flex flex-col gap-8">
                  {groups.map((group) => (
                    <div key={group.heading}>
                      <span className="block font-tech text-[11px] text-muted tracking-wider mb-3">
                        {group.heading}
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[1px] bg-[#282832] border border-[#282832]">
                        {group.pages.map((page, index) => (
                          <a
                            key={page.href}
                            href={page.href}
                            className={`bg-[#0a0a0d] hover:bg-[#0c0c10] transition-colors duration-300 px-5 py-5 flex items-start justify-between gap-3 group ${
                              index === group.pages.length - 1 && group.pages.length % 2 === 1
                                ? 'sm:col-span-2'
                                : ''
                            }`}
                          >
                            <span className="text-sm font-medium text-neutral-300 group-hover:text-white transition-colors leading-snug">
                              {page.label}
                            </span>
                            <ArrowUpRight
                              size={15}
                              strokeWidth={1.5}
                              className="text-muted shrink-0 mt-0.5 group-hover:text-violet-400 transition-colors duration-300"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
