const KEY = 'amitista:recent-pages';
const LIMIT = 4;

function read() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item.href === 'string' && typeof item.title === 'string')
      .slice(0, LIMIT);
  } catch {
    return [];
  }
}

function write(items) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
  }
}

export function recentPages() {
  return read();
}

export function rememberPage(item) {
  const entry = { title: item.title, subtitle: item.subtitle || '', href: item.href };
  const rest = read().filter((existing) => existing.href !== entry.href);
  write([entry, ...rest].slice(0, LIMIT));
}

export function clearRecentPages() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
  }
}
