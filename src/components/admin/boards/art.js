export const ART_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export const ART_KINDS = {
  logo: {
    label: 'Logo',
    width: 512,
    height: 512,
    cap: 160 * 1024,
    hint: 'Square reads best. It sits beside the board name and on the board tile.',
    frame: 'aspect-square w-24',
  },
  banner: {
    label: 'Banner',
    width: 1920,
    height: 640,
    cap: 400 * 1024,
    hint: 'A wide strip across the top of the board and its tile.',
    frame: 'aspect-[3/1] w-full',
  },
};

const ATTEMPTS = [
  { type: 'image/webp', quality: 0.9, scale: 1 },
  { type: 'image/webp', quality: 0.75, scale: 1 },
  { type: 'image/jpeg', quality: 0.82, scale: 1 },
  { type: 'image/webp', quality: 0.75, scale: 0.6 },
  { type: 'image/jpeg', quality: 0.7, scale: 0.6 },
];

export function dataUrlBytes(url) {
  const encoded = String(url ?? '').split(',')[1] ?? '';
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((encoded.length * 3) / 4) - padding);
}

export function dataUrlType(url) {
  return String(url ?? '')
    .slice(5)
    .split(';')[0]
    .toLowerCase();
}

export function readableSize(bytes) {
  if (!bytes) return '';
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That file is not an image we can read.'));
    image.src = source;
  });
}

function paint(image, width, height, type, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const brush = canvas.getContext('2d');
  if (!brush) throw new Error('This browser cannot resize images.');
  brush.imageSmoothingEnabled = true;
  brush.imageSmoothingQuality = 'high';
  brush.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(type, quality);
}

export async function openArt(file) {
  if (!file) throw new Error('Pick an image first.');
  if (!ART_TYPES.includes(file.type)) {
    throw new Error('Use a PNG, JPEG, WebP or GIF image.');
  }
  const source = await readFile(file);
  const image = await loadImage(source);
  return { source, image, type: file.type, size: file.size };
}

export function loadArtSource(source) {
  return loadImage(source);
}

export function cropArt(image, kind, box) {
  const spec = ART_KINDS[kind] ?? ART_KINDS.logo;
  const width = Math.max(1, Math.min(spec.width, Math.round(box.width)));
  const height = Math.max(1, Math.round((width * spec.height) / spec.width));

  for (const attempt of ATTEMPTS) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * attempt.scale));
    canvas.height = Math.max(1, Math.round(height * attempt.scale));
    const brush = canvas.getContext('2d');
    if (!brush) throw new Error('This browser cannot crop images.');
    brush.imageSmoothingEnabled = true;
    brush.imageSmoothingQuality = 'high';
    brush.drawImage(
      image,
      box.x,
      box.y,
      box.width,
      box.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const data = canvas.toDataURL(attempt.type, attempt.quality);
    const bytes = dataUrlBytes(data);
    if (bytes <= spec.cap) return { data, bytes, type: dataUrlType(data) };
  }

  throw new Error('That image stays too heavy after cropping — try a smaller or simpler one.');
}

export async function readArt(file, kind) {
  const spec = ART_KINDS[kind] ?? ART_KINDS.logo;
  if (!file) throw new Error('Pick an image first.');
  if (!ART_TYPES.includes(file.type)) {
    throw new Error('Use a PNG, JPEG, WebP or GIF image.');
  }

  const source = await readFile(file);

  if (file.type === 'image/gif') {
    if (file.size > spec.cap) {
      throw new Error(
        `That GIF is ${readableSize(file.size)} — an animated one has to stay under ${readableSize(spec.cap)}.`,
      );
    }
    return { data: source, bytes: file.size, type: file.type };
  }

  const image = await loadImage(source);
  const fit = Math.min(1, spec.width / image.naturalWidth, spec.height / image.naturalHeight);

  for (const attempt of ATTEMPTS) {
    const scale = fit * attempt.scale;
    const data = paint(
      image,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
      attempt.type,
      attempt.quality,
    );
    const bytes = dataUrlBytes(data);
    if (bytes <= spec.cap) return { data, bytes, type: dataUrlType(data) };
  }

  throw new Error('That image stays too heavy after resizing — try a smaller or simpler one.');
}
