import { useEffect, useRef } from "react";
import { API_BASE } from "./api.js";

const BRIDGE_URL = (import.meta.env.VITE_PRESENCE_BRIDGE_URL || "http://127.0.0.1:6464").replace(/\/+$/, "");

let active = false;
let downUntil = 0;

function post(path, body, keepalive = false) {
  if (Date.now() < downUntil) return;
  fetch(`${BRIDGE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
    keepalive,
  }).catch(() => { downUntil = Date.now() + 15000; });
}

function clearPresence(keepalive = false) {
  if (!active) return;
  active = false;
  post("/clear", {}, keepalive);
}
function publicCover(cover) {
  if (!cover || typeof cover !== "string") return null;
  let url = cover;
  if (url.startsWith("//")) url = `https:${url}`;
  else if (url.startsWith("/")) url = `${API_BASE}${url}`;
  if (!/^https:\/\//i.test(url)) return null;
  return url.length <= 256 ? url : null;
}

export function useDiscordPresence({ enabled, track, isPlaying, audioRef }) {
  const lastKeyRef = useRef(null);
  const key = track ? track.id : null;
  const shareable = !!enabled && !!track && track.source !== "local";

  useEffect(() => {
    const trackChanged = lastKeyRef.current !== key;
    lastKeyRef.current = key;

    if (!shareable || !isPlaying) {
      clearPresence();
      return undefined;
    }

    const audio = audioRef?.current;
    if (!audio) return undefined;

    const push = () => {
      if (audio.paused || audio.readyState < 2) return;
      const dur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number(track.duration) || 0;
      active = true;
      post("/presence", {
        id: String(track.id),
        title: track.title || "",
        artist: track.artist?.name || (typeof track.artist === "string" ? track.artist : "") || "",
        album: typeof track.album === "string" ? track.album : track.album?.title || "",
        cover: publicCover(track.cover),
        position: audio.currentTime || 0,
        duration: dur,
      });
    };

    const events = ["playing", "seeked", "durationchange"];
    events.forEach((ev) => audio.addEventListener(ev, push));
    if (!trackChanged) push();
    const fallback = setTimeout(push, 2500);
    const heartbeat = setInterval(push, 10000);

    return () => {
      clearTimeout(fallback);
      clearInterval(heartbeat);
      events.forEach((ev) => audio.removeEventListener(ev, push));
    };
  }, [shareable, isPlaying, key]);

  useEffect(() => {
    if (!enabled) { clearPresence(); return undefined; }
    const onHide = () => clearPresence(true);
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [enabled]);
}