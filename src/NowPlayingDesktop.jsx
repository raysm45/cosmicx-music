import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Heart, MoreHorizontal,
  ChevronRight, Infinity as InfinityIcon,
  AudioLines, Plus, Trash2, Globe, Languages,
} from "lucide-react";
import { usePlayer, usePlayerTime, useUI } from "./context.jsx";
import { useRouter } from "./router.jsx";
import { AnimatedCover } from "./lib/brand.jsx";
import { formatTime, cleanTrackTitleForLyrics, hashStr } from "./lib/utils.js";
import { lyricPhase } from "./lib/presenceLyrics.js";
import { applyLiquidFilter, supportsRefraction } from "./lib/liquidGlass.js";
import { LiquidFilter } from "./lib/LiquidFilter.jsx";
import { FluidBackground } from "./lib/FluidBackground.jsx";
import {
  Scrubber, VolumeControl, MarqueeText, AppleLyricsPane, normLyricsFontSize,
  QueueUpNextList, QueueTrackMeta, AboutArtistSection, useScrubberBinding,
  useTrackAudioInfo, useTrackMenuItems, GlassLayers,
} from "./components.jsx";
import { AudioOutputSheet, AudioPipelineCard, LyricsProviderSheet, NPD_LYRICS_ID } from "./NpdSheets.jsx";
import { unifyAudioInfoFields } from "./lib/audioFormat.js";
import "./styles/nowplaying-desktop.css";

const COVER_STYLE = { width: "100%", height: "100%" };
const LYRICS_ID = NPD_LYRICS_ID;
const LYRICS_SHADOW_CSS = ".lyrics-header{display:none!important}.lyrics-footer .footer-content{display:none!important}";
const FALLBACK_LANGS = [
  { code: "en", label: "English" },
  { code: "id", label: "Indonesia" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh-CN", label: "中文 (简体)" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
];

function IconLyrics({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <mask id="npd-lyrics-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" />
        <circle cx="9.2" cy="9.6" r="1.55" fill="#000" />
        <circle cx="14.6" cy="9.6" r="1.55" fill="#000" />
        <path d="M10.7 9.9c0 1.9-.9 3.1-2.5 3.6M16.1 9.9c0 1.9-.9 3.1-2.5 3.6" fill="none" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
      </mask>
      <path
        mask="url(#npd-lyrics-mask)" fill="currentColor"
        d="M7 2.8h10a5 5 0 0 1 5 5v5.4a5 5 0 0 1-5 5h-5.6l-3.9 3.1a.9.9 0 0 1-1.5-.7V18.2H7a5 5 0 0 1-5-5V7.8a5 5 0 0 1 5-5z"
      />
    </svg>
  );
}

function IconHeadphones({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <rect x="3" y="13.6" width="5" height="7.6" rx="2.4" fill="currentColor" />
      <rect x="16" y="13.6" width="5" height="7.6" rx="2.4" fill="currentColor" />
    </svg>
  );
}

function IconPerson({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <circle cx="12" cy="7.8" r="4.3" />
      <path d="M3.8 20.2c0-4.1 3.7-6.5 8.2-6.5s8.2 2.4 8.2 6.5c0 .6-.4 1-1 1H4.8c-.6 0-1-.4-1-1z" />
    </svg>
  );
}

function IconQueue({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <circle cx="4.5" cy="6" r="1.7" />
        <circle cx="4.5" cy="12" r="1.7" />
        <circle cx="4.5" cy="18" r="1.7" />
      </g>
      <path d="M9.2 6h11.3M9.2 12h11.3M9.2 18h11.3" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

function IconMusicNote({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}

export function NowPlayingDesktop({ open, onClose }) {
  const [mounted, setMounted] = useState(!!open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setShown(true)); });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }
    setShown(false);
    const id = setTimeout(() => setMounted(false), 420);
    return () => clearTimeout(id);
  }, [open]);

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(<FullPlayer shown={shown} onClose={onClose} />, document.body);
}

const NO_DRAG_SELECTOR = "button, a, input, select, textarea, label, [role='slider'], .aivy-scrubber, .aivy-vol, am-lyrics, .npd-lyrics, .npd-queue-scroll, .npd-artist-pane, .npd-sheet-layer";
const DRAG_CLOSE_DISTANCE = 120;
const DRAG_CLOSE_VELOCITY = 0.55;

function useDragToClose(rootRef, onClose) {
  const st = useRef({ id: null, startX: 0, startY: 0, dy: 0, vy: 0, lastY: 0, lastT: 0, dragging: false });
  const justDragged = useRef(false);
  const settleTimer = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const paint = (dy) => {
    const el = rootRef.current;
    if (!el) return;
    const vh = window.innerHeight || 800;
    const p = Math.min(1, dy / vh);
    el.style.transform = `translate3d(0, ${dy}px, 0) scale(${1 - p * 0.08})`;
    el.style.opacity = String(1 - p * 0.55);
    el.style.borderRadius = `${Math.min(28, dy / 5)}px`;
  };

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target;
    if (target && target.closest && target.closest(NO_DRAG_SELECTOR) && !target.closest(".npd-grabber")) return;
    const el = rootRef.current;
    if (el) { clearTimeout(settleTimer.current); el.style.transition = ""; }
    st.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, dy: 0, vy: 0, lastY: e.clientY, lastT: performance.now(), dragging: false };
  }, [rootRef]);

  const onPointerMove = useCallback((e) => {
    const s = st.current;
    if (s.id !== e.pointerId) return;
    const el = rootRef.current;
    if (!el) return;
    const rawY = e.clientY - s.startY;
    if (!s.dragging) {
      const rawX = e.clientX - s.startX;
      if (rawY < -8 || (Math.abs(rawX) > Math.abs(rawY) + 6 && Math.abs(rawX) > 10)) { s.id = null; return; }
      if (rawY < 8) return;
      s.dragging = true;
      el.style.transition = "none";
      el.style.willChange = "transform, opacity";
      el.classList.add("is-dragging");
      try { el.setPointerCapture(e.pointerId); } catch {}
    }
    const now = performance.now();
    const dt = Math.max(1, now - s.lastT);
    s.vy = s.vy * 0.6 + ((e.clientY - s.lastY) / dt) * 0.4;
    s.lastY = e.clientY;
    s.lastT = now;
    s.dy = Math.max(0, rawY);
    paint(s.dy);
  }, [rootRef]);

  const finish = useCallback((e, cancelled) => {
    const s = st.current;
    if (s.id !== e.pointerId) return;
    const el = rootRef.current;
    const wasDragging = s.dragging;
    st.current = { ...s, id: null, dragging: false };
    if (!el || !wasDragging) return;
    try { el.releasePointerCapture(e.pointerId); } catch {}
    el.classList.remove("is-dragging");
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 120);

    const commit = !cancelled && (s.dy > DRAG_CLOSE_DISTANCE || (s.vy > DRAG_CLOSE_VELOCITY && s.dy > 30));
    if (commit) {
      el.style.transition = "transform .36s cubic-bezier(.4,0,.2,1), opacity .3s ease, border-radius .3s ease";
      el.style.transform = `translate3d(0, ${window.innerHeight || 800}px, 0) scale(.92)`;
      el.style.opacity = "0";
      closeRef.current();
      return;
    }
    el.style.transition = "transform .5s cubic-bezier(.22,1,.36,1), opacity .35s ease, border-radius .35s ease";
    el.style.transform = "";
    el.style.opacity = "";
    el.style.borderRadius = "";
    settleTimer.current = setTimeout(() => {
      if (!rootRef.current) return;
      rootRef.current.style.transition = "";
      rootRef.current.style.willChange = "";
    }, 560);
  }, [rootRef]);

  const onPointerUp = useCallback((e) => finish(e, false), [finish]);
  const onPointerCancel = useCallback((e) => finish(e, true), [finish]);
  const onClickCapture = useCallback((e) => {
    if (justDragged.current) { e.stopPropagation(); e.preventDefault(); }
  }, []);
  const onDragStart = useCallback((e) => e.preventDefault(), []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture, onDragStart };
}

const SWIPE_COMMIT_RATIO = 0.22;
const SWIPE_COMMIT_VELOCITY = 0.5;

function useCoverSwipe({ onNext, onPrev, disabled }) {
  const ref = useRef(null);
  const st = useRef(null);
  const timers = useRef([]);
  const cb = useRef({ onNext, onPrev, disabled });
  cb.current = { onNext, onPrev, disabled };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const onPointerDown = useCallback((e) => {
    if (cb.current.disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    el.style.transition = "";
    st.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, vx: 0, lastX: e.clientX, lastT: performance.now(), active: false };
  }, []);

  const onPointerMove = useCallback((e) => {
    const s = st.current;
    const el = ref.current;
    if (!s || s.id !== e.pointerId || !el) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { st.current = null; return; }
      if (Math.abs(dx) < 8) return;
      s.active = true;
      el.style.transition = "none";
      el.classList.add("is-swiping");
      try { el.setPointerCapture(e.pointerId); } catch {}
    }
    const now = performance.now();
    const dt = Math.max(1, now - s.lastT);
    s.vx = s.vx * 0.6 + ((e.clientX - s.lastX) / dt) * 0.4;
    s.lastX = e.clientX;
    s.lastT = now;
    s.dx = dx;
    const w = el.offsetWidth || 400;
    const p = Math.min(1, Math.abs(dx) / w);
    el.style.transform = `translate3d(${dx}px, 0, 0) rotate(${(dx / w) * 6}deg) scale(${1 - p * 0.06})`;
    el.style.opacity = String(1 - p * 0.5);
  }, []);

  const finish = useCallback((e, cancelled) => {
    const s = st.current;
    const el = ref.current;
    if (!s || s.id !== e.pointerId) return;
    st.current = null;
    if (!el || !s.active) return;
    try { el.releasePointerCapture(e.pointerId); } catch {}
    el.classList.remove("is-swiping");

    const w = el.offsetWidth || 400;
    const commit = !cancelled && cb.current.disabled !== true &&
      (Math.abs(s.dx) > w * SWIPE_COMMIT_RATIO || (Math.abs(s.vx) > SWIPE_COMMIT_VELOCITY && Math.abs(s.dx) > 30));

    if (!commit) {
      el.style.transition = "transform .45s cubic-bezier(.22,1,.36,1), opacity .3s ease";
      el.style.transform = "";
      el.style.opacity = "";
      return;
    }

    const dir = s.dx < 0 ? -1 : 1;
    el.style.transition = "transform .2s ease-in, opacity .2s ease-in";
    el.style.transform = `translate3d(${dir * w * 0.9}px, 0, 0) rotate(${dir * 8}deg) scale(.9)`;
    el.style.opacity = "0";
    timers.current.push(setTimeout(() => {
      if (dir < 0) cb.current.onNext(); else cb.current.onPrev();
      if (!ref.current) return;
      el.style.transition = "none";
      el.style.transform = `translate3d(${-dir * w * 0.5}px, 0, 0) scale(.92)`;
      el.style.opacity = "0";
      void el.offsetWidth;
      el.style.transition = "transform .5s cubic-bezier(.22,.9,.32,1), opacity .4s ease";
      el.style.transform = "";
      el.style.opacity = "";
    }, 200));
  }, []);

  return {
    ref,
    onPointerDown, onPointerMove,
    onPointerUp: (e) => finish(e, false),
    onPointerCancel: (e) => finish(e, true),
  };
}

/* ---------- transisi panel kanan (Now Playing <-> Lirik / Antrean / Artis) ---------- */
const PANE_ORDER = { controls: 0, lyrics: 1, artist: 1, queue: 2 };
const PANE_EXIT_MS = 280;

// Panel lama tetap ter-mount selama animasi keluar (class is-leaving) sementara panel baru
// masuk dari arah yang sama dengan urutan tombol di dock. Reduced motion = ganti langsung.
function usePaneTransition(view, reduce) {
  const [st, setSt] = useState({ cur: view, leaving: [], dir: 1 });
  if (st.cur !== view) {
    const leaving = reduce ? [] : [...st.leaving.filter((v) => v !== view), st.cur];
    setSt({ cur: view, leaving, dir: PANE_ORDER[view] >= PANE_ORDER[st.cur] ? 1 : -1 });
  }
  const hasLeaving = st.leaving.length > 0;
  useEffect(() => {
    if (!hasLeaving) return undefined;
    const id = setTimeout(() => setSt((p) => (p.leaving.length ? { ...p, leaving: [] } : p)), PANE_EXIT_MS + 60);
    return () => clearTimeout(id);
  }, [hasLeaving, st.cur]);
  return { leaving: st.leaving, dir: st.dir };
}

const NPD_LG_SURFACES = [
  [".npd-round", "npd-lg-round", 44, 44],
  [".npd-seg", "npd-lg-seg", 130, 44],
  [".npd-chip", "npd-lg-chip", 34, 34],
];

const NpdGlassDefs = React.memo(function NpdGlassDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }} aria-hidden="true" focusable="false">
      <defs>
        {NPD_LG_SURFACES.map(([, id]) => <LiquidFilter key={id} id={id} />)}
      </defs>
    </svg>
  );
});

function useNpdGlass(rootRef, enabled, hasTrack, queueMode) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !hasTrack || !root) { setReady(false); return undefined; }
    let raf = 0;
    const regen = () => {
      raf = 0;
      let ok = false;
      for (const [sel, id, fw, fh] of NPD_LG_SURFACES) {
        const flt = root.querySelector(`#${id}`);
        if (!flt) continue;
        const el = root.querySelector(sel);
        const w = (el && el.offsetWidth) || fw;
        const h = (el && el.offsetHeight) || fh;
        applyLiquidFilter(flt, w, h);
        ok = true;
      }
      if (ok) setReady(true);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(regen); };
    schedule();
    const seg = root.querySelector(".npd-seg");
    const ro = typeof ResizeObserver !== "undefined" && seg ? new ResizeObserver(schedule) : null;
    if (ro) ro.observe(seg);
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [rootRef, enabled, hasTrack, queueMode]);
  return ready;
}

function FullPlayer({ shown, onClose }) {
  const { currentTrack, currentTrackHasLyrics, shuffle, toggleShuffle, repeat, cycleRepeat, room, isPlaying, next, prev } = usePlayer();
  const { settings, updateSettings, t, authUser } = useUI();
  const [view, setView] = useState("controls");
  const [outputOpen, setOutputOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(false);
  const [lyricsReady, setLyricsReady] = useState(true);
  const rootRef = useRef(null);
  const drag = useDragToClose(rootRef, onClose);
  const swipeLocked = !!(room && room.hostOnlyControl && authUser && room.hostId !== authUser.id);
  const swipe = useCoverSwipe({ onNext: () => next(false), onPrev: prev, disabled: swipeLocked });
  const refract = settings.liquidGlass !== false && supportsRefraction();
  const lgReady = useNpdGlass(rootRef, refract, !!currentTrack, view === "queue");

  useEffect(() => {
    if (!shown || !rootRef.current) return;
    const st = rootRef.current.style;
    st.transform = ""; st.opacity = ""; st.transition = ""; st.borderRadius = ""; st.willChange = "";
  }, [shown]);

  const tx = useCallback((idText, enText) => (settings.language === "en" ? enText : idText), [settings.language]);
  const reduceMotion = !!settings.reducedMotion || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const lyricsDisabled = !currentTrack || !currentTrackHasLyrics;
  const pane = usePaneTransition(view, reduceMotion);
  const autoplayOn = settings.autoplay !== false;
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (e.target && e.target.tagName === "SELECT") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => { if (!currentTrack) onClose(); }, [currentTrack, onClose]);
  useEffect(() => { if (view === "lyrics") setLyricsReady(true); }, [view]);
  useEffect(() => { if (view === "lyrics" && lyricsDisabled) setView("controls"); }, [view, lyricsDisabled]);
  useEffect(() => { if (rootRef.current) rootRef.current.focus({ preventScroll: true }); }, []);

  const cover = useMemo(() => (
    <AnimatedCover
      src={currentTrack?.cover} seed={(currentTrack?.id || "") + (currentTrack?.title || "")} size={520} radius={8}
      style={COVER_STYLE} song={currentTrack?.title} artist={currentTrack?.artist?.name}
      animated={!!settings.animatedArtwork} reduceMotion={reduceMotion} active={shown}
    />
  ), [currentTrack?.cover, currentTrack?.id, currentTrack?.title, currentTrack?.artist?.name, settings.animatedArtwork, reduceMotion, shown]);

  if (!currentTrack) return null;

  const toggleView = (v) => setView((cur) => (cur === v ? "controls" : v));
  const openLyricsAtLine = () => {
    setView("lyrics");
    setTimeout(() => {
      const el = document.getElementById(LYRICS_ID);
      if (el && typeof el.resumeAutoScroll === "function") el.resumeAutoScroll();
    }, 140);
  };
  const queueMode = view === "queue";

  return (
    <div
      ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("nowPlaying")}
      className={`npd ${shown ? "shown" : ""} ${reduceMotion ? "reduce" : ""} ${refract && lgReady ? "lg-ready" : ""}`}
      onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel} onClickCapture={drag.onClickCapture} onDragStart={drag.onDragStart}
    >
      {settings.coverBackground !== false && currentTrack.cover && (
        <FluidBackground src={currentTrack.cover} active={shown} playing={isPlaying} still={reduceMotion} />
      )}
      <div className="npd-scrim" aria-hidden="true" />
      {refract && <NpdGlassDefs />}

      <button type="button" className="npd-grabber" onClick={onClose} aria-label={t("close")} title={t("close")}><span /></button>

      <div className="npd-stage">
        <div className="npd-left">
          <div
            ref={swipe.ref} className={`npd-cover-swipe ${swipeLocked ? "is-locked" : ""}`}
            onPointerDown={swipe.onPointerDown} onPointerMove={swipe.onPointerMove}
            onPointerUp={swipe.onPointerUp} onPointerCancel={swipe.onPointerCancel}
          >
            <div className={`npd-cover ${isPlaying ? "" : "is-paused"}`}>
              {cover}
              <QualityLine track={currentTrack} visible={view === "controls"} />
            </div>
          </div>

          <div className="npd-dock">
            <button
              type="button" className={`npd-round ${view === "lyrics" ? "active" : ""}`}
              onClick={() => toggleView("lyrics")} disabled={lyricsDisabled} aria-pressed={view === "lyrics"}
              aria-label={t("lyrics")} title={lyricsDisabled ? t("lyricsUnavailable") : t("lyrics")}
            >
              <GlassLayers />
              <IconLyrics />
            </button>

            <div className="npd-seg" role="group">
              <GlassLayers />
              {queueMode ? (
                <React.Fragment key="seg-queue">
                  <button type="button" className={shuffle ? "active" : ""} onClick={toggleShuffle} disabled={!!room} aria-pressed={shuffle} aria-label={t("shuffle")} title={t("shuffle")}>
                    <Shuffle size={19} />
                  </button>
                  <button type="button" className={repeat !== "off" ? "active" : ""} onClick={cycleRepeat} disabled={!!room} aria-pressed={repeat !== "off"} aria-label={t("repeat")} title={t("repeat")}>
                    <RepeatIcon size={19} />
                  </button>
                  <button type="button" className={autoplayOn ? "active" : ""} onClick={() => updateSettings({ autoplay: !autoplayOn })} aria-pressed={autoplayOn} aria-label="AutoPlay" title="AutoPlay">
                    <InfinityIcon size={21} />
                  </button>
                </React.Fragment>
              ) : (
                <React.Fragment key="seg-default">
                  <button
                    type="button" className={outputOpen ? "active" : ""} onClick={() => setOutputOpen(true)} aria-pressed={outputOpen} aria-haspopup="dialog"
                    aria-label={tx("Output audio", "Audio output")} title={tx("Output audio", "Audio output")}
                  >
                    <IconHeadphones />
                  </button>
                  <button
                    type="button" className={view === "artist" ? "active" : ""} onClick={() => toggleView("artist")} aria-pressed={view === "artist"}
                    aria-label={t("aboutArtistLabel")} title={t("aboutArtistLabel")}
                  >
                    <IconPerson />
                  </button>
                </React.Fragment>
              )}
            </div>

            <button
              type="button" className={`npd-round ${view === "queue" ? "active" : ""}`}
              onClick={() => toggleView("queue")} aria-pressed={view === "queue"}
              aria-label={t("tabQueue")} title={t("tabQueue")}
            >
              <GlassLayers />
              <IconQueue />
            </button>
          </div>
        </div>

        <div className="npd-right" style={{ "--dir": pane.dir }}>
          {(view === "controls" || pane.leaving.includes("controls")) && (
            <ControlsPanel key="controls" leaving={view !== "controls"} track={currentTrack} tx={tx} onClose={onClose} onOpenLyrics={openLyricsAtLine} />
          )}
          {lyricsReady && (
            <LyricsPanel track={currentTrack} active={view === "lyrics"} leaving={view !== "lyrics" && pane.leaving.includes("lyrics")} tx={tx} onOpenProviders={() => setProvidersOpen(true)} />
          )}
          {(view === "queue" || pane.leaving.includes("queue")) && (
            <QueuePanel key="queue" leaving={view !== "queue"} track={currentTrack} tx={tx} />
          )}
          {(view === "artist" || pane.leaving.includes("artist")) && (
            <ArtistPanel key="artist" leaving={view !== "artist"} track={currentTrack} onClose={onClose} />
          )}
        </div>
      </div>

      {outputOpen && (
        <AudioOutputSheet tx={tx} onClose={() => { setOutputOpen(false); setPipelineOpen(false); }} onOpenPipeline={() => setPipelineOpen(true)} />
      )}
      {outputOpen && pipelineOpen && <AudioPipelineCard track={currentTrack} tx={tx} onClose={() => setPipelineOpen(false)} />}
      {providersOpen && <LyricsProviderSheet tx={tx} onClose={() => setProvidersOpen(false)} />}
    </div>
  );
}

function QualityLine({ track, visible }) {
  const { audioFormat } = usePlayer();
  const info = useTrackAudioInfo(track);
  const format = unifyAudioInfoFields(info && info !== "unavailable" ? info : null);
  const parts = [];
  const codec = format?.codec || (audioFormat && audioFormat !== "unavailable" ? audioFormat.label : null);
  if (codec) parts.push(String(codec).charAt(0).toUpperCase() + String(codec).slice(1));
  if (format?.flac) {
    if (format.lossless) parts.push("Lossless");
    if (format.sampleRateHz) parts.push(`${(format.sampleRateHz / 1000).toFixed(1)} kHz`);
    if (format.bitsPerSample) parts.push(`${format.bitsPerSample} bit`);
    if (format.channels) parts.push(chNameShort(format.channels));
  }
  if (format?.bitrateKbps) parts.push(`${Math.round(format.bitrateKbps)} kbps`);
  if (!parts.length) return null;
  return <div className={`npd-quality ${visible ? "on" : ""}`}>{parts.join(" \u00b7 ")}</div>;
}

function chNameShort(n) {
  if (n === 1) return "Mono";
  if (n === 2) return "Stereo";
  return `${n} ch`;
}

const WAIT_PHRASES = [
  "Wait for it...", "The song is starting", "Bass first", "Warming up", "Finding the right word",
  "Setting the mood", "Tuning the strings", "Hold on, here it comes", "Getting ready", "Take a breath",
  "Here we go", "Easing into it", "Building the intro", "Dimming the lights", "Cueing the vocals",
  "Clearing the throat", "Count me in", "Feel the beat first", "The calm before the lyrics", "Listen closely",
  "Almost there", "Picking the first note", "The story begins soon", "Let the intro breathe", "Loading the feels",
  "Sit back and relax", "A little drumroll", "Shh, it\u2019s starting", "Get comfy", "Lyrics loading in your heart",
  "Softly now", "The first beat is near", "Let the melody find you", "Strike a chord", "Waiting on the downbeat",
  "Hear that silence?", "The rhythm is waking", "One more moment", "Catch the groove", "The vocals are warming up",
  "Let the bassline settle", "Ready for the first line", "The track is loading", "A hush before the sound", "Feel the room shift",
  "The beat is on its way", "Steady now", "Here comes the hook", "Give it a second", "The intro is unfolding",
  "Let the speakers breathe", "The tempo is rising", "Cue the melody", "Almost song time", "Wait for the drop",
  "The music is stretching", "Listen for the cue", "The first chord is close", "Let the silence speak", "Ready when you are",
  "The beat is warming up", "A moment before the magic", "Here’s the count-in", "Let the harmony arrive", "The song is loading",
  "Ease into the rhythm", "Hold that thought", "The first note is coming", "Feel the pulse begin", "The lyrics are on deck",
  "A breath before the verse", "The mix is settling", "Cue the bass", "Wait for the groove", "The melody is near",
  "Let the drums speak", "The tune is waking up", "One beat to go", "The sound is coming alive", "Here comes the intro",
  "Let the rhythm roll", "The vocals are ready", "A small pause", "The track is about to play", "Listen to the quiet",
  "The first line is close", "Feel the intro build", "Cue the first beat", "The song is at the door", "Almost listening time",
  "Let the notes gather", "The beat is in the room", "Hold for the harmony", "The melody takes shape", "Here’s the moment",
  "The rhythm is ready", "A second of calm", "The first sound is near", "Let the music begin", "Ready, set, play"
];

function LyricLine({ track, onAlbum, onOpenLyrics }) {
  const time = usePlayerTime();
  const { loadingAudio } = usePlayer();
  const [, force] = useState(0);
  const [tick, setTick] = useState(0);
  const el = typeof document !== "undefined" ? document.getElementById(LYRICS_ID) : null;
  const want = cleanTrackTitleForLyrics(track.title, track.artist?.name);
  const lines = el && el.songTitle === want && !el.isLoading && el.lyrics && el.lyrics.length ? el.lyrics : null;
  const hasLines = !!lines;

  const phase = lines ? lyricPhase(lines, time * 1000 + 250) : { kind: "none", text: null };
  const kind = loadingAudio && time < 1.5 ? "intro" : phase.kind;
  const waiting = kind === "intro" || (loadingAudio && !lines && time < 1.5);
  const showNote = waiting || kind === "instrumental";

  useEffect(() => {
    if (hasLines) return undefined;
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [hasLines, track.id]);
  useEffect(() => {
    if (!waiting) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [waiting, track.id]);

  if (!lines && !waiting) {
    if (!track.album?.title) return null;
    return (
      <button type="button" className="npd-album" onClick={onAlbum}>
        <MarqueeText as="span" text={track.album.title} always />
        <ChevronRight size={15} />
      </button>
    );
  }

  let text;
  if (waiting) {
    const seed = hashStr(String(track.id || track.videoId || track.title || ""));
    text = WAIT_PHRASES[(seed + tick) % WAIT_PHRASES.length];
  } else if (kind === "instrumental") {
    text = "Instrumental";
  } else {
    text = phase.text;
  }

  const cls = `npd-lyricline ${waiting ? "is-waiting" : ""} ${kind === "instrumental" ? "is-instrumental" : ""}`;
  return (
    <button type="button" className={cls} onClick={onOpenLyrics}>
      {showNote && (
        <span className="npd-lyricline-note" aria-hidden="true">
          <IconMusicNote size={17} />
        </span>
      )}
      <MarqueeText key={`${kind}:${text}`} as="span" className="npd-lyricline-text" text={text} always />
      <ChevronRight size={16} className="npd-lyricline-chev" />
    </button>
  );
}

function ScrubRow({ track }) {
  const { loadingAudio } = usePlayer();
  const { settings } = useUI();
  const { registerFill, registerThumb, getRatio, onSeekRatio, currentTime, duration } = useScrubberBinding();
  const remaining = Math.max(0, (duration || 0) - (currentTime || 0));
  return (
    <div className="npd-scrub">
      <Scrubber
        getRatio={getRatio} onSeekRatio={onSeekRatio} registerFill={registerFill} registerThumb={registerThumb} loading={loadingAudio}
        waveformSeed={settings.waveformSeekbar && track ? String(track.id || track.title || "") : null}
      />
      <div className="npd-times">
        <span>{loadingAudio ? "\u2013\u2013" : formatTime(currentTime)}</span>
        <span>{loadingAudio ? "\u2013\u2013" : `-${formatTime(remaining)}`}</span>
      </div>
    </div>
  );
}

function ControlsPanel({ track, tx, onClose, onOpenLyrics, leaving }) {
  const { isPlaying, togglePlay, next, prev, room, liked, toggleLike, playSource } = usePlayer();
  const { authUser, t, openContextMenu } = useUI();
  const { navigate } = useRouter();
  const menuItems = useTrackMenuItems(track || {});

  const isHost = !room || !authUser || room.hostId === authUser.id;
  const locked = !!(room && room.hostOnlyControl && !isHost);
  const isLiked = liked.has(String(track.videoId || track.id));
  const sourceText = playSource?.type === "search" ? tx("Pencarian", "Search") : (playSource?.label || null);

  const goArtist = () => {
    if (!track.artist?.id) return;
    navigate("artist", { params: { id: track.artist.id } });
    onClose();
  };
  const goAlbum = () => {
    if (!track.album?.id) return;
    navigate("album", { params: { id: track.album.id } });
    onClose();
  };
  const openMenu = (e) => openContextMenu(e.clientX, e.clientY, menuItems);

  return (
    <div className={`npd-pane npd-controls ${leaving ? "is-leaving" : "npd-pane-anim"}`} aria-hidden={leaving || undefined}>
      {sourceText && <div className="npd-source">{t("playingFromLabel")} {sourceText}</div>}

      <div className="npd-titlerow">
        <div className="npd-titles">
          <MarqueeText
            as="div"
            className="npd-title"
            text={track.title}
            prefix={track.explicit ? <span className="aivy-explicit-badge" title="Explicit">E</span> : null}
            always
          />
          <button type="button" className="npd-artist" onClick={goArtist}><MarqueeText as="span" text={track.artist?.name || ""} always /></button>
        </div>
        <div className="npd-actions">
          <button type="button" className={`npd-chip ${isLiked ? "active" : ""}`} onClick={() => toggleLike(track)} aria-pressed={isLiked} aria-label={t("like")}>
            <GlassLayers />
            <Heart size={17} fill={isLiked ? "currentColor" : "none"} />
          </button>
          <button type="button" className="npd-chip" onClick={openMenu} aria-label={t("menuMore")}>
            <GlassLayers />
            <MoreHorizontal size={17} />
          </button>
        </div>
      </div>

      <LyricLine track={track} onAlbum={goAlbum} onOpenLyrics={onOpenLyrics} />

      <ScrubRow track={track} />

      <div className="npd-transport">
        <button type="button" className="npd-tbtn" onClick={prev} disabled={locked} aria-label={t("previous")}>
          <SkipBack size={40} fill="currentColor" />
        </button>
        <button type="button" className="npd-tbtn" onClick={togglePlay} disabled={locked} aria-label={isPlaying ? t("pause") : t("play")}>
          {isPlaying ? <Pause size={52} fill="currentColor" /> : <Play size={52} fill="currentColor" />}
        </button>
        <button type="button" className="npd-tbtn" onClick={() => next(false)} disabled={locked} aria-label={t("next")}>
          <SkipForward size={40} fill="currentColor" />
        </button>
      </div>

      <div className="npd-volume">
        <VolumeControl showEndIcon />
      </div>
    </div>
  );
}

function LyricsPanel({ track, active, leaving, tx, onOpenProviders }) {
  const { seekTo } = usePlayer();
  const { settings, t } = useUI();
  const time = usePlayerTime();
  const frozenTime = useRef(0);
  if (active) frozenTime.current = time;
  const lyricsTime = active ? time : frozenTime.current;
  const fontSize = normLyricsFontSize(settings.lyricsFontSize);

  const [ui, setUi] = useState({ ready: false, rom: false, tr: false, lang: "en", src: "", multi: false, unsynced: false });

  const getEl = () => document.getElementById(LYRICS_ID);

  const read = useCallback(() => {
    const el = getEl();
    if (!el) return;
    const next = {
      ready: !!(el.lyrics && el.lyrics.length),
      rom: !!el.showRomanization,
      tr: !!el.showTranslation,
      lang: el.translationLang || "en",
      src: el.lyricsSource || "",
      multi: !!((el.availableSources && el.availableSources.length > 1) || el.hasFetchedAllProviders === false),
      unsynced: !!(el.lyricsContainer && el.lyricsContainer.classList.contains("user-scrolling")),
    };
    setUi((p) => (
      p.ready === next.ready && p.rom === next.rom && p.tr === next.tr && p.lang === next.lang &&
      p.src === next.src && p.multi === next.multi && p.unsynced === next.unsynced ? p : next
    ));
  }, []);

  useEffect(() => {
    let tries = 0;
    let timer = null;
    const inject = () => {
      const el = getEl();
      if (!el || !el.shadowRoot) {
        if (tries++ < 40) timer = setTimeout(inject, 200);
        return;
      }
      if (el.shadowRoot.querySelector("style[data-npd]")) return;
      const st = document.createElement("style");
      st.setAttribute("data-npd", "");
      st.textContent = LYRICS_SHADOW_CSS;
      el.shadowRoot.appendChild(st);
    };
    inject();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    read();
    const id = setInterval(read, 450);
    return () => clearInterval(id);
  }, [active, track?.id, read]);

  const toggleRomanization = () => {
    const el = getEl();
    if (!el || typeof el.toggleRomanization !== "function") return;
    el.toggleRomanization();
    setTimeout(read, 40);
  };
  const toggleTranslation = () => {
    const el = getEl();
    if (!el || typeof el.toggleTranslation !== "function") return;
    el.toggleTranslation();
    setTimeout(read, 40);
  };
  const changeLang = (e) => {
    const el = getEl();
    if (!el || typeof el.changeTranslationLang !== "function") return;
    el.changeTranslationLang(e.target.value);
    setTimeout(read, 40);
  };
  const resumeSync = () => {
    const el = getEl();
    if (el && typeof el.resumeAutoScroll === "function") el.resumeAutoScroll();
    setTimeout(read, 40);
  };

  const langs = useMemo(() => {
    const ctor = typeof customElements !== "undefined" ? customElements.get("am-lyrics") : null;
    return ctor && Array.isArray(ctor.TRANSLATION_LANGUAGES) ? ctor.TRANSLATION_LANGUAGES : FALLBACK_LANGS;
  }, []);

  const sourceLabel = useMemo(() => {
    if (!ui.src) return "";
    const ctor = typeof customElements !== "undefined" ? customElements.get("am-lyrics") : null;
    if (ctor && typeof ctor.getDisplaySourceLabel === "function") {
      try { return ctor.getDisplaySourceLabel(ui.src); } catch { return ui.src; }
    }
    return ui.src;
  }, [ui.src]);

  return (
    <div className={`npd-pane npd-lyrics ${active ? "is-active npd-pane-anim" : ""} ${leaving ? "is-leaving" : ""}`} aria-hidden={!active}>
      <div className="npd-lyrics-body">
        <AppleLyricsPane
          id={LYRICS_ID}
          track={track}
          currentTime={lyricsTime}
          onSeek={seekTo}
          highlightColor="#f5f5f5"
          fontSize={fontSize}
        />
        {ui.unsynced && (
          <button type="button" className="npd-sync" onClick={resumeSync}>{t("syncLyrics")}</button>
        )}
      </div>

      <div className="npd-lyrics-foot">
        <button
          type="button" className={`npd-mini ${ui.rom ? "active" : ""}`} onClick={toggleRomanization} disabled={!ui.ready}
          aria-pressed={ui.rom} aria-label={tx("Romanisasi", "Romanization")} title={tx("Romanisasi", "Romanization")}
        >
          <GlassLayers />
          <Globe size={16} />
        </button>

        <div className="npd-source-info">
          {sourceLabel && (
            <button type="button" className="npd-source-btn" onClick={onOpenProviders} title={tx("Pilih provider lirik", "Choose lyrics provider")}>
              {tx("Lirik dari", "Lyrics by")} {sourceLabel}
            </button>
          )}
        </div>

        <div className="npd-foot-right">
          {ui.tr && (
            <select className="npd-lang" value={ui.lang} onChange={changeLang} aria-label={tx("Bahasa terjemahan", "Translation language")}>
              {langs.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          )}
          <button
            type="button" className={`npd-mini ${ui.tr ? "active" : ""}`} onClick={toggleTranslation} disabled={!ui.ready}
            aria-pressed={ui.tr} aria-label={tx("Terjemahan", "Translation")} title={tx("Terjemahan", "Translation")}
          >
            <GlassLayers />
            <Languages size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function QueuePanel({ track, tx, leaving }) {
  const { upNext, suggestedQueue, promoteSuggestion, clearUpNext, room } = usePlayer();
  const { settings, t } = useUI();
  const autoplayOn = settings.autoplay !== false;

  let autoSub = tx("Musik serupa, dipilih untuk diputar berikutnya", "Similar music, selected to play next");
  if (!autoplayOn) autoSub = tx("AutoPlay nonaktif", "AutoPlay is off");
  else if (!suggestedQueue.length) autoSub = tx("Lagu serupa dipilih otomatis saat antrean habis", "Similar songs are picked automatically when the queue ends");

  return (
    <div className={`npd-pane npd-queue ${leaving ? "is-leaving" : "npd-pane-anim"}`} aria-hidden={leaving || undefined}>
      <h2 className="npd-queue-title">{t("tabQueue")}</h2>
      <div className="npd-queue-scroll aivy-scroll">
        <div className="npd-sec">{t("nowPlaying")}</div>
        <div className="aivy-queue-row is-current">
          <QueueTrackMeta track={track} />
          <span className="npd-eq"><AudioLines size={17} /></span>
        </div>

        {upNext.length > 0 && (
          <>
            <div className="npd-sec npd-sec-split">
              <span>{t("upNextLabel")}</span>
              <button type="button" className="npd-clear" onClick={clearUpNext}><Trash2 size={13} /> {t("clearQueue")}</button>
            </div>
            <QueueUpNextList items={upNext} />
          </>
        )}

        {!room && (
          <>
            <div className="npd-auto">
              <InfinityIcon size={20} />
              <div className="npd-auto-txt">
                <div className="t">AutoPlay</div>
                <div className="s">{autoSub}</div>
              </div>
            </div>
            {autoplayOn && suggestedQueue.map((tr, i) => (
              <div key={`${tr.id}-${i}`} className="aivy-queue-row is-suggested">
                <QueueTrackMeta track={tr} />
                <div className="aivy-queue-row-actions">
                  <button type="button" className="aivy-icon-btn sm" onClick={() => promoteSuggestion(tr)} aria-label={t("menuAddQueue")} title={t("menuAddQueue")}>
                    <Plus size={15} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ArtistPanel({ track, onClose, leaving }) {
  return (
    <div className={`npd-pane npd-artist-pane aivy-scroll ${leaving ? "is-leaving" : "npd-pane-anim"}`} aria-hidden={leaving || undefined}>
      <AboutArtistSection track={track} onNavigate={onClose} glass />
    </div>
  );
}