import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Component } from "react";
import { createPortal } from "react-dom";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Volume2, Volume1,
  VolumeX, Heart, Search, Home as HomeIcon, Library, ListMusic, ChevronDown,
  ChevronLeft, ChevronRight, X, Plus, Users, LogIn, MoreHorizontal, Clock,
  Check, ArrowLeft, Sun, Moon, Music2, Share2, UserPlus, Radio, Settings as SettingsIcon,
  Lock, Globe, Crown, Mic2, AlertTriangle, GripVertical, Trash2, Film, Send,
  PanelLeft, PanelRight, Type, Star, Airplay, Mic, MessageSquareQuote, Smile,
  Cast, Info, Copy, ListPlus, SlidersHorizontal, Gauge, Maximize, Minimize, Github, Sparkles, RefreshCw,
  ExternalLink,
} from "lucide-react";
import {
  usePlayer, usePlayerTime, useUI,
  SIDEBAR_MIN_W, SIDEBAR_MAX_W, RIGHTPANEL_MIN_W, RIGHTPANEL_MAX_W,
} from "./context.jsx";
import { useRouter, Link } from "./router.jsx";
import { CoverArt, SmartCover, AnimatedCover, StarMark, StarLoader, prefetchAnimatedArtwork } from "./lib/brand.jsx";
import { peekArtistProfile, loadArtistProfile, loadTrackArtists, menuArtists } from "./lib/artistProfile.js";
import { formatTime, formatDuration, relativeTime, formatClockTime, clamp, isRelevantArtistMatch, cleanTrackTitleForLyrics } from "./lib/utils.js";
import { runAiAssistantTurn } from "./lib/aiAssistant.js";
import { Api } from "./lib/api.js";
import { makeDisplacementMap, supportsRefraction } from "./lib/liquidGlass.js";
import { beginHeavyTransition, subscribeHeavyTransition, isHeavyTransition, isLowEndDevice } from "./lib/perf.js";
export function resolveAvatarUrl(user) {
  if (!user) return null;
  const raw = user.avatarUrl || user.avatar_url || user.picture || user.photo || user.photoUrl
    || user.image || user.imageUrl || user.avatar || null;
  if (!raw || typeof raw !== "string") return null;
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("/")) {
    return raw.startsWith("//") ? `https:${raw}` : raw;
  }
  const discordId = user.discordId || user.discord_id || user.providerId || user.provider_id || user.id;
  if (discordId) {
    const ext = raw.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${discordId}/${raw}.${ext}?size=128`;
  }
  return null;
}
export function resolveDisplayName(user) {
  if (!user) return "";
  return user.displayName || user.display_name || user.global_name || user.globalName
    || user.name || user.username || "";
}

export function Avatar({ user, className = "", title }) {
  const url = resolveAvatarUrl(user);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  const name = resolveDisplayName(user);
  const showImg = url && !failed;
  return (
    <span className={`aivy-avatar ${showImg ? "has-img" : ""} ${className}`.trim()} title={title}>
      {showImg
        ? <img src={url} alt={name} referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(true)} />
        : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function usePanelResize({ width, setWidth, min, max, side }) {
  const draggingRef = useRef(false);
  const startRef = useRef({ x: 0, width: 0 });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    function onMove(e) {
      if (!draggingRef.current) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const delta = clientX - startRef.current.x;
      const next = side === "left" ? startRef.current.width + delta : startRef.current.width - delta;
      setWidth(clamp(Math.round(next), min, max));
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      document.body.classList.remove("aivy-resizing");
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [min, max, setWidth, side]);

  const onDragStart = useCallback((e) => {
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    draggingRef.current = true;
    startRef.current = { x: clientX, width };
    setIsDragging(true);
    document.body.classList.add("aivy-resizing");
  }, [width]);

  return { onDragStart, isDragging };
}

function useVerticalSwipe({ active, direction = "down", onTrigger, dragRef, scrollRef, threshold = 90, velocityThreshold = 0.45 }) {
  const stRef = useRef({ pointerId: null, dragging: false, startY: 0, startTime: 0, dragStartTime: 0, delta: 0, blocked: false });

  const reset = () => { stRef.current = { pointerId: null, dragging: false, startY: 0, startTime: 0, dragStartTime: 0, delta: 0, blocked: false }; };

  const onPointerDown = useCallback((e) => {
    if (!active) return;
    const blocked = direction === "down" && !!scrollRef?.current && scrollRef.current.scrollTop > 0;
    stRef.current = { pointerId: e.pointerId, dragging: false, startY: e.clientY, startTime: Date.now(), dragStartTime: 0, delta: 0, blocked };
  }, [active, direction, scrollRef]);

  const onPointerMove = useCallback((e) => {
    const st = stRef.current;
    if (st.pointerId !== e.pointerId) return;
    if (st.blocked) return;
    const raw = e.clientY - st.startY;
    const signed = direction === "down" ? raw : -raw;
    if (!st.dragging) {
      if (Math.abs(raw) < 6) return;
      if (signed < 0) { reset(); return; }
      st.dragging = true;
      st.dragStartTime = Date.now();
      if (dragRef?.current) {
        dragRef.current.style.transition = "none";
        dragRef.current.style.willChange = "transform";
      }
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    }
    if (st.dragging) { try { e.preventDefault(); } catch {} }
    st.delta = Math.max(0, signed);
    if (dragRef?.current) {
      const px = direction === "down" ? st.delta : -st.delta;
      dragRef.current.style.transform = `translateY(${px}px)`;
    }
  }, [direction, dragRef]);

  const finish = useCallback((commit) => {
    if (dragRef?.current) { dragRef.current.style.transition = ""; dragRef.current.style.transform = ""; dragRef.current.style.willChange = ""; }
    if (commit) onTrigger();
    reset();
  }, [dragRef, onTrigger]);

  const onPointerUp = useCallback((e) => {
    const st = stRef.current;
    if (st.pointerId !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (!st.dragging) { reset(); return; }
    const elapsed = Math.max(1, Date.now() - st.dragStartTime);
    const velocity = st.delta / elapsed;
    finish(st.delta > threshold || velocity > velocityThreshold);
  }, [finish, threshold, velocityThreshold]);

  const onPointerCancel = useCallback((e) => {
    const st = stRef.current;
    if (st.pointerId !== e.pointerId) return;
    finish(false);
  }, [finish]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}

export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("cosmicx crashed:", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="aivy-crash">
        <StarMark size={40} color="var(--ink-faint)" />
        <div className="title">Ada yang salah di halaman ini</div>
        <div className="sub">Coba muat ulang. Kalau masih kejadian, kabarin ke kami ya.</div>
        <button className="aivy-btn-primary" onClick={() => { this.setState({ error: null }); window.location.href = "/beranda"; }}>
          Kembali ke beranda
        </button>
      </div>
    );
  }
}

function seededRand(seed) {
  let h = 0;
  const s = String(seed || "x");
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return (h % 1000) / 1000;
  };
}

function WaveformBars({ seed, className }) {
  const bars = useMemo(() => {
    const rand = seededRand(seed);
    const n = 64;
    const out = [];
    let last = 0.5;
    for (let i = 0; i < n; i++) {
      const jitter = (rand() - 0.5) * 0.7;
      last = Math.max(0.14, Math.min(1, last * 0.55 + 0.45 * (0.55 + jitter)));
      out.push(last);
    }
    return out;
  }, [seed]);
  return (
    <div className={`aivy-waveform ${className || ""}`} aria-hidden="true">
      {bars.map((h, i) => <span key={i} style={{ height: `${Math.round(h * 100)}%` }} />)}
    </div>
  );
}

export function Scrubber({ getRatio, onSeekRatio, registerFill, registerThumb, className = "", loading = false, waveformSeed = null }) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const ratioFromEvent = (e) => {
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };
  if (loading) {
    return (
      <div className={`aivy-scrubber is-loading ${className}`} role="slider" aria-label="Posisi lagu" aria-busy="true">
        <div className="track skeleton-shine" />
      </div>
    );
  }
  return (
    <div
      ref={trackRef} className={`aivy-scrubber ${dragging ? "dragging" : ""} ${waveformSeed ? "has-waveform" : ""} ${className}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); onSeekRatio(ratioFromEvent(e)); }}
      onPointerMove={(e) => { if (dragging) onSeekRatio(ratioFromEvent(e)); }}
      onPointerUp={(e) => { setDragging(false); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {} }}
      onPointerCancel={(e) => { setDragging(false); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {} }}
      role="slider" aria-label="Posisi lagu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((getRatio ? getRatio() : 0) * 100)}
    >
      <div className="track">
        {waveformSeed && <WaveformBars seed={waveformSeed} className="wave-bg" />}
        <div className="fill" ref={registerFill}>
          {waveformSeed && <WaveformBars seed={waveformSeed} className="wave-fg" />}
        </div>
      </div>
      <div className="thumb" ref={registerThumb} />
    </div>
  );
}

export function VolumeControl({ showEndIcon = false }) {
  const { volume, muted, setVolume, toggleMute } = usePlayer();
  const { t } = useUI();
  const trackRef = useRef(null);
  const rootRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [bumping, setBumping] = useState(false);
  const bumpTimerRef = useRef(null);
  const effective = muted ? 0 : volume;
  const ratioFromEvent = (e) => { const r = trackRef.current.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  const VolIcon = effective === 0 ? VolumeX : effective < 0.5 ? Volume1 : Volume2;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (e) => {
      e.preventDefault();
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? -e.deltaY : e.deltaX;
      const step = delta > 0 ? 0.05 : -0.05;
      setVolume(clamp(effective + step, 0, 1));
      setBumping(true);
      clearTimeout(bumpTimerRef.current);
      bumpTimerRef.current = setTimeout(() => setBumping(false), 260);
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => { root.removeEventListener("wheel", onWheel); clearTimeout(bumpTimerRef.current); };
  }, [effective, setVolume]);

  return (
    <div className={`aivy-vol ${bumping ? "is-bumping" : ""} ${dragging ? "dragging" : ""}`} ref={rootRef}>
      <button className="aivy-icon-btn sm" onClick={toggleMute} aria-label={muted ? t("unmute") : t("mute")}><VolIcon size={17} /></button>
      <div
        ref={trackRef} className="track"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); setVolume(ratioFromEvent(e)); }}
        onPointerMove={(e) => { if (dragging) setVolume(ratioFromEvent(e)); }}
        onPointerUp={(e) => { setDragging(false); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {} }}
        onPointerCancel={(e) => { setDragging(false); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {} }}
        role="slider" aria-label={t("volume")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(effective * 100)}
      >
        <div className="fill" style={{ width: `${effective * 100}%` }} />
      </div>
      {showEndIcon && <span className="vol-end"><Volume2 size={17} /></span>}
    </div>
  );
}

function useScrubberBinding() {
  const { duration, seekRatio, registerProgressEl } = usePlayer();
  const currentTime = usePlayerTime();
  const fillCleanupRef = useRef(null);
  const thumbCleanupRef = useRef(null);
  const registerFill = useCallback((el) => {
    fillCleanupRef.current?.();
    fillCleanupRef.current = el ? registerProgressEl(el, "width") : null;
  }, [registerProgressEl]);
  const registerThumb = useCallback((el) => {
    thumbCleanupRef.current?.();
    thumbCleanupRef.current = el ? registerProgressEl(el, "left") : null;
  }, [registerProgressEl]);
  const getRatio = useCallback(() => (duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0), [currentTime, duration]);
  return { registerFill, registerThumb, getRatio, onSeekRatio: seekRatio, currentTime, duration };
}

function useArtistProfile(artist) {
  const [data, setData] = useState(() => { const c = peekArtistProfile(artist); return c === undefined ? null : c; });
  useEffect(() => {
    const c = peekArtistProfile(artist);
    if (c !== undefined) { setData(c); return; }
    let alive = true;
    loadArtistProfile(artist).then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [artist]);
  return data;
}

function TrackMenuArtistRow({ artist, onGo }) {
  const { t } = useUI();
  const info = useArtistProfile(artist);
  const image = artist.image || artist.avatar || artist.thumbnail || info?.image || null;
  const target = artist.id || info?.id || (info ? artist.name : null);
  return (
    <button className="aivy-trackmenu-link" disabled={!target} onClick={() => onGo(target)}>
      <span className="thumb round">
        {image && <SmartCover src={image} seed={String(artist.id || artist.name)} size={64} radius={999} style={{ width: "100%", height: "100%" }} />}
      </span>
      <span className="txt"><small>{t("artistLabel")}</small><b>{artist.name}</b></span>
    </button>
  );
}

function TrackMenuSheet({ menu, onClose }) {
  const { liked, toggleLike, addToQueueEnd, playNextInQueue, playSingle } = usePlayer();
  const { openAddToPlaylist, pushToast, t } = useUI();
  const { navigate } = useRouter();
  const track = menu.track;
  const isLiked = liked.has(String(track.videoId || track.id));
  const artists = track.artists?.length ? track.artists : (track.artist ? [track.artist] : []);
  const allArtists = menuArtists(track);
  const artistName = artists.map((a) => a.name).filter(Boolean).join(", ");
  const albumTitle = track.album?.title || track.albumTitle || "";
  const removeItem = menu.items?.removeItem || null;
  const run = (fn) => () => { onClose(); fn && fn(); };

  return createPortal(
    <div className="aivy-trackmenu-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onContextMenu={(e) => { e.preventDefault(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="aivy-trackmenu" role="dialog" aria-label={track.title}>
        <div className="aivy-trackmenu-head">
          <span className="cover"><SmartCover src={track.cover} seed={track.id + track.title} size={96} radius={6} style={{ width: "100%", height: "100%" }} /></span>
          <div className="txt">
            <div className="t">{track.title}</div>
            <div className="a">{artistName || "\u2014"}</div>
          </div>
          <button className={`like ${isLiked ? "on" : ""}`} onClick={() => toggleLike(track)} aria-label={t("like")}>
            <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
          </button>
        </div>

        <div className="aivy-trackmenu-list">
          <button className="aivy-trackmenu-item" onClick={run(() => playSingle(track))}>
            <Play size={20} fill="currentColor" /><span>{t("menuPlayNow")}</span>
          </button>
          <button className="aivy-trackmenu-item" onClick={run(() => playNextInQueue(track))}>
            <ListMusic size={20} /><span>{t("menuPlayNext")}</span>
          </button>
          <button className="aivy-trackmenu-item" onClick={run(() => addToQueueEnd(track))}>
            <ListPlus size={20} /><span>{t("menuAddQueue")}</span>
          </button>
          <button className="aivy-trackmenu-item" onClick={run(() => openAddToPlaylist(track))}>
            <ListPlus size={20} /><span>{t("menuAddPlaylist")}</span><ChevronRight size={18} className="chev" />
          </button>
          <button className="aivy-trackmenu-item" onClick={run(() => { shareTrack(track, pushToast, t); })}>
            <Share2 size={20} /><span>{t("menuShareSong")}</span>
          </button>
          <button className="aivy-trackmenu-item" onClick={run(() => { navigator.clipboard?.writeText(buildShareUrl(track)); pushToast(t("linkCopied")); })}>
            <Copy size={20} /><span>{t("menuCopyLink")}</span>
          </button>
          {removeItem && (
            <button className="aivy-trackmenu-item danger" onClick={run(removeItem.onSelect)}>
              <X size={20} /><span>{removeItem.label}</span>
            </button>
          )}
        </div>

        {(albumTitle || allArtists.length > 0) && (
          <div className="aivy-trackmenu-foot">
            {albumTitle && (
              <button className="aivy-trackmenu-link" disabled={!track.album?.id} onClick={run(() => navigate("album", { params: { id: track.album.id } }))}>
                <span className="thumb"><SmartCover src={track.cover} seed={track.id + track.title} size={64} radius={4} style={{ width: "100%", height: "100%" }} /></span>
                <span className="txt"><small>{t("albumLabel")}</small><b>{albumTitle}</b></span>
              </button>
            )}
            {allArtists.map((a) => (
              <TrackMenuArtistRow key={a.id || a.name} artist={a} onGo={(target) => { onClose(); navigate("artist", { params: { id: target } }); }} />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
function MenuSheet({ menu, onClose }) {
  const sheet = menu.items.sheet;
  const run = (fn) => () => { onClose(); fn && fn(); };
  return createPortal(
    <div className="aivy-trackmenu-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onContextMenu={(e) => { e.preventDefault(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="aivy-trackmenu" role="dialog" aria-label={sheet.title}>
        <div className="aivy-trackmenu-head">
          <span className="cover"><SmartCover src={sheet.cover} seed={sheet.seed || sheet.title} size={96} radius={6} style={{ width: "100%", height: "100%" }} /></span>
          <div className="txt">
            <div className="t">{sheet.title}</div>
            {sheet.subtitle ? <div className="a">{sheet.subtitle}</div> : null}
          </div>
        </div>
        <div className="aivy-trackmenu-list">
          {menu.items.map((item, i) => (
            item.divider ? <div key={i} className="aivy-trackmenu-divider" /> : (
              <button key={i} className={`aivy-trackmenu-item ${item.danger ? "danger" : ""}`} disabled={item.disabled} onClick={run(item.onSelect)}>
                {item.icon}<span>{item.label}</span>
              </button>
            )
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function GlobalContextMenu() {
  const { contextMenu, closeContextMenu } = useUI();
  const menuRef = useRef(null);
  useEffect(() => {
    if (!contextMenu) return;
    const isSheet = !!contextMenu.track || !!contextMenu.items?.sheet;
    function onDown(e) { if (!isSheet && menuRef.current && !menuRef.current.contains(e.target)) closeContextMenu(); }
    function onKey(e) { if (e.key === "Escape") closeContextMenu(); }
    function onScroll() { if (!isSheet) closeContextMenu(); }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); window.removeEventListener("scroll", onScroll, true); };
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;
  if (contextMenu.track) return <TrackMenuSheet menu={contextMenu} onClose={closeContextMenu} />;
  if (contextMenu.items?.sheet) return <MenuSheet menu={contextMenu} onClose={closeContextMenu} />;

  const menuW = 240;
  const left = Math.min(contextMenu.x, window.innerWidth - menuW - 8);
  const top = Math.min(contextMenu.y, window.innerHeight - contextMenu.items.length * 38 - 16);

  return (
    <div ref={menuRef} className="aivy-ctxmenu" style={{ top, left, width: menuW }}>
      {contextMenu.items.map((item, i) => (
        item.divider ? <div key={i} className="aivy-ctxmenu-divider" /> : (
          <button key={i} className="aivy-menu-item" onClick={() => { item.onSelect?.(); closeContextMenu(); }} disabled={item.disabled}>
            {item.icon}<span>{item.label}</span>
          </button>
        )
      ))}
    </div>
  );
}

export function CustomSelect({ value, options, onChange, placeholder, className = "", disabled = false }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [rect, setRect] = useState(null);
  const [highlight, setHighlight] = useState(-1);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const closeTimerRef = useRef(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const doClose = useCallback(() => {
    setOpen((wasOpen) => {
      if (!wasOpen) return wasOpen;
      setClosing(true);
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => setClosing(false), 160);
      return false;
    });
  }, []);

  const doOpen = () => {
    if (disabled) return;
    const r = triggerRef.current.getBoundingClientRect();
    setRect(r);
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
    clearTimeout(closeTimerRef.current);
    setClosing(false);
    setOpen(true);
  };

  const toggle = () => { if (!disabled) (open ? doClose() : doOpen()); };

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      doClose();
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); doClose(); triggerRef.current?.focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(options.length - 1, h + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const o = options[highlight];
        if (o) { onChange(o.value); doClose(); triggerRef.current?.focus(); }
      }
    }
    function onReflow() { if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect()); }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, options, highlight, onChange, doClose]);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  const showMenu = open || closing;
  const menuStyle = useMemo(() => {
    if (!rect) return { display: "none" };
    const gap = 6;
    const estHeight = Math.min(280, options.length * 38 + 10);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < estHeight + 12 && spaceAbove > spaceBelow;
    const style = {
      left: rect.left,
      width: Math.max(rect.width, 160),
      maxHeight: Math.min(280, (openUp ? spaceAbove : spaceBelow) - 16),
    };
    if (openUp) { style.bottom = window.innerHeight - rect.top + gap; style.transformOrigin = "bottom"; }
    else { style.top = rect.bottom + gap; style.transformOrigin = "top"; }
    return style;
  }, [rect, options.length]);

  return (
    <div className={`aivy-cselect ${className}`}>
      <button
        type="button"
        ref={triggerRef}
        className={`aivy-cselect-trigger ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
      >
        <span className="aivy-cselect-value">{selected ? selected.label : (placeholder || "")}</span>
        <ChevronDown size={15} className="aivy-cselect-chevron" />
      </button>
      {showMenu && createPortal(
        <div
          ref={menuRef}
          className={`aivy-cselect-menu ${closing ? "is-closing" : "is-opening"}`}
          style={menuStyle}
          role="listbox"
        >
          {options.map((o, i) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`aivy-cselect-option ${o.value === value ? "is-selected" : ""} ${i === highlight ? "is-highlighted" : ""}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => { onChange(o.value); doClose(); triggerRef.current?.focus(); }}
            >
              <span>{o.label}</span>
              {o.value === value && <Check size={14} className="aivy-cselect-check" />}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, disabled = false, className = "" }) {
  return (
    <label className={`aivy-checkbox ${checked ? "is-checked" : ""} ${disabled ? "is-disabled" : ""} ${className}`}>
      <button
        type="button"
        className="aivy-checkbox-box"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
      >
        <Check size={13} className="aivy-checkbox-mark" />
      </button>
      {label && <span className="aivy-checkbox-label">{label}</span>}
    </label>
  );
}

export function buildShareUrl(track) {
  const origin = window.location.origin;
  if (track.album?.id) return `${origin}/album/${track.album.id}?track=${encodeURIComponent(track.id)}`;
  if (track.artist?.id) return `${origin}/artist/${track.artist.id}?track=${encodeURIComponent(track.id)}`;
  return `${origin}/cari?q=${encodeURIComponent(track.title)}`;
}
export async function shareLink({ title, text, url }) {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
    }
  }
  try { await navigator.clipboard?.writeText(url); return "copied"; } catch { return "cancelled"; }
}

export function shareTrack(track, pushToast, t) {
  const artistName = (track.artists?.length ? track.artists : (track.artist ? [track.artist] : [])).map((a) => a.name).filter(Boolean).join(", ");
  return shareLink({
    title: track.title,
    text: artistName ? `${track.title} \u2014 ${artistName}` : track.title,
    url: buildShareUrl(track),
  }).then((r) => { if (r === "copied") pushToast(t("linkCopied")); return r; });
}

export function useTrackMenuItems(track, opts = {}) {
  const { liked, toggleLike, addToQueueEnd, playNextInQueue } = usePlayer();
  const { openAddToPlaylist, pushToast, t } = useUI();
  const { navigate } = useRouter();
  const isLiked = liked.has(String(track.videoId || track.id));

  const items = [
    { label: isLiked ? t("menuRemoveLiked") : t("menuSaveLiked"), icon: <Heart size={15} fill={isLiked ? "currentColor" : "none"} />, onSelect: () => toggleLike(track) },
    { label: t("menuPlayNext"), icon: <ListMusic size={15} />, onSelect: () => playNextInQueue(track) },
    { label: t("menuAddQueue"), icon: <Plus size={15} />, onSelect: () => addToQueueEnd(track) },
    { label: t("menuAddPlaylist"), icon: <Library size={15} />, onSelect: () => openAddToPlaylist(track) },
    { divider: true },
    { label: t("menuShareSong"), icon: <Share2 size={15} />, onSelect: () => { shareTrack(track, pushToast, t); } },
    { label: t("menuCopyLink"), icon: <Copy size={15} />, onSelect: () => { navigator.clipboard?.writeText(buildShareUrl(track)); pushToast(t("linkCopied")); } },
  ];
  if (track.artist?.id) items.push({ label: t("menuGoArtist"), icon: <Music2 size={15} />, onSelect: () => navigate("artist", { params: { id: track.artist.id } }) });
  if (track.album?.id) items.push({ label: t("menuGoAlbum"), icon: <Music2 size={15} />, onSelect: () => navigate("album", { params: { id: track.album.id } }) });
  if (opts.onRemove) { items.push({ divider: true }); items.push({ label: opts.removeLabel || t("menuRemovePlaylist"), icon: <X size={15} />, onSelect: opts.onRemove }); }
  items.track = track;
  items.removeItem = opts.onRemove ? { label: opts.removeLabel || t("menuRemovePlaylist"), onSelect: opts.onRemove } : null;
  return items;
}

export function filterExplicit(tracks, settings) {
  if (!Array.isArray(tracks)) return tracks;
  if (settings?.explicitContent !== false) return tracks;
  return tracks.filter((tr) => !tr?.explicit);
}

export function TrackRow({ track, index, list, showIndex = true, showAlbum = false, onRemove, removeLabel, queueMode = "single", source = null, note = null, shuffleOverride = null }) {
  const { currentTrack, isPlaying, togglePlay, playSingle, playList, playRadio, selectQueuePosition, liked, toggleLike } = usePlayer();
  const { openContextMenu, t } = useUI();
  const { navigate } = useRouter();
  const isCurrent = currentTrack && currentTrack.id === track.id;
  const isLiked = liked.has(String(track.videoId || track.id));
  const items = useTrackMenuItems(track, { onRemove, removeLabel });

  const handlePlay = () => {
    if (isCurrent) { togglePlay(); return; }
    if (queueMode === "context" && list && list.length) { playList(list, index, source, shuffleOverride); return; }
    if (queueMode === "radio") { playRadio(track, source); return; }
    if (queueMode === "queue") { selectQueuePosition(index); return; }
    playSingle(track, source);
  };
  const handleContext = (e) => { e.preventDefault(); openContextMenu(e.clientX, e.clientY, items); };

  return (
    <div className={`aivy-row ${isCurrent ? "is-current" : ""}`} onContextMenu={handleContext} onPointerEnter={() => { loadTrackArtists(track); }}>
      {showIndex && (
        <div className="idx">
          <span className="num">{index + 1}</span>
          <span className="eq"><EqBars playing={isPlaying} /></span>
        </div>
      )}
      <button className="thumb" onClick={handlePlay} aria-label={isCurrent && isPlaying ? t("pause") : t("play")}>
        <SmartCover src={track.cover} seed={track.id + track.title} size={40} radius={6} />
        <span className="hover-play">{isCurrent && isPlaying ? <Pause size={15} /> : <Play size={15} />}</span>
      </button>
      <div className="meta" onClick={handlePlay} style={{ cursor: "pointer" }}>
        <MarqueeText
          as="span" className="t" text={track.title}
          prefix={track.explicit ? <span className="aivy-explicit-badge" title="Explicit">E</span> : null}
        />
        <span className="a">
          {(track.artists?.length ? track.artists : (track.artist ? [track.artist] : [])).map((a, i, arr) => (
            <React.Fragment key={a.id || a.name || i}>
              <span
                onClick={(e) => { e.stopPropagation(); a.id && navigate("artist", { params: { id: a.id } }); }}
                style={{ cursor: a.id ? "pointer" : "default" }}
              >
                {a.name}
              </span>
              {i < arr.length - 1 ? ", " : ""}
            </React.Fragment>
          ))}
          {!track.artists?.length && !track.artist && "\u2014"}
        </span>
        {note && <span className="row-note">{note}</span>}
      </div>
      {showAlbum && (
        <div className="col-album">
          {track.album?.id ? <span onClick={() => navigate("album", { params: { id: track.album.id } })} style={{ cursor: "pointer" }}>{track.album.title}</span> : (track.album?.title || "")}
        </div>
      )}
      <div className="right">
        <div className={`row-actions ${isLiked ? "liked" : ""}`}>
          <button className={`aivy-icon-btn sm ${isLiked ? "active" : ""}`} onClick={() => toggleLike(track)} aria-label={t("like")}><Heart size={15} fill={isLiked ? "currentColor" : "none"} /></button>
          <button className="aivy-icon-btn sm" onClick={handleContext} aria-label={t("menuMore")}><MoreHorizontal size={15} /></button>
        </div>
        <span className="dur font-mono">{formatDuration(track.duration)}</span>
      </div>
    </div>
  );
}

function EqBars({ playing }) {
  return (
    <span className="eq-bars" aria-hidden="true">
      <span style={{ animationPlayState: playing ? "running" : "paused" }} />
      <span style={{ animationPlayState: playing ? "running" : "paused" }} />
      <span style={{ animationPlayState: playing ? "running" : "paused" }} />
    </span>
  );
}

export function thumbBlur(src) {
  if (!src || typeof src !== "string") return { className: "", style: undefined };
  return { className: "has-blur", style: { "--card-thumb": `url(${JSON.stringify(src)})` } };
}

function CardTrackBase({ track, list }) {
  const { currentTrack, isPlaying, togglePlay, playSingle, playList } = usePlayer();
  const { openContextMenu } = useUI();
  const isCurrent = currentTrack && currentTrack.id === track.id;
  const items = useTrackMenuItems(track);
  const blur = thumbBlur(track.cover);
  const handlePlay = () => {
    if (isCurrent) { togglePlay(); return; }
    if (list && list.length) {
      const idx = list.findIndex((t) => t.id === track.id);
      playList(list, idx === -1 ? 0 : idx);
    } else {
      playSingle(track);
    }
  };
  return (
    <div className={`aivy-card ${blur.className}`} style={blur.style} onContextMenu={(e) => { e.preventDefault(); openContextMenu(e.clientX, e.clientY, items); }}>
      <div className="art-wrap">
        <SmartCover src={track.cover} seed={track.id + track.title} size={140} radius={8} style={{ width: "100%", height: "auto", aspectRatio: "1 / 1" }} />
        <button className="aivy-card-play" onClick={handlePlay} aria-label="Putar">{isCurrent && isPlaying ? <Pause size={16} /> : <Play size={16} />}</button>
      </div>
      <MarqueeText as="div" className="title" text={track.title} />
      <div className="sub">{track.artist?.name}</div>
    </div>
  );
}

export const CardTrack = React.memo(CardTrackBase);

export function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function FlipList({ items, getKey, renderItem, className, as: Tag = "div" }) {
  const containerRef = useRef(null);
  const prevRectsRef = useRef(new Map());
  const animsRef = useRef(new Map());
  const firstRef = useRef(true);
  const orderKey = items.map((it) => getKey(it)).join("|");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const nodes = Array.from(container.children);

    nodes.forEach((node) => {
      const k = node.getAttribute("data-flip-key");
      const prevAnim = animsRef.current.get(k);
      if (prevAnim) {
        prevAnim.cancel();
        animsRef.current.delete(k);
      }
    });

    const newRects = new Map();
    nodes.forEach((node) => {
      const k = node.getAttribute("data-flip-key");
      if (k != null) newRects.set(k, node.getBoundingClientRect());
    });

    if (!firstRef.current && typeof nodes[0]?.animate === "function") {
      let moved = 0;
      nodes.forEach((node) => {
        const k = node.getAttribute("data-flip-key");
        const oldRect = prevRectsRef.current.get(k);
        const newRect = newRects.get(k);
        if (!oldRect || !newRect) return;
        const dx = oldRect.left - newRect.left;
        const dy = oldRect.top - newRect.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

        const delay = Math.min(moved * 9, 160);
        const anim = node.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: 560, delay, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" }
        );
        animsRef.current.set(k, anim);
        const clear = () => { if (animsRef.current.get(k) === anim) animsRef.current.delete(k); };
        anim.addEventListener("finish", clear);
        anim.addEventListener("cancel", clear);
        moved++;
      });
    }
    prevRectsRef.current = newRects;
    firstRef.current = false;
  }, [orderKey]);

  return (
    <Tag ref={containerRef} className={className}>
      {items.map((item, idx) => (
        <div key={getKey(item)} data-flip-key={String(getKey(item))}>
          {renderItem(item, idx)}
        </div>
      ))}
    </Tag>
  );
}

/**
 * Judul lagu yang kepanjangan akan berjalan (marquee) secara otomatis,
 * tapi HANYA di layar mobile (<=860px) dan HANYA jika teksnya memang
 * overflow dari kontainernya. Di desktop selalu statis (ellipsis "...").
 *
 * `as`/`className` menggantikan elemen judul yang biasanya dipakai (mis. "t", "title", "ttl")
 * supaya style lama (font-weight, font-size, dll) tetap kepakai.
 * `prefix`/`suffix` untuk elemen non-teks yang harus tetap diam di tempat (badge "E", "Preview", dll).
 */
export function MarqueeText({ text, className = "", as: Tag = "span", prefix = null, suffix = null, gap = 40, pxPerSecond = 42 }) {
  const isMobile = useIsMobile(860);
  const wrapRef = useRef(null);
  const segRef = useRef(null);
  const [overflow, setOverflow] = useState(false);
  const [duration, setDuration] = useState(10);

  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current, seg = segRef.current;
      if (!wrap || !seg) return;
      const over = seg.scrollWidth - wrap.clientWidth > 2;
      setOverflow(over);
      if (over) setDuration(Math.max(6, (seg.scrollWidth + gap) / pxPerSecond));
    };
    measure();
    let ro;
    if (typeof ResizeObserver !== "undefined" && wrapRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(wrapRef.current);
    }
    window.addEventListener("resize", measure);
    return () => { ro && ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [text, gap, pxPerSecond]);

  const animate = isMobile && overflow;

  return (
    <Tag className={`aivy-marquee-row ${className}`}>
      {prefix}
      <span ref={wrapRef} className="aivy-marquee">
        <span
          className={`aivy-marquee-track ${animate ? "is-animating" : ""}`}
          style={animate ? { animationDuration: `${duration}s` } : undefined}
        >
          <span ref={segRef} className="aivy-marquee-seg">{text}</span>
          {animate && <span className="aivy-marquee-seg" aria-hidden="true">{text}</span>}
        </span>
      </span>
      {suffix}
    </Tag>
  );
}

function CardAlbumBase({ album }) {
  const { navigate } = useRouter();
  const { playList } = usePlayer();
  const { settings } = useUI();
  const compact = !!settings.compactAlbums;
  const blur = thumbBlur(album.cover);
  const handlePlay = async (e) => {
    e.stopPropagation();
    const { Api } = await import("./lib/api.js");
    const full = await Api.album(album.id);
    if (full?.tracks?.length) playList(full.tracks, 0);
  };
  return (
    <div className={`aivy-card ${compact ? "is-compact" : ""} ${blur.className}`} onClick={() => navigate("album", { params: { id: album.id } })} style={{ cursor: "pointer", ...blur.style }}>
      <div className="art-wrap">
        <SmartCover src={album.cover} seed={"album" + album.id + album.title} size={compact ? 72 : 140} radius={compact ? 6 : 8} style={{ width: "100%", height: "auto", aspectRatio: "1 / 1" }} />
        <button className="aivy-card-play" onClick={handlePlay} aria-label="Putar album"><Play size={compact ? 13 : 16} /></button>
      </div>
      <div className="title">{album.title}</div>
      {!compact && <div className="sub">{album.artist?.name}{album.releaseDate ? ` \u00b7 ${String(album.releaseDate).slice(0, 4)}` : ""}</div>}
    </div>
  );
}

export const CardAlbum = React.memo(CardAlbumBase);

function CardArtistBase({ artist }) {
  const { navigate } = useRouter();
  const { t, settings } = useUI();
  const compact = !!settings.compactArtists;
  const blur = thumbBlur(artist.image);
  if (compact) {
    return (
      <div className={`aivy-card aivy-card-artist is-compact is-row ${blur.className}`} onClick={() => navigate("artist", { params: { id: artist.id } })} style={{ cursor: "pointer", ...blur.style }}>
        <div className="art-wrap round">
          <SmartCover src={artist.image} seed={"artist" + artist.id + artist.name} size={44} radius={999} style={{ width: 44, height: 44, borderRadius: "50%" }} />
        </div>
        <div className="row-meta">
          <div className="title">{artist.name}</div>
          <div className="sub">{t("artistLabel")}</div>
        </div>
      </div>
    );
  }
  return (
    <div className={`aivy-card ${blur.className}`} onClick={() => navigate("artist", { params: { id: artist.id } })} style={{ cursor: "pointer", ...blur.style }}>
      <div className="art-wrap round">
        <SmartCover src={artist.image} seed={"artist" + artist.id + artist.name} size={128} radius={999} style={{ width: "100%", height: "100%", aspectRatio: "1 / 1", borderRadius: "50%" }} />
      </div>
      <div className="title" style={{ textAlign: "center" }}>{artist.name}</div>
      <div className="sub" style={{ textAlign: "center" }}>{t("artistLabel")}</div>
    </div>
  );
}

export const CardArtist = React.memo(CardArtistBase);

export function HoverRail({ children, className = "", step = 0.86 }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  const childCount = React.Children.count(children);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({ start: el.scrollLeft <= 2, end: max <= 2 || el.scrollLeft >= max - 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", measure); ro.disconnect(); };
  }, [measure, childCount]);

  const scrollBy = (dir) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * step, behavior: "smooth" });
  };

  return (
    <div className={`aivy-hoverrail ${className}`}>
      <button
        type="button"
        className="aivy-hoverrail-btn prev"
        onClick={() => scrollBy(-1)}
        disabled={edge.start}
        aria-label="Sebelumnya"
      >
        <ChevronLeft size={20} />
      </button>
      <div className="aivy-hoverrail-track" ref={ref}>{children}</div>
      <button
        type="button"
        className="aivy-hoverrail-btn next"
        onClick={() => scrollBy(1)}
        disabled={edge.end}
        aria-label="Berikutnya"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

export function ToastHost({ isMobile }) {
  const { toasts } = useUI();
  if (!toasts.length) return null;
  return (
    <div className={`aivy-toast-host ${isMobile ? "is-mobile" : ""}`}>
      {toasts.map((t) => <div key={t.id} className="aivy-toast">{t.message}</div>)}
    </div>
  );
}

export function AddToPlaylistModal() {
  const { addToPlaylistTarget, closeAddToPlaylist, pushToast, t } = useUI();
  const { playlists, addToPlaylist, createPlaylist } = usePlayer();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (creating) inputRef.current?.focus(); }, [creating]);
  if (!addToPlaylistTarget) return null;

  const targets = Array.isArray(addToPlaylistTarget) ? addToPlaylistTarget : [addToPlaylistTarget];

  const handleAdd = (playlistId) => {
    targets.forEach((track) => addToPlaylist(playlistId, track));
    if (targets.length > 1) pushToast(t("toastAddedToPlaylist"));
    closeAddToPlaylist();
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = await createPlaylist(trimmed);
    if (id) targets.forEach((track) => addToPlaylist(id, track));
    closeAddToPlaylist();
  };

  return (
    <div className="aivy-modal-backdrop" onClick={closeAddToPlaylist}>
      <div className="aivy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aivy-modal-head">
          <div className="aivy-modal-title">{t("addToPlaylistTitle")}</div>
          <button className="aivy-icon-btn sm" onClick={closeAddToPlaylist} aria-label={t("close")}><X size={17} /></button>
        </div>
        <div className="aivy-playlist-pick">
          {playlists.map((pl) => (
            <button key={pl.id} onClick={() => handleAdd(pl.id)}>
              <Library size={15} color="var(--ink-faint)" />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pl.name}</span>
              {targets.every((tr) => pl.songs?.some((s) => s.id === tr.id)) && <Check size={15} color="var(--accent-strong)" />}
            </button>
          ))}
          {!playlists.length && <div className="eyebrow" style={{ padding: "8px 10px" }}>{t("noPlaylistsYet")}</div>}
        </div>
        {creating ? (
          <div className="aivy-field" style={{ marginBottom: 4 }}>
            <input ref={inputRef} className="aivy-input" placeholder={t("newPlaylistNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="aivy-btn-primary" style={{ flex: 1 }} onClick={handleCreate}>{t("createAndAdd")}</button>
              <button className="aivy-btn-ghost" onClick={() => setCreating(false)}>{t("cancel")}</button>
            </div>
          </div>
        ) : (
          <button className="aivy-btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={() => setCreating(true)}><Plus size={15} /> {t("newPlaylist")}</button>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog(
  { open, title, message, confirmLabel, cancelLabel, danger = true, onConfirm, onCancel }
) {
  const { t } = useUI();
  if (!open) return null;
  return (
    <div className="aivy-modal-backdrop" onClick={onCancel}>
      <div className="aivy-modal aivy-confirm-modal" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <div className="aivy-confirm-icon"><AlertTriangle size={22} color="var(--berry)" /></div>
        <div className="aivy-modal-title">{title}</div>
        {message && <p className="aivy-confirm-msg">{message}</p>}
        <div className="aivy-confirm-actions">
          <button className="aivy-btn-ghost" onClick={onCancel}>{cancelLabel || t("cancel")}</button>
          <button className={`aivy-btn-primary ${danger ? "danger" : ""}`} onClick={onConfirm}>{confirmLabel || t("confirmDeleteDefault")}</button>
        </div>
      </div>
    </div>
  );
}

export function SkeletonTrackRow() {
  return (
    <div className="aivy-skel-row">
      <div className="aivy-skel-thumb aivy-skeleton" />
      <div className="aivy-skel-lines">
        <div className="aivy-skel-line w60 aivy-skeleton" />
        <div className="aivy-skel-line w35 aivy-skeleton" />
      </div>
    </div>
  );
}
export function SkeletonList({ count = 8 }) {
  return <div>{Array.from({ length: count }).map((_, i) => <SkeletonTrackRow key={i} />)}</div>;
}

export function SkeletonHeroPage({ round = false, rows = 6 }) {
  return (
    <div className="aivy-view-enter aivy-skel-hero-page">
      <div className="aivy-hero">
        <div className={`aivy-skel-hero-art aivy-skeleton ${round ? "round" : ""}`} />
        <div className="aivy-hero-meta" style={{ flex: 1, minWidth: 0 }}>
          <div className="aivy-skel-line w35 aivy-skeleton" style={{ height: 12, marginBottom: 14 }} />
          <div className="aivy-skel-line aivy-skeleton" style={{ height: 30, width: "70%", marginBottom: 10 }} />
          <div className="aivy-skel-line w35 aivy-skeleton" style={{ height: 12 }} />
        </div>
      </div>
      <div className="aivy-hero-actions">
        <div className="aivy-skeleton" style={{ width: 52, height: 52, borderRadius: "50%" }} />
        <div className="aivy-skeleton" style={{ width: 90, height: 36, borderRadius: "var(--radius-pill, 999px)" }} />
      </div>
      <SkeletonList count={rows} />
    </div>
  );
}

export function TransportButtons({ big = false, minimal = false }) {
  const { isPlaying, togglePlay, next, prev, shuffle, toggleShuffle, repeat, cycleRepeat, currentTrack, room } = usePlayer();
  const { authUser, t } = useUI();
  const [pulse, setPulse] = useState(null);
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  const isHost = !room || !authUser || room.hostId === authUser.id;
  const controlLocked = room && room.hostOnlyControl && !isHost;
  const handlePrev = () => { prev(); setPulse("prev"); };
  const handleNext = () => { next(false); setPulse("next"); };
  const clearPulse = () => setPulse(null);
  return (
    <div className="aivy-transport-btns">
      {!minimal && <button className={`aivy-icon-btn ${shuffle ? "active" : ""}`} onClick={toggleShuffle} aria-label={t("shuffle")} aria-pressed={shuffle} disabled={!!room}><Shuffle size={big ? 18 : 16} /></button>}
      <button className={`aivy-icon-btn skip-prev ${pulse === "prev" ? "is-pulsing" : ""}`} onClick={handlePrev} onAnimationEnd={clearPulse} disabled={!currentTrack || controlLocked} aria-label={t("previous")}><SkipBack size={big ? 22 : 18} fill="currentColor" /></button>
      <button className="aivy-play-btn" onClick={togglePlay} disabled={!currentTrack || controlLocked} aria-label={isPlaying ? t("pause") : t("play")}>
        {isPlaying ? <Pause size={big ? 24 : 16} fill="currentColor" /> : <Play size={big ? 24 : 16} fill="currentColor" />}
      </button>
      <button className={`aivy-icon-btn skip-next ${pulse === "next" ? "is-pulsing" : ""}`} onClick={handleNext} onAnimationEnd={clearPulse} disabled={!currentTrack || controlLocked} aria-label={t("next")}><SkipForward size={big ? 22 : 18} fill="currentColor" /></button>
      {!minimal && <button className={`aivy-icon-btn ${repeat !== "off" ? "active" : ""}`} onClick={cycleRepeat} aria-label={t("repeat")} aria-pressed={repeat !== "off"} disabled={!!room}><RepeatIcon size={big ? 18 : 16} /></button>}
    </div>
  );
}

export function PlayerBar({ onOpenNowPlaying }) {
  const { currentTrack, liked, toggleLike, isPreviewClip, loadingAudio, currentTrackHasLyrics, isPlaying, upNext } = usePlayer();
  const { navigate } = useRouter();
  const { toggleLyrics, sidebarQueueOpen, toggleSidebarQueue, t, settings } = useUI();
  const { registerFill, registerThumb, getRatio, onSeekRatio, currentTime, duration } = useScrubberBinding();

  const nextUpTrack = upNext?.[0];
  useEffect(() => {
    if (!settings.animatedArtwork || settings.reducedMotion) return;
    if (!nextUpTrack?.title) return;
    const id = setTimeout(() => prefetchAnimatedArtwork(nextUpTrack.title, nextUpTrack.artist?.name), 1500);
    return () => clearTimeout(id);
  }, [nextUpTrack?.title, nextUpTrack?.artist?.name, settings.animatedArtwork, settings.reducedMotion]);
  const handleCoverClick = () => {
    if (!currentTrack) return;
    const mode = settings.nowPlayingView || "album";
    if (mode === "lyrics") toggleLyrics();
    else if (mode === "fullscreen") onOpenNowPlaying?.();
    else if (currentTrack.album?.id) navigate("album", { params: { id: currentTrack.album.id } });
    else onOpenNowPlaying?.();
  };
  const isLiked = currentTrack && liked.has(String(currentTrack.videoId || currentTrack.id));
  const lyricsDisabled = !currentTrack || !currentTrackHasLyrics;

  return (
    <div className={`aivy-player ${isPlaying ? "is-playing" : ""}`}>
      <div className="now">
        {currentTrack ? (
          <>
            <span
              className={`aivy-player-cover ${settings.cdCoverSpin ? "cd-spin" : ""} ${settings.noRoundCover ? "no-round" : ""}`}
              onClick={handleCoverClick} role="button" tabIndex={0} style={{ cursor: "pointer" }}
              onKeyDown={(e) => { if (e.key === "Enter") handleCoverClick(); }}
            >
              <SmartCover src={currentTrack.cover} seed={currentTrack.id + currentTrack.title} size={52} radius={settings.noRoundCover ? 0 : 8} />
            </span>
            <div className="meta">
              <MarqueeText as="span" className="t" text={currentTrack.title} />
              <span className="a" onClick={() => currentTrack.artist?.id && navigate("artist", { params: { id: currentTrack.artist.id } })} style={{ cursor: "pointer" }}>
                {currentTrack.artist?.name}{isPreviewClip && <span className="preview-tag">{` \u00b7 ${t("previewTag")}`}</span>}
              </span>
            </div>
            <button className={`aivy-icon-btn sm ${isLiked ? "active" : ""}`} onClick={() => toggleLike(currentTrack)} aria-label={t("like")}><Heart size={16} fill={isLiked ? "currentColor" : "none"} /></button>
          </>
        ) : (
          <>
            <div style={{ width: 52, height: 52, borderRadius: 8, background: "var(--bg-elev-2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <StarMark size={22} color="var(--ink-faint)" />
            </div>
            <span className="placeholder">{t("nothingPlaying")}</span>
          </>
        )}
      </div>
      <div className="aivy-transport">
        <TransportButtons />
        <div className="aivy-scrubber-row">
          <span className="aivy-time font-mono">{loadingAudio ? "\u2013\u2013" : formatTime(currentTime)}</span>
          <Scrubber
            getRatio={getRatio} onSeekRatio={onSeekRatio} registerFill={registerFill} registerThumb={registerThumb} loading={loadingAudio}
            waveformSeed={settings.waveformSeekbar && currentTrack ? String(currentTrack.id || currentTrack.title || "") : null}
          />
          <span className="aivy-time right font-mono">{loadingAudio ? "\u2013\u2013" : formatTime(duration)}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "min(20%, 220px)", justifyContent: "flex-end" }}>
        <button className={`aivy-icon-btn sm ${sidebarQueueOpen ? "active" : ""}`} onClick={toggleSidebarQueue} aria-label={t("lyricsQueueBtn")} title={t("lyricsQueueBtn")}><ListMusic size={16} /></button>
        <button className="aivy-icon-btn sm" onClick={toggleLyrics} disabled={lyricsDisabled} aria-label={t("lyrics")} title={lyricsDisabled && currentTrack ? t("lyricsUnavailable") : t("lyrics")}><Mic2 size={16} /></button>
        <VolumeControl />
      </div>
    </div>
  );
}

export function MiniPlayer({ onExpand }) {
  const { currentTrack, isPlaying, togglePlay, next, loadingAudio, registerProgressEl } = usePlayer();
  const { t, settings } = useUI();
  const [pulsing, setPulsing] = useState(false);
  const miniRef = useRef(null);
  const ringCleanupRef = useRef(null);
  const registerRing = useCallback((el) => {
    ringCleanupRef.current?.();
    ringCleanupRef.current = el ? registerProgressEl(el, "ring") : null;
  }, [registerProgressEl]);
  const handleExpand = () => onExpand?.();
  const swipe = useVerticalSwipe({ active: !!currentTrack, direction: "up", onTrigger: handleExpand, dragRef: miniRef, threshold: 36, velocityThreshold: 0.35 });
  if (!currentTrack) return null;
  return (
    <div
      className={`aivy-mini-player ${isPlaying ? "is-playing" : ""}`} ref={miniRef} onClick={handleExpand} role="button" tabIndex={0} aria-label={t("openNowPlaying")}
      onPointerDown={swipe.onPointerDown} onPointerMove={swipe.onPointerMove} onPointerUp={swipe.onPointerUp} onPointerCancel={swipe.onPointerCancel}
    >
      <GlassLayers />
      <span className={`aivy-mini-cover ${settings.noRoundCover ? "no-round" : ""}`}>
        <SmartCover src={currentTrack.cover} seed={currentTrack.id + currentTrack.title} size={40} radius={settings.noRoundCover ? 0 : 6} />
      </span>
      <div className="meta"><MarqueeText as="span" className="t" text={currentTrack.title} /><span className="a">{currentTrack.artist?.name}</span></div>
      <button className="aivy-icon-btn" onClick={(e) => { e.stopPropagation(); togglePlay(); }} aria-label={isPlaying ? t("pause") : t("play")}>
        {isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
      </button>
      <button
        className={`aivy-icon-btn skip-next ${pulsing ? "is-pulsing" : ""}`}
        onClick={(e) => { e.stopPropagation(); next(false); setPulsing(true); }}
        onAnimationEnd={() => setPulsing(false)}
        aria-label={t("next")}
      ><SkipForward size={18} fill="currentColor" /></button>
      <svg className={`mini-ring ${loadingAudio ? "is-loading" : ""}`} aria-hidden="true" focusable="false">
        <rect className="track" x="0" y="0" width="100%" height="100%" rx="29" ry="29" pathLength="1" />
        {loadingAudio
          ? <rect key="run" className="run" x="0" y="0" width="100%" height="100%" rx="29" ry="29" pathLength="1" />
          : <rect key="fill" className="fill" x="0" y="0" width="100%" height="100%" rx="29" ry="29" pathLength="1" ref={registerRing} />}
      </svg>
    </div>
  );
}

export function MobileNowPlayingIconRow({ lyricsActive, onToggleLyrics, lyricsDisabled, onOpenQueue }) {
  const { t, pushToast } = useUI();
  const handleAirplay = () => pushToast(t("airplayUnavailable", "Output perangkat tidak tersedia di browser"));
  return (
    <div className="aivy-sheet-icon-row">
      <button
        className={`aivy-icon-btn ${lyricsActive ? "active" : ""}`}
        onClick={onToggleLyrics}
        disabled={lyricsDisabled}
        aria-label={t("lyrics")}
        title={lyricsDisabled ? t("lyricsUnavailable") : t("lyrics")}
      >
        <MessageSquareQuote size={18} />
      </button>
      <button className="aivy-icon-btn" onClick={handleAirplay} aria-label="AirPlay"><Airplay size={18} /></button>
      <button className="aivy-icon-btn" onClick={onOpenQueue} aria-label={t("openQueue")}><ListMusic size={18} /></button>
    </div>
  );
}

const HERO_FLIP_MS = 520;

function useHeroFlip(mode, targets) {
  const firstRects = useRef(null);
  const cleanupTimer = useRef(null);

  const resetStyles = () => {
    targets.forEach(({ ref }) => {
      const el = ref.current;
      if (!el) return;
      el.style.transition = "";
      el.style.transform = "";
      el.style.transformOrigin = "";
      el.style.backfaceVisibility = "";
      el.style.willChange = "";
    });
  };

  const capture = () => {
    const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) { firstRects.current = null; return; }
    const rects = targets.map(({ ref }) => (ref.current ? ref.current.getBoundingClientRect() : null));
    targets.forEach(({ ref }) => {
      const el = ref.current;
      if (!el) return;
      el.style.willChange = "transform";
      el.style.backfaceVisibility = "hidden";
    });
    firstRects.current = rects;
  };

  useLayoutEffect(() => {
    const firstRectsList = firstRects.current;
    firstRects.current = null;
    if (!firstRectsList) return undefined;
    const endHeavy = beginHeavyTransition(HERO_FLIP_MS + 200);
    const plans = [];
    targets.forEach(({ ref, uniform }, i) => {
      const el = ref.current;
      const firstRect = firstRectsList[i];
      if (!el || !firstRect || !firstRect.width || !firstRect.height) return;
      const last = el.getBoundingClientRect();
      if (!last.width || !last.height) return;
      const sy = firstRect.height / last.height;
      plans.push({
        el,
        dx: firstRect.left - last.left,
        dy: firstRect.top - last.top,
        sx: uniform ? sy : firstRect.width / last.width,
        sy,
      });
    });

    if (!plans.length) { resetStyles(); endHeavy(); return undefined; }
    plans.forEach(({ el, dx, dy, sx, sy }) => {
      el.style.transition = "none";
      el.style.transformOrigin = "top left";
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    });
    void plans[0].el.offsetWidth;
    plans.forEach(({ el }) => {
      el.style.transition = `transform ${HERO_FLIP_MS}ms cubic-bezier(.22,.85,.32,1)`;
      el.style.transform = "translate(0px, 0px) scale(1, 1)";
    });

    clearTimeout(cleanupTimer.current);
    cleanupTimer.current = setTimeout(() => { resetStyles(); endHeavy(); }, HERO_FLIP_MS + 40);

    return () => { clearTimeout(cleanupTimer.current); endHeavy(); };
  }, [mode]);

  return capture;
}

function useDominantColor(src) {
  const [color, setColor] = useState(null);
  useEffect(() => {
    if (!src) { setColor(null); return; }
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!alive) return;
      try {
        const canvas = document.createElement("canvas");
        const size = 24;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 32) continue;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
        if (!n) return;
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const boost = max - min < 28 ? 1.25 : 1.08;
        const cl = (v) => Math.max(0, Math.min(255, Math.round(128 + (v - 128) * boost)));
        if (alive) setColor(`rgb(${cl(r)}, ${cl(g)}, ${cl(b)})`);
      } catch {  }
    };
    img.onerror = () => {};
    img.src = src;
    return () => { alive = false; };
  }, [src]);
  return color;
}

function useTilt({ enabled, distance = 10, speed = 240 }) {
  const ref = useRef(null);
  const [style, setStyle] = useState({});
  const onMove = useCallback((e) => {
    if (!enabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setStyle({
      transform: `perspective(700px) rotateX(${(-py * distance).toFixed(2)}deg) rotateY(${(px * distance).toFixed(2)}deg) scale3d(1.02,1.02,1.02)`,
      transition: `transform ${Math.max(30, speed / 8)}ms ease-out`,
    });
  }, [enabled, distance, speed]);
  const onLeave = useCallback(() => {
    if (!enabled) return;
    setStyle({ transform: "perspective(700px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)", transition: `transform ${speed}ms ease` });
  }, [enabled, speed]);
  useEffect(() => { if (!enabled) setStyle({}); }, [enabled]);
  return { ref, style, onMove, onLeave };
}
function themeColorSet() {
  if (typeof window === "undefined") return ["#B5B5B5", "#E6E6E6", "#FFFFFF"];
  const cs = getComputedStyle(document.body);
  const pick = (name, fallback) => (cs.getPropertyValue(name) || "").trim() || fallback;
  return [
    pick("--artist-accent", pick("--ink-dim", "#A6A6A6")),
    pick("--accent", "#E6E6E6"),
    pick("--accent-strong", "#FFFFFF"),
  ];
}

const VISUALIZER_COLOR_SETS = {
  auto: null,
  ocean: ["#4fa3e3", "#7fd3ff", "#dfe9f5"],
  martian: ["#e36f4f", "#ffb27f", "#f5ded0"],
  sunset: ["#e35f8a", "#ffb27f", "#fff0d6"],
  kaleido: ["#a78bfa", "#f472b6", "#7fd1e6"],
};

export function VisualizerCanvas({ style, mode = "solid", sensitivity = 60, brightness = 100, preset = "auto", height = 220, running = true }) {
  const { getAnalyser, isPlaying } = usePlayer();
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const phaseRef = useRef(0);
  const historyRef = useRef([]);
  const heavyRef = useRef(isHeavyTransition());

  useEffect(() => subscribeHeavyTransition((active) => { heavyRef.current = active; }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (!running) return undefined;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return undefined;
    const dpr = Math.min(isLowEndDevice() ? 1 : 2, window.devicePixelRatio || 1);
    const colors = VISUALIZER_COLOR_SETS[preset] || themeColorSet();
    const sens = Math.max(0.1, sensitivity / 60);
    const bright = Math.max(0.2, brightness / 100);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, rect.width * dpr);
      canvas.height = Math.max(1, rect.height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    let freqBuf = null;
    let timeBuf = null;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (heavyRef.current) return;
      try {
        drawFrame();
      } catch (err) {
        console.error("visualizer draw error:", err);
        cancelAnimationFrame(rafRef.current);
      }
    };
    const drawFrame = () => {
      const w = canvas.width, h = canvas.height;
      const analyser = getAnalyser?.();
      let freq = null, time = null;
      if (analyser) {
        const bins = analyser.frequencyBinCount;
        if (!freqBuf || freqBuf.length !== bins) {
          freqBuf = new Uint8Array(bins);
          timeBuf = new Uint8Array(bins);
        }
        freq = freqBuf;
        time = timeBuf;
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(time);
      }
      const active = isPlaying && analyser;
      phaseRef.current += 0.02;

      ctx2d.clearRect(0, 0, w, h);
      if (mode === "solid") {
        ctx2d.fillStyle = "rgba(10,12,8,1)";
        ctx2d.fillRect(0, 0, w, h);
      }
      ctx2d.globalAlpha = bright;

      if (style === "lcd") {
        const bars = 32;
        const gap = w / bars;
        for (let i = 0; i < bars; i++) {
          const v = active ? (freq[Math.floor((i / bars) * freq.length)] / 255) : 0.06 + 0.03 * Math.sin(phaseRef.current + i);
          const barH = Math.min(h, v * h * sens);
          ctx2d.fillStyle = colors[i % colors.length];
          const segH = h / 22;
          const segs = Math.floor(barH / segH);
          for (let s = 0; s < segs; s++) {
            ctx2d.fillRect(i * gap + gap * 0.15, h - (s + 1) * segH + segH * 0.15, gap * 0.7, segH * 0.7);
          }
        }
      } else if (style === "pixels") {
        const cols = 24, rows = 14;
        const cw = w / cols, ch = h / rows;
        for (let x = 0; x < cols; x++) {
          const v = active ? (freq[Math.floor((x / cols) * freq.length)] / 255) : 0.15 + 0.1 * Math.sin(phaseRef.current + x * 0.5);
          const litRows = Math.floor(v * rows * sens);
          for (let y = 0; y < rows; y++) {
            const lit = y >= rows - litRows;
            ctx2d.fillStyle = lit ? colors[(x + y) % colors.length] : "rgba(255,255,255,.04)";
            ctx2d.fillRect(x * cw + cw * 0.08, y * ch + ch * 0.08, cw * 0.84, ch * 0.84);
          }
        }
      } else if (style === "particles") {
        const n = 60;
        for (let i = 0; i < n; i++) {
          const bin = active ? freq[Math.floor((i / n) * freq.length)] / 255 : 0.15;
          const angle = (i / n) * Math.PI * 2 + phaseRef.current * 0.3;
          const r = (h * 0.15) + bin * h * 0.35 * sens;
          const cx = w / 2 + Math.cos(angle) * r;
          const cy = h / 2 + Math.sin(angle) * r;
          ctx2d.fillStyle = colors[i % colors.length];
          ctx2d.beginPath();
          ctx2d.arc(cx, cy, 2 + bin * 6 * sens, 0, Math.PI * 2);
          ctx2d.fill();
        }
      } else if (style === "unknown") {
        const rows = 10;
        historyRef.current.unshift(time ? Array.from(time) : new Array(64).fill(128));
        if (historyRef.current.length > rows) historyRef.current.length = rows;
        historyRef.current.forEach((row, ri) => {
          ctx2d.beginPath();
          const yBase = h * (0.25 + (ri / rows) * 0.6);
          const step = w / row.length;
          row.forEach((v, i) => {
            const amp = active ? ((v - 128) / 128) * h * 0.18 * sens : 0.01 * Math.sin(phaseRef.current + i * 0.3) * h;
            const x = i * step, y = yBase - amp - ri * (h * 0.02);
            if (i === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
          });
          ctx2d.strokeStyle = `rgba(255,255,255,${0.9 - ri * 0.07})`;
          ctx2d.lineWidth = 1.4;
          ctx2d.stroke();
        });
      } else if (style === "butterchurn") {
        const blobs = 5;
        for (let i = 0; i < blobs; i++) {
          const bin = active ? freq[Math.floor((i / blobs) * freq.length)] / 255 : 0.2;
          const ang = phaseRef.current * (0.4 + i * 0.15) + i;
          const cx = w / 2 + Math.cos(ang) * w * 0.22;
          const cy = h / 2 + Math.sin(ang * 1.3) * h * 0.22;
          const rad = (h * 0.18 + bin * h * 0.28 * sens);
          const grad = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, rad);
          grad.addColorStop(0, colors[i % colors.length] + "cc");
          grad.addColorStop(1, "transparent");
          ctx2d.fillStyle = grad;
          ctx2d.beginPath();
          ctx2d.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx2d.fill();
        }
      } else if (style === "kawarp") {
        const cols = 20, rows = 12;
        ctx2d.strokeStyle = colors[0];
        ctx2d.lineWidth = 1;
        for (let y = 0; y <= rows; y++) {
          ctx2d.beginPath();
          for (let x = 0; x <= cols; x++) {
            const bin = active ? freq[Math.floor(((x + y) % freq.length))] / 255 : 0.1;
            const warp = Math.sin(phaseRef.current + x * 0.4 + y * 0.4) * (8 + bin * 30 * sens);
            const px = (x / cols) * w;
            const py = (y / rows) * h + warp;
            if (x === 0) ctx2d.moveTo(px, py); else ctx2d.lineTo(px, py);
          }
          ctx2d.globalAlpha = bright * 0.5;
          ctx2d.stroke();
        }
        ctx2d.globalAlpha = bright;
      }
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [style, mode, sensitivity, brightness, preset, getAnalyser, isPlaying, running]);

  return <canvas ref={canvasRef} className={`aivy-visualizer-canvas ${mode}`} style={{ height }} />;
}

export function NowPlayingVisualizer({ running = true }) {
  const { settings } = useUI();
  const [cyclePreset, setCyclePreset] = useState(settings.visualizerPreset || "auto");
  const presets = Object.keys(VISUALIZER_COLOR_SETS);

  useEffect(() => {
    if (!running) return undefined;
    if (!settings.cyclePresets) { setCyclePreset(settings.visualizerPreset || "auto"); return undefined; }
    const durMs = Math.max(3, Number(settings.cycleDuration) || 30) * 1000;
    const id = setInterval(() => {
      setCyclePreset((prev) => {
        if (settings.randomizePresets) {
          const opts = presets.filter((p) => p !== prev);
          return opts[Math.floor(Math.random() * opts.length)] || prev;
        }
        const idx = presets.indexOf(prev);
        return presets[(idx + 1) % presets.length];
      });
    }, durMs);
    return () => clearInterval(id);
  }, [running, settings.cyclePresets, settings.cycleDuration, settings.randomizePresets, settings.visualizerPreset]);

  if (!settings.visualizerEnabled) return null;
  return (
    <VisualizerCanvas
      mode={settings.visualizerMode || "solid"}
      style={settings.visualizerStyle || "butterchurn"}
      sensitivity={Number(settings.visualizerSensitivity) || 60}
      brightness={Number(settings.visualizerBrightness) || 100}
      preset={cyclePreset}
      running={running}
    />
  );
}

const NPX_COVER_FILL_STYLE = { width: "100%", height: "100%" };

export function NowPlayingSheet({ open, onClose, onOpenQueue }) {
  const {
    currentTrack, seekTo, isPreviewClip, audioFormat,
    liked, toggleLike, loadingAudio, currentTrackHasLyrics, isPlaying, togglePlay, next, prev,
  } = usePlayer();
  const playerTime = usePlayerTime();
  const { navigate } = useRouter();
  const { t, settings, lyricsOpen, toggleLyrics, pushToast } = useUI();
  const { registerFill, registerThumb, getRatio, onSeekRatio, currentTime, duration } = useScrubberBinding();
  const clientDynamicColor = useDominantColor(settings.dynamicColors ? currentTrack?.cover : null);
  const [serverDominantColor, setServerDominantColor] = useState(null);
  useEffect(() => { setServerDominantColor(null); }, [currentTrack?.id]);

  const dynamicColor = settings.dynamicColors ? (serverDominantColor || clientDynamicColor) : null;
  const reduceMotion = !!settings.reducedMotion || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const tilt = useTilt({ enabled: !!settings.tiltCover, distance: Number(settings.tiltDistance) || 10, speed: Number(settings.tiltSpeed) || 240 });
  const isLiked = currentTrack && liked.has(String(currentTrack.videoId || currentTrack.id));
  const lyricsDisabled = !currentTrack || !currentTrackHasLyrics;
  const formatLabel = audioFormat && audioFormat !== "unavailable" ? audioFormat.label : null;
  const [moreOpen, setMoreOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [aodOpen, setAodOpen] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [artworkReloadToken, setArtworkReloadToken] = useState(0);
  const handleMore = () => { if (!currentTrack) return; setMoreOpen(true); };
  const handleReloadArtwork = () => {
    if (!settings.animatedArtwork) {
      pushToast(t("npArtworkReloadNeedsSetting"));
      return;
    }
    setArtworkReloadToken((n) => n + 1);
  };
  const handleArtworkReloadResult = (status) => {
    if (status === "success") pushToast(t("npArtworkReloaded"));
    else if (status === "rate_limited") pushToast(t("npArtworkReloadRateLimited"));
    else if (status === "not_found") pushToast(t("npArtworkReloadFailed"));
    else pushToast(t("npArtworkReloadError"));
  };
  const reloadResultRef = useRef(handleArtworkReloadResult);
  reloadResultRef.current = handleArtworkReloadResult;
  const onReloadResultStable = useCallback((status) => reloadResultRef.current(status), []);
  const handleFullscreenCoverClick = () => {
    const action = settings.fullscreenCoverClick || "exit";
    if (action === "exit") onClose();
    else if (action === "hide") setUiHidden((h) => !h);
    else if (action === "pause") togglePlay();
    else if (action === "next") next(false);
    else if (action === "prev") prev();
  };
  useEffect(() => { if (!open) setUiHidden(false); }, [open]);
  useEffect(() => {
    const end = beginHeavyTransition(500);
    return end;
  }, [open]);
  useEffect(() => { setUiHidden(false); }, [currentTrack?.id]);

  const lyricsMode = !!(open && lyricsOpen);
  const [singMode, setSingMode] = useState(false);
  const [lyricsMounted, setLyricsMounted] = useState(false);
  const [lyricsUnsynced, setLyricsUnsynced] = useState(false);
  const [suppressLyricsBlur, setSuppressLyricsBlur] = useState(isHeavyTransition());
  useEffect(() => subscribeHeavyTransition(setSuppressLyricsBlur), []);

  const coverRef = useRef(null);
  const metaRef = useRef(null);
  const controlsRef = useRef(null);
  const sheetRef = useRef(null);
  const flipTargets = useRef([
    { ref: coverRef },
    { ref: metaRef, uniform: true },
    { ref: controlsRef, uniform: true },
  ]).current;
  const captureHeroFlip = useHeroFlip(lyricsMode, flipTargets);

  const bodyScrollRef = useRef(null);
  const handleGrabberTap = () => onClose();
  const swipeDown = useVerticalSwipe({ active: open, direction: "down", onTrigger: handleGrabberTap, dragRef: sheetRef, scrollRef: bodyScrollRef });

  const trackKey = currentTrack?.id;
  useEffect(() => { setSingMode(false); setLyricsUnsynced(false); }, [trackKey]);
  useEffect(() => { if (lyricsMode) setLyricsMounted(true); else setLyricsUnsynced(false); }, [lyricsMode]);
  useEffect(() => {
    if (!open || lyricsMounted || lyricsDisabled) return undefined;
    let idleId = null;
    const idle = typeof window !== "undefined" && window.requestIdleCallback;
    const timer = setTimeout(() => {
      if (idle) idleId = window.requestIdleCallback(() => setLyricsMounted(true), { timeout: 2000 });
      else setLyricsMounted(true);
    }, 500);
    return () => {
      clearTimeout(timer);
      if (idleId != null && window.cancelIdleCallback) window.cancelIdleCallback(idleId);
    };
  }, [open, lyricsMounted, lyricsDisabled]);

  const handleLyricsToggle = () => { captureHeroFlip(); toggleLyrics(); };

  const scrollToActiveLyric = () => {
    const el = document.getElementById("aivy-am-lyrics-mobile");
    if (!el) return;
    if (typeof el.resumeAutoScroll === "function") {
      el.resumeAutoScroll();
    }
    setLyricsUnsynced(false);
  };

  useEffect(() => {
    if (!lyricsMounted) return undefined;
    let observer;
    let retryTimer;
    let tries = 0;

    const attach = () => {
      const el = document.getElementById("aivy-am-lyrics-mobile");
      const container = el?.lyricsContainer;
      if (!container) {
        if (tries++ < 25) retryTimer = setTimeout(attach, 200);
        return;
      }
      const sync = () => setLyricsUnsynced(container.classList.contains("user-scrolling"));
      sync();
      observer = new MutationObserver(sync);
      observer.observe(container, { attributes: true, attributeFilter: ["class"] });
    };
    attach();

    return () => {
      clearTimeout(retryTimer);
      observer?.disconnect();
    };
  }, [lyricsMounted, trackKey]);

  const remaining = Math.max(0, (duration || 0) - (currentTime || 0));
  const frozenLyricsTimeRef = useRef(0);
  if (open) frozenLyricsTimeRef.current = playerTime;
  const sheetLyricsTime = open ? playerTime : frozenLyricsTimeRef.current;
  const coverArt = useMemo(() => (
    <AnimatedCover
      src={currentTrack?.cover} seed={(currentTrack?.id || "") + (currentTrack?.title || "")} size={320} radius={10}
      style={NPX_COVER_FILL_STYLE}
      song={currentTrack?.title} artist={currentTrack?.artist?.name}
      animated={!!settings.animatedArtwork} reduceMotion={reduceMotion}
      onColor={setServerDominantColor}
      reloadToken={artworkReloadToken}
      onReloadResult={onReloadResultStable}
      active={open}
    />
  ), [currentTrack?.cover, currentTrack?.id, currentTrack?.title, currentTrack?.artist?.name, settings.animatedArtwork, reduceMotion, artworkReloadToken, onReloadResultStable, open]);

  const showSheetVisualizer = !!settings.visualizerEnabled && settings.visualizerMode === "solid";
  const showCoverVisualizer = !!settings.visualizerEnabled && settings.visualizerMode === "blended";
  const sheetVisualizer = useMemo(() => (
    showSheetVisualizer ? <div className="aivy-sheet-visualizer" aria-hidden="true"><NowPlayingVisualizer running={open} /></div> : null
  ), [showSheetVisualizer, open]);
  const coverVisualizer = useMemo(() => (
    showCoverVisualizer ? <div className="npx-cover-visualizer" aria-hidden="true"><NowPlayingVisualizer running={open} /></div> : null
  ), [showCoverVisualizer, open]);

  return (
    <>
      <div className={`aivy-sheet-backdrop ${open ? "open" : ""}`} onClick={handleGrabberTap} />
      <div ref={sheetRef} className={`aivy-sheet ${open ? "open" : ""} ${lyricsMode ? "mode-lyrics" : ""} ${isPlaying ? "is-playing" : ""} ${uiHidden ? "is-ui-hidden" : ""}`} aria-hidden={!open}>
        {currentTrack && settings.coverBackground !== false && (
          <div
            className="aivy-sheet-bg"
            style={{ backgroundImage: `url(${currentTrack.cover})` }}
            aria-hidden="true"
          />
        )}
        {sheetVisualizer}
        <div
          className="aivy-sheet-grabber-row"
          onPointerDown={swipeDown.onPointerDown} onPointerMove={swipeDown.onPointerMove}
          onPointerUp={swipeDown.onPointerUp} onPointerCancel={swipeDown.onPointerCancel}
        >
          <button className="aivy-sheet-grabber" onClick={handleGrabberTap} aria-label={t("close")} />
        </div>
        {currentTrack && (
          <div ref={bodyScrollRef} className="aivy-sheet-body aivy-scroll">
            <div
              className={`npx-hero ${lyricsMode ? "is-compact" : ""}`}
              onPointerDown={swipeDown.onPointerDown} onPointerMove={swipeDown.onPointerMove}
              onPointerUp={swipeDown.onPointerUp} onPointerCancel={swipeDown.onPointerCancel}
            >
              <div
                className={`npx-cover ${settings.noRoundCover ? "no-round" : ""} ${settings.cdCoverSpin ? "cd-spin" : ""} ${settings.tiltCover ? "has-tilt" : ""}`}
                ref={(el) => { coverRef.current = el; tilt.ref.current = el; }}
                style={{ ...tilt.style, ...(dynamicColor ? { "--npx-dynamic": dynamicColor, boxShadow: `0 24px 60px rgba(0,0,0,.5), 0 0 60px -12px ${dynamicColor}` } : {}) }}
                onPointerMove={settings.tiltCover ? tilt.onMove : undefined}
                onPointerLeave={settings.tiltCover ? tilt.onLeave : undefined}
                onClick={handleFullscreenCoverClick}
                role="button" tabIndex={0}
              >
                {coverVisualizer}
                {coverArt}
              </div>
              <div className="npx-metarow">
                <div className="npx-titles" ref={metaRef}>
                  <MarqueeText
                    as="div" className="t" text={currentTrack.title}
                    suffix={<>{isPreviewClip && <span className="badge">{t("preview30")}</span>}{formatLabel && <span className="badge badge-opus">{formatLabel}</span>}</>}
                  />
                  <div
                    className="a"
                    onClick={() => { if (lyricsMode) return; currentTrack.artist?.id && navigate("artist", { params: { id: currentTrack.artist.id } }); onClose(); }}
                  >
                    {currentTrack.artist?.name}
                  </div>
                </div>
                <div className="npx-actions">
                  <button className={`aivy-icon-btn ${isLiked ? "active" : ""}`} onClick={() => toggleLike(currentTrack)} aria-label={t("like")}><Star size={20} fill={isLiked ? "currentColor" : "none"} /></button>
                  <button className="aivy-icon-btn" onClick={handleMore} aria-label={t("menuMore")}><MoreHorizontal size={20} /></button>
                </div>
              </div>
            </div>

            <div className={`npx-lyrics-wrap ${lyricsMode ? "is-active" : ""}`}>
              {lyricsMounted && (
                <>
                  <AppleLyricsPane
                    id="aivy-am-lyrics-mobile"
                    track={currentTrack}
                    currentTime={sheetLyricsTime}
                    onSeek={seekTo}
                    highlightColor="#f5f5f5"
                    fontSize="md"
                    suppressBlur={suppressLyricsBlur}
                  />
                  {lyricsUnsynced && (
                    <button type="button" className="aivy-lyr2-pill" onClick={scrollToActiveLyric}>
                      {t("syncLyrics")}
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="npx-top-controls" ref={controlsRef}>
              <div className="aivy-scrubber-row">
                <span className="aivy-time">{loadingAudio ? "\u2013\u2013" : formatTime(currentTime)}</span>
                <Scrubber
                  getRatio={getRatio} onSeekRatio={onSeekRatio} registerFill={registerFill} registerThumb={registerThumb} loading={loadingAudio}
                  waveformSeed={settings.waveformSeekbar && currentTrack ? String(currentTrack.id || currentTrack.title || "") : null}
                />
                <span className="aivy-time right">{loadingAudio ? "\u2013\u2013" : `-${formatTime(remaining)}`}</span>
              </div>

              <div className={`npx-sing-row ${lyricsMode ? "is-active" : ""}`}>
                <button
                  type="button"
                  className={`aivy-lyr2-sing ${singMode ? "active" : ""}`}
                  onClick={() => setSingMode((v) => !v)}
                  aria-pressed={singMode}
                >
                  Sing
                </button>
              </div>

              <div className="aivy-sheet-gap" />
              <TransportButtons big />
              <VolumeControl showEndIcon />
            </div>

            <MobileNowPlayingIconRow lyricsActive={lyricsMode} onToggleLyrics={handleLyricsToggle} lyricsDisabled={lyricsDisabled} onOpenQueue={onOpenQueue} />
          </div>
        )}
      </div>

      <TrackOptionsSheet
        open={moreOpen}
        track={currentTrack}
        formatLabel={formatLabel}
        onClose={() => setMoreOpen(false)}
        onOpenDetail={() => { setMoreOpen(false); setDetailOpen(true); }}
        onOpenAod={() => { setMoreOpen(false); setAodOpen(true); }}
        onNavigate={() => { setMoreOpen(false); onClose(); }}
        onReloadArtwork={() => { setMoreOpen(false); handleReloadArtwork(); }}
      />
      <TrackDetailSheet
        open={detailOpen}
        track={currentTrack}
        isPreviewClip={isPreviewClip}
        onClose={() => setDetailOpen(false)}
      />
      <AlwaysOnDisplay
        open={aodOpen}
        track={currentTrack}
        onClose={() => setAodOpen(false)}
        animated={!!settings.animatedArtwork}
        reduceMotion={reduceMotion}
        reloadToken={artworkReloadToken}
      />
    </>
  );
}

export function TrackOptionsSheet({ open, track, formatLabel, onClose, onOpenDetail, onOpenAod, onNavigate, onReloadArtwork }) {
  const { navigate } = useRouter();
  const { t, pushToast, openAddToPlaylist } = useUI();
  const { promptCast, volume, muted } = usePlayer();
  const sheetRef = useRef(null);
  const [resolvingArtist, setResolvingArtist] = useState(false);
  const [resolvingAlbum, setResolvingAlbum] = useState(false);
  const closeAll = onNavigate || onClose;
  const volumePct = Math.round((muted ? 0 : volume) * 100);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!track) return null;

  const handleCast = async () => {
    onClose();
    const res = await promptCast();
    if (!res.ok) pushToast(res.reason === "unsupported" ? t("castUnsupported") : t("castNoDevice"));
  };
  const handleAddToPlaylist = () => { onClose(); openAddToPlaylist(track); };
  const handleShare = async () => {
    const url = buildShareUrl(track);
    if (navigator.share) {
      try {
        await navigator.share({ title: track.title, text: track.artist?.name || "", url });
        onClose();
        return;
      } catch {
        
      }
    }
    navigator.clipboard?.writeText(url);
    pushToast(t("linkCopied"));
    onClose();
  };

  const handleArtist = async () => {
    if (!track.artist?.name) return;
    if (track.artist?.id) { closeAll(); navigate("artist", { params: { id: track.artist.id } }); return; }
    setResolvingArtist(true);
    try {
      const { Api } = await import("./lib/api.js");
      const res = await Api.artist(track.artist.name);
      if (res?.name && isRelevantArtistMatch(res.name, track.artist.name)) {
        closeAll();
        navigate("artist", { params: { id: track.artist.id || track.artist.name } });
      } else {
        pushToast(t("artistNotFound"));
      }
    } catch {
      pushToast(t("artistNotFound"));
    } finally {
      setResolvingArtist(false);
    }
  };

  const handleAlbum = async () => {
    if (!track.album?.id) {
      if (!track.album?.title) return;
      setResolvingAlbum(true);
      try {
        const { Api } = await import("./lib/api.js");
        const q = `${track.album.title} ${track.artist?.name || ""}`.trim();
        const results = await Api.search(q);
        const hit = (results || []).find((r) => r.album?.id && isRelevantArtistMatch(r.album.title || "", track.album.title));
        if (hit) { closeAll(); navigate("album", { params: { id: hit.album.id } }); }
        else pushToast(t("albumNotFound"));
      } catch {
        pushToast(t("albumNotFound"));
      } finally {
        setResolvingAlbum(false);
      }
      return;
    }
    closeAll();
    navigate("album", { params: { id: track.album.id } });
  };

  const isLocal = track.source === "local";

  const gridItems = [
    !isLocal && { key: "cast", icon: <Cast size={20} />, label: t("npCast"), onSelect: handleCast },
    { key: "playlist", icon: <ListPlus size={20} />, label: t("npAddToPlaylist"), onSelect: handleAddToPlaylist },
    { key: "share", icon: <Share2 size={20} />, label: t("npShare"), onSelect: handleShare },
    { key: "aod", icon: <Moon size={20} />, label: t("npAodMode"), onSelect: onOpenAod },
    !isLocal && onReloadArtwork
      && { key: "reloadArtwork", icon: <RefreshCw size={20} />, label: t("npReloadArtwork"), onSelect: onReloadArtwork },
  ].filter(Boolean);

  const navItems = [
    track.artist?.name && { key: "artist", icon: <Music2 size={18} />, label: t("npViewArtist"), onSelect: handleArtist, busy: resolvingArtist },
    (track.album?.id || track.album?.title) && { key: "album", icon: <Music2 size={18} />, label: t("npViewAlbum"), onSelect: handleAlbum, busy: resolvingAlbum },
  ].filter(Boolean);

  const infoItems = [
    { key: "detail", icon: <Info size={18} />, label: t("npDetail"), onSelect: onOpenDetail },
    { key: "eq", icon: <SlidersHorizontal size={18} />, label: t("npEqualizer"), disabled: true },
    { key: "tempo", icon: <Gauge size={18} />, label: t("npTempoPitch"), disabled: true },
  ];

  return (
    <>
      <div className={`aivy-sheet-backdrop over-sheet ${open ? "open" : ""}`} onClick={onClose} />
      <div ref={sheetRef} className={`aivy-actionsheet aivy-optsheet ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="aivy-actionsheet-grabber" onClick={onClose} />

        <div className="aivy-optsheet-track">
          <SmartCover src={track.cover} seed={track.id + track.title} size={44} radius={8} style={{ width: 44, height: 44 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="aivy-optsheet-eyebrow">{t("nowPlaying")}</div>
            <MarqueeText
              as="div" className="t" text={track.title}
              suffix={formatLabel ? <span className="badge badge-opus" style={{ marginLeft: 6 }}>{formatLabel}</span> : null}
            />
            <div className="a">{track.artist?.name || "\u2014"}</div>
          </div>
        </div>

        <div className="aivy-optsheet-volume">
          <div className="row-label"><span>{t("volume")}</span><span>{volumePct}%</span></div>
          <VolumeControl showEndIcon />
        </div>

        <div className="aivy-optsheet-grid">
          {gridItems.map((item) => (
            <button key={item.key} type="button" className="aivy-optsheet-gridbtn" onClick={item.onSelect}>
              <span className="ic">{item.icon}</span>
              <span className="lb">{item.label}</span>
            </button>
          ))}
        </div>

        {navItems.length > 0 && (
          <div className="aivy-optsheet-list">
            {navItems.map((item) => (
              <button
                key={item.key} type="button"
                className={`aivy-optsheet-listrow ${item.busy ? "is-busy" : ""}`}
                onClick={item.onSelect} disabled={item.busy}
              >
                {item.icon}<span>{item.label}</span>
                {item.busy && <span className="aivy-actionsheet-spinner" aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}

        <div className="aivy-optsheet-list">
          {infoItems.map((item) => (
            <button
              key={item.key} type="button"
              className="aivy-optsheet-listrow" onClick={item.onSelect} disabled={item.disabled}
            >
              {item.icon}<span>{item.label}</span>
              {item.disabled && <span className="aivy-optsheet-badge">{t("comingSoon")}</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function TrackDetailInfoTab({ track }) {
  const { t, pushToast } = useUI();
  const copy = (value) => { if (!value) return; navigator.clipboard?.writeText(String(value)); pushToast(t("copiedToClipboard")); };
  const rows = [
    { label: t("detailSongTitle"), value: track.title },
    { label: t("detailSongArtist"), value: track.artist?.name },
  ];
  if (track.album?.title) rows.push({ label: t("detailSongAlbum"), value: track.album.title });
  if (track.album?.releaseDate) rows.push({ label: t("detailReleaseDate"), value: String(track.album.releaseDate).slice(0, 10) });
  rows.push({ label: t("detailMediaId"), value: track.videoId || track.id });

  const { description, loading } = useTrackDescription(track);

  return (
    <>
      <div className="aivy-detailsheet-list">
        {rows.filter((r) => r.value).map((r, i) => (
          <div key={i} className="aivy-detailsheet-row">
            <div style={{ minWidth: 0 }}>
              <div className="lbl">{r.label}</div>
              <div className="val">{r.value}</div>
            </div>
            <button className="aivy-icon-btn sm" onClick={() => copy(r.value)} aria-label={t("copiedToClipboard")}><Copy size={15} /></button>
          </div>
        ))}
      </div>

      <div className="aivy-detailsheet-credits">
        <div className="aivy-detailsheet-subhead-row">
          <div className="aivy-detailsheet-subhead">{t("descriptionLabel")}</div>
          {description && (
            <button className="aivy-icon-btn sm" onClick={() => copy(description)} aria-label={t("copyLabel")}>
              <Copy size={15} />
            </button>
          )}
        </div>
        {description && <div className="aivy-detailsheet-description">{description}</div>}
        {!description && loading && <div className="aivy-detailsheet-description-loading">{t("loading")}</div>}
        {!description && !loading && <div className="aivy-detailsheet-description-empty">{t("descriptionUnavailable")}</div>}
      </div>
    </>
  );
}

const audioInfoCache = new Map();
function useTrackAudioInfo(track) {
  const videoId = track?.videoId || track?.id || null;
  const [info, setInfo] = useState(null);
  useEffect(() => {
    setInfo(null);
    if (!videoId) { setInfo("unavailable"); return undefined; }
    let alive = true;
    const applyResult = (v) => { if (alive) setInfo(v); };
    const cached = audioInfoCache.get(videoId);
    if (cached !== undefined) {
      if (cached && typeof cached.then === "function") cached.then(applyResult);
      else applyResult(cached);
      return () => { alive = false; };
    }
    const promise = import("./lib/api.js")
      .then(({ Api }) => Api.trackAudioInfo(videoId))
      .catch(() => "unavailable");
    audioInfoCache.set(videoId, promise);
    promise.then((v) => {
      if (v === "unavailable") audioInfoCache.delete(videoId);
      else audioInfoCache.set(videoId, v);
      applyResult(v);
    });
    return () => { alive = false; };
  }, [videoId]);
  return info;
}

function TrackDetailTechnicalTab({ track, isPreviewClip }) {
  const { t, pushToast } = useUI();
  const copy = (value) => { if (!value) return; navigator.clipboard?.writeText(String(value)); pushToast(t("copiedToClipboard")); };

  const audioInfo = useTrackAudioInfo(track);
  const loadingInfo = audioInfo === null;
  const info = audioInfo && audioInfo !== "unavailable" ? audioInfo : null;
  const format = info?.format || null;

  const val = (v, suffix = "") => (loadingInfo ? t("loading") : v != null ? `${v}${suffix}` : t("detailNotAvailable"));

  const filesizeValue = loadingInfo ? t("loading")
    : format?.filesizeBytes ? `${(format.filesizeBytes / (1024 * 1024)).toFixed(1)} MB${format.filesizeIsEstimate ? " (\u2248)" : ""}`
    : t("detailNotAvailable");

  const rows = [
    { label: t("detailQuality"), value: isPreviewClip ? t("detailQualityPreview") : t("detailQualityFull") },
    { label: t("detailCodec"), value: val(format?.codec) },
    { label: t("detailMimeType"), value: val(format?.mimeType) },
    { label: t("detailBitrate"), value: val(format?.bitrateKbps, " Kbps") },
    { label: t("detailSampleRate"), value: val(format?.sampleRateHz, " Hz") },
    { label: t("detailFileSize"), value: filesizeValue },
    { label: t("detailItag"), value: val(format?.itag) },
  ];

  return (
    <div className="aivy-detailsheet-list">
      {rows.map((r, i) => (
        <div key={i} className="aivy-detailsheet-row">
          <div style={{ minWidth: 0 }}>
            <div className="lbl">{r.label}</div>
            <div className="val">{r.value}</div>
          </div>
          <button className="aivy-icon-btn sm" onClick={() => copy(r.value)} aria-label={t("copiedToClipboard")}><Copy size={15} /></button>
        </div>
      ))}
    </div>
  );
}

export function TrackDetailSheet({ open, track, isPreviewClip, onClose }) {
  const { t } = useUI();
  const [tab, setTab] = useState("info");
  const sheetRef = useRef(null);
  const swipeDown = useVerticalSwipe({ active: open, direction: "down", onTrigger: onClose, dragRef: sheetRef });
  useEffect(() => { if (open) setTab("info"); }, [open, track?.id]);

  if (!track) return null;

  return (
    <>
      <div className={`aivy-sheet-backdrop over-sheet ${open ? "open" : ""}`} onClick={onClose} />
      <div ref={sheetRef} className={`aivy-detailsheet ${open ? "open" : ""}`} aria-hidden={!open}>
        <div
          className="aivy-detailsheet-grabber" onClick={onClose}
          onPointerDown={swipeDown.onPointerDown} onPointerMove={swipeDown.onPointerMove}
          onPointerUp={swipeDown.onPointerUp} onPointerCancel={swipeDown.onPointerCancel}
        />
        <div className="aivy-detailsheet-body aivy-scroll">
          <div className="aivy-detailsheet-head">
            <SmartCover src={track.cover} seed={track.id + track.title} size={52} radius={10} style={{ width: 52, height: 52 }} />
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">{t("npDetail")}</div>
              <MarqueeText as="div" className="ttl" text={track.title} />
              <div className="sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.artist?.name || "\u2014"}</div>
            </div>
          </div>

          <div className="aivy-detailsheet-tabs">
            <button className={tab === "info" ? "active" : ""} onClick={() => setTab("info")}>{t("detailTabInfo")}</button>
            <button className={tab === "technical" ? "active" : ""} onClick={() => setTab("technical")}>{t("detailTabTechnical")}</button>
          </div>

          {tab === "info"
            ? <TrackDetailInfoTab track={track} />
            : <TrackDetailTechnicalTab track={track} isPreviewClip={isPreviewClip} />}
        </div>
      </div>
    </>
  );
}

export function AlwaysOnDisplay({ open, track, onClose, animated = false, reduceMotion = false, reloadToken = 0 }) {
  const { t } = useUI();
  const { isPlaying } = usePlayer();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => setNow(new Date()), 1000 * 15);
    setNow(new Date());
    return () => clearInterval(id);
  }, [open]);

  if (!track) return null;
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  return (
    <div className={`aivy-aod ${open ? "open" : ""}`} aria-hidden={!open} onClick={onClose}>
      <div className="aivy-aod-clock">{hh}<span className="colon">:</span>{mm}</div>
      <div className="aivy-aod-track">
        <AnimatedCover
          src={track.cover} seed={track.id + track.title} size={28} radius={6} style={{ width: 28, height: 28 }}
          song={track.title} artist={track.artist?.name}
          animated={animated && open} reduceMotion={reduceMotion} reloadToken={reloadToken}
        />
        <div className="aivy-aod-meta">
          <MarqueeText as="div" className="t" text={track.title} />
          <div className="a">{track.artist?.name || "\u2014"}</div>
        </div>
        <span className={`aivy-aod-dot ${isPlaying ? "is-playing" : ""}`} aria-hidden="true" />
      </div>
      <div className="aivy-aod-hint">{t("aodTapToExit")}</div>
    </div>
  );
}

export function QueueSheet({ open, onClose }) {
  const { t } = useUI();
  const [tab, setTab] = useState("queue");
  const sheetRef = useRef(null);
  const swipeDown = useVerticalSwipe({ active: open, direction: "down", onTrigger: onClose, dragRef: sheetRef });
  return (
    <>
      <div className={`aivy-sheet-backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <div ref={sheetRef} className={`aivy-sheet aivy-queue-sheet ${open ? "open" : ""}`} aria-hidden={!open}>
        <div
          className="aivy-sheet-head"
          onPointerDown={swipeDown.onPointerDown} onPointerMove={swipeDown.onPointerMove}
          onPointerUp={swipeDown.onPointerUp} onPointerCancel={swipeDown.onPointerCancel}
        >
          <button className="aivy-icon-btn" onClick={onClose} aria-label={t("close")}><ChevronDown size={22} /></button>
          <span className="eyebrow">{t("tabQueue")}</span>
          <span style={{ width: 38 }} />
        </div>
        <div className="aivy-queue-tabs">
          <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>{t("tabQueue")}</button>
          <button className={tab === "played" ? "active" : ""} onClick={() => setTab("played")}>{t("playedLabel")}</button>
        </div>
        <div className="aivy-sheet-body aivy-scroll aivy-queue-sheet-body">
          {tab === "queue" ? <QueueBody /> : <QueueHistoryBody />}
        </div>
      </div>
    </>
  );
}

export function RightPanel() {
  const { room } = usePlayer();
  const {
    sidebarQueueOpen, closeSidebarQueue, t,
    rightPanelWidth, setRightPanelWidth, rightPanelCollapsed, toggleRightPanelCollapsed,
    rightPanelPeek, setRightPanelPeek,
  } = useUI();
  const [tab, setTab] = useState("now");
  useEffect(() => { if (room) setTab("room"); }, [!!room]);

  const { onDragStart, isDragging } = usePanelResize({
    width: rightPanelWidth, setWidth: setRightPanelWidth, min: RIGHTPANEL_MIN_W, max: RIGHTPANEL_MAX_W, side: "right",
  });

  const resizeHandle = (
    <div
      className={`aivy-resize-handle left ${isDragging ? "active" : ""}`}
      onMouseDown={onDragStart}
      onTouchStart={onDragStart}
    >
      <span className="aivy-resize-grip"><GripVertical size={12} /></span>
    </div>
  );
  const bodyContent = sidebarQueueOpen ? (
    <>
      <div className="aivy-rightpanel-tabs">
        <button
          className="aivy-panel-icon-btn"
          onClick={toggleRightPanelCollapsed}
          aria-label={t("collapsePanel", "Tutup panel")}
          title={t("collapsePanel", "Tutup panel")}
        >
          <PanelRight size={18} />
        </button>
        <span className="aivy-rightpanel-title">{t("lyricsQueueBtn")}</span>
        <button className="aivy-icon-btn sm" onClick={closeSidebarQueue} aria-label={t("close")}><X size={16} /></button>
      </div>
      <div className="aivy-rightpanel-body aivy-scroll">
        <SidebarQueuePanel />
      </div>
    </>
  ) : (
    <>
      <div className="aivy-rightpanel-tabs">
        <button
          className="aivy-panel-icon-btn"
          onClick={toggleRightPanelCollapsed}
          aria-label={t("collapsePanel", "Tutup panel")}
          title={t("collapsePanel", "Tutup panel")}
        >
          <PanelRight size={18} />
        </button>
        {!room && tab === "now" && <RightPanelSourceLabel />}
        {room && (
          <>
            <button className={`aivy-rightpanel-tab-icon ${tab === "now" ? "active" : ""}`} onClick={() => setTab("now")} aria-label={t("tabNowPlaying")} title={t("tabNowPlaying")}><Music2 size={15} /></button>
            <button className={tab === "room" ? "active" : ""} onClick={() => setTab("room")}>{t("tabRoom")}</button>
          </>
        )}
      </div>
      <div className="aivy-rightpanel-body aivy-scroll">
        {tab === "now" && <NowPlayingPane />}
        {tab === "room" && room && <RoomPane />}
      </div>
    </>
  );

  if (rightPanelCollapsed) {
    return (
      <aside className="aivy-rightpanel aivy-rightpanel-collapsed">
        <button
          type="button"
          className="aivy-rightpanel-rail"
          onClick={toggleRightPanelCollapsed}
          onMouseEnter={() => setRightPanelPeek(true)}
          onMouseLeave={() => setRightPanelPeek(false)}
          onFocus={() => setRightPanelPeek(true)}
          onBlur={() => setRightPanelPeek(false)}
          aria-label={t("expandPanel", "Buka panel")}
          title={t("expandPanel", "Buka panel")}
        >
          {}
          <span className="aivy-rightpanel-rail-peek-wrap">
            <span className="aivy-rightpanel-rail-peek" style={{ width: rightPanelWidth }}>{bodyContent}</span>
          </span>
          <span className="aivy-rightpanel-rail-arrow-wrap">
            <span className="aivy-rightpanel-rail-arrow">
              <ChevronRight size={16} className="arrow-idle" />
              <ChevronLeft size={16} className="arrow-hover" />
            </span>
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="aivy-rightpanel">
      {bodyContent}
      {resizeHandle}
    </aside>
  );
}

function PlayingFromLabel() {
  const { playSource } = usePlayer();
  const { t } = useUI();
  if (playSource?.type !== "library" || !playSource.label) return null;
  return (
    <div className="aivy-nowplaying-source">
      <Library size={12} />
      <span>{t("playingFromLabel")} <strong>{playSource.label}</strong></span>
    </div>
  );
}
function RightPanelSourceLabel() {
  const { playSource } = usePlayer();
  if (playSource?.type !== "library" || !playSource.label) return null;
  return (
    <span className="aivy-rightpanel-source">
      <Library size={12} />
      <span>{playSource.label}</span>
    </span>
  );
}

function useArtistAbout(track) {
  const [artist, setArtist] = useState(null);
  const hasId = !!track?.artist?.id;
  const artistKey = track?.artist?.id || track?.artist?.name || null;
  const artistName = track?.artist?.name || null;

  useEffect(() => {
    setArtist(null);
    if (!artistKey) return;
    let alive = true;
    import("./lib/api.js").then(({ Api }) => {
      Api.artist(artistKey).then((res) => {
        if (!alive) return;
        if (!hasId && res?.name && !isRelevantArtistMatch(res.name, artistName)) {
          setArtist(null);
          return;
        }
        setArtist(res);
      }).catch(() => { if (alive) setArtist(null); });
    });
    return () => { alive = false; };
  }, [artistKey, hasId, artistName]);

  return artist;
}

function AboutArtistSection({ track, onNavigate, glass = false }) {
  const artist = useArtistAbout(track);
  const { navigate } = useRouter();
  const { t, settings } = useUI();
  const { followedArtistIds, toggleFollowArtist } = usePlayer();
  const following = !!artist?.id && followedArtistIds.has(String(artist.id));

  if (!track?.artist || !artist) return null;

  const goToArtist = () => {
    navigate("artist", { params: { id: artist.id || artist.name } });
    onNavigate?.();
  };

  const handleFollow = (e) => {
    e.stopPropagation();
    toggleFollowArtist(artist);
  };

  const artBg = artist.banner || artist.image;

  return (
    <div className={`aivy-nowplaying-about ${glass ? "is-glass" : ""}`}>
      {glass && artBg && (
        <div className="aivy-nowplaying-about-glassbg" aria-hidden="true">
          <SmartCover src={artBg} seed={"glassbg" + (artist.id || artist.name)} size={120} radius={0} style={{ width: "100%", height: "100%" }} />
        </div>
      )}
      <button type="button" className="aivy-nowplaying-about-banner" onClick={goToArtist} aria-label={artist.name}>
        {artBg && (
          <SmartCover src={artBg} seed={"banner" + (artist.id || artist.name)} size={480} radius={0} style={{ width: "100%", height: "100%" }} />
        )}
        <div className="aivy-nowplaying-about-banner-fade" />
        <span className="aivy-nowplaying-about-eyebrow">{t("aboutArtistLabel")}</span>
      </button>
      <div className="aivy-nowplaying-about-body">
        <button type="button" className="aivy-nowplaying-about-name" onClick={goToArtist}>{artist.name}</button>
        <div className="aivy-nowplaying-about-row">
          {artist.listeners != null && (
            <span className="aivy-nowplaying-about-listeners">{artist.listeners.toLocaleString(settings.language === "en" ? "en-US" : "id-ID")} {t("listenersMonthly")}</span>
          )}
          <button type="button" className={following ? "aivy-chip active" : "aivy-btn-ghost sm"} onClick={handleFollow}>
            {following ? <><Check size={13} /> {t("following")}</> : t("follow")}
          </button>
        </div>
        {artist.bio && <p className="aivy-nowplaying-about-bio">{artist.bio}</p>}
      </div>
    </div>
  );
}
const descriptionFetchCache = new Map();
function useTrackDescription(track) {
  const videoId = track?.videoId || track?.id || null;
  const hasOwnDescription = !!track?.description;
  const [fetchedDescription, setFetchedDescription] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFetchedDescription(null);
    if (hasOwnDescription || !videoId) return;

    let alive = true;
    const applyResult = (description) => {
      if (alive) { setFetchedDescription(description); setLoading(false); }
    };

    const cached = descriptionFetchCache.get(videoId);
    if (cached !== undefined) {
      if (cached && typeof cached.then === "function") {
        setLoading(true);
        cached.then(applyResult);
      } else {
        applyResult(cached);
      }
      return () => { alive = false; };
    }

    setLoading(true);
    const promise = import("./lib/api.js")
      .then(({ Api }) => Api.trackDescription(videoId))
      .then((r) => r?.description || null)
      .catch(() => null);
    descriptionFetchCache.set(videoId, promise);
    promise.then((description) => {
      if (description == null) descriptionFetchCache.delete(videoId);
      else descriptionFetchCache.set(videoId, description);
      applyResult(description);
    });

    return () => { alive = false; };
  }, [videoId, hasOwnDescription]);

  return useMemo(() => {
    const raw = track?.description || fetchedDescription || null;
    const description = raw ? raw.replace(/YouTube/gi, "aivy") : null;
    return {
      hasAnything: !!description,
      loading,
      title: track?.title || "",
      description,
    };
  }, [track, fetchedDescription, loading]);
}
function CreditsCard({ track, glass = false }) {
  const { t, openCredits } = useUI();
  const { description, loading } = useTrackDescription(track);

  if (!description && !loading) return null;

  const preview = description && description.length > 220
    ? `${description.slice(0, 220).trimEnd()}…`
    : description;

  return (
    <div className={`aivy-credits-card ${glass ? "is-glass" : ""}`}>
      <div className="aivy-credits-card-head">
        <span className="aivy-credits-card-title">{t("descriptionLabel")}</span>
        <button type="button" className="aivy-credits-showall" onClick={() => openCredits(track)}>{t("showAllLabel")}</button>
      </div>
      <div className="aivy-credits-card-list">
        {preview
          ? <div className="aivy-credits-card-description">{preview}</div>
          : <div className="aivy-credits-card-description aivy-credits-card-description--loading">{t("loading")}</div>}
      </div>
    </div>
  );
}
export function CreditsModal() {
  const { creditsTrack, closeCredits, t, pushToast } = useUI();
  if (!creditsTrack) return null;
  const { title, description, loading } = useTrackDescription(creditsTrack);

  const copy = () => {
    if (!description) return;
    navigator.clipboard?.writeText(description);
    pushToast(t("copiedToClipboard"));
  };

  return (
    <div className="aivy-modal-backdrop" onClick={closeCredits}>
      <div className="aivy-modal aivy-credits-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aivy-modal-head">
          <div className="aivy-modal-title">{t("descriptionLabel")}</div>
          <button className="aivy-icon-btn sm" onClick={closeCredits} aria-label={t("close")}><X size={17} /></button>
        </div>
        <div className="aivy-credits-modal-body aivy-scroll">
          <div className="aivy-credits-modal-song">{title}</div>

          {description && <div className="aivy-credits-modal-description">{description}</div>}
          {!description && loading && <div className="aivy-credits-modal-description aivy-credits-modal-description--loading">{t("loading")}</div>}
          {!description && !loading && <div className="aivy-credits-modal-description aivy-credits-modal-description--empty">{t("descriptionUnavailable")}</div>}

          {description && (
            <button type="button" className="aivy-credits-copy-btn" onClick={copy}>
              <Copy size={14} /> {t("copyLabel")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NextUpPreview({ compact }) {
  const { upNext, suggestedQueue, next, promoteSuggestion } = usePlayer();
  const { t } = useUI();
  const queueTrack = upNext[0];
  const track = queueTrack || suggestedQueue[0];
  if (!track) return null;

  const isFromQueue = !!queueTrack;
  const handleClick = () => {
    if (isFromQueue) { next(); return; }
    promoteSuggestion(track);
  };

  return (
    <div className={`aivy-nextup ${compact ? "compact" : ""}`}>
      <button type="button" className="aivy-nextup-row" onClick={handleClick}>
        <div className="aivy-nextup-label eyebrow">
          {isFromQueue ? <ListMusic size={12} /> : <Radio size={12} />}
          <span>{isFromQueue ? t("nextInQueueLabel") : t("nextRecommendationLabel")}</span>
        </div>
        <div className="aivy-nextup-row-main">
          <QueueTrackMeta track={track} />
          <ChevronRight size={16} className="aivy-nextup-chevron" />
        </div>
      </button>
    </div>
  );
}

function QueueTrackMeta({ track }) {
  return (
    <div className="aivy-queue-meta">
      <SmartCover src={track.cover} seed={track.id + track.title} size={44} radius={6} style={{ width: 44, height: 44 }} />
      <div className="txt">
        <MarqueeText as="span" className="t" text={track.title} />
        <span className="a">{track.artist?.name || "\u2014"}</span>
      </div>
    </div>
  );
}

function QueueNowPlayingRow({ track }) {
  const { isPlaying, liked, toggleLike } = usePlayer();
  const { t } = useUI();
  const isLiked = liked.has(String(track.videoId || track.id));
  return (
    <div className="aivy-queue-row is-current">
      <span className="aivy-queue-eq"><EqBars playing={isPlaying} /></span>
      <QueueTrackMeta track={track} />
      <div className="aivy-queue-row-actions">
        <button className={`aivy-icon-btn sm ${isLiked ? "active" : ""}`} onClick={() => toggleLike(track)} aria-label={t("like")}>
          <Heart size={14} fill={isLiked ? "currentColor" : "none"} />
        </button>
      </div>
    </div>
  );
}

function QueueHistoryRow({ track, onSelect }) {
  const { liked, toggleLike } = usePlayer();
  const { t } = useUI();
  const isLiked = liked.has(String(track.videoId || track.id));
  return (
    <div className="aivy-queue-row is-history" onClick={onSelect}>
      <QueueTrackMeta track={track} />
      <div className="aivy-queue-row-actions">
        <button className={`aivy-icon-btn sm ${isLiked ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); toggleLike(track); }} aria-label={t("like")}>
          <Heart size={14} fill={isLiked ? "currentColor" : "none"} />
        </button>
      </div>
    </div>
  );
}

function QueueUpNextList({ items }) {
  const { moveQueueItem, removeFromQueue, selectQueuePosition, posInOrder, liked, toggleLike } = usePlayer();
  const { t } = useUI();
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const dragMeta = useRef({ startY: 0, rowHeight: 60 });

  const endDrag = (commit) => {
    if (commit && dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      moveQueueItem(dragIndex, overIndex);
    }
    setDragIndex(null);
    setOverIndex(null);
    setDragDeltaY(0);
  };

  const handlePointerDown = (e, index) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const row = e.currentTarget.closest(".aivy-queue-row");
    dragMeta.current.startY = e.clientY;
    dragMeta.current.rowHeight = row?.getBoundingClientRect().height || 60;
    setDragIndex(index);
    setOverIndex(index);
  };
  const handlePointerMove = (e) => {
    if (dragIndex === null) return;
    const deltaY = e.clientY - dragMeta.current.startY;
    setDragDeltaY(deltaY);
    const shift = Math.round(deltaY / dragMeta.current.rowHeight);
    const next = clamp(dragIndex + shift, 0, items.length - 1);
    if (next !== overIndex) setOverIndex(next);
  };

  return (
    <div className="aivy-queue-list">
      {items.map((tr, i) => {
        const isDragging = dragIndex === i;
        let offsetPct = 0;
        if (dragIndex !== null && !isDragging) {
          if (dragIndex < overIndex && i > dragIndex && i <= overIndex) offsetPct = -100;
          else if (dragIndex > overIndex && i >= overIndex && i < dragIndex) offsetPct = 100;
        }
        const isLiked = liked.has(String(tr.videoId || tr.id));
        const style = isDragging
          ? { transform: `translateY(${dragDeltaY}px)` }
          : offsetPct
            ? { transform: `translateY(${offsetPct}%)` }
            : undefined;
        return (
          <div key={`${tr.id}-${i}`} className={`aivy-queue-row is-upnext ${isDragging ? "is-dragging" : ""}`} style={style}>
            <button
              className="aivy-queue-handle"
              onPointerDown={(e) => handlePointerDown(e, i)}
              onPointerMove={handlePointerMove}
              onPointerUp={() => endDrag(true)}
              onPointerCancel={() => endDrag(false)}
              aria-label={t("dragToReorder")}
            >
              <GripVertical size={15} />
            </button>
            <div className="aivy-queue-clickzone" onClick={() => selectQueuePosition(posInOrder + 1 + i)}>
              <QueueTrackMeta track={tr} />
            </div>
            <div className="aivy-queue-row-actions">
              <button className={`aivy-icon-btn sm ${isLiked ? "active" : ""}`} onClick={() => toggleLike(tr)} aria-label={t("like")}>
                <Heart size={14} fill={isLiked ? "currentColor" : "none"} />
              </button>
              <button className="aivy-icon-btn sm" onClick={() => removeFromQueue(i)} aria-label={t("removeFromQueue")}>
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QueueSuggestedRow({ track, onAdd }) {
  const { liked, toggleLike } = usePlayer();
  const { t } = useUI();
  const isLiked = liked.has(String(track.videoId || track.id));
  return (
    <div className="aivy-queue-row is-suggested">
      <QueueTrackMeta track={track} />
      <div className="aivy-queue-row-actions">
        <button className={`aivy-icon-btn sm ${isLiked ? "active" : ""}`} onClick={() => toggleLike(track)} aria-label={t("like")}>
          <Heart size={14} fill={isLiked ? "currentColor" : "none"} />
        </button>
        <button className="aivy-icon-btn sm" onClick={onAdd} aria-label={t("menuAddQueue")}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export function QueueBody() {
  const { currentTrack, upNext, clearUpNext, suggestedQueue, promoteSuggestion, room } = usePlayer();
  const { t } = useUI();

  if (!currentTrack) {
    return <div className="aivy-empty"><StarMark size={34} color="var(--ink-faint)" /><div className="title">{t("queueEmpty")}</div><div className="sub">{t("queueEmptySub")}</div></div>;
  }

  return (
    <>
      <div className="aivy-queue-section">
        <div className="aivy-drawer-sub eyebrow">{t("nowPlaying")}</div>
        <div className="aivy-queue-card aivy-queue-now-card">
          <QueueNowPlayingRow track={currentTrack} />
        </div>
      </div>

      <div className="aivy-queue-section">
        <div className="aivy-drawer-sub eyebrow aivy-queue-upnext-head">
          <span>{t("upNextLabel")}{upNext.length > 0 ? ` \u00b7 ${upNext.length}` : ""}</span>
          {upNext.length > 0 && (
            <button className="aivy-queue-clear" onClick={clearUpNext}><Trash2 size={12} /> {t("clearQueue")}</button>
          )}
        </div>
        {upNext.length > 0 ? (
          <div className="aivy-queue-card">
            <QueueUpNextList items={upNext} />
          </div>
        ) : (
          <div className="aivy-queue-empty-hint">{t("queueUpNextEmpty")}</div>
        )}
      </div>

      {!room && suggestedQueue.length > 0 && (
        <div className="aivy-queue-section">
          <div className="aivy-drawer-sub eyebrow aivy-queue-suggested-head">
            <Radio size={12} /><span>{t("suggestedSongsLabel")}</span>
          </div>
          <div className="aivy-queue-suggested-hint">{t("suggestedSongsHint")}</div>
          <div className="aivy-queue-card aivy-queue-suggested-card">
            <QueueSuggestedRow track={suggestedQueue[0]} onAdd={() => promoteSuggestion(suggestedQueue[0])} />
          </div>
        </div>
      )}
    </>
  );
}

export function QueueHistoryBody() {
  const { history, selectQueuePosition } = usePlayer();
  const { t } = useUI();
  const recent = history.slice().reverse();

  if (recent.length === 0) {
    return <div className="aivy-empty"><StarMark size={34} color="var(--ink-faint)" /><div className="title">{t("playedLabel")}</div><div className="sub">{t("noRecentlyPlayed")}</div></div>;
  }

  return (
    <div className="aivy-queue-section">
      <div className="aivy-queue-card aivy-queue-history-card">
        {recent.map((tr, i) => (
          <QueueHistoryRow key={`h-${tr.id}-${i}`} track={tr} onSelect={() => selectQueuePosition(history.length - 1 - i)} />
        ))}
      </div>
    </div>
  );
}

function NowPlayingPane() {
  const { currentTrack, isPreviewClip } = usePlayer();
  const { t, settings } = useUI();
  const { name: routeName } = useRouter();
  const isArtistView = routeName === "artist";
  const reduceMotion = !!settings.reducedMotion || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (!currentTrack) return <div className="aivy-empty"><StarMark size={34} color="var(--ink-faint)" /><div className="title">{t("nothingPlaying")}</div></div>;
  return (
    <div className="aivy-nowplaying-pane">
      <AnimatedCover
        src={currentTrack.cover} seed={currentTrack.id + currentTrack.title} size={240} radius={16}
        style={{ width: "100%", height: "auto", aspectRatio: "1 / 1" }}
        song={currentTrack.title} artist={currentTrack.artist?.name}
        animated={!!settings.animatedArtwork} reduceMotion={reduceMotion}
      />
      <MarqueeText as="div" className="t" text={currentTrack.title} />
      <div className="a">{currentTrack.artist?.name}</div>
      {isPreviewClip && <div className="eyebrow" style={{ marginTop: 10 }}>{t("officialPreview")}</div>}
      <AboutArtistSection track={currentTrack} glass={isArtistView} />
      <CreditsCard track={currentTrack} glass={isArtistView} />
      <NextUpPreview compact />
    </div>
  );
}

const CHAT_EMOJIS = ["👍", "❤️", "🔥", "😂", "🎉"];

export function RoomChat() {
  const { room, chatMessages, sendChatMessage, addToQueueEnd } = usePlayer();
  const { authUser, t, pushToast } = useUI();
  const [draft, setDraft] = useState("");
  const [songPanelOpen, setSongPanelOpen] = useState(false);
  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [confirmSongId, setConfirmSongId] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages.length, songPanelOpen]);

  useEffect(() => {
    if (!songPanelOpen) return undefined;
    if (!songQuery.trim()) { setSongResults([]); return undefined; }
    const timer = setTimeout(() => {
      import("./lib/api.js")
        .then(({ Api }) => Api.search(songQuery))
        .then((r) => setSongResults((r || []).slice(0, 5)))
        .catch(() => setSongResults([]));
    }, 280);
    return () => clearTimeout(timer);
  }, [songQuery, songPanelOpen]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !room) return;
    sendChatMessage(text);
    setDraft("");
  };

  const sendSong = (r) => {
    sendChatMessage("", {
      song: { videoId: r.videoId, title: r.title, artist: typeof r.artist === "string" ? r.artist : (r.artist?.name || null), cover: r.cover || r.thumbnail || null, duration: r.duration || null },
    });
    setSongQuery("");
    setSongResults([]);
    setSongPanelOpen(false);
  };

  const inQueue = (videoId) => !!(room?.queue || []).some((s) => (s.videoId || s.id) === videoId);

  const handleSongTap = (m) => {
    if (!m.song?.videoId) return;
    if (inQueue(m.song.videoId)) { pushToast(t("alreadyQueued")); return; }
    setConfirmSongId(confirmSongId === m.id ? null : m.id);
  };

  const confirmAdd = (m) => {
    const s = m.song;
    addToQueueEnd({ id: s.videoId, videoId: s.videoId, title: s.title, artist: s.artist ? { name: s.artist } : null, cover: s.cover, duration: s.duration });
    setConfirmSongId(null);
  };

  return (
    <div className="aivy-room-chat">
      <div className="aivy-chat-messages aivy-scroll" ref={listRef}>
        {chatMessages.length === 0 ? (
          <div className="aivy-chat-empty">{t("roomChatEmpty")}</div>
        ) : (
          chatMessages.map((m) => {
            const own = authUser && m.userId === authUser.id;
            if (m.type === "emoji") {
              return (
                <div key={m.id} className={`aivy-chat-msg ${own ? "own" : ""}`}>
                  {!own && <Avatar user={m} />}
                  <div className="bubble emoji-bubble"><span className="emoji">{m.emoji}</span></div>
                </div>
              );
            }
            if (m.type === "song") {
              const queued = inQueue(m.song?.videoId);
              const sender = m.username ? ` · @${m.username}` : "";
              return (
                <div key={m.id} className={`aivy-chat-msg ${own ? "own" : ""}`}>
                  {!own && <Avatar user={m} />}
                  <div className="song-wrap">
                    <button type="button" className={`bubble song-bubble ${queued ? "queued" : ""}`} onClick={() => handleSongTap(m)}>
                      <span className="cover">
                        <SmartCover src={m.song?.cover} seed={m.song?.videoId || m.id} size={96} radius={8} style={{ width: "100%", height: "100%" }} />
                      </span>
                      <span className="meta">
                        <span className="t">{m.song?.title}</span>
                        <span className="a">{m.song?.artist || "\u2014"}{sender}</span>
                        {queued && <span className="hint">✓ {t("queuedShort")}</span>}
                      </span>
                      <Play size={13} className="song-play" />
                    </button>
                    {confirmSongId === m.id && (
                      <div className="song-confirm">
                        <button className="yes" onClick={() => confirmAdd(m)}>{t("yesAdd")}</button>
                        <button className="no" onClick={() => setConfirmSongId(null)}>{t("cancel")}</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            return (
              <div key={m.id} className={`aivy-chat-msg ${own ? "own" : ""}`}>
                {!own && <Avatar user={m} />}
                <div className="bubble">
                  {!own && <span className="who">{m.username}</span>}
                  <span className="txt">{m.text}</span>
                  <span className="time">{formatClockTime(m.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {songPanelOpen && (
        <div className="aivy-song-panel">
          <div className="aivy-song-panel-search">
            <Search size={15} />
            <input
              autoFocus
              placeholder={t("searchSongChat")}
              value={songQuery}
              onChange={(e) => setSongQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setSongPanelOpen(false); }}
            />
          </div>
          {songResults.map((r) => (
            <button key={r.videoId} type="button" className="aivy-song-panel-row" onClick={() => sendSong(r)}>
              <SmartCover src={r.thumbnail} seed={r.videoId} size={72} radius={5} style={{ width: 36, height: 36 }} />
              <span className="meta"><span className="t">{r.title}</span><span className="a">{r.artist}</span></span>
              <Plus size={15} />
            </button>
          ))}
        </div>
      )}

      {emojiOpen && (
        <div className="aivy-emoji-pop">
          {CHAT_EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => { sendChatMessage("", { emoji: e }); setEmojiOpen(false); }}>{e}</button>
          ))}
        </div>
      )}

      <div className="aivy-chat-input-row">
        <button
          className={`aivy-icon-btn ${songPanelOpen ? "active" : ""}`}
          onClick={() => { setSongPanelOpen((v) => !v); setEmojiOpen(false); }}
          aria-label={t("sendSong")}
          title={t("sendSong")}
        >
          <Music2 size={16} />
        </button>
        <button
          className={`aivy-icon-btn ${emojiOpen ? "active" : ""}`}
          onClick={() => { setEmojiOpen((v) => !v); setSongPanelOpen(false); }}
          aria-label="Emoji"
        >
          <Smile size={16} />
        </button>
        <input
          className="aivy-input aivy-chat-input"
          placeholder={t("chatPlaceholder")}
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } }}
        />
        <button className="aivy-icon-btn" onClick={handleSend} disabled={!draft.trim()} aria-label={t("send")}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function RoomPane() {
  const { room, leaveRoom } = usePlayer();
  const { navigate } = useRouter();
  const { t } = useUI();
  if (!room) return null;
  return (
    <div className="aivy-room-pane">
      <div className="aivy-room-pane-head">
        <div>
          <div className="t">{room.name}</div>
          <div className="eyebrow">{room.isPublic ? <><Globe size={11} /> {t("public")}</> : <><Lock size={11} /> {t("private")}</>}{` \u00b7 ${t("createdAt")} ${relativeTime(room.createdAt)}`}</div>
        </div>
        <button className="aivy-btn-ghost" onClick={() => { leaveRoom(); navigate("roomLobby"); }}>{t("leave")}</button>
      </div>
      <div className="aivy-drawer-sub eyebrow">{t("listeningNow")} ({room.members?.length || 0})</div>
      <div className="aivy-room-members">
        {room.members?.map((m) => (
          <div key={m.id} className="aivy-room-member">
            <Avatar user={m} />
            <span className="name">{m.username}</span>
            {m.isHost && <Crown size={13} color="var(--gold, var(--berry))" />}
          </div>
        ))}
      </div>
      {room.hostOnlyControl && <div className="aivy-room-note" style={{ marginTop: 14 }}>{t("hostOnlyNotice")}</div>}
    </div>
  );
}

const NAV_ITEMS = [
  { route: "home", labelKey: "navHome", icon: HomeIcon, flag: "showNavHome" },
  { route: "shorts", labelKey: "navShorts", icon: Film, flag: "showNavShorts" },
  { route: "search", labelKey: "navSearch", icon: Search, flag: "showNavSearch" },
  { route: "library", labelKey: "navLibrary", icon: Library, flag: "showNavLibrary" },
  { route: "roomLobby", labelKey: "navRooms", icon: Users, flag: "showNavRooms" },
];

export function Sidebar() {
  const { name } = useRouter();
  const {
    authUser, login, t,
    sidebarWidth, setSidebarWidth, sidebarCollapsed, toggleSidebarCollapsed,
    settings, pushToast,
  } = useUI();
  const { playlists, createPlaylist } = usePlayer();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (creating) inputRef.current?.focus(); }, [creating]);
  const submitCreate = () => { const val = newName.trim(); if (val) createPlaylist(val); setNewName(""); setCreating(false); };

  const showAnySideLinks = settings.showSideAbout || settings.showSideDiscord || settings.showSideGithub;

  useEffect(() => {
    if (!settings.donationReminders) return undefined;
    const KEY = "aivy_last_donation_nudge";
    const DAY = 24 * 60 * 60 * 1000;
    const last = Number(localStorage.getItem(KEY) || 0);
    if (Date.now() - last < 3 * DAY) return undefined;
    const timer = setTimeout(() => {
      pushToast(t("language") === "en" ? "Enjoying Cosmicx? Consider supporting the project ❤️" : "Suka pakai Cosmicx? Yuk bantu dukung proyek ini ❤️");
      localStorage.setItem(KEY, String(Date.now()));
    }, 45000);
    return () => clearTimeout(timer);
  }, [settings.donationReminders, pushToast, t]);

  const { onDragStart, isDragging } = usePanelResize({
    width: sidebarWidth, setWidth: setSidebarWidth, min: SIDEBAR_MIN_W, max: SIDEBAR_MAX_W, side: "left",
  });

  const visibleNavItems = NAV_ITEMS.filter(({ flag }) => settings?.[flag] !== false);

  if (sidebarCollapsed) {
    return (
      <aside className="aivy-sidebar aivy-sidebar-rail">
        <button
          className="aivy-panel-icon-btn aivy-rail-toggle"
          onClick={toggleSidebarCollapsed}
          aria-label={t("expandSidebar", "Buka sidebar")}
          title={t("expandSidebar", "Buka sidebar")}
        >
          <PanelLeft size={18} />
        </button>
        <nav className="aivy-nav aivy-nav-rail">
          {visibleNavItems.map(({ route, labelKey, icon: Icon }) => (
            <Link key={route} to={route} className={`aivy-nav-item ${name === route ? "active" : ""}`} title={t(labelKey)} aria-label={t(labelKey)}>
              <Icon size={18} />
            </Link>
          ))}
        </nav>
        <div className="aivy-side-footer aivy-side-footer-rail">
          {authUser ? (
            <Link to="settings" className="aivy-user-chip aivy-user-chip-rail" title={resolveDisplayName(authUser)} aria-label={resolveDisplayName(authUser)}>
              <Avatar user={authUser} />
            </Link>
          ) : (
            <button className="aivy-login-btn" onClick={login} title={t("navLoginDiscord")} aria-label={t("navLoginDiscord")}><LogIn size={15} /></button>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="aivy-sidebar">
      <div className="aivy-sidebar-topline">
        <button
          className="aivy-panel-icon-btn"
          onClick={toggleSidebarCollapsed}
          aria-label={t("collapseSidebar", "Tutup sidebar")}
          title={t("collapseSidebar", "Tutup sidebar")}
        >
          <PanelLeft size={18} />
        </button>
        <Link to="home" className="aivy-brand"><StarMark size={26} color="var(--accent-strong)" className="mark" logo /><div className="word font-display">cosmicx</div></Link>
      </div>
      <nav className="aivy-nav">
        {visibleNavItems.map(({ route, labelKey, icon: Icon }) => (
          <Link key={route} to={route} className={`aivy-nav-item ${name === route ? "active" : ""}`}><Icon size={18} /><span>{t(labelKey)}</span></Link>
        ))}
      </nav>
      <div className="aivy-side-section">
        <div className="eyebrow" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{t("navYourPlaylists")}</span>
          <button className="aivy-icon-btn sm" onClick={() => setCreating((c) => !c)} aria-label={t("createPlaylist")}><Plus size={14} /></button>
        </div>
        {creating && (
          <div style={{ padding: "0 6px 8px" }}>
            <input ref={inputRef} className="aivy-input" style={{ padding: "7px 12px", fontSize: 13 }} placeholder={t("newPlaylistName")} value={newName}
              onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); if (e.key === "Escape") setCreating(false); }} onBlur={submitCreate} />
          </div>
        )}
        <div className="aivy-playlist-list aivy-scroll">
          <Link to="liked" className="aivy-playlist-row"><Heart size={15} color="var(--berry)" fill="var(--berry)" /><span>{t("navLikedSongs")}</span></Link>
          {playlists.map((pl) => <Link key={pl.id} to="playlist" params={{ id: pl.id }} className="aivy-playlist-row"><Library size={15} /><span>{pl.name}</span></Link>)}
        </div>
      </div>
      {showAnySideLinks && (
        <div className="aivy-side-links">
          {settings.showSideAbout && <a href="/about" className="aivy-side-link"><Info size={13} /> {t("language") === "en" ? "About" : "Tentang"}</a>}
          {settings.showSideDiscord && <a href="https://discord.gg/" target="_blank" rel="noreferrer" className="aivy-side-link"><Users size={13} /> Discord</a>}
          {settings.showSideGithub && <a href="https://github.com/" target="_blank" rel="noreferrer" className="aivy-side-link"><Github size={13} /> GitHub</a>}
        </div>
      )}
      <div className="aivy-side-footer">
        {}
        <Link to="settings" className="aivy-theme-btn"><SettingsIcon size={15} />{t("navSettings")}</Link>
        {authUser ? (
          <Link to="settings" className="aivy-user-chip">
            <Avatar user={authUser} />
            <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resolveDisplayName(authUser)}</span>
          </Link>
        ) : (
          <button className="aivy-login-btn" onClick={login}><LogIn size={15} /> {t("navLoginDiscord")}</button>
        )}
      </div>

      <div
        className={`aivy-resize-handle right ${isDragging ? "active" : ""}`}
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
      >
        <span className="aivy-resize-grip"><GripVertical size={12} /></span>
      </div>
    </aside>
  );
}
function GlassLayers() {
  return (
    <>
      <span className="lg-warp" aria-hidden="true" />
      <span className="lg-rim lg-rim-screen" aria-hidden="true" />
      <span className="lg-rim lg-rim-overlay" aria-hidden="true" />
    </>
  );
}

const LG_SURFACES = [
  [".aivy-tabbar", "lg-tabs"],
  [".aivy-mini-player", "lg-mini"],
  [".aivy-dock-search", "lg-search"],
];
const LG_PX = 24;
const LG_ABER = 0.08;

const LiquidGlassDefs = React.memo(function LiquidGlassDefs() {
  const S = LG_PX * 2;
  return (
    <svg width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }} aria-hidden="true" focusable="false">
      <defs>
        {LG_SURFACES.map(([, id]) => (
          <filter key={id} id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={S} xChannelSelector="R" yChannelSelector="B" result="dr" />
            <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cr" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={S * (1 - LG_ABER)} xChannelSelector="R" yChannelSelector="B" result="dg" />
            <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cg" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={S * (1 - 2 * LG_ABER)} xChannelSelector="R" yChannelSelector="B" result="db" />
            <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cb" />
            <feBlend in="cg" in2="cb" mode="screen" result="gb" />
            <feBlend in="cr" in2="gb" mode="screen" />
          </filter>
        ))}
      </defs>
    </svg>
  );
});
function useDockCollapse(routeName, enabled) {
  const [collapsed, setCollapsed] = useState(false);
  const stateRef = useRef(false);
  const set = useCallback((v) => {
    if (stateRef.current === v) return;
    stateRef.current = v;
    setCollapsed(v);
  }, []);
  useEffect(() => {
    set(false);
    if (!enabled) return undefined;
    const el = document.getElementById("aivy-content-scroll");
    if (!el) return undefined;
    let lastY = el.scrollTop;
    let acc = 0;
    let raf = 0;
    const run = () => {
      raf = 0;
      const y = Math.max(0, el.scrollTop);
      const dy = y - lastY;
      lastY = y;
      if (y <= 8) { acc = 0; set(false); return; }
      if (Math.abs(dy) < 1) return;
      if ((dy > 0) !== (acc > 0)) acc = 0;
      acc += dy;
      if (acc > 28 && y > 56) set(true);
      else if (acc < -14) set(false);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(run); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [routeName, enabled, set]);
  return [collapsed && enabled, set];
}

export function MobileDock({ onExpandPlayer }) {
  const { name } = useRouter();
  const { t, settings } = useUI();
  const { currentTrack } = usePlayer();
  const hasTrack = !!currentTrack;
  const [collapsed, setDock] = useDockCollapse(name, hasTrack);
  const dockRef = useRef(null);
  const refract = settings?.liquidGlass !== false && supportsRefraction();
  const [lgReady, setLgReady] = useState(false);
  useEffect(() => { if (!refract) setLgReady(false); }, [refract]);
  const regen = useCallback(() => {
    const dock = dockRef.current;
    if (!dock || !refract) return;
    let ok = false;
    for (const [sel, id] of LG_SURFACES) {
      const el = dock.querySelector(sel);
      const img = dock.querySelector(`#${id} feImage`);
      if (!el || !img) continue;
      const w = el.offsetWidth, h = el.offsetHeight;
      if (w < 8 || h < 8) continue;
      const url = makeDisplacementMap(w, h, Math.min(26, Math.round(h * 0.45)));
      if (!url) continue;
      img.setAttribute("href", url);
      img.setAttribute("width", String(w));
      img.setAttribute("height", String(h));
      ok = true;
    }
    if (ok) setLgReady(true);
  }, [refract]);

  useEffect(() => {
    const id = requestAnimationFrame(regen);
    return () => cancelAnimationFrame(id);
  }, [regen, hasTrack]);
  useEffect(() => {
    let tm;
    const on = () => { clearTimeout(tm); tm = setTimeout(regen, 160); };
    window.addEventListener("resize", on);
    return () => { clearTimeout(tm); window.removeEventListener("resize", on); };
  }, [regen]);
  const [morphing, setMorphing] = useState(false);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return undefined; }
    setMorphing(true);
    let raf = 0;
    const id = setTimeout(() => { regen(); raf = requestAnimationFrame(() => setMorphing(false)); }, 470);
    return () => { clearTimeout(id); if (raf) cancelAnimationFrame(raf); };
  }, [collapsed, regen]);

  const items = NAV_ITEMS.filter(({ flag }) => settings?.[flag] !== false);
  const searchItem = items.find((i) => i.route === "search");
  const tabItems = items.filter((i) => i.route !== "search");
  const shownRoute = tabItems.some((i) => i.route === name) ? name : tabItems[0]?.route;
  const SearchIcon = searchItem?.icon;
  const onNavClickCapture = (e) => {
    if (!collapsed) return;
    e.preventDefault();
    e.stopPropagation();
    setDock(false);
  };

  return (
    <div
      ref={dockRef}
      className={`aivy-dock ${collapsed ? "is-collapsed" : ""} ${morphing ? "is-morphing" : ""} ${refract && lgReady ? "lg-ready" : ""}`}
      style={{ "--dock-search": searchItem ? 1 : 0 }}
    >
      {refract && <LiquidGlassDefs />}
      {hasTrack && (
        <div className="aivy-dock-slot slot-mini"><MiniPlayer onExpand={onExpandPlayer} /></div>
      )}
      <div className="aivy-dock-slot slot-tabs">
        <nav className="aivy-tabbar" onClickCapture={onNavClickCapture}>
          <GlassLayers />
          {tabItems.map(({ route, labelKey, icon: Icon }) => (
            <Link
              key={route} to={route}
              className={`aivy-tab ${name === route ? "active" : ""} ${shownRoute === route ? "is-shown" : ""}`}
              aria-label={t(labelKey)}
              tabIndex={collapsed && shownRoute !== route ? -1 : undefined}
            ><Icon size={21} /><span>{t(labelKey)}</span></Link>
          ))}
        </nav>
      </div>
      {searchItem && (
        <div className="aivy-dock-slot slot-search">
          <Link to="search" className={`aivy-dock-search ${name === "search" ? "active" : ""}`} aria-label={t(searchItem.labelKey)}>
            <GlassLayers />
            <SearchIcon size={22} />
          </Link>
        </div>
      )}
    </div>
  );
}

export function TopBar({ isMobile }) {
  const { name, back } = useRouter();
  const { authUser, login, t } = useUI();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = document.getElementById("aivy-content-scroll");
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 4);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [name]);
  const titleMap = { search: t("navSearch"), library: t("navLibrary"), roomLobby: t("navRooms"), room: t("navRooms"), liked: t("navLikedSongs"), settings: t("navSettings"), shorts: t("navShorts"), home: "" };
  return (
    <div className={`aivy-topbar ${scrolled ? "scrolled" : ""}`}>
      {isMobile ? (
        <>
          {name !== "home" ? <button className="aivy-navbtn" onClick={back} aria-label={t("previous")}><ArrowLeft size={16} /></button> : <StarMark size={20} color="var(--accent-strong)" logo />}
          <span className="aivy-topbar-title font-display" style={{ fontSize: 15 }}>{titleMap[name] ?? ""}</span>
        </>
      ) : (
        <div className="navbtns">
          <button className="aivy-navbtn" onClick={back} aria-label={t("previous")}><ChevronLeft size={16} /></button>
          <button className="aivy-navbtn" onClick={() => window.history.forward()} aria-label={t("next")}><ChevronRight size={16} /></button>
        </div>
      )}
      <div className="aivy-topbar-spacer" />
      {isMobile && (
        <>
          {}
          {!authUser && <Link to="settings" className="aivy-navbtn" aria-label={t("navSettings")} title={t("navSettings")}><SettingsIcon size={15} /></Link>}
        </>
      )}
      {isMobile && !authUser && <button className="aivy-btn-ghost" style={{ padding: "7px 14px", fontSize: 12.5 }} onClick={login}>{t("navLogin")}</button>}
      {isMobile && authUser && <Link to="settings" aria-label={resolveDisplayName(authUser) || "Akun"} className="aivy-avatar-link"><span className="aivy-topbar-username">{resolveDisplayName(authUser)}</span><Avatar user={authUser} /></Link>}
    </div>
  );
}

export function ViewLoading() {
  return <div className="aivy-empty" style={{ paddingTop: 90 }}><StarLoader size={40} /></div>;
}
export function ViewNotFound({ label }) {
  const { t } = useUI();
  return <div className="aivy-empty" style={{ paddingTop: 90 }}><StarMark size={40} color="var(--ink-faint)" /><div className="title">{label} {t("notFoundLabel")}</div></div>;
}

const LYRICS_FONT_SIZES = {
  sm: "clamp(15px, 2.8vw, 19px)",
  md: "clamp(19px, 3.6vw, 26px)",
  lg: "clamp(23px, 4.4vw, 32px)",
};

const AM_LYRICS_FONT_SIZES = {
  sm: { "--am-lyrics-compact-font-size": "22px", "--lyplus-font-size-base": "26px", "--am-lyrics-wide-font-size": "34px" },
  md: { "--am-lyrics-compact-font-size": "28px", "--lyplus-font-size-base": "34px", "--am-lyrics-wide-font-size": "48px" },
  lg: { "--am-lyrics-compact-font-size": "34px", "--lyplus-font-size-base": "42px", "--am-lyrics-wide-font-size": "58px" },
};
function AppleLyricsPane({ track, currentTime, onSeek, highlightColor, fontSize, id, suppressBlur }) {
  const elRef = useRef(null);

  useEffect(() => {
    let tries = 0;
    let timer = null;
    const inject = () => {
      const el = elRef.current;
      if (!el || !el.shadowRoot) {
        if (tries++ < 25) timer = setTimeout(inject, 200);
        return;
      }
      if (el.shadowRoot.querySelector("style[data-perf-layer]")) return;
      const st = document.createElement("style");
      st.setAttribute("data-perf-layer", "");
      st.textContent = ".lyrics-line-container{ will-change: transform; } .lyrics-line{ will-change: filter; }";
      el.shadowRoot.appendChild(st);
    };
    inject();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !track) return;
    let cancelled = false;
    let pollId = null;

    const applyMetadata = (forceRetrigger) => {
      if (cancelled) return;
      const cleanedTitle = cleanTrackTitleForLyrics(track.title, track.artist?.name);
      const durationMs = track.duration ? Math.round(track.duration * 1000) : undefined;
      const query = [cleanedTitle, track.artist?.name].filter(Boolean).join(" ");
      if (forceRetrigger) {
        el.songTitle = `${cleanedTitle}\u200b`;
      }
      el.songTitle = cleanedTitle;
      el.songArtist = track.artist?.name || "";
      el.songDurationMs = durationMs;
      el.query = query;
      el.autoScroll = true;
      el.interpolate = true;
    };

    const watchForFailureAndRetryOnce = () => {
      let attempts = 0;
      const maxAttempts = Math.ceil(9000 / 300);
      pollId = setInterval(() => {
        attempts++;
        if (cancelled) { clearInterval(pollId); return; }
        if (el.isLoading === false) {
          clearInterval(pollId);
          if (!el.lyricsSource && !el.ttml) {
            applyMetadata(true);
          }
          return;
        }
        if (attempts >= maxAttempts) clearInterval(pollId);
      }, 300);
    };

    if (typeof customElements !== "undefined" && customElements.get("am-lyrics")) {
      applyMetadata(false);
    } else if (typeof customElements !== "undefined") {
      customElements.whenDefined("am-lyrics").then(() => applyMetadata(false));
    } else {
      applyMetadata(false);
    }
    watchForFailureAndRetryOnce();

    let hideDlTimer = null;
    let hideDlTries = 0;
    const injectHideDownload = () => {
      const el = elRef.current;
      if (!el || !el.shadowRoot) {
        if (hideDlTries++ < 25) hideDlTimer = setTimeout(injectHideDownload, 200);
        return;
      }
      if (el.shadowRoot.querySelector("style[data-hide-download]")) return;
      const st = document.createElement("style");
      st.setAttribute("data-hide-download", "");
      st.textContent = '.download-button[title="Download Lyrics"]{display:none!important}';
      el.shadowRoot.appendChild(st);
    };
    injectHideDownload();

    return () => { cancelled = true; if (pollId) clearInterval(pollId); clearTimeout(hideDlTimer); };
  }, [track?.id]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.round((currentTime || 0) * 1000));
  }, [currentTime]);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !highlightColor) return;
    el.highlightColor = highlightColor;
  }, [highlightColor]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const handler = (e) => onSeek?.((e.detail?.timestamp || 0) / 1000);
    el.addEventListener("line-click", handler);
    return () => el.removeEventListener("line-click", handler);
  }, [onSeek]);

  const style = useMemo(() => {
    const base = AM_LYRICS_FONT_SIZES[fontSize] || AM_LYRICS_FONT_SIZES.md;
    if (!suppressBlur) return base;
    return { ...base, "--lyplus-blur-amount": "0em", "--lyplus-blur-amount-near": "0em" };
  }, [fontSize, suppressBlur]);

  return (
    <am-lyrics
      ref={elRef}
      class="aivy-am-lyrics"
      id={id || undefined}
      style={style}
    />
  );
}

export function LyricsPrefetch() {
  const { upNext } = usePlayer();
  const nextTrack = upNext?.[0] || null;
  const elRef = useRef(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !nextTrack) return;
    let cancelled = false;
    const apply = () => {
      if (cancelled) return;
      el.songTitle = cleanTrackTitleForLyrics(nextTrack.title, nextTrack.artist?.name);
      el.songArtist = nextTrack.artist?.name || "";
      el.songDurationMs = nextTrack.duration ? Math.round(nextTrack.duration * 1000) : undefined;
      el.query = [el.songTitle, el.songArtist].filter(Boolean).join(" ");
      el.autoScroll = false;
      el.interpolate = false;
    };
    if (typeof customElements !== "undefined" && customElements.get("am-lyrics")) {
      apply();
    } else if (typeof customElements !== "undefined") {
      customElements.whenDefined("am-lyrics").then(apply);
    } else {
      apply();
    }
    return () => { cancelled = true; };
  }, [nextTrack?.id]);

  if (!nextTrack) return null;
  return (
    <am-lyrics
      ref={elRef}
      aria-hidden="true"
      style={{ position: "fixed", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none", left: -9999 }}
    />
  );
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(" ");
  let line = "";
  let lines = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}

function SidebarQueuePanel() {
  const [subTab, setSubTab] = useState("queue");
  const { currentTrack, upNext, history, selectQueuePosition, clearUpNext } = usePlayer();
  const { t } = useUI();
  const recent = history.slice().reverse();
  return (
    <>
      <div className="aivy-sq-subtabs">
        <button className={subTab === "queue" ? "active" : ""} onClick={() => setSubTab("queue")}>{t("tabQueue")}</button>
        <button className={subTab === "recent" ? "active" : ""} onClick={() => setSubTab("recent")}>{t("recentlyPlayedLabel")}</button>
      </div>
      {subTab === "queue" ? (
        <>
          <div className="aivy-drawer-sub eyebrow">{t("nowPlaying")}</div>
          {currentTrack ? <QueueNowPlayingRow track={currentTrack} /> : <div className="aivy-queue-empty-hint">{t("nothingPlaying")}</div>}
          <div className="aivy-drawer-sub eyebrow aivy-queue-upnext-head">
            <span>{t("upNextLabel")}</span>
            {upNext.length > 0 && <button className="aivy-queue-clear" onClick={clearUpNext}><Trash2 size={12} /> {t("clearQueue")}</button>}
          </div>
          {upNext.length > 0 ? <QueueUpNextList items={upNext} /> : <div className="aivy-queue-empty-hint">{t("queueUpNextEmpty")}</div>}
        </>
      ) : (
        <>
          <div className="aivy-drawer-sub eyebrow">{t("recentlyPlayedLabel")}</div>
          {recent.length > 0 ? (
            recent.map((tr, i) => (
              <QueueHistoryRow key={`h-${tr.id}-${i}`} track={tr} onSelect={() => selectQueuePosition(history.length - 1 - i)} />
            ))
          ) : (
            <div className="aivy-queue-empty-hint">{t("noRecentlyPlayed")}</div>
          )}
        </>
      )}
    </>
  );
}

function useIsMobile(breakpoint = 860) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(`(max-width:${breakpoint}px)`).matches);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${breakpoint}px)`);
    const onChange = (e) => setM(e.matches);
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange));
  }, [breakpoint]);
  return m;
}

export function LyricsOverlay() {
  const { lyricsOpen, closeLyrics, pushToast, t, openMobileQueue, openContextMenu, settings } = useUI();
  const {
    currentTrack, seekTo, isPreviewClip, liked, toggleLike, upNext, duration,
  } = usePlayer();
  const currentTime = usePlayerTime();
  const reduceMotion = !!settings.reducedMotion || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [fontSize, setFontSize] = useState("md");
  const [shareOpen, setShareOpen] = useState(false);
  const [singMode, setSingMode] = useState(false);
  const [lyricsUnsynced, setLyricsUnsynced] = useState(false);
  const resolvedTheme = (typeof document !== "undefined" && document.documentElement?.dataset?.theme) || "black";
  const isLightResolved = ["white", "latte", "salmon"].includes(resolvedTheme);
  const trackKey = currentTrack?.id;
  const isLiked = currentTrack && liked.has(String(currentTrack.videoId || currentTrack.id));
  const nextTrack = upNext?.[0];
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!lyricsOpen || isMobile) return;
    const scrollEl = document.getElementById("aivy-content-scroll");
    const prevOverflow = scrollEl ? scrollEl.style.overflow : "";
    if (scrollEl) scrollEl.style.overflow = "hidden";

    const ALLOWED_SCROLL_SELECTOR = ".aivy-lyrics-body, .aivy-lyrics-plain, .aivy-lyrics-side, .aivy-am-lyrics";
    const onTouchMove = (e) => {
      if (e.target.closest(ALLOWED_SCROLL_SELECTOR)) return;
      e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      if (scrollEl) scrollEl.style.overflow = prevOverflow;
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, [lyricsOpen, isMobile]);

  const scrollToActiveLyric = () => {
    const el = document.getElementById("aivy-am-lyrics-desktop");
    if (!el) return;
    if (typeof el.resumeAutoScroll === "function") {
      el.resumeAutoScroll();
    }
    setLyricsUnsynced(false);
  };

  useEffect(() => {
    if (!lyricsOpen) return undefined;
    let observer;
    let retryTimer;
    let tries = 0;

    const attach = () => {
      const el = document.getElementById("aivy-am-lyrics-desktop");
      const container = el?.lyricsContainer;
      if (!container) {
        if (tries++ < 25) retryTimer = setTimeout(attach, 200);
        return;
      }
      const sync = () => setLyricsUnsynced(container.classList.contains("user-scrolling"));
      sync();
      observer = new MutationObserver(sync);
      observer.observe(container, { attributes: true, attributeFilter: ["class"] });
    };
    attach();

    return () => {
      clearTimeout(retryTimer);
      observer?.disconnect();
    };
  }, [lyricsOpen, trackKey]);

  const activeLineText = currentTrack?.title || "";

  const handleSaveImage = useCallback(() => {
    if (!currentTrack) return;
    const line = activeLineText || currentTrack.title;
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 800;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#1A1A1A");
    grad.addColorStop(1, "#000000");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#F2F2F2";
    ctx.font = "600 42px Georgia, serif";
    ctx.textAlign = "center";
    wrapCanvasText(ctx, line, canvas.width / 2, 380, 680, 54);
    ctx.fillStyle = "#8A8A8A";
    ctx.font = "500 22px sans-serif";
    ctx.fillText(`${currentTrack.artist?.name || ""} \u00b7 ${currentTrack.title || ""}`, canvas.width / 2, canvas.height - 80);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lirik-${(currentTrack.title || "lagu").replace(/\s+/g, "-").toLowerCase()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast(t("toastLyricsImageSaved"));
    });
  }, [currentTrack, activeLineText, pushToast, t]);

  const { registerFill, registerThumb, getRatio, onSeekRatio, currentTime: scrubTime, duration: scrubDuration } = useScrubberBinding();
  const cycleFontSize = () => setFontSize((s) => (s === "sm" ? "md" : s === "md" ? "lg" : "sm"));
  const highlightColor = isMobile || !isLightResolved ? "#f5f5f5" : "#141414";
  const lyricsMenuItems = useTrackMenuItems(currentTrack || {});
  const handleLyricsMore = (e) => { if (!currentTrack) return; openContextMenu(e.clientX, e.clientY, lyricsMenuItems); };

  if (!lyricsOpen) return null;

  if (isMobile) return null;

  return (
    <div className={`aivy-lyrics-overlay ${lyricsOpen ? "open" : ""}`}>
      {currentTrack?.cover && (
        <div className="aivy-lyrics-backdrop" style={{ backgroundImage: `url(${currentTrack.cover})` }} />
      )}
      <div className="aivy-lyrics-scrim" />

      <div className="aivy-lyrics-float">
        <button className="aivy-lyrics-fbtn primary" onClick={closeLyrics} aria-label={t("close")}><X size={19} /></button>
        { }
        <button className="aivy-lyrics-fbtn aivy-lyrics-fbtn-dup" onClick={() => setShareOpen((v) => !v)} disabled={!currentTrack} aria-label={t("share")}>
          <Share2 size={16} />
        </button>
        <button className="aivy-lyrics-fbtn aivy-lyrics-fbtn-dup aivy-fontsize-btn" onClick={cycleFontSize} disabled={!currentTrack} aria-label={t("fontSize")} title={`${t("fontSize")}: ${fontSize.toUpperCase()}`}>
          <Type size={16} />
          <span className="aivy-fontsize-tag">{fontSize}</span>
        </button>
      </div>

      {currentTrack && (
        <div className="aivy-lyrics-main">
          <div className="aivy-lyrics-side">
            <div className="aivy-lyrics-track">
              <div className="cover">
                <AnimatedCover
                  src={currentTrack.cover} seed={currentTrack.id + currentTrack.title} size={320} radius={6}
                  style={{ width: "100%", height: "100%" }}
                  song={currentTrack.title} artist={currentTrack.artist?.name}
                  animated={!!settings.animatedArtwork} reduceMotion={reduceMotion}
                />
              </div>
              <div className="row">
                <div className="meta">
                  <MarqueeText
                    as="div" className="t" text={currentTrack.title}
                    suffix={isPreviewClip ? <span className="badge">{t("preview30")}</span> : null}
                  />
                  <div className="a">{currentTrack.artist?.name}</div>
                </div>
                <div className="aivy-lyrics-actions">
                  <button className={`aivy-icon-btn ${isLiked ? "active" : ""}`} onClick={() => currentTrack && toggleLike(currentTrack)} aria-label={t("like")}>
                    <Star size={17} fill={isLiked ? "currentColor" : "none"} />
                  </button>
                  <button className="aivy-icon-btn" onClick={handleLyricsMore} aria-label={t("more")}><MoreHorizontal size={17} /></button>
                </div>
              </div>
            </div>

            <div className="aivy-lyrics-side-scroll">
              {shareOpen && (
                <div className="aivy-lyrics-share">
                  <div className="cover-mini">
                    <SmartCover src={currentTrack.cover} seed={currentTrack.id + currentTrack.title} size={72} radius={8} style={{ width: "100%", height: "100%" }} />
                  </div>
                  <div className="line">{activeLineText || "\u266a"}</div>
                  <div className="sub">{currentTrack.artist?.name} &middot; {currentTrack.title}</div>
                  <button onClick={handleSaveImage}>{t("saveAsImage")}</button>
                </div>
              )}

              {nextTrack && (
                <div className="aivy-lyrics-next">
                  <span className="label">{t("upNextLabel")}</span>
                  <span className="name">{nextTrack.title} &middot; {nextTrack.artist?.name}</span>
                </div>
              )}

              <div className={`aivy-lyrics-scrubwrap ${singMode ? "is-singing" : ""}`}>
                <button
                  type="button"
                  className={`aivy-sing-btn ${singMode ? "active" : ""}`}
                  onClick={() => setSingMode((v) => !v)}
                  aria-pressed={singMode}
                  aria-label={t("singToggle", "Sing")}
                  title={t("singToggle", "Sing")}
                >
                  <Mic size={14} />
                  <span>{t("singLabel", "Sing")}</span>
                </button>
                <div className="aivy-lyrics-scrubber-row">
                  <span className="aivy-time font-mono">{formatTime(scrubTime)}</span>
                  <Scrubber getRatio={getRatio} onSeekRatio={onSeekRatio} registerFill={registerFill} registerThumb={registerThumb} />
                  <span className="aivy-time right font-mono">{formatTime(scrubDuration)}</span>
                </div>
              </div>

              <TransportButtons big />

              <VolumeControl />

              <MobileNowPlayingIconRow lyricsActive onToggleLyrics={closeLyrics} lyricsDisabled={false} onOpenQueue={openMobileQueue} />
            </div>
          </div>

          <div className="aivy-lyrics-body-wrap" style={{ "--lyrics-fs": LYRICS_FONT_SIZES[fontSize] }}>
            <AppleLyricsPane
              id="aivy-am-lyrics-desktop"
              track={currentTrack}
              currentTime={currentTime}
              onSeek={seekTo}
              highlightColor={highlightColor}
              fontSize={fontSize}
            />
            {lyricsUnsynced && (
              <button type="button" className="aivy-lyr2-pill" onClick={scrollToActiveLyric}>
                {t("syncLyrics")}
              </button>
            )}
          </div>
        </div>
      )}

      {!currentTrack && (
        <div className="aivy-empty" style={{ position: "relative", zIndex: 1 }}><StarMark size={34} color="var(--ink-faint)" /><div className="title">{t("nothingPlaying")}</div></div>
      )}
    </div>
  );
}

function renderAiMarkdown(raw) {
  if (!raw) return null;

  const renderInline = (text, keyBase) => {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const tokens = [];
    let i = 0;
    const regex = /(`[^`]+`)|(\[[^\]]+\]\(https?:\/\/[^\s)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
    let match;
    let last = 0;
    while ((match = regex.exec(escaped))) {
      if (match.index > last) tokens.push({ type: "text", value: escaped.slice(last, match.index) });
      const val = match[0];
      if (val.startsWith("`")) tokens.push({ type: "code", value: val.slice(1, -1) });
      else if (val.startsWith("[")) {
        const m = val.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        tokens.push({ type: "link", value: m?.[1] || val, href: m?.[2] || "#" });
      } else if (val.startsWith("**")) tokens.push({ type: "b", value: val.slice(2, -2) });
      else tokens.push({ type: "i", value: val.slice(1, -1) });
      last = match.index + val.length;
    }
    if (last < escaped.length) tokens.push({ type: "text", value: escaped.slice(last) });

    return tokens.map((tk, idx) => {
      const k = `${keyBase}-${idx}`;
      if (tk.type === "code") return <code key={k}>{tk.value}</code>;
      if (tk.type === "b") return <strong key={k}>{tk.value}</strong>;
      if (tk.type === "i") return <em key={k}>{tk.value}</em>;
      if (tk.type === "link") return <a key={k} href={tk.href} target="_blank" rel="noreferrer">{tk.value}</a>;
      return <React.Fragment key={k}>{tk.value}</React.Fragment>;
    });
  };

  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let listBuf = [];
  let listType = null;

  const flushList = () => {
    if (!listBuf.length) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    blocks.push(
      <Tag key={`list-${blocks.length}`}>
        {listBuf.map((item, i) => <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>)}
      </Tag>
    );
    listBuf = [];
    listType = null;
  };

  lines.forEach((line, idx) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (bullet) { listType = "ul"; listBuf.push(bullet[1]); return; }
    if (numbered) { listType = "ol"; listBuf.push(numbered[1]); return; }
    flushList();
    if (line.trim() === "") return;
    blocks.push(<p key={`p-${idx}`}>{renderInline(line, `p-${idx}`)}</p>);
  });
  flushList();

  return blocks;
}

const AI_QUICK_PROMPTS = [
  { id: "taylor", tid: "Buatin playlist lagu idgitaf", ten: "Make a Taylor Swift playlist" },
  { id: "play", tid: "Puterin lagu jiwa yang bersedih", ten: "Play blank space" },
  { id: "mood", tid: "Rekomendasiin lagu buat santai malam ini", ten: "Recommend chill songs for tonight" },
  { id: "list", tid: "Lihat playlist aku apa aja", ten: "Show me my playlists" },
];

export function AiAssistantWidget() {
  const { settings, authUser } = useUI();
  const { playlists, createPlaylist, addToPlaylist, playSingle, playList, deletePlaylist, updatePlaylistMeta, removeFromPlaylist, toggleLike, liked, upNext, addToQueueEnd, playNextInQueue, removeFromQueue } = usePlayer();
  const [open, setOpen] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chat, setChat] = useState([]);
  const [unread, setUnread] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const historyRef = useRef([]);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const wasOpenRef = useRef(false);
  const closeTimerRef = useRef(null);

  useEffect(() => {
    if (open) {
      clearTimeout(closeTimerRef.current);
      setPanelClosing(false);
    } else if (wasOpenRef.current) {
      setPanelClosing(true);
      closeTimerRef.current = setTimeout(() => setPanelClosing(false), 170);
    }
    wasOpenRef.current = open;
    return () => clearTimeout(closeTimerRef.current);
  }, [open]);

  const panelVisible = open || panelClosing;

  const en = settings.language === "en";
  const tt = (id, us) => (en ? us : id);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chat, sending]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      inputRef.current?.focus();
    }
  }, [open]);

  const pushAssistant = (text) => {
    setChat((c) => [...c, { role: "assistant", text, at: Date.now() }]);
    if (!open) setUnread((n) => n + 1);
  };

  const sendText = async (text) => {
    if (!text || sending) return;
    if (!authUser) {
      setChat((c) => [...c, { role: "user", text, at: Date.now() }]);
      setInput("");
      pushAssistant(tt("Login dulu ya buat pakai fitur ini (misalnya bikin playlist).", "Please log in first to use this (e.g. creating playlists)."));
      return;
    }
    setChat((c) => [...c, { role: "user", text, at: Date.now() }]);
    setInput("");
    setSending(true);
    try {
      const ctx = {
        search: Api.search,
        createPlaylist,
        addToPlaylist,
        playSingle,
        playlists,
        playList,
        deletePlaylist,
        updatePlaylistMeta,
        removeFromPlaylist,
        toggleLike,
        liked,
        upNext,
        addToQueueEnd,
        playNextInQueue,
        removeFromQueue,
      };
      const { text: reply, history } = await runAiAssistantTurn(text, historyRef.current, ctx);
      historyRef.current = history;
      pushAssistant(reply);
    } catch (err) {
      pushAssistant(`${tt("Gagal", "Failed")}: ${err?.message || tt("terjadi kesalahan.", "something went wrong.")}`);
    } finally {
      setSending(false);
    }
  };

  const send = () => sendText(input.trim());

  const resetChat = () => {
    setChat([]);
    historyRef.current = [];
  };

  const copyMessage = (text, idx) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((v) => (v === idx ? null : v)), 1500);
    }).catch(() => {});
  };

  return (
    <>
      <div className="aivy-ai-fab-wrap">
        <button className={`aivy-ai-fab ${open ? "is-open" : ""}`} onClick={() => setOpen((v) => !v)} aria-label="AI Assistant">
          <Sparkles size={20} />
        </button>
        {!open && unread > 0 && (
          <span className="aivy-ai-badge">{unread > 9 ? "9+" : unread}</span>
        )}
      </div>

      {panelVisible && (
        <div className={`aivy-ai-panel ${!open ? "is-closing" : ""}`}>
          <div className="aivy-ai-head">
            <span className="t"><Sparkles size={15} /> {tt("Asisten AI", "AI Assistant")}</span>
            <div className="acts">
              {chat.length > 0 && (
                <button className="aivy-icon-btn sm" onClick={resetChat} aria-label={tt("Bersihkan obrolan", "Clear chat")} title={tt("Bersihkan obrolan", "Clear chat")}>
                  <Trash2 size={14} />
                </button>
              )}
              <button className="aivy-icon-btn sm" onClick={() => setOpen(false)} aria-label={tt("Tutup", "Close")}><X size={15} /></button>
            </div>
          </div>

          <div className="aivy-ai-body" ref={scrollRef}>
            {chat.length === 0 && (
              <div className="aivy-ai-empty">
                {tt(
                  "Coba minta: \"buatin playlist isinya lagu Taylor Swift\" atau \"puterin lagu jiwa yang bersedih\".",
                  "Try asking: \"make me a playlist of Taylor Swift songs\" or \"play wide awake\"."
                )}
                <div className="aivy-ai-suggest">
                  {AI_QUICK_PROMPTS.map((q) => (
                    <button key={q.id} onClick={() => sendText(tt(q.tid, q.ten))} disabled={sending}>
                      {tt(q.tid, q.ten)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i} className={`aivy-ai-msg-wrap ${m.role}`}>
                <div className={`aivy-ai-msg ${m.role}`}>
                  {m.role === "assistant" ? renderAiMarkdown(m.text) : m.text}
                </div>
                <div className="aivy-ai-msg-meta">
                  {m.at && <span className="aivy-ai-msg-time">{formatClockTime ? formatClockTime(m.at) : ""}</span>}
                  {m.role === "assistant" && (
                    <button className="aivy-icon-btn xs aivy-ai-copy-btn" onClick={() => copyMessage(m.text, i)} aria-label={tt("Salin", "Copy")} title={tt("Salin", "Copy")}>
                      {copiedIdx === i ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {sending && <div className="aivy-ai-msg assistant is-typing">{tt("Mikir…", "Thinking…")}</div>}
          </div>

          <div className="aivy-ai-input-row">
            <input
              ref={inputRef}
              className="aivy-ai-input"
              value={input}
              placeholder={tt("Minta AI bikinin playlist, cari lagu, dll…", "Ask the AI to build a playlist, find a song, etc…")}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              disabled={sending}
            />
            <button className="aivy-icon-btn" onClick={send} disabled={sending || !input.trim()} aria-label={tt("Kirim", "Send")}>
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
export function MusicVideoView({ video, onClose, onAudioPlay }) {
  const { t } = useUI();
  const stageRef = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const controlsTimer = useRef(null);
  const playingRef = useRef(false);

  const [src, setSrc] = useState(null);
  const [streamType, setStreamType] = useState("mp4");
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);

  const vId = video?.videoId || video?.id || null;

  const markPlaying = useCallback((v) => {
    playingRef.current = v;
    setPlaying(v);
  }, []);

  const pokeControls = useCallback(() => {
    setControlsHidden(false);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (playingRef.current) setControlsHidden(true);
    }, 2600);
  }, []);
  useEffect(() => {
    if (!video) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (document.fullscreenElement) {
          const p = document.exitFullscreen?.();
          if (p && typeof p.catch === "function") p.catch(() => {});
          return;
        }
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("aivy-video-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("aivy-video-open");
    };
  }, [video, onClose]);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);
  useEffect(() => () => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); }
  }, []);
  const reload = useCallback(() => {
    setStatus("loading");
    setErrorMsg(null);
    setSrc(null);
    setStreamType("mp4");
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
    Api.musicVideoStream(vId)
      .then(({ url, type }) => { setSrc(url); setStreamType(type); setStatus("ready"); })
      .catch(() => { setStatus("error"); setErrorMsg(t("videoUnavailable")); });
  }, [vId, t]);

  useEffect(() => {
    if (!video) return undefined;
    if (!vId) {
      setStatus("error");
      setErrorMsg(t("videoUnavailable"));
      return undefined;
    }
    reload();
    return undefined;
  }, [video, vId, reload]);
  useEffect(() => {
    const video = videoRef.current;
    if (status !== "ready" || !src || !video) return undefined;

    let cancelled = false;
    const tryPlay = () => {
      const p = video.play();
      if (p && typeof p.then === "function") {
        p.then(() => { if (!cancelled) markPlaying(true); }).catch(() => { if (!cancelled) markPlaying(false); });
      } else if (!cancelled) {
        markPlaying(!video.paused);
      }
    };

    if (streamType === "hls") {
      let hls = null;
      import("hls.js")
        .then((mod) => {
          if (cancelled) return;
          const HlsClass = mod.default || mod;
          if (!HlsClass.isSupported()) {
            setStatus("error");
            setErrorMsg(t("videoUnavailable"));
            return;
          }
          hls = new HlsClass({ enableWorker: true, lowLatencyMode: false, backBufferLength: 60 });
          hlsRef.current = hls;
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(HlsClass.Events.MANIFEST_PARSED, () => { if (!cancelled) tryPlay(); });
          hls.on(HlsClass.Events.ERROR, (_e, data) => {
            if (!data?.fatal || cancelled) return;
            console.error("[aivy-mv] hls.js fatal:", data.details);
            setStatus("error");
            setErrorMsg(t("videoUnavailable"));
          });
        })
        .catch(() => {
          if (!cancelled) { setStatus("error"); setErrorMsg(t("videoUnavailable")); }
        });
      return () => {
        cancelled = true;
        if (hls) { hls.destroy(); hlsRef.current = null; }
      };
    }

    video.src = src;
    tryPlay();
    return () => { cancelled = true; };
  }, [status, src, streamType, t, markPlaying]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || v.readyState === 0) return;
    if (v.paused) v.play().then(() => markPlaying(true)).catch(() => {});
    else v.pause();
  };
  const onSeek = (e) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    const next = Math.min(Math.max(Number(e.target.value) || 0, 0), v.duration);
    v.currentTime = next;
    setCurrentTime(next);
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      const p = document.exitFullscreen?.();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } else {
      const el = stageRef.current;
      if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    }
  };

  if (!video) return null;
  const artistName = video.artist?.name || video.artists?.[0]?.name || "";
  const year = video.year || (video.releaseDate ? String(video.releaseDate).slice(0, 4) : null);
  const meta = [video.views, year, video.duration ? formatDuration(video.duration) : null]
    .filter(Boolean)
    .join(" \u00b7 ");
  const poster = video.cover || video.thumbnail || null;

  return (
    <div className="aivy-mv-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={video.title || t("musicVideos")}>
      <div className="aivy-mv-card" onClick={(e) => e.stopPropagation()}>
        <div className="aivy-mv-top">
          <span className="aivy-mv-badge"><Film size={15} /> {t("musicVideos")}</span>
          <button className="aivy-mv-close" onClick={onClose} aria-label={t("close")}><X size={22} /></button>
        </div>
        <div className="aivy-mv-stage" ref={stageRef} onMouseMove={pokeControls} onTouchStart={pokeControls}>
          {vId ? (
            <>
              <video
                ref={videoRef}
                className="aivy-mv-video"
                poster={poster || undefined}
                playsInline
                preload="auto"
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                onPlay={() => { markPlaying(true); pokeControls(); }}
                onPause={() => { markPlaying(false); setControlsHidden(false); }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
                onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
                onDurationChange={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
                onEnded={() => markPlaying(false)}
              />
              {status === "loading" && (
                <div className="aivy-mv-loading">
                  <div className="aivy-mv-spinner" />
                  <span>{t("loadingVideo")}</span>
                </div>
              )}
              {status === "error" && (
                <div className="aivy-mv-error">
                  {poster ? <img src={poster} alt="" /> : null}
                  <span className="aivy-mv-error-msg">{errorMsg || t("videoUnavailable")}</span>
                  <div className="aivy-mv-error-acts">
                    <button type="button" className="aivy-mv-retry" onClick={reload}>
                      <RefreshCw size={14} /> {t("retry")}
                    </button>
                    {onAudioPlay ? (
                      <button type="button" className="aivy-mv-audio-inline" onClick={onAudioPlay}>
                        <Music2 size={14} /> {t("playAudio")}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
              {status === "ready" && !playing && (
                <button type="button" className="aivy-mv-big-play" onClick={togglePlay} aria-label={t("play")}>
                  <Play size={34} fill="currentColor" style={{ marginLeft: 4 }} />
                </button>
              )}
              {status === "ready" && (
                <div className={`aivy-mv-controls${controlsHidden ? " is-hidden" : ""}`} onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="aivy-mv-cbtn" onClick={togglePlay} aria-label={playing ? t("pause") : t("play")}>
                    {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
                  </button>
                  <span className="aivy-mv-time">{formatTime(currentTime)} <em>/</em> {formatTime(duration)}</span>
                  <input
                    className="aivy-mv-seek"
                    type="range"
                    min={0}
                    max={duration > 0 ? Math.floor(duration * 10) / 10 : 0}
                    step={0.1}
                    value={Math.min(currentTime, duration || 0)}
                    onChange={onSeek}
                    disabled={!duration}
                    aria-label={t("play")}
                  />
                  <button type="button" className="aivy-mv-cbtn" onClick={toggleMute} aria-label={muted ? t("unmute") : t("mute")}>
                    {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <button type="button" className="aivy-mv-cbtn" onClick={toggleFullscreen} aria-label={fullscreen ? t("exitFullscreen") : t("fullscreen")}>
                    {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="aivy-mv-na">
              {poster ? <img src={poster} alt="" /> : null}
              <span>{t("videoUnavailable")}</span>
            </div>
          )}
        </div>
        <div className="aivy-mv-info">
          <div className="aivy-mv-titles">
            <div className="aivy-mv-title">{video.title || t("unknownTitle")}</div>
            {artistName ? <div className="aivy-mv-artist">{artistName}</div> : null}
            {meta ? <div className="aivy-mv-meta">{meta}</div> : null}
          </div>
          <div className="aivy-mv-acts">
            {onAudioPlay ? (
              <button type="button" className="aivy-mv-audio-btn" onClick={onAudioPlay}>
                <Music2 size={16} /> {t("playAudio")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}