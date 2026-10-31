// Logika warna murni untuk "Theme ikut warna lagu" (tanpa DOM/React -> bisa dites di Node).
// Alur: palet cover -> pilih 1 hue yang berwarna -> cari lightness di OKLab yang lolos kontras WCAG AA.
import { rgbToLab, labToRgb } from "./motion.js";

const MIN_TEXT = 4.6;   // AA teks = 4.5, +0.1 margin untuk pembulatan 8-bit
const MIN_UI = 3.2;     // komponen UI non-teks (fill scrubber, dsb) = 3.0, +margin

/* ---------- kontras WCAG ---------- */
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const luminance = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// "#rgb", "#rrggbb", "rgb(...)", "rgba(...)" -> [r,g,b] 0..1 (atau null)
export function parseColor(str) {
  const s = String(str || "").trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16) / 255);
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
  return null;
}

/* ---------- OKLCH -> sRGB dengan gamut-mapping (kurangi chroma, jaga L & hue) ---------- */
const quant = (c) => c.map((v) => Math.round(v * 255) / 255);   // = warna yang benar-benar tampil
function fit(L, C, h) {
  const out = [0, 0, 0];
  for (let i = 0; i < 16; i++) {
    const lab = [L, C * Math.cos(h), C * Math.sin(h)];
    labToRgb(lab, out);
    const back = rgbToLab(out);
    if (Math.abs(back[0] - L) < 0.004 && Math.hypot(back[1] - lab[1], back[2] - lab[2]) < 0.004) break;
    C *= 0.93;
  }
  return quant(out);
}

/* ---------- pilih aksen dari palet ---------- */
// Palet dari extractFluidColors sudah digelapkan untuk latar, jadi yang dipakai hanya hue + chroma-nya;
// lightness dicari ulang per permukaan. Mengembalikan null kalau cover praktis monokrom -> theme bawaan.
export function pickAccent(palette) {
  let best = null, bestScore = 0;
  (palette || []).forEach((rgb, i) => {
    const [L, a, b] = rgbToLab(rgb);
    const C = Math.hypot(a, b);
    if (C < 0.045 || L < 0.1 || L > 0.97) return;                       // abu-abu / hampir hitam / hampir putih
    const score = Math.min(C, 0.16) * (1 - i * 0.1) * (L < 0.22 ? 0.7 : 1);   // utamakan warna kuat & dominan
    if (score > bestScore) { bestScore = score; best = { h: Math.atan2(b, a), C }; }
  });
  if (!best) return null;
  best.C = Math.min(0.17, Math.max(0.07, best.C * 1.15));
  return best;
}

/* ---------- bangun satu set warna yang lolos kontras ---------- */
// profil: L awal untuk "strong" (teks/ikon aktif) & "accent" (isian), arah koreksi bila kontras kurang
const PROFILES = {
  light:  { sL: 0.42, aL: 0.48, step: -0.015, cap: 0.17 },   // permukaan terang -> aksen gelap
  dark:   { sL: 0.86, aL: 0.78, step: 0.015, cap: 0.17 },    // permukaan gelap  -> aksen terang
  island: { sL: 0.92, aL: 0.86, step: 0.01, cap: 0.10 },     // layar Now Playing: selalu di atas latar gelap, tint tipis
};
export const ISLAND_SURFACES = [[0.38, 0.38, 0.38]];          // perkiraan terburuk latar fluid + scrim

const css = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(" ")})`;
const cssA = (c, a) => `rgb(${c.map((v) => Math.round(v * 255)).join(" ")} / ${a})`;

function pickInk(acc, strong, h, C, light) {
  const dark = fit(0.2, Math.min(C * 0.25, 0.03), h);
  const cands = light ? [[1, 1, 1], dark, [0, 0, 0]] : [dark, [0, 0, 0], [1, 1, 1]];
  const score = (ink) => Math.min(contrast(ink, acc), contrast(ink, strong));
  for (const ink of cands) if (score(ink) >= MIN_TEXT) return { ink, ok: true };
  const ink = score([0, 0, 0]) >= score([1, 1, 1]) ? [0, 0, 0] : [1, 1, 1];
  return { ink, ok: false };
}

// -> { strings: [accent, strong, ink, soft] (CSS), ok, rgb: {acc, strong, ink} }
export function buildSet({ h, C }, { surfaces, light = false, island = false }) {
  const p = PROFILES[island ? "island" : light ? "light" : "dark"];
  const c = Math.min(C, p.cap);
  let sL = p.sL, aL = p.aL, res = null;
  for (let k = 0; k < 24; k++) {
    const strong = fit(sL, c, h), acc = fit(aL, c, h);
    const okS = surfaces.every((s) => contrast(strong, s) >= MIN_TEXT);
    const okA = surfaces.every((s) => contrast(acc, s) >= MIN_UI);
    const { ink, ok: okI } = pickInk(acc, strong, h, c, light);
    res = { strong, acc, ink, ok: okS && okA && okI };
    if (res.ok) break;
    sL = Math.min(0.97, Math.max(0.05, sL + p.step));
    aL = Math.min(0.97, Math.max(0.05, aL + p.step));
  }
  const soft = cssA(light ? res.strong : res.acc, light ? 0.12 : 0.16);
  return { strings: [css(res.acc), css(res.strong), css(res.ink), soft], ok: res.ok, rgb: res };
}
