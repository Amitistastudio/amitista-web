import { PROJECTS } from './projects.js';
import { DOC_META } from './docsMeta.js';
import { LEGAL_GROUPS } from './legal.js';

export const DEFAULT_DESCRIPTION =
  'Amitista Studio is a development studio building websites, applications, ' +
  'interfaces and game servers. Tell us what you need and we’ll scope it ' +
  'before anything starts.';

const MAX_DESCRIPTION = 165;

function clamp(text, limit = MAX_DESCRIPTION) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:—-]$/, '')}…`;
}

const PAGES = {
  '/': {
    title: 'Amitista Studio — Websites, applications and game servers',
    description: DEFAULT_DESCRIPTION,
  },
  '/work': {
    label: 'Work',
    description:
      'Selected projects, each with what it is, who owns it and which parts we built — including the ones that are not ours to claim.',
  },
  '/services': {
    label: 'Services',
    description:
      'What we build: websites, web applications, interfaces, game servers and the systems behind them, with what each one covers.',
  },
  '/process': {
    label: 'How we work',
    description:
      'The four stages every project runs through, what happens in each, and what we need from you before the next one starts.',
  },
  '/team': {
    label: 'Team',
    description:
      'The developers who do the work, what each of them focuses on, and the stack the studio builds with.',
  },
  '/status': {
    label: 'Status',
    description:
      'Whether the site, the enquiry forms, the certificate and the server are working right now, recorded every five minutes for the last 90 days.',
  },
  '/api': {
    label: 'API',
    title: 'Install the API — Amitista Studio',
    description:
      'Install Shield in three lines, then read its rule catalogue with a token — install steps, copyable curl and fetch examples, a live explorer, and the reference docs. The signed feed stays open.',
  },
  '/shield': {
    label: 'Shield',
    description:
      'A security package for Express that maps your routes, watches the dangerous calls at runtime and refuses the requests that abuse them — without your code leaving your machine.',
  },
  '/bots': {
    label: 'Bots',
    title: 'Discord bots — Amitista Studio',
    description:
      'Our bot was written by Blxr and runs one server. We do not build, sell or license bots. Essential Bots do, and have for over seven years.',
  },
  '/track': {
    label: 'Track your project',
    description:
      'Follow a project with the tracking code the studio gave you: the stage it has reached, when it last moved, and what happens next. Works after delivery too.',
  },
  '/block': {
    label: 'Blocked',
    description:
      'A request from this connection was refused by Shield before it reached the application. What matched, the reference to quote, and how to have it lifted.',
  },
  '/docs': {
    label: 'Documentation',
    description:
      'The handover documentation: running a project locally, deploying it, pointing a domain at it, and keeping it going afterwards.',
  },
  '/faq': {
    label: 'FAQ',
    description:
      'What a project costs, how scope is agreed, who owns the result, and how quickly enquiries get answered.',
  },
  '/contact': {
    label: 'Start a project',
    description:
      'Tell us what you need and we’ll scope it before anything starts. Enquiries are answered within two working days.',
  },
  '/apply': {
    label: 'Apply',
    title: 'Join the studio — Amitista Studio',
    description:
      'Apply to work with the studio as a developer, designer, tester, support or moderation. Pick a role, answer the questions, and the people doing that job read it.',
  },
  '/what-we-dont-take-on': {
    label: 'What we don’t take on',
    description:
      'The work this studio turns down, and the reasoning behind each one, so you can tell in a minute whether to write to us.',
  },
  '/legal': {
    label: 'Legal',
    description:
      'Every agreement and policy the studio operates under, each with one line saying what it answers, so you can find the one you need.',
  },
  '/exchange-fees': {
    label: 'Exchange fees',
    title: 'Exchange fees — Amitista Studio',
    description:
      'What a crypto exchange costs, measured against the live desks every fifteen minutes. We add nothing: check any amount and pair yourself.',
  },
  '/admin': {
    label: 'Studio panel',
    description: 'Sign in to the studio panel.',
  },
  '/t': {
    label: 'Transcript',
    description:
      'The full record of a closed ticket or project, kept at the private link the studio sent you: every message, file and decision, in order.',
  },
};

export const PRIVATE_PATHS = new Set(['/admin', '/block', '/t']);

const BY_PATH = new Map();

for (const [path, meta] of Object.entries(PAGES)) {
  if (meta.description.length > 200) {
    throw new Error(
      `routeMeta: the description for ${path} is ${meta.description.length} characters. ` +
        'Written descriptions are not trimmed — shorten it here.',
    );
  }
  BY_PATH.set(path, {
    title: meta.title ?? null,
    label: meta.label ?? null,
    description: meta.description.replace(/\s+/g, ' ').trim(),
  });
}

for (const group of LEGAL_GROUPS) {
  for (const page of group.pages) {
    BY_PATH.set(page.href, { title: null, label: page.label, description: clamp(page.blurb) });
  }
}

for (const doc of DOC_META) {
  BY_PATH.set(`/docs/${doc.slug}`, {
    title: null,
    label: `${doc.title} — Documentation`,
    description: clamp(doc.description),
  });
}

for (const project of PROJECTS) {
  BY_PATH.set(`/work/${project.slug}`, {
    title: null,
    label: project.name,
    description: clamp(`${project.kind}. ${project.summary}`),
  });
}

const seen = new Map();
for (const [path, meta] of BY_PATH) {
  const title = meta.title ?? meta.label;
  if (seen.has(title)) {
    throw new Error(
      `routeMeta: ${seen.get(title)} and ${path} would both be titled "${title}". ` +
        'Two pages with one title cannot be told apart in a search result — ' +
        'distinguish one of them here.',
    );
  }
  seen.set(title, path);
}

export const ROUTE_PATHS = [...BY_PATH.keys()];

export function metaForPath(path, studioName = 'Amitista Studio') {
  const normalised = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;
  const meta = BY_PATH.get(normalised);
  if (!meta) return null;

  return {
    path: normalised,
    title: meta.title ?? `${meta.label} — ${studioName}`,
    description: meta.description,
  };
}

export function labelForPath(path) {
  const normalised = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;
  return BY_PATH.get(normalised)?.label ?? null;
}
