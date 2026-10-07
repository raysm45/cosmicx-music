import React, { useState, useEffect } from "react";
import { Users, Lock, Globe, Plus, LogIn, Play, Search as SearchIcon, Copy, Share2, Pause, SkipForward, Hash, ChevronDown } from "lucide-react";
import { usePlayer, useUI } from "../context.jsx";
import { useRouter, Link } from "../router.jsx";
import { TrackRow, ViewLoading, RoomChat, Avatar } from "../components.jsx";
import { SmartCover } from "../lib/brand.jsx";
import { relativeTime } from "../lib/utils.js";
import { Api } from "../lib/api.js";

export function RoomLobbyPage() {
  const { authUser, login, settings, t } = useUI();
  const { publicRooms, refreshPublicRooms, createRoom, joinRoom } = usePlayer();
  const { navigate } = useRouter();

  const [openPanel, setOpenPanel] = useState(null);
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(settings.roomVisibilityDefault !== "private");
  const [password, setPassword] = useState("");
  const [hostOnlyControl, setHostOnlyControl] = useState(!!settings.hostOnlyControlDefault);
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    refreshPublicRooms();
    const iv = setInterval(refreshPublicRooms, 8000);
    return () => clearInterval(iv);
  }, [refreshPublicRooms]);

  const handleCreate = async () => {
    setCreating(true);
    const room = await createRoom({ name: name.trim() || t("roomNameDefault"), isPublic, password: password || undefined, hostOnlyControl });
    setCreating(false);
    if (room) navigate("room", { params: { id: room.id } });
  };

  const handleJoin = async (id, needsPassword) => {
    setJoining(true);
    const room = await joinRoom(id, needsPassword ? joinPassword : undefined);
    setJoining(false);
    if (room) navigate("room", { params: { id: room.id } });
  };

  if (!authUser) {
    return (
      <div className="aivy-empty" style={{ paddingTop: 80 }}>
        <Users size={38} color="var(--ink-faint)" />
        <div className="title">{t("loginForRooms")}</div>
        <div className="sub">{t("loginForRoomsSub")}</div>
        <button className="aivy-btn-primary" onClick={login} style={{ marginTop: 6 }}>{t("navLoginDiscord")}</button>
      </div>
    );
  }

  return (
    <div className="aivy-view-enter">
      <div className="aivy-greet" style={{ paddingBottom: 6 }}>
        <h1 className="font-display" style={{ fontSize: "clamp(22px,3vw,28px)" }}>{t("listenTogether")}</h1>
        <p>{t("listenTogetherSub")}</p>
      </div>

      <div className="aivy-room-actions" style={{ marginTop: 18 }}>
        <div className={`aivy-room-tile ${openPanel === "create" ? "open" : ""}`}>
          <button type="button" className="tile-head" onClick={() => setOpenPanel(openPanel === "create" ? null : "create")}>
            <span className="tile-icon"><Plus size={18} /></span>
            <span className="tile-label">
              <span className="t">{t("createRoom")}</span>
              <span className="s">{t("publicRoomHint")}</span>
            </span>
            <ChevronDown size={18} className="chev" />
          </button>
          {openPanel === "create" && (
            <div className="tile-body">
              <input className="aivy-input" placeholder={t("roomNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              <input className="aivy-input" type="password" placeholder={t("passwordOptional")} value={password} onChange={(e) => setPassword(e.target.value)} />
              <div className="chip-row">
                <button type="button" className={`chip ${isPublic ? "on" : ""}`} onClick={() => setIsPublic(!isPublic)}>{isPublic ? <Globe size={13} /> : <Lock size={13} />} {isPublic ? t("public") : t("private")}</button>
                <button type="button" className={`chip ${hostOnlyControl ? "on" : ""}`} onClick={() => setHostOnlyControl(!hostOnlyControl)}>{t("hostOnlyShort")}</button>
              </div>
              <button className="aivy-btn-primary" disabled={creating} onClick={handleCreate}>{creating ? t("creatingRoom") : t("createRoomBtn")}</button>
            </div>
          )}
        </div>

        <div className={`aivy-room-tile ${openPanel === "join" ? "open" : ""}`}>
          <button type="button" className="tile-head" onClick={() => setOpenPanel(openPanel === "join" ? null : "join")}>
            <span className="tile-icon alt"><Hash size={18} /></span>
            <span className="tile-label">
              <span className="t">{t("joinRoom")}</span>
              <span className="s">{t("joinRoomSub")}</span>
            </span>
            <ChevronDown size={18} className="chev" />
          </button>
          {openPanel === "join" && (
            <div className="tile-body">
              <input
                className="aivy-input code-input"
                placeholder="ABC123"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={8}
                onKeyDown={(e) => { if (e.key === "Enter" && joinCode.trim()) handleJoin(joinCode.trim(), true); }}
              />
              <input className="aivy-input" type="password" placeholder={t("passwordIfAny")} value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} />
              <button className="aivy-btn-primary" disabled={joining || !joinCode.trim()} onClick={() => handleJoin(joinCode.trim(), true)}><LogIn size={15} /> {t("join")}</button>
            </div>
          )}
        </div>
      </div>

      <section className="aivy-section">
        <div className="aivy-section-head"><h2 className="aivy-section-title">{t("activePublicRooms")}</h2></div>
        {publicRooms.length === 0 ? (
          <div className="aivy-empty" style={{ paddingTop: 20 }}><div className="sub">{t("noPublicRooms")}</div></div>
        ) : (
          <div className="aivy-public-room-list">
            {publicRooms.map((r) => (
              <div key={r.id} className="aivy-public-room-row">
                <div className="info">
                  <div className="name">{r.name} {r.hasPassword && <Lock size={12} />}</div>
                  <div className="eyebrow">
                    {r.hostUsername ? `${t("by")} ${r.hostUsername} \u00b7 ` : ""}{r.memberCount}{` ${t("listeningCount")} \u00b7 ${t("createdAt")} ${relativeTime(r.createdAt)}`}
                  </div>
                  {r.nowPlayingTitle && <div className="nowplaying"><Play size={11} /> {r.nowPlayingTitle}</div>}
                </div>
                <button className="aivy-btn-ghost" onClick={() => handleJoin(r.id, r.hasPassword)}>{t("join")}</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function RoomPage() {
  const { params, navigate } = useRouter();
  const { room, joinRoom, addToQueueEnd, togglePlay, next, isPlaying, voteSkip } = usePlayer();
  const { authUser, t, pushToast } = useUI();
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState("queue");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [voted, setVoted] = useState(false);
  const [skipPulsing, setSkipPulsing] = useState(false);

  useEffect(() => {
    if (!authUser) return;
    if (room && room.id === params.id) { setChecked(true); return; }
    joinRoom(params.id, undefined).then((r) => { if (!r) navigate("roomLobby", { replace: true }); setChecked(true); });
  }, [params.id, authUser]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const timer = setTimeout(() => { Api.search(search).then(setResults).catch(() => {}); }, 280);
    return () => clearTimeout(timer);
  }, [search]);

  const currentIndex = room?.currentIndex;
  useEffect(() => { setVoted(false); }, [currentIndex, params.id]);

  if (!authUser) { navigate("roomLobby", { replace: true }); return null; }
  if (!checked || !room) return <ViewLoading />;

  const roomTrack = room.currentIndex >= 0 ? room.queue?.[room.currentIndex] || null : null;
  const isHost = authUser && room.hostId === authUser.id;
  const controlLocked = !!room.hostOnlyControl && !isHost;
  const skipVote = room.skipVote || { count: 0, total: room.members?.length || 1, needed: 1 };
  const members = room.members || [];

  const copyCode = () => {
    navigator.clipboard?.writeText(room.id);
    pushToast(t("roomCodeCopied"));
  };
  const shareRoom = async () => {
    const text = `${t("shareRoomText")} ${room.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: room.name, text, url: window.location.href }); return; } catch { }
    }
    navigator.clipboard?.writeText(`${text} — ${window.location.href}`);
    pushToast(t("roomCodeCopied"));
  };
  const handleSkip = async () => {
    if (!controlLocked) { next(false); return; }
    if (voted) return;
    const res = await voteSkip();
    if (res?.ok) { setVoted(true); pushToast(t("skipVotedToast")); }
  };

  return (
    <div className="aivy-view-enter aivy-room2">
      <header className="aivy-room2-head">
        <div className="row1">
          <div className="min">
            <div className="name font-display">{room.name}</div>
            <button className="code-chip font-mono" onClick={copyCode} title={t("copyRoomCode")} aria-label={t("copyRoomCode")}>
              {room.id} <Copy size={11} />
            </button>
          </div>
          <div className="acts">
            <button className="aivy-icon-btn" onClick={shareRoom} aria-label={t("shareRoom")} title={t("shareRoom")}><Share2 size={16} /></button>
            <button className="aivy-btn-ghost sm" onClick={() => navigate("roomLobby")}><LogIn size={14} style={{ transform: "rotate(180deg)" }} /> {t("leave")}</button>
          </div>
        </div>
        <div className="members-row">
          <span className="stack">
            {members.slice(0, 5).map((m) => (
              <Avatar key={m.id} user={m} title={m.username} />
            ))}
            {members.length > 5 && <span className="aivy-avatar more">+{members.length - 5}</span>}
          </span>
          <span className="count">{members.length} {t("membersCount")}{room.isPublic ? "" : " · 🔒"}</span>
        </div>
      </header>

      <section className={`aivy-room2-now ${roomTrack ? "has-track" : ""}`}>
        {roomTrack ? (
          <>
            <div className="cover">
              <SmartCover src={roomTrack.cover} seed={roomTrack.id + roomTrack.title} size={160} radius={10} style={{ width: "100%", height: "100%" }} />
            </div>
            <div className="meta">
              <span className="eyebrow">{t("nowPlaying")}</span>
              <div className="t">{roomTrack.title}</div>
              <div className="a">
                {roomTrack.artist?.name || roomTrack.artist || "\u2014"}
                {roomTrack.addedBy?.username ? ` · ${t("by")} ${roomTrack.addedBy.username}` : ""}
              </div>
            </div>
            <div className="side">
              <span className={`eq2 ${isPlaying ? "on" : ""}`} aria-hidden="true"><i /><i /><i /></span>
              <div className="ctrl">
                <button className="aivy-icon-btn" onClick={togglePlay} aria-label={isPlaying ? t("pause") : t("play")}>
                  {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                </button>
                <button className={`aivy-icon-btn skip skip-next ${voted ? "voted" : ""} ${skipPulsing ? "is-pulsing" : ""}`}
                  onClick={() => { handleSkip(); setSkipPulsing(true); }}
                  onAnimationEnd={() => setSkipPulsing(false)}
                  aria-label={controlLocked ? t("voteSkipLabel") : t("next")}
                  title={controlLocked ? `${t("voteSkipLabel")} (${skipVote.count}/${skipVote.total || skipVote.needed})` : t("next")}>
                  <SkipForward size={17} fill="currentColor" />
                  {controlLocked && <span className="vote-badge">{skipVote.count}/{skipVote.total}</span>}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty">{t("nothingPlaying")}</div>
        )}
      </section>

      <div className="aivy-room2-tabs">
        <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>{t("tabQueue")}</button>
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>{t("tabChat")}</button>
      </div>

      {tab === "queue" ? (
        <div className="aivy-room2-tabbody">
          <div className="aivy-search-box" style={{ maxWidth: 460 }}>
            <SearchIcon size={16} />
            <input className="aivy-input" placeholder={t("searchToAdd")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {results.length > 0 && (
            <div className="aivy-room2-results">
              {results.slice(0, 6).map((r) => (
                <div key={r.videoId} className="aivy-row">
                  <div className="meta">
                    <span className="t">{r.title}</span>
                    {r.artist && <span className="a">{typeof r.artist === "string" ? r.artist : r.artist.name}</span>}
                  </div>
                  <button className="aivy-icon-btn sm" onClick={() => { addToQueueEnd({ id: r.videoId, videoId: r.videoId, title: r.title, artist: typeof r.artist === "string" ? { name: r.artist } : (r.artist || null), artists: r.artists || null, album: r.album || null, cover: r.cover || r.thumbnail, duration: r.duration }); setSearch(""); setResults([]); }} aria-label={t("menuAddQueue")}><Plus size={16} /></button>
                </div>
              ))}
            </div>
          )}
          <section className="aivy-section" style={{ marginTop: 18 }}>
            <div className="aivy-section-head"><h2 className="aivy-section-title">{t("roomQueue")}</h2></div>
            {room.queue?.length > 0 ? (
              <div>
                {room.queue.map((track, i) => (
                  <TrackRow
                    key={track.id + i}
                    track={track}
                    index={i}
                    list={room.queue}
                    showIndex
                    queueMode="queue"
                    note={track.addedBy?.username ? `${t("by")} ${track.addedBy.username}` : null}
                  />
                ))}
              </div>
            ) : (
              <div className="aivy-empty"><div className="sub">{t("roomQueueEmpty")}</div></div>
            )}
          </section>
        </div>
      ) : (
        <div className="aivy-room2-tabbody chat">
          <div className="aivy-room-chat-standalone tall">
            <RoomChat />
          </div>
        </div>
      )}
    </div>
  );
              }
