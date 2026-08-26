import React from 'react';
import LegalLayout, { Section, P, List, Item } from '../../components/legal/LegalLayout';
import { STUDIO_NAME, CONTACT_EMAIL } from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

export default function RefundPage() {
  return (
    <LegalLayout
      current="/refund"
      title="Refund Policy"
      summary={`When money paid to ${STUDIO_NAME} can be refunded, and how to ask for one.`}
    >
      <Section number="1" title="Scope">
        <P>
          This policy covers payments made to us for custom development work, for licensed
          products such as scripts, resources and templates, and for hosting we run on your
          behalf. It sits alongside our{' '}
          <a href="/terms" className={linkClasses}>
            Terms of Service
          </a>
          .
        </P>
        <P>
          Read section 2 before you pay anything. Refunds are the exception here rather than
          a step in the process, and the circumstances in which money comes back are narrow
          and listed. We would rather you knew that now than discovered it later.
        </P>
        <P>
          Which part below applies to you depends on how your project was delivered — bought
          outright, licensed, or hosted by us. Those three models are set out in{' '}
          <a href="/terms" className={linkClasses}>
            section 3 of the terms
          </a>
          , and your quote names the one that applies.
        </P>
        <P>
          Where you bought through a third-party marketplace, that marketplace&rsquo;s refund
          rules apply to the purchase and you should raise the request with them first.
        </P>
      </Section>

      <Section number="2" title="Custom development work">
        <P>
          Work begins when you accept the quote in writing and the deposit has been paid.
          From that moment the project is not refundable — not the deposit, not a milestone,
          not any part of a payment already made.
        </P>
        <P>
          This applies from the first day. There is no early window in which the work has not
          really started yet: scoping, planning, scheduling and turning away other work to
          hold your place are the work, they happen at the beginning, and they are the largest
          part of what a deposit pays for. A project cancelled on day two has still consumed
          them.
        </P>
        <P>
          If you cancel at any point, you still owe us for the work completed up to that
          point and for any commitments we have made on your behalf. Nothing already paid
          comes back, and where what you have paid does not cover that amount we invoice you
          for the difference.
        </P>
        <P>
          The one exception runs the other way. If <em>we</em> cancel a project for a reason
          that is not your fault, we refund what you have paid for work not yet done.
        </P>
      </Section>

      <Section number="3" title="Licences and downloads">
        <P>
          A licensed product is not refundable once the files, the keys or the access have
          been handed over. A download cannot be given back, and the moment it reaches you it
          can be copied — so delivery is the point of no return, and it is not a judgement
          about you that we treat it that way.
        </P>
        <P>
          Before delivery, and only before it, we may cancel and refund an order at our
          discretion, less any work already done against it.
        </P>
        <P>
          Where a licence runs for a term and you paid for that term up front, ending it early
          is your decision rather than a fault in the work, and the fee for the remainder is
          not refunded. If we end it early for a reason that is not your fault, the unused
          part comes back to you.
        </P>
      </Section>

      <Section number="4" title="Hosting and recurring fees">
        <P>
          Hosting is billed in advance for a period. A period that has begun is not refunded,
          in whole or in part, whether or not you used the service during it.
        </P>
        <P>
          If we end a hosting arrangement for a reason that is not your fault, we refund the
          unused part of the current period, worked out by the day. That is the only
          circumstance in which prepaid hosting is refunded — ending it yourself, mid-period,
          is not one.
        </P>
        <P>
          Nothing is refunded for a period in which we suspended the service because an
          invoice was unpaid or because the service was being used unlawfully.
        </P>
        <P>
          Ending a hosting arrangement does not entitle you to a refund of the project fee
          that built the thing in the first place. That work was done and delivered.
        </P>
        <P>
          You get a full export of your data before anything is deleted, and that is not
          conditional on a refund being agreed or refused. Your data is not leverage.
        </P>
      </Section>

      <Section number="5" title="If something does not work">
        <P>
          Our obligation is to make it work, not to hand the money back. If a deliverable does
          not do what we agreed it would, tell us and we will fix it — that is the remedy, and
          in practice it resolves effectively everything.
        </P>
        <P>A refund is considered only where all of the following are true:</P>
        <List>
          <Item>
            the failure goes to the deliverable as a whole rather than to a part of it, so
            that what you have is unusable rather than imperfect;
          </Item>
          <Item>
            we have been unable to make it work within a reasonable time, having genuinely
            tried;
          </Item>
          <Item>
            you have given us what we needed to reproduce the problem — details of your setup,
            error logs, and access where it is required.
          </Item>
        </List>
        <P>
          Where all three hold, the refund is limited to the amount paid for the part that
          does not work. A deliverable that works but is not what you had pictured is not a
          fault, and a request to change direction is new work rather than grounds for money
          back.
        </P>
      </Section>

      <Section number="6" title="What is not refundable">
        <List>
          <Item>any project on which work has started, at any stage of it;</Item>
          <Item>deposits, in every circumstance except our own cancellation under section 2;</Item>
          <Item>work that has been delivered, accepted or put into live use;</Item>
          <Item>licensed files, keys or access once handed over;</Item>
          <Item>a hosting period that has begun;</Item>
          <Item>
            a change of mind, a change of direction, a change of budget, or a project
            cancelled for reasons unconnected to the quality of our work;
          </Item>
          <Item>
            a project abandoned by you, or one stalled because material, feedback or access we
            asked for never arrived;
          </Item>
          <Item>
            problems caused by your own changes to the code, by your hosting, or by
            third-party software we did not supply;
          </Item>
          <Item>
            fees paid to third parties on your behalf, such as domains, hosting or licences,
            once we have paid them;
          </Item>
          <Item>
            a request that the deliverable does something that was never in the agreed scope;
          </Item>
          <Item>
            the project fee for a licensed or hosted project, on the ground that you did not
            end up owning the source — that is what the model was, and what made it cheaper
            than buying the work outright.
          </Item>
        </List>
      </Section>

      <Section number="7" title="How to request a refund">
        <P>
          Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>{' '}
          with your name, the project or order, the date of payment, and what the problem is.
          A request that does not identify the payment and the fault is one we cannot assess.
        </P>
        <P>
          We respond to refund requests within five working days. Where a refund is approved
          it is paid back through the original payment method within fourteen days. Your bank
          or payment provider may take longer to show it.
        </P>
      </Section>

      <Section number="8" title="Chargebacks">
        <P>
          If you believe a payment was wrong, contact us before raising a chargeback with your
          bank. A chargeback opened without contacting us first may lead us to suspend any
          licence and stop work while it is resolved.
        </P>
      </Section>

      <Section number="9" title="Changes to this policy">
        <P>
          We may update this policy. The version that applies to a purchase is the one
          published on the day you paid. The date at the top of this page shows when it was
          last changed.
        </P>
      </Section>
    </LegalLayout>
  );
}
