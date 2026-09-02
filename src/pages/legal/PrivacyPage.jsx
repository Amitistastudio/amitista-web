import React from 'react';
import LegalLayout, { Section, P, List, Item } from '../../components/legal/LegalLayout';
import { IdentityLine } from '../../components/legal/LegalIdentity';
import {
  STUDIO_NAME,
  CONTACT_EMAIL,
  JURISDICTION,
  HOSTING_PROVIDER,
} from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

export default function PrivacyPage() {
  return (
    <LegalLayout
      current="/privacy"
      title="Privacy Policy"
      summary={`What ${STUDIO_NAME} does with personal information, where it goes, and how to get it removed.`}
    >
      <Section number="1" title="Who is responsible">
        <P>
          <IdentityLine /> operates this website and decides how the information described
          here is used. Anything below is a commitment we are making to you directly.
        </P>
        <P>
          We are based in {JURISDICTION}, and you can reach us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>
          .
        </P>
      </Section>

      <Section number="2" title="What this covers">
        <P>
          This policy is about the website: the contact form, the pages you read, and the
          third-party services those pages load. It is not about the systems we build for
          clients, which section 11 deals with separately.
        </P>
      </Section>

      <Section number="3" title="What you give us">
        <P>
          The contact form asks for, and sends us, exactly these things:
        </P>
        <List>
          <Item>your name;</Item>
          <Item>your email address;</Item>
          <Item>the type of project and the timeline you pick from the two menus;</Item>
          <Item>whatever you write in the details box.</Item>
        </List>
        <P>
          Nothing else is collected from the form. If you email us directly instead, we
          have your message and your email address in the same way any recipient would.
        </P>
      </Section>

      <Section number="4" title="Where the forms actually send it">
        <P>
          This is worth being blunt about, because it is unusual. Neither form goes to an
          inbox. What you send goes to our own server in Frankfurt, which passes it on to a
          private channel in our Discord server, where the team reads it. Discord Inc.
          therefore receives and stores your enquiry, and its own privacy policy governs
          what it does with it.
        </P>
        <P>
          Your browser does not contact Discord itself — our server does, on its own
          connection. The practical difference is that Discord receives what you wrote and
          not your IP address or which browser you used, which it would have if the form
          posted there directly, as this one did until August 2026.
        </P>
        <P>
          Discord is based in the United States, so what you send us is stored on servers
          there rather than in Europe. That is worth knowing before you use the form, which
          is the only reason this paragraph exists.
        </P>
        <P>
          If you would rather not have your enquiry pass through Discord, email us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>{' '}
          instead and it will not.
        </P>
      </Section>

      <Section number="5" title="What is collected automatically">
        <P>
          We run no analytics on this site. There is no tracking pixel, no advertising
          tag, and nothing that builds a profile of you or follows you to other sites.
        </P>
        <P>
          What does happen is unavoidable for any website. The site runs on a virtual
          server we rent from {HOSTING_PROVIDER}, in a data centre in Frankfurt am Main,
          Germany. That server records the usual
          information when a page is requested — your IP address, the time, the page, and
          your browser&rsquo;s user agent. Those logs are ours and we use them only to keep
          the site running and to investigate abuse. {HOSTING_PROVIDER} provides and
          operates the machine underneath, so it can reach what is stored on it.
        </P>
        <P>
          They are rotated and deleted after fourteen days. The exception is a log we have
          already pulled out because we are investigating a specific incident, which we keep
          until that is finished and then delete with everything else.
        </P>
      </Section>

      <Section number="6" title="Third parties our pages load">
        <P>
          Nothing on this site is fetched from another company&rsquo;s servers as a page
          loads. The typefaces, the images and the code all come from here, so opening a
          page tells nobody but us that you did. That is deliberate: loading fonts from
          Google&rsquo;s CDN, which is what almost every site does, would announce your IP
          address to Google before a word of the page was readable, and there is no version
          of that we could have asked you to agree to first.
        </P>
        <P>
          Submitting a form does not change that. It goes to us, and we pass it to Discord
          from our end — section 4. Your browser makes no request to Discord at any point.
        </P>
        <P>
          One thing reaches somebody else, and only because you did something:
        </P>
        <List>
          <Item>
            <span className="text-neutral-300">YouTube</span> — some project pages have a
            showcase video. Nothing is requested from YouTube until you press play: the
            still you see before that is our own file. Press play and Google receives your
            IP address and sets cookies in the ordinary way.
          </Item>
        </List>
      </Section>

      <Section number="7" title="Cookies and things stored in your browser">
        <P>
          We set no cookies. We use no cookie banner because there is nothing to consent
          to. Our{' '}
          <a href="/cookies" className={linkClasses}>
            cookie policy
          </a>{' '}
          is the longer version of this section, including how to check the claim for
          yourself rather than take our word for it.
        </P>
        <P>
          Three things are stored in your browser&rsquo;s own local storage. All three stay
          on your device, none is ever sent to us, and clearing your browser data removes
          them:
        </P>
        <List>
          <Item>
            <span className="text-neutral-300">amitista-docs-theme</span> — whether you
            chose the light or dark view on the documentation pages;
          </Item>
          <Item>
            <span className="text-neutral-300">amitista:recent-pages</span> — the last few
            pages you opened from the search palette, so it can offer them again;
          </Item>
          <Item>
            <span className="text-neutral-300">amitista:estimate</span> — the answers you
            gave the estimator, so that leaving the page and coming back does not lose
            them. Clearing it is what the &ldquo;start over&rdquo; button on that page
            does.
          </Item>
        </List>
      </Section>

      <Section number="8" title="What we use it for">
        <List>
          <Item>
            <span className="text-neutral-300">To answer your enquiry.</span> You sent it
            to us for that purpose, and where it turns into a project, to get the project
            started.
          </Item>
          <Item>
            <span className="text-neutral-300">To keep the site working and secure.</span>{' '}
            Server logs are what let us fix faults and stop abuse. That is the whole of what
            they are for.
          </Item>
        </List>
        <P>
          We do not sell personal information, we do not share it for advertising, and we
          will not add you to a mailing list because you contacted us.
        </P>
      </Section>

      <Section number="9" title="How long it is kept">
        <P>
          Enquiries stay in the Discord channel for as long as they are useful to us, and
          are deleted once they are not. Where an enquiry becomes a project, the
          correspondence is kept for as long as we work together, and afterwards for as long
          as we keep our accounting records for that project.
        </P>
        <P>
          Ask us to delete an enquiry sooner and we will, unless it has become part of an
          accounting record for work we did.
        </P>
      </Section>

      <Section number="10" title="What you can ask us for">
        <P>
          Any of the following, at any time, free of charge, and you do not have to give a
          reason for asking:
        </P>
        <List>
          <Item>tell you what personal information we hold about you, and give you a copy;</Item>
          <Item>correct anything that is wrong;</Item>
          <Item>delete it;</Item>
          <Item>stop or limit what we do with it, or object to it;</Item>
          <Item>hand it over in a portable format, or send it to someone else;</Item>
          <Item>withdraw consent, where what we are doing rests on consent.</Item>
        </List>
        <P>
          Write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>{' '}
          and we will respond within one month. We may need to confirm who you are first,
          so that we do not hand your information to somebody else.
        </P>
      </Section>

      <Section number="11" title="Data inside the systems we build">
        <P>
          When we build or maintain something for a client, we sometimes see personal
          information belonging to that client&rsquo;s own users. In that situation the
          client decides what happens to it and we act on their instructions. It is their
          data to answer for, and we do not use it for anything of our own.
        </P>
        <P>
          If you are a user of a site or server we built for someone else, that
          organisation is the right place to send a request about your information, not
          us. We will pass it on if you reach us by mistake.
        </P>
      </Section>

      <Section number="12" title="Security">
        <P>
          The site is served over HTTPS and access to the channel that receives enquiries
          is limited to the people who need it. No system is perfectly secure, so please
          do not send passwords, payment card numbers or anything similar through the
          contact form.
        </P>
      </Section>

      <Section number="13" title="Children">
        <P>
          This site is aimed at people commissioning work, not at children, and we do not
          knowingly collect information from them. If you believe a child has sent us
          something, tell us and we will remove it.
        </P>
      </Section>

      <Section number="14" title="Complaints">
        <P>
          If you think we have handled your information badly, tell us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>
          . A person reads it, you get an answer rather than an acknowledgement, and where we
          got it wrong we will say so and fix it.
        </P>
        <P>
          Nothing on this page asks you to give anything up, or to come to us before going
          anywhere else. It is a description of what we do, not a condition of using the
          site.
        </P>
      </Section>

      <Section number="15" title="Changes to this policy">
        <P>
          We update this page when the site changes — a new service that loads on our
          pages, or a different destination for the contact form, means a change here too.
          The date at the top shows when it was last revised.
        </P>
      </Section>
    </LegalLayout>
  );
}
