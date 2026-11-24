import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Play, Pause, RefreshCw, MoreHorizontal } from "lucide-react";
import { Api } from "../lib/api.js";
import { usePlayer, useUI } from "../context.jsx";
import { useRouter } from "../router.jsx";
import { QualityTag, useTrackMenuItems } from "../components.jsx";
import { SmartCover } from "../lib/brand.jsx";

/**
 * Layout Home khusus HP. Satu halaman, enam "dialek" dari pemutar musik berbeda:
 *   1. Pintasan      -> ubin 2 kolom ala Spotify
 *   2. Deck album    -> kartu besar snap + skala mengikuti scroll ala Apple Music
 *   3. Pilihan cepat -> kolom 4 baris yang bisa di-swipe ala Metrolist / YT Music
 *   4. Artis         -> avatar bundar dengan cincin
 *   5. Lagi ramai    -> tangga lagu dengan angka outline besar
 *   6. Rak album     -> sampul dengan piringan hitam yang keluar & berputar saat diputar
 * Animasi hanya transform/opacity, tanpa blur/backdrop-filter. Scroll-driven animation
 * dipasang lewat @supports di CSS, jadi di browser lama tampilannya tetap statis & rapi.
 */

export function useIsPhone(maxWidth = 860) {
  const q = `(max-width:${maxWidth}px)`;
  const [m, setM] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(q).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(q);
    const onChange = (e) => setM(e.matches);
    setM(mq.matches);
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange));
  }, [q]);
  return m;
}

/* ---------- util ---------- */
function artistLine(track) {
  const list = track.artists?.length ? track.artists : (track.artist ? [track.artist] : []);
  return list.map((a) => a?.name).filter(Boolean).join(", ") || "\u2014";
}

function useTrackPlay(track, list) {
  const { currentTrack, isPlaying, togglePlay, playList, playSingle } = usePlayer();
  const isCurrent = !!currentTrack && currentTrack.id === track.id;
  const play = useCallback(() => {
    if (isCurrent) { togglePlay(); return; }
    const idx = list ? list.findIndex((x) => x.id === track.id) : -1;
    if (list && list.length) playList(list, idx === -1 ? 0 : idx);
    else playSingle(track);
  }, [isCurrent, togglePlay, playList, playSingle, list, track]);
  return { isCurrent, isPlaying: isCurrent && isPlaying, play };
}

function useAlbumPlay(album) {
  const { currentTrack, isPlaying, togglePlay, playList } = usePlayer();
  const isCurrent = !!currentTrack?.album?.id && String(currentTrack.album.id) === String(album.id);
  const play = useCallback(async (e) => {
    e?.stopPropagation?.();
    if (isCurrent) { togglePlay(); return; }
    try {
      const full = await Api.album(album.id);
      if (full?.tracks?.length) playList(full.tracks, 0);
    } catch { /* diam: kartu tetap bisa dibuka lewat tap */ }
  }, [album.id, isCurrent, togglePlay, playList]);
  return { isCurrent, isPlaying: isCurrent && isPlaying, play };
}

function Eq({ playing }) {
  return <span className={`hm-eq${playing ? " on" : ""}`} aria-hidden="true"><i /><i /><i /></span>;
}

function Head({ title, size = "md", action = null }) {
  return (
    <div className="hm-head">
      <h2 className={`hm-h ${size}`}>{title}</h2>
      {action}
    </div>
  );
}

function RefreshBtn({ onClick }) {
  const [spin, setSpin] = useState(false);
  return (
    <button
      type="button"
      className={`aivy-icon-btn bare hm-refresh${spin ? " is-spin" : ""}`}
      aria-label="Refresh"
      onClick={() => { setSpin(true); onClick(); setTimeout(() => setSpin(false), 650); }}
    >
      <RefreshCw size={15} />
    </button>
  );
}

/* ---------- 1. Pintasan (Spotify) ---------- */
function Tile({ track, list, i }) {
  const { isCurrent, isPlaying, play } = useTrackPlay(track, list);
  return (
    <button type="button" className={`hm-tile${isCurrent ? " is-current" : ""}`} style={{ "--i": i }} onClick={play}>
      <span className="cv">
        <SmartCover src={track.cover} seed={track.id + track.title} size={56} radius={0} priority={i < 4} style={{ width: "100%", height: "100%" }} />
      </span>
      <span className="tt">{track.title}</span>
      {isCurrent && <Eq playing={isPlaying} />}
    </button>
  );
}

/* ---------- 2. Deck album (Apple Music) ---------- */
function HeroCard({ album, i }) {
  const { navigate } = useRouter();
  const { t } = useUI();
  const { isCurrent, isPlaying, play } = useAlbumPlay(album);
  const open = () => navigate("album", { params: { id: album.id } });
  return (
    <div
      className={`hm-hero${isCurrent ? " is-current" : ""}`}
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter") open(); }}
    >
      <SmartCover src={album.cover} seed={"album" + album.id + album.title} size={320} radius={0} priority={i < 2} style={{ width: "100%", height: "100%" }} />
      <div className="tx">
        <div className="ti">{album.title}</div>
        <div className="su">{album.artist?.name || album.artistLine || ""}{album.releaseDate ? ` \u00b7 ${String(album.releaseDate).slice(0, 4)}` : ""}</div>
      </div>
      <button type="button" className="hm-fab" onClick={play} aria-label={isPlaying ? t("pause") : t("hmPlayAlbum")}>
        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
      </button>
    </div>
  );
}

/* ---------- 3. Pilihan cepat (Metrolist) ---------- */
function QuickRow({ track, list, i }) {
  const { openContextMenu, t } = useUI();
  const { isCurrent, isPlaying, play } = useTrackPlay(track, list);
  const items = useTrackMenuItems(track);
  return (
    <div className={`hm-qrow${isCurrent ? " is-current" : ""}`} style={{ "--i": i }} onClick={play}>
      <span className="cv">
        <SmartCover src={track.cover} seed={track.id + track.title} size={56} radius={8} style={{ width: "100%", height: "100%" }} />
        {isCurrent && <span className="cv-eq"><Eq playing={isPlaying} /></span>}
      </span>
      <span className="mt">
        <span className="tt">{track.title}</span>
        <span className="hm-sub">
          {track.explicit && <span className="aivy-explicit-badge" title="Explicit" aria-label="Explicit">E</span>}
          <QualityTag track={track} />
          <span className="nm">{artistLine(track)}</span>
        </span>
      </span>
      <button
        type="button"
        className="aivy-icon-btn sm"
        aria-label={t("menuMore")}
        onClick={(e) => { e.stopPropagation(); openContextMenu(e.clientX, e.clientY, items); }}
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

function QuickPicks({ tracks }) {
  const pages = useMemo(() => {
    const out = [];
    for (let i = 0; i < tracks.length; i += 4) out.push(tracks.slice(i, i + 4));
    return out;
  }, [tracks]);
  return (
    <div className="hm-bleed hm-pages hm-defer">
      {pages.map((page, p) => (
        <div className="hm-page" key={p}>
          {page.map((tr, i) => <QuickRow key={tr.id} track={tr} list={tracks} i={i} />)}
        </div>
      ))}
    </div>
  );
}

/* ---------- 4. Artis ---------- */
function ArtistBubble({ artist }) {
  const { navigate } = useRouter();
  return (
    <button type="button" className="hm-artist" onClick={() => navigate("artist", { params: { id: artist.id } })}>
      <span className="av">
        <span className="im">
          <SmartCover src={artist.image} seed={"artist" + artist.id + artist.name} size={120} radius={999} style={{ width: "100%", height: "100%", borderRadius: "50%" }} />
        </span>
      </span>
      <span className="nm">{artist.name}</span>
    </button>
  );
}

/* ---------- 5. Lagi ramai (tangga lagu) ---------- */
function ChartRow({ track, list, rank }) {
  const { isCurrent, isPlaying, play } = useTrackPlay(track, list);
  return (
    <div className={`hm-crow${isCurrent ? " is-current" : ""}`} style={{ "--i": rank - 1 }} onClick={play}>
      <span className="hm-rank" aria-hidden="true">{rank}</span>
      <span className="cv">
        <SmartCover src={track.cover} seed={track.id + track.title} size={56} radius={8} style={{ width: "100%", height: "100%" }} />
      </span>
      <span className="mt">
        <span className="tt">{track.title}</span>
        <span className="hm-sub">
          {track.explicit && <span className="aivy-explicit-badge" title="Explicit" aria-label="Explicit">E</span>}
          <span className="nm">{artistLine(track)}</span>
        </span>
      </span>
      {isCurrent && <Eq playing={isPlaying} />}
    </div>
  );
}

/* ---------- 6. Rak album (piringan hitam) ---------- */
function Vinyl({ album }) {
  const { navigate } = useRouter();
  const { t } = useUI();
  const { isCurrent, isPlaying, play } = useAlbumPlay(album);
  const label = album.cover ? { "--lab": `url(${JSON.stringify(album.cover)})` } : undefined;
  return (
    <div className={`hm-vinyl${isCurrent ? " is-out" : ""}${isPlaying ? " is-spin" : ""}`}>
      <div className="box">
        <button type="button" className="slide" onClick={play} aria-label={isPlaying ? t("pause") : t("hmPlayAlbum")}>
          <span className="rec" style={label} />
        </button>
        <div className="sleeve" onClick={() => navigate("album", { params: { id: album.id } })} role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") navigate("album", { params: { id: album.id } }); }}>
          <SmartCover src={album.cover} seed={"album" + album.id + album.title} size={160} radius={0} style={{ width: "100%", height: "100%" }} />
        </div>
      </div>
      <div className="ti">{album.title}</div>
      <div className="su">{album.artist?.name || album.artistLine || ""}</div>
    </div>
  );
}

/* ---------- skeleton ringan ---------- */
const Sk = ({ w, h, r = 8, style }) => <span className="aivy-skeleton" style={{ display: "block", width: w, height: h, borderRadius: r, flex: "none", ...style }} />;

/* ---------- gabungan ---------- */
export function HomeMobileSections({ history, recoTracks, recoAlbums, recoArtists, chart, onRefreshSongs, onRefreshAlbums, startRadio }) {
  const { t, settings } = useUI();

  const showHistory = settings.showJumpBackIn !== false;
  const tiles = showHistory ? (history === null ? null : history.slice(0, 6)) : [];
  const heroAlbums = recoAlbums ? recoAlbums.slice(0, 5) : null;
  const shelfAlbums = recoAlbums ? recoAlbums.slice(5, 9) : null;

  return (
    <div className="hm">
      {/* 1. Pintasan */}
      {showHistory && (tiles === null || tiles.length > 0) && (
        <section className="hm-sec">
          <div className="hm-tiles">
            {tiles === null
              ? Array.from({ length: 6 }).map((_, i) => <Sk key={i} w="100%" h={56} />)
              : tiles.map((tr, i) => <Tile key={tr.id} track={tr} list={history} i={i} />)}
          </div>
        </section>
      )}

      {/* 2. Deck album */}
      {settings.showRecommendedAlbums !== false && (heroAlbums === null || heroAlbums.length > 0) && (
        <section className="hm-sec">
          <Head title={t("recoAlbums")} size="xl" action={<RefreshBtn onClick={onRefreshAlbums} />} />
          <div className="hm-bleed hm-deck">
            {heroAlbums === null
              ? Array.from({ length: 3 }).map((_, i) => <Sk key={i} w="min(76vw, 320px)" h="min(76vw, 320px)" r={22} />)
              : heroAlbums.map((a, i) => <HeroCard key={a.id} album={a} i={i} />)}
          </div>
        </section>
      )}

      {/* 3. Pilihan cepat */}
      {settings.showRecommendedSongs !== false && (recoTracks === null || recoTracks.length > 0) && (
        <section className="hm-sec">
          <Head
            title={t("hmQuickPicks")}
            size="md"
            action={
              <span className="hm-head-acts">
                {recoTracks?.length > 0 && (
                  <button type="button" className="aivy-chip" onClick={startRadio}><Play size={11} /> Radio</button>
                )}
                <RefreshBtn onClick={onRefreshSongs} />
              </span>
            }
          />
          {recoTracks === null
            ? <div className="hm-bleed hm-pages">{[0, 1].map((p) => (
                <div className="hm-page" key={p}>{[0, 1, 2, 3].map((i) => <div className="hm-qrow" key={i}><Sk w={50} h={50} /><span className="mt"><Sk w="62%" h={12} r={6} /><Sk w="40%" h={10} r={6} style={{ marginTop: 6 }} /></span></div>)}</div>
              ))}</div>
            : <QuickPicks tracks={recoTracks} />}
        </section>
      )}

      {/* 4. Artis */}
      {settings.showRecommendedArtists !== false && (recoArtists === null || recoArtists.length > 0) && (
        <section className="hm-sec">
          <Head title={t("recoArtists")} size="sm" />
          <div className="hm-bleed hm-artists hm-defer">
            {recoArtists === null
              ? Array.from({ length: 5 }).map((_, i) => <Sk key={i} w={96} h={96} r={999} />)
              : recoArtists.map((a) => <ArtistBubble key={a.id} artist={a} />)}
          </div>
        </section>
      )}

      {/* 5. Lagi ramai */}
      {(chart === null || chart.length > 0) && (
        <section className="hm-sec">
          <Head title={t("hmChart")} size="xl" />
          <div className="hm-chart hm-defer">
            {chart === null
              ? Array.from({ length: 5 }).map((_, i) => <div className="hm-crow" key={i}><Sk w={44} h={40} r={6} /><Sk w={52} h={52} /><span className="mt"><Sk w="60%" h={12} r={6} /></span></div>)
              : chart.map((tr, i) => <ChartRow key={tr.id} track={tr} list={chart} rank={i + 1} />)}
          </div>
        </section>
      )}

      {/* 6. Rak album */}
      {settings.showRecommendedAlbums !== false && shelfAlbums && shelfAlbums.length > 0 && (
        <section className="hm-sec">
          <Head title={t("hmShelf")} size="sm" />
          <div className="hm-bleed hm-shelf hm-defer">
            {shelfAlbums.map((a) => <Vinyl key={a.id} album={a} />)}
          </div>
        </section>
      )}
    </div>
  );
}
