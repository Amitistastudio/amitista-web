export const STACK = [
  {
    area: 'Front-end',
    items: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
  },
  {
    area: 'Back-end',
    items: ['Node.js', 'PostgreSQL', 'Redis', 'REST & WebSockets'],
  },
  {
    area: 'Game servers',
    items: ['FiveM', 'Lua', 'ESX / QBCore', 'MySQL'],
  },
  {
    area: 'Design & tooling',
    items: ['Figma', 'Vite', 'Git', 'Docker'],
  },
];

export const TEAM = [
  {
    name: 'Blxr',
    role: 'Developer',
    focus: 'Web applications and the systems behind them',
    avatar: '/team/blxr.webp',
    github: 'kostis4563',
    site: 'https://blxr.net',
  },
  {
    name: 'Jean',
    role: 'Developer',
    focus: 'Interfaces, front-end work and game servers',
    avatar: '/team/jean.webp',
    github: 'j3qn',
    site: 'https://jean.is-a.dev',
  },
  {
    name: 'Wizzard & Lacy',
    role: 'Developers',
    focus: 'General development work across the projects we take on',
    // `focal` is where the subject's face sits in the source image, as a
    // fraction of its width and height. `aim` is the CSS class derived from it
    // (see .pair-aim-* in index.css) — the transform has to live in a real
    // stylesheet because the site's CSP is style-src 'self'.
    people: [
      { name: 'Wizzard', avatar: '/team/wizzard.webp', focal: [0.5, 0.33], aim: 'pair-aim-wizzard' },
      { name: 'Lacy', avatar: '/team/lacy.webp', focal: [0.34, 0.5], aim: 'pair-aim-lacy' },
    ],
    github: '',
    site: '',
  },
];
