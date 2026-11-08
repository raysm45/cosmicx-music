import React from "react";

// Pipeline SVG filter yang mereplikasi shader FS_GLASS dari @ybouane/liquidglass (https://liquid-glass.ybouane.com/):
// - dispMap: biconvex rounded-rect SDF refraction (refraction: 0.69, zRadius: 40, bevelMode: 0)
// - dR / dG / dB: radial chromatic aberration sepanjang normal permukaan (chromAberration: 0.05)
// - shineMap: Fresnel (fresnel: 1) + edgeHighlight (0.05) + innerStroke + innerGlow + envRefl + depth
export const LiquidFilter = React.memo(function LiquidFilter({ id }) {
  return (
    <filter
      id={id}
      x="0%"
      y="0%"
      width="100%"
      height="100%"
      filterUnits="objectBoundingBox"
      primitiveUnits="userSpaceOnUse"
      colorInterpolationFilters="sRGB"
    >
      <feImage data-lq="map" x="0%" y="0%" width="100%" height="100%" preserveAspectRatio="none" result="dispMap" />
      <feImage data-lq="shine" x="0%" y="0%" width="100%" height="100%" preserveAspectRatio="none" result="shineMap" />

      <feDisplacementMap data-lq="dR" in="SourceGraphic" in2="dispMap" scale="0" xChannelSelector="R" yChannelSelector="G" result="dR" />
      <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />

      <feDisplacementMap data-lq="dG" in="SourceGraphic" in2="dispMap" scale="0" xChannelSelector="R" yChannelSelector="G" result="dG" />
      <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />

      <feDisplacementMap data-lq="dB" in="SourceGraphic" in2="dispMap" scale="0" xChannelSelector="R" yChannelSelector="G" result="dB" />
      <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />

      <feBlend in="r" in2="g" mode="screen" result="rg" />
      <feBlend in="rg" in2="b" mode="screen" result="rgb" />
      <feComposite in="shineMap" in2="rgb" operator="over" result="lit" />
      <feComposite in="lit" in2="SourceGraphic" operator="in" />
    </filter>
  );
});
