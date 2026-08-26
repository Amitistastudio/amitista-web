import { QUESTIONS, defaultAnswers } from '../content/estimate';

const KEY = 'amitista:estimate';

const SEPARATOR = ',';

export function encode(answers) {
  const params = new URLSearchParams();

  for (const question of QUESTIONS) {
    const answer = answers[question.id];
    if (Array.isArray(answer)) {
      if (answer.length) params.set(question.id, answer.join(SEPARATOR));
    } else if (answer) {
      params.set(question.id, answer);
    }
  }

  return params.toString();
}

export function decode(search) {
  const params = new URLSearchParams(search);
  if ([...params.keys()].length === 0) return null;

  const answers = defaultAnswers();

  for (const question of QUESTIONS) {
    const raw = params.get(question.id);
    if (raw === null) continue;

    const valid = (id) => question.options.some((option) => option.id === id);

    if (question.type === 'multi') {
      answers[question.id] = raw.split(SEPARATOR).filter(valid);
    } else if (valid(raw)) {
      answers[question.id] = raw;
    }
  }

  return answers;
}

export function load() {
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored ? decode(stored) : null;
  } catch {
    return null;
  }
}

export function save(answers) {
  try {
    window.localStorage.setItem(KEY, encode(answers));
  } catch {
  }
}

export function clear() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
  }
}
