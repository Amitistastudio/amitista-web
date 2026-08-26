import React from 'react';
import Silk from './Silk';

export default function CtaPanel({
  title = 'Want something like this?',
  body = 'Tell us what you need and one of us will pick it up.',
  label = 'GET IN TOUCH',
  href = '/contact',
}) {
  return (
    <a
      href={href}
      className="relative w-full border border-[#282832] bg-[#0a0a0d] overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-8 py-12 group cursor-pointer"
    >
      <Silk
        color="#8864f2"
        speed={4.5}
        scale={1.4}
        noiseIntensity={1.4}
        rotation={-0.2}
        fadeEdge={true}
        className="absolute inset-0 w-full h-full z-0 opacity-60 group-hover:opacity-90 transition-opacity duration-700"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#060608] via-[#060608]/85 to-[#060608]/45 z-1 pointer-events-none" />

      <div className="relative z-10 text-left">
        <h3 className="text-2xl sm:text-3xl font-medium text-white tracking-tight mb-2">
          {title}
        </h3>
        <p className="text-sm text-neutral-300 font-normal leading-relaxed max-w-[380px]">
          {body}
        </p>
      </div>

      <span className="relative z-10 inline-flex items-center gap-3 border border-white bg-transparent group-hover:bg-white group-hover:text-black text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all shrink-0 self-start sm:self-auto">
        {label}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="w-3.5 h-3.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
          />
        </svg>
      </span>
    </a>
  );
}
