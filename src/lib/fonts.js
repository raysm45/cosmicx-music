import { useSyncExternalStore } from "react";
export const CUSTOM_URL_FAMILY = "Cosmicx Custom";
export const LOCAL_FILE_FAMILY = "Cosmicx Local";
export const MAX_FONT_FILE_BYTES = 10 * 1024 * 1024;
export const FONT_FILE_ACCEPT = ".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf";

export const FREE_FONT_SOURCES = "Google Fonts, Bunny Fonts, Fontsource (jsDelivr)";
export const FONT_URL_PLACEHOLDER = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap";

const PAID_FONT_HOSTS = [
  "myfonts.com", "fonts.com", "monotype.com", "linotype.com", "fontshop.com",
  "fontspring.com", "typography.com", "hoefler.com", "fonts.adobe.com",
  "typekit.net", "typekit.com", "fontbundles.net", "creativefabrica.com",
  "fontsmarket.com", "envato.com", "elements.envato.com", "fontstand.com",
  "commercialtype.com", "klim.co.nz", "colophon-foundry.org",
];

const matchesHost = (host, list) => list.some((h) => host === h || host.endsWith(`.${h}`));

/**
 * Periksa URL font.
 * @returns {{ok:true, kind:"css"|"file", href:string, host:string} | {ok:false, reason:"empty"|"invalid"|"insecure"|"paid"}}
 */
export function checkFontUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return { ok: false, reason: "empty" };
  let u;
  try { u = new URL(value, window.location.origin); } catch { return { ok: false, reason: "invalid" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: "invalid" };
  const sameOrigin = u.origin === window.location.origin;
  if (!sameOrigin && u.protocol !== "https:") return { ok: false, reason: "insecure" };
  const host = u.hostname.toLowerCase();
  if (matchesHost(host, PAID_FONT_HOSTS)) return { ok: false, reason: "paid", host };
  const isCss = /\.css$/i.test(u.pathname) || host === "fonts.googleapis.com" || host === "fonts.bunny.net";
  return { ok: true, kind: isCss ? "css" : "file", href: u.href.replace(/"/g, "%22"), host };
}

function fontFormat(pathname) {
  const ext = (pathname.match(/\.(woff2|woff|ttf|otf)$/i) || [])[1]?.toLowerCase();
  return ({ woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" })[ext] || null;
}

const titleCase = (s) => s.replace(/[-_+]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
const safeFamily = (s) => String(s || "").replace(/[^\p{L}\p{N} _.\-]/gu, "").trim().slice(0, 80);
const quoteFamily = (s) => `'${safeFamily(s)}'`;

function guessFamiliesFromCssUrl(href) {
  const u = new URL(href);
  const out = [];
  if (u.hostname === "fonts.googleapis.com") {
    u.searchParams.getAll("family").forEach((f) => { const n = safeFamily(f.split(":")[0]); if (n) out.push(n); });
  } else if (u.hostname === "fonts.bunny.net") {
    u.searchParams.getAll("family").forEach((f) => { const n = safeFamily(titleCase(f.split(":")[0])); if (n) out.push(n); });
  } else {
    const m = u.pathname.match(/@fontsource(-variable)?\/([^/@]+)/i);
    if (m) out.push(safeFamily(titleCase(m[2])) + (m[1] ? " Variable" : ""));
  }
  return out;
}

function readFamiliesFromSheet(link) {
  try {
    const rules = link.sheet?.cssRules;
    if (!rules) return [];
    const set = new Set();
    for (const r of rules) {
      if (r.type === 5) {
        const f = safeFamily(r.style.getPropertyValue("font-family").replace(/["']/g, ""));
        if (f) set.add(f);
      }
    }
    return [...set];
  } catch { return []; }
}

const LS_KEY = "aivy-local-font";
const DB_NAME = "aivy-fonts";
const DB_STORE = "files";
const DB_KEY = "local";

let cachedRaw = null;
let cachedValue = null;
const subs = new Set();
const emit = () => subs.forEach((fn) => fn());

/** @returns {null | {kind:"file", name:string} | {kind:"installed", name:string}} */
export function getLocalFont() {
  let raw = null;
  try { raw = localStorage.getItem(LS_KEY); } catch { /* storage diblokir */ }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  try {
    const v = raw ? JSON.parse(raw) : null;
    cachedValue = v && (v.kind === "file" || v.kind === "installed") && typeof v.name === "string" && v.name ? v : null;
  } catch { cachedValue = null; }
  return cachedValue;
}
const subscribe = (fn) => {
  subs.add(fn);
  const onStorage = (e) => { if (e.key === LS_KEY) fn(); };
  window.addEventListener("storage", onStorage);
  return () => { subs.delete(fn); window.removeEventListener("storage", onStorage); };
};
export function useLocalFont() {
  return useSyncExternalStore(subscribe, getLocalFont, () => null);
}

function writeMeta(meta) {
  try {
    if (meta) localStorage.setItem(LS_KEY, JSON.stringify(meta));
    else localStorage.removeItem(LS_KEY);
  } catch {}
  emit();
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no-idb")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, DB_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function idbGet() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(DB_KEY);
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
async function idbDelete() {
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(DB_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch {}
}

export function clearLocalFont() {
  if (!getLocalFont()) return;
  const wasFile = getLocalFont()?.kind === "file";
  writeMeta(null);
  if (wasFile) idbDelete();
}
export function setInstalledFont(name) {
  const clean = safeFamily(name);
  if (!clean) { clearLocalFont(); return null; }
  const wasFile = getLocalFont()?.kind === "file";
  writeMeta({ kind: "installed", name: clean });
  if (wasFile) idbDelete();
  return clean;
}
export async function setFontFile(file) {
  if (!file) throw new Error("invalid");
  if (!/\.(woff2|woff|ttf|otf)$/i.test(file.name)) throw new Error("type");
  if (file.size > MAX_FONT_FILE_BYTES) throw new Error("size");
  const buffer = await file.arrayBuffer();
  try {
    const probe = new FontFace(LOCAL_FILE_FAMILY, buffer.slice(0));
    await probe.load();
  } catch { throw new Error("invalid"); }
  try { await idbPut({ buffer, fileName: file.name }); } catch { throw new Error("storage"); }
  const name = file.name.replace(/\.[^.]+$/, "");
  writeMeta({ kind: "file", name });
  return name;
}
export function isFontInstalled(name) {
  const clean = safeFamily(name);
  if (!clean) return false;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    const sample = "mmmmmmmmmmlliWWW@#0123456789";
    return ["monospace", "serif", "sans-serif"].some((base) => {
      ctx.font = `72px ${base}`;
      const baseW = ctx.measureText(sample).width;
      ctx.font = `72px '${clean}', ${base}`;
      return ctx.measureText(sample).width !== baseW;
    });
  } catch { return true; }
}

let activeLocalFace = null;

/**
 * Terapkan font kustom (font lokal lebih diprioritaskan daripada URL).
 * `onStack(stack)` dipanggil dengan string font-family, atau null jika tidak ada
 * font kustom yang aktif (pemanggil lalu memakai preset).
 * @returns {{active:boolean, cleanup:()=>void}}
 */
export function applyCustomFont({ fontUrl, localFont }, onStack) {
  const ID_FACE = "aivy-custom-font-face";
  const ID_LINK = "aivy-custom-font-link";
  let cancelled = false;
  const removeEls = () => {
    document.getElementById(ID_FACE)?.remove();
    document.getElementById(ID_LINK)?.remove();
  };
  const removeLocalFace = () => {
    if (activeLocalFace) { try { document.fonts.delete(activeLocalFace); } catch { /* abaikan */ } activeLocalFace = null; }
  };
  const cleanup = () => { cancelled = true; };

  removeEls();

  if (localFont) {
    if (localFont.kind === "installed") {
      removeLocalFace();
      onStack(`${quoteFamily(localFont.name)}, sans-serif`);
      return { active: true, cleanup };
    }
    idbGet()
      .then(async (rec) => {
        if (cancelled) return;
        if (!rec?.buffer) { onStack(null); return; }
        removeLocalFace();
        const face = new FontFace(LOCAL_FILE_FAMILY, rec.buffer.slice(0));
        await face.load();
        if (cancelled) return;
        document.fonts.add(face);
        activeLocalFace = face;
        onStack(`'${LOCAL_FILE_FAMILY}', sans-serif`);
      })
      .catch(() => { if (!cancelled) onStack(null); });
    return { active: true, cleanup };
  }
  removeLocalFace();

  const check = checkFontUrl(fontUrl);
  if (!check.ok) { onStack(null); return { active: false, cleanup }; }

  if (check.kind === "file") {
    const fmt = fontFormat(new URL(check.href).pathname);
    const style = document.createElement("style");
    style.id = ID_FACE;
    style.textContent = `@font-face{font-family:"${CUSTOM_URL_FAMILY}";src:url("${check.href}")${fmt ? ` format("${fmt}")` : ""};font-display:swap;}`;
    document.head.appendChild(style);
    onStack(`'${CUSTOM_URL_FAMILY}', sans-serif`);
    return { active: true, cleanup };
  }

  const buildStack = (families) => `${families.map(quoteFamily).join(", ")}, sans-serif`;
  const guessed = guessFamiliesFromCssUrl(check.href);
  const addLink = (withCors) => {
    document.getElementById(ID_LINK)?.remove();
    const link = document.createElement("link");
    link.id = ID_LINK;
    link.rel = "stylesheet";
    if (withCors) link.crossOrigin = "anonymous";
    link.onload = () => {
      if (cancelled || !withCors) return;
      const detected = readFamiliesFromSheet(link);
      if (detected.length) onStack(buildStack(detected));
    };
    link.onerror = () => {
      if (!cancelled && withCors) addLink(false);
    };
    link.href = check.href;
    document.head.appendChild(link);
  };
  addLink(true);
  onStack(guessed.length ? buildStack(guessed) : null);
  return { active: true, cleanup };
}
