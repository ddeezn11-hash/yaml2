"use client";

import { create } from "zustand";
import type { LogLine, LogLevel, StudioAccess, TeamChatMessage, ToolId } from "./types";
import type { RoomMemberStats } from "./net";

export type StudioTab = "Home" | "Model" | "Avatar" | "UI" | "Script" | "Test" | "View";

export type ExplorerFilter = "" | string;

interface StudioStore {
  /* ribbon */
  activeTab: StudioTab;
  setActiveTab: (tab: StudioTab) => void;

  /* tool state (engine mirrors these) */
  tool: ToolId;
  setTool: (tool: ToolId) => void;
  snapMove: number | null;
  snapRotate: number | null;
  setSnapMove: (v: number | null) => void;
  setSnapRotate: (v: number | null) => void;
  localSpace: boolean;
  setLocalSpace: (v: boolean) => void;

  /* scene mirror for React */
  partsVersion: number;
  bumpParts: () => void;
  selectionVersion: number;
  bumpSelection: () => void;
  historyVersion: number;
  bumpHistory: () => void;

  /* play mode */
  playing: boolean;
  setPlaying: (v: boolean) => void;
  pointerLocked: boolean;
  setPointerLocked: (v: boolean) => void;

  /* output console */
  logs: LogLine[];
  logSeq: number;
  appendLog: (level: LogLevel, text: string) => void;
  clearLogs: () => void;
  showOutput: boolean;
  setShowOutput: (v: boolean) => void;

  /* status bar */
  fps: number;
  camPos: [number, number, number];
  setStats: (fps: number, camPos: [number, number, number]) => void;

  /* panels */
  showExplorer: boolean;
  showProperties: boolean;
  toggleExplorer: () => void;
  toggleProperties: () => void;

  /* place name */
  placeName: string;
  setPlaceName: (v: string) => void;

  /* start page (Roblox Studio-style launcher) */
  startPageOpen: boolean;
  setStartPageOpen: (v: boolean) => void;
  autosaveInfo: { name: string; parts: number } | null;
  setAutosaveInfo: (v: { name: string; parts: number } | null) => void;

  /* help modal */
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;

  /* script editor — Roblox Studio-style tabbed, floating document window */
  openScriptIds: string[];
  activeScriptId: string | null;
  /** Open (or focus) a script as a tab in the floating Script Editor window. */
  openScriptTab: (id: string) => void;
  /** Remove one tab (the caller saves the draft first) and focus a neighbour. */
  closeScriptTab: (id: string) => void;
  setActiveScriptId: (id: string) => void;
  /** Per-script unsaved flag, keyed by script id (drives the tab dirty dot). */
  scriptDirty: Record<string, boolean>;
  markScriptDirty: (id: string, dirty: boolean) => void;

  /* my access level in the current Team Create session (null = solo owner) */
  myAccess: StudioAccess | null;
  setMyAccess: (a: StudioAccess | null) => void;

  /* live per-builder activity stats for the joined Team Create room */
  roomStats: RoomMemberStats[];
  setRoomStats: (s: RoomMemberStats[]) => void;

  /* UI editor and separate local test session */
  uiEditorOpen: boolean;
  setUiEditorOpen: (v: boolean) => void;
  testServerActive: boolean;
  testServerHost: string;
  testSessionId: string | null;
  testPlayers: { id: string; name: string }[];
  testRemoteStates: Record<string, { x: number; y: number; z: number; yaw: number }>;
  setTestSession: (active: boolean, id?: string | null, host?: string) => void;
  setTestPlayers: (players: { id: string; name: string }[]) => void;
  setTestRemoteState: (id: string, state: { x: number; y: number; z: number; yaw: number }) => void;
  removeTestPlayer: (id: string) => void;
  clearTestPlayers: () => void;
  testWindowOpen: boolean;
  setTestWindowOpen: (v: boolean) => void;
  testWindowMode: "local" | "shared";
  setTestWindowMode: (mode: "local" | "shared") => void;

  /* animation editor (Avatar tab) */
  animationEditorOpen: boolean;
  setAnimationEditorOpen: (v: boolean) => void;

  /* texture picker dialog */
  texturePickerOpen: boolean;
  setTexturePickerOpen: (v: boolean) => void;

  /* publish-to-website dialog */
  publishOpen: boolean;
  setPublishOpen: (v: boolean) => void;

  /* toolbox panel */
  toolboxOpen: boolean;
  setToolboxOpen: (v: boolean) => void;
  /** Last/preset Toolbox tab ("models" | "gear" | "maps" | "animations"). */
  toolboxTab: string | null;
  setToolboxTab: (v: string | null) => void;

  /* tool creator dialog */
  toolCreatorOpen: boolean;
  setToolCreatorOpen: (v: boolean) => void;

  /* Team Create sharing & requests modal */
  teamCreateOpen: boolean;
  setTeamCreateOpen: (v: boolean) => void;

  /* docked live chat for builders on the same project */
  teamChatOpen: boolean;
  setTeamChatOpen: (v: boolean) => void;
  teamChatUnread: number;
  bumpTeamChatUnread: () => void;
  resetTeamChatUnread: () => void;

  /* live team-chat messages */
  teamMessages: TeamChatMessage[];
  teamChatSeq: number;
  pushTeamMsg: (m: Omit<TeamChatMessage, "id">) => void;
  clearTeamChat: () => void;

  /* player identity (used by play test + team create) */
  playerName: string;
  setPlayerName: (v: string) => void;

  /* net */
  netOnline: boolean;
  netStatusText: string;
  netPlayerCount: number;
  setNet: (online: boolean, text: string, count: number) => void;

  /* play chat */
  chatMessages: { id: number; name: string; text: string; system?: boolean }[];
  chatSeq: number;
  pushChat: (name: string, text: string, system?: boolean) => void;
  clearChat: (hint?: string) => void;
}

export const useStudio = create<StudioStore>((set) => ({
  activeTab: "Home",
  setActiveTab: (tab) => set({ activeTab: tab }),

  tool: "select",
  setTool: (tool) => set({ tool }),
  snapMove: 1,
  snapRotate: 90,
  setSnapMove: (v) => set({ snapMove: v }),
  setSnapRotate: (v) => set({ snapRotate: v }),
  localSpace: false,
  setLocalSpace: (v) => set({ localSpace: v }),

  partsVersion: 0,
  bumpParts: () => set((s) => ({ partsVersion: s.partsVersion + 1 })),
  selectionVersion: 0,
  bumpSelection: () => set((s) => ({ selectionVersion: s.selectionVersion + 1 })),
  historyVersion: 0,
  bumpHistory: () => set((s) => ({ historyVersion: s.historyVersion + 1 })),

  playing: false,
  setPlaying: (v) => set({ playing: v }),
  pointerLocked: false,
  setPointerLocked: (v) => set({ pointerLocked: v }),

  logs: [],
  logSeq: 0,
  appendLog: (level, text) =>
    set((s) => {
      const time = new Date().toLocaleTimeString([], { hour12: false });
      return {
        logs: [...s.logs.slice(-299), { id: s.logSeq + 1, time, level, text }],
        logSeq: s.logSeq + 1,
      };
    }),
  clearLogs: () => set({ logs: [] }),
  showOutput: true,
  setShowOutput: (v) => set({ showOutput: v }),

  fps: 0,
  camPos: [0, 0, 0],
  setStats: (fps, camPos) => set({ fps, camPos }),

  showExplorer: true,
  showProperties: true,
  toggleExplorer: () => set((s) => ({ showExplorer: !s.showExplorer })),
  toggleProperties: () => set((s) => ({ showProperties: !s.showProperties })),

  placeName: "Baseplate",
  setPlaceName: (v) => set({ placeName: v }),

  startPageOpen: false,
  setStartPageOpen: (v) => set({ startPageOpen: v }),
  autosaveInfo: null,
  setAutosaveInfo: (v) => set({ autosaveInfo: v }),

  helpOpen: false,
  setHelpOpen: (v) => set({ helpOpen: v }),

  openScriptIds: [],
  activeScriptId: null,
  openScriptTab: (id) =>
    set((s) => ({
      openScriptIds: s.openScriptIds.includes(id) ? s.openScriptIds : [...s.openScriptIds, id],
      activeScriptId: id,
    })),
  closeScriptTab: (id) =>
    set((s) => {
      const ids = s.openScriptIds.filter((x) => x !== id);
      const active = s.activeScriptId === id ? ids[ids.length - 1] ?? null : s.activeScriptId;
      const dirty = { ...s.scriptDirty };
      delete dirty[id];
      return { openScriptIds: ids, activeScriptId: active, scriptDirty: dirty };
    }),
  setActiveScriptId: (id) => set({ activeScriptId: id }),
  scriptDirty: {},
  markScriptDirty: (id, dirty) =>
    set((s) => (s.scriptDirty[id] === dirty ? {} : { scriptDirty: { ...s.scriptDirty, [id]: dirty } })),

  myAccess: null,
  setMyAccess: (a) => set({ myAccess: a }),

  roomStats: [],
  setRoomStats: (s) => set({ roomStats: s }),

  uiEditorOpen: false,
  setUiEditorOpen: (v) => set({ uiEditorOpen: v }),
  testServerActive: false,
  testServerHost: "",
  testSessionId: null,
  testPlayers: [],
  testRemoteStates: {},
  setTestSession: (active, id = null, host = "") => set({ testServerActive: active, testSessionId: active ? id : null, testServerHost: active ? host : "", ...(active ? {} : { testPlayers: [], testRemoteStates: {} }) }),
  setTestPlayers: (players) => set({ testPlayers: players }),
  setTestRemoteState: (id, state) => set((s) => ({ testRemoteStates: { ...s.testRemoteStates, [id]: state } })),
  removeTestPlayer: (id) => set((s) => { const states = { ...s.testRemoteStates }; delete states[id]; return { testPlayers: s.testPlayers.filter((p) => p.id !== id), testRemoteStates: states }; }),
  clearTestPlayers: () => set({ testPlayers: [], testRemoteStates: {} }),
  testWindowOpen: false,
  setTestWindowOpen: (v) => set({ testWindowOpen: v }),
  testWindowMode: "local",
  setTestWindowMode: (mode) => set({ testWindowMode: mode }),

  animationEditorOpen: false,
  setAnimationEditorOpen: (v) => set({ animationEditorOpen: v }),

  texturePickerOpen: false,
  setTexturePickerOpen: (v) => set({ texturePickerOpen: v }),

  publishOpen: false,
  setPublishOpen: (v) => set({ publishOpen: v }),

  toolboxOpen: false,
  setToolboxOpen: (v) => set({ toolboxOpen: v }),
  toolboxTab: null,
  setToolboxTab: (v) => set({ toolboxTab: v }),

  toolCreatorOpen: false,
  setToolCreatorOpen: (v) => set({ toolCreatorOpen: v }),

  teamCreateOpen: false,
  setTeamCreateOpen: (v) => set({ teamCreateOpen: v }),

  teamChatOpen: false,
  setTeamChatOpen: (v) => set(v ? { teamChatOpen: true, teamChatUnread: 0 } : { teamChatOpen: false }),
  teamChatUnread: 0,
  bumpTeamChatUnread: () => set((s) => ({ teamChatUnread: s.teamChatUnread + 1 })),
  resetTeamChatUnread: () => set({ teamChatUnread: 0 }),

  teamMessages: [],
  teamChatSeq: 0,
  pushTeamMsg: (m) =>
    set((s) => ({
      teamMessages: [...s.teamMessages.slice(-149), { ...m, id: s.teamChatSeq + 1 }],
      teamChatSeq: s.teamChatSeq + 1,
    })),
  clearTeamChat: () => set({ teamMessages: [], teamChatSeq: 0, teamChatUnread: 0 }),

  playerName: "Builder",
  setPlayerName: (v) => set({ playerName: v }),

  netOnline: false,
  netStatusText: "Offline",
  netPlayerCount: 0,
  setNet: (online, text, count) => set({ netOnline: online, netStatusText: text, netPlayerCount: count }),

  chatMessages: [
    { id: 1, name: "", text: "Press / to chat. Click the viewport to capture the mouse.", system: true },
  ],
  chatSeq: 1,
  pushChat: (name, text, system) =>
    set((s) => ({
      chatMessages: [...s.chatMessages.slice(-80), { id: s.chatSeq + 1, name, text, system }],
      chatSeq: s.chatSeq + 1,
    })),
  clearChat: (hint) =>
    set(() => ({
      chatMessages: hint
        ? [{ id: 1, name: "", text: hint, system: true }]
        : [{ id: 1, name: "", text: "Press / to chat. Click the viewport to capture the mouse.", system: true }],
      chatSeq: 1,
    })),
}));
