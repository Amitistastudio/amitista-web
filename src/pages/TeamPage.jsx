import React from 'react';
import {
  Layout,
  Server,
  Gamepad2,
  PenTool,
  Code2,
  Globe,
  Users,
} from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import ResponsiveImage from '../components/ResponsiveImage';
import OutboundLink from '../components/OutboundLink';
import DiscordMark from '../components/DiscordMark';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { TEAM, STACK } from '../content/team';
import { DISCORD_INVITE, GITHUB_ORG, CONTACT_EMAIL } from '../siteConfig';

function GithubMark(props) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function siteLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function initials(name) {
  const letters = name
    .replace(/[[\]]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2);
  return letters.toUpperCase() || '—';
}

const STACK_ICONS = {
  'Front-end': Layout,
  'Back-end': Server,
  'Game servers': Gamepad2,
  'Design & tooling': PenTool,
};

const COLUMNS = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4',
};

function Portrait({ person, sizes, className = '', eager = false }) {
  const [failed, setFailed] = React.useState(false);
  const showImage = Boolean(person.avatar) && !failed;

  return (
    <div
      className={`overflow-hidden bg-[#0f0f14] flex items-center justify-center ${className}`}
    >
      {showImage ? (
        <ResponsiveImage
          src={person.avatar}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
          onError={() => setFailed(true)}
          sizes={sizes}
          pictureClassName="block w-full h-full"
          className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-[1.02] transition-all duration-500"
        />
      ) : (
        <span className="text-4xl font-light text-neutral-700 tracking-[0.1em] select-none">
          {initials(person.name)}
        </span>
      )}
    </div>
  );
}

const DIAGONAL = [
  {
    cut: 'cut-top-left',
    label: 'top-4 left-4',
  },
  {
    cut: 'cut-bottom-right',
    label: 'bottom-4 right-4',
  },
];

function PairAvatar({ people, eager = false }) {
  return (
    <div className="relative w-full aspect-square overflow-hidden bg-[#0f0f14]">
      {people.slice(0, 2).map((person, i) => {
        const cut = DIAGONAL[i];
        return (
          <div key={person.name} className={`absolute inset-0 ${cut.cut}`}>
            <Portrait
              person={person}
              eager={eager && i === 0}
              sizes="(min-width: 768px) 480px, (min-width: 640px) 70vw, 140vw"
              className={`absolute inset-0 ${person.aim ?? ''}`}
            />
          </div>
        );
      })}

      <div className="absolute top-1/2 left-1/2 w-[142%] h-px bg-[#282832] -translate-x-1/2 -translate-y-1/2 -rotate-45 pointer-events-none" />

      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0a0a0d] to-transparent pointer-events-none" />

      {people.slice(0, 2).map((person, i) => (
        <span
          key={person.name}
          className={`absolute ${DIAGONAL[i].label} z-10 border border-[#222228] bg-[#0a0a0d]/80 px-2 py-1 text-[10px] font-semibold text-neutral-300 tracking-[0.18em] uppercase select-none pointer-events-none`}
        >
          {person.name}
        </span>
      ))}
    </div>
  );
}

function Avatar({ member, eager = false }) {
  if (member.people?.length > 1) return <PairAvatar people={member.people} eager={eager} />;

  const person = member.people?.[0] ?? member;

  return (
    <div className="relative w-full aspect-square overflow-hidden">
      <Portrait
        person={person}
        eager={eager}
        sizes="(min-width: 768px) 341px, (min-width: 640px) 50vw, 100vw"
        className="w-full h-full"
      />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0a0a0d] to-transparent pointer-events-none" />
    </div>
  );
}

function MemberTile({ member, index }) {
  return (
    <div className="bg-[#0a0a0d] flex flex-col text-left group hover:bg-[#0c0c10] transition-colors duration-300">
      <Avatar member={member} eager={index === 0} />

      <div className="p-8 pt-6 flex flex-col flex-1">
        <span className="text-xs font-semibold text-muted tracking-wider mb-2 select-none">
          {String(index + 1).padStart(3, '0')}
        </span>
        <h2 className="text-xl sm:text-2xl font-medium text-white tracking-tight leading-tight mb-2 truncate">
          {member.name}
        </h2>
        <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-4">
          {member.role}
        </span>
        <p className="text-xs sm:text-[13px] text-neutral-400 font-normal leading-relaxed flex-1">
          {member.focus}
        </p>

        {(member.github || member.site) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 mt-6 pt-5 border-t border-[#1c1c22]">
            {member.github && (
              <OutboundLink
                icon={GithubMark}
                label={member.github}
                href={`https://github.com/${member.github}`}
              />
            )}
            {member.site && (
              <OutboundLink
                icon={Globe}
                label={siteLabel(member.site)}
                href={member.site}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TeamPage() {
  const columns = COLUMNS[TEAM.length] ?? COLUMNS[3];

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
                TEAM
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[72px] font-normal text-white tracking-tight leading-none mb-6 max-w-4xl">
                Who you work with
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[540px] text-center leading-relaxed mb-16 tracking-tight">
                A small team, which is the point. You talk to the people writing the
                code, not to someone relaying it for them.
              </p>
            </Reveal>

            <div className="w-full max-w-5xl flex flex-col">
              <Reveal
                className={`grid ${columns} gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]`}
              >
                {TEAM.map((member, index) => (
                  <MemberTile
                    key={member.name + member.role}
                    member={member}
                    index={index}
                  />
                ))}
              </Reveal>

              <Reveal className="grid grid-cols-1 md:grid-cols-2 gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]">
                <div className="bg-[#0a0a0d] p-8 flex flex-col justify-center text-left min-h-[220px] hover:bg-[#0c0c10] transition-colors duration-300 group">
                  <Users
                    size={26}
                    strokeWidth={1.5}
                    className="text-muted mb-5 group-hover:text-violet-400 group-hover:scale-105 transition-all duration-300"
                  />
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-4">
                    One team, start to finish
                  </h3>
                  <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
                    The same people scope your project, build it and support it
                    afterwards. Nothing gets handed to a department that was not in
                    the room.
                  </p>
                </div>
                <div className="bg-[#0a0a0d] p-8 flex flex-col justify-center text-left min-h-[220px] hover:bg-[#0c0c10] transition-colors duration-300 group">
                  <Code2
                    size={26}
                    strokeWidth={1.5}
                    className="text-muted mb-5 group-hover:text-violet-400 group-hover:scale-105 transition-all duration-300"
                  />
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-4">
                    The work is public
                  </h3>
                  <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
                    The profiles above link straight to our GitHub accounts. You
                    can read what we write before you decide to hire us.
                  </p>
                </div>
              </Reveal>

              <Reveal className="w-full border-t border-x border-[#282832] bg-[#0a0a0d] h-14 px-8 flex items-center">
                <span className="text-[11px] font-semibold text-muted tracking-[0.2em]">
                  WHAT WE WORK WITH
                </span>
              </Reveal>

              <Reveal
                delay={80}
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]"
              >
                {STACK.map((group) => {
                  const Icon = STACK_ICONS[group.area] ?? Code2;
                  return (
                    <div
                      key={group.area}
                      className="bg-[#0a0a0d] p-8 flex flex-col text-left min-h-[220px] hover:bg-[#0c0c10] transition-colors duration-300 group"
                    >
                      <Icon
                        size={26}
                        strokeWidth={1.5}
                        className="text-muted mb-5 group-hover:text-violet-400 group-hover:scale-105 transition-all duration-300"
                      />
                      <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-4">
                        {group.area}
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
                  );
                })}
              </Reveal>

              {(GITHUB_ORG || DISCORD_INVITE) && (
                <div
                  className={`grid grid-cols-1 ${
                    GITHUB_ORG && DISCORD_INVITE ? 'md:grid-cols-2' : ''
                  } gap-[1px] bg-[#282832] w-full border-t border-x border-[#282832]`}
                >
                  {GITHUB_ORG && (
                    <a
                      href={`https://github.com/${GITHUB_ORG}`}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-[#0a0a0d] p-8 flex flex-col justify-center text-left min-h-[180px] hover:bg-[#0c0c10] transition-colors duration-300 group"
                    >
                      <GithubMark className="w-5 h-5 text-muted mb-5 group-hover:text-violet-400 transition-colors duration-300" />
                      <h3 className="text-lg sm:text-xl font-medium text-white tracking-tight mb-2">
                        The studio on GitHub
                      </h3>
                      <p className="text-sm text-neutral-400 font-normal leading-relaxed">
                        Shared repositories and anything we have open sourced.
                      </p>
                    </a>
                  )}
                  {DISCORD_INVITE && (
                    <a
                      href={DISCORD_INVITE}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-[#0a0a0d] p-8 flex flex-col justify-center text-left min-h-[180px] hover:bg-[#0c0c10] transition-colors duration-300 group"
                    >
                      <DiscordMark
                        size={20}
                        className="text-muted mb-5 group-hover:text-violet-400 transition-colors duration-300"
                      />
                      <h3 className="text-lg sm:text-xl font-medium text-white tracking-tight mb-2">
                        Reach us on Discord
                      </h3>
                      <p className="text-sm text-neutral-400 font-normal leading-relaxed">
                        Join the server and open a ticket, or email{' '}
                        <span className="text-neutral-300">{CONTACT_EMAIL}</span>.
                      </p>
                    </a>
                  )}
                </div>
              )}

              <Reveal className="w-full flex">
              <a
                href="/contact"
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
                  <h3 className="text-2xl sm:text-3xl font-medium text-white tracking-tight mb-2">
                    Start a project
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
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
