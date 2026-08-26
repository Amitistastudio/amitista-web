import React from 'react';
import { H2, H3, P, UL, OL, LI, Code, Pre, Note, Table, A } from '../../components/docs/prose';
import { API_BASE, API_VERSION, ENDPOINTS } from '../apiMeta';
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
  RULESET,
  DEFENCES,
  LAYERS,
  SINKS,
  SECRET_PATTERNS,
  SHAPE_RULES,
  RATE_LIMITS,
  BASELINE_RULES,
  DENIAL,
} from '../shieldRules';
import { SITE_URL } from '../../siteConfig';

const SINK_FAMILIES = [...new Set(SINKS.map((sink) => sink.id))];

export const DOC_BODIES = {
  'public-api': () => (
    <>
      <P>
        This site publishes a read-only JSON API. It describes Shield — the application
        security package we publish for Express — the rules Shield enforces, and the health
        of the machine serving this page. Everything in it is a <Code>GET</Code>. There is
        no write endpoint, and there never will be one.
      </P>
      <P>
        Most of it needs a token. Make one under <A href="/admin">Account → API</A> and send
        it as <Code>Authorization: Bearer …</Code>. The exceptions are the signed feed at{' '}
        <Code>{`${API_BASE}/shield/feed`}</Code> and its status, which stay open: the installs
        polling them trust the signature on the document rather than this host, and have
        nowhere to keep a secret.
      </P>
      <H2 id="base">Base address</H2>
      <Pre label="Base">{`${SITE_URL}${API_BASE}`}</Pre>
      <P>
        The version lives in the path. Fields may be added to a response, but nothing already
        published gets renamed or removed — a breaking change becomes a new version at a new
        path, and {API_VERSION} keeps answering. The Shield ruleset carries its own integer,
        which does move; see <A href="/docs/shield-api">The Shield API</A>.
      </P>
      <H2 id="endpoints">Endpoints</H2>
      <Table
        head={['Path', 'Token', 'Returns', 'Changes']}
        rows={ENDPOINTS.map((endpoint) => [
          endpoint.path,
          endpoint.auth === 'open' ? 'Not needed' : 'Required',
          endpoint.blurb,
          endpoint.freshness,
        ])}
      />
      <P>
        Every path also answers with <Code>.json</Code> on the end, so{' '}
        <Code>{`${API_BASE}/shield`}</Code> and <Code>{`${API_BASE}/shield.json`}</Code> return
        the same document. Use whichever your tooling is happier with.
      </P>
      <H2 id="rules">What you can rely on</H2>
      <Table
        head={['', 'Behaviour']}
        rows={[
          ['Authentication', 'A bearer token on every endpoint but the feed and its status. Authorization: Bearer, or X-API-Key if your client prefers it.'],
          ['Methods', 'GET and HEAD. Anything else is refused by the server before it reaches a file.'],
          ['CORS', 'Access-Control-Allow-Origin: * on every response, with authorization named in the allowed headers. A token makes the request non-simple, so a browser preflights it first.'],
          ['Caching', 'no-store on the token endpoints, because a response that depended on who asked must not sit in a shared cache. The open feed and its status are unchanged and still carry an ETag.'],
          ['Content type', 'application/json throughout.'],
          ['No token', '401. A wrong scope or a revoked token is 403, and too many requests is 429.'],
          ['Unknown paths', '404 — but only once a token has been accepted, so an anonymous caller cannot map the surface by watching 401 turn into 404.'],
        ]}
      />
      <P>
        Behind the token the work is the same as it ever was: a small read-only gateway that
        checks the token and reads a file off disk. Nothing is computed per request, so there
        is nothing here to overload and nothing that can take an application down with it.
      </P>
      <H2 id="envelope">The envelope</H2>
      <P>
        Every response opens with the same four fields before the body of the document
        starts.
      </P>
      <Table
        head={['Field', 'Meaning']}
        rows={[
          ['endpoint', 'The path this document was served from, echoed back. A response saved to disk still says where it came from.'],
          ['version', `The API version, matching the ${API_VERSION} in the path.`],
          ['generated', 'When the build that wrote the file ran, ISO 8601 in UTC. For the static endpoints this doubles as the release timestamp.'],
          ['documentation', 'A link back to the explorer, so whatever is reading the JSON can find the reference without being told where it is.'],
        ]}
      />
      <H2 id="machine-readable">For programs and agents</H2>
      <UL>
        <LI>
          <Code>{`${API_BASE}/openapi.json`}</Code> — an OpenAPI 3.1 specification covering
          every endpoint, with a response schema inferred from the real payload and a
          description on each field.
        </LI>
        <LI>
          <Code>/llms.txt</Code> — a short plain-text map of the site and this API, for
          crawlers and agents that would otherwise scrape the pages.
        </LI>
        <LI>
          <A href="/api">The explorer</A> — the same documents rendered field by field, with
          the source of each value.
        </LI>
      </UL>
      <Note title="Prefer the API to scraping">
        <p>
          The pages and the JSON carry the same content. The JSON will not break when the
          markup changes.
        </p>
      </Note>
    </>
  ),

  'shield-api': () => (
    <>
      <P>
        Shield is a package that maps every route in an Express application, watches the
        dangerous calls it makes at runtime, and refuses the requests that abuse them. It
        runs inside your process. The Shield API is how it publishes the rules it enforces —
        two documents, both static, both behind a token.
      </P>
      <P>
        It is not an endpoint you send anything to. Your source, your traffic and your
        findings never leave your machine, and there is no route here that would accept
        them.
      </P>
      <H2 id="endpoints">The two documents</H2>
      <Table
        head={['Path', 'Answers']}
        rows={[
          [`${API_BASE}/shield`, 'What the package is: version, runtime, how to install it, the modes it runs in, the categories it detects, and what it does not catch.'],
          [`${API_BASE}/shield/rules`, `The detection catalogue itself: ${SINKS.length} dangerous calls with the argument that is actually the injection point, the request shapes treated as abuse, and the default rate limits.`],
        ]}
      />
      <H2 id="shield-document">The package document</H2>
      <Pre label="Terminal">{`curl -s ${SITE_URL}${API_BASE}/shield | jq '.package, .packageVersion, .ruleset'`}</Pre>
      <Table
        head={['Field', 'Holds']}
        rows={[
          ['package, packageVersion', `The npm name and the published version these rules were cut from — currently ${SHIELD_PACKAGE} ${SHIELD_VERSION}.`],
          ['ruleset', 'An integer that increments whenever a rule is added, removed, or has its severity changed.'],
          ['runtime, framework', `The minimum Node version and the framework the middleware attaches to: ${SHIELD_RUNTIME}, ${SHIELD_FRAMEWORK}.`],
          ['install, usage, start', 'The three commands that turn it on, exactly as they should be typed.'],
          ['modes[]', 'The two ways it runs: monitor reports, block refuses.'],
          ['verification', 'How the package checks it is genuinely attached to the running application, and what it does when it finds it is not.'],
          ['denial', 'What a refused request receives — status codes, the block page, and the reference format.'],
          ['layers[]', `The ${LAYERS.length} places a check can happen, each with the number of checks it holds.`],
          ['defends[]', `All ${DEFENCES.length} checks, with an id, a severity, the layer it runs in and a one-line summary.`],
          ['limits[]', `The ${SHIELD_LIMITS.length} things the package does not catch, published deliberately.`],
        ]}
      />
      <Note title="Read the limits array">
        <p>
          A security tool that only lists its strengths is telling you half of what you need
          in order to decide. The limits are part of the response for that reason.
        </p>
      </Note>
      <H2 id="rules-document">The rules document</H2>
      <P>
        This is the catalogue as data, meant for anyone building their own view of it — a
        dashboard, a linter, a comparison against another tool.
      </P>
      <Table
        head={['Field', 'Holds']}
        rows={[
          ['counts', 'The size of each collection below, so a caller can sanity-check a response without walking it.'],
          ['sinks[]', `${SINKS.length} entries across ${SINK_FAMILIES.length} families (${SINK_FAMILIES.join(', ')}). Each names a module and method, and lists injectionArgs — the argument positions that are actually the injection point.`],
          ['secretPatterns[]', `${SECRET_PATTERNS.length} credential formats, each a labelled regular expression, used to catch keys in source and in outgoing responses.`],
          ['responseMethods[]', 'The response methods wrapped when a reply is written.'],
          ['shape', `Payload rules: the prototype-pollution keys, ${SHAPE_RULES.queryOperators.length} database query operators refused inside user input, and the hard limits on depth, key count, array length and string size.`],
          ['baseline', 'How the learning layer classifies values, and the defaults it learns under.'],
          ['rateLimits', 'The default budgets, and the pattern that marks a path as sensitive.'],
        ]}
      />
      <H3>Reading a sink entry</H3>
      <Pre label={`${API_BASE}/shield/rules`}>{JSON.stringify(SINKS[0], null, 2)}</Pre>
      <P>
        <Code>injectionArgs</Code> is the part worth having. Knowing that{' '}
        <Code>child_process.exec</Code> is dangerous is common knowledge; knowing which
        argument carries the payload is what lets a check be precise rather than noisy.
      </P>
      <H3>Defaults you may want to quote</H3>
      <Table
        head={['Setting', 'Default']}
        rows={[
          ['Request budget', `${RATE_LIMITS.defaults.max} requests per ${RATE_LIMITS.defaults.windowMs / 1000} seconds`],
          ['Sensitive paths', `${RATE_LIMITS.defaults.sensitiveMax} per window, for login, register, token, reset and similar`],
          ['Burst', `${RATE_LIMITS.defaults.burstMax} requests per ${RATE_LIMITS.defaults.burstWindowMs / 1000} second`],
          ['Payload depth', `${SHAPE_RULES.limits.maxDepth} levels, ${SHAPE_RULES.limits.maxKeys} keys, ${SHAPE_RULES.limits.maxArray} array entries`],
          ['Baseline maturity', `${BASELINE_RULES.defaults.minSamples} samples before a route is judged, then frozen`],
        ]}
      />
      <H2 id="ruleset">The ruleset number</H2>
      <P>
        <Code>ruleset</Code> is at {RULESET} today. It is the only field worth polling: compare
        it against the copy you hold, and refetch the catalogue only when it has moved. The
        package does exactly this — it polls on a timer, caches to disk, and fails open, so
        an application keeps defending itself on the last ruleset it holds even if this
        server is unreachable.
      </P>
      <H2 id="denial">The refusal contract</H2>
      <P>
        When Shield refuses a request in block mode, what the caller receives is published
        here rather than left implicit — anything that renders a block page has to agree
        with the package about it.
      </P>
      <Table
        head={['Caller', 'Receives']}
        rows={DENIAL.behaviour.map((entry) => [entry.when, entry.response])}
      />
      <UL>
        <LI>
          One reference per request, not per finding, in the format{' '}
          <Code>{DENIAL.referenceExample}</Code>, repeated in the{' '}
          <Code>{DENIAL.referenceHeader}</Code> header. A visitor who trips three rules quotes
          one code, and it matches one line in your log.
        </LI>
        <LI>
          The <Code>rule</Code> in the block page query is the same id as{' '}
          <Code>defends[].id</Code> in the package document.
        </LI>
        <LI>
          The block page is configurable, and left at its default it carries our name — which
          is wrong for anyone else running the package. Set it; see{' '}
          <A href="/docs/shield-setup">Setting up Shield</A>.
        </LI>
      </UL>
      <H2 id="further">Further</H2>
      <P>
        <A href="/shield">The Shield page</A> explains what each layer does and why. The{' '}
        <A href="/api">explorer</A> renders both documents field by field with the source of
        every value.
      </P>
    </>
  ),

  'shield-setup': () => (
    <>
      <P>
        Three lines and it is on. This page covers those three, then the settings worth
        changing before you rely on it.
      </P>
      <H2 id="requirements">Before you start</H2>
      <UL>
        <LI>
          Node 18 or newer — <Code>{SHIELD_RUNTIME}</Code>. Below that, the async context the
          package tracks requests with is not available.
        </LI>
        <LI>
          An Express application. The middleware attaches to <Code>{SHIELD_FRAMEWORK}</Code>{' '}
          and nothing else, and a route that never passes through it is not covered.
        </LI>
        <LI>Somewhere to read stderr. Findings go there by default.</LI>
      </UL>
      <H2 id="install">Install and mount</H2>
      <Pre label="Terminal">{SHIELD_INSTALL}</Pre>
      <Pre label="server.js">{`const express = require('express');
const shield = require('${SHIELD_PACKAGE}');

const app = express();

app.use(express.json());
${SHIELD_USAGE};

app.get('/', (req, res) => res.send('ok'));

app.use(shield.errorHandler());

const server = app.listen(3000);
shield.harden(server);`}</Pre>
      <P>
        Order matters twice here. <Code>protect()</Code> goes after the body parser, so there
        is a parsed body to inspect, and before your routes.{' '}
        <Code>errorHandler()</Code> goes last, because the runtime checks throw from inside
        your handler and the refusal is shaped there.
      </P>
      <H2 id="preload">Start it with the preload</H2>
      <Pre label="Terminal">{SHIELD_START}</Pre>
      <P>
        This is the step people skip, and it is the one that decides whether any of it works.
        Modules capture their references to <Code>child_process</Code>, <Code>fs</Code> and{' '}
        <Code>fetch</Code> when they are first loaded. The preload runs before your
        application graph is linked, so the hooks are in place by the time your route files
        take those references. An application using <Code>import</Code> that starts without
        it gets no runtime cover at all.
      </P>
      <Note title="It will tell you">
        <p>
          A startup probe checks whether the hooks are attached to your application rather
          than only to the package, and prints a named warning on
          stderr listing exactly which protections are inactive. The dangerous state is not
          being unprotected — it is being unprotected while every log line says otherwise.
        </p>
      </Note>
      <Pre label="Health check">{`const health = shield.health();

if (health && !health.healthy) {
  process.exit(1);
}`}</Pre>
      <H2 id="modes">Monitor first, then block</H2>
      <Table head={['Mode', 'Does']} rows={SHIELD_MODES.map((mode) => [mode.id, mode.summary])} />
      <OL>
        <LI>Run in monitor for a week of real traffic. Nothing is refused; everything is reported.</LI>
        <LI>
          Read what came out — <Code>shield.findings()</Code> returns the recent history as an
          array — and fix or ignore each one.
        </LI>
        <LI>
          Switch to <Code>{`mode: 'block'`}</Code> once the log is quiet. Only critical and
          high findings refuse a request; the rest continue to report.
        </LI>
      </OL>
      <H2 id="options">Options</H2>
      <Table
        head={['Option', 'Default', 'Purpose']}
        rows={SHIELD_OPTIONS.map((option) => [option.name, option.default, option.purpose])}
      />
      <H3 id="settings">The nested ones worth setting</H3>
      <P>
        These sit inside the options above. Each one has a default that is a compromise
        rather than an answer, and the first is the one a deployment behind nginx has to
        set or the limiter is counting the whole internet as a single client.
      </P>
      <Table
        head={['Setting', 'Default', 'Purpose']}
        rows={SHIELD_SETTINGS.map((setting) => [setting.name, setting.default, setting.purpose])}
      />
      <Pre label="A realistic configuration">{`app.use(shield.protect({
  mode: 'block',
  blockPage: 'https://example.com/blocked',
  paths: { root: '/srv/app/uploads' },
  onFinding: (finding) => logger.warn(finding),
  ignore: (finding, req) => req.path === '/admin/export' && finding.id === 'filesystem',
  rateLimit: { max: 300, sensitiveMax: 5, trustProxy: 1 },
}));`}</Pre>
      <P>
        Running it for real — behind a proxy, across several workers, with a job queue
        alongside it — is covered in <A href="/docs/shield-operating">Running Shield</A>.
      </P>
      <H2 id="surface">What else the package exports</H2>
      <Table
        head={['Call', 'For']}
        rows={SHIELD_SURFACE.map((entry) => [entry.call, entry.purpose])}
      />
      <H2 id="block-page">The block page</H2>
      <P>
        A refused browser navigation is sent to <Code>blockPage</Code> with two query
        parameters: <Code>ref</Code>, the reference for the refusal, and <Code>rule</Code>,
        the id of the rule that caused it. Whatever you point that at should show the
        reference back to the visitor, so a genuine user has something to quote when they
        contact you. The ids are published in{' '}
        <A href="/docs/shield-api">the Shield API</A> under <Code>defends[].id</Code>.
      </P>
      <H2 id="scan">The one-off scan</H2>
      <P>
        Separately from the runtime, the package ships a command that reads your source and
        prints every route, its guards, and where each route&rsquo;s input can end up. It
        uploads nothing and writes nothing.
      </P>
      <Pre label="Terminal">{`npx shield scan .
npx shield scan . --min-severity=high
npx shield scan . --json > shield.json
npx shield scan . --fail-on=critical`}</Pre>
      <P>
        <Code>--fail-on</Code> exits non-zero when a finding at or above that level exists,
        which is the form to put in a pipeline.
      </P>
      <H2 id="limits">What it will not do</H2>
      <UL>
        {SHIELD_LIMITS.map((limit) => (
          <LI key={limit}>{limit}</LI>
        ))}
      </UL>
      <Note title="It is one layer">
        <p>
          Shield sits inside your process, which is the right place to see what a request
          made your code do and the wrong place to stop a flood. Keep the checks in front of
          it — the ones in <A href="/docs/security">Security</A> — rather than replacing them
          with this.
        </p>
      </Note>
    </>
  ),

  'shield-operating': () => (
    <>
      <P>
        Setting it up takes three lines. Running it takes a handful of decisions that only
        come up once there is real traffic, several processes, and work happening outside
        the request that started it. This page is those decisions.
      </P>
      <H2 id="proxy">Behind a proxy</H2>
      <P>
        The limiter counts per client, and it decides who the client is from the socket. If
        nginx, a load balancer or a CDN sits in front of you, every request arrives from the
        loopback address and the whole internet shares one budget — which stops protecting
        anybody and starts refusing everybody at the same moment.
      </P>
      <Pre label="server.js">{`app.use(shield.protect({
  rateLimit: { trustProxy: 1 },
}));`}</Pre>
      <P>
        <Code>trustProxy: 1</Code> counts one hop back from the right of{' '}
        <Code>X-Forwarded-For</Code>, which is the form a client cannot spoof by appending
        its own header. <Code>true</Code> takes the leftmost entry and is only safe when
        something in front of you rewrites that header. A function is also accepted, for
        keying on a session or an account instead of an address.
      </P>
      <Note title="It will say so">
        <p>
          If requests keep arriving from the loopback address with a forwarded header set and
          this is still off, the package writes a one-time notice to stderr saying exactly
          that. A misconfigured limiter looks identical to a working one from the outside,
          which is why it is said out loud rather than left to be noticed.
        </p>
      </Note>
      <H2 id="workers">More than one process</H2>
      <P>
        Every count is per process. Four workers means four separate budgets, and a client
        held to 120 requests a minute can send 480. Sharing the counting would put a network
        round trip on the hot path of every request, so the package does not — but a{' '}
        <em>decision</em> is one message rather than one per request, and that is worth
        sharing.
      </P>
      <Pre label="Fanning a block out">{`app.use(shield.protect({
  rateLimit: {
    onBlock: (client, until, ms) => bus.publish('shield:block', { client, ms }),
  },
}));

bus.subscribe('shield:block', ({ client, ms }) => shield.block(client, ms));`}</Pre>
      <P>
        <Code>onBlock</Code> fires once, when a client earns a temporary block.{' '}
        <Code>shield.block()</Code> applies one that arrived from somewhere else. Use any bus
        you already have; the package deliberately ships no client for one.
      </P>
      <H2 id="queues">Work that leaves the request</H2>
      <P>
        The runtime layer knows a value came from the caller because the request carries a
        context with it. That context follows <Code>await</Code> and ordinary callbacks. It
        does not follow a job queue, a worker thread, or a listener registered once at
        startup — and work that runs without it runs with every hook inert, silently.
      </P>
      <Pre label="Carrying it across">{`app.post('/reports', (req, res) => {
  queue.push(shield.bind(() => buildReport(req.body.spec)));
  res.status(202).json({ queued: true });
});`}</Pre>
      <P>
        <Code>bind()</Code> is a no-op outside a request, so it is safe to wrap anything. If
        you take one thing from this page for an application with background work, take this
        one: it is the difference between a covered job and a job that reports nothing
        forever.
      </P>
      <H2 id="roots">Telling it where your files live</H2>
      <P>
        Without help, the filesystem rule reads the shape of a path: a parent-directory
        segment, an absolute path, a null byte. That catches the obvious attempt and misses
        the path assembled out of innocent-looking pieces.
      </P>
      <Pre label="Confinement instead of syntax">{`app.use(shield.protect({
  paths: { root: '/srv/app/uploads' },
}));`}</Pre>
      <P>
        With a root declared it resolves the path and asks whether it lands inside. A{' '}
        <Code>../</Code> that ends up back in the directory stops being a finding, and a path
        that leaves is one whether or not it looks suspicious. A list of roots is accepted
        for an application that legitimately reads from several places.
      </P>
      <H2 id="swallowed">When your handler catches the refusal</H2>
      <P>
        In block mode the runtime layer throws from inside your handler, and{' '}
        <Code>errorHandler()</Code> shapes what the caller sees. Most handlers wrap their own
        file and database work in a <Code>try/catch</Code>, which catches that refusal along
        with the errors it was written for.
      </P>
      <P>
        The refusal is remembered as well as thrown, so a handler that swallows it still does
        not get to serve the request: the reply is refused as it is written. This is
        deliberate, and it means a 400 can come from a route whose own error handling looks
        like it recovered. The finding in your log says which rule it was.
      </P>
      <H2 id="reading">Reading what it has seen</H2>
      <Table
        head={['Call', 'Gives you']}
        rows={[
          ['shield.findings()', 'The recent findings, newest last. A ring buffer of 500 — a window, not the whole history.'],
          ['shield.stats()', 'Totals since startup, including dropped: how many findings have aged out of findings(). If that is not zero, you are reading a window.'],
          ['shield.health()', 'Whether the hooks are attached to your application, and which protections are inactive if they are not.'],
          ['shield.baselines()', 'How many routes the learning layer watches, how many have matured, how many are warming up.'],
          ['shield.feed()', 'The rules feed status: serial, last fetch, and what the last update added.'],
        ]}
      />
      <Pre label="An operational endpoint">{`app.get('/internal/shield', requireAdmin, (req, res) => {
  res.json({
    health: shield.health(),
    stats: shield.stats(),
    baselines: shield.baselines(),
    feed: shield.feed(),
  });
});`}</Pre>
      <Note title="Put it behind something">
        <p>
          That endpoint describes your defences and the attacks against them. It belongs
          behind the same authorisation as the rest of your admin surface, on an internal
          route, or nowhere.
        </p>
      </Note>
      <H2 id="socket">The socket underneath</H2>
      <P>
        A slowloris never reaches a route handler, so no middleware can stop it. Node&rsquo;s
        defaults let a client hold a connection open for five minutes having sent almost
        nothing.
      </P>
      <Pre label="One line at startup">{`const server = app.listen(3000);
shield.harden(server);`}</Pre>
      <Table
        head={['Setting', 'Node default', 'After harden()']}
        rows={[
          ['headersTimeout', '60s', '20s'],
          ['requestTimeout', '300s', '60s'],
          ['keepAliveTimeout', '5s', '5s'],
          ['maxHeadersCount', '2000', '100'],
        ]}
      />
      <P>
        With <Code>verify</Code> on, a server still running the defaults gets a one-time
        notice on stderr pointing at this.
      </P>
      <H2 id="noise">Tuning the noise</H2>
      <UL>
        <LI>
          <Code>ignore</Code> takes the finding and the request and drops it when you return
          true. For the one route that legitimately does the alarming thing — not as a way to
          quieten a rule everywhere.
        </LI>
        <LI>
          <Code>learn.warmupSamples</Code> decides when a young route starts being judged
          provisionally: reported one grade down, never enforced, and marked provisional in
          the finding.
        </LI>
        <LI>
          <Code>learn.enforce</Code> is the highest false-positive risk in the package and
          stays off until you name it, even in block mode.
        </LI>
        <LI>
          <Code>response.maxNodes</Code> and <Code>response.maxArray</Code> decide how much of
          a large reply the leak scan reads. Raise them on bulk endpoints, where the row that
          matters is not the first one.
        </LI>
      </UL>
      <P>
        What none of it does is on <A href="/docs/shield-setup#limits">Setting up Shield</A>,
        and in the API under <Code>limits</Code>.
      </P>
    </>
  ),

  'api-consuming': () => (
    <>
      <P>
        Worked examples for reading the API from a program. Nothing here needs a key, and
        every response may be read from a browser on any origin.
      </P>
      <H2 id="fetching">Fetching</H2>
      <Pre label="Terminal">{`curl -s ${SITE_URL}${API_BASE} | jq '.endpoints[].path'
curl -s ${SITE_URL}${API_BASE}/shield | jq '.limits'
curl -s ${SITE_URL}${API_BASE}/shield/rules | jq '.sinks | length'
curl -s ${SITE_URL}${API_BASE}/status | jq '.overall'`}</Pre>
      <Pre label="Node">{`const res = await fetch('${SITE_URL}${API_BASE}/shield');

if (!res.ok) throw new Error(\`shield api: \${res.status}\`);

const shield = await res.json();

console.log(shield.packageVersion, shield.ruleset, shield.defends.length);`}</Pre>
      <P>
        Read <Code>{`${API_BASE}`}</Code> rather than hard-coding the paths below it. The index
        lists every endpoint this version publishes, with its URL and the shape of what it
        returns, so a client written against it survives the addition of a new one.
      </P>
      <H2 id="polling">Polling without being wasteful</H2>
      <P>
        The static documents change when the site is deployed, which is not often. Compare{' '}
        <Code>ruleset</Code> against the copy you hold and skip the rest of the work when it
        has not moved.
      </P>
      <Pre label="Node">{`let known = ${RULESET};

async function refreshRules() {
  const head = await fetch('${SITE_URL}${API_BASE}/shield').then((r) => r.json());

  if (head.ruleset === known) return null;

  known = head.ruleset;
  return fetch('${SITE_URL}${API_BASE}/shield/rules').then((r) => r.json());
}`}</Pre>
      <UL>
        <LI>Respect the cache headers — 300 seconds on everything except status, which is 240.</LI>
        <LI>
          Fail open. If this server is unreachable, keep using the copy you already have; it
          is a ruleset, not a licence check.
        </LI>
        <LI>Once every five minutes is plenty for status. Once a day is plenty for the rest.</LI>
      </UL>
      <H2 id="status">The status endpoint</H2>
      <P>
        The one document not written at build time. Six checks run against the machine
        serving this site every five minutes, and ninety days of results are kept.
      </P>
      <Table
        head={['Field', 'Holds']}
        rows={[
          ['overall', 'One word for the whole machine.'],
          ['checked', 'When the snapshot was taken.'],
          ['windowDays', 'How much history the days arrays cover.'],
          ['checks[].status', 'The current state of one check.'],
          ['checks[].uptime', 'Its share of successful samples across the window.'],
          ['checks[].days[]', 'One entry per day, oldest first — the data behind the bars on the status page.'],
        ]}
      />
      <P>
        <A href="/status">The status page</A> is this document rendered. If you are building
        an uptime board of your own, take the JSON.
      </P>
      <H2 id="errors">When something goes wrong</H2>
      <Table
        head={['Response', 'Means']}
        rows={[
          ['403', 'You used a method other than GET or HEAD. There are no write endpoints.'],
          ['404', 'No such path in this version. Check the index for what exists.'],
          ['A stale generated field', 'You are reading a cached copy. Everything static is cacheable for five minutes.'],
          ['Nothing at all', 'The server is unreachable. Use your cached copy and try later.'],
        ]}
      />
      <H2 id="terms">Using what you find</H2>
      <P>
        Read it, quote it, build against it. The content is ours — presenting it as your own
        is not on. If you are doing something substantial with it and want to know before a
        field moves, say so through <A href="/contact">the contact form</A> and we will tell
        you ahead of a change.
      </P>
    </>
  ),
};
