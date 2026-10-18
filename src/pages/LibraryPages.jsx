import React, { useMemo, useRef } from "react";
import { Heart, Play, Library as LibraryIcon, Youtube, Music2, ListMusic, ArrowLeft, ArrowRight, Check, Loader2, ClipboardList, PlusCircle, ImagePlus, X, RotateCcw, Pencil, MoreHorizontal, Shuffle, Share2, Globe, Lock, Search, ListPlus, FolderSearch, Trash2, FolderOpen, Mic2, Disc, LayoutGrid, List } from "lucide-react";
import { usePlayer, useUI } from "../context.jsx";
import { useRouter, Link } from "../router.jsx";
import { TrackRow, ViewNotFound, ViewLoading, ConfirmDialog, CustomSelect, FlipList, CardAlbum, shuffleArray, thumbBlur, shareLink } from "../components.jsx";
import { SmartCover } from "../lib/brand.jsx";
import { useImmersiveHero, ImmersiveHero } from "../lib/immersive.jsx";
import { Api } from "../lib/api.js";

function normalizeLikedRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: r.video_id,
    videoId: r.video_id,
    title: r.title,
    artist: r.artist || (r.artist_name ? { name: r.artist_name } : null),
    artists: r.artists || null,
    album: r.album || null,
    cover: r.thumbnail,
    duration: r.duration,
    explicit: !!r.explicit,
  }));
}

function mergeTracks(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const tr of list || []) {
      if (!tr || seen.has(tr.id)) continue;
      seen.add(tr.id);
      out.push(tr);
    }
  }
  return out;
}

const LIB_VIEW_KEY = "cx_lib_view";

/* ---------- helpers ---------- */

function useMq(query) {
  const [matches, setMatches] = React.useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener("change", on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener("change", on); else mq.removeListener(on); };
  }, [query]);
  return matches;
}

/* jumlah kolom grid saat ini, supaya 1 baris "shelf" tidak pernah terpotong */
function useGridCols(ref, fallback = 6) {
  const [cols, setCols] = React.useState(fallback);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const n = getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length;
      setCols((c) => (n > 0 && n !== c ? n : c));
    };
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return cols;
}

function playlistItem(pl, t) {
  const cover = pl.cover_thumbnail ?? pl.songs?.[0]?.cover ?? null;
  const count = pl.songs ? pl.songs.length : (pl.song_count ?? 0);
  return { key: "pl" + pl.id, to: "playlist", params: { id: pl.id }, title: pl.name, sub: `${count} ${t("songsCount")}`, kind: t("playlistLabel"), cover, seed: "pl" + pl.id, round: false };
}

function albumItem(al, t) {
  const year = al.releaseDate ? String(al.releaseDate).slice(0, 4) : "";
  return { key: "al" + al.id, to: "album", params: { id: al.id }, title: al.title, sub: [al.artist?.name || al.artistLine, year].filter(Boolean).join(" \u00b7 "), kind: t("albumLabel"), cover: al.cover, seed: "album" + al.id + al.title, round: false };
}

function artistItem(a, t) {
  return { key: "ar" + a.id, to: "artist", params: { id: a.id }, title: a.name, sub: "", kind: t("artistLabel"), cover: a.image, seed: "artist" + a.id + a.name, round: true };
}

/* ---------- data (dipakai desktop & mobile) ---------- */

function useLibraryData() {
  const { playlists, liked, localTracks, playList, setPlaylistDetail, followedArtists, savedAlbums } = usePlayer();
  const { t, authUser } = useUI();
  const [tab, setTab] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [likedTracks, setLikedTracks] = React.useState([]);
  const [songLimit, setSongLimit] = React.useState(60);
  const [collLimit, setCollLimit] = React.useState(40);
  const [view, setViewState] = React.useState(() => {
    try { return localStorage.getItem(LIB_VIEW_KEY) === "list" ? "list" : "grid"; } catch { return "grid"; }
  });
  const requestedRef = useRef(new Set());
  const aliveRef = useRef(true);

  const setView = (v) => {
    setViewState(v);
    try { localStorage.setItem(LIB_VIEW_KEY, v); } catch { /* ignore */ }
  };

  React.useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  React.useEffect(() => {
    if (!authUser) { setLikedTracks([]); return undefined; }
    let alive = true;
    Api.likes()
      .then((rows) => { if (alive) setLikedTracks(normalizeLikedRows(rows)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [authUser, liked.size]);

  React.useEffect(() => {
    const pending = playlists.filter((pl) => !Array.isArray(pl.songs) && !requestedRef.current.has(String(pl.id)));
    if (!pending.length) return;
    pending.forEach((pl) => requestedRef.current.add(String(pl.id)));
    (async () => {
      for (let i = 0; i < pending.length; i += 4) {
        const chunk = pending.slice(i, i + 4);
        await Promise.all(chunk.map((pl) =>
          Api.playlist(pl.id)
            .then((detail) => { if (aliveRef.current) setPlaylistDetail(detail); })
            .catch(() => {})
        ));
        if (!aliveRef.current) return;
      }
    })();
  }, [playlists, setPlaylistDetail]);

  React.useEffect(() => { setSongLimit(60); setCollLimit(40); }, [q, tab]);

  const allSongs = useMemo(
    () => mergeTracks(likedTracks, localTracks, ...playlists.map((pl) => pl.songs)),
    [likedTracks, localTracks, playlists]
  );
  const artists = followedArtists;
  const albums = savedAlbums;

  const norm = q.trim().toLowerCase();
  const items = useMemo(() => {
    const has = (...parts) => !norm || parts.some((p) => p && String(p).toLowerCase().includes(norm));
    const albumName = (tr) => (typeof tr.album === "string" ? tr.album : (tr.album?.name || tr.album?.title || ""));
    return {
      pls: playlists.filter((pl) => has(pl.name)).map((pl) => playlistItem(pl, t)),
      als: albums.filter((al) => has(al.title, al.artist?.name, al.artistLine)).map((al) => albumItem(al, t)),
      ars: artists.filter((a) => has(a.name)).map((a) => artistItem(a, t)),
      songs: norm
        ? allSongs.filter((tr) => has(tr.title, tr.artist?.name, Array.isArray(tr.artists) ? tr.artists.map((a) => a?.name).join(" ") : "", albumName(tr)))
        : allSongs,
    };
  }, [norm, playlists, albums, artists, allSongs, t]);

  return {
    t, tab, setTab, q, setQ, view, setView,
    liked, likedTracks, allSongs, items, playList,
    songLimit, setSongLimit, collLimit, setCollLimit,
    libSource: { type: "library", label: t("yourLibrary") },
    hasAnything: allSongs.length > 0 || playlists.length > 0 || albums.length > 0 || artists.length > 0,
    tabs: [
      { id: "all", label: "Semua" },
      { id: "songs", label: "Lagu" },
      { id: "artists", label: t("artistLabel") },
      { id: "albums", label: t("albumLabel") },
      { id: "playlists", label: t("playlistLabel") },
    ],
  };
}

/* ---------- potongan UI bersama ---------- */

function LibItem({ it, layout }) {
  const size = layout === "row" ? 56 : 200;
  const sub = layout === "row" ? [it.kind, it.sub].filter(Boolean).join(" \u00b7 ") : (it.sub || it.kind);
  return (
    <Link to={it.to} params={it.params} className={`lib2-item is-${layout} ${it.round ? "is-round" : ""}`}>
      <span className="lib2-art">
        <SmartCover src={it.cover} seed={it.seed} size={size} radius={it.round ? 999 : 8} style={{ width: "100%", height: "100%" }} />
      </span>
      <span className="lib2-meta">
        <span className="lib2-title">{it.title}</span>
        <span className="lib2-sub">{sub}</span>
      </span>
    </Link>
  );
}

function LibPin({ Icon, accent = false, title, sub, to, onOpen, onPlay, playLabel }) {
  const body = (
    <>
      <span className={`lib2-pin-ic ${accent ? "is-accent" : ""}`}><Icon size={20} fill={accent ? "currentColor" : "none"} /></span>
      <span className="lib2-meta">
        <span className="lib2-title">{title}</span>
        <span className="lib2-sub">{sub}</span>
      </span>
    </>
  );
  return (
    <div className="lib2-pin">
      {to
        ? <Link to={to} className="lib2-pin-main">{body}</Link>
        : <button type="button" className="lib2-pin-main" onClick={onOpen}>{body}</button>}
      {onPlay && (
        <button type="button" className="lib2-pin-play" onClick={onPlay} aria-label={playLabel}>
          <Play size={16} fill="currentColor" />
        </button>
      )}
    </div>
  );
}

/* satu baris kartu, jumlahnya mengikuti lebar layar */
function LibShelf({ title, items, onMore }) {
  const ref = useRef(null);
  const cols = useGridCols(ref);
  return (
    <section className="lib2-section">
      <div className="lib2-section-head">
        <h2>{title}</h2>
        {items.length > cols && <button type="button" className="lib2-link" onClick={onMore}>Lihat semua</button>}
      </div>
      <div ref={ref} className="lib2-grid is-shelf">
        {items.slice(0, cols).map((it) => <LibItem key={it.key} it={it} layout="grid" />)}
      </div>
    </section>
  );
}

function LibEmpty({ Icon, title, sub }) {
  return (
    <div className="aivy-empty">
      <Icon size={34} color="var(--ink-faint)" />
      <div className="title">{title}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function LibBody({ lib, isMobile }) {
  const { t, tab, setTab, q, view, items, allSongs, likedTracks, liked, playList, libSource, songLimit, setSongLimit, collLimit, setCollLimit, hasAnything } = lib;
  const { pls, als, ars, songs } = items;
  const searching = q.trim() !== "";
  const rowMode = isMobile || view === "list";
  const noResult = <LibEmpty Icon={Search} title="Tidak ada hasil" sub={`Tidak ada yang cocok dengan \u201c${q.trim()}\u201d.`} />;

  const likedPin = (
    <LibPin
      Icon={Heart} accent title={t("navLikedSongs")} sub={`${liked.size} ${t("songsCount")}`} to="liked"
      onPlay={likedTracks.length ? () => playList(likedTracks, 0, { type: "library", label: t("navLikedSongs") }) : null}
      playLabel={t("playAll")}
    />
  );
  const songsPin = (
    <LibPin Icon={Music2} title="Semua lagu" sub={`${allSongs.length} ${t("songsCount")}`} onOpen={() => setTab("songs")} />
  );

  /* ---- Semua ---- */
  if (tab === "all") {
    const mixed = [...pls, ...als, ...ars];
    const hasCollections = mixed.length > 0;
    const previewSongs = searching ? songs.slice(0, 8) : [];
    if (searching && !hasCollections && !previewSongs.length) return noResult;
    return (
      <>
        {!searching && <div className="lib2-pins">{likedPin}{songsPin}</div>}

        {isMobile ? (
          hasCollections && (
            <>
              <div className="lib2-list">
                {mixed.slice(0, collLimit).map((it) => <LibItem key={it.key} it={it} layout="row" />)}
              </div>
              {mixed.length > collLimit && (
                <div className="lib2-more"><button type="button" className="aivy-btn-ghost" onClick={() => setCollLimit((n) => n + 40)}>Tampilkan lebih banyak</button></div>
              )}
            </>
          )
        ) : (
          <>
            {pls.length > 0 && <LibShelf title={t("playlistLabel")} items={pls} onMore={() => setTab("playlists")} />}
            {als.length > 0 && <LibShelf title={t("albumLabel")} items={als} onMore={() => setTab("albums")} />}
            {ars.length > 0 && <LibShelf title={t("artistLabel")} items={ars} onMore={() => setTab("artists")} />}
          </>
        )}

        {previewSongs.length > 0 && (
          <section className="lib2-section">
            <div className="lib2-section-head">
              <h2>Lagu</h2>
              {songs.length > previewSongs.length && <button type="button" className="lib2-link" onClick={() => setTab("songs")}>Lihat semua</button>}
            </div>
            <div>
              {previewSongs.map((tr, i) => (
                <TrackRow key={tr.id} track={tr} index={i} list={songs} showIndex={false} showAlbum={!isMobile} queueMode="context" source={libSource} />
              ))}
            </div>
          </section>
        )}

        {!searching && !hasAnything && <LibEmpty Icon={LibraryIcon} title="Koleksimu masih kosong" sub={t("noPlaylistsYetLong")} />}
      </>
    );
  }

  /* ---- Lagu ---- */
  if (tab === "songs") {
    if (!songs.length) {
      return searching
        ? noResult
        : <LibEmpty Icon={Music2} title="Belum ada lagu" sub="Suka lagu atau tambahkan ke playlist, nanti muncul di sini." />;
    }
    return (
      <>
        <div className="lib2-songbar">
          <span className="count">{songs.length} {t("songsCount")}</span>
          <button type="button" className="lib2-btn is-ghost" onClick={() => playList(shuffleArray(songs), 0, libSource)}>
            <Shuffle size={15} /> {t("shuffle")}
          </button>
          <button type="button" className="lib2-btn is-primary" onClick={() => playList(songs, 0, libSource)}>
            <Play size={15} fill="currentColor" /> {t("playAll")}
          </button>
        </div>
        <div>
          {songs.slice(0, songLimit).map((tr, i) => (
            <TrackRow key={tr.id} track={tr} index={i} list={songs} showAlbum={!isMobile} showIndex={!isMobile} queueMode="context" source={libSource} />
          ))}
        </div>
        {songs.length > songLimit && (
          <div className="lib2-more"><button type="button" className="aivy-btn-ghost" onClick={() => setSongLimit((n) => n + 60)}>Tampilkan lebih banyak</button></div>
        )}
      </>
    );
  }

  /* ---- Artist / Album / Playlist ---- */
  const list = tab === "artists" ? ars : tab === "albums" ? als : pls;
  const empty = {
    artists: { Icon: Mic2, title: "Belum ada artist yang diikuti", sub: "Ikuti artist dari halaman artist, nanti muncul di sini." },
    albums: { Icon: Disc, title: "Belum ada album yang disimpan", sub: "Tekan ikon hati di halaman album untuk menyimpannya ke sini." },
    playlists: { Icon: ListMusic, title: "Belum ada playlist", sub: t("noPlaylistsYetLong") },
  }[tab];

  return (
    <>
      {tab === "playlists" && !searching && <div className="lib2-pins is-single">{likedPin}</div>}
      {list.length === 0
        ? (searching ? noResult : <LibEmpty {...empty} />)
        : rowMode
          ? <div className="lib2-list">{list.map((it) => <LibItem key={it.key} it={it} layout="row" />)}</div>
          : <div className="lib2-grid">{list.map((it) => <LibItem key={it.key} it={it} layout="grid" />)}</div>}
    </>
  );
}

/* ---------- Desktop ---------- */

function LibraryDesktop({ lib }) {
  const { t, tab, setTab, tabs, q, setQ, view, setView } = lib;
  const showViewToggle = tab === "artists" || tab === "albums" || tab === "playlists";
  return (
    <div className="aivy-view-enter lib2 is-desktop">
      <header className="lib2-head">
        <h1>{t("yourLibrary")}</h1>
        <div className="lib2-actions">
          <Link to="libraryLocal" className="lib2-action"><FolderSearch size={16} /> Lokal</Link>
          <Link to="libraryImport" className="lib2-action"><Youtube size={16} /> Import dari YouTube</Link>
        </div>
      </header>

      <div className="lib2-toolbar">
        <div className="lib2-tabs" role="tablist">
          {tabs.map((tb) => (
            <button key={tb.id} type="button" role="tab" aria-selected={tab === tb.id} className={`lib2-tab ${tab === tb.id ? "active" : ""}`} onClick={() => setTab(tb.id)}>
              {tb.label}
            </button>
          ))}
        </div>
        <div className="lib2-tools">
          <label className="lib2-search">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari di koleksi" aria-label="Cari di koleksi" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Hapus pencarian"><X size={14} /></button>}
          </label>
          {showViewToggle && (
            <div className="lib2-seg" role="group" aria-label="Tampilan">
              <button type="button" className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Tampilan grid" aria-pressed={view === "grid"}><LayoutGrid size={15} /></button>
              <button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="Tampilan daftar" aria-pressed={view === "list"}><List size={16} /></button>
            </div>
          )}
        </div>
      </div>

      <LibBody lib={lib} isMobile={false} />
    </div>
  );
}

/* ---------- Mobile ---------- */

function LibraryMobile({ lib }) {
  const { t, tab, setTab, tabs, q, setQ } = lib;
  const [searchOpen, setSearchOpen] = React.useState(q !== "");
  const closeSearch = () => { setQ(""); setSearchOpen(false); };
  return (
    <div className="aivy-view-enter lib2 is-mobile">
      <header className="lib2-head">
        <h1>{t("yourLibrary")}</h1>
        <div className="lib2-actions">
          <button type="button" className="lib2-iconbtn" onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))} aria-label="Cari di koleksi"><Search size={20} /></button>
          <Link to="libraryLocal" className="lib2-iconbtn" aria-label="Musik lokal"><FolderSearch size={20} /></Link>
          <Link to="libraryImport" className="lib2-iconbtn" aria-label="Import dari YouTube"><Youtube size={20} /></Link>
        </div>
      </header>

      {searchOpen && (
        <label className="lib2-search is-block">
          <Search size={15} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari di koleksi" aria-label="Cari di koleksi" />
          <button type="button" onClick={closeSearch} aria-label="Tutup pencarian"><X size={16} /></button>
        </label>
      )}

      <div className="lib2-chips" role="tablist">
        {tabs.map((tb) => (
          <button key={tb.id} type="button" role="tab" aria-selected={tab === tb.id} className={`lib2-chip ${tab === tb.id ? "active" : ""}`} onClick={() => setTab(tb.id)}>
            {tb.label}
          </button>
        ))}
      </div>

      <LibBody lib={lib} isMobile />
    </div>
  );
}

/* ---------- Halaman ---------- */

export function LibraryPage() {
  const isMobile = useMq("(max-width: 860px)");
  const lib = useLibraryData();
  return isMobile ? <LibraryMobile lib={lib} /> : <LibraryDesktop lib={lib} />;
}

export function LikedPage() {
  const { liked, toggleLike, playList } = usePlayer();
  const { t } = useUI();
  const [likedTracks, setLikedTracks] = React.useState(null);

  const fetchLiked = () => {
    import("../lib/api.js").then(({ Api }) =>
      Api.likes()
        .then((rows) => setLikedTracks(normalizeLikedRows(rows)))
        .catch(() => setLikedTracks([]))
    );
  };

  React.useEffect(() => { fetchLiked(); }, []);

  const handleUnlike = async (track) => {
    setLikedTracks((prev) => prev.filter((tr) => tr.id !== track.id));
    await toggleLike(track);
  };

  return (
    <div className="aivy-view-enter">
      <div className="aivy-hero">
        <div className="art"><div style={{ width: 176, height: 176, borderRadius: "var(--radius-lg)", background: "linear-gradient(150deg, var(--berry), var(--bg-elev-3))", display: "flex", alignItems: "center", justifyContent: "center" }}><Heart size={54} color="var(--accent-ink)" fill="var(--accent-ink)" /></div></div>
        <div className="aivy-hero-meta"><div className="eyebrow">{t("playlistLabel")}</div><h1 className="font-display">{t("navLikedSongs")}</h1><div className="stats"><span>{liked.size} {t("songsCount")}</span></div></div>
      </div>
      {likedTracks === null ? null : likedTracks.length > 0 ? (
        <>
          <div className="aivy-hero-actions"><button className="aivy-play-btn is-hero" style={{ width: 52, height: 52 }} onClick={() => playList(likedTracks, 0, { type: "library", label: t("navLikedSongs") })} aria-label={t("playAll")}><Play size={22} fill="currentColor" /></button></div>
          <div>{likedTracks.map((tr, i) => <TrackRow key={tr.id} track={tr} index={i} list={likedTracks} showAlbum onRemove={() => handleUnlike(tr)} removeLabel={t("menuRemoveLiked")} queueMode="context" source={{ type: "library", label: t("navLikedSongs") }} />)}</div>
        </>
      ) : (
        <div className="aivy-empty"><Heart size={38} color="var(--ink-faint)" /><div className="title">{t("noLikedYet")}</div><div className="sub">{t("noLikedYetSub")}</div></div>
      )}
    </div>
  );
}

function PlaylistCoverModal({ pl, onClose }) {
  const { setPlaylistCover } = usePlayer();
  const { t } = useUI();

  const options = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const s of pl.songs || []) {
      if (!s.cover || seen.has(s.cover)) continue;
      seen.add(s.cover);
      out.push(s);
    }
    return out;
  }, [pl.songs]);

  const currentCover = pl.cover_thumbnail ?? null;

  const handlePick = (song) => {
    setPlaylistCover(pl.id, song.cover, song.videoId || song.id);
    onClose();
  };

  const handleReset = () => {
    setPlaylistCover(pl.id, null, null);
    onClose();
  };

  return (
    <div className="aivy-modal-backdrop" onClick={onClose}>
      <div className="aivy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aivy-modal-head">
          <div className="aivy-modal-title">{t("changeCoverTitle")}</div>
          <button className="aivy-icon-btn sm" onClick={onClose} aria-label={t("close")}><X size={17} /></button>
        </div>
        <p className="aivy-bio" style={{ padding: 0, marginBottom: 14, fontSize: 13 }}>{t("changeCoverSub")}</p>
        {options.length > 0 ? (
          <div className="aivy-cover-pick-grid">
            {options.map((s) => (
              <button
                key={s.id}
                className={`aivy-cover-pick-item ${currentCover === s.cover ? "active" : ""}`}
                onClick={() => handlePick(s)}
                title={s.title}
              >
                <SmartCover src={s.cover} seed={"cov" + s.id} size={110} radius={8} style={{ width: "100%", aspectRatio: "1 / 1" }} />
                {currentCover === s.cover && <span className="check"><Check size={14} /></span>}
              </button>
            ))}
          </div>
        ) : (
          <div className="eyebrow" style={{ padding: "8px 2px" }}>{t("changeCoverEmpty")}</div>
        )}
        {currentCover && (
          <button className="aivy-btn-ghost" style={{ width: "100%", marginTop: 14 }} onClick={handleReset}>
            <RotateCcw size={14} /> {t("useDefaultCover")}
          </button>
        )}
      </div>
    </div>
  );
}

function PlaylistEditModal({ pl, onClose }) {
  const { updatePlaylistMeta } = usePlayer();
  const { t } = useUI();
  const [name, setName] = React.useState(pl.name || "");
  const [description, setDescription] = React.useState(pl.description || "");
  const [isPublic, setIsPublic] = React.useState(!!pl.is_public);
  const [saving, setSaving] = React.useState(false);
  const nameRef = React.useRef(null);

  React.useEffect(() => { nameRef.current?.focus(); }, []);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const ok = await updatePlaylistMeta(pl.id, { name: trimmed, description: description.trim(), isPublic });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="aivy-modal-backdrop" onClick={onClose}>
      <div className="aivy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aivy-modal-head">
          <div className="aivy-modal-title">{t("editPlaylistTitle")}</div>
          <button className="aivy-icon-btn sm" onClick={onClose} aria-label={t("close")}><X size={17} /></button>
        </div>
        <div className="aivy-field">
          <label className="aivy-field-label" htmlFor="pl-edit-name">{t("playlistNameLabel")}</label>
          <input
            id="pl-edit-name"
            ref={nameRef}
            className="aivy-input"
            placeholder={t("playlistNamePlaceholder")}
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
          />
        </div>
        <div className="aivy-field">
          <label className="aivy-field-label" htmlFor="pl-edit-desc">{t("playlistDescLabel")}</label>
          <textarea
            id="pl-edit-desc"
            className="aivy-textarea"
            placeholder={t("playlistDescPlaceholder")}
            value={description}
            maxLength={300}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <label className="aivy-settings-row" style={{ padding: "10px 0", borderBottom: "none" }}>
          <div><div className="label">{t("makePublicLabel")}</div><div className="hint">{t("makePublicHint")}</div></div>
          <span
            className={`aivy-switch ${isPublic ? "on" : ""}`}
            onClick={() => setIsPublic((v) => !v)}
            role="switch"
            aria-checked={isPublic}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setIsPublic((v) => !v); } }}
          >
            <span className="knob" />
          </span>
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button className="aivy-btn-primary" style={{ flex: 1 }} disabled={!name.trim() || saving} onClick={handleSave}>
            {saving ? <Loader2 size={15} className="aivy-spin" /> : t("save")}
          </button>
          <button className="aivy-btn-ghost" onClick={onClose}>{t("cancel")}</button>
        </div>
      </div>
    </div>
  );
}

export function PlaylistPage() {
  const { params } = useRouter();
  const { playlists, playList, removeFromPlaylist, deletePlaylist, setPlaylistDetail, addAllToQueueEnd, playAllNext } = usePlayer();
  const { navigate } = useRouter();
  const { openContextMenu, openAddToPlaylist, pushToast, authUser, t } = useUI();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef(null);
  const isRemote = !!params.id && !/^\d+$/.test(String(params.id));
  const [remote, setRemote] = React.useState({ id: null, data: null, status: "idle" });
  React.useEffect(() => {
    if (!isRemote) return undefined;
    let alive = true;
    setRemote({ id: params.id, data: null, status: "loading" });
    Api.ytPlaylist(params.id)
      .then((data) => { if (alive) setRemote({ id: params.id, data, status: "ok" }); })
      .catch(() => { if (alive) setRemote({ id: params.id, data: null, status: "error" }); });
    return () => { alive = false; };
  }, [params.id, isRemote]);
  const remoteReady = isRemote && remote.id === params.id;
  const remoteLoading = isRemote && (!remoteReady || remote.status === "loading");
  const pl = isRemote
    ? (remoteReady ? remote.data : null)
    : playlists.find((p) => String(p.id) === String(params.id));
  const [displaySongs, setDisplaySongs] = React.useState(pl?.songs || []);
  const [localShuffle, setLocalShuffle] = React.useState(false);

  React.useEffect(() => {
    setDisplaySongs(localShuffle ? shuffleArray(pl?.songs || []) : (pl?.songs || []));
  }, [pl?.songs, localShuffle]);

  React.useEffect(() => {
    if (!params.id || isRemote) return;
    import("../lib/api.js").then(({ Api }) =>
      Api.playlist(params.id)
        .then((detail) => setPlaylistDetail(detail))
        .catch(() => {})
    );
  }, [params.id]);

  React.useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
  React.useEffect(() => { setSearchOpen(false); setQuery(""); }, [params.id]);

  const isOwner = !!authUser && String(authUser.id) === String(pl?.user_id);
  const cover = pl?.cover_thumbnail ?? pl?.songs?.[0]?.cover ?? null;
  const { mediaRef, pageRef, heroRef } = useImmersiveHero({ ready: !!pl, tint: null });

  if (!pl) {
    if (remoteLoading) return <div className="aivy-am-fallback"><ViewLoading /></div>;
    return <div className="aivy-am-fallback"><ViewNotFound label={t("playlistLabel")} /></div>;
  }
  const q = query.trim().toLowerCase();
  const visibleSongs = q
    ? (displaySongs || []).filter((s) => s.title?.toLowerCase().includes(q) || s.artist?.name?.toLowerCase().includes(q))
    : displaySongs;

  return (
    <div ref={pageRef} className="aivy-view-enter aivy-am-page is-cover-page aivy-playlist-page">
      <ImmersiveHero
        mediaRef={mediaRef}
        heroRef={heroRef}
        coverStyle
        media={<SmartCover src={cover} seed={"banner-pl" + pl.id} size={800} radius={0} style={{ width: "100%", height: "100%" }} />}
      >
        <div className="aivy-am-kicker">
          {t("playlistLabel")}
          {pl.is_public !== undefined && (
            <span className="aivy-playlist-visibility">
              {pl.is_public ? <Globe size={12} /> : <Lock size={12} />} {pl.is_public ? t("publicLabel") : t("privateLabel")}
            </span>
          )}
        </div>
        <h1 className="aivy-am-name">{pl.name}</h1>
        <div className="aivy-am-sub"><span>{pl.songs?.length || 0} {t("songsCount")}</span></div>
        <div className="aivy-am-actions">
          {isOwner && (
            <button className="aivy-am-ghost" onClick={() => setEditOpen(true)} aria-label={t("editPlaylistBtn")} title={t("editPlaylistBtn")}>
              <Pencil size={17} />
            </button>
          )}
          {pl.songs?.length > 0 && (
            <button className={`aivy-am-ghost ${localShuffle ? "active" : ""}`} onClick={() => setLocalShuffle((v) => !v)} aria-label={t("shuffle")} aria-pressed={localShuffle} title={t("shuffle")}>
              <Shuffle size={18} />
            </button>
          )}
          {pl.songs?.length > 0 && <button className="aivy-am-cta" onClick={() => playList(pl.songs, 0, { type: "library", label: pl.name }, localShuffle)} aria-label={t("playAll")} title={t("playAll")}><Play size={25} fill="currentColor" /></button>}
        <button
          className="aivy-am-ghost"
          aria-label={t("playlistMenuLabel")}
          title={t("playlistMenuLabel")}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const hasSongs = pl.songs?.length > 0;
            const items = [
              ...(hasSongs ? [{ label: t("findInPlaylistBtn"), icon: <Search size={20} />, onSelect: () => setSearchOpen(true) }] : []),
              ...(hasSongs ? [{ label: t("playAfterThisBtn"), icon: <ListMusic size={20} />, onSelect: () => playAllNext(pl.songs) }] : []),
              ...(hasSongs ? [{ label: t("addToQueueBtn"), icon: <ListPlus size={20} />, onSelect: () => addAllToQueueEnd(pl.songs) }] : []),
              ...(hasSongs ? [{ label: t("saveToPlaylistBtn"), icon: <LibraryIcon size={20} />, onSelect: () => openAddToPlaylist(pl.songs) }] : []),
              ...(isOwner ? [{ label: t("changeCoverBtn"), icon: <ImagePlus size={20} />, onSelect: () => setCoverPickerOpen(true) }] : []),
              { label: t("sharePlaylistBtn"), icon: <Share2 size={20} />, onSelect: () => { shareLink({ title: pl.name, text: pl.name, url: window.location.href }).then((res) => { if (res === "copied") pushToast(t("playlistLinkCopied")); }); } },
              ...(isOwner ? [{ label: t("deletePlaylistBtn"), icon: <X size={20} />, danger: true, onSelect: () => setConfirmDelete(true) }] : []),
            ];
            items.sheet = {
              cover, seed: "pl" + pl.id, title: pl.name,
              subtitle: `${pl.songs?.length || 0} ${t("songsCount")}`,
            };
            openContextMenu(r.left, r.bottom + 6, items);
          }}
        >
          <MoreHorizontal size={18} />
        </button>
        </div>
      </ImmersiveHero>

      <div className="aivy-am-body is-tracklist">
        <div className="aivy-am-body-inner">
      {searchOpen && (
        <div className="aivy-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={15} color="var(--ink-faint)" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
            <input
              ref={searchRef}
              className="aivy-input"
              style={{ paddingLeft: 38, marginBottom: 0 }}
              placeholder={t("findInPlaylistPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setSearchOpen(false); setQuery(""); } }}
            />
          </div>
          <button className="aivy-icon-btn sm" onClick={() => { setSearchOpen(false); setQuery(""); }} aria-label={t("close")}><X size={17} /></button>
        </div>
      )}
          {pl.songs?.length > 0 ? (
            visibleSongs.length > 0 ? (
              <FlipList
                items={visibleSongs}
                getKey={(tr) => tr.id}
                renderItem={(tr) => (
                  <TrackRow track={tr} index={pl.songs.indexOf(tr)} list={pl.songs} showAlbum onRemove={isOwner ? () => removeFromPlaylist(pl.id, tr.id) : undefined} removeLabel={t("removeFromThisPlaylist")} queueMode="context" source={{ type: "library", label: pl.name }} shuffleOverride={localShuffle} />
                )}
              />
            ) : (
              <div className="aivy-empty"><div className="title">{t("findInPlaylistNoResults")}</div></div>
            )
          ) : (
            <div className="aivy-empty"><div className="title">{t("playlistEmpty")}</div><div className="sub">{t("playlistEmptySub")}</div></div>
          )}
        </div>
      </div>
      {isOwner && coverPickerOpen && <PlaylistCoverModal pl={pl} onClose={() => setCoverPickerOpen(false)} />}
      {isOwner && editOpen && <PlaylistEditModal pl={pl} onClose={() => setEditOpen(false)} />}
      <ConfirmDialog
        open={confirmDelete}
        title={`${t("deletePlaylistConfirmTitle")} "${pl.name}"?`}
        message={t("deletePlaylistConfirmMsg")}
        confirmLabel={t("yesDelete")}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); deletePlaylist(pl.id); navigate("library"); }}
      />
    </div>
  );
}

export function LibraryLocalPage() {
  const { localTracks, localScan, scanLocalFiles, clearLocalLibrary, playList } = usePlayer();
  const { t } = useUI();
  const fileInputRef = useRef(null);

  const handlePick = () => fileInputRef.current?.click();
  const handleChange = (e) => {
    const files = e.target.files;
    if (files && files.length) scanLocalFiles(files);
    e.target.value = "";
  };
  const totalDurationLabel = useMemo(() => {
    const secs = localTracks.reduce((sum, tr) => sum + (tr.duration || 0), 0);
    const mins = Math.round(secs / 60);
    return `${mins} menit`;
  }, [localTracks]);

  return (
    <div className="aivy-view-enter">
      <Link to="library" className="aivy-import-back"><ArrowLeft size={14} /> Balik ke Koleksi</Link>
      <div className="aivy-greet" style={{ paddingBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="font-display" style={{ fontSize: "clamp(20px,3vw,26px)" }}>Lagu Lokal</h1>
          <div className="sub" style={{ color: "var(--ink-faint)", fontSize: 13 }}>
            {localTracks.length > 0
              ? `${localTracks.length} lagu \u00b7 ${totalDurationLabel} \u00b7 dari perangkat ini`
              : "Pindai folder musik di perangkatmu (file di atas 1 menit dianggap lagu)"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {localTracks.length > 0 && (
            <button className="aivy-btn-ghost" onClick={clearLocalLibrary} disabled={localScan.scanning}>
              <Trash2 size={15} /> Hapus
            </button>
          )}
          <button className="aivy-btn-primary" onClick={handlePick} disabled={localScan.scanning}>
            {localScan.scanning ? <><Loader2 size={15} className="aivy-spin" /> Memindai...</> : <><FolderSearch size={15} /> {localTracks.length ? "Pindai ulang" : "Pindai folder musik"}</>}
          </button>
        </div>
      </div>

      <input
        ref={(el) => {
          fileInputRef.current = el;
          if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); }
        }}
        type="file"
        accept="audio/*"
        multiple
        style={{ display: "none" }}
        onChange={handleChange}
      />

      {localScan.scanning && (
        <div className="aivy-import-tutorial" style={{ marginBottom: 16 }}>
          <div className="head"><Loader2 size={15} className="aivy-spin" color="var(--accent-strong)" /> Memindai {localScan.checked} / {localScan.total} file...</div>
          <div className="sub" style={{ fontSize: 13, marginTop: 4 }}>{localScan.found} lagu ditemukan sejauh ini (file di bawah 1 menit dilewati).</div>
        </div>
      )}

      {!localScan.scanning && localTracks.length === 0 && (
        <div className="aivy-empty">
          <FolderOpen size={32} color="var(--ink-faint)" style={{ marginBottom: 8 }} />
          <div className="title">Belum ada lagu lokal</div>
          <div className="sub">Ketuk "Pindai folder musik", lalu pilih folder tempat lagu-lagumu disimpan. Cosmicx akan otomatis melewati file di bawah 1 menit.</div>
        </div>
      )}

      {localTracks.length > 0 && (
        <>
          <div className="aivy-import-actions" style={{ marginBottom: 8 }}>
            <button className="aivy-btn-ghost" onClick={() => playList(localTracks, 0, { type: "local", label: "Lagu Lokal" })}>
              <Play size={15} /> Putar semua
            </button>
          </div>
          <div>
            {localTracks.map((tr, i) => (
              <TrackRow key={tr.id} track={tr} index={i} list={localTracks} queueMode="context" source={{ type: "local", label: "Lagu Lokal" }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const IMPORT_STEPS = [
  { n: 1, label: "Sumber" },
  { n: 2, label: "Konfigurasi" },
  { n: 3, label: "Import" },
];

function ImportStepper({ step }) {
  return (
    <div className="aivy-import-steps">
      {IMPORT_STEPS.map((s, i) => (
        <React.Fragment key={s.n}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className={`aivy-import-step-dot ${step === s.n ? "active" : step > s.n ? "done" : ""}`}>
              {step > s.n ? <Check size={14} /> : s.n}
            </div>
            <span className={`aivy-import-step-label ${step === s.n ? "active" : ""}`}>{s.label}</span>
          </div>
          {i < IMPORT_STEPS.length - 1 && <div className={`aivy-import-step-line ${step > s.n ? "done" : ""}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function formatSongCount(n) {
  return `${n} lagu`;
}

export function ImportPage() {
  const { playlists, refreshPlaylists } = usePlayer();
  const { navigate } = useRouter();

  const [step, setStep] = React.useState(1);
  const [sourceTab, setSourceTab] = React.useState("youtube");
  const [url, setUrl] = React.useState("");
  const [resolving, setResolving] = React.useState(false);
  const [resolveError, setResolveError] = React.useState(null);
  const [resolved, setResolved] = React.useState(null);

  const [targetMode, setTargetMode] = React.useState(playlists.length > 0 ? "existing" : "new");
  const [selectedPlaylistId, setSelectedPlaylistId] = React.useState(playlists[0]?.id || "");
  const [newName, setNewName] = React.useState("");

  const [committing, setCommitting] = React.useState(false);
  const [commitError, setCommitError] = React.useState(null);
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState(null);
  const progressTimer = React.useRef(null);

  const switchSource = (tab) => {
    if (tab === sourceTab) return;
    setSourceTab(tab);
    setUrl("");
    setResolveError(null);
  };

  const handleResolve = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setResolving(true);
    setResolveError(null);
    try {
      const data = sourceTab === "spotify"
        ? await Api.resolveSpotifyImport(trimmed)
        : await Api.resolveYoutubeImport(trimmed);
      setResolved(data);
      setNewName(data.title || "Playlist Impor");
      setStep(2);
    } catch (err) {
      setResolveError(err.message || "Gagal ambil data playlist, coba cek link-nya lagi.");
    } finally {
      setResolving(false);
    }
  };

  const startFakeProgress = () => {
    setProgress(8);
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p < 88 ? p + Math.max(1, (88 - p) / 12) : p));
    }, 220);
  };
  const stopFakeProgress = () => {
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = null;
  };
  React.useEffect(() => () => stopFakeProgress(), []);

  const handleCommit = async () => {
    if (targetMode === "existing" && !selectedPlaylistId) return;
    setStep(3);
    setCommitting(true);
    setCommitError(null);
    startFakeProgress();
    try {
      const body = { songs: resolved.songs, sourceTitle: resolved.title, source: sourceTab };
      if (targetMode === "existing") body.playlistId = selectedPlaylistId;
      else body.newPlaylistName = (newName || resolved.title || "Playlist Impor").trim();

      const res = await Api.commitYoutubeImport(body);
      stopFakeProgress();
      setProgress(100);
      setResult(res);
      refreshPlaylists();
    } catch (err) {
      stopFakeProgress();
      setCommitError(err.message || "Import gagal, coba lagi ya.");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="aivy-view-enter aivy-import-page">
      <Link to="library" className="aivy-import-back"><ArrowLeft size={14} /> Balik ke Koleksi</Link>
      <div className="aivy-greet" style={{ paddingBottom: 4 }}>
        <h1 className="font-display" style={{ fontSize: "clamp(20px,3vw,26px)" }}>Import Playlist</h1>
      </div>
      <ImportStepper step={step} />

      {step === 1 && (
        <div>
          <div className="aivy-import-tabs">
            <button className={`aivy-import-tab ${sourceTab === "youtube" ? "active" : ""}`} onClick={() => switchSource("youtube")}>
              <Youtube size={20} color="var(--berry-strong)" />
              <span className="name">YouTube</span>
            </button>
            <button className={`aivy-import-tab ${sourceTab === "spotify" ? "active" : ""}`} onClick={() => switchSource("spotify")}>
              <Music2 size={20} color="var(--accent-strong)" />
              <span className="name">Spotify</span>
            </button>
          </div>

          <input
            className="aivy-input"
            placeholder={sourceTab === "spotify" ? "Tempel link playlist Spotify di sini..." : "Tempel link playlist YouTube di sini..."}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && url.trim() && !resolving) handleResolve(); }}
          />
          {resolveError && <div className="aivy-import-error">{resolveError}</div>}

          {sourceTab === "youtube" ? (
            <div className="aivy-import-tutorial">
              <div className="head"><ClipboardList size={15} color="var(--accent-strong)" /> Cara salin link playlist YouTube</div>
              <ol>
                <li>Buka aplikasi atau situs YouTube, lalu buka playlist yang mau diimpor.</li>
                <li>Ketuk tombol "Bagikan" (ikon panah / titik tiga di atas playlist).</li>
                <li>Pilih "Salin link", lalu tempel link-nya di kotak di atas.</li>
              </ol>
            </div>
          ) : (
            <div className="aivy-import-tutorial">
              <div className="head"><ClipboardList size={15} color="var(--accent-strong)" /> Cara salin link playlist Spotify</div>
              <ol>
                <li>Buka playlist di aplikasi atau situs Spotify. Pastikan playlist-nya publik.</li>
                <li>Ketuk titik tiga, pilih "Bagikan", lalu "Salin link playlist".</li>
                <li>Tempel link-nya di kotak di atas.</li>
              </ol>
              <div className="sub" style={{ fontSize: 12.5, marginTop: 8, color: "var(--ink-faint)" }}>
                Yang terbaca maksimal sekitar 100 lagu pertama. Tiap lagu dicocokkan ke YouTube Music, jadi proses ini bisa makan waktu setengah menit. Playlist buatan Spotify (Daily Mix, dll) belum didukung.
              </div>
            </div>
          )}

          <div className="aivy-import-actions">
            <button className="aivy-btn-primary" disabled={!url.trim() || resolving} onClick={handleResolve}>
              {resolving
                ? <><Loader2 size={15} className="aivy-spin" /> {sourceTab === "spotify" ? "Mencocokkan lagu..." : "Memuat..."}</>
                : <>Lanjutkan <ArrowRight size={15} /></>}
            </button>
          </div>
        </div>
      )}

      {step === 2 && resolved && (
        <div>
          <div className="aivy-import-summary">
            {resolved.thumbnail ? (
              <img className="thumb" src={resolved.thumbnail} alt={resolved.title} />
            ) : (
              <div className="thumb-fallback"><ListMusic size={28} color="var(--ink-faint)" /></div>
            )}
            <div className="meta">
              <div className="title">{resolved.title}</div>
              <div className="sub">{resolved.author ? `oleh ${resolved.author} · ` : ""}{formatSongCount(resolved.count)}</div>
            </div>
          </div>

          {resolved.unmatched?.length > 0 && (
            <details className="aivy-import-tutorial" style={{ marginBottom: 12 }}>
              <summary style={{ cursor: "pointer", fontSize: 13.5 }}>
                {resolved.unmatched.length} lagu nggak ketemu di YouTube Music dan akan dilewati
              </summary>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--ink-faint)" }}>
                {resolved.unmatched.map((u, i) => (
                  <li key={i}>{u.title}{u.artist ? ` — ${u.artist}` : ""}</li>
                ))}
              </ul>
            </details>
          )}

          <div
            className={`aivy-import-option ${targetMode === "existing" ? "active" : ""} ${playlists.length === 0 ? "" : ""}`}
            onClick={() => playlists.length > 0 && setTargetMode("existing")}
            style={playlists.length === 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          >
            <div className="radio" />
            <div className="body">
              <div className="label">Tambah ke playlist yang sudah ada</div>
              {playlists.length > 0 ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <CustomSelect
                    className="aivy-full-select"
                    value={selectedPlaylistId}
                    options={playlists.map((pl) => ({ value: pl.id, label: pl.name }))}
                    onChange={(v) => { setTargetMode("existing"); setSelectedPlaylistId(v); }}
                  />
                </div>
              ) : (
                <div className="hint" style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Kamu belum punya playlist.</div>
              )}
            </div>
          </div>

          <div className={`aivy-import-option ${targetMode === "new" ? "active" : ""}`} onClick={() => setTargetMode("new")}>
            <div className="radio" />
            <div className="body">
              <div className="label"><PlusCircle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Buat playlist baru</div>
              <input
                className="aivy-input" style={{ marginBottom: 0 }}
                placeholder="Nama playlist baru"
                value={newName}
                onClick={(e) => e.stopPropagation()}
                onFocus={() => setTargetMode("new")}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
          </div>

          {commitError && <div className="aivy-import-error">{commitError}</div>}

          <div className="aivy-import-actions">
            <button className="aivy-btn-ghost" onClick={() => setStep(1)}><ArrowLeft size={15} /> Kembali</button>
            <button
              className="aivy-btn-primary"
              disabled={targetMode === "existing" ? !selectedPlaylistId : !newName.trim()}
              onClick={handleCommit}
            >
              Mulai Import <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          {committing || (!result && !commitError) ? (
            <div className="aivy-import-progress-wrap">
              <Loader2 size={34} className="aivy-spin" color="var(--accent-strong)" />
              <div style={{ marginTop: 14, fontWeight: 600 }}>Mengimpor {resolved ? formatSongCount(resolved.count) : "lagu"}...</div>
              <div className="sub" style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 4 }}>Jangan tutup halaman ini dulu ya.</div>
              <div className="aivy-import-progress-track"><div className="aivy-import-progress-fill" style={{ width: `${progress}%` }} /></div>
            </div>
          ) : commitError ? (
            <div className="aivy-import-success">
              <div className="icon" style={{ background: "color-mix(in srgb, var(--berry) 18%, transparent)" }}><Youtube size={30} color="var(--berry-strong)" /></div>
              <h2>Import gagal</h2>
              <p>{commitError}</p>
              <div className="actions">
                <button className="aivy-btn-ghost" onClick={() => setStep(2)}><ArrowLeft size={15} /> Kembali</button>
                <button className="aivy-btn-primary" onClick={handleCommit}>Coba lagi</button>
              </div>
            </div>
          ) : (
            <div className="aivy-import-success">
              <div className="icon"><Check size={30} color="var(--accent-strong)" /></div>
              <h2>Import selesai</h2>
              <p>
                Berhasil mengimpor {result.imported} dari {result.total} lagu
                {result.skipped > 0 ? ` (${result.skipped} udah ada sebelumnya)` : ""}.
              </p>
              <div className="actions">
                <button className="aivy-btn-ghost" onClick={() => navigate("library")}>Selesai</button>
                <button className="aivy-btn-primary" onClick={() => navigate("playlist", { params: { id: result.playlistId } })}>
                  Buka playlist <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}