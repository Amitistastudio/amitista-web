import React from 'react';
import { H2, P, UL, OL, LI, Code, Note, Table, A } from '../../components/docs/prose';
import DiscordMark from '../../components/DiscordMark';
import { CONTACT_EMAIL, DISCORD_INVITE } from '../../siteConfig';

export const DOC_BODIES = {
  'troubleshooting': () => (
    <>
      <P>
        A good proportion of the problems reported to us have an answer on this page. None
        of it takes more than a couple of minutes, and whatever you learn makes the report
        faster to act on if it turns out to be real.
      </P>
      <H2 id="first">Check these first</H2>
      <OL>
        <LI>Reload with the cache bypassed — <Code>Ctrl</Code>+<Code>Shift</Code>+<Code>R</Code>, or <Code>Cmd</Code>+<Code>Shift</Code>+<Code>R</Code> on a Mac.</LI>
        <LI>Try a different browser, and a phone on mobile data rather than your own network.</LI>
        <LI>Open the browser console and look for red errors — copying one into your email saves us a round trip.</LI>
        <LI>Check whether the last deploy succeeded in your host&rsquo;s dashboard.</LI>
        <LI>Check the status page of anything the site depends on.</LI>
      </OL>
      <H2 id="symptoms">Common symptoms</H2>
      <Table
        head={['What you see', 'Usually']}
        rows={[
          ['The site is fine for us but broken for a client', 'A cached old version on their machine, or an extension blocking something.'],
          ['404 when refreshing a page that is not the home page', 'The SPA fallback is missing on the host. See Deploying.'],
          ['An edit does not appear live', 'The build has not run, or ran on a different branch.'],
          ['Form says it sent, nothing arrives', 'Check spam, then the webhook or mail service. See Email and forms.'],
          ['Certificate warning', 'DNS was changed and the certificate has not reissued yet. Usually resolves within the hour.'],
          ['Everything is suddenly down', 'Host outage, expired domain, or a failed deploy. In that order of likelihood.'],
          ['Site loads slowly after months of being fine', 'Large images added to a page, or a new third-party script.'],
        ]}
      />
      <H2 id="build-fails">When a build fails</H2>
      <P>
        Read the first error, not the last — later ones are usually consequences. The most
        common causes after a client edit are an unescaped apostrophe in a piece of text, a
        missing comma between entries, and a file renamed but still imported under its old
        name.
      </P>
      <H2 id="escalate">When to stop and email us</H2>
      <P>
        Immediately, if the site is down, data may have been lost, or you think an account
        has been compromised. Do not redeploy over the top of a suspected security incident
        — see <A href="/docs/security">Security</A>. Otherwise, when you have run the checks
        above and it is still wrong.
      </P>
    </>
  ),
  'support': () => (
    <>
      <P>
        Email{' '}
        <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A> with what you found. The
        more of the following you include, the faster it gets fixed.
      </P>
      <H2 id="what-to-include">What to include</H2>
      <UL>
        <LI>The page or feature affected, with a link if you have one.</LI>
        <LI>What you expected to happen, and what happened instead.</LI>
        <LI>The steps that produce it, in order.</LI>
        <LI>A screenshot or screen recording.</LI>
        <LI>Your browser and device, and whether it happens on another one.</LI>
        <LI>Anything from <A href="/docs/troubleshooting">Troubleshooting</A> you have already ruled out.</LI>
      </UL>
      <H2 id="priority">How we prioritise</H2>
      <Table
        head={['Severity', 'Example', 'What we do']}
        rows={[
          ['Down', 'The site or server is unreachable', 'Dropped everything else, ahead of the queue'],
          ['Broken', 'Checkout fails, forms do not send, data is wrong', 'Same working day where we can'],
          ['Degraded', 'A layout breaks on one browser', 'Scheduled into the next batch of work'],
          ['Cosmetic', 'Spacing, wording, a slightly wrong shade', 'Batched with other changes'],
        ]}
      />
      <H2 id="what-happens">What happens next</H2>
      <OL>
        <LI>We confirm we have it and tell you whether it is a bug or a change request.</LI>
        <LI>
          A bug in work we delivered is fixed at no charge, in line with the{' '}
          <A href="/terms">Terms of Service</A>.
        </LI>
        <LI>
          A change to agreed scope is quoted first, and we only start once you approve it —
          see <A href="/docs/change-requests">Requesting a change</A>.
        </LI>
      </OL>
      <P>
        Response times are whatever your contract or support agreement sets out. If you do
        not have one, we answer as soon as we reasonably can.
      </P>
      <H2 id="channels">Where to write</H2>
      <P>
        Email is the record, and it is what we work from.{' '}
        {DISCORD_INVITE ? (
          <>
            Our{' '}
            <DiscordMark size={14} className="inline-block align-[-0.15em] mr-1" />
            <A href={DISCORD_INVITE}>Discord</A> is good for quick questions, but put
            anything that needs tracking in an email as well.
          </>
        ) : (
          <>Put anything that needs tracking in an email rather than a chat message.</>
        )}
      </P>
      <Note title="If the site is down">
        <p>
          Say so in the subject line. Outages jump the queue ahead of everything else.
        </p>
      </Note>
    </>
  ),
  'change-requests': () => (
    <>
      <P>
        A change is anything the project was not agreed to do. That is not a complaint —
        most projects grow after launch. It just runs through a different path from a bug.
      </P>
      <H2 id="which">Bug or change?</H2>
      <Table
        head={['It is a bug when', 'It is a change when']}
        rows={[
          ['Something we built does not do what was agreed', 'You want it to do something new'],
          ['It worked at handover and does not now', 'It never did this and now should'],
          ['The result differs from the approved design', 'The design itself should be different'],
        ]}
      />
      <P>
        Bugs in delivered work are fixed at no charge. Changes are quoted. If it is genuinely
        unclear which side of the line something falls on, say so and we will tell you
        honestly.
      </P>
      <H2 id="asking">How to ask for one well</H2>
      <UL>
        <LI>Describe the outcome you want, not the implementation you have in mind — there is often a cheaper route to the same thing.</LI>
        <LI>Say who it is for and what they are trying to do.</LI>
        <LI>Say whether there is a date it has to be ready for.</LI>
        <LI>Send related changes together. Ten small requests batched cost less than ten sent one a week.</LI>
      </UL>
      <H2 id="process">What happens then</H2>
      <OL>
        <LI>We come back with questions if the request has any, then an estimate.</LI>
        <LI>The estimate covers the work, testing and deployment, and says what it excludes.</LI>
        <LI>You approve it in writing. Nothing is started, and nothing is billed, before that.</LI>
        <LI>The work is scheduled, built, put on staging where the project has one, and deployed once you sign it off.</LI>
      </OL>
      <H2 id="rates">Estimates and rates</H2>
      <P>
        Small pieces are usually quoted as a fixed price; open-ended work is quoted as a
        range with a cap we will not pass without asking. Rates and terms are whatever your
        contract sets out — see the <A href="/terms">Terms of Service</A>.
      </P>
      <Note title="Urgent work">
        <p>
          We will always try. But work pulled in ahead of other clients&rsquo; scheduled
          work is the one thing we cannot promise on demand, so tell us your deadline as
          early as you know it rather than as late as it is real.
        </p>
      </Note>
    </>
  ),
  'faq': () => (
    <>
      <H2 id="own-the-code">Do I own the code?</H2>
      <P>
        If you bought the work outright, yes — once the final invoice is paid. If you took
        a licence or we host it for you, we keep the source and you hold the right to use
        it, which is what made those cheaper. Your quote says which applies, and{' '}
        <A href="/terms">section 3 of the terms</A> sets out all three. Our reusable
        libraries stay ours either way and come to you as a licence — the{' '}
        <A href="/eula">EULA</A> sets out what that allows.
      </P>
      <H2 id="another-developer">Can someone else work on it later?</H2>
      <P>
        If you own the code, yes — it is your project, we use standard tools and we leave it
        in a state another developer can pick up. Under a licence, another developer can
        work on it only where your order supplied the source and only within what the EULA
        allows. Under hosting there is nothing for them to work on, because the deployment
        is ours.
      </P>
      <H2 id="hosting">Do you host it for us?</H2>
      <P>
        We can. It is one of the three ways a project is delivered, and it means we run the
        software on our infrastructure for a recurring fee rather than handing you anything
        to deploy. Otherwise the project goes to hosting in your name, so the account and
        the domain stay yours.
      </P>
      <H2 id="edit-content">Can I edit the content myself?</H2>
      <P>
        It depends on what was built. If your project includes a CMS, your handover notes
        explain how to log in. If not, see{' '}
        <A href="/docs/content-updates">Editing content</A> — and small text changes are
        usually quick for us to make.
      </P>
      <H2 id="after-launch">What if I need changes after launch?</H2>
      <P>
        Send them over. Small tweaks are often quick; anything larger is quoted first. See{' '}
        <A href="/docs/change-requests">Requesting a change</A>.
      </P>
      <H2 id="costs-after">What does it cost to keep running?</H2>
      <P>
        Hosting and the domain, at minimum — often very little for a static site. Add
        anything the project depends on: a mail service, a CMS, a paid font, a server. Your
        handover notes list the ones your build actually uses.
      </P>
      <H2 id="how-long-support">How long do you support it?</H2>
      <P>
        Bugs in delivered work are ours to fix under the terms of your contract. Beyond
        that, ongoing support is a separate arrangement — we are happy to have one, and
        equally happy for you to run it yourself.
      </P>
      <H2 id="refunds">How do refunds work?</H2>
      <P>
        Set out in full in the <A href="/refund">Refund Policy</A>.
      </P>
    </>
  ),
};
