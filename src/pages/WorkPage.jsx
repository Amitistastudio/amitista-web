import React from 'react';
import { ArrowUpRight, Layers, GitBranch } from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import CtaPanel from '../components/CtaPanel';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import WorkGrid from '../components/web1/WorkGrid';
import { PROJECTS, TOOLS_USED } from '../content/projects';
import { STUDIO_NAME } from '../siteConfig';

const NEXT_PAGES = [
  {
    href: '/services',
    icon: Layers,
    title: 'Websites, products & systems',
    body: 'The three kinds of work we take on, and what each one covers.',
  },
  {
    href: '/process',
    icon: GitBranch,
    title: 'How a project runs',
    body: 'The four stages between a first message and a finished handover.',
  },
];

export default function WorkPage() {
  React.useEffect(() => {
    const previous = document.title;
    document.title = `Work — ${STUDIO_NAME}`;
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

          <div className="relative z-30 w-full flex flex-col items-center pt-24 pb-12 px-6 sm:px-10 md:px-16 lg:px-20">
            <Reveal rise className="w-full flex flex-col items-center">
              <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-[#222228] bg-[#111115]/50 text-xs sm:text-[13px] font-medium text-neutral-300 mb-6 select-none transition-all hover:bg-[#15151a]">
                WORK
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[72px] font-normal text-white tracking-tight leading-none mb-6 max-w-4xl">
                What we have built
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[540px] text-center leading-relaxed mb-16 tracking-tight">
                Things that are live and that you can go and use, rather than
                concepts. Open one to read what it is and which part of it was
                ours.
              </p>
            </Reveal>
          </div>

          <WorkGrid aboveTheFold />

          {PROJECTS.length > 0 && (
            <div className="relative z-30 w-full flex flex-col items-center pb-24 px-6 sm:px-10 md:px-16 lg:px-20">
              <div className="w-full max-w-5xl flex flex-col">
                <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center justify-between gap-4">
                  <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                    WHAT IS ON THIS LIST
                  </span>
                  <span className="text-[11px] font-medium text-muted tracking-[0.15em] shrink-0">
                    {String(PROJECTS.length).padStart(2, '0')}{' '}
                    {PROJECTS.length === 1 ? 'PROJECT' : 'PROJECTS'}
                  </span>
                </Reveal>

                <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] p-8 sm:p-12 flex flex-col text-left gap-5">
                  <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[68ch]">
                    Short on purpose. A project only goes up here once it is
                    live and somebody outside the studio is using it, which
                    rules out the concepts, the half-finished rebuilds and the
                    work we are not allowed to name.
                  </p>
                  <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[68ch]">
                    Not all of it is ours. Some of it belongs to the people who
                    hired us and we built part of it, which is the normal case
                    for studio work and not something worth blurring. The table
                    below says which is which before you open anything.
                  </p>
                </Reveal>

                <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center">
                  <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                    WHOSE PRODUCT IT IS
                  </span>
                </Reveal>

                <Reveal className="w-full border-t border-x border-[#282832] flex flex-col">
                  {PROJECTS.map((project, index) => (
                    <a
                      key={project.slug}
                      href={`/work/${project.slug}`}
                      className={`bg-[#0a0a0d] px-8 py-7 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8 text-left hover:bg-[#0c0c10] transition-colors duration-300 group/row ${
                        index > 0 ? 'border-t border-[#282832]' : ''
                      }`}
                    >
                      <span className="text-[11px] font-semibold text-muted tracking-[0.2em] shrink-0 select-none">
                        {String(index + 1).padStart(3, '0')}
                      </span>

                      <span className="sm:w-44 shrink-0">
                        <span className="block text-base font-medium text-white tracking-tight">
                          {project.name}
                        </span>
                        {project.period && (
                          <span className="block text-[11px] text-muted tracking-[0.15em] mt-1">
                            {project.period.toUpperCase()}
                          </span>
                        )}
                      </span>

                      <span className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 min-w-0">
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-1.5">
                            Belongs to
                          </span>
                          <span className="block text-sm text-neutral-300 font-normal leading-relaxed">
                            {project.owner}
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-1.5">
                            Our part
                          </span>
                          <span className="block text-sm text-neutral-300 font-normal leading-relaxed">
                            {project.role}
                          </span>
                        </span>
                      </span>

                      <ArrowUpRight
                        size={14}
                        strokeWidth={2}
                        className="text-muted shrink-0 self-start sm:self-center group-hover/row:text-violet-400 group-hover/row:translate-x-0.5 group-hover/row:-translate-y-0.5 transition-all duration-300"
                      />
                    </a>
                  ))}
                </Reveal>

                <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] p-8 sm:p-12 flex flex-col text-left">
                  <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-4">
                    Built with
                  </span>
                  <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[68ch] mb-6">
                    Everything above, taken together. Which project used what is
                    on its own page — this is the whole set rather than a list
                    of things we would be willing to try.
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {TOOLS_USED.map((tool) => (
                      <li
                        key={tool}
                        className="border border-[#222228] bg-[#111115]/50 px-2.5 py-1 text-[11px] font-medium text-neutral-400"
                      >
                        {tool}
                      </li>
                    ))}
                  </ul>
                </Reveal>

                <Reveal className="grid grid-cols-1 sm:grid-cols-2 gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]">
                  {NEXT_PAGES.map((page) => (
                    <a
                      key={page.href}
                      href={page.href}
                      className="bg-[#0a0a0d] p-8 flex items-center gap-4 text-left hover:bg-[#0c0c10] transition-colors duration-300 group/link"
                    >
                      <page.icon
                        size={18}
                        strokeWidth={1.5}
                        className="text-muted shrink-0 group-hover/link:text-violet-400 transition-colors"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-white tracking-tight mb-1">
                          {page.title}
                        </span>
                        <span className="block text-[13px] text-neutral-400 leading-relaxed">
                          {page.body}
                        </span>
                      </span>
                      <ArrowUpRight
                        size={14}
                        strokeWidth={2}
                        className="text-muted shrink-0 group-hover/link:text-violet-400 transition-colors"
                      />
                    </a>
                  ))}
                </Reveal>

                <Reveal className="w-full flex mt-10">
                  <CtaPanel
                    title="Want yours on this page?"
                    body="Tell us what it needs to do. If it is not something we should be building, we will say so."
                    label="START A PROJECT"
                  />
                </Reveal>
              </div>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
