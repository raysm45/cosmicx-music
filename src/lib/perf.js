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
let lowEndCache = null;
export function isLowEndDevice() {
  if (lowEndCache != null) return lowEndCache;
  if (typeof navigator === "undefined") return false;
  const mem = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  const saveData = navigator.connection?.saveData;
  const slowNet = /^(slow-2g|2g|3g)$/i.test(navigator.connection?.effectiveType || "");
  lowEndCache = !!(saveData || slowNet || (mem && mem <= 4) || (cores && cores <= 4));
  return lowEndCache;
}

import { supportsRefraction } from "./liquidGlass.js";

const SETTINGS_CACHE_KEY = "aivy_settings_cache_v1";
export function readCachedLiquidGlass() {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (raw) {
      const v = JSON.parse(raw)?.liquidGlass;
      if (v === true || v === false) return v;
    }
  } catch {}
  return !isLowEndDevice();
}

export function applyLiquidGlass(enabled) {
  if (typeof document === "undefined") return;
  const on = enabled !== false;
  const root = document.documentElement;
  root.dataset.glass = on ? "full" : "blur";
  root.dataset.glassFx = on && supportsRefraction() ? "1" : "0";
}