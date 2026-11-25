import { sizedThumb } from "./brand.jsx";

/* Ukuran thumbnail (px CSS) yang dipakai tiap layout Explore.
   ExploreShowcases memakai konstanta yang sama persis dengan yang dipreload di sini,
   sehingga URL gambar identik dan browser langsung memakai hasil preload-nya. */
export const SZ = {
  row: 96,
  artist: 128,
  artistBg: 320,
  spotMini: 120,
  spotBg: 220,
  spotHero: 420,
  shelfSpine: 120,
  shelfFront: 200,
  bookArt: 520,
  coverflow: 320,
  vinyl: 260,
  vinylLabel: 100,
  stack: 420,
  bento: 320,
  bentoBig: 560,
  polaroid: 280,
  marquee: 112,
  accordion: 480,
  chart: 112,
  pick: 420,
  orbitNode: 160,
  orbitCore: 300,
};

const u = (src, px) => (src ? sizedThumb(src, px) : null);

// Daftar [cover, ukuran] yang benar-benar dirender oleh satu layout.
function sizesFor(kind, tracks) {
  const out = [];
  tracks.forEach((t, i) => {
    const c = t.cover;
    switch (kind) {
      case "spotlight":
        if (i === 0) out.push(u(c, SZ.spotHero), u(c, SZ.spotBg));
        else out.push(u(c, SZ.spotMini));
        break;
      case "openbook": out.push(u(c, SZ.bookArt)); break;
      case "chart": out.push(u(c, SZ.chart)); break;
      case "coverflow": out.push(u(c, SZ.coverflow)); break;
      case "bookshelf": out.push(u(c, SZ.shelfSpine), u(c, SZ.shelfFront)); break;
      case "bento": out.push(u(c, i === 0 ? SZ.bentoBig : SZ.bento)); break;
      case "vinyl": out.push(u(c, SZ.vinyl), u(c, SZ.vinylLabel)); break;
      case "stack": out.push(u(c, SZ.stack)); break;
      case "picks": out.push(u(c, SZ.pick)); break;
      case "marquee": out.push(u(c, SZ.marquee)); break;
      case "polaroid": out.push(u(c, SZ.polaroid)); break;
      case "accordion": out.push(u(c, SZ.accordion)); break;
      case "orbit": out.push(u(c, SZ.orbitNode), u(c, SZ.orbitCore)); break;
      default: out.push(u(c, 256));
    }
  });
  return out.filter(Boolean);
}

const rowUrls = (tracks) => (tracks || []).map((t) => u(t.cover, SZ.row)).filter(Boolean);
const artistUrls = (artists) => (artists || []).flatMap((a) => [u(a.image, SZ.artist), u(a.image, SZ.artistBg)]).filter(Boolean);
const kindOf = (b) => b.kind || b.def?.kind;

/**
 * Rencana preload untuk satu cycle.
 *  critical → yang terlihat di layar pertama (Trending + layout pertama): dimuat segera, prioritas tinggi
 *  rest     → sisanya, berurutan sesuai posisi di halaman: dimuat pelan-pelan saat idle
 */
export function cyclePlan(cycle) {
  const blocks = cycle.blocks || [];
  const first = blocks[0];
  const critical = [...rowUrls(cycle.trending), ...(first ? sizesFor(kindOf(first), first.tracks) : [])];
  const rest = [
    ...artistUrls(cycle.artists),
    ...blocks.slice(1).flatMap((b) => sizesFor(kindOf(b), b.tracks)),
    ...rowUrls(cycle.discover),
  ];
  return { critical: [...new Set(critical)], rest: [...new Set(rest)] };
}
