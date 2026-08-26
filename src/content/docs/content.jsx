import React from 'react';
import { H2, P, UL, OL, LI, Code, Pre, Note, Table, A } from '../../components/docs/prose';

export const DOC_BODIES = {
  'content-updates': () => (
    <>
      <P>
        How you edit content depends on what was built. Your handover notes say which of
        these you have; this page covers what is true in each case.
      </P>
      <H2 id="routes">The three arrangements</H2>
      <Table
        head={['You have', 'You edit', 'Goes live']}
        rows={[
          ['A CMS', 'An admin area in the browser', 'Immediately, or on publish'],
          ['Content files', 'Text files in the project', 'On the next build and deploy'],
          ['Neither', 'Nothing directly — send us the change', 'When we deploy it'],
        ]}
      />
      <H2 id="content-files">Editing content files</H2>
      <P>
        Where content lives in the project, it sits in its own folder — usually{' '}
        <Code>src/content</Code> — as plain lists of text. Change the words between the
        quotes, leave the punctuation around them alone, then rebuild.
      </P>
      <Pre label="src/content/faq.js">{`{
q: 'How long does a project take?',
a: 'Most sites take three to six weeks from brief to launch.',
}`}</Pre>
      <P>
        If a piece of text contains an apostrophe, the quotes around it need to be the other
        kind, or the apostrophe needs a backslash before it. That single detail causes most
        of the broken builds we see after a client edit.
      </P>
      <H2 id="checking">Check before you deploy</H2>
      <OL>
        <LI>Run <Code>npm run build</Code>. If the edit broke something, it fails here rather than in front of visitors.</LI>
        <LI>Run <Code>npm run dev</Code> and read the page you changed.</LI>
        <LI>Deploy.</LI>
      </OL>
      <H2 id="writing">Writing that holds up</H2>
      <UL>
        <LI>Put the point in the first sentence. Very few people read the second.</LI>
        <LI>Avoid dates and figures that will age badly unless you will come back and update them.</LI>
        <LI>Write link text that describes where it goes, which also helps accessibility.</LI>
        <LI>Keep headings short — they become the page&rsquo;s navigation on long pages.</LI>
      </UL>
      <Note title="One change at a time">
        <p>
          Edit, build, deploy, look. Ten changes deployed together mean ten suspects when
          one of them is wrong.
        </p>
      </Note>
    </>
  ),
  'media-assets': () => (
    <>
      <P>
        Images are the easiest way to slow a site down after we have handed it over, because
        uploading a photo straight off a camera or a phone takes one drag and costs every
        visitor several megabytes.
      </P>
      <H2 id="before-upload">Before you upload</H2>
      <OL>
        <LI>Resize to roughly the size it will display at, doubled for sharp screens.</LI>
        <LI>Export as WebP, or AVIF if your tool offers it. JPEG is an acceptable fallback.</LI>
        <LI>Compress. Most images survive heavy compression with no visible difference.</LI>
        <LI>Name the file after what it shows, in lower case with hyphens.</LI>
      </OL>
      <Table
        head={['Use', 'Format', 'Rough target']}
        rows={[
          ['Hero and banner images', 'WebP or AVIF', 'Under 300 KB'],
          ['Photographs in content', 'WebP or AVIF', 'Under 200 KB'],
          ['Logos and icons', 'SVG', 'Under 20 KB'],
          ['Screenshots', 'WebP or PNG', 'Under 300 KB'],
          ['Favicon', 'PNG or SVG', 'Under 10 KB'],
        ]}
      />
      <H2 id="replacing">Replacing an image in place</H2>
      <P>
        Anything in the <Code>public</Code> folder is served exactly as it is named. Export
        the new version with the same filename, drop it in place of the old one, rebuild and
        deploy — nothing in the code needs to change.
      </P>
      <H2 id="video">Video</H2>
      <P>
        Do not host video files on the site. A single clip outweighs everything else on the
        page and your host will charge for the bandwidth. Upload it to YouTube or Vimeo and
        embed it, which also gets you the player, the captions and the streaming for free.
      </P>
      <H2 id="alt-text">Alt text</H2>
      <P>
        Every meaningful image needs a short description of what it shows, for screen
        readers and for the moment the image fails to load. Purely decorative images take an
        empty description so they are skipped rather than announced. See{' '}
        <A href="/docs/accessibility">Accessibility</A>.
      </P>
      <Note title="Rights">
        <p>
          Only upload images you have the right to use. A stock licence usually covers the
          web but not print or resale, and &ldquo;it was on Google Images&rdquo; is not a
          licence. Keep the receipts with the project.
        </p>
      </Note>
    </>
  ),
  'seo': () => (
    <>
      <P>
        We build sites search engines can read: real HTML, sensible headings, fast pages,
        working links. What we cannot build is authority — that comes from the content you
        publish and who links to it, over months.
      </P>
      <H2 id="per-page">What each page needs</H2>
      <Table
        head={['Element', 'Purpose', 'Rough length']}
        rows={[
          ['Title', 'The clickable line in results and the browser tab', '50–60 characters'],
          ['Meta description', 'The grey text beneath it. Ignored for ranking, read by humans', '140–160 characters'],
          ['One h1', 'The page heading. One per page', 'A short phrase'],
          ['Canonical URL', 'Which address is the real one when several show the same page', 'The full URL'],
          ['Open Graph image', 'The preview when the link is shared', '1200 × 630 pixels'],
        ]}
      />
      <H2 id="sitemap">Sitemap and robots</H2>
      <P>
        A sitemap lists your pages for crawlers; <Code>robots.txt</Code> tells them what to
        leave alone. On projects that generate them, they are written during the build from
        the site URL in configuration — so both are wrong until that value is set.
      </P>
      <Pre label="public/robots.txt">{`User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml`}</Pre>
      <H2 id="expectations">What to expect, and when</H2>
      <UL>
        <LI>A new domain takes weeks to be crawled and indexed at all.</LI>
        <LI>Searching your own business name should work early. Competitive terms take far longer.</LI>
        <LI>Register the site in Google Search Console — it tells you what is indexed and what is failing.</LI>
        <LI>Nobody can promise a position, and anyone who does is selling something.</LI>
      </UL>
      <H2 id="redirects">When URLs change</H2>
      <P>
        Changing an address breaks every existing link and loses whatever ranking it had.
        If a page has to move, redirect the old address to the new one permanently rather
        than deleting it.
      </P>
      <Note title="Staging out of the index">
        <p>
          A staging or preview URL should block crawlers. If one has been indexed, remove it
          in Search Console rather than waiting for it to drop out on its own.
        </p>
      </Note>
    </>
  ),
  'analytics': () => (
    <>
      <P>
        Analytics answers which pages people reach, where they came from and what they did
        next. It is not installed by default — it goes on when you ask for it, because it
        affects both page weight and your privacy obligations.
      </P>
      <H2 id="choosing">Choosing a tool</H2>
      <Table
        head={['Kind', 'Trade-off']}
        rows={[
          ['Privacy-first (Plausible, Fathom, Umami)', 'Light, no cookie banner needed in most cases, paid or self-hosted.'],
          ['Google Analytics', 'Free and detailed, but heavier, and it needs consent and a privacy notice.'],
          ['Host analytics', 'Server-side counts with nothing added to the page, but limited detail.'],
          ['None', 'Nothing to disclose, nothing to maintain, and no idea what is working.'],
        ]}
      />
      <H2 id="consent">Consent</H2>
      <P>
        In the UK and EU, anything that stores identifiers in a visitor&rsquo;s browser for
        analytics needs consent before it loads — not a banner that says it is already
        running. Tools that count without cookies generally avoid this, which is why we
        suggest them first. Whatever you choose has to match what your own privacy notice
        says, and adding a tool means updating that notice at the same time rather than
        later. Ours are <A href="/privacy">/privacy</A> and <A href="/cookies">/cookies</A> if
        you want to see how we word it — the cookie policy is short because we set none.
      </P>
      <H2 id="numbers">Reading the numbers</H2>
      <UL>
        <LI>Compare like with like — the same weekday, the same length of period.</LI>
        <LI>Ignore single-day spikes. A bot, a newsletter or one busy link explains most of them.</LI>
        <LI>Referrers tell you which of your channels actually works.</LI>
        <LI>Pick two or three numbers that map to your business and ignore the rest of the dashboard.</LI>
      </UL>
      <Note title="Collect less">
        <p>
          Every field you record is a field you have to explain, secure and eventually
          delete. Track what will change a decision, and nothing else.
        </p>
      </Note>
    </>
  ),
};
