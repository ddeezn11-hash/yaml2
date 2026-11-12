"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Play, Radio, Square, Users, X } from "lucide-react";
import { StudioEngine } from "@/lib/studio/engine";
import { PlayController, spawnColorFromName } from "@/lib/studio/playmode";
import type { PlaceState } from "@/lib/studio/types";
import { useStudio } from "@/lib/studio/store";
import { RuntimeGui } from "./RuntimeGui";
import type { NetClient } from "@/lib/studio/net";

interface StudioTestWindowProps {
  editorEngine: StudioEngine;
  net: NetClient | null;
  sessionId: string | null;
  revision: number;
  playerName: string;
  spawnPosition?: [number, number, number] | null;
  onClose: () => void;
}

/** A second, independent game canvas. The editor keeps running beside it. */
export function StudioTestWindow({ editorEngine, net, sessionId, revision, playerName, spawnPosition, onClose }: StudioTestWindowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewEngineRef = useRef<StudioEngine | null>(null);
  const playRef = useRef<PlayController | null>(null);
  const lastScriptSignature = useRef("");
  const lastPartSignature = useRef("");
  const remoteIds = useRef(new Set<string>());
  const [ready, setReady] = useState(false);
  const [fps, setFps] = useState(0);
  const [uiObjects, setUiObjects] = useState<ReturnType<StudioEngine["getUiObjects"]>>([]);
  const [hud, setHud] = useState<{ health: number; maxHealth: number } | null>(null);
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; panelX: number; panelY: number } | null>(null);
  const testPlayers = useStudio((s) => s.testPlayers);
  const remoteStates = useStudio((s) => s.testRemoteStates);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const snapshot: PlaceState = editorEngine.serialize();
    const preview = new StudioEngine(canvas, {
      onStats: (value) => setFps(value),
      onLog: (level, message) => useStudio.getState().appendLog(level, `[Test] ${message}`),
    });
    preview.loadState(snapshot, false);
    previewEngineRef.current = preview;
    setUiObjects(preview.getUiObjects());
    lastScriptSignature.current = JSON.stringify(snapshot.scripts ?? []);
    lastPartSignature.current = JSON.stringify(snapshot.parts ?? []);

    const play = new PlayController(preview, {
      onLog: (level, message) => useStudio.getState().appendLog(level, `[Test] ${message}`),
      onHud: (value) => setHud({ health: value.health, maxHealth: value.maxHealth }),
    });
    playRef.current = play;
    preview.playController = play;
    preview.netSend = (packet) => {
      if (packet.type !== "state" || !sessionId || !net?.connected) return;
      net.send({ type: "test:state", x: packet.x, y: packet.y, z: packet.z, yaw: packet.yaw });
    };

    // Keep the Studio editor fully enabled; this is a floating, independent play viewport.
    play.start(playerName || "Builder", { admin: false, bots: 0, spawnPosition: spawnPosition ?? undefined });
    if (sessionId && net?.connected) {
      const joined = net.send({ type: "test:join" });
      if (!joined) useStudio.getState().appendLog("warn", "Could not join the shared Studio test server.");
    }

    const resize = () => preview.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    requestAnimationFrame(resize);
    setReady(true);

    return () => {
      setReady(false);
      if (sessionId && net?.connected) net.send({ type: "test:leave" });
      play.stop();
      preview.playController = null;
      preview.netSend = null;
      preview.dispose();
      previewEngineRef.current = null;
      playRef.current = null;
      remoteIds.current.clear();
      editorEngine.setInputEnabled(true);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  // `sessionId` is set before a shared test window is opened and remains stable for its lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorEngine, net, playerName, sessionId, spawnPosition]);

  // Mirror every editor revision into the independent game instance without resetting its player.
  useEffect(() => {
    const preview = previewEngineRef.current;
    const play = playRef.current;
    if (!preview || !play) return;
    const snapshot = editorEngine.serialize();
    const nextScripts = JSON.stringify(snapshot.scripts ?? []);
    const nextParts = JSON.stringify(snapshot.parts ?? []);
    const scriptsChanged = nextScripts !== lastScriptSignature.current;
    const partsChanged = nextParts !== lastPartSignature.current;
    preview.syncFromState(snapshot);
    if (partsChanged || scriptsChanged) play.refreshWorld(scriptsChanged);
    lastScriptSignature.current = nextScripts;
    lastPartSignature.current = nextParts;
    setUiObjects(preview.getUiObjects());
  }, [editorEngine, revision]);

  // Render only test-session participants, with interpolated avatars in the preview world.
  useEffect(() => {
    const play = playRef.current;
    if (!play) return;
    const current = new Set<string>();
    for (const member of testPlayers) {
      if (member.id === net?.selfId) continue;
      const state = remoteStates[member.id];
      if (!state) continue;
      current.add(member.id);
      play.upsertRemote(member.id, member.name, spawnColorFromName(member.name), state.x, state.y, state.z, state.yaw);
    }
    for (const id of remoteIds.current) if (!current.has(id)) play.removeRemote(id);
    remoteIds.current = current;
  }, [net?.selfId, remoteStates, testPlayers]);

  const isShared = Boolean(sessionId && net?.connected);

  useEffect(() => {
    const width = Math.min(820, Math.max(380, window.innerWidth * 0.64));
    const height = Math.min(560, Math.max(280, window.innerHeight * 0.62));
    setPanelPosition({ x: Math.max(12, window.innerWidth - width - 20), y: Math.max(12, window.innerHeight - height - 20) });
  }, []);

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panelX: rect.left, panelY: rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onHeaderPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 420;
    const height = event.currentTarget.parentElement?.getBoundingClientRect().height ?? 300;
    setPanelPosition({
      x: Math.max(0, Math.min(window.innerWidth - Math.min(width, window.innerWidth), drag.panelX + event.clientX - drag.startX)),
      y: Math.max(0, Math.min(window.innerHeight - Math.min(height, window.innerHeight), drag.panelY + event.clientY - drag.startY)),
    });
  };
  const onHeaderPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[1200]" aria-label="Studio play test window">
      <div
        className="pointer-events-auto fixed flex h-[min(560px,62vh)] w-[min(820px,64vw)] min-h-[280px] min-w-[380px] flex-col overflow-hidden rounded-xl border border-[#48515d] bg-[#171a1f] shadow-2xl"
        style={{ resize: "both", ...(panelPosition ? { left: panelPosition.x, top: panelPosition.y } : { right: 20, bottom: 20 }) }}
        onKeyDownCapture={(event) => event.stopPropagation()}
        onKeyUpCapture={(event) => event.stopPropagation()}
      >
        <header
          className="flex min-h-12 touch-none cursor-move items-center justify-between gap-3 border-b border-[#35404b] bg-[#222830] px-3"
          title="Drag this title bar to move the separate test window"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
            <Play size={15} className="text-[#75dda4]" />
            <span>Blockyard Test Client</span>
            <span className="rounded bg-[#303b47] px-2 py-0.5 text-[10px] font-normal text-[#bdc9d5]">Separate instance</span>
            {isShared && <span className="flex items-center gap-1 rounded bg-[#173d2b] px-2 py-0.5 text-[10px] text-[#8ce6a5]"><Radio size={11}/> Live Team Test</span>}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[11px] text-[#aab5c1]">
            <span className="flex items-center gap-1"><Users size={13}/>{isShared ? testPlayers.length : 1} player(s)</span>
            <span>{fps} FPS</span>
            {hud && <span className="hidden sm:inline">HP {Math.round(hud.health)}/{hud.maxHealth}</span>}
            <button onClick={onClose} className="rounded p-1.5 text-[#f0a5a5] hover:bg-white/10" title="Stop this player"><Square size={14}/></button>
            <button onClick={onClose} className="rounded p-1.5 hover:bg-white/10" title="Close test window"><X size={15}/></button>
          </div>
        </header>
        <div className="relative min-h-0 flex-1 bg-[#91b6d1]">
          <canvas ref={canvasRef} className="block h-full w-full touch-none" onClick={() => playRef.current?.requestLock()} />
          <RuntimeGui objects={uiObjects}/>
          {!ready && <div className="absolute inset-0 grid place-items-center bg-[#101318] text-sm text-white">Starting test client…</div>}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/55 px-3 py-2 text-[10px] text-white/85">
            Click game to capture mouse · WASD move · Space jump · Esc release
            {isShared ? " · Changes from the editor appear live" : " · Local preview"}
          </div>
        </div>
      </div>
    </div>
  );
}
