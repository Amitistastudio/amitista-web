import React from 'react';
import { ArrowLeft, ArrowUpRight, Search, CornerDownRight } from 'lucide-react';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { SITE_PAGES } from '../content/searchIndex';
import { PROJECTS } from '../content/projects';
import { closestRoute } from '../lib/closestRoute';
import { openSearch } from '../lib/useCommandPalette';
import { useModifierKey } from '../lib/platform';

const PATH_LIMIT = 48;
const TRACE_STEP_MS = 550;

const GROUPS = [
  { label: 'Studio', items: SITE_PAGES.filter((page) => page.group === 'Studio') },
  {
    label: 'Work',
    items: PROJECTS.map((project) => ({
      title: project.name,
      subtitle: project.kind,
      href: `/work/${project.slug}`,
    })),
  },
  { label: 'Resources', items: SITE_PAGES.filter((page) => page.group === 'Resources') },
  { label: 'Legal', items: SITE_PAGES.filter((page) => page.group === 'Legal') },
];

const ROUTE_COUNT = GROUPS.reduce((sum, group) => sum + group.items.length, 0);

function Trace({ attempted, suggestion }) {
  const lines = React.useMemo(() => {
    const out = [
      { tone: 'text-white/80', prefix: '$ ', text: `trace ${attempted}` },
      { tone: 'text-white/45', prefix: '· ', text: `scanning ${ROUTE_COUNT} routes … no match` },
    ];
    if (suggestion) {
      out.push({ tone: 'text-violet-300/90', prefix: '· ', text: `nearest signal: ${suggestion}` });
    }
    out.push({ tone: 'text-white/45', prefix: '→ ', text: '404 · dead end' });
    return out;
  }, [attempted, suggestion]);

  const [shown, setShown] = React.useState(1);

  React.useEffect(() => {
    setShown(1);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(lines.length);
      return undefined;
    }
    const timer = setInterval(() => {
      setShown((count) => {
        if (count >= lines.length) {
          clearInterval(timer);
          return count;
        }
        return count + 1;
      });
    }, TRACE_STEP_MS);
    return () => clearInterval(timer);
  }, [lines]);

  return (
    <div
      aria-hidden="true"
      className="w-full max-w-md bg-black/40 backdrop-blur-sm border border-white/10 px-4 py-3 mb-8 text-left font-mono text-[12px] sm:text-[13px] leading-relaxed"
    >
      {lines.slice(0, shown).map((line, index) => (
        <div key={line.text} className={`${line.tone} break-all`}>
          <span className="select-none">{line.prefix}</span>
          {line.text}
          {index === shown - 1 && shown < lines.length && (
            <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-white/60 animate-pulse" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function NotFoundPage({ path = '' }) {
  const attempted = path.length > PATH_LIMIT ? `${path.slice(0, PATH_LIMIT)}…` : path || '/';
  const { label: shortcutLabel } = useModifierKey();
  const stage = React.useRef(null);

  const suggestion = React.useMemo(() => closestRoute(path), [path]);
  const suggested = React.useMemo(
    () =>
      suggestion
        ? [...SITE_PAGES, ...GROUPS[1].items].find((page) => page.href === suggestion)
        : null,
    [suggestion],
  );

  const canGoBack = typeof window !== 'undefined' && window.history.length > 1;

  React.useEffect(() => {
    const node = stage.current;
    if (!node) return undefined;
    if (window.matchMedia('(pointer: coarse)').matches) return undefined;
    const follow = (event) => {
      const box = node.getBoundingClientRect();
      node.style.setProperty('--spot-x', `${event.clientX - box.left}px`);
      node.style.setProperty('--spot-y', `${event.clientY - box.top}px`);
    };
    node.addEventListener('mousemove', follow);
    return () => node.removeEventListener('mousemove', follow);
  }, []);

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />

      <div className="w-full flex flex-col items-center bg-[#060608] flex-1">
        <main
          id="main"
          tabIndex={-1}
          ref={stage}
          className="w-full max-w-[1480px] flex-1 border-x border-[#282832] relative flex flex-col items-center justify-center text-center overflow-hidden focus:outline-none"
        >
          <div className="absolute inset-0 dot-grid pointer-events-none z-0 opacity-70" />
          <div className="absolute inset-0 spotlight pointer-events-none z-1" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060608] via-transparent to-[#060608]/80 pointer-events-none z-2" />
          <div className="absolute inset-0 scanlines pointer-events-none z-3 opacity-40" />

          <span
            aria-hidden="true"
            className="ghost-word absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-bold leading-none tracking-tight text-[42vw] sm:text-[34vw] lg:text-[420px] z-4 pointer-events-none"
          >
            404
          </span>

          <div className="relative z-30 max-w-2xl px-6 flex flex-col items-center py-20 sm:py-24">
            <span className="inline-flex items-center gap-2 text-[10px] sm:text-xs font-semibold text-white/70 tracking-[0.35em] mb-6">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              LOST SIGNAL
            </span>

            <h1 className="text-3xl sm:text-5xl font-normal text-white tracking-tight leading-tight mb-4">
              This page doesn&rsquo;t exist.
            </h1>
            <p className="text-sm sm:text-base text-white/75 font-normal max-w-md leading-relaxed mb-8">
              The address moved, or the link that brought you here was wrong.
              Nothing is broken on your end.
            </p>

            <Trace attempted={attempted} suggestion={suggestion} />

            {suggested && (
              <a
                href={suggested.href}
                className="w-full max-w-md mb-8 border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 hover:border-violet-400/60 backdrop-blur-sm px-4 py-3.5 flex items-center gap-3 text-left transition-all group"
              >
                <CornerDownRight size={15} strokeWidth={2} className="text-violet-300 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-semibold text-violet-300/80 tracking-[0.2em] uppercase mb-0.5">
                    Did you mean
                  </span>
                  <span className="block text-sm text-white truncate">
                    {suggested.title}
                    <span className="text-white/40 font-mono text-[12px]"> {suggested.href}</span>
                  </span>
                </span>
                <ArrowUpRight
                  size={15}
                  strokeWidth={2}
                  className="text-violet-300/60 shrink-0 group-hover:text-violet-300 transition-colors"
                />
              </a>
            )}

            <div className="flex flex-wrap items-center justify-center gap-4">
              <a
                href="/"
                className="border border-white hover:bg-white hover:text-black text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer"
              >
                BACK TO HOME
              </a>
              <button
                type="button"
                onClick={openSearch}
                className="bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <Search size={13} strokeWidth={2} />
                SEARCH
                <span className="hidden sm:inline text-white/40 font-normal tracking-[0.1em]">
                  {shortcutLabel}
                </span>
              </button>
              {canGoBack && (
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  className="text-white/60 hover:text-white font-semibold text-[11px] tracking-[0.2em] px-2 py-3 transition-all cursor-pointer inline-flex items-center gap-2"
                >
                  <ArrowLeft size={14} strokeWidth={2} />
                  GO BACK
                </button>
              )}
            </div>
          </div>
        </main>

        <section className="w-full max-w-[1480px] border-x border-t border-[#222228] bg-[#060608] relative z-20">
          <div className="px-6 sm:px-10 md:px-16 lg:px-20 pt-12 pb-6 flex items-baseline justify-between gap-4 flex-wrap">
            <h2 className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase">
              Everything on the site
            </h2>
            <span className="text-[11px] text-neutral-700 font-mono">{ROUTE_COUNT} destinations</span>
          </div>
          <div className="px-6 sm:px-10 md:px-16 lg:px-20 pb-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-10">
            {GROUPS.map((group) => (
              <nav key={group.label} className="flex flex-col">
                <h3 className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-5">
                  {group.label}
                </h3>
                <ul className="flex flex-col gap-3.5">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <a href={item.href} className="group/page block text-left">
                        <span className="flex items-center gap-1.5 text-[13px] sm:text-sm text-neutral-300 group-hover/page:text-white transition-colors tracking-tight">
                          {item.title}
                          <ArrowUpRight
                            size={12}
                            strokeWidth={2}
                            className="text-neutral-700 group-hover/page:text-violet-400 transition-colors shrink-0"
                          />
                        </span>
                        <span className="block text-[11px] text-muted leading-relaxed mt-0.5">
                          {item.subtitle}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
}
