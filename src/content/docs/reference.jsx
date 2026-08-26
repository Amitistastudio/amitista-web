import React from 'react';
import { H2, P, UL, LI, Code, Pre, Note, Table, A } from '../../components/docs/prose';

export const DOC_BODIES = {
  'commands': () => (
    <>
      <P>
        Everything you are likely to need in a Node.js project, in one place. Run them from
        a terminal opened in the project folder.
      </P>
      <H2 id="project">Project scripts</H2>
      <Table
        head={['Command', 'Does']}
        rows={[
          ['npm install', 'Installs dependencies. Run it after cloning and whenever they change.'],
          ['npm run dev', 'Starts the development server with live reloading.'],
          ['npm run build', 'Produces the production build in dist/.'],
          ['npm run preview', 'Serves the production build locally, so you see what visitors will.'],
        ]}
      />
      <P>
        Scripts are defined in <Code>package.json</Code>. If a project adds its own — a
        linter, tests, a data import — the handover notes will say so.
      </P>
      <H2 id="dependencies">Dependencies</H2>
      <Pre label="Terminal">{`npm outdated              # what has newer versions available
npm update                # update within the allowed version range
npm install pkg@latest    # move one package to its newest version
npm audit                 # list known vulnerabilities
npm audit fix             # apply the fixes that are safe`}</Pre>
      <H2 id="git">Git</H2>
      <Pre label="Terminal">{`git status                # what has changed
git pull                  # take the latest from the remote
git add -A                # stage everything
git commit -m "message"   # record the change
git push                  # send it to the remote
git log --oneline -10     # the last ten changes
git checkout -- file      # discard local changes to one file`}</Pre>
      <H2 id="diagnostics">Diagnostics</H2>
      <Pre label="Terminal">{`node -v                   # which Node version is installed
npm -v
dig +short example.com    # what DNS returns for a domain
curl -I https://example.com   # response headers, without downloading the page`}</Pre>
      <Note title="Clean reinstall">
        <p>
          When dependencies behave impossibly, delete <Code>node_modules</Code> and the lock
          file, then run <Code>npm install</Code> again. It fixes more than it has any right
          to.
        </p>
      </Note>
    </>
  ),
  'browser-support': () => (
    <>
      <P>
        Unless your contract says otherwise, builds are developed and tested against the
        current and previous versions of the major browsers, on both desktop and mobile.
      </P>
      <H2 id="supported">Tested</H2>
      <Table
        head={['Browser', 'Platforms']}
        rows={[
          ['Chrome', 'Windows, macOS, Android'],
          ['Safari', 'macOS, iOS and iPadOS'],
          ['Firefox', 'Windows, macOS'],
          ['Edge', 'Windows'],
          ['Samsung Internet', 'Android'],
        ]}
      />
      <H2 id="not-supported">Not tested</H2>
      <UL>
        <LI>Internet Explorer, in any version. It is retired and unsupported by Microsoft.</LI>
        <LI>Browser versions more than about two years old.</LI>
        <LI>In-app browsers inside social apps, which sometimes restrict features in ways nobody can control from the site.</LI>
        <LI>Devices with JavaScript disabled, unless that was specifically agreed.</LI>
      </UL>
      <H2 id="screens">Screen sizes</H2>
      <P>
        Layouts are built to work from roughly 320 pixels wide up to large desktop displays,
        rather than at a handful of fixed widths. If your audience uses something unusual —
        a kiosk, a television, an in-vehicle screen — tell us before the design stage, not
        after.
      </P>
      <H2 id="reporting">Reporting a browser-specific problem</H2>
      <P>
        Include the exact browser and version, the operating system, and whether it also
        happens in a private window with extensions disabled. Extensions cause a surprising
        share of one-machine-only faults.
      </P>
    </>
  ),
  'glossary': () => (
    <>
      <P>
        Plain definitions of the terms we use. If we have written something that is not here
        and does not make sense, tell us and we will add it.
      </P>
      <H2 id="terms">Terms</H2>
      <Table
        head={['Term', 'Meaning']}
        rows={[
          ['Build', 'The process that turns source code into the files a server sends to browsers.'],
          ['Deploy', 'Copying a build onto hosting so it is publicly reachable.'],
          ['Repository', 'The versioned store of the project source, usually on GitHub or GitLab.'],
          ['Environment variable', 'A setting supplied to the app at build or run time rather than written into the code.'],
          ['Environment', 'One place the project runs: local, staging or production.'],
          ['DNS', 'The system translating a domain name into the address of a server.'],
          ['SSL / TLS certificate', 'What allows a site to be served over HTTPS.'],
          ['CMS', 'A content management system: an admin area for editing content without a developer.'],
          ['Staging', 'A private copy of the site used to review changes before they go live.'],
          ['Dependency', 'Third-party code the project relies on, installed rather than written by us.'],
          ['API', 'A way for two programs to talk to each other over the network.'],
          ['Webhook', 'A message another service sends you when something happens, rather than you asking.'],
          ['Rate limit', 'A cap on how often a service will answer you before it starts refusing.'],
          ['Cache', 'A stored copy kept to avoid fetching something again. The reason an old version sometimes persists.'],
          ['SPA fallback', 'The host rule that returns index.html for unknown paths so browser routing works.'],
          ['Rollback', 'Restoring a previous deployment after a bad release.'],
          ['Scope', 'The agreed list of what a project includes. Work outside it is quoted separately.'],
          ['Delivery model', 'Which of Transfer, Licence or Hosted your project was handed over under. It decides who owns the result and which of our documents apply.'],
          ['Personal data', 'Information about an identifiable person. Your users’ names, emails and whatever they put into the system themselves.'],
          ['Subprocessor', 'A company that can reach your data because we use them to deliver the work — a host, for instance. Listed by name at /subprocessors.'],
          ['Data Processing Addendum', 'The document setting out what we may do with personal information belonging to your users, and on whose instruction.'],
          ['Vulnerability disclosure', 'The process for telling us about a security hole someone has found, and what we do about it.'],
        ]}
      />
      <H2 id="more">Related reading</H2>
      <P>
        The terms above are ours. The words that come from the documents you signed are
        defined in the documents themselves, and{' '}
        <A href="/docs/policies">Which document says what</A> is the index to all fourteen of
        them — one line per document, sorted by the question people actually arrive with.
      </P>
    </>
  ),
};
