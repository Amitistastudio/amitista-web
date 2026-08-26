import React from 'react';
import LegalLayout, { Section, P, List, Item } from '../../components/legal/LegalLayout';
import { STUDIO_NAME, CONTACT_EMAIL } from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

export default function CopyrightPage() {
  return (
    <LegalLayout
      current="/copyright"
      title="Copyright Complaints"
      summary={`How to tell ${STUDIO_NAME} that something we host copies your work, and how to answer a complaint made about yours.`}
    >
      <Section number="1" title="What this covers">
        <P>
          This is how we handle a complaint that something on a service we host copies
          somebody else&rsquo;s work. It is a process we run ourselves, and it is open to
          anybody — you do not need a relationship with us, an account, or anything filed
          anywhere first.
        </P>
        <P>
          It covers content on services we run. A project we built and handed over runs on
          the client&rsquo;s own infrastructure and we cannot remove anything from it, so a
          complaint about one of those needs to go to whoever operates it.
        </P>
        <P>
          The process below is deliberately the familiar one, because people already know how
          it works: you tell us what was copied and where, we look at it, and the person who
          posted it gets to answer.
        </P>
      </Section>

      <Section number="2" title="Sending a complaint">
        <P>
          Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>{' '}
          with &ldquo;copyright&rdquo; in the subject line. Include:
        </P>
        <List>
          <Item>
            what work you say has been copied, and enough for us to identify it — a link to
            where it legitimately appears, a registration number, or the original file;
          </Item>
          <Item>
            where the copy is, precisely enough that we can find it. A link to a specific
            page, not a domain;
          </Item>
          <Item>your name, and an address we can reply to;</Item>
          <Item>
            confirmation that you believe the use was not authorised by you or by anyone
            acting for you;
          </Item>
          <Item>
            confirmation that what you have told us is accurate, and that the work is yours
            or you are authorised to act for whoever owns it;
          </Item>
          <Item>your signature, electronic or otherwise.</Item>
        </List>
        <P>
          A complaint missing the first two is one we cannot act on, and we will write back
          asking rather than guessing. Quotation, review, parody and licensed use all exist,
          and we would rather ask a question than remove somebody&rsquo;s work by mistake.
        </P>
      </Section>

      <Section number="3" title="What we do with it">
        <P>
          We aim to look at a complaint within two working days. Where it is complete and the
          copying is clear, we remove or disable access to the material and tell the person
          who posted it what was removed, why, and that they can answer it.
        </P>
        <P>
          Where it is not clear, we will ask you both. A copyright complaint is one of the
          easiest ways to get legitimate material taken off the internet, so we treat a
          contested one as contested rather than as settled by whoever wrote first.
        </P>
      </Section>

      <Section number="4" title="Answering a complaint about your content">
        <P>
          If we removed something of yours and you believe it was a mistake, or that you had
          the right to post it, write back to the same address. Include:
        </P>
        <List>
          <Item>what was removed and where it was;</Item>
          <Item>
            why you think it was removed in error — that the work is yours, that you were
            permitted to use it, or that the wrong thing was identified;
          </Item>
          <Item>your name, an address we can reply to, and your signature.</Item>
        </List>
        <P>
          We will pass it to the person who complained. If they do not tell us within
          fourteen days that they are taking the matter further, we will normally restore the
          material.
        </P>
      </Section>

      <Section number="5" title="Repeated copying">
        <P>
          Where somebody repeatedly posts work that is not theirs, we will end their access to
          the service in question. What counts as repeated is a judgement rather than a
          counter — three careless reuses of a stock photo is not the same as a service built
          on somebody else&rsquo;s catalogue, and we will not pretend a number decides it.
        </P>
      </Section>

      <Section number="6" title="If we get it wrong">
        <P>
          You keep every option you arrived with. This process is something we offer on top of
          them rather than in place of them, and using it costs you nothing and gives up
          nothing.
        </P>
        <P>
          The{' '}
          <a href="/content-moderation" className={linkClasses}>
            content moderation policy
          </a>{' '}
          sets out how we review a decision either of you thinks was wrong.
        </P>
      </Section>

      <Section number="7" title="Complaints made in bad faith">
        <P>
          Knowingly making a false copyright claim to get legitimate material removed is a
          thing that happens — to silence criticism, to remove a competitor, to win an
          argument. Where we conclude a complaint was made in bad faith we will restore the
          material, refuse further complaints from that source, and tell the person it was
          aimed at.
        </P>
      </Section>

      <Section number="8" title="Our own work">
        <P>
          This page is about content we host for other people. Where somebody has taken our
          work — a project, a product, this site — we deal with that directly, and{' '}
          <a href="/what-we-dont-take-on" className={linkClasses}>
            reselling somebody else&rsquo;s work as your own
          </a>{' '}
          is among the things we refuse to build in the first place.
        </P>
      </Section>
    </LegalLayout>
  );
}
