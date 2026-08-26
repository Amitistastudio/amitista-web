import sharp from 'sharp';
import { readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(ROOT, 'brand', 'icon-originals');
const OUT = join(ROOT, 'public');

const ICONS = [
  { file: 'apple-touch-icon.png', size: 180 },

  { file: 'favicon.png', size: 96 },

  { file: 'amitista-logo.png', size: 128 },
];

async function main() {
  const available = await readdir(SOURCES).catch(() => []);
  if (available.length === 0) {
    throw new Error(`no sources in ${SOURCES} — restore the originals before running this`);
  }

  for (const { file, size } of ICONS) {
    const from = join(SOURCES, file);
    const to = join(OUT, file);

    const before = (await stat(from)).size;

    await sharp(from)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: true })
      .toFile(to);

    const after = (await stat(to)).size;
    const saved = Math.round((1 - after / before) * 100);
    console.log(
      `[icons] ${file.padEnd(22)} ${String(before).padStart(6)} B → ${String(after).padStart(6)} B  (${size}×${size}, −${saved}%)`,
    );
  }
}

main().catch((error) => {
  console.error(`Icon derivation failed: ${error.message}`);
  process.exitCode = 1;
});
