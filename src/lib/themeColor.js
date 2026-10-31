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
const hueDist = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
const boost = (C) => Math.min(0.17, Math.max(0.07, C * 1.15));

// -> { h, C, h2, C2 } : hue utama + hue kedua (untuk gradien latar; kalau cover satu warna, digeser ~46deg)
export function pickAccent(palette) {
  const cands = [];
  (palette || []).forEach((rgb, i) => {
    const [L, a, b] = rgbToLab(rgb);
    const C = Math.hypot(a, b);
    if (C < 0.045 || L < 0.1 || L > 0.97) return;                       // abu-abu / hampir hitam / hampir putih
    const score = Math.min(C, 0.16) * (1 - i * 0.1) * (L < 0.22 ? 0.7 : 1);   // utamakan warna kuat & dominan
    cands.push({ h: Math.atan2(b, a), C, score });
  });
  if (!cands.length) return null;
  cands.sort((x, y) => y.score - x.score);
  const first = cands[0];
  const sec = cands.find((x) => hueDist(x.h, first.h) > 0.5);
  return { h: first.h, C: boost(first.C), h2: sec ? sec.h : first.h + 0.8, C2: boost(sec ? sec.C : first.C * 0.9) };
}

/* ---------- bangun satu set warna yang lolos kontras ---------- */
// profil: L awal untuk "strong" (teks/ikon aktif) & "accent" (isian), arah koreksi bila kontras kurang
const PROFILES = {
  light:  { sL: 0.42, aL: 0.48, step: -0.015, cap: 0.17 },   // permukaan terang -> aksen gelap
  dark:   { sL: 0.86, aL: 0.78, step: 0.015, cap: 0.17 },    // permukaan gelap  -> aksen terang
  island: { sL: 0.82, aL: 0.76, step: 0.01, cap: 0.16 },     // layar Now Playing: selalu di atas latar gelap; harus tampak berwarna, bukan putih
};
export const ISLAND_SURFACES = [[0.3, 0.3, 0.3]];             // perkiraan terburuk latar fluid + scrim

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
  const c = island ? Math.min(Math.max(C, 0.1), p.cap) : Math.min(C, p.cap);   // island: chroma minimal supaya tidak tampak putih
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

/* ---------- mode penuh: seluruh permukaan aplikasi ikut warna cover ---------- */
// Gelap: latar pekat bernuansa warna cover. Terang: pastel tipis. Teks dihitung ulang supaya tetap lolos AA.
// -> { strings: [bg, elev, elev2, elev3, line, line-soft, ink, ink-dim, ink-faint, dyn-a, dyn-b], ok, surfaces }
export function buildSurfaces({ h, C, h2, C2 }, light) {
  const c = light ? Math.min(Math.max(C * 0.3, 0.018), 0.04) : Math.min(Math.max(C * 0.6, 0.04), 0.1);
  const L = light
    ? { bg: 0.955, elev: 0.985, e2: 0.93, e3: 0.9, line: 0.84, soft: 0.9 }
    : { bg: 0.2, elev: 0.235, e2: 0.27, e3: 0.31, line: 0.37, soft: 0.29 };
  const bg = fit(L.bg, c, h), elev = fit(L.elev, c, h), e2 = fit(L.e2, c, h), e3 = fit(L.e3, c, h);
  const line = fit(L.line, c, h), soft = fit(L.soft, c, h);
  const surfaces = [bg, e2, e3];
  const step = light ? -0.015 : 0.015;
  let iL = light ? 0.22 : 0.96, dL = light ? 0.42 : 0.78, fL = light ? 0.56 : 0.62;
  let ink, dim, faint, ok = false;
  for (let k = 0; k < 24 && !ok; k++) {
    ink = fit(iL, 0.015, h); dim = fit(dL, 0.03, h); faint = fit(fL, 0.035, h);
    ok = surfaces.every((s) => contrast(ink, s) >= 7 && contrast(dim, s) >= MIN_TEXT && contrast(faint, s) >= 3.1);
    iL += step; dL += step; fL += step;
  }
  const c2 = Math.min(C2 == null ? C : C2, 0.14), cA = Math.min(C, 0.14);
  const glowA = light ? fit(0.9, Math.min(cA, 0.08), h) : fit(0.34, cA, h);
  const glowB = light ? fit(0.9, Math.min(c2, 0.08), h2) : fit(0.3, c2, h2);
  return { strings: [bg, elev, e2, e3, line, soft, ink, dim, faint, glowA, glowB].map(css), ok, surfaces };
}
