// Cache profil artis (foto dll) supaya menu lagu bisa langsung menampilkan
// foto artis di klik pertama, tanpa menunggu fetch setelah menu terbuka.
import { Api } from "./api.js";
import { isRelevantArtistMatch } from "./utils.js";

const cache = new Map();     // key -> data | null
const inflight = new Map();  // key -> Promise

function keyOf(track) {
  const a = track && track.artist;
  if (!a) return null;
  const k = String(a.id || a.name || "").trim().toLowerCase();
  return k || null;
}

function preloadImage(url) {
  return new Promise((resolve) => {
    if (!url || typeof Image === "undefined") return resolve();
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });
}

/** undefined = belum dimuat, null = tidak ada / tidak relevan, object = profil artis */
export function peekArtistProfile(track) {
  const k = keyOf(track);
  if (!k) return null;
  return cache.has(k) ? cache.get(k) : undefined;
}

export function loadArtistProfile(track) {
  const k = keyOf(track);
  if (!k) return Promise.resolve(null);
  if (cache.has(k)) return Promise.resolve(cache.get(k));
  if (inflight.has(k)) return inflight.get(k);
  const a = track.artist;
  const hasId = !!a.id;
  const p = Api.artist(a.id || a.name)
    .then(async (res) => {
      const ok = res && !(!hasId && res.name && !isRelevantArtistMatch(res.name, a.name));
      const data = ok ? res : null;
      if (data && data.image) await preloadImage(data.image);
      cache.set(k, data);
      return data;
    })
    .catch(() => null) // gagal jaringan: jangan di-cache, boleh dicoba lagi
    .finally(() => { inflight.delete(k); });
  inflight.set(k, p);
  return p;
}
