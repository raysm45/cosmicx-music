import { useEffect, useRef, useState } from "react";
import { loadCosmicEngine } from "./cosmicLoader3d.js";

/* Bintang 4 sudut logo (versi datar), dipakai sebagai fallback selama three.js dimuat / jika WebGL tidak ada */
const FALLBACK_PATH = "M1 -47 Q9 -9 50 1 Q9 9 -1 47 Q-9 9 -50 -1 Q-9 -9 1 -47Z";

/* true kalau warna teks (ink) terang -> latar gelap -> pakai logo krom terang */
function inkIsLight(el) {
  if (!el || typeof getComputedStyle !== "function") return true;
  const c = getComputedStyle(el).color || "";
  let r;
  let g;
  let b;
  let m = c.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
  if (m) {
    [r, g, b] = [m[1], m[2], m[3]].map(Number);
  } else {
    m = c.match(/color\(\s*[\w-]+\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (m) [r, g, b] = [m[1], m[2], m[3]].map((v) => Number(v) * 255);
  }
  if (r === undefined) return true;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
}

/**
 * Loader logo 3D CosmicX.
 * `color` = warna "tinta" di sekitarnya (sama seperti StarLoader lama). Dari situ dipilih varian logo:
 * tinta terang (latar gelap) -> krom terang, tinta gelap (latar terang) -> titanium gelap.
 */
export default function CosmicLoader({ size = 48, color = "var(--accent-strong)", label, className = "", style }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const px = Math.max(16, Math.round(size * dpr));

  useEffect(() => {
    let cancelled = false;
    let handle = null;
    let observer = null;
    const variantNow = () => (inkIsLight(wrapRef.current) ? "dark" : "light");

    loadCosmicEngine()
      .then((engine) => {
        if (cancelled || !canvasRef.current) return;
        handle = engine.attach(canvasRef.current, variantNow(), () => { if (!cancelled) setReady(true); });
        if (typeof MutationObserver !== "undefined") {
          observer = new MutationObserver(() => handle && handle.setVariant(variantNow()));
          observer.observe(document.documentElement, { attributes: true });
        }
      })
      .catch(() => { /* WebGL / three gagal -> tetap tampil fallback */ });

    return () => {
      cancelled = true;
      if (handle) handle.detach();
      if (observer) observer.disconnect();
    };
  }, [color]);

  return (
    <div
      ref={wrapRef}
      className={`aivy-starloader cx-loader ${ready ? "is-ready" : ""} ${className}`}
      style={{ width: size, height: size, color, ...style }}
      role="status"
      aria-label={label || "Memuat"}
    >
      <svg className="cx-loader-fallback" viewBox="-54 -54 108 108" aria-hidden="true" focusable="false">
        <path d={FALLBACK_PATH} fill="currentColor" />
      </svg>
      <canvas ref={canvasRef} width={px} height={px} aria-hidden="true" />
    </div>
  );
}
