import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, X, Clock, TrendingUp, ArrowLeft, ArrowUpLeft, Mic, Music2, Smile, Globe, ChevronLeft, ChevronRight, Play, Check, UserPlus, Disc, Mic2 } from "lucide-react";
import { Api } from "../lib/api.js";
import { useUI, usePlayer } from "../context.jsx";
import { useRouter } from "../router.jsx";
import { TrackRow, HoverRail, SkeletonList, CardAlbum, CardArtist, filterExplicit } from "../components.jsx";
import { SmartCover } from "../lib/brand.jsx";
import { loadArtistProfile, peekArtistProfile } from "../lib/artistProfile.js";
import { useAnimatedList } from "../lib/useAnimatedList.js";
import {
  debounce, isRelevantArtistMatch, cleanTrackTitleForLyrics,
  getRecentSearchThumbs, saveRecentSearchThumb, removeRecentSearchThumb, clearRecentSearchThumbs,
} from "../lib/utils.js";

const GENRE_SHORTCUTS = ["Pop", "Hip-Hop", "R&B", "Indie", "Rock", "Electronic", "Jazz", "Dangdut", "K-Pop", "Reggae", "Klasik", "Akustik"];

function appleWide(url, w = 1080) {
  if (!url || typeof url !== "string") return url;
  const h = w;
  if (/\{w\}x\{h\}/.test(url)) {
    return url.replace(/\{w\}x\{h\}(?:\{c\})?\.\{f\}/, `${w}x${h}sr.webp`).replace(/\{w\}x\{h\}/, `${w}x${h}`);
  }
  const m = url.match(/^(https?:\/\/[^?#]*mzstatic\.com\/image\/thumb\/.+\/)\d+x\d+[a-z]*\.(?:jpg|jpeg|png|webp)((?:[?#].*)?)$/i);
  if (!m) return url;
  return `${m[1]}${w}x${h}sr.webp${m[2] || ""}`;
}

function formatListenersCount(n, en = false) {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num >= 1_000_000) {
    const val = (num / 1_000_000).toFixed(1).replace(/\.0$/, "");
    return en ? `${val}M monthly listeners` : `${val.replace(".", ",")} jt pendengar bulanan`;
  }
  if (num >= 1_000) {
    const val = Math.round(num / 1_000);
    return en ? `${val}K monthly listeners` : `${val} rb pendengar bulanan`;
  }
  return en ? `${num} monthly listeners` : `${num} pendengar bulanan`;
}

function mergeAlbums(...lists) {
  const out = [];
  const seenIds = new Set();
  const seenKeys = new Set();
  for (const list of lists) {
    for (const raw of list || []) {
      if (!raw || (!raw.id && !raw.title)) continue;
      const idKey = raw.id ? String(raw.id).trim().toLowerCase() : "";
      const artistName = typeof raw.artist === "string"
        ? raw.artist
        : (raw.artist?.name || raw.artistLine || "");
      const titleKey = `${String(raw.title || "").trim().toLowerCase()}|${String(artistName).trim().toLowerCase()}`;
      if ((idKey && seenIds.has(idKey)) || (raw.title && seenKeys.has(titleKey))) continue;
      if (idKey) seenIds.add(idKey);
      if (raw.title) seenKeys.add(titleKey);
      out.push({
        ...raw,
        id: raw.id || titleKey,
        title: raw.title || "Album",
        artist: typeof raw.artist === "string" ? { name: raw.artist } : (raw.artist || (artistName ? { name: artistName } : null)),
        artistLine: raw.artistLine || artistName || "",
        cover: raw.cover || raw.thumbnail || null,
        releaseDate: raw.releaseDate || raw.year || null,
        explicit: !!raw.explicit,
      });
    }
  }
  return out;
}

function renderLiveText(text, needle) {
  const i = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (i < 0) return text;
  const end = i + needle.length;
  return (
    <>
      {i > 0 && <b>{text.slice(0, i)}</b>}
      <span className="typed">{text.slice(i, end)}</span>
      {end < text.length && <b>{text.slice(end)}</b>}
    </>
  );
}

const EMPTY_LIVE = { q: "", suggestions: [], titles: [] };

export function SearchPage() {
  const { authUser, settings, t } = useUI();
  const { navigate, back } = useRouter();
  const { playRadio, playList, followedArtistIds, toggleFollowArtist } = usePlayer();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState([]);
  const [recentThumbs, setRecentThumbs] = useState(() => getRecentSearchThumbs());
  const [suggestions, setSuggestions] = useState([]);
  const [lyricsMap, setLyricsMap] = useState({});
  const [checkingLyrics, setCheckingLyrics] = useState(false);
  const [artistHit, setArtistHit] = useState(null);
  const [artistHits, setArtistHits] = useState([]);
  const [albumHits, setAlbumHits] = useState([]);
  const [topResult, setTopResult] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [topArtistDetail, setTopArtistDetail] = useState(null);
  const [topArtistHero, setTopArtistHero] = useState(null);
  const [artistProfiles, setArtistProfiles] = useState({});
  const [genresOpen, setGenresOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const en = settings.language === "en";
  const tt = useMemo(() => {
    return (idText, enText) => (en ? enText : idText);
  }, [en]);

  const debouncedSuggest = useRef(debounce((q) => {
    if (!authUser || settings.searchHistoryEnabled === false) return;
    Api.suggestSearches(q).then(setSuggestions).catch(() => {});
  }, 60)).current;

  const requestSeqRef = useRef(0);

  const [liveData, setLiveData] = useState(EMPTY_LIVE);
  const liveSeqRef = useRef(0);
  const liveAbortRef = useRef(null);
  const liveCacheRef = useRef(new Map());
  const resultCacheRef = useRef(new Map());

  const rememberLive = (key, data) => {
    const cache = liveCacheRef.current;
    if (cache.size >= 80) cache.delete(cache.keys().next().value);
    cache.set(key, data);
  };

  const stopLive = () => {
    debouncedLiveSearch.cancel?.();
    liveAbortRef.current?.abort();
    liveSeqRef.current++;
  };

  const liveSearch = async (q) => {
    const trimmed = q.trim();
    if (!trimmed) { setLiveData(EMPTY_LIVE); return; }
    const key = trimmed.toLowerCase();
    const hit = liveCacheRef.current.get(key);
    if (hit) { setLiveData({ q: key, ...hit }); return; }

    liveAbortRef.current?.abort();
    const ctrl = new AbortController();
    liveAbortRef.current = ctrl;
    const seq = ++liveSeqRef.current;
    try {
      const data = await Api.suggestLive(trimmed, ctrl.signal);
      if (seq !== liveSeqRef.current) return;
      if (data.suggestions.length || data.titles.length) rememberLive(key, data);
      setLiveData({ q: key, ...data });
    } catch (err) {
      if (err?.name === "AbortError" || seq !== liveSeqRef.current) return;
      setLiveData({ q: key, suggestions: [], titles: [] });
    }
  };

  const prefetchResults = (q) => {
    const key = q.trim().toLowerCase();
    if (!key || resultCacheRef.current.has(key)) return;
    const entry = { results: null, artist: null, albums: null, promise: null };
    resultCacheRef.current.set(key, entry);
    if (resultCacheRef.current.size > 30) resultCacheRef.current.delete(resultCacheRef.current.keys().next().value);
    entry.promise = Promise.all([
      Api.search(q.trim()).catch(() => null),
      Api.artistQuick(q.trim()).catch(() => null),
      Api.albumSearch(q.trim()).catch(() => []),
    ]).then(([res, artist, albums]) => {
      if (!res && (!albums || !albums.length) && !artist) {
        resultCacheRef.current.delete(key);
        return;
      }
      entry.results = res || [];
      entry.artist = artist;
      entry.albums = Array.isArray(albums) ? albums : [];
    });
  };

  const debouncedLiveSearch = useRef(debounce((q) => { liveSearch(q); }, 60)).current;
  const debouncedPrefetch = useRef(debounce((q) => { prefetchResults(q); }, 350)).current;

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => () => { try { recognitionRef.current?.stop(); } catch { } }, []);
  useEffect(() => () => { liveAbortRef.current?.abort(); }, []);
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
      if (q.trim()) doSearch(q);
      else {
        setResults([]); setHasSearched(false); setSearching(false);
        setArtistHit(null); setArtistHits([]); setAlbumHits([]); setTopResult(null);
      }
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

  const applyResults = (trimmed, res, artist, extraAlbums = []) => {
    setSearching(false);
    const top = res?.top || null;
    setTopResult(top);
    const matchedQuickArtist = artist && isRelevantArtistMatch(artist.name, trimmed) ? artist : null;
    const topArtistCandidate = top?.kind === "artist" ? top : null;
    setArtistHit(matchedQuickArtist || topArtistCandidate || null);
    setResults(res || []);
    setNextCursor(res?.nextCursor || null);
    setArtistHits(Array.isArray(res?.artists) ? res.artists : []);
    const mergedAlbums = mergeAlbums(
      top?.kind === "album" ? [top] : [],
      Array.isArray(res?.albums) ? res.albums : [],
      extraAlbums
    );
    setAlbumHits(mergedAlbums);
    const hasAny = (res && res.length > 0) || mergedAlbums.length > 0 || !!(matchedQuickArtist || topArtistCandidate) || (Array.isArray(res?.artists) && res.artists.length > 0);
    setNoResults(!hasAny);
    if (res && res[0] && res[0].videoId) {
      saveRecentSearchThumb(trimmed, res[0]);
      setRecentThumbs(getRecentSearchThumbs());
    }
  };

  const doSearch = async (q) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]); setHasSearched(false); setSearching(false);
      setArtistHit(null); setArtistHits([]); setAlbumHits([]); setTopResult(null); setNextCursor(null);
      return;
    }
    const seq = ++requestSeqRef.current;
    setHasSearched(true);
    setNoResults(false);
    setSearchedQuery(trimmed);

    const key = trimmed.toLowerCase();
    let entry = resultCacheRef.current.get(key);
    if (!entry) { prefetchResults(trimmed); entry = resultCacheRef.current.get(key); }

    if (entry?.results) { applyResults(trimmed, entry.results, entry.artist, entry.albums); return; }
    setResults([]);
    setArtistHit(null);
    setArtistHits([]);
    setAlbumHits([]);
    setTopResult(null);
    setNextCursor(null);
    setSearching(true);

    try {
      await entry?.promise;
      if (seq !== requestSeqRef.current) return;
      if (entry?.results || entry?.albums?.length || entry?.artist) {
        applyResults(trimmed, entry.results || [], entry.artist, entry.albums || []);
        return;
      }
      setSearching(false);
      setResults([]);
      setNoResults(true);
      setNextCursor(null);
    } catch {
      if (seq !== requestSeqRef.current) return;
      setSearching(false);
      setResults([]);
      setNoResults(true);
      setNextCursor(null);
    }
  };

  const loadMoreResults = async () => {
    if (loadingMore || !nextCursor) return;
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
    if (activeTab !== "all" && activeTab !== "songs") return undefined;
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMoreResults(); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [nextCursor, loadingMore, searchedQuery, activeTab]);

  const onChangeQuery = (val) => {
    setQuery(val);
    const trimmed = val.trim();
    if (!trimmed) {
      debouncedSuggest.cancel?.();
      debouncedPrefetch.cancel?.();
      stopLive();
      setSuggestions([]); setResults([]); setHasSearched(false); setSearching(false);
      setNextCursor(null); setArtistHit(null); setArtistHits([]); setAlbumHits([]); setTopResult(null);
      setLiveData(EMPTY_LIVE);
      return;
    }
    debouncedSuggest(trimmed);
    debouncedPrefetch(trimmed);
    const hit = liveCacheRef.current.get(trimmed.toLowerCase());
    if (hit) {
      stopLive();
      setLiveData({ q: trimmed.toLowerCase(), ...hit });
    } else {
      debouncedLiveSearch(val);
    }
  };

  const runSearch = (q) => {
    setQuery(q);
    setFocused(false);
    setSuggestions([]);
    debouncedSuggest.cancel?.();
    debouncedPrefetch.cancel?.();
    stopLive();
    setLiveData(EMPTY_LIVE);
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

  const liveNeedle = query.trim().toLowerCase();
  const liveItems = useMemo(() => {
    if (!liveNeedle) return [];
    const out = [];
    const seen = new Set();
    const push = (text, kind) => {
      const clean = String(text || "").replace(/\s+/g, " ").trim();
      const key = clean.toLowerCase();
      if (!clean || seen.has(key) || !key.includes(liveNeedle)) return;
      seen.add(key);
      out.push({ id: key, text: clean, kind });
    };
    for (const sg of suggestions) push(sg.query, "history");
    let src = liveData;
    if (liveData.q !== liveNeedle) {
      for (let n = liveNeedle.length - 1; n >= 1; n--) {
        const pre = liveCacheRef.current.get(liveNeedle.slice(0, n));
        if (pre) { src = pre; break; }
      }
    }
    for (const sg of src.suggestions) push(sg, "suggest");
    for (const ti of src.titles) push(ti.title, "title");
    return out.slice(0, 12);
  }, [liveNeedle, suggestions, liveData]);

  const liveRowsRef = useRef([]);
  const liveRows = useMemo(() => {
    let next = liveItems;
    if (!next.length && liveNeedle && liveData.q === liveNeedle) {
      next = [{ id: "__enter__", text: query.trim(), kind: "enter" }];
    }
    const prev = liveRowsRef.current;
    const same = prev.length === next.length && prev.every((p, k) => p.id === next[k].id && p.text === next[k].text && p.kind === next[k].kind);
    if (same) return prev;
    liveRowsRef.current = next;
    return next;
  }, [liveItems, liveNeedle, liveData.q, query]);

  const { containerRef: liveBoxRef, rendered: liveRendered } = useAnimatedList(liveRows, { exitMs: 120, moveMs: 220, enterMs: 180, stagger: 14 });

  const allArtists = useMemo(() => {
    const out = [];
    const seenIds = new Set();
    const seenNames = new Set();
    const candidates = [
      artistHit,
      topResult?.kind === "artist" ? topResult : null,
      ...artistHits,
    ];
    // Also extract artists from song results if artistHits is sparse
    for (const r of results.slice(0, 12)) {
      const aObj = r?.artist && typeof r.artist === "object" ? r.artist : (r?.artist ? { name: r.artist } : null);
      if (aObj?.name && isRelevantArtistMatch(aObj.name, searchedQuery)) {
        candidates.push(aObj);
      }
      if (Array.isArray(r?.artists)) {
        for (const ar of r.artists) {
          if (ar?.name && isRelevantArtistMatch(ar.name, searchedQuery)) candidates.push(ar);
        }
      }
    }
    for (const a of candidates.filter(Boolean)) {
      const idKey = String(a.id || "").toLowerCase();
      const nameKey = String(a.name || "").trim().toLowerCase();
      if (!idKey && !nameKey) continue;
      if ((idKey && seenIds.has(idKey)) || (nameKey && seenNames.has(nameKey))) continue;
      if (idKey) seenIds.add(idKey);
      if (nameKey) seenNames.add(nameKey);
      const cached = artistProfiles[idKey || nameKey] || peekArtistProfile(a) || null;
      out.push({
        ...a,
        id: a.id || cached?.id || a.name,
        image: a.image || a.avatar || cached?.avatar || cached?.image || null,
        banner: a.banner || cached?.banner || null,
        audience: a.audience || cached?.audience || (cached?.listeners ? formatListenersCount(cached.listeners, en) : null),
      });
    }
    return out;
  }, [artistHit, topResult, artistHits, results, searchedQuery, artistProfiles, en]);

  const topArtist = allArtists[0] || null;
  const otherArtists = allArtists.slice(1, 16);

  // Enrich topArtist with full artist profile + Apple Music editorial artwork
  useEffect(() => {
    if (!topArtist) {
      setTopArtistDetail(null);
      setTopArtistHero(null);
      return undefined;
    }
    let cancelled = false;
    setTopArtistDetail(null);
    setTopArtistHero(null);
    const idOrName = topArtist.id || topArtist.name;
    Api.artist(idOrName)
      .then((detail) => {
        if (cancelled || !detail) return;
        setTopArtistDetail(detail);
        if (Array.isArray(detail.albums) && detail.albums.length > 0 && isRelevantArtistMatch(detail.name || topArtist.name, searchedQuery)) {
          setAlbumHits((prev) => mergeAlbums(prev, detail.albums));
        }
      })
      .catch(() => {});
    if (topArtist.name) {
      Api.appleMusicHero(topArtist.name)
        .then((hero) => {
          if (!cancelled && hero) setTopArtistHero(hero);
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [topArtist?.id, topArtist?.name, searchedQuery]);

  // Enrich all artists with profile avatars & audience in the background
  useEffect(() => {
    if (!allArtists.length) return undefined;
    let cancelled = false;
    allArtists.slice(0, 12).forEach((a) => {
      const k = String(a.id || a.name || "").toLowerCase();
      if (!k || (a.image && a.audience)) return;
      loadArtistProfile(a).then((prof) => {
        if (cancelled || !prof) return;
        setArtistProfiles((prev) => (prev[k] ? prev : { ...prev, [k]: prof }));
      });
    });
    return () => { cancelled = true; };
  }, [allArtists.length, searchedQuery]);

  const openArtist = (a) => {
    if (!a) return;
    navigate("artist", { params: { id: a.id || a.name } });
  };

  const list = useMemo(() => {
    const mapped = results.map((r) => (r.videoId ? {
      id: r.videoId,
      videoId: r.videoId,
      title: r.title,
      cover: r.cover || r.thumbnail,
      duration: r.duration || null,
      artist: typeof r.artist === "string" ? { name: r.artist } : (r.artist || null),
      artists: r.artists || null,
      album: r.album || null,
      explicit: !!r.explicit,
    } : r));
    return filterExplicit(mapped, settings);
  }, [results, settings]);

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

  const visibleAlbums = useMemo(() => {
    if (settings.explicitContent === false) return albumHits.filter((a) => !a.explicit);
    return albumHits;
  }, [albumHits, settings.explicitContent]);

  const heroArtist = useMemo(() => {
    if (!topArtist) return null;
    const d = topArtistDetail;
    const avatar = d?.avatar || d?.image || topArtist.image || topArtistHero?.static || null;
    const artworkBanner = appleWide(
      topArtistHero?.editorialStatic || d?.banner || topArtist.banner || topArtistHero?.static || avatar,
      1080
    );
    const audience = d?.audience || topArtist.audience || (d?.listeners ? formatListenersCount(d.listeners, en) : null);
    const bio = d?.bio
      ? String(d.bio).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
      : null;
    const tags = Array.isArray(d?.tags) ? d.tags.filter(Boolean).slice(0, 4) : [];
    const topTracks = filterExplicit(Array.isArray(d?.topTracks) ? d.topTracks : [], settings);
    return {
      ...topArtist,
      id: d?.id || topArtist.id || topArtist.name,
      name: d?.name || topArtist.name,
      image: avatar,
      banner: artworkBanner,
      audience,
      bio,
      tags,
      topTracks,
    };
  }, [topArtist, topArtistDetail, topArtistHero, en, settings]);

  const handlePlayArtist = (e, artistObj) => {
    e?.stopPropagation();
    const tracks = artistObj?.topTracks?.length
      ? artistObj.topTracks
      : sortedList.filter((tr) => isRelevantArtistMatch(tr.artist?.name || "", artistObj?.name || ""));
    if (tracks.length) {
      playList(tracks, 0);
    } else if (sortedList.length) {
      playList(sortedList, 0);
    }
  };

  const renderArtistHeroCard = () => {
    if (!heroArtist) return null;
    const isFollowing = !!heroArtist.id && followedArtistIds.has(String(heroArtist.id));
    return (
      <section className="aivy-section" style={{ marginTop: 0 }}>
        <div className="aivy-section-head">
          <h2 className="aivy-section-title">{tt("Profil & Artwork Artis", "Artist Profile & Artwork")}</h2>
        </div>
        <div
          className="aivy-search-artist-hero"
          onClick={() => openArtist(heroArtist)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") openArtist(heroArtist); }}
        >
          {heroArtist.banner && (
            <div
              className="aivy-search-artist-hero-bg"
              style={{ backgroundImage: `url(${JSON.stringify(heroArtist.banner)})` }}
            />
          )}
          <div className="aivy-search-artist-hero-scrim" />
          <div className="aivy-search-artist-hero-body">
            <div className="aivy-search-artist-hero-avatar">
              <SmartCover
                src={heroArtist.image}
                seed={"artist" + (heroArtist.id || heroArtist.name)}
                size={220}
                radius={999}
                style={{ width: "100%", height: "100%", borderRadius: "50%" }}
              />
            </div>
            <div className="aivy-search-artist-hero-info">
              <div className="aivy-search-artist-hero-kicker">
                <Mic2 size={12} />
                <span>{t("artistLabel")}</span>
              </div>
              <div className="aivy-search-artist-hero-name">{heroArtist.name}</div>
              {heroArtist.audience && (
                <div className="aivy-search-artist-hero-audience">{heroArtist.audience}</div>
              )}
              {heroArtist.tags?.length > 0 && (
                <div className="aivy-search-artist-hero-tags">
                  {heroArtist.tags.map((tag) => (
                    <span key={tag} className="aivy-search-artist-tag">{tag}</span>
                  ))}
                </div>
              )}
              {heroArtist.bio && (
                <p className="aivy-search-artist-hero-bio">{heroArtist.bio}</p>
              )}
              <div className="aivy-search-artist-hero-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="aivy-search-artist-btn primary"
                  onClick={(e) => handlePlayArtist(e, heroArtist)}
                >
                  <Play size={15} fill="currentColor" />
                  <span>{t("play")}</span>
                </button>
                <button
                  type="button"
                  className={`aivy-search-artist-btn ${isFollowing ? "active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFollowArtist({ id: heroArtist.id, name: heroArtist.name, image: heroArtist.image });
                  }}
                >
                  {isFollowing ? <Check size={15} /> : <UserPlus size={15} />}
                  <span>{isFollowing ? t("following") : t("follow")}</span>
                </button>
                <button
                  type="button"
                  className="aivy-search-artist-btn ghost"
                  onClick={(e) => { e.stopPropagation(); openArtist(heroArtist); }}
                >
                  <span>{t("openArtistProfile")}</span>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="aivy-view-enter">
      <div className="aivy-search-head-v2 sp-search-head">
        <div className="sp-search-nav">
          <button className="aivy-navbtn" onClick={() => back()} aria-label={t("previous")}><ChevronLeft size={16} /></button>
          <button className="aivy-navbtn" onClick={() => window.history.forward()} aria-label={t("next")}><ChevronRight size={16} /></button>
        </div>

        <div className="aivy-search-box-wrap-v2">
          <div className={`aivy-search-box-v2 sp-searchbox ${searching ? "is-loading" : ""}`}>
            <button type="button" className="sp-search-back" onClick={() => back()} aria-label={t("previous")}><ArrowLeft size={20} /></button>
            <Search size={18} className="sp-search-ico" />
            <input
              ref={inputRef} className="aivy-input" placeholder={t("searchPlaceholder")}
              value={query} onChange={(e) => onChangeQuery(e.target.value)}
              onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
              onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) runSearch(query.trim()); }}
            />
            {query ? (
              <button className="aivy-icon-btn sm" onClick={() => { onChangeQuery(""); syncUrlQuery(""); inputRef.current?.focus(); }} aria-label={t("clear")}><X size={15} /></button>
            ) : (
              <button className={`aivy-icon-btn sm ${listening ? "active" : ""}`} onClick={handleVoiceSearch} aria-label={listening ? t("stopVoiceSearch") : t("searchWithVoice")}><Mic size={16} /></button>
            )}
          </div>
        </div>
      </div>

      {hasSearched && !searching && (
        <div className="aivy-search-tabs" role="tablist" aria-label={tt("Filter pencarian", "Search filters")}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all"}
            className={`aivy-search-tab ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            {tt("Semua", "All")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "songs"}
            className={`aivy-search-tab ${activeTab === "songs" ? "active" : ""}`}
            onClick={() => setActiveTab("songs")}
          >
            <Music2 size={14} />
            <span>{tt("Lagu", "Songs")}</span>
            {sortedList.length > 0 && <span className="cnt">{sortedList.length}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "albums"}
            className={`aivy-search-tab ${activeTab === "albums" ? "active" : ""}`}
            onClick={() => setActiveTab("albums")}
          >
            <Disc size={14} />
            <span>{tt("Album", "Albums")}</span>
            {visibleAlbums.length > 0 && <span className="cnt">{visibleAlbums.length}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "artists"}
            className={`aivy-search-tab ${activeTab === "artists" ? "active" : ""}`}
            onClick={() => setActiveTab("artists")}
          >
            <Mic2 size={14} />
            <span>{t("artistLabel")}</span>
            {allArtists.length > 0 && <span className="cnt">{allArtists.length}</span>}
          </button>
        </div>
      )}

      {query.trim() && !hasSearched && (
        <div className="aivy-live-title-list" role="listbox" aria-label={t("searchPlaceholder")}>
          <div className="aivy-live-rows" ref={liveBoxRef}>
            {liveRendered.map((e) => {
              const it = e.item;
              const Icon = it.kind === "history" ? Clock : it.kind === "title" ? Music2 : Search;
              const style = e.leaving && e.rect ? { top: e.rect.top, left: e.rect.left, width: e.rect.width } : undefined;
              return (
                <button
                  key={e.key}
                  type="button"
                  role="option"
                  data-key={e.key}
                  data-leaving={e.leaving ? "true" : undefined}
                  className={`aivy-live-title-row${e.leaving ? " is-leaving" : ""}`}
                  style={style}
                  tabIndex={e.leaving ? -1 : 0}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => runSearch(it.text)}
                >
                  <Icon size={15} color="var(--ink-faint)" />
                  <span className="txt">
                    {it.kind === "enter" ? `${tt("Cari", "Search for")} “${it.text}”` : renderLiveText(it.text, liveNeedle)}
                  </span>
                </button>
              );
            })}
          </div>
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

      {hasSearched && searching && (
        <div aria-busy="true" aria-live="polite">
          <section className="aivy-section" style={{ marginTop: 0 }}>
            <div className="aivy-skeleton" style={{ width: 90, height: 16, borderRadius: 6, marginBottom: 14 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="aivy-skeleton" style={{ width: 84, height: 84, borderRadius: "50%", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="aivy-skel-line aivy-skeleton" style={{ height: 18, width: "40%", marginBottom: 10 }} />
                <div className="aivy-skel-line w35 aivy-skeleton" style={{ height: 12 }} />
              </div>
            </div>
          </section>
          <SkeletonList count={8} />
        </div>
      )}

      {hasSearched && !searching && activeTab === "all" && (
        <>
          {renderArtistHeroCard()}

          {visibleAlbums.length > 0 && (
            <section className="aivy-section">
              <div className="aivy-section-head">
                <h2 className="aivy-section-title">{tt("Album", "Albums")}</h2>
                {visibleAlbums.length > 4 && (
                  <button type="button" className="aivy-lib-section-link" onClick={() => setActiveTab("albums")}>
                    {tt("Lihat semua", "See all")}
                  </button>
                )}
              </div>
              <HoverRail>
                {visibleAlbums.slice(0, 12).map((alb) => (
                  <CardAlbum key={alb.id || alb.title} album={alb} />
                ))}
              </HoverRail>
            </section>
          )}

          {otherArtists.length > 0 && (
            <section className="aivy-section">
              <div className="aivy-section-head">
                <h2 className="aivy-section-title">{t("similarArtists")}</h2>
                {allArtists.length > 3 && (
                  <button type="button" className="aivy-lib-section-link" onClick={() => setActiveTab("artists")}>
                    {tt("Lihat semua", "See all")}
                  </button>
                )}
              </div>
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
                      <span className="r" style={{ display: "block" }}>{a.audience || t("artistLabel")}</span>
                    </span>
                  </div>
                ))}
              </HoverRail>
            </section>
          )}

          {sortedList.length > 0 && (
            <section className="aivy-section">
              <div className="aivy-section-head">
                <h2 className="aivy-section-title">{tt("Lagu", "Songs")}</h2>
                {sortedList.length > 6 && (
                  <button type="button" className="aivy-lib-section-link" onClick={() => setActiveTab("songs")}>
                    {tt("Lihat semua", "See all")}
                  </button>
                )}
              </div>
              <div>
                {sortedList.map((tr, i) => (
                  <TrackRow key={`${tr.id}-${i}`} track={tr} index={i} list={sortedList} queueMode="radio" source={{ type: "search" }} />
                ))}
                {nextCursor && <div ref={sentinelRef} style={{ height: 1 }} />}
              </div>
            </section>
          )}
        </>
      )}

      {hasSearched && !searching && activeTab === "songs" && (
        sortedList.length > 0 ? (
          <div>
            {sortedList.map((tr, i) => (
              <TrackRow key={`${tr.id}-${i}`} track={tr} index={i} list={sortedList} queueMode="radio" source={{ type: "search" }} />
            ))}
            {nextCursor && <div ref={sentinelRef} style={{ height: 1 }} />}
          </div>
        ) : (
          <div className="aivy-empty"><Music2 size={34} color="var(--ink-faint)" /><div className="title">{t("noResults")}</div><div className="sub">{t("noResultsSub")}</div></div>
        )
      )}

      {hasSearched && !searching && activeTab === "albums" && (
        visibleAlbums.length > 0 ? (
          <section className="aivy-section" style={{ marginTop: 0 }}>
            <div className="aivy-grid">
              {visibleAlbums.map((alb) => (
                <CardAlbum key={alb.id || alb.title} album={alb} />
              ))}
            </div>
          </section>
        ) : (
          <div className="aivy-empty"><Disc size={34} color="var(--ink-faint)" /><div className="title">{tt("Tidak ada album ditemukan", "No albums found")}</div><div className="sub">{t("noResultsSub")}</div></div>
        )
      )}

      {hasSearched && !searching && activeTab === "artists" && (
        allArtists.length > 0 ? (
          <>
            {renderArtistHeroCard()}
            <section className="aivy-section">
              <div className="aivy-section-head">
                <h2 className="aivy-section-title">{tt("Semua Artis", "All Artists")}</h2>
              </div>
              <div className="aivy-grid">
                {allArtists.map((a) => (
                  <CardArtist key={a.id || a.name} artist={a} />
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="aivy-empty"><Mic2 size={34} color="var(--ink-faint)" /><div className="title">{tt("Tidak ada artis ditemukan", "No artists found")}</div><div className="sub">{t("noResultsSub")}</div></div>
        )
      )}

      {hasSearched && !searching && noResults && sortedList.length === 0 && visibleAlbums.length === 0 && allArtists.length === 0 && (
        <div className="aivy-empty"><Search size={34} color="var(--ink-faint)" /><div className="title">{t("noResults")}</div><div className="sub">{t("noResultsSub")}</div></div>
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