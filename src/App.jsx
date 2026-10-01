import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { ServerDownPage } from "./pages/ServerDownPage.jsx";
import { useBackendHealth } from "./lib/health.js";
import { RouterProvider, useRouter } from "./router.jsx";
import { useRouteSeo } from "./lib/seo.js";
import { isLowEndDevice } from "./lib/perf.js";
import {
  UIProvider, PlayerProvider, useUI, usePlayer,
  SIDEBAR_COLLAPSED_W, RIGHTPANEL_COLLAPSED_W, RIGHTPANEL_PEEK_W,
} from "./context.jsx";
import {
  ErrorBoundary, Sidebar, TopBar, PlayerBar, MobileDock, NowPlayingSheet, QueueSheet,
  RightPanel, GlobalContextMenu, AddToPlaylistModal, CreditsModal, ToastHost, ViewLoading, LyricsOverlay,
  LyricsPrefetch, AiAssistantWidget,
} from "./components.jsx";
import { LandingPage, LoginPage } from "./pages/AuthPages.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { NewTrendingPage, BestAlbumsPage, EditorsPicksPage } from "./pages/FeedPages.jsx";
const pageLoaders = {
  search: () => import("./pages/SearchPage.jsx"),
  catalog: () => import("./pages/CatalogPages.jsx"),
  library: () => import("./pages/LibraryPages.jsx"),
  rooms: () => import("./pages/RoomPages.jsx"),
  settings: () => import("./pages/SettingsPage.jsx"),
  shorts: () => import("./pages/ShortsPage.jsx"),
  maintenance: () => import("./pages/MaintenancePage.jsx"),
};
const lazyPage = (key, exportName) =>
  lazy(() => pageLoaders[key]().then((m) => ({ default: m[exportName] })));

const SearchPage = lazyPage("search", "SearchPage");
const ArtistPage = lazyPage("catalog", "ArtistPage");
const AlbumPage = lazyPage("catalog", "AlbumPage");
const LibraryPage = lazyPage("library", "LibraryPage");
const LikedPage = lazyPage("library", "LikedPage");
const PlaylistPage = lazyPage("library", "PlaylistPage");
const ImportPage = lazyPage("library", "ImportPage");
const LibraryLocalPage = lazyPage("library", "LibraryLocalPage");
const RoomLobbyPage = lazyPage("rooms", "RoomLobbyPage");
const RoomPage = lazyPage("rooms", "RoomPage");
const SettingsPage = lazyPage("settings", "SettingsPage");
const ShortsPage = lazyPage("shorts", "ShortsPage");
const MaintenancePage = lazyPage("maintenance", "MaintenancePage");

function useIsMobile(breakpoint = 860) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(`(max-width:${breakpoint}px)`).matches);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${breakpoint}px)`);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange));
  }, [breakpoint]);
  return isMobile;
}

const FULL_BLEED_ROUTES = new Set(["home", "newTrending", "editorsPicks", "bestAlbums"]);

const PAGE_BY_ROUTE = {
  home: HomePage,
  newTrending: NewTrendingPage,
  editorsPicks: EditorsPicksPage,
  bestAlbums: BestAlbumsPage,
  search: SearchPage,
  library: LibraryPage,
  libraryImport: ImportPage,
  libraryLocal: LibraryLocalPage,
  liked: LikedPage,
  shorts: ShortsPage,
  playlist: PlaylistPage,
  artist: ArtistPage,
  album: AlbumPage,
  roomLobby: RoomLobbyPage,
  room: RoomPage,
  settings: SettingsPage,
};

function AppInner() {
  const { name, params } = useRouter();
  useRouteSeo(name, params.id);
  const {
    authChecked, authUser, sidebarWidth, sidebarCollapsed, rightPanelWidth, rightPanelCollapsed, rightPanelPeek,
    mobileQueueOpen, openMobileQueue, closeMobileQueue, lyricsOpen, closeLyrics, sidebarQueueOpen, closeSidebarQueue, settings,
  } = useUI();
  const { currentTrack } = usePlayer();
  const isMobile = useIsMobile(860);
  const isPanelCompact = useIsMobile(1240);
  useEffect(() => {
    if (isLowEndDevice()) return undefined;
    const run = () => ["search", "library", "catalog"].forEach((k) => pageLoaders[k]().catch(() => {}));
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 8000 });
      return () => window.cancelIdleCallback && window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, 4000);
    return () => clearTimeout(id);
  }, []);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);

  const anyModalOpen = nowPlayingOpen || mobileQueueOpen || lyricsOpen || !!sidebarQueueOpen;
  const closeAllModals = () => { setNowPlayingOpen(false); closeMobileQueue(); closeLyrics(); if (closeSidebarQueue) closeSidebarQueue(); };

  const prevNameRef = useRef(name);
  useEffect(() => {
    if (settings.closeModalsOnNavigation && prevNameRef.current !== name) closeAllModals();
    prevNameRef.current = name;
  }, [name, settings.closeModalsOnNavigation]);

  const modalOpenRef = useRef(anyModalOpen);
  useEffect(() => { modalOpenRef.current = anyModalOpen; }, [anyModalOpen]);

  useEffect(() => {
    if (!settings.interceptBackToCloseModals) return undefined;
    if (anyModalOpen) window.history.pushState({ aivyModal: true }, "");
  }, [anyModalOpen, settings.interceptBackToCloseModals]);

  useEffect(() => {
    if (!settings.interceptBackToCloseModals) return undefined;
    const onPop = () => { if (modalOpenRef.current) closeAllModals(); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [settings.interceptBackToCloseModals]);

  if (!authChecked) return <div className="aivy-boot"><ViewLoading /></div>;
  if (name === "landing") return <LandingPage />;
  if (name === "login")
    return <LoginPage />;

  if (!authUser)
    return <LoginPage />;

  const Page = PAGE_BY_ROUTE[name] || HomePage;
  const isImmersiveShorts = isMobile && name === "shorts";

  const shellStyle = {
    "--sidebar-w": sidebarCollapsed ? `${SIDEBAR_COLLAPSED_W}px` : `${sidebarWidth}px`,
  };
  if (!isPanelCompact) {
    shellStyle["--rightpanel-w"] = rightPanelCollapsed
      ? `${RIGHTPANEL_COLLAPSED_W + (rightPanelPeek ? RIGHTPANEL_PEEK_W : 0)}px`
      : `${rightPanelWidth}px`;
  }

  return (
    <div className={`aivy-shell ${isMobile ? "is-mobile" : ""} ${rightPanelCollapsed && rightPanelPeek ? "is-rightpanel-peeking" : ""}`} style={shellStyle}>
      {!isMobile && <Sidebar />}
      <main className="aivy-main">
        {!isImmersiveShorts && <TopBar isMobile={isMobile} />}
        <div id="aivy-content-scroll" className={`aivy-content aivy-scroll ${isMobile ? "is-mobile" : ""} ${name === "shorts" ? "no-pad" : ""} ${FULL_BLEED_ROUTES.has(name) ? "home-full" : ""}`}
          style={{ paddingBottom: name === "shorts" ? 0 : (isMobile ? (currentTrack ? 150 : 84) : (currentTrack ? 118 : 24)) }}>
          <ErrorBoundary key={name + JSON.stringify(params)}>
            <Suspense fallback={<ViewLoading />}><Page /></Suspense>
          </ErrorBoundary>
        </div>
      </main>
      {!isMobile && <PlayerBar onOpenNowPlaying={() => setNowPlayingOpen(true)} />}
      {!isMobile && <RightPanel />}
      <AiAssistantWidget />

      {isMobile && <LyricsPrefetch />}
      {isMobile && !isImmersiveShorts && <MobileDock onExpandPlayer={() => setNowPlayingOpen(true)} />}
      { }
      <NowPlayingSheet open={nowPlayingOpen} onClose={() => setNowPlayingOpen(false)} onOpenQueue={() => { setNowPlayingOpen(false); openMobileQueue(); }} />
      {isMobile && <QueueSheet open={mobileQueueOpen} onClose={closeMobileQueue} />}

      <AddToPlaylistModal />
      <CreditsModal />
      <LyricsOverlay />
      <GlobalContextMenu />
      <ToastHost isMobile={isMobile} />
    </div>
  );
}

const MANUAL_MAINTENANCE_MODE = false;

export default function App() {
  const { down: backendDown, retryInSeconds, retryNow } = useBackendHealth();

  if (MANUAL_MAINTENANCE_MODE) {
    return <Suspense fallback={null}><MaintenancePage /></Suspense>;
  }

  return (
    <ErrorBoundary>
      <RouterProvider>
        <UIProvider>
          <PlayerProvider>
            <AppInner />
            {backendDown && (
              <ServerDownPage retryInSeconds={retryInSeconds} onRetryNow={retryNow} />
            )}
          </PlayerProvider>
        </UIProvider>
      </RouterProvider>
    </ErrorBoundary>
  );
}