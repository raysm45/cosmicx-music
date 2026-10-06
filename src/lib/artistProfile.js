import { Api } from "./api.js";
import { isRelevantArtistMatch } from "./utils.js";

const cache = new Map();
const inflight = new Map();
const MAX_ARTISTS = 8;

function keyOf(artist) {
  if (!artist) return null;
  const k = String(artist.id || artist.name || "").trim().toLowerCase();
  return k || null;
}
export function menuArtists(track) {
  const raw = track?.artists?.length ? track.artists : (track?.artist ? [track.artist] : []);
  const seen = new Set();
  const out = [];
  for (const a of raw) {
    if (!a || !a.name) continue;
    const k = keyOf(a);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
    if (out.length >= MAX_ARTISTS) break;
  }
  return out;
}

function preloadImage(url) {
  return new Promise((resolve) => {
    if (!url || typeof Image === "undefined") return resolve();
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });
}
export function peekArtistProfile(artist) {
  const k = keyOf(artist);
  if (!k) return null;
  return cache.has(k) ? cache.get(k) : undefined;
}

export function loadArtistProfile(artist) {
  const k = keyOf(artist);
  if (!k) return Promise.resolve(null);
  if (cache.has(k)) return Promise.resolve(cache.get(k));
  if (inflight.has(k)) return inflight.get(k);
  const hasId = !!artist.id;
  const p = Api.artist(artist.id || artist.name)
    .then(async (res) => {
      const ok = res && !(!hasId && res.name && !isRelevantArtistMatch(res.name, artist.name));
      const data = ok ? res : null;
      if (data && data.image) await preloadImage(data.image);
      cache.set(k, data);
      return data;
    })
    .catch(() => null)
    .finally(() => { inflight.delete(k); });
  inflight.set(k, p);
  return p;
}
export function loadTrackArtists(track) {
  return Promise.all(menuArtists(track).map(loadArtistProfile));
}
export function trackArtistsReady(track) {
  return menuArtists(track).every((a) => peekArtistProfile(a) !== undefined);
}
