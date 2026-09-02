import { PROJECTS } from './projects';
import { SERVICES } from './services';
import { STAGES } from './process';
import { DOC_META } from './docsMeta';
import { FAQ } from './faq';

export const SITE_PAGES = [
  {
    title: 'Home',
    subtitle: 'Websites, applications and the systems behind them',
    href: '/',
    group: 'Studio',
    keywords: 'start index main landing amitista studio',
  },
  {
    title: 'Work',
    subtitle: 'Selected projects',
    href: '/work',
    group: 'Studio',
    keywords: 'portfolio projects case studies clients built',
  },
  {
    title: 'Services',
    subtitle: 'Three digital disciplines, and what each one covers',
    href: '/services',
    group: 'Studio',
    keywords: 'what we do offerings capabilities hire build',
  },
  {
    title: 'How we work',
    subtitle: 'The four stages every project runs through',
    href: '/process',
    group: 'Studio',
    keywords: 'process stages workflow method timeline steps',
  },
  {
    title: 'Team',
    subtitle: 'The people who build it',
    href: '/team',
    group: 'Studio',
    keywords: 'about us who developers people stack blxr jean wizzard',
  },
  {
    title: 'Status',
    subtitle: 'Whether everything is working, checked every five minutes',
    href: '/status',
    group: 'Resources',
    keywords:
      'uptime downtime outage incident health monitor is it down broken offline availability certificate',
  },
  {
    title: 'Bots',
    subtitle: 'Why we don’t build them, and who we send you to',
    href: '/bots',
    group: 'Studio',
    keywords: 'discord bot bots essential bots ebots partner partnership blxr source code sell selling commission custom bot server invite',
  },
  {
    title: 'Shield',
    subtitle: 'Security for Express that runs inside your own app',
    href: '/shield',
    group: 'Resources',
    keywords:
      'shield security express node package injection sql command xss ssrf rate limit taint runtime protection appsec waf npm install monitor block proxy trustproxy cluster workers queue bind stats findings baseline sinks options harden slowloris credential stuffing',
  },
  {
    title: 'API',
    subtitle: 'Install Shield, then call the endpoints',
    href: '/api',
    group: 'Resources',
    keywords:
      'api json endpoint rest developers integrate install setup npm quickstart fetch curl cors public data feed machine readable',
  },
  {
    title: 'Documentation',
    subtitle: 'Handover, deployment, DNS and maintenance',
    href: '/docs',
    group: 'Resources',
    keywords: 'docs guides manual help reference handbook',
  },
  {
    title: 'FAQ',
    subtitle: 'Cost, scope and who owns the result',
    href: '/faq',
    group: 'Resources',
    keywords: 'questions pricing price cost how much answers',
  },
  {
    title: 'Start a project',
    subtitle: 'Tell us what you need',
    href: '/contact',
    group: 'Studio',
    keywords: 'contact email hire enquiry quote get in touch message brief',
  },
  {
    title: 'Join the studio',
    subtitle: 'Apply for a role on the team',
    href: '/apply',
    group: 'Studio',
    keywords:
      'apply application job jobs hiring hire recruit recruitment staff join careers vacancy role roles developer designer qa tester support moderator',
  },
  {
    title: 'What we don’t take on',
    subtitle: 'The work we turn down, and why',
    href: '/what-we-dont-take-on',
    group: 'Studio',
    keywords:
      'refuse decline no stolen leaked scripts harassment fraud spec work free pitch ethics policy',
  },
  {
    title: 'Legal',
    subtitle: 'All fourteen documents, with a line explaining each',
    href: '/legal',
    group: 'Legal',
    keywords:
      'legal index policies documents terms privacy small print agreements rules disclosures all',
  },
  {
    title: 'Terms of Service',
    subtitle: 'The agreement a project runs under',
    href: '/terms',
    group: 'Legal',
    keywords: 'legal contract agreement conditions tos arbitration dispute governing law jurisdiction',
  },
  {
    title: 'End User Licence',
    subtitle: 'What you may do with what we deliver',
    href: '/eula',
    group: 'Legal',
    keywords: 'legal licence license eula rights ownership arbitration dispute governing law',
  },
  {
    title: 'Refund Policy',
    subtitle: 'When money comes back and when it does not',
    href: '/refund',
    group: 'Legal',
    keywords: 'legal money back cancel deposit returns',
  },
  {
    title: 'Privacy Policy',
    subtitle: 'What we collect and how long we keep it',
    href: '/privacy',
    group: 'Legal',
    keywords: 'legal privacy data cookies tracking personal information gdpr',
  },
  {
    title: 'Data Processing Addendum',
    subtitle: 'How we handle your users’ data when we work for you',
    href: '/dpa',
    group: 'Legal',
    keywords:
      'dpa gdpr data processing addendum subprocessors sub-processors user data transfers security audit',
  },
  {
    title: 'Subprocessors',
    subtitle: 'Every company that may handle client data',
    href: '/subprocessors',
    group: 'Legal',
    keywords:
      'subprocessors sub-processors vendors third parties discord datalix hosting mysql mongodb who holds my data',
  },
  {
    title: 'Vulnerability Disclosure Policy',
    subtitle: 'Reporting a vulnerability, and what happens next',
    href: '/security',
    group: 'Legal',
    keywords:
      'security vulnerability disclosure report bug exploit responsible disclosure safe harbour bounty pentest vdp',
  },
  {
    title: 'Acceptable Use Policy',
    subtitle: 'What our software and servers may not be used for',
    href: '/acceptable-use',
    group: 'Legal',
    keywords:
      'acceptable use aup abuse misuse prohibited banned suspension cheats spam malware crypto mining',
  },
  {
    title: 'Billing Policy',
    subtitle: 'Invoicing, late payment and recurring fees',
    href: '/billing',
    group: 'Legal',
    keywords:
      'billing invoice payment deposit milestone late overdue interest vat tax currency renewal subscription chargeback',
  },
  {
    title: 'Content Moderation Policy',
    subtitle: 'How reports are handled and decisions challenged',
    href: '/content-moderation',
    group: 'Legal',
    keywords:
      'moderation content report takedown appeal removal discord community rules harassment',
  },
  {
    title: 'Copyright Complaints',
    subtitle: 'Reporting copied work, and answering a report',
    href: '/copyright',
    group: 'Legal',
    keywords:
      'copyright dmca infringement copied takedown notice counter-notice claim stolen content',
  },
  {
    title: 'Cookie Policy',
    subtitle: 'We set none — this says what is stored instead',
    href: '/cookies',
    group: 'Legal',
    keywords:
      'cookies cookie policy tracking local storage banner consent analytics',
  },
  {
    title: 'Open Source Licences',
    subtitle: 'The third-party code and fonts this site ships',
    href: '/open-source',
    group: 'Legal',
    keywords:
      'open source licences licenses attribution notices credits mit isc ofl react lucide ogl fonts',
  },
  {
    title: 'Accessibility',
    subtitle: 'What works, what does not, and how to tell us',
    href: '/accessibility',
    group: 'Legal',
    keywords:
      'accessibility a11y wcag screen reader keyboard contrast reduced motion statement conformance',
  },
];

export const SEARCH_SECTIONS = [
  {
    label: 'Pages',
    icon: 'file',
    items: SITE_PAGES,
  },
  {
    label: 'Work',
    icon: 'briefcase',
    items: PROJECTS.map((project) => ({
      title: project.name,
      subtitle: project.kind,
      href: `/work/${project.slug}`,
      keywords: project.summary,
    })),
  },
  {
    label: 'Services',
    icon: 'layers',
    items: SERVICES.map((service) => ({
      title: service.name,
      subtitle: service.blurb,
      href: `/services#${service.slug}`,
      keywords: `${service.summary} ${service.includes.join(' ')}`,
    })),
  },
  {
    label: 'Process',
    icon: 'git-branch',
    items: STAGES.map((stage) => ({
      title: stage.title,
      subtitle: stage.blurb,
      href: '/process',
      keywords: `stage ${stage.step} ${stage.detail}`,
    })),
  },
  {
    label: 'Documentation',
    icon: 'book',
    items: DOC_META.map((page) => ({
      title: page.title,
      subtitle: page.description,
      href: `/docs/${page.slug}`,
      keywords: page.group,
    })),
  },
  {
    label: 'FAQ',
    icon: 'help',
    items: FAQ.flatMap((group) =>
      group.questions.map((question) => ({
        title: question.q,
        subtitle: group.label,
        href: `/faq#${group.id}`,
        keywords: question.a,
      })),
    ),
  },
];

export const SEARCH_DEFAULTS = [
  '/work',
  '/services',
  '/contact',
  '/docs',
];
