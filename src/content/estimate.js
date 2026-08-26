export const ESTIMATE_READY = false;

export const CURRENCY = { symbol: '€', code: 'EUR' };

export const SPREAD = 0.2;

export const ROUND_TO = 100;

export const MINIMUM = 750;

export const QUESTIONS = [
  {
    id: 'type',
    key: 'building',
    icon: 'layers',
    label: 'What are you building?',
    hint: 'Pick the closest. The rest of the questions adjust to it.',
    type: 'single',
    options: [
      {
        id: 'marketing-site',
        label: 'Marketing or landing site',
        detail: 'Pages that explain a product and ask for something',
        cost: 1200,
        weeks: 2,
      },
      {
        id: 'web-app',
        label: 'Web application or dashboard',
        detail: 'People log in and it holds their data',
        cost: 3500,
        weeks: 5,
      },
      {
        id: 'design',
        label: 'Interface design only',
        detail: 'Screens worked out for your own developers to build',
        cost: 900,
        weeks: 2,
      },
      {
        id: 'game-server',
        label: 'FiveM server or scripts',
        detail: 'Server build, custom scripts, or the systems behind them',
        cost: 800,
        weeks: 2,
      },
      {
        id: 'bot',
        label: 'Discord bot or automation',
        detail: 'Something that runs unattended and talks to other services',
        cost: 600,
        weeks: 1,
      },
      {
        id: 'other',
        label: 'Something else',
        detail: 'Describe it below and we will work it out',
        cost: 1500,
        weeks: 3,
      },
    ],
  },

  {
    id: 'size',
    key: 'scale',
    icon: 'layout',
    label: 'Roughly how many pages or screens?',
    hint: 'A guess is fine. Nobody is held to it.',
    type: 'single',
    options: [
      { id: 'xs', label: '1 to 3', detail: 'A single page, or close to it', cost: 0, weeks: 0 },
      { id: 's', label: '4 to 8', detail: 'A normal small site', cost: 600, weeks: 1 },
      { id: 'm', label: '9 to 20', detail: 'Several sections, or an app with real depth', cost: 1600, weeks: 2 },
      { id: 'l', label: 'More than 20', detail: 'Large, or you genuinely do not know yet', cost: 3200, weeks: 4 },
    ],
  },

  {
    id: 'features',
    key: 'features',
    icon: 'puzzle',
    label: 'What does it need to do?',
    hint: 'Pick as many as apply, or none. Each one is a real part of the build.',
    type: 'multi',
    options: [
      {
        id: 'accounts',
        label: 'Accounts and logins',
        detail: 'People sign in and have something of their own',
        cost: 900,
        weeks: 1,
      },
      {
        id: 'payments',
        label: 'Payments or subscriptions',
        detail: 'Taking money, one-off or recurring',
        cost: 1200,
        weeks: 1,
      },
      {
        id: 'admin',
        label: 'Admin or moderation panel',
        detail: 'A back office for your team rather than your users',
        cost: 1400,
        weeks: 2,
      },
      {
        id: 'cms',
        label: 'You edit the content yourself',
        detail: 'Changing text and images without calling us',
        cost: 700,
        weeks: 1,
      },
      {
        id: 'integrations',
        label: 'Talks to other services',
        detail: 'APIs, webhooks, or a system you already run',
        cost: 800,
        weeks: 1,
      },
      {
        id: 'realtime',
        label: 'Live updates or chat',
        detail: 'Things that change on screen without a refresh',
        cost: 1100,
        weeks: 1,
      },
      {
        id: 'uploads',
        label: 'File or image uploads',
        detail: 'Users putting their own files in',
        cost: 500,
        weeks: 0,
      },
      {
        id: 'i18n',
        label: 'More than one language',
        detail: 'Translated properly rather than run through a widget',
        cost: 700,
        weeks: 1,
      },
      {
        id: 'discord',
        label: 'Discord integration',
        detail: 'A bot, roles, or notifications into a server',
        cost: 400,
        weeks: 0,
      },
    ],
  },

  {
    id: 'design',
    key: 'design',
    icon: 'pen-tool',
    label: 'Where does the design come from?',
    hint: 'This moves the number more than most people expect it to.',
    type: 'single',
    options: [
      {
        id: 'have',
        label: 'I have finished designs',
        detail: 'Figma or similar, ready to build from',
        cost: 0,
        weeks: 0,
      },
      {
        id: 'brand',
        label: 'I have a brand, not the screens',
        detail: 'Logo and colours exist; the layouts do not',
        cost: 700,
        weeks: 1,
      },
      {
        id: 'scratch',
        label: 'Design it from scratch',
        detail: 'Start from nothing and work the whole thing out',
        cost: 1400,
        weeks: 2,
      },
      {
        id: 'match',
        label: 'Match something that exists',
        detail: 'Follow a site or product you already have',
        cost: 400,
        weeks: 0,
      },
    ],
  },

  {
    id: 'content',
    key: 'content',
    icon: 'file-text',
    label: 'Who provides the text and images?',
    hint: 'The most common reason a finished build sits unlaunched.',
    type: 'single',
    options: [
      { id: 'ready', label: 'I have it ready', detail: 'Written and gathered already', cost: 0, weeks: 0 },
      { id: 'some', label: 'Some of it', detail: 'Enough to start, the rest as we go', cost: 300, weeks: 0 },
      {
        id: 'migrate',
        label: 'It needs moving from an old site',
        detail: 'Existing content, carried across',
        cost: 800,
        weeks: 1,
      },
      {
        id: 'help',
        label: 'I need help writing it',
        detail: 'Nothing written yet',
        cost: 900,
        weeks: 1,
      },
    ],
  },

  {
    id: 'timeline',
    key: 'when',
    icon: 'calendar',
    label: 'When do you need it?',
    hint: 'A deadline is priced, not promised, until we have seen the brief.',
    type: 'single',
    options: [
      {
        id: 'rush',
        label: 'Within a month',
        detail: 'Fixed date, or as soon as possible',
        multiplier: 1.25,
        note: 'A deadline this tight has to be confirmed against what is already booked before it is agreed.',
      },
      {
        id: 'normal',
        label: 'One to three months',
        detail: 'The usual shape of a project',
        multiplier: 1,
        default: true,
      },
      {
        id: 'flexible',
        label: 'No fixed deadline',
        detail: 'It is ready when it is right',
        multiplier: 0.95,
      },
    ],
  },

  {
    id: 'aftercare',
    key: 'after',
    icon: 'life-buoy',
    label: 'And after it is live?',
    hint: 'These assume you are buying the work outright. Licensing it or letting us host it costs less and is quoted separately.',
    type: 'single',
    options: [
      {
        id: 'none',
        label: 'Handover and it is yours',
        detail: 'Source, hosting and documentation, then we are done',
        cost: 0,
        weeks: 0,
      },
      {
        id: 'training',
        label: 'Handover plus a walkthrough',
        detail: 'A session taking your team through it live',
        cost: 250,
        weeks: 0,
      },
      {
        id: 'retainer',
        label: 'Ongoing support',
        detail: 'Someone on hand after launch',
        cost: 0,
        weeks: 0,
        note: 'Support is quoted monthly and separately — it is not part of the range above.',
      },
    ],
  },
];

export function defaultAnswers() {
  return Object.fromEntries(
    QUESTIONS.map((question) => [
      question.id,
      question.type === 'multi'
        ? []
        : (question.options.find((option) => option.default) ?? question.options[0]).id,
    ]),
  );
}

export function estimate(answers) {
  const chosen = QUESTIONS.flatMap((question) => {
    const answer = answers[question.id];
    const ids = Array.isArray(answer) ? answer : [answer];
    return question.options
      .filter((option) => ids.includes(option.id))
      .map((option) => ({ ...option, question }));
  });

  const additive = chosen.reduce((sum, option) => sum + (option.cost ?? 0), 0);
  const scale = chosen.reduce((product, option) => product * (option.multiplier ?? 1), 1);
  const weeks = chosen.reduce((sum, option) => sum + (option.weeks ?? 0), 0);

  const total = additive * scale;
  const round = (value) => Math.max(ROUND_TO, Math.round(value / ROUND_TO) * ROUND_TO);

  return {
    chosen,
    low: Math.max(MINIMUM, round(total * (1 - SPREAD))),
    high: Math.max(MINIMUM + ROUND_TO, round(total * (1 + SPREAD))),
    weeksLow: Math.max(1, weeks),
    weeksHigh: Math.max(2, weeks + Math.ceil(weeks * 0.5)),
    notes: chosen.filter((option) => option.note),
  };
}

export function formatMoney(value) {
  return `${CURRENCY.symbol}${value.toLocaleString('en-GB')}`;
}
