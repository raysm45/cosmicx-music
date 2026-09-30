// Liquid glass ala rdev/liquid-glass-react: backdrop di-blur tipis, lalu tepinya dibelokkan
// (refraksi) lewat SVG feDisplacementMap dengan chromatic aberration. Peta pergeseran dibuat
// per-ukuran elemen supaya bezel-nya selalu pas di tepi pil/lingkaran.

// filter:url() pada backdrop hanya dirender Chromium (Chrome/Edge/Samsung/WebView Android).
// Safari/iOS & Firefox otomatis pakai kaca bening biasa (blur + rim).
export function supportsRefraction() {
  if (typeof navigator === "undefined" || typeof document === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/CriOS|FxiOS|EdgiOS|Firefox|iPhone|iPad|iPod/.test(ua)) return false;
  if (!/Chrome\/\d+/.test(ua)) return false;
  try { return !!CSS.supports("backdrop-filter", "blur(1px)"); } catch { return false; }
}

const mapCache = new Map();

// R = pergeseran X, B = pergeseran Y (128 = netral). Di bezel, piksel mengambil warna dari
// arah LUAR tepi (seperti scale negatif di library) -> tepi tampak "melengkung".
export function makeDisplacementMap(w, h, bezel) {
  const key = `${w}x${h}x${bezel}`;
  if (mapCache.has(key)) return mapCache.get(key);
  let url = "";
  try {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    const r = Math.min(w, h) / 2;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const px = i + 0.5 - w / 2, py = j + 0.5 - h / 2;
        const qx = Math.abs(px) - (w / 2 - r), qy = Math.abs(py) - (h / 2 - r);
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
        const d = -(Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r); // jarak ke tepi (dalam)
        let nx = 0, ny = 0;
        if (qx > 0 || qy > 0) { const L = Math.hypot(ox, oy) || 1; nx = Math.sign(px) * ox / L; ny = Math.sign(py) * oy / L; }
        else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
        let m = 0;
        if (d < bezel) m = Math.pow(1 - Math.max(d, 0) / bezel, 2.2);
        const k = (j * w + i) * 4;
        img.data[k] = Math.round(127.5 + 127.5 * nx * m);
        img.data[k + 1] = 128;
        img.data[k + 2] = Math.round(127.5 + 127.5 * ny * m);
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    url = c.toDataURL("image/png");
  } catch { url = ""; }
  if (mapCache.size > 12) mapCache.delete(mapCache.keys().next().value);
  mapCache.set(key, url);
  return url;
}
