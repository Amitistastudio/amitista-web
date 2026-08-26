import { APPLY_ENDPOINT } from '../siteConfig';

export const SENT = 'sent';
export const UNAVAILABLE = 'unavailable';

export async function submitApplication(payload) {
  if (!APPLY_ENDPOINT) return UNAVAILABLE;

  let response;
  try {
    response = await fetch(APPLY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return UNAVAILABLE;
  }

  if (response.ok) return SENT;

  if ([404, 502, 503, 504].includes(response.status)) return UNAVAILABLE;

  const result = await response.json().catch(() => ({}));
  throw new Error(
    response.status === 429
      ? 'too many applications from this connection, try again later'
      : result.message || `request failed (${response.status})`,
  );
}
