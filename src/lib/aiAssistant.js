import { API_BASE } from "./api.js";
import { Api } from "./api.js";

const AI_ENDPOINT = `${API_BASE}/api/ai-chat`;
const MAX_ROUNDS = 12;

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

async function executeTool(name, input, ctx, trackCache) {
  try {
    if (name === "search_tracks") {
      const results = await ctx.search(input.query);
      const mapped = (results || []).slice(0, 10).map((r) => {
        const id = r.videoId || r.id;
        const track = {
          id,
          videoId: id,
          title: r.title,
          cover: r.cover || r.thumbnail || null,
          artist: typeof r.artist === "string" ? { name: r.artist } : (r.artist || null),
          duration: r.duration || null,
        };
        trackCache.set(id, track);
        return { track_id: id, title: track.title, artist: track.artist?.name || null };
      });
      return { tracks: mapped };
    }

    if (name === "create_playlist_with_tracks") {
      const playlistId = await ctx.createPlaylist(input.name, input.description || "");
      if (!playlistId) return { error: "Gagal membuat playlist. Pastikan pengguna sudah login." };
      let added = 0;
      for (const id of input.track_ids || []) {
        const track = trackCache.get(id);
        if (track) { await ctx.addToPlaylist(playlistId, track); added += 1; }
      }
      return { playlist_id: playlistId, tracks_added: added };
    }

    if (name === "add_to_existing_playlist") {
      let added = 0;
      for (const id of input.track_ids || []) {
        const track = trackCache.get(id);
        if (track) { await ctx.addToPlaylist(input.playlist_id, track); added += 1; }
      }
      return { tracks_added: added };
    }

    if (name === "play_track") {
      const track = trackCache.get(input.track_id);
      if (!track) return { error: "track_id tidak dikenali. Panggil search_tracks dulu." };
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
        return { track_id: track?.id, title: r.title, artist: track?.artist?.name || null };
      });
      return { tracks: mapped };
    }

    if (name === "get_recently_played") {
      const limit = Math.min(Number(input.limit) || 20, 100);
      const rows = await Api.history(limit);
      const mapped = (rows || []).map((r) => {
        const track = toTrack(r);
        if (track) trackCache.set(track.id, track);
        return { track_id: track?.id, title: r.title, artist: track?.artist?.name || null, played_at: r.played_at };
      });
      return { history: mapped };
    }

    if (name === "get_similar_tracks") {
      const seed = await resolveTrack(input.track_id, trackCache);
      if (!seed) return { error: "track_id tidak dikenali. Panggil search_tracks dulu." };
      const res = await Api.similar({ trackId: seed.videoId || seed.id });
      const mapped = (res?.items || []).slice(0, 10).map((r) => {
        const track = toTrack(r);
        if (track) trackCache.set(track.id, track);
        return { track_id: track?.id, title: r.title, artist: track?.artist?.name || null };
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
      tracks.forEach((tr) => trackCache.set(tr.id, tr));
      ctx.playList(tracks, 0, "ai-assistant");
      return { ok: true, playlist_name: detail?.name, track_count: tracks.length };
    }

    if (name === "get_playlist_tracks") {
      const detail = await Api.playlist(input.playlist_id);
      if (!detail) return { error: "Playlist tidak ditemukan." };
      const tracks = (detail?.songs || []).map(toTrack).filter(Boolean);
      tracks.forEach((tr) => trackCache.set(tr.id, tr));
      const mapped = tracks.map((tr) => ({
        track_id: tr.id,
        title: tr.title,
        artist: tr.artist?.name || null,
      }));
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
      tracks.forEach((tr) => trackCache.set(tr.id, tr));
      ctx.playList(tracks, 0, "ai-assistant");
      return { ok: true, album_title: detail?.title, track_count: tracks.length };
    }

    if (name === "get_queue") {
      const upNext = ctx.upNext || [];
      const mapped = upNext.map((tr, idx) => ({
        queue_index: idx,
        track_id: tr.id,
        title: tr.title,
        artist: tr.artist?.name || null,
      }));
      return { queue_length: mapped.length, queue: mapped };
    }

    if (name === "add_to_queue") {
      const track = trackCache.get(input.track_id);
      if (!track) return { error: "track_id tidak dikenali. Panggil search_tracks dulu." };
      if (input.position === "next") {
        ctx.playNextInQueue(track);
      } else {
        ctx.addToQueueEnd(track);
      }
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

    return { error: `Tool tidak dikenal: ${name}` };
  } catch (err) {
    return { error: err?.message || "Tool gagal dijalankan." };
  }
}

export async function runAiAssistantTurn(userText, history, ctx) {
  const trackCache = new Map();
  let messages = [...history, { role: "user", content: userText }];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    let data;
    try { data = await res.json(); } catch { data = null; }

    if (!res.ok) {
      const msg = data?.error?.message || data?.error || "Permintaan ke AI gagal.";
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }

    const message = data?.choices?.[0]?.message || {};
    messages = [...messages, message];

    const toolCalls = message.tool_calls || [];
    if (!toolCalls.length) {
      const text = (message.content || "").trim();
      return { text: text || "...", history: messages };
    }

    for (const call of toolCalls) {
      let input = {};
      try { input = JSON.parse(call.function?.arguments || "{}"); } catch { input = {}; }
      const result = await executeTool(call.function?.name, input, ctx, trackCache);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return { text: "Maaf, prosesnya kelamaan dan dihentikan. Coba minta lagi dengan lebih spesifik ya.", history: messages };
}