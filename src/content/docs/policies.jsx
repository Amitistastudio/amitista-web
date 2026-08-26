import React from 'react';
import { H2, P, UL, LI, Code, Note, Table, A } from '../../components/docs/prose';

export const DOC_BODIES = {
  'policies': () => (
    <>
      <P>
        There are fourteen documents on this site. Nobody is expected to read all of them,
        and you do not have to — most people arrive with one question, and this page is here
        so you can find the document that answers it without reading the other thirteen.
      </P>
      <H2 id="agreements">What you agreed to</H2>
      <UL>
        <LI>
          <A href="/terms">Terms of Service</A> — what we agreed to build, how it is handed
          over, and what happens when the scope changes.
        </LI>
        <LI>
          <A href="/eula">EULA</A> — what you may do with software we licensed to you rather
          than sold you outright.
        </LI>
        <LI>
          <A href="/billing">Billing Policy</A> — what a price includes, when you are
          invoiced, and what happens if payment is late.
        </LI>
        <LI>
          <A href="/refund">Refund Policy</A> — when money comes back.
        </LI>
        <LI>
          <A href="/dpa">Data Processing Addendum</A> — what we may do with personal
          information belonging to your users, and on whose instruction.
        </LI>
      </UL>
      <H2 id="rules">Rules while we work together</H2>
      <UL>
        <LI>
          <A href="/acceptable-use">Acceptable Use</A> — what our work and our servers may
          not be used for.
        </LI>
        <LI>
          <A href="/content-moderation">Content Moderation</A> — what we remove from a
          service we host, who decides, and how to challenge it.
        </LI>
        <LI>
          <A href="/copyright">Copyright Complaints</A> — reporting copied work, or answering
          a complaint about yours.
        </LI>
        <LI>
          <A href="/security">Vulnerability Disclosure</A> — how to report a security hole
          found in something we built.
        </LI>
      </UL>
      <H2 id="disclosures">What we disclose</H2>
      <UL>
        <LI>
          <A href="/privacy">Privacy Policy</A> — what this website collects about you and
          how long it is kept.
        </LI>
        <LI>
          <A href="/cookies">Cookie Policy</A> — whether anything is stored in your browser.
          Short, because we set no cookies.
        </LI>
        <LI>
          <A href="/subprocessors">Subprocessors</A> — every company that can reach your
          data, by name, and the database software we run ourselves.
        </LI>
        <LI>
          <A href="/accessibility">Accessibility</A> — what we aim at, what is in place, and
          what does not work yet.
        </LI>
        <LI>
          <A href="/open-source">Open Source Licences</A> — whose code is in what we shipped
          you, and under what licence.
        </LI>
      </UL>
      <H2 id="which-apply">Not all of them apply to you</H2>
      <P>
        Which ones do depends on how the project was handed over. Section 3 of the terms
        sets out the three models; this is the short version of what each one pulls in.
      </P>
      <Table
        head={['Delivery model', 'What it means for the documents']}
        rows={[
          [
            'Transfer',
            'You own the result outright. The terms, billing and refund policies apply. The EULA does not — nothing is being licensed to you. The addendum applies only for as long as we still maintain the system.',
          ],
          [
            'Licence',
            'You have the right to use it, we keep the source unless your order says otherwise. The EULA is the document that sets out what you may do with it.',
          ],
          [
            'Hosted',
            'It runs on our infrastructure. Everything above applies, and the addendum, acceptable use and content moderation policies matter most here — they are the ones about a live system with your users in it.',
          ],
        ]}
      />
      <H2 id="changes">When a document changes</H2>
      <P>
        Every one of them carries the date it was last updated at the top. Where a change
        would affect something you are relying on — an invoice, or a new company able to
        reach your data — we tell you before it happens rather than after. The subprocessor
        list is the one worth watching if you only watch one; it is at{' '}
        <A href="/subprocessors">/subprocessors</A> and it changes when a vendor does.
      </P>
      <Note title="These docs are not the agreement">
        <p>
          Everything under <Code>/docs</Code> describes how we work in practice. Where a page
          here and one of the documents above disagree, the document is the one you agreed
          to, and it wins. Tell us when you spot a difference — it means a page here is out
          of date.
        </p>
      </Note>
    </>
  ),
  'your-users-data': () => (
    <>
      <P>
        Most of what we build never touches your users&rsquo; personal information. When it
        does — accounts, a database we can reach, a system we host — the split is simple:
        the data is yours, the decisions about it are yours, and we act on your instructions.
        The <A href="/dpa">Data Processing Addendum</A> is that arrangement written down. This
        page is what it means day to day.
      </P>
      <H2 id="when">When it applies</H2>
      <P>
        Automatically, on any project where we handle personal information for you. It
        matters most under the Hosted model, where we are running the system continuously.
        It applies just the same to a project you own outright that we still maintain — how
        the software was sold changes nothing about who answers for the data inside it.
      </P>
      <H2 id="where">Where the data sits</H2>
      <UL>
        <LI>
          On servers in Frankfurt, Germany. It stays there. If a project has to stay in a
          particular region, say so before the work is scoped — it is straightforward to
          arrange at the start and expensive to arrange later.
        </LI>
        <LI>
          The companies that can reach it are listed by name at{' '}
          <A href="/subprocessors">/subprocessors</A>, with what each one does and where it
          is. Before we add or replace one we tell you, and you have thirty days to object.
        </LI>
        <LI>
          Discord is on that list, and it is the one outside Europe. What reaches it is
          enquiries sent from <em>our</em> website — never anything from inside your system.
        </LI>
        <LI>
          The databases themselves — MySQL, MongoDB — run on those same servers. They are
          software we operate rather than companies holding your data, which is why they are
          listed separately.
        </LI>
      </UL>
      <H2 id="user-requests">When one of your users asks about their data</H2>
      <P>
        They should ask you, not us: it is your relationship and your call. If one of them
        writes to us directly we will not answer on your behalf — we pass the request to you
        and tell them we have.
      </P>
      <P>
        Where the answer needs someone to go into a system we built, we help. Pulling a copy
        of somebody&rsquo;s records, correcting them, deleting them, or exporting them in a
        form you can hand over is work we can do and you usually cannot; where it is
        substantial it is quoted like any other change — see{' '}
        <A href="/docs/change-requests">Requesting a change</A>.
      </P>
      <H2 id="incidents">If something goes wrong</H2>
      <P>
        If we become aware of a breach affecting your data we tell you without waiting for a
        complete picture, and keep telling you as we learn more. Deciding who else needs to
        know — your users, anyone else — is yours to make, and our job is to get you what you
        need to make it while it is still useful.
      </P>
      <P>
        Going the other way: if you think something has happened, rotate credentials first
        and then tell us, and do not wipe and redeploy before anyone has looked at the logs.
        The same advice as <A href="/docs/security">Security</A>, for the same reason.
      </P>
      <H2 id="ending">When the work ends</H2>
      <P>
        You choose: we return the data to you, or we delete it. Tell us which within thirty
        days of the end. Say nothing and we delete it, which is the safer default but rarely
        the one anybody actually wants — so it is worth a single email at the time.
      </P>
      <Note title="If you have your own paperwork">
        <p>
          Plenty of organisations have a data processing agreement of their own they would
          rather use. Send it over and we will look at signing yours instead of ours. That is
          normal, and better than a project waiting while two documents are compared.
        </p>
      </Note>
    </>
  ),
  'complaints': () => (
    <>
      <P>
        This applies to services we host for you where people can publish things others see —
        a game server, a community platform, anything with user accounts and a submit button.
        If we built it and handed it over to run on your own infrastructure, moderating it is
        yours entirely; we have no access with which to do it.
      </P>
      <H2 id="who-decides">Who decides what</H2>
      <P>
        You set the rules for your own community and you moderate it. We are the hosting
        provider underneath, and we act on content directly only where it breaks the{' '}
        <A href="/acceptable-use">Acceptable Use Policy</A> — not because we would have run
        your service differently.
      </P>
      <P>
        That line is deliberate and we would rather not blur it. A host that starts making
        editorial decisions about a client&rsquo;s community is a worse host, and one you
        cannot predict is not something you can build on.
      </P>
      <H2 id="reporting">Reporting something to us</H2>
      <P>
        Email is fine, or a message to a moderator on Discord, which is faster. Send a link
        or an address and what you think is wrong with it. You do not need an account, a
        relationship with us, or certainty. We confirm we received it, and tell you what we
        decided once we have.
      </P>
      <UL>
        <LI>
          A person reads every report. There is no automated moderation on anything we run.
        </LI>
        <LI>
          We aim to look within two working days, faster where somebody is being harmed now.
        </LI>
        <LI>
          We act as narrowly as the problem allows — one post rather than an account, telling
          you rather than taking a service down. Suspension is the last option, not the first.
        </LI>
        <LI>
          We do not read client databases looking for things to act on. Being told is how we
          find out, which is the trade for not being watched.
        </LI>
      </UL>
      <H2 id="copyright">Copyright is a separate process</H2>
      <P>
        A complaint that something is copied goes through the{' '}
        <A href="/copyright">Copyright Complaints</A> process instead, because it has
        something the others do not: a right of reply. Whoever published the thing gets told
        what was claimed and can answer it before the matter is settled. If a complaint
        arrives about your content, that reply is yours to write and it is worth writing.
      </P>
      <H2 id="if-we-act">If we act on something of yours</H2>
      <P>
        We tell you what we removed or restricted, which part of the policy it fell under,
        and how to challenge it. To challenge it, reply and say why you think we were wrong —
        someone looks again, and where we got it wrong we put it back and say so. Using that
        process gives nothing up.
      </P>
      <Note title="What to have ready before you write">
        <p>
          The address or link, roughly when you saw it, and what is wrong with it. If you are
          reporting something about yourself — your image, your data, your work — say so.
          It changes how quickly it gets looked at.
        </p>
      </Note>
    </>
  ),
};
