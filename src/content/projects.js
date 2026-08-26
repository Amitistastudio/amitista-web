export const PROJECTS = [
  {
    slug: 'ocean-scanner',
    name: 'Ocean Scanner',
    kind: 'Screenshare and cheat detection',
    period: '2023 — ongoing',

    accent: '#3a63ec',

    summary:
      'A screenshare tool that scans a suspected player’s machine and returns a verdict in about a minute. Used by FiveM, Minecraft and Rust servers.',

    url: 'https://anticheat.ac',
    cover: '/work/ocean-hero.webp',
    shot: '/work/ocean-full.webp',

    owner: 'The Ocean team',
    role: 'Front-end and product design',

    credit:
      'Ocean is not our product. It belongs to the Ocean team and Jean is one of them. It is on this page because it is a real thing you can go and use today, which counts for more than a mockup.',

    facts: [
      { label: 'Launched', value: '4 April 2023' },
      { label: 'Platforms', value: 'GTA V (FiveM), Minecraft Java and Bedrock, Rust' },
      { label: 'Our part', value: 'Dashboard, landing pages, blog, product design' },
      { label: 'Live at', value: 'anticheat.ac' },
    ],

    story: [
      'Ocean is a screenshare tool. Server staff use it to check a suspected player’s machine and come back with a verdict rather than a hunch. It launched on 4 April 2023 as a spare-time project between three friends — free, Minecraft only, and held together with Python, Flask, SQLite and a little Tailwind.',
      'It did not stay that size. Minecraft Bedrock and Rust followed, and then GTA V through FiveM, which is where most of its users are now. Today it runs with thousands of detections behind it, hundreds of clients and updates going out constantly.',
      'The work started as full-stack: the first dashboard on that original stack, and the front-end wrapped around it. It has since moved towards the front-end and product design — the landing pages, the blog and the dashboard people actually log into, designed in Figma and built in React, Astro, Next.js and Tailwind.',
    ],

    stack: [
      { label: 'Now', items: ['React', 'Astro', 'Next.js', 'Tailwind CSS', 'Figma'] },
      { label: 'At launch', items: ['Python', 'Flask', 'SQLite', 'HTML', 'Tailwind CSS'] },
    ],
  },

  {
    slug: 'async',
    name: 'Async',
    kind: 'Anti-cheat scanning and forensics',

    accent: '#ef4444',

    summary:
      'A FiveM scanner in two halves: a native Windows tool that collects forensic evidence from a suspect machine, and a platform that reads those reports and returns a verdict.',

    cover: '/work/async-cover.webp',

    video: {
      id: 'X0A3AmD4fZY',
      title: 'Async showcase',
      poster: '/work/async-cover.webp',
    },

    owner: 'Blxr',
    role: 'All of it — scanner, front-end and back-end',

    credit:
      'Async belongs to Blxr and is ours outright. Every part of it was built here — the scanner, the front-end, the back-end and the Discord bot — with nothing bought in, white-labelled or built on top of somebody else’s product. Jean worked on part of the front-end.',

    facts: [
      { label: 'The scanner', value: 'Native Windows application in C++17 with a Dear ImGui interface' },
      { label: 'The platform', value: 'Express API, React dashboard and Discord bot on SQLite' },
      { label: 'Licence', value: 'Source-available for reference, not open source' },
      { label: 'Access needed', value: 'Scans at administrator level — only on machines you own or may inspect' },
    ],

    story: [
      'Async is a two-part product. The scanner is a native Windows application written in C++17 with a Dear ImGui interface. It runs on the machine under suspicion, collects forensic evidence and uploads a signed report.',
      'The platform is the other half: an Express API, a React dashboard and a Discord bot backed by SQLite. It takes those reports in, runs AI analysis over them and hands back a structured verdict rather than a wall of raw output for somebody to interpret.',
      'It is source-available for reference rather than open source, and it scans at administrator level. That makes it a tool for machines you own or have been given permission to inspect, and for nothing else.',
    ],

    features: [
      'Process, memory and file-system forensics, matched against known cheat and injector families',
      'Windows artifact recovery from Shimcache, Amcache, Prefetch, BAM, SRUM and the NTFS change journal',
      'YARA byte-pattern and imphash matching, on disk and in memory',
      'A browser-extension sweep across six browsers, flagging high-risk permission combinations',
      'Anti-debugging, VM detection and string obfuscation, so the scanner itself is harder to tamper with',
    ],

    stack: [
      { label: 'Scanner', items: ['C++17', 'Win32', 'Dear ImGui'] },
      { label: 'Platform', items: ['Node.js', 'Express', 'React', 'SQLite'] },
    ],
  },

];

export function findProject(slug) {
  return PROJECTS.find((project) => project.slug === slug);
}

export const TOOLS_USED = [
  ...new Set(PROJECTS.flatMap((project) => project.stack.flatMap((group) => group.items))),
];
