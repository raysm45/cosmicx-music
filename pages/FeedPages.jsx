import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Sparkles, Flame, Disc3, Star, RefreshCw } from "lucide-react";
import { Api } from "../lib/api.js";
import { useUI } from "../context.jsx";
import { useRouter } from "../router.jsx";
import { CardAlbum, CardArtist, TrackRow, filterExplicit, HoverRail } from "../components.jsx";

export const FEED_TABS = [
  { route: "home", key: "tabHome", icon: Sparkles },
  { route: "newTrending", key: "tabHotNew", icon: Flame },
  { route: "editorsPicks", key: "tabEditorsPicks", icon: Star, settingKey: "showEditorsPicks" },
  { route: "bestAlbums", key: "tabAoty", icon: Disc3 },
];

export function FeedTabs({ active }) {
  const { navigate } = useRouter();
  const { t, settings } = useUI();
  const tabs = FEED_TABS.filter((tab) => !tab.settingKey || settings[tab.settingKey] !== false);
  return (
    <div className="aivy-home-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.route}
          className={active === tab.route ? "active" : ""}
          onClick={() => navigate(tab.route)}
        >
          {t(tab.key)}
        </button>
      ))}
    </div>
  );
}
function useFeed(fetcher, { limit = 24, deps = [] } = {}) {
  const [items, setItems] = useState(null);
  const [cursor, setCursor] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState({});
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setItems(null); setCursor(0); setDone(false); setMeta({});
    fetcher(0, limit)
      .then((res) => {
        if (!alive) return;
        setItems(res.items || []);
        setCursor(res.nextCursor || limit);
        setMeta({ personalized: res.personalized, basedOn: res.basedOn || [] });
        if (!res.items?.length) setDone(true);
      })
      .catch(() => { if (alive) { setItems([]); setDone(true); } });
    return () => { alive = false; };
  }, [nonce, limit, ...deps]);

  const loadMore = useCallback(async () => {
    if (loading || done || items === null) return;
    setLoading(true);
    try {
      const res = await fetcher(cursor, limit);
      const incoming = res.items || [];
      setItems((prev) => {
        const seen = new Set((prev || []).map((i) => `${i.type}:${i.id}`));
        return [...(prev || []), ...incoming.filter((i) => !seen.has(`${i.type}:${i.id}`))];
      });
      setCursor(res.nextCursor || cursor + limit);
      if (!incoming.length) setDone(true);
    } catch { setDone(true); }
    setLoading(false);
  }, [cursor, done, loading, items, limit]);

  return { items, loadMore, loading, done, meta, refresh: () => setNonce((n) => n + 1) };
}

function FeedHead({ title, subtitle, note, onRefresh }) {
  return (
    <div className="aivy-feed-head">
      <div className="aivy-section-head" style={{ alignItems: "center" }}>
        <h1>{title}</h1>
        {onRefresh && (
          <button className="aivy-icon-btn bare" onClick={onRefresh} aria-label="Refresh" title="Refresh">
            <RefreshCw size={16} />
          </button>
        )}
      </div>
      {subtitle && <p>{subtitle}</p>}
      {note && <div className="aivy-feed-basis">{note}</div>}
    </div>
  );
}

function CardGrid({ items, render, skeleton = 12 }) {
  if (items === null) {
    return (
      <div className="aivy-grid">
        {Array.from({ length: skeleton }).map((_, i) => (
          <div key={i} className="aivy-card" style={{ pointerEvents: "none" }}>
            <div className="art-wrap"><div className="aivy-skeleton" style={{ width: "100%", height: "100%" }} /></div>
            <div className="aivy-skeleton" style={{ height: 12, width: "68%", borderRadius: 6 }} />
            <div className="aivy-skeleton" style={{ height: 10, width: "44%", borderRadius: 6, marginTop: 7 }} />
          </div>
        ))}
      </div>
    );
  }
  if (!items.length) return null;
  return <div className="aivy-grid">{items.map(render)}</div>;
}

function MoreButton({ onClick, loading, done, label }) {
  if (done) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "22px 0 6px" }}>
      <button className="aivy-chip" onClick={onClick} disabled={loading}>{loading ? "…" : label}</button>
    </div>
  );
}
export function NewTrendingPage() {
  const { t, settings } = useUI();
  const feed = useFeed((cursor, limit) => Api.discover("new-" + new Date().toDateString(), cursor, limit, null, "new"), { limit: 30 });

  const tracks = useMemo(
    () => filterExplicit((feed.items || []).filter((i) => i.type === "track"), settings),
    [feed.items, settings]
  );
  const albums = useMemo(() => (feed.items || []).filter((i) => i.type === "album"), [feed.items]);

  return (
    <div className="aivy-view-enter aivy-home">
      <div className="aivy-home-inner">
        <FeedTabs active="newTrending" />
        <FeedHead title={t("tabHotNew")} subtitle={t("feedNewSub")} onRefresh={feed.refresh} />

        {albums.length > 0 && (
          <section className="aivy-section" style={{ marginTop: 0 }}>
            <div className="aivy-section-head"><h2 className="aivy-section-title">{t("feedNewAlbums")}</h2></div>
            <HoverRail>{albums.slice(0, 20).map((a) => <div key={a.id} style={{ width: 168 }}><CardAlbum album={a} /></div>)}</HoverRail>
          </section>
        )}

        <section className="aivy-section">
          <div className="aivy-section-head"><h2 className="aivy-section-title">{t("feedNewSongs")}</h2></div>
          {feed.items === null
            ? <div style={{ opacity: .6, fontSize: 13, padding: "8px 2px" }}>{t("loading")}</div>
            : <div>{tracks.map((tr, i) => <TrackRow key={tr.id} track={tr} index={i} list={tracks} queueMode="context" source={{ type: "feed-new" }} />)}</div>}
        </section>

        <MoreButton onClick={feed.loadMore} loading={feed.loading} done={feed.done} label={t("showMoreLabel")} />
      </div>
    </div>
  );
}
export function BestAlbumsPage() {
  const { t } = useUI();
  const feed = useFeed((cursor, limit) => Api.discover("albums-" + new Date().getFullYear(), cursor, limit, "album", "albums"), { limit: 36 });

  return (
    <div className="aivy-view-enter aivy-home">
      <div className="aivy-home-inner">
        <FeedTabs active="bestAlbums" />
        <FeedHead title={t("tabAoty")} subtitle={t("feedAlbumsSub")} onRefresh={feed.refresh} />
        <CardGrid items={feed.items} skeleton={18} render={(a) => <CardAlbum key={a.id} album={a} />} />
        <MoreButton onClick={feed.loadMore} loading={feed.loading} done={feed.done} label={t("showMoreLabel")} />
      </div>
    </div>
  );
}
export function EditorsPicksPage() {
  const { t, settings } = useUI();
  const { navigate } = useRouter();
  const seedBase = settings.editorsPicksSource === "alt" ? "editors-pick-alt-" : "editors-pick-";
  const feed = useFeed((cursor, limit) => Api.discover(seedBase + new Date().toDateString(), cursor, limit, null, "explore"), { limit: 36 });

  useEffect(() => {
    if (settings.showEditorsPicks === false) navigate("home", { replace: true });
  }, [settings.showEditorsPicks, navigate]);

  const albums = useMemo(() => (feed.items || []).filter((i) => i.type === "album"), [feed.items]);
  const artists = useMemo(() => (feed.items || []).filter((i) => i.type === "artist"), [feed.items]);

  return (
    <div className="aivy-view-enter aivy-home">
      <div className="aivy-home-inner">
        <FeedTabs active="editorsPicks" />
        <FeedHead title={t("tabEditorsPicks")} subtitle={t("feedPicksSub")} onRefresh={feed.refresh} />

        <section className="aivy-section" style={{ marginTop: 0 }}>
          <div className="aivy-section-head"><h2 className="aivy-section-title">{t("recoAlbums")}</h2></div>
          <CardGrid items={feed.items === null ? null : albums} skeleton={12} render={(a) => <CardAlbum key={a.id} album={a} />} />
        </section>

        {artists.length > 0 && (
          <section className="aivy-section">
            <div className="aivy-section-head"><h2 className="aivy-section-title">{t("recoArtists")}</h2></div>
            <HoverRail>{artists.slice(0, 20).map((a) => <div key={a.id} style={{ width: 142 }}><CardArtist artist={a} /></div>)}</HoverRail>
          </section>
        )}

        <MoreButton onClick={feed.loadMore} loading={feed.loading} done={feed.done} label={t("showMoreLabel")} />
      </div>
    </div>
  );
}
export function useForYouRow(limit = 18) {
  const { authUser } = useUI();
  const [state, setState] = useState({ items: null, personalized: false, basedOn: [] });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ items: null, personalized: false, basedOn: [] });
    Api.forYou("for-you-" + nonce, 0, limit)
      .then((res) => { if (alive) setState({ items: res.items || [], personalized: !!res.personalized, basedOn: res.basedOn || [] }); })
      .catch(() => { if (alive) setState({ items: [], personalized: false, basedOn: [] }); });
    return () => { alive = false; };
  }, [authUser, limit, nonce]);
  return { ...state, refresh: () => setNonce((n) => n + 1) };
}