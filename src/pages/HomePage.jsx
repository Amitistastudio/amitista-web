import React from 'react';
import Header from '../components/web1/Header';
import Hero from '../components/web1/Hero';
import OverviewSection from '../components/web1/OverviewSection';
import DashboardSection from '../components/web1/DashboardSection';
import Footer from '../components/web1/Footer';
import { onFirstInteraction } from '../lib/interaction';

export default function HomePage() {
  React.useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let lenis;
    let frame;
    let cancelled = false;

    const detach = onFirstInteraction(() => {
      import('lenis')
        .then(({ default: Lenis }) => {
          if (cancelled) return;
          lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
          });

          const raf = (time) => {
            lenis.raf(time);
            frame = requestAnimationFrame(raf);
          };
          frame = requestAnimationFrame(raf);
        })
        .catch(() => {
        });
    });

    return () => {
      cancelled = true;
      detach();
      if (frame) cancelAnimationFrame(frame);
      if (lenis) lenis.destroy();
    };
  }, []);

  return (
    <div id="top" className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans relative">
      <Header />
      <main id="main" tabIndex={-1} className="flex flex-col flex-1 focus:outline-none">
        <Hero />
        <OverviewSection />
        <DashboardSection />
      </main>
      <Footer />
    </div>
  );
}
