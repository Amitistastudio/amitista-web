import React from 'react';
import { ArrowLeft, Check, Globe } from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import OutboundLink from '../components/OutboundLink';
import ResponsiveImage from '../components/ResponsiveImage';
import VideoEmbed from '../components/VideoEmbed';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { STUDIO_NAME } from '../siteConfig';

function siteLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const DEFAULT_ACCENT = '#8864f2';

export default function ProjectPage({ project }) {
  const accent = project.accent || DEFAULT_ACCENT;

  React.useEffect(() => {
    const previous = document.title;
    document.title = `${project.name} — ${STUDIO_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [project.name]);

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />

      <main id="main" tabIndex={-1} className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none">
        <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-start text-center overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[560px] z-0 pointer-events-none">
            <Silk
              color={accent}
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
                {project.kind.toUpperCase()}
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[72px] font-normal text-white tracking-tight leading-none mb-6 max-w-4xl">
                {project.name}
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[540px] text-center leading-relaxed mb-8 tracking-tight">
                {project.summary}
              </p>
              {project.url && (
                <div className="mb-16">
                  <OutboundLink
                    icon={Globe}
                    label={siteLabel(project.url)}
                    href={project.url}
                  />
                </div>
              )}
            </Reveal>

            <div className="w-full max-w-5xl flex flex-col">
              <Reveal className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]">
                {project.facts.map((fact) => (
                  <div
                    key={fact.label}
                    className="bg-[#0a0a0d] p-8 flex flex-col text-left min-h-[160px] hover:bg-[#0c0c10] transition-colors duration-300"
                  >
                    <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-4">
                      {fact.label}
                    </span>
                    <span className="text-sm sm:text-[15px] text-neutral-300 font-normal leading-relaxed">
                      {fact.value}
                    </span>
                  </div>
                ))}
              </Reveal>

              <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center justify-between gap-4">
                <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                  THE PROJECT
                </span>
                {project.period && (
                  <span className="text-[11px] font-medium text-muted tracking-[0.15em] shrink-0">
                    {project.period}
                  </span>
                )}
              </Reveal>

              <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] p-8 sm:p-12 flex flex-col text-left gap-5">
                {project.story.map((paragraph) => (
                  <p
                    key={paragraph.slice(0, 32)}
                    className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[68ch]"
                  >
                    {paragraph}
                  </p>
                ))}
              </Reveal>

              {project.features?.length > 0 && (
                <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] p-8 sm:p-12 flex flex-col text-left">
                  <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-6">
                    What it does
                  </span>
                  <ul className="flex flex-col gap-4">
                    {project.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check
                          size={14}
                          strokeWidth={2}
                          className="text-violet-400 mt-1 shrink-0"
                        />
                        <span className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[68ch]">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Reveal>
              )}

              {project.credit && (
                <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] p-8 sm:p-12 flex flex-col text-left">
                  <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-4">
                    Who built it
                  </span>
                  <p className="text-sm sm:text-[15px] text-neutral-300 font-normal leading-relaxed max-w-[68ch]">
                    {project.credit}
                  </p>
                </Reveal>
              )}

              <Reveal
                className={`grid grid-cols-1 ${
                  project.stack.length > 1 ? 'sm:grid-cols-2' : ''
                } gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]`}
              >
                {project.stack.map((group) => (
                  <div
                    key={group.label}
                    className="bg-[#0a0a0d] p-8 flex flex-col text-left min-h-[160px] hover:bg-[#0c0c10] transition-colors duration-300 group"
                  >
                    <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-4">
                      Built with · {group.label}
                    </span>
                    <ul className="flex flex-wrap gap-2">
                      {group.items.map((item) => (
                        <li
                          key={item}
                          className="border border-[#222228] bg-[#111115]/50 px-2.5 py-1 text-[11px] font-medium text-neutral-400 group-hover:border-[#2e2e3a] transition-colors duration-300"
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </Reveal>

              {project.video && (
                <>
                  <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center justify-between gap-4">
                    <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                      SHOWCASE
                    </span>
                    <span className="text-[11px] font-medium text-muted tracking-[0.15em] shrink-0">
                      VIDEO
                    </span>
                  </Reveal>
                  <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d]">
                    <VideoEmbed
                      id={project.video.id}
                      title={project.video.title}
                      poster={project.video.poster}
                    />
                  </Reveal>
                </>
              )}

              {project.shot && (
                <>
                  <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center justify-between gap-4">
                    <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                      THE WHOLE PAGE
                    </span>
                    <span className="text-[11px] font-medium text-muted tracking-[0.15em] shrink-0">
                      SCROLL INSIDE
                    </span>
                  </Reveal>
                  <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d]">
                    <div className="w-full max-h-[70vh] overflow-y-auto overscroll-contain">
                      <ResponsiveImage
                        src={project.shot}
                        alt={`The ${project.name} website, top to bottom`}
                        loading="lazy"
                        sizes="(min-width: 1024px) 1024px, 100vw"
                        pictureClassName="block w-full"
                        className="w-full block"
                      />
                    </div>
                  </Reveal>
                </>
              )}

              <Reveal className="w-full flex">
                <a
                  href="/contact"
                  className="relative w-full border border-[#282832] bg-[#0a0a0d] overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-8 py-12 group cursor-pointer"
                >
                  <Silk
                    color={accent}
                    speed={4.5}
                    scale={1.4}
                    noiseIntensity={1.4}
                    rotation={-0.2}
                    fadeEdge={true}
                    className="absolute inset-0 w-full h-full z-0 opacity-60 group-hover:opacity-90 transition-opacity duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#060608] via-[#060608]/85 to-[#060608]/45 z-1 pointer-events-none" />

                  <div className="relative z-10 text-left">
                    <h3 className="text-2xl sm:text-3xl font-medium text-white tracking-tight mb-2">
                      Want something like this?
                    </h3>
                    <p className="text-sm text-neutral-300 font-normal leading-relaxed max-w-[380px]">
                      Tell us what you need and one of us will pick it up.
                    </p>
                  </div>

                  <span className="relative z-10 inline-flex items-center gap-3 border border-white bg-transparent group-hover:bg-white group-hover:text-black text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all shrink-0 self-start sm:self-auto">
                    GET IN TOUCH
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-3.5 h-3.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
                      />
                    </svg>
                  </span>
                </a>
              </Reveal>

              <a
                href="/work"
                className="inline-flex items-center gap-2 self-start mt-10 text-[11px] font-semibold text-muted hover:text-white tracking-[0.2em] transition-colors group/back"
              >
                <ArrowLeft
                  size={12}
                  strokeWidth={2}
                  className="group-hover/back:-translate-x-0.5 transition-transform duration-300"
                />
                ALL WORK
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
