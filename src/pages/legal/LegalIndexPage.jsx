import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import Reveal from '../../components/Reveal';
import Header from '../../components/web1/Header';
import Footer from '../../components/web1/Footer';
import LegalAssistant from '../../components/legal/LegalAssistant';
import { LEGAL_GROUPS, LEGAL_PAGES } from '../../content/legal';
import { LEGAL_LAST_UPDATED, CONTACT_EMAIL, STUDIO_NAME } from '../../siteConfig';

const COUNT_IN_WORDS = 'Fourteen';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

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

export default function LegalIndexPage() {
  React.useEffect(() => {
    const previous = document.title;
    document.title = `Legal — ${STUDIO_NAME}`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans relative">
      <Header />

      <main
        id="main"
        tabIndex={-1}
        className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none"
      >
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
                LEGAL INDEX
              </span>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-normal text-white tracking-tight leading-none mb-5">
                Legal
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal leading-relaxed mb-8 max-w-[640px]">
                {COUNT_IN_WORDS.toLowerCase()} documents, one line each, so you can tell
                which one answers your question without opening four of them. They are
                written in plain English and meant to be read.
              </p>

              <Reveal
                rise
                className="grid grid-cols-1 sm:grid-cols-3 gap-[1px] bg-[#282832] border border-[#282832] mb-14"
              >
                <Meta label="DOCUMENTS">{LEGAL_PAGES.length}</Meta>
                <Meta label="LAST UPDATED">{LEGAL_LAST_UPDATED}</Meta>
                <Meta label="QUESTIONS">
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="hover:text-white transition-colors underline underline-offset-4 decoration-[#282832]"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </Meta>
              </Reveal>

              <div className="flex flex-col gap-14">
                {LEGAL_GROUPS.map((group) => (
                  <section key={group.heading}>
                    <div className="border-t border-[#1c1c22] pt-8 mb-6">
                      <h2 className="text-lg sm:text-xl font-medium text-white tracking-tight mb-2">
                        {group.heading}
                      </h2>
                      <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
                        {group.blurb}
                      </p>
                    </div>

                    <div className="flex flex-col gap-[1px] bg-[#282832] border border-[#282832]">
                      {group.pages.map((page) => (
                        <a
                          key={page.href}
                          href={page.href}
                          className="bg-[#0a0a0d] hover:bg-[#0c0c10] transition-colors duration-300 px-5 py-5 grid grid-cols-1 sm:grid-cols-[52px_1fr_auto] gap-y-2 sm:gap-x-6 items-start group"
                        >
                          <span className="font-tech text-[11px] text-muted select-none sm:pt-1 tracking-wider">
                            §{String(LEGAL_PAGES.indexOf(page) + 1).padStart(2, '0')}
                          </span>
                          <span className="flex flex-col gap-1.5">
                            <span className="text-sm font-medium text-neutral-200 group-hover:text-white transition-colors leading-snug">
                              {page.label}
                            </span>
                            <span className="text-sm text-neutral-400 font-normal leading-relaxed">
                              {page.blurb}
                            </span>
                          </span>
                          <ArrowUpRight
                            size={15}
                            strokeWidth={1.5}
                            className="hidden sm:block text-muted shrink-0 mt-1 group-hover:text-violet-400 transition-colors duration-300"
                          />
                        </a>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <section className="border-t border-[#282832] mt-16 pt-10">
                <span className="block text-[11px] font-semibold text-muted tracking-[0.2em] mb-5">
                  ALL {COUNT_IN_WORDS.toUpperCase()}, IN SHORT
                </span>
                <div className="border border-[#282832] bg-[#0a0a0d] px-6 py-7 sm:px-8 sm:py-8 flex flex-col gap-4">
                  <p className="text-sm sm:text-[15px] text-neutral-300 font-normal leading-relaxed">
                    A project is quoted before it starts and invoiced as a deposit and a
                    balance, with larger ones split into agreed milestones. It is handed
                    over under one of three delivery models, which are named and described
                    rather than left to the end of the project to discover: bespoke work
                    that is transferred becomes yours on final payment, and anything
                    licensed instead of transferred says so before you pay for it.
                  </p>
                  <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
                    We collect as little as we can and sell none of it. This site sets no
                    cookies and runs no analytics. A short list of other companies can
                    touch client data, every one of them is named, and the list changes in
                    public. When we hold data on behalf of your users, we hold it on your
                    instructions and give it back or delete it when the work ends.
                  </p>
                  <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
                    There is work we will not take on and use we will not host, and both
                    are written down rather than decided case by case. When something goes
                    wrong — a security hole, a copied file, a moderation call you think is
                    wrong, a refund you think you are owed — there is a stated way to raise
                    it, an address that reaches a person, and an answer within a stated
                    time.
                  </p>
                  <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
                    None of that replaces the documents themselves: this paragraph is a
                    summary written to help you choose what to open, and where the two ever
                    differ the document is the one that counts. If you cannot tell which
                    one covers your question, write to{' '}
                    <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
                      {CONTACT_EMAIL}
                    </a>{' '}
                    and ask — that is a faster answer than reading fourteen documents to
                    find out.
                  </p>
                </div>
              </section>

              <LegalAssistant />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
