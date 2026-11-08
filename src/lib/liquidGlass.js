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
  refraction: 0.69,
  chromAberration: 0.05,
  edgeHighlight: 0.05,
  specular: 0,
  fresnel: 1.0,
  zRadius: 40,
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
  const r = radius > 0 ? Math.min(radius, maxD) : maxD;
  const zR = Math.min(16, Math.max(6.5, maxD * 0.4));
  const s = zR / LQ.zRadius;
  const key = `yb2:${W}x${H}:r${Math.round(r)}:z${Math.round(zR * 10)}`;
  if (mapCache.has(key)) return mapCache.get(key);

  let dispUrl = "";
  let shineUrl = "";
  let scaleG = 0;
  let scaleR = 0;
  let scaleB = 0;

  try {
    const dispCanvas = document.createElement("canvas");
    dispCanvas.width = W;
    dispCanvas.height = H;
    const dispCtx = dispCanvas.getContext("2d");
    const dispImg = dispCtx.createImageData(W, H);

    const shineCanvas = document.createElement("canvas");
    shineCanvas.width = W;
    shineCanvas.height = H;
    const shineCtx = shineCanvas.getContext("2d");
    const shineImg = shineCtx.createImageData(W, H);

    const dxBuf = new Float32Array(W * H);
    const dyBuf = new Float32Array(W * H);

    const e = 2.0 * s;
    const ior = 1.5;
    const refrPow = 1 - 1 / ior; // 1/3
    const borderWidth = 1.5;
    let maxAbs = 1;

    for (let j = 0; j < H; j++) {
      const py = j + 0.5 - halfY;
      for (let i = 0; i < W; i++) {
        const px = i + 0.5 - halfX;
        const idx = j * W + i;
        const sdf = rrSDF(px, py, halfX, halfY, r);

        if (sdf > 0.5) continue;

        const mask = 1 - smoothstep(-1.5, 0.5, sdf);
        const inside = Math.max(0, -sdf);
        const edge = smoothstep(maxD * 0.35, 0, inside);

        // Surface normal via bevel height field (FS_GLASS)
        const dC = inside;
        const dR = -rrSDF(px + e, py, halfX, halfY, r);
        const dL = -rrSDF(px - e, py, halfX, halfY, r);
        const dU = -rrSDF(px, py + e, halfX, halfY, r);
        const dD = -rrSDF(px, py - e, halfX, halfY, r);
        const hC = bevelHeight(dC, zR);
        const hR = bevelHeight(dR, zR);
        const hL = bevelHeight(dL, zR);
        const hU = bevelHeight(dU, zR);
        const hD = bevelHeight(dD, zR);

        let hGradX = (hR - hL) / (2 * e);
        let hGradY = (hU - hD) / (2 * e);
        const invN = 1 / Math.hypot(-hGradX, -hGradY, 1);
        const Ny = -hGradY * invN;
        const Nz = invN;

        // Cegah lonjakan turunan 1/sqrt(d) di piksel batas anti-alias paling luar (d < 1.5px)
        const gLen = Math.hypot(hGradX, hGradY);
        const maxGrad = 1.35;
        if (gLen > maxGrad) {
          const gScale = maxGrad / gLen;
          hGradX *= gScale;
          hGradY *= gScale;
        }

        const depth = smoothstep(0, zR, inside);

        // Biconvex dual-surface refraction (FS_GLASS bevelMode == 0)
        const thickness = hC * 2;
        const thickNorm = thickness / Math.max(zR * 2, 1);
        const refrMult = refrPow * (2 + 0.5 * thickNorm) * LQ.refraction * 30 * s;
        const centerDirX = -px / Math.max(halfX, 1);
        const centerDirY = -py / Math.max(halfY, 1);

        const rx = hGradX * refrMult + centerDirX * LQ.refraction * 4 * s * depth;
        const ry = hGradY * refrMult + centerDirY * LQ.refraction * 4 * s * depth;

        dxBuf[idx] = rx;
        dyBuf[idx] = ry;
        const ax = Math.abs(rx);
        const ay = Math.abs(ry);
        if (ax > maxAbs) maxAbs = ax;
        if (ay > maxAbs) maxAbs = ay;

        // Pencahayaan permukaan persis FS_GLASS (Fresnel + innerStroke + rim + innerGlow + envRefl)
        const fres = Math.pow(1 - Math.abs(Nz), 4) * LQ.fresnel;
        const innerStrokeBase =
          smoothstep(-borderWidth - 1, -borderWidth, sdf) *
          (1 - smoothstep(-1, 0, sdf));
        const topBias = 0.5 + 0.5 * (-py / Math.max(halfY, 1));
        const innerStroke = innerStrokeBase * (0.4 + 0.6 * topBias);

        const rim = edge * LQ.edgeHighlight * 0.22;
        const innerGlow = smoothstep(5, 0, inside) * LQ.edgeHighlight * 0.15;
        const envRefl = (Ny * 0.5 + 0.5) * fres * 0.08;

        const addWhite = rim + innerGlow + innerStroke * LQ.edgeHighlight * 0.55 + envRefl;
        const alpha = Math.min(1, Math.max(0, addWhite * (1 - 0.2 * fres) + 0.2 * fres)) * mask;

        const k = idx * 4;
        shineImg.data[k] = 255;
        shineImg.data[k + 1] = 255;
        shineImg.data[k + 2] = 255;
        shineImg.data[k + 3] = Math.round(alpha * 255);
      }
    }

    scaleG = 2 * maxAbs;
    const caPx = LQ.chromAberration * 36 * s; // FS_GLASS: u_chroma * 18.0 * 2.0
    const caRatio = caPx / Math.max(maxAbs, 1);
    scaleR = scaleG * (1 - caRatio);
    scaleB = scaleG * (1 + caRatio);

    const invSpan = 1 / scaleG;
    for (let idx = 0, n = W * H; idx < n; idx++) {
      const k = idx * 4;
      const u = 0.5 + dxBuf[idx] * invSpan;
      const v = 0.5 + dyBuf[idx] * invSpan;
      dispImg.data[k] = Math.max(0, Math.min(255, Math.round(u * 255)));
      dispImg.data[k + 1] = Math.max(0, Math.min(255, Math.round(v * 255)));
      dispImg.data[k + 2] = 128;
      dispImg.data[k + 3] = 255;
    }

    dispCtx.putImageData(dispImg, 0, 0);
    shineCtx.putImageData(shineImg, 0, 0);
    dispUrl = dispCanvas.toDataURL("image/png");
    shineUrl = shineCanvas.toDataURL("image/png");
  } catch {
    dispUrl = "";
    shineUrl = "";
  }

  const entry = { dispUrl, shineUrl, scaleR, scaleG, scaleB, w: W, h: H };
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
  if (!maps.dispUrl) return;

  const W = String(maps.w);
  const H = String(maps.h);
  filter.setAttribute("x", "0");
  filter.setAttribute("y", "0");
  filter.setAttribute("width", W);
  filter.setAttribute("height", H);
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("primitiveUnits", "userSpaceOnUse");

  const mapEl = filter.querySelector('[data-lq="map"]');
  if (mapEl) {
    mapEl.setAttribute("x", "0");
    mapEl.setAttribute("y", "0");
    mapEl.setAttribute("width", W);
    mapEl.setAttribute("height", H);
    mapEl.setAttribute("href", maps.dispUrl);
    mapEl.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", maps.dispUrl);
  }
  const shineEl = filter.querySelector('[data-lq="shine"]');
  if (shineEl) {
    shineEl.setAttribute("x", "0");
    shineEl.setAttribute("y", "0");
    shineEl.setAttribute("width", W);
    shineEl.setAttribute("height", H);
    shineEl.setAttribute("href", maps.shineUrl);
    shineEl.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", maps.shineUrl);
  }

  const blurEl = filter.querySelector('[data-lq="blur"]');
  if (blurEl) {
    const isFrosted = typeof document !== "undefined" && document.documentElement.dataset.glass === "blur";
    blurEl.setAttribute("stdDeviation", isFrosted ? "5" : "0");
  }

  const dR = filter.querySelector('[data-lq="dR"]');
  const dG = filter.querySelector('[data-lq="dG"]');
  const dB = filter.querySelector('[data-lq="dB"]');
  if (dR) dR.setAttribute("scale", maps.scaleR.toFixed(2));
  if (dG) dG.setAttribute("scale", maps.scaleG.toFixed(2));
  if (dB) dB.setAttribute("scale", maps.scaleB.toFixed(2));
}
