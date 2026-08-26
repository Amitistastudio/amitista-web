import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import ResponsiveImage from '../components/ResponsiveImage';
import DiscordMark from '../components/DiscordMark';
import {
  PARTNER,
  HERO_LEAD,
  OUR_BOT_INTRO,
  OUR_BOT,
  REFUSAL_LINE,
  PARTNER_BODY,
  CLOSING,
} from '../content/bots';
import { PARTNER_LIVE } from '../content/partnerLive';
import { STUDIO_NAME } from '../siteConfig';

function count(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const FIGURES = [
  { key: 'members', label: 'Members', value: PARTNER_LIVE.members },
  { key: 'online', label: 'Online', value: PARTNER_LIVE.online, live: true },
  { key: 'boosts', label: 'Boosts', value: PARTNER_LIVE.boosts },
].filter((figure) => typeof figure.value === 'number');

const BAND_FIGURES = [
  { key: 'years', label: 'Years building bots', text: PARTNER.years },
  ...FIGURES.map((figure) => ({ ...figure, text: count(figure.value) })),
];

const CHECKED = new Date(`${PARTNER_LIVE.checked}T00:00:00Z`).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const PAD = 'px-6 sm:px-10 md:px-16 lg:px-20';

function Eyebrow({ children, tone = 'sky' }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`h-4 w-[3px] -skew-x-12 ${tone === 'sky' ? 'bg-sky-400' : 'bg-[#3a3a48]'}`}
      />
      <span
        className={`font-tech text-[10px] tracking-[0.28em] uppercase ${
          tone === 'sky' ? 'text-sky-300/80' : 'text-neutral-500'
        }`}
      >
        {children}
      </span>
    </div>
  );
}

export default function BotsPage() {
  React.useEffect(() => {
    const previous = document.title;
    document.title = `Discord bots — ${STUDIO_NAME}`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#060608] font-sans text-white selection:bg-sky-500 selection:text-white">
      <Header />

      <main
        id="main"
        tabIndex={-1}
        className="flex w-full flex-1 justify-center bg-[#060608] focus:outline-none"
      >
        <section className="relative flex w-full max-w-[1480px] flex-col items-stretch border-x border-[#282832] text-left">
          <div className="relative w-full overflow-hidden">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
              <Silk
                color="#1585f2"
                speed={4}
                scale={1.7}
                noiseIntensity={1.3}
                rotation={0.25}
                fadeEdge={true}
                className="absolute inset-0 h-full w-full opacity-30"
              />
              <div className="eb-glow absolute inset-0" />
              <div className="absolute inset-0 bg-gradient-to-b from-[#060608]/30 via-[#060608]/60 to-[#060608]" />
            </div>

            <div
              className={`relative z-10 grid w-full grid-cols-1 gap-14 pt-28 pb-24 lg:grid-cols-12 lg:gap-10 ${PAD}`}
            >
              <Reveal rise className="flex flex-col items-start lg:col-span-6">
                <Eyebrow>Premium partnership</Eyebrow>

                <h1 className="mb-7 text-4xl leading-[0.95] font-normal tracking-tight text-white sm:text-5xl md:text-6xl lg:text-[62px]">
                  We don&rsquo;t build bots.
                  <br />
                  <span className="text-sky-400">{PARTNER.name} do.</span>
                </h1>

                <p className="max-w-[46ch] text-[15px] leading-[1.75] font-normal text-neutral-400 sm:text-[16px]">
                  {HERO_LEAD}
                </p>
              </Reveal>

              <Reveal delay={80} className="lg:col-span-5 lg:col-start-8">
                <aside className="eb-card relative flex flex-col overflow-hidden border border-sky-500/25">
                  {PARTNER_LIVE.banner && (
                    <div className="relative h-[118px] w-full overflow-hidden sm:h-[142px]">
                      <ResponsiveImage
                        src={PARTNER_LIVE.banner}
                        sizes="(max-width: 1024px) 100vw, 520px"
                        pictureClassName="block h-full w-full"
                        alt=""
                        aria-hidden="true"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-[#060b12]/40" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#070c14] via-[#070c14]/55 to-transparent" />
                    </div>
                  )}

                  <div className="relative flex flex-1 flex-col px-6 pb-6 sm:px-7 sm:pb-7">
                    <div className="-mt-10 mb-6 flex items-end justify-between gap-4">
                      <div className="border border-sky-400/30 bg-[#060c15] p-1.5 shadow-[0_18px_40px_-24px_rgba(21,133,242,0.9)]">
                        <ResponsiveImage
                          src={PARTNER_LIVE.icon ?? PARTNER.logo}
                          sizes="72px"
                          pictureClassName="block"
                          alt={`${PARTNER.name} server icon`}
                          className="h-16 w-16 object-cover"
                        />
                      </div>
                      <span className="font-tech mb-1 border border-sky-400/30 px-2.5 py-1 text-[9px] tracking-[0.2em] text-sky-200/90 uppercase">
                        Premium partner
                      </span>
                    </div>

                    <ResponsiveImage
                      src={PARTNER.wordmark}
                      sizes="(max-width: 640px) 220px, 240px"
                      pictureClassName="block"
                      alt={PARTNER.name}
                      className="mb-6 h-auto w-[220px] max-w-full object-contain sm:w-[240px]"
                    />

                    {FIGURES.length > 0 && (
                      <dl className="mb-6 grid grid-cols-3 gap-4 border-y border-sky-500/15 py-4">
                        {FIGURES.map((figure) => (
                          <div key={figure.key} className="flex flex-col">
                            <dd className="mb-1 text-[19px] font-normal tracking-tight text-white tabular-nums">
                              {count(figure.value)}
                            </dd>
                            <dt className="font-tech flex items-center gap-1.5 text-[9.5px] tracking-[0.2em] text-neutral-500 uppercase">
                              {figure.live && (
                                <span
                                  aria-hidden="true"
                                  className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                                />
                              )}
                              {figure.label}
                            </dt>
                          </div>
                        ))}
                      </dl>
                    )}

                    <a
                      href={PARTNER.invite}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="eb-cta group flex items-center justify-between gap-4 bg-sky-500 px-5 py-3.5 text-[11px] font-semibold tracking-[0.18em] text-[#04101d] hover:bg-sky-300"
                    >
                      <span className="flex items-center gap-2.5">
                        <DiscordMark className="h-3.5 w-3.5 shrink-0" />
                        JOIN {PARTNER.inviteLabel.toUpperCase()}
                      </span>
                      <ArrowUpRight
                        size={14}
                        strokeWidth={2.5}
                        className="shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      />
                    </a>

                    <p className="font-tech mt-3 text-[9.5px] tracking-[0.16em] text-neutral-600 uppercase">
                      Read from the invite on {CHECKED}
                    </p>
                  </div>
                </aside>
              </Reveal>
            </div>
          </div>

          <div className={`w-full border-t border-[#1b1b22] py-20 ${PAD}`}>
            <Reveal className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
              <div className="lg:col-span-3">
                <Eyebrow tone="neutral">Our own bot</Eyebrow>
                <h2 className="text-2xl leading-tight font-normal tracking-tight text-white sm:text-3xl">
                  The one we have,
                  <br />
                  and whose it is
                </h2>
              </div>

              <div className="lg:col-span-8 lg:col-start-5">
                <p className="max-w-[68ch] text-[15px] leading-[1.75] text-neutral-400">
                  {OUR_BOT_INTRO}
                </p>

                <dl className="mt-10 flex flex-col">
                  {OUR_BOT.map((row) => (
                    <div
                      key={row.label}
                      className="grid grid-cols-1 gap-2 border-t border-[#17171d] py-7 sm:grid-cols-12 sm:gap-8"
                    >
                      <dt className="font-tech pt-1 text-[10px] tracking-[0.22em] text-neutral-500 uppercase sm:col-span-4">
                        {row.label}
                      </dt>
                      <dd className="max-w-[62ch] text-[14.5px] leading-[1.75] text-neutral-300 sm:col-span-8">
                        {row.body}
                      </dd>
                    </div>
                  ))}
                </dl>

                <p className="mt-10 max-w-[68ch] border-t border-[#17171d] pt-8 text-[14.5px] leading-[1.75] text-neutral-500">
                  {REFUSAL_LINE}
                </p>
              </div>
            </Reveal>
          </div>

          <div className={`eb-band relative w-full overflow-hidden py-24 ${PAD}`}>
            <div aria-hidden="true" className="eb-beam absolute inset-x-0 top-0 h-px" />
            <ResponsiveImage
              src={PARTNER_LIVE.icon ?? PARTNER.logo}
              sizes="520px"
              pictureClassName="pointer-events-none absolute -top-20 -right-24 hidden select-none xl:block"
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="w-[520px] opacity-[0.06]"
            />

            <div className="relative grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-10">
              <Reveal className="lg:col-span-7">
                <div className="mb-8 flex items-center gap-5 sm:gap-6">
                  <ResponsiveImage
                    src={PARTNER_LIVE.icon ?? PARTNER.logo}
                    sizes="(max-width: 640px) 64px, 88px"
                    pictureClassName="block shrink-0"
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="h-16 w-16 border border-sky-400/25 object-cover sm:h-[88px] sm:w-[88px]"
                  />
                  <h2 className="text-3xl leading-none font-normal tracking-tight text-white sm:text-4xl lg:text-[44px]">
                    Essential <span className="text-sky-400">Bots</span>
                  </h2>
                </div>

                <div className="flex flex-col gap-5">
                  {PARTNER_BODY.map((paragraph) => (
                    <p
                      key={paragraph.slice(0, 28)}
                      className="max-w-[58ch] text-[15px] leading-[1.75] text-neutral-300"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={70} className="flex flex-col lg:col-span-4 lg:col-start-9">
                <dl className="grid grid-cols-2 gap-6 border-t border-sky-500/15 pt-6">
                  {BAND_FIGURES.map((figure) => (
                    <div key={figure.key} className="flex flex-col">
                      <dd className="mb-1 text-[26px] font-normal tracking-tight text-sky-300 tabular-nums">
                        {figure.text}
                      </dd>
                      <dt className="font-tech flex items-center gap-1.5 text-[9.5px] tracking-[0.18em] text-neutral-500 uppercase">
                        {figure.live && (
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                          />
                        )}
                        {figure.label}
                      </dt>
                    </div>
                  ))}
                </dl>

                <p className="font-tech mt-5 text-[9.5px] leading-relaxed tracking-[0.16em] text-neutral-600 uppercase">
                  Read from {PARTNER.inviteLabel} on {CHECKED}
                </p>

                <a
                  href={PARTNER.invite}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group mt-10 flex items-baseline justify-between gap-6 border-t border-sky-400/35 pt-5 transition-colors hover:border-sky-300"
                >
                  <span className="flex items-baseline gap-3 text-2xl font-normal tracking-tight text-white">
                    <DiscordMark className="h-4 w-4 shrink-0 translate-y-[2px] text-sky-300" />
                    {PARTNER.inviteLabel}
                  </span>
                  <ArrowUpRight
                    size={20}
                    strokeWidth={1.75}
                    className="shrink-0 translate-y-1 text-sky-300 transition-transform duration-300 group-hover:translate-x-1 group-hover:translate-y-0"
                  />
                </a>
              </Reveal>
            </div>
          </div>

          <div className={`w-full py-16 ${PAD}`}>
            <Reveal>
              <p className="max-w-[68ch] text-[15px] leading-[1.75] text-neutral-400">{CLOSING}</p>
              <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3">
                <a
                  href="/contact"
                  className="font-tech inline-flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-neutral-300 uppercase transition-colors hover:text-white"
                >
                  Start a project
                  <ArrowUpRight size={12} strokeWidth={2} />
                </a>
                <a
                  href="/what-we-dont-take-on"
                  className="font-tech inline-flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-neutral-500 uppercase transition-colors hover:text-white"
                >
                  What else we turn down
                  <ArrowUpRight size={12} strokeWidth={2} />
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
