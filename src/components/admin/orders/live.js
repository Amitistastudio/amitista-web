import React from 'react';
import { fetchOrderPulse } from '../../../lib/admin';

const BEAT_MS = 4000;
const SLOW_MS = 20000;
const AWAY_MS = 600000;
const STIR = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

function signature(map) {
  return Object.keys(map)
    .sort()
    .map((id) => `${id}:${map[id]}`)
    .join(',');
}

export function useOrderLive({ hold, onPulse }) {
  const [state, setState] = React.useState('live');
  const [at, setAt] = React.useState(null);
  const seen = React.useRef(null);
  const hand = React.useRef(onPulse);
  const held = React.useRef(hold);
  const stirred = React.useRef(0);

  React.useEffect(() => {
    hand.current = onPulse;
  }, [onPulse]);

  React.useEffect(() => {
    held.current = hold;
  }, [hold]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    let alive = true;
    let timer = null;
    let misses = 0;
    stirred.current = Date.now();

    const hidden = () => document.visibilityState === 'hidden';
    const away = () => Date.now() - stirred.current > AWAY_MS;
    const resting = () => hidden() || away();

    function schedule() {
      if (!alive) return;
      timer = window.setTimeout(beat, resting() ? SLOW_MS : BEAT_MS);
    }

    async function beat() {
      if (!alive) return;
      if (resting()) {
        setState('paused');
        schedule();
        return;
      }
      if (held.current) {
        schedule();
        return;
      }
      try {
        const pulse = await fetchOrderPulse();
        if (!alive) return;
        misses = 0;
        setState(pulse.botDown ? 'lost' : 'live');
        setAt(Date.now());
        const mark = signature(pulse.orders ?? {});
        if (mark !== seen.current) {
          const first = seen.current === null;
          seen.current = mark;
          if (!first) hand.current?.(pulse.orders ?? {});
        }
      } catch {
        if (!alive) return;
        misses += 1;
        if (misses > 1) setState('lost');
      }
      schedule();
    }

    function wake() {
      stirred.current = Date.now();
      if (!alive || resting()) return;
      window.clearTimeout(timer);
      beat();
    }

    function stir() {
      const idle = away();
      stirred.current = Date.now();
      if (idle) wake();
    }

    beat();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    for (const name of STIR) window.addEventListener(name, stir, { passive: true });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      for (const name of STIR) window.removeEventListener(name, stir);
    };
  }, []);

  return { state, at };
}
