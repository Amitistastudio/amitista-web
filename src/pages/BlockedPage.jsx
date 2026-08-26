import React from 'react';
import {
  ShieldX,
  Copy,
  Check,
  Clock,
  Fingerprint,
  Layers,
  ArrowLeft,
  ArrowUpRight,
  RotateCw,
} from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import {
  DEFENCES,
  LAYERS,
  SHIELD_PACKAGE,
  SHIELD_VERSION,
  RULESET,
} from '../content/shieldRules';
import { STUDIO_NAME } from '../siteConfig';

const SECURITY_NAME = `${STUDIO_NAME.split(' ')[0]} Security`;

const REFERENCE = /^AMS-[0-9A-F]{4}-[0-9A-F]{4}$/;

const MAX_RETRY = 86400;

const BRANDS_URL = '/api/v1/shield/brands';

const BRAND_SLUG = /^[a-z0-9][a-z0-9-]{1,31}$/;

const BRAND_NAME = /^[A-Za-z0-9 .,'&()’-]{2,48}$/;

const BRAND_ACCENT = /^#[0-9a-fA-F]{6}$/;

const DEFAULT_BRAND = {
  name: SECURITY_NAME,
  accent: '#e0245e',
  contact: '/contact',
  credit: true,
  own: true,
};

function wantedBrand() {
  if (typeof window === 'undefined') return null;
  const asked = (new URLSearchParams(window.location.search).get('brand') || '').trim().toLowerCase();
  return BRAND_SLUG.test(asked) ? asked : null;
}

function readBrand(payload, slug) {
  const found = payload?.brands?.[slug];
  if (!found || typeof found !== 'object') return null;
  if (typeof found.name !== 'string' || !BRAND_NAME.test(found.name)) return null;

  const contact = typeof found.contact === 'string' ? found.contact : '';
  const safeContact =
    contact.startsWith('https://') || contact.startsWith('mailto:') ? contact : DEFAULT_BRAND.contact;

  return {
    name: found.name,
    accent: BRAND_ACCENT.test(found.accent ?? '') ? found.accent : DEFAULT_BRAND.accent,
    contact: safeContact,
    credit: found.credit !== false,
    own: false,
  };
}

const SEVERITY_DOT = {
  critical: 'bg-red-400',
  high: 'bg-amber-400',
  medium: 'bg-violet-400',
  low: 'bg-neutral-600',
};

const CAUSES = [
  {
    title: 'A scanner or automated tool',
    body:
      'Most refusals are traffic that never came from a person — a vulnerability scanner, a scraper, or a script probing for a login it hopes is unprotected.',
  },
  {
    title: 'An address you are sharing',
    body:
      'A VPN, a company network or a mobile carrier puts many people behind one address. If somebody else on it was refused, the budget for that address may already have been spent.',
  },
  {
    title: 'Ordinary text that reads as an attack',
    body:
      'Pasted markup, a stray quote or a path-like string in a form field can match the same pattern a real injection does. That is a false positive, and worth telling us about.',
  },
];

function readIncident() {
  if (typeof window === 'undefined') return { reference: null, rule: null, retryAfter: null };

  const params = new URLSearchParams(window.location.search);
  const reference = (params.get('ref') || '').trim().toUpperCase();
  const rule = (params.get('rule') || '').trim();
  const retry = Number.parseInt(params.get('retry') || '', 10);

  return {
    reference: REFERENCE.test(reference) ? reference : null,
    rule: DEFENCES.find((defence) => defence.id === rule) || null,
    retryAfter: Number.isFinite(retry) && retry > 0 && retry <= MAX_RETRY ? retry : null,
  };
}

function stamp(date) {
  return `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

function countdown(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex flex-col gap-1 border-b border-[#1e1e26] px-4 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="font-tech flex items-center gap-2 text-[10px] tracking-[0.22em] text-neutral-500 uppercase sm:w-36 sm:shrink-0">
        <Icon size={12} strokeWidth={1.75} className="shrink-0 text-neutral-600" aria-hidden="true" />
        {label}
      </span>
      <span className="min-w-0 font-mono text-[13px] break-all text-neutral-200">{children}</span>
    </div>
  );
}

export default function BlockedPage() {
  const [incident, setIncident] = React.useState(() => ({
    reference: null,
    rule: null,
    retryAfter: null,
  }));
  const [seen, setSeen] = React.useState(null);
  const [remaining, setRemaining] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const [brand, setBrand] = React.useState(DEFAULT_BRAND);

  React.useEffect(() => {
    const found = readIncident();
    setIncident(found);
    setSeen(new Date());
    setRemaining(found.retryAfter);
  }, []);

  React.useEffect(() => {
    const slug = wantedBrand();
    if (!slug) return undefined;

    let dropped = false;
    fetch(BRANDS_URL, { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (dropped) return;
        const found = readBrand(payload, slug);
        if (found) setBrand(found);
      })
      .catch(() => {});

    return () => {
      dropped = true;
    };
  }, []);

  React.useEffect(() => {
    const previous = document.title;
    document.title = `Blocked — ${brand.name}`;
    return () => {
      document.title = previous;
    };
  }, [brand.name]);

  const ticking = remaining !== null && remaining > 0;

  React.useEffect(() => {
    if (!ticking) return undefined;
    const timer = window.setInterval(() => {
      setRemaining((value) => (value === null || value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  const layer = incident.rule
    ? LAYERS.find((candidate) => candidate.id === incident.rule.layer)
    : null;

  const details = React.useMemo(() => {
    const lines = [
      `${brand.name} — refused request`,
      `Reference: ${incident.reference || 'not supplied'}`,
      `Rule: ${incident.rule ? `${incident.rule.name} (${incident.rule.id})` : 'not supplied'}`,
      `Seen: ${seen ? stamp(seen) : 'unknown'}`,
      `Screened by: ${SHIELD_PACKAGE} ${SHIELD_VERSION}, ruleset ${RULESET}`,
    ];
    return lines.join('\n');
  }, [brand.name, incident, seen]);

  const copy = React.useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(details).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  }, [details]);

  const canGoBack = typeof window !== 'undefined' && window.history.length > 1;

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#060608] font-sans text-white selection:bg-red-500 selection:text-white">
      <Header />

      <main
        id="main"
        tabIndex={-1}
        className="flex w-full flex-1 justify-center bg-[#060608] focus:outline-none"
      >
        <section className="relative flex w-full max-w-[1480px] flex-col items-center overflow-hidden border-x border-[#282832]">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[460px]" aria-hidden="true">
            <Silk
              color={brand.accent}
              speed={2.2}
              scale={1.7}
              noiseIntensity={1.7}
              rotation={-0.3}
              fadeEdge={true}
              className="absolute inset-0 h-full w-full opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608]/20 via-[#060608]/65 to-[#060608]" />
            <div className="scanlines absolute inset-0 opacity-50" />
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-[420px] bottom-0 z-0" aria-hidden="true">
            <div className="dot-grid absolute inset-0 opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608] via-transparent to-[#060608]" />
          </div>

          <div className="relative z-30 flex w-full max-w-3xl flex-col items-center px-5 pt-20 pb-24 text-center sm:px-8">
            <Reveal rise className="flex w-full flex-col items-center">
              <div className="font-tech mb-7 inline-flex items-center gap-2 border border-red-500/30 bg-red-950/25 px-3 py-1.5 text-[10px] tracking-[0.25em] text-red-200/90 uppercase select-none">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                Request refused
              </div>

              <ShieldX
                size={44}
                strokeWidth={1.25}
                className="mb-6 text-red-400/80"
                aria-hidden="true"
              />

              <span
                data-text="BLOCKED"
                className="glitch mb-6 inline-block bg-[linear-gradient(115deg,#ffffff_0%,#ffffff_38%,#ffd0d8_66%,#e0245e_100%)] bg-clip-text text-5xl leading-none font-bold tracking-tight text-transparent drop-shadow-lg sm:text-7xl lg:text-8xl"
              >
                BLOCKED
              </span>

              <h1 className="mb-4 text-xl font-normal tracking-tight text-white sm:text-2xl">
                You have been blocked by {brand.name}
              </h1>

              <p className="mb-2 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">
                A request from your connection matched a security rule and was refused
                before it reached the application. Nothing was read, written or sent on.
              </p>
              <p className="max-w-xl text-[13px] leading-relaxed text-white/45">
                If you were doing something ordinary, this is a false positive and{' '}
                {brand.own ? 'we want' : `${brand.name} will want`} to know about it. Quote the
                reference below and it will be lifted.
              </p>
            </Reveal>

            <Reveal rise delay={80} className="mt-10 w-full">
              <div className="border border-[#282832] bg-[#0a0a0d]/85 text-left backdrop-blur-sm">
                <div className="flex items-center justify-between gap-4 border-b border-[#1e1e26] px-4 py-3">
                  <h2 className="font-tech text-[10px] tracking-[0.22em] text-neutral-400 uppercase">
                    Incident record
                  </h2>
                  <button
                    type="button"
                    onClick={copy}
                    className="font-tech inline-flex cursor-pointer items-center gap-1.5 border border-[#282832] px-2.5 py-1.5 text-[10px] tracking-[0.18em] text-neutral-300 uppercase transition-colors hover:border-neutral-600 hover:text-white"
                  >
                    {copied ? (
                      <Check size={12} strokeWidth={2} className="text-emerald-400" />
                    ) : (
                      <Copy size={12} strokeWidth={2} />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <Row icon={Fingerprint} label="Reference">
                  {incident.reference || <span className="text-neutral-600">not supplied</span>}
                </Row>
                <Row icon={ShieldX} label="Rule">
                  {incident.rule ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          SEVERITY_DOT[incident.rule.severity] || SEVERITY_DOT.low
                        }`}
                        aria-hidden="true"
                      />
                      {incident.rule.name}
                      <span className="text-neutral-600">{incident.rule.id}</span>
                    </span>
                  ) : (
                    <span className="text-neutral-600">not supplied</span>
                  )}
                </Row>
                {layer && (
                  <Row icon={Layers} label="Caught at">
                    {layer.name}
                  </Row>
                )}
                <Row icon={Clock} label="Seen">
                  {seen ? stamp(seen) : <span className="text-neutral-600">&mdash;</span>}
                </Row>
              </div>

              {incident.rule && (
                <p className="mt-4 border-l-2 border-red-500/40 pl-4 text-left text-[13px] leading-relaxed text-white/60">
                  {incident.rule.summary}
                </p>
              )}
            </Reveal>

            {remaining !== null && (
              <Reveal rise delay={120} className="mt-6 w-full">
                <div
                  aria-live="polite"
                  className="flex flex-wrap items-center justify-between gap-3 border border-amber-500/25 bg-amber-950/15 px-4 py-3.5 text-left"
                >
                  <span className="font-tech text-[10px] tracking-[0.22em] text-amber-200/80 uppercase">
                    {remaining > 0 ? 'Automatic release in' : 'The hold has expired'}
                  </span>
                  <span className="font-mono text-sm text-amber-100">
                    {remaining > 0 ? countdown(remaining) : 'you can try again now'}
                  </span>
                </div>
              </Reveal>
            )}

            <Reveal rise delay={160} className="mt-12 w-full text-left">
              <h2 className="font-tech mb-6 text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
                Why this usually happens
              </h2>
              <div className="grid grid-cols-1 gap-px bg-[#1e1e26] sm:grid-cols-3">
                {CAUSES.map((cause) => (
                  <div key={cause.title} className="bg-[#060608] p-5">
                    <h3 className="mb-2 text-sm tracking-tight text-white">{cause.title}</h3>
                    <p className="text-[12.5px] leading-relaxed text-white/55">{cause.body}</p>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal rise delay={200} className="mt-12 flex w-full flex-wrap items-center justify-center gap-4">
              <a
                href={brand.contact}
                className="cursor-pointer border border-white px-6 py-3 text-[11px] font-semibold tracking-[0.2em] text-white transition-all hover:bg-white hover:text-black"
              >
                {brand.own ? 'CONTACT THE STUDIO' : 'REPORT THIS'}
              </a>
              {remaining !== null && remaining <= 0 && canGoBack && (
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  className="inline-flex cursor-pointer items-center gap-2 border border-white/20 bg-white/10 px-6 py-3 text-[11px] font-semibold tracking-[0.2em] text-white backdrop-blur-md transition-all hover:bg-white/20"
                >
                  <RotateCw size={13} strokeWidth={2} />
                  TRY AGAIN
                </button>
              )}
              <a
                href="/"
                className="inline-flex cursor-pointer items-center gap-2 px-2 py-3 text-[11px] font-semibold tracking-[0.2em] text-white/60 transition-all hover:text-white"
              >
                <ArrowLeft size={14} strokeWidth={2} />
                BACK TO HOME
              </a>
            </Reveal>

            {brand.credit && (
              <Reveal rise delay={240} className="mt-14 w-full border-t border-[#1e1e26] pt-6">
                <a
                  href="/shield"
                  className="group inline-flex flex-wrap items-center justify-center gap-1.5 text-[11px] tracking-tight text-neutral-500 transition-colors hover:text-neutral-300"
                >
                  <span className="font-mono">
                    Screened by {SHIELD_PACKAGE} {SHIELD_VERSION} · ruleset {RULESET}
                  </span>
                  <ArrowUpRight
                    size={12}
                    strokeWidth={2}
                    className="shrink-0 text-neutral-700 transition-colors group-hover:text-red-400"
                  />
                </a>
              </Reveal>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
