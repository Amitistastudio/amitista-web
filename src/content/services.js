export const SERVICES = [
  {
    slug: 'web-development',
    icon: 'globe',
    name: 'Web development',
    blurb: 'Marketing sites, dashboards and full web platforms.',
    summary:
      'Most of what we do. A site that loads fast, reads well on a phone and can be updated without calling us every time something needs changing.',
    includes: [
      'Marketing and landing pages',
      'Dashboards and admin panels',
      'Blogs, documentation and content pages',
      'Web applications with accounts and logins',
      'Rebuilds of sites that have outgrown what they were made in',
    ],
    delivers: [
      'The full source, yours to keep',
      'Deployed and running on hosting you own',
      'Written documentation for anything you will need to change yourself',
    ],
  },
  {
    slug: 'applications-and-systems',
    icon: 'server',
    name: 'Applications and systems',
    blurb: 'Custom tools, backends and game server builds, FiveM included.',
    summary:
      'The parts with no interface, and the tools built for one team rather than for a market. If it has to talk to something else, hold data, or run unattended, it lands here.',
    includes: [
      'APIs and backends',
      'Internal tools nobody sells but somebody depends on',
      'Discord bots and integrations',
      'FiveM servers, scripts and the systems behind them',
      'Desktop tools for Windows',
    ],
    delivers: [
      'The full source, yours to keep',
      'Setup notes good enough for another developer to pick it up',
      'A handover walkthrough of how it runs and where it is deployed',
    ],
  },
  {
    slug: 'interface-design',
    icon: 'pen-tool',
    name: 'Interface design',
    blurb: 'Interfaces designed around how people actually use them.',
    summary:
      'Design as the step before the build rather than a skin applied after it. Useful on its own if you have developers already and need the screens worked out first.',
    includes: [
      'Interface and product design in Figma',
      'Design systems and component libraries',
      'Redesigns of products that already exist',
      'Clickable prototypes to try before anything is built',
    ],
    delivers: [
      'The Figma file, with the components arranged to be reused',
      'Screens covering the empty, loading and error states, not only the happy path',
      'The design handed over ready to build, whoever builds it',
    ],
  },
];
