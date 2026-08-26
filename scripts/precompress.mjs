import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.svg', '.json', '.xml', '.txt']);

const MIN_BYTES = 1024;

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const dist = 'dist';

try {
  await fs.access(dist);
} catch {
  console.error('[precompress] no dist/ — run the build first.');
  process.exit(1);
}

let files = 0;
let raw = 0;
let br = 0;
let gz = 0;

for await (const file of walk(dist)) {
  if (file.endsWith('.br') || file.endsWith('.gz')) continue;
  if (!COMPRESSIBLE.has(path.extname(file))) continue;

  const source = await fs.readFile(file);
  if (source.length < MIN_BYTES) continue;

  const [brBuf, gzBuf] = await Promise.all([
    brotli(source, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.length,
      },
    }),
    gzip(source, { level: zlib.constants.Z_BEST_COMPRESSION }),
  ]);

  if (brBuf.length < source.length) await fs.writeFile(`${file}.br`, brBuf);
  if (gzBuf.length < source.length) await fs.writeFile(`${file}.gz`, gzBuf);

  files += 1;
  raw += source.length;
  br += Math.min(brBuf.length, source.length);
  gz += Math.min(gzBuf.length, source.length);
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(
  `[precompress] ${files} files: ${kb(raw)} raw, ${kb(gz)} gzip, ${kb(br)} brotli ` +
    `(${Math.round((1 - br / raw) * 100)}% off the wire, ${Math.round((1 - br / gz) * 100)}% under gzip)`,
);
