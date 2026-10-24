import React from "react";
import { LQ } from "./liquidGlass.js";

// Liquid glass final: turbulence + displacement + aberasi kromatik
// (kanal merah/hijau/biru dibiaskan terpisah, merah & biru digeser berlawanan).
// Parameter ada di LQ (liquidGlass.js). Ukuran & frekuensi diset per elemen lewat applyLiquidFilter().
export const LiquidFilter = React.memo(function LiquidFilter({ id }) {
  const f = `${LQ.freq} ${LQ.freq}`;
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%">
      <feTurbulence data-lq="turb" type="fractalNoise" baseFrequency={f} numOctaves="1" seed={LQ.seed} result="turbulence" />
      <feGaussianBlur data-lq="soft" in="turbulence" stdDeviation="3" result="softMap" />

      <feDisplacementMap data-lq="d" in="SourceGraphic" in2="softMap" scale={LQ.scale} xChannelSelector="R" yChannelSelector="G" result="dR" />
      <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
      <feOffset in="r" dx={-LQ.shift} dy="0" result="ro" />

      <feDisplacementMap data-lq="d" in="SourceGraphic" in2="softMap" scale={LQ.scale} xChannelSelector="R" yChannelSelector="G" result="dG" />
      <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />

      <feDisplacementMap data-lq="d" in="SourceGraphic" in2="softMap" scale={LQ.scale} xChannelSelector="R" yChannelSelector="G" result="dB" />
      <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
      <feOffset in="b" dx={LQ.shift} dy="0" result="bo" />

      <feBlend in="ro" in2="g" mode="screen" result="rg" />
      <feBlend in="rg" in2="bo" mode="screen" />
    </filter>
  );
});
