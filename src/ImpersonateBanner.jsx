// Banner penanda mode "masuk sebagai user" (impersonate dari panel admin).
// Token datang lewat URL, dipakai sebagai Bearer, dan dibersihkan dari address
// bar oleh lib/impersonate.js saat aplikasi dimuat.
import React, { useState } from "react";
import { impersonateUser, exitImpersonate } from "./lib/impersonate.js";

export function ImpersonateBanner() {
  const [who] = useState(() => impersonateUser());
  if (!who) return null;
  const name = who === "1" ? "user" : who;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 10,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20000,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        maxWidth: "calc(100vw - 24px)",
        padding: "7px 12px",
        fontSize: 13,
        fontFamily: "inherit",
        color: "#fde68a",
        background: "rgba(120, 53, 15, 0.95)",
        border: "1px solid rgba(253, 230, 138, 0.35)",
        borderRadius: 999,
        boxShadow: "0 4px 18px rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(6px)",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        Mode impersonate — kamu melihat CosmicX sebagai <strong>{name}</strong>.
      </span>
      <button
        type="button"
        onClick={exitImpersonate}
        style={{
          padding: "3px 10px",
          fontSize: 12,
          fontWeight: 600,
          color: "#78350f",
          background: "#fde68a",
          border: "none",
          borderRadius: 999,
          cursor: "pointer",
        }}
      >
        Keluar
      </button>
    </div>
  );
}
