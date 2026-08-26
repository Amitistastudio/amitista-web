import React from 'react';
import LegalLayout, { Section, P, List, Item } from '../../components/legal/LegalLayout';
import { STUDIO_NAME, CONTACT_EMAIL, VAT_REGISTERED, ARBITRATION_SEAT } from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

export default function BillingPage() {
  return (
    <LegalLayout
      current="/billing"
      title="Billing Policy"
      updated="25 August 2026"
      summary={`How ${STUDIO_NAME} invoices, what happens when a payment is late, and how recurring fees work.`}
    >
      <Section number="1" title="What this covers">
        <P>
          The mechanics of paying us. Section 5 of the{' '}
          <a href="/terms" className={linkClasses}>
            terms of service
          </a>{' '}
          says when you are invoiced and what you owe; this says how it works in practice.
          Where money comes back rather than goes out, that is the{' '}
          <a href="/refund" className={linkClasses}>
            refund policy
          </a>
          .
        </P>
      </Section>

      <Section number="2" title="Quotes and what a price includes">
        <P>
          Every project is quoted in writing before it starts, against a written scope, and
          the quote holds for thirty days. The price in it is the price you pay for that
          scope — it is not an hourly meter and it does not move because something took us
          longer than we thought.
        </P>
        <P>
          A quote names the delivery model, because that is what the price is for. Buying the
          work outright costs more than licensing it or having us host it, for the reason set
          out in{' '}
          <a href="/terms" className={linkClasses}>
            section 3 of the terms
          </a>
          .
        </P>
      </Section>

      <Section number="3" title="How a project is invoiced">
        <P>
          Unless we agree otherwise in writing, a project is invoiced as a deposit before work
          starts and the balance on completion. Larger projects are split into milestones,
          each invoiced as it is reached, so that neither of us is carrying the whole project
          on trust.
        </P>
        <P>
          The deposit secures a place in the schedule and covers scoping and planning. Work
          starts once it is paid and the scope is accepted, not before.
        </P>
        <P>
          Costs we pay on your behalf — domains, third-party licences, paid services your
          project needs — are passed on at what they cost us, and we will tell you before
          committing to any of them.
        </P>
      </Section>

      <Section number="4" title="Recurring fees">
        <P>
          Hosting and any ongoing licence or maintenance fee are billed for a period in
          advance, separately from the project fee. Unless your order says otherwise the
          period is monthly and it renews automatically until one of us ends it.
        </P>
        <P>
          Either of us may end a recurring arrangement on thirty days&rsquo; written notice,
          as section 11 of the terms sets out. Ending it stops the next renewal rather than
          the current period: a period you have already paid for runs to its end and is not
          refunded, as section 4 of the refund policy sets out.
        </P>
        <P>
          We will give you at least thirty days&rsquo; notice before a recurring fee changes,
          and you can end the arrangement within that period instead of accepting it.
        </P>
      </Section>

      <Section number="5" title="Payment terms and methods">
        <P>
          Invoices are payable within fourteen days of issue unless the invoice states
          otherwise.
        </P>
        <P>
          Invoices are issued in the currency stated on them, and the ways you can pay are
          listed on the invoice itself. Bank transfer is always accepted, and we will tell
          you what else is before you accept a quote rather than leaving you to find out when
          the invoice arrives. Any fee your bank or payment provider charges to send the
          money is yours; any fee ours charges to receive it is ours.
        </P>
        <P>
          Payment is not complete until the money reaches us. Where a payment is reversed
          after we have treated it as received, the invoice returns to unpaid.
        </P>
      </Section>

      <Section number="6" title="Late payment">
        <P>
          We would rather ask than escalate, and in practice a late invoice is usually an
          invoice somebody did not see. The order below is what happens if that is not it.
        </P>
        <List>
          <Item>
            We will remind you when an invoice passes its due date, and again after that.
          </Item>
          <Item>
            We may pause work on a project with an overdue invoice. Paused work does not lose
            its place in the schedule immediately, but it cannot hold it indefinitely.
          </Item>
          <Item>
            We may suspend a hosted service where its invoice is more than thirty days
            overdue, having warned you first. Your data stays yours throughout and you can
            have an export of it — a bill in dispute is not a reason to hold somebody&rsquo;s
            data hostage.
          </Item>
          <Item>
            We may charge interest on an invoice that stays overdue, and recover what it
            reasonably costs us to collect it.
          </Item>
          <Item>
            Where work is delivered but unpaid, ownership of it has not passed to you. Section
            9 of the terms makes that transfer conditional on payment in full.
          </Item>
        </List>
      </Section>

      <Section number="7" title="Tax">
        {VAT_REGISTERED ? (
          <P>
            Prices are quoted before tax. Tax is added and shown separately on the invoice at
            the rate that applies to what you are buying, and our tax registration details
            appear on the invoice itself.
          </P>
        ) : (
          <>
            <P>
              Nothing is added to what we invoice you. The price you are quoted is the price
              on the invoice, and there is no separate tax line on it.
            </P>
            <P>
              This is worth knowing before you plan around it, because some finance
              departments expect a tax line and query an invoice that has none. If that is
              yours, this paragraph is the answer to the question they are about to ask.
            </P>
            <P>
              It changes if our position changes, and we will tell you before it affects an
              invoice of yours rather than after.
            </P>
          </>
        )}
        <P>
          If your finance team needs particular details on an invoice, ask before we issue it
          rather than after — reissuing is easy, but not once it is in your accounts.
        </P>
      </Section>

      <Section number="8" title="Disputes and chargebacks">
        <P>
          If an invoice looks wrong, tell us before it falls due and we will look at it. An
          invoice under genuine dispute is not treated as late while we are dealing with it.
        </P>
        <P>
          Please do not raise a chargeback without contacting us first. A chargeback opened
          cold costs us a fee whether or not it succeeds, and it may lead us to suspend a
          licence or a service while the bank works through it — which is worse for you than
          an email would have been.
        </P>
        <P>
          If we cannot settle a dispute about an invoice between us, it goes the way every
          other dispute does: section 17 of the{' '}
          <a href="/terms" className={linkClasses}>
            terms of service
          </a>{' '}
          sends it to arbitration in {ARBITRATION_SEAT}.
        </P>
      </Section>

      <Section number="9" title="Records and questions">
        <P>
          We keep invoices and payment records for as long as we keep our accounting records
          for the work they relate to. What that means for personal information in them is set
          out in section 9 of the{' '}
          <a href="/privacy" className={linkClasses}>
            privacy policy
          </a>
          .
        </P>
        <P>
          Anything about an invoice, a payment or a renewal goes to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>
          .
        </P>
      </Section>
    </LegalLayout>
  );
}
