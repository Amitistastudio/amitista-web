import { Bot, Briefcase, Building2, Globe2, Server, SquareKanban, User } from 'lucide-react';

const PURPOSE_ICONS = {
  personal: User,
  server: Server,
  client: Briefcase,
  bot: Bot,
  site: Globe2,
  studio: Building2,
};

const FALLBACK = { id: 'personal', label: 'Personal', blurb: '', fields: [] };

export function purposeIcon(id) {
  return PURPOSE_ICONS[id] ?? SquareKanban;
}

export function purposeOf(purposes, id) {
  const list = purposes ?? [];
  return list.find((entry) => entry.id === id) ?? list[0] ?? FALLBACK;
}

export function purposeLabel(purposes, id) {
  return purposeOf(purposes, id)?.label ?? FALLBACK.label;
}

export function factFields(purpose) {
  return purpose?.fields ?? [];
}

export function factLabels(purposes) {
  const out = {};
  (purposes ?? []).forEach((entry) =>
    (entry.fields ?? []).forEach((field) => {
      if (!out[field.id]) out[field.id] = field.label;
    }),
  );
  return out;
}

export function keyFields(purpose) {
  return factFields(purpose).filter((field) => field.key);
}

export function restFields(purpose) {
  return factFields(purpose).filter((field) => !field.key);
}

export function filled(purpose, facts) {
  return factFields(purpose).filter((field) => (facts?.[field.id] ?? '').trim()).length;
}

export function strayFacts(purpose, facts) {
  const known = new Set(factFields(purpose).map((field) => field.id));
  return Object.keys(facts ?? {}).filter((key) => !known.has(key) && (facts[key] ?? '').trim());
}

export function prettyDay(value) {
  const at = Date.parse(`${value}T12:00:00Z`);
  if (!Number.isFinite(at)) return value;
  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function prettyLink(value) {
  try {
    const parts = new URL(value);
    return `${parts.host}${parts.pathname === '/' ? '' : parts.pathname}`;
  } catch {
    return value;
  }
}

export function factShown(field, value, facts) {
  const held = (value ?? '').trim();
  if (!held) return null;
  if (field.kind === 'day') return { text: prettyDay(held) };
  if (field.kind === 'link') return { text: prettyLink(held), href: held };
  if (field.kind === 'host') {
    const port = (facts?.port ?? '').trim();
    const joined = port && !held.includes(':') ? `${held}:${port}` : held;
    return { text: joined, copy: joined };
  }
  return { text: held };
}

export function factChips(purpose, facts) {
  const port = (facts?.port ?? '').trim();
  const host = factFields(purpose).some((field) => field.kind === 'host' && (facts?.[field.id] ?? '').trim());
  return factFields(purpose)
    .filter((field) => !(field.id === 'port' && port && host))
    .map((field) => {
      const shown = factShown(field, facts?.[field.id], facts);
      return shown ? { ...shown, id: field.id, label: field.label } : null;
    })
    .filter(Boolean);
}

export function factLead(purpose, facts) {
  const chips = factChips(purpose, facts);
  const keyed = keyFields(purpose).map((field) => field.id);
  return chips.find((chip) => keyed.includes(chip.id)) ?? chips[0] ?? null;
}

export function factHaystack(purposes, board) {
  const purpose = purposeOf(purposes, board?.purpose);
  const values = Object.values(board?.facts ?? {}).join(' ');
  return `${purpose?.label ?? ''} ${board?.purpose ?? ''} ${values}`;
}
