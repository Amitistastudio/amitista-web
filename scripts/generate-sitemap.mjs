import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ROUTE_PATHS, PRIVATE_PATHS } from '../src/content/routeMeta.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(join(root, relative), 'utf8');

const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'monthly' },
  { path: '/work', priority: '0.9', changefreq: 'monthly' },
  { path: '/services', priority: '0.9', changefreq: 'monthly' },
  { path: '/process', priority: '0.7', changefreq: 'yearly' },
  { path: '/team', priority: '0.7', changefreq: 'monthly' },
  { path: '/contact', priority: '0.8', changefreq: 'yearly' },
  { path: '/apply', priority: '0.6', changefreq: 'monthly' },
  { path: '/faq', priority: '0.6', changefreq: 'yearly' },
  { path: '/what-we-dont-take-on', priority: '0.5', changefreq: 'yearly' },
  { path: '/status', priority: '0.4', changefreq: 'daily' },
  { path: '/track', priority: '0.4', changefreq: 'monthly' },
  { path: '/api', priority: '0.5', changefreq: 'monthly' },
  { path: '/shield', priority: '0.8', changefreq: 'monthly' },
  { path: '/bots', priority: '0.5', changefreq: 'yearly' },
  { path: '/docs', priority: '0.5', changefreq: 'monthly' },
  { path: '/legal', priority: '0.4', changefreq: 'yearly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  { path: '/eula', priority: '0.3', changefreq: 'yearly' },
  { path: '/refund', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { path: '/dpa', priority: '0.3', changefreq: 'yearly' },
  { path: '/subprocessors', priority: '0.3', changefreq: 'monthly' },
  { path: '/security', priority: '0.3', changefreq: 'yearly' },
  { path: '/accessibility', priority: '0.3', changefreq: 'yearly' },
  { path: '/acceptable-use', priority: '0.3', changefreq: 'yearly' },
  { path: '/billing', priority: '0.3', changefreq: 'yearly' },
  { path: '/content-moderation', priority: '0.3', changefreq: 'yearly' },
  { path: '/copyright', priority: '0.3', changefreq: 'yearly' },
  { path: '/cookies', priority: '0.3', changefreq: 'yearly' },
  { path: '/open-source', priority: '0.3', changefreq: 'monthly' },
  { path: '/exchange-fees', priority: '0.4', changefreq: 'monthly' },
];

function slugsIn(source) {
  return [...source.matchAll(/^\s{4}slug:\s*'([a-z0-9-]+)'/gm)].map((m) => m[1]);
}

const siteUrl = (
  process.env.SITE_URL ??
  (await read('src/siteConfig.js')).match(/export const SITE_URL = '([^']*)'/)?.[1] ??
  ''
).replace(/\/+$/, '');

const [projectsSource, docsSource] = await Promise.all([
  read('src/content/projects.js'),
  read('src/content/docsMeta.js'),
]);

const projectSlugs = slugsIn(projectsSource);
const docSlugs = slugsIn(docsSource);

if (!projectSlugs.length || !docSlugs.length) {
  throw new Error(
    `Could not read routes: ${projectSlugs.length} projects, ${docSlugs.length} doc pages.`,
  );
}

const routes = [
  ...STATIC_ROUTES,
  ...projectSlugs.map((slug) => ({
    path: `/work/${slug}`,
    priority: '0.8',
    changefreq: 'monthly',
  })),
  ...docSlugs.map((slug) => ({
    path: `/docs/${slug}`,
    priority: '0.4',
    changefreq: 'monthly',
  })),
];

const missing = ROUTE_PATHS.filter(
  (path) => !PRIVATE_PATHS.has(path) && !routes.some((route) => route.path === path),
);

if (missing.length) {
  throw new Error(
    `${missing.length} route(s) in routeMeta.js are missing from the sitemap: ${missing.join(', ')}.\n` +
      'Add them to STATIC_ROUTES in this file, with a priority and a changefreq — ' +
      'a page nothing points a crawler at is a page that does not get found.',
  );
}

const robots = [
  'User-agent: *',
  'Allow: /',
  ...(siteUrl ? ['', `Sitemap: ${siteUrl}/sitemap.xml`] : []),
  '',
].join('\n');

await writeFile(join(root, 'public/robots.txt'), robots);

const contactEmail =
  (await read('src/siteConfig.js')).match(/export const CONTACT_EMAIL = '([^']*)'/)?.[1] ?? '';

const expires = new Date();
expires.setUTCFullYear(expires.getUTCFullYear() + 1);

const securityTxt = [
  `Contact: mailto:${contactEmail}`,
  `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, 'Z')}`,
  'Preferred-Languages: en, el',
  ...(siteUrl
    ? [`Canonical: ${siteUrl}/.well-known/security.txt`, `Policy: ${siteUrl}/security`]
    : []),
  '',
].join('\n');

await mkdir(join(root, 'public/.well-known'), { recursive: true });
await writeFile(join(root, 'public/.well-known/security.txt'), securityTxt);

if (!siteUrl) {
  console.warn(
    '[sitemap] SITE_URL is empty in src/siteConfig.js — wrote robots.txt and security.txt,\n' +
      '[sitemap] skipped sitemap.xml and the Canonical/Policy lines in security.txt.\n' +
      '[sitemap] Set the domain there and re-run `npm run build` to generate them.',
  );
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...routes.map(({ path, priority, changefreq }) =>
    [
      '  <url>',
      `    <loc>${siteUrl}${path}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n'),
  ),
  '</urlset>',
  '',
].join('\n');

await writeFile(join(root, 'public/sitemap.xml'), xml);
console.log(`[sitemap] ${routes.length} routes written for ${siteUrl}`);
