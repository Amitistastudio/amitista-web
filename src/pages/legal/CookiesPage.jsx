import React from 'react';
import LegalLayout, { Section, P, List, Item } from '../../components/legal/LegalLayout';
import { STUDIO_NAME, CONTACT_EMAIL } from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

export default function CookiesPage() {
  return (
    <LegalLayout
      current="/cookies"
      title="Cookie Policy"
      summary={`${STUDIO_NAME} sets no cookies on this website. This is the short document explaining what that means and what is stored instead.`}
    >
      <Section number="1" title="We set no cookies">
        <P>
          Not &ldquo;only essential ones&rdquo;. None. There is no analytics, no advertising
          pixel, no session cookie and no tracking of any kind on this website, so there is
          no consent banner — because there is nothing to consent to.
        </P>
        <P>
          This is a deliberate choice rather than an accident of a small site. Counting
          visitors is easy to want and hard to do without collecting more than you needed,
          and we decided we would rather not know.
        </P>
      </Section>

      <Section number="2" title="What a cookie is, briefly">
        <P>
          A cookie is a small file a site asks your browser to keep and send back on every
          later request. That returning-it-automatically part is what makes cookies useful
          for staying logged in, and what makes them useful for following people between
          sites.
        </P>
        <P>
          Nothing on this site does either. There is no login here, and nothing to follow you
          with.
        </P>
      </Section>

      <Section number="3" title="What is stored instead">
        <P>
          Three things are kept in your browser&rsquo;s own local storage, which is different
          from a cookie in the way that matters: it is never attached to a request and never
          sent to us. All three stay on your device, and clearing your browser data removes
          them.
        </P>
        <List>
          <Item>
            <span className="text-neutral-300">amitista-docs-theme</span> — whether you chose
            the light or dark view on the documentation pages.
          </Item>
          <Item>
            <span className="text-neutral-300">amitista:recent-pages</span> — the last few
            pages you opened from the search palette, so it can offer them again.
          </Item>
          <Item>
            <span className="text-neutral-300">amitista:estimate</span> — the answers you gave
            the estimator, so that leaving the page and coming back does not lose them.
            Clearing it is what the &ldquo;start over&rdquo; button on that page does.
          </Item>
        </List>
        <P>
          None of the three is needed for the site to work. Block local storage entirely and
          everything still functions — you will simply be offered the dark documentation
          theme each time and have to answer the estimator again.
        </P>
      </Section>

      <Section number="4" title="Other companies, when you reach them through us">
        <P>
          One thing on this site is fetched from somebody else, and it is described in full
          in section 6 of our{' '}
          <a href="/privacy" className={linkClasses}>
            privacy policy
          </a>
          .
        </P>
        <List>
          <Item>
            <span className="text-neutral-300">YouTube</span> — a few project pages have a
            showcase video. Nothing is requested from YouTube until you press play; the still
            you see before that is our own file. Press play and you are dealing with Google,
            which does set cookies. We use the no-cookie embed host, which reduces that but
            does not remove it.
          </Item>
        </List>
        <P>
          It loads only when you ask for it, and pressing play is the asking. Nothing else on
          any page of this site reaches another company — the typefaces used to be requested
          from Google as every page loaded, and they are now served from here, which is why
          this section is one item shorter than it was.
        </P>
      </Section>

      <Section number="5" title="Nothing to opt out of, and how to check">
        <P>
          Because we set nothing, there are no settings for you to change and no preference
          for us to remember. If you want to satisfy yourself that this is true rather than
          take our word for it, open your browser&rsquo;s developer tools on any page of this
          site and look at the cookie store. It is empty.
        </P>
        <P>
          That is a better guarantee than a policy, and it is the reason this page is worth
          writing.
        </P>
      </Section>

      <Section number="6" title="Systems we build and host">
        <P>
          This policy is about this website. A project we build for you may well need cookies
          — a login has to keep you logged in — and that project needs its own cookie notice
          written against what it actually does. If we host it for you, the same applies:
          our not setting cookies here says nothing about what the system running your
          service sets.
        </P>
      </Section>

      <Section number="7" title="If this changes">
        <P>
          If we ever add analytics or anything else that stores data on your device, this
          page changes before it goes live rather than after, and the date at the top will
          show it. Questions go to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>
          .
        </P>
      </Section>
    </LegalLayout>
  );
}
