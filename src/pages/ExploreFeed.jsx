import React, { useState, useEffect, useRef, useCallback } from "react";
import { Heart, MoreHorizontal, Check } from "lucide-react";
import { Api } from "../lib/api.js";
import { usePlayer, useUI } from "../context.jsx";
import { useRouter } from "../router.jsx";
import { useTrackMenuItems, HoverRail } from "../components.jsx";
import { SmartCover, sizedThumb } from "../lib/brand.jsx";
import { loadTrackArtists } from "../lib/artistProfile.js";
import { uid, formatDuration } from "../lib/utils.js";
import { ShowcaseBlock, pickShowcases, showcaseByKind } from "./ExploreShowcases.jsx";
import { readFeedSnapshot, saveFeedSnapshot, clearFeedSnapshot, feedTimeLeft, FEED_TTL, FEED_MAX_CYCLES } from "../lib/exploreCache.js";
import { cyclePlan, SZ } from "../lib/exploreThumbs.js";
import { preloadImages, preconnectOrigins } from "../lib/imagePreload.js";

const N_TRENDING = 5;
const N_DISCOVER = 6;
const N_ARTISTS = 8;
const PAGE = 24;
const CRITICAL_WAIT = 1200; // ms maksimal menunggu thumbnail layar pertama sebelum cycle ditampilkan

function newSource() {
  return { seed: uid("explore"), cursor: 0, pool: [], seen: new Set() };
}
async function fillPool(src, type, need, allowExplicit) {
  let dry = 0;
  while (src.pool.length < need && dry < 3) {
    let res;
    try {
      res = await Api.discover(src.seed, src.cursor, PAGE, type);
    } catch {
      return;
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

// Ubah snapshot dari localStorage menjadi cycle yang siap dirender (block → komponen layout).
function hydrateSnapshot(snap) {
  return snap.cycles.map((c, i) => ({
    id: i + 1,
    trending: c.trending || [],
    blocks: (c.blocks || [])
      .map((b) => ({ def: showcaseByKind(b.kind), tracks: b.tracks || [] }))
      .filter((b) => b.def && b.tracks.length >= b.def.min),
    discover: c.discover || [],
    artists: c.artists || [],
  }));
}

// Tandai item yang sudah tampil supaya cycle baru tidak mengulang lagu yang sama.
function markSeen(sources, cycles) {
  for (const c of cycles) {
    const tracks = [...c.trending, ...c.blocks.flatMap((b) => b.tracks), ...c.discover];
    tracks.forEach((t) => t?.id != null && sources.track.seen.add(t.id));
    c.artists.forEach((a) => a?.id != null && sources.artist.seen.add(a.id));
  }
}

function useExploreFeed() {
  const { settings } = useUI();
  const allowExplicit = useRef(true);
  allowExplicit.current = settings.explicitContent !== false;

  // 1) Pulihkan feed dari cache (berlaku 5 jam) → langsung tampil tanpa skeleton / request.
  const boot = useRef(null);
  if (boot.current === null) {
    const snap = readFeedSnapshot();
    const usable = snap && !(snap.explicit && !allowExplicit.current);
    const restored = usable ? hydrateSnapshot(snap) : [];
    boot.current = { cycles: restored, at: restored.length ? snap.at : 0 };
  }

  const [cycles, setCycles] = useState(boot.current.cycles);
  const [loading, setLoading] = useState(false);
  const [stalled, setStalled] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const gen = useRef(0);                         // naik setiap feed di-reset → hasil build lama dibuang
  const counter = useRef(boot.current.cycles.length);
  const bornAt = useRef(boot.current.at);        // kapan feed ini dibuat (untuk masa berlaku 5 jam)
  const ahead = useRef(null);                    // cycle berikutnya yang disiapkan di belakang layar
  const src = useRef(null);
  if (src.current === null) {
    src.current = { track: newSource(), artist: newSource() };
    markSeen(src.current, boot.current.cycles);
  }

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // Bangun satu cycle: ambil data, lalu pastikan thumbnail layar pertama siap sebelum dipakai.
  // Mengembalikan cycle, null (tidak ada data), atau undefined (dibatalkan karena feed di-reset).
  const buildCycle = useCallback(async (index, g) => {
    const s = src.current;
    // Layout showcase untuk siklus ini dipilih dulu, supaya tahu berapa lagu yang perlu diambil.
    const defs = pickShowcases(index);
    const need = N_TRENDING + defs.reduce((sum, d) => sum + d.need, 0) + N_DISCOVER;
    await Promise.all([
      fillPool(s.track, "track", need, allowExplicit.current),
      fillPool(s.artist, "artist", N_ARTISTS, true),
    ]);
    if (!alive.current || g !== gen.current) return undefined;
    const trending = s.track.pool.splice(0, N_TRENDING);
    const blocks = [];
    for (const def of defs) {
      const tracks = s.track.pool.splice(0, def.need);
      if (tracks.length >= def.min) blocks.push({ def, tracks });
    }
    const discover = s.track.pool.splice(0, N_DISCOVER);
    const artists = s.artist.pool.splice(0, N_ARTISTS);
    if (!trending.length && !blocks.length && !discover.length && !artists.length) return null;
    const cycle = { trending, blocks, discover, artists };

    // 2) Preload thumbnail: layar pertama dimuat dulu (prioritas tinggi), sisanya mengalir di latar belakang.
    const plan = cyclePlan(cycle);
    preconnectOrigins(plan.critical);
    await preloadImages(plan.critical, { high: true, timeout: CRITICAL_WAIT });
    if (!alive.current || g !== gen.current) return undefined;
    preloadImages(plan.rest);
    return cycle;
  }, []);

  // 3) Siapkan cycle berikutnya selagi pengguna masih membaca → scroll tanpa jeda & thumbnail sudah siap.
  const queuePrefetch = useCallback(() => {
    if (!alive.current || ahead.current) return;
    const g = gen.current;
    window.setTimeout(() => {
      if (!alive.current || g !== gen.current || ahead.current || busy.current || document.hidden) return;
      const entry = { index: counter.current, gen: g, done: false, promise: null };
      entry.promise = buildCycle(entry.index, g).then((c) => { entry.done = true; return c; });
      ahead.current = entry;
    }, 800);
  }, [buildCycle]);

  const loadCycle = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStalled(false);
    const g = gen.current;
    const index = counter.current;
    const pre = ahead.current;
    ahead.current = null;
    let promise;
    if (pre && pre.gen === g && pre.index === index) {
      promise = pre.promise;
      if (!pre.done) setLoading(true);
    } else {
      setLoading(true);
      promise = buildCycle(index, g);
    }
    const cycle = await promise;
    if (!alive.current || g !== gen.current) return; // unmount / feed di-reset → reset sudah mengurus state
    if (!cycle) {
      setStalled(true);
    } else {
      if (!bornAt.current) bornAt.current = Date.now();
      const id = ++counter.current;
      setCycles((prev) => [...prev, { ...cycle, id }]);
    }
    setLoading(false);
    busy.current = false;
    if (cycle) queuePrefetch();
  }, [buildCycle, queuePrefetch]);

  // Feed kedaluwarsa (5 jam) → buang dan mulai dari awal dengan lagu baru.
  const reset = useCallback(() => {
    gen.current++;
    ahead.current = null;
    busy.current = false;
    counter.current = 0;
    bornAt.current = 0;
    src.current = { track: newSource(), artist: newSource() };
    clearFeedSnapshot();
    setCycles([]);
    setLoading(false);
    setStalled(false);
  }, []);

  // Simpan 2 cycle pertama supaya kunjungan berikutnya langsung tampil.
  useEffect(() => {
    if (!cycles.length || !bornAt.current || cycles.length > FEED_MAX_CYCLES) return undefined;
    const t = window.setTimeout(() => saveFeedSnapshot(cycles, bornAt.current, allowExplicit.current), 500);
    return () => window.clearTimeout(t);
  }, [cycles]);

  // Pantau masa berlaku. Saat tab sedang dipakai feed tidak diganti tiba-tiba di tengah scroll;
  // penggantian terjadi begitu tab kembali dibuka, atau saat halaman dibuka lagi.
  const hasCycles = cycles.length > 0;
  useEffect(() => {
    const expired = () => bornAt.current && Date.now() - bornAt.current >= FEED_TTL;
    const onVisible = () => {
      if (document.hidden) return;
      if (expired()) reset(); else queuePrefetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    let timer = 0;
    if (hasCycles && bornAt.current) {
      timer = window.setTimeout(() => { if (document.hidden && expired()) reset(); }, feedTimeLeft(bornAt.current) + 1000);
    }
    return () => { document.removeEventListener("visibilitychange", onVisible); window.clearTimeout(timer); };
  }, [hasCycles, reset, queuePrefetch]);

  // Saat feed dipulihkan dari cache: pastikan thumbnail-nya siap dan mulai menyiapkan cycle berikutnya.
  useEffect(() => {
    const restored = boot.current.cycles;
    if (!restored.length) return;
    restored.forEach((c, i) => {
      const plan = cyclePlan(c);
      if (i === 0) { preconnectOrigins(plan.critical); preloadImages(plan.critical, { high: true }); }
      preloadImages(i === 0 ? plan.rest : [...plan.critical, ...plan.rest]);
    });
    queuePrefetch();
  }, [queuePrefetch]);

  return { cycles, loading, stalled, loadCycle };
}

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
    <div className={`aivy-xrow ${isCurrent ? "current" : ""}`} onClick={play} onContextMenu={openMenu} onPointerEnter={() => { loadTrackArtists(track); }}>
      <span className="cover">
        <SmartCover src={track.cover} seed={track.id + track.title} size={SZ.row} radius={6} style={{ width: "100%", height: "100%" }} />
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

function FeaturedArtistCard({ artist }) {
  const { navigate } = useRouter();
  const { t } = useUI();
  const { followedArtistIds, toggleFollowArtist } = usePlayer();
  const following = !!artist.id && followedArtistIds.has(String(artist.id));
  const toggle = (e) => {
    e.stopPropagation();
    toggleFollowArtist(artist);
  };
  return (
    <div className="aivy-xartist" onClick={() => navigate("artist", { params: { id: artist.id } })}>
      {artist.image && <span className="bg" style={{ backgroundImage: `url(${JSON.stringify(sizedThumb(artist.image, SZ.artistBg))})` }} />}
      <span className="shade" />
      <span className="img">
        <SmartCover src={artist.image} seed={"artist" + artist.id + artist.name} size={SZ.artist} radius={999} style={{ width: "100%", height: "100%", borderRadius: "50%" }} />
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
  const artistsBlock = cycle.artists.length > 0 && (
    <section key="artists">
      <BlockHead>{t("exploreFeaturedArtists")}</BlockHead>
      <div className="aivy-xartists">
        <HoverRail>
          {cycle.artists.map((a) => <FeaturedArtistCard key={a.id} artist={a} />)}
        </HoverRail>
      </div>
    </section>
  );
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

      {cycle.blocks.map((b, i) => (
        <React.Fragment key={b.def.kind}>
          <ShowcaseBlock def={b.def} tracks={b.tracks} />
          {i === 0 ? artistsBlock : null}
        </React.Fragment>
      ))}
      {cycle.blocks.length === 0 ? artistsBlock : null}

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