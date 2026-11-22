import React from "react";

/**
 * Glyph gelombang suara: 5 batang membulat pada grid 12x12 (rapi di 10-14px).
 * Dipakai bersama oleh badge kartu/baris lagu dan pill kualitas di player.
 */
export function LosslessMark({ className = "", ...rest }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" focusable="false" {...rest}>
      <rect x="0"    y="4"    width="1.6" height="4"  rx=".8" />
      <rect x="2.6"  y="2"    width="1.6" height="8"  rx=".8" />
      <rect x="5.2"  y="0"    width="1.6" height="12" rx=".8" />
      <rect x="7.8"  y="2.5"  width="1.6" height="7"  rx=".8" />
      <rect x="10.4" y="4.25" width="1.6" height="3.5" rx=".8" />
    </svg>
  );
}

/**
 * Badge kualitas audio.
 *   tier : "lossless" | "hires"
 *   size : "sm" (baris/kartu, 15px — sama tinggi dengan badge Explicit) | "md" (sheet/dialog, 18px)
 *   onDark : untuk permukaan yang SELALU gelap (mis. sheet download) walau tema terang
 * Tinggi FIXED + ring lewat inset box-shadow (bukan border) supaya ukurannya tidak pernah pecahan.
 */
export function LosslessBadge({ tier = "lossless", size = "sm", title, className = "", onDark = false }) {
  const hires = tier === "hires";
  const label = hires ? "Hi-Res" : "Lossless";
  return (
    <span
      className={`lb lb-${size}${hires ? " is-hires" : ""}${onDark ? " lb-dark" : ""}${className ? ` ${className}` : ""}`}
      title={title || (hires ? "Hi-Res Lossless" : "Lossless")}
      role="img"
      aria-label={title || label}
    >
      <LosslessMark className="lb-ico" />
      <span className="lb-txt">{label}</span>
    </span>
  );
}
