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
    match: ['/services', '/estimate', '/for', '/bots'],
    items: [
      ...SERVICES.map((service) => ({
        href: `/services#${service.slug}`,
        title: service.name,
        subtitle: service.blurb,
      })),
      {
        href: '/estimate',
        title: 'Estimate a project',
        subtitle: 'Build a rough price from your own answers',
      },
      {
        href: '/for',
        title: 'Who we build for',
        subtitle: 'The same work, described from where you are standing',
      },
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
    href: '/resources',
    match: ['/resources', '/docs', '/faq', '/network', '/status', '/api', '/shield'],
    items: [
      {
        href: '/resources',
        title: 'Resources',
        subtitle: 'Templates, checklists and updates, in the Discord',
      },
      {
        href: '/network',
        title: 'The network',
        subtitle: 'Where the server is, and your ping to it',
      },
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
      : { href: '/resources', label: 'ALL RESOURCES' },
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
  'relative flex items-center gap-1.5 h-20 text-[11px] font-semibold tracking-[0.2em] transition-colors';

function ActiveBar({ shown }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute left-0 right-0 bottom-0 h-px transition-colors ${
        shown ? 'bg-violet-400' : 'bg-transparent'
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
          active ? 'text-white' : 'text-neutral-300 hover:text-white'
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
        className="absolute top-full left-1/2 -translate-x-1/2 w-[340px] invisible opacity-0 translate-y-1 transition-all duration-200
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
      <div className="w-full max-w-[1480px] border-x border-[#282832] h-20 px-6 sm:px-10 flex items-center justify-between">
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

        <nav aria-label="Main" className="hidden lg:flex items-center gap-6 xl:gap-8">
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
                  active ? 'text-white' : 'text-neutral-300 hover:text-white'
                }`}
              >
                {link.label}
                <ActiveBar shown={active} />
              </a>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
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
            className="hidden lg:inline-flex h-9 items-center gap-2.5 border border-[#24242b] bg-white/[0.015] px-3 text-neutral-500 hover:border-[#3a3a43] hover:bg-white/[0.035] hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060608] cursor-pointer group/search search-press"
          >
            <Search size={14} strokeWidth={1.75} className="shrink-0" />
            <kbd className="shrink-0 font-sans text-[10px] font-medium tracking-[0.08em] text-neutral-600 group-hover/search:text-neutral-400 transition-colors">
              {shortcutLabel}
            </kbd>
          </button>
          <a
            href="/admin"
            aria-label="Sign in to the studio panel"
            className="hidden lg:inline-flex items-center gap-2 border border-[#282832] hover:border-neutral-500 bg-transparent px-3 py-2.5 text-neutral-400 hover:text-white whitespace-nowrap transition-all cursor-pointer"
          >
            <Lock size={13} strokeWidth={2} className="shrink-0" />
            <span className="shrink-0 text-[10px] font-semibold tracking-[0.15em]">LOGIN</span>
          </a>
          <a
            href="/contact"
            className="inline-flex max-[380px]:hidden border border-[#282832] hover:border-neutral-500 text-white font-semibold text-[10px] tracking-[0.2em] px-4 py-2.5 whitespace-nowrap transition-all cursor-pointer"
          >
            START A PROJECT
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
