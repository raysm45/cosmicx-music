// Konstanta + helper bersama untuk transisi Now Playing Desktop (cover + warna latar).
// Satu sumber kebenaran: cover (CSS) dan latar (WebGL) memakai kurva yang SAMA, jadi geraknya menyatu.

export const COVER_FADE_MS = 1100;   // crossfade thumbnail
export const BG_FADE_MS = 1700;      // perpindahan warna latar (sedikit lebih lambat dari cover = terasa "menyusul")
export const BG_STAGGER_MS = 70;     // jeda antar slot warna -> perpindahan terasa mengalir, bukan fade seragam

export const EASE_POINTS = [0.45, 0.05, 0.2, 1];
export const EASE_CSS = `cubic-bezier(${EASE_POINTS.join(",")})`;

// cubic-bezier solver (Newton + bisection) supaya kurva JS identik dengan CSS timing-function.
export function makeBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-5) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-5) break;
      if (e > 0) hi = t; else lo = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

export const ease = makeBezier(...EASE_POINTS);

/* ---------- OKLab: interpolasi warna yang perseptual (tidak keruh/abu-abu di tengah) ---------- */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGam = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

// [r,g,b] 0..1 (sRGB gamma) -> [L,a,b]
export function rgbToLab(rgb) {
  const r = toLin(rgb[0]), g = toLin(rgb[1]), b = toLin(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

// [L,a,b] -> tulis ke out [r,g,b] 0..1 (tanpa alokasi, dipanggil tiap frame)
export function labToRgb(lab, out) {
  const l_ = lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2];
  const m_ = lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2];
  const s_ = lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2];
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  out[0] = clamp01(toGam(Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)));
  out[1] = clamp01(toGam(Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)));
  out[2] = clamp01(toGam(Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)));
  return out;
}

/* ---------- pasangkan slot warna lama -> baru dengan jarak total terkecil ---------- */
const permCache = new Map();
function permutations(n) {
  if (permCache.has(n)) return permCache.get(n);
  const res = [];
  const arr = Array.from({ length: n }, (_, i) => i);
  const rec = (k) => {
    if (k === n) { res.push(arr.slice()); return; }
    for (let i = k; i < n; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      rec(k + 1);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  };
  rec(0);
  permCache.set(n, res);
  return res;
}

// Tanpa ini slot 0 lama (mis. merah) bisa bergerak ke slot 0 baru (mis. biru) padahal ada slot lain yang
// lebih dekat -> warna melewati abu-abu. Dengan pencocokan, tiap warna "meluncur" ke tetangga terdekatnya.
export function matchSlots(fromLab, toLab) {
  const n = fromLab.length;
  let best = null, bestCost = Infinity;
  for (const p of permutations(n)) {
    let c = 0;
    for (let i = 0; i < n; i++) {
      const a = fromLab[i], b = toLab[p[i]];
      const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
      c += dl * dl + da * da + db * db + (p[i] === i ? 0 : 0.0006);
    }
    if (c < bestCost) { bestCost = c; best = p; }
  }
  return best.map((j) => toLab[j]);
}
