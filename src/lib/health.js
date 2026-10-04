import { useEffect, useRef, useState } from "react";
import { API_BASE } from "./api.js";


const CHECK_INTERVAL_UP_MS = 20_000;
const CHECK_INTERVAL_DOWN_MS = 5_000;
const FETCH_TIMEOUT_MS = 6_000;
const FAILURES_BEFORE_DOWN = 2;

function pingBackendAlive() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(`${API_BASE}/__ping__`, { signal: controller.signal, cache: "no-store" })
    .then(() => true)
    .catch(() => false)
    .finally(() => clearTimeout(timeout));
}

export function useBackendHealth({ enabled = true } = {}) {
  const [down, setDown] = useState(false);
  const [retryInSeconds, setRetryInSeconds] = useState(null);
  const failuresRef = useRef(0);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const checkRef = useRef(() => {});

  useEffect(() => {
    if (!enabled) { setDown(false); setRetryInSeconds(null); return undefined; }
    let alive = true;

    const startCountdown = (seconds) => {
      clearInterval(countdownRef.current);
      setRetryInSeconds(seconds);
      countdownRef.current = setInterval(() => {
        setRetryInSeconds((s) => (s === null ? null : Math.max(0, s - 1)));
      }, 1000);
    };

    async function check() {
      clearTimeout(timerRef.current);

      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        timerRef.current = setTimeout(check, CHECK_INTERVAL_UP_MS);
        return;
      }

      const ok = await pingBackendAlive();
      if (!alive) return;

      if (ok) {
        failuresRef.current = 0;
        setDown(false);
        setRetryInSeconds(null);
        clearInterval(countdownRef.current);
        timerRef.current = setTimeout(check, CHECK_INTERVAL_UP_MS);
        return;
      }

      failuresRef.current += 1;
      if (failuresRef.current >= FAILURES_BEFORE_DOWN) {
        setDown(true);
        startCountdown(Math.round(CHECK_INTERVAL_DOWN_MS / 1000));
      }
      timerRef.current = setTimeout(check, CHECK_INTERVAL_DOWN_MS);
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    checkRef.current = check;
    check();
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
      clearInterval(countdownRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled]);

  const retryNow = () => checkRef.current();

  return { down, retryInSeconds, retryNow };
}