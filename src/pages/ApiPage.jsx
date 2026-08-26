import React from 'react';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import CtaPanel from '../components/CtaPanel';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import ApiExplorer, { CopyButton } from '../components/api/ApiExplorer';
import {
  ENDPOINTS,
  API_NOTES,
  API_CALLS,
  API_MACHINE,
  API_BASE,
  API_VERSION,
} from '../content/apiMeta';
import { DOC_META } from '../content/docsMeta';
import {
  SHIELD_INSTALL,
  SHIELD_USAGE,
  SHIELD_START,
  SHIELD_PACKAGE,
  SHIELD_RUNTIME,
  SHIELD_FRAMEWORK,
  SHIELD_VERSION,
} from '../content/shieldRules';
import { STUDIO_NAME, SITE_URL } from '../siteConfig';

const API_DOCS = DOC_META.filter((page) => page.group === 'API');

const STATS = [
  { value: SHIELD_VERSION, label: 'Package' },
  { value: String(ENDPOINTS.length), label: 'Endpoints' },
  { value: '0', label: 'Keys needed' },
  { value: '300s', label: 'Cached' },
];

const STEPS = [
  {
    step: '01',
    title: 'Install',
    code: SHIELD_INSTALL,
    note: `${SHIELD_PACKAGE} on npm. Needs ${SHIELD_RUNTIME} and an ${SHIELD_FRAMEWORK} app.`,
  },
  {
    step: '02',
    title: 'Mount',
    code: SHIELD_USAGE,
    note: 'Monitor reports and refuses nothing. Swap to block when the log is quiet.',
  },
  {
    step: '03',
    title: 'Start',
    code: SHIELD_START,
    note: 'The preload is what gives an app using import any runtime cover at all.',
  },
];

export default function ApiPage() {
  React.useEffect(() => {
    const previous = document.title;
    document.title = `Install the API — ${STUDIO_NAME}`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#060608] font-sans text-white selection:bg-purple-500 selection:text-white">
      <Header />

      <main
        id="main"
        tabIndex={-1}
        className="flex w-full flex-1 justify-center bg-[#060608] focus:outline-none"
      >
        <section className="relative flex w-full max-w-[1480px] flex-col items-center justify-start overflow-hidden border-x border-[#282832] text-center">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[420px]">
            <Silk
              color="#8864f2"
              speed={4.5}
              scale={1.6}
              noiseIntensity={1.4}
              rotation={0.2}
              fadeEdge={true}
              className="absolute inset-0 h-full w-full opacity-50"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608]/40 via-[#060608]/75 to-[#060608]" />
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-[380px] bottom-0 z-0">
            <div className="dot-grid absolute inset-0 opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608] via-transparent to-[#060608]" />
          </div>

          <div className="relative z-30 flex w-full flex-col items-center px-4 pt-24 pb-24 sm:px-10 md:px-16 lg:px-20">
            <Reveal rise className="flex w-full flex-col items-center">
              <div className="font-tech mb-6 inline-flex items-center gap-2 border border-[#222228] bg-[#111115]/60 px-3 py-1.5 text-[10px] tracking-[0.25em] text-neutral-300 uppercase select-none">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
                Public API · {API_VERSION}
              </div>

              <h1 className="mb-6 max-w-4xl text-4xl leading-none font-normal tracking-tight text-white sm:text-5xl md:text-6xl lg:text-[68px]">
                Install it,
                <br />
                then call it
              </h1>

              <p className="mb-8 max-w-[560px] text-center text-sm leading-relaxed font-normal tracking-tight text-neutral-400 sm:text-base">
                Three lines to put Shield in front of an Express app, one GET to
                read the rules it enforces. Reading the API takes a token; the
                signed feed your installs poll does not.
              </p>

              <div className="mb-10 flex flex-wrap items-center justify-center gap-3">
                <a
                  href="#install"
                  className="font-tech inline-flex items-center gap-2 border border-violet-400/40 bg-violet-500/10 px-4 py-2.5 text-[11px] tracking-[0.15em] text-violet-200 uppercase transition-colors hover:border-violet-400/70 hover:text-white"
                >
                  Start installing
                </a>
                <a
                  href="/docs/public-api"
                  className="font-tech group/link inline-flex items-center gap-2 border border-[#282832] px-4 py-2.5 text-[11px] tracking-[0.15em] text-neutral-400 uppercase transition-colors hover:border-neutral-600 hover:text-neutral-200"
                >
                  <BookOpen size={12} strokeWidth={2} />
                  What this API is
                  <ArrowUpRight
                    size={12}
                    strokeWidth={2}
                    className="transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                  />
                </a>
              </div>

              <dl className="font-tech mb-14 flex flex-wrap items-baseline justify-center gap-x-6 gap-y-2 border-y border-[#1e1e26] px-2 py-3 text-[10px] tracking-[0.15em] uppercase">
                {STATS.map((stat, index) => (
                  <span key={stat.label} className="flex items-baseline gap-2">
                    {index > 0 && <span className="mr-4 text-[#282832] select-none">/</span>}
                    <dt className="text-neutral-600">{stat.label}</dt>
                    <dd className="text-neutral-300 tabular-nums">{stat.value}</dd>
                  </span>
                ))}
              </dl>
            </Reveal>

            <div className="flex w-full max-w-6xl flex-col">
              <Reveal id="install" className="w-full scroll-mt-24 text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  Step one
                </p>
                <h2 className="mb-6 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  Put it in your app
                </h2>

                <div className="flex flex-col border border-[#282832] bg-[#08080b]">
                  {STEPS.map((row) => (
                    <div
                      key={row.step}
                      className="flex flex-col gap-3 border-b border-[#1e1e26] px-4 py-4 last:border-b-0 sm:flex-row sm:items-start sm:gap-5"
                    >
                      <span className="font-tech w-6 shrink-0 pt-0.5 text-[11px] text-[#3f3f52] tabular-nums select-none">
                        {row.step}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="font-tech text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                          {row.title}
                        </span>
                        <code className="font-tech min-w-0 overflow-x-auto text-[12.5px] whitespace-pre text-neutral-200">
                          {row.code}
                        </code>
                        <span className="text-[12.5px] leading-relaxed text-neutral-500">
                          {row.note}
                        </span>
                      </span>
                      <span className="shrink-0 sm:pt-0.5">
                        <CopyButton label="Copy" text={row.code} />
                      </span>
                    </div>
                  ))}
                </div>

                <a
                  href="/docs/shield-setup"
                  className="font-tech group/link mt-5 inline-flex w-fit items-center gap-2 text-[11px] tracking-[0.15em] text-neutral-400 uppercase transition-colors hover:text-violet-300"
                >
                  Every option, and what to change before you rely on it
                  <ArrowUpRight
                    size={12}
                    strokeWidth={2}
                    className="transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                  />
                </a>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  Step two
                </p>
                <h2 className="mb-6 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  Read it from your own code
                </h2>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {API_CALLS.map((call) => (
                    <div
                      key={call.id}
                      className="flex flex-col border border-[#282832] bg-[#08080b]"
                    >
                      <div className="flex items-center gap-3 border-b border-[#1e1e26] px-4 py-2.5">
                        <span className="font-tech text-[10px] tracking-[0.2em] text-neutral-500 uppercase">
                          {call.label}
                        </span>
                        <span className="ml-auto">
                          <CopyButton label="Copy" text={call.code} />
                        </span>
                      </div>
                      <code className="font-tech min-w-0 flex-1 px-4 py-3.5 text-[12px] leading-relaxed break-words whitespace-pre-wrap text-neutral-300">
                        {call.code}
                      </code>
                      <p className="border-t border-[#1e1e26] px-4 py-3 text-[12.5px] leading-relaxed text-neutral-500">
                        {call.hint}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-[13px] leading-relaxed text-neutral-500">
                  Base is{' '}
                  <code className="font-tech text-neutral-300">
                    {SITE_URL}
                    {API_BASE}
                  </code>{' '}
                  and every path also answers at <code className="font-tech text-neutral-300">.json</code>.
                </p>

                <a
                  href="/docs/api-consuming"
                  className="font-tech group/link mt-5 inline-flex w-fit items-center gap-2 text-[11px] tracking-[0.15em] text-neutral-400 uppercase transition-colors hover:text-violet-300"
                >
                  Worked examples, polling without waste, and what each failure means
                  <ArrowUpRight
                    size={12}
                    strokeWidth={2}
                    className="transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                  />
                </a>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  Step three
                </p>
                <h2 className="mb-6 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  Or try one right here
                </h2>

                <ApiExplorer />

                <p className="font-tech mt-3 text-[10px] tracking-[0.15em] text-neutral-600 uppercase">
                  Live requests from your browser, against the same paths your app will call
                </p>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  Before you rely on it
                </p>
                <h2 className="mb-6 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  Six things worth knowing
                </h2>

                <ul className="grid grid-cols-1 border-t border-[#1e1e26] md:grid-cols-2 md:gap-x-14">
                  {API_NOTES.map((note) => (
                    <li
                      key={note.title}
                      className="flex items-start gap-4 border-b border-[#1e1e26] py-4"
                    >
                      <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#3f3f52]" />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium tracking-tight text-white">
                          {note.title}
                        </span>
                        <span className="block text-[13px] leading-relaxed text-neutral-500">
                          {note.short}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  The written reference
                </p>
                <h2 className="mb-3 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  What all of this actually is
                </h2>
                <p className="mb-6 max-w-[70ch] text-[13.5px] leading-relaxed text-neutral-500">
                  This page is here to get it running. The endpoints, the fields, the ruleset
                  and every setting Shield takes are written out properly in the docs.
                </p>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {API_DOCS.map((page) => (
                    <a
                      key={page.slug}
                      href={`/docs/${page.slug}`}
                      className="group/card flex flex-col border border-[#1e1e26] bg-[#08080b] p-5 transition-colors hover:border-violet-400/40"
                    >
                      <span className="mb-1.5 flex items-center gap-2">
                        <span className="text-[14.5px] font-medium tracking-tight text-white">
                          {page.title}
                        </span>
                        <ArrowUpRight
                          size={13}
                          strokeWidth={2}
                          className="ml-auto shrink-0 text-neutral-600 transition-all group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5 group-hover/card:text-violet-300"
                        />
                      </span>
                      <span className="text-[13px] leading-relaxed text-neutral-500">
                        {page.description}
                      </span>
                    </a>
                  ))}
                </div>

                <ul className="mt-3 flex flex-col border-t border-[#1e1e26]">
                  {API_MACHINE.map((item) => (
                    <li
                      key={item.path}
                      className="flex flex-col gap-x-4 gap-y-1 border-b border-[#1e1e26] py-3.5 sm:flex-row sm:items-baseline"
                    >
                      <a
                        href={item.path}
                        className="font-tech w-[190px] shrink-0 text-[12px] text-neutral-300 transition-colors hover:text-violet-300"
                      >
                        {item.path}
                      </a>
                      <span className="text-[13px] leading-relaxed text-neutral-500">
                        {item.blurb}
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal className="mt-14 flex w-full flex-col border border-[#282832] bg-[#0a0a0d] p-8 text-left sm:p-12">
                <span className="font-tech mb-4 text-[10px] tracking-[0.2em] text-muted uppercase">
                  Everything here is a GET
                </span>
                <p className="max-w-[68ch] text-sm leading-relaxed font-normal text-neutral-400 sm:text-[15px]">
                  There is no write endpoint, and that is deliberate. Nothing you install
                  sends us your code, your traffic or your findings — the package works
                  inside your process and this API only hands rules down. If you want to
                  reach us with a machine, send an email; it goes to a person either way.
                </p>
                <span className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
                  <a
                    href="/shield"
                    className="font-tech group/link inline-flex w-fit items-center gap-2 text-[11px] tracking-[0.15em] text-neutral-400 uppercase transition-colors hover:text-violet-300"
                  >
                    How Shield works
                    <ArrowUpRight
                      size={12}
                      strokeWidth={2}
                      className="transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                    />
                  </a>
                  <a
                    href="/status"
                    className="font-tech group/link inline-flex w-fit items-center gap-2 text-[11px] tracking-[0.15em] text-neutral-400 uppercase transition-colors hover:text-violet-300"
                  >
                    What the status endpoint measures
                    <ArrowUpRight
                      size={12}
                      strokeWidth={2}
                      className="transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                    />
                  </a>
                </span>
              </Reveal>

              <Reveal className="mt-14 flex w-full">
                <CtaPanel
                  title="Want one of these on your own site?"
                  body="This is a build step and a few hundred lines. Most of what we make is bigger, but it starts the same way."
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
