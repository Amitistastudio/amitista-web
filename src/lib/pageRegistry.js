import React from 'react';

const loaders = new Map();
const resolved = new Map();

export function page(key, loader) {
  if (loaders.has(key)) {
    throw new Error(`duplicate page key ${key} — every route chunk needs its own`);
  }
  loaders.set(key, loader);

  const Lazy = React.lazy(loader);

  function Page(props) {
    return React.createElement(resolved.get(key) ?? Lazy, props);
  }
  Page.displayName = `Page(${key})`;
  Page.pageKey = key;
  return Page;
}

export function pageKeys() {
  return [...loaders.keys()];
}

export function isResolved(key) {
  return resolved.has(key);
}

export async function preloadPage(key) {
  const loader = loaders.get(key);
  if (!loader || resolved.has(key)) return;
  const mod = await loader();
  if (!mod?.default) {
    throw new Error(`page ${key} has no default export`);
  }
  resolved.set(key, mod.default);
}
