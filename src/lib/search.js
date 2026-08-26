import { SEARCH_SECTIONS, SEARCH_DEFAULTS } from '../content/searchIndex';

const PER_SECTION = 6;
const TOTAL = 24;

const prepared = new WeakMap();

function prepare(item) {
  const cached = prepared.get(item);
  if (cached) return cached;

  const title = item.title.toLowerCase();
  const subtitle = (item.subtitle || '').toLowerCase();
  const keywords = (item.keywords || '').toLowerCase();
  const value = {
    title,
    subtitle,
    keywords,
    words: words(title),
    subtitleWords: words(subtitle),
    keywordWords: words(keywords),
    initials: initials(title),
  };

  prepared.set(item, value);
  return value;
}

function words(text) {
  const found = [];
  const pattern = /[a-z0-9]+/g;
  let match = pattern.exec(text);

  while (match) {
    found.push({ text: match[0], start: match.index });
    match = pattern.exec(text);
  }

  return found;
}

function initials(text) {
  const list = words(text);
  return {
    letters: list.map((word) => word.text[0]).join(''),
    offsets: list.map((word) => word.start),
  };
}

export function tokenize(query) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function typoBudget(term) {
  if (term.length >= 8) return 2;
  if (term.length >= 4) return 1;
  return 0;
}

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let beforePrevious = null;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;

    for (let j = 1; j <= b.length; j += 1) {
      let cost = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cost = Math.min(cost, beforePrevious[j - 2] + 1);
      }

      current[j] = cost;
      if (cost < rowMin) rowMin = cost;
    }

    if (rowMin > max) return max + 1;

    beforePrevious = previous;
    previous = current;
  }

  return previous[b.length];
}

function nearWord(list, term) {
  const budget = typoBudget(term);
  if (!budget) return null;

  for (const word of list) {
    const target = word.text.length > term.length ? word.text.slice(0, term.length) : word.text;
    if (editDistance(term, target, budget) <= budget) {
      return { start: word.start, end: word.start + word.text.length };
    }
  }

  return null;
}

function subsequence(text, term) {
  const positions = [];
  let from = 0;

  for (const character of term) {
    const index = text.indexOf(character, from);
    if (index === -1) return null;
    positions.push(index);
    from = index + 1;
  }

  const span = positions[positions.length - 1] - positions[0] + 1;
  return { positions, density: term.length / span };
}

function scoreTerm(fields, term) {
  if (fields.title.startsWith(term)) return 100;

  for (const word of fields.words) {
    if (word.text.startsWith(term)) return 80;
  }

  if (fields.title.includes(term)) return 55;

  if (term.length >= 2 && fields.initials.letters.includes(term)) return 70;

  const near = nearWord(fields.words, term);
  if (near) return 45;

  for (const word of fields.subtitleWords) {
    if (word.text.startsWith(term)) return 30;
  }

  if (fields.subtitle.includes(term)) return 20;

  for (const word of fields.keywordWords) {
    if (word.text.startsWith(term)) return 25;
  }

  if (fields.keywords.includes(term)) return 12;

  if (nearWord(fields.keywordWords, term)) return 8;

  if (term.length >= 3) {
    const loose = subsequence(fields.title, term);
    if (loose && loose.density >= 0.34) return 10 + loose.density * 15;

    const inSubtitle = subsequence(fields.subtitle, term);
    if (inSubtitle && inSubtitle.density >= 0.5) return 6;
  }

  return 0;
}

function scoreItem(item, terms) {
  const fields = prepare(item);
  let total = 0;

  for (const term of terms) {
    const score = scoreTerm(fields, term);
    if (!score) return 0;
    total += score;
  }

  return total - fields.title.length * 0.02;
}

export function highlightRanges(text, terms) {
  if (!text || !terms.length) return [];

  const lower = text.toLowerCase();
  const list = words(lower);
  const ranges = [];

  for (const term of terms) {
    const index = lower.indexOf(term);

    if (index !== -1) {
      ranges.push([index, index + term.length]);
      continue;
    }

    const near = nearWord(list, term);
    if (near) {
      ranges.push([near.start, near.end]);
      continue;
    }

    const acronym = initials(lower);
    const start = acronym.letters.indexOf(term);
    if (term.length >= 2 && start !== -1) {
      for (let i = 0; i < term.length; i += 1) {
        ranges.push([acronym.offsets[start + i], acronym.offsets[start + i] + 1]);
      }
      continue;
    }

    if (term.length >= 3) {
      const loose = subsequence(lower, term);
      if (loose && loose.density >= 0.34) {
        for (const position of loose.positions) ranges.push([position, position + 1]);
      }
    }
  }

  return merge(ranges);
}

function merge(ranges) {
  if (ranges.length < 2) return ranges;

  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0]];

  for (const [start, end] of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }

  return merged;
}

const PAGES_BONUS = 15;

export function buildSections(query, recents = []) {
  const terms = tokenize(query);

  if (!terms.length) return defaultSections(recents);

  let remaining = TOTAL;

  return SEARCH_SECTIONS.map((section, order) => {
    const scored = section.items
      .map((item) => ({ item, score: scoreItem(item, terms) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, PER_SECTION);

    return {
      ...section,
      order,
      best: (scored[0]?.score ?? 0) + (order === 0 ? PAGES_BONUS : 0),
      items: scored.map(({ item }) => item),
    };
  })
    .filter((section) => section.items.length > 0)
    .sort((a, b) => b.best - a.best || a.order - b.order)
    .map((section) => {
      const items = section.items.slice(0, Math.max(0, remaining));
      remaining -= items.length;
      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);
}

function defaultSections(recents) {
  const pages = SEARCH_SECTIONS[0].items;
  const recentItems = recents.slice(0, 4);
  const seen = new Set(recentItems.map((item) => item.href));

  const jumpTo = SEARCH_DEFAULTS.map((href) => pages.find((page) => page.href === href))
    .filter(Boolean)
    .filter((page) => !seen.has(page.href));

  return [
    recentItems.length && {
      label: 'Recent',
      icon: 'clock',
      clearable: true,
      items: recentItems,
    },
    jumpTo.length && { label: 'Jump to', icon: 'file', items: jumpTo },
  ].filter(Boolean);
}

export function nearestItem(query) {
  const terms = tokenize(query);
  if (!terms.length) return null;

  let best = null;
  let bestScore = 0;

  for (const section of SEARCH_SECTIONS) {
    for (const item of section.items) {
      const fields = prepare(item);
      let score = 0;
      for (const term of terms) score += scoreTerm(fields, term);

      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
  }

  return bestScore >= 45 ? best : null;
}
