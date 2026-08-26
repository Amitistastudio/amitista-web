import React from 'react';
import {
  Package,
  ListChecks,
  Megaphone,
  MessageCircle,
  FileText,
  HelpCircle,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import DiscordMark from '../components/DiscordMark';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import CtaPanel from '../components/CtaPanel';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { RESOURCE_GROUPS, CHECKLIST_DOCS } from '../content/resources';
import { DOC_META } from '../content/docsMeta';
import { DISCORD_INVITE, STUDIO_NAME } from '../siteConfig';

const ICONS = {
  package: Package,
  'list-checks': ListChecks,
  megaphone: Megaphone,
  'message-circle': MessageCircle,
};

const CHECKLISTS = CHECKLIST_DOCS.map((slug) =>
  DOC_META.find((page) => page.slug === slug),
).filter(Boolean);

export default function ResourcesPage() {
  React.useEffect(() => {
    const previous = document.title;
    document.title = `Resources — ${STUDIO_NAME}`;
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
                RESOURCES
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[72px] font-normal text-white tracking-tight leading-none mb-6 max-w-4xl">
                It's all in the
                <br />
                Discord
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[540px] text-center leading-relaxed mb-16 tracking-tight">
                There is nothing to download from this page, and that is on
                purpose. Everything we give away lives in the server, where it
                gets updated and where you can ask about it. A copy sitting here
                would be out of date by the time you found it.
              </p>
            </Reveal>

            <div className="w-full max-w-5xl flex flex-col">
              {DISCORD_INVITE ? (
                <Reveal className="w-full flex">
                  <a
                    href={DISCORD_INVITE}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="relative w-full border border-[#282832] bg-[#0a0a0d] overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-8 py-12 group cursor-pointer"
                  >
                    <Silk
                      color="#8864f2"
                      speed={4.5}
                      scale={1.4}
                      noiseIntensity={1.4}
                      rotation={-0.2}
                      fadeEdge={true}
                      className="absolute inset-0 w-full h-full z-0 opacity-60 group-hover:opacity-90 transition-opacity duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#060608] via-[#060608]/85 to-[#060608]/45 z-1 pointer-events-none" />

                    <div className="relative z-10 text-left">
                      <h2 className="text-2xl sm:text-3xl font-medium text-white tracking-tight mb-2">
                        Join the server
                      </h2>
                      <p className="text-sm text-neutral-300 font-normal leading-relaxed max-w-[420px]">
                        Free, open to anyone, and you do not have to be a client.
                        Everything below is in there.
                      </p>
                    </div>

                    <span className="relative z-10 inline-flex items-center gap-3 border border-white bg-transparent group-hover:bg-white group-hover:text-black text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all shrink-0 self-start sm:self-auto">
                      <DiscordMark size={15} className="shrink-0" />
                      OPEN DISCORD
                      <ArrowUpRight size={14} strokeWidth={2} />
                    </span>
                  </a>
                </Reveal>
              ) : (
                <Reveal className="w-full border border-[#282832] bg-[#0a0a0d] p-8 sm:p-12 flex flex-col text-left">
                  <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-4">
                    The server
                  </span>
                  <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[68ch]">
                    The invite link is not up yet. Write to us in the meantime and
                    we will send it to you directly.
                  </p>
                </Reveal>
              )}

              <Reveal
                delay={80}
                className="grid grid-cols-1 sm:grid-cols-2 gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832] mt-10"
              >
                {RESOURCE_GROUPS.map((group) => {
                  const Icon = ICONS[group.icon] ?? Sparkles;

                  return (
                    <div
                      key={group.title}
                      className="bg-[#0a0a0d] p-8 flex flex-col text-left min-h-[220px] hover:bg-[#0c0c10] transition-colors duration-300"
                    >
                      <span className="flex items-center justify-between gap-4 mb-6">
                        <Icon
                          size={22}
                          strokeWidth={1.5}
                          className="text-muted shrink-0"
                        />
                        {group.channel && (
                          <span className="text-[11px] font-medium text-muted tracking-[0.15em] truncate">
                            #{group.channel}
                          </span>
                        )}
                      </span>
                      <h3 className="text-lg sm:text-xl font-medium text-white tracking-tight mb-3">
                        {group.title}
                      </h3>
                      <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
                        {group.body}
                      </p>
                    </div>
                  );
                })}
              </Reveal>

              {CHECKLISTS.length > 0 && (
                <>
                  <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center justify-between gap-4">
                    <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                      THE CHECKLISTS, IN FULL
                    </span>
                    <span className="text-[11px] font-medium text-muted tracking-[0.15em] shrink-0">
                      NO SERVER NEEDED
                    </span>
                  </Reveal>

                  <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] p-8 sm:p-12 flex flex-col text-left">
                    <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[68ch]">
                      The passes we run before a project is handed over, written
                      out on this site. They are aimed at a client looking after
                      a build of ours, but nothing in them is specific to us —
                      read them against whatever you already have running.
                    </p>
                  </Reveal>

                  <Reveal className="grid grid-cols-1 sm:grid-cols-2 gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]">
                    {CHECKLISTS.map((page, index) => (
                      <a
                        key={page.slug}
                        href={`/docs/${page.slug}`}
                        className="bg-[#0a0a0d] p-8 flex flex-col text-left hover:bg-[#0c0c10] transition-colors duration-300 group/doc"
                      >
                        <span className="flex items-center justify-between gap-4 mb-4">
                          <span className="text-[11px] font-semibold text-muted tracking-[0.2em] select-none">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <ArrowUpRight
                            size={14}
                            strokeWidth={2}
                            className="text-muted shrink-0 group-hover/doc:text-violet-400 group-hover/doc:translate-x-0.5 group-hover/doc:-translate-y-0.5 transition-all duration-300"
                          />
                        </span>
                        <span className="block text-lg font-medium text-white tracking-tight mb-2">
                          {page.title}
                        </span>
                        <span className="block text-sm text-neutral-400 font-normal leading-relaxed">
                          {page.description}
                        </span>
                      </a>
                    ))}
                  </Reveal>
                </>
              )}

              <Reveal className="grid grid-cols-1 sm:grid-cols-2 gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]">
                <a
                  href="/docs"
                  className="bg-[#0a0a0d] p-8 flex items-center gap-4 text-left hover:bg-[#0c0c10] transition-colors duration-300 group/link"
                >
                  <FileText
                    size={18}
                    strokeWidth={1.5}
                    className="text-muted shrink-0 group-hover/link:text-violet-400 transition-colors"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-white tracking-tight mb-1">
                      Documentation
                    </span>
                    <span className="block text-[13px] text-neutral-400 leading-relaxed">
                      Handover, deployment, DNS, security and maintenance — on
                      this site, no server needed.
                    </span>
                  </span>
                  <ArrowUpRight
                    size={14}
                    strokeWidth={2}
                    className="text-muted shrink-0 group-hover/link:text-violet-400 transition-colors"
                  />
                </a>
                <a
                  href="/faq"
                  className="bg-[#0a0a0d] p-8 flex items-center gap-4 text-left hover:bg-[#0c0c10] transition-colors duration-300 group/link"
                >
                  <HelpCircle
                    size={18}
                    strokeWidth={1.5}
                    className="text-muted shrink-0 group-hover/link:text-violet-400 transition-colors"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-white tracking-tight mb-1">
                      FAQ
                    </span>
                    <span className="block text-[13px] text-neutral-400 leading-relaxed">
                      Cost, scope, timelines and who owns the result once it is
                      finished.
                    </span>
                  </span>
                  <ArrowUpRight
                    size={14}
                    strokeWidth={2}
                    className="text-muted shrink-0 group-hover/link:text-violet-400 transition-colors"
                  />
                </a>
              </Reveal>

              <Reveal className="w-full flex mt-10">
                <CtaPanel
                  title="Want us to build the thing instead?"
                  body="The server is for the bits we give away. Everything else starts with a message."
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
