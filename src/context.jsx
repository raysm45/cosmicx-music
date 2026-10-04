import React, { useSyncExternalStore,
  createContext, useContext, useState, useEffect, useRef, useMemo, useCallback,
} from "react";
import { io } from "socket.io-client";
import { Api, SOCKET_ORIGIN, SOCKET_PATH, getAuthToken } from "./lib/api.js";
import { setPreferredAudioFormat, getPreferredAudioFormat } from "./lib/audioFormat.js";
import { clamp, uid, debounce, pickBestAudioMatch, trackArtists } from "./lib/utils.js";
import { makeT } from "./lib/i18n.js";
import { seoState } from "./lib/seo.js";
import { trackArtistsReady, loadTrackArtists } from "./lib/artistProfile.js";
import { useDiscordPresence } from "./lib/discordPresence.js";
import { applyLiquidGlass, isLowEndDevice } from "./lib/perf.js";

export const EQ_BANDS_HZ = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [7, 6, 5, 3, 1, 0, 0, 0, 0, 0],
  treble: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
  vocal: [-2, -2, -1, 2, 4, 4, 2, 0, -1, -2],
  electronic: [5, 4, 0, -2, -3, 0, 2, 3, 4, 5],
};
const DEFAULT_EQ = { enabled: false, preset: "flat", preamp: 0, bands: [...EQ_PRESETS.flat] };

export const FONT_STACKS = {
  default: null,
  inter: "'Inter', -apple-system, sans-serif",
  applemusic: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  plexmono: "'IBM Plex Mono', ui-monospace, monospace",
  roboto: "'Roboto', -apple-system, sans-serif",
  opensans: "'Open Sans', -apple-system, sans-serif",
  lato: "'Lato', -apple-system, sans-serif",
  montserrat: "'Montserrat', -apple-system, sans-serif",
  poppins: "'Poppins', -apple-system, sans-serif",
  systemui: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};
const GOOGLE_FONT_QUERY = {
  inter: "Inter:wght@400;500;600;700;800",
  plexmono: "IBM+Plex+Mono:wght@400;500;600",
  roboto: "Roboto:wght@400;500;700",
  opensans: "Open+Sans:wght@400;500;600;700",
  lato: "Lato:wght@400;500;700",
  montserrat: "Montserrat:wght@400;500;600;700",
  poppins: "Poppins:wght@400;500;600;700",
};
const playbackTimeStore = { value: 0, subs: new Set() };
function setPlaybackTime(v) {
  const next = typeof v === "number" && isFinite(v) ? v : 0;
  if (playbackTimeStore.value === next) return;
  playbackTimeStore.value = next;
  playbackTimeStore.subs.forEach((fn) => fn());
}
function subscribePlaybackTime(fn) {
  playbackTimeStore.subs.add(fn);
  return () => playbackTimeStore.subs.delete(fn);
}
const getPlaybackTime = () => playbackTimeStore.value;
export function usePlayerTime() {
  return useSyncExternalStore(subscribePlaybackTime, getPlaybackTime, getPlaybackTime);
}

const UICtx = createContext(null);
export function useUI() { return useContext(UICtx); }

export const SIDEBAR_MIN_W = 200;
export const SIDEBAR_MAX_W = 360;
export const SIDEBAR_COLLAPSED_W = 72;
export const RIGHTPANEL_MIN_W = 260;
export const RIGHTPANEL_MAX_W = 440;
export const RIGHTPANEL_COLLAPSED_W = 56;
export const RIGHTPANEL_PEEK_W = 52;
const PANEL_PREFS_KEY = "aivy_panel_prefs";
const SETTINGS_CACHE_KEY = "aivy_settings_cache_v1";
const PLAYBACK_STATE_KEY = "aivy_playback_state_v1";
const PLAYBACK_STATE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const DEFAULT_PANEL_PREFS = {
  sidebarWidth: 236,
  sidebarCollapsed: false,
  rightPanelWidth: 300,
  rightPanelCollapsed: false,
};
function loadPanelPrefs() {
  try {
    const raw = localStorage.getItem(PANEL_PREFS_KEY);
    if (!raw) return DEFAULT_PANEL_PREFS;
    const parsed = JSON.parse(raw);
    return {
      sidebarWidth: clamp(Number(parsed.sidebarWidth) || DEFAULT_PANEL_PREFS.sidebarWidth, SIDEBAR_MIN_W, SIDEBAR_MAX_W),
      sidebarCollapsed: !!parsed.sidebarCollapsed,
      rightPanelWidth: clamp(Number(parsed.rightPanelWidth) || DEFAULT_PANEL_PREFS.rightPanelWidth, RIGHTPANEL_MIN_W, RIGHTPANEL_MAX_W),
      rightPanelCollapsed: !!parsed.rightPanelCollapsed,
    };
  } catch { return DEFAULT_PANEL_PREFS; }
}

function savePlaybackState(state) {
  try {
    localStorage.setItem(PLAYBACK_STATE_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
  } catch { }
}

function loadPlaybackState() {
  try {
    const raw = localStorage.getItem(PLAYBACK_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.queueList) || !parsed.queueList.length) return null;
    if (!Array.isArray(parsed.order) || !parsed.order.length) return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > PLAYBACK_STATE_MAX_AGE_MS) return null;
    return parsed;
  } catch { return null; }
}

function clearPlaybackState() {
  try { localStorage.removeItem(PLAYBACK_STATE_KEY); } catch { }
}

const DEFAULT_SETTINGS = {
  audioQuality: "preview",
  audioFormat: "opus",
  autoplay: true,
  crossfadeSeconds: 0,
  volumeDefault: 0.7,
  normalizeVolume: true,
  explicitContent: true,
  equalizer: DEFAULT_EQ,

  theme: "black",
  customThemeCss: "",
  language: "id",
  fontFamily: "default",
  fontUrl: "",
  fontScale: 100,
  compactRows: false,
  compactArtists: false,
  compactAlbums: false,
  artistBanners: true,
  reducedMotion: false,
  highContrast: false,
  liquidGlass: !isLowEndDevice(),

  waveformSeekbar: false,
  coverBackground: true,
  dynamicColors: false,
  noRoundCover: false,
  tiltCover: false,
  tiltDistance: 10,
  tiltSpeed: 240,
  cdCoverSpin: false,
  animatedArtwork: true,

  visualizerEnabled: false,
  visualizerStyle: "butterchurn",
  visualizerMode: "solid",
  visualizerPreset: "auto",
  visualizerSensitivity: 60,
  visualizerBrightness: 100,
  cyclePresets: false,
  cycleDuration: 30,
  randomizePresets: false,

  showRecommendedSongs: true,
  showRecommendedAlbums: true,
  showRecommendedArtists: true,
  showJumpBackIn: true,
  showEditorsPicks: false,
  shuffleEditorsPicks: false,
  editorsPicksSource: "current",

  showNavHome: true,
  showNavSearch: true,
  showNavLibrary: true,
  showNavRooms: true,
  showNavShorts: true,
  showSideAbout: false,
  showSideDiscord: false,
  showSideGithub: false,
  donationReminders: false,
  closeModalsOnNavigation: false,
  interceptBackToCloseModals: false,
  nowPlayingView: "album",
  fullscreenCoverClick: "exit",

  notifyRoomInvite: true,
  autoJoinRoomAudio: true,
  hostOnlyControlDefault: false,
  roomVisibilityDefault: "public",
  historyEnabled: true,
  searchHistoryEnabled: true,
  discordPresence: false,
  discordPresenceLyrics: true,
};

function loadCachedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch { return DEFAULT_SETTINGS; }
}
function saveCachedSettings(s) {
  try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(s)); } catch {}
}

export function UIProvider({ children }) {
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [settings, setSettings] = useState(loadCachedSettings);
  const [theme, setTheme] = useState(() => {
    const cached = loadCachedSettings();
    return typeof cached.theme === "string" && cached.theme && cached.theme !== "dark" ? cached.theme : "black";
  });
  const [toasts, setToasts] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [addToPlaylistTarget, setAddToPlaylistTarget] = useState(null);
  const [creditsTrack, setCreditsTrack] = useState(null);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [sidebarQueueOpen, setSidebarQueueOpen] = useState(false);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [panelPrefs, setPanelPrefs] = useState(loadPanelPrefs);

  useEffect(() => {
    try { localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify(panelPrefs)); } catch {}
  }, [panelPrefs]);

  useEffect(() => {
    Api.me()
      .then((u) => setAuthUser(u))
      .catch(() => setAuthUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!authUser) return;
    Api.getSettings()
      .then((s) => {
        const local = loadCachedSettings();
        const merged = { ...DEFAULT_SETTINGS, ...local, ...(s || {}) };
        setSettings(merged);
        saveCachedSettings(merged);
        setTheme(typeof merged.theme === "string" && merged.theme && merged.theme !== "dark" ? merged.theme : "black");
      })
      .catch(() => {});
  }, [authUser]);

  useEffect(() => {
    if (theme !== "system") {
      document.documentElement.dataset.theme = theme || "black";
      return undefined;
    }
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => { document.documentElement.dataset.theme = mq.matches ? "white" : "black"; };
    apply();
    if (mq.addEventListener) {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.compact = settings.compactRows ? "true" : "false";
  }, [settings.compactRows]);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = settings.reducedMotion ? "true" : "false";
  }, [settings.reducedMotion]);
  useEffect(() => {
    document.documentElement.dataset.contrast = settings.highContrast ? "high" : "normal";
  }, [settings.highContrast]);
  useEffect(() => {
    applyLiquidGlass(settings.liquidGlass);
  }, [settings.liquidGlass]);
  useEffect(() => {
    setPreferredAudioFormat(settings.audioFormat);
  }, [settings.audioFormat]);

  useEffect(() => {
    const root = document.documentElement;
    const customUrl = (settings.fontUrl || "").trim();
    let faceEl = document.getElementById("aivy-custom-font-face");
    if (customUrl) {
      if (!faceEl) { faceEl = document.createElement("style"); faceEl.id = "aivy-custom-font-face"; document.head.appendChild(faceEl); }
      faceEl.textContent = `@font-face{font-family:"Cosmicx Custom";src:url("${customUrl}");font-display:swap;}`;
    } else if (faceEl) faceEl.remove();
    const stack = customUrl ? "'Cosmicx Custom', sans-serif" : (FONT_STACKS[settings.fontFamily] ?? FONT_STACKS.default);
    if (stack) {
      root.style.setProperty("--font-display", stack);
      root.style.setProperty("--font-body", stack);
    } else {
      root.style.removeProperty("--font-display");
      root.style.removeProperty("--font-body");
    }
    const gq = GOOGLE_FONT_QUERY[settings.fontFamily];
    let link = document.getElementById("aivy-gfont");
    if (gq) {
      if (!link) { link = document.createElement("link"); link.id = "aivy-gfont"; link.rel = "stylesheet"; document.head.appendChild(link); }
      link.href = `https://fonts.googleapis.com/css2?family=${gq}&display=swap`;
    } else if (link) link.remove();
  }, [settings.fontFamily, settings.fontUrl]);

  useEffect(() => {
    const scale = Number(settings.fontScale) || 100;
    const el = () => document.getElementById("aivy-content-scroll");
    el()?.style.setProperty("zoom", scale === 100 ? "" : String(scale / 100));
    return () => { el()?.style.removeProperty("zoom"); };
  }, [settings.fontScale]);

  useEffect(() => {
    const css = settings.customThemeCss || "";
    let el = document.getElementById("aivy-custom-theme-css");
    if (!css.trim()) { el?.remove(); return; }
    if (!el) { el = document.createElement("style"); el.id = "aivy-custom-theme-css"; document.head.appendChild(el); }
    el.textContent = css;
    return () => { document.getElementById("aivy-custom-theme-css")?.remove(); };
  }, [settings.customThemeCss]);

  const t = useCallback((key, fallback) => makeT(settings.language)(key, fallback), [settings.language]);

  const pushToast = useCallback((message) => {
    const id = uid("toast");
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const login = useCallback(() => { window.location.href = Api.discordLoginUrl(); }, []);
  const loginGoogle = useCallback(() => { window.location.href = Api.googleLoginUrl(); }, []);
  const loggingOutRef = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const logout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setLoggingOut(true);
    setAuthUser(null);
    clearPlaybackState();
    const withTimeout = (promise, ms) => Promise.race([
      promise,
      new Promise((resolve) => setTimeout(resolve, ms)),
    ]);
    try {
      await withTimeout(Api.logout(), 3000);
    } catch {}
    window.location.href = "/";
  }, []);

  const pendingSettingsPatchRef = useRef({});
  const flushSettingsRef = useRef(null);
  if (!flushSettingsRef.current) {
    flushSettingsRef.current = debounce(async (onError) => {
      const patch = pendingSettingsPatchRef.current;
      if (!Object.keys(patch).length) return;
      pendingSettingsPatchRef.current = {};
      try { await Api.putSettings(patch); } catch { onError(); }
    }, 600);
  }

  const updateSettings = useCallback((patch) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveCachedSettings(next);
      return next;
    });
    if (patch.theme) setTheme(patch.theme);
    pendingSettingsPatchRef.current = { ...pendingSettingsPatchRef.current, ...patch };
    flushSettingsRef.current(() => pushToast(t("toastSettingsSaveFailed")));
  }, [pushToast, t]);

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    saveCachedSettings(DEFAULT_SETTINGS);
    setTheme("black");
    try { await Api.resetSettings(); } catch {  }
  }, []);

  const toggleTheme = useCallback(() => {
    updateSettings({ theme: theme === "black" ? "white" : "black" });
  }, [theme, updateSettings]);

  const ctxOpenSeq = useRef(0);
  const openContextMenu = useCallback((x, y, items) => {
    const track = (items && items.track) || null;
    const seq = ++ctxOpenSeq.current;
    const show = () => { if (seq === ctxOpenSeq.current) setContextMenu({ x, y, items, track }); };
    if (!track || trackArtistsReady(track)) { show(); return; }
    Promise.race([loadTrackArtists(track), new Promise((r) => setTimeout(r, 900))]).then(show);
  }, []);
  const closeContextMenu = useCallback(() => { ctxOpenSeq.current++; setContextMenu(null); }, []);

  const openAddToPlaylist = useCallback((track) => setAddToPlaylistTarget(track), []);
  const closeAddToPlaylist = useCallback(() => setAddToPlaylistTarget(null), []);

  const openCredits = useCallback((track) => setCreditsTrack(track), []);
  const closeCredits = useCallback(() => setCreditsTrack(null), []);

  const openLyrics = useCallback(() => setLyricsOpen(true), []);
  const closeLyrics = useCallback(() => setLyricsOpen(false), []);
  const toggleLyrics = useCallback(() => setLyricsOpen((o) => !o), []);
  const toggleSidebarQueue = useCallback(() => setSidebarQueueOpen((o) => !o), []);
  const closeSidebarQueue = useCallback(() => setSidebarQueueOpen(false), []);
  const openMobileQueue = useCallback(() => { setLyricsOpen(false); setMobileQueueOpen(true); }, []);
  const closeMobileQueue = useCallback(() => setMobileQueueOpen(false), []);

  const setSidebarWidth = useCallback((w) => {
    setPanelPrefs((p) => ({ ...p, sidebarWidth: clamp(Math.round(w), SIDEBAR_MIN_W, SIDEBAR_MAX_W) }));
  }, []);
  const setRightPanelWidth = useCallback((w) => {
    setPanelPrefs((p) => ({ ...p, rightPanelWidth: clamp(Math.round(w), RIGHTPANEL_MIN_W, RIGHTPANEL_MAX_W) }));
  }, []);
  const toggleSidebarCollapsed = useCallback(() => {
    setPanelPrefs((p) => ({ ...p, sidebarCollapsed: !p.sidebarCollapsed }));
  }, []);
  const toggleRightPanelCollapsed = useCallback(() => {
    setPanelPrefs((p) => ({ ...p, rightPanelCollapsed: !p.rightPanelCollapsed }));
  }, []);
  const [rightPanelPeek, setRightPanelPeek] = useState(false);

  const value = {
    authUser, authChecked, login, loginGoogle, logout, loggingOut,
    settings, updateSettings, resetSettings,
    theme, toggleTheme, t,
    toasts, pushToast,
    contextMenu, openContextMenu, closeContextMenu,
    addToPlaylistTarget, openAddToPlaylist, closeAddToPlaylist,
    creditsTrack, openCredits, closeCredits,
    lyricsOpen, openLyrics, closeLyrics, toggleLyrics,
    sidebarQueueOpen, toggleSidebarQueue, closeSidebarQueue,
    mobileQueueOpen, openMobileQueue, closeMobileQueue,
    sidebarWidth: panelPrefs.sidebarWidth,
    sidebarCollapsed: panelPrefs.sidebarCollapsed,
    setSidebarWidth,
    toggleSidebarCollapsed,
    rightPanelWidth: panelPrefs.rightPanelWidth,
    rightPanelCollapsed: panelPrefs.rightPanelCollapsed,
    setRightPanelWidth,
    toggleRightPanelCollapsed,
    rightPanelPeek, setRightPanelPeek,
  };
  return <UICtx.Provider value={value}>{children}</UICtx.Provider>;
}

const PlayerCtx = createContext(null);
export function usePlayer() { return useContext(PlayerCtx); }

const LOCAL_AUDIO_EXT_RE = /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|wma|alac|aiff|aif)$/i;
const LOCAL_MIN_DURATION_SECONDS = 60;

function localExtOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

function probeLocalAudioDuration(url) {
  return new Promise((resolve) => {
    if (typeof Audio === "undefined") { resolve(null); return; }
    const probe = new Audio();
    let done = false;
    const finish = (duration) => {
      if (done) return;
      done = true;
      probe.removeEventListener("loadedmetadata", onMeta);
      probe.removeEventListener("error", onError);
      resolve(duration);
    };
    const onMeta = () => finish(isFinite(probe.duration) ? probe.duration : null);
    const onError = () => finish(null);
    probe.addEventListener("loadedmetadata", onMeta);
    probe.addEventListener("error", onError);
    probe.preload = "metadata";
    probe.src = url;
    setTimeout(() => finish(null), 8000);
  });
}

function normalizeTrack(raw) {
  if (!raw) return null;
  if (raw.source === "local") {
    return {
      id: raw.id, videoId: null, title: raw.title,
      artist: raw.artist || { name: "Perangkat saya" },
      album: null, cover: raw.cover || null,
      duration: raw.duration || null, preview: null,
      source: "local", localUrl: raw.localUrl, fileExt: raw.fileExt || null,
    };
  }
  if (raw.videoId && !raw.artist?.id) {
    return {
      id: raw.videoId, videoId: raw.videoId, title: raw.title,
      artist: raw.artist ? (typeof raw.artist === "string" ? { name: raw.artist } : raw.artist) : null,
      album: raw.album || null, cover: raw.thumbnail || raw.cover || null,
      duration: raw.duration || null, preview: null, source: "youtube",
    };
  }
  return {
    id: String(raw.id), videoId: raw.videoId || null, title: raw.title,
    artist: raw.artist || null, album: raw.album || null,
    cover: raw.cover || raw.image || raw.banner || null,
    duration: raw.duration || null, preview: raw.preview || null,
    trackPosition: raw.trackPosition, source: "deezer",
  };
}

export function PlayerProvider({ children }) {
  const { authUser, settings, pushToast, t } = useUI();

  const [queueList, setQueueList] = useState([]);
  const [order, setOrder] = useState([]);
  const [posInOrder, setPosInOrder] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const setCurrentTime = setPlaybackTime;
  const [clipDuration, setClipDuration] = useState(0);
  const [isPreviewClip, setIsPreviewClip] = useState(true);
  const [audioFormat, setAudioFormat] = useState(null);
  const [volume, setVolumeState] = useState(0.7);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("off");
  const [liked, setLiked] = useState(() => new Set());
  const [playlists, setPlaylists] = useState([]);
  const [followedArtists, setFollowedArtists] = useState([]);
  const [savedAlbums, setSavedAlbums] = useState([]);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [playSource, setPlaySource] = useState(null);

  const [localTracks, setLocalTracks] = useState([]);
  const [localScan, setLocalScan] = useState({ scanning: false, checked: 0, total: 0, found: 0 });
  const localObjectUrlsRef = useRef([]);
  useEffect(() => () => { localObjectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const audioGraphRef = useRef(null);
  const fadeTimerRef = useRef(null);
  const wasFadedOutRef = useRef(false);

  const [room, setRoom] = useState(null);
  const [publicRooms, setPublicRooms] = useState([]);
  const [roomError, setRoomError] = useState(null);
  const [roomSyncTick, setRoomSyncTick] = useState(0);
  const roomSyncRef = useRef(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [suggestedQueue, setSuggestedQueue] = useState([]);
  const suggestedQueueRef = useRef([]);
  useEffect(() => { suggestedQueueRef.current = suggestedQueue; }, [suggestedQueue]);
  const queueListRef = useRef([]);
  useEffect(() => { queueListRef.current = queueList; }, [queueList]);
  const addToQueueEndRef = useRef(null);
  const socketRef = useRef(null);

  const audioRef = useRef((() => {
    if (typeof Audio === "undefined") return null;
    const a = new Audio();
    a.crossOrigin = "anonymous";
    return a;
  })());
  const preloadAudioRef = useRef((() => {
    if (typeof Audio === "undefined") return null;
    const a = new Audio();
    a.crossOrigin = "anonymous";
    a.preload = "auto";
    a.muted = true;
    return a;
  })());
  const promptCast = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return { ok: false, reason: "unsupported" };
    if (!audio.remote || typeof audio.remote.prompt !== "function") {
      return { ok: false, reason: "unsupported" };
    }
    try {
      await audio.remote.prompt();
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "cancelled" };
    }
  }, []);

  const getAudioSrc = useCallback(() => {
    const audio = audioRef.current;
    return audio?.currentSrc || audio?.src || null;
  }, []);

  const progressElsRef = useRef(new Map());
  const resolvedFullCache = useRef(new Map());
  const recoveringRef = useRef(false);
  const retryCountRef = useRef(0);
  const isPlayingRef = useRef(false);
  const pendingResumeTimeRef = useRef(0);
  const restoredOnceRef = useRef(false);

  useEffect(() => {
    if (restoredOnceRef.current) return;
    restoredOnceRef.current = true;
    const saved = loadPlaybackState();
    if (!saved) return;
    setQueueList(saved.queueList);
    setOrder(saved.order);
    setPosInOrder(Math.min(Math.max(saved.posInOrder || 0, 0), saved.order.length - 1));
    if (saved.shuffle) setShuffle(true);
    if (saved.repeat === "all" || saved.repeat === "one") setRepeat(saved.repeat);
    if (typeof saved.volume === "number") setVolumeState(clamp(saved.volume, 0, 1));
    if (saved.muted) setMuted(true);
    if (saved.playSource) setPlaySource(saved.playSource);
    pendingResumeTimeRef.current = typeof saved.currentTime === "number" ? saved.currentTime : 0;
  }, []);

  const playbackSnapshotRef = useRef(null);
  useEffect(() => {
    playbackSnapshotRef.current = { queueList, order, posInOrder, shuffle, repeat, volume, muted, playSource };
  }, [queueList, order, posInOrder, shuffle, repeat, volume, muted, playSource]);
  const orderPosRef = useRef({ order, posInOrder });
  useEffect(() => {
    orderPosRef.current = { order, posInOrder };
  }, [order, posInOrder]);

  const savePlaybackSnapshotNow = useCallback(() => {
    const snap = playbackSnapshotRef.current;
    if (!snap || !snap.queueList?.length || !snap.order?.length) { clearPlaybackState(); return; }
    savePlaybackState({ ...snap, currentTime: audioRef.current?.currentTime || 0 });
  }, []);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") savePlaybackSnapshotNow(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", savePlaybackSnapshotNow);
    const interval = setInterval(() => { if (isPlayingRef.current) savePlaybackSnapshotNow(); }, 20000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", savePlaybackSnapshotNow);
      clearInterval(interval);
    };
  }, [savePlaybackSnapshotNow]);

  const ensureAudioGraph = useCallback(() => {
    if (audioGraphRef.current) return audioGraphRef.current;
    const audio = audioRef.current;
    if (!audio || typeof window === "undefined") return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(audio);
      const preamp = ctx.createGain();
      const bands = EQ_BANDS_HZ.map((freq) => {
        const f = ctx.createBiquadFilter();
        f.type = "peaking";
        f.frequency.value = freq;
        f.Q.value = 1.1;
        f.gain.value = 0;
        return f;
      });
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 20;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.2;
      const fadeGain = ctx.createGain();
      fadeGain.gain.value = 1;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;

      source.connect(preamp);
      let node = preamp;
      bands.forEach((b) => { node.connect(b); node = b; });
      node.connect(compressor);
      compressor.connect(fadeGain);
      fadeGain.connect(ctx.destination);
      fadeGain.connect(analyser);

      const graph = { ctx, source, preamp, bands, compressor, fadeGain, analyser };
      audioGraphRef.current = graph;
      ctx.addEventListener("statechange", () => {
        if (ctx.state !== "running" && isPlayingRef.current) ctx.resume().catch(() => {});
      });
      return graph;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const graph = ensureAudioGraph();
    if (!graph) return;
    const eq = settings.equalizer || DEFAULT_EQ;
    const enabled = !!eq.enabled;
    graph.preamp.gain.value = enabled ? Math.pow(10, (eq.preamp || 0) / 20) : 1;
    graph.bands.forEach((band, i) => { band.gain.value = enabled ? (eq.bands?.[i] ?? 0) : 0; });
  }, [settings.equalizer, ensureAudioGraph]);

  useEffect(() => {
    const graph = ensureAudioGraph();
    if (!graph) return;
    graph.compressor.threshold.value = settings.normalizeVolume ? -24 : 0;
    graph.compressor.ratio.value = settings.normalizeVolume ? 8 : 1;
  }, [settings.normalizeVolume, ensureAudioGraph]);

  const getAnalyser = useCallback(() => {
    const graph = ensureAudioGraph();
    return graph?.analyser || null;
  }, [ensureAudioGraph]);

  const currentTrack = queueList.length && order.length ? queueList[order[posInOrder]] : null;
  const currentKey = currentTrack ? currentTrack.id : null;
  const inRoom = !!room;

  useDiscordPresence({ enabled: !!settings.discordPresence, track: currentTrack, isPlaying, audioRef, lyrics: settings.discordPresenceLyrics !== false });

  const defaultDocTitleRef = useRef(typeof document !== "undefined" ? document.title : "");
  useEffect(() => {
    if (typeof document === "undefined") return;
    seoState.playing = !!currentTrack;
    if (!currentTrack) {
      document.title = seoState.title || defaultDocTitleRef.current;
      return;
    }
    const artistName = currentTrack.artist?.name;
    document.title = artistName ? `${currentTrack.title} - ${artistName}` : currentTrack.title;
  }, [currentKey, currentTrack]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || "",
      artist: currentTrack.artist?.name || "",
      album: currentTrack.album || "",
      artwork: currentTrack.cover
        ? [
            { src: currentTrack.cover, sizes: "96x96", type: "image/jpeg" },
            { src: currentTrack.cover, sizes: "256x256", type: "image/jpeg" },
            { src: currentTrack.cover, sizes: "512x512", type: "image/jpeg" },
          ]
        : [],
    });
  }, [currentKey, currentTrack]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => { setVolumeState(settings.volumeDefault ?? 0.7); }, []);
  const currentTrackHasLyrics = true;

  useEffect(() => {
    if (!authUser) { setLiked(new Set()); setPlaylists([]); setFollowedArtists([]); setSavedAlbums([]); return; }
    Api.likes().then((rows) => setLiked(new Set(rows.map((r) => String(r.video_id ?? r.videoId ?? r.id))))).catch(() => {});
    Api.playlists().then(setPlaylists).catch(() => {});
    Api.followedArtists().then((rows) => setFollowedArtists(Array.isArray(rows) ? rows : [])).catch(() => {});
    Api.savedAlbums().then((rows) => setSavedAlbums(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, [authUser]);

  const refreshPlaylists = useCallback(async () => {
    try { const rows = await Api.playlists(); setPlaylists(rows); } catch { }
  }, []);

  const registerProgressEl = useCallback((el, mode = "width") => {
    if (!el) return;
    progressElsRef.current.set(el, mode);
    return () => progressElsRef.current.delete(el);
  }, []);
  const writeProgress = useCallback((t, dur) => {
    const pct = dur > 0 ? clamp(t / dur, 0, 1) * 100 : 0;
    progressElsRef.current.forEach((mode, el) => {
      if (!el) return;
      if (mode === "left") el.style.left = `${pct}%`;
      else if (mode === "ring") { el.style.strokeDashoffset = String(1 - pct / 100); el.style.opacity = pct > 0 ? "1" : "0"; }
      else el.style.transform = `scaleX(${pct / 100})`;
    });
  }, []);

  const resolveAudioSrc = useCallback(async (track, { prefetch = false, forceFresh = false } = {}) => {
    if (!track) return null;
    if (track.source === "local") {
      if (!track.localUrl) return null;
      return { src: track.localUrl, preview: false, local: true };
    }
    const wantFull = settings.audioQuality === "full";
    const fullSrcFor = async (videoId) => {
      try {
        const artistName = (track.artist?.name || (typeof track.artist === "string" ? track.artist : "") || "").trim();
        return {
          src: await Api.getStreamUrl(videoId, {
            prefetch,
            forceFresh,
            title: track.title || "",
            artist: artistName,
          }),
          preview: false,
          videoId,
        };
      } catch { return null; }
    };

    if (wantFull) {
      let videoId = track.videoId;
      if (!videoId) {
        if (resolvedFullCache.current.has(track.id)) {
          videoId = resolvedFullCache.current.get(track.id);
        } else {
          try {
            const q = `${track.title} ${track.artist?.name || ""}`.trim();
            const results = await Api.search(q);
            const best = pickBestAudioMatch(results, track);
            videoId = best?.videoId || results?.[0]?.videoId || null;
            resolvedFullCache.current.set(track.id, videoId);
          } catch { videoId = null; }
        }
      }
      if (videoId) {
        const full = await fullSrcFor(videoId);
        if (full) return full;
      }
    }

    if (track.preview) return { src: track.preview, preview: true };
    if (track.videoId) {
      const full = await fullSrcFor(track.videoId);
      if (full) return full;
    }
    return null;
  }, [settings.audioQuality, settings.audioFormat]);

  const resumeAudioCtx = useCallback(() => {
    const graph = ensureAudioGraph();
    graph?.ctx?.resume?.().catch(() => {});
  }, [ensureAudioGraph]);

  useEffect(() => {
    const unlock = () => resumeAudioCtx();
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [resumeAudioCtx]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentTrack) { audio.pause(); audio.removeAttribute("src"); setAudioFormat(null); return; }
    let cancelled = false;
    setLoadingAudio(true);
    resolveAudioSrc(currentTrack).then((resolved) => {
      if (cancelled) return;
      if (!resolved) {
        setLoadingAudio(false);
        pushToast(`${t("toastAudioUnavailable")} "${currentTrack.title}"`);
        return;
      }
      setIsPreviewClip(resolved.preview);
      const isNewSrc = audio.src !== resolved.src;
      if (isNewSrc) audio.src = resolved.src;
      if (pendingResumeTimeRef.current > 0) {
        audio.currentTime = pendingResumeTimeRef.current;
        pendingResumeTimeRef.current = 0;
      }
      setAudioFormat(null);
      if (resolved.local) {
        const ext = (currentTrack.fileExt || "").toUpperCase();
        setAudioFormat(ext ? { label: ext, mimeType: `audio/${currentTrack.fileExt}`, codec: ext.toLowerCase(), container: ext } : "unavailable");
      } else if (resolved.preview) {
        setAudioFormat({ label: "MP3", mimeType: "audio/mpeg", codec: "mp3", container: "MP3" });
      } else if (resolved.videoId) {
        if (getPreferredAudioFormat() === "flac") {
          setAudioFormat({ label: "FLAC", mimeType: "audio/flac", codec: "flac", container: "FLAC" });
        } else Api.trackAudioInfo(resolved.videoId)
          .then((info) => {
            if (cancelled) return;
            const fmt = info?.format;
            if (!fmt) { setAudioFormat("unavailable"); return; }
            const label = fmt.codecFamily === "opus" ? "OPUS"
              : fmt.codecFamily === "aac" ? "AAC"
              : (fmt.container || "unavailable").toString().toUpperCase();
            setAudioFormat({ label, mimeType: fmt.mimeType, codec: fmt.codec, container: fmt.container });
          })
          .catch(() => { if (!cancelled) setAudioFormat("unavailable"); });
      } else {
        setAudioFormat("unavailable");
      }
      audio.volume = muted ? 0 : volume;
      wasFadedOutRef.current = false;
      const graph = ensureAudioGraph();
      if (graph && settings.crossfadeSeconds > 0 && !inRoom) {
        graph.fadeGain.gain.cancelScheduledValues(graph.ctx.currentTime);
        graph.fadeGain.gain.setValueAtTime(0, graph.ctx.currentTime);
        graph.fadeGain.gain.linearRampToValueAtTime(1, graph.ctx.currentTime + settings.crossfadeSeconds);
      } else if (graph) {
        graph.fadeGain.gain.cancelScheduledValues(graph.ctx.currentTime);
        graph.fadeGain.gain.setValueAtTime(1, graph.ctx.currentTime);
      }

      let shouldPlay = isPlaying;
      if (inRoom) {
        const sync = roomSyncRef.current;
        if (sync) {
          if (sync.hardSeek || isNewSrc) audio.currentTime = sync.position || 0;
          shouldPlay = isPlaying && sync.allowAutoplay;
        }
      }
      if (shouldPlay) { resumeAudioCtx(); audio.play().catch(() => {}); }
    });
    return () => { cancelled = true; };
  }, [currentKey]);

  useEffect(() => {
    if (!inRoom) return;
    const sync = roomSyncRef.current;
    const audio = audioRef.current;
    if (!sync || !audio || !currentTrack) return;
    const drift = Math.abs((audio.currentTime || 0) - (sync.position || 0));
    if (sync.hardSeek || drift > 1.5) audio.currentTime = sync.position || 0;
  }, [roomSyncTick, inRoom]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (isPlaying) { resumeAudioCtx(); audio.play().catch(() => {}); }
    else audio.pause();
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { retryCountRef.current = 0; }, [currentKey]);

  useEffect(() => {
    if (!currentTrack || inRoom || repeat === "one") return;
    const nextIdx = posInOrder + 1;
    if (nextIdx >= order.length) return;
    const nextTrack = queueList[order[nextIdx]];
    if (!nextTrack) return;
    let cancelled = false;
    resolveAudioSrc(nextTrack, { prefetch: true }).then((resolved) => {
      if (cancelled || !resolved) return;
      const pre = preloadAudioRef.current;
      if (pre && pre.src !== resolved.src) {
        pre.src = resolved.src;
        try { pre.load(); } catch { }
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentKey, posInOrder, order, queueList, inRoom, repeat, resolveAudioSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const syncDuration = () => {
      const d = audio.duration;
      if (isFinite(d) && d > 0) setClipDuration(d);
    };
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      writeProgress(audio.currentTime, audio.duration || clipDuration);
      const cf = settings.crossfadeSeconds || 0;
      if (cf > 0 && !inRoom && repeat !== "one" && !wasFadedOutRef.current) {
        const dur = audio.duration || clipDuration;
        if (isFinite(dur) && dur > 0 && dur - audio.currentTime <= cf) {
          const graph = audioGraphRef.current;
          if (graph) {
            wasFadedOutRef.current = true;
            graph.fadeGain.gain.cancelScheduledValues(graph.ctx.currentTime);
            graph.fadeGain.gain.setValueAtTime(graph.fadeGain.gain.value, graph.ctx.currentTime);
            graph.fadeGain.gain.linearRampToValueAtTime(0.001, graph.ctx.currentTime + Math.max(0.05, dur - audio.currentTime));
          }
        }
      }
    };
    const onEnded = () => {
      if (inRoom) return;
      if (repeat === "one") { audio.currentTime = 0; audio.play().catch(() => {}); return; }
      if (settings.autoplay === false) { setIsPlaying(false); pushToast(t("toastAutoplayOff")); return; }
      nextRef.current(true);
    };
    let stalledTimer = null;
    const clearStalledTimer = () => { if (stalledTimer) { clearTimeout(stalledTimer); stalledTimer = null; } };

    const recoverPlayback = async () => {
      if (recoveringRef.current) return;
      if (retryCountRef.current >= 3) return;
      if (!currentTrack || inRoom) return;
      const resumeAt = audio.currentTime || 0;
      recoveringRef.current = true;
      retryCountRef.current += 1;
      try {
        const resolved = await resolveAudioSrc(currentTrack, { forceFresh: true });
        if (!resolved) return;
        audio.src = resolved.src;
        audio.currentTime = resumeAt;
        if (isPlayingRef.current) {
          resumeAudioCtx();
          await audio.play().catch(() => {});
        }
      } catch {
      } finally {
        recoveringRef.current = false;
      }
    };
    const onError = () => {
      setLoadingAudio(false);
      recoverPlayback();
    };
    const onStalled = () => {
      clearStalledTimer();
      stalledTimer = setTimeout(() => { recoverPlayback(); }, 6000);
    };
    const onCanPlay = () => { setLoadingAudio(false); retryCountRef.current = 0; clearStalledTimer(); };
    const onPlaying = () => { setLoadingAudio(false); retryCountRef.current = 0; clearStalledTimer(); };
    const onWaiting = () => {
      setLoadingAudio(true);
      clearStalledTimer();
      stalledTimer = setTimeout(() => { recoverPlayback(); }, 8000);
    };
    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("durationchange", syncDuration);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("stalled", onStalled);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    return () => {
      clearStalledTimer();
      audio.removeEventListener("loadedmetadata", syncDuration);
      audio.removeEventListener("durationchange", syncDuration);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("stalled", onStalled);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
    };
  }, [repeat, inRoom, writeProgress, settings.crossfadeSeconds, settings.autoplay, pushToast, t, clipDuration, currentTrack, resolveAudioSrc, resumeAudioCtx]);

  useEffect(() => {
    const onVisible = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (document.visibilityState !== "visible") return;
      resumeAudioCtx();
      setCurrentTime(audio.currentTime);
      writeProgress(audio.currentTime, audio.duration || clipDuration);
      if (isFinite(audio.duration) && audio.duration > 0) setClipDuration(audio.duration);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [writeProgress, clipDuration, resumeAudioCtx]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const nudge = () => {
      if (!isPlayingRef.current) return;
      const graph = audioGraphRef.current;
      if (graph?.ctx && graph.ctx.state !== "running") graph.ctx.resume().catch(() => {});
      if (audio.paused) audio.play().catch(() => {});
    };
    const id = setInterval(nudge, 3000);
    document.addEventListener("visibilitychange", nudge);
    window.addEventListener("focus", nudge);
    window.addEventListener("pageshow", nudge);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", nudge);
      window.removeEventListener("focus", nudge);
      window.removeEventListener("pageshow", nudge);
    };
  }, []);

  useEffect(() => {
    let raf;
    function tick() {
      const audio = audioRef.current;
      if (audio && !audio.paused) writeProgress(audio.currentTime, audio.duration || clipDuration);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [writeProgress, clipDuration]);

  const scanLocalFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => {
      if (f.type && f.type.startsWith("audio/")) return true;
      return LOCAL_AUDIO_EXT_RE.test(f.name);
    });
    if (!files.length) {
      pushToast(t("toastNoAudioFilesFound") || "Nggak ada file audio ditemukan di folder itu.");
      return;
    }
    setLocalScan({ scanning: true, checked: 0, total: files.length, found: 0 });
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      const duration = await probeLocalAudioDuration(url);
      if (duration && duration >= LOCAL_MIN_DURATION_SECONDS) {
        localObjectUrlsRef.current.push(url);
        const ext = localExtOf(file.name);
        const nameNoExt = file.name.replace(/\.[a-z0-9]+$/i, "");
        results.push({
          id: `local-${file.name}-${file.size}-${file.lastModified}`,
          title: nameNoExt || file.name,
          artist: { name: "Perangkat saya" },
          cover: null,
          duration,
          localUrl: url,
          fileExt: ext,
          source: "local",
        });
      } else {
        URL.revokeObjectURL(url);
      }
      setLocalScan((s) => ({ ...s, checked: i + 1, found: results.length }));
    }
    setLocalTracks((prev) => {
      const knownIds = new Set(prev.map((tr) => tr.id));
      return [...prev, ...results.filter((r) => !knownIds.has(r.id))];
    });
    setLocalScan((s) => ({ ...s, scanning: false }));
    pushToast(`${results.length} lagu ditemukan (di atas 1 menit)`);
  }, [pushToast, t]);

  const clearLocalLibrary = useCallback(() => {
    localObjectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    localObjectUrlsRef.current = [];
    setLocalTracks([]);
    setLocalScan({ scanning: false, checked: 0, total: 0, found: 0 });
  }, []);

  const buildOrder = useCallback((len, startIndex, shuf) => {
    const idxs = Array.from({ length: len }, (_, i) => i);
    if (!shuf) return idxs;
    const rest = idxs.filter((i) => i !== startIndex);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [startIndex, ...rest];
  }, []);

  const playList = useCallback((rawList, startIndex = 0, source = null, shuffleOverride = null) => {
    resumeAudioCtx();
    const list = rawList.map(normalizeTrack).filter(Boolean);
    if (!list.length) return;
    if (inRoom) {
      const baseIndex = room.queue?.length || 0;
      const safeStart = clamp(startIndex, 0, list.length - 1);
      list.forEach((t) => socketRef.current?.emit("queue-add", { roomId: room.id, song: t }));
      socketRef.current?.emit("playback-control", { roomId: room.id, action: "select", payload: { index: baseIndex + safeStart } });
      return;
    }
    const effectiveShuffle = shuffleOverride !== null ? shuffleOverride : shuffle;
    const safeStart = clamp(startIndex, 0, list.length - 1);
    setQueueList(list);
    setOrder(buildOrder(list.length, safeStart, effectiveShuffle));

    setPosInOrder(effectiveShuffle ? 0 : safeStart);
    setIsPlaying(true);
    setPlaySource(source);
    if (shuffleOverride !== null && shuffleOverride !== shuffle) setShuffle(shuffleOverride);
    if (authUser && settings.historyEnabled !== false) {
      const t = list[clamp(startIndex, 0, list.length - 1)];
      Api.addHistory(t.videoId || t.id, { title: t.title, artistName: t.artist?.name || null, artists: trackArtists(t), thumbnail: t.cover, albumId: t.album?.id || null, albumTitle: t.album?.title || null, duration: t.duration }).catch(() => {});
    }
  }, [inRoom, room, buildOrder, shuffle, authUser, settings.historyEnabled, resumeAudioCtx]);

  const playSingle = useCallback((rawTrack, source = null) => {
    resumeAudioCtx();
    const track = normalizeTrack(rawTrack);
    if (!track) return;
    if (inRoom) {
      const existingIdx = room.queue?.findIndex((t) => String(t.id) === String(track.id) || (track.videoId && String(t.videoId) === String(track.videoId)));
      if (existingIdx !== undefined && existingIdx !== -1) {
        socketRef.current?.emit("playback-control", { roomId: room.id, action: "select", payload: { index: existingIdx } });
      } else {
        const newIndex = room.queue?.length || 0;
        socketRef.current?.emit("queue-add", { roomId: room.id, song: track });
        socketRef.current?.emit("playback-control", { roomId: room.id, action: "select", payload: { index: newIndex } });
      }
      return;
    }

    setPlaySource(source);
    const existingIdx = queueList.findIndex((t) => t.id === track.id);
    if (existingIdx !== -1) {
      const posInOrder = order.indexOf(existingIdx);
      if (posInOrder !== -1) { setPosInOrder(posInOrder); setIsPlaying(true); return; }
    }

    setQueueList([track]);
    setOrder([0]);
    setPosInOrder(0);
    setIsPlaying(true);
    if (authUser && settings.historyEnabled !== false) {
      Api.addHistory(track.videoId || track.id, { title: track.title, artistName: track.artist?.name || null, artists: trackArtists(track), thumbnail: track.cover, albumId: track.album?.id || null, albumTitle: track.album?.title || null, duration: track.duration }).catch(() => {});
    }
  }, [inRoom, room, queueList, order, authUser, settings.historyEnabled, resumeAudioCtx]);

  const radioSeqRef = useRef(0);
  const playRadio = useCallback((rawTrack, source = null) => {
    resumeAudioCtx();
    const track = normalizeTrack(rawTrack);
    if (!track) return;
    if (inRoom) { playSingle(track, source); return; }

    const seq = ++radioSeqRef.current;
    setQueueList([track]);
    setOrder([0]);
    setPosInOrder(0);
    setIsPlaying(true);
    setPlaySource(source);
    if (authUser && settings.historyEnabled !== false) {
      Api.addHistory(track.videoId || track.id, { title: track.title, artistName: track.artist?.name || null, artists: trackArtists(track), thumbnail: track.cover, albumId: track.album?.id || null, albumTitle: track.album?.title || null, duration: track.duration }).catch(() => {});
    }

    const similarArgs = track.source === "deezer"
      ? { trackId: track.id }
      : { title: track.title, artist: track.artist?.name || "" };

    Api.similar(similarArgs).then((res) => {
      if (seq !== radioSeqRef.current) return;
      const items = (res?.items || []).map(normalizeTrack).filter(Boolean).filter((t) => t.id !== track.id);
      if (!items.length) return;
      setQueueList((list) => {
        if (seq !== radioSeqRef.current || !(list.length === 1 && list[0].id === track.id)) return list;
        setOrder((ord) => {
          if (!(ord.length === 1 && ord[0] === 0)) return ord;
          const rest = items.map((_, i) => i + 1);
          if (shuffle) {
            for (let i = rest.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [rest[i], rest[j]] = [rest[j], rest[i]];
            }
          }
          return [0, ...rest];
        });
        return [...list, ...items];
      });
    }).catch(() => {});
  }, [inRoom, playSingle, authUser, settings.historyEnabled, shuffle, resumeAudioCtx]);

  const suggestSeqRef = useRef(0);
  useEffect(() => {
    if (inRoom || !currentTrack) { setSuggestedQueue([]); return; }
    const seq = ++suggestSeqRef.current;
    const seedTrack = currentTrack;
    const similarArgs = seedTrack.source === "deezer"
      ? { trackId: seedTrack.id }
      : { title: seedTrack.title, artist: seedTrack.artist?.name || "" };

    Api.similar(similarArgs).then((res) => {
      if (seq !== suggestSeqRef.current) return;
      const knownIds = new Set(queueList.map((t) => String(t.id)));
      const items = (res?.items || [])
        .map(normalizeTrack)
        .filter(Boolean)
        .filter((t) => t.id !== seedTrack.id && !knownIds.has(String(t.id)));
      setSuggestedQueue(items.slice(0, 5));
    }).catch(() => {
      if (seq !== suggestSeqRef.current) return;
      setSuggestedQueue([]);
    });
  }, [currentKey, inRoom]);

  const applyRadioContinuation = useCallback((nextTrack, rest) => {
    setSuggestedQueue(rest);
    setQueueList((list) => {
      const newList = [...list, nextTrack];
      setOrder((ord) => [...ord, newList.length - 1]);
      return newList;
    });
    setPosInOrder((p) => p + 1);
    setIsPlaying(true);
    if (authUser && settings.historyEnabled !== false) {
      Api.addHistory(nextTrack.videoId || nextTrack.id, { title: nextTrack.title, artistName: nextTrack.artist?.name || null, artists: trackArtists(nextTrack), thumbnail: nextTrack.cover, albumId: nextTrack.album?.id || null, albumTitle: nextTrack.album?.title || null, duration: nextTrack.duration }).catch(() => {});
    }
  }, [authUser, settings.historyEnabled]);

  const continueWithRadio = useCallback(() => {
    const rq = suggestedQueueRef.current;
    if (!rq.length) return false;
    const [nextTrack, ...rest] = rq;
    applyRadioContinuation(nextTrack, rest);
    return true;
  }, [applyRadioContinuation]);

  const fetchRadioContinuationNow = useCallback(async (seedTrack) => {
    if (!seedTrack) return false;
    try {
      const similarArgs = seedTrack.source === "deezer"
        ? { trackId: seedTrack.id }
        : { title: seedTrack.title, artist: seedTrack.artist?.name || "" };
      const res = await Api.similar(similarArgs);
      const knownIds = new Set(queueListRef.current.map((t) => String(t.id)));
      const items = (res?.items || [])
        .map(normalizeTrack)
        .filter(Boolean)
        .filter((t) => t.id !== seedTrack.id && !knownIds.has(String(t.id)));
      if (!items.length) return false;
      applyRadioContinuation(items[0], items.slice(1, 5));
      return true;
    } catch {
      return false;
    }
  }, [applyRadioContinuation]);

  const promoteSuggestion = useCallback((track) => {
    setSuggestedQueue((rq) => rq.filter((t) => t.id !== track.id));
    addToQueueEndRef.current?.(track);
  }, []);

  const togglePlay = useCallback(() => {
    if (!currentTrack) return;
    resumeAudioCtx();
    if (inRoom) {
      socketRef.current?.emit("playback-control", { roomId: room.id, action: isPlaying ? "pause" : "play" });
      return;
    }
    setIsPlaying((p) => !p);
  }, [currentTrack, inRoom, room, isPlaying, resumeAudioCtx]);

  const next = useCallback((auto = false) => {
    if (inRoom) { socketRef.current?.emit("playback-control", { roomId: room.id, action: "next" }); return; }
    const isLast = posInOrder >= order.length - 1;
    if (isLast) {
      if (repeat === "all" && order.length) { setPosInOrder(0); return; }
      if (repeat !== "one" && settings.autoplay !== false) {
        if (continueWithRadio()) return;
        fetchRadioContinuationNow(currentTrack).then((ok) => {
          if (!ok && auto) setIsPlaying(false);
        });
        return;
      }
      if (!auto) return;
      setIsPlaying(false);
      return;
    }
    setPosInOrder((p) => p + 1);
  }, [inRoom, room, order.length, posInOrder, repeat, settings.autoplay, continueWithRadio, fetchRadioContinuationNow, currentTrack]);
  const nextRef = useRef(next);
  useEffect(() => { nextRef.current = next; }, [next]);

  const prev = useCallback(() => {
    if (inRoom) { socketRef.current?.emit("playback-control", { roomId: room.id, action: "prev" }); return; }
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
    setPosInOrder((p) => (p <= 0 ? (repeat === "all" ? Math.max(order.length - 1, 0) : 0) : p - 1));
  }, [inRoom, room, order.length, repeat]);

  const seekRatio = useCallback((ratio) => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (clipDuration || 0);
    if (!dur) return;
    const t = clamp(ratio, 0, 1) * dur;
    if (inRoom) { socketRef.current?.emit("playback-control", { roomId: room.id, action: "seek", payload: { position: t } }); return; }
    audio.currentTime = t;
    setCurrentTime(t);
    writeProgress(t, dur);
  }, [inRoom, room, clipDuration, writeProgress]);

  const seekTo = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (clipDuration || 0);
    const t = clamp(seconds, 0, dur || seconds);
    if (inRoom) { socketRef.current?.emit("playback-control", { roomId: room.id, action: "seek", payload: { position: t } }); return; }
    audio.currentTime = t;
    setCurrentTime(t);
    writeProgress(t, dur);
  }, [inRoom, room, clipDuration, writeProgress]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const safe = (fn) => (...args) => { try { fn(...args); } catch {} };
    ms.setActionHandler("play", safe(() => { if (!isPlaying) togglePlay(); }));
    ms.setActionHandler("pause", safe(() => { if (isPlaying) togglePlay(); }));
    ms.setActionHandler("previoustrack", safe(() => prev()));
    ms.setActionHandler("nexttrack", safe(() => next()));
    ms.setActionHandler("seekto", safe((details) => {
      if (details?.seekTime != null) seekTo(details.seekTime);
    }));
    ms.setActionHandler("stop", safe(() => { if (isPlaying) togglePlay(); }));
    return () => {
      try {
        ms.setActionHandler("play", null);
        ms.setActionHandler("pause", null);
        ms.setActionHandler("previoustrack", null);
        ms.setActionHandler("nexttrack", null);
        ms.setActionHandler("seekto", null);
        ms.setActionHandler("stop", null);
      } catch {}
    };
  }, [isPlaying, togglePlay, prev, next, seekTo]);

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => {
      const ns = !s;
      if (queueList.length) {
        const { order: curOrder, posInOrder: curPos } = orderPosRef.current;
        const curListIdx = curOrder[curPos];
        const newOrder = buildOrder(queueList.length, curListIdx, ns);
        const newPos = newOrder.indexOf(curListIdx);
        orderPosRef.current = { order: newOrder, posInOrder: newPos < 0 ? 0 : newPos };
        setOrder(newOrder);
        setPosInOrder(newPos < 0 ? 0 : newPos);
      }
      return ns;
    });
  }, [queueList.length, buildOrder]);

  const cycleRepeat = useCallback(() => setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off")), []);
  const setVolume = useCallback((v) => { setVolumeState(clamp(v, 0, 1)); if (v > 0) setMuted(false); }, []);
  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const toggleLike = useCallback(async (track) => {
    if (!authUser) { pushToast(t("toastLoginToSave")); return; }
    const key = String(track.videoId || track.id);
    const willLike = !liked.has(key);
    setLiked((prev) => { const n = new Set(prev); willLike ? n.add(key) : n.delete(key); return n; });
    pushToast(`${willLike ? t("toastAddedLiked") : t("toastRemovedLiked")} — ${track.title}`);
    try {
      if (willLike) await Api.like(key, { title: track.title, artistName: track.artist?.name || null, artists: trackArtists(track), thumbnail: track.cover, albumId: track.album?.id || null, albumTitle: track.album?.title || null, duration: track.duration });
      else await Api.unlike(key);
    } catch { pushToast(t("toastLikeFailed")); }
  }, [authUser, liked, pushToast, t]);

  const followedArtistIds = useMemo(() => new Set(followedArtists.map((a) => String(a.id))), [followedArtists]);
  const savedAlbumIds = useMemo(() => new Set(savedAlbums.map((a) => String(a.id))), [savedAlbums]);

  const toggleFollowArtist = useCallback(async (artist) => {
    if (!authUser) { pushToast(t("toastLoginToFollow")); return; }
    const id = artist?.id ? String(artist.id) : null;
    if (!id || !artist?.name) return;
    const willFollow = !followedArtists.some((a) => String(a.id) === id);
    const image = artist.image || artist.banner || null;
    setFollowedArtists((prev) => willFollow
      ? [{ id, name: artist.name, image }, ...prev.filter((a) => String(a.id) !== id)]
      : prev.filter((a) => String(a.id) !== id));
    pushToast(`${willFollow ? t("followedToast") : t("unfollowedToast")} ${artist.name}`);
    try {
      if (willFollow) await Api.followArtist(id, { name: artist.name, image });
      else await Api.unfollowArtist(id);
    } catch {
      setFollowedArtists((prev) => willFollow
        ? prev.filter((a) => String(a.id) !== id)
        : [{ id, name: artist.name, image }, ...prev.filter((a) => String(a.id) !== id)]);
      pushToast(t("toastFollowFailed"));
    }
  }, [authUser, followedArtists, pushToast, t]);

  const toggleSaveAlbum = useCallback(async (album) => {
    if (!authUser) { pushToast(t("toastLoginToSave")); return; }
    const id = album?.id ? String(album.id) : null;
    if (!id || !album?.title) return;
    const willSave = !savedAlbums.some((a) => String(a.id) === id);
    const entry = {
      id,
      title: album.title,
      cover: album.cover || null,
      artist: album.artist?.name ? { id: album.artist.id || null, name: album.artist.name } : null,
      releaseDate: album.releaseDate || null,
    };
    setSavedAlbums((prev) => willSave
      ? [entry, ...prev.filter((a) => String(a.id) !== id)]
      : prev.filter((a) => String(a.id) !== id));
    pushToast(`${willSave ? t("toastAlbumSaved") : t("toastAlbumRemoved")} — ${album.title}`);
    try {
      if (willSave) await Api.saveAlbum(id, { title: entry.title, cover: entry.cover, artistId: entry.artist?.id || null, artistName: entry.artist?.name || null, releaseDate: entry.releaseDate });
      else await Api.unsaveAlbum(id);
    } catch {
      setSavedAlbums((prev) => willSave
        ? prev.filter((a) => String(a.id) !== id)
        : [entry, ...prev.filter((a) => String(a.id) !== id)]);
      pushToast(t("toastAlbumFailed"));
    }
  }, [authUser, savedAlbums, pushToast, t]);

  const addToQueueEnd = useCallback((rawTrack) => {
    const track = normalizeTrack(rawTrack);
    if (!track) return;
    setSuggestedQueue((rq) => rq.filter((t) => t.id !== track.id));
    if (inRoom) { socketRef.current?.emit("queue-add", { roomId: room.id, song: track }); pushToast(`${t("toastAddedRoomQueue")} — ${track.title}`); return; }
    setQueueList((list) => {
      const newList = [...list, track];
      setOrder((ord) => [...ord, newList.length - 1]);
      return newList;
    });
    pushToast(`${t("toastAddedQueue")} — ${track.title}`);
  }, [inRoom, room, pushToast, t]);
  useEffect(() => { addToQueueEndRef.current = addToQueueEnd; }, [addToQueueEnd]);

  const playNextInQueue = useCallback((rawTrack) => {
    const track = normalizeTrack(rawTrack);
    if (inRoom) { addToQueueEnd(track); return; }
    setQueueList((list) => {
      const newList = [...list, track];
      setOrder((ord) => { const c = [...ord]; c.splice(posInOrder + 1, 0, newList.length - 1); return c; });
      return newList;
    });
    pushToast(`${t("toastPlayAfterThis")} — ${track.title}`);
  }, [inRoom, addToQueueEnd, posInOrder, pushToast, t]);

  const addAllToQueueEnd = useCallback((rawTracks) => {
    const tracks = (rawTracks || []).map(normalizeTrack).filter(Boolean);
    if (!tracks.length) return;
    if (inRoom) { tracks.forEach((track) => socketRef.current?.emit("queue-add", { roomId: room.id, song: track })); pushToast(t("toastAddedQueue")); return; }
    setQueueList((list) => {
      const newList = [...list, ...tracks];
      setOrder((ord) => [...ord, ...tracks.map((_, i) => list.length + i)]);
      return newList;
    });
    pushToast(t("toastAddedQueue"));
  }, [inRoom, room, pushToast, t]);

  const playAllNext = useCallback((rawTracks) => {
    const tracks = (rawTracks || []).map(normalizeTrack).filter(Boolean);
    if (!tracks.length) return;
    if (inRoom) { addAllToQueueEnd(tracks); return; }
    setQueueList((list) => {
      const newList = [...list, ...tracks];
      setOrder((ord) => {
        const c = [...ord];
        const inserted = tracks.map((_, i) => list.length + i);
        c.splice(posInOrder + 1, 0, ...inserted);
        return c;
      });
      return newList;
    });
    pushToast(t("toastPlayAfterThis"));
  }, [inRoom, addAllToQueueEnd, posInOrder, pushToast, t]);

  const removeFromQueue = useCallback((upNextIndex) => {
    if (inRoom) {
      const absolutePos = (room?.currentIndex ?? -1) + 1 + upNextIndex;
      socketRef.current?.emit("queue-remove", { roomId: room.id, position: absolutePos });
      return;
    }
    setOrder((ord) => {
      const absolutePos = posInOrder + 1 + upNextIndex;
      return ord.filter((_, i) => i !== absolutePos);
    });
  }, [inRoom, room, posInOrder]);

  const moveQueueItem = useCallback((fromUpNextIndex, toUpNextIndex) => {
    if (fromUpNextIndex === toUpNextIndex) return;
    if (inRoom) {
      const base = (room?.currentIndex ?? -1) + 1;
      socketRef.current?.emit("queue-reorder", { roomId: room.id, from: base + fromUpNextIndex, to: base + toUpNextIndex });
      return;
    }
    setOrder((ord) => {
      const base = posInOrder + 1;
      const next = [...ord];
      const [moved] = next.splice(base + fromUpNextIndex, 1);
      if (moved === undefined) return ord;
      next.splice(base + toUpNextIndex, 0, moved);
      return next;
    });
  }, [inRoom, room, posInOrder]);

  const selectQueuePosition = useCallback((absolutePosition) => {
    if (inRoom) {
      socketRef.current?.emit("playback-control", { roomId: room.id, action: "select", payload: { index: absolutePosition } });
      return;
    }
    setPosInOrder(clamp(absolutePosition, 0, Math.max(order.length - 1, 0)));
    setIsPlaying(true);
  }, [inRoom, room, order.length]);

  const clearUpNext = useCallback(() => {
    if (inRoom) { socketRef.current?.emit("queue-clear", { roomId: room.id }); pushToast(t("toastQueueCleared")); return; }
    setOrder((ord) => ord.slice(0, posInOrder + 1));
    pushToast(t("toastQueueCleared"));
  }, [inRoom, room, posInOrder, pushToast, t]);

  const createPlaylist = useCallback(async (name, description) => {
    if (!authUser) { pushToast(t("toastLoginToCreatePlaylist")); return null; }
    try {
      const pl = await Api.createPlaylist({ name, description, isPublic: false });
      setPlaylists((p) => [...p, { ...pl, songs: [] }]);
      pushToast(`${t("toastPlaylistCreated")} "${name}"`);
      return pl.id;
    } catch { pushToast(t("toastPlaylistCreateFailed")); return null; }
  }, [authUser, pushToast, t]);

  const setPlaylistDetail = useCallback((detail) => {

    const songs = (detail.songs || []).map((s) => ({
      id: s.video_id,
      videoId: s.video_id,
      title: s.title,
      artist: s.artist || (s.artist_name ? { name: s.artist_name } : null),
      artists: s.artists || null,
      album: s.album || null,
      cover: s.thumbnail,
      duration: s.duration,
    }));
    setPlaylists((list) => {
      const exists = list.some((pl) => String(pl.id) === String(detail.id));
      if (exists) return list.map((pl) => String(pl.id) === String(detail.id) ? { ...pl, ...detail, songs } : pl);
      return [...list, { ...detail, songs }];
    });
  }, []);

  const addToPlaylist = useCallback(async (playlistId, rawTrack) => {
    const track = normalizeTrack(rawTrack);
    const key = track.videoId || track.id;

    setPlaylists((list) => list.map((pl) => (String(pl.id) === String(playlistId) && !pl.songs?.some((s) => String(s.videoId || s.id) === String(key))
      ? { ...pl, songs: [...(pl.songs || []), track] } : pl)));
    try {
      await Api.addSong(playlistId, key, { title: track.title, artistName: track.artist?.name || null, artists: trackArtists(track), thumbnail: track.cover, albumId: track.album?.id || null, albumTitle: track.album?.title || null, duration: track.duration });
      pushToast(t("toastAddedToPlaylist"));
    } catch { pushToast(t("toastAddToPlaylistFailed")); }
  }, [pushToast, t]);

  const removeFromPlaylist = useCallback(async (playlistId, trackId) => {
    setPlaylists((list) => list.map((pl) => (String(pl.id) === String(playlistId) ? { ...pl, songs: pl.songs.filter((s) => String(s.id) !== String(trackId)) } : pl)));
    try { await Api.removeSong(playlistId, trackId); } catch { pushToast(t("toastRemoveFromPlaylistFailed")); }
  }, [pushToast, t]);

  const deletePlaylist = useCallback(async (playlistId) => {
    setPlaylists((list) => list.filter((p) => String(p.id) !== String(playlistId)));
    try { await Api.deletePlaylist(playlistId); pushToast(t("toastPlaylistDeleted")); } catch { pushToast(t("toastPlaylistDeleteFailed")); }
  }, [pushToast, t]);

  const setPlaylistCover = useCallback(async (playlistId, thumbnailUrl, videoId = null) => {
    const prev = playlists.find((p) => String(p.id) === String(playlistId));
    const prevCover = prev?.cover_thumbnail;
    setPlaylists((list) => list.map((pl) => (String(pl.id) === String(playlistId) ? { ...pl, cover_thumbnail: thumbnailUrl } : pl)));
    try {
      await Api.updatePlaylist(playlistId, { coverThumbnail: thumbnailUrl, coverVideoId: videoId });
      pushToast(t("coverUpdatedToast"));
    } catch {
      setPlaylists((list) => list.map((pl) => (String(pl.id) === String(playlistId) ? { ...pl, cover_thumbnail: prevCover } : pl)));
      pushToast(t("coverUpdateFailedToast"));
    }
  }, [playlists, pushToast, t]);

  const updatePlaylistMeta = useCallback(async (playlistId, { name, description, isPublic } = {}) => {
    const prev = playlists.find((p) => String(p.id) === String(playlistId));
    if (!prev) return false;
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (isPublic !== undefined) patch.isPublic = isPublic;
    setPlaylists((list) => list.map((pl) => (String(pl.id) === String(playlistId) ? {
      ...pl,
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(isPublic !== undefined ? { is_public: isPublic } : {}),
    } : pl)));
    try {
      await Api.updatePlaylist(playlistId, patch);
      pushToast(t("playlistUpdatedToast"));
      return true;
    } catch {
      setPlaylists((list) => list.map((pl) => (String(pl.id) === String(playlistId) ? prev : pl)));
      pushToast(t("playlistUpdateFailedToast"));
      return false;
    }
  }, [playlists, pushToast, t]);

  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const authUserRef = useRef(authUser);
  useEffect(() => { authUserRef.current = authUser; }, [authUser]);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const prevMemberCountRef = useRef(0);
  const firstSyncPendingRef = useRef(false);

  const applyRoomState = useCallback((fullRoom, action) => {
    const isFirstSync = firstSyncPendingRef.current;
    firstSyncPendingRef.current = false;
    const allowAutoplay = !isFirstSync || settingsRef.current.autoJoinRoomAudio !== false;
    const hardSeek = isFirstSync || ["seek", "select", "next", "prev"].includes(action);

    roomSyncRef.current = { position: fullRoom.position || 0, hardSeek, allowAutoplay };
    setRoomSyncTick((v) => v + 1);

    if (isFirstSync) setChatMessages(Array.isArray(fullRoom.chatMessages) ? fullRoom.chatMessages : []);
    setRoom(fullRoom);
    prevMemberCountRef.current = fullRoom.members?.length || 0;
    setQueueList(fullRoom.queue.map(normalizeTrack));
    setOrder(fullRoom.queue.map((_, i) => i));
    setPosInOrder(fullRoom.currentIndex >= 0 ? fullRoom.currentIndex : 0);
    setIsPlaying(isFirstSync ? (fullRoom.isPlaying && allowAutoplay) : fullRoom.isPlaying);
  }, []);

  const ensureSocket = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const socket = io(SOCKET_ORIGIN, {
      path: SOCKET_PATH,
      withCredentials: true,
      auth: (cb) => cb(getAuthToken() ? { token: getAuthToken() } : {}),
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
    socket.on("members-updated", (members) => {
      setRoom((r) => {
        if (!r) return r;
        const isHost = authUserRef.current && r.hostId === authUserRef.current.id;
        if (isHost && settingsRef.current.notifyRoomInvite !== false && members.length > prevMemberCountRef.current && prevMemberCountRef.current > 0) {
          const joined = members.find((m) => !r.members?.some((old) => old.id === m.id));
          if (joined) pushToast(`${joined.username} ${tRef.current("toastMemberJoined")}`);
        }
        prevMemberCountRef.current = members.length;
        return { ...r, members };
      });
    });
    socket.on("queue-updated", ({ queue, currentIndex }) => {
      setRoom((r) => (r ? { ...r, queue, currentIndex } : r));
      setQueueList(queue.map(normalizeTrack));
      setOrder(queue.map((_, i) => i));
      setPosInOrder(currentIndex >= 0 ? currentIndex : 0);
    });
    socket.on("playback-sync", (fullRoom) => { applyRoomState(fullRoom, fullRoom.action); });
    socket.on("skip-vote-updated", ({ count, total, needed }) => {
      setRoom((r) => (r ? { ...r, skipVote: { count, total, needed } } : r));
    });
    socket.on("chat-message", (msg) => {
      setChatMessages((prev) => {
        const next = [...prev, msg];
        return next.length > 300 ? next.slice(-300) : next;
      });
    });
    socketRef.current = socket;
    return socket;
  }, [applyRoomState]);

  const refreshPublicRooms = useCallback(() => { Api.publicRooms().then(setPublicRooms).catch(() => {}); }, []);

  const createRoom = useCallback((opts) => new Promise((resolve) => {
    if (!authUser) { pushToast(t("toastLoginToCreateRoom")); resolve(null); return; }
    const socket = ensureSocket();
    firstSyncPendingRef.current = true;
    socket.emit("create-room", opts, (res) => {
      if (res.error) { setRoomError(res.error); pushToast(res.error); resolve(null); return; }
      setRoomError(null);
      applyRoomState(res.room, "select");
      resolve(res.room);
    });
  }), [authUser, ensureSocket, applyRoomState, pushToast, t]);

  const joinRoom = useCallback((id, password) => new Promise((resolve) => {
    if (!authUser) { pushToast(t("toastLoginToJoinRoom")); resolve(null); return; }
    const socket = ensureSocket();
    firstSyncPendingRef.current = true;
    socket.emit("join-room", { roomId: id, password }, (res) => {
      if (res.error) { setRoomError(res.error); resolve(null); return; }
      setRoomError(null);
      applyRoomState(res.room, "select");
      resolve(res.room);
    });
  }), [authUser, ensureSocket, applyRoomState, pushToast, t]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit("leave-room");
    setRoom(null);
    roomSyncRef.current = null;
    setQueueList([]); setOrder([]); setPosInOrder(0); setIsPlaying(false);
    setChatMessages([]);
  }, []);

  const sendChatMessage = useCallback((text, extra = {}) => {
    if (!room || !authUser) return;
    const payload = { roomId: room.id, ...extra };
    const trimmed = (text || "").trim();
    if (trimmed) payload.text = trimmed.slice(0, 500);
    socketRef.current?.emit("chat-message", payload);
  }, [room, authUser]);

  const voteSkip = useCallback(() => new Promise((resolve) => {
    if (!room || !authUser) { resolve(null); return; }
    socketRef.current?.emit("skip-vote", { roomId: room.id }, (res) => resolve(res || null));
  }), [room, authUser]);

  useEffect(() => () => { socketRef.current?.disconnect(); }, []);

  const upNext = useMemo(() => order.slice(posInOrder + 1).map((i) => queueList[i]).filter(Boolean), [order, posInOrder, queueList]);
  const history = useMemo(() => order.slice(0, posInOrder).map((i) => queueList[i]).filter(Boolean), [order, posInOrder, queueList]);

  const value = {
    queueList, order, posInOrder, currentTrack, upNext, history,
    currentTrackHasLyrics, playSource,
    isPlaying, duration: clipDuration, isPreviewClip, audioFormat, loadingAudio,
    volume, muted, shuffle, repeat, liked, playlists,
    followedArtists, followedArtistIds, toggleFollowArtist, savedAlbums, savedAlbumIds, toggleSaveAlbum,
    playList, togglePlay, next, prev, seekRatio, seekTo, toggleShuffle, cycleRepeat,
    setShuffle,
    setVolume, toggleMute, toggleLike, addToQueueEnd, playNextInQueue, addAllToQueueEnd, playAllNext,
    removeFromQueue, moveQueueItem, clearUpNext, selectQueuePosition,
    playSingle, playRadio, createPlaylist, addToPlaylist, removeFromPlaylist, deletePlaylist, setPlaylistDetail, setPlaylistCover, updatePlaylistMeta, refreshPlaylists,
    registerProgressEl,
    suggestedQueue, promoteSuggestion,
    room, publicRooms, roomError, refreshPublicRooms, createRoom, joinRoom, leaveRoom,
    chatMessages, sendChatMessage, voteSkip,
    promptCast, getAudioSrc,
    localTracks, localScan, scanLocalFiles, clearLocalLibrary,
    getAnalyser,
  };
  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}