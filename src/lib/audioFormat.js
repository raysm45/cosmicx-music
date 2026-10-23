const textDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("latin1") : null;

function toAsciiWindow(bytes) {
  if (textDecoder) return textDecoder.decode(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function bytesEqual(bytes, offset, sequence) {
  if (offset < 0 || offset + sequence.length > bytes.length) return false;
  for (let i = 0; i < sequence.length; i++) {
    if (bytes[offset + i] !== sequence[i]) return false;
  }
  return true;
}

function asciiAt(bytes, offset, str) {
  const seq = [];
  for (let i = 0; i < str.length; i++) seq.push(str.charCodeAt(i));
  return bytesEqual(bytes, offset, seq);
}

const SNIFF_BYTES = 8192;

const detectCache = new Map();

function identify(bytes, contentType) {
  const ascii = toAsciiWindow(bytes);

  if (asciiAt(bytes, 0, "fLaC")) {
    return { label: "FLAC", mimeType: "audio/flac", codec: "flac", container: "FLAC" };
  }
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WAVE")) {
    return { label: "WAV", mimeType: "audio/wav", codec: "pcm", container: "WAV" };
  }
  if (bytesEqual(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
    if (ascii.includes("A_OPUS")) return { label: "OPUS", mimeType: "audio/webm", codec: "opus", container: "WebM" };
    if (ascii.includes("A_VORBIS")) return { label: "VORBIS", mimeType: "audio/webm", codec: "vorbis", container: "WebM" };
    return { label: "WEBM", mimeType: contentType || "audio/webm", codec: "unknown", container: "WebM" };
  }
  if (asciiAt(bytes, 0, "OggS")) {
    if (ascii.includes("OpusHead")) return { label: "OPUS", mimeType: "audio/ogg", codec: "opus", container: "Ogg" };
    if (ascii.includes("vorbis")) return { label: "VORBIS", mimeType: "audio/ogg", codec: "vorbis", container: "Ogg" };
    return { label: "OGG", mimeType: contentType || "audio/ogg", codec: "unknown", container: "Ogg" };
  }
  if (asciiAt(bytes, 4, "ftyp")) {
    return { label: "AAC", mimeType: "audio/mp4", codec: "aac", container: "MP4" };
  }
  if (asciiAt(bytes, 0, "ID3") || (bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return { label: "MP3", mimeType: "audio/mpeg", codec: "mp3", container: "MP3" };
  }
  if (contentType) {
    const short = contentType.split(";")[0].trim();
    const label = (short.split("/")[1] || short).toUpperCase();
    return { label, mimeType: short, codec: "unknown", container: "unknown" };
  }
  return null;
}

export function detectAudioFormat(url) {
  if (!url) return Promise.resolve(null);
  if (detectCache.has(url)) return detectCache.get(url);

  const promise = fetch(url, { headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` } })
    .then(async (res) => {
      if (!res.ok && res.status !== 206) { detectCache.delete(url); return null; }
      const contentType = res.headers.get("content-type");
      const buf = new Uint8Array(await res.arrayBuffer());
      const result = identify(buf, contentType);
      if (!result) detectCache.delete(url);
      return result;
    })
    .catch(() => { detectCache.delete(url); return null; });

  detectCache.set(url, promise);
  return promise;
}

export function clearAudioFormatCache(url) {
  if (url) detectCache.delete(url);
  else detectCache.clear();
}

export function getPreferredAudioQuality() {
  return "high";
}
let preferredFormat = "opus";
const VALID_FORMATS = ["aac", "opus", "flac"];

export function setPreferredAudioFormat(format) {
  if (VALID_FORMATS.includes(format)) preferredFormat = format;
}

export function getPreferredAudioFormat() {
  return preferredFormat;
}

// ===========================================================================
// Info audio terpadu: bentuk lama (yt-dlp) & baru (engine FLAC) menjadi satu
// bentuk yang dipakai seluruh UI (badge, pipeline, detail teknis).
// ===========================================================================
function num(v) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && isFinite(n) && n > 0 ? n : null;
}

/** Sample rate bisa datang sebagai Hz (44100), kHz (44.1) atau string "44.1 kHz" — selalu jadikan Hz. */
function normSampleRate(v) {
  const n = num(v);
  if (!n) return null;
  return n < 1000 ? Math.round(n * 1000) : Math.round(n);
}

/** Bitrate bisa bps (1411200) atau kbps (1411) — selalu jadikan kbps. */
function normBitrateKbps(v) {
  const n = num(v);
  if (!n) return null;
  return n > 20000 ? Math.round(n / 1000) : Math.round(n);
}

/** Codec dari berbagai penyedia ("FLAC", "audio/flac", "mp4a.40.2", "flac 16-bit") -> kunci huruf kecil. */
function normCodec(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s.includes("flac")) return "flac";
  if (s.includes("alac")) return "alac";
  if (s.includes("opus")) return "opus";
  if (s.includes("vorbis")) return "vorbis";
  if (s.includes("mp4a") || s.includes("aac")) return "aac";
  if (s.includes("mp3") || s.includes("mpeg")) return "mp3";
  if (s.includes("wav") || s.includes("pcm")) return "pcm";
  return s.trim() || null;
}

// ===========================================================================
// Info audio terpadu: semua penyedia (yt-dlp, engine FLAC, Lucida, Flacdownloader, ...)
// dipetakan ke SATU bentuk, sehingga badge, label kualitas & detail teknis tampil sama persis.
// ===========================================================================
export function unifyAudioInfoFields(raw) {
  const f =
    raw && typeof raw === "object"
      ? (raw.format && typeof raw.format === "object" ? raw.format : (raw.audio && typeof raw.audio === "object" ? raw.audio : (raw.codec || raw.sampleRate || raw.sampleRateHz || raw.bitDepth || raw.bitsPerSample ? raw : null)))
      : null;
  if (!f) return null;
  const codec = normCodec(f.codec || f.codecFamily || f.format || f.extension || f.container || f.mimeType);
  const lossless = f.lossless === true || codec === "flac" || codec === "alac" || codec === "pcm";
  return {
    codec,
    container: f.container || null,
    mimeType: f.mimeType || f.mime || null,
    lossless,
    sampleRateHz: normSampleRate(f.sampleRateHz ?? f.sampleRate ?? f.sample_rate ?? f.samplingRate),
    bitsPerSample: num(f.bitsPerSample ?? f.bitDepth ?? f.bit_depth ?? f.bits),
    channels: num(f.channels ?? f.channelCount),
    durationSec: num(f.durationSec ?? f.duration),
    bitrateKbps: normBitrateKbps(f.bitrateKbps ?? f.bitrate),
    filesizeBytes: num(f.filesizeBytes ?? f.bytes ?? f.storedBytes ?? f.size),
    filesizeIsEstimate: !!f.filesizeIsEstimate,
    itag: f.itag || null,
    sha256: f.sha256 || null,
    status: f.status || null,
    verified: f.verified === true,
    flac: lossless,
  };
}

/** Teks badge kompak: "FLAC · 44.1k/16" — hanya bila datanya ada. */
export function formatBadgeText(baseLabel, f) {
  if (!f || !f.flac || !f.sampleRateHz) return baseLabel;
  const khz = String((f.sampleRateHz / 1000).toFixed(1)).replace(/\.0$/, "");
  const bits = f.bitsPerSample ? `/${f.bitsPerSample}` : "";
  return `${baseLabel} \u00b7 ${khz}k${bits}`;
}

const CODEC_NAMES = {
  flac: "FLAC", aac: "AAC", opus: "Opus", mp3: "MP3", vorbis: "Vorbis",
  alac: "ALAC", pcm: "WAV", wav: "WAV", mp4a: "AAC",
};

/**
 * Label kualitas ala Apple Music di bawah bar durasi.
 *   lossless  -> { main: "Lossless" | "Hi-Res Lossless", detail: "FLAC \u00b7 44.1 kHz \u00b7 16-bit" }
 *   lossy     -> { main: "AAC", detail: "128 kbps" }
 * `format` = hasil unifyAudioInfoFields(); `fallbackLabel` = label codec dari player.
 */
export function describeQuality(format, fallbackLabel) {
  const raw = String((format && format.codec) || fallbackLabel || "").trim();
  if (!raw && !(format && format.lossless)) return null;
  const key = raw.toLowerCase();
  const name = CODEC_NAMES[key] || (raw ? raw.toUpperCase() : "FLAC");
  const khz = format && format.sampleRateHz ? `${Number((format.sampleRateHz / 1000).toFixed(1))} kHz` : null;
  const bits = format && format.bitsPerSample ? `${format.bitsPerSample}-bit` : null;

  if (format && (format.lossless || key === "flac" || key === "alac")) {
    const hires = (format.sampleRateHz || 0) > 48000 || (format.bitsPerSample || 0) > 16;
    return {
      main: hires ? "Hi-Res Lossless" : "Lossless",
      detail: [name, khz, bits].filter(Boolean).join(" \u00b7 "),
      lossless: true,
      hires,
    };
  }
  const kbps = format && format.bitrateKbps ? `${Math.round(format.bitrateKbps)} kbps` : null;
  return { main: name, detail: kbps || "", lossless: false, hires: false };
}

/**
 * Label codec singkat untuk badge ("FLAC", "AAC", "OPUS", ...) dari respons audio-info penyedia mana pun.
 * Dipakai supaya label sama persis walau sumbernya berbeda (yang dulu jatuh ke nama container).
 */
export function audioLabelFromInfo(info) {
  const f = unifyAudioInfoFields(info);
  if (!f) return null;
  const key = f.codec;
  if (key && CODEC_NAMES[key]) return CODEC_NAMES[key].toUpperCase();
  const fallback = key || f.container;
  return fallback ? String(fallback).toUpperCase() : null;
}
