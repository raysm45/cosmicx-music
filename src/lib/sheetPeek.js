// Jembatan kecil: miniplayer menggeser full player (NowPlayingSheet) mengikuti jari.
// Semua gerakan lewat transform/opacity langsung di DOM (tanpa re-render React) supaya tetap 60fps.

let sheetEl = null;
let backdropEl = null;
let height = 0;

export function registerNowPlayingSheet(sheet, backdrop) {
  sheetEl = sheet;
  backdropEl = backdrop;
  return () => {
    if (sheetEl === sheet) { sheetEl = null; backdropEl = null; }
  };
}

export function sheetPeekStart() {
  if (!sheetEl) return;
  height = sheetEl.offsetHeight || window.innerHeight || 1;
  sheetEl.style.transition = "none";
  sheetEl.style.willChange = "transform";
  if (backdropEl) backdropEl.style.transition = "none";
}

// px = jarak geser jari ke atas; 1:1 dengan tepi atas sheet, dengan sedikit resistensi di ujung.
export function sheetPeekMove(px) {
  if (!sheetEl) return;
  const p = Math.min(1, Math.max(0, px / height));
  const eased = p < 0.85 ? p : 0.85 + (p - 0.85) * 0.4;
  sheetEl.style.transform = `translate3d(0, ${(1 - eased) * 100}%, 0)`;
  if (backdropEl) backdropEl.style.opacity = String(Math.min(1, eased * 1.4));
}

// Hapus style inline: CSS transition mengambil alih dari posisi terakhir menuju state akhir
// (open → naik penuh, batal → turun lagi). Panggil sebelum mengubah state `open`.
export function sheetPeekEnd() {
  if (!sheetEl) return;
  sheetEl.style.transition = "";
  sheetEl.style.transform = "";
  sheetEl.style.willChange = "";
  if (backdropEl) { backdropEl.style.transition = ""; backdropEl.style.opacity = ""; }
}
