import React from 'react';
import { AlertTriangle } from 'lucide-react';
import LegalLayout, { Section, P, List, Item } from '../../components/legal/LegalLayout';
import SubprocessorTable from '../../components/legal/SubprocessorTable';
import { IdentityLine } from '../../components/legal/LegalIdentity';
import { SUBPROCESSORS, SELF_HOSTED, HAS_UNCONFIRMED } from '../../content/subprocessors';
import { STUDIO_NAME, CONTACT_EMAIL, JURISDICTION } from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

export default function DpaPage() {
  return (
    <LegalLayout
      current="/dpa"
      title="Data Processing Addendum"
      summary={`The terms on which ${STUDIO_NAME} handles personal information belonging to a client's own users, for clients who need that written down.`}
    >
      {HAS_UNCONFIRMED && (
        <div className="border border-amber-500/30 bg-amber-500/[0.05] p-5 mb-10 flex items-start gap-3">
          <AlertTriangle size={16} strokeWidth={1.5} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-200/80 font-normal leading-relaxed">
            This document is not finished. The list of subprocessors in section 6 still has
            entries nobody has confirmed, and until it is complete this addendum should not
            be offered to a client as ready to sign. Write to{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>{' '}
            and we will send you the current position in writing.
          </p>
        </div>
      )}

      <Section number="1" title="What this document is, and when it applies">
        <P>
          Most of what we do never touches your users&rsquo; personal information. Where it
          does — an application with accounts, a database we can reach, a server we
          maintain, a system we host and run for you — you decide what happens to that
          information and we act on your instructions. It stays yours to answer for, and we
          only ever touch it to do the job you gave us.
        </P>
        <P>
          This document writes that arrangement down, so that neither of us is working from
          an assumption about it. It applies automatically to any project where we handle
          personal information on your behalf, and it forms part of our agreement with you
          alongside the{' '}
          <a href="/terms" className={linkClasses}>
            terms of service
          </a>
          . It changes nothing about work where we never see such information.
        </P>
        <P>
          It matters most under the Hosted model, where the system runs on our infrastructure
          rather than yours and we are handling your users&rsquo; data continuously rather
          than in passing. It applies just the same to a licensed or transferred project we
          still maintain — how the software was sold changes nothing about who is responsible
          for the data inside it.
        </P>
      </Section>

      <Section number="2" title="Who the parties are">
        <P>
          &ldquo;We&rdquo; and &ldquo;us&rdquo; means <IdentityLine />.
          &ldquo;You&rdquo; means the client we are doing the work for.
        </P>
        <P>
          &ldquo;Personal data&rdquo; means information about an identifiable person.
          &ldquo;Your users&rdquo; means the people that information is about — your
          customers, your members, your players, whoever the system is for. Where this
          document says we &ldquo;handle&rdquo; it, that covers everything from reading it
          once to running the database it lives in.
        </P>
      </Section>

      <Section number="3" title="What we do with it, and on whose say-so">
        <P>
          We process personal data only to deliver what you have engaged us to deliver, and
          only on your documented instructions. Your instructions are this document, the
          agreed scope of work, and anything else you tell us in writing afterwards.
        </P>
        <P>
          We will not use your users&rsquo; personal data for our own purposes. We will not
          sell it, mine it, use it to train anything, or use it to improve our own products.
          If we ever think an instruction of yours would be bad for the people the data is
          about, we will say so rather than quietly carry it out.
        </P>
        <P>
          If we ever have to do something with it that your instructions do not cover, we
          will tell you before we do it.
        </P>
      </Section>

      <Section number="4" title="What is actually being processed">
        <P>
          This varies per project, so it is agreed per project rather than guessed at here.
          Before work starts that involves personal data, we will record in writing:
        </P>
        <List>
          <Item>the subject matter and the purpose of the processing;</Item>
          <Item>how long it will go on for;</Item>
          <Item>the types of personal data involved;</Item>
          <Item>the categories of people the data is about;</Item>
          <Item>anything special about it — health, financial, children&rsquo;s data.</Item>
        </List>
        <P>
          In practice, for the work we usually take on, that means account details such as
          names, email addresses and hashed passwords; whatever your users put into the
          system themselves; and technical records such as IP addresses and logs. Where a
          project involves more than that, it is written down before it starts.
        </P>
      </Section>

      <Section number="5" title="Confidentiality">
        <P>
          Access is limited to the people here who need it to do the work. Everyone with
          access is bound to keep it confidential, and that duty outlasts the project.
        </P>
        <P>
          We ask for the least access that lets us do the job. Where a task can be done
          against test data rather than real records, we would rather do it that way, and
          we will tell you when live access is genuinely needed.
        </P>
      </Section>

      <Section number="6" title="Other companies we rely on">
        <P>
          Delivering software means using infrastructure we do not own. You authorise us to
          use the subprocessors listed below. Each of them is bound by terms no weaker than
          these, and we remain responsible to you for what they do.
        </P>
        <SubprocessorTable entries={SUBPROCESSORS} />
        <P>
          Before we add or replace one, we will tell you. If you object for a reason to do
          with your users&rsquo; data, tell us within thirty days and we will either propose
          an alternative or, where there is none, let you end the affected part of the work
          without penalty.
        </P>
        <P>
          The same list is published on its own at{' '}
          <a href="/subprocessors" className={linkClasses}>
            /subprocessors
          </a>
          , which is the address to watch if you want to see it change. Both are rendered
          from one file, so they cannot disagree.
        </P>
      </Section>

      <Section number="7" title="The software your data sits in">
        <P>
          Separate from the list above, and worth stating because the question behind it is
          a fair one. These are the databases we run for client projects. They are software
          rather than companies: they run on the servers named above, nothing is sent to
          anybody by our using them, and there is no third party here for you to authorise
          or object to.
        </P>
        <P>
          The same goes for diagnostics. We use no third-party error tracking or logging
          service — when something breaks, the logs are read on the server they were written
          on. Error reports routinely contain request data and user identifiers, so this is
          worth saying rather than leaving you to assume it.
        </P>
        <SubprocessorTable entries={SELF_HOSTED} />
        <P>
          If a project ever moves onto a managed version of one of these — a hosted cluster
          run by somebody else rather than a database on our own machine — that company
          becomes a subprocessor and moves into section 6, and you will be told before it
          happens rather than after.
        </P>
      </Section>

      <Section number="8" title="Security">
        <P>
          We take appropriate technical and organisational measures to protect personal data,
          judged against the risk. In practice that means:
        </P>
        <List>
          <Item>encryption in transit, and at rest where the platform provides it;</Item>
          <Item>access limited to named people, removed when it is no longer needed;</Item>
          <Item>separate credentials for development and live systems;</Item>
          <Item>secrets kept out of source control;</Item>
          <Item>dependencies kept current, and security updates applied;</Item>
          <Item>backups where the project calls for them, and restores tested rather than assumed.</Item>
        </List>
        <P>
          These are the measures we apply as standard. Where your own security requirements
          go further, they are agreed as part of the scope rather than assumed on either
          side.
        </P>
      </Section>

      <Section number="9" title="When something goes wrong">
        <P>
          If we become aware of a personal data breach affecting your data, we will tell you
          without undue delay. We will give you what we know — what happened, who is
          affected, what the likely consequences are, and what we are doing about it — and
          keep telling you as we learn more, rather than waiting until we have a complete
          picture.
        </P>
        <P>
          Telling the people affected, and anybody else you decide needs to know, is your
          call to make rather than ours. We will give you what you need to make it, quickly
          enough to be useful — a decision like that is usually made against a clock.
        </P>
      </Section>

      <Section number="10" title="Helping you answer to your own users">
        <P>
          Some of what you owe your users, only we can actually deliver, because the data
          sits in a system we built. We will help, at your cost where the work is
          substantial:
        </P>
        <List>
          <Item>
            when one of your users asks for a copy of their data, asks for it corrected or
            deleted, asks for it in a portable form, or objects to what is being done with
            it, and it sits in a system we built or maintain;
          </Item>
          <Item>when you are working out what a change to that system would mean for them;</Item>
          <Item>when somebody asks you a question about it that you need us to answer.</Item>
        </List>
        <P>
          If one of your users contacts us directly, we will not answer them on your behalf.
          We will pass the request to you and tell them we have done so.
        </P>
      </Section>

      <Section number="11" title="Where the data physically sits">
        <P>
          We are based in {JURISDICTION}, and the servers your project runs on are in
          Germany. Your users&rsquo; data stays on those servers.
        </P>
        <P>
          The exception is Discord, which is in the United States. What reaches it is
          enquiries and estimates sent from our own website — never anything from inside a
          client&rsquo;s system. If a future subprocessor would sit outside Europe, we will
          tell you which one and where before it happens, so that you can decide rather than
          discover.
        </P>
        <P>
          Where you require a project to stay within a particular region, say so before the
          work is scoped. It is usually straightforward to arrange at the start and
          expensive to arrange afterwards.
        </P>
      </Section>

      <Section number="12" title="What happens at the end">
        <P>
          When the work finishes, you choose: we return the personal data to you, or we
          delete it. Tell us which within thirty days of the end. If you tell us nothing, we
          delete it.
        </P>
        <P>
          Deletion covers our own copies, including backups, on our ordinary backup cycle.
          Where something has to stay in our own accounting records, we keep only that part,
          only for as long as those records are kept, and it stays covered by this document
          the whole time we hold it.
        </P>
        <P>
          Systems hosted on infrastructure you own are yours already, and nothing here gives
          us a copy of them or a reason to keep one.
        </P>
      </Section>

      <Section number="13" title="Showing you we are doing this">
        <P>
          On reasonable notice, we will give you the information you need to show that we are
          meeting this document, and allow an audit you carry out or appoint someone to carry
          out. Audits happen in working hours, no more than once a year unless a breach makes
          another one necessary, and without disrupting our work for other clients.
        </P>
        <P>
          If your organisation has its own data processing agreement it would rather use,
          send it to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>
          . Signing yours instead of ours is normal and we would rather do that than argue
          about paperwork while a project waits.
        </P>
      </Section>

      <Section number="14" title="How this fits with everything else">
        <P>
          Where this document and our{' '}
          <a href="/terms" className={linkClasses}>
            terms of service
          </a>{' '}
          disagree about personal data, this document wins. On everything else, the terms
          win.
        </P>
        <P>
          Our{' '}
          <a href="/privacy" className={linkClasses}>
            privacy policy
          </a>{' '}
          is a different thing and covers a different relationship: what we do with
          information about <em>you</em>, as a visitor to this site or as a client. This
          document is about information about <em>your users</em>, which we only ever touch
          on your behalf.
        </P>
      </Section>

      <Section number="15" title="Changes">
        <P>
          We update this when what we actually do changes. Changes that reduce your
          protection will not apply to a project already underway without your agreement in
          writing. The date at the top shows when it was last revised.
        </P>
      </Section>
    </LegalLayout>
  );
}
