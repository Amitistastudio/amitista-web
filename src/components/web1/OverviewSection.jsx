import React from 'react';
import { Server, Globe, PenTool, Code2, ArrowUpRight } from 'lucide-react';
import Reveal from '../Reveal';
import ResponsiveImage from '../ResponsiveImage';
import WorkGrid from './WorkGrid';
import { SERVICES } from '../../content/services';

const ICONS = {
  globe: Globe,
  server: Server,
  'pen-tool': PenTool,
};

const ASYNC_PREVIEWS = [
  '/work/async-preview-01.webp',
  '/work/async-preview-02.webp',
  '/work/async-preview-03.webp',
  '/work/async-preview-04.webp',
  '/work/async-preview-05.webp',
  '/work/async-preview-06.webp',
];

const SERVICE_PREVIEWS = {
  'web-development': ASYNC_PREVIEWS,
  'applications-and-systems': ASYNC_PREVIEWS,
  'interface-design': ASYNC_PREVIEWS,
};

function createShuffledPreviewDeck(length, currentPreview) {
  const deck = Array.from({ length }, (_, index) => index);

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  if (deck.length > 1 && deck[0] === currentPreview) {
    const swapIndex = 1 + Math.floor(Math.random() * (deck.length - 1));
    [deck[0], deck[swapIndex]] = [deck[swapIndex], deck[0]];
  }

  return deck;
}

function ServiceRow({ service, index }) {
  const Icon = ICONS[service.icon] ?? Code2;
  const previews = SERVICE_PREVIEWS[service.slug] ?? [];
  const previewTrackRef = React.useRef(null);
  const previewImageRefs = React.useRef([]);
  const activePreviewRef = React.useRef(0);
  const previewDeckRef = React.useRef([]);
  const pointerHistoryRef = React.useRef({ x: 0, y: 0, distance: 0 });
  const reducedMotionRef = React.useRef(false);
  const frameRef = React.useRef(0);
  const motionRef = React.useRef({ x: 0, y: 0, targetX: 0, targetY: 0, lastTime: 0 });

  const animatePreview = React.useCallback((time) => {
    const motion = motionRef.current;
    const track = previewTrackRef.current;
    const elapsed = motion.lastTime ? Math.min(time - motion.lastTime, 32) : 16;
    const smoothing = 1 - Math.exp(-elapsed / 150);
    motion.lastTime = time;

    motion.x += (motion.targetX - motion.x) * smoothing;
    motion.y += (motion.targetY - motion.y) * smoothing;

    if (track) {
      track.style.transform = `translate3d(${motion.x.toFixed(2)}px, ${motion.y.toFixed(2)}px, 0)`;
    }

    const unsettled =
      Math.abs(motion.targetX - motion.x) > 0.05 ||
      Math.abs(motion.targetY - motion.y) > 0.05;

    if (unsettled) {
      frameRef.current = window.requestAnimationFrame(animatePreview);
    } else {
      frameRef.current = 0;
      motion.lastTime = 0;
    }
  }, []);

  const queuePreviewMotion = React.useCallback(() => {
    if (!frameRef.current) frameRef.current = window.requestAnimationFrame(animatePreview);
  }, [animatePreview]);

  React.useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => {
      reducedMotionRef.current = motionPreference.matches;
    };

    updateMotionPreference();
    motionPreference.addEventListener('change', updateMotionPreference);

    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      motionPreference.removeEventListener('change', updateMotionPreference);
    };
  }, []);

  const activatePreview = (nextPreview) => {
    if (nextPreview < 0 || nextPreview === activePreviewRef.current) return;
    previewImageRefs.current.forEach((image, imageIndex) => {
      if (image) image.dataset.active = imageIndex === nextPreview ? 'true' : 'false';
    });
    activePreviewRef.current = nextPreview;
  };

  const activateNextPreview = () => {
    if (previews.length < 2) return;

    if (previewDeckRef.current.length === 0) {
      previewDeckRef.current = createShuffledPreviewDeck(
        previews.length,
        activePreviewRef.current,
      );
    }

    activatePreview(previewDeckRef.current.shift());
  };

  const setPointerTarget = (event, immediate = false) => {
    if (event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    const previewWidth = 320;
    const targetX = Math.min(Math.max(localX + 28, 0), Math.max(bounds.width - previewWidth, 0));
    const targetY = localY - 90;
    const motion = motionRef.current;

    motion.targetX = targetX;
    motion.targetY = targetY;

    if (immediate || reducedMotionRef.current) {
      motion.x = targetX;
      motion.y = targetY;
      motion.lastTime = 0;
      if (previewTrackRef.current) {
        previewTrackRef.current.style.transform = `translate3d(${targetX.toFixed(2)}px, ${targetY.toFixed(2)}px, 0)`;
      }
      return;
    }

    queuePreviewMotion();
  };

  const handlePointerEnter = (event) => {
    if (event.pointerType !== 'mouse') return;
    pointerHistoryRef.current = { x: event.clientX, y: event.clientY, distance: 0 };
    activateNextPreview();
    setPointerTarget(event, true);
  };

  const handlePointerMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    const pointer = pointerHistoryRef.current;
    pointer.distance += Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (pointer.distance >= 120) {
      pointer.distance %= 120;
      activateNextPreview();
    }

    setPointerTarget(event);
  };

  return (
    <a
      href={`/services#${service.slug}`}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      className="service-row group/service relative isolate grid min-h-40 grid-cols-[2.5rem_1fr_auto] gap-x-4 border-b border-[#303039] py-7 text-left transition-colors duration-300 hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-neutral-500 sm:grid-cols-[3.5rem_1fr_auto] sm:gap-x-6 sm:px-5 sm:py-9"
    >
      <span className="pt-1 font-mono text-[10px] text-neutral-600 transition-colors group-hover/service:text-violet-400">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-3">
          <Icon
            size={16}
            strokeWidth={1.5}
            className="shrink-0 text-neutral-600 transition-colors group-hover/service:text-violet-400"
          />
          <h3 className="text-xl font-medium tracking-[-0.025em] text-neutral-100 sm:text-2xl">
            {service.name}
          </h3>
        </span>
        <p className="mt-4 max-w-[480px] text-sm leading-relaxed text-neutral-500 transition-colors group-hover/service:text-neutral-400 sm:text-[15px]">
          {service.blurb}
        </p>
      </span>
      <ArrowUpRight
        size={17}
        strokeWidth={1.5}
        className="mt-1 shrink-0 text-neutral-700 transition-[color,transform] duration-200 group-hover/service:-translate-y-0.5 group-hover/service:translate-x-0.5 group-hover/service:text-violet-400"
      />

      {previews.length > 0 && (
        <figure
          aria-hidden="true"
          className="service-hover-preview pointer-events-none absolute left-0 top-0 z-20 w-[320px]"
        >
          <div
            ref={previewTrackRef}
            className="service-preview-track"
          >
            <div className="service-preview-card relative aspect-video overflow-hidden rounded-[12px] border border-white/[0.12] bg-[#050507] shadow-[0_28px_70px_-24px_rgba(0,0,0,0.95),0_12px_34px_-24px_rgba(139,92,246,0.45)]">
              {previews.map((src, imageIndex) => (
                <span
                  key={src}
                  ref={(node) => {
                    previewImageRefs.current[imageIndex] = node;
                  }}
                  className="service-preview-image absolute inset-0 block h-full w-full"
                  data-active={imageIndex === 0 ? 'true' : 'false'}
                >
                  <ResponsiveImage
                    src={src}
                    sizes="320px"
                    pictureClassName="block h-full w-full"
                    alt=""
                    loading={imageIndex === 0 ? 'eager' : 'lazy'}
                    className="h-full w-full object-cover object-center"
                  />
                </span>
              ))}
              <span className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/[0.035]" />
            </div>
          </div>
        </figure>
      )}
    </a>
  );
}

export default function OverviewSection() {
  return (
    <div id="services" className="w-full bg-[#060608] scroll-mt-20">
      <div className="w-full flex justify-center bg-[#060608]">
        <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-start overflow-hidden">
          <div className="relative z-30 w-full px-6 pt-24 pb-20 sm:px-10 md:px-16 lg:px-20 lg:pt-32 lg:pb-28">
            <Reveal rise className="grid w-full grid-cols-1 gap-14 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-20">
              <div className="flex flex-col items-start text-left lg:sticky lg:top-32 lg:self-start">
                <span className="mb-8 font-mono text-[10px] font-medium tracking-[0.18em] text-violet-400">
                  01 / CAPABILITIES
                </span>
                <h2 className="max-w-[560px] text-4xl font-normal leading-[0.98] tracking-[-0.045em] text-white sm:text-5xl md:text-6xl lg:text-[68px]">
                  From first screen to final system.
                </h2>
                <p className="mt-7 max-w-[430px] text-sm leading-relaxed text-neutral-400 sm:text-[15px]">
                  Design, development and the infrastructure underneath it—handled as one
                  connected piece of work.
                </p>
                <a
                  href="/services"
                  className="group/all mt-9 inline-flex items-center gap-3 text-[11px] font-semibold tracking-[0.16em] text-neutral-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500"
                >
                  EXPLORE ALL SERVICES
                  <ArrowUpRight
                    size={13}
                    strokeWidth={2}
                    className="text-violet-400 transition-transform duration-200 group-hover/all:-translate-y-0.5 group-hover/all:translate-x-0.5"
                  />
                </a>
              </div>

              <div className="border-t border-[#303039]">
                {SERVICES.map((service, index) => (
                  <ServiceRow key={service.slug} service={service} index={index} />
                ))}
              </div>
            </Reveal>

            <Reveal rise className="mt-24 flex w-full items-center gap-4">
              <span className="font-mono text-[10px] font-medium tracking-[0.18em] text-neutral-500">
                02 / SELECTED WORK
              </span>
              <span aria-hidden="true" className="h-px flex-1 bg-[#282832]" />
            </Reveal>
          </div>
          <WorkGrid id="work" />
        </section>
      </div>
    </div>
  );
}
