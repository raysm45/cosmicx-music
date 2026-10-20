import React, { memo, useEffect, useMemo, useState } from "react";

/*
 * Legacy mesh gradient untuk Now Playing mobile.
 * Bukan thumbnail blur: 5 blob radial-gradient dengan warna yang diambil dari cover,
 * bergeser pelan (drifting) memakai transform saja supaya ringan di GPU.
 */

const DEFAULT_PALETTE = [
  "hsl(240, 6%, 34%)",
  "hsl(230, 8%, 26%)",
  "hsl(250, 7%, 42%)",
  "hsl(220, 6%, 22%)",
  "hsl(260, 6%, 30%)",
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cache = new Map();
const CACHE_LIMIT = 40;

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

const hslCss = (h, s, l) => `hsl(${Math.round(((h % 360) + 360) % 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;

// Rapikan warna supaya kaya tapi tetap cukup gelap untuk teks putih.
// Cover hitam-putih (sat rendah) dibiarkan abu-abu, tidak dipaksa berwarna.
function tune(h, s, l) {
  const neutral = s < 0.12;
  const sat = neutral ? s : clamp(s * 1.15, 0.38, 0.82);
  const lum = clamp(l, 0.22, 0.54);
  return [h, sat, lum];
}

function fillPalette(list) {
  const out = list.slice(0, 5);
  const base = out[0] || [240, 0.08, 0.32];
  const offsets = [[28, 0.04], [-34, -0.05], [150, 0.02], [64, -0.08]];
  let i = 0;
  while (out.length < 5) {
    const [dh, dl] = offsets[i++ % offsets.length];
    out.push(tune(base[0] + dh, base[1], base[2] + dl));
  }
  return out;
}

function extractPalette(img) {
  const size = 40;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 40) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [, , l] = rgbToHsl(r, g, b);
    if (l < 0.05 || l > 0.97) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key);
    if (e) { e.r += r; e.g += g; e.b += b; e.n++; }
    else buckets.set(key, { r, g, b, n: 1 });
  }

  const cands = [];
  buckets.forEach((e) => {
    const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n;
    const [h, s, l] = rgbToHsl(r, g, b);
    cands.push({ r, g, b, h, s, l, score: e.n * (1 + s * 2.2) });
  });
  cands.sort((a, b) => b.score - a.score);

  const picked = [];
  for (const c of cands) {
    const far = picked.every((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) > 64);
    if (far) picked.push(c);
    if (picked.length === 5) break;
  }
  const tuned = picked.map((c) => tune(c.h, c.s, c.l));
  return fillPalette(tuned).map(([h, s, l]) => hslCss(h, s, l));
}

function paletteFromColor(color) {
  const m = typeof color === "string" && color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return null;
  const [h, s, l] = rgbToHsl(+m[1], +m[2], +m[3]);
  return fillPalette([tune(h, s, l)]).map(([hh, ss, ll]) => hslCss(hh, ss, ll));
}

export function useCoverPalette(src, fallbackColor) {
  const [palette, setPalette] = useState(() => (src && cache.get(src)) || null);

  useEffect(() => {
    if (!src) { setPalette(null); return undefined; }
    const hit = cache.get(src);
    if (hit) { setPalette(hit); return undefined; }
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!alive) return;
      try {
        const p = extractPalette(img);
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
        cache.set(src, p);
        setPalette(p);
      } catch {
        setPalette(null);
      }
    };
    img.onerror = () => { if (alive) setPalette(null); };
    img.src = src;
    return () => { alive = false; };
  }, [src]);

  return useMemo(() => palette || paletteFromColor(fallbackColor) || DEFAULT_PALETTE, [palette, fallbackColor]);
}

export const MeshGradient = memo(function MeshGradient({ palette, active = true, still = false }) {
  const p = palette && palette.length >= 5 ? palette : DEFAULT_PALETTE;
  const style = { "--m1": p[0], "--m2": p[1], "--m3": p[2], "--m4": p[3], "--m5": p[4] };
  return (
    <div className={`npx-mesh${active ? " is-active" : ""}${still ? " is-still" : ""}`} style={style} aria-hidden="true">
      <i className="b b1" />
      <i className="b b2" />
      <i className="b b3" />
      <i className="b b4" />
      <i className="b b5" />
      <i className="npx-mesh-grain" />
    </div>
  );
});
