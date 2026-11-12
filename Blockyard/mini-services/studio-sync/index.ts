import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

/** Blockyard Studio — Team Create sync service.
 * Rooms hold players, chat, the shared placed-parts list, per-builder edit
 * stats and lightweight role enforcement (owner/editor/builder/viewer).
 * Local dev: port 3003 behind the Caddy gateway (/?XTransformPort=3003).
 * Render/containers: listens on process.env.PORT (Render sets it for you)
 * and answers GET /health for the platform health check.
 *
 * Production roles and identities are supplied only by short-lived HMAC
 * tickets minted by the Next.js API after checking Supabase ownership or
 * collaborator records. Client-supplied roles are accepted only in local dev. */

const PORT = Number.parseInt(process.env.PORT ?? "", 10) || 3003;
const MAX_PLAYERS_PER_ROOM = 24;
const TICKET_SECRET = process.env.GAME_SERVER_TICKET_SECRET ?? "";
const MAX_PARTS_PER_ROOM = 600;
const WORLD_LIMIT = 1200;
const TICK = 1000 / 30;
/** Team-chat image payload cap (~300KB data URL) — keeps frames sane. */
const MAX_IMAGE_CHARS = 420_000;
const MAX_CHAT_HISTORY = 80;
/** Hard cap on any incoming frame (KiB) — drop oversized before parsing. */
const MAX_FRAME_BYTES = 1_500_000;
/** Messages per connection per second. */
const MSG_RATE = 60;
/** Allowed browser origins for the WebSocket handshake (CSWSH defense).
 * Empty list is only tolerated in local development; production fails closed. */
const ALLOWED_ORIGINS = (process.env.GAME_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

type Role = "owner" | "editor" | "builder" | "viewer";

type StudioTicketClaims = {
  sub: string;
  u: string;
  n: string;
  room: string;
  role: Role;
  x: number;
};

function verifyStudioTicket(ticket: unknown): StudioTicketClaims | null {
  if (typeof ticket !== "string" || ticket.length > 1024) return null;
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = ticket.slice(0, dot);
  const signature = ticket.slice(dot + 1);
  const expected = createHmac("sha256", TICKET_SECRET).update(payload).digest("base64url");
  const suppliedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StudioTicketClaims;
    if (typeof claims.sub !== "string" || !claims.sub ||
        typeof claims.u !== "string" || !claims.u ||
        typeof claims.n !== "string" || !claims.n ||
        typeof claims.room !== "string" || !claims.room ||
        !["owner", "editor", "builder", "viewer"].includes(claims.role) ||
        !Number.isFinite(claims.x) || claims.x < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

interface PlayerInfo {
  id: string;
  name: string;
  color: number;
  alive: boolean;
}

interface MemberStats {
  id: string;
  name: string;
  role: Role;
  joinedAt: number;
  partEdits: number;
  scriptSaves: number;
  chatMsgs: number;
}

interface TeamFileRef {
  name: string;
  kind: string;
  id: string;
  preview?: string;
}

interface TeamChatEntry {
  name: string;
  text: string;
  image?: string;
  fileRef?: TeamFileRef;
  at: number;
}

interface TestPlayer {
  name: string;
  role: Role;
  lastState: number;
}

interface TestSession {
  id: string;
  hostId: string;
  hostName: string;
  startedAt: number;
  players: Map<string, TestPlayer>;
}

interface Room {
  name: string;
  players: Map<string, { ws: WebSocket; info: PlayerInfo; role: Role; stats: MemberStats }>;
  parts: Map<string, Record<string, unknown>>;
  scripts: Map<string, Record<string, unknown>>;
  uiObjects: Map<string, Record<string, unknown>>;
  lastStates: Map<string, number>;
  chatHistory: TeamChatEntry[];
  testSession: TestSession | null;
}

const rooms = new Map<string, Room>();
const wss = new WebSocketServer({ noServer: true });

let idSeq = 0;
const nextId = () => `p${(++idSeq).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const PALETTE = [0xd85a48, 0x1769c2, 0x2b9b45, 0x8e42c8, 0xc2792b, 0x2b8f9c, 0xc42b71, 0x4a5a2b];
function colorFor(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function getRoom(name: string): Room {
  let room = rooms.get(name);
  if (!room) {
    room = { name, players: new Map(), parts: new Map(), scripts: new Map(), uiObjects: new Map(), lastStates: new Map(), chatHistory: [], testSession: null };
    rooms.set(name, room);
  }
  return room;
}

function send(ws: WebSocket, packet: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(packet));
    } catch {
      /* drop */
    }
  }
}

function broadcast(room: Room, packet: Record<string, unknown>, exceptWs?: WebSocket) {
  const raw = JSON.stringify(packet);
  for (const { ws } of room.players.values()) {
    if (ws !== exceptWs && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(raw);
      } catch {
        /* drop */
      }
    }
  }
}

function statsOf(room: Room): MemberStats[] {
  return [...room.players.values()].map((e) => ({ ...e.stats }));
}

/** Push fresh activity stats to everyone (throttled per room). */
const statsDirty = new Set<Room>();
let statsTimer: ReturnType<typeof setInterval> | null = null;
function markStatsDirty(room: Room) {
  statsDirty.add(room);
  if (!statsTimer) {
    statsTimer = setInterval(() => {
      for (const r of statsDirty) {
        if (r.players.size === 0) continue;
        broadcast(r, { type: "room:stats", stats: statsOf(r) });
      }
      statsDirty.clear();
    }, 1500);
    statsTimer.unref?.();
  }
}

function leaveRoom(room: Room, id: string) {
  const entry = room.players.get(id);
  if (!entry) return;
  room.players.delete(id);
  room.lastStates.delete(id);
  if (room.testSession) {
    const wasHost = room.testSession.hostId === id;
    const wasPlayer = room.testSession.players.delete(id);
    if (wasPlayer) broadcast(room, { type: "test:player-left", id, name: entry.info.name });
    if (wasHost) {
      const sessionId = room.testSession.id;
      room.testSession = null;
      broadcast(room, { type: "test:stopped", sessionId, reason: "Test server host disconnected" });
    }
  }
  broadcast(room, { type: "player:left", id, name: entry.info.name });
  markStatsDirty(room);
  if (room.players.size === 0) rooms.delete(room.name);
}

function validFileRef(v: unknown): TeamFileRef | undefined {
  if (!v || typeof v !== "object") return undefined;
  const f = v as Record<string, unknown>;
  const name = String(f.name ?? "").slice(0, 60).trim();
  if (!name) return undefined;
  return {
    name,
    kind: String(f.kind ?? "Script").slice(0, 24),
    id: String(f.id ?? "").slice(0, 80),
    preview: typeof f.preview === "string" ? f.preview.slice(0, 1500) : undefined,
  };
}

function validPart(p: unknown): Record<string, unknown> | null {
  if (!p || typeof p !== "object") return null;
  const d = p as Record<string, unknown>;
  if (typeof d.id !== "string" || d.id.length > 64) return null;
  const pos = d.position;
  if (!Array.isArray(pos) || pos.length !== 3 || !pos.every((n) => Number.isFinite(n) && Math.abs(n as number) <= WORLD_LIMIT)) return null;
  const size = d.size;
  if (!Array.isArray(size) || size.length !== 3 || !size.every((n) => Number.isFinite(n) && (n as number) > 0 && (n as number) <= 2048)) return null;
  if (typeof d.name !== "string" || d.name.length > 60) d.name = "Part";
  return d;
}

function validScript(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (typeof d.id !== "string" || !d.id || d.id.length > 80) return null;
  if (!(d.kind === "Script" || d.kind === "LocalScript" || d.kind === "ModuleScript")) return null;
  const source = typeof d.source === "string" ? d.source.slice(0, 128_000) : "";
  return {
    id: d.id,
    name: String(d.name ?? d.kind).slice(0, 60),
    kind: d.kind,
    parentId: String(d.parentId ?? "ServerScriptService").slice(0, 80),
    source,
    enabled: d.enabled !== false,
  };
}

function validUiObject(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  const classes = ["Frame", "TextLabel", "TextButton", "TextBox", "ImageLabel", "ImageButton"];
  if (typeof d.id !== "string" || !d.id || d.id.length > 80 || !classes.includes(String(d.className))) return null;
  const n = (key: string, fallback: number, lo: number, hi: number) => {
    const v = Number(d[key]);
    return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
  };
  const color = (key: string, fallback: string) => {
    const value = String(d[key] ?? fallback);
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  };
  return {
    id: d.id,
    name: String(d.name ?? d.className).slice(0, 60),
    className: d.className,
    x: n("x", 0, 0, 100), y: n("y", 0, 0, 100),
    width: n("width", 20, 1, 100), height: n("height", 12, 1, 100),
    text: String(d.text ?? "").slice(0, 500),
    backgroundColor: color("backgroundColor", "#3b4658"),
    textColor: color("textColor", "#ffffff"),
    fontSize: n("fontSize", 16, 8, 72),
    visible: d.visible !== false,
    zIndex: n("zIndex", 1, 1, 100),
  };
}

const canEditParts = (role: Role) => role === "owner" || role === "editor" || role === "builder";
const canEditScripts = (role: Role) => role === "owner" || role === "editor";
const canStartTest = (role: Role) => role === "owner" || role === "editor";

wss.on("connection", (ws, req) => {
  // CSWSH defense: reject handshakes from unexpected browser origins.
  const origin = req.headers.origin;
  // In production, fail closed: an empty allow-list or a missing/mismatched
  // browser Origin must never silently mean "allow every website".
  if (process.env.NODE_ENV === "production") {
    if (ALLOWED_ORIGINS.length === 0 || !origin || !ALLOWED_ORIGINS.includes(origin)) {
      ws.close(4003, "Origin not allowed");
      return;
    }
  } else if (ALLOWED_ORIGINS.length > 0 && origin && !ALLOWED_ORIGINS.includes(origin)) {
    ws.close(4003, "Origin not allowed");
    return;
  }

  let joined: { room: Room; id: string } | null = null;
  let msgCount = 0;
  setInterval(() => (msgCount = 0), 1000).unref?.();

  ws.on("message", (raw) => {
    if (++msgCount > MSG_RATE) return; // crude rate limit
    // oversized frame — drop before parsing (RawData = Buffer|ArrayBuffer|Buffer[])
    const frameSize = Array.isArray(raw)
      ? raw.reduce((n, b) => n + b.length, 0)
      : raw instanceof ArrayBuffer
        ? raw.byteLength
        : (raw as Buffer).length;
    if (frameSize > MAX_FRAME_BYTES) return;
    let packet: Record<string, unknown>;
    try {
      packet = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!packet || typeof packet !== "object") return;
    const type = packet.type;

    if (type === "join" && !joined) {
      let name = "";
      let roomName = "";
      let role: Role = "viewer";
      if (TICKET_SECRET) {
        const claims = verifyStudioTicket(packet.ticket);
        if (!claims) {
          send(ws, { type: "error", message: "Invalid or expired Team Create ticket." });
          ws.close(4001, "Invalid ticket");
          return;
        }
        name = claims.n.slice(0, 20).trim();
        roomName = claims.room.slice(0, 64).trim();
        role = claims.role;
      } else {
        if (process.env.NODE_ENV === "production") {
          send(ws, { type: "error", message: "Team Create ticket authentication is not configured." });
          ws.close(4001, "Authentication unavailable");
          return;
        }
        // Explicit local-development fallback; never enable in production.
        name = String(packet.name ?? "Builder").slice(0, 20).trim() || "Builder";
        roomName = String(packet.room ?? "studio").slice(0, 64).trim() || "studio";
        const rawRole = String(packet.role ?? "viewer");
        role = rawRole === "owner" || rawRole === "editor" || rawRole === "builder" || rawRole === "viewer" ? rawRole : "viewer";
      }
      const room = getRoom(roomName);
      if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
        send(ws, { type: "error", message: "Room is full (24 builders max)." });
        return;
      }
      const id = nextId();
      const info: PlayerInfo = { id, name, color: colorFor(name), alive: true };
      const stats: MemberStats = { id, name, role, joinedAt: Date.now(), partEdits: 0, scriptSaves: 0, chatMsgs: 0 };
      room.players.set(id, { ws, info, role, stats });
      joined = { room, id };
      send(ws, {
        type: "welcome",
        id,
        room: roomName,
        name,
        players: [...room.players.values()].filter((e) => e.info.id !== id).map((e) => e.info),
        parts: [...room.parts.values()],
        scripts: [...room.scripts.values()],
        uiObjects: [...room.uiObjects.values()],
        testSession: room.testSession ? {
          id: room.testSession.id,
          hostId: room.testSession.hostId,
          hostName: room.testSession.hostName,
          startedAt: room.testSession.startedAt,
          players: [...room.testSession.players.entries()].map(([playerId, p]) => ({ id: playerId, name: p.name })),
        } : null,
        teamChat: room.chatHistory,
        stats: statsOf(room),
      });
      broadcast(room, { type: "player:joined", player: info }, ws);
      markStatsDirty(room);
      return;
    }

    if (!joined) return;
    const room = joined.room;
    const self = room.players.get(joined.id);
    if (!self) return;

    switch (type) {
      case "state": {
        const now = Date.now();
        const last = room.lastStates.get(joined.id) ?? 0;
        if (now - last < TICK - 5) return;
        room.lastStates.set(joined.id, now);
        broadcast(room, { type: "player:state", x: packet.x, y: packet.y, z: packet.z, yaw: packet.yaw, id: joined.id }, ws);
        break;
      }
      case "chat": {
        const text = String(packet.text ?? "").slice(0, 180);
        if (!text.trim()) return;
        self.stats.chatMsgs++;
        broadcast(room, { type: "chat", name: self.info.name, text });
        markStatsDirty(room);
        break;
      }
      case "teamchat": {
        const text = String(packet.text ?? "").slice(0, 500);
        const rawImage = packet.image;
        const image =
          typeof rawImage === "string" && rawImage.startsWith("data:image/") && rawImage.length <= MAX_IMAGE_CHARS
            ? rawImage
            : undefined;
        const fileRef = validFileRef(packet.fileRef);
        if (!text.trim() && !image && !fileRef) return;
        self.stats.chatMsgs++;
        const entry: TeamChatEntry = { name: self.info.name, text, image, fileRef, at: Date.now() };
        room.chatHistory.push(entry);
        if (room.chatHistory.length > MAX_CHAT_HISTORY) room.chatHistory.shift();
        broadcast(room, { type: "teamchat", ...entry }, ws);
        markStatsDirty(room);
        break;
      }
      case "script:save": {
        // stat ping from the Script Editor (name only — source never leaves the editor)
        if (!canEditScripts(self.role)) {
          send(ws, { type: "error", message: "Your role cannot edit scripts in this project." });
          return;
        }
        self.stats.scriptSaves++;
        markStatsDirty(room);
        break;
      }
      case "part:set": {
        if (!canEditParts(self.role)) {
          send(ws, { type: "error", message: "Your role cannot edit parts in this project." });
          return;
        }
        const part = validPart(packet.part);
        if (!part) return;
        room.parts.set(String(part.id), part);
        if (room.parts.size > MAX_PARTS_PER_ROOM) room.parts.delete(room.parts.keys().next().value as string);
        self.stats.partEdits++;
        broadcast(room, { type: "part:set", part }, ws);
        markStatsDirty(room);
        break;
      }
      case "part:delete": {
        if (!canEditParts(self.role)) return;
        const id = String(packet.id ?? "");
        if (!room.parts.delete(id)) return;
        self.stats.partEdits++;
        broadcast(room, { type: "part:delete", id });
        markStatsDirty(room);
        break;
      }
      case "parts:sync": {
        if (!canEditParts(self.role)) {
          send(ws, { type: "error", message: "Your role cannot overwrite this project." });
          return;
        }
        const parts = Array.isArray(packet.parts) ? packet.parts : [];
        room.parts.clear();
        for (const p of parts.slice(0, MAX_PARTS_PER_ROOM)) {
          const part = validPart(p);
          if (part) room.parts.set(String(part.id), part);
        }
        self.stats.partEdits++;
        broadcast(room, { type: "parts:sync", parts: [...room.parts.values()] }, ws);
        markStatsDirty(room);
        break;
      }
      case "script:set": {
        if (!canEditScripts(self.role)) {
          send(ws, { type: "error", message: "Your role cannot edit scripts in this project." });
          return;
        }
        const script = validScript(packet.script);
        if (!script) return;
        room.scripts.set(String(script.id), script);
        if (room.scripts.size > 400) room.scripts.delete(room.scripts.keys().next().value as string);
        self.stats.scriptSaves++;
        broadcast(room, { type: "script:set", script }, ws);
        markStatsDirty(room);
        break;
      }
      case "script:delete": {
        if (!canEditScripts(self.role)) return;
        const id = String(packet.id ?? "").slice(0, 80);
        if (!id || !room.scripts.delete(id)) return;
        broadcast(room, { type: "script:delete", id }, ws);
        markStatsDirty(room);
        break;
      }
      case "scripts:sync": {
        if (!canEditScripts(self.role)) {
          send(ws, { type: "error", message: "Your role cannot overwrite project scripts." });
          return;
        }
        const scripts = Array.isArray(packet.scripts) ? packet.scripts : [];
        room.scripts.clear();
        for (const rawScript of scripts.slice(0, 400)) {
          const script = validScript(rawScript);
          if (script) room.scripts.set(String(script.id), script);
        }
        broadcast(room, { type: "scripts:sync", scripts: [...room.scripts.values()] }, ws);
        markStatsDirty(room);
        break;
      }
      case "ui:set": {
        if (!canEditParts(self.role)) {
          send(ws, { type: "error", message: "Your role cannot edit UI in this project." });
          return;
        }
        const object = validUiObject(packet.object);
        if (!object) return;
        room.uiObjects.set(String(object.id), object);
        if (room.uiObjects.size > 200) room.uiObjects.delete(room.uiObjects.keys().next().value as string);
        self.stats.partEdits++;
        broadcast(room, { type: "ui:set", object }, ws);
        markStatsDirty(room);
        break;
      }
      case "ui:delete": {
        if (!canEditParts(self.role)) return;
        const id = String(packet.id ?? "").slice(0, 80);
        if (!id || !room.uiObjects.delete(id)) return;
        broadcast(room, { type: "ui:delete", id }, ws);
        markStatsDirty(room);
        break;
      }
      case "ui:sync": {
        if (!canEditParts(self.role)) return;
        const objects = Array.isArray(packet.objects) ? packet.objects : [];
        room.uiObjects.clear();
        for (const rawObject of objects.slice(0, 200)) {
          const object = validUiObject(rawObject);
          if (object) room.uiObjects.set(String(object.id), object);
        }
        broadcast(room, { type: "ui:sync", objects: [...room.uiObjects.values()] }, ws);
        break;
      }
      case "test:start": {
        if (!canStartTest(self.role)) {
          send(ws, { type: "error", message: "Only the owner or an editor can start a shared test server." });
          return;
        }
        if (room.testSession) {
          send(ws, { type: "error", message: "A Studio test server is already running in this room." });
          return;
        }
        const id = `test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        room.testSession = { id, hostId: joined.id, hostName: self.info.name, startedAt: Date.now(), players: new Map() };
        broadcast(room, { type: "test:started", id, hostId: joined.id, hostName: self.info.name, startedAt: room.testSession.startedAt });
        break;
      }
      case "test:stop": {
        const session = room.testSession;
        if (!session) return;
        if (session.hostId !== joined.id && !canStartTest(self.role)) {
          send(ws, { type: "error", message: "Only the test host, owner or editor can stop the test server." });
          return;
        }
        room.testSession = null;
        broadcast(room, { type: "test:stopped", sessionId: session.id, reason: "Test server stopped by host" });
        break;
      }
      case "test:join": {
        const session = room.testSession;
        if (!session) {
          send(ws, { type: "error", message: "No shared Studio test server is running. Ask the owner to start one." });
          return;
        }
        if (!session.players.has(joined.id) && session.players.size >= MAX_PLAYERS_PER_ROOM) {
          send(ws, { type: "error", message: `Studio test server is full (${MAX_PLAYERS_PER_ROOM} test players).` });
          return;
        }
        session.players.set(joined.id, { name: self.info.name, role: self.role, lastState: 0 });
        send(ws, {
          type: "test:welcome", sessionId: session.id, hostId: session.hostId, hostName: session.hostName,
          players: [...session.players.entries()].filter(([id]) => id !== joined!.id).map(([id, player]) => ({ id, name: player.name })),
        });
        broadcast(room, { type: "test:player-joined", id: joined.id, name: self.info.name }, ws);
        break;
      }
      case "test:leave": {
        const session = room.testSession;
        if (!session || !session.players.delete(joined.id)) return;
        broadcast(room, { type: "test:player-left", id: joined.id, name: self.info.name }, ws);
        break;
      }
      case "test:state": {
        const session = room.testSession;
        const player = session?.players.get(joined.id);
        if (!session || !player) return;
        const now = Date.now();
        if (now - player.lastState < 1000 / 20) return;
        const x = Number(packet.x), y = Number(packet.y), z = Number(packet.z), yaw = Number(packet.yaw);
        if (![x, y, z, yaw].every(Number.isFinite) || Math.abs(x) > WORLD_LIMIT || Math.abs(y) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return;
        player.lastState = now;
        broadcast(room, { type: "test:state", id: joined.id, name: self.info.name, x, y, z, yaw }, ws);
        break;
      }
    }
  });

  ws.on("close", () => {
    if (joined) leaveRoom(joined.room, joined.id);
  });
  ws.on("error", () => {
    if (joined) leaveRoom(joined.room, joined.id);
  });
});

/* --------------------------- tiny HTTP side ----------------------------- */

const http = createServer((req, res) => {
  if (req.url === "/health") {
    const list = [...rooms.values()];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        rooms: list.length,
        players: list.reduce((n, r) => n + r.players.size, 0),
        parts: list.reduce((n, r) => n + r.parts.size, 0),
        scripts: list.reduce((n, r) => n + r.scripts.size, 0),
        uiObjects: list.reduce((n, r) => n + r.uiObjects.size, 0),
        activeTestServers: list.filter((r) => !!r.testSession).length,
      }),
    );
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Blockyard studio-sync (Team Create WebSocket). Connect via /?XTransformPort=3003");
});

http.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

http.listen(PORT, () => {
  console.log(
    `[studio-sync] listening on ws://localhost:${PORT} (${TICKET_SECRET ? "signed-ticket auth" : "DEV MODE — unsigned roles"})${ALLOWED_ORIGINS.length ? ` (origins: ${ALLOWED_ORIGINS.join(", ")})` : ""}`,
  );
});
