export const LEGAL_GROUPS = [
  {
    heading: 'Agreements',
    blurb: 'What we owe each other once a project starts, and what it costs.',
    pages: [
      {
        label: 'Terms of Service',
        href: '/terms',
        blurb:
          'The agreement a project runs under — what we deliver, what we need from you, and how it ends.',
      },
      {
        label: 'End User Licence',
        href: '/eula',
        blurb:
          'What you may do with the code and files we hand over, and the few things you may not.',
      },
      {
        label: 'Data Processing',
        href: '/dpa',
        blurb:
          'How we handle data belonging to your users when a project puts it in our hands.',
      },
      {
        label: 'Billing Policy',
        href: '/billing',
        blurb:
          'When an invoice arrives, when it is due, and what happens if it goes unpaid.',
      },
      {
        label: 'Refund Policy',
        href: '/refund',
        blurb:
          'When money comes back, when it does not, and what you keep in either case.',
      },
    ],
  },
  {
    heading: 'Rules',
    blurb: 'What is not allowed, and what to do when somebody does it anyway.',
    pages: [
      {
        label: 'Acceptable Use',
        href: '/acceptable-use',
        blurb: 'What the software we write and the servers we run may not be used for.',
      },
      {
        label: 'Content Moderation',
        href: '/content-moderation',
        blurb:
          'How a report about something posted in our community is handled, and how a decision is challenged.',
      },
      {
        label: 'Copyright',
        href: '/copyright',
        blurb:
          'How to tell us work of yours was copied, and how to answer a report made about yours.',
      },
      {
        label: 'Vulnerability Disclosure',
        href: '/security',
        blurb:
          'How to report a security hole you have found, and what we undertake to do about it.',
      },
    ],
  },
  {
    heading: 'What we disclose',
    blurb: 'What we hold, who else can reach it, and what this site does to your browser.',
    pages: [
      {
        label: 'Privacy Policy',
        href: '/privacy',
        blurb: 'What we collect, why we have it, how long we keep it, and who else can see it.',
      },
      {
        label: 'Cookie Policy',
        href: '/cookies',
        blurb: 'We set none — this is the short page saying what is stored on your device instead.',
      },
      {
        label: 'Subprocessors',
        href: '/subprocessors',
        blurb: 'Every outside company that may handle client data, named, and how you hear of a change.',
      },
      {
        label: 'Accessibility',
        href: '/accessibility',
        blurb:
          'What works with a keyboard and a screen reader, what does not yet, and how to tell us.',
      },
      {
        label: 'Open Source Licences',
        href: '/open-source',
        blurb: 'The third-party code and typefaces this site ships, and the licences they carry.',
      },
    ],
  },
];

export const LEGAL_PAGES = LEGAL_GROUPS.flatMap((group) => group.pages);
