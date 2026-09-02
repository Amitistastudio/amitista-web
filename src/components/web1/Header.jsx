import React from 'react';
import { Menu, X, ChevronDown, ArrowUpRight, Search, Lock } from 'lucide-react';
import { PROJECTS } from '../../content/projects';
import { SERVICES } from '../../content/services';
import { DISCORD_INVITE } from '../../siteConfig';
import useCommandPalette from '../../lib/useCommandPalette';
import { useModifierKey } from '../../lib/platform';
import { initialPath, normalizePath, PathContext } from '../../lib/routePath';
import { onFirstInteraction } from '../../lib/interaction';
import ResponsiveImage from '../ResponsiveImage';
import DiscordMark from '../DiscordMark';

const CommandPalette = React.lazy(() => import('../CommandPalette'));

let warmed = false;
function warmPalette() {
  if (warmed) return;
  warmed = true;
  import('../CommandPalette');
}

const NAV_LINKS = [
  {
    label: 'WORK',
    href: '/work',
    match: '/work',
    items: PROJECTS.map((project) => ({
      href: `/work/${project.slug}`,
      title: project.name,
      subtitle: project.kind,
      image: project.cover,
    })),
    footer: { href: '/work', label: 'ALL WORK' },
  },
  {
    label: 'SERVICES',
    href: '/services',
    match: ['/services', '/bots'],
    items: [
      ...SERVICES.map((service) => ({
        href: `/services#${service.slug}`,
        title: service.name,
        subtitle: service.blurb,
      })),
      {
        href: '/bots',
        title: 'Discord bots',
        subtitle: 'Not work we take, and the partner we send it to',
      },
    ],
    footer: { href: '/services', label: 'ALL SERVICES' },
  },
  { label: 'PROCESS', href: '/process', match: '/process' },
  { label: 'TEAM', href: '/team', match: '/team' },
  {
    label: 'RESOURCES',
    href: '/docs',
    match: ['/docs', '/faq', '/status', '/api', '/shield'],
    items: [
      {
        href: '/docs',
        title: 'Documentation',
        subtitle: 'Handover, deployment, DNS and maintenance',
      },
      {
        href: '/shield',
        title: 'Shield',
        subtitle: 'Security for Express that runs inside your own app',
      },
      {
        href: '/api',
        title: 'API',
        subtitle: 'The rules Shield enforces, readable as JSON',
      },
      { href: '/faq', title: 'FAQ', subtitle: 'Cost, scope and who owns the result' },
    ],
    footer: DISCORD_INVITE
      ? { href: DISCORD_INVITE, label: 'JOIN THE DISCORD', external: true, icon: DiscordMark }
      : { href: '/docs', label: 'ALL DOCUMENTATION' },
  },
];

const normalize = normalizePath;

function useCurrentPath() {
  const routed = React.useContext(PathContext);
  const [path, setPath] = React.useState(initialPath);

  React.useEffect(() => {
    const update = () => setPath(normalize(window.location.pathname));
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  return routed ?? path;
}

function isActive(link, currentPath) {
  if (!link.match) return false;
  return [].concat(link.match).some(
    (match) => currentPath === match || currentPath.startsWith(`${match}/`),
  );
}

function externalProps(external) {
  return external ? { target: '_blank', rel: 'noreferrer noopener' } : {};
}

const linkClasses =
  'relative flex h-8 items-center gap-1.5 px-3 text-[10px] font-semibold tracking-[0.14em] transition-[color,background-color] duration-200';

function ActiveBar({ shown }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute bottom-0 left-3 right-3 h-px transition-[opacity,transform] duration-200 ${
        shown ? 'translate-y-0 bg-violet-400 opacity-100' : 'translate-y-0.5 opacity-0'
      }`}
    />
  );
}

function NavMenu({ link, active }) {
  return (
    <div className="relative group/menu">
      <a
        href={link.href}
        aria-current={active ? 'page' : undefined}
        className={`${linkClasses} ${
          active
            ? 'bg-white/[0.055] text-white'
            : 'text-neutral-500 hover:bg-white/[0.035] hover:text-neutral-200'
        }`}
      >
        {link.label}
        <ChevronDown
          size={12}
          strokeWidth={2.5}
          className="text-muted transition-transform duration-300 group-hover/menu:rotate-180 group-focus-within/menu:rotate-180"
        />
        <ActiveBar shown={active} />
      </a>

      <div
        className="absolute top-[calc(100%+1.25rem)] left-1/2 -translate-x-1/2 w-[340px] invisible opacity-0 translate-y-1 transition-all duration-200
                   group-hover/menu:visible group-hover/menu:opacity-100 group-hover/menu:translate-y-0
                   group-focus-within/menu:visible group-focus-within/menu:opacity-100 group-focus-within/menu:translate-y-0"
      >
        <div className="border border-[#282832] bg-[#0a0a0d]">
          {link.items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              {...externalProps(item.external)}
              className="flex items-center gap-3 p-3 border-b border-[#1a1a20] hover:bg-[#0f0f14] transition-colors group/item"
            >
              {item.image && (
                <ResponsiveImage
                  src={item.image}
                  sizes="64px"
                  pictureClassName="shrink-0"
                  alt=""
                  loading="lazy"
                  className="w-16 h-11 object-cover object-top border border-[#222228]"
                />
              )}
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[13px] font-medium text-white truncate">
                  {item.title}
                </span>
                <span className="block text-[11px] text-muted truncate">
                  {item.subtitle}
                </span>
              </span>
              <ArrowUpRight
                size={13}
                strokeWidth={2}
                className="text-muted shrink-0 group-hover/item:text-violet-400 transition-colors"
              />
            </a>
          ))}

          <a
            href={link.footer.href}
            {...externalProps(link.footer.external)}
            className="flex items-center justify-between px-3 py-2.5 text-[10px] font-semibold text-neutral-400 hover:text-white tracking-[0.2em] transition-colors group/footer"
          >
            <span className="flex items-center gap-2">
              {link.footer.icon && (
                <link.footer.icon
                  size={13}
                  className="shrink-0 text-muted group-hover/footer:text-violet-400 transition-colors"
                />
              )}
              {link.footer.label}
            </span>
            <ArrowUpRight size={12} strokeWidth={2} />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Header() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const currentPath = useCurrentPath();
  const { open, seed, ask, openPalette, closePalette } = useCommandPalette();
  const { label: shortcutLabel } = useModifierKey();

  const [paletteUsed, setPaletteUsed] = React.useState(false);
  if (open && !paletteUsed) setPaletteUsed(true);

  React.useEffect(() => onFirstInteraction(warmPalette), []);

  React.useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="w-full border-b border-[#222228] sticky top-0 z-50 bg-[#060608]/95 backdrop-blur-md flex flex-col items-center">
      <a href="#main" className="skip-link">
        SKIP TO CONTENT
      </a>
      <div className="w-full max-w-[1480px] border-x border-[#282832] h-[4.5rem] px-6 sm:px-10 flex items-center justify-between">
        <a
          href="/"
          className="flex items-center gap-3 text-xs tracking-[0.22em] shrink-0 group"
        >
          <img
            src="/amitista-logo.png"
            alt="Amitista"
            className="h-7 w-7 object-contain select-none"
          />
          <span className="font-bold text-white">AMITISTA</span>
          <span className="hidden sm:inline font-medium text-neutral-400">STUDIO</span>
        </a>

        <nav
          aria-label="Main"
          className="hidden lg:flex h-10 items-center gap-1 border border-white/[0.065] bg-[#0a0a0d]/80 p-1 shadow-[0_10px_35px_rgba(0,0,0,0.22)]"
        >
          {NAV_LINKS.map((link) => {
            const active = isActive(link, currentPath);

            if (link.items) {
              return <NavMenu key={link.href} link={link} active={active} />;
            }

            return (
              <a
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`${linkClasses} ${
                  active
                    ? 'bg-white/[0.055] text-white'
                    : 'text-neutral-500 hover:bg-white/[0.035] hover:text-neutral-200'
                }`}
              >
                {link.label}
                <ActiveBar shown={active} />
              </a>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden lg:flex h-9 items-center border border-[#24242b] bg-white/[0.015]">
            <button
              type="button"
              onClick={() => openPalette('')}
              onKeyDown={(event) => {
                if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
                if (event.key === ' ') return;
                event.preventDefault();
                openPalette(event.key);
              }}
              aria-label="Search the site"
              aria-haspopup="dialog"
              aria-expanded={open}
              className="group/search search-press inline-flex h-full items-center gap-2.5 px-3 text-neutral-500 hover:bg-white/[0.035] hover:text-neutral-200 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500 cursor-pointer"
            >
              <Search size={14} strokeWidth={1.75} className="shrink-0" />
              <kbd className="shrink-0 font-sans text-[10px] font-medium tracking-[0.08em] text-neutral-600 transition-colors group-hover/search:text-neutral-400">
                {shortcutLabel}
              </kbd>
            </button>
            <span aria-hidden="true" className="h-4 w-px bg-[#2c2c34]" />
            <a
              href="/admin"
              aria-label="Sign in to the studio panel"
              className="inline-flex h-full items-center gap-2 px-3 text-[11px] font-medium tracking-[0.04em] text-neutral-400 hover:bg-white/[0.035] hover:text-white focus-visible:z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500 transition-[color,background-color,transform] duration-150 active:scale-[0.98] cursor-pointer"
            >
              <Lock size={14} strokeWidth={1.75} className="shrink-0 text-neutral-500" />
              <span>Sign in</span>
            </a>
          </div>
          <a
            href="/contact"
            className="inline-flex max-[380px]:hidden h-9 items-center border border-[#34343d] bg-white/[0.035] px-4 text-[11px] font-medium tracking-[0.04em] text-neutral-200 whitespace-nowrap hover:border-neutral-200 hover:bg-neutral-100 hover:text-[#09090b] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060608] transition-[color,background-color,border-color,transform] duration-150 active:translate-y-px cursor-pointer"
          >
            Start a project
          </a>
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
            className="lg:hidden border border-[#282832] hover:border-neutral-500 text-white p-2.5 transition-all cursor-pointer"
          >
            {menuOpen ? <X size={14} /> : <Menu size={14} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          id="mobile-nav"
          className="lg:hidden w-full max-w-[1480px] border-x border-t border-[#282832] bg-[#060608] max-h-[calc(100vh-5rem)] overflow-y-auto overscroll-contain"
        >
          <nav aria-label="Main" className="flex flex-col px-6 sm:px-10 py-2">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                openPalette();
              }}
              className="flex items-center gap-3 py-4 border-b border-[#1a1a20] text-neutral-300 hover:text-white transition-colors cursor-pointer"
            >
              <Search size={14} strokeWidth={2} className="shrink-0" />
              <span className="text-[11px] font-semibold tracking-[0.2em]">SEARCH</span>
            </button>

            {NAV_LINKS.map((link) => {
              const active = isActive(link, currentPath);

              return (
                <React.Fragment key={link.href}>
                  <a
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={`py-4 text-[11px] font-semibold tracking-[0.2em] border-b border-[#1a1a20] transition-colors ${
                      active ? 'text-white' : 'text-neutral-300 hover:text-white'
                    }`}
                  >
                    {link.label}
                  </a>

                  {link.items?.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      {...externalProps(item.external)}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 py-3 pl-4 border-b border-[#1a1a20] group/item"
                    >
                      <span className="w-1 h-1 bg-neutral-700 shrink-0 group-hover/item:bg-violet-400 transition-colors" />
                      <span className="text-[13px] text-neutral-400 group-hover/item:text-white transition-colors">
                        {item.title}
                      </span>
                    </a>
                  ))}

                  {link.footer?.external && (
                    <a
                      href={link.footer.href}
                      {...externalProps(link.footer.external)}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 py-3.5 pl-4 border-b border-[#1a1a20] text-neutral-300 hover:text-white transition-colors group/invite"
                    >
                      {link.footer.icon && (
                        <link.footer.icon
                          size={14}
                          className="shrink-0 text-neutral-500 group-hover/invite:text-violet-400 transition-colors"
                        />
                      )}
                      <span className="text-[11px] font-semibold tracking-[0.2em]">
                        {link.footer.label}
                      </span>
                      <ArrowUpRight size={12} strokeWidth={2} className="text-muted shrink-0" />
                    </a>
                  )}
                </React.Fragment>
              );
            })}

            <a
              href="/admin"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 py-4 border-b border-[#1a1a20] text-neutral-300 hover:text-white transition-colors"
            >
              <Lock size={14} strokeWidth={2} className="shrink-0" />
              <span className="text-[11px] font-semibold tracking-[0.2em]">LOGIN</span>
            </a>

            <a
              href="/contact"
              onClick={() => setMenuOpen(false)}
              className="my-4 border border-white hover:bg-white hover:text-black text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3.5 text-center transition-all"
            >
              START A PROJECT
            </a>
          </nav>
        </div>
      )}

      {paletteUsed && (
        <React.Suspense fallback={null}>
          <CommandPalette open={open} onClose={closePalette} initialQuery={seed} initialAsk={ask} />
        </React.Suspense>
      )}
    </header>
  );
}
