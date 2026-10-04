import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

const ROUTES = [
  ["landing", "/"],
  ["login", "/login"],
  ["home", "/beranda"],
  ["newTrending", "/beranda/terbaru"],
  ["editorsPicks", "/beranda/kurasi"],
  ["bestAlbums", "/beranda/album-terbaik"],
  ["search", "/cari"],
  ["library", "/koleksi"],
  ["libraryImport", "/koleksi/import"],
  ["libraryLocal", "/koleksi/lokal"],
  ["liked", "/liked"],
  ["shorts", "/shorts"],
  ["settings", "/setting"],
  ["roomLobby", "/ruang"],
  ["room", "/ruang/:id"],
  ["playlist", "/playlist/:id"],
  ["artist", "/artist/:id"],
  ["album", "/album/:id"],
];

function matchPath(pathname) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const parts = clean.split("/").filter(Boolean);
  for (const [name, pattern] of ROUTES) {
    const patParts = pattern.split("/").filter(Boolean);
    if (patParts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < patParts.length; i++) {
      if (patParts[i].startsWith(":")) params[patParts[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (patParts[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { name, params };
  }
  return { name: "notFound", params: {} };
}

export function pathFor(name, params = {}) {
  const entry = ROUTES.find(([n]) => n === name);
  if (!entry) return "/";
  return entry[1].replace(/:([a-zA-Z]+)/g, (_, key) => encodeURIComponent(params[key] ?? ""));
}

const RouterCtx = createContext(null);
export function useRouter() { return useContext(RouterCtx); }

export function RouterProvider({ children }) {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to, opts = {}) => {
    const target = to.startsWith("/") ? to : pathFor(to, opts.params);
    if (target === window.location.pathname && !opts.force) return;
    if (opts.replace) window.history.replaceState({}, "", target);
    else window.history.pushState({}, "", target);
    setPath(target);
    if (!opts.preserveScroll) window.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => window.history.back(), []);
  const forward = useCallback(() => window.history.forward(), []);

  const route = useMemo(() => matchPath(path), [path]);

  const value = useMemo(() => ({
    path, name: route.name, params: route.params, navigate, back, forward, pathFor,
  }), [path, route, navigate, back, forward]);

  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>;
}

export function Link({ to, params, replace, className, children, onClick, ...rest }) {
  const { navigate } = useRouter();
  const href = to.startsWith("/") ? to : pathFor(to, params);
  return (
    <a
      href={href} className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)
          return;
        e.preventDefault();
        onClick?.(e);
        navigate(href, { replace });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}