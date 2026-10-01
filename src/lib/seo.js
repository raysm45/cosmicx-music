// SEO ala Spotify: judul + meta + canonical + JSON-LD yang berubah per halaman.
// Googlebot menjalankan JavaScript, jadi tag ini ikut terbaca saat halaman dirender.
import { useEffect } from "react";

export const SITE_URL = "https://music.cosmicx.fun";
export const SITE_NAME = "cosmicx Music";
export const DEFAULT_TITLE = "cosmicx Music - Web Player: Musik untuk semua orang";
export const DEFAULT_DESC = "cosmicx Music adalah layanan musik digital yang memberi kamu akses ke lagu, album, dan playlist dari artis di seluruh dunia.";
export const DEFAULT_IMAGE = SITE_URL + "/og-image.png";

// playing = true saat ada lagu diputar (judul tab dipakai nama lagu oleh player)
export const seoState = { playing: false, title: "" };

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute("content", content);
}
function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) { el = document.createElement("link"); el.setAttribute("rel", "canonical"); document.head.appendChild(el); }
  el.setAttribute("href", href);
}
function setJsonLd(data) {
  const id = "seo-page-jsonld";
  let el = document.getElementById(id);
  if (!data) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("script"); el.type = "application/ld+json"; el.id = id; document.head.appendChild(el); }
  el.textContent = JSON.stringify(data);
}

export function setSeo({ title, description, path, image, type = "website", noindex = false, jsonLd = null } = {}) {
  if (typeof document === "undefined") return;
  const fullTitle = title || DEFAULT_TITLE;
  const desc = description || DEFAULT_DESC;
  const url = SITE_URL + (path ?? window.location.pathname);
  const hasImage = !!image && /^https?:\/\//.test(image);
  const img = hasImage ? image : DEFAULT_IMAGE;

  seoState.title = fullTitle;
  if (!seoState.playing) document.title = fullTitle;

  setMeta("name", "description", desc);
  setMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large");
  setCanonical(url);
  setMeta("property", "og:type", type);
  setMeta("property", "og:title", fullTitle);
  setMeta("property", "og:description", desc);
  setMeta("property", "og:url", url);
  setMeta("property", "og:image", img);
  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", fullTitle);
  setMeta("name", "twitter:description", desc);
  setMeta("name", "twitter:image", img);
  setJsonLd(jsonLd);
}

const PRIVATE = { noindex: true };
const ROUTE_SEO = {
  landing:        { title: DEFAULT_TITLE, description: DEFAULT_DESC, path: "/" },
  home:           { title: "Beranda | cosmicx Music", description: "Jelajahi lagu trending, rilisan terbaru, dan rekomendasi musik di cosmicx Music.", path: "/beranda" },
  newTrending:    { title: "Lagu Terbaru & Trending | cosmicx Music", description: "Dengarkan lagu-lagu terbaru dan yang sedang trending di cosmicx Music.", path: "/beranda/terbaru" },
  editorsPicks:   { title: "Pilihan Editor | cosmicx Music", description: "Kurasi lagu dan album pilihan editor cosmicx Music.", path: "/beranda/kurasi" },
  bestAlbums:     { title: "Album Terbaik | cosmicx Music", description: "Daftar album terbaik yang wajib kamu dengarkan di cosmicx Music.", path: "/beranda/album-terbaik" },
  login:          { title: "Masuk | cosmicx Music", ...PRIVATE },
  search:         { title: "Cari | cosmicx Music", ...PRIVATE },
  library:        { title: "Koleksi Kamu | cosmicx Music", ...PRIVATE },
  libraryImport:  { title: "Import Koleksi | cosmicx Music", ...PRIVATE },
  libraryLocal:   { title: "Musik Lokal | cosmicx Music", ...PRIVATE },
  liked:          { title: "Lagu yang Disukai | cosmicx Music", ...PRIVATE },
  shorts:         { title: "Shorts | cosmicx Music", ...PRIVATE },
  settings:       { title: "Pengaturan | cosmicx Music", ...PRIVATE },
  roomLobby:      { title: "Rooms | cosmicx Music", ...PRIVATE },
  room:           { title: "Room | cosmicx Music", ...PRIVATE },
  playlist:       { title: "Playlist | cosmicx Music", ...PRIVATE },
  // artist & album: judul/meta diisi halamannya sendiri setelah data dimuat
  artist:         { title: "Artis | cosmicx Music" },
  album:          { title: "Album | cosmicx Music" },
};

export function useRouteSeo(name, id) {
  useEffect(() => {
    const cfg = ROUTE_SEO[name];
    if (!cfg) { setSeo({ noindex: true }); return; }
    setSeo(cfg);
  }, [name, id]);
}
