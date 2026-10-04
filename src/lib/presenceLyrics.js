// Helper murni (tanpa dependency) buat nentuin baris lirik yang lagi aktif.
// Logikanya sengaja meniru AmLyrics.getLineHighlightEndTime / findActiveLineIndices
// supaya baris di Discord sama dengan baris yang menyala di halaman lirik web.

const INSTRUMENTAL_THRESHOLD_MS = 7000; // sama dengan konstanta di AmLyrics.ts
const MAX_LEN = 120; // batas Discord 128 karakter

function highlightEnd(lines, i) {
  const line = lines[i];
  const bgEnd = (line.backgroundText || []).reduce((m, s) => Math.max(m, s.endtime || 0), line.timestamp);
  const rawEnd = Math.max(line.endtime || 0, bgEnd, line.timestamp);
  const next = lines[i + 1];
  if (!next || next.timestamp <= line.timestamp) return rawEnd > line.timestamp ? rawEnd + 200 : rawEnd;
  if (rawEnd > line.timestamp) {
    if (next.timestamp < rawEnd) return rawEnd;
    if (next.timestamp - rawEnd >= INSTRUMENTAL_THRESHOLD_MS) return rawEnd;
  }
  return next.timestamp;
}

function lineText(line) {
  const raw = (line.text || []).map((s) => s.text || "").join("");
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < 2) return null; // Discord nolak string < 2 karakter
  return t.length > MAX_LEN ? `${t.slice(0, MAX_LEN - 1).trimEnd()}…` : t;
}

// lines: array LyricsLine milik <am-lyrics>; tMs: posisi lagu dalam milidetik.
// Return teks baris aktif, atau null kalau lagi jeda/instrumental/belum mulai.
export function lyricAt(lines, tMs) {
  if (!Array.isArray(lines) || !lines.length) return null;
  let idx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].timestamp > tMs) break;
    if (!lines[i].background) idx = i;
  }
  if (idx < 0 || tMs >= highlightEnd(lines, idx)) return null;
  return lineText(lines[idx]);
}
