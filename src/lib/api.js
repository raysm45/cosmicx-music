import { getPreferredAudioQuality, getPreferredAudioFormat } from "./audioFormat.js";

const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE || "https://api.cosmicx.fun";

export const API_BASE = DEFAULT_API_BASE;

export const SOCKET_ORIGIN = DEFAULT_API_BASE;
export const SOCKET_PATH = "/socket.io";
let authToken = null;
export function setAuthToken(token) { authToken = token || null; }
export function getAuthToken() { return authToken; }
function withAuth(headers) {
  if (!authToken) return headers;
  return { ...(headers || {}), Authorization: `Bearer ${authToken}` };
}

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
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", headers: withAuth(undefined) });
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
    headers: withAuth(body ? { "Content-Type": "application/json" } : undefined),
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
      artistObj: typeof s.artist === "object" && s.artist ? s.artist : null,
      thumbnail: s.thumbnail ?? s.cover ?? null,
      cover: s.cover ?? s.thumbnail ?? null,
      explicit: !!s.explicit,
    }));
    mapped.nextCursor = Array.isArray(res) ? null : res?.nextCursor ?? null;
    mapped.artists = extras?.artists || [];
    mapped.albums = extras?.albums || [];
    mapped.videos = extras?.videos || [];
    mapped.top = extras?.top || null;
    return mapped;
  },
  suggestLive: async (q, signal) => {
    const res = await fetch(`${API_BASE}/api/search/suggest?q=${encodeURIComponent(q)}`, { credentials: "include", headers: withAuth(undefined), signal });
    if (!res.ok) await throwApiError(res);
    const data = await res.json();
    return { suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [], titles: Array.isArray(data?.titles) ? data.titles : [] };
  },
  artist: (q) => apiGet(`/api/artist?q=${encodeURIComponent(q)}`),
  artistQuick: (q) => apiGet(`/api/artist/quick?q=${encodeURIComponent(q)}`),
  appleMusicHero: (name, country = "us") =>
    apiGetPublic(`/api/apple-music/artist-hero?q=${encodeURIComponent(name)}&country=${encodeURIComponent(country)}&key=motionArtistSquare1x1`),
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

  async getStreamUrl(videoId, { prefetch = false, forceFresh = false, title = "", artist = "", format: formatOverride = "" } = {}) {
    if (!videoId) return null;
    const quality = getPreferredAudioQuality();
    // formatOverride dipakai fitur unduh supaya format file bisa dipilih
    // terpisah dari format pemutaran (Settings > Format audio).
    const format = formatOverride || getPreferredAudioFormat();
    const cacheKey = `${videoId}:${format}`;
    const nowS = Math.floor(Date.now() / 1000);
    // URL prefetch & pemutaran SENGAJA sama (tanpa suffix). Dulu prefetch
    // memakai `?purpose=prefetch` sementara pemutaran tidak, sehingga browser
    // menganggapnya dua resource berbeda: byte pra-unduhan terbuang dan lagu
    // (FLAC 20–29 MB) diunduh DUA kali — merebut bandwidth sampai audio
    // putus-putus. Dengan satu URL, pra-unduhan benar-benar dipakai saat lagu
    // diputar. Flag `prefetch` hanya dipertahankan demi pemanggil lama.
    void prefetch;
    const cached = !forceFresh && streamTicketCache.get(cacheKey);
    if (cached && cached.expiresAt - TICKET_MARGIN_S > nowS) {
      return `${API_BASE}/api/s/${encodeURIComponent(cached.sid)}`;
    }
    const body = { videoId, quality, format };
    if (title) body.title = title;
    if (artist) body.artist = artist;
    const ticket = await apiSend("/api/stream-ticket", "POST", body);
    if (!ticket?.sid) throw new Error("tiket stream kosong");
    streamTicketCache.set(cacheKey, ticket);
    return `${API_BASE}/api/s/${encodeURIComponent(ticket.sid)}`;
  },

  // Warm: panggil SEBELUM men-set src pemutar. Untuk FLAC, server menyiapkan
  // asset (engine) dan menunggu sampai siap, lalu balas JSON kecil — tidak
  // mengalirkan isi. Request media berikutnya jadi hangat: dapat Content-Length
  // (seekable) dan tidak dibatalkan Chrome karena diam. Gagal -> abaikan saja.
  async warmStream(url) {
    if (!url) return false;
    const u = url.includes("?") ? `${url}&warm=1` : `${url}?warm=1`;
    try {
      const res = await fetch(u, { method: "GET", cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Unduh lagu lewat tiket stream yang sama dengan pemutaran — server
  // menambahkan `Content-Disposition: attachment; filename="Judul - Artist.ext"`
  // ketika `dl=1`, jadi fetch berat tidak diperlukan.
  async downloadSong(track, { format = "" } = {}) {
    const artistName = (typeof track?.artist === "string" ? track.artist : track?.artist?.name) || "";
    let videoId = track?.videoId;
    // Lagu dari katalog (mis. Deezer) belum punya videoId: cari padanannya dulu,
    // sama seperti yang dilakukan pemutaran mode Penuh.
    if (!videoId && track?.title) {
      try {
        const hits = await this.search(`${track.title} ${artistName}`.trim());
        videoId = hits?.[0]?.videoId || null;
      } catch { videoId = null; }
    }
    if (!videoId) videoId = track?.id;
    if (!videoId) throw new Error("videoId kosong");
    const url = await this.getStreamUrl(videoId, {
      title: track?.title || "",
      artist: artistName,
      format,
    });
    const a = document.createElement("a");
    a.href = url.includes("?") ? `${url}&dl=1` : `${url}?dl=1`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  invalidateStreamTicket(videoId) {
    if (!videoId) return;
    for (const key of streamTicketCache.keys()) {
      if (key.startsWith(`${videoId}:`)) streamTicketCache.delete(key);
    }
  },
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
    } catch {}
    return { url, type };
  },

  trackAudioInfo: (videoId) =>
    apiGet(`/api/track/audio-info?videoId=${encodeURIComponent(videoId || "")}&quality=${getPreferredAudioQuality()}&format=${getPreferredAudioFormat()}`),

  me: () => apiGet("/auth/me"),
  logout: () => {
    const p = apiSend("/auth/logout", "POST", undefined, { keepalive: true });
    setAuthToken(null);
    return p;
  },
  discordLoginUrl: () => `${API_BASE}/auth/discord`,
  googleLoginUrl: () => `${API_BASE}/auth/google`,

  likes: () => apiGet("/api/me/likes"),
  like: (videoId, meta) => apiSend(`/api/me/likes/${encodeURIComponent(videoId)}`, "POST", meta),
  unlike: (videoId) => apiSend(`/api/me/likes/${encodeURIComponent(videoId)}`, "DELETE"),
  followedArtists: () => apiGet("/api/me/artists"),
  followArtist: (artistId, meta) => apiSend(`/api/me/artists/${encodeURIComponent(artistId)}`, "POST", meta),
  unfollowArtist: (artistId) => apiSend(`/api/me/artists/${encodeURIComponent(artistId)}`, "DELETE"),
  savedAlbums: () => apiGet("/api/me/albums"),
  saveAlbum: (albumId, meta) => apiSend(`/api/me/albums/${encodeURIComponent(albumId)}`, "POST", meta),
  unsaveAlbum: (albumId) => apiSend(`/api/me/albums/${encodeURIComponent(albumId)}`, "DELETE"),
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
  ytPlaylist: (id) => apiGet(`/api/playlists/ytm/${encodeURIComponent(id)}`),
  updatePlaylist: (id, body) => apiSend(`/api/playlists/${id}`, "PATCH", body),
  addSong: (id, videoId, meta) => apiSend(`/api/playlists/${id}/songs`, "POST", { videoId, ...meta }),
  removeSong: (id, videoId) => apiSend(`/api/playlists/${id}/songs/${encodeURIComponent(videoId)}`, "DELETE"),
  deletePlaylist: (id) => apiSend(`/api/playlists/${id}`, "DELETE"),

  resolveYoutubeImport: (url) => apiSend("/api/import/youtube/resolve", "POST", { url }),
  commitYoutubeImport: (body) => apiSend("/api/import/youtube/commit", "POST", body),
  resolveSpotifyImport: (url) => apiSend("/api/import/spotify/resolve", "POST", { url }),

  publicRooms: () => apiGet("/api/rooms"),
};