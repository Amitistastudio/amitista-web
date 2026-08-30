const MAX_DELTA = 100;

export function createRafLoop({ element, fps = 0, onFrame, rootMargin = '150px' }) {
  let interval = fps > 0 ? 1000 / fps : 0;

  let frame = null;
  let running = false;
  let visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
  let onscreen = true;
  let elapsed = 0;
  let prev = 0;
  let lastFrame = -Infinity;
  let dead = false;

  const halt = () => {
    running = false;
    prev = 0;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };

  const tick = t => {
    frame = requestAnimationFrame(tick);
    elapsed += prev === 0 ? 0 : Math.min(t - prev, MAX_DELTA);
    prev = t;
    if (interval && elapsed - lastFrame < interval) return;
    lastFrame = elapsed;
    if (onFrame(elapsed) === false) {
      dead = true;
      halt();
    }
  };

  const sync = () => {
    if (dead) return;
    if (visible && onscreen) {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(tick);
    } else if (running) {
      halt();
    }
  };

  const onVisibility = () => {
    visible = document.visibilityState !== 'hidden';
    sync();
  };

  document.addEventListener('visibilitychange', onVisibility);

  let observer = null;
  if (element && typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(
      entries => {
        onscreen = entries.some(entry => entry.isIntersecting);
        sync();
      },
      { rootMargin },
    );
    observer.observe(element);
  }

  sync();

  return {
    setFps(next) {
      interval = next > 0 ? 1000 / next : 0;
    },
    stop() {
      dead = true;
      halt();
      document.removeEventListener('visibilitychange', onVisibility);
      if (observer) observer.disconnect();
    },
  };
}
