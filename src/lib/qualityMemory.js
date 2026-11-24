// Ingatan kualitas: hanya menyimpan fakta POSITIF (lagu yang sudah pernah benar-benar
// diputar sebagai FLAC lossless dan terverifikasi). Tidak ada tebakan, tidak ada janji.
// Kalau suatu saat lagu itu diputar lagi dan ternyata fallback, catatannya dihapus.
import { useEffect, useState } from "react";
import { Api } from "./api.js";
import { unifyAudioInfoFields, isAudioInfoSettled, getPreferredAudioFormat } from "./audioFormat.js";

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

// ───────────────────────── Dolby Atmos ─────────────────────────
// Atmos disimpan TERPISAH dari ingatan lossless: ada-tidaknya master Atmos tidak ada hubungannya dengan
// apakah stream FLAC-nya jatuh ke fallback. Hanya fakta positif yang disimpan (key -> timestamp).
const ATMOS_KEY = "aivy.atmos.v1";
const ATMOS_MAX = 3000;
let atmosMem = null; // Map<key, ts>
let atmosTimer = null;

function loadAtmos() {
  if (atmosMem) return atmosMem;
  atmosMem = new Map();
  try {
    const obj = JSON.parse(window.localStorage.getItem(ATMOS_KEY) || "{}");
    for (const [k, v] of Object.entries(obj)) atmosMem.set(k, Number(v) || 0);
  } catch {}
  return atmosMem;
}

function saveAtmos() {
  clearTimeout(atmosTimer);
  atmosTimer = setTimeout(() => {
    try {
      const m = loadAtmos();
      if (m.size > ATMOS_MAX) {
        const sorted = [...m.entries()].sort((a, b) => a[1] - b[1]);
        for (let i = 0; i < m.size - ATMOS_MAX; i++) m.delete(sorted[i][0]);
      }
      window.localStorage.setItem(ATMOS_KEY, JSON.stringify(Object.fromEntries(m)));
    } catch {}
  }, 400);
}

export function setAtmos(keys, on) {
  const m = loadAtmos();
  let changed = false;
  for (const k of keys) {
    if (on) { if (!m.has(k)) changed = true; m.set(k, Date.now()); }
    else if (m.delete(k)) changed = true;
  }
  if (changed) { saveAtmos(); emit(); }
}

export function hasAtmos(track) {
  const m = loadAtmos();
  return qualityKeys(track).some((k) => m.has(k));
}

export function useAtmos(track) {
  const idKey = track ? `${track.videoId || ""}|${track.id || ""}` : "";
  const [on, setOn] = useState(() => hasAtmos(track));
  useEffect(() => {
    const read = () => setOn(hasAtmos(track));
    read();
    return subscribeQuality(read);
  }, [idKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return on;
}

// Cek Atmos tanpa harus memutar lagu: satu kali tanya audio-info (tanpa polling), maksimal 2 request
// bersamaan, dan sekali per lagu per sesi. Hasil positif disimpan permanen; "tidak ada" tidak disimpan.
const PROBE_CONCURRENCY = 2;
const probeSeen = new Set();
const probeQueue = [];
let probeActive = 0;

function pumpProbe() {
  while (probeActive < PROBE_CONCURRENCY && probeQueue.length) {
    const { vid, keys } = probeQueue.shift();
    probeActive += 1;
    Api.trackAudioInfo(vid, getPreferredAudioFormat())
      .then((raw) => {
        const f = unifyAudioInfoFields(raw && raw !== "unavailable" ? raw : null);
        if (f && f.atmos) setAtmos(keys, true);
      })
      .catch(() => { probeSeen.delete(vid); })
      .then(() => { probeActive -= 1; pumpProbe(); });
  }
}

export function probeAtmos(track) {
  if (!track || track.source === "local") return;
  const vid = track.videoId || track.id;
  if (!vid || hasAtmos(track)) return;
  const id = String(vid);
  if (probeSeen.has(id)) return;
  probeSeen.add(id);
  probeQueue.push({ vid: id, keys: qualityKeys(track) });
  pumpProbe();
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
    setAtmos(keys, !!f.atmos); // info sudah settled: catat (atau cabut) status Atmos dari sumber yang sama
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
