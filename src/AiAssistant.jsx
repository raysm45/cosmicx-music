import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles, Globe, FileText, Search, ListMusic, ListChecks, Play, Heart, Mic2, Music,
  Check, X, Copy, ChevronRight, Trash2, AlertTriangle, ArrowUp, Square,
} from "lucide-react";
import { useUI, usePlayer } from "./context.jsx";
import { Api } from "./lib/api.js";
import { runAiAssistantTurn } from "./lib/aiAssistant.js";

/* =====================================================================
 *  Markdown ringan untuk jawaban AI.
 *  (React sudah meng-escape teks, jadi TIDAK perlu escape manual lagi —
 *   versi lama meng-escape dulu sehingga "&" tampil sebagai "&amp;".)
 * ===================================================================== */
function renderInline(text, keyBase) {
  const out = [];
  const regex = /(`[^`]+`)|(\[[^\]]+\]\(https?:\/\/[^\s)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let last = 0;
  let m;
  let n = 0;
  while ((m = regex.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const v = m[0];
    const k = `${keyBase}-${n++}`;
    if (v.startsWith("`")) out.push(<code key={k}>{v.slice(1, -1)}</code>);
    else if (v.startsWith("[")) {
      const mm = v.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      out.push(<a key={k} href={mm?.[2] || "#"} target="_blank" rel="noreferrer">{mm?.[1] || v}</a>);
    } else if (v.startsWith("**")) out.push(<strong key={k}>{v.slice(2, -2)}</strong>);
    else out.push(<em key={k}>{v.slice(1, -1)}</em>);
    last = m.index + v.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderMarkdown(raw) {
  if (!raw) return null;
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let buf = [];
  let type = null;

  const flush = () => {
    if (!buf.length) return;
    const Tag = type === "ol" ? "ol" : "ul";
    const key = `l-${blocks.length}`;
    blocks.push(<Tag key={key}>{buf.map((it, i) => <li key={i}>{renderInline(it, `${key}-${i}`)}</li>)}</Tag>);
    buf = [];
    type = null;
  };

  lines.forEach((line, idx) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)/);
    const heading = line.match(/^\s{0,3}#{1,4}\s+(.*)/);
    if (bullet) { if (type && type !== "ul") flush(); type = "ul"; buf.push(bullet[1]); return; }
    if (numbered) { if (type && type !== "ol") flush(); type = "ol"; buf.push(numbered[1]); return; }
    flush();
    if (!line.trim()) return;
    if (heading) { blocks.push(<p key={`h-${idx}`} className="aic-h">{renderInline(heading[1], `h-${idx}`)}</p>); return; }
    blocks.push(<p key={`p-${idx}`}>{renderInline(line, `p-${idx}`)}</p>);
  });
  flush();
  return blocks;
}

/* =====================================================================
 *  Potongan UI kecil
 * ===================================================================== */
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Asterisk delapan sinar — berputar saat AI sedang bekerja. */
function AiSpark({ size = 16, spinning = false }) {
  return (
    <svg className={`aic-spark${spinning ? " is-spinning" : ""}`} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
    </svg>
  );
}

const TOOL_ICON = {
  web_search: Globe,
  read_webpage: FileText,
  find_songs: Search,
  search_tracks: Search,
  search_albums: Search,
  get_similar_tracks: Search,
  get_lyrics: Mic2,
  create_playlist_with_tracks: ListMusic,
  add_to_existing_playlist: ListMusic,
  remove_track_from_playlist: ListMusic,
  list_playlists: ListMusic,
  get_playlist_tracks: ListMusic,
  rename_playlist: ListMusic,
  delete_playlist: Trash2,
  play_track: Play,
  play_playlist: Play,
  play_album: Play,
  like_track: Heart,
  unlike_track: Heart,
  list_liked_tracks: Heart,
};

function useElapsed(startedAt, endedAt, active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return Math.max(0, Math.round(((endedAt || now) - startedAt) / 1000));
}

function PlanList({ steps }) {
  return (
    <ul className="aic-plan">
      {steps.map((s, i) => (
        <li key={i} className={`is-${s.status}`}>
          <span className="box">{s.status === "done" ? <Check size={10} strokeWidth={3.2} /> : s.status === "in_progress" ? <i className="pulse" /> : null}</span>
          <span className="txt">{s.text}</span>
        </li>
      ))}
    </ul>
  );
}

function StepItems({ items, tt }) {
  const MAX = 10;
  const shown = items.slice(0, MAX);
  return (
    <ul className="aic-items">
      {shown.map((it, i) => (
        <li key={i} className={it.ok === false ? "miss" : ""}>
          {it.ok === undefined
            ? <span className="bl" />
            : <span className="mk">{it.ok ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}</span>}
          <span className="tx">{it.text}</span>
          {it.sub && <span className="sub">{it.sub}</span>}
        </li>
      ))}
      {items.length > MAX && <li className="more">{tt(`+${items.length - MAX} lainnya`, `+${items.length - MAX} more`)}</li>}
    </ul>
  );
}

function ThinkingBlock({ turn, tt }) {
  const working = turn.status === "working";
  const [open, setOpen] = useState(working);
  const touched = useRef(false);

  // Terbuka selama bekerja, otomatis menutup saat selesai (kecuali user sudah mengaturnya sendiri).
  useEffect(() => { if (!touched.current) setOpen(working); }, [working]);

  const secs = useElapsed(turn.startedAt, turn.endedAt, working);
  const toolSteps = turn.steps.filter((s) => s.kind === "tool");
  const running = [...toolSteps].reverse().find((s) => s.status === "running");

  if (!working && turn.steps.length === 0) {
    // Jawaban langsung tanpa langkah -> tidak perlu blok. Tapi kalau dihentikan user, tetap beri tanda.
    return turn.status === "stopped"
      ? <div className="aic-stopped">{tt("Dihentikan", "Stopped")}</div>
      : null;
  }

  let label;
  if (working) label = running ? `${running.label}…` : tt("Berpikir…", "Thinking…");
  else if (turn.status === "stopped") label = tt("Dihentikan", "Stopped");
  else if (turn.status === "error") label = tt("Terhenti karena error", "Stopped on an error");
  else label = tt(`Berpikir selama ${secs} dtk`, `Thought for ${secs}s`);

  const meta = working
    ? `${secs} ${tt("dtk", "s")}`
    : toolSteps.length ? tt(`${toolSteps.length} langkah`, `${toolSteps.length} steps`) : "";

  return (
    <div className={`aic-think${open ? " is-open" : ""}${working ? " is-working" : ""}`}>
      <button type="button" className="aic-think-head" aria-expanded={open}
        onClick={() => { touched.current = true; setOpen((v) => !v); }}>
        <AiSpark size={15} spinning={working} />
        <span className={`aic-think-label${working ? " aic-shimmer" : ""}`}>{label}</span>
        {meta && <span className="aic-think-meta">{meta}</span>}
        <ChevronRight size={14} className="aic-chev" />
      </button>

      <div className="aic-think-body">
        <div className="aic-think-inner">
          <ol className="aic-steps">
            {turn.steps.map((s) => {
              if (s.kind === "thought") {
                return (
                  <li key={s.id} className="aic-step is-thought">
                    <span className="dot" />
                    <div className="aic-thought">{renderMarkdown(s.text)}</div>
                  </li>
                );
              }
              if (s.kind === "plan") {
                return (
                  <li key={s.id} className="aic-step is-plan">
                    <span className="dot ic"><ListChecks size={11} /></span>
                    <div className="aic-step-main">
                      <div className="aic-step-title">{tt("Rencana", "Plan")}</div>
                      <PlanList steps={s.steps} />
                    </div>
                  </li>
                );
              }
              const Icon = TOOL_ICON[s.name] || Music;
              return (
                <li key={s.id} className={`aic-step is-tool is-${s.status}`}>
                  <span className="dot ic">
                    {s.status === "running" ? <i className="spin" /> : s.status === "error" ? <AlertTriangle size={11} /> : <Icon size={11} />}
                  </span>
                  <div className="aic-step-main">
                    <div className="aic-step-title">
                      <span className="lb">{s.label}</span>
                      {s.detail && <span className="aic-chip" title={s.detail}>{s.detail}</span>}
                    </div>
                    {s.summary && <div className="aic-step-sum">{s.summary}</div>}
                    {s.items?.length > 0 && <StepItems items={s.items} tt={tt} />}
                  </div>
                </li>
              );
            })}
            {working && turn.steps.length === 0 && (
              <li className="aic-step is-thought"><span className="dot" /><div className="aic-thought is-idle">{tt("Memahami permintaanmu…", "Reading your request…")}</div></li>
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}

function AssistantTurn({ turn, tt, onCopy, copied, onRetry, canRetry }) {
  const meta = turn.errorMeta;
  return (
    <div className="aic-turn">
      <ThinkingBlock turn={turn} tt={tt} />
      {turn.status === "error" && (
        <div className="aic-error">
          <AlertTriangle size={14} />
          <div className="aic-error-main">
            <div className="aic-error-msg">{turn.error}</div>
            {meta?.hint && <div className="aic-error-hint">{meta.hint}</div>}
            {(meta?.status > 0 || meta?.round > 0) && (
              <div className="aic-error-meta">
                {meta.status > 0 ? `HTTP ${meta.status}` : tt("jaringan", "network")}
                {" · "}{tt("ronde", "round")} {(meta.round ?? 0) + 1}
              </div>
            )}
            {canRetry && turn.resume && (
              <button type="button" className="aic-retry" onClick={() => onRetry(turn)}>
                {tt("Coba lagi", "Try again")}
              </button>
            )}
          </div>
        </div>
      )}
      {turn.text && <div className="aic-answer">{renderMarkdown(turn.text)}</div>}
      {turn.text && turn.status === "done" && (
        <div className="aic-actions">
          <button type="button" className="aic-act" onClick={() => onCopy(turn)} aria-label={tt("Salin", "Copy")} title={tt("Salin", "Copy")}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
      )}
    </div>
  );
}

const QUICK_PROMPTS = [
  { id: "research", icon: Globe, tid: "Riset lagu galau Indonesia yang lagi hits, terus buatin playlist-nya", ten: "Research the best sad Indonesian songs right now and build me a playlist" },
  { id: "artist", icon: ListMusic, tid: "Buatin playlist 20 lagu terbaik Idgitaf", ten: "Make a 20-song playlist of Idgitaf's best" },
  { id: "mood", icon: Music, tid: "Rekomendasiin lagu buat santai malam ini", ten: "Recommend chill songs for tonight" },
  { id: "list", icon: Search, tid: "Lihat playlist aku apa aja", ten: "Show me my playlists" },
];

const CLOSE_MS = 220;

/* =====================================================================
 *  Widget utama
 * ===================================================================== */
export function AiAssistantWidget() {
  const { settings, authUser } = useUI();
  const player = usePlayer();

  // --- state buka/tutup -------------------------------------------------
  // `open`    : niat user (dipakai FAB, fokus, badge)
  // `mounted` : panel ada di DOM
  // `shown`   : kelas .is-open (memicu transisi masuk/keluar)
  // Semua diubah di SATU event handler -> React 18 menggabungnya jadi satu render,
  // jadi tidak ada frame di mana panel hilang lalu muncul lagi (penyebab glitch lama).
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const unmountTimer = useRef(null);

  const openPanel = useCallback(() => {
    clearTimeout(unmountTimer.current);
    setOpen(true);
    setMounted(true);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    setShown(false);
    clearTimeout(unmountTimer.current);
    unmountTimer.current = setTimeout(() => setMounted(false), CLOSE_MS + 40);
  }, []);

  // Dua frame setelah mount baru nyalakan .is-open, supaya transisi masuk benar-benar berjalan.
  useEffect(() => {
    if (!open || !mounted) return undefined;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [open, mounted]);

  useEffect(() => () => clearTimeout(unmountTimer.current), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") closePanel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closePanel]);

  // --- chat -------------------------------------------------------------
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chat, setChat] = useState([]);
  const [unread, setUnread] = useState(0);
  const [copiedId, setCopiedId] = useState(null);
  const historyRef = useRef([]);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const stickRef = useRef(true);
  const openRef = useRef(false);
  openRef.current = open;

  const en = settings.language === "en";
  const tt = (id, us) => (en ? us : id);

  // Selalu pakai versi terbaru fungsi player walau proses AI berjalan lama (multi-ronde).
  const liveRef = useRef(player);
  liveRef.current = player;

  useEffect(() => {
    if (open) { setUnread(0); inputRef.current?.focus(); }
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [chat, mounted]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input, mounted]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
  };

  const patchTurn = (turnId, fn) =>
    setChat((c) => c.map((m) => (m.id === turnId ? fn(m) : m)));

  const applyEvent = (turnId, ev) => {
    if (ev.type === "thought") {
      patchTurn(turnId, (m) => ({ ...m, steps: [...m.steps, { kind: "thought", id: uid(), text: ev.text }] }));
    } else if (ev.type === "tool_start") {
      patchTurn(turnId, (m) => ({
        ...m,
        steps: [...m.steps, { kind: "tool", id: ev.id, name: ev.name, label: ev.label, detail: ev.detail, status: "running" }],
      }));
    } else if (ev.type === "tool_progress") {
      patchTurn(turnId, (m) => ({
        ...m,
        steps: m.steps.map((s) => (s.id === ev.id ? { ...s, items: ev.items, summary: ev.summary ?? s.summary } : s)),
      }));
    } else if (ev.type === "tool_end") {
      patchTurn(turnId, (m) => ({
        ...m,
        steps: m.steps.map((s) =>
          s.id === ev.id ? { ...s, status: ev.status, summary: ev.summary, items: ev.items ?? s.items } : s),
      }));
    } else if (ev.type === "plan") {
      patchTurn(turnId, (m) => {
        const idx = m.steps.findIndex((s) => s.kind === "plan");
        if (idx === -1) return { ...m, steps: [...m.steps, { kind: "plan", id: uid(), steps: ev.steps }] };
        const steps = m.steps.slice();
        steps[idx] = { ...steps[idx], steps: ev.steps };
        return { ...m, steps };
      });
    }
  };

  // Rapikan langkah yang menggantung saat giliran berakhir:
  //  - sukses  : tool "running" -> ok, checklist rencana -> semua selesai
  //  - stop/err: tool "running" -> error, item rencana "sedang dikerjakan" -> pending
  const settleTurn = (m, outcome) => ({
    ...m,
    steps: m.steps.map((s) => {
      if (s.kind === "tool" && s.status === "running") return { ...s, status: outcome === "done" ? "ok" : "error" };
      if (s.kind === "plan") {
        return {
          ...s,
          steps: s.steps.map((p) =>
            outcome === "done" ? { ...p, status: "done" } : p.status === "in_progress" ? { ...p, status: "pending" } : p),
        };
      }
      return s;
    }),
  });

  const sendText = async (raw) => {
    const text = (raw || "").trim();
    if (!text || sending) return;
    const now = Date.now();
    const userMsg = { id: uid(), role: "user", text };
    stickRef.current = true;
    setInput("");

    if (!authUser) {
      setChat((c) => [...c, userMsg, {
        id: uid(), role: "assistant", status: "done", steps: [], startedAt: now, endedAt: now,
        text: tt("Login dulu ya buat pakai fitur ini (misalnya bikin playlist).", "Please log in first to use this (e.g. creating playlists)."),
      }]);
      return;
    }

    const turnId = uid();
    setChat((c) => [...c, userMsg, { id: turnId, role: "assistant", status: "working", steps: [], text: "", startedAt: now }]);
    await runTurn(turnId, text, historyRef.current);
  };

  // Jalankan (atau lanjutkan) satu giliran AI. userText null = lanjutkan dari riwayat parsial.
  const runTurn = async (turnId, userText, baseHistory) => {
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const L = liveRef;
    const ctx = {
      search: Api.search,
      get playlists() { return L.current.playlists; },
      get liked() { return L.current.liked; },
      get upNext() { return L.current.upNext; },
      createPlaylist: (...a) => L.current.createPlaylist(...a),
      addToPlaylist: (...a) => L.current.addToPlaylist(...a),
      playSingle: (...a) => L.current.playSingle(...a),
      playList: (...a) => L.current.playList(...a),
      deletePlaylist: (...a) => L.current.deletePlaylist(...a),
      updatePlaylistMeta: (...a) => L.current.updatePlaylistMeta(...a),
      removeFromPlaylist: (...a) => L.current.removeFromPlaylist(...a),
      toggleLike: (...a) => L.current.toggleLike(...a),
      addToQueueEnd: (...a) => L.current.addToQueueEnd(...a),
      playNextInQueue: (...a) => L.current.playNextInQueue(...a),
      removeFromQueue: (...a) => L.current.removeFromQueue(...a),
      setPlaylistDetail: (...a) => L.current.setPlaylistDetail?.(...a),
      refreshPlaylists: (...a) => L.current.refreshPlaylists?.(...a),
    };

    try {
      const { text: reply, history } = await runAiAssistantTurn(userText, baseHistory, ctx, {
        signal: controller.signal,
        lang: en ? "en" : "id",
        onEvent: (ev) => applyEvent(turnId, ev),
      });
      historyRef.current = history;
      patchTurn(turnId, (m) => ({ ...settleTurn(m, "done"), status: "done", text: reply, error: undefined, errorMeta: undefined, resume: undefined, endedAt: Date.now() }));
      if (!openRef.current) setUnread((n) => n + 1);
    } catch (err) {
      if (err?.name === "AbortError") {
        patchTurn(turnId, (m) => ({ ...settleTurn(m, "stop"), status: "stopped", endedAt: Date.now() }));
      } else {
        patchTurn(turnId, (m) => ({
          ...settleTurn(m, "stop"), status: "error", endedAt: Date.now(),
          error: err?.message || tt("Terjadi kesalahan.", "Something went wrong."),
          errorMeta: { status: err?.status || 0, round: err?.round || 0, hint: err?.hint || "" },
          resume: err?.history || null, // riwayat parsial -> "Coba lagi" melanjutkan, bukan mengulang riset
        }));
        if (!openRef.current) setUnread((n) => n + 1);
      }
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  };

  const retryTurn = (turn) => {
    if (sending || !turn.resume) return;
    stickRef.current = true;
    patchTurn(turn.id, (m) => ({ ...m, status: "working", error: undefined, errorMeta: undefined, endedAt: undefined, startedAt: Date.now() - (((m.endedAt || Date.now()) - m.startedAt)) }));
    runTurn(turn.id, null, turn.resume);
  };

  const send = () => sendText(input);
  const stop = () => abortRef.current?.abort();

  const resetChat = () => {
    abortRef.current?.abort();
    setChat([]);
    historyRef.current = [];
  };

  const copyTurn = (turn) => {
    navigator.clipboard?.writeText(turn.text).then(() => {
      setCopiedId(turn.id);
      setTimeout(() => setCopiedId((v) => (v === turn.id ? null : v)), 1500);
    }).catch(() => {});
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!sending) send();
    }
  };

  return (
    <>
      <div className="aivy-ai-fab-wrap">
        <button className={`aivy-ai-fab ${open ? "is-open" : ""}`} onClick={() => (open ? closePanel() : openPanel())} aria-label="AI Assistant" aria-expanded={open}>
          <Sparkles size={20} />
        </button>
        {!open && unread > 0 && <span className="aivy-ai-badge">{unread > 9 ? "9+" : unread}</span>}
      </div>

      {mounted && (
        <div className={`aivy-ai-panel aic${shown ? " is-open" : ""}`} role="dialog" aria-label={tt("Asisten AI", "AI Assistant")}>
          <div className="aic-head">
            <span className="aic-title"><AiSpark size={15} /> {tt("Asisten AI", "AI Assistant")}</span>
            <div className="aic-head-acts">
              {chat.length > 0 && (
                <button className="aic-iconbtn" onClick={resetChat} aria-label={tt("Obrolan baru", "New chat")} title={tt("Obrolan baru", "New chat")}>
                  <Trash2 size={14} />
                </button>
              )}
              <button className="aic-iconbtn" onClick={closePanel} aria-label={tt("Tutup", "Close")}><X size={15} /></button>
            </div>
          </div>

          <div className="aic-body" ref={scrollRef} onScroll={onScroll}>
            {chat.length === 0 && (
              <div className="aic-empty">
                <div className="aic-empty-mark"><AiSpark size={26} /></div>
                <h3>{tt("Mau dengerin apa hari ini?", "What are we listening to today?")}</h3>
                <p>{tt("Aku bisa riset di web, nyocokin lagunya ke katalog, lalu nyusun playlist buat kamu.", "I can research the web, match songs to the catalog and build a playlist for you.")}</p>
                <div className="aic-suggest">
                  {QUICK_PROMPTS.map((q) => (
                    <button key={q.id} onClick={() => sendText(tt(q.tid, q.ten))} disabled={sending}>
                      <q.icon size={14} />
                      <span>{tt(q.tid, q.ten)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chat.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="aic-user"><div className="aic-user-bubble">{m.text}</div></div>
              ) : (
                <AssistantTurn key={m.id} turn={m} tt={tt} onCopy={copyTurn} copied={copiedId === m.id} onRetry={retryTurn} canRetry={!sending} />
              )
            )}
          </div>

          <div className="aic-composer-wrap">
            <div className="aic-composer">
              <textarea
                ref={inputRef}
                className="aic-input"
                rows={1}
                value={input}
                placeholder={tt("Minta AI riset & bikinin playlist…", "Ask the AI to research & build a playlist…")}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
              />
              {sending ? (
                <button className="aic-send is-stop" onClick={stop} aria-label={tt("Hentikan", "Stop")} title={tt("Hentikan", "Stop")}>
                  <Square size={12} fill="currentColor" />
                </button>
              ) : (
                <button className="aic-send" onClick={send} disabled={!input.trim()} aria-label={tt("Kirim", "Send")}>
                  <ArrowUp size={16} strokeWidth={2.6} />
                </button>
              )}
            </div>
            <div className="aic-foot">{tt("AI bisa salah. Cek lagi lagu yang masuk playlist.", "AI can make mistakes. Double-check the songs it adds.")}</div>
          </div>
        </div>
      )}
    </>
  );
}
