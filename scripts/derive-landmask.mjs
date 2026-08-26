import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson';

const WIDTH = 256;
const HEIGHT = 128;

const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'content',
  'landMask.js',
);

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function inPolygon(lon, lat, rings) {
  if (!inRing(lon, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (inRing(lon, lat, rings[i])) return false;
  }
  return true;
}

const response = await fetch(SOURCE);
if (!response.ok) {
  throw new Error(`landmask: ${SOURCE} returned ${response.status}`);
}
const geo = await response.json();

const polygons = [];
for (const feature of geo.features) {
  const { type, coordinates } = feature.geometry;
  if (type === 'Polygon') polygons.push(coordinates);
  else if (type === 'MultiPolygon') polygons.push(...coordinates);
}

const boxes = polygons.map((rings) => {
  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;
  for (const [lon, lat] of rings[0]) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, maxLon, minLat, maxLat };
});

const bytes = new Uint8Array((WIDTH * HEIGHT) / 8);
let landCells = 0;

for (let y = 0; y < HEIGHT; y += 1) {
  const lat = 90 - ((y + 0.5) / HEIGHT) * 180;
  for (let x = 0; x < WIDTH; x += 1) {
    const lon = ((x + 0.5) / WIDTH) * 360 - 180;

    let land = false;
    for (let i = 0; i < polygons.length; i += 1) {
      const box = boxes[i];
      if (lon < box.minLon || lon > box.maxLon || lat < box.minLat || lat > box.maxLat) continue;
      if (inPolygon(lon, lat, polygons[i])) {
        land = true;
        break;
      }
    }

    if (land) {
      const bit = y * WIDTH + x;
      bytes[bit >> 3] |= 0x80 >> (bit & 7);
      landCells += 1;
    }
  }
}

const share = landCells / (WIDTH * HEIGHT);
if (share < 0.15 || share > 0.55) {
  throw new Error(
    `landmask: ${(share * 100).toFixed(1)}% of the grid came out as land, which is not a planet. ` +
      'Check that the source layer is still ne_110m_land.',
  );
}

const base64 = Buffer.from(bytes).toString('base64');

const file = `
export const LAND_MASK_WIDTH = ${WIDTH};
export const LAND_MASK_HEIGHT = ${HEIGHT};

const PACKED =
  '${base64}';

let bits = null;

export function isLand(lat, lon) {
  if (!bits) {
    const binary = atob(PACKED);
    bits = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bits[i] = binary.charCodeAt(i);
  }

  const y = Math.min(
    LAND_MASK_HEIGHT - 1,
    Math.max(0, Math.floor(((90 - lat) / 180) * LAND_MASK_HEIGHT)),
  );
  const x = ((Math.floor(((lon + 180) / 360) * LAND_MASK_WIDTH) % LAND_MASK_WIDTH) +
    LAND_MASK_WIDTH) %
    LAND_MASK_WIDTH;

  const bit = y * LAND_MASK_WIDTH + x;
  return (bits[bit >> 3] & (0x80 >> (bit & 7))) !== 0;
}
`;

await writeFile(OUT, file);

console.log(
  `landmask: ${WIDTH}×${HEIGHT}, ${landCells} land cells (${(share * 100).toFixed(1)}%), ` +
    `${base64.length} chars → src/content/landMask.js`,
);
