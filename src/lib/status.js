const TIMEOUT_MS = 8000;

export const LOADING = 'loading';
export const READY = 'ready';
export const UNAVAILABLE = 'unavailable';

const DAY_STATES = new Set(['up', 'down', 'partial', 'none']);

function coerceDay(day) {
  if (!day || typeof day !== 'object') return null;
  const state = DAY_STATES.has(day.s) ? day.s : 'none';
  return {
    date: typeof day.d === 'string' ? day.d : '',
    state,
    up: Number.isFinite(day.u) ? day.u : 0,
    total: Number.isFinite(day.t) ? day.t : 0,
  };
}

function coerceCheck(check) {
  if (!check || typeof check !== 'object') return null;
  if (typeof check.id !== 'string' || typeof check.name !== 'string') return null;

  return {
    id: check.id,
    name: check.name,
    detail: typeof check.detail === 'string' ? check.detail : '',
    status: check.status === 'up' || check.status === 'down' ? check.status : 'unknown',
    uptime: Number.isFinite(check.uptime) ? check.uptime : null,
    samples: Number.isFinite(check.samples) ? check.samples : 0,
    days: Array.isArray(check.days) ? check.days.map(coerceDay).filter(Boolean) : [],
  };
}

function coercePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const checks = Array.isArray(payload.checks) ? payload.checks.map(coerceCheck).filter(Boolean) : [];
  if (checks.length === 0) return null;

  return {
    generated: typeof payload.generated === 'string' ? payload.generated : null,
    checked: typeof payload.checked === 'string' ? payload.checked : null,
    windowDays: Number.isFinite(payload.windowDays) ? payload.windowDays : 90,
    intervalSeconds: Number.isFinite(payload.intervalSeconds) ? payload.intervalSeconds : 300,
    overall: ['operational', 'degraded', 'down', 'unknown'].includes(payload.overall)
      ? payload.overall
      : 'unknown',
    checks,
  };
}

export function statusPreviewMode() {
  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('preview')) return null;
  return params.get('preview') === 'fresh' ? 'fresh' : 'full';
}

export function isStatusPreview() {
  return statusPreviewMode() !== null;
}

export async function fetchStatus() {
  if (import.meta.env.DEV && isStatusPreview()) {
    const { previewPayload } = await import('./statusPreview.js');
    return coercePayload(previewPayload(new Date(), statusPreviewMode()));
  }

  const signal =
    typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(TIMEOUT_MS)
      : undefined;

  let response;
  try {
    response = await fetch('/api/status', { signal, headers: { Accept: 'application/json' } });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let payload;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  return coercePayload(payload);
}

export function relativeTime(iso, now = Date.now()) {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;

  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
