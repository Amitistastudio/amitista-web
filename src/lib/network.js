import { HOSTING_COORDS } from '../siteConfig';

const PROBE_URL = '/ping.txt';

const KM_PER_SECOND_IN_FIBRE = 204_000;

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lightFloorMs(km) {
  return (2 * km) / KM_PER_SECOND_IN_FIBRE * 1000;
}

const ZONE_COORDS = {
  'Europe/London': { lat: 51.51, lon: -0.13, label: 'London' },
  'Europe/Dublin': { lat: 53.35, lon: -6.26, label: 'Dublin' },
  'Europe/Lisbon': { lat: 38.72, lon: -9.14, label: 'Lisbon' },
  'Europe/Madrid': { lat: 40.42, lon: -3.7, label: 'Madrid' },
  'Europe/Paris': { lat: 48.86, lon: 2.35, label: 'Paris' },
  'Europe/Brussels': { lat: 50.85, lon: 4.35, label: 'Brussels' },
  'Europe/Amsterdam': { lat: 52.37, lon: 4.9, label: 'Amsterdam' },
  'Europe/Berlin': { lat: 52.52, lon: 13.4, label: 'Berlin' },
  'Europe/Zurich': { lat: 47.38, lon: 8.54, label: 'Zurich' },
  'Europe/Vienna': { lat: 48.21, lon: 16.37, label: 'Vienna' },
  'Europe/Rome': { lat: 41.9, lon: 12.5, label: 'Rome' },
  'Europe/Prague': { lat: 50.08, lon: 14.44, label: 'Prague' },
  'Europe/Warsaw': { lat: 52.23, lon: 21.01, label: 'Warsaw' },
  'Europe/Budapest': { lat: 47.5, lon: 19.04, label: 'Budapest' },
  'Europe/Bucharest': { lat: 44.43, lon: 26.11, label: 'Bucharest' },
  'Europe/Athens': { lat: 37.98, lon: 23.73, label: 'Athens' },
  'Europe/Stockholm': { lat: 59.33, lon: 18.07, label: 'Stockholm' },
  'Europe/Oslo': { lat: 59.91, lon: 10.75, label: 'Oslo' },
  'Europe/Copenhagen': { lat: 55.68, lon: 12.57, label: 'Copenhagen' },
  'Europe/Helsinki': { lat: 60.17, lon: 24.94, label: 'Helsinki' },
  'Europe/Kyiv': { lat: 50.45, lon: 30.52, label: 'Kyiv' },
  'Europe/Kiev': { lat: 50.45, lon: 30.52, label: 'Kyiv' },
  'Europe/Istanbul': { lat: 41.01, lon: 28.98, label: 'Istanbul' },
  'Europe/Moscow': { lat: 55.76, lon: 37.62, label: 'Moscow' },
  'Atlantic/Canary': { lat: 28.29, lon: -16.62, label: 'the Canaries' },

  'America/New_York': { lat: 40.71, lon: -74.01, label: 'New York' },
  'America/Toronto': { lat: 43.65, lon: -79.38, label: 'Toronto' },
  'America/Chicago': { lat: 41.88, lon: -87.63, label: 'Chicago' },
  'America/Denver': { lat: 39.74, lon: -104.98, label: 'Denver' },
  'America/Phoenix': { lat: 33.45, lon: -112.07, label: 'Phoenix' },
  'America/Los_Angeles': { lat: 34.05, lon: -118.24, label: 'Los Angeles' },
  'America/Vancouver': { lat: 49.28, lon: -123.12, label: 'Vancouver' },
  'America/Mexico_City': { lat: 19.43, lon: -99.13, label: 'Mexico City' },
  'America/Bogota': { lat: 4.71, lon: -74.07, label: 'Bogotá' },
  'America/Lima': { lat: -12.05, lon: -77.04, label: 'Lima' },
  'America/Santiago': { lat: -33.45, lon: -70.67, label: 'Santiago' },
  'America/Sao_Paulo': { lat: -23.55, lon: -46.63, label: 'São Paulo' },
  'America/Argentina/Buenos_Aires': { lat: -34.6, lon: -58.38, label: 'Buenos Aires' },

  'Africa/Casablanca': { lat: 33.57, lon: -7.59, label: 'Casablanca' },
  'Africa/Lagos': { lat: 6.52, lon: 3.38, label: 'Lagos' },
  'Africa/Cairo': { lat: 30.04, lon: 31.24, label: 'Cairo' },
  'Africa/Nairobi': { lat: -1.29, lon: 36.82, label: 'Nairobi' },
  'Africa/Johannesburg': { lat: -26.2, lon: 28.05, label: 'Johannesburg' },

  'Asia/Jerusalem': { lat: 31.78, lon: 35.22, label: 'Jerusalem' },
  'Asia/Dubai': { lat: 25.2, lon: 55.27, label: 'Dubai' },
  'Asia/Riyadh': { lat: 24.71, lon: 46.68, label: 'Riyadh' },
  'Asia/Karachi': { lat: 24.86, lon: 67.01, label: 'Karachi' },
  'Asia/Kolkata': { lat: 22.57, lon: 88.36, label: 'Kolkata' },
  'Asia/Calcutta': { lat: 22.57, lon: 88.36, label: 'Kolkata' },
  'Asia/Dhaka': { lat: 23.81, lon: 90.41, label: 'Dhaka' },
  'Asia/Bangkok': { lat: 13.76, lon: 100.5, label: 'Bangkok' },
  'Asia/Jakarta': { lat: -6.21, lon: 106.85, label: 'Jakarta' },
  'Asia/Singapore': { lat: 1.35, lon: 103.82, label: 'Singapore' },
  'Asia/Manila': { lat: 14.6, lon: 120.98, label: 'Manila' },
  'Asia/Hong_Kong': { lat: 22.32, lon: 114.17, label: 'Hong Kong' },
  'Asia/Shanghai': { lat: 31.23, lon: 121.47, label: 'Shanghai' },
  'Asia/Seoul': { lat: 37.57, lon: 126.98, label: 'Seoul' },
  'Asia/Tokyo': { lat: 35.68, lon: 139.69, label: 'Tokyo' },

  'Australia/Perth': { lat: -31.95, lon: 115.86, label: 'Perth' },
  'Australia/Adelaide': { lat: -34.93, lon: 138.6, label: 'Adelaide' },
  'Australia/Brisbane': { lat: -27.47, lon: 153.03, label: 'Brisbane' },
  'Australia/Melbourne': { lat: -37.81, lon: 144.96, label: 'Melbourne' },
  'Australia/Sydney': { lat: -33.87, lon: 151.21, label: 'Sydney' },
  'Pacific/Auckland': { lat: -36.85, lon: 174.76, label: 'Auckland' },
};

export function guessVisitor() {
  let zone = null;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
  }

  const known = zone ? ZONE_COORDS[zone] : null;
  if (known) return { ...known, zone, precision: 'city' };

  const offsetHours = -new Date().getTimezoneOffset() / 60;
  const lon = Math.max(-180, Math.min(180, offsetHours * 15));

  return {
    lat: 30,
    lon,
    label: zone ? zone.split('/').pop().replace(/_/g, ' ') : 'your meridian',
    zone,
    precision: 'offset',
  };
}

export const SERVER = { ...HOSTING_COORDS };

export function summarise(samples) {
  if (samples.length === 0) return null;

  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];

  let jitter = 0;
  for (let i = 1; i < samples.length; i += 1) jitter += Math.abs(samples[i] - samples[i - 1]);
  jitter = samples.length > 1 ? jitter / (samples.length - 1) : 0;

  return { min: sorted[0], median, max: sorted[sorted.length - 1], jitter, count: samples.length };
}

export async function runProbe({ samples = 12, warmups = 2, onSample, signal } = {}) {
  const results = [];

  for (let i = 0; i < samples + warmups; i += 1) {
    if (signal?.aborted) break;

    const url = `${PROBE_URL}?t=${i}-${performance.now().toString(36)}`;

    const started = performance.now();
    try {
      const response = await fetch(url, { cache: 'no-store', signal });
      await response.arrayBuffer();
      if (!response.ok) throw new Error(String(response.status));
    } catch {
      if (signal?.aborted) break;
      onSample?.({ index: i, ms: null, warmup: i < warmups, failed: true });
      continue;
    }
    const ms = performance.now() - started;

    const warmup = i < warmups;
    if (!warmup) results.push(ms);
    onSample?.({ index: i, ms, warmup, failed: false });
  }

  return results;
}

export function connectionTiming() {
  const [entry] = performance.getEntriesByType?.('navigation') ?? [];
  if (!entry || entry.type === 'back_forward') return null;

  const dns = entry.domainLookupEnd - entry.domainLookupStart;
  const tcp = entry.connectEnd - entry.connectStart;
  const tls =
    entry.secureConnectionStart > 0 ? entry.connectEnd - entry.secureConnectionStart : 0;

  return {
    dns,
    tcp: Math.max(0, tcp - tls),
    tls,
    ttfb: entry.responseStart - entry.requestStart,
    download: entry.responseEnd - entry.responseStart,
    total: entry.responseEnd - entry.startTime,
    transferred: entry.transferSize ?? 0,
    encoded: entry.encodedBodySize ?? 0,
    decoded: entry.decodedBodySize ?? 0,
    reused: dns === 0 && tcp === 0,
    protocol: entry.nextHopProtocol || null,
  };
}
