import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

const SOURCES = ['public/work', 'public/team', 'public/partners'];
const SOURCE_EXT = new Set(['.webp', '.png', '.jpg', '.jpeg']);

const OUT_DIR = 'public/img';

const MANIFEST = 'src/content/imageManifest.js';

const LADDER = [400, 640, 960, 1280, 1600, 2000];

const WEBP_QUALITY = 78;
const AVIF_QUALITY = 50;

const AVIF_EFFORT = 6;

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function writeHashed(base, width, ext, buffer) {
  const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 8);
  const name = `${base}-${width}w.${digest}${ext}`;
  await fs.writeFile(path.join(OUT_DIR, name), buffer);
  return { url: `/${path.posix.join('img', name)}`, w: width, bytes: buffer.length };
}

async function main() {
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const manifest = {};
  let sourceBytes = 0;
  let derivedBytes = 0;

  for (const dir of SOURCES) {
    for await (const file of walk(dir)) {
      if (!SOURCE_EXT.has(path.extname(file).toLowerCase())) continue;

      const image = sharp(file);
      const { width, height } = await image.metadata();
      if (!width || !height) throw new Error(`could not read dimensions of ${file}`);

      const base = path.basename(file, path.extname(file));

      const key = `/${path.posix.join(...file.split(path.sep).slice(1))}`;

      const widths = [...new Set([...LADDER.filter((w) => w < width), width])].sort(
        (a, b) => a - b,
      );

      const decoded = await image.toBuffer();

      const avif = [];
      const webp = [];

      for (const w of widths) {
        const scaled = sharp(decoded).resize({ width: w, kernel: 'lanczos3' });

        webp.push(
          await writeHashed(
            base,
            w,
            '.webp',
            await scaled.clone().webp({ quality: WEBP_QUALITY }).toBuffer(),
          ),
        );
        avif.push(
          await writeHashed(
            base,
            w,
            '.avif',
            await scaled
              .clone()
              .avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT })
              .toBuffer(),
          ),
        );
      }

      const stat = await fs.stat(file);
      sourceBytes += stat.size;
      derivedBytes += [...avif, ...webp].reduce((n, d) => n + d.bytes, 0);

      manifest[key] = {
        width,
        height,
        avif: avif.map(({ url, w }) => ({ url, w })),
        webp: webp.map(({ url, w }) => ({ url, w })),
      };

      const widest = (list) => list[list.length - 1].bytes;
      console.log(
        `[images] ${key}  ${width}x${height}  ${widths.length} widths  ` +
          `original ${(stat.size / 1024).toFixed(1)} KB → ` +
          `${(widest(avif) / 1024).toFixed(1)} KB avif at full width, ` +
          `${(avif[0].bytes / 1024).toFixed(1)} KB at ${widths[0]}w`,
      );
    }
  }

  const entries = Object.keys(manifest).sort();
  const sorted = Object.fromEntries(entries.map((k) => [k, manifest[k]]));

  const body = `export const IMAGE_MANIFEST = ${JSON.stringify(sorted, null, 2)};\n`;

  await fs.writeFile(MANIFEST, body);

  console.log(
    `[images] wrote ${entries.length} entries to ${MANIFEST}; ` +
      `${(sourceBytes / 1024).toFixed(0)} KB of originals produced ` +
      `${(derivedBytes / 1024).toFixed(0)} KB of derivatives across every width ` +
      `(a visitor fetches one of them).`,
  );
}

main().catch((error) => {
  console.error('[images]', error.message);
  process.exit(1);
});
