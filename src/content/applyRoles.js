export const BASE_QUESTIONS = [
  {
    id: 'basics',
    type: 'text',
    label: 'Age & timezone',
    hint: 'We plan work around your clock, not ours.',
    max: 80,
    required: true,
    placeholder: 'e.g. 19 · GMT+2',
  },
  {
    id: 'hours',
    type: 'choice',
    label: 'Time you can give each week',
    hint: 'Client deadlines get planned around this, so be honest.',
    required: true,
    options: [
      { value: 'lt5', label: 'Under 5 hours', description: 'A hand now and then, when I am free' },
      { value: '5to10', label: '5 to 10 hours', description: 'A few evenings a week' },
      { value: '10to20', label: '10 to 20 hours', description: 'Most days, reliably' },
      { value: 'gt20', label: '20+ hours', description: 'This is my main thing right now' },
    ],
  },
  {
    id: 'why',
    type: 'para',
    label: 'Why this team, and why us?',
    hint: 'Skip the flattery. Tell us what you want to work on.',
    max: 600,
    required: true,
    placeholder: 'What do you want out of it, and what do we get out of you?',
  },
];

export const ROLES = [
  {
    key: 'dev',
    name: 'Developer',
    hook: 'Ship the client projects and keep them running.',
    blurb:
      'You build what clients pay for — sites, bots and the automation behind them — and you keep it standing after handover.',
    does: [
      'Build and ship the projects that come through orders',
      'Fix what breaks, fast, while a client is waiting',
      'Keep the studio bots and internal tooling healthy',
    ],
    needs: [
      'Real work you can show us, not finished tutorials',
      'Comfortable dropping into someone else’s codebase',
      'You flag a slipping deadline before it slips',
    ],
    questions: [
      {
        id: 'field',
        type: 'multi',
        label: 'What do you actually build?',
        hint: 'Tick only what you would be happy to be handed tomorrow.',
        required: true,
        options: [
          { value: 'frontend', label: 'Frontend', description: 'Markup, styling, the browser side' },
          { value: 'backend', label: 'Backend', description: 'APIs, databases, the server side' },
          { value: 'fullstack', label: 'Full-Stack', description: 'Both ends of a project, solo' },
          { value: 'bots', label: 'Discord bots', description: 'discord.js or equivalent' },
          { value: 'mobile', label: 'Mobile', description: 'iOS, Android or cross-platform' },
          { value: 'devops', label: 'DevOps & hosting', description: 'Servers, deploys, uptime' },
        ],
      },
      {
        id: 'proof',
        type: 'para',
        label: 'The best thing you have built',
        hint: 'A link beats a description. GitHub, a live site, anything.',
        max: 600,
        required: true,
        placeholder: 'What it was, what part was yours, and where we can see it.',
      },
    ],
  },
  {
    key: 'design',
    name: 'Designer',
    hook: 'Decide what the work looks like before it is built.',
    blurb:
      'You set how client work looks — layouts, brand kits and everything the studio puts its name on.',
    does: [
      'Design site layouts and brand kits for client projects',
      'Turn a rough brief into something a developer can build',
      'Keep our own branding consistent everywhere',
    ],
    needs: [
      'A portfolio we can open right now',
      'Fluent in Figma, or whatever you swear by',
      'You take feedback without taking it personally',
    ],
    questions: [
      {
        id: 'field',
        type: 'multi',
        label: 'What kind of design is yours?',
        hint: 'Tick everything you would take on for a paying client.',
        required: true,
        options: [
          { value: 'uiux', label: 'UI / UX', description: 'Site and app layouts' },
          { value: 'brand', label: 'Branding & logos', description: 'Identity, marks, brand kits' },
          { value: 'social', label: 'Social & thumbnails', description: 'Posts, banners, covers' },
          { value: 'motion', label: 'Motion & video', description: 'Animation and editing' },
          { value: '3d', label: '3D', description: 'Renders, mockups, product shots' },
        ],
      },
      {
        id: 'portfolio',
        type: 'text',
        label: 'Portfolio link',
        hint: 'No portfolio? Say so, and send the files when we reply.',
        max: 200,
        required: true,
        placeholder: 'Behance · Dribbble · Drive — anything we can open',
      },
    ],
  },
  {
    key: 'qa',
    name: 'Quality Assurance',
    hook: 'Break every build before the client gets to.',
    blurb:
      'You are the last check before work reaches a client. If something is broken you find it first, and you write it up so it can be fixed.',
    does: [
      'Test builds on real devices before handover',
      'Write bug reports a developer can act on straight away',
      'Re-check the fixes and sign the work off',
    ],
    needs: [
      'Patient, picky, and hard to satisfy',
      'You describe a bug in steps, not in vibes',
      'Around when projects are being handed over',
    ],
    questions: [
      {
        id: 'field',
        type: 'multi',
        label: 'What can you test properly?',
        hint: 'Tick what you could sign off without help.',
        required: true,
        options: [
          { value: 'web', label: 'Websites & web apps', description: 'Desktop and mobile browsers' },
          { value: 'bots', label: 'Discord bots', description: 'Commands, permissions, edge cases' },
          { value: 'mobile', label: 'Mobile apps', description: 'On real devices' },
          { value: 'game', label: 'Game & FiveM servers', description: 'Scripts, load, stability' },
        ],
      },
      {
        id: 'method',
        type: 'para',
        label: 'A site ships tomorrow. What do you test?',
        hint: 'Tell us the order you would work through it.',
        max: 600,
        required: true,
        placeholder: 'What you check first, and what you would never let past you.',
      },
    ],
  },
  {
    key: 'support',
    name: 'Support Team',
    hook: 'First reply in every ticket, and the calm one.',
    blurb:
      'You are the first person a client or member meets in a ticket. You keep things moving and make people feel looked after.',
    does: [
      'Answer tickets clearly and quickly',
      'Keep clients updated while their project is in progress',
      'Hand the hard ones to the right department',
    ],
    needs: ['Patient, and genuinely helpful', 'Good written English', 'Online most days, not just weekends'],
    questions: [
      {
        id: 'exp',
        type: 'text',
        label: 'Support experience',
        hint: 'None is a fair answer, as long as it is the true one.',
        max: 200,
        required: true,
        placeholder: 'Where, how long, and what kind of questions?',
      },
      {
        id: 'angry',
        type: 'para',
        label: 'A client says their order is late. Reply.',
        hint: 'Write the message you would actually send them.',
        max: 600,
        required: true,
        placeholder: 'They are angry, they paid, and the work is genuinely late.',
      },
    ],
  },
  {
    key: 'mod',
    name: 'Moderation',
    hook: 'Keep the server clean, fair, and quiet.',
    blurb:
      'You hold the line — same rules for everyone, drama defused early, and a server clients are happy to land in.',
    does: [
      'Handle rule breaks calmly and consistently',
      'Watch chat and act on reports',
      'Log every action so nothing looks arbitrary',
    ],
    needs: [
      'Level headed when someone is trying to wind you up',
      'Knows the rules cold',
      'No serious warns or bans on your record',
    ],
    questions: [
      {
        id: 'record',
        type: 'text',
        label: 'Any warns or bans on your record?',
        hint: 'We check. Owning it now costs you nothing.',
        max: 200,
        required: true,
        placeholder: 'Where, what for, and how long ago.',
      },
      {
        id: 'case',
        type: 'para',
        label: 'A team member breaks the rules. Now what?',
        hint: 'Someone above you in the staff list, publicly.',
        max: 600,
        required: true,
        placeholder: 'What you do first, and who you tell.',
      },
    ],
  },
];

export const findRole = (key) => ROLES.find((role) => role.key === key) || null;

export const questionsOf = (role) => (role ? [...BASE_QUESTIONS, ...role.questions] : []);
