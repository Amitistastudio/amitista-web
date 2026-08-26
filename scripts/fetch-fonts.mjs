import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'public', 'fonts');
const CSS_OUT = join(ROOT, 'src', 'fonts.css');

const FAMILIES = [
  'DM+Sans:ital,wght@0,100..1000;1,100..1000',
  'Playfair+Display:ital,wght@0,400..900;1,400..900',
  'Instrument+Serif:ital@0;1',
];

const KEEP_SUBSETS = new Set(['latin', 'latin-ext', 'greek', 'greek-ext']);

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

function parseFaces(css) {
  const faces = [];
  const pattern = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/gi;
  let match;
  while ((match = pattern.exec(css)) !== null) {
    faces.push({ subset: match[1], block: match[2] });
  }
  return faces;
}

function field(block, name) {
  const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  return match ? match[1].trim() : '';
}

function fileNameFor(block, subset) {
  const family = field(block, 'font-family').replace(/['"]/g, '').replace(/\s+/g, '-');
  const style = field(block, 'font-style') || 'normal';
  return `${family}-${subset}-${style}.woff2`.toLowerCase();
}

async function main() {
  await rm(FONT_DIR, { recursive: true, force: true });
  await mkdir(FONT_DIR, { recursive: true });

  const url = `https://fonts.googleapis.com/css2?${FAMILIES.map((f) => `family=${f}`).join(
    '&',
  )}&display=swap`;
  const css = await fetchText(url);
  const faces = parseFaces(css).filter((face) => KEEP_SUBSETS.has(face.subset));

  if (faces.length === 0) {
    throw new Error('No @font-face blocks matched — Google changed its response format.');
  }

  const blocks = [];
  const seen = new Set();

  for (const { subset, block } of faces) {
    const remote = block.match(/url\((https:\/\/[^)]+\.woff2)\)/);
    if (!remote) continue;

    const fileName = fileNameFor(block, subset);
    if (!seen.has(fileName)) {
      seen.add(fileName);
      const response = await fetch(remote[1], { headers: { 'User-Agent': UA } });
      if (!response.ok) throw new Error(`${response.status} for ${remote[1]}`);
      await writeFile(join(FONT_DIR, fileName), Buffer.from(await response.arrayBuffer()));
    }

    blocks.push(
      block.replace(/url\(https:\/\/[^)]+\.woff2\)/, `url('/fonts/${fileName}')`),
    );
  }

  const header = '';

  await writeFile(CSS_OUT, header + blocks.join('\n\n') + '\n');

  const written = await readdir(FONT_DIR);
  const total = written.length;
  console.log(`Wrote ${total} font file${total === 1 ? '' : 's'} to public/fonts/`);
  console.log(`Wrote ${blocks.length} @font-face rules to src/fonts.css`);
}

main().catch((error) => {
  console.error(`Font download failed: ${error.message}`);
  process.exitCode = 1;
});
