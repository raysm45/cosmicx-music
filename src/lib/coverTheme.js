import { useEffect } from "react";
import { usePlayer, useUI } from "../context.jsx";
import { useSyncedCoverTrack } from "./coverSync.js";
import { extractFluidColors, getCachedFluidColors } from "./FluidBackground.jsx";
import { BG_FADE_MS, EASE_CSS } from "./motion.js";
import { pickAccent, buildSet, buildSurfaces, parseColor, luminance, ISLAND_SURFACES } from "./themeColor.js";
import "../styles/cover-theme.css";

// Warna dinamis. Nilai dipasang sebagai inline CSS variable di <html>; transisinya dikerjakan CSS
// (@property <color> + durasi/easing dari motion.js, lihat styles/cover-theme.css).
//   mode "accent" (setting coverTheme)    : hanya --accent*  (+ --cv-dk-* untuk layar Now Playing)
//   mode "full"   (setting dynamicColors) : + seluruh permukaan (--bg*, --line*, --ink*) dan gradien latar (--dyn-a/b)
const COVER_PX = 520;                 // harus sama dengan NowPlayingDesktop -> cache prepareCover terpakai bersama
const ATTR = "data-cover-theme";      // ada selama aksen aktif
const ATTR_FULL = "data-cover-dyn";   // ada selama mode penuh aktif (gerbang aturan latar gradien + sidebar kaca)
const SNAP = "data-cv-snap";          // sementara menonaktifkan transisi saat theme (gelap/terang) diganti
const SURFACE = ["--accent", "--accent-strong", "--accent-ink", "--accent-soft"];
const ISLAND = ["--cv-dk-accent", "--cv-dk-strong", "--cv-dk-ink", "--cv-dk-soft"];
const FULL = ["--bg", "--bg-elev", "--bg-elev-2", "--bg-elev-3", "--line", "--line-soft", "--ink", "--ink-dim", "--ink-faint", "--dyn-a", "--dyn-b"];

let accent = null;   // { h, C, h2, C2 } atau null (= theme bawaan)
let mode = "accent"; // "accent" | "full"
let base = null;     // permukaan theme ASLI (tanpa timpaan kita): { light, surfaces }

function clearAll(root) {
  [...SURFACE, ...ISLAND, ...FULL].forEach((k) => root.style.removeProperty(k));
  root.removeAttribute(ATTR);
  root.removeAttribute(ATTR_FULL);
}

// Baca permukaan theme asli. Hanya dipanggil saat init & saat theme diganti (di bawah SNAP, jadi tanpa animasi);
// kalau dibaca tiap apply(), kita akan membaca warna timpaan kita sendiri.
function refreshBase() {
  const root = document.documentElement;
  FULL.forEach((k) => root.style.removeProperty(k));
  SURFACE.forEach((k) => root.style.removeProperty(k));
  const cs = getComputedStyle(root);
  const list = ["--bg", "--bg-elev-2", "--bg-elev-3"].map((n) => parseColor(cs.getPropertyValue(n))).filter(Boolean);
  const surfaces = list.length ? list : [[0, 0, 0], [0.08, 0.08, 0.08], [0.12, 0.12, 0.12]];
  base = { light: luminance(surfaces[0]) > 0.35, surfaces };
}

function apply() {
  const root = document.documentElement;
  if (!accent) { clearAll(root); return; }
  if (!base) refreshBase();

  let surfaces = base.surfaces;
  const full = mode === "full" && root.getAttribute("data-contrast") !== "high";   // kontras tinggi: tetap pakai warna theme
  if (full) {
    const f = buildSurfaces(accent, base.light);
    surfaces = f.surfaces;
    FULL.forEach((k, i) => root.style.setProperty(k, f.strings[i]));
    root.setAttribute(ATTR_FULL, "");
  } else {
    FULL.forEach((k) => root.style.removeProperty(k));
    root.removeAttribute(ATTR_FULL);
  }
  const neutral = mode === "full";   // Warna dinamis: latar ikut cover, tapi aksen (tombol/scrubber) tetap hitam/putih
  const s = buildSet(accent, { surfaces, light: base.light, neutral });
  const d = buildSet(accent, { surfaces: ISLAND_SURFACES, island: true, neutral });
  SURFACE.forEach((k, i) => root.style.setProperty(k, s.strings[i]));
  ISLAND.forEach((k, i) => root.style.setProperty(k, d.strings[i]));
  root.setAttribute(ATTR, "");
}

// Ganti theme (hitam<->putih, kontras tinggi): baca ulang permukaan asli & hitung ulang kontras, TANPA animasi,
// kalau tidak ikon sempat terang-di-atas-putih selama 1,7 dtk.
function watchTheme() {
  const root = document.documentElement;
  let raf = 0;
  const mo = new MutationObserver(() => {
    root.setAttribute(SNAP, "");
    refreshBase();
    apply();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => root.removeAttribute(SNAP)); });
  });
  mo.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-contrast"] });
  return () => { mo.disconnect(); cancelAnimationFrame(raf); root.removeAttribute(SNAP); };
}

export function useCoverTheme() {
  const { currentTrack } = usePlayer();
  const { settings } = useUI();
  const full = settings.dynamicColors === true;
  const on = full || settings.coverTheme !== false;

  // Warna baru baru dipakai setelah cover + paletnya siap (sama persis dengan yang menahan crossfade & latar NPD)
  const snap = useSyncedCoverTrack(on ? currentTrack : null, COVER_PX);
  const cover = on ? snap.cover : null;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--cv-dur-ms", `${BG_FADE_MS}ms`);
    root.style.setProperty("--cv-ease", EASE_CSS);
    refreshBase();
    const stop = watchTheme();
    return () => {
      stop();
      accent = null; base = null;
      clearAll(root);
      root.style.removeProperty("--cv-dur-ms");
      root.style.removeProperty("--cv-ease");
    };
  }, []);

  useEffect(() => {
    let alive = true;
    mode = full ? "full" : "accent";
    const set = (p) => { if (alive) { accent = p; apply(); } };
    if (!cover) { set(null); return () => { alive = false; }; }
    const hit = getCachedFluidColors(cover);
    if (hit) set(pickAccent(hit));
    else extractFluidColors(cover).then((p) => set(pickAccent(p)), () => set(null));
    return () => { alive = false; };
  }, [cover, full]);
}
