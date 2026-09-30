// Perf helpers: dipakai buat "matiin sementara" kerjaan berat (canvas visualizer,
// live-blur recompute) selagi ada animasi transform yang lagi jalan (FLIP, buka sheet, dst),
// supaya GPU/CPU device low-end (mis. Redmi 14C) fokus ke satu animasi transform dulu.
// Tidak mengubah tampilan akhir — cuma menunda kerja dekoratif ~beberapa ratus ms.

let heavyCount = 0;
const listeners = new Set();
let safetyTimer = null;

function notify() {
  const active = heavyCount > 0;
  listeners.forEach((fn) => {
    try { fn(active); } catch {}
  });
}

export function isHeavyTransition() {
  return heavyCount > 0;
}

export function beginHeavyTransition(maxMs = 900) {
  heavyCount++;
  notify();
  // safety net: kalau lupa/telat manggil end (unmount di tengah animasi dsb),
  // jangan sampai visualizer mati permanen.
  clearTimeout(safetyTimer);
  safetyTimer = setTimeout(() => {
    heavyCount = 0;
    notify();
  }, maxMs);
  let ended = false;
  return function endHeavyTransition() {
    if (ended) return;
    ended = true;
    heavyCount = Math.max(0, heavyCount - 1);
    notify();
  };
}

export function subscribeHeavyTransition(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Deteksi kasar device/koneksi lemah (dipakai buat nurunin beban dekoratif,
// bukan buat sembunyiin fitur).
let lowEndCache = null;
export function isLowEndDevice() {
  if (lowEndCache != null) return lowEndCache;
  if (typeof navigator === "undefined") return false;
  const mem = navigator.deviceMemory; // GB, hanya ada di Chromium/WebView
  const cores = navigator.hardwareConcurrency;
  const saveData = navigator.connection?.saveData;
  const slowNet = /^(slow-2g|2g|3g)$/i.test(navigator.connection?.effectiveType || "");
  lowEndCache = !!(saveData || slowNet || (mem && mem <= 4) || (cores && cores <= 4));
  return lowEndCache;
}

import { supportsRefraction } from "./liquidGlass.js";

// Tingkat efek kaca (liquid glass). Diterapkan sebagai <html data-glass="...">.
//  full  : refraksi liquid-glass (SVG displacement, Chromium) + blur tipis -> device normal/kencang
//          (browser non-Chromium: kaca bening biasa, blur 12px)
//  lite  : blur 8px, tanpa saturasi -> device lawas (RAM <= 4GB / core <= 4 / data saver)
//  solid : tanpa backdrop-filter, latar semi-solid -> device sangat lemah (RAM <= 2GB)
// Bisa dipaksa manual: setGlassTier("full" | "lite" | "solid" | "auto").
const GLASS_KEY = "aivy-glass";
export function getGlassTier() {
  try {
    const saved = localStorage.getItem(GLASS_KEY);
    if (saved === "full" || saved === "lite" || saved === "solid") return saved;
  } catch {}
  if (typeof navigator === "undefined") return "full";
  const mem = navigator.deviceMemory;
  if (mem && mem <= 2) return "solid";
  return isLowEndDevice() ? "lite" : "full";
}
export function applyGlassTier() {
  if (typeof document === "undefined") return;
  const tier = getGlassTier();
  document.documentElement.dataset.glass = tier;
  document.documentElement.dataset.glassFx = tier === "full" && supportsRefraction() ? "1" : "0";
}
export function setGlassTier(tier) {
  try {
    if (tier === "auto") localStorage.removeItem(GLASS_KEY);
    else localStorage.setItem(GLASS_KEY, tier);
  } catch {}
  applyGlassTier();
}
