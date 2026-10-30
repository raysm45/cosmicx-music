// Mode "masuk sebagai user" (impersonate) dari panel admin.
//
// Alurnya: panel admin membuat token sesi user lewat
//   POST /api/admin/users/<id>/impersonate  ->  { token }
// lalu membuka aplikasi ini dengan
//   https://music.cosmicx.fun/?impersonate=<token>
//
// Token itu dipakai sebagai Bearer (bukan cookie) supaya sesi asli pemilik
// browser — cookie `token` yang juga dipakai panel — tidak tersentuh. Setelah
// dibaca, parameter langsung dihapus dari address bar agar token tidak ikut
// tersimpan di riwayat atau terbawa lewat header Referer.
import { setAuthToken } from "./api.js";

const KEY = "cosmicx.impersonate";
const PARAM = "impersonate";

function decodeUsername(token) {
  try {
    const b = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b));
    return payload.username || null;
  } catch {
    return null;
  }
}

/**
 * Baca token impersonate dari URL (query atau hash), pasang sebagai Bearer,
 * lalu bersihkan URL. Dipanggil sekali sebelum aplikasi dirender.
 * @returns {string|null} nama user yang di-impersonate, atau null kalau tidak ada
 */
export function captureImpersonateToken() {
  let url;
  try {
    url = new URL(window.location.href);
  } catch {
    return null;
  }

  const fromHash = () => {
    const raw = url.hash.replace(/^#/, "");
    if (!raw) return null;
    return new URLSearchParams(raw).get(PARAM);
  };
  const token = url.searchParams.get(PARAM) || fromHash();
  if (!token) return null;

  setAuthToken(token);
  const username = decodeUsername(token);
  try {
    sessionStorage.setItem(KEY, username || "1");
  } catch {
    /* storage diblokir — banner saja yang hilang, sesi tetap jalan */
  }

  // Buang token dari address bar.
  url.searchParams.delete(PARAM);
  const hashRaw = url.hash.replace(/^#/, "");
  if (hashRaw) {
    const hp = new URLSearchParams(hashRaw);
    if (hp.has(PARAM)) {
      hp.delete(PARAM);
      const rest = hp.toString();
      url.hash = rest ? `#${rest}` : "";
    }
  }
  try {
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* diabaikan */
  }
  return username || "1";
}

/** Nama user yang sedang di-impersonate, atau null kalau tidak dalam mode ini. */
export function impersonateUser() {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function isImpersonating() {
  return !!impersonateUser();
}

/** Keluar dari mode impersonate: buang Bearer, kembali ke sesi asli browser. */
export function exitImpersonate() {
  setAuthToken(null);
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* diabaikan */
  }
  // Sengaja TIDAK memanggil /auth/logout — itu akan menghapus cookie sesi
  // asli (admin) di browser ini.
  window.location.replace("/");
}
