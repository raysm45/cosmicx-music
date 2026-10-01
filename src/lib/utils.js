export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

export function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDuration(sec) {
  if (!isFinite(sec) || sec <= 0) return "\u2013";
  return formatTime(sec);
}

// Ambil daftar kolaborator lengkap dari sebuah track untuk dikirim ke backend
// (history/like/playlist), supaya lagu collab tidak kehilangan nama artist lain.
export function trackArtists(track) {
  if (track?.artists?.length) return track.artists;
  if (track?.artist) return [track.artist];
  return [];
}

export function parseLRC(lrc) {
  if (!lrc || typeof lrc !== "string") return [];
  const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const out = [];
  for (const rawLine of lrc.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(re)];
    if (!matches.length) continue;
    const text = rawLine.replace(re, "").trim();
    for (const m of matches) {
      const min = parseInt(m[1], 10) || 0;
      const s = parseInt(m[2], 10) || 0;
      const frac = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) : 0;
      out.push({ time: min * 60 + s + frac / 1000, text });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

export function estimateWordTimeline(lines, trackDuration) {
  if (!Array.isArray(lines) || !lines.length) return [];
  return lines.map((line, i) => {
    const start = line.time;
    const next = lines[i + 1]?.time;
    const words = String(line.text || "").split(/\s+/).filter(Boolean);
    const fallbackDur = Math.max(1.2, Math.min(8, words.length * 0.42));
    const end = Number.isFinite(next)
      ? next
      : Number.isFinite(trackDuration) && trackDuration > start
        ? trackDuration
        : start + fallbackDur;
    const duration = Math.max(0.4, end - start);

    if (!words.length) return { ...line, end, words: [] };
    const weights = words.map((w) => w.length + 2);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let cursor = start;
    const timedWords = words.map((text, wi) => {
      const wDur = (weights[wi] / totalWeight) * duration;
      const wStart = cursor;
      const wEnd = Math.min(end, cursor + wDur);
      cursor = wEnd;
      return { text, start: wStart, end: wEnd };
    });
    return { ...line, end, words: timedWords };
  });
}

export function wordProgress(word, currentTime) {
  if (!word) return 0;
  if (currentTime <= word.start) return 0;
  if (currentTime >= word.end) return 1;
  return (currentTime - word.start) / Math.max(0.001, word.end - word.start);
}

export function relativeTime(ms) {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "baru aja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  return `${day} hari lalu`;
}

export function formatClockTime(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function seededShuffle(arr, seedNum) {
  const out = [...arr];
  let s = seedNum || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function cleanTrackTitleForLyrics(rawTitle, artistName) {
  if (!rawTitle) return rawTitle;
  let t = rawTitle;
  if (artistName) {
    const esc = artistName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`^\\s*${esc}\\s*[-\u2013\u2014:]\\s*`, "i"), "");
  }
  const clutterPattern = /\s*[([][^)\]]*\b(official|lyric|lyrics|video|audio|visualizer|mv|hd|hq|4k|full\s*song|full\s*audio|album|single|explicit|remaster(?:ed)?|clip|version)\b[^)\]]*[)\]]\s*/gi;
  let prev;
  do {
    prev = t;
    t = t.replace(clutterPattern, " ");
  } while (t !== prev);

  t = t.replace(/\s*[-\u2013\u2014]\s*(official\s*)?(lyric[s]?|music)?\s*(video|audio)\s*$/i, "");
  t = t.replace(/\s{2,}/g, " ").replace(/^[\s\-\u2013\u2014:|]+|[\s\-\u2013\u2014:|]+$/g, "").trim();

  return t || rawTitle;
}

const OFFICIAL_AUDIO_RE = /\bofficial\s*audio\b/i;
const OFFICIAL_VIDEO_RE = /\b(official\s*(music\s*)?video|\bmv\b)\b/i;
const LYRIC_VIDEO_RE = /\blyrics?\b(\s*video)?/i;
const AVOID_HINT_RE = /\b(cover|remix|remake|live|reaction|8d|slowed|reverb|sped\s*up|nightcore|instrumental|karaoke|tribute|type\s*beat|piano\s*version|acoustic|parody|reversed|mashup|bootleg|fan\s*made)\b/i;

export function pickBestAudioMatch(results, track) {
  if (!Array.isArray(results) || !results.length) return null;
  const artistName = track?.artist?.name || "";
  const wantedDuration = track?.duration || null;

  const scored = results.map((r, index) => {
    let score = 0;
    if (artistName && isRelevantArtistMatch(typeof r.artist === "string" ? r.artist : (r.artist?.name || ""), artistName)) score += 5;

    if (LYRIC_VIDEO_RE.test(r.title || "")) {
      score += 8;
    } else if (OFFICIAL_AUDIO_RE.test(r.title || "")) {
      score -= 5;
    } else if (OFFICIAL_VIDEO_RE.test(r.title || "")) {
      score -= 3;
    } else if (AVOID_HINT_RE.test(r.title || "")) {
      score -= 4;
    }

    if (wantedDuration && r.duration) {
      const diff = Math.abs(r.duration - wantedDuration);
      if (diff <= 2) score += 3;
      else if (diff <= 6) score += 1;
      else if (diff <= 12) score += 0;
      else if (diff <= 25) score -= 2;
      else score -= 4;
    }
    score -= index * 0.25;
    return { r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].r;
}

export function estimateIntroOffsetSeconds(candidateDuration, trackDuration) {
  if (!candidateDuration || !trackDuration) return 0;
  const diff = candidateDuration - trackDuration;
  if (diff <= 1.5) return 0;
  return Math.min(diff, 20);
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function isRelevantArtistMatch(name, q) {
  const norm = (s) => (s || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const n = norm(name), query = norm(q);
  if (!n || !query) return false;
  if (n === query || n.includes(query) || query.includes(n)) return true;
  const nameWords = n.split(" ").filter(Boolean);
  if (!nameWords.length) return false;
  const queryWords = new Set(query.split(" ").filter(Boolean));
  const matched = nameWords.filter((w) => queryWords.has(w)).length;
  return matched / nameWords.length >= 0.8;
}

const RECENT_SEARCH_THUMBS_KEY = "aivy_recent_search_thumbs";
const RECENT_SEARCH_THUMBS_MAX = 12;

function readRecentSearchThumbs() {
  try {
    const raw = localStorage.getItem(RECENT_SEARCH_THUMBS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeRecentSearchThumbs(arr) {
  try { localStorage.setItem(RECENT_SEARCH_THUMBS_KEY, JSON.stringify(arr)); } catch { }
}

export function getRecentSearchThumbs() {
  return readRecentSearchThumbs();
}

export function saveRecentSearchThumb(query, track) {
  const q = (query || "").trim();
  if (!q || !track || !track.videoId) return;
  const key = q.toLowerCase();
  const artistName = typeof track.artist === "string" ? track.artist : (track.artist?.name || "");
  const entry = {
    query: q,
    videoId: track.videoId,
    title: track.title || "",
    artist: artistName,
    thumbnail: track.thumbnail || track.cover || "",
    ts: Date.now(),
  };
  const rest = readRecentSearchThumbs().filter((x) => x.query.toLowerCase() !== key);
  writeRecentSearchThumbs([entry, ...rest].slice(0, RECENT_SEARCH_THUMBS_MAX));
}

export function removeRecentSearchThumb(query) {
  const key = (query || "").trim().toLowerCase();
  writeRecentSearchThumbs(readRecentSearchThumbs().filter((x) => x.query.toLowerCase() !== key));
}

export function clearRecentSearchThumbs() {
  writeRecentSearchThumbs([]);
}

    
