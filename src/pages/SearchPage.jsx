import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, X, Clock, TrendingUp, ArrowLeft, ArrowUpLeft, Mic, Music2, Smile, Globe, ChevronRight } from "lucide-react";
import { Api } from "../lib/api.js";
import { useUI } from "../context.jsx";
import { useRouter } from "../router.jsx";
import { TrackRow, SkeletonList, HoverRail } from "../components.jsx";
import { SmartCover } from "../lib/brand.jsx";
import { usePlayer } from "../context.jsx";
import {
  debounce, isRelevantArtistMatch, cleanTrackTitleForLyrics,
  getRecentSearchThumbs, saveRecentSearchThumb, removeRecentSearchThumb, clearRecentSearchThumbs,
} from "../lib/utils.js";

const GENRE_SHORTCUTS = ["Pop", "Hip-Hop", "R&B", "Indie", "Rock", "Electronic", "Jazz", "Dangdut", "K-Pop", "Reggae", "Klasik", "Akustik"];

export function SearchPage() {
  const { authUser, settings, t } = useUI();
  const { navigate, back } = useRouter();
  const { playRadio } = usePlayer();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState([]);
  const [recentThumbs, setRecentThumbs] = useState(() => getRecentSearchThumbs());
  const [suggestions, setSuggestions] = useState([]);
  const [lyricsMap, setLyricsMap] = useState({});
  const [checkingLyrics, setCheckingLyrics] = useState(false);
  const [artistHit, setArtistHit] = useState(null);
  const [artistHits, setArtistHits] = useState([]);
  const [genresOpen, setGenresOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const tt = useMemo(() => {
    const en = settings.language === "en";
    return (idText, enText) => (en ? enText : idText);
  }, [settings.language]);

  const debouncedSuggest = useRef(debounce((q) => {
    if (!authUser || settings.searchHistoryEnabled === false) return;
    Api.suggestSearches(q).then(setSuggestions).catch(() => {});
  }, 200)).current;

  const requestSeqRef = useRef(0);

  const [liveTitles, setLiveTitles] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const liveSeqRef = useRef(0);

  const liveTitleSearch = async (q) => {
    const trimmed = q.trim();
    if (!trimmed) { setLiveTitles([]); setLiveLoading(false); return; }
    const seq = ++liveSeqRef.current;
    setLiveLoading(true);
    try {
      const res = await Api.search(trimmed);
      if (seq !== liveSeqRef.current) return;
      const needle = trimmed.toLowerCase();
      const seen = new Set();
      const titlesOnly = [];
      for (const r of (res || [])) {
        const title = r.title || "";
        const key = title.toLowerCase();
        if (!title || !key.includes(needle) || seen.has(key)) continue;
        seen.add(key);
        titlesOnly.push({ id: r.videoId || title, title });
        if (titlesOnly.length >= 20) break;
      }
      setLiveTitles(titlesOnly);
    } catch {
      if (seq !== liveSeqRef.current) return;
      setLiveTitles([]);
    } finally {
      if (seq === liveSeqRef.current) setLiveLoading(false);
    }
  };

  const debouncedLiveSearch = useRef(debounce((q) => { liveTitleSearch(q); }, 350)).current;

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => () => { try { recognitionRef.current?.stop(); } catch { } }, []);
  useEffect(() => {
    if (authUser && settings.searchHistoryEnabled !== false) Api.recentSearches(8).then(setRecent).catch(() => {});
  }, [authUser, settings.searchHistoryEnabled]);

  useEffect(() => {
    const initialQ = new URLSearchParams(window.location.search).get("q");
    if (initialQ && initialQ.trim()) {
      setQuery(initialQ);
      doSearch(initialQ);
    }
    const onPop = () => {
      const q = new URLSearchParams(window.location.search).get("q") || "";
      setQuery(q);
      if (q.trim()) doSearch(q); else { setResults([]); setHasSearched(false); setArtistHit(null); setArtistHits([]); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const syncUrlQuery = (q) => {
    const url = new URL(window.location.href);
    if (q && q.trim()) url.searchParams.set("q", q.trim());
    else url.searchParams.delete("q");
    window.history.replaceState({}, "", url.pathname + url.search);
  };

  const doSearch = async (q) => {
    const trimmed = q.trim();
    if (!trimmed) { setResults([]); setHasSearched(false); setSearching(false); setArtistHit(null); setArtistHits([]); setNextCursor(null); return; }
    const seq = ++requestSeqRef.current;
    setSearching(true);
    setHasSearched(true);
    setSearchedQuery(trimmed);
    setArtistHit(null);
    setNextCursor(null);

    Api.artistQuick(trimmed).then((res) => {
      if (seq !== requestSeqRef.current) return;
      setArtistHit(res && isRelevantArtistMatch(res.name, trimmed) ? res : null);
    }).catch(() => {
      if (seq !== requestSeqRef.current) return;
      setArtistHit(null);
    });

    try {
      const res = await Api.search(trimmed);
      if (seq !== requestSeqRef.current)
        return;
      setResults(res || []);
      setNextCursor(res?.nextCursor || null);
      setArtistHits(Array.isArray(res?.artists) ? res.artists : []);
      if (res && res[0] && res[0].videoId) {
        saveRecentSearchThumb(trimmed, res[0]);
        setRecentThumbs(getRecentSearchThumbs());
      }
    } catch {
      if (seq !== requestSeqRef.current) return;
      setResults([]);
      setNextCursor(null);
    } finally {
      if (seq === requestSeqRef.current) setSearching(false);
    }
  };

  const loadMoreResults = async () => {
    if (loadingMore || !nextCursor || searching) return;
    const seq = requestSeqRef.current;
    setLoadingMore(true);
    try {
      const more = await Api.search(searchedQuery, nextCursor);
      if (seq !== requestSeqRef.current) return;
      setResults((prev) => [...prev, ...(more || [])]);
      setNextCursor(more?.nextCursor || null);
    } catch {
      if (seq !== requestSeqRef.current) return;
      setNextCursor(null);
    } finally {
      if (seq === requestSeqRef.current) setLoadingMore(false);
    }
  };

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMoreResults(); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [nextCursor, loadingMore, searching, searchedQuery]);

  const onChangeQuery = (val) => {
    setQuery(val);
    if (!val.trim()) {
      debouncedSuggest.cancel?.(); debouncedLiveSearch.cancel?.();
      setSuggestions([]); setResults([]); setHasSearched(false); setNextCursor(null); setArtistHits([]);
      setLiveTitles([]); setLiveLoading(false);
      return;
    }
    debouncedSuggest(val.trim());
    debouncedLiveSearch(val);
  };

  const runSearch = (q) => {
    setQuery(q);
    setFocused(false);
    setSuggestions([]);
    setLiveTitles([]);
    debouncedLiveSearch.cancel?.();
    syncUrlQuery(q);
    if (authUser && settings.searchHistoryEnabled !== false) {
      Api.recordSearch(q).then(() => Api.recentSearches(8).then(setRecent)).catch(() => {});
    }
    doSearch(q);
  };

  const removeRecent = (q, e) => {
    e.stopPropagation();
    setRecent((r) => r.filter((x) => x.query !== q));
    Api.deleteSearch(q).catch(() => {});
  };

  const removeRecentThumb = (q, e) => {
    e.stopPropagation();
    removeRecentSearchThumb(q);
    setRecentThumbs(getRecentSearchThumbs());
  };

  const playRecentThumb = (thumb) => {
    playRadio(
      { id: thumb.videoId, videoId: thumb.videoId, title: thumb.title, cover: thumb.thumbnail, artist: thumb.artist ? { name: thumb.artist } : null },
      { type: "search" }
    );
  };

  const fillQuery = (q, e) => {
    e?.stopPropagation();
    setQuery(q);
    onChangeQuery(q);
    inputRef.current?.focus();
  };

  const handleVoiceSearch = () => {
    if (listening) { stopVoiceSearch(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = settings.language === "en" ? "en-US" : "id-ID";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onresult = (e) => {
      const heard = e.results?.[0]?.[0]?.transcript;
      if (heard && heard.trim()) runSearch(heard.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    try { rec.start(); } catch { setListening(false); }
  };

  const stopVoiceSearch = () => {
    try { recognitionRef.current?.stop(); } catch { }
    setListening(false);
  };

  const showBrowse = !query.trim() && !hasSearched;
  const allArtists = useMemo(() => {
    const out = [];
    const seenIds = new Set();
    const seenNames = new Set();
    for (const a of [artistHit, ...artistHits].filter(Boolean)) {
      const idKey = String(a.id || "").toLowerCase();
      const nameKey = String(a.name || "").trim().toLowerCase();
      if (!idKey && !nameKey) continue;
      if ((idKey && seenIds.has(idKey)) || (nameKey && seenNames.has(nameKey))) continue;
      if (idKey) seenIds.add(idKey);
      if (nameKey) seenNames.add(nameKey);
      out.push(a);
    }
    return out;
  }, [artistHit, artistHits]);
  const topArtist = allArtists[0] || null;
  const otherArtists = allArtists.slice(1, 12);

  const openArtist = (a) => {
    if (!a) return;
    navigate("artist", { params: { id: a.id || a.name } });
  };

  const list = results.map((r) => (r.videoId ? { id: r.videoId, videoId: r.videoId, title: r.title, cover: r.cover || r.thumbnail, duration: r.duration || null, artist: typeof r.artist === "string" ? { name: r.artist } : (r.artist || null), artists: r.artists || null, album: r.album || null } : r));

  useEffect(() => {
    if (!results.length) { setLyricsMap({}); setCheckingLyrics(false); return; }
    let cancelled = false;
    setLyricsMap({});
    setCheckingLyrics(true);
    const items = results.map((r) => (r.videoId ? { id: r.videoId, title: r.title, artist: typeof r.artist === "string" ? { name: r.artist } : (r.artist || null), artists: r.artists || null, duration: r.duration || null } : r));
    const found = {};
    const CONCURRENCY = 5;
    let cursor = 0;
    const worker = async () => {
      while (!cancelled && cursor < items.length) {
        const item = items[cursor++];
        try {
          const cleanedTitle = cleanTrackTitleForLyrics(item.title, item.artist?.name);
          const res = await Api.lyrics({ title: cleanedTitle, artist: item.artist?.name, duration: item.duration });
          found[item.id] = !!(res?.synced || res?.plain);
        } catch {
          found[item.id] = false;
        }
      }
    };
    Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker)).then(() => {
      if (!cancelled) { setLyricsMap({ ...found }); setCheckingLyrics(false); }
    });
    return () => { cancelled = true; };
  }, [results]);

  const sortedList = useMemo(() => {
    if (checkingLyrics) return list;
    return [...list].sort((a, b) => (lyricsMap[a.id] ? 0 : 1) - (lyricsMap[b.id] ? 0 : 1));
  }, [list, lyricsMap, checkingLyrics]);

  return (
    <div className="aivy-view-enter">
      <div className="aivy-search-head-v2">
        <button className="aivy-icon-btn" onClick={() => back()} aria-label={t("previous")}><ArrowLeft size={18} /></button>

        <div className="aivy-search-box-wrap-v2">
          <div className="aivy-search-box-v2">
            <Search size={16} />
            <input
              ref={inputRef} className="aivy-input" placeholder={t("searchPlaceholder")}
              value={query} onChange={(e) => onChangeQuery(e.target.value)}
              onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
              onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) runSearch(query.trim()); }}
            />
            {query ? (
              <button className="aivy-icon-btn sm" onClick={() => { setQuery(""); setResults([]); setHasSearched(false); setSuggestions([]); setLiveTitles([]); setArtistHits([]); syncUrlQuery(""); }} aria-label={t("clear")}><X size={15} /></button>
            ) : (
              <button className={`aivy-icon-btn sm ${listening ? "active" : ""}`} onClick={handleVoiceSearch} aria-label={listening ? t("stopVoiceSearch") : t("searchWithVoice")}><Mic size={16} /></button>
            )}
          </div>
        </div>
      </div>

      {query.trim() && !hasSearched && (
        <div className="aivy-live-title-list">
          {suggestions.map((s) => (
            <button key={`sg-${s.query}`} className="aivy-live-title-row" onMouseDown={() => runSearch(s.query)}>
              <TrendingUp size={15} color="var(--ink-faint)" />
              <span>{s.query}</span>
            </button>
          ))}
          {liveLoading ? (
            <span className="eyebrow">{t("searching")}</span>
          ) : (
            liveTitles.map((item) => (
              <button key={item.id} className="aivy-live-title-row" onClick={() => runSearch(item.title)}>
                <Search size={15} color="var(--ink-faint)" />
                <span>{item.title}</span>
              </button>
            ))
          )}
        </div>
      )}

      {showBrowse && (
        <>
          {(recent.length > 0 || recentThumbs.length > 0) && (
            <section className="aivy-search-recent-v2">
              <h2 className="aivy-search-subtitle">{t("recentSearches")}</h2>

              {recentThumbs.length > 0 && (
                <div className="aivy-recent-thumbs aivy-scroll">
                  {recentThumbs.map((th) => (
                    <button key={th.query} className="aivy-recent-thumb-card" onClick={() => playRecentThumb(th)} title={th.title}>
                      <span className="rm" onClick={(e) => removeRecentThumb(th.query, e)} aria-label={t("clear")}><X size={12} /></span>
                      <SmartCover src={th.thumbnail} seed={th.videoId + th.title} size={140} radius={10} style={{ width: "100%", aspectRatio: "1 / 1" }} />
                      <span className="cap">{th.title}</span>
                    </button>
                  ))}
                </div>
              )}

              <div>
                {recent.map((r) => (
                  <div key={r.query} className="aivy-recent-row-v2" onClick={() => runSearch(r.query)}>
                    <span className="ic"><Clock size={17} /></span>
                    <span className="txt">{r.query}</span>
                    <button className="fill" onClick={(e) => fillQuery(r.query, e)} aria-label={t("fillSearchBox")}><ArrowUpLeft size={16} /></button>
                  </div>
                ))}
              </div>
              <button className="aivy-search-clearall" onClick={() => { Api.clearSearchHistory().catch(() => {}); setRecent([]); clearRecentSearchThumbs(); setRecentThumbs([]); }}>{t("clearAll")}</button>
            </section>
          )}

          <section className="aivy-search-shortcuts">
            <button className="aivy-shortcut-card" onClick={() => runSearch(tt("rilis baru", "new releases"))}><span className="ic"><Music2 size={18} /></span><span className="lbl">Rilis baru</span></button>
            <button className="aivy-shortcut-card" onClick={() => runSearch(tt("tangga lagu", "top charts"))}><span className="ic"><TrendingUp size={18} /></span><span className="lbl">Tangga lagu</span></button>
            <button className="aivy-shortcut-card" onClick={() => setGenresOpen((v) => !v)}><span className="ic"><Smile size={18} /></span><span className="lbl">Jenis musik &amp; suasana</span></button>
          </section>

          {genresOpen && (
            <section className="aivy-section" style={{ marginTop: 4 }}>
              <div className="aivy-section-head"><h2 className="aivy-section-title">{t("exploreGenre")}</h2></div>
              <div className="aivy-genre-chips">
                {GENRE_SHORTCUTS.map((g) => <button key={g} className="aivy-chip" onClick={() => runSearch(g)}>{g}</button>)}
              </div>
            </section>
          )}
        </>
      )}

      {hasSearched && (
        <div style={{ padding: "4px 2px 12px" }}>
          {searching ? <span className="eyebrow">{t("searching")}</span> : <span className="eyebrow">{results.length} {t("resultsFor")} "{searchedQuery}"</span>}
        </div>
      )}

      {hasSearched && !searching && topArtist && (
        <section className="aivy-section" style={{ marginTop: 0 }}>
          <div className="aivy-section-head"><h2 className="aivy-section-title">{t("artistLabel")}</h2></div>
          <div
            className="aivy-search-artist-top"
            onClick={() => openArtist(topArtist)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") openArtist(topArtist); }}
          >
            <span className="art">
              <SmartCover src={topArtist.image} seed={"artist" + (topArtist.id || topArtist.name)} size={208} radius={999} style={{ width: "100%", height: "100%" }} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="n" style={{ display: "block" }}>{topArtist.name}</span>
              <span className="r" style={{ display: "block" }}>{t("openArtistProfile")}</span>
            </span>
            <ChevronRight className="go" size={22} />
          </div>
        </section>
      )}

      {hasSearched && !searching && otherArtists.length > 0 && (
        <section className="aivy-section">
          <div className="aivy-section-head"><h2 className="aivy-section-title">{t("similarArtists")}</h2></div>
          <HoverRail>
            {otherArtists.map((a) => (
              <div
                key={a.id || a.name}
                className="aivy-artist-hit"
                onClick={() => openArtist(a)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") openArtist(a); }}
              >
                <span className="art">
                  <SmartCover src={a.image} seed={"artist" + (a.id || a.name)} size={116} radius={999} style={{ width: "100%", height: "100%" }} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="n" style={{ display: "block" }}>{a.name}</span>
                  <span className="r" style={{ display: "block" }}>{t("artistLabel")}</span>
                </span>
              </div>
            ))}
          </HoverRail>
        </section>
      )}

      {hasSearched && (
        searching ? <SkeletonList count={8} /> : (
          sortedList.length ? (
            <div>
              {sortedList.map((tr, i) => <TrackRow key={`${tr.id}-${i}`} track={tr} index={i} list={sortedList} queueMode="radio" source={{ type: "search" }} />)}
              {nextCursor && <div ref={sentinelRef} style={{ height: 1 }} />}
              {loadingMore && <SkeletonList count={4} />}
            </div>
          ) : (
            <div className="aivy-empty"><Search size={34} color="var(--ink-faint)" /><div className="title">{t("noResults")}</div><div className="sub">{t("noResultsSub")}</div></div>
          )
        )
      )}

      {listening && (
        <div className="aivy-voice-overlay">
          <div className="aivy-voice-backdrop" onClick={stopVoiceSearch} />
          <div className="aivy-voice-sheet">
            <div className="aivy-voice-handle" />
            <div className="aivy-voice-lang"><Globe size={14} /><span>{settings.language === "en" ? "English (United States)" : "Bahasa Indonesia (Indonesia)"}</span></div>
            <div className="aivy-voice-title">{tt("Dengerin, ya…", "Listening…")}</div>
            <div className="aivy-voice-stage">
              <span className="aivy-voice-ring r1" />
              <span className="aivy-voice-ring r2" />
              <span className="aivy-voice-ring r3" />
              <button className="aivy-voice-mic" onClick={stopVoiceSearch} aria-label={tt("Batalkan", "Cancel")}><Mic size={24} /></button>
            </div>
            <span className="aivy-voice-hint">{tt("Ketuk mic buat berhenti", "Tap the mic to stop")}</span>
          </div>
        </div>
      )}
    </div>
  );
}