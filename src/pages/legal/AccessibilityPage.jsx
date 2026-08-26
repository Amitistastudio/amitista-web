import React from 'react';
import LegalLayout, { Section, P, List, Item } from '../../components/legal/LegalLayout';
import { STUDIO_NAME, CONTACT_EMAIL } from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

export default function AccessibilityPage() {
  return (
    <LegalLayout
      current="/accessibility"
      title="Accessibility"
      summary={`What ${STUDIO_NAME} has done to make this site usable however you read it, what still does not work, and how to tell us.`}
    >
      <Section number="1" title="What this statement covers">
        <P>
          This statement is about this website. It is not about the projects we build for
          clients — those are the client&rsquo;s own services, and each one is judged on its
          own. Section 6 says how we approach accessibility in the work itself.
        </P>
      </Section>

      <Section number="2" title="What we are aiming at">
        <P>
          We aim to meet the Web Content Accessibility Guidelines version 2.2 at level AA.
          That is a target we work towards rather than a certificate: nobody outside the
          studio has audited this site, and we have not paid for a conformance assessment.
          Where we fall short of it, section 4 says so by name.
        </P>
      </Section>

      <Section number="3" title="What is in place">
        <List>
          <Item>
            Every animation on the site is switched off when your system asks for reduced
            motion — the shader background, the panels that rise as you scroll, the search
            palette, and both the library and the browser&rsquo;s own smooth scrolling. The
            legal documents do not animate at all, so a page somebody is reading or printing
            never waits on a scroll position.
          </Item>
          <Item>
            The first thing you reach with the tab key on any page is a link that skips the
            header and lands you on the content, so the nav is not something you have to
            walk through fifteen times in a session.
          </Item>
          <Item>
            The site is navigable by keyboard, and every control that takes focus shows it
            the same way: a violet outline, drawn only for keyboard users, never a change of
            shade you have to look for.
          </Item>
          <Item>
            Each page marks its content as the main region, and headings run in order and
            are real headings, so a screen reader can move through a page by structure
            rather than by reading all of it.
          </Item>
          <Item>
            All text meets the 4.5:1 contrast minimum against the background it sits on,
            including the small monospace labels on the documents and in the tables, and in
            both the light and dark documentation themes.
          </Item>
          <Item>
            The page declares its language, images that carry meaning have alt text, and the
            decorative ones — including the two animated canvas backgrounds — are hidden
            from assistive technology rather than left for it to guess at.
          </Item>
          <Item>
            Video is embedded through a host that sets no tracking cookies, and plays only
            when you ask it to. The typefaces are served from this site, so a page renders
            without waiting on anybody else&rsquo;s server.
          </Item>
        </List>
      </Section>

      <Section number="4" title="What does not work yet">
        <P>
          These are known, they are ours, and they are being worked on rather than
          explained away. This list was longer and it will not be empty — a statement that
          claims nothing is wrong is a statement nobody checked.
        </P>
        <List>
          <Item>
            The border on a form field is a faint grey against a near-black background,
            which is enough to see where a field is but under the 3:1 that the standard asks
            for a control&rsquo;s boundary. Focus is clear; the resting state is not.
          </Item>
          <Item>
            No part of this site has been tested with a screen reader by somebody who uses
            one daily. Our testing is keyboard, zoom, contrast checks and automated audits,
            which finds a real but incomplete share of what is wrong — and the gap between
            that and daily use is exactly where the remaining problems will be.
          </Item>
          <Item>
            The documentation pages have a light theme that gets less use than the dark one,
            and correspondingly less checking.
          </Item>
        </List>
      </Section>

      <Section number="5" title="If something does not work for you">
        <P>
          Tell us and we will fix it. Write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>{' '}
          with the page and what happened — &ldquo;the estimate form loses focus after the
          third question&rdquo; is more use to us than &ldquo;the site is hard to use&rdquo;,
          though we would rather have the second than nothing.
        </P>
        <P>
          If you need something on this site in another format — a legal document as plain
          text, a page read to you over a call — ask. That is not a special arrangement, it
          is part of the site working.
        </P>
        <P>
          If we do not answer, or the answer does not resolve it, write again and say so —
          it goes to somebody else here rather than back to the same person. A report about
          this site being unusable is not something we would want sitting unanswered.
        </P>
      </Section>

      <Section number="6" title="Accessibility in what we build">
        <P>
          Accessibility is one of the passes we run before handing a project over, alongside
          security and performance, and the checklist we use is published in full in our{' '}
          <a href="/docs/accessibility" className={linkClasses}>
            documentation
          </a>
          .
        </P>
        <P>
          Two honest caveats. Most accessibility regressions arrive after handover, in
          content somebody adds later, which is why that checklist is written for the person
          maintaining the site rather than for us. And a project only reaches a given
          standard if it was scoped to — if conformance with a specific standard matters,
          say so before we quote, because it changes the design as much as the code.
        </P>
      </Section>
    </LegalLayout>
  );
}
