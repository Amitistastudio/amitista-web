import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import CtaPanel from '../components/CtaPanel';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import {
  DEFENCES,
  LAYERS,
  SHIELD_LIMITS,
  SHIELD_INSTALL,
  SHIELD_USAGE,
  SHIELD_START,
  SHIELD_MODES,
  SHIELD_PACKAGE,
  SHIELD_VERSION,
  SHIELD_RUNTIME,
  SHIELD_FRAMEWORK,
  DENIAL,
  VERIFICATION,
  RULESET,
  SINKS,
  SHIELD_OPTIONS,
  SHIELD_SETTINGS,
  SHIELD_SURFACE,
} from '../content/shieldRules';
import {
  SHIELD_INTRO,
  SHIELD_PRINCIPLES,
  SHIELD_AUDIENCE,
  STAGE_ORDER,
  STAGE_TIMING,
  STAGE_DETAIL,
} from '../content/shieldMeta';
import { STUDIO_NAME } from '../siteConfig';

const SEVERITY_DOT = {
  critical: 'bg-red-400',
  high: 'bg-amber-400',
  medium: 'bg-violet-400',
  low: 'bg-neutral-600',
};

const STATS = [
  { value: String(DEFENCES.length), label: 'Checks' },
  { value: String(LAYERS.length), label: 'Layers' },
  { value: String(SINKS.length), label: 'Sinks watched' },
  { value: '0', label: 'Bytes of your code sent' },
];

const FACTS = [
  { label: 'Package', value: SHIELD_PACKAGE },
  { label: 'Version', value: SHIELD_VERSION },
  { label: 'Ruleset', value: String(RULESET) },
  { label: 'Runtime', value: SHIELD_RUNTIME },
  { label: 'Framework', value: SHIELD_FRAMEWORK },
];

const byLayer = (id) => DEFENCES.filter((defence) => defence.layer === id);

const SINK_GROUPS = (() => {
  const groups = new Map();
  for (const sink of SINKS) {
    const key = sink.module ? `module:${sink.module}` : `any:${sink.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: sink.module || 'any object',
        label: sink.label,
        severity: sink.severity,
        methods: [],
      });
    }
    groups.get(key).methods.push(sink.method);
  }
  return [...groups.values()].sort((a, b) => b.methods.length - a.methods.length);
})();

const unordered = LAYERS.filter((layer) => !STAGE_ORDER.includes(layer.id));
if (unordered.length) {
  throw new Error(
    `ShieldPage: shieldRules has ${unordered.length} layer(s) this page does not place — ` +
      `${unordered.map((layer) => layer.id).join(', ')}. Add them to STAGE_ORDER, STAGE_TIMING ` +
      'and STAGE_DETAIL in shieldMeta.js, or their checks vanish from the page silently.',
  );
}

const STAGES = STAGE_ORDER.map((id) => {
  const layer = LAYERS.find((candidate) => candidate.id === id);
  if (!layer || !STAGE_TIMING[id] || !STAGE_DETAIL[id]) {
    throw new Error(
      `ShieldPage: the "${id}" stage is ordered in shieldMeta.js but ${
        layer ? 'has no timing or detail written for it' : 'is not a layer in shieldRules.js'
      }.`,
    );
  }
  return { ...layer, timing: STAGE_TIMING[id], detail: STAGE_DETAIL[id], checks: byLayer(id) };
});

export default function ShieldPage() {
  React.useEffect(() => {
    const previous = document.title;
    document.title = `Shield — ${STUDIO_NAME}`;
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
                {SHIELD_PACKAGE} · {SHIELD_VERSION}
              </div>

              <h1 className="mb-6 max-w-4xl text-4xl leading-none font-normal tracking-tight text-white sm:text-5xl md:text-6xl lg:text-[68px]">
                Security that stays
                <br />
                inside your app
              </h1>

              <p className="mb-10 max-w-[580px] text-center text-sm leading-relaxed font-normal tracking-tight text-neutral-400 sm:text-base">
                Shield reads every route in your Express application, then watches
                the dangerous calls as they happen and refuses the requests that
                abuse them. It runs in your process, on your machine. Nothing you
                wrote is ever sent to us.
              </p>

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
              <Reveal className="w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  Start here
                </p>
                <h2 className="mb-6 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  What it is
                </h2>
                <div className="flex flex-col gap-5 md:flex-row md:gap-14">
                  <div className="flex max-w-[70ch] flex-col gap-4">
                    {SHIELD_INTRO.map((paragraph) => (
                      <p
                        key={paragraph.slice(0, 32)}
                        className="text-[14.5px] leading-relaxed text-neutral-400"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                  <dl className="flex h-fit w-full shrink-0 flex-col border border-[#1e1e26] bg-[#08080b] md:w-[260px]">
                    {FACTS.map((fact) => (
                      <div
                        key={fact.label}
                        className="flex items-baseline justify-between gap-4 border-b border-[#1e1e26] px-4 py-3 last:border-b-0"
                      >
                        <dt className="font-tech text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                          {fact.label}
                        </dt>
                        <dd className="font-tech min-w-0 truncate text-[12px] text-neutral-300">
                          {fact.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  {STAGES.length} layers, {DEFENCES.length} checks
                </p>
                <h2 className="mb-3 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  How it works
                </h2>
                <p className="mb-10 max-w-[70ch] text-[13.5px] leading-relaxed text-neutral-500">
                  Nothing here runs on a schedule or in a dashboard. Each layer is a point in
                  the life of a request, in the order it is reached.
                </p>

                <ol className="flex flex-col">
                  {STAGES.map((stage, index) => (
                    <li
                      key={stage.id}
                      className="flex flex-col gap-6 border-t border-[#1e1e26] py-8 first:border-t-0 first:pt-0 md:flex-row md:gap-12"
                    >
                      <div className="flex shrink-0 items-start gap-4 md:w-[280px]">
                        <span className="font-tech mt-1 text-[11px] text-[#3f3f52] tabular-nums select-none">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="font-tech mb-1.5 text-[10px] tracking-[0.2em] text-violet-300/70 uppercase">
                            {stage.timing}
                          </span>
                          <h3 className="mb-2 text-[17px] font-medium tracking-tight text-white">
                            {stage.name}
                          </h3>
                          <span className="text-[13px] leading-relaxed text-neutral-500">
                            {stage.blurb}
                          </span>
                        </span>
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <p className="mb-5 max-w-[70ch] text-[14px] leading-relaxed text-neutral-400">
                          {stage.detail}
                        </p>
                        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          {stage.checks.map((defence) => (
                            <li
                              key={defence.id}
                              className="flex flex-col border border-[#1e1e26] bg-[#08080b] p-4"
                            >
                              <span className="mb-1.5 flex items-baseline gap-2">
                                <span
                                  className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${SEVERITY_DOT[defence.severity]}`}
                                />
                                <span className="text-[13.5px] font-medium tracking-tight text-white">
                                  {defence.name}
                                </span>
                                <code className="font-tech ml-auto shrink-0 text-[10px] text-neutral-700">
                                  {defence.severity}
                                </code>
                              </span>
                              <span className="text-[13px] leading-relaxed text-neutral-500">
                                {defence.summary}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ))}
                </ol>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  {SINKS.length} calls, and the argument that matters
                </p>
                <h2 className="mb-3 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  What it watches
                </h2>
                <p className="mb-10 max-w-[70ch] text-[13.5px] leading-relaxed text-neutral-500">
                  A sink is a call where request data stops being data and starts being an
                  instruction. Each one is published with the argument positions that are
                  actually the injection point, which is why a query with its values bound to
                  parameters is not a finding and the same query built by concatenation is.
                </p>
                <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {SINK_GROUPS.map((group) => (
                    <li
                      key={group.key}
                      className="flex flex-col border border-[#1e1e26] bg-[#08080b] p-4"
                    >
                      <span className="mb-2 flex items-baseline gap-2">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${SEVERITY_DOT[group.severity]}`}
                        />
                        <code className="font-tech text-[12.5px] text-white">{group.title}</code>
                        <span className="ml-auto shrink-0 text-[11px] text-neutral-600">
                          {group.label}
                        </span>
                      </span>
                      <span className="font-tech flex flex-wrap gap-x-2 gap-y-1 text-[11px] leading-relaxed text-neutral-500">
                        {group.methods.map((method) => (
                          <code key={method}>{method}</code>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 max-w-[70ch] text-[13px] leading-relaxed text-neutral-500">
                  Database drivers are caught as they load rather than named here — pg, mysql,
                  mysql2, sqlite and mongodb are patched at the moment your application
                  requires them, which is the last point at which patching is still ahead of
                  your own reference to them.
                </p>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  Two modes, and only one of them is on
                </p>
                <h2 className="mb-6 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  Watching, then stopping
                </h2>
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {SHIELD_MODES.map((mode) => (
                    <li
                      key={mode.id}
                      className="flex flex-col border border-[#282832] bg-[#08080b] p-6"
                    >
                      <span className="mb-3 flex items-baseline gap-3">
                        <code className="font-tech text-[13px] text-white">{mode.id}</code>
                        {mode.id === 'monitor' && (
                          <span className="font-tech border border-[#282832] px-2 py-0.5 text-[9px] tracking-[0.2em] text-violet-300/80 uppercase">
                            Default
                          </span>
                        )}
                      </span>
                      <span className="text-[13.5px] leading-relaxed text-neutral-400">
                        {mode.summary}
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  Three lines, then it is on
                </p>
                <h2 className="mb-6 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  Installing it
                </h2>
                <div className="flex flex-col border border-[#282832] bg-[#08080b]">
                  {[
                    { step: 'Install', code: SHIELD_INSTALL },
                    { step: 'Mount', code: SHIELD_USAGE },
                    { step: 'Start', code: SHIELD_START },
                  ].map((row) => (
                    <div
                      key={row.step}
                      className="flex flex-col gap-1 border-b border-[#1e1e26] px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-5"
                    >
                      <span className="font-tech w-16 shrink-0 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                        {row.step}
                      </span>
                      <code className="font-tech min-w-0 overflow-x-auto text-[12.5px] whitespace-pre text-neutral-300">
                        {row.code}
                      </code>
                    </div>
                  ))}
                </div>
                <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-neutral-500">
                  The preload in the third line is not optional decoration. An
                  application using{' '}
                  <code className="font-tech text-neutral-300">import</code> links its whole
                  module graph before any of it runs, so the builtins are already handed out by
                  the time a middleware could patch them — start it any other way and the
                  runtime layer covers nothing.
                </p>
                <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
                  {[
                    { href: '/docs/shield-setup', label: 'The full setup, step by step' },
                    { href: '/docs/shield-operating', label: 'Running it behind a proxy, across workers' },
                  ].map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="font-tech group/link inline-flex w-fit items-center gap-2 text-[11px] tracking-[0.15em] text-neutral-400 uppercase transition-colors hover:text-violet-300"
                    >
                      {link.label}
                      <ArrowUpRight
                        size={12}
                        strokeWidth={2}
                        className="transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                      />
                    </a>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  {SHIELD_OPTIONS.length} settings, and sensible without any of them
                </p>
                <h2 className="mb-3 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  Configuring it
                </h2>
                <p className="mb-8 max-w-[70ch] text-[13.5px] leading-relaxed text-neutral-500">
                  The defaults are the deployment we would recommend, so a one-line call is not
                  a lesser one. These are the things worth changing once you know your own
                  application — starting with the block page, which otherwise puts our name on
                  your refusal.
                </p>

                <div className="flex flex-col border border-[#282832] bg-[#08080b]">
                  {SHIELD_OPTIONS.map((option) => (
                    <div
                      key={option.name}
                      className="flex flex-col gap-2 border-b border-[#1e1e26] px-4 py-4 last:border-b-0 md:flex-row md:gap-6"
                    >
                      <span className="flex shrink-0 flex-col gap-1 md:w-[190px]">
                        <code className="font-tech text-[12.5px] text-white">{option.name}</code>
                        <code className="font-tech text-[11px] break-all text-neutral-600">
                          {option.default}
                        </code>
                      </span>
                      <span className="min-w-0 text-[13px] leading-relaxed text-neutral-400">
                        {option.purpose}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="font-tech mt-10 mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  Worth setting by hand
                </p>
                <h3 className="mb-6 text-[17px] font-medium tracking-tight text-white">
                  Where the default is a compromise
                </h3>
                <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {SHIELD_SETTINGS.map((setting) => (
                    <li
                      key={setting.name}
                      className="flex flex-col border border-[#1e1e26] bg-[#08080b] p-4"
                    >
                      <span className="mb-1.5 flex items-baseline gap-3">
                        <code className="font-tech text-[12px] text-white">{setting.name}</code>
                        <code className="font-tech ml-auto shrink-0 text-[10px] text-neutral-700">
                          {setting.default}
                        </code>
                      </span>
                      <span className="text-[13px] leading-relaxed text-neutral-500">
                        {setting.purpose}
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  Beyond the middleware
                </p>
                <h2 className="mb-3 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  The rest of the surface
                </h2>
                <p className="mb-8 max-w-[70ch] text-[13.5px] leading-relaxed text-neutral-500">
                  Mounting <code className="font-tech text-neutral-300">protect()</code> is the
                  whole install. Everything else here exists for the parts of a real deployment
                  a middleware cannot reach on its own — the socket underneath it, the worker
                  next to it, and the question of what it has actually seen.
                </p>
                <dl className="grid grid-cols-1 border-t border-[#1e1e26] md:grid-cols-2 md:gap-x-10">
                  {SHIELD_SURFACE.map((entry) => (
                    <div key={entry.call} className="border-b border-[#1e1e26] py-4">
                      <dt className="mb-1.5">
                        <code className="font-tech text-[12.5px] text-white">{entry.call}</code>
                      </dt>
                      <dd className="text-[13px] leading-relaxed text-neutral-500">
                        {entry.purpose}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  It says so when it is not working
                </p>
                <h2 className="mb-3 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  Verification
                </h2>
                <p className="mb-6 max-w-[70ch] text-[13.5px] leading-relaxed text-neutral-500">
                  {VERIFICATION.why.charAt(0).toUpperCase() + VERIFICATION.why.slice(1)}.
                </p>

                <dl className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                  {[
                    { term: 'How', detail: VERIFICATION.method },
                    { term: 'What it looks for', detail: VERIFICATION.detects },
                    { term: 'When it fails', detail: VERIFICATION.onFailure },
                  ].map((row) => (
                    <div
                      key={row.term}
                      className="flex flex-col border border-[#1e1e26] bg-[#08080b] p-4"
                    >
                      <dt className="font-tech mb-1.5 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                        {row.term}
                      </dt>
                      <dd className="text-[13px] leading-relaxed text-neutral-400">{row.detail}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  Two audiences, one reference
                </p>
                <h2 className="mb-3 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  When it refuses someone
                </h2>
                <p className="mb-6 max-w-[70ch] text-[13.5px] leading-relaxed text-neutral-500">
                  A refused request has two audiences that want opposite things. A program wants a
                  status code and a reason it can branch on. A person in a browser wants to be told
                  what happened, that it might be a mistake, and who to write to. Both get the same
                  reference, so a visitor quoting{' '}
                  <code className="font-tech text-neutral-300">{DENIAL.referenceExample}</code>{' '}
                  can be matched against one line in your log. It also travels as{' '}
                  <code className="font-tech text-neutral-300">{DENIAL.referenceHeader}</code>, so a
                  program never has to read the body to find it.
                </p>

                <ul className="mb-6 flex flex-col border-t border-[#1e1e26]">
                  {DENIAL.behaviour.map((row) => (
                    <li
                      key={row.when}
                      className="flex flex-col gap-1 border-b border-[#1e1e26] py-4 sm:flex-row sm:gap-6"
                    >
                      <span className="w-full shrink-0 text-[13.5px] font-medium tracking-tight text-white sm:w-[220px]">
                        {row.when.charAt(0).toUpperCase() + row.when.slice(1)}
                      </span>
                      <span className="min-w-0 text-[13px] leading-relaxed text-neutral-500">
                        {row.response}
                      </span>
                    </li>
                  ))}
                </ul>

                <ul className="flex flex-col gap-3">
                  {DENIAL.notes.map((note) => (
                    <li
                      key={note}
                      className="flex items-start gap-4 text-[13px] leading-relaxed text-neutral-500"
                    >
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#3f3f52]" />
                      <span className="min-w-0">{note}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="/block"
                  className="font-tech group/link mt-6 inline-flex w-fit items-center gap-2 text-[11px] tracking-[0.15em] text-neutral-400 uppercase transition-colors hover:text-violet-300"
                >
                  See the page a blocked visitor lands on
                  <ArrowUpRight
                    size={12}
                    strokeWidth={2}
                    className="transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                  />
                </a>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  Decisions, not features
                </p>
                <h2 className="mb-6 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  Why it is built this way
                </h2>
                <ul className="grid grid-cols-1 md:grid-cols-2 md:gap-x-14">
                  {SHIELD_PRINCIPLES.map((principle) => (
                    <li key={principle.title} className="border-b border-[#1e1e26] py-6">
                      <h3 className="mb-2 text-[15px] font-medium tracking-tight text-white">
                        {principle.title}
                      </h3>
                      <p className="text-[13.5px] leading-relaxed text-neutral-400">
                        {principle.body}
                      </p>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  Published on purpose
                </p>
                <h2 className="mb-3 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  What it does not do
                </h2>
                <p className="mb-6 max-w-[70ch] text-[13.5px] leading-relaxed text-neutral-500">
                  A security tool that only lists its strengths is telling you half of what you
                  need to decide. These are in the API too, at{' '}
                  <code className="font-tech text-neutral-400">/api/v1/shield</code>.
                </p>
                <ul className="flex flex-col border-t border-[#1e1e26]">
                  {SHIELD_LIMITS.map((limit) => (
                    <li
                      key={limit}
                      className="flex items-start gap-4 border-b border-[#1e1e26] py-4 text-[13.5px] leading-relaxed text-neutral-400"
                    >
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#3f3f52]" />
                      <span className="min-w-0">{limit}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={60} className="mt-20 w-full text-left">
                <p className="font-tech mb-1 text-[10px] tracking-[0.2em] text-neutral-600 uppercase">
                  Who it is for
                </p>
                <h2 className="mb-6 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                  Whether this is you
                </h2>
                <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SHIELD_AUDIENCE.map((line) => (
                    <li
                      key={line}
                      className="border border-[#1e1e26] bg-[#08080b] p-4 text-[13.5px] leading-relaxed text-neutral-400"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal className="mt-14 flex w-full flex-col border border-[#282832] bg-[#0a0a0d] p-8 text-left sm:p-12">
                <span className="font-tech mb-4 text-[10px] tracking-[0.2em] text-muted uppercase">
                  The rules are published
                </span>
                <p className="max-w-[68ch] text-sm leading-relaxed font-normal text-neutral-400 sm:text-[15px]">
                  Every check on this page is published as JSON — the sinks with the argument
                  that is actually the injection point, the request shapes treated as abuse, the
                  rate limits applied before you configure anything. Reading the catalogue takes
                  a token, which is a minute under Account → API. The signed feed your installs
                  poll takes none: they verify it against a key pinned in the package, so it has
                  to stay reachable without one.
                </p>
                <a
                  href="/api"
                  className="font-tech group/link mt-6 inline-flex w-fit items-center gap-2 text-[11px] tracking-[0.15em] text-neutral-400 uppercase transition-colors hover:text-violet-300"
                >
                  Read the rule catalogue
                  <ArrowUpRight
                    size={12}
                    strokeWidth={2}
                    className="transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                  />
                </a>
              </Reveal>

              <Reveal className="mt-14 flex w-full">
                <CtaPanel
                  title="Want this looked at on your own application?"
                  body="Tell us what it runs on and who it holds data for. We will say what we would check first, whether or not you use the package."
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
