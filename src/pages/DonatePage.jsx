import React, { useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, Heart, Music, Server } from "lucide-react";
import { CosmicLogoMark } from "../lib/brand.jsx";
import { useUI } from "../context.jsx";
import { Link } from "../router.jsx";
import { DONATE_URL, DONATION_METHODS } from "../lib/donation.js";

const WAVES = Array.from({ length: 9 }, (_, i) =>
  `M-80 ${560 + i * 6} C260 ${420 + i * 9}, 560 ${860 - i * 7}, 940 ${700 + i * 5} S1400 ${600 + i * 6}, 1700 ${740 + i * 4}`);

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      resolve();
    } catch (e) { reject(e); }
  });
}

export function DonatePage() {
  const { settings, authUser } = useUI();
  const en = settings.language === "en";
  const tt = (idText, enText) => (en ? enText : idText);
  const [notice, setNotice] = useState(false);
  const [copied, setCopied] = useState(null);
  const backTo = authUser ? "home" : "landing";

  const benefits = [
    { key: "quality", icon: <Music size={24} strokeWidth={1.5} />, title: tt("Kualitas musik lebih baik", "Better music quality"), desc: tt("Audio lebih jernih dan pemutaran yang lebih stabil.", "Clearer audio and steadier playback.") },
    { key: "servers", icon: <Server size={24} strokeWidth={1.5} />, title: tt("Dukung server kami", "Support our servers"), desc: tt("Membantu biaya server dan bandwidth agar streaming tetap lancar.", "Helps cover server and bandwidth costs so streaming stays smooth.") },
    { key: "features", icon: <CosmicLogoMark size={24} color="currentColor" />, title: tt("Fitur & pembaruan baru", "More features & updates"), desc: tt("Ruang untuk membuat fitur baru dan memperbaiki yang sudah ada.", "Room to build new features and polish the existing ones.") },
    { key: "growing", icon: <Heart size={24} strokeWidth={1.5} />, title: tt("Cosmicx terus berkembang", "Keep Cosmicx growing"), desc: tt("Membantu cosmicx music tetap hidup dan terus bertumbuh.", "Helps cosmicx music stay alive and keep growing.") },
  ];

  const onCopy = async (m) => {
    try { await copyText(m.account); setCopied(m.id); setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 1800); } catch {}
  };

  const ctaInner = (<><Heart size={22} strokeWidth={1.75} aria-hidden="true" /><span>{tt("Donasi sekarang", "Donate Now")}</span></>);

  return (
    <div className="dn-page">
      <svg className="dn-waves" viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true">
        {WAVES.map((d, i) => <path key={i} d={d} />)}
      </svg>

      <div className="dn-wrap">
        <header className="dn-top">
          <Link to={backTo} className="dn-brand">
            <CosmicLogoMark size={36} gradient />
            <span>cosmicx music</span>
          </Link>
          <Link to={backTo} className="dn-back"><ArrowLeft size={16} aria-hidden="true" />{tt("Kembali", "Back")}</Link>
        </header>

        <main>
          <section className="dn-hero">
            <div className="dn-copy">
              <p className="dn-kicker">{tt("Dukung kami lewat", "Support us with")}</p>
              <h1 className="dn-title">
                {tt("Donasi", "Donations")}
                <svg className="dn-spark" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 4 C54 34 66 46 96 50 C66 54 54 66 50 96 C46 66 34 54 4 50 C34 46 46 34 50 4Z" /></svg>
              </h1>
              <p className="dn-lead">
                {tt("Dukunganmu membantu kami menjaga musik tetap hidup.", "Your support helps us keep the music alive.")}
                <br />
                {tt("Terima kasih sudah jadi bagian dari perjalanan kami!", "Thank you for being part of our journey!")}
              </p>
            </div>
            <div className="dn-art" aria-hidden="true">
              <img src="/brand/donation-art.webp" width="803" height="620" alt="" decoding="async" />
            </div>
          </section>

          <ul className="dn-benefits">
            {benefits.map((b) => (
              <li key={b.key}>
                <span className="dn-ic">{b.icon}</span>
                <span className="dn-bt"><b>{b.title}</b><span>{b.desc}</span></span>
              </li>
            ))}
          </ul>

          <div className="dn-action">
            {DONATE_URL ? (
              <a className="dn-cta" href={DONATE_URL} target="_blank" rel="noopener noreferrer">{ctaInner}</a>
            ) : (
              <button type="button" className="dn-cta" onClick={() => setNotice(true)}>{ctaInner}</button>
            )}
            <p className="dn-small"><i aria-hidden="true" />{tt("Dukungan kecil, dampak besar.", "Small support, big impact.")}</p>
          </div>
          {notice && !DONATE_URL && (
            <p className="dn-notice" role="status">
              {tt("Link donasi belum tersedia. Coba lagi sebentar lagi.", "The donation link isn't available yet. Please try again soon.")}
            </p>
          )}

          {DONATION_METHODS.length > 0 && (
            <section className="dn-methods" aria-labelledby="dn-methods-title">
              <h2 id="dn-methods-title">{tt("Cara berdonasi", "Ways to give")}</h2>
              <ul>
                {DONATION_METHODS.map((m) => (
                  <li key={m.id} className="dn-method">
                    <div className="dn-method-txt">
                      <b>{m.name}</b>
                      {m.note && <span>{m.note}</span>}
                      {m.account && <code>{m.account}</code>}
                      {m.holder && <span>{tt("a.n. ", "Name: ")}{m.holder}</span>}
                    </div>
                    {m.href ? (
                      <a className="dn-mbtn" href={m.href} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={15} aria-hidden="true" />{tt("Buka", "Open")}
                      </a>
                    ) : m.account ? (
                      <button type="button" className="dn-mbtn" onClick={() => onCopy(m)}>
                        {copied === m.id ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                        {copied === m.id ? tt("Tersalin", "Copied") : tt("Salin", "Copy")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>

        <footer className="dn-foot">
          <p>{tt("Terima kasih. Setiap dukungan, sekecil apa pun, sangat berarti.", "Thank you. Every bit of support means a lot.")}</p>
          <p className="dn-url"><i aria-hidden="true" />music.cosmicx.fun</p>
        </footer>
      </div>
    </div>
  );
}
