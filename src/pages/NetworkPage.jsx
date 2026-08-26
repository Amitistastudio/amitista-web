import React from 'react';
import { Globe2, Server, ShieldCheck, Timer } from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import CtaPanel from '../components/CtaPanel';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import LatencyConsole from '../components/network/LatencyConsole';
import ConnectionBreakdown from '../components/network/ConnectionBreakdown';
import { HOSTING_CITY, HOSTING_PROVIDER, STUDIO_NAME } from '../siteConfig';

const STACK = [
  {
    icon: Globe2,
    title: 'One machine, named',
    body: `A virtual server we rent from ${HOSTING_PROVIDER} and administer ourselves, in ${HOSTING_CITY}. Not a platform, not a CDN with thirty edges and no address — one box, in a city we will tell you the name of, which is why the distance on the globe above is a real number rather than "wherever your nearest edge is".`,
  },
  {
    icon: ShieldCheck,
    title: 'TLS terminated on it',
    body: 'The certificate is ours and renews itself. Encryption ends at our nginx rather than at somebody else\'s proxy, so there is no third party in the middle of the connection you just measured — which is also why that measurement means anything.',
  },
  {
    icon: Server,
    title: 'Static files, swapped atomically',
    body: 'Every page on this site is a file on disk that nginx reads directly. A release is built somewhere else and put in a new directory, and going live is moving one symlink — so a deploy is instant, and undoing one is moving it back rather than rebuilding under pressure.',
  },
  {
    icon: Timer,
    title: 'Checked every five minutes, backed up nightly',
    body: 'A timer on the box tests that the site answers, that the enquiry form still reaches a person and that the certificate has time left, and it restarts what it can when the answer is no. A second one takes a dated archive of the site and its configuration every night and keeps a fortnight of them.',
  },
];

export default function NetworkPage() {
  React.useEffect(() => {
    const previous = document.title;
    document.title = `The network — ${STUDIO_NAME}`;
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
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[560px]">
            <Silk
              color="#8864f2"
              speed={3.5}
              scale={1.5}
              noiseIntensity={1.3}
              rotation={0.25}
              fadeEdge={true}
              className="absolute inset-0 h-full w-full opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608]/25 via-[#060608]/65 to-[#060608]" />
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-[500px] bottom-0 z-0">
            <div className="dot-grid absolute inset-0 opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608] via-transparent to-[#060608]" />
          </div>

          <div className="relative z-30 flex w-full flex-col items-center px-6 pt-24 pb-24 sm:px-10 md:px-16 lg:px-20">
            <Reveal rise className="flex w-full flex-col items-center">
              <div className="mb-6 inline-flex items-center justify-center rounded-full border border-[#222228] bg-[#111115]/50 px-4 py-1.5 text-xs font-medium text-neutral-300 transition-all select-none hover:bg-[#15151a] sm:text-[13px]">
                THE NETWORK
              </div>
              <h1 className="mb-6 max-w-4xl text-4xl leading-none font-normal tracking-tight text-white sm:text-5xl md:text-6xl lg:text-[72px]">
                How far away
                <br />
                we are
              </h1>
              <p className="mb-16 max-w-[580px] text-center text-sm leading-relaxed font-normal tracking-tight text-neutral-400 sm:text-base">
                The site you are reading is served by one machine in {HOSTING_CITY}. This
                page draws the line between there and wherever you are sitting, times
                it on your own connection, and then shows you how much of the result
                is physics and how much is us. Nothing here is a screenshot of a
                benchmark we ran on a good day.
              </p>
            </Reveal>

            <div className="flex w-full max-w-5xl flex-col gap-16">
              <Reveal rise id="latency" className="flex w-full scroll-mt-24 flex-col">
                <div className="flex w-full flex-col border border-[#282832] bg-[#0a0a0d] p-8 text-left">
                  <Globe2 size={26} strokeWidth={1.5} className="mb-5 text-muted" aria-hidden="true" />
                  <span className="font-tech mb-3 text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
                    Latency
                  </span>
                  <h2 className="mb-3 text-2xl font-medium tracking-tight text-white sm:text-3xl">
                    Your ping to Frankfurt, measured now
                  </h2>
                  <p className="max-w-[62ch] text-sm leading-relaxed font-normal text-neutral-400 sm:text-[15px]">
                    Press the button and the page fetches a four-byte file from our
                    server twelve times in a row, timing each one. What comes back is
                    the round trip your connection actually has to this site — the same
                    number that decides whether a dashboard feels immediate or slightly
                    behind your hand, and the one that matters most if what you run is
                    a game server.
                  </p>
                </div>

                <LatencyConsole />
              </Reveal>

              <Reveal rise id="arrival" className="flex w-full scroll-mt-24 flex-col">
                <div className="flex w-full flex-col border border-[#282832] bg-[#0a0a0d] p-8 text-left">
                  <Timer size={26} strokeWidth={1.5} className="mb-5 text-muted" aria-hidden="true" />
                  <span className="font-tech mb-3 text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
                    This page
                  </span>
                  <h2 className="mb-3 text-2xl font-medium tracking-tight text-white sm:text-3xl">
                    What it cost you to open this
                  </h2>
                  <p className="max-w-[62ch] text-sm leading-relaxed font-normal text-neutral-400 sm:text-[15px]">
                    Your browser timed this page arriving and has been holding the
                    numbers since. Below is that load, split into the five things that
                    had to happen — and on most connections the two handshakes at the
                    front are a bigger share of it than the page itself.
                  </p>
                </div>

                <ConnectionBreakdown />
              </Reveal>

              <Reveal rise id="stack" className="flex w-full scroll-mt-24 flex-col">
                <div className="flex w-full flex-col border-x border-t border-[#282832] bg-[#0a0a0d] p-8 text-left">
                  <Server size={26} strokeWidth={1.5} className="mb-5 text-muted" aria-hidden="true" />
                  <span className="font-tech mb-3 text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
                    The other end
                  </span>
                  <h2 className="mb-3 text-2xl font-medium tracking-tight text-white sm:text-3xl">
                    What answers when you knock
                  </h2>
                  <p className="max-w-[62ch] text-sm leading-relaxed font-normal text-neutral-400 sm:text-[15px]">
                    Four facts about the machine on the other end of that arc. This is
                    also roughly what we set up for a client who asks us to host what
                    we built them, which is why it is worth writing down rather than
                    summarising as "managed hosting".
                  </p>
                </div>

                <div className="grid grid-cols-1 border-x border-b border-[#282832] bg-[#08080b] sm:grid-cols-2">
                  {STACK.map(({ icon: Icon, title, body }, index) => (
                    <div
                      key={title}
                      className={`flex flex-col p-8 text-left ${
                        index % 2 === 0 ? 'sm:border-r sm:border-[#282832]' : ''
                      } ${index < STACK.length - 1 ? 'border-b border-[#282832]' : ''} ${
                        index === STACK.length - 2 ? 'sm:border-b-0' : ''
                      }`}
                    >
                      <Icon size={20} strokeWidth={1.5} className="mb-4 text-violet-400" aria-hidden="true" />
                      <h3 className="mb-2.5 text-[15px] font-medium tracking-tight text-white">
                        {title}
                      </h3>
                      <p className="text-[13px] leading-relaxed text-neutral-400">{body}</p>
                    </div>
                  ))}
                </div>

                <div className="w-full border-x border-b border-[#282832] bg-[#08080b] px-8 py-4">
                  <p className="font-tech text-left text-[11px] leading-relaxed text-neutral-500">
                    Real: this is the machine serving the page you are on, described
                    without versions, ports or paths on purpose. Whether it is up right
                    now is on <a href="/status" className="text-neutral-400 underline underline-offset-4 hover:text-white">the status page</a>, which is
                    written by a timer on the box rather than by us.
                  </p>
                </div>
              </Reveal>

              <Reveal delay={80} className="flex w-full flex-col">
                <div className="flex w-full flex-col border-x border-t border-[#282832] bg-[#0a0a0d] p-8 text-left">
                  <span className="font-tech mb-4 text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
                    Why this page exists
                  </span>
                  <p className="max-w-[62ch] text-sm leading-relaxed font-normal text-neutral-400 sm:text-[15px]">
                    Hosting is the part of a project a client is least able to check and
                    most often quietly overcharged for. So here is the whole of our side
                    of it, in numbers you took yourself: where the machine is, how far
                    that is from you, what the trip costs, and how much of that we could
                    do anything about. If the number you got is worse than you expected,
                    tell us — where you are in the world is a thing we can design
                    around, and it is a better conversation to have before a project
                    than after one.
                  </p>
                </div>

                <CtaPanel
                  title="Want this measured for your own site?"
                  body="Tell us where your users are and we'll tell you where the server should be."
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
