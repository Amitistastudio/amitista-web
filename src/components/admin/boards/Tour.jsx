import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, Compass, X } from 'lucide-react';
import { Button } from '../ui';

const SEEN_KEY = 'amitista.boards.tour';

function readSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === 'yes';
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, 'yes');
  } catch {
    return;
  }
}

const STEPS = [
  {
    mark: 'boards-new',
    title: 'A board is one project',
    body: 'Start one for anything you want to keep track of. Everything about it lives inside it — the work, the people on it, the notes.',
  },
  {
    mark: 'boards-tile',
    title: 'Open one to see inside',
    body: 'The bar shows how much of it is done. Right-click a board for the quick things: rename it, archive it, or open its settings.',
  },
  {
    mark: 'board-head',
    title: 'You are inside a board',
    body: 'Its name, who can see it, and how far along it is. All boards takes you back out.',
  },
  {
    mark: 'board-filters',
    title: 'Narrow what you are looking at',
    body: 'Search the board, show only what is on you, hide what is finished, or look through the archive. Nothing here changes the board.',
  },
  {
    mark: 'board-rail',
    title: 'Columns are the stages',
    body: 'Work moves left to right. When there are more columns than fit, hold the background and drag sideways to move along them.',
  },
  {
    mark: 'board-card',
    sel: '[data-card]',
    title: 'A card is one piece of work',
    body: 'Click it to open the notes, the checklist, comments, files, a due date and who is on it. Drag it to another column to move it, or right-click it for the quick things.',
  },
  {
    mark: 'board-add-card',
    title: 'Put the work down as you think of it',
    body: 'Enter adds another card straight away, so you can empty your head in one go and tidy it up later.',
  },
  {
    mark: 'board-live',
    title: 'There is nothing to save',
    body: 'Every change is written as you make it, and anyone else on this board sees it within a few seconds.',
  },
  {
    mark: 'board-settings',
    title: 'The rest lives here',
    body: 'Who can see the board, who can change it, the labels, the artwork, and the reminders it sends people.',
  },
];

function seek(step) {
  if (typeof document === 'undefined' || !step) return null;
  return document.querySelector(step.sel ?? `[data-tour="${step.mark}"]`);
}

function useSpot(step) {
  const [spot, setSpot] = React.useState(null);
  const where = step ? (step.sel ?? `[data-tour="${step.mark}"]`) : '';

  React.useEffect(() => {
    const node = where ? document.querySelector(where) : null;
    if (!node) {
      setSpot(null);
      return undefined;
    }
    node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    let frame = 0;
    let held = '';
    const watch = () => {
      const box = node.getBoundingClientRect();
      const next = {
        top: Math.round(box.top),
        left: Math.round(box.left),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
      const key = `${next.top}:${next.left}:${next.width}:${next.height}`;
      if (key !== held) {
        held = key;
        setSpot(next);
      }
      frame = window.requestAnimationFrame(watch);
    };
    watch();
    return () => window.cancelAnimationFrame(frame);
  }, [where]);

  return spot;
}

function Callout({ spot, step, at, total, onBack, onNext, onClose }) {
  const box = React.useRef(null);
  const [size, setSize] = React.useState({ width: 320, height: 200 });

  React.useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });
  }, [step.mark]);

  const room = typeof window === 'undefined' ? 800 : window.innerHeight;
  const across = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const under = spot.top + spot.height + 14;
  const over = spot.top - size.height - 14;
  const top = under + size.height < room - 12 || over < 12 ? under : over;
  const wanted = spot.left + spot.width / 2 - size.width / 2;
  const left = Math.min(Math.max(wanted, 16), Math.max(16, across - size.width - 16));

  return (
    <div
      ref={box}
      role="dialog"
      aria-live="polite"
      aria-label={step.title}
      style={{ top: Math.min(Math.max(top, 12), Math.max(12, room - size.height - 12)), left }}
      className="pointer-events-auto absolute w-[min(340px,calc(100vw-2rem))] border border-[#3f3f4c] bg-[#0a0a0d] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.6)]"
    >
      <div className="mb-2 flex items-center gap-2">
        <Compass className="h-3.5 w-3.5 text-purple-400" strokeWidth={2} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Show me around
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-neutral-600">
          {at + 1}/{total}
        </span>
        <button
          type="button"
          aria-label="Close the tour"
          onClick={onClose}
          className="text-neutral-600 transition-colors hover:text-neutral-200"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      <h3 className="text-[14px] font-medium leading-snug text-white">{step.title}</h3>
      <p className="mt-1.5 text-[12px] font-normal leading-relaxed text-neutral-400">{step.body}</p>
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" disabled={at === 0} onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Back
        </Button>
        <Button type="button" tone="solid" onClick={onNext}>
          {at === total - 1 ? (
            <>
              <Check className="h-3.5 w-3.5" strokeWidth={2} />
              Got it
            </>
          ) : (
            <>
              Next
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function Tour({ onClose }) {
  const steps = React.useMemo(
    () =>
      typeof document === 'undefined'
        ? []
        : STEPS.filter((step) => seek(step)),
    [],
  );
  const [at, setAt] = React.useState(0);
  const step = steps[Math.min(at, steps.length - 1)];
  const spot = useSpot(step);

  const shut = React.useCallback(() => {
    markSeen();
    onClose();
  }, [onClose]);

  React.useEffect(() => {
    function key(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        shut();
      }
      if (event.key === 'ArrowRight') setAt((held) => Math.min(held + 1, steps.length - 1));
      if (event.key === 'ArrowLeft') setAt((held) => Math.max(held - 1, 0));
    }
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [shut, steps.length]);

  if (typeof document === 'undefined' || !step) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120]" aria-label="Board tour">
      {spot ? (
        <>
          <div
            aria-hidden="true"
            style={{
              top: spot.top - 4,
              left: spot.left - 4,
              width: spot.width + 8,
              height: spot.height + 8,
              boxShadow: '0 0 0 9999px rgba(3,3,5,0.82)',
            }}
            className="absolute border border-purple-400/70"
          />
          <Callout
            spot={spot}
            step={step}
            at={at}
            total={steps.length}
            onBack={() => setAt((held) => Math.max(held - 1, 0))}
            onNext={() => (at === steps.length - 1 ? shut() : setAt(at + 1))}
            onClose={shut}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/80" onClick={shut} />
      )}
    </div>,
    document.body,
  );
}

export function TourButton({ onClick }) {
  const [fresh, setFresh] = React.useState(false);

  React.useEffect(() => {
    setFresh(!readSeen());
  }, []);

  return (
    <Button type="button" onClick={onClick}>
      <Compass className="h-3.5 w-3.5" strokeWidth={2} />
      Show me around
      {fresh && <span className="h-1.5 w-1.5 shrink-0 bg-purple-400" aria-hidden="true" />}
    </Button>
  );
}
