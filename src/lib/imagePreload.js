/* ──────────────────────────────────────────────────────────────
   Preload thumbnail
   - URL yang sudah selesai dimuat + di-decode dicatat di `loaded`, sehingga
     <SmartCover> bisa langsung tampil (tanpa fade, tanpa lazy-loading).
   - Gambar "penting" (above the fold) dimuat segera dengan fetchPriority high.
   - Gambar lain masuk antrean berkonkurensi terbatas dan jalan saat browser idle.
   - Hemat data: pada Save-Data / koneksi 2G hanya gambar penting yang dimuat.
   ────────────────────────────────────────────────────────────── */

const MAX_LOADED = 2500;     // batas catatan URL yang sudah termuat
const MAX_KEEP = 220;        // batas objek Image yang ditahan agar bitmap hasil decode tidak cepat dibuang
const MAX_CONCURRENT = 4;    // batas unduhan latar belakang yang berjalan bersamaan

const loaded = new Set();
const pending = new Map();   // url -> Promise<boolean>
const keep = [];
const queue = [];            // { url, resolve }
let active = 0;

const isHttp = (u) => typeof u === "string" && /^(https?:)?\/\//i.test(u);

export const isThumbLoaded = (url) => !!url && loaded.has(url);

export function markThumbLoaded(url) {
  if (!url || loaded.has(url)) return;
  loaded.add(url);
  if (loaded.size > MAX_LOADED) {
    const first = loaded.values().next().value;
    loaded.delete(first);
  }
}

function remember(url, img) {
  markThumbLoaded(url);
  keep.push(img);
  if (keep.length > MAX_KEEP) keep.shift();
}

function saveDataOn() {
  if (typeof navigator === "undefined") return false;
  const c = navigator.connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType || ""));
}

function fetchOne(url, high) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    try { img.fetchPriority = high ? "high" : "low"; } catch { /* browser lama */ }
    img.onload = () => {
      const done = () => { remember(url, img); resolve(true); };
      // decode() menyiapkan bitmap di luar main thread → tidak ada jank saat pertama kali tampil
      if (typeof img.decode === "function") img.decode().then(done, done);
      else done();
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

const idle = (fn) => {
  if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: 500 });
  else setTimeout(fn, 60);
};

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const job = queue.shift();
    active++;
    fetchOne(job.url, false).then((ok) => {
      active--;
      job.resolve(ok);
      idle(pump);
    });
  }
}

function request(url, high) {
  if (!isHttp(url)) return Promise.resolve(false);
  if (loaded.has(url)) return Promise.resolve(true);
  const existing = pending.get(url);
  if (existing) return existing;
  let p;
  if (high) {
    p = fetchOne(url, true);
  } else {
    p = new Promise((resolve) => { queue.push({ url, resolve }); idle(pump); });
  }
  pending.set(url, p);
  p.finally(() => pending.delete(url));
  return p;
}

/**
 * Preload daftar URL.
 * @param {string[]} urls
 * @param {{ high?: boolean, timeout?: number }} opts
 *   high    → muat sekarang juga dengan prioritas tinggi (untuk konten di layar pertama)
 *   timeout → (ms) berhenti menunggu setelah sekian lama; unduhan tetap lanjut di belakang
 * @returns Promise yang selesai saat semua URL siap, atau saat timeout.
 */
export function preloadImages(urls, { high = false, timeout = 0 } = {}) {
  const list = [...new Set((urls || []).filter(Boolean))];
  if (!list.length) return Promise.resolve();
  if (!high && saveDataOn()) return Promise.resolve();
  const all = Promise.all(list.map((u) => request(u, high)));
  if (!timeout) return all.then(() => undefined);
  return Promise.race([all, new Promise((r) => setTimeout(r, timeout))]).then(() => undefined);
}

const preconnected = new Set();

/** Buka koneksi lebih awal ke host gambar (DNS + TLS) sebelum gambar pertama diminta. */
export function preconnectOrigins(urls, max = 4) {
  if (typeof document === "undefined") return;
  for (const u of urls || []) {
    if (preconnected.size >= max) return;
    let origin;
    try { origin = new URL(u, location.href).origin; } catch { continue; }
    if (!origin || origin === location.origin || preconnected.has(origin)) continue;
    preconnected.add(origin);
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    document.head.appendChild(link);
  }
}
