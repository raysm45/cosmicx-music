<div align="center">

# 🎵 Aivy

**A fast, modern web music player — search, stream, listen together, and enjoy synced lyrics, all in your browser.**

[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-black?logo=socket.io&logoColor=white)](https://socket.io)
[![License](https://img.shields.io/badge/license-Proprietary-lightgrey)](#license)

</div>

---

## ✨ Features

- 🔍 **Search & Browse** — find tracks, artists, and albums in seconds
- 📚 **Personal Library** — playlists, liked songs, and imports
- 🎬 **Shorts** — swipeable short-form music video feed
- 👥 **Listen Together** — real-time synced rooms (public/private, host-controlled, password-protected) powered by Socket.IO
- 🎧 **Discord Profile Status** — show what you're listening to on your Discord profile (title, artist, cover, progress), Spotify-style, via the local `presence-bridge`
- 📝 **Synced Lyrics** — line-by-line lyrics view while you listen
- 🌐 **Multi-language** — English & Bahasa Indonesia out of the box
- 📱 **Responsive UI** — polished desktop layout and a dedicated mobile experience (mini player, bottom sheets, tab bar)
- 🟢 **Live Status Awareness** — automatic, non-intrusive backend health detection with graceful reconnect
- 🔐 **OAuth Login** — sign in with Google or Discord

---

## 🛠️ Tech Stack

| Layer       | Tech                                              |
|-------------|----------------------------------------------------|
| UI          | React 18, Vite 5                                   |
| Realtime    | Socket.IO Client                                   |
| Icons       | Lucide React                                       |
| Lyrics      | Lit (custom `am-lyrics` web component)             |
| Integrations| Discord Embedded App SDK                           |
| Deployment  | Vercel-ready (`vercel.json` included)              |

> This is the **frontend** application. It talks to a companion Node.js/Express backend for search, streaming, auth, and realtime rooms.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A running instance of the [Aivy backend](#) (or access to a hosted one)

### Installation

```bash
git clone <this-repo-url>
cd aivy-frontend
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Base URL of the backend API (defaults to the production API if omitted)
VITE_API_BASE=http://localhost:3000

# (Optional) URL presence bridge untuk status "Listening to" di profil Discord.
# Default: http://127.0.0.1:6464 — lihat folder presence-bridge/
# VITE_PRESENCE_BRIDGE_URL=http://127.0.0.1:6464
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### Production Build

```bash
npm run build
npm run preview   # preview the production build locally
```

---

## 📁 Project Structure

```
frontend/
├── src/
│   ├── pages/          # Route-level views (Home, Search, Library, Rooms, Shorts, Settings, Auth...)
│   ├── components.jsx  # Shared UI components (player bar, sidebar, modals, sheets, etc.)
│   ├── context.jsx     # Global providers — UI state & the audio Player
│   ├── router.jsx      # Lightweight client-side router
│   ├── lib/            # API client, i18n, health check, utilities
│   └── vendor/         # Vendored third-party integrations (am-lyrics)
├── public/              # Static assets & service worker
├── main.jsx             # App entry point
└── vite.config.js       # Vite configuration
```

---

## 🩺 Backend Health Detection

The app silently pings the backend in the background. If the connection genuinely drops (not just a background-tab throttle), a friendly **Server Down** screen appears as an overlay — without interrupting playback — and the app reconnects automatically once the backend is reachable again.

---

## 🙏 Credits & Open Source

Aivy is built on top of the amazing work of the open-source community. Huge thanks to the authors and maintainers of these projects — click any badge to visit the repository:

### Frontend

[![React](https://img.shields.io/badge/React-facebook%2Freact-61DAFB?logo=react&logoColor=white)](https://github.com/facebook/react)
[![Vite](https://img.shields.io/badge/Vite-vitejs%2Fvite-646CFF?logo=vite&logoColor=white)](https://github.com/vitejs/vite)
[![vite-plugin-react](https://img.shields.io/badge/plugin--react-vitejs%2Fvite--plugin--react-646CFF?logo=vite&logoColor=white)](https://github.com/vitejs/vite-plugin-react)
[![Lit](https://img.shields.io/badge/Lit-lit%2Flit-324FFF?logo=lit&logoColor=white)](https://github.com/lit/lit)
[![Lucide](https://img.shields.io/badge/Lucide-lucide--icons%2Flucide-F56565?logo=lucide&logoColor=white)](https://github.com/lucide-icons/lucide)
[![Socket.IO Client](https://img.shields.io/badge/Socket.IO_Client-socketio%2Fsocket.io--client-black?logo=socket.io&logoColor=white)](https://github.com/socketio/socket.io-client)

### Vendored

[![am-lyrics](https://img.shields.io/badge/am--lyrics-binimum%2Fam--lyrics-FA243C?logo=apple-music&logoColor=white)](https://github.com/binimum/am-lyrics)
> Synced, animated lyrics web component — vendored & adapted in `src/vendor/am-lyrics`.

### Backend

[![Express](https://img.shields.io/badge/Express-expressjs%2Fexpress-black?logo=express&logoColor=white)](https://github.com/expressjs/express)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-socketio%2Fsocket.io-black?logo=socket.io&logoColor=white)](https://github.com/socketio/socket.io)
[![mysql2](https://img.shields.io/badge/mysql2-sidorares%2Fnode--mysql2-4479A1?logo=mysql&logoColor=white)](https://github.com/sidorares/node-mysql2)
[![cors](https://img.shields.io/badge/cors-expressjs%2Fcors-black?logo=express&logoColor=white)](https://github.com/expressjs/cors)
[![cookie-parser](https://img.shields.io/badge/cookie--parser-expressjs%2Fcookie--parser-black?logo=express&logoColor=white)](https://github.com/expressjs/cookie-parser)
[![dotenv](https://img.shields.io/badge/dotenv-motdotla%2Fdotenv-ECD53F?logo=dotenv&logoColor=black)](https://github.com/motdotla/dotenv)
[![jsonwebtoken](https://img.shields.io/badge/jsonwebtoken-auth0%2Fnode--jsonwebtoken-000000?logo=jsonwebtokens&logoColor=white)](https://github.com/auth0/node-jsonwebtoken)
[![jsdom](https://img.shields.io/badge/jsdom-jsdom%2Fjsdom-yellow?logo=javascript&logoColor=black)](https://github.com/jsdom/jsdom)
[![node-cache](https://img.shields.io/badge/node--cache-node--cache%2Fnode--cache-339933?logo=node.js&logoColor=white)](https://github.com/node-cache/node-cache)
[![p-queue](https://img.shields.io/badge/p--queue-sindresorhus%2Fp--queue-339933?logo=node.js&logoColor=white)](https://github.com/sindresorhus/p-queue)
[![sharp](https://img.shields.io/badge/sharp-lovell%2Fsharp-99CC00?logo=sharp&logoColor=white)](https://github.com/lovell/sharp)
[![undici](https://img.shields.io/badge/undici-nodejs%2Fundici-339933?logo=node.js&logoColor=white)](https://github.com/nodejs/undici)
[![youtubei.js](https://img.shields.io/badge/youtubei.js-LuanRT%2FYouTube.js-FF0000?logo=youtube&logoColor=white)](https://github.com/LuanRT/YouTube.js)
[![BgUtils](https://img.shields.io/badge/BgUtils-LuanRT%2FBgUtils-FF0000?logo=youtube&logoColor=white)](https://github.com/LuanRT/BgUtils)
[![yt-search](https://img.shields.io/badge/yt--search-talmobi%2Fyt--search-FF0000?logo=youtube&logoColor=white)](https://github.com/talmobi/yt-search)

> 📌 If any of these libraries are updated or swapped out, please keep this section in sync.

## 🤝 Contributing

Issues and pull requests are welcome. Please open an issue first to discuss significant changes.

## 📄 License

This project is currently unlicensed / proprietary. Contact the maintainer for usage terms.

---

<div align="center">
Made by the Aivy team
</div>


## SEO (music.cosmicx.fun)

- `index.html`: judul, meta, Open Graph, JSON-LD `WebSite` + konten dasar di dalam `#root` (antara `<!--ssr-->` dan `<!--/ssr-->`).
- `src/lib/seo.js`: judul/meta per halaman di sisi klien.
- `api/meta.js` + `vercel.json`: Edge Function yang mengisi `<head>` dan konten dasar untuk `/artist/:id` dan `/album/:id` sebelum HTML dikirim.
- `public/og-image.png` (1200x630), `public/robots.txt`, `public/sitemap.xml`.
