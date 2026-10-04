import React, { useState, useEffect, useRef } from "react";
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
export function useArtworkTint(src) {
  const [tint, setTint] = useState(null);
  useEffect(() => {
    if (!src) { setTint(null); return undefined; }
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!alive) return;
      try {
        const canvas = document.createElement("canvas");
        const size = 28;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 32) continue;
          const mx = Math.max(data[i], data[i + 1], data[i + 2]);
          const mn = Math.min(data[i], data[i + 1], data[i + 2]);
          const weight = 0.35 + (mx - mn) / 255;
          r += data[i] * weight; g += data[i + 1] * weight; b += data[i + 2] * weight; w += weight;
        }
        if (!w) return;
        const [h, s] = rgbToHsl(r / w, g / w, b / w);
        if (alive) setTint(tintFromHsl(h, s * 100));
      } catch {
        if (alive) setTint(FALLBACK_TINT);
      }
    };
    img.onerror = () => { if (alive) setTint(FALLBACK_TINT); };
    img.src = src;
    return () => { alive = false; };
  }, [src]);
  return tint;
}
export function tintFromHsl(h, satPct) {
  const hue = Math.round(h);
  const s = Math.round(Math.min(52, Math.max(22, satPct)));
  return {
    bg: `hsl(${hue} ${s}% 15%)`,
    accent: `hsl(${hue} ${Math.min(72, s + 24)}% 78%)`,
    accentInk: `hsl(${hue} ${Math.min(60, s + 10)}% 12%)`,
  };
}
const FALLBACK_TINT = tintFromHsl(230, 30);
function hexToRgb(hex) {
  const m = String(hex || "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
export function tintFromHex(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [h, sat] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return tintFromHsl(h, sat * 100);
}
export function useImmersiveHero({ ready, tint }) {
  const mediaRef = useRef(null);
  const pageRef = useRef(null);
  const heroRef = useRef(null);

  useEffect(() => {
    document.body.classList.add("aivy-artist-immersive");
    return () => {
      document.body.classList.remove("aivy-artist-immersive");
      document.body.style.removeProperty("--artist-bg");
      document.body.style.removeProperty("--artist-accent");
      document.body.style.removeProperty("--artist-accent-ink");
    };
  }, []);

  useEffect(() => {
    if (!tint) return undefined;
    document.body.style.setProperty("--artist-bg", tint.bg);
    document.body.style.setProperty("--artist-accent", tint.accent);
    document.body.style.setProperty("--artist-accent-ink", tint.accentInk);
    return undefined;
  }, [tint]);

  useEffect(() => {
    if (!ready) return undefined;
    const scroller = document.getElementById("aivy-content-scroll");
    if (!scroller) return undefined;
    let raf = 0;
    let lastBlurStep = -1;
    let lastProgStep = -1;
    const BLUR_STEPS = 14;
    const apply = () => {
      raf = 0;
      const heroH = heroRef.current?.offsetHeight || Math.round((window.innerHeight || 800) * 0.78);
      const top = scroller.scrollTop;
      const shift = Math.min(top, heroH);
      const progress = Math.min(1, top / Math.max(1, heroH * 0.82));
      const step = Math.round(progress * BLUR_STEPS) / BLUR_STEPS;
      if (mediaRef.current) {
        mediaRef.current.style.setProperty("--am-shift", `${-shift}px`);
        const blurStep = Math.round(progress * BLUR_STEPS);
        if (blurStep !== lastBlurStep) {
          lastBlurStep = blurStep;
          mediaRef.current.style.setProperty("--am-blur", `${(step * 26).toFixed(1)}px`);
        }
        mediaRef.current.style.setProperty("--am-zoom", (1 + progress * 0.06).toFixed(4));
      }
      if (pageRef.current) {
        const progStep = Math.round(progress * BLUR_STEPS);
        if (progStep !== lastProgStep) {
          lastProgStep = progStep;
          pageRef.current.style.setProperty("--am-progress", step.toFixed(3));
        }
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ready]);

  return { mediaRef, pageRef, heroRef };
}
export function ImmersiveHero({ mediaRef, heroRef, media, coverStyle = false, children }) {
  return (
    <>
      <div ref={mediaRef} className={`aivy-am-media ${coverStyle ? "is-cover" : ""}`} aria-hidden="true">
        {media}
        <div className="aivy-am-media-blur" />
        <div className="aivy-am-media-scrim" />
      </div>
      <header ref={heroRef} className="aivy-am-hero">
        <div className="aivy-am-hero-inner">{children}</div>
      </header>
    </>
  );
}
