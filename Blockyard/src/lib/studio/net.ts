import type { NetPlayer, PartData, ScriptData, TeamChatMessage, TeamFileRef, UIObjectData } from "./types";

export type NetStatus = "offline" | "connecting" | "online" | "error";

export interface RoomMemberStats {
  id: string;
  name: string;
  role: string;
  joinedAt: number;
  partEdits: number;
  scriptSaves: number;
  chatMsgs: number;
}

export interface NetClientCallbacks {
  onStatus?: (status: NetStatus, detail: string) => void;
  onError?: (message: string) => void;
  onWelcome?: (selfId: string, room: string, players: NetPlayer[], parts: PartData[], scripts: ScriptData[], uiObjects: UIObjectData[], testSession: { id: string; hostId: string; hostName: string; players: { id: string; name: string }[] } | null) => void;
  onPlayerJoined?: (player: NetPlayer) => void;
  onPlayerLeft?: (id: string, name: string) => void;
  onPlayerState?: (id: string, x: number, y: number, z: number, yaw: number) => void;
  onChat?: (name: string, text: string) => void;
  onPartSet?: (part: PartData) => void;
  onPartDelete?: (id: string) => void;
  onPartsSync?: (parts: PartData[]) => void;
  onScriptSet?: (script: ScriptData) => void;
  onScriptDelete?: (id: string) => void;
  onScriptsSync?: (scripts: ScriptData[]) => void;
  onUiSet?: (object: UIObjectData) => void;
  onUiDelete?: (id: string) => void;
  onUiSync?: (objects: UIObjectData[]) => void;
  onTestStarted?: (session: { id: string; hostId: string; hostName: string }) => void;
  onTestStopped?: (sessionId: string, reason: string) => void;
  onTestWelcome?: (sessionId: string, hostId: string, hostName: string, players: { id: string; name: string }[]) => void;
  onTestPlayerJoined?: (id: string, name: string) => void;
  onTestPlayerLeft?: (id: string, name: string) => void;
  onTestState?: (id: string, name: string, x: number, y: number, z: number, yaw: number) => void;
  /** Live team-chat message from another builder in the room. */
  onTeamChat?: (msg: Pick<TeamChatMessage, "name" | "text" | "image" | "fileRef" | "at">) => void;
  /** Chat history replayed when joining a room. */
  onTeamChatHistory?: (msgs: Pick<TeamChatMessage, "name" | "text" | "image" | "fileRef" | "at">[]) => void;
  /** Per-builder activity stats (join time, edits) for the current room. */
  onRoomStats?: (stats: RoomMemberStats[]) => void;
}

/** WebSocket multiplayer client for the studio-sync mini service. */
export class NetClient {
  private ws: WebSocket | null = null;
  private wanted = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private delay = 1000;
  selfId: string | null = null;
  room = "";

  constructor(private cb: NetClientCallbacks) {}

  static defaultUrl(): string {
    // Remote sync server (e.g. a Render deployment) wins over same-origin.
    // Build-time var — set it in the web app's env before `next build`.
    const remote = process.env.NEXT_PUBLIC_SYNC_SERVER_URL;
    if (remote) return remote;
    if (typeof location === "undefined") return "";
    const proto = location.protocol === "https:" ? "wss://" : "ws://";
    return `${proto}${location.host}/?XTransformPort=3003`;
  }

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  private role = "owner";

  connect(url: string, name: string, room: string, role = "owner") {
    this.disconnect(false);
    this.wanted = true;
    this.role = role;
    this.cb.onStatus?.("connecting", "Verifying account and connecting…");

    void (async () => {
      let ticket: string | null = null;
      let devMode = false;
      try {
        const response = await fetch("/api/studio/ticket", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room }),
        });
        const data = (await response.json()) as { ok: boolean; ticket?: string | null; mode?: string; error?: string };
        if (!response.ok || !data.ok) {
          this.cb.onStatus?.("error", data.error || "Team Create access denied");
          return;
        }
        ticket = data.ticket ?? null;
        devMode = data.mode === "dev";
      } catch {
        this.cb.onStatus?.("error", "Could not contact the Team Create authentication service");
        return;
      }

      if (!this.wanted) return;
      if (!ticket && !devMode) {
        this.cb.onStatus?.("error", "The Team Create server did not issue an access ticket");
        return;
      }

      try {
        const ws = new WebSocket(url);
        this.ws = ws;
        ws.addEventListener("open", () => {
          if (this.ws !== ws) return;
          // In signed mode the server takes room, identity and role from the
          // HMAC ticket; the client cannot elevate itself by changing fields.
          ws.send(JSON.stringify(ticket
            ? { type: "join", ticket }
            : { type: "join", name, room, role }));
        });
        ws.addEventListener("message", (ev) => {
          if (this.ws !== ws) return;
          try {
            this.handle(JSON.parse(String(ev.data)) as Record<string, unknown>);
          } catch {
            /* ignore malformed */
          }
        });
        ws.addEventListener("error", () => {
          if (this.ws === ws) this.cb.onStatus?.("error", "Connection error");
        });
        ws.addEventListener("close", () => {
          if (this.ws !== ws) return;
          this.ws = null;
          this.selfId = null;
          this.cb.onStatus?.("offline", "Disconnected");
          if (this.wanted) {
            const wait = this.delay;
            this.delay = Math.min(15000, this.delay * 2);
            this.reconnectTimer = setTimeout(() => this.connect(url, name, room, this.role), wait);
          }
        });
      } catch {
        this.cb.onStatus?.("error", "Invalid server URL");
      }
    })();
  }

  disconnect(userInitiated = true) {
    this.wanted = !userInitiated ? this.wanted : false;
    if (userInitiated) this.wanted = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      try {
        old.close(1000, "Client disconnected");
      } catch {
        /* already closed */
      }
    }
    if (userInitiated) this.cb.onStatus?.("offline", "Offline");
  }

  send(packet: Record<string, unknown>): boolean {
    if (!this.connected) return false;
    try {
      this.ws!.send(JSON.stringify(packet));
      return true;
    } catch {
      return false;
    }
  }

  private handle(packet: Record<string, unknown>) {
    const type = packet.type as string;
    switch (type) {
      case "welcome": {
        this.selfId = packet.id as string;
        this.room = (packet.room as string) || "";
        this.delay = 1000;
        this.cb.onStatus?.("online", `Team Create · ${this.room}`);
        const testSession = packet.testSession && typeof packet.testSession === "object"
          ? packet.testSession as { id: string; hostId: string; hostName: string; players: { id: string; name: string }[] }
          : null;
        this.cb.onWelcome?.(
          this.selfId,
          this.room,
          (packet.players as NetPlayer[]) || [],
          (packet.parts as PartData[]) || [],
          (packet.scripts as ScriptData[]) || [],
          (packet.uiObjects as UIObjectData[]) || [],
          testSession,
        );
        if (testSession) this.cb.onTestStarted?.({ id: testSession.id, hostId: testSession.hostId, hostName: testSession.hostName });
        if (Array.isArray(packet.stats)) {
          this.cb.onRoomStats?.(packet.stats as RoomMemberStats[]);
        }
        const history = packet.teamChat;
        if (Array.isArray(history) && history.length) {
          this.cb.onTeamChatHistory?.(
            history
              .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
              .map((m) => parseTeamChat(m)),
          );
        }
        break;
      }
      case "player:joined":
        this.cb.onPlayerJoined?.(packet.player as NetPlayer);
        break;
      case "player:left":
        this.cb.onPlayerLeft?.(packet.id as string, (packet.name as string) || "A builder");
        break;
      case "player:state":
      case "state":
        this.cb.onPlayerState?.(
          packet.id as string,
          packet.x as number,
          packet.y as number,
          packet.z as number,
          packet.yaw as number,
        );
        break;
      case "chat":
        this.cb.onChat?.((packet.name as string) || "Player", (packet.text as string) || "");
        break;
      case "teamchat":
        this.cb.onTeamChat?.(parseTeamChat(packet));
        break;
      case "part:set":
        if (packet.part) this.cb.onPartSet?.(packet.part as PartData);
        break;
      case "part:delete":
        this.cb.onPartDelete?.(packet.id as string);
        break;
      case "parts:sync":
        this.cb.onPartsSync?.((packet.parts as PartData[]) || []);
        break;
      case "script:set":
        if (packet.script) this.cb.onScriptSet?.(packet.script as ScriptData);
        break;
      case "script:delete":
        this.cb.onScriptDelete?.(String(packet.id ?? ""));
        break;
      case "scripts:sync":
        this.cb.onScriptsSync?.((packet.scripts as ScriptData[]) || []);
        break;
      case "ui:set":
        if (packet.object) this.cb.onUiSet?.(packet.object as UIObjectData);
        break;
      case "ui:delete":
        this.cb.onUiDelete?.(String(packet.id ?? ""));
        break;
      case "ui:sync":
        this.cb.onUiSync?.((packet.objects as UIObjectData[]) || []);
        break;
      case "test:started":
        this.cb.onTestStarted?.({ id: String(packet.id ?? ""), hostId: String(packet.hostId ?? ""), hostName: String(packet.hostName ?? "Builder") });
        break;
      case "test:stopped":
        this.cb.onTestStopped?.(String(packet.sessionId ?? ""), String(packet.reason ?? "Test server stopped"));
        break;
      case "test:welcome":
        this.cb.onTestWelcome?.(
          String(packet.sessionId ?? ""), String(packet.hostId ?? ""), String(packet.hostName ?? "Builder"),
          Array.isArray(packet.players) ? packet.players as { id: string; name: string }[] : [],
        );
        break;
      case "test:player-joined":
        this.cb.onTestPlayerJoined?.(String(packet.id ?? ""), String(packet.name ?? "Player"));
        break;
      case "test:player-left":
        this.cb.onTestPlayerLeft?.(String(packet.id ?? ""), String(packet.name ?? "Player"));
        break;
      case "test:state":
        if ([packet.x, packet.y, packet.z, packet.yaw].every((v) => typeof v === "number" && Number.isFinite(v))) {
          this.cb.onTestState?.(String(packet.id ?? ""), String(packet.name ?? "Player"), packet.x as number, packet.y as number, packet.z as number, packet.yaw as number);
        }
        break;
      case "error":
        this.cb.onError?.(String(packet.message ?? "Team Create server error"));
        break;
      case "room:stats": {
        const stats = packet.stats;
        if (Array.isArray(stats)) this.cb.onRoomStats?.(stats as RoomMemberStats[]);
        break;
      }
    }
  }
}

/** Safely read a team-chat packet off the wire. */
function parseTeamChat(packet: Record<string, unknown>): Pick<TeamChatMessage, "name" | "text" | "image" | "fileRef" | "at"> {
  const rawRef = packet.fileRef;
  let fileRef: TeamFileRef | undefined;
  if (rawRef && typeof rawRef === "object") {
    const f = rawRef as Record<string, unknown>;
    fileRef = {
      id: String(f.id ?? ""),
      name: String(f.name ?? "file"),
      kind: String(f.kind ?? "Script"),
      preview: typeof f.preview === "string" ? f.preview : undefined,
    };
  }
  const image = typeof packet.image === "string" && packet.image.startsWith("data:image/") ? packet.image : undefined;
  return {
    name: (packet.name as string) || "Builder",
    text: (packet.text as string) || "",
    image,
    fileRef,
    at: Number(packet.at) || Date.now(),
  };
}
