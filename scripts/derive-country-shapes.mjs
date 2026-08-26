import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';

const SOURCE = `${BASE}/ne_110m_admin_0_countries.geojson`;

const POINT_SOURCES = [
  `${BASE}/ne_110m_admin_0_tiny_countries.geojson`,
  `${BASE}/ne_110m_populated_places_simple.geojson`,
];

const EXTRA_POINTS = {
  MO: [113.55, 22.2],
};

const SMALL_SPAN = 7;

const WIDTH = 1000;
const TOP_LAT = 84;
const BOTTOM_LAT = -56;
const HEIGHT = Math.round(((TOP_LAT - BOTTOM_LAT) / 360) * WIDTH);

const TOLERANCE = 0.45;
const MIN_RING_SPAN = 1.6;
const SKIP = new Set(['AQ']);

const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'content',
  'countryShapes.js',
);

function project([lon, lat]) {
  const x = ((lon + 180) / 360) * WIDTH;
  const y = ((TOP_LAT - lat) / 360) * WIDTH;
  return [x, Math.min(HEIGHT, Math.max(0, y))];
}

function farthest(points, first, last) {
  const [ax, ay] = points[first];
  const [bx, by] = points[last];
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  let index = -1;
  let worst = 0;

  for (let i = first + 1; i < last; i += 1) {
    const [px, py] = points[i];
    const gap =
      length === 0
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
    if (gap > worst) {
      worst = gap;
      index = i;
    }
  }
  return { index, worst };
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    if (last - first < 2) continue;
    const { index, worst } = farthest(points, first, last);
    if (index > 0 && worst > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((unused, index) => keep[index] === 1);
}

function span(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return Math.max(maxX - minX, maxY - minY);
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function ringPath(points) {
  const parts = [];
  let previous = null;
  for (const point of points) {
    const x = round(point[0]);
    const y = round(point[1]);
    if (previous && previous[0] === x && previous[1] === y) continue;
    parts.push(previous === null ? `M${x} ${y}` : `L${x} ${y}`);
    previous = [x, y];
  }
  if (parts.length < 3) return null;
  return `${parts.join('')}Z`;
}

function ringsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((rings) => rings[0]);
  return [];
}

const response = await fetch(SOURCE);
if (!response.ok) {
  throw new Error(`country shapes: ${SOURCE} returned ${response.status}`);
}
const geo = await response.json();

const shapes = {};
const centres = {};
const small = new Set();
let dropped = 0;

for (const feature of geo.features) {
  const properties = feature.properties ?? {};
  const candidates = [properties.ISO_A2, properties.ISO_A2_EH, properties.WB_A2];
  const code = candidates.find((value) => typeof value === 'string' && /^[A-Z]{2}$/.test(value));
  if (!code || SKIP.has(code)) continue;

  const rings = ringsOf(feature.geometry ?? {}).map((ring) => ring.map(project));
  if (rings.length === 0) continue;

  const ordered = [...rings].sort((left, right) => span(right) - span(left));
  const parts = [];
  let weightedX = 0;
  let weightedY = 0;
  let weight = 0;

  for (const ring of ordered) {
    const size = span(ring);
    if (parts.length > 0 && size < MIN_RING_SPAN) {
      dropped += 1;
      continue;
    }
    const drawn = ringPath(simplify(ring, TOLERANCE));
    if (!drawn) continue;
    parts.push(drawn);

    let sumX = 0;
    let sumY = 0;
    for (const [x, y] of ring) {
      sumX += x;
      sumY += y;
    }
    const share = size * size;
    weightedX += (sumX / ring.length) * share;
    weightedY += (sumY / ring.length) * share;
    weight += share;
  }

  if (parts.length === 0) continue;
  const existing = shapes[code];
  shapes[code] = existing ? existing + parts.join('') : parts.join('');
  if (weight > 0 && !centres[code]) {
    centres[code] = [round(weightedX / weight), round(weightedY / weight)];
  }
  if (span(ordered[0]) < SMALL_SPAN) small.add(code);
}

for (const url of POINT_SOURCES) {
  const answer = await fetch(url);
  if (!answer.ok) throw new Error(`country shapes: ${url} returned ${answer.status}`);
  const layer = await answer.json();
  for (const feature of layer.features ?? []) {
    const properties = feature.properties ?? {};
    const code = properties.ISO_A2 ?? properties.iso_a2 ?? properties.ISO_A2_EH;
    if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) continue;
    if (shapes[code] || centres[code]) continue;
    const point = feature.geometry?.coordinates;
    if (!Array.isArray(point) || point.length < 2) continue;
    const [x, y] = project(point);
    centres[code] = [round(x), round(y)];
  }
}

for (const [code, point] of Object.entries(EXTRA_POINTS)) {
  if (shapes[code] || centres[code]) continue;
  const [x, y] = project(point);
  centres[code] = [round(x), round(y)];
}

const count = Object.keys(shapes).length;
if (count < 140) {
  throw new Error(`country shapes: only ${count} countries came out, which is not a world map`);
}
for (const code of ['US', 'DE', 'BR', 'IN', 'AU', 'ZA', 'JP', 'GB']) {
  if (!shapes[code]) throw new Error(`country shapes: ${code} is missing`);
}

const entries = Object.keys(shapes)
  .sort()
  .map((code) => `  ${code}: '${shapes[code]}',`)
  .join('\n');

const marks = Object.keys(centres)
  .sort()
  .map((code) => `  ${code}: [${centres[code][0]}, ${centres[code][1]}],`)
  .join('\n');

const file = `export const MAP_WIDTH = ${WIDTH};
export const MAP_HEIGHT = ${HEIGHT};

export const COUNTRY_SHAPES = {
${entries}
};

export const COUNTRY_CENTRES = {
${marks}
};

export const COUNTRY_SMALL = new Set([${[...small]
  .sort()
  .map((code) => `'${code}'`)
  .join(', ')}]);
`;

await writeFile(OUT, file);

const size = Buffer.byteLength(file);
process.stdout.write(
  `[country-shapes] ${count} countries, ${dropped} small islands dropped, ` +
    `${(size / 1024).toFixed(1)} kB into src/content/countryShapes.js\n`,
);
