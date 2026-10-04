import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const AUDIO_SRC = "/audio.mp3";

const PALETTE = {
  ink2: "var(--pm-outline, #0D0D0D)",
  accent: "var(--pm-accent, #9A9A9A)",
  accentStrong: "var(--pm-accent-strong, #D6D6D6)",
  accentDark: "var(--pm-accent-dark, #4A4A4A)",
  white: "#F2F2F2",
  offwhite: "#DCDCDC",
  berry: "var(--pm-berry, #8A8A8A)",
  berryStrong: "var(--pm-berry-strong, #B5B5B5)",
  berryDark: "#5A5A5A",
  gold: "var(--pm-gold, #C9C9C9)",
  goldDark: "#8F8F8F",
  wood: "#6E6E6E",
  woodDark: "#484848",
  metal: "#3A3A3A",
  metalLight: "#585858",
  screen: "#141414",
  screenGlow: "#E6E6E6",
  ledRed: "#BDBDBD",
  sky: "#A8A8A8",
  clay: "#7E7E7E",
};

function rectCells(x0, y0, w, h, color) {
  const out = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) out.push({ x, y, color });
  }
  return out;
}

function ellipseCells(cx, cy, rx, ry, color) {
  const out = [];
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x - cx + 0.5) / rx;
      const ny = (y - cy + 0.5) / ry;
      if (nx * nx + ny * ny <= 1) out.push({ x, y, color });
    }
  }
  return out;
}

function paint(...layers) {
  const map = new Map();
  layers.flat().forEach((c) => map.set(`${c.x},${c.y}`, c.color));
  return Array.from(map, ([key, color]) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y, color };
  });
}

function clampNum(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function PixelSprite({ cells, cols, rows, className, style }) {
  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`}
      className={className}
      style={style}
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {cells.map((c, i) => {
        if (!c.flicker) {
          return <rect key={i} x={c.x} y={c.y} width={1.06} height={1.06} fill={c.color} />;
        }
        const ledGroupX = Math.floor(c.x / 2) * 2;
        const baseDelay = ((ledGroupX * 53 + c.y * 29) % 37) / 10;
        return (
          <rect
            key={i}
            x={c.x}
            y={c.y}
            width={1.06}
            height={1.06}
            fill={c.color}
            className="pm-led-flicker"
            style={{ animationDelay: `calc(${baseDelay}s + var(--pm-rack-seed, 0) * 0.6s)` }}
          />
        );
      })}
    </svg>
  );
}

function buildAC() {
  const layers = [
    rectCells(1, 1, 24, 8, PALETTE.ink2),
    rectCells(2, 2, 22, 6, PALETTE.white),
    rectCells(2, 7, 22, 1, PALETTE.offwhite),
  ];
  for (let i = 0; i < 5; i++) layers.push(rectCells(4 + i * 4, 4, 2, 2, PALETTE.metal));
  layers.push(rectCells(22, 3, 1, 1, PALETTE.screenGlow));
  return { cells: paint(...layers), cols: 26, rows: 10 };
}

function buildTV() {
  const layers = [
    rectCells(1, 1, 20, 13, PALETTE.ink2),
    rectCells(2, 2, 18, 10, PALETTE.metal),
    rectCells(3, 3, 16, 8, PALETTE.screen),
  ];
  const noiseColors = [PALETTE.accentStrong, PALETTE.white, PALETTE.screenGlow];
  const noiseSeed = [
    [5, 4], [11, 5], [15, 5], [7, 7], [13, 8], [9, 9], [17, 6], [6, 9], [14, 4],
  ];
  noiseSeed.forEach(([x, y], i) => layers.push(rectCells(x, y, 1, 1, noiseColors[i % noiseColors.length])));
  return { cells: paint(...layers), cols: 22, rows: 15 };
}

function buildServerRack() {
  const layers = [
    rectCells(1, 1, 14, 24, PALETTE.ink2),
    rectCells(2, 2, 12, 22, PALETTE.metal),
    rectCells(4, 2, 8, 2, PALETTE.metalLight),
  ];
  const baseCells = paint(...layers);

  const ledRows = [6, 9, 12, 15, 18, 21];
  const ledCells = [];
  ledRows.forEach((y, i) => {
    const isFaultRow = i === 4;
    rectCells(4, y, 2, 1, isFaultRow ? PALETTE.ledRed : PALETTE.screenGlow).forEach((c) => {
      ledCells.push({ ...c, flicker: !isFaultRow });
    });
    rectCells(10, y, 2, 1, PALETTE.screenGlow).forEach((c) => {
      ledCells.push({ ...c, flicker: true });
    });
  });

  return { cells: [...baseCells, ...ledCells], cols: 16, rows: 26 };
}

function buildComputerDesk() {
  const layers = [
    rectCells(1, 10, 20, 6, PALETTE.wood),
    rectCells(1, 15, 20, 1, PALETTE.woodDark),
    rectCells(2, 16, 2, 2, PALETTE.woodDark),
    rectCells(17, 16, 2, 2, PALETTE.woodDark),
    rectCells(9, 8, 2, 2, PALETTE.metal),
    rectCells(4, 1, 14, 9, PALETTE.ink2),
    rectCells(5, 2, 12, 7, PALETTE.metal),
    rectCells(6, 3, 10, 5, PALETTE.screen),
    rectCells(7, 4, 3, 1, PALETTE.screenGlow),
    rectCells(7, 6, 6, 1, PALETTE.accentStrong),
    rectCells(11, 5, 2, 1, PALETTE.screenGlow),
    rectCells(6, 11, 8, 2, PALETTE.metalLight),
    rectCells(7, 17, 8, 3, PALETTE.berry),
    rectCells(7, 17, 8, 1, PALETTE.berryStrong),
  ];
  return { cells: paint(...layers), cols: 22, rows: 20 };
}

function buildBed() {
  const layers = [
    rectCells(1, 1, 24, 16, PALETTE.woodDark),
    rectCells(2, 2, 22, 14, PALETTE.offwhite),
    rectCells(4, 3, 7, 4, PALETTE.ink2),
    rectCells(5, 4, 5, 2, PALETTE.white),
    rectCells(2, 9, 22, 7, PALETTE.berry),
    rectCells(2, 12, 22, 1, PALETTE.berryDark),
    rectCells(2, 14, 22, 1, PALETTE.berryDark),
    rectCells(15, 3, 6, 4, PALETTE.berryStrong),
  ];
  return { cells: paint(...layers), cols: 26, rows: 18 };
}

function buildSofa() {
  const layers = [
    rectCells(1, 1, 22, 12, PALETTE.ink2),
    rectCells(2, 2, 20, 4, PALETTE.berry),
    rectCells(2, 6, 20, 6, PALETTE.berryStrong),
    rectCells(9, 6, 1, 6, PALETTE.berryDark),
    rectCells(16, 6, 1, 6, PALETTE.berryDark),
    rectCells(2, 2, 2, 10, PALETTE.berryDark),
    rectCells(20, 2, 2, 10, PALETTE.berryDark),
  ];
  return { cells: paint(...layers), cols: 24, rows: 14 };
}

function buildPlantPot() {
  const layers = [
    rectCells(4, 2, 4, 3, PALETTE.accent),
    rectCells(1, 4, 4, 3, PALETTE.accentStrong),
    rectCells(7, 3, 3, 4, PALETTE.accent),
    rectCells(3, 1, 4, 3, PALETTE.accentStrong),
    rectCells(2, 8, 8, 6, PALETTE.ink2),
    rectCells(3, 9, 6, 4, PALETTE.clay),
    rectCells(3, 9, 6, 1, PALETTE.berryStrong),
  ];
  return { cells: paint(...layers), cols: 12, rows: 14 };
}

function buildRug() {
  const layers = [
    rectCells(0, 0, 30, 18, PALETTE.accentDark),
    rectCells(0, 0, 30, 1, PALETTE.gold),
    rectCells(0, 17, 30, 1, PALETTE.gold),
    rectCells(0, 0, 1, 18, PALETTE.gold),
    rectCells(29, 0, 1, 18, PALETTE.gold),
    rectCells(13, 7, 4, 4, PALETTE.goldDark),
    rectCells(14, 8, 2, 2, PALETTE.gold),
  ];
  return { cells: paint(...layers), cols: 30, rows: 18 };
}

function buildDoor() {
  const layers = [
    rectCells(0, 0, 14, 28, PALETTE.ink2),
    rectCells(1, 1, 12, 26, PALETTE.woodDark),
    rectCells(2, 2, 10, 24, PALETTE.wood),
    rectCells(2, 2, 10, 1, PALETTE.woodDark),
    rectCells(4, 5, 6, 8, PALETTE.woodDark),
    rectCells(4, 15, 6, 8, PALETTE.woodDark),
    rectCells(5, 6, 4, 6, PALETTE.wood),
    rectCells(5, 16, 4, 6, PALETTE.wood),
    rectCells(10, 14, 1, 2, PALETTE.gold),
  ];
  return { cells: paint(...layers), cols: 14, rows: 28 };
}

const AC_SPRITE = buildAC();
const TV_SPRITE = buildTV();
const RACK_SPRITE = buildServerRack();
const DESK_SPRITE = buildComputerDesk();
const BED_SPRITE = buildBed();
const SOFA_SPRITE = buildSofa();
const POT_SPRITE = buildPlantPot();
const RUG_SPRITE = buildRug();
const DOOR_SPRITE = buildDoor();

function buildBody() {
  const cx = 9, cy = 8, rx = 7.2, ry = 6.4;
  const layers = [
    ellipseCells(cx, cy, rx + 0.7, ry + 0.7, PALETTE.ink2),
    ellipseCells(cx, cy, rx, ry, PALETTE.accent),
    ellipseCells(cx, cy + 1.6, rx - 2.6, ry - 2.6, PALETTE.accentStrong),
  ];
  return { cells: paint(...layers), cols: 18, rows: 15 };
}

function buildFoot() {
  const layers = [
    ellipseCells(3, 2, 3, 2, PALETTE.ink2),
    ellipseCells(3, 2, 2.2, 1.4, PALETTE.accentDark),
  ];
  return { cells: paint(...layers), cols: 6, rows: 4 };
}

function buildArm() {
  const layers = [
    ellipseCells(3, 4, 2.5, 3.8, PALETTE.ink2),
    ellipseCells(3, 4, 1.8, 3.1, PALETTE.accent),
  ];
  return { cells: paint(...layers), cols: 6, rows: 8 };
}

function buildHead(expression) {
  const cx = 9, cy = 9, rx = 8, ry = 7.2;
  const layers = [
    ellipseCells(cx, cy, rx + 0.7, ry + 0.7, PALETTE.ink2),
    ellipseCells(cx, cy, rx, ry, PALETTE.accent),
    ellipseCells(cx, cy + 1.8, rx - 2.4, ry - 3, PALETTE.accentStrong),
    rectCells(cx - 1, 0, 2, 3, PALETTE.accentStrong),
    rectCells(cx - 3, 1, 1, 1, PALETTE.accent),
    rectCells(cx + 2, 1, 1, 1, PALETTE.accent),
  ];

  if (expression === "sleep") {
    layers.push(rectCells(cx - 5, cy - 1, 3, 1, PALETTE.ink2));
    layers.push(rectCells(cx + 2, cy - 1, 3, 1, PALETTE.ink2));
    layers.push(rectCells(cx - 1, cy + 3, 2, 1, PALETTE.ink2));
  } else {
    layers.push(rectCells(cx - 5, cy - 2, 2, 2, PALETTE.ink2));
    layers.push(rectCells(cx + 3, cy - 2, 2, 2, PALETTE.ink2));
    layers.push(rectCells(cx - 5, cy - 2, 1, 1, PALETTE.white));
    layers.push(rectCells(cx + 3, cy - 2, 1, 1, PALETTE.white));

    if (expression === "happy") {
      layers.push(rectCells(cx - 4, cy + 2, 8, 1, PALETTE.ink2));
      layers.push(rectCells(cx - 3, cy + 3, 6, 1, PALETTE.ink2));
      layers.push(rectCells(cx - 7, cy + 1, 2, 1, PALETTE.berry));
      layers.push(rectCells(cx + 5, cy + 1, 2, 1, PALETTE.berry));
    } else if (expression === "sad") {
      layers.push(rectCells(cx - 4, cy - 4, 2, 1, PALETTE.ink2));
      layers.push(rectCells(cx + 2, cy - 4, 2, 1, PALETTE.ink2));
      layers.push(rectCells(cx - 3, cy + 3, 2, 1, PALETTE.ink2));
      layers.push(rectCells(cx - 1, cy + 2, 2, 1, PALETTE.ink2));
      layers.push(rectCells(cx + 1, cy + 3, 2, 1, PALETTE.ink2));
      layers.push(rectCells(cx + 4, cy + 3, 1, 2, PALETTE.sky));
    } else {
      layers.push(rectCells(cx - 2, cy + 3, 4, 1, PALETTE.ink2));
    }
  }
  return { cells: paint(...layers), cols: 18, rows: 17 };
}

const BODY_SPRITE = buildBody();
const FOOT_SPRITE = buildFoot();
const ARM_SPRITE = buildArm();

function Character({ state, expression, facing, dragging, handlers, style }) {
  const faceExpr = state === "sleeping" ? "sleep" : expression;
  const head = useMemo(() => buildHead(faceExpr), [faceExpr]);

  const cls = [
    "pm-char",
    `pm-char--${state}`,
    dragging ? "is-dragging" : "",
    `facing-${facing}`,
  ].join(" ").trim();

  return (
    <div
      className={cls}
      style={style}
      role="button"
      tabIndex={0}
      aria-label="Moku, maskot ruangan — seret untuk memindahkan, ketuk untuk menyapa"
      {...handlers}
    >
      <span className="pm-char-shadow" />
      <PixelSprite {...FOOT_SPRITE} className="pm-foot pm-foot-left" />
      <PixelSprite {...FOOT_SPRITE} className="pm-foot pm-foot-right" />
      <PixelSprite {...ARM_SPRITE} className="pm-arm pm-arm-left" />
      <PixelSprite {...ARM_SPRITE} className="pm-arm pm-arm-right" />
      <PixelSprite {...BODY_SPRITE} className="pm-body" />
      <PixelSprite {...head} className="pm-head" />
      {state === "sleeping" && (
        <div className="pm-zzz" aria-hidden="true">
          <span>Z</span><span>Z</span><span>Z</span>
        </div>
      )}
    </div>
  );
}

function WindEffect() {
  const streaks = [0, 1, 2, 3, 4, 5];
  return (
    <div className="pm-wind" aria-hidden="true">
      {streaks.map((i) => (
        <span
          key={i}
          className="pm-wind-streak"
          style={{ top: `${i * 9}px`, animationDelay: `${i * 0.55}s` }}
        />
      ))}
    </div>
  );
}

function SmokeEffect() {
  const puffs = [0, 1, 2, 3, 4];
  return (
    <div className="pm-smoke" aria-hidden="true">
      {puffs.map((i) => (
        <span
          key={i}
          className={`pm-smoke-puff pm-smoke-puff-${i % 3}`}
          style={{ animationDelay: `${i * 1.1}s` }}
        />
      ))}
      <span className="pm-spark" />
    </div>
  );
}

const FLOOR_BOUNDS = { xMin: 10, xMax: 72, yMin: 26, yMax: 82 };
const BED_SPOT_FALLBACK = { x: 22, y: 44, rx: 13, ry: 13 };
const DESK_SPOT_FALLBACK = { x: 64, y: 44, rx: 12, ry: 13 };

function randomFloorPoint() {
  return {
    x: FLOOR_BOUNDS.xMin + Math.random() * (FLOOR_BOUNDS.xMax - FLOOR_BOUNDS.xMin),
    y: FLOOR_BOUNDS.yMin + Math.random() * (FLOOR_BOUNDS.yMax - FLOOR_BOUNDS.yMin),
  };
}

function withinSpot(pt, spot) {
  return Math.abs(pt.x - spot.x) <= spot.rx && Math.abs(pt.y - spot.y) <= spot.ry;
}

const BUBBLE_LINES = {
  wake: "Ngantuk...",
  sleepStart: "Zzz...",
  computerStart: "Coba benerin server~",
  bored: "Sepi ya di sini...",
  tapHappy: "Hehe, halo!",
  dropIdle: "Taruh sini ya~",
  dropBed: "Waktunya tidur~",
  dropDesk: "Oke, kerja dulu!",
};

function useBackgroundMusic(src) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0.45;
    audio.preload = "auto";
    audioRef.current = audio;

    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setBlocked(true));

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [src]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio
        .play()
        .then(() => {
          setPlaying(true);
          setBlocked(false);
        })
        .catch(() => setBlocked(true));
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, []);

  return { playing, blocked, toggle };
}

export function MaintenancePage({ progress: progressProp } = {}) {
  const sceneRef = useRef(null);
  const floorRef = useRef(null);
  const bedMarkerRef = useRef(null);
  const deskMarkerRef = useRef(null);
  const posRef = useRef({ x: 50, y: 60 });
  const bedSpotRef = useRef(BED_SPOT_FALLBACK);
  const deskSpotRef = useRef(DESK_SPOT_FALLBACK);
  const genRef = useRef(0);
  const cycleTimerRef = useRef(null);
  const arriveTimerRef = useRef(null);
  const bubbleTimerRef = useRef(null);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const [pos, setPos] = useState(posRef.current);
  const [bedSpot, setBedSpot] = useState(BED_SPOT_FALLBACK);
  const [deskSpot, setDeskSpot] = useState(DESK_SPOT_FALLBACK);
  const [moveDuration, setMoveDuration] = useState(1);
  const [charState, setCharState] = useState("idle");
  const [expression, setExpression] = useState("neutral");
  const [facing, setFacing] = useState("right");
  const [isDragging, setIsDragging] = useState(false);
  const [bubble, setBubble] = useState(null);
  const [internalProgress, setInternalProgress] = useState(65);

  const hasControlledProgress = typeof progressProp === "number" && !Number.isNaN(progressProp);
  const progress = Math.round(clampNum(hasControlledProgress ? progressProp : internalProgress, 0, 100));

  const music = useBackgroundMusic(AUDIO_SRC);

  const measureSpots = useCallback(() => {
    const floor = floorRef.current;
    if (!floor) return;
    const floorRect = floor.getBoundingClientRect();
    if (!floorRect.width || !floorRect.height) return;

    const measure = (markerEl, fallback) => {
      if (!markerEl) return fallback;
      const r = markerEl.getBoundingClientRect();
      const cx = r.left + r.width / 2 - floorRect.left;
      const cy = r.top + r.height / 2 - floorRect.top;
      return {
        x: (cx / floorRect.width) * 100,
        y: (cy / floorRect.height) * 100,
        rx: fallback.rx,
        ry: fallback.ry,
      };
    };

    const nextBed = measure(bedMarkerRef.current, BED_SPOT_FALLBACK);
    const nextDesk = measure(deskMarkerRef.current, DESK_SPOT_FALLBACK);
    bedSpotRef.current = nextBed;
    deskSpotRef.current = nextDesk;
    setBedSpot(nextBed);
    setDeskSpot(nextDesk);
  }, []);

  useEffect(() => {
    measureSpots();
    window.addEventListener("resize", measureSpots);
    return () => window.removeEventListener("resize", measureSpots);
  }, [measureSpots]);

  const say = useCallback((text, ms = 2000) => {
    setBubble(text);
    clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => setBubble(null), ms);
  }, []);

  const setPosBoth = useCallback((p) => {
    posRef.current = p;
    setPos(p);
  }, []);

  const walkTo = useCallback((target, myGen, onArrive) => {
    const from = posRef.current;
    setFacing(target.x >= from.x ? "right" : "left");

    const scene = sceneRef.current;
    const rect = scene ? scene.getBoundingClientRect() : { width: 900, height: 600 };
    const dx = ((target.x - from.x) / 100) * rect.width;
    const dy = ((target.y - from.y) / 100) * rect.height;
    const dist = Math.hypot(dx, dy);
    const duration = clampNum(dist / 85, 0.8, 4.4);

    setMoveDuration(duration);
    setCharState("walking");
    setPosBoth(target);

    clearTimeout(arriveTimerRef.current);
    arriveTimerRef.current = setTimeout(() => {
      if (genRef.current !== myGen) return;
      onArrive();
    }, duration * 1000);
  }, [setPosBoth]);

  const runCycle = useCallback(() => {
    const myGen = genRef.current;
    const roll = Math.random();

    if (roll < 0.16) {
      walkTo(bedSpotRef.current, myGen, () => {
        setCharState("sleeping");
        setExpression("neutral");
        say(BUBBLE_LINES.sleepStart, 4200);
        cycleTimerRef.current = setTimeout(() => {
          if (genRef.current !== myGen) return;
          say(BUBBLE_LINES.wake, 1600);
          setCharState("idle");
          cycleTimerRef.current = setTimeout(() => {
            if (genRef.current !== myGen) return;
            runCycle();
          }, 1000);
        }, 7000 + Math.random() * 4000);
      });
    } else if (roll < 0.34) {
      walkTo(deskSpotRef.current, myGen, () => {
        setCharState("computer");
        setExpression("happy");
        say(BUBBLE_LINES.computerStart, 2200);
        cycleTimerRef.current = setTimeout(() => {
          if (genRef.current !== myGen) return;
          setCharState("idle");
          setExpression("neutral");
          runCycle();
        }, 6000 + Math.random() * 5000);
      });
    } else if (roll < 0.78) {
      walkTo(randomFloorPoint(), myGen, () => {
        setCharState("idle");
        cycleTimerRef.current = setTimeout(() => {
          if (genRef.current !== myGen) return;
          runCycle();
        }, 1200 + Math.random() * 1800);
      });
    } else {
      setCharState("idle");
      const gotBored = Math.random() < 0.45;
      if (gotBored) {
        setExpression("sad");
        say(BUBBLE_LINES.bored, 2600);
      }
      cycleTimerRef.current = setTimeout(() => {
        if (genRef.current !== myGen) return;
        if (gotBored) setExpression("neutral");
        runCycle();
      }, 2200 + Math.random() * 2200);
    }
  }, [walkTo, say]);

  useEffect(() => {
    cycleTimerRef.current = setTimeout(() => runCycle(), 900);
    return () => {
      clearTimeout(cycleTimerRef.current);
      clearTimeout(arriveTimerRef.current);
      clearTimeout(bubbleTimerRef.current);
    };
  }, []);

  const onPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    genRef.current += 1;
    clearTimeout(cycleTimerRef.current);
    clearTimeout(arriveTimerRef.current);

    dragMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };

    setIsDragging(true);
    setMoveDuration(0);
    setCharState("idle");
    setExpression("happy");
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!isDragging) return;
    const scene = sceneRef.current;
    if (!scene) return;

    if (!dragMovedRef.current) {
      const moved = Math.hypot(
        e.clientX - dragStartRef.current.x,
        e.clientY - dragStartRef.current.y
      );
      if (moved > 5) dragMovedRef.current = true;
    }

    const rect = scene.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const clamped = {
      x: clampNum(xPct, FLOOR_BOUNDS.xMin - 5, FLOOR_BOUNDS.xMax + 5),
      y: clampNum(yPct, 18, FLOOR_BOUNDS.yMax + 4),
    };
    setPosBoth(clamped);
  }, [isDragging, setPosBoth]);

  const onPointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setIsDragging(false);
    setMoveDuration(0.5);

    const myGen = genRef.current;
    const dropped = posRef.current;

    if (!dragMovedRef.current) {
      setExpression("happy");
      say(BUBBLE_LINES.tapHappy, 1500);
      cycleTimerRef.current = setTimeout(() => {
        if (genRef.current !== myGen) return;
        setExpression("neutral");
        runCycle();
      }, 1500);
      return;
    }

    if (withinSpot(dropped, bedSpotRef.current)) {
      setPosBoth(bedSpotRef.current);
      setCharState("sleeping");
      setExpression("neutral");
      say(BUBBLE_LINES.dropBed, 3000);
      cycleTimerRef.current = setTimeout(() => {
        if (genRef.current !== myGen) return;
        setCharState("idle");
        runCycle();
      }, 6000 + Math.random() * 3000);
    } else if (withinSpot(dropped, deskSpotRef.current)) {
      setPosBoth(deskSpotRef.current);
      setCharState("computer");
      setExpression("happy");
      say(BUBBLE_LINES.dropDesk, 2200);
      cycleTimerRef.current = setTimeout(() => {
        if (genRef.current !== myGen) return;
        setCharState("idle");
        setExpression("neutral");
        runCycle();
      }, 6000 + Math.random() * 3000);
    } else {
      setCharState("idle");
      setExpression("happy");
      say(BUBBLE_LINES.dropIdle, 1600);
      cycleTimerRef.current = setTimeout(() => {
        if (genRef.current !== myGen) return;
        setExpression("neutral");
        runCycle();
      }, 1800);
    }
  }, [say, runCycle, setPosBoth]);

  const charHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setExpression("happy");
        say(BUBBLE_LINES.tapHappy, 1500);
      }
    },
  };

  const isNearBed = isDragging && withinSpot(pos, bedSpot);
  const isNearDesk = isDragging && withinSpot(pos, deskSpot);

  return (
    <div className="pm-root">
      <style>{CSS}</style>

      <div className="pm-scene" ref={sceneRef}>
        <div className="pm-wall">
          <div className="pm-item pm-item-tv" style={{ left: "56%", top: "4%" }}>
            <PixelSprite {...TV_SPRITE} className="pm-sprite" />
            <div className="pm-tv-label">
              <span>SEDANG</span>
              <span>PERBAIKAN</span>
              <span className="pm-tv-cursor" />
            </div>
          </div>

          <div className="pm-item pm-item-ac" style={{ left: "32%", top: "2%" }}>
            <PixelSprite {...AC_SPRITE} className="pm-sprite" />
            <WindEffect />
          </div>
        </div>

        <div className="pm-item pm-item-door" style={{ left: "42%", bottom: "68%" }}>
          <PixelSprite {...DOOR_SPRITE} className="pm-sprite" />
        </div>

        <div className="pm-floor" ref={floorRef}>
          <div className="pm-item pm-item-rug" style={{ left: "30%", top: "46%" }}>
            <PixelSprite {...RUG_SPRITE} className="pm-sprite" />
          </div>

          <div className="pm-item pm-item-sofa" style={{ left: "32%", top: "62%" }}>
            <PixelSprite {...SOFA_SPRITE} className="pm-sprite" />
          </div>

          <div
            className={`pm-item pm-item-bed ${isNearBed ? "is-target" : ""}`}
            style={{ left: "10%", top: "26%" }}
          >
            <PixelSprite {...BED_SPRITE} className="pm-sprite" />
            <span ref={bedMarkerRef} className="pm-spot-marker" style={{ left: "36%", top: "56%" }} />
            {isNearBed && <span className="pm-target-label">lepas untuk tidur</span>}
          </div>

          <div className="pm-item pm-item-pot" style={{ left: "6%", top: "62%" }}>
            <PixelSprite {...POT_SPRITE} className="pm-sprite" />
          </div>

          <div
            className={`pm-item pm-item-desk ${isNearDesk ? "is-target" : ""}`}
            style={{ left: "52%", top: "26%" }}
          >
            <PixelSprite {...DESK_SPRITE} className="pm-sprite" />
            <span ref={deskMarkerRef} className="pm-spot-marker" style={{ left: "50%", top: "88%" }} />
            {isNearDesk && <span className="pm-target-label">lepas untuk main komputer</span>}
          </div>

          <div className="pm-item pm-item-rack" style={{ left: "74%", top: "22%", "--pm-rack-seed": 0 }}>
            <PixelSprite {...RACK_SPRITE} className="pm-sprite" />
            <SmokeEffect />
          </div>
          <div className="pm-item pm-item-rack" style={{ left: "74%", top: "36%", "--pm-rack-seed": 1 }}>
            <PixelSprite {...RACK_SPRITE} className="pm-sprite" />
          </div>
          <div className="pm-item pm-item-rack" style={{ left: "74%", top: "50%", "--pm-rack-seed": 2 }}>
            <PixelSprite {...RACK_SPRITE} className="pm-sprite" />
            <SmokeEffect />
          </div>
          <div className="pm-item pm-item-rack" style={{ left: "74%", top: "64%", "--pm-rack-seed": 3 }}>
            <PixelSprite {...RACK_SPRITE} className="pm-sprite" />
          </div>

          <Character
            state={charState}
            expression={expression}
            facing={facing}
            dragging={isDragging}
            handlers={charHandlers}
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transitionDuration: `${moveDuration}s`,
              zIndex: isDragging ? 999 : 50,
            }}
          />

          {bubble && (
            <div
              className={`pm-bubble is-${expression}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {bubble}
            </div>
          )}
        </div>

        <div className="pm-topbar">
          <button
            type="button"
            className={`pm-music-btn ${music.playing ? "is-playing" : ""}`}
            onClick={music.toggle}
            aria-pressed={music.playing}
            aria-label={music.playing ? "Matikan musik" : "Putar musik"}
          >
            <span className="pm-music-icon" />
            {music.playing ? "Musik on" : music.blocked ? "Ketuk untuk musik" : "Musik"}
          </button>
        </div>

        <div className="pm-progress-panel">
          <span className="pm-status-dot" />
          <div className="pm-progress-info">
            <span className="pm-progress-label">Sedang dalam pemeliharaan</span>
            <div className="pm-progress-track">
              <span className="pm-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="pm-progress-pct">{progress}% selesai</span>
          </div>
        </div>
      </div>

      <span className="sr-only" aria-live="polite">
        {charState === "sleeping" && "Moku sedang tidur"}
        {charState === "computer" && "Moku sedang bermain komputer"}
        {expression === "sad" && charState === "idle" && "Moku terlihat sedih"}
        {expression === "happy" && "Moku terlihat senang"}
      </span>
    </div>
  );
}

const CSS = `
.pm-root{
  width:100vw; height:100dvh;
  background: var(--pm-bg, #000000);
  color: var(--pm-ink, #F2F2F2);
  font-family: var(--pm-font, "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif);
  margin:0; padding:0;
  overflow:hidden;
}
.sr-only{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }

.pm-topbar{
  position:absolute; left:0; right:0; top:0; z-index:30;
  display:flex; align-items:center; gap:12px; flex-wrap:wrap;
  padding: 18px 22px; pointer-events:none;
}
.pm-topbar > *{ pointer-events:auto; }
.pm-status-dot{ flex-shrink:0; width:7px; height:7px; border-radius:50%; background: var(--pm-gold,#C9C9C9); animation: pm-pulse 1.8s ease-out infinite; margin-top:3px; }
.pm-music-btn{
  display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600;
  color: var(--pm-ink-dim,#A3A3A3); background:rgba(20,20,20,.85); border:1px solid var(--pm-line,#262626);
  padding:7px 14px; border-radius:999px; cursor:pointer; transition: color .15s ease, background .15s ease;
  backdrop-filter:blur(6px); margin-left:auto;
}
.pm-music-btn:hover{ color: var(--pm-ink,#F2F2F2); background:#1F1F1F; }
.pm-music-icon{ width:8px; height:8px; border-radius:50%; background: var(--pm-accent-strong,#D6D6D6); }
.pm-music-btn.is-playing .pm-music-icon{ animation: pm-pulse 1.4s ease-out infinite; }

.pm-progress-panel{
  position:absolute; left:20px; bottom:20px; z-index:30;
  display:flex; align-items:flex-start; gap:10px;
  background:rgba(21,21,21,.8); backdrop-filter:blur(8px);
  border:1px solid var(--pm-line,#262626); border-radius:16px;
  padding:12px 16px; max-width:250px;
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
}
.pm-progress-info{ display:flex; flex-direction:column; gap:5px; min-width:0; }
.pm-progress-label{ font-size:12.5px; font-weight:700; color: var(--pm-ink,#F2F2F2); white-space:nowrap; }
.pm-progress-track{
  width:150px; height:6px; border-radius:999px; overflow:hidden;
  background: var(--pm-line,#262626);
}
.pm-progress-fill{
  display:block; height:100%; border-radius:999px;
  background: linear-gradient(90deg, var(--pm-accent,#9A9A9A), var(--pm-accent-strong,#D6D6D6));
  width:0%; transition: width 1.1s cubic-bezier(.22,.61,.36,1);
}
.pm-progress-pct{ font-size:11px; font-weight:600; color: var(--pm-ink-dim,#A3A3A3); font-family: var(--pm-font-mono,"JetBrains Mono",monospace); }

.pm-scene{
  position:relative; width:100vw; height:100dvh;
  touch-action:none; user-select:none; image-rendering:pixelated;
  overflow:hidden;
}
.pm-wall{
  position:absolute; inset:0 0 68% 0;
  background: linear-gradient(180deg, #2A2A2A 0%, #3C3C3C 62%, #4B4B4B 100%);
}
.pm-wall::before{ content:""; position:absolute; inset:0; background-image: repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 2px, transparent 2px 42px); }
.pm-wall::after{
  content:""; position:absolute; left:0; right:0; bottom:0; height:16px;
  background: linear-gradient(180deg, #8A6A3C 0%, #5E4527 100%);
  border-top:2px solid var(--pm-outline,#141414);
  box-shadow: 0 4px 10px rgba(0,0,0,.4);
}
.pm-floor{ position:absolute; inset:32% 0 0 0; background: repeating-linear-gradient(0deg, #1B1B1B 0 34px, #161616 34px 68px); border-top:3px solid var(--pm-line,#262626); }
.pm-floor::after{ content:""; position:absolute; inset:0; background-image: repeating-linear-gradient(90deg, rgba(0,0,0,.14) 0 1px, transparent 1px 68px); }

.pm-item{ position:absolute; pointer-events:none; filter: drop-shadow(0 6px 8px rgba(0,0,0,.35)); }
.pm-item .pm-sprite{ display:block; width: var(--w,120px); height:auto; }
.pm-spot-marker{ position:absolute; width:1px; height:1px; }
.pm-item-ac{ --w:140px; }
.pm-item-tv{ --w:150px; z-index:3; }
.pm-item-rack{ --w:78px; z-index:4; }
.pm-item-desk{ --w:190px; z-index:6; }
.pm-item-bed{ --w:210px; z-index:2; }
.pm-item-sofa{ --w:210px; z-index:5; }
.pm-item-pot{ --w:64px; z-index:3; }
.pm-item-rug{ --w:280px; z-index:1; filter:none; }
.pm-item-door{ --w:82px; z-index:2; filter:none; }

.pm-item.is-target .pm-sprite{ filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
.pm-item.is-target::before{
  content:""; position:absolute; inset:-10px; border-radius:14px;
  border:2px dashed var(--pm-gold,#C9C9C9); animation: pm-target-pulse 1s ease-in-out infinite;
}
.pm-target-label{
  position:absolute; left:50%; top:-26px; transform:translateX(-50%);
  font-size:10.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
  color: var(--pm-gold,#C9C9C9); background:#141414; border:1px solid var(--pm-line,#262626);
  padding:3px 9px; border-radius:999px; white-space:nowrap;
}

.pm-tv-label{
  position:absolute; left:16%; top:22%; width:60%;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  font-family: var(--pm-font-mono,"JetBrains Mono",monospace);
  font-size:7.5px; font-weight:700; letter-spacing:.05em; color:#F2F2F2;
  text-shadow: 0 0 6px rgba(255,255,255,.55);
  animation: pm-glitch 3.6s steps(1) infinite;
}
.pm-tv-cursor{ width:5px; height:5px; background:#F2F2F2; margin-top:2px; animation: pm-blink 1s steps(1) infinite; }

.pm-wind{ position:absolute; left:100%; top:6%; width:220px; height:60px; pointer-events:none; }
.pm-wind-streak{
  position:absolute; left:0; width:42px; height:2px; border-radius:2px;
  background: linear-gradient(90deg, rgba(236,232,217,0), rgba(236,232,217,.6) 45%, rgba(236,232,217,0));
  opacity:0; animation: pm-wind-move 3.4s linear infinite;
}
@keyframes pm-wind-move{
  0%{ transform: translate(0,0); opacity:0; }
  12%{ opacity:.85; }
  85%{ opacity:.3; }
  100%{ transform: translate(210px,50px); opacity:0; }
}

.pm-smoke{ position:absolute; left:38%; top:-6%; width:40px; height:120px; pointer-events:none; }
.pm-smoke-puff{
  position:absolute; left:0; bottom:0; width:7px; height:7px; border-radius:2px;
  background: rgba(185,185,185,.55); opacity:0;
  animation: pm-smoke-rise 4.6s ease-in infinite;
}
.pm-smoke-puff-1{ left:5px; }
.pm-smoke-puff-2{ left:-4px; }
@keyframes pm-smoke-rise{
  0%{ transform: translate(0,0) scale(.6); opacity:0; }
  15%{ opacity:.6; }
  100%{ transform: translate(14px,-92px) scale(1.6); opacity:0; }
}
.pm-spark{
  position:absolute; left:6px; top:2px; width:4px; height:4px; background:#F2C879;
  box-shadow:0 0 6px 2px rgba(242,200,121,.85); opacity:0;
  animation: pm-spark-flicker 5s ease-in-out infinite;
}
@keyframes pm-spark-flicker{
  0%,90%,100%{ opacity:0; } 91%{ opacity:1; } 92.5%{ opacity:0; } 94%{ opacity:1; } 95.5%{ opacity:0; }
}

.pm-led-flicker{ animation: pm-led-flicker 3.8s steps(1) infinite; }
@keyframes pm-led-flicker{
  0%, 55%{ fill:#E6E6E6; }
  60%{ fill:#F4F1E4; }
  64%{ fill:#E0645A; }
  68%{ fill:#F4F1E4; }
  72%, 100%{ fill:#E6E6E6; }
}

.pm-char{
  position:absolute; width:78px; height:96px; transform: translate(-50%,-88%);
  transition-property: left, top; transition-timing-function: linear;
  cursor:grab; touch-action:none;
}
.pm-char:active{ cursor:grabbing; }
.pm-char.is-dragging{ transition-duration:0s !important; }
.pm-char.facing-left{ transform: translate(-50%,-88%) scaleX(-1); }

.pm-char-shadow{
  position:absolute; left:50%; bottom:2px; width:56%; height:12px; transform:translateX(-50%);
  background: radial-gradient(ellipse at center, rgba(0,0,0,.4), transparent 72%);
}
.pm-body{ position:absolute; left:50%; top:34%; width:78%; transform:translate(-50%,-50%); }
.pm-head{ position:absolute; left:50%; top:8%; width:74%; transform:translate(-50%,0); }
.pm-foot{ position:absolute; bottom:8px; width:22px; }
.pm-foot-left{ left:20px; }
.pm-foot-right{ left:38px; }
.pm-arm{ position:absolute; top:40%; width:20px; }
.pm-arm-left{ left:2px; transform-origin:top center; }
.pm-arm-right{ right:2px; transform-origin:top center; }

.pm-char--walking .pm-foot-left{ animation: pm-foot-bob .46s steps(2) infinite; }
.pm-char--walking .pm-foot-right{ animation: pm-foot-bob .46s steps(2) infinite; animation-delay:.23s; }
.pm-char--walking .pm-body{ animation: pm-body-bob .46s ease-in-out infinite; }
@keyframes pm-foot-bob{ 0%,100%{ transform: translateY(0); } 50%{ transform: translateY(-3px); } }
@keyframes pm-body-bob{ 0%,100%{ transform: translate(-50%,-50%); } 50%{ transform: translate(-50%,-53%); } }

.pm-char--computer .pm-arm-right{ animation: pm-type .3s steps(2) infinite; }
@keyframes pm-type{ 0%,100%{ transform: rotate(0deg); } 50%{ transform: rotate(-12deg); } }

.pm-char.is-dragging .pm-arm-left{ transform: rotate(-24deg) translateY(-4px); }
.pm-char.is-dragging .pm-arm-right{ transform: rotate(24deg) translateY(-4px); }
.pm-char.is-dragging{ filter: drop-shadow(0 14px 16px rgba(0,0,0,.4)); }

.pm-char--sleeping{ transform: translate(-50%,-50%) rotate(-90deg); }
.pm-char--sleeping.facing-left{ transform: translate(-50%,-50%) rotate(-90deg) scaleX(-1); }
.pm-char--sleeping .pm-arm, .pm-char--sleeping .pm-foot{ opacity:.85; }

.pm-zzz{
  position:absolute; top:-14px; right:-6px; display:flex; gap:1px;
  font-family: var(--pm-font-mono,"JetBrains Mono",monospace); font-weight:700; font-size:10px;
  color: var(--pm-accent-strong,#D6D6D6); transform: rotate(-90deg);
}
.pm-zzz span{ display:inline-block; animation: pm-zzz-float 2.4s ease-in infinite; opacity:0; }
.pm-zzz span:nth-child(2){ animation-delay:.5s; }
.pm-zzz span:nth-child(3){ animation-delay:1s; }
@keyframes pm-zzz-float{
  0%{ opacity:0; transform: translateY(0) scale(.7); }
  20%{ opacity:1; }
  100%{ opacity:0; transform: translateY(-16px) scale(1.15); }
}

.pm-bubble{
  position:absolute; transform: translate(-50%, -168%);
  background:#141414; border:1px solid var(--pm-line,#262626); color: var(--pm-ink,#F2F2F2);
  font-size:11.5px; font-weight:600; white-space:nowrap; padding:5px 11px; border-radius:999px;
  box-shadow: 0 6px 18px rgba(0,0,0,.32); pointer-events:none; animation: pm-bubble-in .16s ease;
  z-index: 1000;
}
.pm-bubble::after{
  content:""; position:absolute; left:50%; bottom:-5px; transform: translateX(-50%) rotate(45deg);
  width:8px; height:8px; background:#141414; border-right:1px solid var(--pm-line,#262626); border-bottom:1px solid var(--pm-line,#262626);
}
.pm-bubble.is-sad{ color:#B9D3EA; }
.pm-bubble.is-happy{ color: var(--pm-accent-strong,#D6D6D6); }

@keyframes pm-pulse{
  0%{ box-shadow: 0 0 0 0 rgba(211,182,115,.55); } 70%{ box-shadow: 0 0 0 8px rgba(211,182,115,0); } 100%{ box-shadow:0 0 0 0 rgba(211,182,115,0); }
}
@keyframes pm-target-pulse{ 0%,100%{ opacity:.5; } 50%{ opacity:1; } }
@keyframes pm-glitch{ 0%,92%,100%{ opacity:1; } 93%{ opacity:.4; } 94%{ opacity:1; } }
@keyframes pm-blink{ 0%,49%{ opacity:1; } 50%,100%{ opacity:0; } }
@keyframes pm-bubble-in{ from{ opacity:0; transform: translate(-50%,-150%) scale(.9); } to{ opacity:1; transform: translate(-50%,-168%) scale(1); } }

@media (max-width:720px){
  .pm-item-bed{ --w:150px; } .pm-item-desk{ --w:140px; } .pm-item-sofa{ --w:150px; } .pm-item-rug{ --w:200px; }
  .pm-item-rack{ --w:52px; } .pm-item-door{ --w:54px; }
  .pm-char{ width:62px; height:78px; }
  .pm-topbar{ padding:12px 14px; }
  .pm-progress-panel{ left:12px; bottom:12px; padding:10px 12px; max-width:190px; }
  .pm-progress-track{ width:110px; }
}

@media (prefers-reduced-motion: reduce){
  .pm-status-dot, .pm-music-btn.is-playing .pm-music-icon, .pm-wind-streak, .pm-smoke-puff, .pm-spark,
  .pm-char--walking .pm-foot-left, .pm-char--walking .pm-foot-right, .pm-char--walking .pm-body,
  .pm-char--computer .pm-arm-right, .pm-zzz span, .pm-tv-cursor, .pm-tv-label, .pm-target-pulse, .pm-led-flicker{
    animation: none !important;
  }
}
`;