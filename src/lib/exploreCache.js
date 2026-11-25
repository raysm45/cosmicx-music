import { cyclePlan } from "./exploreThumbs.js";
import { preloadImages, preconnectOrigins } from "./imagePreload.js";

/* ──────────────────────────────────────────────────────────────
   Snapshot feed Explore
   - Isi feed dibuat sekali lalu dipakai ulang selama 5 jam (FEED_TTL).
     Buka-tutup app / pindah halaman → feed langsung muncul, tanpa skeleton & tanpa request.
   - Setelah 5 jam snapshot dibuang dan feed baru dibuat.
   - Hanya 2 cycle pertama yang disimpan (yang dilihat saat membuka halaman).
   ────────────────────────────────────────────────────────────── */

export const FEED_TTL = 5 * 60 * 60 * 1000;
const KEY = "aivy_explore_feed_v1";
const VERSION = 1;
export const FEED_MAX_CYCLES = 2;
const MAX_BYTES = 900 * 1024;

// Bentuk yang disimpan: block hanya membawa `kind` (komponen React tidak bisa diserialisasi).
function pack(cycles) {
  return cycles.slice(0, FEED_MAX_CYCLES).map((c) => ({
    trending: c.trending,
    blocks: c.blocks.map((b) => ({ kind: b.def?.kind || b.kind, tracks: b.tracks })),
    discover: c.discover,
    artists: c.artists,
  }));
}

/** @returns {{ at: number, explicit: boolean, cycles: object[] } | null} */
export function readFeedSnapshot() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || snap.v !== VERSION || !Array.isArray(snap.cycles) || !snap.cycles.length) return null;
    if (!snap.at || Date.now() - snap.at >= FEED_TTL) { localStorage.removeItem(KEY); return null; }
    return snap;
  } catch {
    return null;
  }
}

export function saveFeedSnapshot(cycles, at, explicit) {
  try {
    const body = JSON.stringify({ v: VERSION, at, explicit: !!explicit, cycles: pack(cycles) });
    if (body.length > MAX_BYTES) return;
    localStorage.setItem(KEY, body);
  } catch { /* storage penuh / diblokir → abaikan */ }
}

export function clearFeedSnapshot() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

/** Sisa waktu (ms) sampai snapshot kedaluwarsa. */
export const feedTimeLeft = (at) => Math.max(0, FEED_TTL - (Date.now() - at));

/**
 * Dipanggil sedini mungkin (main.jsx), sebelum React merender Explore:
 * kalau ada snapshot yang masih berlaku, koneksi ke host gambar dibuka dan thumbnail
 * layar pertama mulai diunduh — jadi saat halaman tampil, gambarnya sudah siap.
 */
export function warmExploreFeed() {
  try {
    const snap = readFeedSnapshot();
    if (!snap) return;
    const first = snap.cycles[0];
    const { critical, rest } = cyclePlan(first);
    preconnectOrigins(critical);
    preloadImages(critical, { high: true });
    const second = snap.cycles[1];
    preloadImages([...rest, ...(second ? cyclePlan(second).critical : [])]);
  } catch { /* warm-up tidak boleh mengganggu boot */ }
}
