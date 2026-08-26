import React from 'react';
import { Gamepad2, Rocket, RefreshCw, Check, Info, ArrowUpRight, Calculator } from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import CtaPanel from '../components/CtaPanel';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { AUDIENCES } from '../content/audiences';
import { PROJECTS } from '../content/projects';
import { SERVICES } from '../content/services';
import { STUDIO_NAME } from '../siteConfig';

export const AUDIENCE_ICONS = {
  'gamepad-2': Gamepad2,
  rocket: Rocket,
  'refresh-cw': RefreshCw,
};

function Card({ href, eyebrow, title, body }) {
  return (
    <a
      href={href}
      className="bg-[#0a0a0d] hover:bg-[#0c0c10] transition-colors duration-300 p-6 flex flex-col group"
    >
      <span className="flex items-start justify-between gap-3 mb-2">
        <span className="text-[10px] font-semibold text-muted tracking-[0.2em]">
          {eyebrow}
        </span>
        <ArrowUpRight
          size={15}
          strokeWidth={1.5}
          className="text-muted shrink-0 group-hover:text-violet-400 transition-colors duration-300"
        />
      </span>
      <span className="text-base font-medium text-white tracking-tight mb-1.5 leading-snug">
        {title}
      </span>
      <span className="text-[13px] text-muted font-normal leading-relaxed">{body}</span>
    </a>
  );
}

export default function AudiencePage({ audience }) {
  React.useEffect(() => {
    const previous = document.title;
    document.title = `${audience.label} — ${STUDIO_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [audience]);

  const Icon = AUDIENCE_ICONS[audience.icon] ?? Rocket;

  const projects = audience.projects
    .map((slug) => PROJECTS.find((project) => project.slug === slug))
    .filter(Boolean);
  const services = audience.services
    .map((slug) => SERVICES.find((service) => service.slug === slug))
    .filter(Boolean);

  const others = AUDIENCES.filter((entry) => entry.slug !== audience.slug);

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />

      <main id="main" tabIndex={-1} className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none">
        <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-start text-left overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[540px] z-0 pointer-events-none">
            <Silk
              color="#8864f2"
              speed={4.5}
              scale={1.5}
              noiseIntensity={1.4}
              rotation={-0.25}
              fadeEdge={true}
              className="absolute inset-0 w-full h-full opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608]/40 via-[#060608]/80 to-[#060608]" />
          </div>

          <div className="relative z-30 w-full flex flex-col items-center pt-24 pb-24 px-6 sm:px-10 md:px-16 lg:px-20">
            <Reveal rise className="w-full max-w-4xl flex flex-col items-start mb-14">
              <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-[#222228] bg-[#111115]/50 text-xs sm:text-[13px] font-medium text-neutral-300 mb-6 select-none">
                <Icon size={14} strokeWidth={1.5} className="text-neutral-400" />
                {audience.label.toUpperCase()}
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[56px] font-normal text-white tracking-tight leading-[1.02] mb-6 max-w-[820px]">
                {audience.title}
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[560px] leading-relaxed tracking-tight">
                {audience.intro}
              </p>
            </Reveal>

            <div className="w-full max-w-4xl flex flex-col">
              <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center">
                <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                  WHAT USUALLY BRINGS PEOPLE HERE
                </span>
              </Reveal>

              <Reveal className="border-x border-t border-[#282832] bg-[#08080b] p-8 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5">
                {audience.problems.map((problem) => (
                  <p
                    key={problem}
                    className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed flex items-start gap-3"
                  >
                    <span className="font-tech text-neutral-700 select-none shrink-0">—</span>
                    {problem}
                  </p>
                ))}
              </Reveal>

              <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center">
                <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                  WHAT WE BUILD FOR IT
                </span>
              </Reveal>

              <Reveal className="border-x border-t border-[#282832] bg-[#08080b] p-8 flex flex-col gap-4">
                {audience.weBuild.map((item) => (
                  <span key={item} className="flex items-start gap-3">
                    <Check size={14} strokeWidth={2} className="text-violet-400 mt-1 shrink-0" />
                    <span className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
                      {item}
                    </span>
                  </span>
                ))}
              </Reveal>

              {audience.note && (
                <Reveal className="border-x border-t border-[#282832] bg-[#0a0a0d] px-8 py-6 flex items-start gap-3">
                  <Info size={15} strokeWidth={1.5} className="text-muted mt-0.5 shrink-0" />
                  <p className="text-sm text-neutral-400 font-normal leading-relaxed max-w-[640px]">
                    {audience.note}
                    {audience.noteHref && (
                      <>
                        {' '}
                        <a
                          href={audience.noteHref}
                          className="text-neutral-200 underline underline-offset-4 decoration-neutral-600 hover:decoration-neutral-300 transition-colors"
                        >
                          Read the list
                        </a>
                        .
                      </>
                    )}
                  </p>
                </Reveal>
              )}

              <Reveal className="w-full border border-[#282832] bg-[#0a0a0d] px-8 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <h2 className="text-xl sm:text-2xl font-medium text-white tracking-tight mb-2">
                    What it tends to cost
                  </h2>
                  <p className="text-sm text-neutral-400 font-normal leading-relaxed max-w-[420px]">
                    The estimator, already set to what this usually involves. Change
                    anything that is not true of yours.
                  </p>
                </div>
                <a
                  href={`/estimate?${audience.estimate}`}
                  className="shrink-0 inline-flex items-center gap-3 border border-white bg-transparent hover:bg-white hover:text-black text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all self-start sm:self-auto"
                >
                  <Calculator size={13} strokeWidth={1.5} />
                  OPEN THE ESTIMATOR
                </a>
              </Reveal>

              {(projects.length > 0 || services.length > 0) && (
                <>
                  <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center mt-10">
                    <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                      WHERE TO LOOK NEXT
                    </span>
                  </Reveal>
                  <Reveal className="grid grid-cols-1 sm:grid-cols-2 gap-[1px] bg-[#282832] border border-[#282832]">
                    {projects.map((project) => (
                      <Card
                        key={project.slug}
                        href={`/work/${project.slug}`}
                        eyebrow="WORK"
                        title={project.name}
                        body={project.kind}
                      />
                    ))}
                    {services.map((service) => (
                      <Card
                        key={service.slug}
                        href={`/services#${service.slug}`}
                        eyebrow="SERVICE"
                        title={service.name}
                        body={service.blurb}
                      />
                    ))}
                  </Reveal>
                </>
              )}

              <div className="mt-10">
                <CtaPanel
                  title="Sound like your situation?"
                  body="Tell us what you are dealing with. A couple of sentences is enough to start."
                  label="START A PROJECT"
                  href="/contact"
                />
              </div>

              <Reveal className="mt-14">
                <span className="block text-[11px] font-semibold text-muted tracking-[0.2em] mb-5">
                  NOT YOU?
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[1px] bg-[#282832] border border-[#282832]">
                  {others.map((entry) => (
                    <Card
                      key={entry.slug}
                      href={`/for/${entry.slug}`}
                      eyebrow="ALSO FOR"
                      title={entry.label}
                      body={entry.title}
                    />
                  ))}
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
