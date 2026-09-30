import React, { useState, useEffect, useMemo } from "react";
import { Play, RefreshCw } from "lucide-react";
import { Api } from "../lib/api.js";
import { usePlayer, useUI } from "../context.jsx";
import { useRouter } from "../router.jsx";
import { CardTrack, CardAlbum, CardArtist, filterExplicit, useTrackMenuItems, HoverRail, MarqueeText } from "../components.jsx";
import { FeedTabs, useForYouRow } from "./FeedPages.jsx";
import { ExploreFeed } from "./ExploreFeed.jsx";
import { SmartCover } from "../lib/brand.jsx";

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

// Jumlah item rekomendasi album & artist di Home dibuat tetap (tidak naik-turun).
const RECO_COUNT = 9;

// Gabungkan daftar utama + cadangan, buang duplikat, potong tepat n item.
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

// Ambil rekomendasi "for you" khusus satu tipe (album / artist) supaya jumlahnya pasti.
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

// PENTING: RowWrap harus didefinisikan di level modul (identitas komponen stabil).
// Dulu `Wrap` dibuat di dalam Row, jadi tiap render React menganggapnya komponen baru
// dan MEMBUANG + MEMASANG ULANG semua card di dalamnya (penyebab home ngadat).
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

function SongListRow({ track, list }) {
  const { currentTrack, isPlaying, togglePlay, playList } = usePlayer();
  const { openContextMenu } = useUI();
  const isCurrent = currentTrack && currentTrack.id === track.id;
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
        <SmartCover src={track.cover} seed={track.id + track.title} size={80} radius={6} style={{ width: "100%", height: "100%" }} />
      </span>
      <span className="meta">
        <MarqueeText as="span" className="t" text={track.title} />
        <span className="a">{track.artist?.name || "\u2014"}</span>
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
  const trending = useDiscoverRow(trendingSeed, 12, "track");
  const fresh = useDiscoverRow(albumSeed, 12, "album");
  const moodCalm = useDiscoverRow("mood-santai", 12, "artist");
  const forYou = useForYouRow(24);
  const forYouAlbumsRaw = useForYouTyped("album", RECO_COUNT, `${recoNonce}-${albumNonce}`);
  const forYouArtistsRaw = useForYouTyped("artist", RECO_COUNT, recoNonce);
  const forYouTracks = useMemo(
    () => filterExplicit((forYou.items || []).filter((i) => i.type === "track"), settings).slice(0, 12),
    [forYou.items, settings]
  );

  const trendingTracks = useMemo(() => filterExplicit(trending || [], settings).slice(0, 12), [trending, settings]);

  // Album & artist: selalu tepat RECO_COUNT (9). Kalau hasil personal kurang, ditambal dari discover.
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

  const recoTracks = forYouTracks.length ? forYouTracks : trendingTracks;
  const recoLoading = forYou.items === null && trending === null;

  const startRadio = () => {
    if (!recoTracks.length) return;
    playRadio(recoTracks[0]);
    pushToast(t("toastPlayingFullSong"));
  };

  return (
    <div className="aivy-view-enter aivy-home">
      {bgCover && <div className="aivy-home-bg" style={{ backgroundImage: `url(${bgCover})` }} aria-hidden="true" />}
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
                {recoTracks.length > 0 && (
                  <button className="aivy-chip" onClick={startRadio}>
                    <Play size={11} /> {t("startInfiniteRadio")}
                  </button>
                )}
              </div>
              <button
                className="aivy-icon-btn bare"
                onClick={() => { forYou.refresh(); setRecoNonce((n) => n + 1); setTrendingSeed("trending-" + Date.now()); }}
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw size={15} />
              </button>
            </div>
            <div className="aivy-songlist-grid">
              {recoLoading
                ? <SkeletonSongGrid count={6} />
                : recoTracks.map((tr) => <SongListRow key={tr.id} track={tr} list={recoTracks} />)}
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