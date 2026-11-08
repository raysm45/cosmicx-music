export function supportsRefraction() {
  if (typeof navigator === "undefined" || typeof document === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/CriOS|FxiOS|EdgiOS|Firefox|iPhone|iPad|iPod/.test(ua)) return false;
  if (!/Chrome\/\d+/.test(ua)) return false;
  try { return !!CSS.supports("backdrop-filter", "blur(1px)"); } catch { return false; }
}

// Konfigurasi persis dari @ybouane/liquidglass (https://liquid-glass.ybouane.com/)
// Regular Glass (#glass-fp1): blurAmount = 0
// Frosted Glass (#glass-fp2): blurAmount = 0.5
// Keduanya memakai shader FS_GLASS yang sama persis:
export const LQ = {
  floating: true,
  blurAmount: 0,
  refraction: 0.69,
  chromAberration: 0.05,
  edgeHighlight: 0.05,
  specular: 0,
  fresnel: 1.0,
  distortion: 0,
  cornerRadius: 40,
  zRadius: 40,
  opacity: 1,
  saturation: 0,
  brightness: 0,
  shadowOpacity: 0.3,
  shadowSpread: 10,
  bevelMode: 0,
};

const mapCache = new Map();

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Rounded-rect signed distance (FS_GLASS rrSDF)
function rrSDF(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

// Biconvex half-circle bevel profile (FS_GLASS bevelHeight)
function bevelHeight(d, zR) {
  if (d <= 0) return 0;
  if (d >= zR) return zR;
  return Math.sqrt(d * (2 * zR - d));
}

export function makeGlassMaps(w, h, radius = 0) {
  const W = Math.max(8, Math.round(w));
  const H = Math.max(8, Math.round(h));
  const halfX = W * 0.5;
  const halfY = H * 0.5;
  const maxD = Math.min(halfX, halfY);
  const r = radius > 0 ? Math.min(radius, maxD) : Math.min(LQ.cornerRadius, maxD);
  const zR = LQ.zRadius;
  const s = Math.min(1, maxD / LQ.zRadius);
  const key = `yb4:${W}x${H}:r${Math.round(r)}:z${Math.round(zR)}`;
  if (mapCache.has(key)) return mapCache.get(key);

  let dispUrlR = "";
  let dispUrlG = "";
  let dispUrlB = "";
  let shineUrl = "";
  let scale = 0;

  try {
    const makeCanvas = () => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      return [c, ctx, ctx.createImageData(W, H)];
    };

    const [cR, ctxR, imgR] = makeCanvas();
    const [cG, ctxG, imgG] = makeCanvas();
    const [cB, ctxB, imgB] = makeCanvas();
    const [cS, ctxS, imgS] = makeCanvas();

    const rxBufR = new Float32Array(W * H);
    const ryBufR = new Float32Array(W * H);
    const rxBufG = new Float32Array(W * H);
    const ryBufG = new Float32Array(W * H);
    const rxBufB = new Float32Array(W * H);
    const ryBufB = new Float32Array(W * H);

    const e = 1.6;
    const ior = 1.5;
    const refrPow = 1 - 1 / ior; // 1/3
    let maxAbs = 1;

    const bx = Math.max(0, halfX - r);
    const by = Math.max(0, halfY - r);

    for (let j = 0; j < H; j++) {
      const py = j + 0.5 - halfY;
      for (let i = 0; i < W; i++) {
        const px = i + 0.5 - halfX;
        const idx = j * W + i;
        const sdf = rrSDF(px, py, halfX, halfY, r);

        if (sdf > 2.5) continue;

        const cx = Math.max(-bx, Math.min(bx, px));
        const cy = Math.max(-by, Math.min(by, py));
        const vx = px - cx;
        const vy = py - cy;
        const vLen = Math.hypot(vx, vy);
        let ux = 0;
        let uy = 0;
        if (vLen > 1e-4) {
          ux = vx / vLen;
          uy = vy / vLen;
        } else if (halfX - Math.abs(px) < halfY - Math.abs(py)) {
          ux = px < 0 ? -1 : 1;
        } else {
          uy = py < 0 ? -1 : 1;
        }

        const qSdf = Math.min(sdf, -0.5);
        const inside = Math.max(0, -qSdf);
        const edge = smoothstep(maxD * 0.35, 0, inside);

        // Surface normal via bevel height field sepanjang arah radial normal (FS_GLASS)
        const hC = bevelHeight(inside, zR);
        const hPlus = bevelHeight(inside + e, zR);
        const hMinus = bevelHeight(inside - e, zR);
        const dhd = (hPlus - hMinus) / (2 * e);
        const hGradX = -ux * dhd;
        const hGradY = -uy * dhd;
        const invN = 1 / Math.hypot(-hGradX, -hGradY, 1);
        const Nx = -hGradX * invN;
        const Ny = -hGradY * invN;
        const Nz = invN;

        const depth = smoothstep(0, zR, inside);

        // Biconvex dual-surface refraction (FS_GLASS bevelMode == 0)
        const thickness = hC * 2;
        const thickNorm = thickness / Math.max(zR * 2, 1);
        const refrMult = refrPow * (2 + 0.5 * thickNorm) * LQ.refraction * 30 * s;
        const centerDirX = -px / Math.max(halfX, 1);
        const centerDirY = -py / Math.max(halfY, 1);

        const rx = hGradX * refrMult + centerDirX * LQ.refraction * 4 * s * depth;
        const ry = hGradY * refrMult + centerDirY * LQ.refraction * 4 * s * depth;

        // Chromatic aberration sepanjang normal permukaan N.xy (FS_GLASS):
        // float caS = u_chroma * 18.0 * (edge * 0.7 + 0.3) * 2.0;
        const caS = LQ.chromAberration * 18.0 * (edge * 0.7 + 0.3) * 2.0 * s;
        const caX = Nx * caS;
        const caY = Ny * caS;

        const clampInside = (dx, dy) => {
          const margin = 1.5;
          const maxR = Math.max(1, r - margin);
          let sx = Math.max(-(halfX - margin), Math.min(halfX - margin, px + dx));
          let sy = Math.max(-(halfY - margin), Math.min(halfY - margin, py + dy));
          const scx = Math.max(-bx, Math.min(bx, sx));
          const scy = Math.max(-by, Math.min(by, sy));
          const svx = sx - scx;
          const svy = sy - scy;
          const svLen = Math.hypot(svx, svy);
          if (svLen > maxR) {
            sx = scx + (svx / svLen) * maxR;
            sy = scy + (svy / svLen) * maxR;
          }
          return [sx - px, sy - py];
        };

        const [rRx, rRy] = clampInside(rx + caX, ry + caY);
        const [gRx, gRy] = clampInside(rx, ry);
        const [bRx, bRy] = clampInside(rx - caX, ry - caY);

        rxBufR[idx] = rRx; ryBufR[idx] = rRy;
        rxBufG[idx] = gRx; ryBufG[idx] = gRy;
        rxBufB[idx] = bRx; ryBufB[idx] = bRy;

        maxAbs = Math.max(
          maxAbs,
          Math.abs(rRx), Math.abs(rRy),
          Math.abs(gRx), Math.abs(gRy),
          Math.abs(bRx), Math.abs(bRy)
        );

        // Pencahayaan permukaan persis FS_GLASS (Fresnel + innerStroke + rim + innerGlow + envRefl)
        if (sdf <= 0.5) {
          const mask = 1 - smoothstep(-0.5, 0.5, sdf);
          const sInside = Math.max(0, -sdf);
          const sEdge = smoothstep(maxD * 0.35, 0, sInside);
          const fres = Math.pow(1 - Math.abs(Nz), 4) * LQ.fresnel;
          const innerStrokeBase =
            smoothstep(-2.2, -1.2, sdf) *
            (1 - smoothstep(-0.5, 0.2, sdf));
          const topBias = 0.5 + 0.5 * (-py / Math.max(halfY, 1));
          const innerStroke = innerStrokeBase * (0.4 + 0.6 * topBias);

          const rim = sEdge * LQ.edgeHighlight * 0.22;
          const innerGlow = smoothstep(5, 0, sInside) * LQ.edgeHighlight * 0.15;
          const envRefl = (Ny * 0.5 + 0.5) * fres * 0.08;

          const addWhite = rim + innerGlow + innerStroke * LQ.edgeHighlight * 0.55 + envRefl;
          const alpha = Math.min(1, Math.max(0, addWhite * (1 - 0.2 * fres) + 0.2 * fres)) * mask;

          const k = idx * 4;
          imgS.data[k] = 255;
          imgS.data[k + 1] = 255;
          imgS.data[k + 2] = 255;
          imgS.data[k + 3] = Math.round(alpha * 255);
        }
      }
    }

    scale = 2 * maxAbs;
    const invSpan = 1 / scale;
    const pack = (img, xB, yB) => {
      for (let idx = 0, n = W * H; idx < n; idx++) {
        const k = idx * 4;
        img.data[k] = Math.max(0, Math.min(255, Math.round((0.5 + xB[idx] * invSpan) * 255)));
        img.data[k + 1] = Math.max(0, Math.min(255, Math.round((0.5 + yB[idx] * invSpan) * 255)));
        img.data[k + 2] = 128;
        img.data[k + 3] = 255;
      }
    };
    pack(imgR, rxBufR, ryBufR);
    pack(imgG, rxBufG, ryBufG);
    pack(imgB, rxBufB, ryBufB);

    ctxR.putImageData(imgR, 0, 0);
    ctxG.putImageData(imgG, 0, 0);
    ctxB.putImageData(imgB, 0, 0);
    ctxS.putImageData(imgS, 0, 0);

    dispUrlR = cR.toDataURL("image/png");
    dispUrlG = cG.toDataURL("image/png");
    dispUrlB = cB.toDataURL("image/png");
    shineUrl = cS.toDataURL("image/png");
  } catch {
    dispUrlR = "";
    dispUrlG = "";
    dispUrlB = "";
    shineUrl = "";
  }

  const entry = {
    dispUrl: dispUrlG,
    dispUrlR,
    dispUrlG,
    dispUrlB,
    shineUrl,
    scale,
    w: W,
    h: H,
  };
  if (mapCache.size > 16) mapCache.delete(mapCache.keys().next().value);
  mapCache.set(key, entry);
  return entry;
}

export function makeDisplacementMap(w, h, bezel, radius) {
  return makeGlassMaps(w, h, radius).dispUrl;
}

export function applyLiquidFilter(filter, w, h, radius = 0) {
  if (!filter || !w || !h) return;
  const maps = makeGlassMaps(w, h, radius);
  if (!maps.dispUrlG) return;

  const W = String(maps.w);
  const H = String(maps.h);
  filter.setAttribute("x", "0");
  filter.setAttribute("y", "0");
  filter.setAttribute("width", W);
  filter.setAttribute("height", H);
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("primitiveUnits", "userSpaceOnUse");

  const setImg = (sel, url) => {
    const el = filter.querySelector(sel);
    if (!el || !url) return;
    el.setAttribute("x", "0");
    el.setAttribute("y", "0");
    el.setAttribute("width", W);
    el.setAttribute("height", H);
    el.setAttribute("href", url);
    el.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", url);
  };

  setImg('[data-lq="mapR"]', maps.dispUrlR);
  setImg('[data-lq="mapG"]', maps.dispUrlG);
  setImg('[data-lq="mapB"]', maps.dispUrlB);
  setImg('[data-lq="shine"]', maps.shineUrl);

  const blurEl = filter.querySelector('[data-lq="blur"]');
  if (blurEl) {
    const isFrosted = typeof document !== "undefined" && document.documentElement.dataset.glass === "blur";
    blurEl.setAttribute("stdDeviation", isFrosted ? "5" : "0");
  }

  const scaleStr = maps.scale.toFixed(2);
  const dR = filter.querySelector('[data-lq="dR"]');
  const dG = filter.querySelector('[data-lq="dG"]');
  const dB = filter.querySelector('[data-lq="dB"]');
  if (dR) dR.setAttribute("scale", scaleStr);
  if (dG) dG.setAttribute("scale", scaleStr);
  if (dB) dB.setAttribute("scale", scaleStr);
}
