import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Heart, MoreHorizontal,
  ChevronRight, ListMusic, MessageSquareQuote, Headphones, User, Infinity as InfinityIcon,
  AudioLines, Plus, Trash2, Globe, Languages,
} from "lucide-react";
import { usePlayer, usePlayerTime, useUI } from "./context.jsx";
import { useRouter } from "./router.jsx";
import { AnimatedCover } from "./lib/brand.jsx";
import { formatTime, cleanTrackTitleForLyrics } from "./lib/utils.js";
import { lyricAt } from "./lib/presenceLyrics.js";
import {
  Scrubber, VolumeControl, MarqueeText, AppleLyricsPane, normLyricsFontSize,
  QueueUpNextList, QueueTrackMeta, AboutArtistSection, useScrubberBinding,
  useTrackAudioInfo, useTrackMenuItems,
} from "./components.jsx";
import "./styles/nowplaying-desktop.css";

const COVER_STYLE = { width: "100%", height: "100%" };
const LYRICS_ID = "aivy-am-lyrics-npd";
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

const NO_DRAG_SELECTOR = "button, a, input, select, textarea, label, [role='slider'], .aivy-scrubber, .aivy-vol, am-lyrics, .npd-lyrics, .npd-queue-scroll, .npd-artist-pane";
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

function FullPlayer({ shown, onClose }) {
  const { currentTrack, currentTrackHasLyrics, shuffle, toggleShuffle, repeat, cycleRepeat, room, isPlaying } = usePlayer();
  const { settings, updateSettings, t } = useUI();
  const [view, setView] = useState("controls");
  const [showQuality, setShowQuality] = useState(true);
  const [lyricsReady, setLyricsReady] = useState(true);
  const rootRef = useRef(null);
  const drag = useDragToClose(rootRef, onClose);

  useEffect(() => {
    if (!shown || !rootRef.current) return;
    const st = rootRef.current.style;
    st.transform = ""; st.opacity = ""; st.transition = ""; st.borderRadius = ""; st.willChange = "";
  }, [shown]);

  const tx = useCallback((idText, enText) => (settings.language === "en" ? enText : idText), [settings.language]);
  const reduceMotion = !!settings.reducedMotion || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const lyricsDisabled = !currentTrack || !currentTrackHasLyrics;
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
  const queueMode = view === "queue";

  return (
    <div
      ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("nowPlaying")}
      className={`npd ${shown ? "shown" : ""} ${reduceMotion ? "reduce" : ""}`}
      onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel} onClickCapture={drag.onClickCapture} onDragStart={drag.onDragStart}
    >
      {settings.coverBackground !== false && currentTrack.cover && (
        <div key={currentTrack.id} className="npd-bg" style={{ backgroundImage: `url(${JSON.stringify(currentTrack.cover)})` }} aria-hidden="true" />
      )}
      <div className="npd-scrim" aria-hidden="true" />

      <button type="button" className="npd-grabber" onClick={onClose} aria-label={t("close")} title={t("close")}><span /></button>

      <div className="npd-stage">
        <div className="npd-left">
          <div className={`npd-cover ${isPlaying ? "" : "is-paused"}`}>
            {cover}
            <QualityLine track={currentTrack} visible={view === "controls" && showQuality} />
          </div>

          <div className="npd-dock">
            <button
              type="button" className={`npd-round ${view === "lyrics" ? "active" : ""}`}
              onClick={() => toggleView("lyrics")} disabled={lyricsDisabled} aria-pressed={view === "lyrics"}
              aria-label={t("lyrics")} title={lyricsDisabled ? t("lyricsUnavailable") : t("lyrics")}
            >
              <MessageSquareQuote size={20} />
            </button>

            <div className="npd-seg" role="group">
              {queueMode ? (
                <>
                  <button type="button" className={shuffle ? "active" : ""} onClick={toggleShuffle} disabled={!!room} aria-pressed={shuffle} aria-label={t("shuffle")} title={t("shuffle")}>
                    <Shuffle size={19} />
                  </button>
                  <button type="button" className={repeat !== "off" ? "active" : ""} onClick={cycleRepeat} disabled={!!room} aria-pressed={repeat !== "off"} aria-label={t("repeat")} title={t("repeat")}>
                    <RepeatIcon size={19} />
                  </button>
                  <button type="button" className={autoplayOn ? "active" : ""} onClick={() => updateSettings({ autoplay: !autoplayOn })} aria-pressed={autoplayOn} aria-label="AutoPlay" title="AutoPlay">
                    <InfinityIcon size={21} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button" className={showQuality ? "active" : ""} onClick={() => setShowQuality((v) => !v)} aria-pressed={showQuality}
                    aria-label={tx("Info kualitas audio", "Audio quality info")} title={tx("Info kualitas audio", "Audio quality info")}
                  >
                    <Headphones size={19} />
                  </button>
                  <button
                    type="button" className={view === "artist" ? "active" : ""} onClick={() => toggleView("artist")} aria-pressed={view === "artist"}
                    aria-label={t("aboutArtistLabel")} title={t("aboutArtistLabel")}
                  >
                    <User size={19} />
                  </button>
                </>
              )}
            </div>

            <button
              type="button" className={`npd-round ${view === "queue" ? "active" : ""}`}
              onClick={() => toggleView("queue")} aria-pressed={view === "queue"}
              aria-label={t("tabQueue")} title={t("tabQueue")}
            >
              <ListMusic size={20} />
            </button>
          </div>
        </div>

        <div className="npd-right">
          {view === "controls" && <ControlsPanel key="controls" track={currentTrack} tx={tx} onClose={onClose} />}
          {lyricsReady && <LyricsPanel track={currentTrack} active={view === "lyrics"} tx={tx} />}
          {view === "queue" && <QueuePanel key="queue" track={currentTrack} tx={tx} />}
          {view === "artist" && <ArtistPanel key="artist" track={currentTrack} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}

function QualityLine({ track, visible }) {
  const { audioFormat } = usePlayer();
  const info = useTrackAudioInfo(track);
  const format = info && info !== "unavailable" ? info.format : null;
  const parts = [];
  const codec = format?.codec || (audioFormat && audioFormat !== "unavailable" ? audioFormat.label : null);
  if (codec) parts.push(String(codec).charAt(0).toUpperCase() + String(codec).slice(1));
  if (format?.sampleRateHz) parts.push(`${(format.sampleRateHz / 1000).toFixed(1)} kHz`);
  if (format?.bitrateKbps) parts.push(`${Math.round(format.bitrateKbps)} kbps`);
  if (!parts.length) return null;
  return <div className={`npd-quality ${visible ? "on" : ""}`}>{parts.join(" \u00b7 ")}</div>;
}

function LyricLine({ track, onAlbum }) {
  const time = usePlayerTime();
  const [, force] = useState(0);
  const el = typeof document !== "undefined" ? document.getElementById(LYRICS_ID) : null;
  const want = cleanTrackTitleForLyrics(track.title, track.artist?.name);
  const lines = el && el.songTitle === want && !el.isLoading && el.lyrics && el.lyrics.length ? el.lyrics : null;
  const hasLines = !!lines;

  useEffect(() => {
    if (hasLines) return undefined;
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [hasLines, track.id]);

  if (!lines) {
    if (!track.album?.title) return null;
    return (
      <button type="button" className="npd-album" onClick={onAlbum}>
        <MarqueeText as="span" text={track.album.title} always />
        <ChevronRight size={15} />
      </button>
    );
  }

  const text = lyricAt(lines, time * 1000 + 250);
  return (
    <div className="npd-lyricline">
      {text ? <MarqueeText key={text} as="div" className="npd-lyricline-text" text={text} always /> : null}
    </div>
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

function ControlsPanel({ track, tx, onClose }) {
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
    <div className="npd-pane npd-controls npd-pane-anim">
      {sourceText && <div className="npd-source">{t("playingFromLabel")} {sourceText}</div>}

      <div className="npd-titlerow">
        <div className="npd-titles">
          <MarqueeText as="div" className="npd-title" text={track.title} always />
          <button type="button" className="npd-artist" onClick={goArtist}><MarqueeText as="span" text={track.artist?.name || ""} always /></button>
        </div>
        <div className="npd-actions">
          <button type="button" className={`npd-chip ${isLiked ? "active" : ""}`} onClick={() => toggleLike(track)} aria-pressed={isLiked} aria-label={t("like")}>
            <Heart size={17} fill={isLiked ? "currentColor" : "none"} />
          </button>
          <button type="button" className="npd-chip" onClick={openMenu} aria-label={t("menuMore")}>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </div>

      <LyricLine track={track} onAlbum={goAlbum} />

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

function LyricsPanel({ track, active, tx }) {
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
  const switchSource = () => {
    const el = getEl();
    if (el && typeof el.switchSource === "function") el.switchSource();
    setTimeout(read, 200);
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
    <div className={`npd-pane npd-lyrics ${active ? "is-active npd-pane-anim" : ""}`} aria-hidden={!active}>
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
          <Globe size={16} />
        </button>

        <div className="npd-source-info">
          {sourceLabel && (
            ui.multi
              ? <button type="button" className="npd-source-btn" onClick={switchSource} title={tx("Ganti sumber lirik", "Switch lyrics source")}>{tx("Lirik dari", "Lyrics by")} {sourceLabel}</button>
              : <span className="npd-source-text">{tx("Lirik dari", "Lyrics by")} {sourceLabel}</span>
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
            <Languages size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function QueuePanel({ track, tx }) {
  const { upNext, suggestedQueue, promoteSuggestion, clearUpNext, room } = usePlayer();
  const { settings, t } = useUI();
  const autoplayOn = settings.autoplay !== false;

  let autoSub = tx("Musik serupa, dipilih untuk diputar berikutnya", "Similar music, selected to play next");
  if (!autoplayOn) autoSub = tx("AutoPlay nonaktif", "AutoPlay is off");
  else if (!suggestedQueue.length) autoSub = tx("Lagu serupa dipilih otomatis saat antrean habis", "Similar songs are picked automatically when the queue ends");

  return (
    <div className="npd-pane npd-queue npd-pane-anim">
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

function ArtistPanel({ track, onClose }) {
  return (
    <div className="npd-pane npd-artist-pane aivy-scroll npd-pane-anim">
      <AboutArtistSection track={track} onNavigate={onClose} glass />
    </div>
  );
}