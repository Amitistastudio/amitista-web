import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describeField } from '../src/content/apiFields.js';
import { DEFAULT_DESCRIPTION, metaForPath } from '../src/content/routeMeta.js';
import {
  SHIELD_PACKAGE,
  SHIELD_VERSION,
  SHIELD_RUNTIME,
  SHIELD_FRAMEWORK,
  SHIELD_INSTALL,
  SHIELD_USAGE,
  SHIELD_START,
  SHIELD_MODES,
  SHIELD_OPTIONS,
  SHIELD_SETTINGS,
  SHIELD_SURFACE,
  SHIELD_LIMITS,
  DEFENCES,
  LAYERS,
  RULESET,
  SINKS,
  RESPONSE_METHODS,
  SHAPE_RULES,
  RATE_LIMITS,
  SECRET_PATTERNS,
  BASELINE_RULES,
  DENIAL,
  FEED,
  VERIFICATION,
} from '../src/content/shieldRules.js';
import { ENDPOINTS, STATIC_ENDPOINTS, API_VERSION, API_BASE } from '../src/content/apiMeta.js';
import {
  STUDIO_NAME,
  SITE_URL,
  CONTACT_EMAIL,
  DISCORD_INVITE,
  AVAILABILITY,
  REPLY_WINDOW,
  JURISDICTION,
  HOSTING_CITY,
} from '../src/siteConfig.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist/api', API_VERSION);

const generated = new Date().toISOString();
const documentation = `${SITE_URL}/api`;

const absolute = (path) => (path ? `${SITE_URL}${path}` : null);

function envelope(endpoint, body) {
  return { endpoint: endpoint.path, version: API_VERSION, generated, documentation, ...body };
}

const BUILDERS = {
  index: () => ({
    studio: STUDIO_NAME,
    site: SITE_URL,
    authentication: {
      required: 'Send a token as Authorization: Bearer, or as X-API-Key.',
      obtain: `${SITE_URL}/admin`,
      open: ENDPOINTS.filter((endpoint) => endpoint.auth === 'open').map((endpoint) => endpoint.path),
    },
    endpoints: ENDPOINTS.map((endpoint) => ({
      name: endpoint.name,
      path: endpoint.path,
      url: absolute(endpoint.path),
      description: endpoint.blurb,
      fields: endpoint.fields,
      updated: endpoint.freshness,
      live: Boolean(endpoint.live),
      token: endpoint.auth === 'token',
    })),
  }),

  shield: () => ({
    package: SHIELD_PACKAGE,
    packageVersion: SHIELD_VERSION,
    ruleset: RULESET,
    runtime: SHIELD_RUNTIME,
    framework: SHIELD_FRAMEWORK,
    install: SHIELD_INSTALL,
    usage: SHIELD_USAGE,
    start: SHIELD_START,
    modes: SHIELD_MODES,
    options: SHIELD_OPTIONS,
    settings: SHIELD_SETTINGS,
    surface: SHIELD_SURFACE,
    verification: VERIFICATION,
    denial: DENIAL,
    feed: FEED,
    layers: LAYERS.map((layer) => ({
      id: layer.id,
      name: layer.name,
      description: layer.blurb,
      defends: DEFENCES.filter((d) => d.layer === layer.id).length,
    })),
    defends: DEFENCES.map((defence) => ({
      id: defence.id,
      name: defence.name,
      severity: defence.severity,
      layer: defence.layer,
      summary: defence.summary,
    })),
    limits: SHIELD_LIMITS,
  }),

  shieldRules: () => ({
    package: SHIELD_PACKAGE,
    packageVersion: SHIELD_VERSION,
    ruleset: RULESET,
    counts: {
      sinks: SINKS.length,
      pollutionKeys: SHAPE_RULES.pollutionKeys.length,
      queryOperators: SHAPE_RULES.queryOperators.length,
      secretPatterns: SECRET_PATTERNS.length,
      valueClasses: BASELINE_RULES.valueClasses.length,
    },
    sinks: SINKS,
    secretPatterns: SECRET_PATTERNS,
    responseMethods: RESPONSE_METHODS,
    shape: SHAPE_RULES,
    baseline: BASELINE_RULES,
    rateLimits: RATE_LIMITS,
  }),
};

const LIVE_STATUS = '/var/www/amitista.com/shared/status.json';

function schemaFor(value, endpointId, path) {
  const doc = describeField(endpointId, path);
  const description = doc?.note;

  if (Array.isArray(value)) {
    return {
      type: 'array',
      ...(description ? { description } : {}),
      items: value.length ? schemaFor(value[0], endpointId, `${path}[]`) : {},
    };
  }

  if (value !== null && typeof value === 'object') {
    const properties = {};
    for (const [key, child] of Object.entries(value)) {
      properties[key] = schemaFor(child, endpointId, path ? `${path}.${key}` : key);
    }
    return {
      type: 'object',
      ...(description ? { description } : {}),
      properties,
      required: Object.keys(value),
    };
  }

  if (value === null) return { type: 'null', ...(description ? { description } : {}) };

  const type = typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'number') : typeof value;

  return {
    type,
    ...(description ? { description } : {}),
    ...(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? { format: 'date-time' } : {}),
    ...(typeof value === 'string' && /^https?:\/\//.test(value) ? { format: 'uri' } : {}),
  };
}

function serviceSamples(statusSample) {
  return {
    status: statusSample,
    shieldFeed: {
      document: '{"format":1,"package":"@amitista/shield","ruleset":5,"serial":1,"issued":"…","expires":"…"}',
      signature: { alg: 'ed25519', keyId: FEED.keyId, value: 'base64' },
    },
    shieldFeedStatus: {
      endpoint: '/api/v1/shield/feed/status',
      generated: '2026-01-01T00:00:00Z',
      started: '2026-01-01T00:00:00Z',
      ok: true,
      serial: 1,
      feed: FEED.url,
      rules: FEED.catalogue,
      served: { feed: 0, rules: 0, notModified: 0, missing: 0, rejected: 0 },
      error: null,
    },
  };
}

function openapi(payloads, statusSample) {
  const paths = {};
  const samples = serviceSamples(statusSample);

  for (const endpoint of ENDPOINTS) {
    const sample = payloads[endpoint.id] ?? samples[endpoint.id] ?? null;

    const gated = endpoint.auth === 'token';

    paths[endpoint.path] = {
      get: {
        operationId: endpoint.id,
        summary: endpoint.name,
        description: gated
          ? `${endpoint.blurb} Requires a token.`
          : `${endpoint.blurb} Answers without a token.`,
        security: gated ? [{ bearer: [] }, { apiKey: [] }] : [],
        responses: {
          200: {
            description: `${endpoint.name} as JSON. Updated: ${endpoint.freshness.toLowerCase()}.`,
            headers: {
              'Access-Control-Allow-Origin': {
                description: 'Always *. Any origin may read this.',
                schema: { type: 'string' },
              },
              'Cache-Control': {
                description: gated
                  ? 'no-store. The response depended on the token, so it must not sit in a shared cache.'
                  : 'Cacheable, with an ETag for conditional requests.',
                schema: { type: 'string' },
              },
            },
            content: {
              'application/json': {
                schema: sample ? schemaFor(sample, endpoint.id, '') : { type: 'object' },
              },
            },
          },
          ...(gated
            ? {
                401: {
                  description: 'No token was sent, or it is not recognised.',
                  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
                },
                403: {
                  description:
                    'The token is recognised but not allowed here — wrong scope, revoked, expired, or presented from an address outside its allow list.',
                  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
                },
                429: {
                  description: 'Too many requests for this token inside its window.',
                  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
                },
              }
            : {}),
          404: {
            description: 'No such endpoint in this version. The body is JSON, not the site 404 page.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          405: {
            description: 'The API is read only. GET, HEAD and OPTIONS are the whole method set, and the Allow header repeats it.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          503: {
            description: 'A live endpoint whose service is not answering. The package fails open, so an install keeps running on the rules it already holds.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      options: {
        operationId: `${endpoint.id}Preflight`,
        summary: `CORS preflight for ${endpoint.name}`,
        description: 'Answered for any origin so a browser may send a conditional request.',
        responses: {
          204: {
            description: 'Preflight accepted.',
            headers: {
              'Access-Control-Allow-Methods': { schema: { type: 'string' } },
              'Access-Control-Allow-Headers': { schema: { type: 'string' } },
              'Access-Control-Max-Age': { schema: { type: 'string' } },
            },
          },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: `${STUDIO_NAME} public API`,
      version: API_VERSION,
      summary: 'Shield, and the machine it is served from.',
      description:
        'Read-only JSON describing Shield, the application security package this studio ' +
        'publishes for Express: its detection catalogue, the request shapes it treats as ' +
        'abuse, the rate limits it applies by default, the signed rules feed its installs ' +
        'poll, and the live status of the server behind this site. Everything here is ' +
        'answered by a small read-only service on the same box. Most endpoints need a ' +
        'bearer token; the signed feed and its status do not, because the installs polling ' +
        'them verify the signature against a key pinned in the package rather than trusting ' +
        'this host. There is no write endpoint \u2014 your code is never sent here.',
      contact: { name: STUDIO_NAME, email: CONTACT_EMAIL, url: `${SITE_URL}/contact` },
      termsOfService: `${SITE_URL}/terms`,
    },
    servers: [{ url: SITE_URL, description: `${STUDIO_NAME}, served from Frankfurt` }],
    externalDocs: { url: `${SITE_URL}/api`, description: 'The explorer, with a field-by-field reference' },
    components: {
      securitySchemes: {
        bearer: {
          type: 'http',
          scheme: 'bearer',
          description:
            'A token made under Account → API. It carries scopes, an optional address allow list and its own rate limit, and revoking it takes effect on the next request.',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'The same token, for clients that would rather not set Authorization.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          description: 'Every failure on this API answers with this shape, never with the site 404 page.',
          properties: {
            error: { type: 'string', description: 'What went wrong, in one sentence.' },
            version: { type: 'string', description: 'The API version that refused it.' },
            index: { type: 'string', format: 'uri', description: 'Where to find the endpoints that do exist.' },
            documentation: { type: 'string', format: 'uri' },
          },
          required: ['error', 'version', 'index'],
        },
      },
    },
    paths,
  };
}

function llmsTxt(payloads) {
  const page = (path) => {
    const meta = metaForPath(path, STUDIO_NAME);
    return meta ? `- [${meta.title.replace(` — ${STUDIO_NAME}`, '')}](${SITE_URL}${path}): ${meta.description}` : null;
  };

  const primary = ['/', '/work', '/services', '/process', '/team', '/faq', '/contact', '/estimate'];
  const secondary = ['/docs', '/resources', '/network', '/status', '/what-we-dont-take-on', '/legal'];

  return [
    `# ${STUDIO_NAME}`,
    '',
    `> ${DEFAULT_DESCRIPTION}`,
    '',
    `Availability: ${AVAILABILITY.state === 'open' ? 'taking on new work' : AVAILABILITY.state}. ` +
      `Enquiries answered within ${REPLY_WINDOW}. Based in ${JURISDICTION}; servers in ${HOSTING_CITY}.`,
    '',
    '## Machine-readable',
    '',
    `This site publishes a JSON API describing Shield, its rule catalogue and this ` +
      `server's status. Prefer it over scraping these pages — it is the same content, ` +
      `structured, and it will not break when the markup changes. Most of it needs a bearer ` +
      `token, obtainable at ${SITE_URL}/admin; the signed rules feed at ${SITE_URL}${API_BASE}` +
      `/shield/feed answers without one.`,
    '',
    `- [OpenAPI 3.1 specification](${SITE_URL}${API_BASE}/openapi.json): every endpoint, with response schemas and a description for every field`,
    ...ENDPOINTS.map((endpoint) => `- [${endpoint.name}](${SITE_URL}${endpoint.path}): ${endpoint.blurb}`),
    '',
    '## Pages',
    '',
    ...primary.map(page).filter(Boolean),
    '',
    '## More',
    '',
    ...secondary.map(page).filter(Boolean),
    '',
    '## Notes for agents',
    '',
    '- Everything is a GET. There is no write endpoint, and nothing here accepts source code, traffic or findings.',
    '- Every response carries Access-Control-Allow-Origin: *, so a browser on any origin may read it.',
    `- ${payloads.shieldRules.counts.sinks} dangerous calls are catalogued at ${SITE_URL}${API_BASE}/shield/rules, each with the argument position that is actually the injection point.`,
    '- The shield endpoint publishes what the package does not catch as well as what it does. Read the limits array before recommending it as a complete defence.',
    `- Content is the studio's. Reading and quoting it is fine; presenting it as your own is not.`,
    '',
  ].join('\n');
}

try {
  await stat(join(root, 'dist'));
} catch {
  console.error('[emit-api] no dist/ — run the build first.');
  process.exit(1);
}

if (!SITE_URL) {
  console.error('[emit-api] SITE_URL is empty in src/siteConfig.js — every url in the payloads would be relative.');
  process.exit(1);
}

const missing = STATIC_ENDPOINTS.filter((endpoint) => !BUILDERS[endpoint.id]);

if (missing.length) {
  console.error(
    `[emit-api] no builder for ${missing.map((endpoint) => endpoint.id).join(', ')} — ` +
      'every endpoint in apiMeta.js needs one here, or it is documented on /api and 404s when fetched.',
  );
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

let bytes = 0;
const payloads = {};

for (const endpoint of STATIC_ENDPOINTS) {
  const body = envelope(endpoint, BUILDERS[endpoint.id]());
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  const target = join(outDir, endpoint.file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, payload);
  payloads[endpoint.id] = body;
  bytes += Buffer.byteLength(payload);
}

let statusSample = null;
try {
  statusSample = JSON.parse(await readFile(LIVE_STATUS, 'utf8'));
} catch {
  statusSample = null;
}

const spec = `${JSON.stringify(openapi(payloads, statusSample), null, 2)}\n`;
await writeFile(join(outDir, 'openapi.json'), spec);
bytes += Buffer.byteLength(spec);

const llms = llmsTxt(payloads);
await writeFile(join(root, 'dist/llms.txt'), llms);

const live = ENDPOINTS.filter((endpoint) => endpoint.live).map((endpoint) => endpoint.path);

console.log(
  `[emit-api] ${STATIC_ENDPOINTS.length} endpoints written to dist/api/${API_VERSION} ` +
    `(${(bytes / 1024).toFixed(1)} kB), ${live.length} served live by nginx: ${live.join(', ')}`,
);
console.log(
  `[emit-api] openapi.json — ${ENDPOINTS.length} paths, response schemas inferred from the payloads ` +
    `(status ${statusSample ? 'from the live snapshot' : 'unschema’d: no snapshot at ' + LIVE_STATUS})`,
);
console.log(`[emit-api] dist/llms.txt — ${llms.split('\n').length} lines for agents and crawlers`);
