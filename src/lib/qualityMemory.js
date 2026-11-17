// Ingatan kualitas: hanya menyimpan fakta POSITIF (lagu yang sudah pernah benar-benar
// diputar sebagai FLAC lossless dan terverifikasi). Tidak ada tebakan, tidak ada janji.
// Kalau suatu saat lagu itu diputar lagi dan ternyata fallback, catatannya dihapus.
import { useEffect, useState } from "react";
import { Api } from "./api.js";
import { unifyAudioInfoFields, isAudioInfoSettled } from "./audioFormat.js";

const STORE_KEY = "aivy.quality.v1";
const MAX_ENTRIES = 1500;
const BAD_STATUS = new Set(["invalid", "not-cached", "preparing", "running"]);
const CONFIRM_DELAYS_MS = [0, 1200, 2200, 3500];

let mem = null; // Map<key, [sampleRateHz, bitsPerSample, ts]>
let saveTimer = null;
const listeners = new Set();

function load() {
  if (mem) return mem;
  mem = new Map();
  try {
    const obj = JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}");
    for (const [k, v] of Object.entries(obj)) if (Array.isArray(v)) mem.set(k, v);
  } catch {}
  return mem;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const m = load();
      if (m.size > MAX_ENTRIES) {
        const sorted = [...m.entries()].sort((a, b) => (a[1][2] || 0) - (b[1][2] || 0));
        for (let i = 0; i < m.size - MAX_ENTRIES; i++) m.delete(sorted[i][0]);
      }
      window.localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(m)));
    } catch {}
  }, 400);
}

function emit() { listeners.forEach((fn) => { try { fn(); } catch {} }); }
export function subscribeQuality(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Satu lagu bisa punya beberapa id (id Deezer, videoId YouTube, ...): simpan & cari lewat semuanya.
export function qualityKeys(track, extraVideoId) {
  const out = [];
  for (const v of [track && track.videoId, track && track.id, extraVideoId]) {
    const s = v == null ? "" : String(v);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function isPositiveLossless(f) {
  return !!(f && f.lossless && !f.transcoded && f.sampleRateHz && f.bitsPerSample && !BAD_STATUS.has(f.status));
}

export function rememberQuality(keys, f) {
  const m = load();
  const entry = [Math.round(f.sampleRateHz), Math.round(f.bitsPerSample), Date.now()];
  let changed = false;
  for (const k of keys) {
    const prev = m.get(k);
    if (!prev || prev[0] !== entry[0] || prev[1] !== entry[1]) changed = true;
    m.set(k, entry);
  }
  save();
  if (changed) emit();
}

export function forgetQuality(keys) {
  const m = load();
  let changed = false;
  for (const k of keys) if (m.delete(k)) changed = true;
  if (changed) { save(); emit(); }
}

// -> { tier: "lossless" | "hires", sampleRateHz, bitsPerSample } atau null
export function getRememberedQuality(track) {
  const m = load();
  for (const k of qualityKeys(track)) {
    const v = m.get(k);
    if (v) return { tier: v[0] > 48000 ? "hires" : "lossless", sampleRateHz: v[0], bitsPerSample: v[1] };
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Dipanggil SETELAH stream benar-benar tersaji sebagai FLAC. Cek metadata, simpan hanya kalau
// positif; kalau metadata bilang bukan lossless asli (mis. transcode) catatan dihapus.
export async function confirmLossless(videoId, keys) {
  for (const delay of CONFIRM_DELAYS_MS) {
    if (delay) await sleep(delay);
    let raw = null;
    try { raw = await Api.trackAudioInfo(videoId, "flac"); } catch { raw = null; }
    const f = unifyAudioInfoFields(raw && raw !== "unavailable" ? raw : null);
    if (!f || !isAudioInfoSettled(raw)) continue;
    if (isPositiveLossless(f)) rememberQuality(keys, f);
    else if (!f.lossless || f.transcoded || f.status === "invalid") forgetQuality(keys);
    return;
  }
}

export function useRememberedQuality(track) {
  const idKey = track ? `${track.videoId || ""}|${track.id || ""}` : "";
  const [q, setQ] = useState(() => getRememberedQuality(track));
  useEffect(() => {
    const read = () => setQ((prev) => {
      const n = getRememberedQuality(track);
      return (prev && n && prev.tier === n.tier && prev.sampleRateHz === n.sampleRateHz && prev.bitsPerSample === n.bitsPerSample) || (!prev && !n) ? prev : n;
    });
    read();
    return subscribeQuality(read);
  }, [idKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return q;
}
