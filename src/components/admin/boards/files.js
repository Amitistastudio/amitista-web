import { dataUrlBytes, dataUrlType, readableSize } from './art';

export const FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
export const FILE_MAX = 4 * 1024 * 1024;
export const FILES_MAX = 10;
export const THUMB_EDGE = 520;

const SHRINK = [
  { type: 'image/webp', quality: 0.9, scale: 1 },
  { type: 'image/webp', quality: 0.8, scale: 0.85 },
  { type: 'image/jpeg', quality: 0.82, scale: 0.85 },
  { type: 'image/webp', quality: 0.75, scale: 0.6 },
  { type: 'image/jpeg', quality: 0.7, scale: 0.45 },
];

export function isImage(entry) {
  return String(entry?.type ?? '').startsWith('image/');
}

export function sizeWords(bytes) {
  return readableSize(bytes) || '';
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That file is not the image it says it is.'));
    image.src = source;
  });
}

function paint(image, scale, type, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const brush = canvas.getContext('2d');
  if (!brush) throw new Error('This browser cannot resize images.');
  brush.imageSmoothingEnabled = true;
  brush.imageSmoothingQuality = 'high';
  brush.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(type, quality);
}

async function thumbnail(source) {
  try {
    const image = await loadImage(source);
    const longest = Math.max(image.naturalWidth, image.naturalHeight) || 1;
    return paint(image, Math.min(1, THUMB_EDGE / longest), 'image/webp', 0.72);
  } catch {
    return null;
  }
}

export async function readAttachment(file) {
  if (!file) throw new Error('Pick a file first.');
  if (!FILE_TYPES.includes(file.type)) {
    throw new Error(`${file.name || 'That file'} is not one a card takes — PNG, JPEG, WebP, GIF or PDF.`);
  }

  const source = await readFile(file);
  const bytes = dataUrlBytes(source);
  if (bytes <= FILE_MAX) {
    return {
      name: file.name,
      data: source,
      bytes,
      type: file.type,
      resized: false,
      thumb: file.type === 'application/pdf' ? null : await thumbnail(source),
    };
  }

  if (file.type === 'application/pdf') {
    throw new Error(
      `${file.name} is ${readableSize(bytes)} — a PDF has to stay under ${readableSize(FILE_MAX)}.`,
    );
  }
  if (file.type === 'image/gif') {
    throw new Error(
      `${file.name} is ${readableSize(bytes)} — an animated image has to stay under ${readableSize(FILE_MAX)}.`,
    );
  }

  const image = await loadImage(source);
  for (const attempt of SHRINK) {
    const data = paint(image, attempt.scale, attempt.type, attempt.quality);
    const shrunk = dataUrlBytes(data);
    if (shrunk <= FILE_MAX) {
      return {
        name: file.name,
        data,
        bytes: shrunk,
        type: dataUrlType(data),
        resized: true,
        thumb: await thumbnail(data),
      };
    }
  }

  throw new Error(`${file.name} stays too heavy after resizing — try a smaller one.`);
}
