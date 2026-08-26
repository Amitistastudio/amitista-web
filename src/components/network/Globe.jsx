import React from 'react';
import { isLand } from '../../content/landMask';

const SAMPLES = 24_000;

const DEPTH_TIERS = 5;

const TILT = -0.38;

function buildDots() {
  const dots = [];
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < SAMPLES; i += 1) {
    const y = 1 - (i / (SAMPLES - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;

    const x = Math.cos(theta) * ring;
    const z = Math.sin(theta) * ring;

    const lat = Math.asin(y) * (180 / Math.PI);
    const lon = Math.atan2(z, x) * (180 / Math.PI);

    if (isLand(lat, lon)) dots.push(x, y, z);
  }

  return new Float32Array(dots);
}

function toVector({ lat, lon }) {
  const phi = lat * (Math.PI / 180);
  const lambda = lon * (Math.PI / 180);
  const ring = Math.cos(phi);
  return { x: Math.cos(lambda) * ring, y: Math.sin(phi), z: Math.sin(lambda) * ring };
}

function slerp(a, b, t) {
  const dot = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  const omega = Math.acos(dot);
  if (omega < 1e-6) return { ...a };
  const s = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / s;
  const wb = Math.sin(t * omega) / s;
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb };
}

export default function Globe({ visitor, server, fireToken = 0, className = '' }) {
  const canvasRef = React.useRef(null);
  const wrapRef = React.useRef(null);

  const view = React.useRef({
    spin: 0,
    velocity: 0,
    dragging: false,
    lastX: 0,
    pulses: [],
    visible: true,
  });

  const [supported, setSupported] = React.useState(true);

  const dots = React.useMemo(() => buildDots(), []);

  const targets = React.useRef({ visitor, server });
  targets.current = { visitor, server };

  React.useEffect(() => {
    if (fireToken > 0) view.current.pulses.push({ born: performance.now() });
  }, [fireToken]);

  React.useEffect(() => {
    const midLon = visitor ? (visitor.lon + server.lon) / 2 : server.lon;
    view.current.spin = Math.PI / 2 - midLon * (Math.PI / 180);
  }, [visitor, server]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    const context = canvas.getContext('2d');
    if (!context) {
      setSupported(false);
      return undefined;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let dpr = 1;
    let size = 0;
    let frame = 0;
    let last = performance.now();

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      size = Math.min(wrap.clientWidth, wrap.clientHeight);
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    const intersection = new IntersectionObserver(
      ([entry]) => {
        view.current.visible = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    intersection.observe(wrap);

    const draw = (now) => {
      frame = requestAnimationFrame(draw);

      const dt = Math.min(64, now - last);
      last = now;

      if (!view.current.visible) return;

      const state = view.current;

      if (!state.dragging && !reduced.matches) state.spin += 0.00006 * dt;

      if (!state.dragging && state.velocity !== 0) {
        state.spin += state.velocity * dt;
        state.velocity *= 0.94 ** (dt / 16);
        if (Math.abs(state.velocity) < 1e-6) state.velocity = 0;
      }

      const w = canvas.width;
      const radius = (w / 2) * 0.78;
      const cx = w / 2;
      const cy = w / 2;

      context.clearRect(0, 0, w, w);

      const body = context.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.35,
        radius * 0.1,
        cx,
        cy,
        radius,
      );
      body.addColorStop(0, 'rgba(38,34,60,0.95)');
      body.addColorStop(0.75, 'rgba(18,17,30,0.95)');
      body.addColorStop(1, 'rgba(11,10,18,0.98)');

      const halo = context.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.12);
      halo.addColorStop(0, 'rgba(136,100,242,0.22)');
      halo.addColorStop(1, 'rgba(136,100,242,0)');
      context.beginPath();
      context.arc(cx, cy, radius * 1.12, 0, Math.PI * 2);
      context.fillStyle = halo;
      context.fill();

      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fillStyle = body;
      context.fill();

      context.strokeStyle = 'rgba(150,118,250,0.45)';
      context.lineWidth = dpr;
      context.stroke();

      const sinSpin = Math.sin(state.spin);
      const cosSpin = Math.cos(state.spin);
      const sinTilt = Math.sin(TILT);
      const cosTilt = Math.cos(TILT);

      const project = (v) => {
        const x1 = v.x * cosSpin - v.z * sinSpin;
        const z1 = v.x * sinSpin + v.z * cosSpin;
        const y2 = v.y * cosTilt - z1 * sinTilt;
        const z2 = v.y * sinTilt + z1 * cosTilt;
        return { sx: cx + x1 * radius, sy: cy - y2 * radius, depth: z2 };
      };

      const dotSize = Math.max(1, 1.8 * dpr);
      const tiers = Array.from({ length: DEPTH_TIERS }, () => new Path2D());

      for (let i = 0; i < dots.length; i += 3) {
        const x = dots[i];
        const y = dots[i + 1];
        const z = dots[i + 2];

        const x1 = x * cosSpin - z * sinSpin;
        const z1 = x * sinSpin + z * cosSpin;
        const y2 = y * cosTilt - z1 * sinTilt;
        const z2 = y * sinTilt + z1 * cosTilt;

        if (z2 <= 0.02) continue;

        const tier = Math.min(DEPTH_TIERS - 1, Math.floor(z2 * DEPTH_TIERS));
        tiers[tier].rect(cx + x1 * radius, cy - y2 * radius, dotSize, dotSize);
      }

      for (let tier = 0; tier < DEPTH_TIERS; tier += 1) {
        const alpha = 0.24 + (tier / (DEPTH_TIERS - 1)) * 0.66;
        context.fillStyle = `rgba(214,210,232,${alpha.toFixed(3)})`;
        context.fill(tiers[tier]);
      }

      const { visitor: from, server: to } = targets.current;
      const serverVec = toVector(to);
      const serverPoint = project(serverVec);

      if (from) {
        const visitorVec = toVector(from);
        const visitorPoint = project(visitorVec);

        const spread = Math.acos(
          Math.min(
            1,
            Math.max(
              -1,
              visitorVec.x * serverVec.x + visitorVec.y * serverVec.y + visitorVec.z * serverVec.z,
            ),
          ),
        );
        const lift = 0.06 + (spread / Math.PI) * 0.22;

        const STEPS = 96;
        const arc = [];
        for (let i = 0; i <= STEPS; i += 1) {
          const t = i / STEPS;
          const point = slerp(visitorVec, serverVec, t);
          const height = 1 + Math.sin(Math.PI * t) * lift;
          arc.push(project({ x: point.x * height, y: point.y * height, z: point.z * height }));
        }

        context.lineWidth = 1.4 * dpr;
        context.lineCap = 'round';
        for (let i = 1; i < arc.length; i += 1) {
          const a = arc[i - 1];
          const b = arc[i];
          if (a.depth <= 0 || b.depth <= 0) continue;
          context.strokeStyle = `rgba(167,139,250,${(0.25 + Math.min(a.depth, 1) * 0.5).toFixed(3)})`;
          context.beginPath();
          context.moveTo(a.sx, a.sy);
          context.lineTo(b.sx, b.sy);
          context.stroke();
        }

        const PULSE_MS = 1400;
        state.pulses = state.pulses.filter((pulse) => now - pulse.born < PULSE_MS);
        for (const pulse of state.pulses) {
          const raw = reduced.matches ? 0.5 : (now - pulse.born) / PULSE_MS;
          const t = Math.min(1, Math.max(0, raw));
          const point = arc[Math.max(0, Math.min(arc.length - 1, Math.round(t * STEPS)))];
          if (point.depth <= 0) continue;
          const fade = Math.sin(Math.PI * t);
          context.beginPath();
          context.arc(point.sx, point.sy, 2.6 * dpr, 0, Math.PI * 2);
          context.fillStyle = `rgba(255,255,255,${(0.9 * fade).toFixed(3)})`;
          context.fill();
        }

        drawMarker(context, visitorPoint, dpr, '#ffffff', from.label, now, false);
      }

      drawMarker(context, serverPoint, dpr, '#a78bfa', to.label, now, !reduced.matches);
    };

    frame = requestAnimationFrame(draw);

    const onDown = (event) => {
      view.current.dragging = true;
      view.current.velocity = 0;
      view.current.lastX = event.clientX;
      canvas.setPointerCapture?.(event.pointerId);
    };
    const onMove = (event) => {
      if (!view.current.dragging) return;
      const dx = event.clientX - view.current.lastX;
      view.current.lastX = event.clientX;
      const delta = (dx / Math.max(1, size)) * 3;
      view.current.spin += delta;
      view.current.velocity = delta / 16;
    };
    const onUp = (event) => {
      view.current.dragging = false;
      canvas.releasePointerCapture?.(event.pointerId);
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [dots]);

  const label = visitor
    ? `A globe showing the route from ${visitor.label} to this site's server in ${server.label}.`
    : `A globe showing this site's server in ${server.label}.`;

  return (
    <div ref={wrapRef} className={`relative aspect-square w-full ${className}`}>
      {supported ? (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-grab touch-pan-y active:cursor-grabbing"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
          <p className="font-tech text-[11px] leading-relaxed text-neutral-500">
            This browser has no 2D canvas, so the globe cannot be drawn. Every number
            beside it was measured without one.
          </p>
        </div>
      )}
    </div>
  );
}

function drawMarker(context, point, dpr, colour, text, now, beacon) {
  if (point.depth <= 0) return;

  if (beacon) {
    const t = ((now % 2400) / 2400);
    context.beginPath();
    context.arc(point.sx, point.sy, (4 + t * 16) * dpr, 0, Math.PI * 2);
    context.strokeStyle = `rgba(167,139,250,${(0.45 * (1 - t)).toFixed(3)})`;
    context.lineWidth = 1.2 * dpr;
    context.stroke();
  }

  context.beginPath();
  context.arc(point.sx, point.sy, 3.4 * dpr, 0, Math.PI * 2);
  context.fillStyle = colour;
  context.fill();

  if (!text) return;

  context.font = `${11 * dpr}px 'DM Sans', sans-serif`;
  context.textBaseline = 'middle';
  context.fillStyle = 'rgba(255,255,255,0.72)';
  context.fillText(text, point.sx + 9 * dpr, point.sy - 8 * dpr);
}
