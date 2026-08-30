import { ROUTE_PATHS, labelForPath } from '../content/routeMeta.js';

const NAMED = {
  HomePage: '/',
  DeclinesPage: '/what-we-dont-take-on',
  AudienceIndexPage: '/for',
  BlockedPage: '/block',
  LegalIndexPage: '/legal',
  DocsPage: '/docs',
};

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
