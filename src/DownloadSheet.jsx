import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Check, X, Gem, Disc3, Music2, FileAudio } from "lucide-react";
import { Api } from "./lib/api.js";
import { useUI } from "./context.jsx";
import { SmartCover } from "./lib/brand.jsx";
import "./styles/download-sheet.css";

/*
 * Sheet "Unduh lagu": pilih format file sebelum mengunduh.
 * Dibuka dari mana saja lewat openDownload(track) — tombol di Now Playing
 * (desktop & mobile) dan menu "..." lagu memakai fungsi yang sama, jadi
 * hanya ada satu sheet (DownloadSheetHost, dipasang sekali di App).
 *
 * `format` dikirim ke /api/stream-ticket. Backend saat ini memahami
 * aac | opus | flac; "mp3" butuh dukungan di backend (lihat catatan README).
 */
const OPEN_EVENT = "aivy:download-track";
const LAST_KEY = "aivy.download.format";

export function openDownload(track) {
  if (typeof window === "undefined" || !track) return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { track } }));
}

export const DOWNLOAD_OPTIONS = [
  {
    id: "flac", format: "flac", Icon: Gem, badge: "Hi-Res",
    title: ["Apple Music Hi-Res Lossless", "Apple Music Hi-Res Lossless"],
    sub: ["FLAC \u00b7 kualitas tertinggi, tanpa kompresi lossy", "FLAC \u00b7 highest quality, no lossy compression"],
  },
  {
    id: "aac", format: "aac", Icon: Disc3, badge: null,
    title: ["AAC", "AAC"],
    sub: ["M4A \u00b7 128 kbps \u00b7 kecil & kompatibel", "M4A \u00b7 128 kbps \u00b7 small & compatible"],
  },
  {
    id: "opus", format: "opus", Icon: FileAudio, badge: null,
    title: ["Opus", "Opus"],
    sub: ["WebM \u00b7 160 kbps \u00b7 efisien", "WebM \u00b7 160 kbps \u00b7 efficient"],
  },
  {
    id: "mp3", format: "mp3", Icon: Music2, badge: null,
    title: ["MP3", "MP3"],
    sub: ["Dibuka di semua perangkat & pemutar", "Plays on every device & player"],
  },
];

function readLast() {
  try { return window.localStorage.getItem(LAST_KEY) || ""; } catch { return ""; }
}
function writeLast(v) {
  try { window.localStorage.setItem(LAST_KEY, v); } catch { /* storage dimatikan */ }
}

export function DownloadSheetHost() {
  const [track, setTrack] = useState(null);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState("");
  const closeTimer = useRef(0);
  const { settings, pushToast } = useUI();
  const en = settings.language === "en";
  const tx = useCallback((id, enText) => (en ? enText : id), [en]);

  const close = useCallback(() => {
    setShown(false);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => { setTrack(null); setBusy(""); }, 260);
  }, []);

  useEffect(() => {
    const onOpen = (e) => {
      const tr = e.detail && e.detail.track;
      if (!tr) return;
      clearTimeout(closeTimer.current);
      setBusy("");
      setTrack(tr);
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener(OPEN_EVENT, onOpen); clearTimeout(closeTimer.current); };
  }, []);

  useEffect(() => {
    if (!track) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [track, close]);

  if (!track || typeof document === "undefined") return null;

  const last = readLast();
  const artistName = (typeof track.artist === "string" ? track.artist : track.artist?.name) || "";

  const pick = async (opt) => {
    if (busy) return;
    setBusy(opt.id);
    writeLast(opt.id);
    try {
      await Api.downloadSong(track, { format: opt.format });
      pushToast(tx(`Mengunduh sebagai ${opt.title[0]}\u2026`, `Downloading as ${opt.title[1]}\u2026`));
      close();
    } catch (err) {
      setBusy("");
      pushToast(err && err.message && !/videoId/i.test(err.message)
        ? err.message
        : tx("Gagal memulai unduhan", "Couldn\u2019t start the download"));
    }
  };

  return createPortal(
    <div className={`aivy-dl-layer ${shown ? "shown" : ""}`} role="presentation">
      <div className="aivy-dl-backdrop" onClick={close} />
      <div className="aivy-dl-sheet" role="dialog" aria-modal="true" aria-label={tx("Unduh lagu", "Download song")}>
        <div className="aivy-dl-grip" aria-hidden="true" />
        <div className="aivy-dl-head">
          <div className="aivy-dl-cover">
            <SmartCover src={track.cover || track.thumbnail} seed={String(track.id || track.title || "")} size={88} radius={8} />
          </div>
          <div className="aivy-dl-meta">
            <div className="aivy-dl-title">{tx("Unduh lagu", "Download song")}</div>
            <div className="aivy-dl-track">{track.title}{artistName ? ` \u00b7 ${artistName}` : ""}</div>
          </div>
          <button type="button" className="aivy-dl-x" onClick={close} aria-label={tx("Tutup", "Close")}><X size={18} /></button>
        </div>

        <div className="aivy-dl-list">
          {DOWNLOAD_OPTIONS.map((opt) => {
            const loading = busy === opt.id;
            const Icon = opt.Icon;
            return (
              <button
                key={opt.id} type="button" disabled={!!busy && !loading}
                className={`aivy-dl-row ${last === opt.id ? "is-last" : ""}`}
                onClick={() => pick(opt)}
              >
                <span className="aivy-dl-ico"><Icon size={19} /></span>
                <span className="aivy-dl-txt">
                  <span className="t">
                    {en ? opt.title[1] : opt.title[0]}
                    {opt.badge && <span className="aivy-dl-badge">{opt.badge}</span>}
                  </span>
                  <span className="s">{en ? opt.sub[1] : opt.sub[0]}</span>
                </span>
                <span className="aivy-dl-end">
                  {loading ? <span className="aivy-dl-spin" aria-hidden="true" /> : last === opt.id ? <Check size={18} /> : <Download size={17} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
