import React from 'react';
import LegalLayout, { Section, P, List, Item } from '../../components/legal/LegalLayout';
import { STUDIO_NAME, CONTACT_EMAIL } from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

export default function AcceptableUsePage() {
  return (
    <LegalLayout
      current="/acceptable-use"
      title="Acceptable Use Policy"
      summary={`What our software, servers and services may not be used for, and what happens when they are.`}
    >
      <Section number="1" title="Who this applies to">
        <P>
          This policy applies to anyone using something we run, licence or host: a service we
          host for a client, software licensed under our{' '}
          <a href="/eula" className={linkClasses}>
            end user licence
          </a>
          , our own products, this website, and our Discord.
        </P>
        <P>
          Where you are a client, you are responsible for your own users under it. We do not
          expect you to police every person who signs up to your service, and we will not
          treat you as at fault for a user you did not know about — but where you are told
          about a problem and do nothing, it becomes yours.
        </P>
      </Section>

      <Section number="2" title="What you may not do">
        <P>
          The short version is: nothing aimed at hurting somebody, and nothing that breaks
          the systems other people are relying on. The list below is what that means in
          practice, and it is specific on purpose — a policy that says only &ldquo;behave
          yourself&rdquo; is one nobody can plan around.
        </P>
        <P>In more detail, you may not use anything we provide to:</P>
        <List>
          <Item>
            defraud people, take money or credentials from them under false pretences, or
            help somebody else do it;
          </Item>
          <Item>
            build, host, sell or distribute cheats, exploits, injectors, anti-cheat bypasses
            or anything else made to break somebody else&rsquo;s game — we build anti-cheat,
            so this one is not a preference we might be talked out of;
          </Item>
          <Item>
            attack, overload, probe or interfere with any system, ours or anybody
            else&rsquo;s, including through denial of service, credential stuffing, mass
            scanning or unauthorised access;
          </Item>
          <Item>
            send unsolicited bulk messages, run phishing, or impersonate a person or
            organisation in order to be believed;
          </Item>
          <Item>
            host or distribute malware, ransomware, stalkerware, spyware, or tools whose
            purpose is to compromise somebody without their knowledge;
          </Item>
          <Item>
            infringe copyright, trade marks or other rights — the{' '}
            <a href="/copyright" className={linkClasses}>
              copyright policy
            </a>{' '}
            says how a complaint about that is handled;
          </Item>
          <Item>
            publish material that sexualises children in any way, incites violence or hatred
            against people for who they are, or exists to harass a particular person;
          </Item>
          <Item>
            mine cryptocurrency, run distributed compute, or otherwise use hosting you were
            sold for one purpose to do something that costs many times as much;
          </Item>
          <Item>
            resell, sublicense or repackage what we provide as your own product, except where
            your agreement with us expressly allows it;
          </Item>
          <Item>
            evade a suspension, or come back under a different name after one.
          </Item>
        </List>
      </Section>

      <Section number="3" title="Security testing">
        <P>
          Testing the security of a system we run is not a breach of this policy where you
          follow our{' '}
          <a href="/security" className={linkClasses}>
            vulnerability disclosure policy
          </a>
          . That document sets out what is in scope, what to avoid, and the protection you
          get for staying inside it.
        </P>
        <P>
          Outside those bounds it is a breach, and the two are separated by intent and by
          restraint rather than by technique.
        </P>
      </Section>

      <Section number="4" title="What we will do about a breach">
        <P>
          The response is meant to fit the problem. Most reports are a misunderstanding or
          something a client did not know was happening, and those are resolved by telling
          them.
        </P>
        <List>
          <Item>
            <span className="text-neutral-300">We will normally tell you first</span> and give
            you a reasonable time to fix it. That is the default, not the exception.
          </Item>
          <Item>
            <span className="text-neutral-300">We may remove specific content</span> or disable
            a specific feature while something is looked at, rather than taking a whole
            service down.
          </Item>
          <Item>
            <span className="text-neutral-300">We may suspend a service without warning</span>{' '}
            where it is actively harming somebody, or breaking other systems on the same
            infrastructure. This is the case where you hear from us after rather than before,
            and we will explain what happened as soon as we reasonably can.
          </Item>
          <Item>
            <span className="text-neutral-300">We may end the arrangement</span> for a serious
            or repeated breach, under section 11 of the{' '}
            <a href="/terms" className={linkClasses}>
              terms of service
            </a>
            .
          </Item>
        </List>
        <P>
          Suspension does not stop your data being yours. You get an export before anything is
          deleted, and that is not conditional on the dispute being resolved in our favour.
        </P>
      </Section>

      <Section number="5" title="If you think we got it wrong">
        <P>
          Write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>{' '}
          and say so. A person will read it and answer, and if we were wrong we will restore
          the service and say we were wrong. The{' '}
          <a href="/content-moderation" className={linkClasses}>
            content moderation policy
          </a>{' '}
          sets out how that review works where the decision was about content somebody
          published.
        </P>
      </Section>

      <Section number="6" title="Reporting misuse">
        <P>
          If something we host is being used in a way this policy forbids, tell us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>
          . Include a link or an address and enough detail for us to find it. You do not need
          to be a client, and you do not need to be certain.
        </P>
        <P>
          {STUDIO_NAME} also turns down work of this kind before it starts, and{' '}
          <a href="/what-we-dont-take-on" className={linkClasses}>
            says which work
          </a>
          . This policy exists for the case where something changes after we have already
          built it.
        </P>
      </Section>
    </LegalLayout>
  );
}
