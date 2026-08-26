import React from 'react';
import LegalLayout, { Section, P, List, Item } from '../../components/legal/LegalLayout';
import { STUDIO_NAME, CONTACT_EMAIL } from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

export default function SecurityPage() {
  return (
    <LegalLayout
      current="/security"
      title="Vulnerability Disclosure Policy"
      summary={`How to report a vulnerability in something ${STUDIO_NAME} built, and what happens after you do.`}
    >
      <Section number="1" title="Reporting something">
        <P>
          Write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>
          . Put &ldquo;security&rdquo; in the subject line and it gets read ahead of
          everything else in that inbox.
        </P>
        <P>
          You do not need to know us, have permission first, or be sure it is real. A report
          that turns out to be nothing costs us ten minutes. The alternative costs
          considerably more.
        </P>
        <P>What helps, roughly in order of how much:</P>
        <List>
          <Item>the address or application affected, and where in it;</Item>
          <Item>enough steps for us to see it happen ourselves;</Item>
          <Item>what an attacker gets out of it, if that is not obvious;</Item>
          <Item>anything you want credit under, or a note that you would rather not be named.</Item>
        </List>
      </Section>

      <Section number="2" title="What is in scope">
        <P>
          This website, the software we publish under our own name — including Async — and
          the servers we run them on.
        </P>
        <P>
          Projects we built for clients are a harder case, and worth reading before you
          report one. The client owns that system and we may no longer maintain it, so we
          are not always the right people to fix it. Send it to us anyway if you cannot find
          a security contact of their own: we will pass it on and tell you we have, or tell
          you we could not.
        </P>
        <P>These are not things we will act on:</P>
        <List>
          <Item>
            findings from an automated scanner with nothing behind them — a missing header or
            a version number in a banner, with no impact shown;
          </Item>
          <Item>anything that requires an attacker to already control the victim&rsquo;s machine or browser;</Item>
          <Item>
            denial of service, volumetric testing, or anything whose method is load — see
            section 4;
          </Item>
          <Item>social engineering of us, our clients, or anyone hosting for us;</Item>
          <Item>reports about third-party services we use rather than run, which belong with those companies.</Item>
        </List>
      </Section>

      <Section number="3" title="What we will do">
        <P>
          Acknowledge your report within three working days, and tell you within ten whether
          we have reproduced it and what we intend to do. If it takes longer than that to
          fix, you will hear where it stands rather than nothing.
        </P>
        <P>
          Where a fix affects a client&rsquo;s system, we will tell them. Where it affects
          their users, we will say so to the client in terms clear enough that they can tell
          their users themselves — our{' '}
          <a href="/dpa" className={linkClasses}>
            data processing addendum
          </a>{' '}
          sets out that obligation in full.
        </P>
        <P>
          We will credit you by name when the fix ships, unless you ask us not to. There is
          no bounty programme and no money — we would rather say that plainly than imply one
          and disappoint you after the work.
        </P>
      </Section>

      <Section number="4" title="What we ask of you">
        <P>
          Stay within what is needed to demonstrate the problem. In practice that means:
        </P>
        <List>
          <Item>
            do not access, copy, modify or keep data belonging to anybody else — if a
            vulnerability exposes it, stop at the point you can prove it and tell us what you
            saw rather than downloading it;
          </Item>
          <Item>do not degrade a service others are using, and do not test with load;</Item>
          <Item>do not leave anything behind — no persistent access, no accounts, no files;</Item>
          <Item>
            give us a reasonable chance to fix it before you publish. Ninety days is the
            convention and we will not ask for longer without a reason we can explain.
          </Item>
        </List>
      </Section>

      <Section number="5" title="Things you will find that we already know">
        <P>
          Worth saying up front, so you do not spend an evening on something we did on
          purpose.
        </P>
        <P>
          <span className="text-neutral-200">The webhook that used to be in the bundle.</span>{' '}
          Until August 2026 the forms posted to a Discord webhook from the browser, which put
          its URL in the JavaScript this site serves, where anyone could read it. This page
          said so at the time and called it a design decision. It was a bad one, and it has
          been undone: the forms now post to /api/contact on this domain, and a
          service on our server holds the webhook and writes the message. There is no longer
          a webhook in the bundle to find. If you have an old copy of the URL, it has been
          rotated.
        </P>
        <P>
          <span className="text-neutral-200">
            /api/contact accepts anonymous requests.
          </span>{' '}
          It has to — it is a contact form. It takes fields and nothing else: what the Discord
          message says, which channel it goes to and whether mentions resolve are decided on
          our side, so a caller cannot make it say anything it would not have said. It is rate
          limited per address and overall. Sending yourself one test enquiry to see the shape
          of the response is fine. Please do not run it in a loop to show that a rate limit
          can be hit — we know, and it is a private channel that real clients write to.
        </P>
        <P>
          <span className="text-neutral-200">The site is static.</span> Other than that one
          endpoint there is no login, no database behind this website, no session and no user
          data in it. Enquiries leave for Discord and are not stored here. Our{' '}
          <a href="/privacy" className={linkClasses}>
            privacy policy
          </a>{' '}
          describes what that does and does not collect.
        </P>
      </Section>

      <Section number="6" title="If you follow this policy">
        <P>
          We will treat your work as authorised research. We will not come after you for it,
          we will not report you to anybody, and if somebody else raises it with us we will
          say that you were acting with our permission.
        </P>
        <P>
          That protection covers what this page describes and nothing beyond it. It is also
          the only thing it is in our power to give: it cannot bind a client whose system you
          tested without asking them, or a hosting provider whose terms you broke getting
          there.
        </P>
      </Section>

      <Section number="7" title="How we build">
        <P>
          The security pass we run before handing a project over is published in full in our{' '}
          <a href="/docs/security" className={linkClasses}>
            documentation
          </a>
          , and the measures that apply to personal data are set out in section 8 of the{' '}
          <a href="/dpa" className={linkClasses}>
            data processing addendum
          </a>
          . Who can reach client data at all is listed at{' '}
          <a href="/subprocessors" className={linkClasses}>
            /subprocessors
          </a>
          .
        </P>
      </Section>
    </LegalLayout>
  );
}
