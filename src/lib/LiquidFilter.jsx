import React from "react";

// Pipeline SVG filter yang mereplikasi shader FS_GLASS dari @ybouane/liquidglass (https://liquid-glass.ybouane.com/):
// - Regular Glass (#glass-fp1): blur stdDeviation = 0 (blurAmount: 0)
// - Frosted Glass (#glass-fp2): blur stdDeviation = 5 (blurAmount: 0.5) + alpha normalization agar sudut tetap utuh
// - dispR / dispG / dispB: biconvex rounded-rect SDF refraction (refraction: 0.69, cornerRadius: 40, zRadius: 40, bevelMode: 0)
//   + chromatic aberration per-channel sepanjang normal permukaan N.xy (chromAberration: 0.05)
// - shineMap: Fresnel (fresnel: 1) + edgeHighlight (0.05) + innerStroke + innerGlow + envRefl
export const LiquidFilter = React.memo(function LiquidFilter({ id }) {
  return (
    <filter
      id={id}
      x="0"
      y="0"
      width="100%"
      height="100%"
      filterUnits="userSpaceOnUse"
      primitiveUnits="userSpaceOnUse"
      colorInterpolationFilters="sRGB"
    >
      <feImage data-lq="mapR" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="dispR" />
      <feImage data-lq="mapG" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="dispG" />
      <feImage data-lq="mapB" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="dispB" />
      <feImage data-lq="shine" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="shineMap" />

      <feGaussianBlur data-lq="blur" in="SourceGraphic" stdDeviation="0" edgeMode="duplicate" result="blurred" />
      <feComponentTransfer in="blurred" result="baseSrc">
        <feFuncA type="linear" slope="0" intercept="1" />
      </feComponentTransfer>

      <feDisplacementMap data-lq="dR" in="baseSrc" in2="dispR" scale="0" xChannelSelector="R" yChannelSelector="G" result="dR" />
      <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />

      <feDisplacementMap data-lq="dG" in="baseSrc" in2="dispG" scale="0" xChannelSelector="R" yChannelSelector="G" result="dG" />
      <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />

      <feDisplacementMap data-lq="dB" in="baseSrc" in2="dispB" scale="0" xChannelSelector="R" yChannelSelector="G" result="dB" />
      <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />

      <feBlend in="r" in2="g" mode="screen" result="rg" />
      <feBlend in="rg" in2="b" mode="screen" result="rgb" />
      <feComposite in="shineMap" in2="rgb" operator="over" result="lit" />
      <feComposite in="lit" in2="SourceGraphic" operator="in" />
    </filter>
  );
});
