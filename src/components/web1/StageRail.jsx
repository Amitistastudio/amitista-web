import React from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { STAGES } from '../../content/process';

export default function StageRail() {
  const rootRef = React.useRef(null);
  const frameRef = React.useRef(0);
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const stages = Array.from(root.querySelectorAll('[data-stage]'));
    if (!stages.length) return undefined;

    const clamp = (value) => Math.min(Math.max(value, 0), 1);

    const update = () => {
      frameRef.current = 0;
      const line = window.innerHeight * 0.42;
      let current = 0;

      stages.forEach((stage, index) => {
        const bounds = stage.getBoundingClientRect();
        const progress = clamp((line - bounds.top) / Math.max(bounds.height, 1));
        stage.style.setProperty('--stage-progress', progress.toFixed(4));
        if (bounds.top <= line) current = index;
      });

      const bounds = root.getBoundingClientRect();
      const total = clamp((line - bounds.top) / Math.max(bounds.height, 1));
      root.style.setProperty('--rail-progress', total.toFixed(4));

      setActive((previous) => (previous === current ? previous : current));
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

  return (
    <div ref={rootRef} className="stage-rail w-full flex flex-col">
      <div className="stage-rail__bar">
        <span className="stage-rail__label">
          STAGE {STAGES[active].step} — {STAGES[active].title.toUpperCase()}
        </span>
        <div className="stage-rail__ticks">
          {STAGES.map((stage, index) => (
            <a
              key={stage.step}
              href={`#stage-${stage.step}`}
              data-state={index === active ? 'on' : index < active ? 'past' : 'off'}
              aria-current={index === active ? 'step' : undefined}
              aria-label={`Stage ${stage.step} — ${stage.title}`}
              className="stage-rail__tick"
            >
              {stage.step}
            </a>
          ))}
        </div>
        <span className="stage-rail__fill" aria-hidden="true" />
      </div>

      {STAGES.map((stage) => (
        <article
          key={stage.step}
          id={`stage-${stage.step}`}
          data-stage
          className="stage-card"
        >
          <div className="stage-card__aside">
            <span className="stage-card__spine" aria-hidden="true">
              <span className="stage-card__spine-fill" />
            </span>
            <div className="stage-card__parked">
              <span className="stage-card__num">{stage.step}</span>
              <h2 className="stage-card__title">{stage.title}</h2>
              <p className="stage-card__blurb">{stage.blurb}</p>
            </div>
          </div>

          <div className="stage-card__body">
            <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed max-w-[68ch]">
              {stage.detail}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[1px] bg-[#282832] border border-[#282832]">
              <div className="bg-[#0a0a0d] p-6 sm:p-8 flex flex-col hover:bg-[#0c0c10] transition-colors duration-300">
                <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-6">
                  What we need from you
                </span>
                <ul className="flex flex-col gap-4">
                  {stage.youBring.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <Check size={14} strokeWidth={2} className="text-violet-400 mt-1 shrink-0" />
                      <span className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-[#0a0a0d] p-6 sm:p-8 flex flex-col justify-center hover:bg-[#0c0c10] transition-colors duration-300">
                <span className="text-[11px] font-semibold text-muted tracking-[0.2em] uppercase mb-4">
                  This stage ends with
                </span>
                <span className="flex items-start gap-3">
                  <ArrowRight size={14} strokeWidth={2} className="text-muted mt-1 shrink-0" />
                  <span className="text-sm sm:text-[15px] text-neutral-300 font-normal leading-relaxed">
                    {stage.ends}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
