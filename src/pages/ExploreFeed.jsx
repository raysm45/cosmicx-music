import React, { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Heart, MoreHorizontal, Check } from "lucide-react";
import { Api } from "../lib/api.js";
import { usePlayer, useUI } from "../context.jsx";
import { useRouter } from "../router.jsx";
import { useTrackMenuItems, HoverRail } from "../components.jsx";
import { SmartCover } from "../lib/brand.jsx";
import { uid, formatDuration } from "../lib/utils.js";

/* ------------------------------------------------------------------ *
 *  Explore: urutan blok yang diulang terus (infinite loop)
 *    1. Trending now        (list lagu)
 *    2. Featured Artists    (carousel artist + tombol Follow)
 *    3. Kartu cover         (3 lagu, cover full-bleed)
 *    4. Discover new music  (list lagu)
 *  Habis blok 4 -> ambil data baru -> mulai lagi dari blok 1, dst.
 * ------------------------------------------------------------------ */

const N_TRENDING = 5;
const N_COVERS = 3;
const N_DISCOVER = 6;
const N_ARTISTS = 8;
const TRACKS_PER_CYCLE = N_TRENDING + N_COVERS + N_DISCOVER;
const PAGE = 24;

function newSource() {
  return { seed: uid("explore"), cursor: 0, pool: [], seen: new Set() };
}

// Isi pool sampai minimal `need` item. Kalau backend habis / cuma ngasih duplikat,
// seed diganti dan cursor di-reset -> feed tidak pernah berhenti (looping).
async function fillPool(src, type, need, allowExplicit) {
  let dry = 0;
  while (src.pool.length < need && dry < 3) {
    let res;
    try {
      res = await Api.discover(src.seed, src.cursor, PAGE, type);
    } catch {
      return; // error jaringan: berhenti, jangan rotasi seed
    }
    const raw = res?.items || [];
    src.cursor = res?.nextCursor ?? src.cursor + (raw.length || PAGE);
    const fresh = raw.filter((it) => {
      if (!it || it.id == null) return false;
      if (type === "track" && !allowExplicit && it.explicit) return false;
      if (src.seen.has(it.id)) return false;
      src.seen.add(it.id);
      return true;
    });
    if (fresh.length === 0) {
      dry++;
      src.seed = uid("explore");
      src.cursor = 0;
      src.seen.clear();
      continue;
    }
    dry = 0;
    src.pool.push(...fresh);
  }
}

function useExploreFeed() {
  const { settings } = useUI();
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stalled, setStalled] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const counter = useRef(0);
  const src = useRef({ track: newSource(), artist: newSource() });
  const allowExplicit = useRef(true);
  allowExplicit.current = settings.explicitContent !== false;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const loadCycle = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setStalled(false);
    const s = src.current;
    await Promise.all([
      fillPool(s.track, "track", TRACKS_PER_CYCLE, allowExplicit.current),
      fillPool(s.artist, "artist", N_ARTISTS, true),
    ]);
    if (!alive.current) { busy.current = false; return; }
    const trending = s.track.pool.splice(0, N_TRENDING);
    const covers = s.track.pool.splice(0, N_COVERS);
    const discover = s.track.pool.splice(0, N_DISCOVER);
    const artists = s.artist.pool.splice(0, N_ARTISTS);
    if (!trending.length && !covers.length && !discover.length && !artists.length) {
      setStalled(true);
    } else {
      setCycles((prev) => [...prev, { id: ++counter.current, trending, covers, discover, artists }]);
    }
    setLoading(false);
    busy.current = false;
  }, []);

  return { cycles, loading, stalled, loadCycle };
}

/* ------------------------------ komponen ------------------------------ */

function artistNames(track) {
  const list = track.artists?.length ? track.artists : (track.artist ? [track.artist] : []);
  return list.map((a) => a?.name).filter(Boolean).join(", ");
}

function usePlayTrack(track, list) {
  const { currentTrack, isPlaying, togglePlay, playSingle, playList } = usePlayer();
  const isCurrent = !!currentTrack && currentTrack.id === track.id;
  const play = () => {
    if (isCurrent) { togglePlay(); return; }
    if (list && list.length) {
      const idx = list.findIndex((x) => x.id === track.id);
      playList(list, idx === -1 ? 0 : idx);
    } else {
      playSingle(track);
    }
  };
  return { isCurrent, isPlaying, play };
}

function ExploreTrackRow({ track, list }) {
  const { liked, toggleLike } = usePlayer();
  const { openContextMenu, t } = useUI();
  const { isCurrent, play } = usePlayTrack(track, list);
  const items = useTrackMenuItems(track);
  const isLiked = liked.has(String(track.videoId || track.id));
  const openMenu = (e) => { e.preventDefault(); e.stopPropagation(); openContextMenu(e.clientX, e.clientY, items); };
  return (
    <div className={`aivy-xrow ${isCurrent ? "current" : ""}`} onClick={play} onContextMenu={openMenu}>
      <span className="cover">
        <SmartCover src={track.cover} seed={track.id + track.title} size={96} radius={6} style={{ width: "100%", height: "100%" }} />
      </span>
      <span className="meta">
        <span className="t">{track.title}</span>
        <span className="a">
          {track.explicit && <span className="aivy-explicit-badge" title="Explicit">E</span>}
          {artistNames(track) || "\u2014"}
        </span>
      </span>
      <span className="acts">
        <button type="button" className="aivy-icon-btn sm" onClick={openMenu} aria-label={t("menuMore")}>
          <MoreHorizontal size={16} />
        </button>
        <button
          type="button"
          className={`aivy-icon-btn sm ${isLiked ? "active" : ""}`}
          onClick={(e) => { e.stopPropagation(); toggleLike(track); }}
          aria-label={t("like")}
        >
          <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
        </button>
        <span className="dur font-mono">{formatDuration(track.duration)}</span>
      </span>
    </div>
  );
}

function ExploreCoverCard({ track, list }) {
  const { openContextMenu, t } = useUI();
  const { isCurrent, isPlaying, play } = usePlayTrack(track, list);
  const items = useTrackMenuItems(track);
  const openMenu = (e) => { e.preventDefault(); e.stopPropagation(); openContextMenu(e.clientX, e.clientY, items); };
  return (
    <div
      className={`aivy-xcover ${isCurrent ? "current" : ""}`}
      role="button"
      tabIndex={0}
      onClick={play}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); play(); } }}
      onContextMenu={openMenu}
    >
      {track.cover && <span className="bg" style={{ backgroundImage: `url(${JSON.stringify(track.cover)})` }} />}
      <span className="shade" />
      <span className="play" aria-hidden="true">{isCurrent && isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />}</span>
      <span className="t">{track.title}</span>
      <span className="a">{artistNames(track) || "\u2014"}</span>
      <button type="button" className="more" onClick={openMenu} aria-label={t("menuMore")}>
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}

function FeaturedArtistCard({ artist }) {
  const { navigate } = useRouter();
  const { t, pushToast } = useUI();
  const [following, setFollowing] = useState(false);
  const toggle = (e) => {
    e.stopPropagation();
    setFollowing((f) => !f);
    pushToast(following ? `${t("unfollowedToast")} ${artist.name}` : `${t("followedToast")} ${artist.name}`);
  };
  return (
    <div className="aivy-xartist" onClick={() => navigate("artist", { params: { id: artist.id } })}>
      {artist.image && <span className="bg" style={{ backgroundImage: `url(${JSON.stringify(artist.image)})` }} />}
      <span className="shade" />
      <span className="img">
        <SmartCover src={artist.image} seed={"artist" + artist.id + artist.name} size={128} radius={999} style={{ width: "100%", height: "100%", borderRadius: "50%" }} />
      </span>
      <span className="name">{artist.name}</span>
      <button type="button" className={`follow ${following ? "on" : ""}`} onClick={toggle}>
        {following ? <><Check size={13} /> {t("following")}</> : t("follow")}
      </button>
    </div>
  );
}

function BlockHead({ children }) {
  return <div className="aivy-section-head"><h2 className="aivy-section-title">{children}</h2></div>;
}

function ExploreCycle({ cycle }) {
  const { t } = useUI();
  return (
    <div className="aivy-explore-cycle">
      {cycle.trending.length > 0 && (
        <section>
          <BlockHead>{t("exploreTrending")}</BlockHead>
          <div className="aivy-xlist">
            {cycle.trending.map((tr) => <ExploreTrackRow key={tr.id} track={tr} list={cycle.trending} />)}
          </div>
        </section>
      )}

      {cycle.artists.length > 0 && (
        <section>
          <BlockHead>{t("exploreFeaturedArtists")}</BlockHead>
          <div className="aivy-xartists">
            <HoverRail>
              {cycle.artists.map((a) => <FeaturedArtistCard key={a.id} artist={a} />)}
            </HoverRail>
          </div>
        </section>
      )}

      {cycle.covers.length > 0 && (
        <section className="aivy-xcovers">
          {cycle.covers.map((tr) => <ExploreCoverCard key={tr.id} track={tr} list={cycle.covers} />)}
        </section>
      )}

      {cycle.discover.length > 0 && (
        <section>
          <BlockHead>{t("exploreDiscover")}</BlockHead>
          <div className="aivy-xlist">
            {cycle.discover.map((tr) => <ExploreTrackRow key={tr.id} track={tr} list={cycle.discover} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function ExploreSkeleton() {
  return (
    <div className="aivy-xskel" aria-hidden="true">
      <div className="aivy-skeleton aivy-xskel-title" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="aivy-xskel-row">
          <div className="aivy-skeleton aivy-xskel-cover" />
          <div className="aivy-xskel-meta">
            <div className="aivy-skeleton aivy-xskel-line w1" />
            <div className="aivy-skeleton aivy-xskel-line w2" />
          </div>
          <div className="aivy-skeleton aivy-xskel-dur" />
        </div>
      ))}
    </div>
  );
}

export function ExploreFeed() {
  const { t } = useUI();
  const { cycles, loading, stalled, loadCycle } = useExploreFeed();
  const sentinelRef = useRef(null);

  // Observer dibuat ulang tiap jumlah cycle berubah -> callback langsung jalan lagi
  // kalau sentinel masih kelihatan (layar tinggi / konten pendek), jadi nggak macet.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || stalled) return undefined;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadCycle(); },
      { rootMargin: "900px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cycles.length, stalled, loadCycle]);

  return (
    <div className="aivy-explore">
      {cycles.map((c) => <ExploreCycle key={c.id} cycle={c} />)}
      <div ref={sentinelRef} className="aivy-explore-sentinel">
        {loading && <ExploreSkeleton />}
        {stalled && (
          <button type="button" className="aivy-btn-ghost" onClick={loadCycle}>{t("retry")}</button>
        )}
      </div>
    </div>
  );
}