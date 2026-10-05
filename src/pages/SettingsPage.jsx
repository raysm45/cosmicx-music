import React, { useMemo, useRef, useState } from "react";
import {
  Palette, LayoutPanelLeft, Speaker, Cog,
  LogOut, RotateCcw, SlidersHorizontal, Check, FileUp, FileDown, Cookie,
} from "lucide-react";
import { useUI, usePlayer, EQ_BANDS_HZ, EQ_PRESETS } from "../context.jsx";
import { Api } from "../lib/api.js";
import { CustomSelect } from "../components.jsx";
import { useCookieConsent, openCookieSettings } from "../lib/cookieConsent.js";
import {
  checkFontUrl, useLocalFont, setFontFile, setInstalledFont, clearLocalFont, isFontInstalled,
  FONT_FILE_ACCEPT, FONT_URL_PLACEHOLDER, FREE_FONT_SOURCES, MAX_FONT_FILE_BYTES,
} from "../lib/fonts.js";

const THEME_SWATCHES = {
  system: ["#000000", "#ffffff", "#f2f2f0"],
  black: ["#000000", "#ffffff", "#f2f2f0"],
  white: ["#ffffff", "#141414", "#141414"],
  ocean: ["#0b1220", "#dfe9f5", "#dfe9f5"],
  purple: ["#13101e", "#eae4f6", "#eae4f6"],
  mocha: ["#1e1e2e", "#cdd6f4", "#cdd6f4"],
  macchiato: ["#24273a", "#cad3f5", "#cad3f5"],
  frappe: ["#303446", "#c6d0f5", "#c6d0f5"],
  latte: ["#eff1f5", "#4c4f69", "#4c4f69"],
  salmon: ["#fdebe7", "#e8736a", "#4a2b2b"],
};

const FONT_OPTIONS = [
  { value: "default", label: "Plus Jakarta (Default)" },
  { value: "inter", label: "Inter" },
  { value: "applemusic", label: "Apple Music" },
  { value: "plexmono", label: "IBM Plex Mono" },
  { value: "roboto", label: "Roboto" },
  { value: "opensans", label: "Open Sans" },
  { value: "lato", label: "Lato" },
  { value: "montserrat", label: "Montserrat" },
  { value: "poppins", label: "Poppins" },
  { value: "systemui", label: "System UI" },
  { value: "mono", label: "Monospace" },
];

const VISUALIZER_STYLES = [
  { value: "lcd", label: "LCD" },
  { value: "pixels", label: "Pixels" },
  { value: "particles", label: "Particles" },
  { value: "unknown", label: "Unknown Pleasures" },
  { value: "butterchurn", label: "Butterchurn (Milkdrop)" },
  { value: "kawarp", label: "Kawarp" },
];

const VISUALIZER_PRESETS = [
  { value: "auto", label: "Otomatis" },
  { value: "ocean", label: "Ocean Surface" },
  { value: "martian", label: "Martian" },
  { value: "sunset", label: "Sunset" },
  { value: "kaleido", label: "Kaleidoscope" },
];

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 400);
}

function SettingSection({ title, children, desc }) {
  return (
    <section className="aivy-settings-section">
      <h2 className="aivy-settings-title">{title}</h2>
      {desc && <p className="aivy-settings-desc">{desc}</p>}
      <div className="aivy-settings-group">{children}</div>
    </section>
  );
}

function ToggleRow({ label, hint, checked, onChange }) {
  const { settings } = useUI();
  return (
    <div className="aivy-settings-row">
      <div><div className="label">{label}</div>{hint && <div className="hint">{hint}</div>}</div>
      <span className={`aivy-switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)} role="switch" aria-checked={checked} tabIndex={0}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); } }}>
        <span className="knob" />
      </span>
    </div>
  );
}

function SelectRow({ label, hint, value, options, onChange }) {
  const { settings } = useUI();
  return (
    <div className="aivy-settings-row">
      <div><div className="label">{label}</div>{hint && <div className="hint">{hint}</div>}</div>
      <CustomSelect className="aivy-settings-select" value={value} options={options} onChange={onChange} aria-label={settings.language === "en" ? label : undefined} />
    </div>
  );
}

function SliderRow({ label, hint, value, min, max, step, onChange, format }) {
  return (
    <div className="aivy-settings-row">
      <div><div className="label">{label}</div>{hint && <div className="hint">{hint}</div>}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="aivy-range" />
        <span className="font-mono" style={{ fontSize: 12, width: 52, textAlign: "right", color: "var(--ink-faint)" }}>{format ? format(value) : value}</span>
      </div>
    </div>
  );
}

function TextRow({ label, hint, value, onChange, type = "text", placeholder, mono }) {
  return (
    <div className="aivy-settings-row">
      <div><div className="label">{label}</div>{hint && <div className="hint">{hint}</div>}</div>
      <input
        className={`aivy-settings-input ${mono ? "mono" : ""}`}
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function FontUrlRow({ value, onCommit, tt }) {
  const [draft, setDraft] = useState(value || "");
  const [error, setError] = useState("");
  React.useEffect(() => { setDraft(value || ""); setError(""); }, [value]);

  const reasons = {
    invalid: tt("URL tidak valid.", "Invalid URL."),
    insecure: tt("Gunakan URL https://.", "Use an https:// URL."),
    paid: tt(
      "Situs font berbayar (mis. MyFonts, Fonts.com, Adobe Fonts) tidak didukung. Pakai sumber gratis.",
      "Paid font sites (e.g. MyFonts, Fonts.com, Adobe Fonts) aren't supported. Use a free source."
    ),
  };
  const commit = () => {
    const v = draft.trim();
    if (v === (value || "")) return;
    if (!v) { setError(""); onCommit(""); return; }
    const res = checkFontUrl(v);
    if (!res.ok) { setError(reasons[res.reason] || reasons.invalid); return; }
    setError("");
    onCommit(v);
  };

  return (
    <div className="aivy-settings-row">
      <div>
        <div className="label">{tt("Font dari URL (gratis)", "Font from URL (free)")}</div>
        <div className="hint">
          {tt(
            `Tempel link CSS atau file font (.woff2/.woff/.ttf/.otf) dari sumber gratis: ${FREE_FONT_SOURCES}. Font berbayar tidak didukung.`,
            `Paste a CSS link or font file (.woff2/.woff/.ttf/.otf) from a free source: ${FREE_FONT_SOURCES}. Paid fonts aren't supported.`
          )}
        </div>
        {error && <div className="hint" style={{ color: "var(--danger, #e5484d)" }}>{error}</div>}
      </div>
      <input
        className="aivy-settings-input mono"
        type="url"
        value={draft}
        placeholder={FONT_URL_PLACEHOLDER}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => { setDraft(e.target.value); if (error) setError(""); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
    </div>
  );
}

function LocalFontRows({ localFont, onActivate, tt, pushToast }) {
  const fileRef = useRef(null);
  const [draft, setDraft] = useState(localFont?.kind === "installed" ? localFont.name : "");
  const [warn, setWarn] = useState(false);
  React.useEffect(() => {
    setDraft(localFont?.kind === "installed" ? localFont.name : "");
    setWarn(false);
  }, [localFont]);

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const name = await setFontFile(file);
      onActivate();
      pushToast(tt(`Font "${name}" dipakai`, `Font "${name}" applied`));
    } catch (err) {
      const msgs = {
        type: tt("Format harus .woff2, .woff, .ttf, atau .otf.", "File must be .woff2, .woff, .ttf or .otf."),
        size: tt(`Ukuran file maksimal ${Math.round(MAX_FONT_FILE_BYTES / 1048576)} MB.`, `Max file size is ${Math.round(MAX_FONT_FILE_BYTES / 1048576)} MB.`),
        storage: tt("Gagal menyimpan font di perangkat.", "Couldn't store the font on this device."),
      };
      pushToast(msgs[err?.message] || tt("File font tidak valid.", "Invalid font file."));
    }
  };

  const commitInstalled = () => {
    const v = draft.trim();
    if (!v) { if (localFont?.kind === "installed") clearLocalFont(); setWarn(false); return; }
    if (localFont?.kind === "installed" && localFont.name === v) return;
    const name = setInstalledFont(v);
    if (name) { onActivate(); setWarn(!isFontInstalled(name)); }
  };

  return (
    <>
      <div className="aivy-settings-row">
        <div>
          <div className="label">{tt("Font dari file lokal", "Font from local file")}</div>
          <div className="hint">
            {localFont?.kind === "file"
              ? tt(`Dipakai: ${localFont.name}. Disimpan di perangkat ini saja.`, `In use: ${localFont.name}. Stored on this device only.`)
              : tt("Pilih file .woff2/.woff/.ttf/.otf dari perangkat kamu. Disimpan di perangkat ini saja.", "Pick a .woff2/.woff/.ttf/.otf file from your device. Stored on this device only.")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <input ref={fileRef} type="file" accept={FONT_FILE_ACCEPT} onChange={onPickFile} hidden />
          <button className="aivy-btn-ghost sm" onClick={() => fileRef.current?.click()}>
            <FileUp size={14} />{tt("Pilih file", "Choose file")}
          </button>
          {localFont?.kind === "file" && (
            <button className="aivy-btn-danger sm" onClick={clearLocalFont}>{tt("Hapus", "Remove")}</button>
          )}
        </div>
      </div>
      <div className="aivy-settings-row">
        <div>
          <div className="label">{tt("Font terpasang di perangkat", "Font installed on device")}</div>
          <div className="hint">
            {tt("Ketik nama font yang sudah terpasang di sistem (mis. Segoe UI, Helvetica Neue, Menlo).", "Type the name of a font already installed on your system (e.g. Segoe UI, Helvetica Neue, Menlo).")}
          </div>
          {warn && (
            <div className="hint" style={{ color: "var(--danger, #e5484d)" }}>
              {tt("Font ini sepertinya tidak terpasang di perangkat ini, jadi tampilan memakai font cadangan.", "This font doesn't seem to be installed on this device, so a fallback font is shown.")}
            </div>
          )}
        </div>
        <input
          className="aivy-settings-input"
          type="text"
          value={draft}
          placeholder="Segoe UI"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitInstalled}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        />
      </div>
    </>
  );
}

function ActionRow({ label, hint, tone = "ghost", buttonText, onAction, disabled, icon: Icon }) {
  const cls = tone === "danger" ? "aivy-btn-danger" : "aivy-btn-ghost";
  return (
    <div className="aivy-settings-row">
      <div><div className="label">{label}</div>{hint && <div className="hint">{hint}</div>}</div>
      <button className={`${cls} sm`} disabled={disabled} onClick={onAction}>{Icon ? <Icon size={14} /> : null}{buttonText}</button>
    </div>
  );
}

function matchPreset(bands) {
  const entries = Object.entries(EQ_PRESETS);
  for (const [key, vals] of entries) {
    if (vals.every((v, i) => v === (bands?.[i] ?? 0))) return key;
  }
  return "custom";
}

function EqualizerPanel({ eq, onChange, tt }) {
  const bands = eq.bands || EQ_PRESETS.flat;
  const setBand = (i, v) => {
    const next = [...bands];
    next[i] = v;
    onChange({ ...eq, bands: next, preset: matchPreset(next) });
  };
  const setPreset = (key) => {
    if (key === "custom") { onChange({ ...eq, preset: "custom" }); return; }
    onChange({ ...eq, preset: key, bands: [...(EQ_PRESETS[key] || EQ_PRESETS.flat)] });
  };
  const presetOptions = [
    { value: "flat", label: "Flat" },
    { value: "bass", label: "Bass Boost" },
    { value: "treble", label: "Treble Boost" },
    { value: "vocal", label: tt("Vokal", "Vocal") },
    { value: "electronic", label: tt("Elektronik", "Electronic") },
    { value: "custom", label: "Custom" },
  ];
  const freqLabel = (hz) => (hz >= 1000 ? `${hz / 1000}k` : `${hz}`);

  return (
    <>
      <ToggleRow label={tt("Aktifkan equalizer", "Enable equalizer")} hint={tt("Sesuaikan karakter suara pemutaran", "Fine-tune playback sound")} checked={eq.enabled} onChange={(v) => onChange({ ...eq, enabled: v })} />
      <SelectRow label="Preset" value={eq.preset || matchPreset(bands)} onChange={setPreset} options={presetOptions} />
      <SliderRow label="Preamp" value={eq.preamp || 0} min={-12} max={12} step={1}
        onChange={(v) => onChange({ ...eq, preamp: v })} format={(v) => `${v > 0 ? "+" : ""}${v}dB`} />
      <div className="aivy-settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10, opacity: eq.enabled ? 1 : 0.45 }}>
        <div className="label">{tt("Band frekuensi", "Frequency bands")}</div>
        <div className="aivy-eq-bands">
          {EQ_BANDS_HZ.map((hz, i) => (
            <div className="aivy-eq-band" key={hz}>
              <span className="aivy-eq-val font-mono">{(bands[i] ?? 0) > 0 ? "+" : ""}{bands[i] ?? 0}</span>
              <input
                type="range" className="aivy-eq-slider" min={-12} max={12} step={1}
                value={bands[i] ?? 0} disabled={!eq.enabled}
                onChange={(e) => setBand(i, Number(e.target.value))}
                aria-label={`${freqLabel(hz)}Hz`}
                orient="vertical"
              />
              <span className="aivy-eq-freq font-mono">{freqLabel(hz)}</span>
            </div>
          ))}
        </div>
      </div>
      <ActionRow label={tt("Reset equalizer", "Reset equalizer")} buttonText={tt("Reset", "Reset")} icon={RotateCcw}
        onAction={() => onChange({ enabled: eq.enabled, preset: "flat", preamp: 0, bands: [...EQ_PRESETS.flat] })} />
    </>
  );
}

export function SettingsPage() {
  const { settings, updateSettings, resetSettings, authUser, logout, loggingOut, pushToast, t } = useUI();
  const localFont = useLocalFont();
  const player = usePlayer();
  const cookieConsent = useCookieConsent();
  const [tab, setTab] = useState("appearance");
  const fileInputRef = useRef(null);
  const importModeRef = useRef("backup");

  const tt = useMemo(() => {
    const en = settings.language === "en";
    return (idText, enText) => (en ? enText : idText);
  }, [settings.language]);

  const set = (key) => (val) => updateSettings({ [key]: val });

  const tabs = [
    { id: "appearance", label: tt("Tampilan", "Appearance"), icon: Palette },
    { id: "interface", label: tt("Antarmuka", "Interface"), icon: LayoutPanelLeft },
    { id: "audio", label: "Audio", icon: Speaker },
    { id: "system", label: tt("Sistem", "System"), icon: Cog },
  ];

  if (!authUser) {
    return <div className="aivy-empty" style={{ paddingTop: 80 }}><div className="title">{t("loginForSettings")}</div></div>;
  }

  const eq = settings.equalizer || { enabled: false, preset: "flat", preamp: 0, bands: [...EQ_PRESETS.flat] };

  const openImport = (mode) => {
    importModeRef.current = mode;
    fileInputRef.current?.click();
  };

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (importModeRef.current === "settings") {
        if (!json || typeof json !== "object") throw new Error("bad");
        updateSettings(json);
        pushToast(tt("Setting diimpor", "Settings imported"));
      } else {
        const patch = {};
        if (json.settings && typeof json.settings === "object") Object.assign(patch, json.settings);
        if (json.theme) patch.theme = json.theme;
        updateSettings(patch);
        pushToast(tt("Backup dipulihkan (setting diterapkan)", "Backup restored (settings applied)"));
      }
    } catch {
      pushToast(tt("File backup tidak valid", "Invalid backup file"));
    }
  };

  const exportBackup = () => {
    downloadJson(`aivy-backup-${new Date().toISOString().slice(0, 10)}.json`, {
      app: "aivy",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      playlists: player?.playlists || [],
      liked: player?.liked || [],
      history: Array.isArray(player?.history) ? player.history.slice(0, 200) : [],
    });
    pushToast(tt("Backup diekspor", "Backup exported"));
  };
  const exportAllSettings = () => {
    downloadJson(`aivy-settings-${new Date().toISOString().slice(0, 10)}.json`, settings);
    pushToast(tt("Semua setting diekspor", "All settings exported"));
  };

  const clearCache = () => {
    let n = 0;
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("aivy_cache")) keys.push(k);
      }
      keys.forEach((k) => { localStorage.removeItem(k); n++; });
    } catch {}
    pushToast(n ? tt(`Cache dibersihkan (${n})`, `Cache cleared (${n})`) : tt("Cache sudah bersih", "Cache already clean"));
  };

  const resetLocalData = () => {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("aivy_")) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {}
    pushToast(tt("Data lokal dihapus, memuat ulang…", "Local data cleared, reloading…"));
    setTimeout(() => window.location.reload(), 900);
  };

  const clearCloudData = async () => {
    try { await Api.resetSettings(); pushToast(tt("Data awan dibersihkan", "Cloud data cleared")); }
    catch { pushToast(tt("Gagal membersihkan data awan", "Failed to clear cloud data")); }
  };

  const applyCommunityTheme = (css) => {
    updateSettings({ theme: "custom", customThemeCss: css });
  };
  const unapplyCommunityTheme = () => {
    updateSettings({ theme: "black", customThemeCss: "" });
  };

  const communityThemes = [
    {
      id: "nord", name: "Nordic",
      css: ":root{--bg:#2E3440;--bg-elev:#3B4252;--bg-elev-2:#434C5E;--bg-elev-3:#4C566A;--line:#4C566A;--line-soft:#3B4252;--ink:#ECEFF4;--ink-dim:#D8DEE9;--ink-faint:#7B88A1;--accent:#88C0D0;--accent-strong:#8FBCBB;--accent-ink:#2E3440;}",
    },
    {
      id: "rosepine", name: "Rosé Pine",
      css: ":root{--bg:#191724;--bg-elev:#1F1D2E;--bg-elev-2:#26233A;--bg-elev-3:#302C46;--line:#403D52;--line-soft:#26233A;--ink:#E0DEF4;--ink-dim:#908CAA;--ink-faint:#6E6A86;--accent:#C4A7E7;--accent-strong:#DFCCF3;--accent-ink:#191724;}",
    },
    {
      id: "gruvbox", name: "Gruvbox",
      css: ":root{--bg:#282828;--bg-elev:#32302F;--bg-elev-2:#3C3836;--bg-elev-3:#504945;--line:#504945;--line-soft:#3C3836;--ink:#FBF1C7;--ink-dim:#BDAE93;--ink-faint:#7C6F64;--accent:#D8A657;--accent-strong:#E3B76E;--accent-ink:#282828;}",
    },
  ];

  const renderAppearance = () => (
    <>
      <SettingSection title={tt("Bahasa", "Language")}>
        <SelectRow
          label={tt("Bahasa Aplikasi", "App Language")}
          hint={tt("Mengubah semua teks di aplikasi", "Changes all text throughout the app")}
          value={settings.language || "id"}
          onChange={set("language")}
          options={[
            { value: "id", label: "Bahasa Indonesia" },
            { value: "en", label: "English" },
          ]}
        />
      </SettingSection>

      <SettingSection title={tt("Tema", "Theme")}>
        <div className="aivy-themes-grid">
          {[
            ["system", tt("Sistem", "System")],
            ["black", "Black"],
            ["white", "White"],
            ["ocean", "Ocean"],
            ["purple", "Purple"],
            ["mocha", "Mocha"],
            ["macchiato", "Macchiato"],
            ["frappe", "Frappé"],
            ["latte", "Latte"],
            ["salmon", "Salmon"],
            ["custom", tt("Kustom", "Custom")],
          ].map(([value, label]) => (
            <button key={value} className={`aivy-theme-card ${settings.theme === value ? "active" : ""}`} onClick={() => set("theme")(value)}>
              <span className="aivy-theme-swatch">
                {(THEME_SWATCHES[value] || ["var(--bg)", "var(--accent)", "var(--ink)"]).map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              <span className="aivy-theme-card-name">
                {label}
                {settings.theme === value && <Check size={14} className="aivy-theme-check" />}
              </span>
            </button>
          ))}
        </div>
        {settings.theme === "custom" && (
          <div className="aivy-settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <div>
              <div className="label">{tt("Tema Kustom (CSS)", "Custom Theme (CSS)")}</div>
              <div className="hint">{tt("Definisikan variabel CSS atau gaya kustom di sini.", "Define your CSS variables or custom styles here.")}</div>
            </div>
            <textarea
              className="aivy-settings-textarea"
              value={settings.customThemeCss || ""}
              placeholder={':root {\n  --bg: #101010;\n  --accent: #e6e6e6;\n}'}
              onChange={(e) => set("customThemeCss")(e.target.value)}
              spellCheck={false}
            />
          </div>
        )}
      </SettingSection>

      <SettingSection title={tt("Tema Komunitas", "Community Themes")} desc={tt("Terapkan tema buatan komunitas yang sudah tersedia.", "Apply built-in community-made themes.")}>
        <div className="aivy-settings-row">
          <div><div className="label">{tt("Terpasang", "Applied")}</div><div className="hint">{settings.customThemeCss ? tt("Tema komunitas aktif lewat tema Kustom", "Active via the Custom theme") : tt("Belum ada tema komunitas yang diterapkan", "No community theme applied")}</div></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {communityThemes.map((th) => (
              <button key={th.id} className="aivy-btn-ghost sm" onClick={() => applyCommunityTheme(th.css)}>{th.name}</button>
            ))}
            {settings.customThemeCss && (
              <button className="aivy-btn-danger sm" onClick={unapplyCommunityTheme}>{tt("Lepas Tema", "Unapply Theme")}</button>
            )}
          </div>
        </div>
      </SettingSection>

      <SettingSection title={tt("Font", "Font")}>
        <SelectRow
          label={tt("Jenis font", "Font")}
          value={settings.fontFamily || "default"}
          onChange={set("fontFamily")}
          options={FONT_OPTIONS}
        />
        <FontUrlRow
          value={settings.fontUrl || ""}
          tt={tt}
          onCommit={(v) => { if (v) clearLocalFont(); set("fontUrl")(v); }}
        />
        <LocalFontRows
          localFont={localFont}
          tt={tt}
          pushToast={pushToast}
          onActivate={() => { if (settings.fontUrl) set("fontUrl")(""); }}
        />
        <SliderRow
          label={tt("Ukuran font", "Font size")}
          value={Number(settings.fontScale) || 100}
          min={50} max={200} step={5}
          onChange={set("fontScale")}
          format={(v) => `${v}%`}
        />
        <ActionRow
          label={tt("Reset font", "Reset font")}
          buttonText={tt("Reset", "Reset")}
          icon={RotateCcw}
          onAction={() => { clearLocalFont(); updateSettings({ fontFamily: "default", fontUrl: "", fontScale: 100 }); }}
        />
      </SettingSection>

      <SettingSection title={tt("Efek Kaca", "Glass Effect")}>
        <ToggleRow
          label="Liquid Glass"
          hint={tt(
            "Aktif: dock bawah memakai kaca dengan efek refraksi (tepinya membelokkan latar). Nonaktif: blur biasa. Refraksi hanya tampil di Chrome/Edge/Android; browser lain tetap memakai kaca bening. Kalau terasa berat, matikan.",
            "On: the bottom dock uses glass with a refraction effect (edges bend the background). Off: plain blur. Refraction only shows in Chrome/Edge/Android; other browsers use clear glass. Turn it off if it feels slow."
          )}
          checked={settings.liquidGlass !== false}
          onChange={set("liquidGlass")}
        />
      </SettingSection>

      <SettingSection title={tt("Tampilan Pemutar", "Player Look")}>
        <ToggleRow label={tt("Seekbar waveform", "Waveform Seekbar")} hint={tt("Tampilkan bentuk gelombang di progress bar (pola bentuk-tetap per lagu, bukan hasil decode audio asli)", "Show a waveform shape on the progress bar (a per-track fixed pattern, not decoded from the actual audio)")} checked={!!settings.waveformSeekbar} onChange={set("waveformSeekbar")} />
        <ToggleRow label={tt("Background sampul album", "Album Cover Background")} hint={tt("Pakai sampul sebagai background blur di layar penuh", "Use the album cover as a blurred background on the fullscreen player")} checked={settings.coverBackground !== false} onChange={set("coverBackground")} />
        <ToggleRow label={tt("Warna dinamis", "Dynamic Colors")} hint={tt("Cahaya di sekitar sampul menyesuaikan warna dominan lagu yang diputar", "Glow around the cover follows the playing track's dominant color")} checked={!!settings.dynamicColors} onChange={set("dynamicColors")} />
        <ToggleRow label={tt("Sampul tanpa sudut bulat", "No Round Album Cover")} checked={!!settings.noRoundCover} onChange={set("noRoundCover")} />
        <ToggleRow label={tt("Efek tilt 3D pada sampul", "Vanilla Tilt Album Cover")} hint={tt("Efek kemiringan 3D di layar penuh saat kursor digerakkan", "3D tilt effect on the fullscreen cover as you move the cursor")} checked={!!settings.tiltCover} onChange={set("tiltCover")} />
        <SliderRow label={tt("Jarak tilt", "Tilt Distance")} hint={tt("Maksimum kemiringan (default 10)", "Max tilt distance (default: 10)")} value={Number(settings.tiltDistance) || 10} min={1} max={30} step={1} onChange={set("tiltDistance")} />
        <SliderRow label={tt("Kecepatan tilt", "Tilt Speed")} hint="ms" value={Number(settings.tiltSpeed) || 240} min={50} max={600} step={10} onChange={set("tiltSpeed")} format={(v) => `${v}`} />
        <ToggleRow label={tt("Sampul CD berputar", "CD Album Cover")} hint={tt("Sampul berputar seperti CD saat lagu diputar", "Spin the cover like a CD while a song is playing")} checked={!!settings.cdCoverSpin} onChange={set("cdCoverSpin")} />
        <ToggleRow label={tt("Sampul animasi (Now Playing & Lirik)", "Animated Artwork")} hint={tt("Cari video sampul album animasi (kalau tersedia) di layar Now Playing dan tampilan lirik desktop; sampul statis tetap tampil dulu sampai animasinya siap diputar. Pakai data ekstra.", "Looks up an animated album cover video when available on the Now Playing screen and the desktop lyrics view; the static cover always shows first until the animation is ready to play. Uses extra data.")} checked={!!settings.animatedArtwork} onChange={set("animatedArtwork")} />
      </SettingSection>

      <SettingSection title="Visualizer" desc={tt("Visualizer canvas ringan berbasis Web Audio — gaya Butterchurn/Kawarp di sini adalah interpretasi kustom, bukan library Milkdrop asli.", "A lightweight Web-Audio canvas visualizer — the Butterchurn/Kawarp styles here are custom interpretations, not the original Milkdrop library.")}>
        <ToggleRow label={tt("Visualizer layar penuh", "Full-screen Visualizer")} checked={!!settings.visualizerEnabled} onChange={set("visualizerEnabled")} />
        <SelectRow label={tt("Gaya visualizer", "Visualizer Style")} value={settings.visualizerStyle || "butterchurn"} onChange={set("visualizerStyle")} options={VISUALIZER_STYLES} />
        <SelectRow label={tt("Mode visualizer", "Visualizer Mode")} value={settings.visualizerMode || "solid"} onChange={set("visualizerMode")}
          options={[{ value: "solid", label: tt("Background solid", "Solid Background") }, { value: "blended", label: tt("Menyatu dengan sampul", "Blended on Cover Art") }]} />
        <SliderRow label={tt("Sensitivitas visualizer", "Visualizer Sensitivity")} hint={tt("Hati-hati: sensitivitas tinggi bisa memicu fotosensitif", "Warning: high sensitivity may cause flashing lights")} value={Number(settings.visualizerSensitivity) || 60} min={10} max={200} step={5} onChange={set("visualizerSensitivity")} format={(v) => `${v}%`} />
        <SliderRow label={tt("Kecerahan visualizer", "Visualizer Brightness")} value={Number(settings.visualizerBrightness) || 100} min={20} max={200} step={5} onChange={set("visualizerBrightness")} format={(v) => `${v}%`} />
        <ToggleRow label={tt("Ganti preset otomatis", "Cycle Presets")} checked={!!settings.cyclePresets} onChange={set("cyclePresets")} />
        <SelectRow label={tt("Preset saat ini", "Current Preset")} value={VISUALIZER_PRESETS.some((x) => x.value === settings.visualizerPreset) ? settings.visualizerPreset : "auto"} onChange={set("visualizerPreset")} options={VISUALIZER_PRESETS} />
        <SliderRow label={tt("Durasi siklus", "Cycle Duration")} hint={tt("Detik antar pergantian preset", "Seconds between preset changes")} value={Number(settings.cycleDuration) || 30} min={5} max={120} step={5} onChange={set("cycleDuration")} format={(v) => `${v}s`} />
        <ToggleRow label={tt("Acak preset", "Randomize Presets")} hint={tt("Preset berikutnya dipilih acak", "Pick the next preset randomly")} checked={!!settings.randomizePresets} onChange={set("randomizePresets")} />
      </SettingSection>

      <SettingSection title={tt("Bagian Beranda", "Home Sections")}>
        <ToggleRow label={tt("Tampilkan lagu rekomendasi", "Show Recommended Songs")} checked={settings.showRecommendedSongs !== false} onChange={set("showRecommendedSongs")} />
        <ToggleRow label={tt("Tampilkan album rekomendasi", "Show Recommended Albums")} checked={settings.showRecommendedAlbums !== false} onChange={set("showRecommendedAlbums")} />
        <ToggleRow label={tt("Tampilkan artist rekomendasi", "Show Recommended Artists")} checked={settings.showRecommendedArtists !== false} onChange={set("showRecommendedArtists")} />
        <ToggleRow label={tt("Tampilkan Lanjutkan Dengerin", "Show Jump Back In")} checked={settings.showJumpBackIn !== false} onChange={set("showJumpBackIn")} />
        <ToggleRow label={tt("Tampilkan Pilihan Editor", "Show Editor's Picks")} checked={!!settings.showEditorsPicks} onChange={set("showEditorsPicks")} />
        <ToggleRow label={tt("Acak urutan Pilihan Editor", "Shuffle Editor's Picks")} checked={!!settings.shuffleEditorsPicks} onChange={set("shuffleEditorsPicks")} />
        <SelectRow label={tt("Sumber Pilihan Editor", "Editor's Picks Source")} value={settings.editorsPicksSource || "current"} onChange={set("editorsPicksSource")}
          options={[{ value: "current", label: tt("Utama", "Current") }, { value: "alt", label: tt("Alternatif", "Alternative") }]} />
      </SettingSection>
    </>
  );

  const renderInterface = () => (
    <>
      <SettingSection title={tt("Tata Letak", "Layout")}>
        <ToggleRow label={tt("Artist ringkas", "Compact Artists")} hint={tt("Kartu artist lebih padat & horizontal", "Artist cards in a compact, horizontal layout")} checked={!!settings.compactArtists} onChange={set("compactArtists")} />
        <ToggleRow label={tt("Banner artist", "Artist Banners")} hint={tt("Tampilkan banner di halaman artist", "Show the banner image on artist pages")} checked={settings.artistBanners !== false} onChange={set("artistBanners")} />
        <ToggleRow label={tt("Album ringkas", "Compact Albums")} checked={!!settings.compactAlbums} onChange={set("compactAlbums")} />
        <ToggleRow label={tt("Baris lebih rapat", "Denser rows")} hint={tt("Bikin daftar lagu lebih padat", "Make song lists more compact")} checked={!!settings.compactRows} onChange={set("compactRows")} />
      </SettingSection>

      <SettingSection title={tt("Navigasi Samping — Atas", "Sidebar Top Section")}>
        <ToggleRow label={t("navHome")} checked={settings.showNavHome !== false} onChange={set("showNavHome")} />
        <ToggleRow label={t("navSearch")} checked={settings.showNavSearch !== false} onChange={set("showNavSearch")} />
        <ToggleRow label={t("navLibrary")} checked={settings.showNavLibrary !== false} onChange={set("showNavLibrary")} />
        <ToggleRow label={t("navRooms")} checked={settings.showNavRooms !== false} onChange={set("showNavRooms")} />
        <ToggleRow label={t("navShorts")} checked={settings.showNavShorts !== false} onChange={set("showNavShorts")} />
      </SettingSection>

      <SettingSection title={tt("Navigasi Samping — Bawah", "Sidebar Bottom Section")}>
        <ToggleRow label={tt("Tautan Tentang", "About link")} checked={!!settings.showSideAbout} onChange={set("showSideAbout")} />
        <ToggleRow label="Discord" checked={!!settings.showSideDiscord} onChange={set("showSideDiscord")} />
        <ToggleRow label="GitHub" checked={!!settings.showSideGithub} onChange={set("showSideGithub")} />
        <ToggleRow label={tt("Pengingat donasi", "Donation Reminders")} hint={tt("Kadang muncul notifikasi ajakan dukung Cosmicx", "Occasionally show a notification inviting you to support Cosmicx")} checked={!!settings.donationReminders} onChange={set("donationReminders")} />
      </SettingSection>

      <SettingSection title={tt("Perilaku Navigasi", "Navigation Behavior")}>
        <ToggleRow label={tt("Tutup modal saat pindah halaman", "Close Modals on Navigation")} hint={tt("Panel terbuka (lirik, antrean) ditutup saat navigasi", "Open modals/panels close when navigating")} checked={!!settings.closeModalsOnNavigation} onChange={set("closeModalsOnNavigation")} />
        <ToggleRow label={tt("Tombol back tutup modal dulu", "Intercept Back to Close Modals")} hint={tt("Tekan back: modal ditutup dulu, tekan lagi baru pindah halaman", "Pressing back closes modals first without navigating")} checked={!!settings.interceptBackToCloseModals} onChange={set("interceptBackToCloseModals")} />
      </SettingSection>

      <SettingSection title={tt("Layar Penuh & Now Playing", "Fullscreen & Now Playing")}>
        <SelectRow label={tt("Tampilan klik sampul mini", "Now Playing View Mode")} hint={tt("Yang muncul saat sampul kecil diklik", "What appears when clicking the small album art")}
          value={settings.nowPlayingView || "album"} onChange={set("nowPlayingView")}
          options={[
            { value: "album", label: tt("Ke halaman album", "Go to Album") },
            { value: "fullscreen", label: tt("Mode layar penuh", "Fullscreen Mode") },
            { value: "lyrics", label: tt("Panel lirik", "Lyrics Panel") },
          ]} />
        <SelectRow label={tt("Aksi klik sampul layar penuh", "Fullscreen Cover Click Action")}
          value={settings.fullscreenCoverClick || "exit"} onChange={set("fullscreenCoverClick")}
          options={[
            { value: "exit", label: tt("Keluar layar penuh", "Exit fullscreen mode") },
            { value: "hide", label: tt("Sembunyikan UI", "Hide UI") },
            { value: "pause", label: tt("Jeda / lanjut", "Pause/resume track") },
            { value: "next", label: tt("Skip lagu", "Skip song") },
            { value: "prev", label: tt("Lagu sebelumnya", "Previous song") },
            { value: "none", label: tt("Tidak melakukan apa pun", "Do nothing") },
          ]} />
      </SettingSection>
    </>
  );

  const renderAudio = () => (
    <>
      <SettingSection title={tt("Streaming", "Streaming")}>
        <SelectRow label={tt("Kualitas audio", "Audio quality")} hint={tt("Pratinjau: 30 detik resmi dari Deezer. Penuh: eksperimental lewat YouTube.", "Preview: official 30s from Deezer. Full: experimental via YouTube.")}
          value={settings.audioQuality || "preview"} onChange={set("audioQuality")}
          options={[{ value: "preview", label: tt("Pratinjau (disarankan)", "Preview (recommended)") }, { value: "full", label: tt("Penuh (eksperimental)", "Full (experimental)") }]} />
        <SelectRow label={tt("Format audio", "Audio format")} hint={tt("Berlaku untuk pemutaran Penuh. FLAC: sumber lossless via stream.py (butuh judul+artis), fallback transcode YouTube — putaran pertama lebih lama karena disiapkan dulu.", "Applies to Full playback. FLAC: lossless source via stream.py (needs title+artist), falls back to YouTube transcode — first play is slower while it prepares the file.")}
          value={settings.audioFormat || "opus"} onChange={set("audioFormat")}
          options={[
            { value: "aac", label: tt("AAC (m4a \u00b7 128kbps)", "AAC (m4a \u00b7 128kbps)") },
            { value: "opus", label: tt("OPUS (webm \u00b7 160kbps)", "OPUS (webm \u00b7 160kbps)") },
            { value: "flac", label: tt("FLAC (lossless)", "FLAC (lossless)") },
          ]} />
      </SettingSection>

      <SettingSection title={tt("Pemutaran", "Playback")}>
        <ToggleRow label={tt("Putar otomatis", "Autoplay")} hint={tt("Lanjut ke lagu berikutnya otomatis", "Automatically continue to the next song")} checked={settings.autoplay !== false} onChange={set("autoplay")} />
        <SliderRow label={tt("Crossfade", "Crossfade")} hint={tt("Detik transisi antar lagu", "Transition seconds between songs")} value={Number(settings.crossfadeSeconds) || 0} min={0} max={12} step={1} onChange={set("crossfadeSeconds")} format={(v) => `${v}s`} />
        <ToggleRow label={tt("Ratakan volume (ReplayGain)", "ReplayGain Normalize")} hint={tt("Samain kerasnya volume antar lagu", "Even out loudness between songs")} checked={!!settings.normalizeVolume} onChange={set("normalizeVolume")} />
        <SliderRow label={tt("Volume awal", "Starting volume")} value={Number(settings.volumeDefault ?? 0.7)} min={0} max={1} step={0.05} onChange={set("volumeDefault")} format={(v) => `${Math.round(v * 100)}%`} />
        <ToggleRow label={tt("Konten eksplisit", "Explicit content")} hint={tt("Tampilkan lagu dengan label eksplisit", "Show songs labeled as explicit")} checked={settings.explicitContent !== false} onChange={set("explicitContent")} />
      </SettingSection>

      <SettingSection title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><SlidersHorizontal size={16} />{tt("Equalizer", "Equalizer")}</span>}>
        <EqualizerPanel eq={eq} onChange={(next) => updateSettings({ equalizer: next })} tt={tt} />
      </SettingSection>
    </>
  );

  const renderSystem = () => (
    <>
      <SettingSection title={t("sectionNotif")}>
        <ToggleRow label={t("settingNotifyInvite")} hint={t("settingNotifyInviteHint")} checked={settings.notifyRoomInvite !== false} onChange={set("notifyRoomInvite")} />
      </SettingSection>

      <SettingSection title="Discord" desc={tt("Tampilkan lagu yang kamu dengar di profil Discord (seperti Spotify). Butuh presence bridge yang berjalan di PC dan Discord desktop yang terbuka.", "Show what you're listening to on your Discord profile (like Spotify). Requires the presence bridge running on your PC and the Discord desktop app open.")}>
        <ToggleRow label={tt("Status \"Listening to\" di profil", "\"Listening to\" status on profile")} hint={tt("Judul, artis, cover, dan progress lagu", "Song title, artist, cover, and progress")} checked={!!settings.discordPresence} onChange={set("discordPresence")} />
        <ToggleRow label={tt("Tampilkan lirik di status", "Show lyrics in status")} hint={tt("Baris lirik yang sedang dinyanyikan, berganti sinkron dengan halaman lirik", "The line being sung, changing in sync with the lyrics view")} checked={settings.discordPresenceLyrics !== false} onChange={set("discordPresenceLyrics")} />
      </SettingSection>

      <SettingSection title={tt("Cookie", "Cookies")}>
        <ActionRow
          label={tt("Preferensi cookie", "Cookie preferences")}
          hint={!cookieConsent ? tt("Belum dipilih", "Not chosen yet")
            : cookieConsent.preferences && cookieConsent.analytics ? tt("Semua cookie diterima", "All cookies accepted")
            : !cookieConsent.preferences && !cookieConsent.analytics ? tt("Hanya cookie esensial", "Essential cookies only")
            : tt("Pilihan kustom", "Custom selection")}
          buttonText={tt("Atur", "Manage")} icon={Cookie} onAction={openCookieSettings} />
      </SettingSection>

      <SettingSection title={tt("Cache & Data", "Cache & Data")}>
        <ActionRow label={tt("Cache", "Cache")} hint={tt("Hapus respons API yang tersimpan", "Clear cached API responses")} buttonText={tt("Bersihkan Cache", "Clear Cache")} onAction={clearCache} />
        <ActionRow tone="danger" label={tt("Reset data lokal", "Reset Local Data")} hint={tt("Hapus data tersimpan di browser ini (sync awan aman)", "Clear local storage on this device (cloud sync unaffected)")} buttonText={tt("Reset", "Reset")} onAction={resetLocalData} />
        <ActionRow tone="danger" label={tt("Hapus data awan", "Clear Cloud Data")} hint={tt("Hapus setting tersimpan di server — tidak bisa dibatalkan", "Delete settings stored on the server — cannot be undone")} buttonText={tt("Hapus", "Clear")} onAction={clearCloudData} />
      </SettingSection>

      <SettingSection title={tt("Backup & Restore", "Backup & Restore")}>
        <ActionRow label={tt("Ekspor koleksi & riwayat", "Export Library & History")} hint={tt("Playlist, lagu disukai, riwayat, dan setting sebagai JSON", "Playlists, liked songs, history, and settings as JSON")} buttonText="Export" icon={FileDown} onAction={exportBackup} />
        <ActionRow label={tt("Impor backup", "Import Backup")} hint={tt("Pulihkan setting dari file backup", "Restore settings from a backup file")} buttonText="Import" icon={FileUp} onAction={() => openImport("backup")} />
        <ActionRow label={tt("Ekspor semua setting", "Export All Settings")} buttonText="Export" icon={FileDown} onAction={exportAllSettings} />
        <ActionRow label={tt("Impor setting", "Import Settings")} buttonText="Import" icon={FileUp} onAction={() => openImport("settings")} />
      </SettingSection>

      <SettingSection title={t("sectionAccount")}>
        <div className="aivy-settings-row">
          <div><div className="label">{t("settingLoggedInAs")}</div><div className="hint">{authUser.username}</div></div>
          <button className="aivy-btn-ghost sm" disabled={loggingOut} onClick={logout}><LogOut size={14} /> {loggingOut ? t("loading") : t("settingLogout")}</button>
        </div>
        <ActionRow label={t("settingResetAll")} hint={t("settingResetAllHint")} buttonText={tt("Reset", "Reset")} icon={RotateCcw} onAction={resetSettings} />
      </SettingSection>
    </>
  );

  const contentByTab = {
    appearance: renderAppearance,
    interface: renderInterface,
    audio: renderAudio,
    system: renderSystem,
  };

  return (
    <div className="aivy-view-enter aivy-settings-page">
      <div className="aivy-greet" style={{ paddingBottom: 18 }}>
        <h1 className="font-display" style={{ fontSize: "clamp(22px,3vw,28px)" }}>{t("settingsTitle")}</h1>
      </div>

      <div className="aivy-settings-layout">
        <nav className="aivy-settings-tabs" role="tablist" aria-label={t("settingsTitle")}>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`aivy-settings-tab ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="aivy-settings-col">
          {contentByTab[tab]?.()}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={onImportFile} />
    </div>
  );
}