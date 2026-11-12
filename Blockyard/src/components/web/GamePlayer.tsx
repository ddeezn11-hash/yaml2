"use client";

import { useEffect, useRef, useState } from "react";
import {
  Heart,
  LogOut,
  Menu,
  MessageSquare,
  RotateCcw,
  Send,
  Shield,
  Skull,
  Terminal,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { StudioEngine } from "@/lib/studio/engine";
import { ADMIN_COMMANDS, PlayController, type GameHud } from "@/lib/studio/playmode";
import { GameNetClient } from "@/lib/studio/gamenet";
import { InventoryHud } from "@/components/game/InventoryHud";
import { GAMES } from "@/lib/studio/webdata";
import { useWeb } from "@/lib/studio/webstore";
import { usePlatform } from "@/lib/studio/platform";
import type { UIObjectData } from "@/lib/studio/types";
import { RuntimeGui } from "@/components/studio/RuntimeGui";

/* ------------------------------------------------------------------ */
/* Full-screen game client — like pressing Play on roblox.com.        */
/* Owns its own engine + play controller; never touches the studio    */
/* autosave.                                                           */
/* ------------------------------------------------------------------ */

interface ChatLine {
  id: number;
  name: string;
  text: string;
  system?: boolean;
  ok?: boolean;
}

const LOADING_TIPS = [
  "Press 1-9 to equip tools — B opens your whole Backpack",
  "Click while holding the sword to slash",
  "Backspace drops the held tool — pick it back up with E",
  "The gravity coil gives you huge, floaty jumps",
  "Press / to chat with everyone on the server",
  "Health regenerates 1% per second after 5s without damage",
  "Press ESC for the menu — Reset Character respawns you",
];

let chatSeq = 1;

export default function GamePlayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StudioEngine | null>(null);
  const playRef = useRef<PlayController | null>(null);
  const netRef = useRef<GameNetClient | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const consoleInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const conScrollRef = useRef<HTMLDivElement>(null);
  const prevHealth = useRef<number | null>(null);
  const lockedOnce = useRef(false);
  const connectOptsRef = useRef<{ experienceId: string; username: string; displayName: string; spawn: { x: number; y: number; z: number; yaw: number } } | null>(null);
  const startLocalRef = useRef<(() => void) | null>(null);

  const leaveGame = useWeb((s) => s.leaveGame);
  const session = useWeb((s) => s.session);
  const pushRecentlyPlayed = useWeb((s) => s.pushRecentlyPlayed);

  const [meta, setMeta] = useState<{ name: string; creator: string; admin: boolean }>({ name: "Experience", creator: "", admin: false });
  const [loading, setLoading] = useState(true);
  const [hud, setHud] = useState<GameHud | null>(null);
  const [runtimeUi, setRuntimeUi] = useState<UIObjectData[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [pointerLocked, setPointerLocked] = useState(false);
  const [escOpen, setEscOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [conOut, setConOut] = useState<{ id: number; ok: boolean; text: string }[]>([]);
  const [cmdListOpen, setCmdListOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const [tip] = useState(() => LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);
  /* online multiplayer state */
  const [netStatus, setNetStatus] = useState<"connecting" | "online" | "local">("connecting");
  const [netDetail, setNetDetail] = useState("Connecting to game server…");
  const [offlinePick, setOfflinePick] = useState(false);
  const [onlineRoster, setOnlineRoster] = useState<{ id: string; name: string }[]>([]);
  const [retryTick, setRetryTick] = useState(0);

  const playerName = session?.displayName || session?.username || "Player";

  const addChat = (name: string, text: string, system = false, ok?: boolean) =>
    setChat((c) => [...c.slice(-60), { id: chatSeq++, name, text, system, ok }]);

  /* ------------------------------ boot ------------------------------ */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const join = useWeb.getState().consumeJoin();
    if (!join) {
      useWeb.getState().leaveGame();
      return;
    }

    const engine = new StudioEngine(canvas, {
      onLog: (level, text) => {
        if (level === "error" || level === "warn") addChat("", text, true);
      },
      onStats: () => {},
      onPlayChanged: () => {},
    });
    engineRef.current = engine;

    if (join.placeData) {
      engine.loadState({ ...join.placeData, name: join.name }, false);
    } else {
      engine.loadTemplateOnly(join.templateId, join.name);
    }
    setRuntimeUi(engine.getUiObjects());

    const admin = !!session?.isAdmin || (!!session && join.creator === session.username);
    const gameName = join.name;

    const play = new PlayController(engine, {
      onHud: (h) => setHud(h),
      onBotChat: (botName, text) => addChat(botName, text),
      onPointerLock: (locked) => {
        setPointerLocked(locked);
        if (locked) {
          lockedOnce.current = true;
          setEscOpen(false);
        } else if (lockedOnce.current && playRef.current?.active) {
          setEscOpen(true);
        }
      },
      onLog: (level, text) => {
        if (level === "success" || level === "info") addChat("", text, true);
      },
    });
    playRef.current = play;
    engine.playController = play;

    /* -------------------- online multiplayer boot -------------------- */
    const spawn = engine.spawnPoint();
    const connectOpts = {
      experienceId: join.gameId,
      username: session?.username ?? "Guest",
      displayName: playerName,
      spawn: { x: spawn[0], y: spawn[1], z: spawn[2], yaw: 0 },
    };
    connectOptsRef.current = connectOpts;

    let started = false;
    // Batch bursts of join events during a busy server startup. This avoids
    // hundreds of React state updates and chat rows arriving back-to-back.
    const pendingJoins = new Map<string, { id: string; name: string }>();
    let joinFlushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushPendingJoins = () => {
      joinFlushTimer = null;
      const joined = [...pendingJoins.values()];
      pendingJoins.clear();
      if (!joined.length) return;
      setOnlineRoster((current) => {
        const next = new Map<string, { id: string; name: string }>();
        for (const entry of current) next.set(entry.id, entry);
        for (const entry of joined) next.set(entry.id, entry);
        return [...next.values()];
      });
      addChat("", joined.length === 1
        ? `${joined[0].name} joined the server.`
        : `${joined.length} players joined the server.`, true);
    };
    const startOnline = () => {
      if (started) return;
      started = true;
      // forward the 15Hz state packets to the game server
      engine.netSend = (packet) => {
        netRef.current?.send(packet);
      };
      // online sessions never spawn demo bots — only real players
      play.start(playerName, { admin, bots: 0 });
      setOfflinePick(false);
      setNetStatus("online");
      setLoading(false);
    };
    const startLocal = () => {
      if (started) return;
      started = true;
      netRef.current?.disconnect(true);
      play.start(playerName, { admin, bots: 4 });
      setOfflinePick(false);
      setNetStatus("local");
      setNetDetail("Local Play — offline demo bots");
      setLoading(false);
      addChat("", "Playing offline (Local Play) with demo bots — no server connection.", true);
    };
    startLocalRef.current = startLocal;

    const net = new GameNetClient({
      onStatus: (status, detail) => {
        setNetDetail(detail);
        if (status === "offline") {
          playRef.current?.clearRemotes();
          setOnlineRoster([]);
        }
        if (status === "offline" && !started) {
          clearTimeout(failTimer);
          setOfflinePick(true);
          setLoading(false);
        } else if (status === "offline" && started) {
          addChat("", "Lost connection to the server — reconnecting…", true);
        }
      },
      onWelcome: (_id, sessionId, players, count) => {
        clearTimeout(failTimer);
        setOfflinePick(false);
        setOnlineRoster(players.map((p) => ({ id: p.id, name: p.name })));
        startOnline();
        addChat("", `Connected — session ${sessionId.slice(0, 10)} · ${count} player${count === 1 ? "" : "s"} online.`, true);
      },
      onPlayerJoined: (p) => {
        pendingJoins.set(p.id, { id: p.id, name: p.name });
        if (!joinFlushTimer) joinFlushTimer = setTimeout(flushPendingJoins, 250);
      },
      onPlayerLeft: (id, name) => {
        pendingJoins.delete(id);
        playRef.current?.removeRemote(id);
        setOnlineRoster((r) => r.filter((x) => x.id !== id));
        addChat("", `${name} left the server.`, true);
      },
      onSnapshot: (list) => {
        for (const t of list) {
          const info = netRef.current?.players.get(t.id);
          if (info) playRef.current?.upsertRemote(t.id, info.name, info.color, t.x, t.y, t.z, t.yaw);
        }
      },
      onRemoteHidden: (id) => playRef.current?.removeRemote(id),
      onChat: (name, text) => {
        addChat(name, text);
        usePlatform.getState().logInGameMessage(name, text, gameName);
      },
      onError: (message) => addChat("", message, true, false),
      onKicked: (reason) => {
        addChat("", `Disconnected by the server: ${reason}`, true, false);
        setOfflinePick(true);
      },
    });
    netRef.current = net;
    void net.connect(connectOpts);

    // if the server never answers, offer Local Play (never pretend it's online)
    const failTimer = setTimeout(() => {
      if (!started) {
        setOfflinePick(true);
        setLoading(false);
      }
    }, 5000);

    setMeta({ name: join.name, creator: join.creatorDisplay || join.creator, admin });
    usePlatform.getState().recordVisit(join.gameId);
    if (GAMES.some((g) => g.id === join.gameId)) pushRecentlyPlayed(join.gameId);

    addChat("", `Welcome to ${join.name}! By ${join.creatorDisplay || join.creator}`, true);
    addChat("", "Press / to chat · 1-9 to equip tools · B for your Backpack", true);
    if (admin) addChat("", "You have OP commands here — press ~ for the console, or type :cmds in chat", true, true);

    const resize = () => engine.resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    window.addEventListener("resize", resize);
    resize();

    return () => {
      clearTimeout(failTimer);
      if (joinFlushTimer) clearTimeout(joinFlushTimer);
      pendingJoins.clear();
      ro.disconnect();
      window.removeEventListener("resize", resize);
      net.disconnect(true);
      play.stop();
      engine.dispose();
      engineRef.current = null;
      playRef.current = null;
      netRef.current = null;
    };
  }, []);

  /* --------------------------- chat scroll --------------------------- */
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
  }, [chat]);

  /* ----------------------- server retry (picker) ---------------------- */
  useEffect(() => {
    if (retryTick === 0) return;
    const opts = connectOptsRef.current;
    if (!opts || netRef.current?.connected) return;
    setOfflinePick(false);
    setNetStatus("connecting");
    setNetDetail("Reconnecting…");
    setLoading(true);
    void netRef.current?.connect(opts);
  }, [retryTick]);
  useEffect(() => {
    conScrollRef.current?.scrollTo({ top: conScrollRef.current.scrollHeight });
  }, [conOut]);

  /* ------------------------- damage flash ---------------------------- */
  useEffect(() => {
    if (!hud) return;
    if (prevHealth.current !== null && hud.health < prevHealth.current - 0.5 && !hud.dead) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 260);
      prevHealth.current = hud.health;
      return () => clearTimeout(t);
    }
    prevHealth.current = hud.health;
  }, [hud]);

  /* ------------------------- global keys ----------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        chatInputRef.current?.focus();
      }
      if ((e.key === "`" || e.key === "~") && !typing && meta.admin) {
        e.preventDefault();
        setConsoleOpen((v) => !v);
        if (!consoleOpen) setTimeout(() => consoleInputRef.current?.focus(), 30);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [meta.admin, consoleOpen]);

  /* ---------------------------- actions ------------------------------ */

  const runCmd = (line: string) => {
    const res = playRef.current?.runCommand(line);
    if (!res) return;
    setConOut((o) => [...o.slice(-80), { id: chatSeq++, ok: res.ok, text: res.message }]);
    addChat("", res.message, true, res.ok);
    if (res.action === "clear-chat") {
      setChat([]);
      setConOut([]);
    }
  };

  const sendChat = () => {
    const text = draft.trim().slice(0, 200);
    setDraft("");
    if (!text) {
      chatInputRef.current?.blur();
      return;
    }
    if (text.startsWith(":") || text.startsWith(";")) {
      runCmd(text);
    } else if (/^\/e\s+\S/i.test(text)) {
      // "/e name" — chat emotes, available to every player
      const res = playRef.current?.playEmote(text.replace(/^\/e\s+/i, ""));
      if (res) addChat("", res.message, true, res.ok);
    } else if (netRef.current?.connected) {
      // online: the server attributes + relays the message to everyone else
      const sent = netRef.current.sendChat(text);
      if (sent) {
        addChat(playerName, text);
        usePlatform.getState().logInGameMessage(playerName, text, meta.name);
      } else {
        addChat("", "Message not sent — connection lost.", true, false);
      }
    } else {
      addChat(playerName, text);
      usePlatform.getState().logInGameMessage(playerName, text, meta.name);
    }
    chatInputRef.current?.blur();
  };

  const equip = (uid: string | null) => playRef.current?.equipTool(uid);
  const drop = (uid: string) => playRef.current?.dropTool(uid);

  const healthFrac = hud ? Math.max(0, Math.min(1, hud.health / hud.maxHealth)) : 1;
  const healthColor = healthFrac > 0.5 ? "#2ecc71" : healthFrac > 0.25 ? "#f39c12" : "#e74c3c";

  return (
    <div ref={wrapRef} className="fixed inset-0 z-[500] select-none overflow-hidden bg-[#0b0d10]">
      <canvas ref={canvasRef} className="block h-full w-full" />
      <RuntimeGui objects={runtimeUi} />

      {/* ------------------------- loading screen ------------------------- */}
      {loading && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-gradient-to-br from-[#111418] via-[#16211c] to-[#0b0d10]">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-xl border-[3px] border-[#2d3436] border-t-[#75dda4]" />
            <div className="text-[22px] font-extrabold text-white">Joining {meta.name || "experience"}…</div>
            <div className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-[#9aa0a6]">
              {netStatus === "connecting" ? <Wifi size={13} className="animate-pulse text-[#75dda4]" /> : <WifiOff size={13} className="text-[#e8c76a]" />}
              {netDetail}
            </div>
            <div className="mt-2 max-w-[420px] text-[12.5px] text-[#9aa0a6]">Tip: {tip}</div>
          </div>
        </div>
      )}

      {/* ------------------- offline fallback picker --------------------- */}
      {offlinePick && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
          <div className="w-[min(420px,calc(100%-32px))] rounded-2xl border border-white/10 bg-[#14161a] p-5 text-center shadow-2xl">
            <WifiOff size={30} className="mx-auto text-[#e8c76a]" />
            <div className="mt-2 text-[17px] font-extrabold text-white">Can't reach the game server</div>
            <div className="mt-1.5 text-[12px] leading-relaxed text-[#9aa0a6]">
              The multiplayer server isn't answering (it may not be running). Keep retrying, or play this experience offline with demo bots — clearly labeled Local Play, never presented as online.
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setRetryTick((t) => t + 1)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#00b06f] text-[14px] font-bold text-white transition-colors hover:bg-[#009a61]"
              >
                <RotateCcw size={15} /> Retry connection
              </button>
              <button
                type="button"
                onClick={() => {
                  setOfflinePick(false);
                  startLocalRef.current?.();
                }}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 text-[13.5px] font-semibold text-[#e6ecf5] transition-colors hover:bg-white/10"
              >
                <Zap size={15} /> Play offline — Local Play (bots)
              </button>
              <button
                type="button"
                onClick={() => useWeb.getState().leaveGame()}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-semibold text-[#9aa0a6] transition-colors hover:text-white"
              >
                <LogOut size={14} /> Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* ---------------------------- top bar ---------------------------- */}
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEscOpen(true);
                if (document.pointerLockElement) document.exitPointerLock();
              }}
              className="flex h-9 items-center gap-2 rounded-xl border border-white/15 bg-[rgba(18,20,24,.75)] px-3 text-[12px] font-bold text-white backdrop-blur transition-colors hover:bg-[rgba(30,34,40,.9)]"
            >
              <Menu size={15} /> {meta.name}
            </button>
            <span
              className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold backdrop-blur ${
                netStatus === "online"
                  ? "border-[#2c6e49]/60 bg-[rgba(23,64,42,.75)] text-[#8fd3ab]"
                  : "border-[#66551c]/60 bg-[rgba(64,52,18,.75)] text-[#e8c76a]"
              }`}
              title={netStatus === "online" ? netDetail : "Not connected to a server — offline session"}
            >
              {netStatus === "online" ? <Wifi size={13} /> : <WifiOff size={13} />}
              {netStatus === "online" ? `ONLINE · ${onlineRoster.length + 1}` : "LOCAL"}
            </span>
            {hud?.admin && (
              <span className="flex h-9 items-center gap-1.5 rounded-xl border border-[#5a7a2c]/60 bg-[rgba(46,58,26,.75)] px-3 text-[11px] font-bold text-[#c9e88a] backdrop-blur">
                <Shield size={13} /> OP
              </span>
            )}
          </div>

          {/* ------------------- health + leaderboard (top right) ------------ */}
          <div className="absolute right-3 top-3 z-10 w-[240px]">
            {/* health */}
            <div className="mb-2 rounded-xl border border-white/10 bg-[rgba(18,20,24,.72)] p-2.5 backdrop-blur">
              <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-[#9fb0c3]">
                <span className="flex items-center gap-1">
                  <Heart size={11} className="text-[#ff7b7b]" fill="currentColor" /> Health
                </span>
                <span className="text-white">
                  {hud?.god ? "GOD MODE" : `${Math.round(hud?.health ?? 100)} / ${hud?.maxHealth ?? 100}`}
                </span>
              </div>
              <div className="h-[10px] overflow-hidden rounded-full bg-[rgba(255,255,255,.12)]">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{ width: `${(hud?.god ? 1 : healthFrac) * 100}%`, background: hud?.god ? "linear-gradient(90deg,#f1c40f,#fff67b)" : healthColor }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[9.5px] text-[#9aa0a6]">
                <span>Speed {Math.round(hud?.walkSpeed ?? 16)} · Jump {Math.round(hud?.jumpPower ?? 50)}</span>
                {hud?.equipped && <span className="font-bold text-[#8fd3ab]">{hud.backpack.find((t) => t.uid === hud.equipped)?.name}</span>}
              </div>
            </div>

            {/* leaderboard */}
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[rgba(18,20,24,.72)] backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#9fb0c3]">
                <span>Server</span>
                <span>{netStatus === "online" ? `${onlineRoster.length + 1} online` : `${hud?.players.length ?? 1} players`}</span>
              </div>
              <div className="grid grid-cols-[1fr_34px_34px] gap-x-1 px-2.5 py-1 text-[9px] font-bold uppercase text-[#7a8798]">
                <span>Player</span>
                <span className="text-center">KO</span>
                <span className="text-center">W</span>
              </div>
              <div className="max-h-[180px] overflow-y-auto pb-1">
                {hud?.players.map((p) => (
                  <div key={p.name} className={`grid grid-cols-[1fr_34px_34px] items-center gap-x-1 px-2.5 py-[3px] text-[11px] ${p.isBot ? "text-[#c3cdd9]" : "font-bold text-[#8fd3ab]"}`}>
                    <span className="truncate">{p.name}</span>
                    <span className="text-center">{p.kills}</span>
                    <span className="text-center">{p.deaths}</span>
                  </div>
                ))}
                {netStatus === "online" &&
                  onlineRoster.slice(0, 40).map((p) => (
                    <div key={p.id} className="grid grid-cols-[1fr_34px_34px] items-center gap-x-1 px-2.5 py-[3px] text-[11px] text-[#8fd3ab]">
                      <span className="flex items-center gap-1 truncate">
                        <Wifi size={9} className="shrink-0 text-[#5f8f75]" />
                        {p.name}
                      </span>
                      <span className="text-center text-[#7a8798]">–</span>
                      <span className="text-center text-[#7a8798]">–</span>
                    </div>
                  ))}
                {netStatus === "online" && onlineRoster.length > 40 && (
                  <div className="px-2.5 py-1 text-center text-[10px] text-[#8a97a8]">
                    + {onlineRoster.length - 40} more players online
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ----------------- custom inventory (hotbar + BAG grid) ---------------- */}
          {hud && <InventoryHud hud={hud} equip={equip} drop={drop} large />}

          {/* ---------------------------- chat (bottom left) ------------------- */}
          <div className="absolute bottom-3 left-3 z-10 w-[min(360px,calc(100%-180px))]">
            <div ref={chatScrollRef} className="mb-1.5 flex max-h-[168px] flex-col gap-1 overflow-y-auto">
              {chat.map((m) => (
                <div
                  key={m.id}
                  className={`w-fit max-w-full rounded-md px-2.5 py-1 text-[11.5px] leading-snug backdrop-blur ${
                    m.system ? (m.ok === false ? "bg-[rgba(90,30,30,.72)] text-[#ffc9c9]" : m.ok === true ? "bg-[rgba(26,64,42,.72)] text-[#b7f0cd]" : "bg-[rgba(18,20,24,.55)] text-[#aab7c9] italic") : "bg-[rgba(18,20,24,.72)] text-[#e6ecf5]"
                  }`}
                >
                  {m.system ? m.text : <span><span className="font-bold text-[#8fd3ab]">{m.name}: </span>{m.text}</span>}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <MessageSquare size={13} className="shrink-0 text-[#8fa3bd]" />
              <input
                ref={chatInputRef}
                className="h-[34px] flex-1 rounded-lg border border-white/15 bg-[rgba(18,20,24,.8)] px-3 text-[12px] text-white outline-none backdrop-blur placeholder:text-[#7a8798] focus:border-[#75dda4]"
                placeholder="Press / to chat… (:command for OP)"
                value={draft}
                maxLength={200}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") sendChat();
                  if (e.key === "Escape") chatInputRef.current?.blur();
                }}
              />
              <button
                type="button"
                className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg bg-[#75dda4] text-[#0b2418] hover:bg-[#93edb9]"
                onClick={sendChat}
                title="Send"
              >
                <Send size={14} />
              </button>
            </div>
          </div>

          {/* --------------------------- hints (bottom right) ------------------ */}
          <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2">
            {hud?.admin && (
              <button
                type="button"
                onClick={() => {
                  setConsoleOpen((v) => !v);
                  if (!consoleOpen) setTimeout(() => consoleInputRef.current?.focus(), 30);
                }}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-[#5a7a2c]/60 bg-[rgba(46,58,26,.8)] px-3 text-[11.5px] font-bold text-[#c9e88a] backdrop-blur hover:bg-[rgba(58,72,34,.9)]"
                title="Admin command console (~)"
              >
                <Terminal size={14} /> Commands
              </button>
            )}
            <div className="rounded-lg border border-white/10 bg-[rgba(18,20,24,.6)] px-3 py-2 text-right text-[9.5px] leading-relaxed text-[#c4cdd9] backdrop-blur">
              <div><b className="text-white">WASD</b> move · <b className="text-white">SPACE</b> jump · <b className="text-white">SHIFT</b> sprint</div>
              <div><b className="text-white">1-9</b> tools · <b className="text-white">B</b> backpack · <b className="text-white">E</b> pickup</div>
              <div><b className="text-white">Backspace</b> drop · <b className="text-white">V</b> camera · <b className="text-white">R</b> respawn</div>
              <div><b className="text-white">/</b> chat · <b className="text-white">ESC</b> menu</div>
            </div>
          </div>

          {/* ------------------------- damage flash --------------------------- */}
          {flash && <div className="pointer-events-none absolute inset-0 z-20 bg-[rgba(200,30,30,.28)]" />}
          {hud && hud.health / hud.maxHealth <= 0.25 && !hud.dead && !hud.god && (
            <div className="pointer-events-none absolute inset-0 z-20 shadow-[inset_0_0_120px_rgba(180,20,20,.55)]" />
          )}

          {/* ------------------------- death overlay -------------------------- */}
          {hud?.dead && (
            <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-[rgba(60,0,0,.45)] backdrop-blur-[2px]">
              <div className="text-center">
                <Skull size={44} className="mx-auto text-[#ff9b9b]" />
                <div className="mt-2 text-[26px] font-extrabold text-white">You died!</div>
                <div className="mt-1 text-[12.5px] text-[#ffd2d2]">Respawning… (or press R)</div>
              </div>
            </div>
          )}

          {/* ------------------------ click-to-play -------------------------- */}
          {!pointerLocked && !escOpen && !hud?.dead && (
            <div
              className="absolute inset-0 z-20 grid cursor-pointer place-items-center bg-black/35"
              onClick={() => playRef.current?.requestLock()}
            >
              <div className="rounded-2xl border border-white/20 bg-[rgba(18,20,24,.88)] px-8 py-5 text-center shadow-2xl">
                <div className="text-[17px] font-extrabold text-white">Click to play</div>
                <div className="mt-1 text-[11.5px] text-[#b9c6d7]">WASD move · SPACE jump · 1-9 tools · B bag · / chat</div>
              </div>
            </div>
          )}

          {/* --------------------------- ESC menu ----------------------------- */}
          {escOpen && (
            <div className="absolute inset-0 z-40 grid place-items-center bg-black/55 backdrop-blur-sm" onClick={() => setEscOpen(false)}>
              <div className="w-[min(400px,calc(100%-32px))] overflow-hidden rounded-2xl bg-[#14161a] shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-extrabold text-white">{meta.name}</div>
                    <div className="text-[11px] text-[#9aa0a6]">by {meta.creator}</div>
                  </div>
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-full text-[#9aa0a6] hover:bg-white/10 hover:text-white" onClick={() => setEscOpen(false)}>
                    <X size={16} />
                  </button>
                </div>
                <div className="p-4">
                  <button
                    type="button"
                    onClick={() => {
                      setEscOpen(false);
                      playRef.current?.requestLock();
                    }}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#00b06f] text-[14px] font-bold text-white transition-colors hover:bg-[#009a61]"
                  >
                    <Zap size={16} fill="currentColor" /> Resume
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playRef.current?.resetCharacter();
                      setEscOpen(false);
                      playRef.current?.requestLock();
                    }}
                    className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 text-[13.5px] font-semibold text-[#e6ecf5] transition-colors hover:bg-white/10"
                  >
                    <RotateCcw size={15} /> Reset Character
                  </button>
                  <button
                    type="button"
                    onClick={leaveGame}
                    className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#7a2e2e] bg-[rgba(90,30,30,.4)] text-[13.5px] font-semibold text-[#ffb3b3] transition-colors hover:bg-[rgba(110,38,38,.6)]"
                  >
                    <LogOut size={15} /> Leave Game
                  </button>
                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-[10.5px] text-[#9aa0a6]">
                    <span><b className="text-white">WASD</b> move</span>
                    <span><b className="text-white">SPACE</b> jump</span>
                    <span><b className="text-white">SHIFT</b> sprint</span>
                    <span><b className="text-white">V</b> first person</span>
                    <span><b className="text-white">1-3</b> equip tools</span>
                    <span><b className="text-white">R</b> respawn</span>
                    <span><b className="text-white">/</b> chat</span>
                    <span><b className="text-white">~</b> OP console{hud?.admin ? "" : " (admins)"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ----------------------- admin command console -------------------- */}
          {consoleOpen && hud?.admin && (
            <div className="absolute bottom-16 left-1/2 z-40 w-[min(620px,calc(100%-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-[#3d5a2c] bg-[rgba(16,20,14,.94)] shadow-2xl backdrop-blur">
              <div className="flex items-center gap-2 border-b border-[#2d3a24] px-4 py-2.5">
                <Shield size={14} className="text-[#8fd3ab]" />
                <span className="text-[12.5px] font-bold text-[#c9e88a]">OP Command Console</span>
                <span className="text-[10px] text-[#7a8798]">HD-Admin style · also type :cmds in chat</span>
                <div className="flex-1" />
                <button type="button" className="text-[10.5px] font-semibold text-[#9aa0a6] hover:text-white" onClick={() => setCmdListOpen((v) => !v)}>
                  {cmdListOpen ? "Hide" : "All"} commands
                </button>
                <button type="button" className="grid h-6 w-6 place-items-center rounded-full text-[#9aa0a6] hover:bg-white/10 hover:text-white" onClick={() => setConsoleOpen(false)}>
                  <X size={13} />
                </button>
              </div>

              {cmdListOpen && (
                <div className="max-h-[200px] overflow-y-auto border-b border-[#2d3a24] px-4 py-2">
                  {ADMIN_COMMANDS.map((c) => (
                    <div key={c.cmd} className="flex items-baseline gap-2 py-[3px] text-[11px]">
                      <code className="shrink-0 rounded bg-[#1e2a18] px-1.5 py-0.5 font-mono text-[10.5px] text-[#a5e88a]">:{c.cmd}{c.args ? ` ${c.args}` : ""}</code>
                      <span className="text-[#9aa0a6]">{c.desc}</span>
                    </div>
                  ))}
                </div>
              )}

              <div ref={conScrollRef} className="max-h-[150px] overflow-y-auto px-4 py-2 font-mono text-[11px] leading-relaxed">
                {conOut.length === 0 && <div className="text-[#7a8798]">Commands run here print their output. Try :speed 60</div>}
                {conOut.map((o) => (
                  <div key={o.id} className={o.ok ? "text-[#b7f0cd]" : "text-[#ffc9c9]"}>
                    {o.ok ? "✓" : "✗"} {o.text}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-[#2d3a24] px-4 py-2">
                {[
                  [":heal", "Heal"],
                  [":god", "God"],
                  [":damage 20", "Dmg 20"],
                  [":speed 60", "Speed 60"],
                  [":jump 120", "Jump 120"],
                  [":bots 8", "Bots 8"],
                  [":time 22", "Night"],
                  [":give sword", "Sword"],
                ].map(([cmd, label]) => (
                  <button
                    key={cmd}
                    type="button"
                    onClick={() => runCmd(cmd)}
                    className="rounded-full border border-[#3d5a2c] bg-[#1c2617] px-2.5 py-1 text-[10.5px] font-semibold text-[#c9e88a] hover:bg-[#26331e]"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 border-t border-[#2d3a24] px-4 py-2.5">
                <span className="font-mono text-[13px] font-bold text-[#8fd3ab]">:</span>
                <input
                  ref={consoleInputRef}
                  className="h-8 flex-1 bg-transparent font-mono text-[12px] text-white outline-none placeholder:text-[#7a8798]"
                  placeholder="speed 100 · god · tp 0 50 0 · kick NoobSlayer42"
                  maxLength={120}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      const v = e.currentTarget.value.trim();
                      if (v) runCmd(`:${v}`);
                      e.currentTarget.value = "";
                    }
                    if (e.key === "Escape") setConsoleOpen(false);
                  }}
                />
                <button
                  type="button"
                  className="rounded-lg bg-[#2c5a3d] px-3 py-1 text-[11px] font-bold text-[#c9e88a] hover:bg-[#37694a]"
                  onClick={() => {
                    const v = consoleInputRef.current?.value.trim();
                    if (v) runCmd(`:${v}`);
                    if (consoleInputRef.current) consoleInputRef.current.value = "";
                  }}
                >
                  Run
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
