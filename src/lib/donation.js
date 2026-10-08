// Pengaturan halaman donasi (/donasi). Cukup edit file ini atau set env var.
//
// Link tujuan tombol "Donate Now". Isi lewat .env:
//   VITE_DONATE_URL=https://link-donasi-kamu
// Kosong = tombol menampilkan pesan "link donasi belum tersedia".
export const DONATE_URL = String(import.meta.env.VITE_DONATE_URL || "").trim();

export const DONATE_PATH = "/donasi";

// Daftar cara berdonasi yang tampil di halaman /donasi (opsional).
// Kosong = bagian "Cara berdonasi" disembunyikan.
//
// Dua bentuk yang didukung:
//   { id, name, note?, href }                 -> tombol "Buka" ke link
//   { id, name, note?, account, holder? }     -> tombol "Salin" nomor/ID
//
// Contoh:
//   { id: "saweria", name: "Saweria", note: "QRIS, e-wallet", href: "https://saweria.co/username" },
//   { id: "dana", name: "DANA", account: "0812xxxxxxx", holder: "Nama Pemilik" },
export const DONATION_METHODS = [];
