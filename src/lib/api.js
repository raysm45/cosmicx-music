import { getPreferredAudioQuality, getPreferredAudioFormat } from "./audioFormat.js";

export const API_BASE = import.meta.env.VITE_API_BASE || "https://api.cosmicx.fun";

async function throwApiError(res) {
  let message = `${res.status} ${res.statusText}`;
  try {
    const data = await res.json();
    if (data?.error) message = data.error;
  } catch { }
  const err = new Error(message);
  err.status = res.status;
  throw err;
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) await throwApiError(res);
  return res.json();
}
async function apiGetPublic(path) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "omit" });
  if (!res.ok) await throwApiError(res);
  return res.json();
}
async function apiSend(path, method, body, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    keepalive: !!opts.keepalive,
  });
  if (!res.ok) await throwApiError(res);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const streamTicketCache = new Map();
const TICKET_MARGIN_S = 30;

export const Api = {
  discover: (seed, cursor, limit, type, feed) =>
    apiGet(`/api/discover?${seed ? `seed=${encodeURIComponent(seed)}&` : ""}cursor=${cursor || 0}&limit=${limit || 20}${type ? `&type=${encodeURIComponent(type)}` : ""}${feed ? `&feed=${encodeURIComponent(feed)}` : ""}`),
  forYou: (seed, cursor, limit, type) =>
    apiGet(`/api/discover/for-you?${seed ? `seed=${encodeURIComponent(seed)}&` : ""}cursor=${cursor || 0}&limit=${limit || 24}${type ? `&type=${encodeURIComponent(type)}` : ""}`),
  search: async (q, cursor) => {
    const res = await apiGet(`/api/search?q=${encodeURIComponent(q)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    const songs = Array.isArray(res) ? res : res?.songs || [];
    const extras = Array.isArray(res) ? {} : res;
    const mapped = songs.map((s) => ({
      ...s,
      artist: s.artist?.name ?? (typeof s.artist === "string" ? s.artist : null),
      thumbnail: s.thumbnail ?? s.cover ?? null,
    }));
    mapped.nextCursor = Array.isArray(res) ? null : res?.nextCursor ?? null;
    mapped.artists = extras?.artists || [];
    mapped.albums = extras?.albums || [];
    mapped.videos = extras?.videos || [];
    return mapped;
  },
  artist: (q) => apiGet(`/api/artist?q=${encodeURIComponent(q)}`),
  artistQuick: (q) => apiGet(`/api/artist/quick?q=${encodeURIComponent(q)}`),
  appleMusicHero: (name, country = "us") =>
    apiGetPublic(`/api/apple-music/artist-hero?q=${encodeURIComponent(name)}&country=${encodeURIComponent(country)}`),
  appleMusicSearch: (q, limit = 5) =>
    apiGetPublic(`/api/apple-music/search?q=${encodeURIComponent(q)}&country=us&limit=${limit}`),
  appleMusicVideoUrl: (url) => `${API_BASE}/api/apple-music/video?u=${encodeURIComponent(url)}`,
  album: (id) => apiGet(`/api/album/${id}`),
  albumSearch: (q) => apiGet(`/api/album?q=${encodeURIComponent(q)}`),
  track: (id) => apiGet(`/api/track/${id}`),
  trackDescription: (videoId) =>
    apiGet(`/api/track/description?videoId=${encodeURIComponent(videoId || "")}`),
  similar: (args) =>
    apiGet(`/api/similar?${args.trackId ? `trackId=${encodeURIComponent(args.trackId)}` : `title=${encodeURIComponent(args.title)}&artist=${encodeURIComponent(args.artist || "")}`}`),

  animatedArtwork: (song, artist, refresh = false) => {
    const qs = new URLSearchParams({ song: song || "" });
    if (artist) qs.set("artist", artist);
    if (refresh) qs.set("refresh", "1");
    return apiGetPublic(`/api/artwork?${qs.toString()}`);
  },

  lyrics: ({ title, artist, album, duration }) => {
    const qs = new URLSearchParams({ title: title || "" });
    if (artist) qs.set("artist", artist);
    if (album) qs.set("album", album);
    if (duration) qs.set("duration", String(Math.round(duration)));
    return apiGet(`/api/lyrics?${qs.toString()}`);
  },

  async getStreamUrl(videoId, { prefetch = false, forceFresh = false, title = "", artist = "" } = {}) {
    if (!videoId) return null;
    const quality = getPreferredAudioQuality();
    const format = getPreferredAudioFormat();
    const cacheKey = `${videoId}:${format}`;
    const nowS = Math.floor(Date.now() / 1000);
    const suffix = prefetch ? "?purpose=prefetch" : "";
    const cached = !forceFresh && streamTicketCache.get(cacheKey);
    if (cached && cached.expiresAt - TICKET_MARGIN_S > nowS) {
      return `${API_BASE}/api/s/${encodeURIComponent(cached.sid)}${suffix}`;
    }
    // Format FLAC butuh title+artist karena sumbernya stream.py (YouTube
    // nggak punya FLAC). Tanpa itu, backend fallback ke transcode ffmpeg.
    const body = { videoId, quality, format };
    if (title) body.title = title;
    if (artist) body.artist = artist;
    const ticket = await apiSend("/api/stream-ticket", "POST", body);
    if (!ticket?.sid) throw new Error("tiket stream kosong");
    streamTicketCache.set(cacheKey, ticket);
    return `${API_BASE}/api/s/${encodeURIComponent(ticket.sid)}${suffix}`;
  },

  invalidateStreamTicket(videoId) {
    if (!videoId) return;
    for (const key of streamTicketCache.keys()) {
      if (key.startsWith(`${videoId}:`)) streamTicketCache.delete(key);
    }
  },

  // Stream music VIDEO (dedicated player, bukan embed YouTube).
  // Ticket khusus kind=video, lalu cek type-nya (hls / mp4) via meta
  // supaya frontend tahu pakai hls.js atau <video> native, dan biar
  // resolve yt-dlp keburu kepanaskan sebelum <video> mulai buffering.
  async musicVideoStream(videoId) {
    if (!videoId) throw new Error("videoId kosong");
    const quality = getPreferredAudioQuality();
    const ticket = await apiSend("/api/stream-ticket", "POST", { videoId, quality, kind: "video" });
    if (!ticket?.sid) throw new Error("tiket video kosong");
    const sid = encodeURIComponent(ticket.sid);
    const url = `${API_BASE}/api/s/${sid}`;
    let type = "mp4";
    try {
      const meta = await apiGet(`/api/s/${sid}?meta=1`);
      if (meta?.ok && (meta.type === "hls" || meta.type === "mp4")) type = meta.type;
    } catch { /* meta gagal -> coba native mp4 dulu */ }
    return { url, type };
  },

  trackAudioInfo: (videoId) =>
    apiGet(`/api/track/audio-info?videoId=${encodeURIComponent(videoId || "")}&quality=${getPreferredAudioQuality()}&format=${getPreferredAudioFormat()}`),

  me: () => apiGet("/auth/me"),
  logout: () => apiSend("/auth/logout", "POST", undefined, { keepalive: true }),
  discordLoginUrl: () => `${API_BASE}/auth/discord`,
  googleLoginUrl: () => `${API_BASE}/auth/google`,

  likes: () => apiGet("/api/me/likes"),
  like: (videoId, meta) => apiSend(`/api/me/likes/${encodeURIComponent(videoId)}`, "POST", meta),
  unlike: (videoId) => apiSend(`/api/me/likes/${encodeURIComponent(videoId)}`, "DELETE"),
  history: (limit) => apiGet(`/api/me/history?limit=${limit || 50}`),
  addHistory: (videoId, meta) => apiSend("/api/me/history", "POST", { videoId, ...meta }),

  recentSearches: (limit) => apiGet(`/api/me/search-history/recent?limit=${limit || 10}`),
  suggestSearches: (q) => apiGet(`/api/me/search-history/suggest?q=${encodeURIComponent(q)}`),
  recordSearch: (query) => apiSend("/api/me/search-history", "POST", { query }),
  deleteSearch: (query) => apiSend(`/api/me/search-history/one?query=${encodeURIComponent(query)}`, "DELETE"),
  clearSearchHistory: () => apiSend("/api/me/search-history", "DELETE"),

  getSettings: () => apiGet("/api/me/settings"),
  putSettings: (patch) => apiSend("/api/me/settings", "PUT", patch),
  resetSettings: () => apiSend("/api/me/settings/reset", "POST"),

  playlists: () => apiGet("/api/playlists"),
  createPlaylist: (body) => apiSend("/api/playlists", "POST", body),
  playlist: (id) => apiGet(`/api/playlists/${id}`),
  updatePlaylist: (id, body) => apiSend(`/api/playlists/${id}`, "PATCH", body),
  addSong: (id, videoId, meta) => apiSend(`/api/playlists/${id}/songs`, "POST", { videoId, ...meta }),
  removeSong: (id, videoId) => apiSend(`/api/playlists/${id}/songs/${encodeURIComponent(videoId)}`, "DELETE"),
  deletePlaylist: (id) => apiSend(`/api/playlists/${id}`, "DELETE"),

  resolveYoutubeImport: (url) => apiSend("/api/import/youtube/resolve", "POST", { url }),
  commitYoutubeImport: (body) => apiSend("/api/import/youtube/commit", "POST", body),

  publicRooms: () => apiGet("/api/rooms"),

  discordActivityToken: (code) => apiSend("/api/discord-activity/token", "POST", { code }),
};