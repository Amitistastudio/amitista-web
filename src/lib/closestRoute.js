import { SEARCH_SECTIONS } from '../content/searchIndex';

function slugify(title) {
  return `/${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

const CANDIDATES = SEARCH_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({
    href: item.href.split('#')[0],
    keys: [item.href.split('#')[0], slugify(item.title)],
  })),
).filter((candidate) => candidate.href !== '/');

function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[b.length];
}

function keyScore(target, key) {
  if (key.startsWith(target)) return 0.5;
  if (target.startsWith(key)) return 1;
  return distance(target, key);
}

export function closestRoute(path) {
  const target = (path || '').toLowerCase().replace(/\/+$/, '');
  if (!target || target === '/') return null;

  let best = null;
  let bestScore = Infinity;

  for (const candidate of CANDIDATES) {
    const score = Math.min(...candidate.keys.map((key) => keyScore(target, key)));

    if (score < bestScore) {
      bestScore = score;
      best = candidate.href;
    }
  }

  const tolerance = Math.max(2, Math.ceil(target.length / 3));
  return bestScore <= tolerance ? best : null;
}
