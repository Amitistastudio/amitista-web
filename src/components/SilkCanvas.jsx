import { useRef, useEffect } from 'react';
import { Renderer, Program, Triangle, Mesh } from 'ogl';
import { createRafLoop } from '../lib/rafLoop';

const MAX_DPR = 1.5;
const TARGET_FPS = 30;

// What this background is allowed to cost the main thread, and what happens
// when it costs more.
//
// The shader is decoration. On anything with a working GPU a frame is a
// millisecond or two and none of this comes into play. Where it does — a
// software renderer, a cheap phone, a laptop already busy with something real —
// asking for thirty frames a second is asking for something the device cannot
// give, and the way that failure presents is the worst of both: the animation
// is not smooth and the main thread is not free. Past 50ms a frame stops being
// slow and becomes a long task, which is a real cost to whoever is reading the
// page rather than watching the corner of it move.
//
// So the loop watches for both, and asks for less: half the rate first, and if a
// second window at that rate is still bad it stops on the frame it has drawn. A
// still gradient is what most of this looks like at any one moment anyway. Two
// windows rather than one because a machine that was busy for a second is not a
// machine that cannot do this.
//
// Two signals, because the cost lands in two different places and either one
// alone misses half the devices. Timing the draw call catches a renderer that
// does the work where it is asked to. It does not catch the common case: the
// draw returns in a fortieth of a millisecond and the pixels are rasterised
// later, on the same thread, where no timer in the page can see it — profiling
// this page's hero shows 51% of the main thread in the browser's own code and
// 4% in script. What that leaves behind is a frame rate below the one that was
// asked for, which is measurable from here and is the honest summary of both.
const SLOW_FRAME_MS = 8;
const STOP_FRAME_MS = 20;
// Below this share of the rate it asked for, the device is not keeping up.
const RATE_FLOOR = 0.75;
const SLOW_FPS = 15;
// The first frames compile the shader and upload the geometry, and are not
// what steady-state costs. Judged on a window of frames rather than one, so a
// single interrupted frame does not stop the animation for the whole visit.
const WARMUP_FRAMES = 3;
const SAMPLE_FRAMES = 12;
// A gap longer than this is the loop having been paused — the tab went away, or
// the element scrolled off — not a frame that took that long to draw.
const MAX_GAP_MS = 500;

const middle = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
};

const hexToRgb = hex => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0.5, 0.4, 0.6];
};

const SilkCanvas = ({
  speed = 5,
  scale = 1,
  color = '#795299',
  noiseIntensity = 1.5,
  rotation = 0,
  fadeEdge = true,
  className = ''
}) => {
  const containerRef = useRef(null);
  const propsRef = useRef(null);
  propsRef.current = { speed, scale, color, noiseIntensity, rotation, fadeEdge };

  const uniformsRef = useRef(null);
  const renderRef = useRef(null);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer;
    try {
      renderer = new Renderer({
        dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR),
        alpha: true
      });
    } catch {
      return;
    }

    const gl = renderer.gl;
    if (!gl || !gl.canvas) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    reduceMotionRef.current = reduceMotion;

    gl.canvas.style.width = '100%';
    gl.canvas.style.height = '100%';

    if (!reduceMotion) {
      gl.canvas.style.opacity = '0';
      gl.canvas.style.transition = 'opacity 600ms ease-out';
    }

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(gl.canvas);

    const vert = `
      attribute vec2 position;
      attribute vec2 uv;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const frag = `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSpeed;
      uniform float uScale;
      uniform float uRotation;
      uniform float uNoiseIntensity;
      uniform float uFadeEdge;

      const float e = 2.71828182845904523536;

      float noise(vec2 texCoord) {
        float G = e;
        vec2 r = (G * sin(G * texCoord));
        return fract(r.x * r.y * (1.0 + texCoord.x));
      }

      vec2 rotateUvs(vec2 uv, float angle) {
        float c = cos(angle);
        float s = sin(angle);
        mat2 rot = mat2(c, -s, s, c);
        return rot * uv;
      }

      void main() {
        float rnd = noise(gl_FragCoord.xy);
        vec2 uv = rotateUvs(vUv * uScale, uRotation);
        vec2 tex = uv * uScale;
        float tOffset = uSpeed * uTime;

        tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

        float pattern = 0.6 +
                        0.4 * sin(5.0 * (tex.x + tex.y +
                                         cos(3.0 * tex.x + 5.0 * tex.y) +
                                         0.02 * tOffset) +
                                 sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

        vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;

        if (uFadeEdge > 0.5) {
          float waveEdge = 0.05 + 0.55 * (1.0 - vUv.y) + 0.07 * sin(vUv.y * 5.0 + uSpeed * uTime * 0.5);
          float alpha = smoothstep(waveEdge - 0.28, waveEdge + 0.28, vUv.x);
          float edgeY = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
          col.a = alpha * edgeY;
          col.rgb *= col.a;
        } else {
          col.a = 1.0;
        }

        gl_FragColor = col;
      }
    `;

    const removeCanvas = () => {
      if (gl.canvas.parentNode) gl.canvas.parentNode.removeChild(gl.canvas);
    };

    const initial = propsRef.current;
    const uniforms = {
      uTime: { value: 0 },
      uSpeed: { value: initial.speed },
      uScale: { value: initial.scale },
      uNoiseIntensity: { value: initial.noiseIntensity },
      uColor: { value: hexToRgb(initial.color) },
      uRotation: { value: initial.rotation },
      uFadeEdge: { value: initial.fadeEdge ? 1.0 : 0.0 }
    };
    uniformsRef.current = uniforms;

    let mesh;
    try {
      const geometry = new Triangle(gl);
      const program = new Program(gl, { vertex: vert, fragment: frag, uniforms });
      mesh = new Mesh(gl, { geometry, program });
    } catch {
      removeCanvas();
      return;
    }

    const updateSize = () => {
      if (!container) return;
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    const render = t => {
      uniforms.uTime.value = t * 0.0002;
      try {
        renderer.render({ scene: mesh });
        return true;
      } catch {
        return false;
      }
    };
    renderRef.current = render;

    let revealId = null;
    const reveal = () => {
      if (reduceMotion || revealId !== null) return;
      revealId = requestAnimationFrame(() => {
        gl.canvas.style.opacity = '1';
      });
    };

    window.addEventListener('resize', updateSize);
    updateSize();

    let loop = null;
    if (reduceMotion) {
      render(0);
    } else {
      const now = () =>
        (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
      let fps = TARGET_FPS;
      let drawn = 0;
      let costs = [];
      let gaps = [];
      let last = 0;

      // Judged against what was asked for rather than a fixed number: at 15fps
      // a frame has twice as long to arrive before the device is behind.
      const strained = () => {
        if (middle(costs) >= (fps > SLOW_FPS ? SLOW_FRAME_MS : STOP_FRAME_MS)) return true;
        if (gaps.length < SAMPLE_FRAMES / 2) return false;
        return 1000 / middle(gaps) < fps * RATE_FLOOR;
      };

      loop = createRafLoop({
        element: container,
        fps: TARGET_FPS,
        onFrame: t => {
          const started = now();
          if (!render(t)) return false;
          reveal();

          const cost = now() - started;
          drawn += 1;
          if (drawn <= WARMUP_FRAMES) {
            last = started;
            return true;
          }

          costs.push(cost);
          const gap = started - last;
          // A gap this long is the loop having been paused rather than a frame
          // that took that long, and a window holding one is thrown away rather
          // than judged: coming back from a hidden tab should not cost the visit
          // its animation.
          if (last && gap > MAX_GAP_MS) {
            costs = [];
            gaps = [];
          } else if (last && gap > 0) {
            gaps.push(gap);
          }
          last = started;

          if (costs.length >= SAMPLE_FRAMES) {
            const bad = strained();
            costs = [];
            gaps = [];
            // Always try asking for less before giving up, even when the first
            // window is dreadful. Halving the rate is enough on most of the
            // devices this catches.
            if (bad && fps > SLOW_FPS) {
              fps = SLOW_FPS;
              loop.setFps(fps);
            } else if (bad) {
              return false;
            }
          }
          return true;
        }
      });
    }

    return () => {
      if (loop) loop.stop();
      if (revealId !== null) cancelAnimationFrame(revealId);
      window.removeEventListener('resize', updateSize);
      uniformsRef.current = null;
      renderRef.current = null;
      removeCanvas();
    };
  }, []);

  useEffect(() => {
    const uniforms = uniformsRef.current;
    if (!uniforms) return;

    uniforms.uSpeed.value = speed;
    uniforms.uScale.value = scale;
    uniforms.uNoiseIntensity.value = noiseIntensity;
    uniforms.uColor.value = hexToRgb(color);
    uniforms.uRotation.value = rotation;
    uniforms.uFadeEdge.value = fadeEdge ? 1.0 : 0.0;

    if (reduceMotionRef.current && renderRef.current) renderRef.current(0);
  }, [speed, scale, color, noiseIntensity, rotation, fadeEdge]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`silk-surface w-full h-full overflow-hidden pointer-events-none ${className.includes('absolute') ? '' : 'relative'} ${className}`.trim()}
    />
  );
};

export default SilkCanvas;
