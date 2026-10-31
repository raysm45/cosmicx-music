import { useEffect } from "react";
import { usePlayer, useUI } from "../context.jsx";
import { useSyncedCoverTrack } from "./coverSync.js";
import { extractFluidColors, getCachedFluidColors } from "./FluidBackground.jsx";
import { BG_FADE_MS, EASE_CSS } from "./motion.js";
import { pickAccent, buildSet, parseColor, luminance, ISLAND_SURFACES } from "./themeColor.js";
import "../styles/cover-theme.css";

// Theme ikut warna lagu. Aksen dipasang sebagai inline CSS variable di <html>; transisinya dikerjakan CSS
// (@property <color> + durasi/easing dari motion.js, lihat styles/cover-theme.css).
//   --accent*      : set untuk permukaan theme aktif (gelap/terang)  -> seluruh aplikasi
//   --cv-dk-*      : set untuk "pulau gelap" (Now Playing desktop/mobile di atas latar cover)
const COVER_PX = 520;                 // harus sama dengan NowPlayingDesktop -> cache prepareCover terpakai bersama
const ATTR = "data-cover-theme";      // ada selama aksen aktif; menjadi "gerbang" aturan CSS tambahan
const SNAP = "data-cv-snap";          // sementara menonaktifkan transisi saat theme (gelap/terang) diganti
const SURFACE = ["--accent", "--accent-strong", "--accent-ink", "--accent-soft"];
const ISLAND = ["--cv-dk-accent", "--cv-dk-strong", "--cv-dk-ink", "--cv-dk-soft"];

let accent = null;   // { h, C } atau null (= theme bawaan)

function readSurfaces() {
  const cs = getComputedStyle(document.documentElement);
  const list = ["--bg", "--bg-elev-2", "--bg-elev-3"].map((n) => parseColor(cs.getPropertyValue(n))).filter(Boolean);
  return list.length ? list : [[0, 0, 0], [0.12, 0.12, 0.12]];
}

function apply() {
  const root = document.documentElement;
  if (!accent) {
    [...SURFACE, ...ISLAND].forEach((k) => root.style.removeProperty(k));   // nilai theme bawaan -> CSS transition memudarkan balik
    root.removeAttribute(ATTR);
    return;
  }
  const surfaces = readSurfaces();
  const light = luminance(surfaces[0]) > 0.35;
  const s = buildSet(accent, { surfaces, light });
  const d = buildSet(accent, { surfaces: ISLAND_SURFACES, island: true });
  SURFACE.forEach((k, i) => root.style.setProperty(k, s.strings[i]));
  ISLAND.forEach((k, i) => root.style.setProperty(k, d.strings[i]));
  root.setAttribute(ATTR, "");
}

// Ganti theme (hitam<->putih, kontras tinggi): hitung ulang kontras & JANGAN animasikan,
// kalau tidak ikon sempat terang-di-atas-putih selama 1,7 dtk.
function watchTheme() {
  const root = document.documentElement;
  let raf = 0;
  const mo = new MutationObserver(() => {
    root.setAttribute(SNAP, "");
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
  const on = settings.coverTheme !== false;

  // Warna baru baru dipakai setelah cover + paletnya siap (sama persis dengan yang menahan crossfade & latar NPD)
  const snap = useSyncedCoverTrack(on ? currentTrack : null, COVER_PX);
  const cover = on ? snap.cover : null;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--cv-dur-ms", `${BG_FADE_MS}ms`);
    root.style.setProperty("--cv-ease", EASE_CSS);
    const stop = watchTheme();
    return () => {
      stop();
      accent = null;
      apply();
      root.style.removeProperty("--cv-dur-ms");
      root.style.removeProperty("--cv-ease");
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const set = (p) => { if (alive) { accent = p; apply(); } };
    if (!cover) { set(null); return () => { alive = false; }; }
    const hit = getCachedFluidColors(cover);
    if (hit) set(pickAccent(hit));
    else extractFluidColors(cover).then((p) => set(pickAccent(p)), () => set(null));
    return () => { alive = false; };
  }, [cover]);
}
