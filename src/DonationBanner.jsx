import React from "react";
import { Heart } from "lucide-react";
import { Link } from "./router.jsx";
import { useUI } from "./context.jsx";

// Banner donasi (gambar) dengan tombol "Donate Now" transparan tepat di atas tombol
// yang tergambar di banner. Posisi overlay dihitung dari gambar asli 1983x793 px,
// jadi tetap pas di ukuran layar berapa pun. Di layar kecil, tombol tergambar terlalu
// mungil untuk disentuh, jadi diganti tombol asli di bawah banner.
export function DonationBanner({ className = "" }) {
  const { settings } = useUI();
  const en = settings.language === "en";
  const label = en ? "Donate Now" : "Donasi sekarang";

  return (
    <section
      className={`dnb ${className}`.trim()}
      aria-label={en ? "Support cosmicx music with a donation" : "Dukung cosmicx music lewat donasi"}
    >
      <div className="dnb-frame">
        <img
          className="dnb-img"
          src="/brand/donation-banner.png"
          width="1600"
          height="640"
          alt={en
            ? "Support us with donations. Your support helps us keep the music alive."
            : "Dukung kami lewat donasi. Dukunganmu membantu kami menjaga musik tetap hidup."}
          loading="lazy"
          decoding="async"
        />
        <Link to="donate" className="dnb-hit" aria-label={label}>
          <span className="dnb-hit-ring" aria-hidden="true" />
        </Link>
      </div>
      <Link to="donate" className="dnb-cta">
        <Heart size={16} strokeWidth={2} aria-hidden="true" />
        {label}
      </Link>
    </section>
  );
}
