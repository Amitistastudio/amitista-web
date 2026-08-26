import React from 'react';
import Silk from '../Silk';
import SubheaderBar from './SubheaderBar';

export default function Hero() {
  return (
    <div className="w-full flex flex-col items-center bg-[#060608] min-h-[calc(100vh-80px)] justify-between">
      <main className="w-full max-w-[1480px] border-x border-[#282832] relative flex-1 flex flex-col items-center justify-center text-center overflow-hidden">
        <Silk
          color="#8864f2"
          speed={2.5}
          scale={1.3}
          noiseIntensity={1.2}
          rotation={0.3}
          fadeEdge={true}
          className="absolute inset-0 w-full h-full z-0"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060608] via-transparent to-[#060608]/70 pointer-events-none z-1" />
        <div className="relative z-30 max-w-3xl px-6 flex flex-col items-center py-12 pointer-events-auto">
          <span className="text-xs sm:text-sm font-medium text-white/90 tracking-wide mb-3 relative z-40">
            DEVELOPMENT STUDIO
          </span>
          <h1 className="text-6xl sm:text-8xl md:text-9xl lg:text-[108px] font-bold tracking-tight leading-none mb-5 font-sans relative z-40 bg-[linear-gradient(115deg,#ffffff_0%,#ffffff_35%,#d9ccff_65%,#8b5cf6_100%)] bg-clip-text text-transparent drop-shadow-lg">
            AMITISTA
          </h1>
          <p className="text-sm sm:text-base text-white/85 font-normal max-w-md text-center leading-relaxed mb-9 tracking-tight relative z-40">
            We design and build websites, applications and the systems behind them.
            Tell us what you need and we'll get it done.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="/contact"
              className="border border-white hover:bg-white hover:text-black text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer"
            >
              START A PROJECT
            </a>
            <a
              href="#work"
              className="bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 text-white font-semibold text-[11px] tracking-[0.2em] px-6 py-3 transition-all cursor-pointer"
            >
              SEE OUR WORK
            </a>
          </div>
        </div>
      </main>
      <SubheaderBar />
    </div>
  );
}
