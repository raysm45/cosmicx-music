import { useEffect, useRef } from "react";
import { API_BASE } from "./api.js";
import { cleanTrackTitleForLyrics } from "./utils.js";
import { lyricAt } from "./presenceLyrics.js";

const BRIDGE_URL = (import.meta.env.VITE_PRESENCE_BRIDGE_URL || "http://127.0.0.1:6464").replace(/\/+$/, "");

// Discord membatasi update activity (kira-kira 5 update / 20 detik). Jarak minimum antar
// push gara-gara pergantian baris lirik; baris yang kelewat dilompati, yang dikirim selalu terbaru.
const MIN_GAP_MS = 5000;
// Kirim sedikit lebih awal supaya pas sampai di Discord barisnya sudah ganti.
const LOOKAHEAD_MS = 500;

let active = false;
let downUntil = 0;
let lastSentAt = 0;
let probe = null; // <am-lyrics> tersembunyi milik presence (dipakai kalau panel lirik web nggak kebuka)

function post(path, body, keepalive = false) {
  if (Date.now() < downUntil) return;
  fetch(`${BRIDGE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
    keepalive,
  }).catch(() => { downUntil = Date.now() + 15000; });
}

function clearPresence(keepalive = false) {
  if (!active) return;
  active = false;
  post("/clear", {}, keepalive);
}
function publicCover(cover) {
  if (!cover || typeof cover !== "string") return null;
  let url = cover;
  if (url.startsWith("//")) url = `https:${url}`;
  else if (url.startsWith("/")) url = `${API_BASE}${url}`;
  if (!/^https:\/\//i.test(url)) return null;
  return url.length <= 256 ? url : null;
}

function artistName(track) {
  return track.artist?.name || (typeof track.artist === "string" ? track.artist : "") || "";
}

// ---- sumber lirik: pakai komponen <am-lyrics> yang sama dengan halaman lirik web ----
function ensureProbe() {
  if (probe || typeof document === "undefined") return probe;
  const el = document.createElement("am-lyrics");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, { position: "fixed", width: "0", height: "0", overflow: "hidden", opacity: "0", pointerEvents: "none", left: "-9999px" });
  document.body.appendChild(el);
  probe = el;
  return el;
}

function destroyProbe() {
  if (probe) { probe.remove(); probe = null; }
}

function aimProbe(track) {
  const el = ensureProbe();
  if (!el) return;
  const artist = artistName(track);
  const title = cleanTrackTitleForLyrics(track.title, artist);
  const durationMs = track.duration ? Math.round(track.duration * 1000) : undefined;
  const apply = () => {
    if (probe !== el) return;
    if (el.songTitle === title && el.songArtist === artist && el.songDurationMs === durationMs) return;
    el.lyrics = undefined; // buang lirik lagu sebelumnya biar nggak kebaca basi
    el.songTitle = title;
    el.songArtist = artist;
    el.songDurationMs = durationMs;
    el.query = [title, artist].filter(Boolean).join(" ");
    el.autoScroll = false;
    el.interpolate = false;
  };
  if (typeof customElements === "undefined") return;
  if (customElements.get("am-lyrics")) apply();
  else customElements.whenDefined("am-lyrics").then(apply);
}

// Prioritas: elemen lirik yang kelihatan di web (biar persis sama, termasuk kalau user ganti sumber),
// kalau nggak ada baru pakai probe tersembunyi.
function lyricLines(track) {
  const want = cleanTrackTitleForLyrics(track.title, artistName(track));
  for (const el of document.querySelectorAll("am-lyrics.aivy-am-lyrics")) {
    if (el.songTitle === want && !el.isLoading && el.lyrics?.length) return el.lyrics;
  }
  return probe && !probe.isLoading && probe.lyrics?.length ? probe.lyrics : null;
}

export function useDiscordPresence({ enabled, track, isPlaying, audioRef, lyrics: lyricsEnabled = false }) {
  const lastKeyRef = useRef(null);
  const key = track ? track.id : null;
  const shareable = !!enabled && !!track && track.source !== "local";
  const withLyrics = shareable && !!lyricsEnabled;

  useEffect(() => {
    const trackChanged = lastKeyRef.current !== key;
    lastKeyRef.current = key;

    if (!shareable || !isPlaying) {
      clearPresence();
      return undefined;
    }

    const audio = audioRef?.current;
    if (!audio) return undefined;

    if (withLyrics) aimProbe(track);

    let pending = null;
    let sentLyric = null;
    const currentLyric = () => (withLyrics ? lyricAt(lyricLines(track), (audio.currentTime || 0) * 1000 + LOOKAHEAD_MS) : null);

    const push = () => {
      if (pending) { clearTimeout(pending); pending = null; }
      if (audio.paused || audio.readyState < 2) return;
      const dur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number(track.duration) || 0;
      const lyric = currentLyric();
      sentLyric = lyric;
      active = true;
      lastSentAt = Date.now();
      post("/presence", {
        id: String(track.id),
        title: track.title || "",
        artist: artistName(track),
        album: typeof track.album === "string" ? track.album : track.album?.title || "",
        cover: publicCover(track.cover),
        position: audio.currentTime || 0,
        duration: dur,
        lyric,
      });
    };

    // Dipanggil ~4x/detik oleh <audio>; cuma kirim kalau barisnya beda dari yang terakhir dikirim.
    const onTime = () => {
      if (!withLyrics || audio.paused || pending) return;
      if (currentLyric() === sentLyric) return;
      const wait = lastSentAt + MIN_GAP_MS - Date.now();
      if (wait <= 0) push();
      else pending = setTimeout(() => { pending = null; if (currentLyric() !== sentLyric) push(); }, wait);
    };

    const events = ["playing", "seeked", "durationchange"];
    events.forEach((ev) => audio.addEventListener(ev, push));
    audio.addEventListener("timeupdate", onTime);
    if (!trackChanged) push();
    const fallback = setTimeout(push, 2500);
    // Push karena lirik sudah membawa posisi terbaru, jadi heartbeat cukup kalau lama nggak ada kiriman.
    const heartbeat = setInterval(() => { if (Date.now() - lastSentAt >= 8000) push(); }, 10000);

    return () => {
      clearTimeout(fallback);
      clearInterval(heartbeat);
      if (pending) clearTimeout(pending);
      events.forEach((ev) => audio.removeEventListener(ev, push));
      audio.removeEventListener("timeupdate", onTime);
    };
  }, [shareable, isPlaying, key, withLyrics]);

  useEffect(() => {
    if (!withLyrics) destroyProbe();
  }, [withLyrics]);
  useEffect(() => () => destroyProbe(), []);

  useEffect(() => {
    if (!enabled) { clearPresence(); return undefined; }
    const onHide = () => clearPresence(true);
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [enabled]);
}
