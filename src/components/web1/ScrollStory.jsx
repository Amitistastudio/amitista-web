import React from 'react';

export default function ScrollStory() {
  const sectionRef = React.useRef(null);
  const frameRef = React.useRef(0);

  React.useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const update = () => {
      frameRef.current = 0;
      if (motionQuery.matches) return;
      const bounds = section.getBoundingClientRect();
      const distance = Math.max(section.offsetHeight - window.innerHeight, 1);
      const progress = Math.min(Math.max(-bounds.top / distance, 0), 1);
      section.style.setProperty('--pin-progress', progress.toFixed(4));
    };
    const queueUpdate = () => {
      if (!frameRef.current) frameRef.current = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', queueUpdate, { passive: true });
    window.addEventListener('resize', queueUpdate);
    motionQuery.addEventListener('change', queueUpdate);
    return () => {
      window.removeEventListener('scroll', queueUpdate);
      window.removeEventListener('resize', queueUpdate);
      motionQuery.removeEventListener('change', queueUpdate);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <section ref={sectionRef} className="pin-note" aria-labelledby="pin-note-title">
      <div className="pin-note__sticky">
        <div className="pin-note__inner">
          <div className="pin-note__meta">
            <span>02 / OUR APPROACH</span>
            <span>ONE TEAM — START TO FINISH</span>
          </div>

          <h2 id="pin-note-title" className="pin-note__title">
            <span className="pin-note__line pin-note__line--one">Think it through.</span>
            <span className="pin-note__line pin-note__line--two">Make it feel right.</span>
            <span className="pin-note__line pin-note__line--three">Build it properly.</span>
          </h2>

          <div className="pin-note__footer">
            <p>Strategy, design and engineering,<br />all around the same table.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
