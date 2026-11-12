"use client";

import { useEffect, useRef, useState } from "react";
import { StudioEngine } from "@/lib/studio/engine";
import { NetClient } from "@/lib/studio/net";
import { PlayController } from "@/lib/studio/playmode";
import type { NetPlayer, PlaceState, StudioAccess } from "@/lib/studio/types";
import { useStudio } from "@/lib/studio/store";
import { usePlatform } from "@/lib/studio/platform";
import { useWeb } from "@/lib/studio/webstore";
import { Mezzanine } from "./Mezzanine";
import { Toolbar } from "./Toolbar";
import { Explorer } from "./Explorer";
import { PropertiesPanel } from "./PropertiesPanel";
import { OutputPanel } from "./OutputPanel";
import { StatusBar } from "./StatusBar";
import { PlayHud } from "./PlayHud";
import { ScriptEditor } from "./ScriptEditor";
import { AnimationEditor } from "./AnimationEditor";
import { StudioContext, type StudioContextValue } from "./context";
import { StartPage } from "./StartPage";
import { Toasts } from "./Toasts";
import { HelpModal } from "./Mezzanine";
import { PublishModal } from "./PublishModal";
import { Toolbox } from "./Toolbox";
import { ToolCreator } from "./ToolCreator";
import { CommandBar } from "./CommandBar";
import { TeamChat } from "./TeamChat";
import { TeamCreateModal } from "./TeamCreateModal";
import { UIEditor } from "./UIEditor";
import { StudioTestWindow } from "./StudioTestWindow";

export default function StudioApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StudioEngine | null>(null);
  const netRef = useRef<NetClient | null>(null);
  const playRef = useRef<PlayController | null>(null);
  const playSnapshot = useRef<PlaceState | null>(null);
  /** pre-launch autosave restored when a website game was played (protects studio work) */
  const autosaveGuard = useRef<PlaceState | null>(null);
  const remoteNames = useRef(new Map<string, NetPlayer>());
  const [instances, setInstances] = useState<{ engine: StudioEngine; net: NetClient; play: PlayController } | null>(null);
  const [liveRevision, setLiveRevision] = useState(0);
  const [testSpawnPosition, setTestSpawnPosition] = useState<[number, number, number] | null>(null);
  const liveTransformTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpParts = useStudio((s) => s.bumpParts);
  const bumpSelection = useStudio((s) => s.bumpSelection);
  const bumpHistory = useStudio((s) => s.bumpHistory);
  const appendLog = useStudio((s) => s.appendLog);
  const setStats = useStudio((s) => s.setStats);
  const setPlayingStore = useStudio((s) => s.setPlaying);
  const setPointerLocked = useStudio((s) => s.setPointerLocked);
  const setPlaceName = useStudio((s) => s.setPlaceName);
  const setNet = useStudio((s) => s.setNet);
  const pushChat = useStudio((s) => s.pushChat);
  const showExplorer = useStudio((s) => s.showExplorer);
  const showProperties = useStudio((s) => s.showProperties);
  const setStartPageOpen = useStudio((s) => s.setStartPageOpen);
  const testWindowOpen = useStudio((s) => s.testWindowOpen);

  /* ------------------------- engine lifecycle ------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new StudioEngine(canvas, {
      onSceneChanged: (state) => {
        bumpParts();
        bumpHistory();
        setLiveRevision((revision) => revision + 1);
        setPlaceName(state.name);
      },
      onSelectionChanged: () => bumpSelection(),
      onLiveTransform: () => {
        bumpSelection();
        // Keep live-edit mirroring responsive without rebuilding the test scene on every pointer event.
        if (!liveTransformTimer.current) {
          liveTransformTimer.current = setTimeout(() => {
            liveTransformTimer.current = null;
            setLiveRevision((revision) => revision + 1);
          }, 40);
        }
      },
      onLog: (level, text) => appendLog(level, text),
      onStats: (fps, camPos) => setStats(fps, camPos),
      onPlayChanged: (playing) => setPlayingStore(playing),
      onFreshPlace: () => {
        autosaveGuard.current = null;
      },
    });
    engineRef.current = engine;

    const net = new NetClient({
      onStatus: (status, detail) => {
        setNet(status === "online", detail, remoteNames.current.size + 1);
        if (status === "error") appendLog("warn", `Team Create: ${detail}`);
        if (status === "online") appendLog("success", `Team Create connected — ${detail}`);
        if (status === "offline") {
          remoteNames.current.clear();
          setNet(false, "Offline", 0);
          if (useStudio.getState().testSessionId) {
            useStudio.getState().setTestSession(false);
            useStudio.getState().setTestWindowOpen(false);
          }
        }
      },
      onError: (message) => appendLog("error", `Team Create: ${message}`),
      onWelcome: (_id, room, players, parts, scripts, uiObjects, testSession) => {
        for (const p of players) remoteNames.current.set(p.id, p);
        setNet(true, `Team Create · ${room}`, players.length + 1);
        if (parts && parts.length) {
          engine.applyRemoteSync(parts);
          engine.applyRemoteScriptSync(scripts ?? []);
          engine.applyRemoteUiSync(uiObjects ?? []);
          appendLog("info", `Loaded shared place from room "${room}" (${parts.length} parts, ${(scripts ?? []).length} scripts, ${(uiObjects ?? []).length} UI objects)`);
        } else {
          engine.broadcastFull();
          appendLog("info", `You are the first builder in "${room}" — your place was published to the room`);
        }
        if (testSession) {
          useStudio.getState().setTestSession(true, testSession.id, testSession.hostName);
          useStudio.getState().setTestPlayers(testSession.players);
        }
        pushChat("", `Connected to room "${room}" — ${players.length} other builder(s).`, true);
      },
      onPlayerJoined: (player) => {
        remoteNames.current.set(player.id, player);
        setNet(true, `Team Create`, remoteNames.current.size + 1);
        appendLog("info", `${player.name} joined the room`);
        pushChat("", `${player.name} joined the room.`, true);
      },
      onPlayerLeft: (id, name) => {
        remoteNames.current.delete(id);
        playRef.current?.removeRemote(id);
        setNet(true, `Team Create`, remoteNames.current.size + 1);
        appendLog("info", `${name} left the room`);
        pushChat("", `${name} left the room.`, true);
      },
      onPlayerState: (id, x, y, z, yaw) => {
        const info = remoteNames.current.get(id);
        if (!info || !engine.playing) return;
        playRef.current?.upsertRemote(id, info.name, info.color, x, y, z, yaw);
      },
      onChat: (name, text) => pushChat(name, text),
      onPartSet: (part) => engine.applyRemotePart(part),
      onPartDelete: (id) => engine.applyRemoteDelete(id),
      onPartsSync: (parts) => engine.applyRemoteSync(parts),
      onScriptSet: (script) => engine.applyRemoteScript(script),
      onScriptDelete: (id) => engine.applyRemoteScriptDelete(id),
      onScriptsSync: (scripts) => engine.applyRemoteScriptSync(scripts),
      onUiSet: (object) => engine.applyRemoteUiObject(object),
      onUiDelete: (id) => engine.applyRemoteUiDelete(id),
      onUiSync: (objects) => engine.applyRemoteUiSync(objects),
      onTestStarted: (session) => {
        useStudio.getState().setTestSession(true, session.id, session.hostName);
        appendLog("success", `Shared test server started by ${session.hostName}. Click Start Player to join.`);
        if (session.hostId === netRef.current?.selfId) {
          useStudio.getState().setTestWindowMode("shared");
          useStudio.getState().setTestWindowOpen(true);
        }
      },
      onTestStopped: (_sessionId, reason) => {
        useStudio.getState().setTestSession(false);
        useStudio.getState().setTestWindowOpen(false);
        appendLog("info", reason);
      },
      onTestWelcome: (sessionId, _hostId, hostName, players) => {
        const self = netRef.current?.selfId;
        const name = useStudio.getState().playerName;
        useStudio.getState().setTestSession(true, sessionId, hostName);
        useStudio.getState().setTestPlayers([...(self ? [{ id: self, name }] : []), ...players]);
        appendLog("success", `Joined shared test server with ${players.length + 1} player(s)`);
      },
      onTestPlayerJoined: (id, name) => {
        const current = useStudio.getState().testPlayers;
        if (!current.some((p) => p.id === id)) useStudio.getState().setTestPlayers([...current, { id, name }]);
      },
      onTestPlayerLeft: (id) => useStudio.getState().removeTestPlayer(id),
      onTestState: (id, name, x, y, z, yaw) => {
        const st = useStudio.getState();
        if (!st.testPlayers.some((p) => p.id === id)) st.setTestPlayers([...st.testPlayers, { id, name }]);
        st.setTestRemoteState(id, { x, y, z, yaw });
      },
      onTeamChat: (msg) => {
        useStudio.getState().pushTeamMsg({ ...msg, mine: false });
        const st = useStudio.getState();
        if (!st.teamChatOpen) st.bumpTeamChatUnread();
      },
      onTeamChatHistory: (msgs) => {
        for (const m of msgs) useStudio.getState().pushTeamMsg({ ...m, mine: false });
      },
      onRoomStats: (stats) => useStudio.getState().setRoomStats(stats),
    });
    netRef.current = net;
    engine.netSend = (packet) => {
      net.send(packet);
    };

    const play = new PlayController(engine, {
      onLog: (level, text) => appendLog(level, text),
      onPointerLock: (locked) => setPointerLocked(locked),
    });
    playRef.current = play;
    engine.playController = play;

    // debug/console hook — inspect the live place from DevTools:
    // __byEngine.getPartData(id), __byPlay.getHud() …
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__byEngine = engine;
      (window as unknown as Record<string, unknown>).__byPlay = play;
    }

    // identity from the logged-in account
    const session = useWeb.getState().session;
    if (session) useStudio.getState().setPlayerName(session.displayName || session.username);

    // launch request: Play pressed on a game card in the website
    const launch = useWeb.getState().consumeLaunch();
    if (launch) {
      // protect the studio autosave while playing a website game
      autosaveGuard.current = StudioEngine.peekLocal()?.state ?? null;
      if (launch.placeData) {
        // shared / published place (Team Create edit) — load the real data
        engine.loadState(launch.placeData, false);
      } else {
        engine.loadTemplateOnly(launch.templateId, launch.name);
      }
      if (launch.teamRoom) {
        // role gate — what THIS client may do inside the shared project
        const role = launch.teamRole ?? "editor";
        const perms = role === "owner" || role === "editor";
        const collab = usePlatform.getState().getCollab(launch.teamRoom);
        const access: StudioAccess = {
          role,
          gameName: launch.name,
          canEditParts: perms || role === "builder",
          canEditScripts: perms,
          hiddenScripts: role === "owner" || role === "editor" ? [] : (collab?.hiddenScripts ?? []),
        };
        engine.accessGate =
          role === "owner"
            ? null
            : { canEditParts: access.canEditParts, canEditScripts: perms, canEditTools: perms, canEditAnimations: perms || role === "builder" };
        useStudio.getState().setMyAccess(access);

        // collaborator joining a shared project — connect to the room shortly
        const room = launch.teamRoom;
        setTimeout(() => {
          if (engineRef.current !== engine || netRef.current !== net) return;
          net.connect(NetClient.defaultUrl(), useStudio.getState().playerName || "Builder", room, role);
          useStudio.getState().setTeamChatOpen(true);
          useStudio.getState().clearTeamChat();
          useStudio.getState().pushTeamMsg({
            name: "",
            text:
              role === "owner"
                ? `Owner session on "${launch.name}" — your edits sync live to every collaborator.`
                : role === "editor"
                  ? `Joined "${launch.name}" as Editor — full building + scripting access.`
                  : role === "builder"
                    ? `Joined "${launch.name}" as Builder — you can edit parts and animations; scripts are read-only.`
                    : `Joined "${launch.name}" as Viewer — look around and read code; edits are locked.`,
            system: true,
            at: Date.now(),
          });
        }, 700);
      } else if (launch.autoPlay) {
        setTimeout(() => {
          if (engineRef.current !== engine || engine.playing) return;
          playSnapshot.current = engine.serialize();
          play.start(useStudio.getState().playerName, { admin: true, bots: 3 });
          pushChat("", "Owner commands active — type :cmds in chat, /e dance for emotes.", true);
        }, 500);
      }
    } else {
      if (!engine.tryLoadLocal()) engine.newPlace();
    }
    setInstances({ engine, net, play });
    // Debug/testing handle (documented, harmless in production)
    (window as unknown as { __blockyardStudio?: unknown }).__blockyardStudio = { engine, net, play };
    // Studio-style start page on every launch (dismissible, keeps autosave)
    const peek = StudioEngine.peekLocal();
    useStudio.getState().setAutosaveInfo(peek ? { name: peek.name, parts: peek.parts } : null);
    setStartPageOpen(true);

    const resize = () => engine.resize();
    const ro = new ResizeObserver(resize);
    if (viewportRef.current) ro.observe(viewportRef.current);
    window.addEventListener("resize", resize);
    resize();

    return () => {
      if (liveTransformTimer.current) clearTimeout(liveTransformTimer.current);
      liveTransformTimer.current = null;
      ro.disconnect();
      window.removeEventListener("resize", resize);
      play.stop();
      net.disconnect(true);
      // if we entered via a website game, put the studio autosave back
      if (autosaveGuard.current) {
        try {
          localStorage.setItem(StudioEngine.STORAGE_KEY, JSON.stringify(autosaveGuard.current));
        } catch { /* quota */ }
        autosaveGuard.current = null;
      }
      engine.dispose();
      engineRef.current = null;
      delete (window as unknown as { __blockyardStudio?: unknown }).__blockyardStudio;
    };
  }, []);

  /* ------------------------ play test control ------------------------- */
  const startPlay = () => {
    const engine = engineRef.current;
    const play = playRef.current;
    if (!engine || !play || engine.playing) return;
    engine.saveLocal();
    playSnapshot.current = engine.serialize();
    // Studio play-test = the owner testing their own build (Roblox Studio
    // grants full access here too), so OP commands are on + a few bots.
    useStudio.getState().clearChat();
    play.start(useStudio.getState().playerName, { admin: true, bots: 3 });
    pushChat("", "Owner commands active — type :cmds in chat, /e dance for emotes.", true);
  };

  const stopPlay = () => {
    const engine = engineRef.current;
    const play = playRef.current;
    if (!engine || !play || !engine.playing) return;
    play.stop();
    if (playSnapshot.current) {
      engine.loadState(playSnapshot.current, false);
      playSnapshot.current = null;
      bumpParts();
      bumpHistory();
      setLiveRevision((revision) => revision + 1);
      if (!autosaveGuard.current) engine.saveLocal();
    }
  };

  // Run opens an independent local game canvas; the editor stays mounted.
  const runSeparateTest = () => {
    setTestSpawnPosition(null);
    useStudio.getState().setTestWindowMode("local");
    useStudio.getState().setTestWindowOpen(true);
  };

  const testHere = () => {
    const engine = engineRef.current;
    if (!engine) return;
    setTestSpawnPosition(engine.getCameraGroundPoint());
    useStudio.getState().setTestWindowMode("local");
    useStudio.getState().setTestWindowOpen(true);
  };

  // Shared Start Server is room-authoritative: the Team Create server decides host and session id.
  const startTestServer = () => {
    const net = netRef.current;
    if (!net?.connected) {
      appendLog("warn", "Connect to Team Create first. Start Server creates a shared test for the current collaboration room.");
      useStudio.getState().setTeamCreateOpen(true);
      return;
    }
    if (!net.send({ type: "test:start" })) appendLog("error", "Could not send the Start Server request.");
  };

  const startTestPlayer = () => {
    if (!useStudio.getState().testServerActive) return;
    useStudio.getState().setTestWindowMode("shared");
    useStudio.getState().setTestWindowOpen(true);
  };

  const stopTestServer = () => {
    const net = netRef.current;
    if (net?.connected) net.send({ type: "test:stop" });
    useStudio.getState().setTestWindowOpen(false);
  };

  /* --------------------------- global keys ---------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "F5") {
        e.preventDefault();
        if (engineRef.current?.playing) stopPlay();
        else startPlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ctx: StudioContextValue = {
    engine: instances?.engine ?? null,
    net: instances?.net ?? null,
    play: instances?.play ?? null,
    playerName: "Builder",
    startPlay,
    stopPlay,
    runSeparateTest,
    testHere,
    startTestServer,
    startTestPlayer,
    stopTestServer,
  };

  return (
    <StudioContext.Provider value={ctx}>
      <div className="studio-app flex h-screen w-screen flex-col overflow-hidden">
        <Mezzanine />
        <Toolbar />
        <div className="flex min-h-0 flex-1">
          {/* live team chat (Team Create) */}
          <TeamChat />

          {/* viewport */}
          <main className="relative flex min-w-0 flex-1 flex-col">
            <div
              ref={viewportRef}
              className="relative min-h-0 flex-1 overflow-hidden"
              onClick={() => {
                if (engineRef.current?.playing) playRef.current?.requestLock();
              }}
            >
              <canvas ref={canvasRef} className="block h-full w-full" />
              <PlayHud />
            </div>
            <CommandBar />
            <OutputPanel />
          </main>

          {/* right column */}
          {(showExplorer || showProperties) && (
            <aside className="flex w-[280px] shrink-0 flex-col border-l border-[#34373c] bg-[#1b1d20]">
              {showExplorer && <Explorer />}
              {showProperties && <PropertiesPanel />}
            </aside>
          )}
        </div>
        <StatusBar />
        <Toasts />
        <StartPage />
        <HelpModal />
        <ScriptEditor />
        <AnimationEditor />
        <PublishModal />
        <Toolbox />
        <ToolCreator />
        <TeamCreateModal />
        <UIEditor />
        {testWindowOpen && instances?.engine && (
          <StudioTestWindow
            editorEngine={instances.engine}
            net={instances.net}
            sessionId={useStudio.getState().testWindowMode === "shared" ? useStudio.getState().testSessionId : null}
            revision={liveRevision}
            playerName={useStudio.getState().playerName}
            spawnPosition={testSpawnPosition}
            onClose={() => {
              useStudio.getState().setTestWindowOpen(false);
              setTestSpawnPosition(null);
            }}
          />
        )}
      </div>
    </StudioContext.Provider>
  );
}
