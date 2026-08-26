export const AUDIENCES = [
  {
    slug: 'fivem-server-owners',
    icon: 'gamepad-2',
    label: 'FiveM server owners',
    title: 'You run a server and the tooling is holding you back',
    intro:
      'Most of what a server needs is not a script you can buy. It is the thing your server does that nobody else does, wired into the systems you already run, without a dependency on whoever wrote it staying in your Discord.',
    problems: [
      'A script you paid for is escrowed, abandoned, or breaks every time the game updates.',
      'Your staff run everything by hand — bans, applications, reports — because the tools for it do not exist.',
      'You have outgrown the framework you started on and every change now breaks two other things.',
      'Cheating is a staff workload rather than a solved problem.',
    ],
    weBuild: [
      'Custom scripts and server systems, written to be read and changed by whoever comes after us',
      'Staff and admin panels that replace a spreadsheet and a Discord channel',
      'Discord bots wired into what the server actually does — applications, reports, whitelists',
      'The web side: store fronts, landing pages, player-facing dashboards',
    ],
    projects: ['async', 'ocean-scanner'],
    services: ['applications-and-systems', 'web-development'],
    estimate: 'type=game-server&size=s&features=discord,accounts&design=match&content=some',
    note: 'Anti-cheat is a large part of what we already build — Async is ours, and one of us works on Ocean — so if cheating is the thing eating your staff week after week, it is a problem we have shipped answers to rather than one we have read about.',
  },

  {
    slug: 'founders',
    icon: 'rocket',
    label: 'Founders and small teams',
    title: 'You need the first real version, not a prototype',
    intro:
      'The build that has to work in front of users, be changeable next month, and not need rewriting the first time somebody signs up. Small enough to ship, built well enough that shipping it again is not a rescue job.',
    problems: [
      'You have designs, or a clear idea, and nobody to build it.',
      'A no-code build got you to the point where it cannot do the one thing your product is actually for.',
      'You have a developer already and need the screens worked out before they start.',
      'You need to show something real to users or investors on a date that is already fixed.',
    ],
    weBuild: [
      'Web applications with accounts, data and an admin side',
      'Dashboards, and the APIs underneath them',
      'The marketing site that goes with it, so launch is not two projects',
      'Interface design first, where the screens are the part that is not settled',
    ],
    projects: ['ocean-scanner'],
    services: ['web-development', 'interface-design'],
    estimate: 'type=web-app&size=m&features=accounts,admin,payments&design=scratch&content=some',
    note: 'Buy the work outright and you own the source, deployed on hosting in your name — if you bring in your own developers later, nothing here is designed to make that harder. If owning a codebase is not what you need yet, you can license it or let us host and run it instead, for less, and convert to full ownership whenever you want it.',
  },

  {
    slug: 'outgrown-your-site',
    icon: 'refresh-cw',
    label: 'Businesses with a site that has stopped keeping up',
    title: 'What you have works, and every change is a fight',
    intro:
      'Sites reach a point where the cost is not building anything new — it is that nobody can safely touch what is there. Usually the answer is not another plugin. Sometimes it is not a rebuild either, and we will say so.',
    problems: [
      'Small changes need a developer, so they do not get made.',
      'It is slow on a phone, and that is where most of your visitors are.',
      'The person who built it is gone, and nobody knows how it is deployed.',
      'It was built on something the rest of the industry has moved off.',
    ],
    weBuild: [
      'Rebuilds that keep what works and drop what nobody uses',
      'Content you can edit yourself, without calling us for a price change',
      'The move onto hosting you control, with the deployment written down',
      'Performance and accessibility work on what is already there, where a rebuild is not warranted',
    ],
    projects: [],
    services: ['web-development', 'interface-design'],
    estimate: 'type=marketing-site&size=m&features=cms&design=brand&content=migrate',
    note: 'The first thing we do is look at what you have and tell you whether it needs replacing. Sometimes it does not, and that is a cheaper answer than the one you came for.',
  },
];

export function findAudience(slug) {
  return AUDIENCES.find((audience) => audience.slug === slug);
}
