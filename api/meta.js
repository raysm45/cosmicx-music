export const config = { runtime: "edge" };

const SITE = "https://music.cosmicx.fun";
const API = "https://api.cosmicx.fun";
const NAME = "cosmicx Music";
const DEFAULT_IMAGE = `${SITE}/og-image.png`;
const DONATION_IMAGE = `${SITE}/og-donation.png`;

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const nameOf = (a) => (typeof a === "string" ? a : a?.name || "");

const STATIC_PAGES = {
  beranda: {
    path: "/beranda",
    title: "Beranda | cosmicx Music",
    desc: "Jelajahi lagu trending, rilisan terbaru, dan rekomendasi musik pilihan di cosmicx Music.",
    heading: "Beranda cosmicx Music",
    bodyText: "Temukan lagu-lagu yang sedang trending, rilisan terbaru, kurasi pilihan editor, dan album terbaik di cosmicx Music.",
    image: DEFAULT_IMAGE,
  },
  terbaru: {
    path: "/beranda/terbaru",
    title: "Lagu Terbaru & Trending | cosmicx Music",
    desc: "Dengarkan lagu-lagu terbaru dan yang sedang trending hari ini di cosmicx Music.",
    heading: "Lagu Terbaru & Trending — cosmicx Music",
    bodyText: "Daftar lagu rilis terbaru dan musik paling populer yang sedang banyak didengarkan pengguna cosmicx Music.",
    image: DEFAULT_IMAGE,
  },
  kurasi: {
    path: "/beranda/kurasi",
    title: "Pilihan Editor | cosmicx Music",
    desc: "Kurasi lagu dan album terbaik pilihan editor cosmicx Music untuk menemani harimu.",
    heading: "Pilihan Editor — cosmicx Music",
    bodyText: "Rekomendasi musik dan playlist pilihan editor cosmicx Music dari berbagai genre dan suasana.",
    image: DEFAULT_IMAGE,
  },
  "album-terbaik": {
    path: "/beranda/album-terbaik",
    title: "Album Terbaik | cosmicx Music",
    desc: "Daftar album terbaik sepanjang masa dan rilisan populer yang wajib kamu dengarkan di cosmicx Music.",
    heading: "Album Terbaik — cosmicx Music",
    bodyText: "Jelajahi koleksi album terbaik dari musisi lokal maupun internasional lengkap dengan lirik sinkron di cosmicx Music.",
    image: DEFAULT_IMAGE,
  },
  donasi: {
    path: "/donasi",
    title: "Donasi | cosmicx Music",
    desc: "Dukung cosmicx Music agar musiknya tetap hidup: kualitas audio lebih baik, server tetap jalan, dan fitur terus bertambah.",
    heading: "Dukung cosmicx Music",
    bodyText: "Bantu pengembangan cosmicx Music agar tetap gratis, bebas iklan mengganggu, dan terus menghadirkan pengalaman streaming musik terbaik.",
    image: DONATION_IMAGE,
  },
};

function buildPage(id) {
  const p = STATIC_PAGES[id];
  if (!p) return null;
  const body =
    `<article><h1>${esc(p.heading)}</h1><p>${esc(p.bodyText)}</p>` +
    `<nav aria-label="Navigasi Utama"><ul>` +
    `<li><a href="/">cosmicx Music</a></li>` +
    `<li><a href="/beranda">Beranda</a></li>` +
    `<li><a href="/beranda/terbaru">Lagu Terbaru &amp; Trending</a></li>` +
    `<li><a href="/beranda/kurasi">Pilihan Editor</a></li>` +
    `<li><a href="/beranda/album-terbaik">Album Terbaik</a></li>` +
    `<li><a href="/donasi">Donasi</a></li>` +
    `</ul></nav></article>`;
  return {
    path: p.path,
    body,
    image: p.image,
    ogType: "website",
    title: p.title,
    desc: p.desc,
    ld: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: p.title,
      description: p.desc,
      url: SITE + p.path,
      isPartOf: { "@id": `${SITE}/#website` },
    },
  };
}

async function load(type, id) {
  const url =
    type === "artist"
      ? `${API}/api/artist?q=${encodeURIComponent(id)}`
      : `${API}/api/album/${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  return res.json();
}
function build(type, id, d) {
  const path = `/${type}/${encodeURIComponent(id)}`;

  if (type === "artist") {
    if (!d?.name) return null;
    const albums = (Array.isArray(d.albums) ? d.albums : []).filter((a) => a?.id && a?.title).slice(0, 30);
    const body =
      `<main><h1>${esc(d.name)}</h1>` +
      (d.bio ? `<p>${esc(clip(d.bio, 600))}</p>` : `<p>${esc(d.name)} di ${NAME}. Dengarkan lagu terpopuler, album, dan single.</p>`) +
      (albums.length
        ? `<h2>Album</h2><ul>${albums.map((a) => `<li><a href="/album/${encodeURIComponent(a.id)}">${esc(a.title)}</a></li>`).join("")}</ul>`
        : "") +
      `<p><a href="/">${NAME}</a></p></main>`;
    return {
      path, body, image: d.image || d.banner || null, ogType: "profile",
      title: `${d.name} | ${NAME}`,
      desc: `${d.name} di ${NAME}. Dengarkan lagu terpopuler, album, dan single dari ${d.name}.`,
      ld: { "@context": "https://schema.org", "@type": "MusicGroup", name: d.name, url: SITE + path, ...(d.image ? { image: d.image } : {}) },
    };
  }

  if (!d?.title) return null;
  const by = d.artist?.name || "";
  const tracks = (Array.isArray(d.tracks) ? d.tracks : []).filter((t) => t?.title).slice(0, 100);
  const body =
    `<main><h1>${esc(d.title)}</h1>` +
    (by
      ? `<p>Album oleh ${d.artist?.id ? `<a href="/artist/${encodeURIComponent(d.artist.id)}">${esc(by)}</a>` : esc(by)}</p>`
      : "") +
    (tracks.length
      ? `<h2>Daftar lagu</h2><ol>${tracks.map((t) => `<li>${esc(t.title)}${nameOf(t.artist) ? ` - ${esc(nameOf(t.artist))}` : ""}</li>`).join("")}</ol>`
      : "") +
    `<p><a href="/">${NAME}</a></p></main>`;
  return {
    path, body, image: d.cover || null, ogType: "music.album",
    title: by ? `${d.title} - Album oleh ${by} | ${NAME}` : `${d.title} | ${NAME}`,
    desc: `Dengarkan ${d.title}${by ? ` oleh ${by}` : ""} di ${NAME}${d.tracks?.length ? `. ${d.tracks.length} lagu.` : "."}`,
    ld: {
      "@context": "https://schema.org", "@type": "MusicAlbum", name: d.title, url: SITE + path,
      ...(by ? { byArtist: { "@type": "MusicGroup", name: by } } : {}),
      ...(d.cover ? { image: d.cover } : {}),
      ...(d.tracks?.length ? { numTracks: d.tracks.length } : {}),
    },
  };
}

function inject(html, m) {
  const url = SITE + m.path;
  const hasImg = /^https?:\/\//.test(m.image || "");
  const img = hasImg ? m.image : DEFAULT_IMAGE;
  const ld = JSON.stringify(m.ld).replace(/</g, "\\u003c");
  const block = [
    `<meta name="description" content="${esc(m.desc)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="${m.ogType}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.desc)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(img)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.desc)}" />`,
    `<meta name="twitter:image" content="${esc(img)}" />`,
    `<script type="application/ld+json" id="seo-page-jsonld">${ld}</script>`,
  ].join("\n    ");

  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(m.title)}</title>`)
    .replace(/<meta name="description"[^>]*>\s*/, "")
    .replace(/<link rel="canonical"[^>]*>\s*/, "")
    .replace(/<meta (?:property|name)="(?:og:type|og:title|og:description|og:url|og:image|og:image:width|og:image:height|twitter:card|twitter:title|twitter:description|twitter:image)"[^>]*>\s*/g, "")
    .replace("</head>", `    ${block}\n  </head>`)
    .replace(/<!--ssr-->[\s\S]*?<!--\/ssr-->/, `<!--ssr-->${m.body}<!--/ssr-->`);
}

export default async function handler(req) {
  const u = new URL(req.url);
  const type = u.searchParams.get("type");
  const id = u.searchParams.get("id");
  let html = await (await fetch(new URL("/index.html", u.origin))).text();

  if (type === "page" && id) {
    const meta = buildPage(id);
    if (meta) html = inject(html, meta);
  } else if ((type === "artist" || type === "album") && id) {
    try {
      const meta = build(type, id, await load(type, id));
      if (meta) html = inject(html, meta);
    } catch {}
  }

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
