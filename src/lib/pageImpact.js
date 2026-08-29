import { ROUTE_PATHS, labelForPath } from '../content/routeMeta.js';

// Page files whose route cannot be read off their name. Everything else follows
// the convention — src/pages/ExchangeFeesPage.jsx is /exchange-fees — and any
// guess that does not land on a real route is dropped rather than linked, so a
// page added later is missing from this list instead of wrong in it.
const NAMED = {
  HomePage: '/',
  DeclinesPage: '/what-we-dont-take-on',
  AudienceIndexPage: '/for',
  BlockedPage: '/block',
  LegalIndexPage: '/legal',
  DocsPage: '/docs',
};

// Pages that exist per project, per audience or per ticket. There is no single
// URL to send somebody to, so they are named without one.
const MANY = {
  ProjectPage: 'every project page under /work',
  AudiencePage: 'every audience page under /for',
  TranscriptPage: 'every transcript page',
  NotFoundPage: 'the 404 page',
  MaintenancePage: 'the maintenance cover',
};

const KNOWN = new Set(ROUTE_PATHS);

const kebab = (name) =>
  name
    .replace(/Page$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();

const pageName = (path) => {
  const match = /^src\/pages\/(?:legal\/)?([A-Za-z0-9]+)\.jsx$/.exec(path);
  return match ? match[1] : null;
};

const routeFor = (name) => {
  if (NAMED[name]) return NAMED[name];
  const guess = `/${kebab(name)}`;
  return KNOWN.has(guess) ? guess : null;
};

// Files that change how every page looks, so no single route can be named.
const WIDE = [
  { test: (path) => path === 'src/index.css', why: 'the site stylesheet' },
  { test: (path) => path === 'src/fonts.css', why: 'the fonts' },
  { test: (path) => path === 'src/App.jsx', why: 'the router' },
  { test: (path) => path === 'src/siteConfig.js', why: 'the site configuration' },
  { test: (path) => path.startsWith('src/components/web1/'), why: 'the header and footer' },
  { test: (path) => path === 'tailwind.config.js', why: 'the design tokens' },
];

const FRONTEND = (path) =>
  path.startsWith('src/') ||
  path.startsWith('public/') ||
  path === 'index.html' ||
  path === 'tailwind.config.js';

// What a pull request changes, from the paths alone.
//
// Deliberately not a dependency graph. A component can be used by any number of
// pages and working out which would mean parsing every import in the tree, so a
// shared component is reported as what it is — a change with no single page to
// look at — rather than guessed at. Naming three pages when it affects nine is
// worse than naming none.
export function pageImpact(files) {
  const paths = (files ?? []).map((file) => file?.path).filter((path) => typeof path === 'string');

  const pages = new Map();
  const wide = new Set();
  const components = [];
  const content = [];
  let frontend = 0;

  paths.forEach((path) => {
    if (!FRONTEND(path)) return;
    frontend += 1;

    WIDE.forEach((rule) => {
      if (rule.test(path)) wide.add(rule.why);
    });

    const name = pageName(path);
    if (name) {
      if (MANY[name]) {
        wide.add(MANY[name]);
        return;
      }
      const route = routeFor(name);
      if (route) {
        const label = route === '/' ? 'Home' : (labelForPath(route) ?? route);
        pages.set(route, { path: route, label, file: path });
      }
      return;
    }

    if (path.startsWith('src/components/') && !path.startsWith('src/components/web1/')) {
      components.push(path);
    } else if (path.startsWith('src/content/')) {
      content.push(path);
    }
  });

  return {
    frontend: frontend > 0,
    touched: frontend,
    backend: paths.length - frontend,
    pages: [...pages.values()].sort((a, b) => a.path.localeCompare(b.path)),
    wide: [...wide],
    components,
    content,
  };
}
