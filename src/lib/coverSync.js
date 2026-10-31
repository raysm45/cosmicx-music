import { useEffect, useRef, useState } from "react";
import { sizedThumb } from "./brand.jsx";
import { extractFluidColors } from "./FluidBackground.jsx";

// Masalah lama: thumbnail & warna latar masing-masing memuat gambar sendiri -> selesai di waktu berbeda,
// jadi cover "pop" dulu baru warna menyusul (atau sebaliknya). Di sini keduanya disiapkan DULU
// (gambar ter-decode + palet terekstrak), baru pergantian dipicu dalam satu render -> mulai di frame yang sama.

const MAX_WAIT_MS = 1400;   // koneksi lambat: jangan tahan UI lebih lama dari ini
const READY_LIMIT = 80;

const readyKeys = new Set();
const pending = new Map();

const keyOf = (src, px) => `${px}|${src}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function loadDisplayImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (img.decode) img.decode().then(() => resolve(true), () => resolve(true));
      else resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export function isCoverReady(src, px = 520) {
  return !src || readyKeys.has(keyOf(src, px));
}

// Menyiapkan gambar tampilan (URL yang persis sama dengan yang dipakai <img> di SmartCover) + palet warna.
export function prepareCover(src, px = 520) {
  if (!src) return Promise.resolve();
  const key = keyOf(src, px);
  if (readyKeys.has(key)) return Promise.resolve();
  let work = pending.get(key);
  if (!work) {
    work = Promise.allSettled([loadDisplayImage(sizedThumb(src, px)), extractFluidColors(src)]).then(() => {
      if (readyKeys.size >= READY_LIMIT) readyKeys.delete(readyKeys.values().next().value);
      readyKeys.add(key);
      pending.delete(key);
    });
    pending.set(key, work);
  }
  return Promise.race([work, wait(MAX_WAIT_MS)]);
}

const pick = (t) => ({ cover: t?.cover || null, id: t?.id || "", title: t?.title, artist: t?.artist?.name });
const same = (a, b) => a.cover === b.cover && a.id === b.id && a.title === b.title && a.artist === b.artist;

// Mengembalikan "snapshot" track yang baru berganti SETELAH cover + warna barunya siap.
// Cover, metadata animated artwork, dan latar semuanya membaca snapshot ini -> tidak ada yang berubah sendiri-sendiri.
export function useSyncedCoverTrack(track, px = 520) {
  const [snap, setSnap] = useState(() => pick(track));
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const seq = useRef(0);

  const cover = track?.cover || null;
  const id = track?.id || "";
  const title = track?.title;
  const artist = track?.artist?.name;

  useEffect(() => {
    const my = ++seq.current;
    const next = { cover, id, title, artist };
    const commit = () => setSnap((cur) => (same(cur, next) ? cur : next));

    // tanpa cover, cover sama (satu album), atau sudah siap -> langsung
    if (!cover || cover === snapRef.current.cover || isCoverReady(cover, px)) { commit(); return; }
    prepareCover(cover, px).then(() => { if (my === seq.current) commit(); });   // skip lagu cepat: hanya yang terbaru yang menang
  }, [cover, id, title, artist, px]);

  return snap;
}
