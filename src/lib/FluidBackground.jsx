import React, { memo, useEffect, useRef, useState } from "react";
import { MeshGradient, useCoverPalette } from "./MeshGradient.jsx";

/*
 * Background fluid ala Apple Music (layar penuh desktop).
 *
 * Bukan gambar cover yang digeser/diblur: yang bergerak adalah CAMPURAN WARNA.
 *  - Dari cover diambil 5 warna dominan (disaring supaya berbeda satu sama lain, lalu
 *    dijenuhkan dan dijaga kecerahannya supaya teks putih tetap terbaca).
 *  - Fragment shader menaruh 5 "titik warna" besar yang melayang di lintasan Lissajous
 *    berbeda, lalu mencampurnya dengan bobot gaussian ternormalisasi -> mesh gradient halus.
 *    Domain-warp membuat batas antar warna mengalir seperti cairan.
 *  - Ganti lagu: kelima warna di-lerp ke warna baru (±1,5 dtk) sementara waktu animasi
 *    tetap jalan, jadi gerakannya tidak pernah reset.
 *  - Render di resolusi rendah lalu di-upscale browser: ringan di GPU. Berhenti saat tab
 *    tersembunyi / player ditutup, statis saat reduced motion, melambat saat pause.
 *  - WebGL tidak tersedia / context hilang -> jatuh ke MeshGradient CSS yang sudah ada.
 */

const COLORS = 5;
const RES_SCALE = 0.25;
const MIN_W = 220;
const MAX_W = 640;
const COLOR_EASE = 1.7;   // makin besar makin cepat pindah warna saat ganti lagu

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

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main(){
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float t = uTime;

  // domain warp: batas antar warna mengalir seperti cairan
  p += 0.085 * vec2(sin(p.y * 2.6 + t * 0.29), cos(p.x * 2.3 + t * 0.25));
  p += 0.040 * vec2(sin(p.y * 5.4 - t * 0.41 + 1.7), cos(p.x * 4.9 + t * 0.36));

  float ax = uAspect * 0.5;

  // 5 titik warna yang melayang (kecepatan & lintasan berbeda-beda)
  vec2 q0 = vec2(sin(t * 0.17 + 0.0) * 0.82 * ax, cos(t * 0.13 + 0.6) * 0.40);
  vec2 q1 = vec2(cos(t * 0.15 + 2.1) * 0.88 * ax, sin(t * 0.19 + 1.3) * 0.42);
  vec2 q2 = vec2(sin(t * 0.21 + 4.0) * 0.76 * ax, sin(t * 0.14 + 0.4) * 0.44);
  vec2 q3 = vec2(cos(t * 0.12 + 5.2) * 0.84 * ax, cos(t * 0.23 + 3.1) * 0.40);
  vec2 q4 = vec2(sin(t * 0.11 + 3.3) * 0.46 * ax, cos(t * 0.18 + 2.2) * 0.30);

  float w0 = exp(-dot(p - q0, p - q0) * 3.60);
  float w1 = exp(-dot(p - q1, p - q1) * 3.80);
  float w2 = exp(-dot(p - q2, p - q2) * 4.00);
  float w3 = exp(-dot(p - q3, p - q3) * 3.80);
  float w4 = exp(-dot(p - q4, p - q4) * 5.00);

  vec3 sum = uC0 * w0 + uC1 * w1 + uC2 * w2 + uC3 * w3 + uC4 * w4;
  float wsum = w0 + w1 + w2 + w3 + w4;
  // sedikit warna rata-rata sebagai alas, supaya area jauh dari titik mana pun tetap halus
  vec3 avg = (uC0 + uC1 + uC2 + uC3 + uC4) * 0.2;
  vec3 col = (sum + avg * 0.03) / (wsum + 0.03);

  // saturasi tipis + highlight rolloff supaya tidak neon
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.12);
  col = clamp(col, 0.0, 1.0);

  // vignette halus
  float v = 1.0 - smoothstep(0.25, 1.35, length((vUv - 0.5) * vec2(1.15, 1.0)));
  col *= mix(0.68, 1.0, v);

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
      try { gl.deleteBuffer(buf); gl.deleteProgram(prog); } catch { /* noop */ }
    },
  };
}

/* ---------- ambil & rapikan warna cover ---------- */

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

// Jenuhkan warna tapi jaga kecerahan di rentang yang aman untuk teks putih.
// Cover hitam-putih (sat rendah) dibiarkan netral, tidak dipaksa berwarna.
function tuneRgb([r, g, b]) {
  const [h, s, l] = rgbToHsl(r, g, b);
  const neutral = s < 0.1;
  const sat = neutral ? s : clamp(s * 1.18, 0.4, 0.95);
  const lum = clamp(0.17 + l * 0.46, 0.2, 0.58);
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
    out.push(hslToRgb((h + dh + 1) % 1, s, clamp(l + dl, 0.2, 0.58)));
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
  buckets.forEach((e) => {
    const r = e.r / e.n / 255, g = e.g / e.n / 255, b = e.b / e.n / 255;
    const [, s, l] = rgbToHsl(r, g, b);
    // warna terlalu hitam / putih polos kurang berguna sebagai titik warna
    const edge = l < 0.05 || l > 0.97 ? 0.25 : 1;
    cands.push({ rgb: [r, g, b], score: e.n * (1 + s * 2.4) * edge });
  });
  cands.sort((a, b) => b.score - a.score);

  const picked = [];
  for (const cand of cands) {
    const far = picked.every((p) => Math.hypot(p[0] - cand.rgb[0], p[1] - cand.rgb[1], p[2] - cand.rgb[2]) > 0.22);
    if (far) picked.push(cand.rgb);
    if (picked.length === COLORS) break;
  }
  return fillColors(picked.map(tuneRgb));
}

// Cadangan kalau cover tidak bisa dibaca (CORS): pakai palet dari MeshGradient / warna dominan server.
function colorsFromPalette(palette) {
  const out = (palette || []).map((str) => {
    const m = /hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i.exec(str);
    if (!m) return null;
    const l = clamp(+m[3] / 100 * 1.5, 0.28, 0.52);
    return hslToRgb((+m[1] % 360) / 360, +m[2] / 100, l);
  }).filter(Boolean);
  return fillColors(out);
}

/* ---------- komponen ---------- */

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

  // --- renderer + loop ---
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

      // warna mengalir ke warna lagu baru
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

  // --- cover baru -> warna target baru ---
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