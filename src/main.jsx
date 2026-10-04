import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/global.css";
import { applyLiquidGlass, readCachedLiquidGlass } from "./lib/perf.js";
import { IS_DISCORD_ACTIVITY, bootDiscordActivity } from "./lib/discordActivity.js";

applyLiquidGlass(readCachedLiquidGlass());

async function start() {
  if (IS_DISCORD_ACTIVITY) {
    try {
      await Promise.race([
        bootDiscordActivity(),
        new Promise((resolve) => setTimeout(resolve, 30000)),
      ]);
    } catch {}
  }
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