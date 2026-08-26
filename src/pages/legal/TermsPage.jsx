import React from 'react';
import LegalLayout, { Section, P, List, Item } from '../../components/legal/LegalLayout';
import DeliveryModelTable from '../../components/legal/DeliveryModelTable';
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

export default function TermsPage() {
  return (
    <LegalLayout
      current="/terms"
      title="Terms of Service"
      updated="25 August 2026"
      summary={`The terms that apply when you commission work from ${STUDIO_NAME} or use this website.`}
    >
      <Section number="1" title="Who we are">
        <P>
          <IdentityLine /> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, the &ldquo;Studio&rdquo;) is a
          development studio building websites, applications, interfaces and game server
          projects. These terms apply to this website and to any work you commission from
          us, unless we have signed a separate contract with you that says otherwise.
        </P>
        <P>
          You can reach us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>
          , and that address reaches a person rather than a queue.
        </P>
      </Section>

      <Section number="2" title="Quotes and scope">
        <P>
          We quote against a written scope. A quote is an offer to do the work described in
          it, and is valid for thirty days unless we state otherwise. Work begins once you
          accept the quote in writing and any deposit has been paid.
        </P>
        <P>
          Anything not listed in the agreed scope is not included. That is not us being
          difficult: it is what keeps the price you were quoted the price you pay.
        </P>
      </Section>

      <Section number="3" title="How the work is delivered">
        <P>
          Not every client wants to own a codebase, and not every project is worth buying
          outright. Every project we take on is therefore delivered under one of three
          models, and your quote names which one applies before you accept it.
        </P>
        <DeliveryModelTable />
        <P>
          The model is a commercial choice rather than a measure of how much work we do. The
          same project built to the same standard costs less under Licence or Hosted than
          under Transfer, because under those two you are paying for the use of the work and
          we keep the asset.
        </P>
        <P>
          You can move up later. A licensed or hosted project can be converted to a transfer
          at any time for the difference in price, and we will quote that on request. It does
          not run the other way: once ownership has passed to you under section 9 we cannot
          take it back, and we will not ask you to.
        </P>
        <P>
          If a quote does not name a model, the project is a Licence. That default exists so
          that an omission is never read as a transfer of ownership nobody intended, and it
          is the one that can still be corrected afterwards.
        </P>
      </Section>

      <Section number="4" title="Changes to scope">
        <P>
          You can ask for changes at any point. We will tell you what the change does to the
          price and the timeline before we act on it, and we will only proceed once you
          confirm. Changes that materially expand the work are quoted separately.
        </P>
      </Section>

      <Section number="5" title="Payment">
        <P>
          Unless agreed otherwise in writing, projects are invoiced with a deposit before
          work starts and the balance on completion. Larger projects may be split into
          milestones, each invoiced as it is reached.
        </P>
        <P>
          Where your project is hosted by us, or carries a recurring licence fee, that fee is
          invoiced for the agreed period in advance and separately from the project fee. It
          continues until the arrangement ends under section 11 or section 13.
        </P>
        <P>
          Invoices are payable within fourteen days. We may pause work on a project with an
          overdue invoice, and we may charge interest on late payment.
        </P>
        <P>
          Prices are quoted before tax. Where a tax or duty applies to what you are buying, it
          is added and shown separately on the invoice.
        </P>
      </Section>

      <Section number="6" title="What we need from you">
        <P>Projects stall for predictable reasons. To avoid them, you agree to:</P>
        <List>
          <Item>
            give us the content, assets, credentials and access the work needs, and the right
            to use them;
          </Item>
          <Item>respond to questions and review requests within a reasonable time;</Item>
          <Item>
            nominate one person who can make decisions and sign work off on your behalf;
          </Item>
          <Item>
            make sure anything you supply does not infringe anyone else&rsquo;s rights.
          </Item>
        </List>
        <P>
          Where a delay is caused by material or feedback we are waiting on, the timeline
          moves accordingly.
        </P>
      </Section>

      <Section number="7" title="Delivery and acceptance">
        <P>
          Timelines we give are estimates made in good faith, not guarantees, and they assume
          the cooperation described above. We will tell you as soon as we know if a date is
          at risk.
        </P>
        <P>
          On delivery you have fourteen days to review the work and report anything that does
          not match the agreed scope. We will correct anything that does not. If we hear
          nothing in that period, or the work is put into live use, it is treated as accepted.
        </P>
        <P>
          Under the Hosted model there is nothing to hand over, so delivery means the point
          at which we give you access to the running system, and the same fourteen days run
          from there.
        </P>
      </Section>

      <Section number="8" title="Revisions">
        <P>
          Revisions within the agreed scope are included. Reworking something already signed
          off, or changing direction after approval, is new work and is quoted as such.
        </P>
      </Section>

      <Section number="9" title="Intellectual property">
        <P>
          What happens to ownership depends on the model named in your quote, and the table
          in section 3 is the short version of this section.
        </P>
        <P>
          <span className="text-neutral-200">Under Transfer</span>, ownership of the bespoke
          work we produce for you passes to you once we have been paid in full. Until then it
          remains ours.
        </P>
        <P>
          <span className="text-neutral-200">Under Licence and Hosted</span>, ownership stays
          with us and you receive a right to use the software instead. What that right covers
          — the purpose, the systems it may run on, the term, and whether you receive the
          source at all — is set by your order and governed by our{' '}
          <a href="/eula" className={linkClasses}>
            End User License Agreement
          </a>
          . You are buying the use of the work rather than the work itself, and the price
          reflects that.
        </P>
        <P>
          Under every model we keep ownership of our pre-existing tools, libraries,
          frameworks and components, and of anything we develop for general use. Where those
          form part of your project you get a licence to use them as part of it, on the terms
          of the same agreement. A transfer of the bespoke work does not carry them with it,
          because they are not yours to receive — they are in other clients&rsquo; projects
          too.
        </P>
        <P>
          Whichever model applies, the content, data and material you gave us remain yours
          throughout, and nothing here gives us rights over them beyond doing the work.
        </P>
      </Section>

      <Section number="10" title="Showing the work">
        <P>
          Unless you tell us otherwise, we may show the work we did for you and describe you
          as a client — in the showcase on this website, in a case study, in a proposal to
          somebody else, in a talk, or anywhere else we are asked what we have built. That
          includes using your name and logo to say whose project it was.
        </P>
        <P>
          The same right belongs to the people who actually built it, for their own personal
          portfolios and professional profiles. We name the developers who work here rather
          than hiding behind a studio account, and a developer&rsquo;s portfolio is how they
          get their next job — so this is not a formality we would be willing to give up. It
          is subject to every limit below, exactly as ours is.
        </P>
        <P>
          Appearing in the studio showcase is a separate question, because it is curated
          rather than automatic. We select what goes in it, so a project being ours does not
          mean it will be there, and being left out is not a verdict on the work — it usually
          means we already have three things that look like it.
        </P>
        <P>What showing the work covers, and what it never covers:</P>
        <List>
          <Item>
            <span className="text-neutral-200">Fair game:</span> the finished, public-facing
            result — screens, visuals, video of it running, and an honest description of what
            the problem was, what we built and what it achieved.
          </Item>
          <Item>
            <span className="text-neutral-200">Never:</span> source code, credentials,
            architecture we were told to keep quiet, your internal documents, your commercial
            figures, anything you disclosed in confidence, and — without exception — your
            data or your users&rsquo; data. Section 12 governs all of that and this section
            does not cut across it.
          </Item>
        </List>
        <P>
          You can say no. Tell us at any point, before or after publication, and we will not
          publish it — or we will take it down if it is already up. You do not have to give a
          reason, we will not argue about it, and it does not cost anything. If you need the
          work kept quiet until you launch, or for a fixed period after, say so and we will
          hold it.
        </P>
        <P>
          Where you have a non-disclosure agreement with us, that agreement wins over this
          section in full. Nothing here permits us to publish anything it covers.
        </P>
      </Section>

      <Section number="11" title="Hosting and managed services">
        <P>
          This section applies where we host your project — the Hosted model, and any other
          arrangement where we run the software on infrastructure we control.
        </P>
        <P>
          We will keep the service running with reasonable skill and care, apply the updates
          it needs and keep backups, but we do not offer a guaranteed uptime figure unless
          your order states one. Where a service is interrupted we will restore it as quickly
          as we reasonably can and tell you what happened.
        </P>
        <P>
          The companies whose infrastructure is involved are named at{' '}
          <a href="/subprocessors" className={linkClasses}>
            /subprocessors
          </a>
          , and where the system holds personal data belonging to your users we act as your
          processor under our{' '}
          <a href="/dpa" className={linkClasses}>
            data processing addendum
          </a>
          . We may move the service to different infrastructure, and will tell you before we
          do where the change is one you would notice.
        </P>
        <P>
          The data inside a hosted system is yours, not ours. You can ask for an export at
          any time and we will provide it in a usable format at no charge.
        </P>
        <P>
          Either of us may end a hosting arrangement on thirty days&rsquo; written notice. We
          may suspend a hosted service where an invoice for it is more than thirty days
          overdue, where it is being used for something our{' '}
          <a href="/acceptable-use" className={linkClasses}>
            acceptable use policy
          </a>{' '}
          forbids, or where its continued operation threatens other systems on the same
          infrastructure — and except in the last case we will warn you first and give you a
          chance to put it right.
        </P>
        <P>
          When a hosting arrangement ends for any reason, we will give you a full export of
          your data before anything is deleted, and we will keep the service available for a
          reasonable handover period if you ask. Your right to use the software ends with the
          arrangement: the software was never delivered to you and does not become yours by
          having been hosted.
        </P>
      </Section>

      <Section number="12" title="Confidentiality">
        <P>
          Each of us will keep the other&rsquo;s non-public information confidential and use
          it only for the project. This does not cover information that is already public, or
          that we held before you disclosed it.
        </P>
      </Section>

      <Section number="13" title="Cancellation">
        <P>
          You may cancel a project in writing at any time. You still owe us for work
          completed up to that point and for any commitments we have made on your behalf.
          How that interacts with money already paid is set out in our{' '}
          <a href="/refund" className={linkClasses}>
            Refund Policy
          </a>
          .
        </P>
        <P>
          We may cancel a project if an invoice stays unpaid, if the working relationship
          breaks down, or if we are asked for something we{' '}
          <a href="/what-we-dont-take-on" className={linkClasses}>
            do not take on
          </a>
          . If we cancel for any other reason, we refund payments for work not yet done.
        </P>
        <P>
          Cancelling a project does not by itself end a licence or a hosting arrangement
          already in place, and ending one of those does not cancel work still in progress.
          Where you want both to end, say so and we will treat it as both.
        </P>
      </Section>

      <Section number="14" title="Third-party services">
        <P>
          Projects often depend on services we do not control, such as hosting, domains,
          payment providers and platform APIs. Those are governed by their own terms, they
          may charge their own fees, and we are not responsible for their availability or for
          changes they make.
        </P>
      </Section>

      <Section number="15" title="What we promise, and what we do not">
        <P>
          We will carry out the work with reasonable skill and care. That is the promise, and
          it is the whole of it: software is not guaranteed to be free of faults, and we do
          not promise that a project will produce any particular commercial result.
        </P>
        <P>
          If something we delivered does not do what we agreed it would, tell us and we will
          fix it. Putting the work right is the remedy — it is the one that actually helps,
          and in practice it resolves effectively everything. Where money comes back instead,
          our{' '}
          <a href="/refund" className={linkClasses}>
            refund policy
          </a>{' '}
          sets out when.
        </P>
        <P>
          What we put right is the work itself. Knock-on costs sit outside what we take on —
          lost sales, lost revenue, lost data, time a system was unavailable, or anything that
          followed on from one of those. The most we would ever put back on a project is what
          you paid us for it, and where a project is hosted or carries a recurring fee, that
          figure is what you paid us for it in the twelve months before.
        </P>
      </Section>

      <Section number="16" title="This website">
        <P>
          The content of this site is provided for information and may change without notice.
          The site, its design and its content belong to us. You may not copy or reuse them
          without permission.
        </P>
      </Section>

      <Section number="17" title="Governing law and disputes">
        <P>
          These terms, and any dispute arising out of them or out of any work we do for you,
          are governed by the laws of {JURISDICTION}, without regard to whichever
          conflict-of-law rules might otherwise point somewhere else.
        </P>
        <P>
          Before either of us starts anything formal, we each agree to put the problem in
          writing and give the other thirty days to fix it. Almost everything that reaches
          this section is a misunderstanding about scope, and thirty days and a plainly
          written email have settled every one of them so far.
        </P>
        <P>
          If that does not settle it, the dispute is referred to and finally settled by
          arbitration seated in {ARBITRATION_SEAT}, under the arbitration provisions of the
          Greek Code of Civil Procedure (articles 867 and following), before a single
          arbitrator, conducted in {ARBITRATION_LANGUAGE}. We appoint that arbitrator by
          agreement; if we cannot agree within fourteen days of one of us asking, the
          competent court appoints one under those same provisions.
        </P>
        <P>
          The arbitrator&rsquo;s award is final and binding on both of us, and either of us
          may have it enforced by any court with the power to do so. By accepting these terms
          you and we both give up the right to have such a dispute heard by a court instead.
        </P>
        <P>
          Each of us pays our own legal costs and we split the arbitrator&rsquo;s fee down
          the middle, unless the arbitrator decides that one side should carry more of it
          because of the way that side ran the case. The arbitration and its award stay
          confidential between us, except where one of us has to disclose them to enforce the
          award or because the law requires it.
        </P>
        <P>
          None of this stops either of us going straight to a court for an urgent injunction
          &mdash; to halt misuse of intellectual property under section 9, or a breach of
          confidence under section 12, while there is still something left to protect. Asking
          for that is not a breach of this section.
        </P>
        <P>
          Nothing in this section takes away a right that the law where you live gives you and
          does not allow you to sign away. Where such a rule applies it wins over this section
          as far as the two of them conflict, and the rest of this section carries on
          unaffected.
        </P>
      </Section>

      <Section number="18" title="Changes to these terms">
        <P>
          We may update these terms. The version that applies to your project is the one
          published when you accepted the quote. The date at the top of this page shows when
          it was last changed.
        </P>
        <P>
          Where you have an ongoing licence or hosting arrangement rather than a finished
          project, we will give you thirty days&rsquo; notice of a change that materially
          affects you, and you may end the arrangement within that period if you do not
          accept it.
        </P>
      </Section>

      <Section number="19" title="Contact">
        <P>
          Questions about these terms go to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>
          .
        </P>
      </Section>
    </LegalLayout>
  );
}
