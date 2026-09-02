import React from 'react';
import { ArrowUp } from 'lucide-react';
import { CONTACT_EMAIL, DISCORD_INVITE, JURISDICTION, STUDIO_NAME } from '../../siteConfig';
import DiscordMark from '../DiscordMark';

const COLUMNS = [
  {
    heading: 'Studio',
    links: [
      { label: 'Services', href: '/services' },
      { label: 'Work', href: '/work' },
      { label: 'How we work', href: '/process' },
      { label: 'Team', href: '/team' },
      { label: 'Discord bots', href: '/bots' },
      { label: 'What we don’t take on', href: '/what-we-dont-take-on' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Status', href: '/status' },
      { label: 'Shield', href: '/shield' },
      { label: 'API', href: '/api' },
      { label: 'Start a project', href: '/contact' },
      { label: 'Join the studio', href: '/apply' },
      { label: 'Discord', href: DISCORD_INVITE, external: true, icon: DiscordMark },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'All legal documents', href: '/legal' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'End User Licence', href: '/eula' },
      { label: 'Data Processing', href: '/dpa' },
      { label: 'Billing Policy', href: '/billing' },
      { label: 'Refund Policy', href: '/refund' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Cookie Policy', href: '/cookies' },
    ],
  },
  {
    heading: 'Policies',
    links: [
      { label: 'Acceptable Use', href: '/acceptable-use' },
      { label: 'Content Moderation', href: '/content-moderation' },
      { label: 'Copyright', href: '/copyright' },
      { label: 'Security', href: '/security' },
      { label: 'Accessibility', href: '/accessibility' },
      { label: 'Subprocessors', href: '/subprocessors' },
      { label: 'Open Source', href: '/open-source' },
    ],
  },
];

const COPYRIGHTED_URL = 'https://app.copyrighted.com/website/0WJlyl916TfhHOdy/';

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'auto' });
}

// What copyrighted.com's helper.js does on load: tag the outbound link with the
// page it was clicked from. Inlined here so the badge needs no third-party script.
function tagBadgeHref(event) {
  event.currentTarget.href = `${COPYRIGHTED_URL}?url=${encodeURIComponent(window.location.href)}`;
}

export default function Footer() {
  return (
    <footer
      id="contact"
      className="w-full border-t border-[#222228] relative z-20 bg-[#060608] flex justify-center scroll-mt-20"
    >
      <div className="w-full max-w-[1480px] border-x border-[#282832]">
        <div className="px-6 sm:px-10 md:px-16 lg:px-20 pt-16 pb-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[1.35fr_repeat(4,minmax(0,1fr))] gap-12 md:gap-8">
          <div className="flex flex-col items-start max-w-[320px]">
            <a href="/" className="flex items-center gap-3 text-xs tracking-[0.22em] mb-5">
              <img
                src="/amitista-logo.png"
                alt=""
                className="h-7 w-7 object-contain select-none"
              />
              <span className="font-bold text-white">AMITISTA</span>
              <span className="font-medium text-neutral-400">STUDIO</span>
            </a>
            <p className="text-sm text-neutral-400 font-normal leading-relaxed tracking-tight mb-6">
              A development studio building websites, applications, interfaces and
              game servers.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-sm text-neutral-300 hover:text-white transition-colors underline underline-offset-4 decoration-[#282832] hover:decoration-neutral-500"
            >
              {CONTACT_EMAIL}
            </a>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} className="flex flex-col">
              <h3 className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-5">
                {column.heading}
              </h3>
              <ul className="flex flex-col gap-1 sm:gap-3">
                {column.links
                  .filter((link) => link.href)
                  .map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...(link.external
                          ? { target: '_blank', rel: 'noreferrer noopener' }
                          : {})}
                        className="inline-flex items-center gap-2 py-1.5 sm:py-0 text-[13px] sm:text-sm text-neutral-400 hover:text-white transition-colors tracking-tight group/link"
                      >
                        {link.icon && (
                          <link.icon
                            size={14}
                            className="shrink-0 text-neutral-500 group-hover/link:text-violet-400 transition-colors"
                          />
                        )}
                        {link.label}
                      </a>
                    </li>
                  ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="border-t border-[#282832] px-6 sm:px-10 md:px-16 lg:px-20 min-h-14 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-medium text-muted tracking-[0.15em]">
          <span>
            © 2026 {STUDIO_NAME} · {JURISDICTION}
          </span>
          <div className="inline-flex items-center gap-4">
            <meta name="copyrighted-site-verification" content="89bacc26b63a766e" />
            <a
              className="copyrighted-badge inline-flex opacity-70 hover:opacity-100 transition-opacity"
              title="Copyrighted.com Registered &amp; Protected"
              href={COPYRIGHTED_URL}
              onClick={tagBadgeHref}
              target="_blank"
              rel="noreferrer noopener"
            >
              <img
                src="/copyrighted-badge.png"
                srcSet="/copyrighted-badge.png 1x, /copyrighted-badge@2x.png 2x"
                alt="Copyrighted.com Registered &amp; Protected"
                width={125}
                height={25}
                className="block select-none"
              />
            </a>
            <button
              type="button"
              onClick={scrollToTop}
              className="inline-flex items-center gap-2 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowUp size={12} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
