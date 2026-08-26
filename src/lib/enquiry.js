import { CONTACT_ENDPOINT } from '../siteConfig';

export const SENT = 'sent';
export const UNAVAILABLE = 'unavailable';

export async function submitEnquiry(payload) {
  if (!CONTACT_ENDPOINT) return UNAVAILABLE;

  let response;
  try {
    response = await fetch(CONTACT_ENDPOINT, {
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
      ? 'too many messages, try again in a minute'
      : result.message || `request failed (${response.status})`,
  );
}
