import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Search, Mic, Users, ListMusic } from "lucide-react";
import { StarLoader, CosmicLogoMark, useIsHalloween } from "../lib/brand.jsx";
import { useUI } from "../context.jsx";
import { useRouter } from "../router.jsx";

const LOGIN_ERRORS = {
  discord_denied: "Proses masuk melalui Discord dibatalkan. Silakan coba lagi kapan saja.",
  google_denied: "Proses masuk melalui Google dibatalkan. Silakan coba lagi kapan saja.",
  no_code: "Proses masuk terhenti di tengah jalan. Coba klik tombolnya sekali lagi.",
  user_not_found: "Akun kamu tidak ditemukan setelah proses masuk. Coba ulangi beberapa saat lagi.",
  login_failed: "Terjadi gangguan saat menghubungkan akunmu. Silakan coba lagi sebentar lagi.",
};

const SHOWCASE = [
  { icon: Search, title: "Cari cepat", desc: "Temukan lagu, artis, dan album dalam hitungan detik." },
  { icon: Mic, title: "Lirik sinkron", desc: "Lirik jalan baris demi baris, ikut lagu yang diputar." },
  { icon: Users, title: "Dengerin bareng", desc: "Buat ruang, ajak teman, dan putar lagu yang sama secara real-time." },
  { icon: ListMusic, title: "Koleksi pribadi", desc: "Simpan playlist dan lagu favorit, atau impor dari YouTube." },
];

const EQ_BARS = Array.from({ length: 72 }, (_, i) => ({
  i,
  h: +(0.22 + 0.78 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.55))).toFixed(2),
}));

function GoogleGlyph({ size = 18 }) {
  return (
    <svg className="cx-btn-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21.35 11.1H12.18v2.83h6.51c-.33 2.99-2.98 5.15-6.51 5.15-3.87 0-7.02-3.15-7.02-7.08s3.15-7.08 7.02-7.08c1.99 0 3.68.72 4.98 1.9l2.14-2.14C17.83 2.99 15.27 2 12.18 2 6.85 2 2.52 6.33 2.52 11.66c0 5.33 4.33 9.66 9.66 9.66 5.58 0 9.28-3.92 9.28-9.44 0-.63-.07-1.11-.11-1.58Z"/>
    </svg>
  );
}

function DiscordGlyph({ size = 18 }) {
  return (
    <svg className="cx-btn-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.32 4.49a19.8 19.8 0 0 0-4.89-1.49.08.08 0 0 0-.08.04c-.21.37-.44.86-.61 1.25a18.3 18.3 0 0 0-5.49 0c-.17-.4-.4-.88-.62-1.25a.08.08 0 0 0-.08-.04c-1.7.29-3.33.8-4.89 1.49a.07.07 0 0 0-.03.03C.53 9.09-.32 13.56.1 17.96a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.64-1.87.89a.08.08 0 0 0-.04.11c.37.69.78 1.35 1.23 1.99a.08.08 0 0 0 .09.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.6-3.55-13.44a.06.06 0 0 0-.03-.03ZM8.02 15.28c-1.18 0-2.16-1.07-2.16-2.38s.96-2.38 2.16-2.38c1.21 0 2.18 1.08 2.16 2.38 0 1.31-.95 2.38-2.16 2.38Zm7.97 0c-1.18 0-2.16-1.07-2.16-2.38s.96-2.38 2.16-2.38c1.21 0 2.18 1.08 2.16 2.38 0 1.31-.95 2.38-2.16 2.38Z"/>
    </svg>
  );
}
function CosmicMark() {
  const barsRef = useRef(null);
  const starGroupRef = useRef(null);
  const starPathRef = useRef(null);
  const gooBlurRef = useRef(null);
  const letterRefs = useRef([]);
  const word = "cosmicx";

  useEffect(() => {
    const NS = "http://www.w3.org/2000/svg";
    const barsGroup = barsRef.current;
    const starGroup = starGroupRef.current;
    const starPath = starPathRef.current;
    const gooBlur = gooBlurRef.current;
    const letters = letterRefs.current.filter(Boolean);
    if (!barsGroup || !starGroup || !starPath || !gooBlur) return;

    const LETTER_STAGGER = 0.09;
    const LETTER_SPAN = 1 - (letters.length - 1) * LETTER_STAGGER;

    function sparkleD(cx, cy, R, pinch, samples) {
      let d = "";
      for (let i = 0; i <= samples; i++) {
        const theta = (i / samples) * Math.PI * 2;
        const c = Math.cos(theta), s = Math.sin(theta);
        const x = cx + R * Math.sign(c) * Math.pow(Math.abs(c), pinch);
        const y = cy + R * Math.sign(s) * Math.pow(Math.abs(s), pinch);
        d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2) + " ";
      }
      return d + "Z";
    }
    starPath.setAttribute("d", sparkleD(50, 50, 37, 5, 240));
    while (barsGroup.firstChild) barsGroup.removeChild(barsGroup.firstChild);

    const barDefs = [
      { x: 27, base: 24, amp: 11, speed: 1.7, phase: 0.0 },
      { x: 40, base: 40, amp: 14, speed: 2.3, phase: 1.1 },
      { x: 53, base: 30, amp: 12, speed: 1.9, phase: 2.4 },
      { x: 66, base: 36, amp: 13, speed: 2.6, phase: 0.6 },
    ];
    const barWidth = 7;
    const barRects = barDefs.map((b) => {
      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", b.x);
      rect.setAttribute("width", barWidth);
      rect.setAttribute("height", b.base);
      rect.setAttribute("y", 50 - b.base / 2);
      rect.setAttribute("rx", barWidth / 2);
      barsGroup.appendChild(rect);
      return rect;
    });

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function smoothstep(x) {
      x = Math.min(1, Math.max(0, x));
      return x * x * (3 - 2 * x);
    }

    function apply(blend, gooAmount) {
      barsGroup.style.opacity = 1 - blend;
      starGroup.style.opacity = blend;
      barsGroup.style.transform = `scale(${1 - 0.12 * blend}) rotate(${-10 * blend}deg)`;
      starGroup.style.transform = `scale(${0.88 + 0.12 * blend}) rotate(${10 * (1 - blend)}deg)`;
      gooBlur.setAttribute("stdDeviation", gooAmount.toFixed(2));

      letters.forEach((letter, i) => {
        const delay = i * LETTER_STAGGER;
        const local = smoothstep((blend - delay) / LETTER_SPAN);
        letter.style.opacity = local;
        letter.style.transform = `translateY(${(1 - local) * 14}px) scale(${0.7 + 0.3 * local})`;
        letter.style.filter = `blur(${(1 - local) * 5}px)`;
      });
    }

    function animateBars(t) {
      barDefs.forEach((b, i) => {
        const h = b.base + b.amp * Math.sin((t / 1000) * b.speed + b.phase);
        barRects[i].setAttribute("height", h);
        barRects[i].setAttribute("y", 50 - h / 2);
      });
    }

    let raf;
    if (reduced) {
      apply(1, 0);
      return () => { while (barsGroup.firstChild) barsGroup.removeChild(barsGroup.firstChild); };
    }

    const HOLD_EQ = 2200, MORPH = 1300, HOLD_STAR = 2200;
    const PERIOD = HOLD_EQ + MORPH + HOLD_STAR + MORPH;

    function frame(now) {
      animateBars(now);
      const t = now % PERIOD;
      let blend, goo;
      if (t < HOLD_EQ) {
        blend = 0; goo = 0;
      } else if (t < HOLD_EQ + MORPH) {
        const local = (t - HOLD_EQ) / MORPH;
        blend = smoothstep(local);
        goo = Math.max(0, 6 * (1 - Math.abs(local - 0.5) * 2));
      } else if (t < HOLD_EQ + MORPH + HOLD_STAR) {
        blend = 1; goo = 0;
      } else {
        const local = (t - (HOLD_EQ + MORPH + HOLD_STAR)) / MORPH;
        blend = 1 - smoothstep(local);
        goo = Math.max(0, 6 * (1 - Math.abs(local - 0.5) * 2));
      }
      apply(blend, goo);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      while (barsGroup.firstChild) barsGroup.removeChild(barsGroup.firstChild);
    };
  }, []);

  return (
    <div className="cx-mark">
      <svg className="cx-glyph" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <filter id="cxGoo" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0" result="blur" ref={gooBlurRef} />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
          </filter>
        </defs>
        <g filter="url(#cxGoo)">
          <g ref={barsRef}></g>
          <g ref={starGroupRef}><path ref={starPathRef} d=""></path></g>
        </g>
      </svg>
      <div className="cx-wordmark">
        {word.split("").map((ch, i) => (
          <span key={i} ref={(el) => (letterRefs.current[i] = el)} className="cx-letter">{ch}</span>
        ))}
      </div>
    </div>
  );
}

// ---- Login NORMAL: ivory + champagne (mengikuti desain cosmicx music) ----
const WAVES = Array.from({ length: 9 }, (_, i) =>
  `M-80 ${300 + i * 6} C260 ${150 + i * 9}, 520 ${620 - i * 7}, 900 ${470 + i * 5} S1380 ${360 + i * 6}, 1700 ${540 + i * 4}`);

function SoftLogin({ errorCode, pending, authChecked, onGoogle, onDiscord }) {
  return (
    <div className="lx-stage">
      <svg className="lx-waves" viewBox="0 0 1600 800" preserveAspectRatio="none" aria-hidden="true">
        {WAVES.map((d, i) => <path key={i} d={d} />)}
      </svg>
      <main className="lx-grid">
        <section className="lx-brand">
          <div className="lx-lockup">
            <CosmicLogoMark size={88} gradient className="lx-mark" />
            <h1 className="lx-name">cosmicx music</h1>
          </div>
          <p className="lx-tag">A clean space for music, made to feel cosmic.</p>
          <p className="lx-url"><i aria-hidden="true" />music.cosmicx.fun</p>
        </section>

        <section className="lx-card" aria-labelledby="lx-welcome">
          <div className="lx-halo" aria-hidden="true" />
          <h2 id="lx-welcome">Selamat datang</h2>
          <p className="lx-lead">Masuk untuk lanjut mendengarkan.</p>
          {errorCode && (
            <div className="lx-error" role="alert">
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{LOGIN_ERRORS[errorCode] || LOGIN_ERRORS.login_failed}</span>
            </div>
          )}
          {!authChecked ? (
            <div className="lx-loading"><StarLoader size={30} color="#1c1814" /></div>
          ) : (
            <div className="lx-actions">
              <button className="lx-btn lx-btn-primary" type="button" onClick={onGoogle} disabled={!!pending}>
                {pending === "google" ? <StarLoader size={18} color="#fcfaf6" /> : <GoogleGlyph size={18} />}
                Lanjutkan dengan Google
              </button>
              <button className="lx-btn lx-btn-outline" type="button" onClick={onDiscord} disabled={!!pending}>
                {pending === "discord" ? <StarLoader size={18} color="#1c1814" /> : <DiscordGlyph size={18} />}
                Lanjutkan dengan Discord
              </button>
            </div>
          )}
          <p className="lx-foot">Dengan melanjutkan, kamu menyetujui Ketentuan &amp; Privasi.</p>
        </section>
      </main>
    </div>
  );
}

export function LoginPage() {
  const { authUser, authChecked, login, loginGoogle } = useUI();
  const { navigate } = useRouter();
  const [errorCode, setErrorCode] = useState(null);
  const [pending, setPending] = useState(null);
  const halloween = useIsHalloween();

  useEffect(() => {
    if (authChecked && authUser) navigate("home", { replace: true });
  }, [authChecked, authUser, navigate]);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) {
      setErrorCode(code);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleGoogle = () => { setPending("google"); loginGoogle(); };
  const handleDiscord = () => { setPending("discord"); login(); };

  // Event (Halloween) tetap pakai tampilan & logo event; hari biasa pakai desain ivory baru.
  if (!halloween) {
    return <SoftLogin errorCode={errorCode} pending={pending} authChecked={authChecked} onGoogle={handleGoogle} onDiscord={handleDiscord} />;
  }

  return (
    <div className="cx-stage">
      <div className="cx-backdrop" aria-hidden="true">
        <div className="cx-eq">
          {EQ_BARS.map((b) => <i key={b.i} style={{ "--i": b.i, "--h": b.h }} />)}
        </div>
      </div>

      <div className="cx-frame">
        <div className="cx-hero">
          <CosmicMark />

          <div className="cx-pitch">
            <h1 className="cx-headline">Semua musikmu, satu tempat.</h1>
            <p className="cx-sub">Cari, putar, dan dengarkan bareng teman, lengkap dengan lirik yang jalan sendiri.</p>
            <ul className="cx-features">
              {SHOWCASE.map(({ icon: Icon, title, desc }) => (
                <li key={title}>
                  <span className="cx-feat-ic"><Icon size={18} strokeWidth={1.75} /></span>
                  <span className="cx-feat-txt"><b>{title}</b><span>{desc}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="cx-bottom-group">
          <div className="cx-card-head">
            <h2>Selamat datang</h2>
            <p>Masuk untuk lanjut mendengarkan.</p>
          </div>

          {errorCode && (
            <div className="cx-error" role="alert">
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{LOGIN_ERRORS[errorCode] || LOGIN_ERRORS.login_failed}</span>
            </div>
          )}

          {!authChecked ? (
            <div style={{ padding: "18px 0" }}><StarLoader size={30} color="var(--cx-ink)" /></div>
          ) : (
            <div className="cx-actions">
              <button className="cx-btn cx-btn-primary" type="button" onClick={handleGoogle} disabled={!!pending}>
                {pending === "google" ? <StarLoader size={18} color="#0a0a0a" /> : <GoogleGlyph size={18} />}
                Lanjutkan dengan Google
              </button>
              <button className="cx-btn cx-btn-outline" type="button" onClick={handleDiscord} disabled={!!pending}>
                {pending === "discord" ? <StarLoader size={18} color="var(--cx-ink)" /> : <DiscordGlyph size={18} />}
                Lanjutkan dengan Discord
              </button>
            </div>
          )}

          <p className="cx-foot">Dengan melanjutkan, kamu menyetujui Ketentuan &amp; Privasi.</p>
        </div>
      </div>
    </div>
  );
}

export const LandingPage = LoginPage;