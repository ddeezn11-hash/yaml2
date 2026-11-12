"use client";

import { useMemo, useRef, useState } from "react";
import {
  Blocks,
  FileDown,
  FilePlus2,
  FileUp,
  Globe,
  HelpCircle,
  MessageSquare,
  Play,
  Redo2,
  Square,
  Undo2,
  Upload,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { NetClient } from "@/lib/studio/net";
import { platformSnapshot, usePlatform } from "@/lib/studio/platform";
import { useStudio, type StudioTab } from "@/lib/studio/store";
import { useWeb } from "@/lib/studio/webstore";
import { useStudioCtx } from "./context";

const TABS: StudioTab[] = ["Home", "Model", "Avatar", "UI", "Script", "Test", "View"];

export function Mezzanine() {
  const { engine, net, startPlay, stopPlay } = useStudioCtx();
  const activeTab = useStudio((s) => s.activeTab);
  const setActiveTab = useStudio((s) => s.setActiveTab);
  const playing = useStudio((s) => s.playing);
  const placeName = useStudio((s) => s.placeName);
  const setPlaceName = useStudio((s) => s.setPlaceName);
  const netOnline = useStudio((s) => s.netOnline);
  const netStatusText = useStudio((s) => s.netStatusText);
  const netPlayerCount = useStudio((s) => s.netPlayerCount);
  const historyVersion = useStudio((s) => s.historyVersion);
  const setStartPageOpen = useStudio((s) => s.setStartPageOpen);
  const setHelpOpen = useStudio((s) => s.setHelpOpen);
  void historyVersion;

  const fileRef = useRef<HTMLInputElement>(null);
  const [netOpen, setNetOpen] = useState(false);
  const netName = useStudio((s) => s.playerName);
  const setPlayerName = useStudio((s) => s.setPlayerName);
  const [netRoom, setNetRoom] = useState("studio");
  const [netUrl, setNetUrl] = useState("");
  const teamChatOpen = useStudio((s) => s.teamChatOpen);
  const setTeamChatOpen = useStudio((s) => s.setTeamChatOpen);
  const teamChatUnread = useStudio((s) => s.teamChatUnread);
  const setTeamCreateOpen = useStudio((s) => s.setTeamCreateOpen);
  const platformVersion = usePlatform((s) => s.version);
  const session = useWeb((s) => s.session);
  /** Join requests waiting on this user (owner) across their published games. */
  const pendingRequests = useMemo(() => {
    void platformVersion;
    if (!session) return 0;
    return platformSnapshot()
      .games.filter((g) => g.creator === session.username)
      .reduce((n, g) => n + (usePlatform.getState().getCollab(g.id)?.requests.length ?? 0), 0);
  }, [platformVersion, session]);

  const connect = () => {
    if (!net) return;
    if (net.connected) {
      net.disconnect(true);
      setNetOpen(false);
      return;
    }
    const url = netUrl.trim() || NetClient.defaultUrl();
    net.connect(url, netName.trim() || "Builder", netRoom.trim() || "studio");
  };

  const canUndo = engine?.canUndo() ?? false;
  const canRedo = engine?.canRedo() ?? false;

  return (
    <header className="flex items-end gap-2 bg-[#17181b] px-2 pt-1.5 pb-0 border-b border-[#34373c] shrink-0">
      {/* brand + play controls */}
      <div className="flex items-center gap-2 pb-1.5">
        <button
          type="button"
          className="flex items-center gap-2 pr-1"
          onClick={() => setStartPageOpen(true)}
          title="Open the start page (templates)"
        >
          <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-[#75dda4] to-[#2f9e77] text-[#0e241a]">
            <Blocks size={16} strokeWidth={2.4} />
          </div>
          <div className="hidden leading-none sm:block">
            <div className="text-[12.5px] font-semibold tracking-wide">Blockyard Studio</div>
            <div className="text-[9.5px] text-[#8b9099]">Roblox-style creation suite</div>
          </div>
        </button>
        <div className="h-7 w-px bg-[#34373c]" />
        <button
          type="button"
          onClick={startPlay}
          disabled={playing}
          className="studio-btn h-7 gap-1.5 px-3 text-[11px] font-semibold text-[#8ce6a5] border border-[#2c5a3d] bg-[#1b2b21] hover:bg-[#213828]"
          title="Play test (F5)"
        >
          <Play size={13} strokeWidth={2.6} /> Play
        </button>
        <button
          type="button"
          onClick={stopPlay}
          disabled={!playing}
          className="studio-btn h-7 gap-1.5 px-3 text-[11px] font-semibold text-[#ff9b9b] border border-[#5a2c2c] bg-[#2b1b1b] hover:bg-[#382323]"
          title="Stop play test (Shift+F5)"
        >
          <Square size={12} strokeWidth={2.6} /> Stop
        </button>
        <button
          type="button"
          onClick={() => useWeb.getState().exitStudio()}
          className="studio-btn h-7 gap-1.5 px-3 text-[11px] font-semibold text-[#8ec5ff] border border-[#2c4a5a] bg-[#1b2b33] hover:bg-[#213844]"
          title="Back to the website (home, friends, games)"
        >
          <Globe size={13} /> Website
        </button>
        <button
          type="button"
          onClick={() => useStudio.getState().setPublishOpen(true)}
          disabled={playing}
          className="studio-btn h-7 gap-1.5 px-3 text-[11px] font-semibold text-[#0e241a] bg-[#75dda4] hover:bg-[#8ce6a5] disabled:opacity-40"
          title={playing ? "Stop the play test first — publishing needs the editor" : "Publish this game to the Blockyard website — set paid access in Robux"}
        >
          <Upload size={13} /> Publish
        </button>
        <div className="h-7 w-px bg-[#34373c]" />
        <button
          type="button"
          className="studio-btn h-7 w-7"
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={() => engine?.undo()}
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          className="studio-btn h-7 w-7"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={() => engine?.redo()}
        >
          <Redo2 size={14} />
        </button>
      </div>

      {/* tabs */}
      <nav className="flex items-end gap-0.5 ml-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`studio-tab ${activeTab === t ? "active" : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* right side: place file ops + team create */}
      <div className="flex items-center gap-1.5 pb-1.5">
        <input
          className="studio-input h-7 w-36 text-center font-semibold"
          value={placeName}
          onChange={(e) => setPlaceName(e.target.value.slice(0, 40))}
          onBlur={() => engine?.renamePlace(placeName)}
          title="Place name"
        />
        <button
          type="button"
          className="studio-btn h-7 w-7"
          title="New place — open the start page with templates"
          onClick={() => setStartPageOpen(true)}
        >
          <FilePlus2 size={14} />
        </button>
        <button
          type="button"
          className="studio-btn h-7 w-7"
          title="Open place from file"
          onClick={() => fileRef.current?.click()}
        >
          <FileUp size={14} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) engine?.openFromFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="studio-btn h-7 w-7"
          title="Save place to file"
          onClick={() => engine?.exportToFile()}
        >
          <FileDown size={14} />
        </button>

        <button
          type="button"
          onClick={() => setTeamCreateOpen(true)}
          className={`studio-btn relative h-7 gap-1.5 px-2.5 text-[11px] font-semibold ${
            pendingRequests ? "text-[#e8c76a] border border-[#4a4218] bg-[#2b271b]" : "text-[#c8ccd2]"
          }`}
          title="Team Create — share edit access with friends, review join requests, go live"
        >
          <Users size={13} />
          Share
          {pendingRequests > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#e8c76a] px-1 text-[9px] font-extrabold text-[#1b1d20]">
              {pendingRequests}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTeamChatOpen(!teamChatOpen)}
          className={`studio-btn relative h-7 gap-1.5 px-2.5 text-[11px] font-semibold ${
            teamChatOpen ? "text-[#8ce6a5] border border-[#2c5a3d] bg-[#1b2b21]" : "text-[#c8ccd2]"
          }`}
          title="Team Chat — live chat, images and file references for everyone on this project"
        >
          <MessageSquare size={13} />
          Chat
          {teamChatUnread > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#75dda4] px-1 text-[9px] font-extrabold text-[#0e241a]">
              {teamChatUnread}
            </span>
          )}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setNetOpen((v) => !v)}
            className={`studio-btn h-7 gap-1.5 px-2.5 text-[11px] font-semibold ${
              netOnline ? "text-[#8ce6a5] border border-[#2c5a3d] bg-[#1b2b21]" : "text-[#c8ccd2]"
            }`}
            title="Team Create connection (quick connect)"
          >
            {netOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
            {netOnline ? `Live · ${netPlayerCount}` : "Connect"}
          </button>
          {netOpen && (
            <div className="absolute right-0 top-9 z-50 w-[300px] rounded-md border border-[#3a3d42] bg-[#1e2023] p-3 shadow-2xl">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#c8ccd2]">
                <Users size={13} /> Team Create
              </div>
              <label className="mb-1 block text-[10px] text-[#9aa0a8]">Display name</label>
              <input className="studio-input mb-2 h-8" value={netName} maxLength={20} onChange={(e) => setPlayerName(e.target.value)} />
              <label className="mb-1 block text-[10px] text-[#9aa0a8]">Room</label>
              <input className="studio-input mb-2 h-8" value={netRoom} maxLength={32} onChange={(e) => setNetRoom(e.target.value)} />
              <label className="mb-1 block text-[10px] text-[#9aa0a8]">Server URL (blank = this site)</label>
              <input
                className="studio-input mb-3 h-8"
                spellCheck={false}
                placeholder={NetClient.defaultUrl() || "wss://…"}
                value={netUrl}
                onChange={(e) => setNetUrl(e.target.value)}
              />
              <button
                type="button"
                onClick={connect}
                className={`studio-btn h-8 w-full text-[11.5px] font-semibold ${
                  netOnline ? "text-[#ff9b9b] border border-[#5a2c2c] bg-[#2b1b1b]" : "text-[#0e241a] bg-[#75dda4] hover:bg-[#8ce6a5]"
                }`}
              >
                {netOnline ? "Disconnect" : "Connect"}
              </button>
              <div className={`mt-2 text-[10px] ${netOnline ? "text-[#8ce6a5]" : "text-[#9aa0a8]"}`}>
                {netOnline ? `● ${netStatusText}` : "● Offline — parts and players in the same room stay in sync"}
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className="studio-btn h-7 w-7"
          title="Shortcuts & help"
          onClick={() => setHelpOpen(true)}
        >
          <HelpCircle size={14} />
        </button>
      </div>
    </header>
  );
}

/* ----------------------------- help modal ----------------------------- */
const SHORTCUTS: [string, string][] = [
  ["Ctrl+1 / 2 / 3 / 4", "Select · Move · Scale · Rotate tool"],
  ["Ctrl+Z / Ctrl+Shift+Z", "Undo / Redo"],
  ["Ctrl+C / V / X", "Copy · Paste · Cut"],
  ["Ctrl+D", "Duplicate selection"],
  ["Ctrl+G / Ctrl+U", "Group parts into a Model / Ungroup"],
  ["Ctrl+A", "Select all parts"],
  ["Ctrl+L", "Toggle Local / World coordinates"],
  ["Ctrl+R / R", "Rotate selection 90°"],
  ["F", "Focus camera on selection"],
  ["Delete / Backspace", "Delete selection"],
  ["F5 / Shift+F5", "Play test / Stop"],
  ["WASD + Q/E + RMB drag", "Fly camera (Shift = slow)"],
];

export function HelpModal() {
  const open = useStudio((s) => s.helpOpen);
  const setHelpOpen = useStudio((s) => s.setHelpOpen);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-black/55 p-4" onClick={() => setHelpOpen(false)}>
      <div
        className="w-full max-w-[560px] rounded-lg border border-[#3a3d42] bg-[#1e2023] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[#34373c] px-4 py-3">
          <Blocks size={15} className="text-[#75dda4]" />
          <span className="text-[13px] font-semibold">Blockyard Studio — quick guide</span>
          <div className="flex-1" />
          <button type="button" className="studio-btn h-6 w-6" onClick={() => setHelpOpen(false)} title="Close">
            <X size={13} />
          </button>
        </div>
        <div className="studio-scroll max-h-[60vh] overflow-y-auto p-4 text-[11.5px] leading-relaxed text-[#c8ccd2]">
          <p className="mb-3 text-[#9aa0a8]">
            A Roblox Studio-style editor: insert parts from the <span className="text-[#c8ccd2]">Home</span> tab, right-click
            in the <span className="text-[#c8ccd2]">Explorer</span> to insert objects (Models, Folders, SpawnLocations,
            dummy avatar rigs), restyle parts with Color / Material, and press <span className="text-[#c8ccd2]">Play</span> to
            test your game.
          </p>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#8b9099]">Shortcuts</div>
          <div className="grid gap-1">
            {SHORTCUTS.map(([key, desc]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="min-w-[150px] rounded border border-[#3a3d42] bg-[#17181b] px-2 py-0.5 text-center font-mono text-[10px] text-[#8ce6a5]">
                  {key}
                </span>
                <span className="text-[#9aa0a8]">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
