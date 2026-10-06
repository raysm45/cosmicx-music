import React, { useState, useEffect, useMemo } from "react";
import { Play, RefreshCw, Heart, MoreHorizontal } from "lucide-react";
import { Api } from "../lib/api.js";
import { usePlayer, useUI } from "../context.jsx";
import { useRouter } from "../router.jsx";
import { CardTrack, CardAlbum, CardArtist, filterExplicit, useTrackMenuItems, HoverRail, MarqueeText } from "../components.jsx";
import { FeedTabs } from "./FeedPages.jsx";
import { ExploreFeed } from "./ExploreFeed.jsx";
import { SmartCover, sizedThumb } from "../lib/brand.jsx";

import { formatDuration } from "../lib/utils.js";

function greetingSubKey() {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return "greetMorningSub";
  if (h >= 11 && h < 15) return "greetNoonSub";
  if (h >= 15 && h < 18) return "greetAfternoonSub";
  if (h >= 18 && h < 23) return "greetEveningSub";
  return "greetNightSub";
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
const RECO_COUNT = 9;

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

function Row({ title, items, render, scroll = false, action = null, skeleton = 8 }) {
  if (items === null) return (
    <section className="aivy-section"><div className="aivy-section-head"><h2 className="aivy-section-title">{title}</h2>{action}</div>
      <RowWrap scroll={scroll}><SkeletonCardGrid count={scroll ? 6 : skeleton} /></RowWrap>
    </section>
  );
  if (!items.length) return null;
  return (
    <section className="aivy-section">
      <div className="aivy-section-head"><h2 className="aivy-section-title">{title}</h2>{action}</div>
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
  };
}

function SongListRow({ track, list, eager = false }) {
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
  return (
    <div
      className={`aivy-songlist-row ${isCurrent ? "current" : ""}`}
      onClick={handlePlay}
      onContextMenu={(e) => { e.preventDefault(); openContextMenu(e.clientX, e.clientY, items); }}
    >
      <span className="cover">
        <SmartCover src={track.cover} seed={track.id + track.title} size={80} radius={6} priority={eager} style={{ width: "100%", height: "100%" }} />
      </span>
      <span className="meta">
        <MarqueeText as="span" className="t" text={track.title} />
        <span className="a">{track.artist?.name || "\u2014"}</span>
      </span>
      <span className="acts">
        <button className="aivy-icon-btn sm" onClick={(e) => { e.stopPropagation(); openContextMenu(e.clientX, e.clientY, items); }} aria-label={t("menuMore")}><MoreHorizontal size={16} /></button>
        <button className={`aivy-icon-btn sm ${isLiked ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); toggleLike(track); }} aria-label={t("like")}><Heart size={16} fill={isLiked ? "currentColor" : "none"} /></button>
      </span>
      <span className="dur font-mono">{formatDuration(track.duration)}</span>
    </div>
  );
}

export function HomePage() {
  const { t, settings, authUser, pushToast } = useUI();
  const subKey = useMemo(greetingSubKey, []);
  const { liked, history: sessionHistory, playRadio, currentTrack } = usePlayer();
  const { navigate } = useRouter();
  const [savedHistory, setSavedHistory] = useState(null);
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

  const bgCover = currentTrack?.cover || (!nothingPlayed && playedHistory[0]?.cover) || null;

  const recoLoading = recoTracks === null;

  const startRadio = () => {
    if (!recoTracks?.length) return;
    playRadio(recoTracks[0]);
    pushToast(t("toastPlayingFullSong"));
  };

  return (
    <div className="aivy-view-enter aivy-home">
      {bgCover && <div className="aivy-home-bg" style={{ backgroundImage: `url(${sizedThumb(bgCover, 160)})` }} aria-hidden="true" />}
      <div className="aivy-home-inner">
        <FeedTabs active="home" />

        {nothingPlayed && (
          <div className="aivy-home-welcome">
            <h1 className="font-display">{t("homeWelcome")}</h1>
            <p>{t("homeWelcomeEmpty")}</p>
          </div>
        )}

        {settings.showRecommendedSongs !== false && (
          <section className="aivy-section" style={{ marginTop: 0 }}>
            <div className="aivy-section-head">
              <div className="aivy-home-head-left">
                <h2 className="aivy-section-title">{t("recoSongs")}</h2>
                {recoTracks?.length > 0 && (
                  <button className="aivy-chip" onClick={startRadio}>
                    <Play size={11} /> {t("startInfiniteRadio")}
                  </button>
                )}
              </div>
              <button
                className="aivy-icon-btn bare"
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
                : recoTracks.map((tr, i) => <SongListRow key={tr.id} track={tr} list={recoTracks} eager={i < 6} />)}
            </div>
          </section>
        )}

        {settings.showRecommendedAlbums !== false && (
          <Row
            scroll
            title={t("recoAlbums")}
            items={recoAlbums}
            action={
              <button className="aivy-icon-btn bare" onClick={() => { setAlbumSeed("fresh-" + Date.now()); setAlbumNonce((n) => n + 1); }} aria-label="Refresh" title="Refresh">
                <RefreshCw size={15} />
              </button>
            }
            render={(a) => <CardAlbum key={a.id} album={a} />}
          />
        )}

        {settings.showRecommendedArtists !== false && (
          <Row scroll title={t("recoArtists")} items={recoArtists} render={(a) => <CardArtist key={a.id} artist={a} />} />
        )}

        {settings.showJumpBackIn !== false && (playedHistory === null || playedHistory.length > 0) ? (
          <Row scroll title={t("rowContinueListening")} items={playedHistory === null ? null : playedHistory.slice(0, 12)} render={(tr) => <CardTrack key={tr.id} track={tr} list={playedHistory} />} />
        ) : null}

        <section className="aivy-section">
          <div className="aivy-section-head"><h2 className="aivy-section-title">{t("listeningParties")}</h2></div>
          <div className="aivy-parties-cta">
            <p>{t("partiesSub")}</p>
            <div className="acts">
              <button className="aivy-btn-primary" onClick={() => navigate("roomLobby")}>{t("createRoom")}</button>
              <button className="aivy-btn-ghost" onClick={() => navigate("roomLobby")}>{t("joinRoom")}</button>
            </div>
          </div>
        </section>

        <ExploreFeed />
      </div>
    </div>
  );
}