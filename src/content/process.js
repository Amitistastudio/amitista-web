export const STAGES = [
  {
    step: '01',
    title: 'Brief',
    blurb: 'You tell us what you need. We scope it and price it before anything starts.',
    detail:
      'You tell us what you want built and we ask until we understand it. Usually a short back and forth rather than a form: what it has to do, who it is for, what already exists. If it is not something we should be taking on, this is where we say so instead of finding out three weeks in.',
    youBring: [
      'Roughly what you want, in whatever state it is in',
      'Anything that already exists — designs, a domain, an old site, a server',
      'Who has the final say on decisions',
    ],
    ends: 'A written scope and a fixed price, agreed before any work begins.',
  },
  {
    step: '02',
    title: 'Design',
    blurb: 'Wireframes and interface work, agreed with you before a line is written.',
    detail:
      'The screens get worked out before anything is built, because moving a box in Figma costs minutes and moving it in a finished build costs days. You see the layouts, say what is wrong, and we change them until they are right.',
    youBring: [
      'Feedback on the layouts, ideally in one pass rather than in pieces',
      'Your logo, colours and fonts, if you have them',
      'Real text and images where you have them — placeholder copy hides problems',
    ],
    ends: 'Designs you have approved, which is what the build is then measured against.',
  },
  {
    step: '03',
    title: 'Build',
    blurb: 'Development in stages, with something you can look at along the way.',
    detail:
      'Built in stages, with a link you can open and try as it goes rather than a silence that ends in a reveal. Revisions inside the agreed scope are part of the job; anything that changes the scope gets quoted before it is done, not absorbed quietly and then blamed for the delay.',
    youBring: [
      'Whatever access the project needs — domain, hosting, accounts',
      'Answers when something turns out to be ambiguous',
      'A review at each stage rather than only at the end',
    ],
    ends: 'The finished project, deployed, with the source and the documentation handed to you.',
  },
  {
    step: '04',
    title: 'Support',
    blurb: 'Fixes, changes and help once the project is live.',
    detail:
      'Going live is not the end of it. Anything that does not work the way it was agreed gets fixed. Beyond that, new features and ongoing changes are quoted as their own small projects, so you are never paying a retainer for months where nothing needed doing.',
    youBring: [
      'A description of the problem and how to reproduce it',
      'A note of anything that changed at your end',
    ],
    ends: 'A project that keeps working, and somebody to ask when it does not.',
  },
];

export const PRINCIPLES = [
  {
    title: 'You talk to the developers',
    body: 'No account managers in the middle. The people answering your messages are the ones building the project.',
  },
  {
    title: 'Scope agreed up front',
    body: 'We settle what is being built and what it costs before we start, so nothing turns into a surprise halfway through.',
  },
];
