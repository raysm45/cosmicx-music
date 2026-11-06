import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Check, Search, AudioLines } from "lucide-react";
import { StarLoader } from "./lib/brand.jsx";

export const NPX_LYRICS_ID = "aivy-am-lyrics-mobile";
const EXIT_MS = 220;

/** Tetap ter-mount selama animasi keluar, supaya dialog/sheet bisa menutup dengan halus. */
function useMountTransition(open) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const id = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(id);
  }, [open]);
  return { mounted, shown };
}

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

/** Logo gelombang Lossless (mirip yang dipakai Apple Music). */
export function LosslessGlyph({ className = "", ...rest }) {
  return (
    <svg className={className} viewBox="0 0 120 84" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d="M6 56C16 22 30 10 42 20c12 10 14 42 30 52 12 7 24 2 34-22" strokeWidth="5" />
      <path d="M17 62C26 30 40 18 52 28c12 10 14 42 30 52 11 6 21 2 30-16" strokeWidth="5" opacity=".92" />
      <path d="M30 66C38 40 50 28 61 36c11 9 13 36 27 45" strokeWidth="5" opacity=".84" />
      <path d="M44 66c6-18 13-24 20-19 8 6 10 22 19 30" strokeWidth="5" opacity=".7" />
    </svg>
  );
}

/**
 * Dialog info kualitas audio: ikon, judul ("Lossless"), spesifikasi ("24 bit/44,1 kHz ALAC"),
 * lalu dua tombol "Pengaturan" dan "OKE" seperti Apple Music.
 */
export function QualityDialog({ open, info, tx, onSettings, onClose }) {
  const { mounted, shown } = useMountTransition(open);
  useEscape(open, onClose);
  if (!mounted || !info || typeof document === "undefined") return null;
  return createPortal(
    <div className={`npx-dlg-layer ${shown ? "shown" : ""}`} role="presentation">
      <div className="npx-dlg-backdrop" onClick={onClose} />
      <div className="npx-dlg" role="alertdialog" aria-modal="true" aria-labelledby="npx-dlg-title" aria-describedby="npx-dlg-line">
        <div className="npx-dlg-body">
          {info.lossless
            ? <LosslessGlyph className="npx-dlg-ico" />
            : <AudioLines className="npx-dlg-ico is-plain" strokeWidth={2} aria-hidden="true" />}
          <h2 id="npx-dlg-title" className="npx-dlg-title">{info.title}</h2>
          {info.line ? <p id="npx-dlg-line" className="npx-dlg-line">{info.line}</p> : null}
        </div>
        <div className="npx-dlg-actions">
          <button type="button" className="npx-dlg-btn" onClick={onSettings}>{tx("Pengaturan", "Settings")}</button>
          <button type="button" className="npx-dlg-btn is-strong" onClick={onClose} autoFocus>{tx("OKE", "OK")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Sheet pilih provider lirik (versi mobile dari LyricsProviderSheet desktop). */
export function LyricsProviderMobileSheet({ open, tx, onClose }) {
  const { mounted, shown } = useMountTransition(open);
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(null);
  useEscape(open, onClose);

  const getEl = () => document.getElementById(NPX_LYRICS_ID);
  const refresh = useCallback(() => {
    const el = getEl();
    const next = el && typeof el.getProviderList === "function" ? el.getProviderList() : [];
    setList((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    refresh();
    const id = setInterval(refresh, 500);
    return () => clearInterval(id);
  }, [open, refresh]);

  if (!mounted || typeof document === "undefined") return null;

  const sorted = [...list].sort((a, b) => (b.status === "current") - (a.status === "current"));
  const subtitle = (p) => {
    if (busy === p.key) return tx("Mengambil\u2026", "Fetching\u2026");
    if (p.status === "current") return tx("Provider saat ini", "Current provider");
    if (p.status === "ready") return tx("Ketuk untuk beralih", "Tap to switch");
    if (p.status === "missing") return tx("Tidak ditemukan", "Not found");
    return tx("Ketuk untuk mengambil", "Tap to fetch");
  };
  const pick = async (p) => {
    if (busy) return;
    if (p.status === "current") { onClose(); return; }
    const el = getEl();
    if (!el || typeof el.selectProvider !== "function") return;
    setBusy(p.key);
    let ok = false;
    try { ok = await el.selectProvider(p.key); } catch { ok = false; }
    setBusy(null);
    refresh();
    if (ok) onClose();
  };

  return createPortal(
    <div className={`npx-dlg-layer is-sheet ${shown ? "shown" : ""}`} role="presentation">
      <div className="npx-dlg-backdrop" onClick={onClose} />
      <div className="npx-psheet" role="dialog" aria-modal="true" aria-label={tx("Pilih provider lirik", "Choose lyrics provider")}>
        <button type="button" className="npx-psheet-grip" onClick={onClose} aria-label={tx("Tutup", "Close")} />
        <h2 className="npx-psheet-title">{tx("Pilih provider lirik", "Choose lyrics provider")}</h2>
        <div className="npx-psheet-body">
          {sorted.length === 0
            ? <div className="npx-psheet-note">{tx("Provider belum tersedia untuk lagu ini.", "No providers available for this song yet.")}</div>
            : sorted.map((p) => (
              <button
                key={p.key} type="button" disabled={!!busy && busy !== p.key}
                className={`npx-prow ${p.status === "current" ? "is-on" : ""} ${p.status === "missing" ? "is-missing" : ""}`}
                onClick={() => pick(p)}
              >
                <span className="npx-prow-ico">
                  {busy === p.key ? <StarLoader size={22} color="currentColor" /> : p.status === "current" ? <Check size={18} /> : <Search size={18} />}
                </span>
                <span className="npx-prow-txt">
                  <span className="t">{p.label}</span>
                  <span className="s">{subtitle(p)}</span>
                </span>
              </button>
            ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
