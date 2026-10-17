import React, { useState, useEffect, useRef, useCallback } from "react";
import { Speaker, Check, Search, Loader2, ChevronRight, AudioLines } from "lucide-react";
import { usePlayer, useUI } from "./context.jsx";
import { VolumeControl, useTrackAudioInfo } from "./components.jsx";

export const NPD_LYRICS_ID = "aivy-am-lyrics-npd";
const DASH = "\u2014";


const escStack = [];
let escSeq = 0;

function useSheetLife(onClose) {
  const [shown, setShown] = useState(false);
  const closing = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const idRef = useRef(++escSeq);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setShown(false);
    setTimeout(() => closeRef.current(), 240);
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    const id = idRef.current;
    escStack.push(id);
    const onKey = (e) => {
      if (e.key !== "Escape" || escStack[escStack.length - 1] !== id) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      const i = escStack.indexOf(id);
      if (i !== -1) escStack.splice(i, 1);
    };
  }, [close]);

  return { shown, close };
}

function useSheetDrag(sheetRef, close) {
  const st = useRef(null);
  const onPointerDown = useCallback((e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = sheetRef.current;
    if (!el) return;
    st.current = { id: e.pointerId, y: e.clientY, dy: 0 };
    el.style.transition = "none";
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }, [sheetRef]);
  const onPointerMove = useCallback((e) => {
    const s = st.current;
    const el = sheetRef.current;
    if (!s || s.id !== e.pointerId || !el) return;
    s.dy = Math.max(0, e.clientY - s.y);
    el.style.transform = `translate3d(0, ${s.dy}px, 0)`;
  }, [sheetRef]);
  const end = useCallback((e) => {
    const s = st.current;
    const el = sheetRef.current;
    if (!s || s.id !== e.pointerId) return;
    st.current = null;
    if (!el) return;
    el.style.transition = "";
    el.style.transform = "";
    if (s.dy > 90) close();
  }, [sheetRef, close]);
  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}

function SheetShell({ title, onClose, variant = "sheet", children }) {
  const { shown, close } = useSheetLife(onClose);
  const ref = useRef(null);
  const drag = useSheetDrag(ref, close);
  const body = typeof children === "function" ? children(close) : children;

  if (variant === "card") {
    return (
      <div className={`npd-sheet-layer npd-card-layer ${shown ? "shown" : ""}`}>
        <div className="npd-sheet-backdrop" onClick={close} />
        <div ref={ref} className="npd-card" role="dialog" aria-label={title}>
          <h3 className="npd-card-title">{title}</h3>
          <div className="npd-card-body aivy-scroll">{body}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`npd-sheet-layer ${shown ? "shown" : ""}`}>
      <div className="npd-sheet-backdrop" onClick={close} />
      <div ref={ref} className="npd-sheet" role="dialog" aria-label={title}>
        <div className="npd-sheet-head" {...drag}>
          <span className="npd-sheet-grip" />
          <h3 className="npd-sheet-title">{title}</h3>
        </div>
        <div className="npd-sheet-body aivy-scroll">{body}</div>
      </div>
    </div>
  );
}

function useOutputDevices() {
  const [state, setState] = useState({ devices: [], labelsHidden: false });
  const refresh = useCallback(async () => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    if (!md || typeof md.enumerateDevices !== "function") return;
    try {
      const all = await md.enumerateDevices();
      const outs = all.filter((d) => d.kind === "audiooutput");
      setState({
        labelsHidden: outs.length > 0 && outs.every((d) => !d.label),
        devices: outs.filter((d) => d.deviceId !== "default" && d.deviceId !== "communications"),
      });
    } catch {}
  }, []);
  useEffect(() => {
    refresh();
    const md = navigator.mediaDevices;
    if (md && md.addEventListener) md.addEventListener("devicechange", refresh);
    return () => { if (md && md.removeEventListener) md.removeEventListener("devicechange", refresh); };
  }, [refresh]);
  return state;
}

function khz(hz) {
  return hz ? `${(hz / 1000).toFixed(1)} kHz` : DASH;
}

function DeviceRow({ on, label, onClick }) {
  return (
    <button type="button" className={`npd-row ${on ? "is-on" : ""}`} onClick={onClick}>
      <span className="npd-row-ico"><Speaker size={18} /></span>
      <span className="npd-row-txt"><span className="t">{label}</span></span>
      {on && <Check size={18} className="npd-row-check" />}
    </button>
  );
}

export function AudioOutputSheet({ tx, onClose, onOpenPipeline }) {
  const { outputDevice, setOutputDevice, getAudioContext } = usePlayer();
  const { pushToast } = useUI();
  const { devices, labelsHidden } = useOutputDevices();
  const ctx = getAudioContext();
  const canSwitch = !!(ctx && typeof ctx.setSinkId === "function");
  const activeId = outputDevice?.id || "";
  const canPrompt = typeof navigator !== "undefined" && typeof navigator.mediaDevices?.selectAudioOutput === "function";

  const pick = async (dev) => {
    const ok = await setOutputDevice(dev);
    if (!ok && pushToast) pushToast(tx("Gagal mengganti output audio", "Couldn\u2019t switch the audio output"));
  };
  const chooseOther = async () => {
    try {
      const d = await navigator.mediaDevices.selectAudioOutput();
      await pick({ id: d.deviceId, label: d.label });
    } catch {}
  };

  const extra = outputDevice && !devices.some((d) => d.deviceId === outputDevice.id) ? outputDevice : null;

  return (
    <SheetShell title={tx("Output audio", "Audio output")} onClose={onClose}>
      <DeviceRow on={activeId === ""} label={tx("Default sistem", "System default")} onClick={() => pick(null)} />
      {canSwitch && extra && <DeviceRow on label={extra.label || tx("Perangkat terpilih", "Selected device")} onClick={() => {}} />}
      {canSwitch && devices.map((d, i) => (
        <DeviceRow
          key={d.deviceId} on={activeId === d.deviceId}
          label={d.label || tx(`Output ${i + 1}`, `Output ${i + 1}`)}
          onClick={() => pick({ id: d.deviceId, label: d.label })}
        />
      ))}
      {canSwitch && labelsHidden && canPrompt && (
        <button type="button" className="npd-row" onClick={chooseOther}>
          <span className="npd-row-ico"><Search size={18} /></span>
          <span className="npd-row-txt"><span className="t">{tx("Pilih perangkat lain\u2026", "Choose another device\u2026")}</span></span>
        </button>
      )}
      {!canSwitch && (
        <div className="npd-note">{tx("Browser ini belum mendukung pemilihan output audio.", "This browser doesn\u2019t support choosing an audio output.")}</div>
      )}

      <div className="npd-row npd-row-vol"><VolumeControl /></div>

      <button type="button" className="npd-row" onClick={onOpenPipeline}>
        <span className="npd-row-ico"><AudioLines size={18} /></span>
        <span className="npd-row-txt">
          <span className="t">Audio Pipeline</span>
          <span className="s">{`32-bit float \u00b7 ${khz(ctx?.sampleRate)}`}</span>
        </span>
        <ChevronRight size={18} className="npd-row-chev" />
      </button>
    </SheetShell>
  );
}

function chName(n) {
  if (n === 1) return "Mono";
  if (!n || n === 2) return "Stereo";
  return `${n} ch`;
}
const cap = (v) => (v ? String(v).charAt(0).toUpperCase() + String(v).slice(1) : DASH);

export function AudioPipelineCard({ track, tx, onClose }) {
  const { audioFormat, getAudioContext, outputDevice } = usePlayer();
  const { settings } = useUI();
  const info = useTrackAudioInfo(track);
  const format = info && info !== "unavailable" ? info.format : null;
  const ctx = getAudioContext();
  const af = audioFormat && audioFormat !== "unavailable" ? audioFormat : null;

  const codec = format?.codec || af?.codec || null;
  const container = af?.container || af?.label || null;
  const srcRate = format?.sampleRateHz || null;
  const outRate = ctx?.sampleRate || null;
  const on = tx("Aktif", "On");
  const off = tx("Mati", "Off");
  const eqOn = !!settings.equalizer?.enabled;
  const xfade = Number(settings.crossfadeSeconds) || 0;
  const latency = ctx ? Math.round(((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000) : null;

  const sourceName = track?.source === "local" ? tx("File lokal", "Local file") : "YouTube Music";

  let resampler = DASH;
  if (srcRate && outRate) resampler = srcRate === outRate ? tx("Tanpa konversi", "No conversion") : `${khz(srcRate)} \u2192 ${khz(outRate)}`;

  const sections = [
    {
      title: tx("SUMBER", "SOURCE"),
      rows: [
        [tx("Format", "Format"), container ? String(container).toUpperCase() : cap(codec)],
        [tx("Bitrate", "Bitrate"), format?.bitrateKbps ? `${Math.round(format.bitrateKbps)} kbps` : DASH],
        [tx("Sumber", "Sources"), sourceName],
      ],
    },
    {
      title: "DECODER",
      rows: [
        [tx("Nama decoder", "Decoder Name"), codec ? `Browser (${cap(codec)})` : "Browser"],
        [tx("Laju I/O", "I/O Rate"), khz(srcRate)],
        [tx("Kanal", "Channels"), chName(format?.channels || 2)],
      ],
    },
    { title: "RESAMPLER", rows: [["Resampler", resampler]] },
    {
      title: "DSP",
      rows: [
        ["Equalizer", eqOn ? on : off],
        [tx("Normalisasi volume", "Volume normalization"), settings.normalizeVolume ? on : off],
        ["Crossfade", xfade > 0 ? `${xfade} s` : off],
      ],
    },
    {
      title: tx("PERANGKAT OUTPUT", "OUTPUT DEVICE"),
      rows: [
        [tx("API output", "Output API"), "Web Audio"],
        [tx("Nama perangkat", "Device Name"), outputDevice?.label || tx("Default sistem", "System default")],
        [tx("Format PCM", "PCM Format"), "32-bit float"],
        [tx("Sample rate", "Sample Rate"), khz(outRate)],
        [tx("Kanal", "Channels"), chName(ctx?.destination?.channelCount || 2)],
        [tx("Latensi", "Latency"), latency != null ? `${latency} ms` : DASH],
      ],
    },
  ];

  return (
    <SheetShell variant="card" title="Audio Pipeline" onClose={onClose}>
      {sections.map((sec) => (
        <div key={sec.title} className="npd-pipe-sec">
          <div className="npd-pipe-label">{sec.title}</div>
          <div className="npd-pipe-box">
            {sec.rows.map(([k, v]) => (
              <div key={k} className="npd-pipe-row">
                <span className="k">{k}</span>
                <span className="v">{v}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </SheetShell>
  );
}

export function LyricsProviderSheet({ tx, onClose }) {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(null);
  const getEl = () => document.getElementById(NPD_LYRICS_ID);

  const refresh = useCallback(() => {
    const el = getEl();
    const next = el && typeof el.getProviderList === "function" ? el.getProviderList() : [];
    setList((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 500);
    return () => clearInterval(id);
  }, [refresh]);

  const sorted = [...list].sort((a, b) => (b.status === "current") - (a.status === "current"));

  const subtitle = (p) => {
    if (busy === p.key) return tx("Mengambil\u2026", "Fetching\u2026");
    if (p.status === "current") return tx("Provider saat ini", "Current provider");
    if (p.status === "ready") return tx("Ketuk untuk beralih", "Tap to switch");
    if (p.status === "missing") return tx("Tidak ditemukan", "Not found");
    return tx("Ketuk untuk mengambil", "Tap to fetch");
  };

  const pick = async (p, close) => {
    if (busy) return;
    if (p.status === "current") { close(); return; }
    const el = getEl();
    if (!el || typeof el.selectProvider !== "function") return;
    setBusy(p.key);
    let ok = false;
    try { ok = await el.selectProvider(p.key); } catch { ok = false; }
    setBusy(null);
    refresh();
    if (ok) close();
  };

  return (
    <SheetShell title={tx("Pilih provider lirik", "Choose lyrics provider")} onClose={onClose}>
      {(close) => (
        sorted.length === 0
          ? <div className="npd-note">{tx("Provider belum tersedia untuk lagu ini.", "No providers available for this song yet.")}</div>
          : sorted.map((p) => (
            <button
              key={p.key} type="button" disabled={!!busy && busy !== p.key}
              className={`npd-row ${p.status === "current" ? "is-on" : ""} ${p.status === "missing" ? "is-missing" : ""}`}
              onClick={() => pick(p, close)}
            >
              <span className="npd-row-ico">
                {busy === p.key ? <Loader2 size={18} className="npd-spin" /> : p.status === "current" ? <Check size={18} /> : <Search size={18} />}
              </span>
              <span className="npd-row-txt">
                <span className="t">{p.label}</span>
                <span className="s">{subtitle(p)}</span>
              </span>
            </button>
          ))
      )}
    </SheetShell>
  );
}