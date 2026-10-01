import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Play, Pause, Shuffle, Info, Star, MoreHorizontal, ChevronRight, X } from "lucide-react";
import { Api } from "../lib/api.js";
import { usePlayer, useUI } from "../context.jsx";
import { useRouter } from "../router.jsx";
import { TrackRow, ViewNotFound, SkeletonHeroPage, filterExplicit, FlipList, shuffleArray, useTrackMenuItems, HoverRail, MusicVideoView, MarqueeText } from "../components.jsx";
import { SmartCover } from "../lib/brand.jsx";

const TOP_SONGS_PREVIEW = 15;

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function useArtworkTint(src) {
  const [tint, setTint] = useState(null);
  useEffect(() => {
    if (!src) { setTint(null); return undefined; }
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!alive) return;
      try {
        const canvas = document.createElement("canvas");
        const size = 28;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 32) continue;
          const mx = Math.max(data[i], data[i + 1], data[i + 2]);
          const mn = Math.min(data[i], data[i + 1], data[i + 2]);
          const weight = 0.35 + (mx - mn) / 255;
          r += data[i] * weight; g += data[i + 1] * weight; b += data[i + 2] * weight; w += weight;
        }
        if (!w) return;
        const [h, s] = rgbToHsl(r / w, g / w, b / w);
        if (alive) setTint(tintFromHsl(h, s * 100));
      } catch {
        // Canvas ke-taint (gambar cross-origin tanpa header CORS) atau gagal decode.
        // Daripada diem-diem gak pasang tint sama sekali (sidebar jadi item polos),
        // pasang fallback glass netral biar panel tetep keliatan kaca, bukan hitam.
        if (alive) setTint(FALLBACK_TINT);
      }
    };
    img.onerror = () => { if (alive) setTint(FALLBACK_TINT); };
    img.src = src;
    return () => { alive = false; };
  }, [src]);
  return tint;
}

// Lightness dinaikin dari 9% -> 15% dan saturation minimum dari 14 -> 22 biar tint-nya
// kebaca sebagai kaca berwarna, bukan nyaris-hitam yang keliatan sama aja kayak panel polos.
function tintFromHsl(h, satPct) {
  const hue = Math.round(h);
  const s = Math.round(Math.min(52, Math.max(22, satPct)));
  return {
    bg: `hsl(${hue} ${s}% 15%)`,
    accent: `hsl(${hue} ${Math.min(72, s + 24)}% 78%)`,
    accentInk: `hsl(${hue} ${Math.min(60, s + 10)}% 12%)`,
  };
}
// Dipakai kalau ekstraksi warna dari artwork gagal (misal canvas ke-taint karena CORS)
// supaya panel tetep kelihatan kaca (frosted), bukan jatuh balik ke hitam polos.
const FALLBACK_TINT = tintFromHsl(230, 30);
function hexToRgb(hex) {
  const m = String(hex || "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
function tintFromHex(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [h, sat] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return tintFromHsl(h, sat * 100);
}
function pickHeroRendition(hero) {
  if (!hero) return null;
  const conn = typeof navigator !== "undefined" ? navigator.connection : null;
  const slow = conn && (conn.saveData || /2g/.test(conn.effectiveType || ""));
  if (slow) {
    const list = [...(hero.renditions || [])].sort((a, b) => (a.bandwidth || 0) - (b.bandwidth || 0));
    return list[0] || hero.fastVideo || hero.video || null;
  }
  return hero.fastVideo || hero.video || null;
}

function releaseYear(value) {
  if (!value) return "";
  const s = String(value);
  const m = s.match(/\d{4}/);
  return m ? m[0] : "";
}

function formatReleaseDate(value, lang) {
  if (!value) return "";
  const s = String(value);
  if (/^\d{4}$/.test(s.trim())) return s.trim();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return releaseYear(s);
  return d.toLocaleDateString(lang === "en" ? "en-US" : "id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function albumKindLabel(album, t) {
  const raw = String(album?.type || album?.albumType || "").toLowerCase();
  if (raw.includes("single")) return "Single";
  if (raw.includes("ep")) return "EP";
  if (raw.includes("album")) return t("albumLabel");
  const title = String(album?.title || "");
  if (/\bsingle\b/i.test(title)) return "Single";
  if (/\bEP\b/.test(title)) return "EP";
  return t("albumLabel");
}
function AmSongRow({ track, index, list }) {
  const { currentTrack, isPlaying, togglePlay, playList } = usePlayer();
  const { openContextMenu, t } = useUI();
  const isCurrent = currentTrack && currentTrack.id === track.id;
  const items = useTrackMenuItems(track);

  const play = () => {
    if (isCurrent) { togglePlay(); return; }
    playList(list, index);
  };
  const openMenu = (e) => {
    e.preventDefault(); e.stopPropagation();
    openContextMenu(e.clientX, e.clientY, items);
  };

  const sub = [track.album?.title || track.albumTitle, releaseYear(track.album?.releaseDate || track.releaseDate || track.year)]
    .filter(Boolean).join(" \u00b7 ");

  return (
    <div
      className={`aivy-am-song ${isCurrent ? "is-current" : ""}`}
      onClick={play}
      onContextMenu={openMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); play(); } }}
    >
      <span className="art">
        <SmartCover src={track.cover} seed={track.id + track.title} size={44} radius={5} style={{ width: 44, height: 44 }} />
        <span className="hover-play">{isCurrent && isPlaying ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}</span>
      </span>
      <span className="meta">
        <MarqueeText
          as="span" className="t" text={track.title}
          prefix={track.explicit ? <span className="aivy-explicit-badge" title="Explicit">E</span> : null}
        />
        {sub && <span className="s">{sub}</span>}
      </span>
      <button className="dots" onClick={openMenu} aria-label={t("menuMore")}><MoreHorizontal size={17} /></button>
    </div>
  );
}
function AmTile({ cover, seed, title, sub, onClick, onPlay, variant = "square" }) {
  return (
    <div className={`aivy-am-tile is-${variant}`} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(); } }}>
      <div className="art">
        <SmartCover src={cover} seed={seed} size={240} radius={0} style={{ width: "100%", height: "100%" }} />
        {onPlay && (
          <button className="tile-play" onClick={(e) => { e.stopPropagation(); onPlay(); }} aria-label="Play">
            <Play size={15} fill="currentColor" />
          </button>
        )}
      </div>
      <div className="t">{title}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}

function AmSectionHead({ title, onClick }) {
  if (!onClick) return <div className="aivy-am-head"><h2>{title}</h2></div>;
  return (
    <button className="aivy-am-head is-link" onClick={onClick}>
      <h2>{title}</h2><ChevronRight size={18} />
    </button>
  );
}

export function ArtistPage() {
  const { params, navigate } = useRouter();
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [favorite, setFavorite] = useState(false);
  const [showAllSongs, setShowAllSongs] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [videoModal, setVideoModal] = useState(null);
  const [heroVideoUrl, setHeroVideoUrl] = useState(null);
  const [heroArtwork, setHeroArtwork] = useState(null);
  const [heroBgColor, setHeroBgColor] = useState(null);
  const [heroInfo, setHeroInfo] = useState(null);
  const [logoBroken, setLogoBroken] = useState(false);
  const [videoBroken, setVideoBroken] = useState(false);
  const mediaRef = useRef(null);
  const pageRef = useRef(null);
  const heroRef = useRef(null);
  const heroVideoRef = useRef(null);

  // Hero video cuma perlu decode selagi ada di viewport. Halaman artist bisa panjang
  // (scroll ke bawah buat liat semua lagu/album), jadi kalau hero-nya udah lewat,
  // video di-pause biar decoder ga jalan sia-sia di background.
  useEffect(() => {
    const el = heroVideoRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { el.play?.().catch(() => {}); }
        else { el.pause?.(); }
      },
      { threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [heroVideoUrl]);
  const { playList, playSingle } = usePlayer();
  const { pushToast, t, settings } = useUI();

  useEffect(() => {
    document.body.classList.add("aivy-artist-immersive");
    return () => {
      document.body.classList.remove("aivy-artist-immersive");
      document.body.style.removeProperty("--artist-bg");
      document.body.style.removeProperty("--artist-accent");
      document.body.style.removeProperty("--artist-accent-ink");
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setShowAllSongs(false);
    setAboutOpen(false);
    setVideoBroken(false);
    setHeroVideoUrl(null);
    setHeroArtwork(null);
    setHeroInfo(null);
    setLogoBroken(false);
    document.getElementById("aivy-content-scroll")?.scrollTo({ top: 0 });
    Api.artist(params.id).then((res) => {
      if (!alive) return;
      setArtist(res);
      setLoading(false);
      if (res?.name) {
        Api.appleMusicHero(res.name)
          .then((h) => {
            if (!alive) return;
            setHeroInfo(h);
            const chosen = pickHeroRendition(h);
            if (chosen?.url) setHeroVideoUrl(Api.appleMusicVideoUrl(chosen.url));
            const poster = h?.previewFrame?.url || h?.artwork?.url;
            if (poster) setHeroArtwork(poster);
            if (h?.artwork?.bgColor) setHeroBgColor(h.artwork.bgColor);
          })
          .catch(() => {});
      }
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [params.id]);

  const posterImg = heroArtwork || artist?.banner || artist?.image || null;
  const tintSource = artist?.image || artist?.banner || artist?.albums?.[0]?.cover || null;
  const tintFromArt = useArtworkTint(tintSource);
  const tint = useMemo(() => {
    if (!heroBgColor) return tintFromArt;
    const derived = tintFromHex(heroBgColor);
    return derived || tintFromArt;
  }, [heroBgColor, tintFromArt]);
  useEffect(() => {
    if (!tint) return undefined;
    document.body.style.setProperty("--artist-bg", tint.bg);
    document.body.style.setProperty("--artist-accent", tint.accent);
    document.body.style.setProperty("--artist-accent-ink", tint.accentInk);
    return undefined;
  }, [tint]);
  useEffect(() => {
    if (!artist) return undefined;
    const scroller = document.getElementById("aivy-content-scroll");
    if (!scroller) return undefined;
    let raf = 0;
    let lastBlurStep = -1;
    let lastProgStep = -1;
    // filter: blur() dan backdrop-filter: blur() itu paling mahal buat GPU low-end.
    // shift/zoom (transform) aman di-update tiap frame, tapi kedua nilai blur cukup
    // di-quantize ke step kasar — browser skip repaint blur kalau nilai CSS var-nya
    // sama persis, dan mata ga bisa bedain step sehalus ini pas lagi scroll cepat.
    const BLUR_STEPS = 14;
    const apply = () => {
      raf = 0;
      const heroH = heroRef.current?.offsetHeight || Math.round((window.innerHeight || 800) * 0.78);
      const top = scroller.scrollTop;
      const shift = Math.min(top, heroH);
      const progress = Math.min(1, top / Math.max(1, heroH * 0.82));
      const step = Math.round(progress * BLUR_STEPS) / BLUR_STEPS;
      if (mediaRef.current) {
        mediaRef.current.style.setProperty("--am-shift", `${-shift}px`);
        const blurStep = Math.round(progress * BLUR_STEPS);
        if (blurStep !== lastBlurStep) {
          lastBlurStep = blurStep;
          mediaRef.current.style.setProperty("--am-blur", `${(step * 26).toFixed(1)}px`);
        }
        mediaRef.current.style.setProperty("--am-zoom", (1 + progress * 0.06).toFixed(4));
      }
      if (pageRef.current) {
        const progStep = Math.round(progress * BLUR_STEPS);
        if (progStep !== lastProgStep) {
          lastProgStep = progStep;
          pageRef.current.style.setProperty("--am-progress", step.toFixed(3));
        }
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [artist]);

  useEffect(() => {
    if (!aboutOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setAboutOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aboutOpen]);

  const topTracks = useMemo(() => filterExplicit(artist?.topTracks, settings) || [], [artist, settings]);

  const albums = useMemo(() => {
    const list = Array.isArray(artist?.albums) ? [...artist.albums] : [];
    return list.sort((a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")));
  }, [artist]);

  const latest = albums[0] || null;
  const otherReleases = albums.slice(1);
  const musicVideos = artist?.musicVideos || artist?.videos || [];
  const playlists = artist?.playlists || artist?.artistPlaylists || [];

  const openMusicVideo = useCallback((v) => {
    const videoId = v?.videoId || v?.id;
    if (!videoId) return;
    setVideoModal(v);
  }, []);

  const playMusicVideoAudio = useCallback((v) => {
    const videoId = v?.videoId || v?.id;
    if (!videoId) return;
    playSingle({
      id: videoId,
      videoId,
      title: v.title,
      artist: v.artist || (artist ? { id: artist.id, name: artist.name } : null),
      artists: v.artist ? [v.artist] : undefined,
      cover: v.cover || v.thumbnail,
      duration: v.duration || null,
    });
  }, [playSingle, artist]);

  const playAlbum = useCallback(async (albumId) => {
    try {
      const full = await Api.album(albumId);
      if (full?.tracks?.length) playList(full.tracks, 0);
    } catch {}
  }, [playList]);

  if (loading) return <div className="aivy-am-fallback"><SkeletonHeroPage round rows={5} /></div>;
  if (!artist) return <div className="aivy-am-fallback"><ViewNotFound label={t("artistLabel")} /></div>;

  const songs = showAllSongs ? topTracks : topTracks.slice(0, TOP_SONGS_PREVIEW);
  // Video hero selalu ditampilkan (autoplay seperti semula) — deteksi "low-end device"
  // pakai navigator.deviceMemory/hardwareConcurrency ternyata gak reliable (banyak HP
  // normal ikut ke-flag gara-gara browser nge-cap nilai itu), jadi cuma dipakai IO
  // buat pause pas di luar viewport, bukan buat matiin videonya sama sekali.
  const showHeroVideo = heroVideoUrl && !videoBroken;
  const heroLogoUrl = heroInfo?.customName?.url ? Api.appleMusicVideoUrl(heroInfo.customName.url) : null;
  const showLogo = heroLogoUrl && !logoBroken;
  const hasAbout = !!(artist.bio || artist.tags?.length || artist.listeners);

  return (
    <div ref={pageRef} className="aivy-view-enter aivy-am-page">
      {}
      <div ref={mediaRef} className="aivy-am-media" aria-hidden="true">
        {showHeroVideo ? (
          <video
            ref={heroVideoRef}
            key={heroVideoUrl}
            src={heroVideoUrl}
            poster={posterImg || undefined}
            autoPlay muted loop playsInline
            preload="auto"
            disablePictureInPicture
            onError={() => setVideoBroken(true)}
            onCanPlay={(e) => { e.currentTarget.dataset.ready = "1"; }}
          />
        ) : (
          <SmartCover src={posterImg} seed={"artist-bg" + artist.id + artist.name} size={1600} radius={0} style={{ width: "100%", height: "100%" }} />
        )}
        {}
        <div className="aivy-am-media-blur" />
        <div className="aivy-am-media-scrim" />
      </div>

      {}
      <header ref={heroRef} className="aivy-am-hero">
        <div className="aivy-am-hero-inner">
          {showLogo ? (
            <img
              className="aivy-artist-title-logo"
              src={heroLogoUrl}
              alt={artist.name}
              onError={() => setLogoBroken(true)}
            />
          ) : (
            <h1 className="aivy-am-name">{artist.name}</h1>
          )}
          <div className="aivy-am-actions">
            <button
              className="aivy-am-ghost"
              onClick={() => setAboutOpen(true)}
              disabled={!hasAbout}
              aria-label={t("aboutArtist")}
              title={t("aboutArtist")}
            >
              <Info size={18} />
            </button>
            <button
              className="aivy-am-cta"
              onClick={() => topTracks.length && playList(topTracks, 0)}
              aria-label={t("playAll")}
              title={t("playAll")}
            >
              <Play size={25} fill="currentColor" />
            </button>
            <button
              className={`aivy-am-ghost ${favorite ? "active" : ""}`}
              onClick={() => {
                setFavorite((f) => !f);
                pushToast(favorite ? `${t("unfollowedToast")} ${artist.name}` : `${t("followedToast")} ${artist.name}`);
              }}
              aria-pressed={favorite}
              aria-label={t("favorite")}
              title={t("favorite")}
            >
              <Star size={18} fill={favorite ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </header>

      {}
      <div className="aivy-am-body">
        <div className="aivy-am-body-inner">
          <div className={`aivy-am-topgrid ${latest ? "" : "is-single"}`}>
            {latest && (
              <section className="aivy-am-block">
                <AmSectionHead title={t("latestRelease")} />
                <div className="aivy-am-latest" onClick={() => navigate("album", { params: { id: latest.id } })} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") navigate("album", { params: { id: latest.id } }); }}>
                  <div className="art">
                    <SmartCover src={latest.cover} seed={"album" + latest.id + latest.title} size={320} radius={0} style={{ width: "100%", height: "100%" }} />
                    <button className="tile-play" onClick={(e) => { e.stopPropagation(); playAlbum(latest.id); }} aria-label={t("playAlbum")}>
                      <Play size={16} fill="currentColor" />
                    </button>
                  </div>
                  <div className="meta">
                    {formatReleaseDate(latest.releaseDate, settings.language) && (
                      <div className="date">{formatReleaseDate(latest.releaseDate, settings.language)}</div>
                    )}
                    <div className="title">{latest.title}</div>
                    <div className="sub">
                      {albumKindLabel(latest, t)}
                      {latest.trackCount ? ` \u00b7 ${latest.trackCount} ${t("trackCountLabel")}` : ""}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {songs.length > 0 && (
              <section className="aivy-am-block">
                <AmSectionHead
                  title={t("topSongs")}
                  onClick={topTracks.length > TOP_SONGS_PREVIEW ? () => setShowAllSongs((s) => !s) : undefined}
                />
                <div className="aivy-am-songgrid">
                  {songs.map((tr, i) => <AmSongRow key={tr.id} track={tr} index={i} list={topTracks} />)}
                </div>
              </section>
            )}
          </div>

          {musicVideos.length > 0 && (
            <section className="aivy-am-block">
              <AmSectionHead title={t("musicVideos")} />
              <HoverRail>
                {musicVideos.map((v) => (
                  <AmTile
                    key={v.id || v.url || v.title}
                    variant="video"
                    cover={v.thumbnail || v.cover}
                    seed={"mv" + (v.id || v.title)}
                    title={v.title}
                    sub={[v.views, releaseYear(v.releaseDate || v.year)].filter(Boolean).join(" \u00b7 ")}
                    onClick={() => openMusicVideo(v)}
                    onPlay={() => openMusicVideo(v)}
                  />
                ))}
              </HoverRail>
            </section>
          )}

          {otherReleases.length > 0 && (
            <section className="aivy-am-block">
              <AmSectionHead title={t("singlesEps")} />
              <HoverRail>
                {otherReleases.map((a) => (
                  <AmTile
                    key={a.id}
                    cover={a.cover}
                    seed={"album" + a.id + a.title}
                    title={a.title}
                    sub={releaseYear(a.releaseDate)}
                    onClick={() => navigate("album", { params: { id: a.id } })}
                    onPlay={() => playAlbum(a.id)}
                  />
                ))}
              </HoverRail>
            </section>
          )}

          {playlists.length > 0 && (
            <section className="aivy-am-block">
              <AmSectionHead title={t("artistPlaylists")} />
              <HoverRail>
                {playlists.map((p) => (
                  <AmTile
                    key={p.id}
                    cover={p.cover}
                    seed={"pl" + p.id + p.title}
                    title={p.title || p.name}
                    sub={p.subtitle || ""}
                    onClick={() => navigate("playlist", { params: { id: p.id } })}
                  />
                ))}
              </HoverRail>
            </section>
          )}

          {artist.relatedArtists?.length > 0 && (
            <section className="aivy-am-block">
              <AmSectionHead title={t("similarArtists")} />
              <HoverRail>
                {artist.relatedArtists.map((a) => (
                  <AmTile
                    key={a.id}
                    variant="round"
                    cover={a.image}
                    seed={"artist" + a.id + a.name}
                    title={a.name}
                    onClick={() => navigate("artist", { params: { id: a.id } })}
                  />
                ))}
              </HoverRail>
            </section>
          )}
        </div>
      </div>

      {/* ---------- Popover Info (tombol "i") ---------- */}
      {aboutOpen && (
        <div className="aivy-am-about-backdrop" onClick={() => setAboutOpen(false)} role="presentation">
          <div className="aivy-am-about aivy-scroll" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("aboutArtist")}>
            <button className="close" onClick={() => setAboutOpen(false)} aria-label={t("close")}><X size={17} /></button>
            <div className="eyebrow">{t("artistLabel")}</div>
            <h3>{artist.name}</h3>
            {artist.listeners ? (
              <div className="listeners">
                {artist.listeners.toLocaleString(settings.language === "en" ? "en-US" : "id-ID")} {t("listenersMonthly")}
              </div>
            ) : null}
            {artist.tags?.length > 0 && (
              <div className="aivy-tagrow" style={{ padding: "12px 0 0" }}>
                {artist.tags.map((tag) => <span key={tag} className="aivy-chip">{tag}</span>)}
              </div>
            )}
            {artist.bio && <p>{artist.bio}</p>}
          </div>
        </div>
      )}

      {videoModal && (
        <MusicVideoView
          video={videoModal}
          onClose={() => setVideoModal(null)}
          onAudioPlay={() => { playMusicVideoAudio(videoModal); setVideoModal(null); }}
        />
      )}
    </div>
  );
}

export function AlbumPage() {
  const { params } = useRouter();
  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const { playList } = usePlayer();
  const { navigate } = useRouter();
  const { t, settings } = useUI();
  const [localShuffle, setLocalShuffle] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Api.album(params.id).then((res) => { if (alive) { setAlbum(res); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [params.id]);

  const albumTracks = useMemo(() => filterExplicit(album?.tracks, settings) || [], [album, settings]);
  const totalMin = Math.round(albumTracks.reduce((s, tr) => s + (tr.duration || 0), 0) / 60);
  const [displayTracks, setDisplayTracks] = useState(albumTracks);

  useEffect(() => {
    setDisplayTracks(localShuffle ? shuffleArray(albumTracks) : albumTracks);
  }, [albumTracks, localShuffle]);

  if (loading) return <SkeletonHeroPage rows={7} />;
  if (!album) return <ViewNotFound label={t("albumLabel")} />;

  return (
    <div className="aivy-view-enter">
      <div className="aivy-hero">
        <div className="art"><SmartCover src={album.cover} seed={"album" + album.id + album.title} size={176} radius={16} style={{ width: 176, height: 176 }} /></div>
        <div className="aivy-hero-meta">
          <div className="eyebrow">{t("albumLabel")}</div>
          <h1 className="font-display">{album.title}</h1>
          <div className="stats">
            <span onClick={() => navigate("artist", { params: { id: album.artist.id } })} style={{ cursor: "pointer", color: "var(--ink)", fontWeight: 600 }}>{album.artist?.name}</span>
            <span>{album.releaseDate ? `\u00b7 ${String(album.releaseDate).slice(0, 4)}` : ""}</span>
            <span>{`\u00b7 ${albumTracks.length} ${t("trackCountLabel")}, ${totalMin} ${t("minutesLabel")}`}</span>
          </div>
        </div>
      </div>
      <div className="aivy-hero-actions">
        <button className="aivy-play-btn is-hero" style={{ width: 52, height: 52 }} onClick={() => playList(albumTracks, 0, null, localShuffle)} aria-label={t("playAlbum")}><Play size={22} fill="currentColor" /></button>
        <button className={`aivy-icon-btn-solid ${localShuffle ? "active" : ""}`} onClick={() => setLocalShuffle((s) => !s)} aria-label={t("shuffle")} aria-pressed={localShuffle} title={t("shuffle")}><Shuffle size={18} /></button>
      </div>
      <FlipList
        items={displayTracks}
        getKey={(tr) => tr.id}
        renderItem={(tr) => <TrackRow track={tr} index={albumTracks.indexOf(tr)} list={albumTracks} queueMode="context" shuffleOverride={localShuffle} />}
      />
    </div>
  );
}