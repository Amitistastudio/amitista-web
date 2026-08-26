import React from 'react';
import { DOC_META } from './docsMeta';

const GROUP_MODULES = {
  'API': () => import('./docs/api.jsx'),
  'Content': () => import('./docs/content.jsx'),
  'Design': () => import('./docs/design.jsx'),
  'Getting started': () => import('./docs/getting-started.jsx'),
  'Guides': () => import('./docs/guides.jsx'),
  'Operations': () => import('./docs/operations.jsx'),
  'Policies': () => import('./docs/policies.jsx'),
  'Project types': () => import('./docs/project-types.jsx'),
  'Reference': () => import('./docs/reference.jsx'),
  'Support': () => import('./docs/support.jsx'),
};

const RESOLVED = new Map();

const LAZY = new Map();

const groupOf = (slug) => DOC_META.find((page) => page.slug === slug)?.group;

function loadGroup(slug) {
  const load = GROUP_MODULES[groupOf(slug)];

  if (!load) return Promise.resolve({ default: () => null });

  return load().then((module) => {
    for (const [key, body] of Object.entries(module.DOC_BODIES)) {
      RESOLVED.set(key, body);
    }
    return { default: module.DOC_BODIES[slug] ?? (() => null) };
  });
}

export function docBody(slug) {
  const resolved = RESOLVED.get(slug);
  if (resolved) return resolved;

  if (!LAZY.has(slug)) LAZY.set(slug, React.lazy(() => loadGroup(slug)));
  return LAZY.get(slug);
}

export function docIndexFor(slug) {
  return Math.max(
    0,
    DOC_META.findIndex((page) => page.slug === slug),
  );
}

export async function preloadDocBody(slug) {
  const wanted = DOC_META[docIndexFor(slug)].slug;
  if (RESOLVED.has(wanted)) return;
  const module = await loadGroup(wanted);
  if (!RESOLVED.has(wanted)) RESOLVED.set(wanted, module.default);
}
