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

// Codec/container yang diminta ke backend: 'aac' | 'opus' | 'flac'.
// Di-set dari SettingsPage lewat context.jsx, biar lib ini tetap bebas
// dependensi ke React context.
let preferredFormat = "opus";
const VALID_FORMATS = ["aac", "opus", "flac"];

export function setPreferredAudioFormat(format) {
  if (VALID_FORMATS.includes(format)) preferredFormat = format;
}

export function getPreferredAudioFormat() {
  return preferredFormat;
}
