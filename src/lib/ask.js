import { SEARCH_SECTIONS } from '../content/searchIndex';
import { LEGAL_PAGES } from '../content/legal';
import { MAX_QUESTION } from './askLimits';

const ENDPOINT = '/api/ask';
const TIMEOUT = 25000;
const PATH = /\/[a-z0-9][a-z0-9/#-]*/gi;
const SAFE_PATH = /^\/(?!\/)[a-zA-Z0-9][a-zA-Z0-9/#._-]*$/;

const KNOWN = new Set(
  SEARCH_SECTIONS.flatMap((section) => section.items.map((item) => item.href)),
);

const LEGAL_HREFS = new Set(LEGAL_PAGES.map((page) => page.href));

export { MIN_QUESTION, MAX_QUESTION } from './askLimits';
export const HISTORY_TURNS = 2;

const ECHO_ANSWER = 400;
const CITE_TEXT = 120;
const LAST_SECTION = 99;

async function post(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) throw new Error(data?.message || 'The assistant is not available right now.');
    if (!data?.answer) throw new Error('The assistant is not available right now.');

    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The assistant took too long.');
    if (error instanceof TypeError) throw new Error('The assistant is not available right now.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function askAssistant(question) {
  const data = await post({ question });

  return {
    text: data.answer,
    page: typeof data.page === 'string' && SAFE_PATH.test(data.page) ? data.page : '',
  };
}

export async function askLegal(question, history, page) {
  const data = await post({
    question,
    scope: 'legal',
    page: typeof page === 'string' && LEGAL_HREFS.has(page) ? page : '',
    history: (Array.isArray(history) ? history : []).slice(-HISTORY_TURNS).map((turn) => ({
      q: String(turn.question || '').slice(0, MAX_QUESTION),
      a: String(turn.text || '').slice(0, ECHO_ANSWER),
    })),
  });

  return { text: data.answer, cite: readCite(data.cite) };
}

function readCite(cite) {
  if (!cite || typeof cite !== 'object') return null;

  const href = typeof cite.path === 'string' && LEGAL_HREFS.has(cite.path) ? cite.path : '';
  const section = Number(cite.section);

  if (!href) return null;
  if (!Number.isInteger(section) || section < 1 || section > LAST_SECTION) return null;

  return {
    href,
    section,
    title: typeof cite.title === 'string' ? cite.title.slice(0, CITE_TEXT) : '',
    doc: typeof cite.doc === 'string' ? cite.doc.slice(0, CITE_TEXT) : '',
  };
}

export function answerParts(answer) {
  const parts = [];
  let cursor = 0;

  PATH.lastIndex = 0;
  let match = PATH.exec(answer);

  while (match) {
    const href = match[0].replace(/[.,;:)]+$/, '');

    if (KNOWN.has(href)) {
      if (match.index > cursor) parts.push({ text: answer.slice(cursor, match.index) });
      parts.push({ text: href, href });
      cursor = match.index + href.length;
    }

    match = PATH.exec(answer);
  }

  if (cursor < answer.length) parts.push({ text: answer.slice(cursor) });

  return parts;
}
