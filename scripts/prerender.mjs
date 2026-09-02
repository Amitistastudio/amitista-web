import { build } from 'vite';
import { readFile, writeFile, rm, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { ROUTE_PATHS, PRIVATE_PATHS, metaForPath } from '../src/content/routeMeta.js';
import { DOC_META } from '../src/content/docsMeta.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SSR_OUT = join(ROOT, '.ssr-build');

const ROUTES_DIR = join(DIST, 'routes');

const HASH_FILE = join(DIST, 'csp-style-hash.txt');

const ROOT_DIV = '<div id="root"></div>';

function deprioritiseScripts(html) {
  const before = html;

  const out = html
    .replace(/<script type="module" crossorigin/g, '<script type="module" fetchpriority="low" crossorigin')
    .replace(/<link rel="modulepreload" crossorigin/g, '<link rel="modulepreload" fetchpriority="low" crossorigin');

  if (out === before) {
    throw new Error(
      'no script or modulepreload tags matched — Vite changed its output and the ' +
        'home page is shipping its bundle at full priority against the stylesheet',
    );
  }
  return out;
}

function inlineStylesheet(html, css) {
  const link = html.match(/<link rel="stylesheet"[^>]*>/);
  if (!link) {
    throw new Error('no <link rel="stylesheet"> in the built HTML — nothing to inline');
  }

  const style = `<style>${css}</style>`;
  const out = html.replace(link[0], style);

  const digest = createHash('sha256').update(css, 'utf8').digest('base64');
  return { html: out, hash: `sha256-${digest}` };
}

async function readSiteConfig() {
  const source = await readFile(join(ROOT, 'src', 'siteConfig.js'), 'utf8');
  const pick = (name) => source.match(new RegExp(`export const ${name} = '([^']*)'`))?.[1];

  const siteUrl = (pick('SITE_URL') ?? '').replace(/\/+$/, '');
  const studioName = pick('STUDIO_NAME');

  if (!siteUrl) {
    throw new Error('SITE_URL is empty in siteConfig.js — cannot write canonical or og:url');
  }
  if (!studioName) throw new Error('could not read STUDIO_NAME from siteConfig.js');

  return { siteUrl, studioName };
}

function escapeAttribute(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonLdScript(graph) {
  const json = JSON.stringify(graph).replaceAll('<', '\\u003c');
  return `    <script type="application/ld+json">${json}</script>\n`;
}

function replaceAttribute(html, { find, attribute = 'content', value, label }) {
  const pattern = new RegExp(`(${find}[^>]*?${attribute}=")([^"]*)(")`, 's');
  if (!pattern.test(html)) {
    throw new Error(
      `index.html has no ${label} tag to rewrite (looked for ${find}). ` +
        'The shell changed shape — update scripts/prerender.mjs to match it.',
    );
  }
  return html.replace(pattern, `$1${escapeAttribute(value)}$3`);
}

function applyMeta(html, meta, { siteUrl, noindex = false, jsonLd = null } = {}) {
  const canonical = `${siteUrl}${meta.path === '/' ? '/' : meta.path}`;

  const TITLE = /<title>[^<]*<\/title>/;
  if (!TITLE.test(html)) throw new Error('index.html has no <title> to rewrite');
  let out = html.replace(TITLE, `<title>${escapeAttribute(meta.title)}</title>`);

  out = replaceAttribute(out, {
    find: '<meta\\s+name="description"',
    value: meta.description,
    label: 'meta description',
  });
  out = replaceAttribute(out, {
    find: '<meta\\s+property="og:title"',
    value: meta.title,
    label: 'og:title',
  });
  out = replaceAttribute(out, {
    find: '<meta\\s+property="og:description"',
    value: meta.description,
    label: 'og:description',
  });
  out = replaceAttribute(out, {
    find: '<meta\\s+name="twitter:title"',
    value: meta.title,
    label: 'twitter:title',
  });
  out = replaceAttribute(out, {
    find: '<meta\\s+name="twitter:description"',
    value: meta.description,
    label: 'twitter:description',
  });
  out = replaceAttribute(out, {
    find: '<meta\\s+property="og:image"',
    value: `${siteUrl}/og.png`,
    label: 'og:image',
  });
  out = replaceAttribute(out, {
    find: '<meta\\s+name="twitter:image"',
    value: `${siteUrl}/og.png`,
    label: 'twitter:image',
  });

  const head = noindex
    ?
      '    <meta name="robots" content="noindex, follow" />\n'
    : `    <link rel="canonical" href="${escapeAttribute(canonical)}" />\n` +
      `    <meta property="og:url" content="${escapeAttribute(canonical)}" />\n` +
      (jsonLd ? jsonLdScript(jsonLd) : '');

  if (!out.includes('</head>')) throw new Error('index.html has no </head>');
  return out.replace('</head>', `${head}  </head>`);
}

function routeFile(path) {
  return join(ROUTES_DIR, `${path.replace(/^\//, '')}.html`);
}

const SILK_MARKER = 'silk-surface';

async function readPageChunks() {
  const manifest = JSON.parse(await readFile(join(DIST, '.vite', 'manifest.json'), 'utf8'));

  const source = await readFile(join(ROOT, 'src', 'App.jsx'), 'utf8');
  const registrations = [...source.matchAll(/page\(\s*'([^']+)'\s*,\s*\(\)\s*=>\s*import\('([^']+)'\)/g)];

  if (!registrations.length) {
    throw new Error(
      'no page() registrations found in src/App.jsx — the route table changed shape, so ' +
        'prerender can no longer work out which chunk each route needs preloaded.',
    );
  }

  const silkChunk = manifest['src/components/SilkCanvas.jsx']?.file;
  if (!silkChunk) {
    throw new Error('SilkCanvas has no chunk in the manifest — the shader preload cannot be targeted');
  }

  const chunksFor = (entry, seen = new Set()) => {
    if (!entry || seen.has(entry.file)) return seen;
    seen.add(entry.file);
    for (const name of entry.imports ?? []) {
      const next = Object.values(manifest).find((candidate) => candidate.file === name) ?? manifest[name];
      chunksFor(next, seen);
    }
    return seen;
  };

  const byKey = new Map();
  for (const [, key, specifier] of registrations) {
    const module = `src/${specifier.replace(/^\.\//, '')}.jsx`;
    const entry = manifest[module];
    if (!entry) {
      throw new Error(
        `src/App.jsx registers ${key} as ${specifier}, but ${module} has no chunk in the ` +
          'build manifest. Either the file moved or it stopped being its own chunk.',
      );
    }
    byKey.set(key, [...chunksFor(entry)]);
  }

  const bodiesSource = await readFile(join(ROOT, 'src', 'content', 'docsBodies.js'), 'utf8');
  const groupLoaders = [...bodiesSource.matchAll(/'([^']+)':\s*\(\)\s*=>\s*import\('\.\/docs\/([^']+)'\)/g)];
  if (!groupLoaders.length) {
    throw new Error(
      'no group modules found in src/content/docsBodies.js — the docs pages would hydrate ' +
        'without their body chunk preloaded, and a state update before that chunk resolves ' +
        'swaps the server-rendered body for the Suspense fallback.',
    );
  }

  const docGroups = new Map();
  for (const [, group, file] of groupLoaders) {
    const module = `src/content/docs/${file}`;
    const entry = manifest[module];
    if (!entry) {
      throw new Error(
        `docsBodies.js loads the "${group}" group from ${module}, but it has no chunk in ` +
          'the build manifest. Either the file moved or it stopped being its own chunk.',
      );
    }
    docGroups.set(group, [...chunksFor(entry)]);
  }

  return { byKey, silkChunk, docGroups };
}

function applyChunkHints(html, { chunks, needsSilk, silkChunk }) {
  let out = html;

  if (!needsSilk) {
    const preload = new RegExp(
      `\\s*<link rel="modulepreload"[^>]*href="/${silkChunk.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}"[^>]*>`,
    );
    out = out.replace(preload, '');
  }

  const extra = (chunks ?? [])
    .filter((file) => file !== silkChunk && !out.includes(`/${file}`))
    .map(
      (file) =>
        `    <link rel="modulepreload" fetchpriority="low" crossorigin href="/${file}">\n`,
    )
    .join('');

  return extra ? out.replace('</head>', `${extra}  </head>`) : out;
}

function disableEmailObfuscation(html) {
  if (!html.includes('<body>') || !html.includes('</body>')) {
    throw new Error(
      'index.html has no <body> pair to wrap in Cloudflare email_off markers — the shell ' +
        'changed shape, and without the markers Cloudflare injects a render-blocking ' +
        'email-decode.min.js into every page.',
    );
  }
  return html.replace('<body>', '<body><!--email_off-->').replace('</body>', '<!--/email_off--></body>');
}

function lcpImagePreload(markup) {
  const img = markup.match(/<img\b[^>]*\bfetchpriority="high"[^>]*>/i);
  if (!img) return '';

  const before = markup.slice(0, img.index);
  const opened = before.lastIndexOf('<picture');
  if (opened === -1 || before.indexOf('</picture>', opened) !== -1) return '';

  const sources = before.slice(opened);
  const avif = sources.match(/<source[^>]*type="image\/avif"[^>]*>/i);
  if (!avif) return '';

  const srcSet = avif[0].match(/\bsrcset="([^"]*)"/i)?.[1];
  if (!srcSet) return '';

  const sizes = img[0].match(/\bsizes="([^"]*)"/i)?.[1] ?? avif[0].match(/\bsizes="([^"]*)"/i)?.[1];

  return (
    '    <link rel="preload" as="image" fetchpriority="high" type="image/avif"' +
    ` imagesrcset="${escapeAttribute(srcSet)}"` +
    (sizes ? ` imagesizes="${escapeAttribute(sizes)}"` : '') +
    '>\n'
  );
}

function applyLcpPreload(html, markup) {
  const link = lcpImagePreload(markup);
  return link ? html.replace('</head>', `${link}  </head>`) : html;
}

const MIN_TEXT = 200;

function assertRendered(markup, path) {
  if (!markup.trim()) {
    throw new Error(`renderPath(${path}) returned nothing — that route would ship blank`);
  }

  const text = markup
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (markup.includes('<!--$?-->')) {
    throw new Error(
      `${path} still has an unresolved Suspense boundary. Its content is only revealed ` +
        "by an inline script, which the site's CSP (script-src 'self') blocks, so the " +
        'page would render with that section permanently empty until hydration.',
    );
  }

  if (text.length < MIN_TEXT) {
    throw new Error(
      `${path} rendered only ${text.length} characters of text on the server, so it ` +
        'would ship as a near-blank shell. React swallows a throw inside the page ' +
        'Suspense boundary and renders the fallback instead, so look for ' +
        'window/document access during render — a useState initialiser is the usual ' +
        'culprit, and it runs on the server.',
    );
  }
}

function assertNoInlineStyle(markup, path) {
  if (/\sstyle="/.test(markup)) {
    const offender = markup.match(/.{0,120}\sstyle="[^"]*"/)?.[0] ?? '';
    throw new Error(
      `prerendered markup for ${path} contains an inline style attribute, which the ` +
        `site's CSP (style-src 'self') blocks:\n  …${offender}…\n` +
        'Set the style prop only after mount, the way Reveal.jsx does.',
    );
  }
}

async function main() {
  await build({
    logLevel: 'warn',
    build: {
      ssr: join(ROOT, 'src', 'entry-server.jsx'),
      outDir: SSR_OUT,
      emptyOutDir: true,
      cssCodeSplit: false,
    },
  });

  const { renderPath, jsonLdForPath } = await import(
    pathToFileURL(join(SSR_OUT, 'entry-server.js')).href
  );

  const { markup, key: homeKey } = await renderPath('/');
  assertRendered(markup, '/');
  assertNoInlineStyle(markup, '/');

  const pageChunks = await readPageChunks();

  const shell = disableEmailObfuscation(await readFile(join(DIST, 'index.html'), 'utf8'));
  if (!shell.includes(ROOT_DIV)) {
    throw new Error(`dist/index.html does not contain ${ROOT_DIV} — nothing to fill`);
  }
  await writeFile(join(DIST, 'index.html'), shell);

  const cssName = (await readdir(join(DIST, 'assets'))).find((f) => /^index-.*\.css$/.test(f));
  if (!cssName) throw new Error('no built stylesheet in dist/assets — cannot inline');
  const css = await readFile(join(DIST, 'assets', cssName), 'utf8');

  const { siteUrl, studioName } = await readSiteConfig();

  const homeMeta = metaForPath('/', studioName);
  if (!homeMeta) throw new Error('routeMeta has no entry for / — the home page has no title');

  const { html, hash } = inlineStylesheet(
    applyLcpPreload(
      applyChunkHints(
        deprioritiseScripts(
          applyMeta(shell, homeMeta, {
            siteUrl,
            jsonLd: jsonLdForPath('/', { siteUrl }),
          }).replace(ROOT_DIV, `<div id="root">${markup}</div>`),
        ),
        {
          chunks: pageChunks.byKey.get(homeKey),
          needsSilk: markup.includes(SILK_MARKER),
          silkChunk: pageChunks.silkChunk,
        },
      ),
      markup,
    ),
    css,
  );

  await writeFile(join(DIST, 'home.html'), html);
  await writeFile(HASH_FILE, `${hash}\n`);

  await rm(ROUTES_DIR, { recursive: true, force: true });

  const chunksForRoute = (path, key) => {
    const base = pageChunks.byKey.get(key) ?? [];
    if (key !== 'docs') return base;
    const slug = path.slice('/docs/'.length);
    const group = (DOC_META.find((page) => page.slug === slug) ?? DOC_META[0]).group;
    const extra = pageChunks.docGroups.get(group);
    if (!extra) {
      throw new Error(
        `${path} resolves to the docs group "${group}", which docsBodies.js does not load — ` +
          'the group table and the manifest disagree, so its body chunk cannot be preloaded.',
      );
    }
    return [...new Set([...base, ...extra])];
  };

  const others = ROUTE_PATHS.filter((path) => path !== '/');
  let structured = 0;
  let silkless = 0;
  let preloaded = 0;
  let smallest = { path: null, bytes: Infinity };

  for (const path of others) {
    const meta = metaForPath(path, studioName);
    const private_ = PRIVATE_PATHS.has(path);
    const jsonLd = private_ ? null : jsonLdForPath(path, { siteUrl });
    if (jsonLd) structured += 1;

    const { markup: body, key } = await renderPath(path);
    assertRendered(body, path);
    assertNoInlineStyle(body, path);

    const html = applyLcpPreload(
      applyChunkHints(
        deprioritiseScripts(applyMeta(shell, meta, { siteUrl, jsonLd, noindex: private_ })).replace(
          ROOT_DIV,
          `<div id="root">${body}</div>`,
        ),
        { chunks: chunksForRoute(path, key), needsSilk: body.includes(SILK_MARKER), silkChunk: pageChunks.silkChunk },
      ),
      body,
    );
    if (!body.includes(SILK_MARKER)) silkless += 1;
    if (lcpImagePreload(body)) preloaded += 1;

    const bytes = Buffer.byteLength(html);
    if (bytes < smallest.bytes) smallest = { path, bytes };

    const file = routeFile(path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
  }

  const notFoundMeta = {
    path: '/404',
    title: `Page not found — ${studioName}`,
    description: 'That page does not exist. Everything the site does have is one link away.',
  };
  const { markup: notFoundBody, key: notFoundKey } = await renderPath('/this-route-does-not-exist');
  assertRendered(notFoundBody, '/404');
  assertNoInlineStyle(notFoundBody, '/404');

  await writeFile(
    join(DIST, '404.html'),
    applyLcpPreload(
      applyChunkHints(
        deprioritiseScripts(applyMeta(shell, notFoundMeta, { siteUrl, noindex: true })).replace(
          ROOT_DIV,
          `<div id="root">${notFoundBody}</div>`,
        ),
        {
          chunks: pageChunks.byKey.get(notFoundKey),
          needsSilk: notFoundBody.includes(SILK_MARKER),
          silkChunk: pageChunks.silkChunk,
        },
      ),
      notFoundBody,
    ),
  );

  await rm(SSR_OUT, { recursive: true, force: true });
  await rm(join(DIST, '.vite'), { recursive: true, force: true });

  console.log(
    `[prerender] dist/home.html — ${(Buffer.byteLength(html) / 1024).toFixed(1)} kB ` +
      `(markup + inlined ${cssName}), one request, no round trip for CSS`,
  );
  console.log(`[prerender] CSP style hash: ${hash}`);
  console.log(
    `[prerender] dist/routes/ — ${others.length} pages, each fully rendered with its own ` +
      `title, description, canonical and unfurl card (smallest: ${smallest.path} at ` +
      `${(smallest.bytes / 1024).toFixed(1)} kB)`,
  );
  console.log(
    `[prerender] schema.org JSON-LD on ${structured + 1} pages — Organization and ` +
      'WebSite on the home page, a BreadcrumbList under /docs and /work, ' +
      'and the FAQ as an FAQPage',
  );
  console.log(
    `[prerender] each page preloads its own route chunk; the shader preload is dropped ` +
      `from the ${silkless} pages that never render one`,
  );
  console.log(
    `[prerender] ${preloaded} pages open with an <img fetchpriority="high"> and now carry an ` +
      'imagesrcset preload for it, so the LCP candidate is requested from the head',
  );
  console.log(
    '[prerender] every document is wrapped in Cloudflare email_off markers — no ' +
      'edge-injected email-decode.min.js on any page',
  );
  console.log('[prerender] dist/404.html — noindex, served with a 404 status');
}

main().catch(async (error) => {
  await rm(SSR_OUT, { recursive: true, force: true });
  console.error(`Prerender failed: ${error.message}`);
  process.exitCode = 1;
});
