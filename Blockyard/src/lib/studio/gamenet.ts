"use client";

/* ------------------------------------------------------------------ */
/* Game server client — published-experience multiplayer (:3004).      */
/* Separate from NetClient (Studio Team Create on :3003): different    */
/* room type, packet schema, lifecycle and permissions.                */
/* ------------------------------------------------------------------ */

export type GameNetStatus = "connecting" | "online" | "offline" | "error";

export interface GamePlayerInfo {
  id: string;
  name: string;
  color: number;
}

export interface RemoteTransform {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface GameNetCallbacks {
  onStatus?: (status: GameNetStatus, detail: string) => void;
  /** Connected and joined a session. */
  onWelcome?: (selfId: string, sessionId: string, players: GamePlayerInfo[], playerCount: number) => void;
  onPlayerJoined?: (player: GamePlayerInfo) => void;
  onPlayerLeft?: (id: string, name: string) => void;
  /** Nearby server-validated transform deltas (excludes self). */
  onSnapshot?: (players: RemoteTransform[]) => void;
  /** Remove a remote avatar that moved outside the server interest radius. */
  onRemoteHidden?: (id: string) => void;
  onChat?: (name: string, text: string) => void;
  onError?: (message: string) => void;
  onKicked?: (reason: string) => void;
}

export class GameNetClient {
  private ws: WebSocket | null = null;
  private wanted = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  selfId: string | null = null;
  sessionId: string | null = null;
  /** Names + colors of remote players in this session. */
  players = new Map<string, GamePlayerInfo>();
  private visibleRemoteIds = new Set<string>();

  constructor(private cb: GameNetCallbacks) {}

  static defaultUrl(): string {
    // Remote game server (e.g. a Render deployment) wins over same-origin.
    // Build-time var — set it in the web app's env before `next build`.
    const remote = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
    if (remote) return remote;
    if (typeof location === "undefined") return "";
    const proto = location.protocol === "https:" ? "wss://" : "ws://";
    return `${proto}${location.host}/?XTransformPort=3004`;
  }

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /** Connect: fetch a signed ticket from the app, then open the socket. */
  async connect(opts: { experienceId: string; username: string; displayName: string; spawn?: { x: number; y: number; z: number; yaw: number } }) {
    this.disconnect(false);
    this.wanted = true;
    this.cb.onStatus?.("connecting", "Connecting to server…");

    let ticket: string | null = null;
    try {
      const res = await fetch("/api/game/ticket", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experienceId: opts.experienceId }),
      });
      const data = (await res.json()) as { ok: boolean; ticket?: string | null; error?: string };
      if (!res.ok || !data.ok) {
        this.cb.onError?.(data.error || "Could not verify your Blockyard account.");
        this.cb.onStatus?.("error", data.error || "Authentication failed");
        this.wanted = false;
        return;
      }
      ticket = data.ticket ?? null;
    } catch {
      this.cb.onError?.("Could not contact Blockyard's authentication service.");
      this.cb.onStatus?.("error", "Authentication service unavailable");
      this.wanted = false;
      return;
    }

    if (!this.wanted) return;
    const url = GameNetClient.defaultUrl();
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.cb.onStatus?.("error", "Could not open connection");
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      if (this.ws !== ws) return;
      ws.send(
        JSON.stringify({
          type: "auth",
          ticket,
          experienceId: opts.experienceId,
          // These fields are only a local-development fallback. A signed
          // production ticket supplies the real identity server-side.
          ...(ticket ? {} : { username: opts.username, displayName: opts.displayName }),
          ...(opts.spawn ?? {}),
        }),
      );
    });

    ws.addEventListener("message", (ev) => {
      if (this.ws !== ws) return;
      let packet: Record<string, unknown>;
      try {
        packet = JSON.parse(String(ev.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      this.handle(packet);
    });

    ws.addEventListener("error", () => {
      if (this.ws === ws) this.cb.onStatus?.("error", "Connection error");
    });

    ws.addEventListener("close", (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.selfId = null;
      this.sessionId = null;
      this.players.clear();
      this.visibleRemoteIds.clear();
      this.cb.onStatus?.("offline", ev.reason || "Disconnected");
      if (this.wanted) {
        this.connectTimer = setTimeout(() => {
          void this.connect(opts);
        }, 2000);
      }
    });
  }

  disconnect(userInitiated = true) {
    if (userInitiated) this.wanted = false;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
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
    if (userInitiated) {
      this.players.clear();
      this.visibleRemoteIds.clear();
      this.selfId = null;
      this.sessionId = null;
    }
  }

  /** Forward a PlayController 15Hz `state` packet (x/y/z/yaw validated server-side). */
  send(packet: Record<string, unknown>): boolean {
    if (!this.connected) return false;
    // Position packets are replaceable: when the browser's socket is backed
    // up, drop the newest frame instead of building a queue of stale movement.
    const queueLimit = packet.type === "state" ? 16 * 1024 : 64 * 1024;
    if (this.ws!.bufferedAmount > queueLimit) return false;
    try {
      this.ws!.send(JSON.stringify(packet));
      return true;
    } catch {
      return false;
    }
  }

  sendChat(text: string): boolean {
    return this.send({ type: "chat", text });
  }

  private handle(packet: Record<string, unknown>) {
    switch (packet.type) {
      case "welcome": {
        this.selfId = packet.id as string;
        this.sessionId = packet.sessionId as string;
        this.players.clear();
        this.visibleRemoteIds.clear();
        const list = (packet.players as (GamePlayerInfo & RemoteTransform)[]) || [];
        for (const p of list) this.players.set(p.id, { id: p.id, name: p.name, color: p.color });
        this.cb.onStatus?.("online", `Session ${(this.sessionId ?? "").slice(0, 8)} · ${list.length + 1} online`);
        this.cb.onWelcome?.(this.selfId, this.sessionId ?? "", [...this.players.values()], list.length + 1);
        break;
      }
      case "player:joined": {
        const p = packet.player as GamePlayerInfo;
        if (p && p.id !== this.selfId) {
          this.players.set(p.id, p);
          this.cb.onPlayerJoined?.(p);
        }
        break;
      }
      case "player:left": {
        const id = packet.id as string;
        const info = this.players.get(id);
        this.players.delete(id);
        this.visibleRemoteIds.delete(id);
        this.cb.onPlayerLeft?.(id, info?.name ?? (packet.name as string) ?? "A player");
        break;
      }
      case "snapshot": {
        const hidden = Array.isArray(packet.hidden) ? packet.hidden as string[] : [];
        for (const id of hidden) {
          if (typeof id !== "string") continue;
          this.visibleRemoteIds.delete(id);
          this.cb.onRemoteHidden?.(id);
        }
        const players = (packet.players as RemoteTransform[]) || [];
        const visible = players.filter((p) => p && p.id !== this.selfId && typeof p.id === "string");
        for (const p of visible) this.visibleRemoteIds.add(p.id);
        this.cb.onSnapshot?.(visible);
        break;
      }
      case "chat":
        this.cb.onChat?.((packet.name as string) || "Player", (packet.text as string) || "");
        break;
      case "error":
        this.cb.onError?.((packet.message as string) || "Server error");
        break;
      case "kicked":
        this.wanted = false;
        this.cb.onKicked?.((packet.reason as string) || "Kicked by the server");
        break;
    }
  }
}
