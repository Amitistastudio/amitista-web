import React from 'react';
import { H2, H3, P, UL, OL, LI, Code, Pre, Note, Table, A } from '../../components/docs/prose';
import { CONTACT_EMAIL } from '../../siteConfig';

export const DOC_BODIES = {
  'deployment': () => (
    <>
      <P>
        Building produces a folder of static files, normally <Code>dist</Code>, which is
        what your host serves. Nothing in it needs Node.js at runtime.
      </P>
      <Pre label="Terminal">{`npm run build     # writes the production build to dist/
npm run preview   # serves that build locally so you can check it`}</Pre>
      <H2 id="spa-fallback">Multi-page routing</H2>
      <P>
        If the project has more than one page, routing happens in the browser. The server
        must return <Code>index.html</Code> for any path it does not recognise, otherwise
        opening a URL directly, or refreshing on one, returns a 404. Every host has its own
        way of saying this.
      </P>
      <Pre label="Netlify — public/_redirects">{`/*    /index.html   200`}</Pre>
      <Pre label="Vercel — vercel.json">{`{
"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}`}</Pre>
      <Pre label="nginx">{`location / {
try_files $uri $uri/ /index.html;
}`}</Pre>
      <H2 id="continuous">Deploying from a repository</H2>
      <P>
        Most hosts can watch a branch and rebuild whenever it changes, which is the
        arrangement we set up by default. Pushing to the main branch publishes; pushing to
        any other branch usually produces a preview URL you can check first.
      </P>
      <Table
        head={['Setting', 'Typical value']}
        rows={[
          ['Build command', 'npm run build'],
          ['Output directory', 'dist'],
          ['Node version', '20 or newer'],
          ['Install command', 'npm ci, falling back to npm install'],
        ]}
      />
      <H2 id="checks">Before you announce it</H2>
      <UL>
        <LI>Open a deep link directly, not just the home page, and refresh it.</LI>
        <LI>Check the site on a phone as well as a desktop.</LI>
        <LI>Send a message through any contact form and confirm it arrives.</LI>
        <LI>Confirm the domain serves over HTTPS and redirects from HTTP.</LI>
      </UL>
      <H2 id="rollback">Rolling back</H2>
      <P>
        Every host we use keeps previous deployments and can restore one in a click. That is
        the fastest fix when a release goes wrong: put the last good build back first, then
        work out what happened without the site being broken while you do it.
      </P>
      <Note title="Deploy on a quiet day">
        <p>
          Not Friday evening. Not the morning of a campaign. A deploy is only safe if
          someone is around to notice the thing it broke.
        </p>
      </Note>
    </>
  ),
  'environments': () => (
    <>
      <P>
        The same project runs in more than one place at once. Keeping them straight is the
        difference between testing a change and testing it on your customers.
      </P>
      <H2 id="the-three">The three you will meet</H2>
      <Table
        head={['Environment', 'Where it runs', 'Who sees it']}
        rows={[
          ['Local', 'A developer machine, via npm run dev', 'Whoever is working on it'],
          ['Staging', 'A private URL on the same host as production', 'You and us, before a release'],
          ['Production', 'Your domain', 'Everyone'],
        ]}
      />
      <H2 id="staging">What staging is for</H2>
      <P>
        Staging is where a change is reviewed with real hosting behaviour — real redirects,
        real certificates, real build output — before it reaches the live domain. It is the
        right place to sign off wording, check a layout on your own phone, and confirm a
        form still submits.
      </P>
      <P>
        It should be kept out of search results. We set that up, but if you point a search
        engine or a link-preview crawler at it directly, it can still end up indexed.
      </P>
      <H2 id="data">Data and keys per environment</H2>
      <P>
        Staging should never write to the live database or send real email to real
        customers. Where a project has both, each environment gets its own keys and its own
        data, set in the host&rsquo;s environment variable panel rather than in the code.
      </P>
      <Pre label="Environment variables, set per environment">{`# staging
VITE_API_URL=https://staging-api.example.com

# production
VITE_API_URL=https://api.example.com`}</Pre>
      <H2 id="promoting">Getting a change live</H2>
      <OL>
        <LI>The change is built and reviewed locally.</LI>
        <LI>It is deployed to staging, and you look at it there.</LI>
        <LI>Once you approve it, the same build is promoted to production.</LI>
        <LI>If it misbehaves, the previous deployment is restored — see <A href="/docs/deployment">Deploying</A>.</LI>
      </OL>
      <Note title="Not every project needs staging">
        <p>
          A small marketing site is often fine with preview URLs alone. Anything with
          accounts, payments or stored data is not — ask for staging if your project has
          them and does not have one.
        </p>
      </Note>
    </>
  ),
  'configuration': () => (
    <>
      <P>
        Details that change over the life of a project — contact addresses, links, keys —
        are kept in one place rather than scattered through the code, so you can edit them
        without hunting.
      </P>
      <H2 id="site-details">Site details</H2>
      <P>
        Text such as the contact address and business details sits in a single config file.
        On this site that is <Code>src/siteConfig.js</Code>. Change a value there and it
        updates everywhere it appears.
      </P>
      <Pre label="src/siteConfig.js">{`export const STUDIO_NAME = 'Amitista Studio';
export const CONTACT_EMAIL = '${CONTACT_EMAIL}';`}</Pre>
      <H2 id="secrets">Keys and secrets</H2>
      <P>
        Anything private — API keys, tokens, database credentials — belongs in environment
        variables, not in the code and never in a repository.
      </P>
      <Pre label=".env">{`VITE_API_URL=https://api.example.com`}</Pre>
      <Note title="Anything sent to the browser is public">
        <p>
          A variable read by the front end can be seen by anyone who opens the page,
          whatever it is named. Keys that must stay secret have to live on a server. Ask us
          if you are unsure which kind you are holding.
        </p>
      </Note>
      <H2 id="where-they-live">Where each value belongs</H2>
      <Table
        head={['Kind of value', 'Where it goes', 'Example']}
        rows={[
          ['Public text and links', 'The config file in the repository', 'Contact address, social links'],
          ['Public per-environment values', 'Environment variables on the host', 'API base URL'],
          ['Secrets', 'Environment variables on a server only', 'Database password, private API key'],
          ['Local-only values', 'A .env file, never committed', 'A test key while developing'],
        ]}
      />
      <H3>After changing configuration</H3>
      <P>
        Rebuild and redeploy. Values are baked in at build time, so editing a file on the
        server without rebuilding changes nothing.
      </P>
    </>
  ),
  'domains-dns': () => (
    <>
      <P>
        A domain is rented from a registrar and points at your hosting through DNS records.
        Where possible the domain should be registered in your name, not ours, so control
        of it never depends on us.
      </P>
      <H2 id="records">The records you need</H2>
      <Table
        head={['Record', 'Host', 'Points at', 'Used for']}
        rows={[
          ['A', '@', 'An IP address', 'The bare domain, example.com'],
          ['CNAME', 'www', 'A hostname', 'The www subdomain'],
          ['TXT', '@', 'A verification string', 'Proving ownership to a host or mail provider'],
          ['MX', '@', 'A mail server', 'Receiving email at the domain'],
        ]}
      />
      <P>
        Your host tells you the exact values. Add them at the registrar, or wherever your
        nameservers point, and remove any older records for the same host that conflict.
      </P>
      <H2 id="propagation">Propagation</H2>
      <P>
        DNS changes are cached across the internet and take time to appear everywhere,
        usually minutes but occasionally up to 48 hours. Lower the TTL on a record a day
        before you plan to change it and the switch happens faster.
      </P>
      <Pre label="Terminal — check what the world sees">{`dig +short example.com
dig +short www.example.com`}</Pre>
      <H2 id="https">HTTPS</H2>
      <P>
        Most hosts issue a certificate automatically once DNS resolves to them. Confirm
        that the site loads over <Code>https://</Code>, that plain HTTP redirects to it, and
        that both the bare domain and <Code>www</Code> reach the same place.
      </P>
      <H2 id="subdomains">Subdomains</H2>
      <P>
        Each subdomain is its own CNAME record and, usually, its own deployment.
        A staging site, an API and a status page can all sit under the same domain without
        touching each other.
      </P>
      <Note title="Moving a live domain">
        <p>
          If the domain is already serving a site, have the new one deployed and tested on
          a temporary address first. Change DNS last, so the gap between old and new is
          measured in minutes rather than days.
        </p>
      </Note>
    </>
  ),
  'email-and-forms': () => (
    <>
      <P>
        A form on a static site cannot send email by itself. Something behind it has to,
        and which something you have determines where the messages land and what can go
        wrong.
      </P>
      <H2 id="delivery">How a form reaches you</H2>
      <Table
        head={['Method', 'Where messages arrive', 'Worth knowing']}
        rows={[
          ['Host form handling', 'The host dashboard, forwarded to email', 'Simplest. Monthly submission limits apply.'],
          ['Webhook', 'A Discord or Slack channel', 'Instant and easy to share with a team. The URL is public if the front end holds it.'],
          ['Email service', 'Your inbox, sent through an API', 'Needs a server-side key and DNS records, but delivers most reliably.'],
          ['mailto fallback', "The visitor's own email app", 'No delivery risk, but far fewer people finish sending.'],
        ]}
      />
      <H2 id="spam">Why your own email goes to spam</H2>
      <P>
        When a service sends email claiming to be your domain, receiving servers check
        whether your domain says it is allowed to. If it does not say so, the message is
        treated as forged. Three DNS records do the saying.
      </P>
      <UL>
        <LI>
          <strong className="text-neutral-800 dark:text-neutral-200">SPF</strong> — a TXT
          record listing which servers may send as your domain.
        </LI>
        <LI>
          <strong className="text-neutral-800 dark:text-neutral-200">DKIM</strong> — a key
          your sending service publishes so it can sign each message.
        </LI>
        <LI>
          <strong className="text-neutral-800 dark:text-neutral-200">DMARC</strong> — a
          policy saying what to do with mail that fails the first two.
        </LI>
      </UL>
      <P>
        Your email provider gives you the exact values; they go in DNS alongside the records
        in <A href="/docs/domains-dns">Domains and DNS</A>.
      </P>
      <H2 id="reply-to">Send as yourself, reply to the visitor</H2>
      <P>
        Form notifications should be sent from an address at your own domain, with the
        visitor&rsquo;s address in the reply-to field. Sending as the visitor is what makes
        notifications disappear into spam — their domain has not authorised your sender.
      </P>
      <H2 id="spam-protection">Keeping bots out</H2>
      <P>
        Any public form will eventually be found by automated submissions. A hidden field
        that only a bot would fill in stops most of it without asking a real person to solve
        a puzzle. If it gets worse than that, a rate limit or a challenge is the next step.
      </P>
      <Note title="Test the whole path, not the form">
        <p>
          Submit a real message after every deploy that touched the form, and check it
          actually arrived — including in the spam folder. A form that says &ldquo;thank
          you&rdquo; and sends nothing looks identical to one that works.
        </p>
      </Note>
    </>
  ),
};
