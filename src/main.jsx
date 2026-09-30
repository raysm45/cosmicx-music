import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/global.css";
import "./vendor/am-lyrics/am-lyrics.ts";
import { applyLiquidGlass, readCachedLiquidGlass } from "./lib/perf.js";

applyLiquidGlass(readCachedLiquidGlass());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}


