import { IMAGE_MANIFEST } from '../content/imageManifest.js';

export default function ResponsiveImage({ src, sizes, pictureClassName, ...imgProps }) {
  const entry = IMAGE_MANIFEST[src];

  if (!entry) return <img src={src} {...imgProps} />;

  const srcSet = (candidates) => candidates.map(({ url, w }) => `${url} ${w}w`).join(', ');

  return (
    <picture className={pictureClassName}>
      <source type="image/avif" srcSet={srcSet(entry.avif)} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(entry.webp)} sizes={sizes} />
      <img src={src} width={entry.width} height={entry.height} sizes={sizes} {...imgProps} />
    </picture>
  );
}
