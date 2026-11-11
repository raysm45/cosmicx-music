import { useEffect } from "react";
import { usePlayer, useUI } from "../context.jsx";
import { useSyncedCoverTrack } from "./coverSync.js";
import { extractFluidColors, getCachedFluidColors } from "./FluidBackground.jsx";
import { BG_FADE_MS, EASE_CSS } from "./motion.js";
import { pickAccent, buildSet, buildSurfaces, parseColor, luminance, ISLAND_SURFACES, FULL_VARS } from "./themeColor.js";
import "../styles/cover-theme.css";

const COVER_PX = 520;
const ATTR = "data-cover-theme";
const ATTR_FULL = "data-cover-dyn";
const ATTR_LIGHT = "data-cover-tone";
const SNAP = "data-cv-snap";
const SURFACE = ["--accent", "--accent-strong", "--accent-ink", "--accent-soft"];
const ISLAND = ["--cv-dk-accent", "--cv-dk-strong", "--cv-dk-ink", "--cv-dk-soft"];
const FULL = FULL_VARS;

let accent = null;
let mode = "accent";
let base = null;

function clearAll(root) {
  [...SURFACE, ...ISLAND, ...FULL].forEach((k) => root.style.removeProperty(k));
  root.removeAttribute(ATTR);
  root.removeAttribute(ATTR_FULL);
  root.removeAttribute(ATTR_LIGHT);
}

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
  const full = mode === "full" && root.getAttribute("data-contrast") !== "high";
  if (full) {
    const f = buildSurfaces(accent, base.light);
    surfaces = f.surfaces;
    FULL.forEach((k) => root.style.setProperty(k, f.vars[k]));
    root.setAttribute(ATTR_FULL, "");
    root.setAttribute(ATTR_LIGHT, base.light ? "light" : "dark");
  } else {
    FULL.forEach((k) => root.style.removeProperty(k));
    root.removeAttribute(ATTR_FULL);
    root.removeAttribute(ATTR_LIGHT);
  }
  const neutral = mode === "full";
  const s = buildSet(accent, { surfaces, light: base.light, neutral });
  const d = buildSet(accent, { surfaces: ISLAND_SURFACES, island: true, neutral });
  SURFACE.forEach((k, i) => root.style.setProperty(k, s.strings[i]));
  ISLAND.forEach((k, i) => root.style.setProperty(k, d.strings[i]));
  root.setAttribute(ATTR, "");
}

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
