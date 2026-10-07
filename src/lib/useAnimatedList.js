import { useLayoutEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.dataset.reducedMotion === "true");

export function useAnimatedList(items, { exitMs = 150, moveMs = 260, enterMs = 220, stagger = 22 } = {}) {
  const containerRef = useRef(null);
  const posRef = useRef(new Map());
  const exitTimers = useRef(new Map());

  const toEntries = (list) => list.map((item) => ({ key: String(item.id), item, leaving: false, rect: null }));
  const [rendered, setRendered] = useState(() => toEntries(items));
  const [prevItems, setPrevItems] = useState(items);

  if (items !== prevItems) {
    setPrevItems(items);
    const nextKeys = new Set(items.map((i) => String(i.id)));
    const next = toEntries(items);
    for (const old of rendered) {
      if (nextKeys.has(old.key)) continue;
      next.push({
        ...old,
        leaving: true,
        rect: old.rect || posRef.current.get(old.key) || null,
      });
    }
    setRendered(next);
  }

  useLayoutEffect(() => {
    for (const e of rendered) {
      if (e.leaving && !exitTimers.current.has(e.key)) {
        const t = setTimeout(() => {
          exitTimers.current.delete(e.key);
          setRendered((cur) => cur.filter((x) => !(x.key === e.key && x.leaving)));
        }, exitMs);
        exitTimers.current.set(e.key, t);
      }
      if (!e.leaving && exitTimers.current.has(e.key)) {
        clearTimeout(exitTimers.current.get(e.key));
        exitTimers.current.delete(e.key);
      }
    }
  }, [rendered, exitMs]);

  useLayoutEffect(() => () => {
    for (const t of exitTimers.current.values()) clearTimeout(t);
    exitTimers.current.clear();
  }, []);

  useLayoutEffect(() => {
    const box = containerRef.current;
    if (!box) { posRef.current = new Map(); return; }
    const reduce = prefersReducedMotion();
    const prev = posRef.current;
    const next = new Map();
    let enterIdx = 0;

    for (const el of box.children) {
      const key = el.dataset.key;
      if (!key || el.dataset.leaving === "true") continue;
      const now = { top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight };
      next.set(key, now);
      if (reduce || typeof el.animate !== "function") continue;

      const before = prev.get(key);
      if (!before) {
        el.animate(
          [
            { opacity: 0, transform: "translateY(-8px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: enterMs, delay: Math.min(enterIdx++, 7) * stagger, easing: "cubic-bezier(.22,.61,.36,1)", fill: "backwards" }
        );
        continue;
      }

      let curY = 0;
      if (el.__flip) {
        try { curY = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 || 0; } catch { }
        el.__flip.cancel();
        el.__flip = null;
      }
      const dy = before.top + curY - now.top;
      if (Math.abs(dy) > 0.5) {
        el.__flip = el.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
          { duration: moveMs, easing: "cubic-bezier(.22,.61,.36,1)" }
        );
        el.__flip.onfinish = () => { el.__flip = null; };
      }
    }
    posRef.current = next;
  });

  return { containerRef, rendered };
}