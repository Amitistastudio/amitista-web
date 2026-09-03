import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import Reveal from '../Reveal';
import { STAGES, PRINCIPLES } from '../../content/process';

// The stage scale is a scrub track: scrolling drives a playhead along the rule
// and the stage it has reached is the live one. Nothing enters or fades in —
// the whole scale is drawn from the start and only the readout moves.
function useStageTrack() {
  const ref = React.useRef(null);
  const frameRef = React.useRef(0);
  const [live, setLive] = React.useState(0);

  React.useEffect(() => {
    const track = ref.current;
    if (!track) return undefined;

    const update = () => {
      frameRef.current = 0;
      const view = window.innerHeight;
      const bounds = track.getBoundingClientRect();
      const span = view * 0.5 + bounds.height;
      const raw = (view * 0.8 - bounds.top) / Math.max(span, 1);
      const progress = Math.min(Math.max(raw, 0), 1);

      track.style.setProperty('--track', progress.toFixed(4));
      const index = Math.min(STAGES.length - 1, Math.floor(progress * STAGES.length));
      setLive((previous) => (previous === index ? previous : index));
    };

    const queueUpdate = () => {
      if (!frameRef.current) frameRef.current = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', queueUpdate, { passive: true });
    window.addEventListener('resize', queueUpdate);
    return () => {
      window.removeEventListener('scroll', queueUpdate);
      window.removeEventListener('resize', queueUpdate);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return [ref, live];
}

export default function DashboardSection() {
  const [trackRef, live] = useStageTrack();

  return (
    <div id="studio" className="w-full flex justify-center bg-[#060608] border-t border-[#222228] scroll-mt-20">
      <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-start text-center overflow-hidden">
        <div className="relative z-30 w-full flex flex-col items-center pt-24 pb-24 px-6 sm:px-10 md:px-16 lg:px-20">
          <Reveal
            rise
            className="w-full max-w-5xl flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-16"
          >
            <div className="flex flex-col items-start text-left">
              <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-[72px] font-normal text-white tracking-tight leading-none">
                How we <br />
                work
              </h2>
            </div>
            <div className="flex flex-col items-start md:items-end text-left md:text-right max-w-xs text-neutral-400 text-sm sm:text-[15px] font-normal leading-relaxed gap-3">
              Every project runs the same four stages, so you always know where yours is.
              <a
                href="/process"
                className="inline-flex items-center gap-2 text-[11px] font-semibold text-neutral-400 hover:text-white tracking-[0.2em] transition-colors group/all"
              >
                <span className="underline underline-offset-4 decoration-[#282832] group-hover/all:decoration-neutral-500">
                  WHAT EACH STAGE INVOLVES
                </span>
                <ArrowUpRight
                  size={12}
                  strokeWidth={2}
                  className="group-hover/all:text-violet-400 transition-colors"
                />
              </a>
            </div>
          </Reveal>

          <div className="w-full max-w-5xl flex flex-col">
            <div ref={trackRef} className="plan">
              <div className="plan__meta">
                <span>THE SEQUENCE</span>
                <span>{STAGES[live].step} / {String(STAGES.length).padStart(2, '0')}</span>
              </div>

              <div className="plan__scale">
                <span className="plan__rule" aria-hidden="true" />
                <span className="plan__fill" aria-hidden="true" />
                <span className="plan__head" aria-hidden="true" />

                <ol className="plan__stages">
                  {STAGES.map((stage, index) => (
                    <li
                      key={stage.step}
                      data-state={index === live ? 'live' : index < live ? 'past' : 'ahead'}
                      className="plan__stage"
                    >
                      <span className="plan__num">{stage.step}</span>
                      <div className="plan__note">
                        <span className="plan__leader" aria-hidden="true" />
                        <h3 className="plan__title">{stage.title}</h3>
                        <p className="plan__blurb">{stage.blurb}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="plan-notes">
              {PRINCIPLES.map((principle) => (
                <div key={principle.title} className="plan-notes__item">
                  <span className="plan-notes__mark" aria-hidden="true" />
                  <h3 className="plan-notes__title">{principle.title}</h3>
                  <p className="plan-notes__body">{principle.body}</p>
                </div>
              ))}
            </div>

            <a href="/contact" className="plan-cta">
              <span className="plan-cta__label">Start a project</span>
              <span className="plan-cta__hint">Stage one is a message</span>
              <span className="plan-cta__arrow" aria-hidden="true">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                </svg>
              </span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
