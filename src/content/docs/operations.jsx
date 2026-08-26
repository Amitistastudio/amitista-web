import React from 'react';
import { H2, P, UL, OL, LI, Pre, Note, Table, A } from '../../components/docs/prose';

export const DOC_BODIES = {
  'security': () => (
    <>
      <P>
        Most incidents we see are not clever attacks. They are a shared password, an
        abandoned admin account, or a dependency left unpatched for two years.
      </P>
      <H2 id="accounts">Accounts and access</H2>
      <UL>
        <LI>Turn on two-factor authentication for hosting, registrar and email accounts.</LI>
        <LI>Give each person their own login rather than sharing one.</LI>
        <LI>Remove access as soon as someone stops working on the project, including ours.</LI>
        <LI>Use a password manager. Never send credentials over a public channel.</LI>
      </UL>
      <H2 id="secrets">Keys and secrets</H2>
      <P>
        Keys belong in environment variables on the server, never in the repository. If a
        key is ever committed or pasted somewhere public, rotate it — deleting the message
        does not un-leak it.
      </P>
      <H2 id="updates">Updates</H2>
      <P>
        Dependencies receive security patches. Applying them periodically is far less work
        than a large upgrade after years of drift. See{' '}
        <A href="/docs/maintenance">Maintenance</A>.
      </P>
      <Pre label="Terminal">{`npm audit          # list known vulnerabilities
npm audit fix      # apply the fixes that are safe to apply`}</Pre>
      <H2 id="backups">Backups</H2>
      <P>
        Confirm what your host backs up, how far back it goes, and how a restore is
        performed. A backup nobody has ever restored is an assumption, not a backup — see{' '}
        <A href="/docs/backups">Backups and recovery</A>.
      </P>
      <H2 id="disclosure">Reporting a hole in something we built</H2>
      <P>
        If you or somebody else finds a security problem in our work, the{' '}
        <A href="/security">Vulnerability Disclosure Policy</A> is what to point them at. It
        says what is in scope, what we do with a report and how long we take. It is also the
        address to give a researcher who contacts you about a site we built — they are
        usually asking you a question only we can answer. Where the data behind the system is
        your users&rsquo;, <A href="/docs/your-users-data">Data your users give you</A> covers
        who tells whom.
      </P>
      <Note title="If you think you have been compromised">
        <p>
          Rotate credentials first, then tell us. Preserving logs matters — avoid wiping and
          redeploying before anyone has looked at what happened.
        </p>
      </Note>
    </>
  ),
  'performance': () => (
    <>
      <P>
        We build with performance in mind, but a site degrades over time as content is
        added. These are the things that cause it, in the order they usually matter.
      </P>
      <H2 id="images">Images</H2>
      <P>
        Images are almost always the largest thing on a page. Export at roughly the size
        they display at, use a modern format, and compress before uploading. A 4000px photo
        shown in a 400px box wastes most of what it downloads. See{' '}
        <A href="/docs/media-assets">Images and media</A>.
      </P>
      <H2 id="fonts">Fonts</H2>
      <P>
        Each font family and weight is a separate download. Two families and a handful of
        weights is usually plenty.
      </P>
      <H2 id="third-party">Third-party scripts</H2>
      <P>
        Chat widgets, tag managers, embedded feeds and analytics are the most common cause
        of a site that was fast at launch and is not now. Each one is code you did not write
        running on every page. Add them deliberately, and remove the ones nobody looks at.
      </P>
      <H2 id="measuring">Measuring</H2>
      <P>
        Measure before changing anything. Chrome DevTools has Lighthouse built in, and
        PageSpeed Insights runs the same audit against your live URL. Test on a phone
        profile, not a desktop connection.
      </P>
      <UL>
        <LI>Largest Contentful Paint — how soon the main content appears. Aim under 2.5s.</LI>
        <LI>Cumulative Layout Shift — how much the page jumps while loading. Aim under 0.1.</LI>
        <LI>Interaction to Next Paint — how quickly the page answers a tap. Aim under 200ms.</LI>
        <LI>Total page weight — the sum of everything downloaded.</LI>
      </UL>
      <Note title="Measure the live site">
        <p>
          A development build is not optimised and will always look slower. Run audits
          against the deployed production URL.
        </p>
      </Note>
    </>
  ),
  'monitoring': () => (
    <>
      <P>
        Nothing on a delivered project tells you it has stopped working. Monitoring is the
        part that does, and it takes about ten minutes to set up.
      </P>
      <H2 id="uptime">Uptime checks</H2>
      <P>
        An uptime service loads a URL every few minutes from outside your network and
        alerts you when it fails. Free tiers are enough for most sites. Check a page that
        exercises the real thing — the home page, or an endpoint that touches the database —
        rather than a static file that will keep loading long after the app has died.
      </P>
      <Table
        head={['Watch', 'Why']}
        rows={[
          ['The live domain over HTTPS', 'Catches outages, DNS problems and expired certificates at once.'],
          ['A page that reads data', 'A static page can look healthy while the backend is down.'],
          ['Certificate expiry', 'Automatic renewal fails silently more often than you would like.'],
          ['Domain expiry', 'The one outage nobody can fix quickly.'],
        ]}
      />
      <H2 id="errors">Error reporting</H2>
      <P>
        Uptime tells you the site loaded. It does not tell you that a form throws an error
        for one browser. An error reporting service catches those and shows how often they
        happen — worth having on anything with accounts, payments or data entry.
      </P>
      <H2 id="alerts">Where alerts go</H2>
      <P>
        Send alerts somewhere a person actually looks: a phone notification, or a channel
        the team reads. An alert email nobody opens is a slower version of a customer
        telling you.
      </P>
      <H2 id="noise">Keep it quiet enough to trust</H2>
      <P>
        Set a check to alert only after two or three consecutive failures, so a one-second
        network blip does not wake anyone. A monitor that cries wolf gets muted, and then it
        is not a monitor.
      </P>
      <Note title="Tell us what you want watched">
        <p>
          If we run monitoring for you under a support agreement, say which paths matter and
          who should be woken up. Otherwise it defaults to the home page and you.
        </p>
      </Note>
    </>
  ),
  'backups': () => (
    <>
      <P>
        Code can be rebuilt from a repository. Data cannot be rebuilt from anything. Work
        out which parts of your project are irreplaceable, and make sure those are the parts
        being copied.
      </P>
      <H2 id="what">What needs backing up</H2>
      <Table
        head={['Thing', 'Recoverable without a backup?']}
        rows={[
          ['Source code', 'Yes, if it is in a repository with a remote copy.'],
          ['Database', 'No.'],
          ['Uploaded files and media', 'No, unless the originals are stored somewhere else.'],
          ['Environment variables', 'No — they exist only in the host panel. Keep a copy in a password manager.'],
          ['DNS records', 'Technically, but slowly. A screenshot of the zone costs nothing.'],
        ]}
      />
      <H2 id="rule">A schedule worth having</H2>
      <UL>
        <LI>Automated daily backups, kept for at least 30 days.</LI>
        <LI>At least one copy somewhere other than the machine being backed up.</LI>
        <LI>A restore tested at least once, so the procedure exists before you need it.</LI>
      </UL>
      <H2 id="restore">Restoring</H2>
      <OL>
        <LI>Stop writes if you can, so nothing new lands while you work.</LI>
        <LI>Restore into a copy, not over the live data, and confirm the copy is right.</LI>
        <LI>Switch to it, then keep the damaged version until you are certain.</LI>
      </OL>
      <P>
        Restoring over the top of live data is how a recoverable incident becomes a
        permanent one.
      </P>
      <H2 id="retention">Deleting on purpose</H2>
      <P>
        Backups keep personal data alive after someone asked you to delete it. If your
        project stores customer information, your retention period should apply to the
        backups too — see the <A href="/privacy">Privacy Policy</A>.
      </P>
      <Note title="Test one restore a year">
        <p>
          Pick a quiet afternoon, restore yesterday&rsquo;s backup into a scratch
          environment, and confirm the data is all there. It is the only way to find out
          that the nightly job stopped running in March.
        </p>
      </Note>
    </>
  ),
  'maintenance': () => (
    <>
      <P>
        A delivered project is not frozen. Browsers change, dependencies release security
        patches, and renewals fall due. None of it is heavy, but it does need an owner.
      </P>
      <H2 id="schedule">A workable schedule</H2>
      <Table
        head={['How often', 'Task']}
        rows={[
          ['Monthly', 'Check the site loads, forms submit, and nothing looks broken on mobile.'],
          ['Quarterly', 'Apply dependency and security updates, then test.'],
          ['Quarterly', 'Review who has access to hosting, the registrar and third-party accounts.'],
          ['Annually', 'Renew the domain and hosting. Confirm backups still run and still restore.'],
          ['As needed', 'Content updates, new features, design changes.'],
        ]}
      />
      <H2 id="who">Who does it</H2>
      <P>
        Unless you have a support agreement with us, maintenance is yours to run. We are
        happy to do it on an ongoing basis or ad hoc — the arrangement is whatever your
        contract says.
      </P>
      <H2 id="updating">Applying updates</H2>
      <Pre label="Terminal">{`npm outdated       # what has newer versions
npm update         # apply updates within the allowed range
npm run build      # confirm it still builds before deploying`}</Pre>
      <P>
        Test after updating and before deploying. Major version changes can break things and
        are worth doing deliberately rather than in bulk.
      </P>
      <Note title="Renewals">
        <p>
          Set a calendar reminder for the domain a month before it expires. An expired
          domain can be bought by someone else, and getting it back is expensive when it is
          possible at all.
        </p>
      </Note>
    </>
  ),
  'accessibility': () => (
    <>
      <P>
        We build to sensible accessibility standards, but most regressions come from content
        added later. These are the ones worth knowing.
      </P>
      <H2 id="content">When adding content</H2>
      <UL>
        <LI>
          Give every meaningful image alt text describing what it shows. Decorative images
          take empty alt text so screen readers skip them.
        </LI>
        <LI>
          Use headings in order — do not skip from a heading to a much smaller one for
          visual effect.
        </LI>
        <LI>
          Write link text that makes sense alone. &ldquo;Read our refund policy&rdquo; beats
          &ldquo;click here&rdquo;.
        </LI>
        <LI>Caption or transcribe video and audio.</LI>
      </UL>
      <H2 id="contrast">Contrast</H2>
      <P>
        Text needs enough contrast against its background: a ratio of 4.5:1 for body text,
        3:1 for large text. Light grey on white fails this, however good it looks in a
        mockup.
      </P>
      <H2 id="checks">Quick checks</H2>
      <OL>
        <LI>Tab through the page. Everything interactive should be reachable and visibly focused.</LI>
        <LI>Zoom the browser to 200%. Nothing should overlap or get cut off.</LI>
        <LI>Run the accessibility audit in Lighthouse.</LI>
      </OL>
      <Note title="Automated checks find some of it">
        <p>
          Tooling catches missing alt text and poor contrast. It cannot tell you whether
          your wording makes sense or your tab order is logical, so the manual pass above
          still matters.
        </p>
      </Note>
    </>
  ),
};
