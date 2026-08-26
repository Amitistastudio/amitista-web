import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

async function loadSubsetter() {
  try {
    return (await import('subset-font')).default;
  } catch {
    throw new Error(
      'subset-font is not installed. It is deliberately not a dependency: the subset ' +
        'woff2 files under public/fonts are committed artifacts and the build never ' +
        'needs this tool. To refresh them run "npm i --no-save subset-font", then this ' +
        'script, then "npm ci" to restore the locked tree.',
    );
  }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'public', 'fonts');
const CSS_PATH = join(ROOT, 'src', 'fonts.css');

const AXES = {
  'dm-sans': { wght: { min: 300, max: 700 } },
  'playfair-display': { wght: { min: 400, max: 700 } },
};

const INSTANCER_UNSAFE = /-latin-ext-/;

function familyOf(file) {
  if (INSTANCER_UNSAFE.test(file)) return undefined;
  return Object.keys(AXES).find((family) => file.startsWith(`${family}-`));
}

function expandRange(range) {
  let out = '';
  for (const part of range.split(',')) {
    const match = /U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?/.exec(part.trim());
    if (!match) continue;
    const lo = parseInt(match[1], 16);
    const hi = match[2] ? parseInt(match[2], 16) : lo;
    if (hi - lo > 0x4000) throw new Error(`unicode-range too wide to expand: ${part}`);
    for (let code = lo; code <= hi; code += 1) {
      if (code >= 0xd800 && code <= 0xdfff) continue;
      out += String.fromCodePoint(code);
    }
  }
  return out;
}

function coverageFromCss(css) {
  const map = new Map();
  for (const face of css.split('@font-face').slice(1)) {
    const url = /url\('\/fonts\/([^']+)'\)/.exec(face);
    if (!url) continue;
    const range = /unicode-range:\s*([^;]+);/.exec(face);
    const chars = range ? expandRange(range[1]) : '';
    map.set(url[1], (map.get(url[1]) ?? '') + chars);
  }
  return map;
}

async function main() {
  const subsetFont = await loadSubsetter();
  const css = await readFile(CSS_PATH, 'utf8');
  const coverage = coverageFromCss(css);
  const files = (await readdir(FONT_DIR)).filter((file) => file.endsWith('.woff2')).sort();

  let before = 0;
  let after = 0;
  let touched = 0;

  for (const file of files) {
    const source = await readFile(join(FONT_DIR, file));
    before += source.length;

    const family = familyOf(file);
    const chars = coverage.get(file);

    if (!family || !chars) {
      after += source.length;
      console.log(`  ${file.padEnd(42)} ${String(source.length).padStart(6)}  unchanged`);
      continue;
    }

    const out = await subsetFont(source, chars, {
      targetFormat: 'woff2',
      variationAxes: AXES[family],
    });

    if (out.length >= source.length) {
      after += source.length;
      console.log(`  ${file.padEnd(42)} ${String(source.length).padStart(6)}  already minimal`);
      continue;
    }

    await writeFile(join(FONT_DIR, file), out);
    after += out.length;
    touched += 1;
    const cut = (100 - (out.length / source.length) * 100).toFixed(1);
    console.log(
      `  ${file.padEnd(42)} ${String(source.length).padStart(6)} -> ${String(out.length).padStart(6)}  -${cut}%`,
    );
  }

  const cut = (100 - (after / before) * 100).toFixed(1);
  console.log(
    `[subset-fonts] ${touched} of ${files.length} files instanced; ${(before / 1024).toFixed(1)} kB -> ${(after / 1024).toFixed(1)} kB (-${cut}%)`,
  );
}

main().catch((error) => {
  console.error(`Font subsetting failed: ${error.message}`);
  process.exitCode = 1;
});
