import { useEffect, useState } from 'react';

const ENDPOINT = '/api/maintenance';
const STORAGE_KEY = 'amitista-maintenance';
const TIMEOUT_MS = 5000;
const TTL_MS = 30000;
const MODES = new Set(['maintenance', 'closed']);
const NEVER_COVERED = new Set(['/admin', '/block']);

let held = null;
let heldAt = 0;
let inflight = null;

function remembered() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function remember(pages) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch {
    return;
  }
}

function signal() {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    return AbortSignal.timeout(TIMEOUT_MS);
  }
  return undefined;
}

async function fetchFeed() {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      signal: signal(),
      headers: { Accept: 'application/json' },
    });
  } catch {
    return held ?? remembered() ?? {};
  }
  if (!response.ok) return held ?? remembered() ?? {};
  const body = await response.json().catch(() => null);
  const pages = body && body.pages && typeof body.pages === 'object' ? body.pages : {};
  held = pages;
  heldAt = Date.now();
  remember(pages);
  return pages;
}

function readFeed(force = false) {
  if (!force && held && Date.now() - heldAt < TTL_MS) return Promise.resolve(held);
  if (!inflight) {
    inflight = fetchFeed().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export const POLL_MS = 30000;

export function useCountdown(until) {
  const [words, setWords] = useState(null);

  useEffect(() => {
    if (!until) {
      setWords(null);
      return undefined;
    }
    const update = () => {
      const left = Date.parse(until) - Date.now();
      if (!Number.isFinite(left)) {
        setWords(null);
        return;
      }
      if (left <= 0) {
        setWords('any moment now');
        return;
      }
      const seconds = Math.floor(left / 1000);
      if (seconds >= 172800) setWords(`${Math.floor(seconds / 86400)} days`);
      else if (seconds >= 7200) setWords(`${Math.floor(seconds / 3600)} hours`);
      else if (seconds >= 3600) setWords(`1h ${Math.floor((seconds % 3600) / 60)}m`);
      else if (seconds >= 60) setWords(`${Math.floor(seconds / 60)}m ${seconds % 60}s`);
      else setWords(`${seconds}s`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [until]);

  return words;
}

export function useMaintenance(path) {
  const [entry, setEntry] = useState(null);

  useEffect(() => {
    if (NEVER_COVERED.has(path)) {
      setEntry(null);
      return undefined;
    }
    const pick = (pages) => {
      const record = pages ? pages[path] : null;
      return record && MODES.has(record.mode) ? record : null;
    };
    const known = held ?? remembered();
    if (known) setEntry(pick(known));
    let cancelled = false;
    readFeed().then((pages) => {
      if (cancelled) return;
      setEntry(pick(pages));
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    if (!entry || NEVER_COVERED.has(path)) return undefined;
    let cancelled = false;
    const again = () => {
      if (document.hidden) return;
      readFeed(true).then((pages) => {
        if (cancelled) return;
        const record = pages ? pages[path] : null;
        setEntry(record && MODES.has(record.mode) ? record : null);
      });
    };
    const timer = setInterval(again, POLL_MS);
    document.addEventListener('visibilitychange', again);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', again);
    };
  }, [entry, path]);

  return entry;
}
