import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/global.css";
import "./styles/nowplaying-mobile.css";
import "./styles/spotify-shell.css";
import { applyLiquidGlass, readCachedLiquidGlass } from "./lib/perf.js";
import { captureImpersonateToken } from "./lib/impersonate.js";

applyLiquidGlass(readCachedLiquidGlass());

// Mode impersonate: kalau panel admin membuka /?impersonate=<token>, pasang
// token itu sebagai Bearer SEBELUM aplikasi memanggil /auth/me.
captureImpersonateToken();

function start() {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
start();
const loadLyricsElement = () => import("./vendor/am-lyrics/am-lyrics.ts").catch(() => {});
if ("requestIdleCallback" in window) window.requestIdleCallback(loadLyricsElement, { timeout: 2500 });
else setTimeout(loadLyricsElement, 1500);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}