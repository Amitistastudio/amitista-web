import React from 'react';
import { ZoomIn, ZoomOut, Move, Crosshair, Check, ImageOff } from 'lucide-react';
import { Button, Notice } from '../ui';
import { Dialog, initials, shade } from './shared';
import { ART_KINDS, cropArt } from './art';

const STAGE = { logo: { width: 320, height: 320 }, banner: { width: 540, height: 180 } };
const MINI = { logo: 40, banner: 132 };
const MAX_ZOOM = 4;

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function frameOf(kind) {
  return STAGE[kind] ?? STAGE.logo;
}

export default function Cropper({ kind, source, image, animated, name, colour, busy, onApply, onKeep, onClose }) {
  const spec = ART_KINDS[kind] ?? ART_KINDS.logo;
  const stage = frameOf(kind);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [error, setError] = React.useState(null);
  const [working, setWorking] = React.useState(false);
  const drag = React.useRef(null);

  const wide = image?.naturalWidth ?? 1;
  const tall = image?.naturalHeight ?? 1;
  const base = Math.max(stage.width / wide, stage.height / tall);
  const shown = { width: wide * base * zoom, height: tall * base * zoom };
  const room = {
    x: Math.max(0, (shown.width - stage.width) / 2),
    y: Math.max(0, (shown.height - stage.height) / 2),
  };

  const settled = React.useMemo(
    () => ({ x: clamp(pan.x, -room.x, room.x), y: clamp(pan.y, -room.y, room.y) }),
    [pan.x, pan.y, room.x, room.y],
  );

  const box = React.useMemo(() => {
    const scale = base * zoom;
    return {
      x: (shown.width / 2 - stage.width / 2 - settled.x) / scale,
      y: (shown.height / 2 - stage.height / 2 - settled.y) / scale,
      width: stage.width / scale,
      height: stage.height / scale,
    };
  }, [base, zoom, shown.width, shown.height, settled.x, settled.y, stage.width, stage.height]);

  React.useEffect(() => {
    function move(event) {
      if (!drag.current) return;
      setPan({
        x: drag.current.from.x + (event.clientX - drag.current.x),
        y: drag.current.from.y + (event.clientY - drag.current.y),
      });
    }
    function drop() {
      drag.current = null;
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', drop);
    window.addEventListener('pointercancel', drop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', drop);
      window.removeEventListener('pointercancel', drop);
    };
  }, []);

  function grab(event) {
    drag.current = { x: event.clientX, y: event.clientY, from: settled };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function turn(next) {
    const wanted = clamp(next, 1, MAX_ZOOM);
    const ratio = wanted / zoom;
    setZoom(wanted);
    setPan((held) => ({ x: held.x * ratio, y: held.y * ratio }));
  }

  function nudge(event) {
    const steps = { ArrowLeft: [12, 0], ArrowRight: [-12, 0], ArrowUp: [0, 12], ArrowDown: [0, -12] };
    const step = steps[event.key];
    if (step) {
      event.preventDefault();
      setPan((held) => ({ x: held.x + step[0], y: held.y + step[1] }));
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      turn(zoom + 0.25);
    }
    if (event.key === '-') {
      event.preventDefault();
      turn(zoom - 0.25);
    }
  }

  async function apply() {
    setError(null);
    setWorking(true);
    try {
      const result = cropArt(image, kind, box);
      await onApply(result);
    } catch (failure) {
      setError(failure.message);
      setWorking(false);
    }
  }

  const mini = kind === 'logo' ? MINI.logo : MINI.banner;
  const shrink = mini / stage.width;
  const held = busy || working;

  const picture = (width, height, factor) => (
    <span
      className="relative block shrink-0 overflow-hidden border border-[#282832] bg-[#111115]"
      style={{ width, height }}
    >
      <img
        src={source}
        alt=""
        draggable={false}
        className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
        style={{
          width: shown.width * factor,
          height: shown.height * factor,
          transform: `translate(calc(-50% + ${settled.x * factor}px), calc(-50% + ${settled.y * factor}px))`,
        }}
      />
    </span>
  );

  return (
    <Dialog
      title={`${spec.label} — frame it how you want it`}
      onClose={onClose}
      footer={
        <>
          <span className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={held} onClick={onClose}>
              Cancel
            </Button>
            {animated && onKeep && (
              <Button type="button" disabled={held} onClick={onKeep}>
                <ImageOff className="h-3.5 w-3.5" strokeWidth={2} />
                Keep it moving, uncropped
              </Button>
            )}
          </span>
          <Button type="button" tone="solid" disabled={held} onClick={apply}>
            <Check className="h-3.5 w-3.5" strokeWidth={2} />
            {held ? 'Saving…' : 'Use this'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {animated && (
          <Notice tone="amber">
            That is an animated image. Cropping keeps the first frame only — use
            <span className="text-neutral-200"> Keep it moving </span>
            to upload it whole instead.
          </Notice>
        )}

        <div className="flex flex-col items-center gap-3">
          <span
            role="group"
            tabIndex={0}
            aria-label="Drag to move the image, scroll or use the slider to zoom"
            onPointerDown={grab}
            onKeyDown={nudge}
            onWheel={(event) => {
              event.preventDefault();
              turn(zoom - Math.sign(event.deltaY) * 0.15);
            }}
            className="relative block cursor-grab touch-none overflow-hidden border border-[#282832] bg-[#050507] outline-none active:cursor-grabbing focus-visible:border-purple-500/60"
            style={{ width: stage.width, height: stage.height }}
          >
            <img
              src={source}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: shown.width,
                height: shown.height,
                transform: `translate(calc(-50% + ${settled.x}px), calc(-50% + ${settled.y}px))`,
              }}
            />
            <span className="pointer-events-none absolute inset-0 border border-white/10" />
            {kind === 'banner' && (
              <>
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0a0d] via-[#0a0a0d]/25 to-transparent" />
                <span className="pointer-events-none absolute bottom-2 left-3 flex items-center gap-2">
                  <span className={`h-4 w-1 ${shade(colour).stripe}`} />
                  <span className="text-[13px] font-normal text-white">{name || 'This board'}</span>
                </span>
              </>
            )}
          </span>

          <span className="flex w-full max-w-[540px] items-center gap-3">
            <ZoomOut className="h-3.5 w-3.5 shrink-0 text-neutral-600" strokeWidth={2} />
            <input
              type="range"
              min="1"
              max={MAX_ZOOM}
              step="0.01"
              value={zoom}
              aria-label="Zoom"
              onChange={(event) => turn(Number(event.target.value))}
              className="h-1 w-full appearance-none bg-[#282832] accent-purple-400 outline-none"
            />
            <ZoomIn className="h-3.5 w-3.5 shrink-0 text-neutral-600" strokeWidth={2} />
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-neutral-500">
              {zoom.toFixed(1)}×
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#17171d] pt-4">
          <span className="flex items-center gap-3">
            {kind === 'logo' ? (
              <>
                {picture(mini, mini, shrink)}
                <span className="text-[15px] font-medium text-white">{name || 'This board'}</span>
              </>
            ) : (
              <>
                {picture(mini, (mini * stage.height) / stage.width, shrink)}
                <span className="flex flex-col">
                  <span className="text-[13px] font-medium text-white">{name || 'This board'}</span>
                  <span className="text-[11px] font-normal text-neutral-500">as the board tile</span>
                </span>
              </>
            )}
            {kind === 'logo' && (
              <span
                className={`inline-flex h-8 w-8 items-center justify-center text-[11px] font-semibold text-black/70 ${
                  shade(colour).stripe
                }`}
                title="What shows without a logo"
              >
                {initials(name || 'New board')}
              </span>
            )}
          </span>

          <span className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-neutral-500 transition-colors hover:text-neutral-200"
            >
              <Crosshair className="h-3 w-3" strokeWidth={2} />
              Start again
            </button>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-normal text-neutral-600">
              <Move className="h-3 w-3" strokeWidth={2} />
              Drag it, scroll to zoom, arrows to nudge
            </span>
          </span>
        </div>

        {error && <Notice tone="rose">{error}</Notice>}
      </div>
    </Dialog>
  );
}
