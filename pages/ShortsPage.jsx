import React, { useState, useEffect, useRef, useCallback } from "react";
import { Heart, Plus, VolumeX, Volume2, Music2, ArrowLeft } from "lucide-react";
import { Api } from "../lib/api.js";
import { usePlayer, useUI } from "../context.jsx";
import { useRouter } from "../router.jsx";
import { SmartCover, StarLoader } from "../lib/brand.jsx";
import { uid } from "../lib/utils.js";
import { filterExplicit, MarqueeText } from "../components.jsx";

function useActiveOnScreen(threshold = 0.65) {
  const ref = useRef(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, active];
}

function ShortCard({ track, muted, onToggleMute }) {
  const [ref, active] = useActiveOnScreen();
  const [videoId, setVideoId] = useState(track.videoId || null);
  const resolvingRef = useRef(false);
  const audioRef = useRef(null);
  const { liked, toggleLike, playRadio, addToQueueEnd } = usePlayer();
  const { navigate } = useRouter();
  const { t, pushToast } = useUI();
  const isLiked = liked.has(String(track.videoId || track.id));
  const hasPreview = !!track.preview;

  useEffect(() => {
    if (!active || videoId || resolvingRef.current) return;
    resolvingRef.current = true;
    let alive = true;
    Api.search(`${track.title} ${track.artist?.name || ""}`.trim())
      .then((res) => { if (alive && res?.[0]?.videoId) setVideoId(res[0].videoId); })
      .catch(() => {})
      .finally(() => { resolvingRef.current = false; });
    return () => { alive = false; };
  }, [active, videoId, track]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !hasPreview) return;
    if (active) {
      audio.currentTime = 0;
      audio.muted = muted;
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [active, hasPreview]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  const handlePlayFull = () => {
    audioRef.current?.pause();
    playRadio(track);
    pushToast(t("toastPlayingFullSong"));
  };

  const videoActive = active && videoId;
  const embedSrc = videoActive
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${hasPreview ? 1 : (muted ? 1 : 0)}&controls=0&loop=1&playlist=${videoId}&start=0&end=30&playsinline=1&modestbranding=1&rel=0`
    : "";

  return (
    <div className="aivy-short-slide" ref={ref}>
      {hasPreview && <audio ref={audioRef} src={track.preview} loop preload="none" />}
      <div className="aivy-short-media">
        {embedSrc ? (
          <iframe
            key={videoId}
            src={embedSrc}
            title={track.title}
            allow="autoplay; encrypted-media"
            frameBorder="0"
          />
        ) : (
          <SmartCover src={track.cover} seed={"short" + track.id} size={640} radius={0} style={{ width: "100%", height: "100%" }} />
        )}
        <div className="aivy-short-scrim" />
      </div>

      <button className="aivy-short-mute" onClick={onToggleMute} aria-label={muted ? t("unmute") : t("mute")}>
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>

      <div className="aivy-short-overlay">
        <div className="aivy-short-meta">
          <MarqueeText
            as="div"
            className="t"
            text={track.title}
            prefix={track.explicit ? <span className="aivy-explicit-badge" title="Explicit">E</span> : null}
          />
          <div className="a" onClick={() => track.artist?.id && navigate("artist", { params: { id: track.artist.id } })}>
            {track.artist?.name || "\u2014"}
          </div>
        </div>
        <div className="aivy-short-actions">
          <button className={`aivy-short-action ${isLiked ? "active" : ""}`} onClick={() => toggleLike(track)} aria-label={t("like")}>
            <Heart size={22} fill={isLiked ? "currentColor" : "none"} />
          </button>
          <button className="aivy-short-action" onClick={() => { addToQueueEnd(track); }} aria-label={t("menuAddQueue")}>
            <Plus size={22} />
          </button>
          <button className="aivy-short-action primary" onClick={handlePlayFull} aria-label={t("shortsPlayFull")}>
            <Music2 size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShortsPage() {
  const { settings, t } = useUI();
  const { back } = useRouter();
  const seedRef = useRef(uid("shorts-seed"));
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const sentinelRef = useRef(null);
  const scrollerRef = useRef(null);
  const seenIds = useRef(new Set());

  const loadMore = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await Api.discover(seedRef.current, cursor, 12);
      const tracks = filterExplicit((res.items || []).filter((it) => it.type === "track"), settings);
      const fresh = tracks.filter((it) => {
        if (seenIds.current.has(it.id)) return false;
        seenIds.current.add(it.id);
        return true;
      });
      setItems((prev) => [...prev, ...fresh]);
      setCursor(res.nextCursor);
    } catch {}
    setLoading(false);
  }, [cursor, loading, settings]);

  useEffect(() => { loadMore(); }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore(); }, { rootMargin: "1200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  useEffect(() => {
    if (items.length > 0 && scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [items.length > 0]);

  return (
    <div className="aivy-shorts-page">
      <button className="aivy-short-back" onClick={back} aria-label={t("previous")}><ArrowLeft size={18} /></button>
      <div className="aivy-shorts-scroller aivy-scroll" ref={scrollerRef}>
        {items.map((tr) => <ShortCard key={tr.id} track={tr} muted={muted} onToggleMute={() => setMuted((m) => !m)} />)}
        <div ref={sentinelRef} className="aivy-shorts-sentinel">
          {loading && <StarLoader size={28} />}
        </div>
      </div>
    </div>
  );
}