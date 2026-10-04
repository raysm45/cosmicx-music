import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Play, Pause, Shuffle, Info, Star, MoreHorizontal, ChevronRight, X, Heart } from "lucide-react";
import { Api } from "../lib/api.js";
import { usePlayer, useUI } from "../context.jsx";
import { useRouter } from "../router.jsx";
import { TrackRow, ViewNotFound, SkeletonHeroPage, filterExplicit, FlipList, shuffleArray, useTrackMenuItems, HoverRail, MusicVideoView, MarqueeText } from "../components.jsx";
import { SmartCover, AnimatedCover } from "../lib/brand.jsx";
import { setSeo, SITE_URL } from "../lib/seo.js";
import { useArtworkTint, tintFromHex, useImmersiveHero, ImmersiveHero } from "../lib/immersive.jsx";

const TOP_SONGS_PREVIEW = 15;

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
  const { followedArtistIds, toggleFollowArtist } = usePlayer();
  const favorite = !!artist?.id && followedArtistIds.has(String(artist.id));
  const [showAllSongs, setShowAllSongs] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [videoModal, setVideoModal] = useState(null);
  const [heroVideoUrl, setHeroVideoUrl] = useState(null);
  const [heroArtwork, setHeroArtwork] = useState(null);
  const [heroBgColor, setHeroBgColor] = useState(null);
  const [heroInfo, setHeroInfo] = useState(null);
  const [logoBroken, setLogoBroken] = useState(false);
  const [videoBroken, setVideoBroken] = useState(false);
  const heroVideoRef = useRef(null);
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
  const { t, settings } = useUI();

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

  useEffect(() => {
    if (!artist?.name) return;
    const path = `/artist/${encodeURIComponent(params.id)}`;
    setSeo({
      title: `${artist.name} | cosmicx Music`,
      description: `${artist.name} di cosmicx Music. Dengarkan lagu terpopuler, album, dan single dari ${artist.name}.`,
      path, image: artist.image || artist.banner || null, type: "profile",
      jsonLd: { "@context": "https://schema.org", "@type": "MusicGroup", name: artist.name, url: SITE_URL + path, ...(artist.image ? { image: artist.image } : {}) },
    });
  }, [artist, params.id]);

  const posterImg = heroArtwork || artist?.banner || artist?.image || null;
  const tintSource = artist?.image || artist?.banner || artist?.albums?.[0]?.cover || null;
  const tintFromArt = useArtworkTint(tintSource);
  const tint = useMemo(() => {
    if (!heroBgColor) return tintFromArt;
    const derived = tintFromHex(heroBgColor);
    return derived || tintFromArt;
  }, [heroBgColor, tintFromArt]);
  const { mediaRef, pageRef, heroRef } = useImmersiveHero({ ready: !!artist, tint });

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
              onClick={() => toggleFollowArtist(artist)}
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
  const { playList, savedAlbumIds, toggleSaveAlbum } = usePlayer();
  const { navigate } = useRouter();
  const { t, settings } = useUI();
  const [localShuffle, setLocalShuffle] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    document.getElementById("aivy-content-scroll")?.scrollTo({ top: 0 });
    Api.album(params.id).then((res) => { if (alive) { setAlbum(res); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [params.id]);

  useEffect(() => {
    if (!album?.title) return;
    const path = `/album/${encodeURIComponent(params.id)}`;
    const by = album.artist?.name || "";
    setSeo({
      title: by ? `${album.title} - Album oleh ${by} | cosmicx Music` : `${album.title} | cosmicx Music`,
      description: `Dengarkan ${album.title}${by ? ` oleh ${by}` : ""} di cosmicx Music${album.tracks?.length ? `. ${album.tracks.length} lagu.` : "."}`,
      path, image: album.cover || null, type: "music.album",
      jsonLd: { "@context": "https://schema.org", "@type": "MusicAlbum", name: album.title, url: SITE_URL + path, ...(by ? { byArtist: { "@type": "MusicGroup", name: by } } : {}), ...(album.cover ? { image: album.cover } : {}), ...(album.tracks?.length ? { numTracks: album.tracks.length } : {}) },
    });
  }, [album, params.id]);

  const albumTracks = useMemo(() => filterExplicit(album?.tracks, settings) || [], [album, settings]);
  const totalMin = Math.round(albumTracks.reduce((s, tr) => s + (tr.duration || 0), 0) / 60);
  const [displayTracks, setDisplayTracks] = useState(albumTracks);

  useEffect(() => {
    setDisplayTracks(localShuffle ? shuffleArray(albumTracks) : albumTracks);
  }, [albumTracks, localShuffle]);

  const tint = useArtworkTint(album?.cover || null);
  const { mediaRef, pageRef, heroRef } = useImmersiveHero({ ready: !!album, tint });
  const reduceMotion = !!settings.reducedMotion || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  if (loading) return <div className="aivy-am-fallback"><SkeletonHeroPage rows={7} /></div>;
  if (!album) return <div className="aivy-am-fallback"><ViewNotFound label={t("albumLabel")} /></div>;
  const albumSaved = savedAlbumIds.has(String(album.id));

  return (
    <div ref={pageRef} className="aivy-view-enter aivy-am-page is-cover-page">
      <ImmersiveHero
        mediaRef={mediaRef}
        heroRef={heroRef}
        coverStyle
        media={(
          <AnimatedCover
            src={album.cover} seed={"album-bg" + album.id + album.title} size={800} radius={0}
            style={{ width: "100%", height: "100%" }}
            song={album.title} artist={album.artist?.name}
            animated={!!settings.animatedArtwork} reduceMotion={reduceMotion}
          />
        )}
      >
        <div className="aivy-am-kicker">{t("albumLabel")}</div>
        <h1 className="aivy-am-name">{album.title}</h1>
        <div className="aivy-am-sub">
          {album.artist?.name && (
            <span
              className={album.artist.id ? "is-link" : undefined}
              onClick={album.artist.id ? () => navigate("artist", { params: { id: album.artist.id } }) : undefined}
            >{album.artist.name}</span>
          )}
          {album.releaseDate ? <span>{String(album.releaseDate).slice(0, 4)}</span> : null}
          <span>{`${albumTracks.length} ${t("trackCountLabel")}, ${totalMin} ${t("minutesLabel")}`}</span>
        </div>
        <div className="aivy-am-actions">
          <button className={`aivy-am-ghost ${localShuffle ? "active" : ""}`} onClick={() => setLocalShuffle((v) => !v)} aria-label={t("shuffle")} aria-pressed={localShuffle} title={t("shuffle")}><Shuffle size={18} /></button>
          <button className="aivy-am-cta" onClick={() => playList(albumTracks, 0, null, localShuffle)} aria-label={t("playAlbum")} title={t("playAlbum")}><Play size={25} fill="currentColor" /></button>
          <button className={`aivy-am-ghost ${albumSaved ? "active" : ""}`} onClick={() => toggleSaveAlbum(album)} aria-label={albumSaved ? t("removeAlbumBtn") : t("saveAlbumBtn")} aria-pressed={albumSaved} title={albumSaved ? t("removeAlbumBtn") : t("saveAlbumBtn")}><Heart size={18} fill={albumSaved ? "currentColor" : "none"} /></button>
        </div>
      </ImmersiveHero>

      <div className="aivy-am-body is-tracklist">
        <div className="aivy-am-body-inner">
          <FlipList
            items={displayTracks}
            getKey={(tr) => tr.id}
            renderItem={(tr) => <TrackRow track={tr} index={albumTracks.indexOf(tr)} list={albumTracks} queueMode="context" shuffleOverride={localShuffle} />}
          />
        </div>
      </div>
    </div>
  );
}
