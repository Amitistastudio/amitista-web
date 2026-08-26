import React from 'react';
import LegalLayout, { Section, P, List, Item } from '../../components/legal/LegalLayout';
import { STUDIO_NAME, CONTACT_EMAIL } from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

export default function ContentModerationPage() {
  return (
    <LegalLayout
      current="/content-moderation"
      title="Content Moderation Policy"
      summary={`How ${STUDIO_NAME} handles reports about content on services we host or run, and how to challenge a decision.`}
    >
      <Section number="1" title="What we actually moderate">
        <P>
          We are a development studio, not a platform, and it is worth being precise about
          how little of the internet this covers. It applies to:
        </P>
        <List>
          <Item>our Discord server, which we run ourselves;</Item>
          <Item>
            services we host for clients, where somebody can publish something that other
            people see;
          </Item>
          <Item>anything you send us — an enquiry, an estimate, a message.</Item>
        </List>
        <P>
          It does not apply to a project we built and handed over. Once a client runs their
          own service on their own infrastructure, moderating it is theirs to do and we have
          no access with which to do it.
        </P>
      </Section>

      <Section number="2" title="Who decides what">
        <P>
          Where we host a client&rsquo;s service, the client sets the rules for their own
          community and moderates it. We are the hosting provider underneath, and we act on
          content directly only where it breaks our{' '}
          <a href="/acceptable-use" className={linkClasses}>
            acceptable use policy
          </a>{' '}
          — not because we disagree with how they run their service.
        </P>
        <P>
          That distinction is the whole design. A hosting provider that starts making
          editorial decisions about a client&rsquo;s community is a worse hosting provider,
          and a client who cannot predict when we will overrule them cannot build anything on
          us.
        </P>
      </Section>

      <Section number="3" title="What gets removed">
        <P>
          The list is the one in section 2 of the acceptable use policy, and it is short on
          purpose. In practice what we act on is content that:
        </P>
        <List>
          <Item>
            sexualises children in any way — removed and reported, without exception and
            without waiting to be asked twice;
          </Item>
          <Item>incites violence, or attacks people for who they are;</Item>
          <Item>exists to harass, threaten or expose a particular person;</Item>
          <Item>
            infringes someone&rsquo;s copyright or trade mark — handled through the{' '}
            <a href="/copyright" className={linkClasses}>
              copyright policy
            </a>
            , which has its own process and its own right of reply;
          </Item>
          <Item>is malware, phishing, or a scam aimed at the people who see it.</Item>
        </List>
        <P>
          We do not remove things for being wrong, rude, unpopular or critical of us. If you
          think our work is bad you are welcome to say so on our Discord, and people have.
        </P>
      </Section>

      <Section number="4" title="Reporting something">
        <P>
          Write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>{' '}
          with a link or an address, and what you think is wrong with it. On Discord you can
          also message a moderator directly, which is faster.
        </P>
        <P>
          You do not need an account, a relationship with us, or certainty. Tell us what you
          saw and we will look. If you are reporting something about yourself — your image,
          your data, your work — say so, because it changes how quickly we treat it.
        </P>
        <P>
          We will confirm we received your report, and tell you what we decided once we have
          decided it.
        </P>
      </Section>

      <Section number="5" title="How a decision gets made">
        <P>
          A person reads it. There is no automated moderation on anything we run, and no
          system that removes content without a human having looked — a studio our size has
          no need of one, and it is the part of this policy most likely to change if that
          ever stops being true.
        </P>
        <P>
          We aim to look at a report within two working days, and faster where somebody is
          being harmed right now. Where the answer is not obvious we will ask the person who
          published it before deciding, unless doing so would make things worse.
        </P>
        <P>
          Where we act, we act as narrowly as the problem allows: removing one thing rather
          than a whole account, restricting rather than deleting, telling a client rather than
          taking their service down. Suspending a service is the last option, not the first.
        </P>
      </Section>

      <Section number="6" title="If we act on your content">
        <P>
          We will tell you what we removed or restricted, which part of this policy or the
          acceptable use policy it fell under, and how to challenge it. A removal with no
          reason given is not something you should accept from anybody, including us.
        </P>
        <P>
          To challenge it, reply and say why you think we were wrong. Somebody will look at it
          again, and where we got it wrong we will put it back and say so. If you are still
          unhappy after that, you keep every option you arrived with — nothing here takes one
          away, and using this process gives nothing up.
        </P>
      </Section>

      <Section number="7" title="Formal requests">
        <P>
          Where somebody entitled to make a formal request asks us to remove something or hand
          over information, we deal with it properly rather than ignoring it. We will tell the
          person affected that it happened, unless we have been told we may not.
        </P>
        <P>
          An informal message from somebody official is not one of these, and we do not treat
          it as though it were. Those get the same reading as any other report, under section
          5.
        </P>
      </Section>

      <Section number="8" title="What we are not">
        <P>
          We do not read client databases looking for things to act on, and we do not monitor
          hosted services proactively. We respond to reports. Being told is how we find out,
          which is why section 4 is written to make telling us easy.
        </P>
      </Section>
    </LegalLayout>
  );
}
