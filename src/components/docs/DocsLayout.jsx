import React from 'react';
import { Sun, Moon, Menu, X } from 'lucide-react';
import { DOC_GROUPS } from '../../content/docsMeta';
import { DOCS_UPDATED } from '../../siteConfig';

const THEME_KEY = 'amitista-docs-theme';

function useDocsTheme() {
  const [theme, setTheme] = React.useState(() => {
    try {
      return window.localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  React.useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === 'dark';
    root.classList.toggle('dark', isDark);
    root.classList.toggle('light', !isDark);
    document.body.style.backgroundColor = isDark ? '#060608' : '#ffffff';

    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
    }

    return () => {
      root.classList.remove('dark');
      root.classList.remove('light');
      document.body.style.backgroundColor = '';
    };
  }, [theme]);

  return [theme, () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))];
}

function useHeadings(slug) {
  const [headings, setHeadings] = React.useState([]);
  const [activeId, setActiveId] = React.useState(null);

  React.useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('article h2[id]'));
    setHeadings(nodes.map((node) => ({ id: node.id, text: node.textContent })));
    setActiveId(nodes.length ? nodes[0].id : null);

    if (!nodes.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [slug]);

  return [headings, activeId];
}

function SidebarNav({ currentSlug, onNavigate }) {
  return (
    <nav className="flex flex-col gap-8">
      {DOC_GROUPS.map((group) => (
        <div key={group.name}>
          <p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-200 mb-2.5">
            {group.name}
          </p>
          <ul className="flex flex-col border-l border-neutral-200 dark:border-white/10">
            {group.pages.map((page) => {
              const active = page.slug === currentSlug;
              return (
                <li key={page.slug}>
                  <a
                    href={`/docs/${page.slug}`}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={`block -ml-px pl-4 py-1.5 border-l text-[14px] leading-6 transition-colors ${
                      active
                        ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                        : 'border-transparent text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300'
                    }`}
                  >
                    {page.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function DocsLayout({ page, previous, next }) {
  const [theme, toggleTheme] = useDocsTheme();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [headings, activeId] = useHeadings(page.slug);
  const Body = page.body;

  return (
    <div className="min-h-screen bg-white dark:bg-[#060608] font-sans">
      <header className="sticky top-0 z-40 bg-white/85 dark:bg-[#060608]/85 backdrop-blur-md">
        <div className="max-w-[1400px] mx-auto h-16 px-6 sm:px-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="lg:hidden p-2 -ml-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <a href="/" className="flex items-center gap-2.5 min-w-0">
              <img
                src="/amitista-logo.png"
                alt=""
                className="h-5 w-5 object-contain select-none invert dark:invert-0"
              />
              <span className="font-medium text-[15px] text-neutral-900 dark:text-white truncate">
                Amitista
              </span>
            </a>
            <a
              href="/docs"
              className="text-[15px] text-neutral-500 dark:text-muted hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              Docs
            </a>
          </div>

          <div className="flex items-center gap-5">
            <a
              href="/"
              className="hidden sm:inline text-[14px] text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              Back to site
            </a>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 flex gap-16">
        <aside className="hidden lg:block w-52 shrink-0 py-14">
          <div className="docs-scroll sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <SidebarNav currentSlug={page.slug} />
          </div>
        </aside>

        {menuOpen && (
          <div className="lg:hidden fixed inset-x-0 top-16 bottom-0 z-30 bg-white dark:bg-[#060608] overflow-y-auto px-6 py-8">
            <SidebarNav currentSlug={page.slug} onNavigate={() => setMenuOpen(false)} />
          </div>
        )}

        <main id="main" tabIndex={-1} className="flex-1 min-w-0 py-14 max-w-[720px] focus:outline-none">
          <h1 className="text-[32px] sm:text-[38px] font-semibold text-neutral-900 dark:text-white tracking-[-0.02em] leading-[1.15] mb-4">
            {page.title}
          </h1>
          <p className="text-[17px] leading-[1.7] text-neutral-500 dark:text-neutral-400 mb-14">
            {page.description}
          </p>

          <article>
            <React.Suspense fallback={<div className="min-h-[60vh]" aria-hidden="true" />}>
              <Body />
            </React.Suspense>
          </article>

          <nav className="mt-20 pt-8 border-t border-neutral-200 dark:border-white/10 flex justify-between gap-8 text-[15px]">
            {previous ? (
              <a
                href={`/docs/${previous.slug}`}
                className="group min-w-0 text-left"
              >
                <span className="block text-[13px] text-neutral-500 dark:text-muted mb-1">
                  Previous
                </span>
                <span className="block text-neutral-700 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors truncate">
                  ← {previous.title}
                </span>
              </a>
            ) : (
              <span />
            )}
            {next && (
              <a
                href={`/docs/${next.slug}`}
                className="group min-w-0 text-right ml-auto"
              >
                <span className="block text-[13px] text-neutral-500 dark:text-muted mb-1">
                  Next
                </span>
                <span className="block text-neutral-700 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors truncate">
                  {next.title} →
                </span>
              </a>
            )}
          </nav>

          <p className="mt-10 text-[13px] text-neutral-500 dark:text-muted">
            Last updated {DOCS_UPDATED}
          </p>
        </main>

        <aside className="hidden xl:block w-52 shrink-0 py-14">
          {headings.length > 0 && (
            <div className="sticky top-28">
              <p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-200 mb-2.5">
                On this page
              </p>
              <ul className="flex flex-col">
                {headings.map((heading) => (
                  <li key={heading.id}>
                    <a
                      href={`#${heading.id}`}
                      className={`block py-1.5 text-[13.5px] leading-5 transition-colors ${
                        heading.id === activeId
                          ? 'text-neutral-900 dark:text-white'
                          : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300'
                      }`}
                    >
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
