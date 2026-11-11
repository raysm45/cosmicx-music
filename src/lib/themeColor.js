import { rgbToLab, labToRgb } from "./motion.js";

const MIN_TEXT = 4.6;
const MIN_UI = 3.2;

const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const luminance = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

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

const quant = (c) => c.map((v) => Math.round(v * 255) / 255);
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

const hueDist = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
const boost = (C) => Math.min(0.17, Math.max(0.07, C * 1.15));

export function pickAccent(palette) {
  const cands = [];
  (palette || []).forEach((rgb, i) => {
    const [L, a, b] = rgbToLab(rgb);
    const C = Math.hypot(a, b);
    if (C < 0.045 || L < 0.1 || L > 0.97) return;
    const score = Math.min(C, 0.16) * (1 - i * 0.1) * (L < 0.22 ? 0.7 : 1);
    cands.push({ h: Math.atan2(b, a), C, score });
  });
  if (!cands.length) return null;
  cands.sort((x, y) => y.score - x.score);
  const first = cands[0];
  const sec = cands.find((x) => hueDist(x.h, first.h) > 0.5);
  return { h: first.h, C: boost(first.C), h2: sec ? sec.h : first.h + 0.8, C2: boost(sec ? sec.C : first.C * 0.9), mesh: pickMesh(cands) };
}

const MESH_FILL = [0.75, -0.65, 1.45];
function pickMesh(cands) {
  const out = [];
  for (const c of cands) {
    if (out.length >= 4) break;
    if (out.every((o) => hueDist(o.h, c.h) > 0.42)) out.push({ h: c.h, C: boost(c.C) });
  }
  const base = out[0];
  let i = 0;
  while (out.length < 4) {
    const k = MESH_FILL[i++ % MESH_FILL.length];
    out.push({ h: base.h + k, C: boost(base.C * 0.85) });
  }
  return out;
}

const PROFILES = {
  light:  { sL: 0.42, aL: 0.48, step: -0.015, cap: 0.17 },
  dark:   { sL: 0.86, aL: 0.78, step: 0.015, cap: 0.17 },
  island: { sL: 0.82, aL: 0.76, step: 0.01, cap: 0.16 },
};
export const ISLAND_SURFACES = [[0.3, 0.3, 0.3]];

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

export function buildSet({ h, C }, { surfaces, light = false, island = false, neutral = false }) {
  const p = PROFILES[island ? "island" : light ? "light" : "dark"];
  const c = neutral ? 0 : (island ? Math.min(Math.max(C, 0.1), p.cap) : Math.min(C, p.cap));
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

export const FULL_VARS = [
  "--bg", "--bg-elev", "--bg-elev-2", "--bg-elev-3", "--line", "--line-soft", "--ink", "--ink-dim", "--ink-faint",
  "--dyn-a", "--dyn-b", "--dyn-c", "--dyn-d",
  "--glass-fill", "--glass-fill-2", "--glass-edge", "--glass-hi", "--pop-bg",
];

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const WHITE = [1, 1, 1], BLACK = [0, 0, 0];
const rgba = (c, a) => `rgb(${c.map((v) => Math.round(v * 255)).join(" ")} / ${a})`;

const GLASS = {
  dark:  { l1: 0.05, l2: 0.09, l3: 0.14, line: 0.16, soft: 0.09, fill: 0.07, fill2: 0.12, edge: 0.18, hi: 0.30 },
  light: { l1: 0.55, l2: 0.75, l3: 0.07, line: 0.12, soft: 0.07, fill: 0.55, fill2: 0.75, edge: 0.85, hi: 1 },
};

export function buildSurfaces({ h, C, mesh }, light) {
  const G = light ? GLASS.light : GLASS.dark;
  const overlay = WHITE;
  const h2 = mesh && mesh[1] ? mesh[1].h : h;
  let dh = Math.atan2(Math.sin(h2 - h), Math.cos(h2 - h));
  dh = Math.max(-0.3, Math.min(0.3, dh));
  const cTop = light ? Math.min(Math.max(C * 0.45, 0.03), 0.075) : Math.min(Math.max(C * 0.85, 0.06), 0.125);
  const step = light ? 0.012 : -0.014;
  const LA = light ? [0.9, 0.915, 0.945, 0.965] : [0.42, 0.345, 0.27, 0.22];

  let tops, bg, ink, dim, faint, surfaces, ok = false;
  for (let k = 0; k < 8 && !ok; k++) {
    const shift = k * step;
    tops = [
      fit(LA[0] + shift, cTop, h),
      fit(LA[1] + shift * 0.8, cTop * 0.85, h + dh),
      fit(LA[2] + shift * 0.5, cTop * 0.4, h + dh),
      fit(LA[3], light ? 0.012 : 0.012 + cTop * 0.1, h),
    ];
    bg = light ? fit(0.965, 0.01, h) : fit(0.19, 0.012 + cTop * 0.08, h);
    surfaces = [...tops.map((b) => mix(b, overlay, G.l2)), mix(bg, overlay, G.l3)];
    let iL = light ? 0.22 : 0.97, dL = light ? 0.42 : 0.8, fL = light ? 0.56 : 0.64;
    const st = light ? -0.015 : 0.012;
    for (let j = 0; j < 24; j++) {
      ink = fit(Math.min(0.995, Math.max(0.02, iL)), 0.012, h);
      dim = fit(Math.min(0.99, Math.max(0.02, dL)), 0.028, h);
      faint = fit(Math.min(0.98, Math.max(0.02, fL)), 0.032, h);
      if (surfaces.every((s) => contrast(ink, s) >= 7 && contrast(dim, s) >= MIN_TEXT && contrast(faint, s) >= 3.1)) { ok = true; break; }
      iL += st; dL += st; fL += st;
    }
  }

  const baseC = light ? 0.015 : 0.02;
  const pop = light ? fit(0.975, baseC, h) : fit(0.25, baseC + cTop * 0.15, h);
  const vars = {
    "--bg": css(bg),
    "--bg-elev": rgba(WHITE, G.l1),
    "--bg-elev-2": rgba(WHITE, G.l2),
    "--bg-elev-3": light ? rgba(BLACK, G.l3) : rgba(WHITE, G.l3),
    "--line": light ? rgba(BLACK, G.line) : rgba(WHITE, G.line),
    "--line-soft": light ? rgba(BLACK, G.soft) : rgba(WHITE, G.soft),
    "--ink": css(ink), "--ink-dim": css(dim), "--ink-faint": css(faint),
    "--dyn-a": css(tops[0]), "--dyn-b": css(tops[1]), "--dyn-c": css(tops[2]), "--dyn-d": css(tops[3]),
    "--glass-fill": rgba(WHITE, G.fill), "--glass-fill-2": rgba(WHITE, G.fill2),
    "--glass-edge": rgba(WHITE, G.edge), "--glass-hi": rgba(WHITE, G.hi),
    "--pop-bg": css(pop),
  };
  return { vars, ok, surfaces: [bg, ...surfaces] };
}
