import React, { memo, useEffect, useRef, useState } from "react";
import { MeshGradient, useCoverPalette } from "./MeshGradient.jsx";

/*
 * Background fluid ala Apple Music (layar penuh desktop).
 *
 * Cara kerjanya (sama seperti renderer Apple Music):
 *  - Cover di-downscale kecil lalu dijadikan tekstur halus (blur bawaan dari interpolasi).
 *  - Fragment shader menumpuk satu layer dasar + 4 "blob" cover yang berputar dan berpindah
 *    di lintasan Lissajous berbeda-beda, ditambah domain-warp supaya bentuknya cair.
 *  - Saturasi dinaikkan, kecerahan dinormalkan dari luminansi cover (cover putih tidak
 *    membakar teks, cover gelap tidak mati), lalu vignette + dither tipis (anti-banding).
 *  - Ganti lagu = crossfade dua tekstur sambil waktu animasi tetap jalan, jadi gerakannya
 *    tidak pernah "reset" atau loncat.
 *  - Render di resolusi rendah (±28% viewport), di-upscale bilinear oleh browser: ringan di GPU.
 *  - Berhenti menggambar saat tab tersembunyi / player ditutup, dan statis saat reduced motion.
 *  - Kalau WebGL tidak tersedia / context hilang, jatuh ke MeshGradient CSS yang sudah ada.
 */

const TEX = 128;          // ukuran tekstur akhir (POT, wajib untuk MIRRORED_REPEAT di WebGL1)
const SEED = 24;          // ukuran sampling warna asli sebelum di-upscale (ini yang bikin halus)
const RES_SCALE = 0.28;
const MIN_W = 240;
const MAX_W = 720;
const FADE_MS = 1400;
const TARGET_LUMA = 0.38;

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
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uMix;
uniform float uTime;
uniform float uAspect;
uniform float uGainA;
uniform float uGainB;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

vec3 tex(sampler2D t, vec2 uv){
  // 9 tap: blur halus supaya tidak ada tepi keras / pola kotak dari tekstur kecil
  vec2 o = vec2(0.024);
  vec3 c = texture2D(t, uv).rgb * 0.24;
  c += texture2D(t, uv + vec2( o.x, 0.0)).rgb * 0.12;
  c += texture2D(t, uv + vec2(-o.x, 0.0)).rgb * 0.12;
  c += texture2D(t, uv + vec2(0.0,  o.y)).rgb * 0.12;
  c += texture2D(t, uv + vec2(0.0, -o.y)).rgb * 0.12;
  c += texture2D(t, uv + o * 0.7).rgb * 0.07;
  c += texture2D(t, uv - o * 0.7).rgb * 0.07;
  c += texture2D(t, uv + vec2(o.x, -o.y) * 0.7).rgb * 0.07;
  c += texture2D(t, uv + vec2(-o.x, o.y) * 0.7).rgb * 0.07;
  return c;
}

vec3 field(sampler2D t, vec2 p, float time){
  // layer dasar: seluruh layar, berputar sangat pelan
  vec3 col = tex(t, rot(time * 0.045) * p * 0.52 + 0.5);

  // blob 1 - besar, searah jarum jam
  vec2 c1 = vec2(sin(time * 0.17) * 0.46, cos(time * 0.13) * 0.30) * vec2(uAspect * 0.62, 1.0);
  vec2 q1 = rot(time * 0.11 + 0.8) * (p - c1) * 0.86 + vec2(0.31, 0.62);
  col = mix(col, tex(t, q1), (1.0 - smoothstep(0.04, 0.78, length(p - c1))) * 0.92);

  // blob 2 - berlawanan arah
  vec2 c2 = vec2(cos(time * 0.15 + 2.1) * 0.50, sin(time * 0.19 + 1.3) * 0.34) * vec2(uAspect * 0.62, 1.0);
  vec2 q2 = rot(-time * 0.09 + 2.4) * (p - c2) * 0.78 + vec2(0.70, 0.36);
  col = mix(col, tex(t, q2), (1.0 - smoothstep(0.04, 0.74, length(p - c2))) * 0.90);

  // blob 3 - kecil dan lebih cepat, bikin aliran terasa hidup
  vec2 c3 = vec2(sin(time * 0.23 + 4.0) * 0.40, sin(time * 0.16 + 0.4) * 0.38) * vec2(uAspect * 0.62, 1.0);
  vec2 q3 = rot(time * 0.14 + 4.2) * (p - c3) * 1.05 + vec2(0.18, 0.28);
  col = mix(col, tex(t, q3), (1.0 - smoothstep(0.02, 0.60, length(p - c3))) * 0.86);

  // blob 4
  vec2 c4 = vec2(cos(time * 0.12 + 5.2) * 0.44, cos(time * 0.21 + 3.1) * 0.32) * vec2(uAspect * 0.62, 1.0);
  vec2 q4 = rot(-time * 0.12 + 1.1) * (p - c4) * 0.92 + vec2(0.80, 0.78);
  col = mix(col, tex(t, q4), (1.0 - smoothstep(0.03, 0.66, length(p - c4))) * 0.88);

  return col;
}

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main(){
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

  // domain warp: bikin tepi blob mengalir seperti cairan
  float t = uTime;
  p += 0.060 * vec2(sin(p.y * 3.1 + t * 0.31), cos(p.x * 2.7 + t * 0.27));
  p += 0.030 * vec2(sin(p.y * 6.3 - t * 0.43), cos(p.x * 5.9 + t * 0.39));

  vec3 a = field(uTexA, p, t) * uGainA;
  vec3 b = field(uTexB, p, t) * uGainB;
  vec3 col = mix(a, b, uMix);

  // saturasi seperti Apple Music
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.38);
  // highlight rolloff lembut: warna jenuh tidak jadi neon / terbakar
  col = (1.0 - exp(-max(col, 0.0) * 1.7)) / 0.817;
  col = clamp(col, 0.0, 1.0);

  // vignette halus
  float v = 1.0 - smoothstep(0.20, 1.30, length((vUv - 0.5) * vec2(1.15, 1.0)));
  col *= mix(0.62, 1.0, v);

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

  const u = {};
  ["uTexA", "uTexB", "uMix", "uTime", "uAspect", "uGainA", "uGainB"].forEach((n) => { u[n] = gl.getUniformLocation(prog, n); });

  const makeTex = (unit) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([24, 24, 28, 255]));
    return t;
  };
  const slots = [makeTex(0), makeTex(1)];   // slots[unit] = texture object yang sedang terpasang di unit itu
  gl.uniform1i(u.uTexA, 0);
  gl.uniform1i(u.uTexB, 1);

  const state = { gain: [1, 1] };

  return {
    gl,
    upload(unit, source, gain) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, slots[unit]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      state.gain[unit] = gain;
    },
    // Tukar peran A <-> B tanpa upload ulang (dipakai setelah crossfade selesai).
    swap() {
      slots.reverse();
      state.gain.reverse();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, slots[0]);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, slots[1]);
    },
    draw(time, mix, w, h) {
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uMix, mix);
      gl.uniform1f(u.uAspect, w / Math.max(1, h));
      gl.uniform1f(u.uGainA, state.gain[0]);
      gl.uniform1f(u.uGainB, state.gain[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      try {
        slots.forEach((t) => gl.deleteTexture(t));
        gl.deleteBuffer(buf); gl.deleteProgram(prog);
      } catch { /* noop */ }
    },
  };
}

/* ---------- sumber tekstur ---------- */

function luma(data) {
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    // warna jenuh lebih "terlihat", jadi bobotnya sedikit lebih besar
    const w = 0.7 + (mx - mn) * 0.6;
    sum += l * w; n += w;
  }
  return n ? sum / n : 0.3;
}

function finalize(seedCanvas, ctxSeed) {
  const data = ctxSeed.getImageData(0, 0, SEED, SEED).data;
  const avg = luma(data);
  const gain = Math.max(0.6, Math.min(1.5, TARGET_LUMA / Math.max(0.04, avg)));

  const out = document.createElement("canvas");
  out.width = TEX; out.height = TEX;
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(seedCanvas, 0, 0, TEX, TEX);
  return { canvas: out, gain };
}

function fromImage(img) {
  const c = document.createElement("canvas");
  c.width = SEED; c.height = SEED;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, SEED, SEED);
  return finalize(c, ctx);
}

// Dipakai kalau cover tidak bisa dibaca (CORS): bangun tekstur dari palet warna.
function fromPalette(palette) {
  const c = document.createElement("canvas");
  c.width = SEED; c.height = SEED;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = palette[3] || "#222";
  ctx.fillRect(0, 0, SEED, SEED);
  const spots = [[0.2, 0.25, 0.7], [0.8, 0.2, 0.65], [0.25, 0.8, 0.7], [0.82, 0.78, 0.65], [0.5, 0.5, 0.6]];
  spots.forEach(([x, y, r], i) => {
    const g = ctx.createRadialGradient(x * SEED, y * SEED, 0, x * SEED, y * SEED, r * SEED);
    g.addColorStop(0, palette[i % palette.length]);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SEED, SEED);
  });
  return finalize(c, ctx);
}

/* ---------- komponen ---------- */

export const FluidBackground = memo(function FluidBackground({ src, fallbackColor, active = true, playing = true, still = false }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const palette = useCoverPalette(src, fallbackColor);
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const [failed, setFailed] = useState(false);

  const live = useRef({ active, playing, still });
  live.current = { active, playing, still };

  // fade state
  const fade = useRef({ mix: 1, from: 1, start: 0, running: false, hasA: false });
  const clock = useRef({ t: 17.3, last: 0, speed: 1 });
  const rafRef = useRef(0);
  const kick = useRef(() => {});

  // --- init renderer + loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let r;
    try {
      r = createRenderer(canvas);
    } catch {
      setFailed(true);
      return undefined;
    }
    rendererRef.current = r;
    fade.current = { mix: 1, from: 1, start: 0, running: false, hasA: false };

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

      // kecepatan halus: pelan saat pause, diam total saat reduced motion
      const target = s ? 0 : (p ? 1 : 0.3);
      c.speed += (target - c.speed) * Math.min(1, dt * 2.2);
      c.t += dt * c.speed;

      const f = fade.current;
      if (f.running) {
        const k = Math.min(1, (now - f.start) / FADE_MS);
        const eased = k * k * (3 - 2 * k);
        f.mix = f.from + (1 - f.from) * eased;
        if (k >= 1) {
          f.running = false;
          f.mix = 1;
        }
      }
      const [w, h] = size();
      r.draw(c.t, f.mix, w, h);

      const needsMore = a && !document.hidden && (c.speed > 0.002 || f.running || Math.abs(target - c.speed) > 0.002);
      if (needsMore) rafRef.current = requestAnimationFrame(frame);
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
      rendererRef.current = null;
    };
  }, []);

  // bangunkan loop saat props yang mempengaruhi gerakan berubah
  useEffect(() => { kick.current(); }, [active, playing, still]);

  // --- muat cover baru -> crossfade ---
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return undefined;
    let alive = true;

    const apply = ({ canvas, gain }) => {
      if (!alive || !rendererRef.current) return;
      const f = fade.current;
      if (!f.hasA) {
        // pertama kali: langsung tampil tanpa crossfade
        r.upload(0, canvas, gain);
        r.upload(1, canvas, gain);
        f.hasA = true; f.mix = 1; f.running = false;
      } else if (f.running) {
        // ganti lagu lagi saat masih fade: ganti tujuan saja, mix lanjut (tidak ada loncatan)
        r.upload(1, canvas, gain);
      } else {
        // yang tampil sekarang (B) jadi A, tekstur baru masuk ke B, fade 0 -> 1
        r.swap();
        r.upload(1, canvas, gain);
        f.from = 0; f.mix = 0; f.start = performance.now(); f.running = true;
      }
      kick.current();
    };

    const usePalette = () => { if (alive) { try { apply(fromPalette(paletteRef.current)); } catch { setFailed(true); } } };

    if (!src) { usePalette(); return () => { alive = false; }; }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (!alive) return;
      try { apply(fromImage(img)); } catch { usePalette(); }
    };
    img.onerror = usePalette;
    img.src = src;
    return () => { alive = false; };
  }, [src]);

  if (failed) return <MeshGradient palette={palette} active={active} still={still} />;
  return <canvas ref={canvasRef} className="npd-fluid" aria-hidden="true" />;
});