import React from "react";
import { ChevronLeft, RotateCcw } from "lucide-react";
import {
  useUI, usePlayer,
  EQ_BANDS_HZ, EQ_PRESETS,
  TEMPO_MIN, TEMPO_MAX, PITCH_MIN, PITCH_MAX, pitchSupported,
} from "./context.jsx";

/**
 * Halaman "Equalizer" dan "Tempo & Pitch" yang dibuka dari sheet opsi lagu (Now Playing).
 * Engine-nya ada di context.jsx (grafik Web Audio + playbackRate), halaman ini hanya mengubah settings.
 */

const FLAT_EQ = { enabled: false, preset: "flat", preamp: 0, bands: [...EQ_PRESETS.flat] };

function useTt() {
  const { settings } = useUI();
  return (id, en) => (settings.language === "en" ? en : id);
}

function matchPreset(bands) {
  for (const [key, vals] of Object.entries(EQ_PRESETS)) {
    if (vals.every((v, i) => v === (bands?.[i] ?? 0))) return key;
  }
  return "custom";
}

const fmtTempo = (v) => `${(Math.round(v * 100) / 100).toFixed(2)}\u00d7`;
const fmtPitch = (v) => `${v > 0 ? "+" : ""}${v}`;

/** Ringkasan singkat untuk badge di baris menu (kosong = tidak aktif). */
export function fxSummary(settings, tt) {
  const eq = settings.equalizer;
  const tempo = Number(settings.tempo) || 1;
  const pitch = Math.round(Number(settings.pitch) || 0);
  const tp = [];
  if (Math.abs(tempo - 1) > 0.001) tp.push(fmtTempo(tempo));
  if (pitch !== 0) tp.push(`${fmtPitch(pitch)} st`);
  return {
    eq: eq?.enabled ? tt("Aktif", "On") : "",
    tempo: tp.join(" \u00b7 "),
  };
}

function PageHead({ title, onBack, right }) {
  const tt = useTt();
  return (
    <div className="afx-head">
      <button type="button" className="aivy-icon-btn" onClick={onBack} aria-label={tt("Kembali", "Back")}>
        <ChevronLeft size={22} />
      </button>
      <h3 className="afx-title">{title}</h3>
      <div className="afx-right">{right}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <span
      className={`aivy-switch ${checked ? "on" : ""}`} role="switch" aria-checked={checked} aria-label={label} tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); } }}
    >
      <span className="knob" />
    </span>
  );
}

/* ---------------------------------------------------------------- Equalizer */
export function EqualizerPage({ onBack }) {
  const { settings, updateSettings } = useUI();
  const tt = useTt();
  const eq = settings.equalizer || FLAT_EQ;
  const bands = eq.bands || EQ_PRESETS.flat;
  const current = eq.preset === "custom" ? "custom" : matchPreset(bands);

  // Menyentuh preset / slider otomatis mengaktifkan equalizer, supaya perubahan langsung terdengar.
  const commit = (patch, autoEnable = true) =>
    updateSettings({ equalizer: { ...eq, ...patch, ...(autoEnable && !eq.enabled ? { enabled: true } : null) } });

  const presets = [
    ["flat", "Flat"], ["bass", "Bass Boost"], ["treble", "Treble Boost"],
    ["vocal", tt("Vokal", "Vocal")], ["electronic", tt("Elektronik", "Electronic")],
  ];
  if (current === "custom") presets.push(["custom", "Custom"]);

  const setBand = (i, v) => {
    const next = [...bands];
    next[i] = v;
    commit({ bands: next, preset: matchPreset(next) });
  };
  const freqLabel = (hz) => (hz >= 1000 ? `${hz / 1000}k` : `${hz}`);
  const pre = eq.preamp || 0;

  return (
    <div className="afx-page">
      <PageHead
        title={tt("Ekualiser", "Equalizer")}
        onBack={onBack}
        right={<Switch checked={!!eq.enabled} onChange={(v) => commit({ enabled: v }, false)} label={tt("Aktifkan equalizer", "Enable equalizer")} />}
      />

      <div className="afx-chips" role="listbox" aria-label="Preset">
        {presets.map(([key, label]) => (
          <button
            key={key} type="button" role="option" aria-selected={current === key}
            className={`aivy-chip ${current === key ? "active" : ""}`}
            onClick={() => (key === "custom" ? null : commit({ preset: key, bands: [...(EQ_PRESETS[key] || EQ_PRESETS.flat)] }))}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`afx-card afx-eq ${eq.enabled ? "" : "is-off"}`}>
        <div className="afx-bands">
          {EQ_BANDS_HZ.map((hz, i) => (
            <div className="afx-band" key={hz}>
              <span className="afx-val font-mono">{fmtPitch(bands[i] ?? 0)}</span>
              <input
                type="range" className="aivy-eq-slider" min={-12} max={12} step={1}
                value={bands[i] ?? 0} onChange={(e) => setBand(i, Number(e.target.value))}
                aria-label={`${freqLabel(hz)} Hz`} orient="vertical"
              />
              <span className="afx-freq font-mono">{freqLabel(hz)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="afx-card">
        <div className="afx-row-head">
          <span>Preamp</span>
          <span className="font-mono afx-readout-sm">{pre > 0 ? "+" : ""}{pre} dB</span>
        </div>
        <input
          type="range" className="afx-range" min={-12} max={12} step={1} value={pre}
          onChange={(e) => commit({ preamp: Number(e.target.value) })} aria-label="Preamp"
        />
      </div>

      <button
        type="button" className="afx-reset"
        onClick={() => updateSettings({ equalizer: { enabled: eq.enabled, preset: "flat", preamp: 0, bands: [...EQ_PRESETS.flat] } })}
      >
        <RotateCcw size={15} />{tt("Reset equalizer", "Reset equalizer")}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ Tempo & Pitch */
export function TempoPitchPage({ onBack }) {
  const { settings, updateSettings } = useUI();
  const { room } = usePlayer();
  const tt = useTt();
  const tempo = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Number(settings.tempo) || 1));
  const pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, Math.round(Number(settings.pitch) || 0)));
  const locked = !!room;
  const pitchOk = pitchSupported();
  const changed = Math.abs(tempo - 1) > 0.001 || pitch !== 0;

  return (
    <div className="afx-page">
      <PageHead title={tt("Tempo dan Pitch", "Tempo & Pitch")} onBack={onBack} />

      {locked && (
        <div className="afx-note">{tt("Dikunci di 1\u00d7 dan 0 saat Listening Party supaya tetap sinkron dengan room.", "Locked at 1\u00d7 and 0 during a Listening Party so you stay in sync with the room.")}</div>
      )}

      <div className={`afx-card ${locked ? "is-off" : ""}`}>
        <div className="afx-row-head">
          <span>Tempo</span>
          <span className="afx-readout">{fmtTempo(tempo)}</span>
        </div>
        <input
          type="range" className="afx-range" min={TEMPO_MIN} max={TEMPO_MAX} step={0.05} value={tempo} disabled={locked}
          onChange={(e) => updateSettings({ tempo: Number(e.target.value) })} aria-label="Tempo"
        />
        <div className="afx-chips afx-chips-inline">
          {[0.75, 1, 1.25, 1.5].map((v) => (
            <button
              key={v} type="button" disabled={locked}
              className={`aivy-chip ${Math.abs(tempo - v) < 0.001 ? "active" : ""}`}
              onClick={() => updateSettings({ tempo: v })}
            >
              {v === 1 ? tt("Normal", "Normal") : `${v}\u00d7`}
            </button>
          ))}
        </div>
        <div className="afx-hint">{tt("Kecepatan berubah, nada tetap.", "Speed changes, pitch stays.")}</div>
      </div>

      <div className={`afx-card ${locked || !pitchOk ? "is-off" : ""}`}>
        <div className="afx-row-head">
          <span>Pitch</span>
          <span className="afx-readout">{fmtPitch(pitch)} <small>{tt("semiton", "semitones")}</small></span>
        </div>
        <input
          type="range" className="afx-range" min={PITCH_MIN} max={PITCH_MAX} step={1} value={pitch} disabled={locked || !pitchOk}
          onChange={(e) => updateSettings({ pitch: Number(e.target.value) })} aria-label="Pitch"
        />
        <div className="afx-ticks font-mono" aria-hidden="true"><span>{PITCH_MIN}</span><span>0</span><span>+{PITCH_MAX}</span></div>
        <div className="afx-hint">
          {pitchOk
            ? tt("Nada berubah, kecepatan tetap. Menambah jeda sekitar 50 ms.", "Pitch changes, speed stays. Adds roughly 50 ms of latency.")
            : tt("Pitch butuh browser dengan AudioWorklet dan koneksi HTTPS.", "Pitch needs a browser with AudioWorklet and an HTTPS connection.")}
        </div>
      </div>

      <button type="button" className="afx-reset" disabled={!changed} onClick={() => updateSettings({ tempo: 1, pitch: 0 })}>
        <RotateCcw size={15} />{tt("Kembalikan ke normal", "Reset to normal")}
      </button>
    </div>
  );
}
