import React, { useMemo, useRef } from "react";
import { Heart, Play, Library as LibraryIcon, Youtube, Music2, ListMusic, ArrowLeft, ArrowRight, Check, Loader2, ClipboardList, PlusCircle, ImagePlus, X, RotateCcw, Pencil, MoreHorizontal, Shuffle, Share2, Globe, Lock, Search, ListPlus, FolderSearch, Trash2, FolderOpen, Mic2, Disc, LayoutGrid } from "lucide-react";
import { usePlayer, useUI } from "../context.jsx";
import { useRouter, Link } from "../router.jsx";
import { TrackRow, ViewNotFound, ConfirmDialog, CustomSelect, FlipList, CardAlbum, shuffleArray, thumbBlur } from "../components.jsx";
import { SmartCover } from "../lib/brand.jsx";
import { useArtworkTint, useImmersiveHero, ImmersiveHero } from "../lib/immersive.jsx";
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

function LibSection({ title, onMore, moreLabel = "Lihat semua", children }) {
  return (
    <section className="aivy-lib-section">
      <div className="aivy-lib-section-head">
        <h2 className="aivy-lib-section-title">{title}</h2>
        {onMore && <button className="aivy-lib-section-link" onClick={onMore}>{moreLabel}</button>}
      </div>
      {children}
    </section>
  );
}

function LibPlaylistCard({ pl, big = false }) {
  const { t } = useUI();
  const cover = pl.cover_thumbnail ?? pl.songs?.[0]?.cover ?? null;
  const count = pl.songs ? pl.songs.length : (pl.song_count ?? 0);
  const blur = thumbBlur(cover);
  return (
    <Link to="playlist" params={{ id: pl.id }} className={`aivy-card ${big ? "is-big" : ""} ${blur.className}`} style={{ textAlign: "left", ...blur.style }}>
      <div className="art-wrap">
        {cover ? (
          <SmartCover src={cover} seed={"pl" + pl.id} size={big ? 320 : 160} radius={10} style={{ width: "100%", height: "100%" }} />
        ) : (
          <div className="aivy-lib-ph"><LibraryIcon size={26} color="var(--ink-faint)" /></div>
        )}
      </div>
      <div className="title">{pl.name}</div>
      <div className="sub">{count} {t("songsCount")}</div>
    </Link>
  );
}

function LibLikedCard({ count, cover }) {
  const { t } = useUI();
  const blur = thumbBlur(cover);
  return (
    <Link to="liked" className={`aivy-card ${blur.className}`} style={{ textAlign: "left", ...blur.style }}>
      <div className="art-wrap">
        <div className="aivy-lib-ph" style={{ background: "linear-gradient(135deg, var(--berry), var(--bg-elev-3))" }}>
          <Heart size={30} color="var(--accent-ink)" fill="var(--accent-ink)" />
        </div>
      </div>
      <div className="title">{t("navLikedSongs")}</div>
      <div className="sub">{count} {t("songsCount")}</div>
    </Link>
  );
}

function LibArtistCard({ artist }) {
  const { t } = useUI();
  const blur = thumbBlur(artist.image);
  return (
    <Link to="artist" params={{ id: artist.id }} className={`aivy-card ${blur.className}`} style={{ textAlign: "center", ...blur.style }}>
      <div className="art-wrap round">
        <SmartCover src={artist.image} seed={"artist" + artist.id + artist.name} size={128} radius={999} style={{ width: "100%", height: "100%", aspectRatio: "1 / 1", borderRadius: "50%" }} />
      </div>
      <div className="title" style={{ textAlign: "center" }}>{artist.name}</div>
      <div className="sub" style={{ textAlign: "center" }}>{t("artistLabel")}</div>
    </Link>
  );
}

function LibTabs({ tabs, value, onChange }) {
  const trackRef = useRef(null);
  const btnRefs = useRef({});
  const [pos, setPos] = React.useState({ x: 0, w: 0 });
  const [ready, setReady] = React.useState(false);
  const sig = tabs.map((tb) => `${tb.id}:${tb.label}`).join("|");

  const measure = React.useCallback(() => {
    const el = btnRefs.current[value];
    if (!el) return;
    setPos((p) => (p.x === el.offsetLeft && p.w === el.offsetWidth ? p : { x: el.offsetLeft, w: el.offsetWidth }));
  }, [value]);

  React.useLayoutEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    Object.values(btnRefs.current).forEach((b) => b && ro.observe(b));
    return () => ro.disconnect();
  }, [measure, sig]);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="aivy-lib-tabs-wrap">
      <div
        ref={trackRef}
        className="aivy-lib-tabs"
        role="tablist"
        data-ready={ready ? "1" : "0"}
        style={{ "--ind-x": `${pos.x}px`, "--ind-w": `${pos.w}px` }}
      >
        <span className="aivy-lib-tabs-ind" aria-hidden="true" />
        {tabs.map((tb) => {
          const Icon = tb.Icon;
          const active = value === tb.id;
          return (
            <button
              key={tb.id}
              ref={(node) => { btnRefs.current[tb.id] = node; }}
              role="tab"
              aria-selected={active}
              className={`aivy-lib-tab ${active ? "active" : ""}`}
              onClick={() => onChange(tb.id)}
            >
              {Icon && <span className="ic"><Icon size={15} /></span>}
              <span className="lb">{tb.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LibraryPage() {
  const { playlists, liked, localTracks, playList, setPlaylistDetail, followedArtists, savedAlbums } = usePlayer();
  const { t, authUser } = useUI();
  const [tab, setTab] = React.useState("all");
  const [likedTracks, setLikedTracks] = React.useState([]);
  const [songLimit, setSongLimit] = React.useState(60);
  const requestedRef = useRef(new Set());
  const aliveRef = useRef(true);

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

  const allSongs = useMemo(
    () => mergeTracks(likedTracks, localTracks, ...playlists.map((pl) => pl.songs)),
    [likedTracks, localTracks, playlists]
  );
  const artists = followedArtists;
  const albums = savedAlbums;

  const likedCover = likedTracks.find((tr) => tr.cover)?.cover || null;
  const libSource = { type: "library", label: t("yourLibrary") };
  const hasAnything = allSongs.length > 0 || playlists.length > 0;

  const tabs = [
    { id: "all", label: "Semua", Icon: LayoutGrid },
    { id: "songs", label: "Lagu", Icon: Music2 },
    { id: "artists", label: t("artistLabel"), Icon: Mic2 },
    { id: "albums", label: t("albumLabel"), Icon: Disc },
    { id: "playlists", label: t("playlistLabel"), Icon: ListMusic },
  ];

  const jumpTiles = [
    { id: "songs", label: "Lagu", count: allSongs.length, unit: t("songsCount"), cover: allSongs.find((tr) => tr.cover)?.cover, Icon: Music2 },
    { id: "artists", label: t("artistLabel"), count: artists.length, unit: "", cover: artists.find((a) => a.image)?.image, Icon: Mic2 },
    { id: "albums", label: t("albumLabel"), count: albums.length, unit: "", cover: albums.find((a) => a.cover)?.cover, Icon: Disc },
    { id: "playlists", label: t("playlistLabel"), count: playlists.length, unit: "", cover: playlists.map((pl) => pl.cover_thumbnail ?? pl.songs?.[0]?.cover).find(Boolean), Icon: ListMusic },
  ];

  const likedBlur = thumbBlur(likedCover);

  const renderAll = () => (
    <>
      <div className="aivy-lib-hero">
        <div className={`aivy-lib-feature ${likedBlur.className}`} style={likedBlur.style}>
          <Link to="liked" className="aivy-lib-feature-link" aria-label={t("navLikedSongs")} />
          <div className="aivy-lib-feature-icon"><Heart size={24} color="var(--ink)" fill="var(--ink)" /></div>
          <div className="aivy-lib-feature-meta">
            <div className="eyebrow">{t("playlistLabel")}</div>
            <h2>{t("navLikedSongs")}</h2>
            <div className="sub">{liked.size} {t("songsCount")}</div>
          </div>
          {likedTracks.length > 0 && (
            <button className="aivy-lib-feature-play" onClick={() => playList(likedTracks, 0, { type: "library", label: t("navLikedSongs") })} aria-label={t("playAll")}>
              <Play size={22} fill="currentColor" />
            </button>
          )}
        </div>
        <div className="aivy-lib-minis">
          {jumpTiles.map(({ id, label, count, unit, cover, Icon }) => {
            const blur = thumbBlur(cover);
            return (
              <button key={id} className={`aivy-lib-mini ${blur.className}`} style={blur.style} onClick={() => setTab(id)}>
                <span className="thumb">
                  {cover ? <SmartCover src={cover} seed={"jump" + id} size={52} radius={8} style={{ width: "100%", height: "100%" }} /> : <Icon size={20} color="var(--ink-faint)" />}
                </span>
                <span className="meta">
                  <div className="name">{label}</div>
                  <div className="count">{count}{unit ? ` ${unit}` : ""}</div>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {artists.length > 0 && (
        <LibSection title={t("artistLabel")} onMore={() => setTab("artists")}>
          <div className="aivy-lib-rail is-artists">
            {artists.slice(0, 14).map((a) => <LibArtistCard key={a.id} artist={a} />)}
          </div>
        </LibSection>
      )}

      {playlists.length > 0 && (
        <LibSection title={t("playlistLabel")} onMore={() => setTab("playlists")}>
          {playlists.length >= 5 ? (
            <div className="aivy-lib-bento">
              {playlists.slice(0, 5).map((pl, i) => <LibPlaylistCard key={pl.id} pl={pl} big={i === 0} />)}
            </div>
          ) : (
            <div className="aivy-lib-rail">
              {playlists.map((pl) => <LibPlaylistCard key={pl.id} pl={pl} />)}
            </div>
          )}
        </LibSection>
      )}

      {albums.length > 0 && (
        <LibSection title={t("albumLabel")} onMore={() => setTab("albums")}>
          <div className="aivy-lib-rail">
            {albums.slice(0, 14).map((al) => <CardAlbum key={al.id} album={al} />)}
          </div>
        </LibSection>
      )}

      {allSongs.length > 0 && (
        <LibSection title="Lagu" onMore={() => setTab("songs")}>
          <div className="aivy-lib-songs">
            {allSongs.slice(0, 10).map((tr, i) => (
              <TrackRow key={tr.id} track={tr} index={i} list={allSongs} showIndex={false} queueMode="context" source={libSource} />
            ))}
          </div>
        </LibSection>
      )}

      {!hasAnything && <p className="eyebrow" style={{ padding: "8px 2px" }}>{t("noPlaylistsYetLong")}</p>}
    </>
  );

  const renderSongs = () => (
    allSongs.length > 0 ? (
      <>
        <div className="aivy-import-actions" style={{ marginBottom: 8 }}>
          <button className="aivy-btn-ghost" onClick={() => playList(allSongs, 0, libSource)}><Play size={15} /> {t("playAll")}</button>
        </div>
        <div>
          {allSongs.slice(0, songLimit).map((tr, i) => (
            <TrackRow key={tr.id} track={tr} index={i} list={allSongs} showAlbum queueMode="context" source={libSource} />
          ))}
        </div>
        {allSongs.length > songLimit && (
          <div className="aivy-lib-more">
            <button className="aivy-btn-ghost" onClick={() => setSongLimit((n) => n + 60)}>Tampilkan lebih banyak</button>
          </div>
        )}
      </>
    ) : (
      <div className="aivy-empty"><Music2 size={34} color="var(--ink-faint)" /><div className="title">Belum ada lagu</div><div className="sub">Suka lagu atau tambahkan ke playlist, nanti muncul di sini.</div></div>
    )
  );

  const renderArtists = () => (
    artists.length > 0 ? (
      <div className="aivy-grid">{artists.map((a) => <LibArtistCard key={a.id} artist={a} />)}</div>
    ) : (
      <div className="aivy-empty"><Mic2 size={34} color="var(--ink-faint)" /><div className="title">Belum ada artist yang diikuti</div><div className="sub">Ikuti artist dari halaman artist, nanti muncul di sini.</div></div>
    )
  );

  const renderAlbums = () => (
    albums.length > 0 ? (
      <div className="aivy-grid">{albums.map((al) => <CardAlbum key={al.id} album={al} />)}</div>
    ) : (
      <div className="aivy-empty"><Disc size={34} color="var(--ink-faint)" /><div className="title">Belum ada album yang disimpan</div><div className="sub">Tekan ikon hati di halaman album untuk menyimpannya ke sini.</div></div>
    )
  );

  const renderPlaylists = () => (
    <>
      <div className="aivy-grid">
        <LibLikedCard count={liked.size} cover={likedCover} />
        {playlists.map((pl) => <LibPlaylistCard key={pl.id} pl={pl} />)}
      </div>
      {playlists.length === 0 && <p className="eyebrow" style={{ padding: "8px 2px" }}>{t("noPlaylistsYetLong")}</p>}
    </>
  );

  return (
    <div className="aivy-view-enter">
      <div className="aivy-greet" style={{ paddingBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 className="font-display" style={{ fontSize: "clamp(22px,3vw,28px)" }}>{t("yourLibrary")}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="libraryLocal" className="aivy-btn-ghost"><FolderSearch size={15} /> Lokal</Link>
          <Link to="libraryImport" className="aivy-btn-ghost"><Youtube size={15} /> Import dari YouTube</Link>
        </div>
      </div>
      <LibTabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "all" && renderAll()}
      {tab === "songs" && renderSongs()}
      {tab === "artists" && renderArtists()}
      {tab === "albums" && renderAlbums()}
      {tab === "playlists" && renderPlaylists()}
    </div>
  );
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
  const pl = playlists.find((p) => String(p.id) === String(params.id));
  const [displaySongs, setDisplaySongs] = React.useState(pl?.songs || []);
  const [localShuffle, setLocalShuffle] = React.useState(false);

  React.useEffect(() => {
    setDisplaySongs(localShuffle ? shuffleArray(pl?.songs || []) : (pl?.songs || []));
  }, [pl?.songs, localShuffle]);

  React.useEffect(() => {
    if (!params.id) return;
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
  const tint = useArtworkTint(cover);
  const { mediaRef, pageRef, heroRef } = useImmersiveHero({ ready: !!pl, tint });

  if (!pl) return <div className="aivy-am-fallback"><ViewNotFound label={t("playlistLabel")} /></div>;
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
            openContextMenu(r.left, r.bottom + 6, [
              ...(hasSongs ? [{ label: t("findInPlaylistBtn"), icon: <Search size={15} />, onSelect: () => setSearchOpen(true) }] : []),
              ...(hasSongs ? [{ label: t("playAfterThisBtn"), icon: <ListPlus size={15} />, onSelect: () => playAllNext(pl.songs) }] : []),
              ...(hasSongs ? [{ label: t("addToQueueBtn"), icon: <ListMusic size={15} />, onSelect: () => addAllToQueueEnd(pl.songs) }] : []),
              ...(hasSongs ? [{ label: t("saveToPlaylistBtn"), icon: <LibraryIcon size={15} />, onSelect: () => openAddToPlaylist(pl.songs) }] : []),
              ...(isOwner ? [{ label: t("changeCoverBtn"), icon: <ImagePlus size={15} />, onSelect: () => setCoverPickerOpen(true) }] : []),
              { label: t("sharePlaylistBtn"), icon: <Share2 size={15} />, onSelect: () => { navigator.clipboard?.writeText(window.location.href); pushToast(t("playlistLinkCopied")); } },
              ...(isOwner ? [{ divider: true }, { label: t("deletePlaylistBtn"), icon: <X size={15} />, onSelect: () => setConfirmDelete(true) }] : []),
            ]);
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

  const handleResolve = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setResolving(true);
    setResolveError(null);
    try {
      const data = await Api.resolveYoutubeImport(trimmed);
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
      const body = { songs: resolved.songs, sourceTitle: resolved.title };
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
            <button className={`aivy-import-tab ${sourceTab === "youtube" ? "active" : ""}`} onClick={() => setSourceTab("youtube")}>
              <Youtube size={20} color="var(--berry-strong)" />
              <span className="name">YouTube</span>
            </button>
            <button className="aivy-import-tab locked" disabled>
              <Music2 size={20} color="var(--ink-faint)" />
              <span className="name">Spotify</span>
              <span className="badge">Coming soon</span>
            </button>
          </div>

          {sourceTab === "youtube" && (
            <>
              <input
                className="aivy-input"
                placeholder="Tempel link playlist YouTube di sini..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) handleResolve(); }}
              />
              {resolveError && <div className="aivy-import-error">{resolveError}</div>}

              <div className="aivy-import-tutorial">
                <div className="head"><ClipboardList size={15} color="var(--accent-strong)" /> Cara salin link playlist YouTube</div>
                <ol>
                  <li>Buka aplikasi atau situs YouTube, lalu buka playlist yang mau diimpor.</li>
                  <li>Ketuk tombol "Bagikan" (ikon panah / titik tiga di atas playlist).</li>
                  <li>Pilih "Salin link", lalu tempel link-nya di kotak di atas.</li>
                </ol>
              </div>

              <div className="aivy-import-actions">
                <button className="aivy-btn-primary" disabled={!url.trim() || resolving} onClick={handleResolve}>
                  {resolving ? <><Loader2 size={15} className="aivy-spin" /> Memuat...</> : <>Lanjutkan <ArrowRight size={15} /></>}
                </button>
              </div>
            </>
          )}
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