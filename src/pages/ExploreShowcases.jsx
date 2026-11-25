import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import { Play, Pause, MoreHorizontal, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { usePlayer, useUI } from "../context.jsx";
import { useTrackMenuItems, HoverRail } from "../components.jsx";
import { SmartCover, sizedThumb } from "../lib/brand.jsx";
import { loadTrackArtists } from "../lib/artistProfile.js";
import { formatDuration } from "../lib/utils.js";

/* ──────────────────────────────────────────────────────────────
   Helpers bersama
   ────────────────────────────────────────────────────────────── */

export function artistNames(track) {
  const list = track.artists?.length ? track.artists : (track.artist ? [track.artist] : []);
  return list.map((a) => a?.name).filter(Boolean).join(", ");
}

const bgUrl = (src, px = 160) => (src ? `url(${JSON.stringify(sizedThumb(src, px))})` : "none");
const pad2 = (n) => String(n).padStart(2, "0");
const wrap = (i, n) => ((i % n) + n) % n;

function useTrackActions(track, list) {
  const { currentTrack, isPlaying, togglePlay, playSingle, playList } = usePlayer();
  const { openContextMenu } = useUI();
  const items = useTrackMenuItems(track);
  const isCurrent = !!currentTrack && currentTrack.id === track.id;
  const play = useCallback((e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (isCurrent) { togglePlay(); return; }
    if (list && list.length) {
      const idx = list.findIndex((x) => x.id === track.id);
      playList(list, idx === -1 ? 0 : idx);
    } else {
      playSingle(track);
    }
  }, [isCurrent, togglePlay, list, track, playList, playSingle]);
  const openMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(e.clientX, e.clientY, items);
  };
  const warm = () => { loadTrackArtists(track); };
  return { isCurrent, playing: isCurrent && isPlaying, play, openMenu, warm };
}

// Props aksesibilitas untuk elemen non-<button> yang bisa ditekan.
function pressable(fn) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(e); }
    },
  };
}

function EqBars() {
  return <span className="xs-eq" aria-hidden="true"><i /><i /><i /><i /></span>;
}

function PlayGlyph({ playing, size = 18 }) {
  return playing
    ? <Pause size={size} fill="currentColor" />
    : <Play size={size} fill="currentColor" style={{ marginLeft: size > 16 ? 2 : 1 }} />;
}

// Miringkan elemen mengikuti pointer (halus, dibatasi rAF). Hanya untuk mouse/pen.
function useTilt(max = 8) {
  const ref = useRef(null);
  const raf = useRef(0);
  const onPointerMove = useCallback((e) => {
    if (e.pointerType === "touch") return;
    const el = ref.current;
    if (!el) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const x = (clientX - r.left) / r.width - 0.5;
      const y = (clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`);
    });
  }, [max]);
  const onPointerLeave = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--gx", "50%");
    el.style.setProperty("--gy", "50%");
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return { ref, onPointerMove, onPointerLeave };
}

// Geser horizontal (pointer) → panggil onSwipe(-1 | 1). Tidak memakai pointer capture
// supaya tombol di dalamnya tetap bisa diklik.
function useSwipe(onSwipe, threshold = 46) {
  const start = useRef(null);
  const swiped = useRef(false);
  return {
    onPointerDown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
      swiped.current = false;
    },
    onPointerUp: (e) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.2) {
        swiped.current = true;
        onSwipe(dx < 0 ? 1 : -1);
      }
    },
    onPointerCancel: () => { start.current = null; },
    onClickCapture: (e) => {
      if (swiped.current) { e.stopPropagation(); e.preventDefault(); swiped.current = false; }
    },
  };
}

function useInView(ref) {
  const [state, setState] = useState({ seen: false, live: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === "undefined") { setState({ seen: true, live: true }); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      setState((s) => {
        if (e.isIntersecting) return s.seen && s.live ? s : { seen: true, live: true };
        return s.live ? { ...s, live: false } : s;
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return state;
}

function Showcase({ kind, title, sub, children }) {
  const ref = useRef(null);
  const { seen, live } = useInView(ref);
  return (
    <section ref={ref} className={`xs xsec-${kind}${seen ? " is-in" : ""}${live ? " is-live" : ""}`}>
      <header className="xs-head">
        <h2 className="aivy-section-title xs-title"><span>{title}</span></h2>
        {sub ? <p className="xs-sub">{sub}</p> : null}
      </header>
      {children}
    </section>
  );
}

const cover = (track, size, radius = 0) => (
  <SmartCover src={track.cover} seed={track.id + track.title} size={size} radius={radius} style={{ width: "100%", height: "100%" }} />
);

/* ──────────────────────────────────────────────────────────────
   1. Spotlight — banner hero ala Apple Music (tilt + parallax + glare)
   ────────────────────────────────────────────────────────────── */

function SpotMini({ track, list, i }) {
  const a = useTrackActions(track, list);
  return (
    <div className={`xs-spot-mini${a.isCurrent ? " current" : ""}`} style={{ "--i": i }} onContextMenu={a.openMenu} onPointerEnter={a.warm} {...pressable(a.play)}>
      <span className="cv">
        {cover(track, 120, 10)}
        <span className="ov">{a.playing ? <EqBars /> : <Play size={18} fill="currentColor" />}</span>
      </span>
      <span className="tx"><b>{track.title}</b><em>{artistNames(track) || "\u2014"}</em></span>
      <span className="no">{pad2(i + 2)}</span>
    </div>
  );
}

function SpotlightShow({ tracks }) {
  const { t } = useUI();
  const [hero, ...rest] = tracks;
  const a = useTrackActions(hero, tracks);
  const tilt = useTilt(6);
  return (
    <div className="xs-spot">
      <div
        className={`xs-spot-hero${a.isCurrent ? " current" : ""}`}
        ref={tilt.ref}
        onPointerMove={tilt.onPointerMove}
        onPointerLeave={tilt.onPointerLeave}
        onClick={a.play}
        onContextMenu={a.openMenu}
        onPointerEnter={a.warm}
      >
        <span className="xs-spot-bg" style={{ backgroundImage: bgUrl(hero.cover, 220) }} />
        <span className="xs-spot-grain" />
        <span className="xs-spot-art">{cover(hero, 420, 14)}</span>
        <span className="xs-spot-body">
          <span className="xs-eyebrow">{t("xsSpotlightTag")}</span>
          <span className="xs-spot-title">{hero.title}</span>
          <span className="xs-spot-artist">{artistNames(hero) || "\u2014"}</span>
          <button type="button" className="xs-pill" onClick={a.play}>
            <PlayGlyph playing={a.playing} size={15} /> {a.playing ? t("xsPause") : t("xsPlay")}
          </button>
        </span>
        <span className="xs-spot-glare" />
      </div>
      <div className="xs-spot-side">
        {rest.map((tr, i) => <SpotMini key={tr.id} track={tr} list={tracks} i={i} />)}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   2. Rak buku — punggung buku yang ditarik keluar, covernya berputar 3D
   ────────────────────────────────────────────────────────────── */

function ShelfBook({ track, list, i }) {
  const a = useTrackActions(track, list);
  const h = 176 + ((i * 37) % 5) * 11;
  const w = 48 + ((i * 53) % 4) * 7;
  const lean = i % 5 === 3;
  return (
    <div
      className={`xs-book${a.isCurrent ? " current" : ""}${lean ? " lean" : ""}`}
      style={{ "--h": `${h}px`, "--w": `${w}px`, "--d": `${Math.round(h * 0.68)}px`, "--i": i }}
      onContextMenu={a.openMenu}
      onPointerEnter={a.warm}
      aria-label={`${track.title} \u2014 ${artistNames(track)}`}
      {...pressable(a.play)}
    >
      <span className="xs-book-body">
        <span className="face spine" style={{ backgroundImage: bgUrl(track.cover, 120) }}>
          <span className="spine-t">{track.title}</span>
          {a.playing ? <span className="spine-eq"><EqBars /></span> : null}
        </span>
        <span className="face front">{cover(track, 200)}</span>
      </span>
    </div>
  );
}

function BookshelfShow({ tracks }) {
  return (
    <div className="xs-shelf">
      <div className="xs-shelf-row">
        {tracks.map((tr, i) => <ShelfBook key={tr.id} track={tr} list={tracks} i={i} />)}
      </div>
      <div className="xs-shelf-plank" aria-hidden="true" />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   3. Buku terbuka — halaman bisa dibalik (3D page-turn), klik / geser / panah
   ────────────────────────────────────────────────────────────── */

function BookCoverFace({ total }) {
  const { t } = useUI();
  return (
    <div className="xs-pg xs-pg-hard">
      <span className="xs-hard-frame" />
      <BookOpen size={30} strokeWidth={1.4} />
      <span className="xs-hard-title">{t("xsBookTitle")}</span>
      <span className="xs-hard-rule" />
      <span className="xs-hard-sub">{total} {t("xsChapters")}</span>
      <span className="xs-hard-hint">{t("xsBookOpen")} &rarr;</span>
    </div>
  );
}

function BookArtPage({ track, no }) {
  return (
    <div className="xs-pg xs-pg-art">
      {cover(track, 520)}
      <span className="xs-pg-vig" />
      <span className="xs-pg-tag">{pad2(no)}</span>
    </div>
  );
}

function BookInfoPage({ track, list, no, total }) {
  const { t } = useUI();
  const a = useTrackActions(track, list);
  return (
    <div className="xs-pg xs-pg-info">
      <span className="xs-pg-chap">{t("xsChapter")} {pad2(no)}</span>
      <h3 className="xs-pg-title">{track.title}</h3>
      <span className="xs-pg-rule"><i /></span>
      <p className="xs-pg-artist">{artistNames(track) || "\u2014"}</p>
      <p className="xs-pg-meta">{formatDuration(track.duration)}{track.explicit ? " \u00b7 Explicit" : ""}</p>
      <button type="button" className="xs-pg-play" onClick={a.play}>
        <PlayGlyph playing={a.playing} size={14} /> {a.playing ? t("xsPause") : t("xsReadAloud")}
      </button>
      <span className="xs-pg-folio">{no} / {total}</span>
    </div>
  );
}

function OpenBookShow({ tracks }) {
  const { t } = useUI();
  const n = tracks.length;
  const [page, setPage] = useState(0);
  const [turning, setTurning] = useState(-1);
  const pageRef = useRef(0);
  const rootRef = useRef(null);

  const go = useCallback((d) => {
    const p = pageRef.current;
    const np = Math.max(0, Math.min(n, p + d));
    if (np === p) return;
    pageRef.current = np;
    setPage(np);
    setTurning(d > 0 ? p : p - 1);
  }, [n]);

  const swipe = useSwipe((dir) => go(dir));
  const onClick = (e) => {
    if (e.target.closest("button")) return;
    const r = rootRef.current.getBoundingClientRect();
    go(e.clientX - r.left > r.width / 2 ? 1 : -1);
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  };

  return (
    <div className="xs-bookwrap">
      <div className={`xs-bookshift${page === 0 ? " closed" : ""}${page === n ? " last" : ""}`}>
        <div
          className="xs-book3d"
          ref={rootRef}
          tabIndex={0}
          aria-label={t("xsBookTitle")}
          onKeyDown={onKeyDown}
          onClick={onClick}
          {...swipe}
        >
          <span className="xs-base left" />
          <span className="xs-base right" />
          {Array.from({ length: n + 1 }, (_, k) => {
            const flipped = k < page;
            return (
              <div key={k} className={`xs-leaf ${flipped ? "flipped" : "unflipped"}${turning === k ? " turning" : ""}`} style={{ zIndex: flipped ? k + 1 : n + 2 - k }}>
                <div className="xs-face front">
                  {k === 0 ? <BookCoverFace total={n} /> : <BookInfoPage track={tracks[k - 1]} list={tracks} no={k} total={n} />}
                </div>
                <div className="xs-face back">
                  {k < n ? <BookArtPage track={tracks[k]} no={k + 1} /> : <div className="xs-pg xs-pg-blank" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="xs-book-ctl">
        <button type="button" className="xs-round" onClick={() => go(-1)} disabled={page === 0} aria-label={t("xsPrev")}><ChevronLeft size={18} /></button>
        <span className="xs-book-dots" aria-hidden="true">
          {Array.from({ length: n + 1 }, (_, k) => <i key={k} className={k === page ? "on" : k < page ? "done" : ""} />)}
        </span>
        <button type="button" className="xs-round" onClick={() => go(1)} disabled={page === n} aria-label={t("xsNext")}><ChevronRight size={18} /></button>
      </div>
      <p className="xs-hint">{t("xsFlipHint")}</p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   4. Cover Flow — karusel 3D (drag / swipe / panah)
   ────────────────────────────────────────────────────────────── */

function CFItem({ track, list, o, onSelect }) {
  const a = useTrackActions(track, list);
  const ab = Math.abs(o);
  const center = o === 0;
  const hidden = ab > 3;
  return (
    <div
      className={`xs-cf-item${center ? " center" : ""}${a.isCurrent ? " current" : ""}`}
      style={{ "--o": o, "--a": ab, "--s": Math.sign(o), "--c": center ? 1 : 0, zIndex: 50 - ab, opacity: hidden ? 0 : 1, pointerEvents: hidden ? "none" : "auto" }}
      onContextMenu={a.openMenu}
      aria-hidden={hidden || undefined}
      {...pressable(center ? a.play : onSelect)}
      tabIndex={hidden ? -1 : 0}
    >
      <span className="xs-cf-art">
        {cover(track, 320, 6)}
        {center && a.playing ? <span className="xs-cf-eq"><EqBars /></span> : null}
      </span>
    </div>
  );
}

function CoverFlowShow({ tracks }) {
  const { t } = useUI();
  const n = tracks.length;
  const [idx, setIdx] = useState(Math.floor(n / 2));
  const go = useCallback((d) => setIdx((i) => Math.max(0, Math.min(n - 1, i + d))), [n]);
  const swipe = useSwipe((dir) => go(dir), 36);
  const cur = tracks[idx];
  const a = useTrackActions(cur, tracks);
  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  };
  return (
    <div className="xs-cf">
      <div className="xs-cf-stage" onKeyDown={onKeyDown} {...swipe}>
        {tracks.map((tr, i) => <CFItem key={tr.id} track={tr} list={tracks} o={i - idx} onSelect={() => setIdx(i)} />)}
      </div>
      <div className="xs-cf-cap">
        <button type="button" className="xs-round" onClick={() => go(-1)} disabled={idx === 0} aria-label={t("xsPrev")}><ChevronLeft size={18} /></button>
        <div className="xs-cf-info" key={cur.id}>
          <b>{cur.title}</b>
          <em>{artistNames(cur) || "\u2014"}</em>
        </div>
        <button type="button" className="xs-round" onClick={() => go(1)} disabled={idx === n - 1} aria-label={t("xsNext")}><ChevronRight size={18} /></button>
      </div>
      <div className="xs-cf-play">
        <button type="button" className="xs-pill" onClick={a.play}>
          <PlayGlyph playing={a.playing} size={15} /> {a.playing ? t("xsPause") : t("xsPlay")}
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   5. Piringan hitam — sampul + vinyl yang keluar & berputar
   ────────────────────────────────────────────────────────────── */

function VinylItem({ track, list, i }) {
  const a = useTrackActions(track, list);
  return (
    <div
      className={`xs-vinyl${a.isCurrent ? " current" : ""}${a.playing ? " playing" : ""}`}
      style={{ "--i": i }}
      onContextMenu={a.openMenu}
      onPointerEnter={a.warm}
      {...pressable(a.play)}
    >
      <span className="xs-vinyl-art">
        <span className="xs-vinyl-disc">
          <span className="xs-vinyl-spin">
            <span className="xs-vinyl-label" style={{ backgroundImage: bgUrl(track.cover, 100) }} />
          </span>
        </span>
        <span className="xs-vinyl-sleeve">
          {cover(track, 260, 4)}
          <span className="xs-vinyl-shine" />
        </span>
      </span>
      <span className="xs-vinyl-meta"><b>{track.title}</b><em>{artistNames(track) || "\u2014"}</em></span>
    </div>
  );
}

function VinylShow({ tracks }) {
  return (
    <div className="xs-vinyl-grid">
      {tracks.map((tr, i) => <VinylItem key={tr.id} track={tr} list={tracks} i={i} />)}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   6. Tumpukan kartu — geser kartu teratas (drag + fling)
   ────────────────────────────────────────────────────────────── */

const STACK_ROT = [0, -6, 5.5, -8, 7, -3];

const StackCard = forwardRef(function StackCard({ track, list, pos, total, onCommit, busy }, ref) {
  const a = useTrackActions(track, list);
  const elRef = useRef(null);
  const st = useRef({ x0: 0, y0: 0, dx: 0, active: false, moved: false });
  const timer = useRef(0);
  const wasFlung = useRef(false);
  const top = pos === 0;

  const fling = useCallback((dir) => {
    const el = elRef.current;
    if (!el || busy.current) return;
    busy.current = true;
    wasFlung.current = true;
    el.style.transition = "";
    el.style.transform = `translate3d(${dir * 125}%, -4%, 0) rotate(${dir * 22}deg)`;
    el.style.opacity = "0";
    timer.current = window.setTimeout(() => onCommit(), 340);
  }, [busy, onCommit]);

  useImperativeHandle(ref, () => ({ fling }), [fling]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Kartu yang baru saja dilempar muncul lagi di belakang tumpukan (tanpa melintas layar).
  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el || !wasFlung.current) return;
    wasFlung.current = false;
    el.style.transition = "none";
    el.style.transform = "";
    el.style.opacity = "0";
    void el.offsetWidth;
    const raf = requestAnimationFrame(() => {
      el.style.transition = "";
      el.style.opacity = "";
      busy.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [pos, busy]);

  const down = (e) => {
    if (!top || busy.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    st.current = { x0: e.clientX, y0: e.clientY, dx: 0, active: true, moved: false };
    try { elRef.current.setPointerCapture(e.pointerId); } catch { /* noop */ }
    elRef.current.style.transition = "none";
  };
  const move = (e) => {
    const s = st.current;
    if (!s.active) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    s.dx = dx;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) s.moved = true;
    elRef.current.style.transform = `translate3d(${dx}px, ${dy * 0.22}px, 0) rotate(${dx * 0.055}deg)`;
  };
  const up = () => {
    const s = st.current;
    if (!s.active) return;
    s.active = false;
    const el = elRef.current;
    el.style.transition = "";
    if (Math.abs(s.dx) > 90) { fling(Math.sign(s.dx)); return; }
    el.style.transform = "";
    if (!s.moved) a.play();
  };
  const cancel = () => {
    st.current.active = false;
    if (elRef.current) { elRef.current.style.transition = ""; elRef.current.style.transform = ""; }
  };

  return (
    <div
      ref={elRef}
      className={`xs-stack-card${top ? " top" : ""}${a.isCurrent ? " current" : ""}`}
      style={{ "--p": pos, "--r": `${STACK_ROT[pos % STACK_ROT.length]}deg`, zIndex: total - pos, opacity: pos > 3 ? 0 : undefined, pointerEvents: top ? "auto" : "none" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onContextMenu={a.openMenu}
      aria-hidden={top ? undefined : true}
    >
      {cover(track, 420, 18)}
      <span className="xs-stack-shade" />
      <span className="xs-stack-txt"><b>{track.title}</b><em>{artistNames(track) || "\u2014"}</em></span>
      {a.playing ? <span className="xs-stack-eq"><EqBars /></span> : null}
    </div>
  );
});

function StackShow({ tracks }) {
  const { t } = useUI();
  const n = tracks.length;
  const [order, setOrder] = useState(() => tracks.map((_, i) => i));
  const topRef = useRef(null);
  const busy = useRef(false);
  const cur = tracks[order[0]];
  const a = useTrackActions(cur, tracks);

  const commit = useCallback(() => setOrder((o) => [...o.slice(1), o[0]]), []);
  const next = () => topRef.current?.fling(1);
  const prev = () => {
    if (busy.current) return;
    setOrder((o) => [o[o.length - 1], ...o.slice(0, -1)]);
  };

  return (
    <div className="xs-stack">
      <div className="xs-stack-deck">
        {order.map((ti, pos) => (
          <StackCard
            key={tracks[ti].id}
            ref={pos === 0 ? topRef : null}
            track={tracks[ti]}
            list={tracks}
            pos={pos}
            total={n}
            onCommit={commit}
            busy={busy}
          />
        ))}
      </div>
      <div className="xs-stack-side">
        <span className="xs-eyebrow">{pad2(tracks.indexOf(cur) + 1)} / {pad2(n)}</span>
        <div className="xs-stack-now" key={cur.id}>
          <b>{cur.title}</b>
          <em>{artistNames(cur) || "\u2014"}</em>
        </div>
        <div className="xs-stack-btns">
          <button type="button" className="xs-round" onClick={prev} aria-label={t("xsPrev")}><ChevronLeft size={18} /></button>
          <button type="button" className="xs-pill" onClick={a.play}>
            <PlayGlyph playing={a.playing} size={15} /> {a.playing ? t("xsPause") : t("xsPlay")}
          </button>
          <button type="button" className="xs-round" onClick={next} aria-label={t("xsNext")}><ChevronRight size={18} /></button>
        </div>
        <p className="xs-hint">{t("xsSwipeHint")}</p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   7. Mozaik (bento) — ubin berbeda ukuran, muncul bergantian
   ────────────────────────────────────────────────────────────── */

const BENTO_SHAPES = ["big", "sq", "sq", "wide", "sq", "sq", "wide"];

function BentoTile({ track, list, i, shape }) {
  const a = useTrackActions(track, list);
  return (
    <div
      className={`xs-bento-tile ${shape}${a.isCurrent ? " current" : ""}`}
      style={{ "--i": i }}
      onContextMenu={a.openMenu}
      onPointerEnter={a.warm}
      {...pressable(a.play)}
    >
      <span className="img">{cover(track, shape === "big" ? 560 : 320)}</span>
      <span className="shade" />
      <span className="txt"><b>{track.title}</b><em>{artistNames(track) || "\u2014"}</em></span>
      <span className="go">{a.playing ? <EqBars /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}</span>
    </div>
  );
}

function BentoShow({ tracks }) {
  return (
    <div className="xs-bento">
      {tracks.map((tr, i) => <BentoTile key={tr.id} track={tr} list={tracks} i={i} shape={BENTO_SHAPES[i % BENTO_SHAPES.length]} />)}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   8. Dinding polaroid — foto miring yang jatuh & menegak saat disentuh
   ────────────────────────────────────────────────────────────── */

const POLAROID_ROT = [-5, 3, -2, 5.5, -3.5, 2.5];

function PolaroidItem({ track, list, i }) {
  const a = useTrackActions(track, list);
  return (
    <div
      className={`xs-pola${a.isCurrent ? " current" : ""}`}
      style={{ "--i": i, "--r": `${POLAROID_ROT[i % POLAROID_ROT.length]}deg` }}
      onContextMenu={a.openMenu}
      onPointerEnter={a.warm}
      {...pressable(a.play)}
    >
      <span className="xs-pola-tape" aria-hidden="true" />
      <span className="xs-pola-photo">
        {cover(track, 280)}
        {a.playing ? <span className="xs-pola-eq"><EqBars /></span> : null}
      </span>
      <span className="xs-pola-cap">{track.title}</span>
      <span className="xs-pola-sub">{artistNames(track) || "\u2014"}</span>
    </div>
  );
}

function PolaroidShow({ tracks }) {
  return (
    <div className="xs-pola-wall">
      {tracks.map((tr, i) => <PolaroidItem key={tr.id} track={tr} list={tracks} i={i} />)}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   9. Marquee — dua baris pil yang berjalan berlawanan arah
   ────────────────────────────────────────────────────────────── */

function MarqueeChip({ track, list, hidden }) {
  const a = useTrackActions(track, list);
  return (
    <div
      className={`xs-chip${a.isCurrent ? " current" : ""}`}
      onContextMenu={a.openMenu}
      aria-hidden={hidden || undefined}
      {...pressable(a.play)}
      tabIndex={hidden ? -1 : 0}
    >
      <span className="cv">
        {cover(track, 112, 999)}
        {a.playing ? <span className="ov"><EqBars /></span> : null}
      </span>
      <span className="tx"><b>{track.title}</b><em>{artistNames(track) || "\u2014"}</em></span>
    </div>
  );
}

function MarqueeRow({ tracks, list, reverse, dur }) {
  return (
    <div className="xs-mq-row-wrap">
      <div className={`xs-mq-row${reverse ? " rev" : ""}`} style={{ "--dur": `${dur}s` }}>
        {[0, 1].map((copy) => (
          <div className="xs-mq-set" key={copy}>
            {tracks.map((tr) => <MarqueeChip key={tr.id} track={tr} list={list} hidden={copy === 1} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function MarqueeShow({ tracks }) {
  const half = Math.ceil(tracks.length / 2);
  return (
    <div className="xs-mq">
      <MarqueeRow tracks={tracks.slice(0, half)} list={tracks} dur={46} />
      <MarqueeRow tracks={tracks.slice(half)} list={tracks} dur={54} reverse />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   10. Akordeon — panel yang membuka saat disentuh
   ────────────────────────────────────────────────────────────── */

function AccPanel({ track, list, i, active, onActivate }) {
  const { t } = useUI();
  const a = useTrackActions(track, list);
  return (
    <div
      className={`xs-acc-p${active ? " on" : ""}${a.isCurrent ? " current" : ""}`}
      style={{ "--i": i }}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") onActivate(); }}
      onFocus={onActivate}
      onContextMenu={a.openMenu}
      {...pressable(() => (active ? a.play() : onActivate()))}
    >
      <span className="bg" style={{ backgroundImage: bgUrl(track.cover, 480) }} />
      <span className="shade" />
      <span className="no">{pad2(i + 1)}</span>
      <span className="vt">{track.title}</span>
      <span className="body">
        <b>{track.title}</b>
        <em>{artistNames(track) || "\u2014"}</em>
        <button type="button" className="xs-pill" tabIndex={active ? 0 : -1} onClick={a.play}>
          <PlayGlyph playing={a.playing} size={15} /> {a.playing ? t("xsPause") : t("xsPlay")}
        </button>
      </span>
    </div>
  );
}

function AccordionShow({ tracks }) {
  const [active, setActive] = useState(0);
  return (
    <div className="xs-acc">
      {tracks.map((tr, i) => (
        <AccPanel key={tr.id} track={tr} list={tracks} i={i} active={active === i} onActivate={() => setActive(i)} />
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   11. Tangga lagu — kolom bernomor (4 baris per kolom) ala "Top Songs"
   ────────────────────────────────────────────────────────────── */

function ChartRow({ track, list, rank, i }) {
  const { t } = useUI();
  const a = useTrackActions(track, list);
  return (
    <div
      className={`xs-chart-row${a.isCurrent ? " current" : ""}`}
      style={{ "--i": i }}
      onContextMenu={a.openMenu}
      onPointerEnter={a.warm}
      {...pressable(a.play)}
    >
      <span className="rk">{rank}</span>
      <span className="cv">
        {cover(track, 112, 6)}
        <span className="ov">{a.playing ? <EqBars /> : <Play size={16} fill="currentColor" />}</span>
      </span>
      <span className="tx"><b>{track.title}</b><em>{artistNames(track) || "\u2014"}</em></span>
      <button type="button" className="mo" onClick={a.openMenu} aria-label={t("menuMore")}><MoreHorizontal size={16} /></button>
    </div>
  );
}

function ChartShow({ tracks }) {
  const cols = [];
  for (let i = 0; i < tracks.length; i += 4) cols.push(tracks.slice(i, i + 4));
  return (
    <div className="xs-chart">
      <HoverRail className="xs-chart-rail">
        {cols.map((col, c) => (
          <div className="xs-chart-col" key={c}>
            {col.map((tr, r) => <ChartRow key={tr.id} track={tr} list={tracks} rank={c * 4 + r + 1} i={r + c * 2} />)}
          </div>
        ))}
      </HoverRail>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   12. Top picks — kartu potret besar, tilt 3D + kilau
   ────────────────────────────────────────────────────────────── */

function PickCard({ track, list, i }) {
  const { t } = useUI();
  const a = useTrackActions(track, list);
  const tilt = useTilt(10);
  return (
    <div
      className={`xs-pick${a.isCurrent ? " current" : ""}`}
      style={{ "--i": i }}
      ref={tilt.ref}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onContextMenu={a.openMenu}
      onPointerEnter={a.warm}
      {...pressable(a.play)}
    >
      <span className="img">{cover(track, 420)}</span>
      <span className="shade" />
      <span className="glare" />
      <span className="top">{t("xsPick")} {pad2(i + 1)}</span>
      <span className="bot">
        <span className="tx"><b>{track.title}</b><em>{artistNames(track) || "\u2014"}</em></span>
        <span className="go">{a.playing ? <EqBars /> : <Play size={17} fill="currentColor" style={{ marginLeft: 2 }} />}</span>
      </span>
    </div>
  );
}

function PicksShow({ tracks }) {
  return (
    <div className="xs-picks">
      <HoverRail>
        {tracks.map((tr, i) => <PickCard key={tr.id} track={tr} list={tracks} i={i} />)}
      </HoverRail>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   13. Orbit — cover mengelilingi inti, pilih satu untuk fokus
   ────────────────────────────────────────────────────────────── */

function OrbitNode({ track, list, i, n, focused, onFocus }) {
  const a = useTrackActions(track, list);
  const click = () => { if (focused) a.play(); else onFocus(); };
  return (
    <div className="xs-orbit-node" style={{ "--ang": `${(360 / n) * i}deg` }}>
      <div
        className={`xs-orbit-in${focused ? " focus" : ""}${a.isCurrent ? " current" : ""}`}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") onFocus(); }}
        onContextMenu={a.openMenu}
        aria-label={track.title}
        {...pressable(click)}
      >
        {cover(track, 160, 999)}
      </div>
    </div>
  );
}

function OrbitShow({ tracks }) {
  const { t } = useUI();
  const n = tracks.length;
  const [focus, setFocus] = useState(0);
  const [hold, setHold] = useState(false);
  const holdTimer = useRef(0);
  const cur = tracks[focus];
  const a = useTrackActions(cur, tracks);
  useEffect(() => () => window.clearTimeout(holdTimer.current), []);
  const onDown = (e) => {
    if (e.pointerType === "mouse") return;
    setHold(true);
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => setHold(false), 6000);
  };
  return (
    <div className="xs-orbit">
      <div className={`xs-orbit-stage${hold ? " hold" : ""}`} onPointerDown={onDown}>
        <span className="xs-orbit-ring r1" aria-hidden="true" />
        <span className="xs-orbit-ring r2" aria-hidden="true" />
        <div className="xs-orbit-spin">
          {tracks.map((tr, i) => (
            <OrbitNode key={tr.id} track={tr} list={tracks} i={i} n={n} focused={i === focus} onFocus={() => setFocus(i)} />
          ))}
        </div>
        <div className="xs-orbit-core" key={cur.id}>
          <button type="button" className={`disc${a.playing ? " playing" : ""}`} onClick={a.play} aria-label={a.playing ? t("xsPause") : t("xsPlay")}>
            {cover(cur, 300, 999)}
            <span className="hole" />
            <span className="go"><PlayGlyph playing={a.playing} size={22} /></span>
          </button>
          <b>{cur.title}</b>
          <em>{artistNames(cur) || "\u2014"}</em>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Registry
   `need`  = jumlah lagu yang diminta, `min` = batas minimal agar section tampil.
   Urutan dibuat selang-seling supaya dua layout mirip tidak bersebelahan.
   ────────────────────────────────────────────────────────────── */

export const SHOWCASES = [
  { kind: "spotlight", need: 4, min: 2, titleKey: "xsSpotlight", subKey: "xsSpotlightSub", Comp: SpotlightShow },
  { kind: "openbook", need: 6, min: 3, titleKey: "xsOpenBook", subKey: "xsOpenBookSub", Comp: OpenBookShow },
  { kind: "chart", need: 12, min: 4, titleKey: "xsChart", subKey: "xsChartSub", Comp: ChartShow },
  { kind: "coverflow", need: 7, min: 3, titleKey: "xsCoverflow", subKey: "xsCoverflowSub", Comp: CoverFlowShow },
  { kind: "bookshelf", need: 9, min: 4, titleKey: "xsBookshelf", subKey: "xsBookshelfSub", Comp: BookshelfShow },
  { kind: "bento", need: 7, min: 7, titleKey: "xsBento", subKey: "xsBentoSub", Comp: BentoShow },
  { kind: "vinyl", need: 6, min: 3, titleKey: "xsVinyl", subKey: "xsVinylSub", Comp: VinylShow },
  { kind: "stack", need: 6, min: 3, titleKey: "xsStack", subKey: "xsStackSub", Comp: StackShow },
  { kind: "picks", need: 7, min: 3, titleKey: "xsPicks", subKey: "xsPicksSub", Comp: PicksShow },
  { kind: "marquee", need: 12, min: 6, titleKey: "xsMarquee", subKey: "xsMarqueeSub", Comp: MarqueeShow },
  { kind: "polaroid", need: 5, min: 3, titleKey: "xsPolaroid", subKey: "xsPolaroidSub", Comp: PolaroidShow },
  { kind: "accordion", need: 5, min: 3, titleKey: "xsAccordion", subKey: "xsAccordionSub", Comp: AccordionShow },
  { kind: "orbit", need: 8, min: 5, titleKey: "xsOrbit", subKey: "xsOrbitSub", Comp: OrbitShow },
];

export const SHOWCASES_PER_CYCLE = 5;

// Siklus ke-n mengambil 5 layout berurutan (melingkar) dari registry.
export function pickShowcases(cycleIndex) {
  const out = [];
  for (let i = 0; i < SHOWCASES_PER_CYCLE; i++) out.push(SHOWCASES[wrap(cycleIndex * SHOWCASES_PER_CYCLE + i, SHOWCASES.length)]);
  return out;
}

export function ShowcaseBlock({ def, tracks }) {
  const { t } = useUI();
  const { Comp } = def;
  return (
    <Showcase kind={def.kind} title={t(def.titleKey)} sub={t(def.subKey)}>
      <Comp tracks={tracks} />
    </Showcase>
  );
}
