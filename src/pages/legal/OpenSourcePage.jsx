import React from 'react';
import LegalLayout, { Section, P } from '../../components/legal/LegalLayout';
import { OPEN_SOURCE, FONTS } from '../../content/openSource';
import { STUDIO_NAME, CONTACT_EMAIL } from '../../siteConfig';

const linkClasses =
  'text-neutral-200 underline underline-offset-4 hover:text-white transition-colors';

function LicenceTable({ entries }) {
  return (
    <div className="border border-[#282832] mt-2">
      {entries.map((entry, index) => (
        <div
          key={entry.name}
          className={`p-5 bg-[#0a0a0d] flex flex-col gap-2 ${
            index > 0 ? 'border-t border-[#1c1c22]' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium text-white leading-snug">
              {entry.name}
              {entry.version && (
                <span className="text-muted font-normal"> {entry.version}</span>
              )}
            </span>
            <span className="shrink-0 font-tech text-[11px] text-muted">
              {entry.licence}
            </span>
          </div>
          <p className="text-sm text-neutral-400 font-normal leading-relaxed">
            {entry.purpose}
          </p>
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer noopener"
            className="font-tech text-[11px] text-muted hover:text-neutral-300 transition-colors break-all"
          >
            {entry.url}
          </a>
        </div>
      ))}
    </div>
  );
}

export default function OpenSourcePage() {
  return (
    <LegalLayout
      current="/open-source"
      title="Open Source Licences"
      summary={`The third-party code and typefaces this website ships to your browser, and the licences they come under.`}
    >
      <Section number="1" title="Why this page exists">
        <P>
          This site is built on other people&rsquo;s work. Nearly every licence that work
          comes under asks for the same thing in return — that the notice travels with the
          code — and a site that ships a bundle without saying what is in it has quietly
          failed to do that.
        </P>
        <P>
          So this is the list. It covers the code that reaches your browser when you open
          this website. It does not cover the tools used to build it, which never leave our
          machines.
        </P>
      </Section>

      <Section number="2" title="Libraries">
        <P>
          Each of these is used unmodified, at roughly the version shown. Where a licence
          requires the full text and copyright notice, they are included in the source of the
          package linked below rather than reproduced here.
        </P>
        <LicenceTable entries={OPEN_SOURCE} />
      </Section>

      <Section number="3" title="Typefaces">
        <P>
          These files are served from this site rather than requested from Google as a page
          loads, so opening a page here tells Google nothing. The Open Font License is what
          allows us to redistribute them that way: it permits it as long as the licence
          travels with the files and they are not sold on their own, and neither is
          something we do.
        </P>
        <P>
          The reason for serving them ourselves is a privacy one rather than a licensing
          one, and our{' '}
          <a href="/privacy" className={linkClasses}>
            privacy policy
          </a>{' '}
          explains it in section 6.
        </P>
        <LicenceTable entries={FONTS} />
      </Section>

      <Section number="4" title="Open source in projects we build">
        <P>
          A project we build for you will have its own dependencies, and its own notices file
          generated from them. That file is part of your handover and it is yours to keep
          accurate as the project changes.
        </P>
        <P>
          We only use components under licences that permit commercial use. We will not put a
          copyleft licence into a client project — one that would require you to publish your
          own source — without telling you first and getting your agreement, because that is
          a decision about your business rather than a technical detail.
        </P>
        <P>
          Ask and we will tell you exactly what is in your project and under what terms.
          Under the{' '}
          <a href="/eula" className={linkClasses}>
            end user licence
          </a>{' '}
          those third-party components keep their own terms, and where those conflict with
          ours, theirs win for that component.
        </P>
      </Section>

      <Section number="5" title="Our own code">
        <P>
          Nothing on this page grants you any rights over the work {STUDIO_NAME} wrote. This
          site, the projects we build and the products we publish are ours or our
          clients&rsquo;, on the terms set out in the{' '}
          <a href="/terms" className={linkClasses}>
            terms of service
          </a>{' '}
          and the{' '}
          <a href="/eula" className={linkClasses}>
            end user licence
          </a>
          .
        </P>
      </Section>

      <Section number="6" title="Corrections">
        <P>
          If we have credited something wrongly, missed a notice, or named the wrong licence,
          tell us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClasses}>
            {CONTACT_EMAIL}
          </a>{' '}
          and we will correct it. This page is trivially checkable against the bundle we
          serve, and we would rather you found an error than assumed there were none.
        </P>
      </Section>
    </LegalLayout>
  );
}
