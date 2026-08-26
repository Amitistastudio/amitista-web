import { useRef, useEffect } from 'react';
import { Renderer, Program, Triangle, Mesh } from 'ogl';
import { createRafLoop } from '../lib/rafLoop';

const MAX_DPR = 1.5;
const TARGET_FPS = 30;

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
      loop = createRafLoop({
        element: container,
        fps: TARGET_FPS,
        onFrame: t => {
          if (!render(t)) return false;
          reveal();
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
