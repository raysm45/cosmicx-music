import { useState, useEffect, useRef } from "react";
import { hashStr } from "./utils.js";
import { Api } from "./api.js";

export const TENDRIL_PATH =
  "M17.15,16.06 C17.4,16.09 17.75,16.25 17.86,16.33 C18.07,16.51 18.26,16.72 18.41,16.98 " +
  "C18.54,17.27 18.62,17.58 18.66,17.92 C18.66,18.27 18.61,18.63 18.5,19 " +
  "C18.35,19.36 18.13,19.71 17.86,20.04 C17.55,20.35 17.19,20.62 16.78,20.85 " +
  "C16.33,21.04 15.86,21.18 15.34,21.25 C14.82,21.27 14.28,21.23 13.74,21.1 " +
  "C13.19,20.93 12.67,20.68 12.17,20.35 C11.7,19.98 11.27,19.53 10.9,19.02 " +
  "C10.57,18.47 10.31,17.87 10.13,17.22 C10.01,16.55 9.99,15.86 10.06,15.15 " +
  "C10.19,14.44 10.43,13.75 10.76,13.07 C11.16,12.42 11.65,11.82 12.23,11.27 " +
  "C12.87,10.77 13.58,10.35 14.35,10.02 C15.17,9.75 16.02,9.59 16.91,9.54 " +
  "C17.81,9.56 18.7,9.71 19.59,9.97 C20.47,10.31 21.29,10.77 22.07,11.34 " +
  "C22.79,11.98 23.43,12.72 23.98,13.55 C24.46,14.43 24.82,15.38 25.05,16.38 " +
  "C25.2,17.41 25.2,18.45 25.07,19.51 C24.83,20.57 24.46,21.59 23.94,22.57 " +
  "C23.34,23.52 22.6,24.38 21.74,25.16 C20.81,25.87 19.79,26.45 18.67,26.91 " +
  "C17.51,27.27 16.31,27.49 15.06,27.55 C13.8,27.5 12.56,27.29 11.33,26.91 " +
  "C10.12,26.43 8.99,25.8 7.94,25.01 C6.95,24.13 6.08,23.13 5.34,22.01 " +
  "C4.69,20.81 4.21,19.55 3.9,18.2 C3.71,16.83 3.7,15.44 3.87,14.04";

export const STAR_PATH =
  "M16 2 C16 10 10 16 2 16 C10 16 16 22 16 30 C16 22 22 16 30 16 C22 16 16 10 16 2 Z";

export function StarMark({ size = 22, color = "currentColor", className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <path d={STAR_PATH} fill={color} />
    </svg>
  );
}

export function TendrilSpinner({ size = 28, color = "currentColor", spin = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={spin ? "aivy-spin" : ""} aria-hidden="true" focusable="false">
      <path d={TENDRIL_PATH} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeDasharray="86" strokeDashoffset="0" />
    </svg>
  );
}

export function StarLoader({ size = 48, color = "var(--accent-strong)", label }) {
  const stars = [
    { x: 3, y: 5, delay: "0s", scale: 0.36 },
    { x: 16, y: 2, delay: "-0.45s", scale: 0.52 },
    { x: 9, y: 17, delay: "-0.9s", scale: 0.42 },
  ];
  return (
    <div className="aivy-starloader" style={{ width: size, height: size }} role="status" aria-label={label || "Memuat"}>
      <svg viewBox="0 0 32 32" width={size} height={size} style={{ overflow: "visible" }} aria-hidden="true" focusable="false">
        {stars.map((s, i) => (
          <g key={i} className="aivy-twinkle" style={{ animationDelay: s.delay }}>
            <path d={STAR_PATH} fill={color} transform={`translate(${s.x},${s.y}) scale(${s.scale})`} />
          </g>
        ))}
      </svg>
    </div>
  );
}

const DUOTONES = [
  ["#2E2E2E", "#B8B8B8"], ["#242424", "#9C9C9C"], ["#363636", "#C7C7C7"],
  ["#2A2A2A", "#D6D6D6"], ["#202020", "#A6A6A6"], ["#333333", "#BEBEBE"],
  ["#272727", "#AEAEAE"],
];

export function CoverArt({ seed, size = 160, radius = 14, style = {} }) {
  const h = hashStr(String(seed));
  const [bg, fg] = DUOTONES[h % DUOTONES.length];
  const variant = h % 4;
  const rot = (h % 7) * 11 - 33;
  const scale = 0.82 + ((h >> 3) % 5) * 0.09;
  const tx = 16 + ((h >> 6) % 5) * 3;
  const ty = 15 + ((h >> 9) % 5) * 3;

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ borderRadius: radius, display: "block", ...style }} aria-hidden="true" focusable="false">
      <rect width="32" height="32" fill={bg} />
      {variant === 0 && (
        <g transform={`translate(${tx},${ty}) rotate(${rot}) scale(${scale})`} transformOrigin="16 16">
          <path d={STAR_PATH} fill={fg} opacity="0.92" transform="translate(-16,-16)" />
        </g>
      )}
      {variant === 1 && (
        <g stroke={fg} strokeWidth="1.4" fill="none" opacity="0.85">
          <path d={TENDRIL_PATH} transform={`rotate(${rot} 16 16) scale(${scale})`} transformOrigin="16 16" />
        </g>
      )}
      {variant === 2 && (
        <g fill={fg} opacity="0.9">
          <g transform={`translate(${tx - 9},${ty - 6}) rotate(${rot}) scale(${scale * 0.6})`} transformOrigin="16 16">
            <path d={STAR_PATH} transform="translate(-16,-16)" />
          </g>
          <g transform={`translate(${tx + 6},${ty + 7}) rotate(${rot + 40}) scale(${scale * 0.42})`} transformOrigin="16 16">
            <path d={STAR_PATH} transform="translate(-16,-16)" />
          </g>
        </g>
      )}
      {variant === 3 && (
        <g stroke={fg} strokeWidth="2.4" strokeLinecap="round" opacity="0.8">
          <path d={`M-4,${8 + (h % 6)} C10,${2 + (h % 8)} 22,${20 - (h % 8)} 36,${10 + (h % 6)}`} fill="none" />
          <path d={`M-4,${20 + (h % 5)} C10,${26 - (h % 6)} 22,${8 + (h % 6)} 36,${22 - (h % 5)}`} fill="none" opacity="0.5" />
        </g>
      )}
    </svg>
  );
}

export function SmartCover({ src, seed, size = 160, radius = 14, style = {}, alt = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) return <CoverArt seed={seed} size={size} radius={radius} style={style} />;
  return (
    <img
      src={src} alt={alt} width={size} height={size} loading="lazy"
      style={{ borderRadius: radius, objectFit: "cover", display: "block", background: "var(--bg-elev-2)", ...style }}
      onError={() => setFailed(true)}
    />
  );
}

const ARTWORK_CACHE_KEY = "aivy_cache_artwork_v1";
const ARTWORK_CACHE_TTL = 1000 * 60 * 60 * 12;

const artworkMemCache = new Map();
const artworkInFlight = new Map();

function loadPersistedArtwork() {
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(ARTWORK_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    const now = Date.now();
    for (const [key, entry] of Object.entries(parsed)) {
      if (entry && entry.at && now - entry.at < ARTWORK_CACHE_TTL) {
        artworkMemCache.set(key, entry.data);
      }
    }
  } catch {  }
}
loadPersistedArtwork();

let persistTimer = null;
function persistArtworkCache() {
  if (typeof sessionStorage === "undefined") return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const now = Date.now();
      const out = {};

      const entries = [...artworkMemCache.entries()].slice(-60);
      for (const [key, data] of entries) out[key] = { at: now, data };
      sessionStorage.setItem(ARTWORK_CACHE_KEY, JSON.stringify(out));
    } catch {  }
  }, 800);
}

function artworkKey(song, artist) {
  return `${song}::${artist || ""}`.toLowerCase();
}

function requestArtwork(song, artist, forceReload, reloadToken) {
  const key = artworkKey(song, artist);
  const inFlightKey = forceReload ? `${key}::reload:${reloadToken}` : key;
  let pending = artworkInFlight.get(inFlightKey);
  if (!pending) {
    pending = Api.animatedArtwork(song, artist, forceReload).finally(() => {
      artworkInFlight.delete(inFlightKey);
    });
    artworkInFlight.set(inFlightKey, pending);
  }
  return pending;
}

function pickVideoSrc(artwork) {
  if (!artwork) return null;

  const animated = artwork.animated || null;
  const video = artwork.video || null;
  if (animated && /\.m3u8(\?|$)/i.test(animated)) return animated;
  return video || animated;
}

export function prefetchAnimatedArtwork(song, artist) {
  if (!song) return;
  const key = artworkKey(song, artist);
  if (artworkMemCache.has(key) || artworkInFlight.has(key)) return;
  requestArtwork(song, artist, false, 0)
    .then((data) => {
      if (!data) return;
      artworkMemCache.set(key, data);
      persistArtworkCache();
      const src = pickVideoSrc(data);

      if (src && typeof document !== "undefined" && !/\.m3u8(\?|$)/i.test(src)) {
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.as = "video";
        link.href = src;
        document.head.appendChild(link);
        setTimeout(() => link.remove(), 30000);
      }
    })
    .catch(() => {});
}

const supportsNativeHls = () => {
  if (typeof document === "undefined") return false;
  try {
    const v = document.createElement("video");
    if (!v.canPlayType) return false;
    // Some Android browsers/WebViews return "maybe" for this MIME type without
    // actually being able to play HLS, which used to make us skip hls.js and
    // hand them a raw .m3u8 URL (fails with MEDIA_ERR_SRC_NOT_SUPPORTED).
    // Only trust "probably" (what Safari/iOS reports) as real native support.
    return v.canPlayType("application/vnd.apple.mpegurl") === "probably";
  } catch { return false; }
};
let hlsModulePromise = null;
function loadHlsJs() {
  if (!hlsModulePromise) {
    hlsModulePromise = import("hls.js").then((m) => m.default || m);
  }
  return hlsModulePromise;
}

function useHlsSource(videoEl, src, isM3u8, onError) {
  useEffect(() => {
    if (!videoEl || !src) return undefined;
    if (!isM3u8 || supportsNativeHls()) {
      console.log("[animatedArtwork] playing via native <video> src", { isM3u8, native: supportsNativeHls(), src });
      videoEl.src = src;
      videoEl.load();
      return () => { videoEl.removeAttribute("src"); videoEl.load(); };
    }

    let hls;
    let cancelled = false;
    loadHlsJs().then((Hls) => {
      if (cancelled) return;
      if (!Hls.isSupported()) {
        console.warn("[animatedArtwork] hls.js loaded but Hls.isSupported() is false, falling back to native src", { src });
        videoEl.src = src; videoEl.load(); return;
      }
      console.log("[animatedArtwork] playing via hls.js", { src });
      hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 30,
        lowLatencyMode: false,
        startFragPrefetch: true,
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error("[animatedArtwork] hls.js error", { src, fatal: data?.fatal, type: data?.type, details: data?.details });
        if (data?.fatal) onError?.(data);
      });
      hls.loadSource(src);
      hls.attachMedia(videoEl);
    }).catch((err) => {
      console.error("[animatedArtwork] failed to load hls.js, falling back to native video src", err);
      if (!cancelled) { videoEl.src = src; videoEl.load(); }
    });

    return () => { cancelled = true; hls?.destroy(); };
  }, [videoEl, src, isM3u8, onError]);
}

function useAnimatedArtwork(song, artist, enabled, reloadToken = 0, onReloadResult) {
  const [artwork, setArtwork] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | found | notfound | error
  const lastAppliedReload = useRef(reloadToken);
  const onReloadResultRef = useRef(onReloadResult);
  onReloadResultRef.current = onReloadResult;

  useEffect(() => {
    const forceReload = reloadToken !== lastAppliedReload.current;
    lastAppliedReload.current = reloadToken;

    if (!enabled || !song) {
      setArtwork(null);
      setStatus("idle");
      if (forceReload) onReloadResultRef.current?.("error");
      return undefined;
    }

    const key = artworkKey(song, artist);
    if (forceReload) artworkMemCache.delete(key);
    const hit = !forceReload ? artworkMemCache.get(key) : null;
    if (hit) {
      setArtwork(hit);
      setStatus(hit.video || hit.animated ? "found" : "notfound");
      return undefined;
    }

    setArtwork(null);
    setStatus("loading");

    let alive = true;
    requestArtwork(song, artist, forceReload, reloadToken)
      .then((data) => {
        const hasAnimation = !!(data && (data.video || data.animated));
        if (data) {
          artworkMemCache.set(key, data);
          persistArtworkCache();
          if (alive) setArtwork(data);
        }
        if (alive) setStatus(hasAnimation ? "found" : "notfound");
        if (forceReload) onReloadResultRef.current?.(hasAnimation ? "success" : "not_found");
      })
      .catch((err) => {
        console.error("[animatedArtwork] failed to fetch artwork for", song, artist, err);
        if (alive) setStatus("error");
        if (forceReload) onReloadResultRef.current?.(err?.status === 429 ? "rate_limited" : "error");
      });
    return () => { alive = false; };
  }, [song, artist, enabled, reloadToken]);
  return { artwork, status };
}
export function AnimatedCover({
  src, seed, size = 160, radius = 14, style = {}, alt = "",
  song, artist, animated = false, reduceMotion = false, onColor, reloadToken = 0, onReloadResult,
  // Saat `active` false, video di-pause dan tidak di-decode (kontennya tetap
  // ter-fetch/ter-buffer di background biar instan pas active jadi true
  // lagi). Dipakai supaya cover video di sheet yang sedang tertutup/off-screen
  // tidak terus-terusan decode dan berebut GPU/CPU dengan animasi buka-tutup.
  // Default true supaya semua pemanggilan lama tidak berubah perilakunya.
  active = true,
}) {
  const [videoReady, setVideoReady] = useState(false);
  const [videoEl, setVideoEl] = useState(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [errorDetail, setErrorDetail] = useState("");
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const { artwork, status } = useAnimatedArtwork(song, artist, animated && !reduceMotion, reloadToken, onReloadResult);
  const onColorRef = useRef(onColor);
  onColorRef.current = onColor;

  const videoSrc = pickVideoSrc(artwork);
  const isM3u8 = !!videoSrc && /\.m3u8(\?|$)/i.test(videoSrc);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => { setVideoReady(false); setPlaybackFailed(false); setErrorDetail(""); setShowErrorDetail(false); }, [videoSrc]);
  useEffect(() => {
    if (artwork?.color?.css) onColorRef.current?.(artwork.color.css);
  }, [artwork?.color?.css]);

  const handleHlsFatalError = useRef((data) => {
    setPlaybackFailed(true);
    setErrorDetail(`hls: ${data?.type || "?"} / ${data?.details || "?"}`);
  }).current;
  useHlsSource(videoEl, videoSrc, isM3u8, handleHlsFatalError);

  useEffect(() => {
    if (!videoEl || !videoSrc) return undefined;
    let cancelled = false;
    const tryPlay = () => {
      if (cancelled || !activeRef.current) return;
      const p = videoEl.play?.();
      if (p && typeof p.catch === "function") {
        p.catch((err) => {
          console.error("[animatedArtwork] video.play() rejected", { song, artist }, err);
          setPlaybackFailed(true);
          setErrorDetail(`play() ditolak: ${err?.name || ""} ${err?.message || err}`);
        });
      }
    };
    const onReady = () => { setVideoReady(true); tryPlay(); };
    const MEDIA_ERROR_LABELS = { 1: "dibatalkan", 2: "gagal jaringan", 3: "gagal decode/format", 4: "format/URL tidak didukung" };
    const onError = () => {
      const mediaError = videoEl.error;
      const label = MEDIA_ERROR_LABELS[mediaError?.code] || "unknown";
      console.error("[animatedArtwork] <video> failed to load/play", {
        song, artist, videoSrc, isM3u8,
        code: mediaError?.code, message: mediaError?.message,
      });
      setPlaybackFailed(true);
      setErrorDetail(`video error ${mediaError?.code ?? "?"} (${label}): ${videoSrc}`);
    };
    videoEl.addEventListener("loadeddata", onReady);
    videoEl.addEventListener("canplay", onReady);
    videoEl.addEventListener("stalled", tryPlay);
    videoEl.addEventListener("error", onError);

    const onVisible = () => { if (!document.hidden) tryPlay(); };
    document.addEventListener("visibilitychange", onVisible);
    if (videoEl.readyState >= 2 && activeRef.current) onReady();
    return () => {
      cancelled = true;
      videoEl.removeEventListener("loadeddata", onReady);
      videoEl.removeEventListener("canplay", onReady);
      videoEl.removeEventListener("stalled", tryPlay);
      videoEl.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [videoEl, videoSrc, isM3u8, song, artist, src]);

  // Pause/resume berdasarkan `active`, terlepas dari efek setup di atas
  // (yang sengaja tidak dependen ke `active` supaya listener tidak
  // dipasang-lepas ulang tiap kali sheet dibuka/ditutup).
  useEffect(() => {
    const v = videoEl;
    if (!v) return;
    if (active) {
      if (v.paused) {
        const p = v.play?.();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
    } else if (!v.paused) {
      v.pause();
    }
  }, [active, videoEl]);

  return (
    <div
      className="aivy-animated-cover"
      style={{ position: "relative", overflow: "hidden", borderRadius: radius, ...style }}
    >
      <SmartCover
        src={src} seed={seed} size={size} radius={radius} alt={alt}
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
      />
      {animated && !reduceMotion && (status === "loading" || (videoSrc && !videoReady && !playbackFailed)) && (
        <div className="aivy-animated-cover-loading" aria-hidden="true">
          <span className="dot" /><span className="dot" /><span className="dot" />
        </div>
      )}
      {playbackFailed && (
        <button
          type="button"
          className="aivy-animated-cover-loading is-error"
          onClick={(e) => { e.stopPropagation(); setShowErrorDetail((v) => !v); }}
          title={errorDetail}
        >!</button>
      )}
      {playbackFailed && showErrorDetail && (
        <div className="aivy-animated-cover-errbox" onClick={(e) => e.stopPropagation()}>
          {errorDetail || "Video animasi gagal diputar (tidak ada detail error)."}
        </div>
      )}
      {videoSrc && !playbackFailed && (
        <video
          key={videoSrc}
          ref={setVideoEl}
          muted
          loop
          playsInline
          autoPlay={active}
          preload="auto"
          poster={src || undefined}
          disablePictureInPicture
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", opacity: videoReady ? 1 : 0,
            transition: "opacity 460ms ease",
          }}
        />
      )}
    </div>
  );
  }