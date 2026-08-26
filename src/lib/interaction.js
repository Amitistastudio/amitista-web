const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focusin'];
const OPTIONS = { passive: true, capture: true };

export function onFirstInteraction(run) {
  if (typeof window === 'undefined') return () => {};

  let spent = false;

  const detach = () => {
    for (const type of EVENTS) window.removeEventListener(type, fire, OPTIONS);
  };

  function fire() {
    if (spent) return;
    spent = true;
    detach();
    run();
  }

  for (const type of EVENTS) window.addEventListener(type, fire, OPTIONS);

  return detach;
}
