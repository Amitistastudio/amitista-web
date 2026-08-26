import React from 'react';
import { Play } from 'lucide-react';
import ResponsiveImage from './ResponsiveImage';

export default function VideoEmbed({ id, title, poster }) {
  const [playing, setPlaying] = React.useState(false);

  if (playing) {
    return (
      <div className="relative w-full aspect-video bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play ${title} on YouTube`}
      className="relative w-full aspect-video bg-[#0a0a0d] overflow-hidden group cursor-pointer block"
    >
      <ResponsiveImage
        src={poster}
        alt=""
        loading="lazy"
        sizes="(min-width: 1024px) 1024px, 100vw"
        className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-500"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="inline-flex items-center gap-3 border border-white bg-[#060608]/70 group-hover:bg-white group-hover:text-black text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all">
          <Play size={12} strokeWidth={2} className="fill-current" />
          PLAY SHOWCASE
        </span>
      </span>
      <span className="absolute bottom-0 inset-x-0 px-4 py-3 text-[10px] font-medium text-neutral-400 tracking-[0.15em] bg-gradient-to-t from-[#060608] to-transparent">
        LOADS FROM YOUTUBE WHEN YOU PRESS PLAY
      </span>
    </button>
  );
}
