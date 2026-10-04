import { useSyncExternalStore } from "react";

// Pilihan consent disimpan di localStorage. Naikkan CONSENT_VERSION kalau
// kategori cookie berubah supaya semua pengguna diminta memilih ulang.
export const CONSENT_KEY = "aivy_cookie_consent_v1";
const CONSENT_VERSION = 1;
const CONSENT_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 hari, lalu tanya lagi

export const COOKIE_OPEN_EVENT = "aivy:open-cookie-settings";

const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

function readStored() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== CONSENT_VERSION) return null;
    if (!data.decidedAt || Date.now() - data.decidedAt > CONSENT_TTL_MS) return null;
    return {
      necessary: true,
      preferences: !!data.preferences,
      analytics: !!data.analytics,
      decidedAt: data.decidedAt,
    };
  } catch {
    return null;
  }
}

let current = readStored();

// Sinkronkan antar tab: kalau pilihan diubah di tab lain, tab ini ikut update.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== CONSENT_KEY) return;
    current = readStored();
    emit();
  });
}

/** Pilihan saat ini, atau null kalau pengguna belum memilih. */
export function getConsent() {
  return current;
}

export function saveConsent({ preferences = false, analytics = false } = {}) {
  current = {
    necessary: true,
    preferences: !!preferences,
    analytics: !!analytics,
    decidedAt: Date.now(),
  };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ ...current, version: CONSENT_VERSION }));
  } catch { }
  emit();
  return current;
}

export const acceptAll = () => saveConsent({ preferences: true, analytics: true });
export const rejectAll = () => saveConsent({ preferences: false, analytics: false });

/**
 * Cek izin sebelum menyalakan fitur non-esensial, contoh:
 *   if (hasConsent("analytics")) initAnalytics();
 * Kategori "necessary" selalu true.
 */
export function hasConsent(category) {
  if (category === "necessary") return true;
  return !!(current && current[category]);
}

export function subscribeConsent(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Hook: re-render otomatis saat pilihan berubah. */
export function useCookieConsent() {
  return useSyncExternalStore(subscribeConsent, getConsent, getConsent);
}

/** Buka panel "Pilih cookie" dari mana saja (mis. tombol di Setting). */
export function openCookieSettings() {
  window.dispatchEvent(new Event(COOKIE_OPEN_EVENT));
}
