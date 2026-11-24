// Kebijakan label kualitas.
//
// Provider audio sekarang menjamin SEMUA lagu remote disajikan lossless (FLAC), jadi label
// "Lossless" ditampilkan untuk semua lagu remote tanpa menunggu lagu itu diputar dulu.
// Kalau suatu saat provider diganti / tidak lagi menjamin, ubah ke `false`: label kembali
// hanya muncul untuk lagu yang sudah terbukti lossless saat diputar (qualityMemory).
export const GUARANTEED_LOSSLESS = true;

const LOCAL_LOSSLESS_EXT = /^(flac|wav|wave|alac|aif|aiff)$/i;

/** "lossless" kalau lagu ini boleh diberi label lossless tanpa verifikasi, selain itu null. */
export function losslessKindForTrack(track) {
  if (!track) return null;
  if (track.source === "local") {
    // File lokal: jujur sesuai format filenya, bukan janji provider.
    return LOCAL_LOSSLESS_EXT.test(String(track.fileExt || "").replace(/^\./, "")) ? "lossless" : null;
  }
  return GUARANTEED_LOSSLESS ? "lossless" : null;
}
