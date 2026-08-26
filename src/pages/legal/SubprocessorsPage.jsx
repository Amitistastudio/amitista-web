import React from 'react';
import { AlertTriangle } from 'lucide-react';
import LegalLayout, { Section, P } from '../../components/legal/LegalLayout';
import SubprocessorTable from '../../components/legal/SubprocessorTable';
import { SUBPROCESSORS, SELF_HOSTED, HAS_UNCONFIRMED } from '../../content/subprocessors';
import { STUDIO_NAME, CONTACT_EMAIL } from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

export default function SubprocessorsPage() {
  return (
    <LegalLayout
      current="/subprocessors"
      title="Subprocessors"
      summary={`Every company that may handle a client's data when ${STUDIO_NAME} works for them, and the software we run ourselves.`}
    >
      {HAS_UNCONFIRMED && (
        <div className="border border-amber-500/30 bg-amber-500/[0.05] p-5 mb-10 flex items-start gap-3">
          <AlertTriangle size={16} strokeWidth={1.5} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-200/80 font-normal leading-relaxed">
            This list is not finished. Some entries below have not been confirmed, and until
            they are it should not be relied on as a complete statement of who handles your
            data. Write to{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>{' '}
            and we will send you the current position in writing.
          </p>
        </div>
      )}

      <Section number="1" title="What this page is">
        <P>
          When we handle personal information belonging to your users, we do it on your
          instructions and it stays yours to answer for. We will not put it through a company
          you have not agreed to — which only means anything if the companies are named
          rather than described, so here they are named.
        </P>
        <P>
          These are those companies. A client who signs our{' '}
          <a href="/dpa" className={linkClasses}>
            data processing addendum
          </a>{' '}
          is agreeing to the names below, which means a company missing from this page is
          one we are not entitled to put your data through.
        </P>
      </Section>

      <Section number="2" title="Companies that may handle your data">
        <P>
          Each is bound by terms no weaker than the ones we give you, and we stay
          responsible to you for what they do with it.
        </P>
        <SubprocessorTable entries={SUBPROCESSORS} />
      </Section>

      <Section number="3" title="Software we run ourselves">
        <P>
          Separate from the list above, and worth stating because the question behind it is
          a fair one. These are the databases client projects sit in. They are software
          rather than companies: they run on the servers already named above, nothing is
          sent to anybody by our using them, and there is no third party here for you to
          authorise or object to.
        </P>
        <SubprocessorTable entries={SELF_HOSTED} />
        <P>
          If a project ever moves onto a managed version of one of these — a hosted cluster
          somebody else runs rather than a database on our own machine — that company
          becomes a subprocessor and moves into the list above, and you will be told before
          it happens rather than after.
        </P>
        <P>
          The same goes for diagnostics. There is no third-party error tracking or logging
          service here, so there is no entry for one: when something breaks, the logs are
          read on the server they were written on. Error reports routinely carry request
          data and user identifiers, so this is worth saying rather than leaving you to
          assume it.
        </P>
      </Section>

      <Section number="4" title="When this list changes">
        <P>
          Before we add or replace a subprocessor, we will tell you. If you object for a
          reason to do with your users&rsquo; data, tell us within thirty days and we will
          either propose an alternative or, where there is none, let you end the affected
          part of the work without penalty.
        </P>
        <P>
          This page carries the same last-updated date as the rest of our legal documents,
          shown at the top. If you need to be told in writing rather than watch a page,
          say so and we will add you to the notice list.
        </P>
      </Section>

      <Section number="5" title="Questions">
        <P>
          If you need any of this in a different form — a signed copy, your own addendum
          instead of ours, or detail on a particular entry — write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>
          . Being asked for it is normal and we would rather answer than have you guess.
        </P>
      </Section>
    </LegalLayout>
  );
}
