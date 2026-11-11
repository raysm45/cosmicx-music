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
  }

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
  }
  return username || "1";
}

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

export function exitImpersonate() {
  setAuthToken(null);
  try {
    sessionStorage.removeItem(KEY);
  } catch {
  }
  window.location.replace("/");
}
