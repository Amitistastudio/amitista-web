import { boardFaceUrl } from '../../../lib/admin';

const FORGET_AFTER = 300000;
const missing = new Map();

export function faceSource(name) {
  const key = String(name ?? '').trim().toLowerCase();
  if (!key) return null;
  const at = missing.get(key);
  if (at && Date.now() - at < FORGET_AFTER) return null;
  return boardFaceUrl(name);
}

export function noFace(name) {
  const key = String(name ?? '').trim().toLowerCase();
  if (key) missing.set(key, Date.now());
}
