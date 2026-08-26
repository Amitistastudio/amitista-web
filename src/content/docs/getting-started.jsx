import React from 'react';
import { H2, P, UL, OL, LI, Code, Pre, Note, Table, A } from '../../components/docs/prose';

export const DOC_BODIES = {
  'introduction': () => (
    <>
      <P>
        These pages are for clients of Amitista Studio. They explain what you receive when
        a project is handed over, how to run and deploy it, how to configure it, and how to
        reach us when something needs changing.
      </P>
      <P>
        They are not a tutorial on web development. They assume you can access your hosting
        account and run a command in a terminal, or that you have someone who can.
      </P>
      <H2 id="how-this-is-organised">How this is organised</H2>
      <UL>
        <LI>
          <strong className="text-neutral-800 dark:text-neutral-200">Getting started</strong>{' '}
          — what a handover includes, how the project is laid out, and how to run it.
        </LI>
        <LI>
          <strong className="text-neutral-800 dark:text-neutral-200">Guides</strong> —
          deploying, environments, configuration, domains and email.
        </LI>
        <LI>
          <strong className="text-neutral-800 dark:text-neutral-200">Content</strong> —
          editing text, preparing images, search metadata and analytics.
        </LI>
        <LI>
          <strong className="text-neutral-800 dark:text-neutral-200">Project types</strong>{' '}
          — the pages that only apply to some builds: game servers, bots, desktop apps,
          integrations.
        </LI>
        <LI>
          <strong className="text-neutral-800 dark:text-neutral-200">API</strong> — the
          public JSON this site publishes, what Shield is, and how to set it up. The only
          section here that is not written for a specific client.
        </LI>
        <LI>
          <strong className="text-neutral-800 dark:text-neutral-200">Design</strong> — what
          comes with a design project and how to keep using it.
        </LI>
        <LI>
          <strong className="text-neutral-800 dark:text-neutral-200">Operations</strong> —
          security, performance, monitoring, backups, maintenance and accessibility.
        </LI>
        <LI>
          <strong className="text-neutral-800 dark:text-neutral-200">Support</strong> — how
          to diagnose a problem, report it, request a change, and what happens next.
        </LI>
        <LI>
          <strong className="text-neutral-800 dark:text-neutral-200">Policies</strong> —
          which of our documents answers which question, what happens to data your users
          give you, and how complaints about content are handled.
        </LI>
        <LI>
          <strong className="text-neutral-800 dark:text-neutral-200">Reference</strong> —
          commands, browser support and a glossary of the terms we use.
        </LI>
      </UL>
      <H2 id="what-applies">Not every page applies to you</H2>
      <P>
        We build websites, backends, bots, game servers and desktop tools, and one client
        rarely has all of them. Read the pages that match what you were handed and ignore
        the rest — nothing later assumes you read the ones that do not apply.
      </P>
      <Note title="Project-specific instructions">
        <p>
          Anything unique to your build — custom endpoints, third-party keys, admin
          accounts — is documented in the handover pack we send you, not here.
        </p>
      </Note>
    </>
  ),
  'handover': () => (
    <>
      <P>
        When a project is complete and paid for, you receive the following. If anything on
        this list is missing from your handover, tell us and we will send it.
      </P>
      <P>
        This is the list for a project you bought outright. Under a licence you receive the
        same things except the source, which you get only where your order says so; under
        hosting there is no handover at all, because we run the deployment rather than
        giving it to you. <A href="/terms">Section 3 of the terms</A> sets out the three.
      </P>
      <Table
        head={['Item', 'What it is']}
        rows={[
          ['Source code', 'The full project, either as a repository you own or as an archive.'],
          ['Credentials', 'Accounts, API keys and logins created for the project, sent through a secure channel.'],
          ['Deployment', 'The live build, plus the settings needed to deploy it again.'],
          ['Assets', 'Images, icons and fonts used in the build, with their licences where relevant.'],
          ['Handover notes', 'Anything specific to your project that is not covered in these docs.'],
        ]}
      />
      <H2 id="ownership">Ownership</H2>
      <P>
        What you own depends on how the project was delivered, and your quote named that
        before you accepted it. Bought outright, ownership of the bespoke work transfers to
        you once the final invoice is paid. Licensed, we keep the source and you hold the
        right to run it. Hosted, the software stays with us and you use the running system
        — though the data inside it is yours under all three.
      </P>
      <P>
        Our own reusable libraries and components stay ours in every case, and are licensed
        to you as part of the project — see the <A href="/eula">EULA</A> and{' '}
        <A href="/terms">Terms of Service</A> for the detail.
      </P>
      <H2 id="credentials">A note on credentials</H2>
      <P>
        Change any password we set for you once the handover is done, and remove our access
        when you no longer want us to have it. If you would rather we kept access for
        ongoing support, that is fine — just tell us which accounts.
      </P>
      <H2 id="first-week">The first week</H2>
      <P>
        Handover day is the point at which the project becomes yours to run. These are worth
        doing while it is all still fresh, rather than in six months when something breaks.
      </P>
      <OL>
        <LI>Log in to hosting, the registrar and any third-party account in the list, and confirm each one works with your own credentials.</LI>
        <LI>Turn on two-factor authentication everywhere it is offered.</LI>
        <LI>Store the credentials in a password manager the right people can reach, not in one person&rsquo;s inbox.</LI>
        <LI>Run the project locally once, following <A href="/docs/running-locally">Running it locally</A>, so you know it builds on a machine that is not ours.</LI>
        <LI>Put the domain and hosting renewal dates in a calendar.</LI>
      </OL>
      <Note title="Keep the handover pack">
        <p>
          It is the only document written specifically about your build. If another
          developer takes over later, it is the first thing they will ask for.
        </p>
      </Note>
    </>
  ),
  'running-locally': () => (
    <>
      <P>
        Most of our web projects are Node.js applications and follow the same three steps.
        Your handover notes will say if yours differs.
      </P>
      <H2 id="requirements">Requirements</H2>
      <UL>
        <LI>Node.js 20 or newer, and the npm that ships with it.</LI>
        <LI>Git, if the project was handed over as a repository.</LI>
      </UL>
      <H2 id="steps">Steps</H2>
      <OL>
        <LI>Open a terminal in the project folder.</LI>
        <LI>
          Install dependencies with <Code>npm install</Code>. This reads{' '}
          <Code>package.json</Code> and only needs repeating when dependencies change.
        </LI>
        <LI>
          Start the development server with <Code>npm run dev</Code>, then open the address
          it prints, usually <Code>http://localhost:5173</Code>.
        </LI>
      </OL>
      <Pre label="Terminal">{`npm install
npm run dev`}</Pre>
      <H2 id="when-it-fails">When it does not start</H2>
      <Table
        head={['What you see', 'Usually means']}
        rows={[
          ['command not found: npm', 'Node.js is not installed, or the terminal was opened before installing it.'],
          ['Unsupported engine', 'The installed Node version is older than the project needs.'],
          ['EADDRINUSE', 'Something else is already using that port. Stop it, or let the tool pick another.'],
          ['Cannot find module', 'npm install has not been run, or was run in the wrong folder.'],
          ['Missing environment variable', 'There is no .env file — see Configuration.'],
        ]}
      />
      <Note title="Install on the machine you are using">
        <p>
          Dependencies include binaries compiled for a specific operating system. Copying a{' '}
          <Code>node_modules</Code> folder from a Windows machine to a Mac, or the reverse,
          will fail — run <Code>npm install</Code> on each machine instead.
        </p>
      </Note>
    </>
  ),
  'project-structure': () => (
    <>
      <P>
        Projects are laid out the same way wherever the work allows it, so that moving
        between two of our builds does not mean learning a new filing system. Yours may add
        folders; it should not rearrange these.
      </P>
      <H2 id="layout">The usual layout</H2>
      <Pre label="A typical web project">{`project/
public/          files served as-is: favicon, robots.txt, images
src/
  components/    reusable pieces of interface
  pages/         one file per page or route
  content/       text and data kept out of the components
  lib/           helpers with no interface of their own
  siteConfig.js  the values you are most likely to change
package.json     dependencies and the npm scripts
.env             local secrets, never committed
dist/            the build output, generated`}</Pre>
      <H2 id="what-to-edit">What is safe to edit</H2>
      <Table
        head={['Folder', 'Edit it?', 'Why']}
        rows={[
          ['src/content', 'Yes', 'Text, lists and data. The most common place a client changes something.'],
          ['public', 'Yes', 'Swap an image or favicon by replacing the file with one of the same name.'],
          ['src/pages', 'Carefully', 'Layout and structure. Small text edits are fine; larger changes are ours.'],
          ['src/components', 'Carefully', 'Shared pieces. One change here shows up in several places at once.'],
          ['node_modules', 'No', 'Installed code. Anything edited here is wiped by the next install.'],
          ['dist', 'No', 'Generated by the build. Every rebuild overwrites it.'],
        ]}
      />
      <H2 id="content-separation">Why content sits apart from code</H2>
      <P>
        Text, lists, prices and links live in their own files rather than inside the
        components that display them. It means a wording change is a one-line edit in an
        obvious place, and it means the same fact cannot end up written differently in two
        corners of the site.
      </P>
      <H2 id="generated">Generated files</H2>
      <P>
        Some files are written by the build rather than by hand — <Code>dist</Code>, and
        often <Code>sitemap.xml</Code> and lock files. Editing them works until the next
        build quietly throws the change away. If something needs changing there, it needs
        changing in what generates it.
      </P>
      <Note title="If you are unsure">
        <p>
          Ask before editing rather than after. A question costs a message; an edit that
          breaks a build costs an afternoon.
        </p>
      </Note>
    </>
  ),
};
