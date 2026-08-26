import { createContext } from 'react';

export const PathContext = createContext(null);

export function normalizePath(pathname) {
  const trimmed = pathname.toLowerCase().replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function initialPath() {
  return typeof window === 'undefined' ? '/' : normalizePath(window.location.pathname);
}
