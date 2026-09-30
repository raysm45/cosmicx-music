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

// Liquid glass (dock mobile) dikontrol lewat pengaturan "Liquid Glass" (settings.liquidGlass),
// bukan lagi otomatis per-device. Diterapkan sebagai <html data-glass="...">.
//  full : aktif    -> refraksi liquid-glass (SVG displacement, Chromium) + blur tipis
//                     (browser non-Chromium: kaca bening biasa)
//  blur : nonaktif -> blur biasa, tanpa refraksi
const SETTINGS_CACHE_KEY = "aivy_settings_cache_v1"; // sama dengan context.jsx

// Baca setting dari cache lokal sebelum React mount, supaya tidak ada kedip saat pertama load.
export function readCachedLiquidGlass() {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (raw) return JSON.parse(raw)?.liquidGlass !== false;
  } catch {}
  return true;
}

export function applyLiquidGlass(enabled) {
  if (typeof document === "undefined") return;
  const on = enabled !== false;
  const root = document.documentElement;
  root.dataset.glass = on ? "full" : "blur";
  root.dataset.glassFx = on && supportsRefraction() ? "1" : "0";
}
