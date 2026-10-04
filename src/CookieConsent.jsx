import React, { useEffect, useMemo, useRef, useState } from "react";
import { Cookie, X } from "lucide-react";
import { useUI } from "./context.jsx";
import {
  useCookieConsent, saveConsent, acceptAll, rejectAll, COOKIE_OPEN_EVENT,
} from "./lib/cookieConsent.js";

function useTT() {
  const { settings } = useUI();
  return useMemo(() => {
    const en = settings.language === "en";
    return (idText, enText) => (en ? enText : idText);
  }, [settings.language]);
}

function CookieSwitch({ on, locked, onChange, label }) {
  const toggle = () => { if (!locked) onChange(!on); };
  return (
    <span
      className={`aivy-switch ${on ? "on" : ""} ${locked ? "is-locked" : ""}`}
      role="switch" aria-checked={on} aria-disabled={locked || undefined} aria-label={label}
      tabIndex={locked ? -1 : 0}
      onClick={toggle}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } }}
    >
      <span className="knob" />
    </span>
  );
}

function CookiePrefsModal({ tt, initial, onClose }) {
  const dialogRef = useRef(null);
  const [prefs, setPrefs] = useState({
    preferences: initial?.preferences ?? false,
    analytics: initial?.analytics ?? false,
  });

  // Fokus masuk ke dialog, Esc menutup, Tab terkunci di dalam dialog.
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = dialogRef.current.querySelectorAll('button:not([disabled]), [role="switch"]:not([aria-disabled="true"])');
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); previous?.focus?.(); };
  }, [onClose]);

  const rows = [
    {
      key: "necessary", locked: true,
      title: tt("Esensial", "Essential"),
      desc: tt(
        "Dibutuhkan supaya login, keamanan, dan penyimpanan pengaturan dasar berjalan. Selalu aktif.",
        "Required for login, security, and saving basic settings. Always on."
      ),
    },
    {
      key: "preferences",
      title: tt("Preferensi", "Preferences"),
      desc: tt(
        "Mengingat pilihanmu seperti lagu terakhir diputar, riwayat pencarian, dan tampilan supaya tidak mulai dari nol.",
        "Remembers your choices like the last played track, recent searches, and appearance so you don't start over."
      ),
    },
    {
      key: "analytics",
      title: tt("Analitik", "Analytics"),
      desc: tt(
        "Statistik penggunaan anonim untuk membantu kami memperbaiki aplikasi.",
        "Anonymous usage statistics that help us improve the app."
      ),
    },
  ];

  const finish = (fn) => { fn(); onClose(); };

  return (
    <div className="aivy-ck-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="aivy-ck-modal" role="dialog" aria-modal="true" aria-labelledby="aivy-ck-title" tabIndex={-1} ref={dialogRef}>
        <div className="aivy-ck-head">
          <div>
            <h2 id="aivy-ck-title">{tt("Pilih cookie", "Choose cookies")}</h2>
            <p>{tt("Atur cookie mana yang boleh kami pakai. Kamu bisa mengubahnya kapan saja di Setting.", "Choose which cookies we may use. You can change this anytime in Settings.")}</p>
          </div>
          <button type="button" className="aivy-ck-close" onClick={onClose} aria-label={tt("Tutup", "Close")}><X size={18} /></button>
        </div>

        <div className="aivy-ck-body">
          {rows.map((r) => (
            <div className="aivy-ck-row" key={r.key}>
              <div>
                <div className="label">
                  {r.title}
                  {r.locked && <span className="aivy-ck-badge">{tt("Selalu aktif", "Always on")}</span>}
                </div>
                <div className="hint">{r.desc}</div>
              </div>
              <CookieSwitch
                label={r.title}
                locked={!!r.locked}
                on={r.locked ? true : prefs[r.key]}
                onChange={(v) => setPrefs((p) => ({ ...p, [r.key]: v }))}
              />
            </div>
          ))}
        </div>

        <div className="aivy-ck-foot">
          <button type="button" className="aivy-btn-ghost" onClick={() => finish(rejectAll)}>{tt("Tolak semua", "Reject all")}</button>
          <button type="button" className="aivy-btn-ghost" onClick={() => finish(() => saveConsent(prefs))}>{tt("Simpan pilihan", "Save choices")}</button>
          <button type="button" className="aivy-btn-primary" onClick={() => finish(acceptAll)}>{tt("Terima semua", "Accept all")}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Banner cookie di bawah halaman + modal "Pilih cookie".
 * Pasang sekali di dalam <UIProvider>. `policyHref` opsional: kalau diisi,
 * muncul link "Kebijakan Privasi" di banner.
 */
export function CookieConsent({ policyHref = null }) {
  const tt = useTT();
  const consent = useCookieConsent();
  const [ready, setReady] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  // Beri jeda singkat supaya banner tidak rebutan dengan loading awal.
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(id);
  }, []);

  // Panel bisa dibuka dari luar (tombol di Setting) lewat openCookieSettings().
  useEffect(() => {
    const open = () => setPrefsOpen(true);
    window.addEventListener(COOKIE_OPEN_EVENT, open);
    return () => window.removeEventListener(COOKIE_OPEN_EVENT, open);
  }, []);

  const showBanner = ready && !consent && !prefsOpen;

  return (
    <>
      {showBanner && (
        <div className="aivy-ck-banner" role="region" aria-label={tt("Persetujuan cookie", "Cookie consent")}>
          <div className="aivy-ck-icon" aria-hidden="true"><Cookie size={22} /></div>
          <div className="aivy-ck-text">
            <div className="aivy-ck-title">{tt("Kami pakai cookie", "We use cookies")}</div>
            <p>
              {tt(
                "Cookie esensial bikin aplikasi berjalan. Dengan persetujuanmu, kami juga pakai cookie preferensi dan analitik untuk pengalaman yang lebih baik.",
                "Essential cookies keep the app running. With your consent, we also use preference and analytics cookies for a better experience."
              )}
              {policyHref && (<> <a href={policyHref}>{tt("Kebijakan Privasi", "Privacy Policy")}</a></>)}
            </p>
          </div>
          <div className="aivy-ck-actions">
            <button type="button" className="aivy-btn-ghost aivy-ck-btn aivy-ck-pick" onClick={() => setPrefsOpen(true)}>{tt("Pilih cookie", "Choose cookies")}</button>
            <button type="button" className="aivy-btn-ghost aivy-ck-btn" onClick={rejectAll}>{tt("Tolak", "Reject")}</button>
            <button type="button" className="aivy-btn-primary aivy-ck-btn" onClick={acceptAll}>{tt("Terima semua", "Accept all")}</button>
          </div>
        </div>
      )}
      {prefsOpen && <CookiePrefsModal tt={tt} initial={consent} onClose={() => setPrefsOpen(false)} />}
    </>
  );
}
