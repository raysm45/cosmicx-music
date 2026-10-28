import React, { memo, useEffect, useRef, useState } from "react";
import { MeshGradient, useCoverPalette } from "./MeshGradient.jsx";

const COLORS = 5;
const RES_SCALE = 0.25;
const MIN_W = 220;
const MAX_W = 640;
const COLOR_EASE = 4.2;

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uC4;
uniform float uTime;
uniform float uAspect;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// blob lonjong: diputar sebesar ang, lalu y diregangkan (stretch)
float blob(vec2 d, float ang, float k, float stretch){
  d = rot(ang) * d;
  d.y *= stretch;
  return exp(-dot(d, d) * k);
}

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main(){
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float t = uTime;

  // domain warp: batas antar warna mengalir seperti cairan
  p += 0.12 * vec2(sin(p.y * 2.6 + t * 0.33), cos(p.x * 2.3 + t * 0.29));
  p += 0.055 * vec2(sin(p.y * 5.4 - t * 0.47 + 1.7), cos(p.x * 4.9 + t * 0.41));

  float ax = uAspect * 0.5;

  // 7 blob lonjong yang melayang & berputar (lintasan / kecepatan berbeda-beda).
  // Bentuk lonjong + rotasi inilah yang bikin tampak "mengalir", bukan sekadar gradien diam.
  vec2 q0 = vec2(sin(t * 0.23 + 0.0) * 0.80 * ax, cos(t * 0.17 + 0.6) * 0.42);
  vec2 q1 = vec2(cos(t * 0.20 + 2.1) * 0.86 * ax, sin(t * 0.25 + 1.3) * 0.44);
  vec2 q2 = vec2(sin(t * 0.27 + 4.0) * 0.76 * ax, sin(t * 0.19 + 0.4) * 0.46);
  vec2 q3 = vec2(cos(t * 0.16 + 5.2) * 0.84 * ax, cos(t * 0.29 + 3.1) * 0.42);
  vec2 q4 = vec2(sin(t * 0.15 + 3.3) * 0.50 * ax, cos(t * 0.24 + 2.2) * 0.32);
  vec2 q5 = vec2(cos(t * 0.31 + 1.1) * 0.70 * ax, sin(t * 0.21 + 5.0) * 0.40);
  vec2 q6 = vec2(sin(t * 0.18 + 6.0) * 0.66 * ax, cos(t * 0.33 + 0.9) * 0.38);

  float w0 = blob(p - q0, t * 0.13 + 0.3, 3.4, 1.9);
  float w1 = blob(p - q1, -t * 0.11 + 1.9, 3.6, 2.1);
  float w2 = blob(p - q2, t * 0.15 + 3.4, 3.8, 1.8);
  float w3 = blob(p - q3, -t * 0.12 + 4.8, 3.6, 2.0);
  float w4 = blob(p - q4, t * 0.17 + 0.9, 4.6, 1.6);
  float w5 = blob(p - q5, -t * 0.14 + 2.7, 3.8, 2.2);
  float w6 = blob(p - q6, t * 0.10 + 5.6, 4.0, 1.9);

  vec3 sum = uC0 * w0 + uC1 * w1 + uC2 * w2 + uC3 * w3 + uC4 * w4 + uC2 * w5 + uC1 * w6;
  float wsum = w0 + w1 + w2 + w3 + w4 + w5 + w6;
  vec3 avg = (uC0 + uC1 + uC2 + uC3 + uC4) * 0.2;
  vec3 col = (sum + avg * 0.02) / (wsum + 0.02);

  // saturasi tipis + highlight rolloff supaya tidak neon
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.22);
  col = clamp(col, 0.0, 1.0);

  // vignette halus
  float v = 1.0 - smoothstep(0.25, 1.35, length((vUv - 0.5) * vec2(1.15, 1.0)));
  col *= mix(0.80, 1.0, v);

  // dither tipis supaya tidak ada banding di gradien gelap
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) * (2.0 / 255.0);
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(log || "shader compile failed");
  }
  return s;
}

function createRenderer(canvas) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power", premultipliedAlpha: false })
    || canvas.getContext("experimental-webgl");
  if (!gl) throw new Error("no webgl");

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link failed");
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uC = [];
  for (let i = 0; i < COLORS; i++) uC.push(gl.getUniformLocation(prog, `uC${i}`));
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uAspect = gl.getUniformLocation(prog, "uAspect");

  return {
    draw(time, colors, w, h) {
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uAspect, w / Math.max(1, h));
      for (let i = 0; i < COLORS; i++) gl.uniform3f(uC[i], colors[i][0], colors[i][1], colors[i][2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      try { gl.deleteBuffer(buf); gl.deleteProgram(prog); } catch {}
    },
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const f = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
}
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function tuneRgb([r, g, b]) {
  const [h, sat0, l] = rgbToHsl(r, g, b);
  const sat = clamp(sat0 * 1.05 + smooth(0.12, 0.32, sat0) * 0.22, 0, 0.92);
  const cap = 0.34 + 0.16 * sat;
  const lum = 0.03 + (cap - 0.03) * Math.pow(clamp(l / 0.6, 0, 1), 1.1);
  return hslToRgb(h, sat, lum);
}

function fillColors(list) {
  const out = list.slice(0, COLORS);
  const base = out[0] || [0.25, 0.25, 0.3];
  const [h, s, l] = rgbToHsl(base[0], base[1], base[2]);
  const shifts = [[0.06, 0.04], [-0.07, -0.06], [0.32, 0.0], [0.14, -0.08]];
  let i = 0;
  while (out.length < COLORS) {
    const [dh, dl] = shifts[i++ % shifts.length];
    out.push(hslToRgb((h + dh + 1) % 1, s, clamp(l + dl * 2, 0.05, 0.5)));
  }
  return out;
}

function colorsFromImage(img) {
  const size = 48;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 40) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key);
    if (e) { e.r += r; e.g += g; e.b += b; e.n++; } else buckets.set(key, { r, g, b, n: 1 });
  }
  const cands = [];
  let total = 0;
  buckets.forEach((e) => {
    const r = e.r / e.n / 255, g = e.g / e.n / 255, b = e.b / e.n / 255;
    const [, sat, l] = rgbToHsl(r, g, b);
    const edge = l > 0.985 ? 0.25 : 1;
    cands.push({ rgb: [r, g, b], n: e.n, l, sat, score: e.n * (1 + sat * 2.4) * edge });
    total += e.n;
  });
  cands.sort((a, b) => b.score - a.score);

  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const picked = [];
  const add = (c, min) => { if (c && picked.length < COLORS && picked.every((p) => dist(p, c.rgb) > min)) { picked.push(c.rgb); return true; } return false; };

  add(cands[0], 0);
  const sig = cands.filter((c) => c.n >= total * 0.012);
  const pool = sig.length ? sig : cands;
  add(pool.reduce((m, c) => (c.l < m.l ? c : m), pool[0]), 0.14);
  add(pool.reduce((m, c) => (c.l > m.l ? c : m), pool[0]), 0.14);
  const colorful = sig.filter((c) => c.l > 0.12 && c.l < 0.9);
  if (colorful.length) add(colorful.reduce((m, c) => (c.sat * Math.sqrt(c.n) > m.sat * Math.sqrt(m.n) ? c : m), colorful[0]), 0.14);
  for (const c of cands) { if (picked.length >= COLORS) break; add(c, 0.16); }
  return fillColors(picked.map(tuneRgb));
}

function colorsFromPalette(palette) {
  const out = (palette || []).map((str) => {
    const m = /hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i.exec(str);
    if (!m) return null;
    const l = clamp(+m[3] / 100 * 1.5, 0.28, 0.52);
    return hslToRgb((+m[1] % 360) / 360, +m[2] / 100, l);
  }).filter(Boolean);
  return fillColors(out);
}


export const FluidBackground = memo(function FluidBackground({ src, fallbackColor, active = true, playing = true, still = false }) {
  const canvasRef = useRef(null);
  const palette = useCoverPalette(src, fallbackColor);
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const [failed, setFailed] = useState(false);

  const live = useRef({ active, playing, still });
  live.current = { active, playing, still };

  const colors = useRef({ cur: colorsFromPalette(null), target: colorsFromPalette(null), ready: false });
  const clock = useRef({ t: 23.7, last: 0, speed: 1 });
  const rafRef = useRef(0);
  const kick = useRef(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let r;
    try { r = createRenderer(canvas); } catch { setFailed(true); return undefined; }

    const size = () => {
      const cw = canvas.clientWidth || window.innerWidth || 1280;
      const ch = canvas.clientHeight || window.innerHeight || 720;
      const w = Math.max(MIN_W, Math.min(MAX_W, Math.round(cw * RES_SCALE)));
      return [w, Math.max(1, Math.round(w * (ch / Math.max(1, cw))))];
    };

    const frame = (now) => {
      rafRef.current = 0;
      const { active: a, playing: p, still: s } = live.current;
      const c = clock.current;
      const dt = c.last ? Math.min(0.1, (now - c.last) / 1000) : 0;
      c.last = now;

      const target = s ? 0 : (p ? 1 : 0.3);
      c.speed += (target - c.speed) * Math.min(1, dt * 2.2);
      c.t += dt * c.speed;

      const col = colors.current;
      let moving = 0;
      const k = Math.min(1, dt * COLOR_EASE);
      for (let i = 0; i < COLORS; i++) {
        for (let j = 0; j < 3; j++) {
          const d = col.target[i][j] - col.cur[i][j];
          col.cur[i][j] += d * k;
          if (Math.abs(d) > moving) moving = Math.abs(d);
        }
      }

      const [w, h] = size();
      r.draw(c.t, col.cur, w, h);

      const more = a && !document.hidden && (c.speed > 0.002 || moving > 0.002 || Math.abs(target - c.speed) > 0.002);
      if (more) rafRef.current = requestAnimationFrame(frame);
      else c.last = 0;
    };

    kick.current = () => {
      if (!rafRef.current && !document.hidden && live.current.active) rafRef.current = requestAnimationFrame(frame);
    };
    kick.current();

    const onVis = () => { if (!document.hidden) { clock.current.last = 0; kick.current(); } };
    const onResize = () => { if (!rafRef.current) { clock.current.last = 0; rafRef.current = requestAnimationFrame(frame); } };
    const onLost = (e) => { e.preventDefault(); setFailed(true); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", onResize);
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("webglcontextlost", onLost);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      kick.current = () => {};
      r.destroy();
    };
  }, []);

  useEffect(() => { kick.current(); }, [active, playing, still]);

  useEffect(() => {
    let alive = true;
    const apply = (list) => {
      if (!alive) return;
      const col = colors.current;
      col.target = list;
      if (!col.ready) { col.cur = list.map((c) => c.slice()); col.ready = true; }   // pertama kali: langsung, tanpa transisi
      kick.current();
    };
    const usePalette = () => apply(colorsFromPalette(paletteRef.current));

    if (!src) { usePalette(); return () => { alive = false; }; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (!alive) return;
      try { apply(colorsFromImage(img)); } catch { usePalette(); }
    };
    img.onerror = usePalette;
    img.src = src;
    return () => { alive = false; };
  }, [src]);

  if (failed) return <MeshGradient palette={palette} active={active} still={still} />;
  return <canvas ref={canvasRef} className="npd-fluid" aria-hidden="true" />;
});