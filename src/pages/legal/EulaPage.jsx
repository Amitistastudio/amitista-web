import React from 'react';
import LegalLayout, { Section, P, List, Item } from '../../components/legal/LegalLayout';
import { IdentityLine } from '../../components/legal/LegalIdentity';
import {
  STUDIO_NAME,
  CONTACT_EMAIL,
  JURISDICTION,
  ARBITRATION_SEAT,
  ARBITRATION_LANGUAGE,
} from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

export default function EulaPage() {
  return (
    <LegalLayout
      current="/eula"
      title="End User License Agreement"
      updated="25 August 2026"
      summary={`The terms under which you may use software, scripts and assets licensed to you by ${STUDIO_NAME} rather than transferred to you outright.`}
    >
      <Section number="1" title="Agreement">
        <P>
          This End User License Agreement is between you (the &ldquo;Licensee&rdquo;) and{' '}
          <IdentityLine /> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, the &ldquo;Studio&rdquo;). It
          applies to any software, script, resource, asset or other deliverable we license to
          you rather than transfer outright (the &ldquo;Software&rdquo;).
        </P>
        <P>
          In practice that means it governs projects delivered under the Licence and Hosted
          models described in section 3 of our{' '}
          <a href="/terms" className={linkClasses}>
            terms of service
          </a>
          , and it governs our pre-existing tools and components wherever they appear in your
          project — including in a project transferred to you outright, since those
          components are licensed rather than transferred.
        </P>
        <P>
          By downloading, installing, deploying or using the Software, or by accessing a
          system we host for you, you accept this agreement. If you do not accept it, do not
          use the Software.
        </P>
        <P>
          Where you have signed a separate written contract with us that conflicts with
          this agreement, that contract takes precedence.
        </P>
      </Section>

      <Section number="2" title="Licence granted">
        <P>
          Subject to payment in full and to your compliance with this agreement, we grant
          you a non-exclusive, non-transferable, revocable licence to install and use the
          Software for the purpose it was supplied for.
        </P>
        <P>
          Unless your order or contract states otherwise, the licence covers use by a
          single client or organisation, on the servers or domains agreed with us. It does
          not include the right to sublicense the Software to anyone else.
        </P>
        <P>
          The licence runs for the term stated in your order. Where no term is stated it runs
          for as long as you comply with this agreement and any recurring fee for it is paid.
          A licence is not a sale, and no amount of time spent using the Software converts it
          into one.
        </P>
        <P>
          You can buy the work outright later. Converting a licence into a transfer of
          ownership is a matter of price rather than of principle — ask and we will quote it.
        </P>
      </Section>

      <Section number="3" title="Whether you receive the source">
        <P>
          Being licensed something and being given its source are separate questions, and
          your order answers the second one. We are equally willing to license software you
          can read and software you cannot, and neither is the standard arrangement.
        </P>
        <List>
          <Item>
            Where your order says the source is supplied, you receive it and section 6
            applies to changing it. It is still licensed, not yours: everything in section 4
            continues to apply to it.
          </Item>
          <Item>
            Where your order is silent, or says the source is not supplied, you receive the
            Software in a form that runs and no more. That is not us withholding something
            you bought — under the Licence model the source is the asset we kept, which is
            why the price was lower than a transfer.
          </Item>
          <Item>
            Under the Hosted model nothing is supplied to you at all, source or otherwise.
            You are given access to a running system. Section 9 covers what that means.
          </Item>
        </List>
        <P>
          If you need the source held by a third party against our ceasing to trade, say so
          before you accept the quote and we will arrange escrow. It is a reasonable thing to
          ask for and a common condition of the Licence model.
        </P>
      </Section>

      <Section number="4" title="What you may not do">
        <P>You may not, and may not permit anyone else to:</P>
        <List>
          <Item>resell, rent, sublicense, publish or otherwise distribute the Software;</Item>
          <Item>
            share the source code, or make it available in a public or shared repository;
          </Item>
          <Item>
            decompile, reverse engineer or attempt to derive the source of any part supplied
            in compiled or obfuscated form;
          </Item>
          <Item>
            remove, obscure or alter any copyright notice, licence key check or attribution
            we include;
          </Item>
          <Item>
            use the Software to build a competing product for distribution to third parties;
          </Item>
          <Item>
            use the Software for anything our{' '}
            <a href="/acceptable-use" className={linkClasses}>
              acceptable use policy
            </a>{' '}
            forbids, or in breach of a platform&rsquo;s own rules.
          </Item>
        </List>
      </Section>

      <Section number="5" title="Ownership">
        <P>
          We retain ownership of the Software and of all intellectual property in it,
          including any part of our pre-existing tooling, libraries or components reused in
          your project. Nothing in this agreement transfers ownership to you.
        </P>
        <P>
          Where a contract between us states that intellectual property in bespoke work
          passes to you on final payment, that transfer applies to the bespoke work only,
          and this agreement continues to govern anything licensed rather than transferred.
        </P>
        <P>
          Your own material is not affected by any of this. The content, data, branding and
          anything else you gave us or created inside the Software remains yours, and we
          claim no rights over it.
        </P>
      </Section>

      <Section number="6" title="Modifications">
        <P>
          Where you hold the source, you may modify the Software for your own use unless we
          have told you otherwise in writing. If you do, we are not obliged to support the
          modified version, and we are not responsible for problems your changes cause.
        </P>
        <P>
          A modified copy is still licensed under this agreement. Modifying the Software does
          not create a new work you own, and it does not lift any of the restrictions in
          section 4.
        </P>
      </Section>

      <Section number="7" title="Updates and support">
        <P>
          Any updates, fixes or support we provide form part of the Software and are covered
          by this agreement. We are not obliged to provide updates or support indefinitely,
          and the level of support you are entitled to is whatever was agreed in your order
          or contract.
        </P>
        <P>
          Where the Software is hosted by us, keeping it updated is part of what the
          recurring fee buys and we do it without being asked.
        </P>
      </Section>

      <Section number="8" title="Third-party components">
        <P>
          The Software may include third-party or open-source components licensed under
          their own terms. Those terms govern those components, and where they conflict with
          this agreement, they prevail for that component. We will tell you which components
          are involved on request.
        </P>
      </Section>

      <Section number="9" title="Software we host for you">
        <P>
          This section applies under the Hosted model, where we run the Software on our own
          infrastructure and you use it rather than install it.
        </P>
        <P>
          Your licence in that case is a right of access for as long as the arrangement runs
          and the fee for it is paid. You are not granted a copy, and no right to a copy
          arises from having used the system — however long that has been.
        </P>
        <P>
          The data inside a hosted system is yours. You may export it at any time, and we
          will give you a full export before anything is deleted when the arrangement ends.
          Section 11 of our{' '}
          <a href="/terms" className={linkClasses}>
            terms of service
          </a>{' '}
          sets out availability, suspension and notice in full, and where the system holds
          personal data belonging to your users our{' '}
          <a href="/dpa" className={linkClasses}>
            data processing addendum
          </a>{' '}
          applies to it.
        </P>
        <P>
          If you later want to run the Software yourself, that is a conversion to a Licence
          or a Transfer and we will quote it. It is not something the hosting arrangement
          entitles you to on its own.
        </P>
      </Section>

      <Section number="10" title="Termination">
        <P>
          This licence ends automatically if you materially breach it. It also ends when its
          term expires, or when a recurring fee for it stays unpaid after we have told you
          and given you a reasonable chance to pay.
        </P>
        <P>
          On termination you must stop using the Software and delete all copies you hold.
          Where we hosted it, your access ends instead — and you get your data out first, as
          section 9 describes. The sections covering ownership and what we cover carry on
          applying after it ends.
        </P>
        <P>
          Whether anything paid comes back when a licence ends depends on why it ended, and
          in most cases nothing does. Our{' '}
          <a href="/refund" className={linkClasses}>
            refund policy
          </a>{' '}
          sets out the cases.
        </P>
      </Section>

      <Section number="11" title="What the Software is promised to do">
        <P>
          The Software is supplied as it is. We do not promise that it will run without
          interruption, that it is free of faults, or that it will suit a purpose we were
          never told about. Test it in your own environment before you rely on it in
          production — that part is yours, and it is the step that catches most of what goes
          wrong.
        </P>
        <P>
          Where it does not do what we agreed it would, tell us and we will fix it. That is
          the remedy this agreement offers, and section 7 covers how updates and support
          work.
        </P>
      </Section>

      <Section number="12" title="What we cover if something goes wrong">
        <P>
          We put the Software right. What we do not cover is what happened downstream of it —
          lost profits, lost revenue, lost data, a service being unavailable, or anything
          that followed on from one of those.
        </P>
        <P>
          The most we would ever put back is what you paid us for the Software in the twelve
          months before. That figure is deliberately stated rather than left open, so that
          you know it before you buy rather than after something has gone wrong.
        </P>
      </Section>

      <Section number="13" title="Governing law and disputes">
        <P>
          This agreement is governed by the laws of {JURISDICTION}. If a dispute arises out of
          it, whoever noticed it first puts it in writing and the other has thirty days to put
          it right.
        </P>
        <P>
          Anything still unresolved after those thirty days is finally settled by arbitration
          seated in {ARBITRATION_SEAT}, before a single arbitrator, under the arbitration
          provisions of the Greek Code of Civil Procedure, conducted in{' '}
          {ARBITRATION_LANGUAGE}. The award is final and binding on both of us, and accepting
          this agreement means neither of us takes such a dispute to a court instead. Either
          of us may still ask a court for an urgent injunction to stop the Software being
          copied or used in a way section 4 forbids.
        </P>
        <P>
          Section 17 of the{' '}
          <a href="/terms" className={linkClasses}>
            terms of service
          </a>{' '}
          sets out the same procedure in full and applies here as well. Nothing in it takes
          away a right that the law where you live gives you and does not allow you to sign
          away.
        </P>
      </Section>

      <Section number="14" title="Contact">
        <P>
          Questions about this agreement go to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>
          .
        </P>
      </Section>
    </LegalLayout>
  );
}
