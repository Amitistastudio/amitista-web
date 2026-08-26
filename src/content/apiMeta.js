export const API_VERSION = 'v1';

export const API_BASE = '/api/v1';

const REGISTRY = [
  {
    id: 'index',
    auth: 'token',
    path: '/api/v1',
    file: 'index.json',
    served: 'build',
    icon: 'braces',
    name: 'Index',
    blurb:
      'Every endpoint below, machine readable, with the version and the moment this build was cut. Start here if something else is reading the API.',
    fields: ['version', 'generated', 'studio', 'endpoints[]'],
    freshness: 'Rebuilt with the site',
  },
  {
    id: 'shield',
    auth: 'token',
    path: '/api/v1/shield',
    file: 'shield.json',
    served: 'build',
    icon: 'shield',
    name: 'Shield',
    blurb:
      'The package itself: what it defends against, how to install it, which runtime it needs, the version of the ruleset it ships with, and the contract for the signed feed it polls.',
    fields: ['package', 'version', 'install', 'modes[]', 'defends[]', 'limits[]', 'feed'],
    freshness: 'Rebuilt with the site',
  },
  {
    id: 'shieldRules',
    auth: 'token',
    path: '/api/v1/shield/rules',
    file: 'shield/rules.json',
    served: 'service',
    emit: true,
    icon: 'list-checks',
    name: 'Shield rules',
    blurb:
      'The whole detection catalogue as data — every sink with the argument that is actually the injection point, the request shapes treated as abuse, and the rate limits applied by default. Carries the serial of the published ruleset and anything added since the build.',
    fields: ['ruleset', 'serial', 'published', 'sinks[].injectionArgs', 'shape.queryOperators', 'rateLimits.defaults'],
    freshness: 'When a rule is published',
  },
  {
    id: 'shieldFeed',
    auth: 'open',
    path: '/api/v1/shield/feed',
    served: 'service',
    emit: false,
    icon: 'rss',
    name: 'Shield feed',
    blurb:
      'The signed ruleset the package polls. The document is a JSON string with a detached ed25519 signature over exactly those bytes, verified against a key pinned inside the package rather than against this host. Read it if you want to audit what your installs are being told.',
    fields: ['document', 'signature.alg', 'signature.keyId', 'signature.value'],
    freshness: 'When a rule is published',
  },
  {
    id: 'shieldFeedStatus',
    auth: 'open',
    path: '/api/v1/shield/feed/status',
    served: 'service',
    emit: false,
    icon: 'radio',
    name: 'Feed status',
    blurb:
      'Whether the feed is being published and at which serial. Totals only — nothing here is per caller, because the package sends nothing and this end keeps nothing.',
    fields: ['ok', 'serial', 'started', 'served.feed', 'served.notModified', 'error'],
    freshness: 'Per request',
  },
  {
    id: 'status',
    auth: 'token',
    path: '/api/v1/status',
    served: 'service',
    emit: false,
    icon: 'activity',
    name: 'Status',
    blurb:
      'Six checks against the machine serving this page, recorded every five minutes and kept for ninety days.',
    fields: ['overall', 'checked', 'windowDays', 'checks[].status', 'checks[].uptime', 'checks[].days[]'],
    freshness: 'Every 5 minutes',
  },
];

export const ENDPOINTS = REGISTRY.map((endpoint) => ({
  ...endpoint,
  live: endpoint.served === 'service',
  emit: endpoint.emit ?? endpoint.served === 'build',
}));

export const STATIC_ENDPOINTS = ENDPOINTS.filter((endpoint) => endpoint.emit);

export const API_NOTES = [
  {
    icon: 'key-round',
    title: 'A token on every endpoint but two',
    short: 'Bearer token required. The feed and its status stay open.',
    body: 'Send a token as Authorization: Bearer, or as X-API-Key if that suits your client better. Make one under Account → API; a token carries scopes, an optional address allow list and its own rate limit, and revoking it takes effect on the next request. The two exceptions are the signed feed and its status, which stay open because the installs polling them trust the signature on the document rather than this host, and have nowhere to keep a secret.',
  },
  {
    icon: 'download',
    title: 'Your code never comes here',
    short: 'Rules come down. Nothing accepts source, traffic or findings.',
    body: 'Shield analyses and defends inside your process. This API only sends rules down. There is no endpoint that accepts source, traffic or findings, and there never will be one.',
  },
  {
    icon: 'globe',
    title: 'Open to any origin',
    short: 'Allow-Origin *, preflight answered, ETag exposed. No proxy needed.',
    body: 'Every response carries Access-Control-Allow-Origin: *, preflight is answered, and both authorization and ETag are named in the CORS headers — so a browser on your own domain can send a token and make conditional requests without a proxy in between. A request carrying a token is never a simple one, so expect a preflight before each new path.',
  },
  {
    icon: 'zap',
    title: 'Never your critical path',
    short: 'A read-only gateway and a read-only feed. The package fails open.',
    body: 'The token endpoints are served by a small read-only gateway that checks the token and reads a file. The feed and its status come from a separate read-only service alongside it. Neither computes anything beyond reading a file, and the package fails open, so this being down — or your token being wrong — cannot take your app with it.',
  },
  {
    icon: 'clock',
    title: 'Cached where caching is safe',
    short: 'Token endpoints are no-store. The open feed still carries an ETag.',
    body: 'A response that depended on who asked must not sit in a shared cache, so every token endpoint is sent no-store. The feed and its status are unchanged: still cacheable, still carrying an ETag, so the package polls on a timer, sends the ETag back, and a 304 costs it nothing.',
  },
  {
    icon: 'shield-check',
    title: 'Versioned in the path',
    short: 'v1 is frozen in shape. Fields get added, never renamed or removed.',
    body: 'v1 is frozen in shape. Fields may be added, but nothing already published gets renamed or removed — a breaking change becomes v2 at a new path. The ruleset carries its own integer, which does move.',
  },
];

export const API_CALLS = [
  {
    id: 'shell',
    label: 'Shell',
    hint: 'The rule catalogue. Keep the token in the environment, not in the command.',
    code: 'curl -s https://amitista.com/api/v1/shield/rules \\\n  -H "Authorization: Bearer $AMITISTA_TOKEN"',
  },
  {
    id: 'node',
    label: 'Node',
    hint: 'Everything is JSON, and CORS names the authorization header, so this works in a browser on your own domain too.',
    code: "const base = 'https://amitista.com/api/v1';\nconst res = await fetch(`${base}/shield/rules`, {\n  headers: { Authorization: `Bearer ${process.env.AMITISTA_TOKEN}` },\n});\nconst { sinks, rateLimits } = await res.json();",
  },
  {
    id: 'feed',
    label: 'The open feed',
    hint: 'The signed feed takes no token. Verify the signature, never the host.',
    code: "const res = await fetch('https://amitista.com/api/v1/shield/feed', {\n  headers: { 'If-None-Match': etag },\n});\nif (res.status === 304) return cached;",
  },
];

export const API_MACHINE = [
  {
    path: '/api/v1/openapi.json',
    label: 'OpenAPI 3.1',
    blurb: 'Every endpoint with a schema inferred from the real payload. Point a generator at it.',
  },
  {
    path: '/llms.txt',
    label: 'llms.txt',
    blurb: 'A plain-text map of the site and this API, for agents that would otherwise scrape it.',
  },
];
