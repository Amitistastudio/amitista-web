import React from 'react';
import { createRafLoop } from '../lib/rafLoop';

const LEVELS = 11;

const TARGET_CELLS = 16000;
const MIN_CELL = 14;

const FRAME_MS = 33;

function height(x, y, t) {
  return (
    Math.sin(x * 1.7 + t) * Math.cos(y * 1.3 - t * 0.7) +
    Math.sin((x + y) * 0.9 + t * 0.5) * 0.7 +
    Math.cos(x * 0.6 - y * 1.4 + t * 0.31) * 0.55 +
    Math.sin(y * 2.3 - t * 0.42) * 0.32
  );
}

export default function ContourField({ className = '' }) {
  const containerRef = React.useRef(null);
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    let ctx;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return undefined;
    }
    if (!ctx) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let cols = 0;
    let rows = 0;
    let cell = MIN_CELL;
    let values = new Float32Array(0);

    const measure = (w, h) => {
      cell = Math.max(MIN_CELL, Math.round(Math.sqrt((w * h) / TARGET_CELLS)));
      cols = Math.ceil(w / cell) + 1;
      rows = Math.ceil(h / cell) + 1;
      values = new Float32Array((cols + 1) * (rows + 1));
    };

    const render = (time) => {
      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h || !values.length) return;

      ctx.clearRect(0, 0, w, h);

      const t = time * 0.00009;
      const k = 0.0055;
      for (let r = 0; r <= rows; r += 1) {
        const y = r * cell;
        for (let c = 0; c <= cols; c += 1) {
          values[r * (cols + 1) + c] = height(c * cell * k, y * k, t);
        }
      }

      ctx.lineWidth = 1;
      ctx.lineCap = 'round';

      for (let l = 0; l < LEVELS; l += 1) {
        const p = l / (LEVELS - 1);
        const level = -1.05 + p * 2.1;

        const lift = Math.sin(Math.PI * p);
        ctx.strokeStyle = `rgba(${Math.round(167 + p * 88)}, ${Math.round(
          139 + p * 116,
        )}, 250, ${0.09 + lift * 0.2})`;

        ctx.beginPath();

        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            const i = r * (cols + 1) + c;
            const tl = values[i];
            const tr = values[i + 1];
            const bl = values[i + cols + 1];
            const br = values[i + cols + 2];

            let code = 0;
            if (tl > level) code |= 8;
            if (tr > level) code |= 4;
            if (br > level) code |= 2;
            if (bl > level) code |= 1;
            if (code === 0 || code === 15) continue;

            const x0 = c * cell;
            const y0 = r * cell;

            const top = x0 + (cell * (level - tl)) / (tr - tl);
            const bottom = x0 + (cell * (level - bl)) / (br - bl);
            const left = y0 + (cell * (level - tl)) / (bl - tl);
            const right = y0 + (cell * (level - tr)) / (br - tr);

            switch (code) {
              case 1:
              case 14:
                ctx.moveTo(x0, left);
                ctx.lineTo(bottom, y0 + cell);
                break;
              case 2:
              case 13:
                ctx.moveTo(bottom, y0 + cell);
                ctx.lineTo(x0 + cell, right);
                break;
              case 3:
              case 12:
                ctx.moveTo(x0, left);
                ctx.lineTo(x0 + cell, right);
                break;
              case 4:
              case 11:
                ctx.moveTo(top, y0);
                ctx.lineTo(x0 + cell, right);
                break;
              case 6:
              case 9:
                ctx.moveTo(top, y0);
                ctx.lineTo(bottom, y0 + cell);
                break;
              case 7:
              case 8:
                ctx.moveTo(top, y0);
                ctx.lineTo(x0, left);
                break;
              case 5:
                ctx.moveTo(top, y0);
                ctx.lineTo(x0, left);
                ctx.moveTo(bottom, y0 + cell);
                ctx.lineTo(x0 + cell, right);
                break;
              case 10:
                ctx.moveTo(top, y0);
                ctx.lineTo(x0 + cell, right);
                ctx.moveTo(x0, left);
                ctx.lineTo(bottom, y0 + cell);
                break;
              default:
                break;
            }
          }
        }

        ctx.stroke();
      }
    };

    const resize = () => {
      const { width, height: boxHeight } = container.getBoundingClientRect();
      if (!width || !boxHeight) return;

      canvas.width = Math.round(width);
      canvas.height = Math.round(boxHeight);
      measure(canvas.width, canvas.height);
      if (reduced) render(0);
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const loop = reduced
      ? null
      : createRafLoop({
          element: container,
          fps: 1000 / FRAME_MS,
          onFrame: render,
        });

    return () => {
      if (loop) loop.stop();
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
    >
      <canvas ref={canvasRef} className="contour-canvas w-full h-full" />
    </div>
  );
}
