import React, { useState, useEffect, useMemo } from "react";
import {
  Play, Pause, RefreshCw, Heart, MoreHorizontal, Sparkles, Radio,
  Shuffle, Users, Disc3, Flame, Compass, ArrowUpRight,
} from "lucide-react";
import { Api } from "../lib/api.js";
import { usePlayer, useUI } from "../context.jsx";
import { useRouter } from "../router.jsx";
import {
  CardTrack, CardAlbum, CardArtist, filterExplicit, useTrackMenuItems,
  HoverRail, MarqueeText, resolveDisplayName,
} from "../components.jsx";
import { FeedTabs } from "./FeedPages.jsx";
import { ExploreFeed } from "./ExploreFeed.jsx";
import { SmartCover, sizedThumb } from "../lib/brand.jsx";
import { DonationBanner } from "../DonationBanner.jsx";
import { formatDuration } from "../lib/utils.js";

function greetingKeys() {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return { title: "greetMorningTitle", sub: "greetMorningSub", badge: "MORNING" };
  if (h >= 11 && h < 15) return { title: "greetNoonTitle", sub: "greetNoonSub", badge: "MIDDAY" };
  if (h >= 15 && h < 18) return { title: "greetAfternoonTitle", sub: "greetAfternoonSub", badge: "AFTERNOON" };
  if (h >= 18 && h < 23) return { title: "greetEveningTitle", sub: "greetEveningSub", badge: "EVENING" };
  return { title: "greetNightTitle", sub: "greetNightSub", badge: "LATE NIGHT" };
}

function useDiscoverRow(seed, limit = 12, type = null, enabled = true) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!enabled) { setItems(null); return; }
    let alive = true;
    setItems(null);
    Api.discover(seed, 0, limit, type).then((res) => { if (alive) setItems(res.items || []); }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [seed, limit, type, enabled]);
  return items;
}

const RECO_COUNT = 10;
const RECO_TRACK_COUNT = 12;
const RECO_TRACK_FETCH = 30;

function isCompleteTrack(tr) {
  return !!(tr && tr.id && tr.title && tr.artist?.name && tr.duration > 0);
}

function fillTo(primary, extra, n = RECO_COUNT) {
  const seen = new Set();
  const out = [];
  for (const it of [...(primary || []), ...(extra || [])]) {
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
    if (out.length >= n) break;
  }
  return out;
}

function useForYouTyped(type, count, nonce) {
  const { authUser } = useUI();
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    setItems(null);
    Api.forYou(`home-${type}-${nonce}`, 0, count, type)
      .then((res) => { if (alive) setItems(res.items || []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [authUser, type, count, nonce]);
  return items;
}

function SkeletonCard() {
  return (
    <div className="aivy-card" style={{ pointerEvents: "none" }}>
      <div className="art-wrap"><div className="aivy-skeleton" style={{ width: "100%", height: "100%" }} /></div>
      <div className="aivy-skeleton" style={{ height: 12, width: "68%", borderRadius: 6 }} />
      <div className="aivy-skeleton" style={{ height: 10, width: "44%", borderRadius: 6, marginTop: 7 }} />
    </div>
  );
}

function SkeletonCardGrid({ count = 8 }) {
  return <>{Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}</>;
}

function SkeletonSongRow() {
  return (
    <div className="aivy-songlist-row" style={{ pointerEvents: "none" }}>
      <span className="idx"><div className="aivy-skeleton" style={{ width: 16, height: 11, borderRadius: 4 }} /></span>
      <span className="cover"><div className="aivy-skeleton" style={{ width: "100%", height: "100%" }} /></span>
      <span className="meta">
        <span className="aivy-skeleton" style={{ height: 12, width: "62%", borderRadius: 6 }} />
        <span className="aivy-skeleton" style={{ height: 10, width: "40%", borderRadius: 6, marginTop: 5 }} />
      </span>
    </div>
  );
}

function SkeletonSongGrid({ count = 6 }) {
  return <>{Array.from({ length: count }).map((_, i) => <SkeletonSongRow key={i} />)}</>;
}

function RowWrap({ scroll, children }) {
  return scroll
    ? <HoverRail>{children}</HoverRail>
    : <div className="aivy-grid">{children}</div>;
}

function Row({ title, subtitle, kicker, items, render, scroll = false, action = null, skeleton = 8 }) {
  if (items === null) return (
    <section className="aivy-section">
      <div className="aivy-section-head">
        <div className="aivy-sec-title-group">
          {kicker && <span className="aivy-sec-kicker">{kicker}</span>}
          <h2 className="aivy-section-title">{title}</h2>
          {subtitle && <p className="aivy-sec-sub">{subtitle}</p>}
        </div>
        {action}
      </div>
      <RowWrap scroll={scroll}><SkeletonCardGrid count={scroll ? 6 : skeleton} /></RowWrap>
    </section>
  );
  if (!items.length) return null;
  return (
    <section className="aivy-section">
      <div className="aivy-section-head">
        <div className="aivy-sec-title-group">
          {kicker && <span className="aivy-sec-kicker">{kicker}</span>}
          <h2 className="aivy-section-title">{title}</h2>
          {subtitle && <p className="aivy-sec-sub">{subtitle}</p>}
        </div>
        {action}
      </div>
      <RowWrap scroll={scroll}>{items.map(render)}</RowWrap>
    </section>
  );
}

function mapHistoryRow(row) {
  return {
    id: row.video_id, videoId: row.video_id, title: row.title,
    artist: row.artist || (row.artist_name ? { name: row.artist_name } : null),
    artists: row.artists || null,
    album: row.album || null,
    cover: row.thumbnail || null, duration: row.duration || null,
    explicit: !!row.explicit,
  };
}

function SongListRow({ track, index, list, eager = false }) {
  const { currentTrack, isPlaying, togglePlay, playList, liked, toggleLike } = usePlayer();
  const { openContextMenu, t } = useUI();
  const isCurrent = currentTrack && currentTrack.id === track.id;
  const isLiked = liked.has(String(track.videoId || track.id));
  const items = useTrackMenuItems(track);
  const handlePlay = () => {
    if (isCurrent) { togglePlay(); return; }
    const idx = list.findIndex((x) => x.id === track.id);
    playList(list, idx === -1 ? 0 : idx);
  };
  const numStr = String((index ?? 0) + 1).padStart(2, "0");
  return (
    <div
      className={`aivy-songlist-row ${isCurrent ? "current" : ""} ${isCurrent && isPlaying ? "playing" : ""}`}
      onClick={handlePlay}
      onContextMenu={(e) => { e.preventDefault(); openContextMenu(e.clientX, e.clientY, items); }}
    >
      <span className="idx font-mono" aria-hidden="true">
        <span className="idx-n">{numStr}</span>
        <span className="idx-play">{isCurrent && isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</span>
      </span>
      <span className="cover">
        <SmartCover src={track.cover} seed={track.id + track.title} size={88} radius={8} priority={eager} style={{ width: "100%", height: "100%" }} />
      </span>
      <span className="meta">
        <MarqueeText
          as="span"
          className="t"
          text={track.title}
          prefix={track.explicit ? <span className="aivy-explicit-badge" title="Explicit">E</span> : null}
        />
        <span className="a">{track.artist?.name || "\u2014"}</span>
      </span>
      <span className="acts">
        <button className={`aivy-icon-btn sm ${isLiked ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); toggleLike(track); }} aria-label={t("like")}>
          <Heart size={15} fill={isLiked ? "currentColor" : "none"} />
        </button>
        <button className="aivy-icon-btn sm" onClick={(e) => { e.stopPropagation(); openContextMenu(e.clientX, e.clientY, items); }} aria-label={t("menuMore")}>
          <MoreHorizontal size={15} />
        </button>
      </span>
      <span className="dur font-mono">{formatDuration(track.duration)}</span>
    </div>
  );
}

function QuickRecallPill({ track, list }) {
  const { currentTrack, isPlaying, togglePlay, playList } = usePlayer();
  const { openContextMenu } = useUI();
  const items = useTrackMenuItems(track);
  const isCurrent = currentTrack && currentTrack.id === track.id;
  const handlePlay = () => {
    if (isCurrent) { togglePlay(); return; }
    const idx = list.findIndex((x) => x.id === track.id);
    playList(list, idx === -1 ? 0 : idx);
  };
  return (
    <div
      className={`aivy-recall-pill ${isCurrent ? "current" : ""} ${isCurrent && isPlaying ? "playing" : ""}`}
      role="button"
      tabIndex={0}
      onClick={handlePlay}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handlePlay(); } }}
      onContextMenu={(e) => { e.preventDefault(); openContextMenu(e.clientX, e.clientY, items); }}
    >
      <span className="pill-art">
        <SmartCover src={track.cover} seed={track.id + track.title} size={64} radius={10} style={{ width: "100%", height: "100%" }} />
      </span>
      <span className="pill-meta">
        <span className="pill-t">
          {track.explicit && <span className="aivy-explicit-badge" title="Explicit">E</span>}
          {track.title}
        </span>
        <span className="pill-a">{track.artist?.name || "\u2014"}</span>
      </span>
      <span className="pill-play" aria-hidden="true">
        {isCurrent && isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" style={{ marginLeft: 1 }} />}
      </span>
    </div>
  );
}

export function HomePage() {
  const { t, settings, authUser, pushToast } = useUI();
  const greet = useMemo(greetingKeys, []);
  const {
    history: sessionHistory, playRadio, playList, currentTrack, isPlaying, togglePlay, liked, toggleLike,
  } = usePlayer();
  const { navigate } = useRouter();
  const [savedHistory, setSavedHistory] = useState(null);
  const en = settings.language === "en";

  useEffect(() => {
    let alive = true;
    if (!authUser) { setSavedHistory([]); return; }
    Api.history(12)
      .then((rows) => { if (alive) setSavedHistory((rows || []).map(mapHistoryRow)); })
      .catch(() => { if (alive) setSavedHistory([]); });
    return () => { alive = false; };
  }, [authUser]);

  const playedHistory = authUser ? savedHistory : sessionHistory;
  const nothingPlayed = !playedHistory || playedHistory.length === 0;

  const [trendingSeed, setTrendingSeed] = useState("trending-" + new Date().toDateString());
  const [albumSeed, setAlbumSeed] = useState("fresh-" + Math.floor(Date.now() / 3600000));
  const [recoNonce, setRecoNonce] = useState(0);
  const [albumNonce, setAlbumNonce] = useState(0);

  const trending = useDiscoverRow(trendingSeed, RECO_TRACK_FETCH, "track");
  const fresh = useDiscoverRow(albumSeed, 12, "album");
  const moodCalm = useDiscoverRow("mood-santai", 12, "artist");
  const forYouAlbumsRaw = useForYouTyped("album", RECO_COUNT, `${recoNonce}-${albumNonce}`);
  const forYouArtistsRaw = useForYouTyped("artist", RECO_COUNT, recoNonce);
  const forYouTracksRaw = useForYouTyped("track", RECO_TRACK_FETCH, recoNonce);

  const recoTracks = useMemo(() => {
    if (forYouTracksRaw === null) return null;
    const mine = filterExplicit(forYouTracksRaw, settings);
    const mineOk = mine.filter(isCompleteTrack);
    if (mineOk.length >= RECO_TRACK_COUNT) return fillTo(mineOk, null, RECO_TRACK_COUNT);
    if (trending === null) return null;
    const pop = filterExplicit(trending, settings);
    const strict = fillTo(mineOk, pop.filter(isCompleteTrack), RECO_TRACK_COUNT);
    if (strict.length >= RECO_TRACK_COUNT) return strict;
    return fillTo(strict, [...mine, ...pop], RECO_TRACK_COUNT);
  }, [forYouTracksRaw, trending, settings]);

  const recoAlbums = useMemo(() => {
    if (forYouAlbumsRaw === null) return null;
    const own = fillTo(forYouAlbumsRaw, null);
    if (own.length >= RECO_COUNT) return own;
    if (fresh === null) return null;
    return fillTo(own, fresh);
  }, [forYouAlbumsRaw, fresh]);

  const recoArtists = useMemo(() => {
    if (forYouArtistsRaw === null) return null;
    const own = fillTo(forYouArtistsRaw, null);
    if (own.length >= RECO_COUNT) return own;
    if (moodCalm === null) return null;
    return fillTo(own, moodCalm);
  }, [forYouArtistsRaw, moodCalm]);

  const recoLoading = recoTracks === null;

  // Featured spotlight track: currentTrack -> latest played -> top reco track
  const spotlightTrack = currentTrack || (!nothingPlayed && playedHistory?.[0]) || recoTracks?.[0] || null;
  const isSpotlightLive = !!(currentTrack && spotlightTrack && currentTrack.id === spotlightTrack.id);
  const spotlightLiked = spotlightTrack && liked.has(String(spotlightTrack.videoId || spotlightTrack.id));

  const recallItems = useMemo(() => {
    const pool = [];
    const seen = new Set();
    for (const tr of [...(playedHistory || []), ...(recoTracks || [])]) {
      if (!tr || !tr.id || seen.has(tr.id)) continue;
      if (spotlightTrack && tr.id === spotlightTrack.id && (playedHistory?.length || 0) > 4) continue;
      seen.add(tr.id);
      pool.push(tr);
      if (pool.length >= 6) break;
    }
    return pool;
  }, [playedHistory, recoTracks, spotlightTrack]);

  const bgCover = spotlightTrack?.cover || null;

  const startRadio = () => {
    const seedTrack = spotlightTrack || recoTracks?.[0];
    if (!seedTrack) return;
    playRadio(seedTrack);
    pushToast(t("toastPlayingFullSong"));
  };

  const handlePlaySpotlight = () => {
    if (!spotlightTrack) return;
    if (isSpotlightLive) {
      togglePlay();
      return;
    }
    const list = recoTracks?.length ? recoTracks : (playedHistory?.length ? playedHistory : [spotlightTrack]);
    const idx = list.findIndex((x) => x.id === spotlightTrack.id);
    if (idx !== -1) playList(list, idx);
    else playList([spotlightTrack, ...(recoTracks || [])], 0);
  };

  const handleShuffleMix = () => {
    const pool = [...(recoTracks || []), ...(playedHistory || [])];
    if (!pool.length) return;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    playList(shuffled, 0);
  };

  const userName = authUser ? resolveDisplayName(authUser) : null;

  return (
    <div className="aivy-view-enter aivy-home">
      {bgCover && <div className="aivy-home-bg" style={{ backgroundImage: `url(${sizedThumb(bgCover, 220)})` }} aria-hidden="true" />}
      <div className="aivy-home-inner">
        <div className="aivy-home-top">
          <FeedTabs active="home" />
        </div>

        {/* --- SONIC STAGE BENTO HERO --- */}
        <section className="aivy-stage-bento">
          <div className="aivy-stage-main">
            {spotlightTrack?.cover && (
              <div
                className="aivy-stage-backdrop"
                style={{ backgroundImage: `url(${sizedThumb(spotlightTrack.cover, 480)})` }}
                aria-hidden="true"
              />
            )}
            <div className="aivy-stage-noise" aria-hidden="true" />

            <div className="aivy-stage-head">
              <span className="aivy-stage-badge">
                <Sparkles size={12} />
                <span>{isSpotlightLive ? t("nowPlaying") : (nothingPlayed ? greet.badge : t("tabHome"))}</span>
              </span>
              {userName && <span className="aivy-stage-user">{en ? `Hi, ${userName}` : `Halo, ${userName}`}</span>}
            </div>

            <div className="aivy-stage-copy">
              <h1 className="font-display">{nothingPlayed ? t("homeWelcome") : t(greet.title)}</h1>
              <p>{nothingPlayed ? t("homeWelcomeEmpty") : t(greet.sub)}</p>
            </div>

            {spotlightTrack ? (
              <div className={`aivy-stage-deck ${isSpotlightLive && isPlaying ? "is-playing" : ""}`}>
                <div className="deck-vinyl-wrap" onClick={handlePlaySpotlight} role="button" tabIndex={0}>
                  <span className="deck-vinyl-disc" aria-hidden="true" />
                  <span className="deck-cover">
                    <SmartCover
                      src={spotlightTrack.cover}
                      seed={spotlightTrack.id + spotlightTrack.title}
                      size={180}
                      radius={14}
                      priority
                      style={{ width: "100%", height: "100%" }}
                    />
                  </span>
                </div>
                <div className="deck-info">
                  <div className="deck-kicker">
                    <span className="deck-dot" />
                    <span>
                      {isSpotlightLive
                        ? (isPlaying ? (en ? "Spinning Now" : "Sedang Berputar") : (en ? "Paused" : "Dijeda"))
                        : (!nothingPlayed ? (en ? "Jump Back In" : "Putar Lagi") : (en ? "Featured Pick" : "Pilihan Utama"))}
                    </span>
                  </div>
                  <div className="deck-title" onClick={handlePlaySpotlight}>
                    {spotlightTrack.explicit && <span className="aivy-explicit-badge" title="Explicit">E</span>}
                    {spotlightTrack.title}
                  </div>
                  <div
                    className="deck-artist"
                    onClick={() => {
                      const target = spotlightTrack.artist?.id || spotlightTrack.artist?.name;
                      if (target) navigate("artist", { params: { id: target } });
                    }}
                  >
                    {spotlightTrack.artist?.name || "\u2014"}
                    {spotlightTrack.duration ? <span className="deck-dur font-mono"> · {formatDuration(spotlightTrack.duration)}</span> : null}
                  </div>
                  <div className="deck-actions">
                    <button type="button" className="aivy-stage-play-btn" onClick={handlePlaySpotlight}>
                      {isSpotlightLive && isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: 1 }} />}
                      <span>{isSpotlightLive && isPlaying ? t("pause", "Jeda") : t("play", "Putar")}</span>
                    </button>
                    <button type="button" className="aivy-stage-sec-btn" onClick={startRadio}>
                      <Radio size={15} />
                      <span>{t("startInfiniteRadio")}</span>
                    </button>
                    <button
                      type="button"
                      className={`aivy-stage-icon-btn ${spotlightLiked ? "active" : ""}`}
                      onClick={() => toggleLike(spotlightTrack)}
                      aria-label={t("like")}
                      title={t("like")}
                    >
                      <Heart size={16} fill={spotlightLiked ? "currentColor" : "none"} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="aivy-stage-deck is-skeleton">
                <div className="aivy-skeleton" style={{ width: 96, height: 96, borderRadius: 14, flexShrink: 0 }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="aivy-skeleton" style={{ width: "42%", height: 12, borderRadius: 6 }} />
                  <div className="aivy-skeleton" style={{ width: "74%", height: 18, borderRadius: 6 }} />
                  <div className="aivy-skeleton" style={{ width: "50%", height: 12, borderRadius: 6 }} />
                </div>
              </div>
            )}
          </div>

          {/* Right side of Bento: Quick Launch Tiles */}
          <div className="aivy-stage-side">
            <button type="button" className="aivy-bento-tile is-radio" onClick={startRadio} disabled={!recoTracks?.length && !spotlightTrack}>
              <div className="tile-top">
                <span className="tile-icon"><Radio size={18} /></span>
                <ArrowUpRight size={16} className="tile-arrow" />
              </div>
              <div className="tile-body">
                <div className="tile-title">{t("startInfiniteRadio")}</div>
                <div className="tile-sub">{en ? "Endless flow tuned to your taste" : "Aliran lagu tanpa henti sesuai seleramu"}</div>
              </div>
            </button>

            <button type="button" className="aivy-bento-tile is-shuffle" onClick={handleShuffleMix} disabled={!recoTracks?.length && nothingPlayed}>
              <div className="tile-top">
                <span className="tile-icon"><Shuffle size={18} /></span>
                <ArrowUpRight size={16} className="tile-arrow" />
              </div>
              <div className="tile-body">
                <div className="tile-title">{en ? "Surprise Mix" : "Mix Kejutan"}</div>
                <div className="tile-sub">{en ? "Instant shuffle from your daily picks" : "Kocok instan dari rekomendasi harianmu"}</div>
              </div>
            </button>

            <button type="button" className="aivy-bento-tile is-party" onClick={() => navigate("roomLobby")}>
              <div className="tile-top">
                <span className="tile-icon"><Users size={18} /></span>
                <span className="tile-live-pill">LIVE</span>
              </div>
              <div className="tile-body">
                <div className="tile-title">{t("listeningParties")}</div>
                <div className="tile-sub">{en ? "Listen together with friends in real-time" : "Dengerin bareng temen secara real-time"}</div>
              </div>
            </button>

            <button type="button" className="aivy-bento-tile is-explore" onClick={() => navigate("newTrending")}>
              <div className="tile-top">
                <span className="tile-icon"><Flame size={18} /></span>
                <ArrowUpRight size={16} className="tile-arrow" />
              </div>
              <div className="tile-body">
                <div className="tile-title">{t("tabHotNew")}</div>
                <div className="tile-sub">{en ? "Fresh drops & charts heating up" : "Rilis segar & chart yang lagi naik"}</div>
              </div>
            </button>
          </div>
        </section>

        {/* --- SPEED DIAL / QUICK RECALL CAPSULES --- */}
        {recallItems.length > 0 && (
          <section className="aivy-recall-section">
            <div className="aivy-recall-grid">
              {recallItems.map((tr) => (
                <QuickRecallPill key={`rc-${tr.id}`} track={tr} list={recallItems} />
              ))}
            </div>
          </section>
        )}

        {/* --- RECOMMENDED SONGS (NUMBERED STUDIO DECK) --- */}
        {settings.showRecommendedSongs !== false && (
          <section className="aivy-section aivy-home-songs-sec">
            <div className="aivy-section-head">
              <div className="aivy-sec-title-group">
                <span className="aivy-sec-kicker"><Compass size={11} /> {en ? "CURATED FOR YOU" : "KURASI UNTUKMU"}</span>
                <div className="aivy-home-head-left">
                  <h2 className="aivy-section-title">{t("recoSongs")}</h2>
                  {recoTracks?.length > 0 && (
                    <button className="aivy-chip aivy-chip-glow" onClick={() => playList(recoTracks, 0)}>
                      <Play size={11} fill="currentColor" /> {t("playAll", "Putar semua")}
                    </button>
                  )}
                </div>
              </div>
              <button
                className="aivy-icon-btn bare aivy-refresh-btn"
                onClick={() => { setRecoNonce((n) => n + 1); setTrendingSeed("trending-" + Date.now()); }}
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw size={15} />
              </button>
            </div>
            <div className="aivy-songlist-grid">
              {recoLoading
                ? <SkeletonSongGrid count={RECO_TRACK_COUNT} />
                : recoTracks.map((tr, i) => <SongListRow key={tr.id} index={i} track={tr} list={recoTracks} eager={i < 6} />)}
            </div>
          </section>
        )}

        {/* --- RECOMMENDED ALBUMS --- */}
        {settings.showRecommendedAlbums !== false && (
          <Row
            scroll
            kicker={en ? "FULL LENGTHS & EPS" : "RILISAN PILIHAN"}
            title={t("recoAlbums")}
            items={recoAlbums}
            action={
              <button className="aivy-icon-btn bare aivy-refresh-btn" onClick={() => { setAlbumSeed("fresh-" + Date.now()); setAlbumNonce((n) => n + 1); }} aria-label="Refresh" title="Refresh">
                <RefreshCw size={15} />
              </button>
            }
            render={(a) => <CardAlbum key={a.id} album={a} />}
          />
        )}

        {/* --- CONTINUE LISTENING --- */}
        {settings.showJumpBackIn !== false && (playedHistory === null || playedHistory.length > 0) ? (
          <Row
            scroll
            kicker={en ? "RECENT ROTATION" : "ROTASI TERAKHIR"}
            title={t("rowContinueListening")}
            items={playedHistory === null ? null : playedHistory.slice(0, 12)}
            render={(tr) => <CardTrack key={tr.id} track={tr} list={playedHistory} />}
          />
        ) : null}

        {/* --- RECOMMENDED ARTISTS --- */}
        {settings.showRecommendedArtists !== false && (
          <Row
            scroll
            kicker={en ? "VOICES ON YOUR RADAR" : "ARTIS DI RADARMU"}
            title={t("recoArtists")}
            items={recoArtists}
            render={(a) => <CardArtist key={a.id} artist={a} />}
          />
        )}

        {/* --- LISTENING PARTIES BANNER --- */}
        <section className="aivy-section">
          <div className="aivy-parties-banner">
            <div className="parties-glow" aria-hidden="true" />
            <div className="parties-content">
              <span className="parties-kicker"><Users size={13} /> {t("listeningParties")}</span>
              <h3 className="font-display">{en ? "Host a live room & vibe together" : "Bikin room live & dengerin bareng"}</h3>
              <p>{t("partiesSub")}</p>
            </div>
            <div className="parties-acts">
              <button className="aivy-btn-primary" onClick={() => navigate("roomLobby")}>
                <Play size={14} fill="currentColor" /> {t("createRoom")}
              </button>
              <button className="aivy-btn-ghost" onClick={() => navigate("roomLobby")}>{t("joinRoom")}</button>
            </div>
          </div>
        </section>

        <section className="aivy-section">
          <DonationBanner />
        </section>

        <ExploreFeed />
      </div>
    </div>
  );
}
