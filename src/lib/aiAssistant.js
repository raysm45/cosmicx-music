import { API_BASE, Api, getAuthToken } from "./api.js";

/* ------------------------------------------------------------------ *
 *  AI Assistant engine (v2)
 *
 *  Alur satu giliran:
 *    user -> POST /api/ai-chat -> model balas teks "thought" + tool_calls
 *         -> tool dieksekusi di browser (web_search, find_songs, playlist, ...)
 *         -> hasil dikirim balik -> ulangi sampai model membalas tanpa tool_calls
 *
 *  Setiap langkah dilaporkan lewat opts.onEvent supaya UI bisa menampilkan
 *  proses "berpikir" ala Claude. Kontrak ke backend ada di AI_BACKEND.md.
 * ------------------------------------------------------------------ */

const AI_ENDPOINT = `${API_BASE}/api/ai-chat`;
const MAX_ROUNDS = 24;            // riset + cocokkan lagu + buat playlist butuh banyak putaran
const KEEP_TURNS = 6;             // berapa giliran user terakhir yang dikirim ulang ke model
const OLD_TOOL_RESULT_MAX = 700;  // hasil tool lama (web page dll) dipangkas supaya token tidak bengkak
const FIND_CONCURRENCY = 4;
const MAX_FIND_QUERIES = 40;
const WEB_TEXT_MAX = 8000;

// Tool yang aman dijalankan paralel (tidak mengubah state apa pun).
const READ_ONLY_TOOLS = new Set([
  "web_search", "read_webpage", "find_songs", "search_tracks", "search_albums",
  "get_similar_tracks", "get_lyrics", "list_playlists", "list_liked_tracks",
  "get_recently_played", "get_playlist_tracks", "get_queue",
]);

const tr = (lang, id, en) => (lang === "en" ? en : id);
const clip = (s, n) => { const v = String(s ?? ""); return v.length > n ? `${v.slice(0, n)}…` : v; };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

function abortError() { const e = new Error("aborted"); e.name = "AbortError"; return e; }
function throwIfAborted(signal) { if (signal?.aborted) throw abortError(); }

/* ---------------------------- helpers lagu ---------------------------- */

function toTrack(raw) {
  if (!raw) return null;
  const id = raw.video_id || raw.videoId || raw.id;
  if (!id) return null;
  return {
    id,
    videoId: id,
    title: raw.title,
    cover: raw.cover || raw.thumbnail || null,
    artist:
      typeof raw.artist === "string"
        ? { name: raw.artist }
        : raw.artist || (raw.artist_name ? { name: raw.artist_name } : null),
    album: raw.album || null,
    duration: raw.duration || null,
  };
}

function fromSearchRow(r) {
  const id = r?.videoId || r?.id;
  if (!id) return null;
  return {
    id,
    videoId: id,
    title: r.title,
    cover: r.cover || r.thumbnail || null,
    artist: typeof r.artist === "string" ? { name: r.artist } : (r.artist || null),
    album: r.album || null,
    duration: r.duration || null,
  };
}

const artistName = (t) => (typeof t?.artist === "string" ? t.artist : t?.artist?.name) || "";

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const NOISE_RE = /\b(karaoke|instrumental|cover|remix|slowed|sped up|reverb|nightcore|8d|tribute|8 bit)\b/;
const STOP_TOKENS = new Set(["official", "video", "audio", "lyric", "lyrics", "mv", "feat", "ft", "the"]);

/** Pilih hasil pencarian katalog yang paling cocok dengan "Artis - Judul". */
export function pickBest(query, rows) {
  const qNorm = norm(query);
  const qTokens = qNorm.split(" ").filter((t) => t && !STOP_TOKENS.has(t));
  if (!qTokens.length) return null;
  const qHasNoise = NOISE_RE.test(qNorm);
  let best = null;
  (rows || []).slice(0, 8).forEach((row, idx) => {
    const track = fromSearchRow(row);
    if (!track) return;
    const hay = norm(`${track.title || ""} ${artistName(track)}`);
    const hayTokens = new Set(hay.split(" "));
    let hit = 0;
    for (const t of qTokens) if (hayTokens.has(t) || (t.length >= 4 && hay.includes(t))) hit += 1;
    let score = hit / qTokens.length;
    if (!qHasNoise && NOISE_RE.test(hay)) score -= 0.35;
    score -= idx * 0.01; // seri: urutan relevansi dari backend jadi tie-breaker
    if (!best || score > best.score) best = { track, score };
  });
  return best && best.score >= 0.5 ? best : null;
}

/* ---------------------------- jaringan ---------------------------- */

async function aiGet(path, signal) {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const raw = data?.error?.message || data?.error || `${res.status} ${res.statusText}`;
    const err = new Error(typeof raw === "string" ? raw : JSON.stringify(raw));
    err.status = res.status;
    throw err;
  }
  return data;
}

async function resolveTrack(trackId, trackCache) {
  if (trackCache.has(trackId)) return trackCache.get(trackId);
  try {
    const detail = await Api.track(trackId);
    const track = toTrack(detail);
    if (track) trackCache.set(trackId, track);
    return track;
  } catch {
    return null;
  }
}

/** Tambah banyak lagu ke playlist tanpa spam toast, dengan hitungan akurat. */
async function bulkAddToPlaylist(playlistId, ids, ctx, env) {
  const unique = [...new Set((ids || []).map(String))];
  let added = 0;
  const failed = [];
  const unknown = [];
  for (const id of unique) {
    throwIfAborted(env.signal);
    const track = env.trackCache.get(id);
    if (!track) { unknown.push(id); continue; }
    try {
      await Api.addSong(playlistId, track.videoId || track.id, {
        title: track.title,
        artistName: artistName(track) || null,
        thumbnail: track.cover,
        albumId: track.album?.id || null,
        albumTitle: track.album?.title || null,
        duration: track.duration,
        explicit: !!track.explicit,
      });
      added += 1;
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      failed.push(id);
    }
  }
  // sinkronkan state playlist di UI sekali saja
  try {
    const detail = await Api.playlist(playlistId);
    if (detail && ctx.setPlaylistDetail) ctx.setPlaylistDetail(detail);
    else ctx.refreshPlaylists?.();
  } catch { ctx.refreshPlaylists?.(); }
  return { added, failed, unknown };
}

/* ---------------------------- eksekusi tool ---------------------------- */

async function executeTool(name, input, ctx, env, callId) {
  const { trackCache, signal, lang, emit } = env;
  try {
    throwIfAborted(signal);

    /* ---- riset web ---- */
    if (name === "web_search") {
      const q = String(input.query || "").trim();
      if (!q) return { error: "query kosong." };
      const limit = Math.min(Math.max(Number(input.max_results) || 6, 1), 10);
      let data;
      try {
        data = await aiGet(`/api/ai/web-search?q=${encodeURIComponent(q)}&limit=${limit}`, signal);
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        if (e?.status === 404) return { error: "Fitur web search belum aktif di server. Lanjutkan dengan search_tracks / pengetahuanmu sendiri." };
        throw e;
      }
      const results = (data?.results || []).slice(0, limit).map((r) => ({
        title: clip(r.title, 160),
        url: r.url,
        snippet: clip(r.snippet || r.content || "", 320),
      }));
      return { query: q, count: results.length, results };
    }

    if (name === "read_webpage") {
      const url = String(input.url || "").trim();
      if (!/^https?:\/\//i.test(url)) return { error: "url harus diawali http:// atau https://" };
      let data;
      try {
        data = await aiGet(`/api/ai/read-page?url=${encodeURIComponent(url)}`, signal);
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        if (e?.status === 404) return { error: "Fitur baca halaman belum aktif di server." };
        throw e;
      }
      const text = clip(data?.text || "", WEB_TEXT_MAX);
      if (!text) return { error: "Halaman kosong atau tidak bisa dibaca." };
      return { url, title: data?.title || hostOf(url), chars: text.length, text };
    }

    /* ---- katalog lagu ---- */
    if (name === "find_songs") {
      const raw = Array.isArray(input.queries) ? input.queries : [];
      const queries = raw
        .map((q) => (typeof q === "string" ? q : [q?.artist, q?.title].filter(Boolean).join(" ")))
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_FIND_QUERIES);
      if (!queries.length) return { error: 'queries kosong. Isi dengan daftar "Artis - Judul".' };

      const rows = new Array(queries.length).fill(null);
      const liveItems = () => rows.filter(Boolean).map((r) => ({
        text: r.hit ? `${r.hit.track.title} — ${artistName(r.hit.track)}` : r.query,
        ok: !!r.hit,
      }));

      await runPool(queries, FIND_CONCURRENCY, async (q, i) => {
        let hit = null;
        try { hit = pickBest(q, await ctx.search(q)); } catch (e) { if (e?.name === "AbortError") throw e; }
        rows[i] = { query: q, hit };
        if (hit) trackCache.set(hit.track.id, hit.track);
        emit({ type: "tool_progress", id: callId, items: liveItems(), summary: tr(lang, `${rows.filter(Boolean).length}/${queries.length} dicek`, `${rows.filter(Boolean).length}/${queries.length} checked`) });
      }, signal);

      const seen = new Set();
      const songs = rows.map((r) => {
        if (!r.hit) return { query: r.query, found: false };
        const id = r.hit.track.id;
        if (seen.has(id)) return { query: r.query, found: false, duplicate_of: id };
        seen.add(id);
        return { query: r.query, found: true, track_id: id, title: r.hit.track.title, artist: artistName(r.hit.track), confidence: Math.round(r.hit.score * 100) / 100 };
      });
      return { matched: songs.filter((s) => s.found).length, total: songs.length, songs };
    }

    if (name === "search_tracks") {
      const results = await ctx.search(input.query);
      const mapped = (results || []).slice(0, 10).map((r) => {
        const track = fromSearchRow(r);
        if (!track) return null;
        trackCache.set(track.id, track);
        return { track_id: track.id, title: track.title, artist: artistName(track) || null };
      }).filter(Boolean);
      return { tracks: mapped };
    }

    /* ---- playlist ---- */
    if (name === "create_playlist_with_tracks") {
      const ids = input.track_ids || [];
      if (!ids.length) return { error: "track_ids kosong. Panggil find_songs dulu untuk mendapatkan track_id." };
      const playlistId = await ctx.createPlaylist(input.name, input.description || "");
      if (!playlistId) return { error: "Gagal membuat playlist. Pastikan pengguna sudah login." };
      const r = await bulkAddToPlaylist(playlistId, ids, ctx, env);
      return {
        playlist_id: playlistId,
        tracks_added: r.added,
        ...(r.failed.length ? { failed_track_ids: r.failed } : {}),
        ...(r.unknown.length ? { unknown_track_ids: r.unknown } : {}),
      };
    }

    if (name === "add_to_existing_playlist") {
      const r = await bulkAddToPlaylist(input.playlist_id, input.track_ids || [], ctx, env);
      return {
        tracks_added: r.added,
        ...(r.failed.length ? { failed_track_ids: r.failed } : {}),
        ...(r.unknown.length ? { unknown_track_ids: r.unknown } : {}),
      };
    }

    if (name === "play_track") {
      const track = trackCache.get(input.track_id);
      if (!track) return { error: "track_id tidak dikenali. Panggil find_songs / search_tracks dulu." };
      ctx.playSingle(track);
      return { ok: true, now_playing: track.title };
    }

    if (name === "list_playlists") {
      return {
        playlists: (ctx.playlists || []).map((p) => ({
          id: p.id,
          name: p.name,
          song_count: p.songs?.length ?? p.song_count ?? 0,
        })),
      };
    }

    if (name === "delete_playlist") {
      const exists = (ctx.playlists || []).some((p) => String(p.id) === String(input.playlist_id));
      if (!exists) return { error: "playlist_id tidak dikenali. Panggil list_playlists dulu." };
      await ctx.deletePlaylist(input.playlist_id);
      return { ok: true };
    }

    if (name === "rename_playlist") {
      const ok = await ctx.updatePlaylistMeta(input.playlist_id, {
        name: input.name,
        description: input.description,
        isPublic: input.is_public,
      });
      return ok ? { ok: true } : { error: "Gagal mengubah playlist." };
    }

    if (name === "remove_track_from_playlist") {
      await ctx.removeFromPlaylist(input.playlist_id, input.track_id);
      return { ok: true };
    }

    if (name === "like_track") {
      const track = await resolveTrack(input.track_id, trackCache);
      if (!track) return { error: "track_id tidak dikenali." };
      if (ctx.liked?.has(String(track.videoId || track.id))) return { ok: true, already_liked: true };
      await ctx.toggleLike(track);
      return { ok: true, title: track.title };
    }

    if (name === "unlike_track") {
      const track = await resolveTrack(input.track_id, trackCache);
      if (!track) return { error: "track_id tidak dikenali." };
      if (!ctx.liked?.has(String(track.videoId || track.id))) return { ok: true, already_not_liked: true };
      await ctx.toggleLike(track);
      return { ok: true, title: track.title };
    }

    if (name === "list_liked_tracks") {
      const rows = await Api.likes();
      const mapped = (rows || []).slice(0, 50).map((r) => {
        const track = toTrack(r);
        if (track) trackCache.set(track.id, track);
        return { track_id: track?.id, title: r.title, artist: artistName(track) || null };
      });
      return { tracks: mapped };
    }

    if (name === "get_recently_played") {
      const limit = Math.min(Number(input.limit) || 20, 100);
      const rows = await Api.history(limit);
      const mapped = (rows || []).map((r) => {
        const track = toTrack(r);
        if (track) trackCache.set(track.id, track);
        return { track_id: track?.id, title: r.title, artist: artistName(track) || null, played_at: r.played_at };
      });
      return { history: mapped };
    }

    if (name === "get_similar_tracks") {
      const seed = await resolveTrack(input.track_id, trackCache);
      if (!seed) return { error: "track_id tidak dikenali. Panggil find_songs / search_tracks dulu." };
      const res = await Api.similar({ trackId: seed.videoId || seed.id });
      const mapped = (res?.items || []).slice(0, 10).map((r) => {
        const track = toTrack(r);
        if (track) trackCache.set(track.id, track);
        return { track_id: track?.id, title: r.title, artist: artistName(track) || null };
      });
      return { seed_track: seed.title, tracks: mapped };
    }

    if (name === "get_lyrics") {
      const res = await Api.lyrics({ title: input.title, artist: input.artist });
      if (!res || (!res.plain && !res.synced && !res.wordSynced)) {
        return { error: "Lirik tidak ditemukan untuk lagu ini." };
      }
      return { lyrics: res.plain || null, has_synced_lyrics: !!(res.synced || res.wordSynced) };
    }

    if (name === "play_playlist") {
      const detail = await Api.playlist(input.playlist_id);
      const tracks = (detail?.songs || []).map(toTrack).filter(Boolean);
      if (!tracks.length) return { error: "Playlist kosong atau tidak ditemukan." };
      tracks.forEach((tr_) => trackCache.set(tr_.id, tr_));
      ctx.playList(tracks, 0, "ai-assistant");
      return { ok: true, playlist_name: detail?.name, track_count: tracks.length };
    }

    if (name === "get_playlist_tracks") {
      const detail = await Api.playlist(input.playlist_id);
      if (!detail) return { error: "Playlist tidak ditemukan." };
      const tracks = (detail?.songs || []).map(toTrack).filter(Boolean);
      tracks.forEach((tr_) => trackCache.set(tr_.id, tr_));
      const mapped = tracks.map((tr_) => ({ track_id: tr_.id, title: tr_.title, artist: artistName(tr_) || null }));
      return { playlist_id: input.playlist_id, playlist_name: detail?.name, track_count: mapped.length, tracks: mapped };
    }

    if (name === "search_albums") {
      const results = await Api.albumSearch(input.query);
      const mapped = (results || []).slice(0, 10).map((a) => ({
        album_id: a.id,
        title: a.title,
        artist: (typeof a.artist === "string" ? a.artist : a.artist?.name) || null,
      }));
      return { albums: mapped };
    }

    if (name === "play_album") {
      const detail = await Api.album(input.album_id);
      const tracks = (detail?.tracks || []).map(toTrack).filter(Boolean);
      if (!tracks.length) return { error: "Album kosong atau tidak ditemukan." };
      tracks.forEach((tr_) => trackCache.set(tr_.id, tr_));
      ctx.playList(tracks, 0, "ai-assistant");
      return { ok: true, album_title: detail?.title, track_count: tracks.length };
    }

    if (name === "get_queue") {
      const mapped = (ctx.upNext || []).map((t, idx) => ({ queue_index: idx, track_id: t.id, title: t.title, artist: artistName(t) || null }));
      return { queue_length: mapped.length, queue: mapped };
    }

    if (name === "add_to_queue") {
      const track = trackCache.get(input.track_id);
      if (!track) return { error: "track_id tidak dikenali. Panggil find_songs / search_tracks dulu." };
      if (input.position === "next") ctx.playNextInQueue(track);
      else ctx.addToQueueEnd(track);
      return { ok: true, added: track.title, position: input.position === "next" ? "next" : "end" };
    }

    if (name === "remove_from_queue") {
      const idx = Number(input.queue_index);
      if (!Number.isInteger(idx) || idx < 0) return { error: "queue_index tidak valid." };
      const upNext = ctx.upNext || [];
      if (idx >= upNext.length) return { error: "queue_index di luar jangkauan. Panggil get_queue dulu." };
      const removed = upNext[idx];
      ctx.removeFromQueue(idx);
      return { ok: true, removed: removed?.title || null };
    }

    /* ---- rencana (hanya tampilan; tidak menyentuh data apa pun) ---- */
    if (name === "update_plan") {
      const steps = (Array.isArray(input.steps) ? input.steps : [])
        .map((s) => ({
          text: clip(typeof s === "string" ? s : (s?.text || s?.title || ""), 140),
          status: ["done", "in_progress", "pending"].includes(s?.status) ? s.status : "pending",
        }))
        .filter((s) => s.text)
        .slice(0, 10);
      emit({ type: "plan", steps });
      return { ok: true };
    }

    return { error: `Tool tidak dikenal: ${name}` };
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    return { error: err?.message || "Tool gagal dijalankan." };
  }
}

async function runPool(items, limit, worker, signal) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      throwIfAborted(signal);
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

/* ---------------------------- label untuk UI ---------------------------- */

function describeStart(name, input, lang) {
  const L = (id, en) => tr(lang, id, en);
  const q = input?.query ? String(input.query) : "";
  switch (name) {
    case "web_search": return { label: L("Mencari di web", "Searching the web"), detail: q };
    case "read_webpage": return { label: L("Membaca halaman", "Reading page"), detail: hostOf(input?.url) };
    case "find_songs": {
      const n = Array.isArray(input?.queries) ? input.queries.length : 0;
      return { label: L("Mencocokkan lagu di katalog", "Matching songs in the catalog"), detail: n ? L(`${n} lagu`, `${n} songs`) : "" };
    }
    case "search_tracks": return { label: L("Mencari lagu", "Searching songs"), detail: q };
    case "search_albums": return { label: L("Mencari album", "Searching albums"), detail: q };
    case "get_similar_tracks": return { label: L("Mencari lagu yang mirip", "Finding similar songs"), detail: "" };
    case "get_lyrics": return { label: L("Mengambil lirik", "Fetching lyrics"), detail: [input?.artist, input?.title].filter(Boolean).join(" — ") };
    case "create_playlist_with_tracks": return { label: L("Membuat playlist", "Creating playlist"), detail: input?.name || "" };
    case "add_to_existing_playlist": return { label: L("Menambahkan ke playlist", "Adding to playlist"), detail: "" };
    case "remove_track_from_playlist": return { label: L("Menghapus lagu dari playlist", "Removing song from playlist"), detail: "" };
    case "delete_playlist": return { label: L("Menghapus playlist", "Deleting playlist"), detail: "" };
    case "rename_playlist": return { label: L("Mengubah playlist", "Updating playlist"), detail: input?.name || "" };
    case "list_playlists": return { label: L("Melihat playlist kamu", "Checking your playlists"), detail: "" };
    case "get_playlist_tracks": return { label: L("Membuka isi playlist", "Opening playlist"), detail: "" };
    case "play_playlist": return { label: L("Memutar playlist", "Playing playlist"), detail: "" };
    case "play_album": return { label: L("Memutar album", "Playing album"), detail: "" };
    case "play_track": return { label: L("Memutar lagu", "Playing song"), detail: "" };
    case "like_track": return { label: L("Menyukai lagu", "Liking song"), detail: "" };
    case "unlike_track": return { label: L("Batal menyukai lagu", "Unliking song"), detail: "" };
    case "list_liked_tracks": return { label: L("Melihat lagu yang kamu suka", "Checking your liked songs"), detail: "" };
    case "get_recently_played": return { label: L("Melihat riwayat putar", "Checking listening history"), detail: "" };
    case "get_queue": return { label: L("Melihat antrean", "Checking the queue"), detail: "" };
    case "add_to_queue": return { label: L("Menambah ke antrean", "Adding to queue"), detail: "" };
    case "remove_from_queue": return { label: L("Menghapus dari antrean", "Removing from queue"), detail: "" };
    default: return { label: name || L("Menjalankan tool", "Running tool"), detail: "" };
  }
}

function describeEnd(name, input, result, lang) {
  const L = (id, en) => tr(lang, id, en);
  if (result?.error) return { status: "error", summary: clip(result.error, 140) };
  switch (name) {
    case "web_search": {
      const rs = result.results || [];
      return {
        status: "ok",
        summary: L(`${rs.length} hasil ditemukan`, `${rs.length} results`),
        items: rs.slice(0, 3).map((r) => ({ text: r.title, sub: hostOf(r.url) })),
      };
    }
    case "read_webpage":
      return { status: "ok", summary: clip(result.title || hostOf(result.url), 90) };
    case "find_songs":
      return {
        status: "ok",
        summary: L(`${result.matched} dari ${result.total} lagu ketemu`, `${result.matched} of ${result.total} songs found`),
        items: (result.songs || []).map((s) => ({
          text: s.found ? `${s.title} — ${s.artist}` : s.duplicate_of ? `${s.query} ${L("(duplikat)", "(duplicate)")}` : s.query,
          ok: !!s.found,
        })),
      };
    case "search_tracks":
      return { status: "ok", summary: L(`${(result.tracks || []).length} lagu ditemukan`, `${(result.tracks || []).length} songs found`) };
    case "search_albums":
      return { status: "ok", summary: L(`${(result.albums || []).length} album ditemukan`, `${(result.albums || []).length} albums found`) };
    case "create_playlist_with_tracks":
    case "add_to_existing_playlist":
      return { status: "ok", summary: L(`${result.tracks_added} lagu ditambahkan`, `${result.tracks_added} songs added`) };
    case "play_playlist":
    case "play_album":
      return { status: "ok", summary: L(`${result.track_count} lagu diputar`, `${result.track_count} songs queued`) };
    case "play_track":
      return { status: "ok", summary: clip(result.now_playing, 80) };
    case "list_playlists":
      return { status: "ok", summary: L(`${(result.playlists || []).length} playlist`, `${(result.playlists || []).length} playlists`) };
    default:
      return { status: "ok", summary: "" };
  }
}

/* ---------------------------- riwayat ---------------------------- */

/** Pangkas riwayat lama: hanya KEEP_TURNS giliran terakhir, hasil tool lama dipersingkat. */
export function compactHistory(history) {
  if (!history?.length) return [];
  const starts = [];
  history.forEach((m, i) => { if (m.role === "user") starts.push(i); });
  const from = starts.length > KEEP_TURNS ? starts[starts.length - KEEP_TURNS] : 0;
  return history.slice(from).map((m) =>
    m.role === "tool" && typeof m.content === "string" && m.content.length > OLD_TOOL_RESULT_MAX
      ? { ...m, content: `${m.content.slice(0, OLD_TOOL_RESULT_MAX)}…[dipangkas]` }
      : m
  );
}

/* ---------------------------- satu giliran ---------------------------- */

/**
 * @param {string} userText
 * @param {Array}  history   riwayat pesan format OpenAI (dari giliran sebelumnya)
 * @param {object} ctx       jembatan ke player/playlist (lihat AiAssistant.jsx)
 * @param {object} opts      { signal, lang, onEvent }
 *   onEvent menerima: round | thought | tool_start | tool_progress | tool_end | plan
 */
export async function runAiAssistantTurn(userText, history, ctx, opts = {}) {
  const { signal, lang = "id", onEvent } = opts;
  const emit = (ev) => { try { onEvent?.(ev); } catch { /* UI tidak boleh merusak loop */ } };
  const env = { trackCache: new Map(), signal, lang, emit };
  let messages = [...compactHistory(history), { role: "user", content: userText }];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    throwIfAborted(signal);
    emit({ type: "round", round });

    let res;
    try {
      res = await fetch(AI_ENDPOINT, {
        method: "POST",
        credentials: "include",
        signal,
        headers: {
          "content-type": "application/json",
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        body: JSON.stringify({
          messages,
          client: { v: 2, lang, round, max_rounds: MAX_ROUNDS },
          // ronde terakhir: minta backend melarang tool supaya model wajib menutup dengan jawaban
          force_final: round === MAX_ROUNDS - 1,
        }),
      });
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      throw new Error(tr(lang, "Tidak bisa terhubung ke server AI.", "Can't reach the AI server."));
    }

    let data;
    try { data = await res.json(); } catch { data = null; }

    if (!res.ok) {
      const msg = data?.error?.message || data?.error || tr(lang, "Permintaan ke AI gagal.", "The AI request failed.");
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }

    const raw = data?.choices?.[0]?.message || {};
    // Beberapa provider menolak reasoning_content kalau dikirim balik -> buang dari riwayat.
    const { reasoning_content: reasoningA, reasoning: reasoningB, ...message } = raw;
    const reasoning = String(reasoningA || reasoningB || data?.reasoning || "").trim();
    const content = String(message.content || "").trim();
    const toolCalls = message.tool_calls || [];
    messages = [...messages, message];

    if (reasoning) emit({ type: "thought", text: reasoning });

    if (!toolCalls.length) {
      return { text: content || "...", history: messages };
    }

    // Teks yang menyertai tool_calls = "pikiran" model sebelum bertindak.
    if (content && content !== reasoning) emit({ type: "thought", text: content });

    const calls = toolCalls.map((call) => {
      let input = {};
      try { input = JSON.parse(call.function?.arguments || "{}"); } catch { input = {}; }
      return { id: call.id, name: call.function?.name, input };
    });

    for (const c of calls) {
      if (c.name === "update_plan") continue;
      emit({ type: "tool_start", id: c.id, name: c.name, ...describeStart(c.name, c.input, lang) });
    }

    const runOne = async (c) => {
      const result = await executeTool(c.name, c.input, ctx, env, c.id);
      if (c.name !== "update_plan") emit({ type: "tool_end", id: c.id, ...describeEnd(c.name, c.input, result, lang) });
      return result;
    };

    let results;
    if (calls.every((c) => READ_ONLY_TOOLS.has(c.name) || c.name === "update_plan")) {
      results = await Promise.all(calls.map(runOne));
    } else {
      results = [];
      for (const c of calls) results.push(await runOne(c));
    }

    calls.forEach((c, i) => {
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(results[i]) });
    });
  }

  return {
    text: tr(lang, "Maaf, prosesnya kelamaan dan dihentikan. Coba minta lagi dengan lebih spesifik ya.", "Sorry, that took too long and was stopped. Try again with a more specific request."),
    history: messages,
  };
}
