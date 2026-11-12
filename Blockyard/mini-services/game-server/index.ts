import { createHmac, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";

/** Blockyard — published-game multiplayer server (separate from Studio
 * Team Create sync on :3003). Authoritative for: player identity (signed
 * tickets), session membership, canonical transforms, movement bounds,
 * speed limits, chat attribution and join/leave events.
 *
 * Scope notes (honest labels):
 *  - Movement is CLIENT-SIMULATED, SERVER-VALIDATED: clients send their
 *    transform at ~15Hz; the server rejects impossible movement (speed /
 *    world bounds) and only broadcasts validated state. It does not run
 *    collision or physics.
 *  - Single in-memory instance (prototype). Horizontal scaling needs a
 *    shared session registry (Redis) — see the RoomRegistry interface.
 *  - Identity: HMAC-signed tickets from the Next.js route
 *    /api/game/ticket, which verifies the caller's Supabase session. The
 *    production server rejects unsigned identities. */

/** Local dev: port 3004 behind the Caddy gateway (/?XTransformPort=3004).
 * Render/containers: listens on process.env.PORT (Render sets it for you). */
const PORT = Number.parseInt(process.env.PORT ?? "", 10) || 3004;
/** Hard cap on any incoming frame (bytes). */
const MAX_FRAME_BYTES = 32_000;
/** Messages per connection per second (state runs at 15Hz + chat). */
const MSG_RATE = 40;
/** One shared experience session can hold 200 authenticated players. */
const MAX_PLAYERS = clampInt(process.env.GAME_SERVER_MAX_PLAYERS, 2, 200, 200);
/** World bounds in studs (matches the studio world limit). */
const WORLD_LIMIT = 1200;
/** Max horizontal speed (studs/s): sprint 24 * generous tool multipliers. */
const MAX_SPEED_H = 90;
/** Max vertical speed (studs/s): terminal fall 160 + jump headroom. */
const MAX_SPEED_V = 240;
/** Network snapshots are delta-based and sent only when something changes. */
const SNAPSHOT_HZ = clampInt(process.env.GAME_SERVER_SNAPSHOT_HZ, 6, 20, 12);
/** Only nearby avatars are sent to each client; the browser renders at most this many. */
const VIEW_RADIUS = clampInt(process.env.GAME_SERVER_VIEW_RADIUS, 60, 1200, 220);
const MAX_VISIBLE_PLAYERS = clampInt(process.env.GAME_SERVER_MAX_VISIBLE_PLAYERS, 8, 128, 64);
/** Backpressure limits keep slow browsers from accumulating unbounded WS buffers. */
const SNAPSHOT_DROP_BYTES = 128 * 1024;
const MAX_BUFFERED_BYTES = 512 * 1024;
/** Chat limits. */
const MAX_CHAT_LEN = 180;
const CHAT_WINDOW_MS = 10_000;
const CHAT_MAX_IN_WINDOW = 5;
/** Auth must complete within this window or the socket is closed. */
const AUTH_TIMEOUT_MS = 6_000;
/** Empty sessions are garbage collected after this idle time. */
const SESSION_IDLE_MS = 10 * 60_000;
/** Heartbeat: ping every 20s, drop if no pong for 2 intervals. */
const PING_MS = 20_000;
/** Signed-ticket secret, shared with the Next.js app. Empty = dev mode. */
const TICKET_SECRET = process.env.GAME_SERVER_TICKET_SECRET ?? "";
/** Allowed browser origins (CSWSH defense). Empty = allow all (dev). */
const ALLOWED_ORIGINS = (process.env.GAME_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function clampInt(v: string | undefined, lo: number, hi: number, dflt: number): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}

/* ------------------------------- model ---------------------------------- */

interface Vec { x: number; y: number; z: number }

interface Player {
  id: string;
  /** Supabase user id frozen at authentication time (dev mode uses a local label). */
  userId: string;
  /** Identity, frozen at auth time from the signed ticket. */
  username: string;
  displayName: string;
  color: number;
  sessionId: string;
  ws: WebSocket;
  /** Server-validated canonical transform. */
  pos: Vec;
  yaw: number;
  /** True once the first state packet set a real position (skip validation on it). */
  positioned: boolean;
  /** Movement-validation strikes (impossible-move rejections). */
  strikes: number;
  strikeWindow: number;
  chatTimes: number[];
  alive: boolean;
  /** Remote avatars currently inside this player's interest area. */
  visibleIds: Set<string>;
  /** Last transform sent to this player, used for delta snapshots. */
  lastSnapshot: Map<string, { x: number; y: number; z: number; yaw: number; at: number }>;
}

interface Session {
  id: string;
  experienceId: string;
  players: Map<string, Player>;
  lastActivity: number;
}

/** All sessions, keyed by session id. SessionsByExperience is derived.
 *  RoomRegistry marks the seam where a Redis-backed registry plugs in. */
interface RoomRegistry {
  findOpen(experienceId: string): Session | undefined;
  create(experienceId: string): Session;
  get(id: string): Session | undefined;
  all(): Session[];
  remove(id: string): void;
}
const registry: RoomRegistry = (() => {
  const sessions = new Map<string, Session>();
  return {
    findOpen(experienceId) {
      for (const s of sessions.values()) {
        // Keep using an active room regardless of its age; an old but active
        // session must not silently split into a second instance after 30 min.
        if (s.experienceId === experienceId && s.players.size < MAX_PLAYERS) return s;
      }
      return undefined;
    },
    create(experienceId) {
      const id = `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const s: Session = { id, experienceId, players: new Map(), lastActivity: Date.now() };
      sessions.set(id, s);
      return s;
    },
    get: (id) => sessions.get(id),
    all: () => [...sessions.values()],
    remove: (id) => {
      sessions.delete(id);
    },
  };
})();

let idSeq = 0;
const nextId = () => `p${(++idSeq).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const PALETTE = [0xd85a48, 0x1769c2, 0x2b9b45, 0x8e42c8, 0xc2792b, 0x2b8f9c, 0xc42b71, 0x4a5a2b];
function colorFor(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/* ------------------------------ tickets --------------------------------- */

interface TicketClaims {
  sub: string;
  u: string;
  n: string;
  e: string;
  x: number;
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function verifyTicket(ticket: unknown): TicketClaims | null {
  if (typeof ticket !== "string" || ticket.length > 512) return null;
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  let expected: string;
  try {
    expected = createHmac("sha256", TICKET_SECRET).update(payload).digest("base64url");
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TicketClaims;
    if (typeof claims.sub !== "string" || !claims.sub ||
        typeof claims.u !== "string" || typeof claims.n !== "string" ||
        typeof claims.e !== "string" || !Number.isFinite(claims.x)) return null;
    if (claims.x < Date.now()) return null; // expired
    return claims;
  } catch {
    return null;
  }
}

/* ------------------------------ helpers --------------------------------- */

function sendRaw(ws: WebSocket, raw: string) {
  if (ws.readyState !== WebSocket.OPEN) return;
  // A slow browser must not build an unbounded outbound queue. Disconnecting
  // it is safer than letting stale movement packets accumulate for seconds.
  if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
    try { ws.close(1013, "Client cannot keep up"); } catch { ws.terminate(); }
    return;
  }
  try {
    ws.send(raw, (error) => {
      if (error) ws.terminate();
    });
  } catch {
    ws.terminate();
  }
}

function send(ws: WebSocket, packet: Record<string, unknown>) {
  sendRaw(ws, JSON.stringify(packet));
}

function sendSnapshot(ws: WebSocket, raw: string): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  // Movement updates are replaceable: skip a frame instead of queueing stale
  // positions. Repeated congestion closes the slow client at the hard limit.
  if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
    try { ws.close(1013, "Client cannot keep up"); } catch { ws.terminate(); }
    return false;
  }
  if (ws.bufferedAmount > SNAPSHOT_DROP_BYTES) return false;
  try {
    ws.send(raw, (error) => {
      if (error) ws.terminate();
    });
    return true;
  } catch {
    ws.terminate();
    return false;
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const angleDelta = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Build a coarse X/Z grid once per tick so each client checks nearby cells,
 * rather than comparing itself with every other player in the whole session. */
function buildSpatialGrid(s: Session) {
  const grid = new Map<string, Player[]>();
  for (const p of s.players.values()) {
    const cx = Math.floor(p.pos.x / VIEW_RADIUS);
    const cz = Math.floor(p.pos.z / VIEW_RADIUS);
    const key = `${cx}:${cz}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(p);
    else grid.set(key, [p]);
  }
  return grid;
}

function nearbyPlayers(player: Player, grid: Map<string, Player[]>): Player[] {
  const cx = Math.floor(player.pos.x / VIEW_RADIUS);
  const cz = Math.floor(player.pos.z / VIEW_RADIUS);
  const radiusSq = VIEW_RADIUS * VIEW_RADIUS;
  const candidates: { player: Player; distanceSq: number }[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const bucket = grid.get(`${cx + dx}:${cz + dz}`);
      if (!bucket) continue;
      for (const other of bucket) {
        if (other.id === player.id) continue;
        const x = other.pos.x - player.pos.x;
        const z = other.pos.z - player.pos.z;
        const distanceSq = x * x + z * z;
        if (distanceSq <= radiusSq) candidates.push({ player: other, distanceSq });
      }
    }
  }
  candidates.sort((a, b) => a.distanceSq - b.distanceSq);
  return candidates.slice(0, MAX_VISIBLE_PLAYERS).map((entry) => entry.player);
}

function leaveSession(player: Player) {
  const s = registry.get(player.sessionId);
  if (!s) return;
  // close/error/heartbeat paths can race; broadcast leave only once.
  if (!s.players.delete(player.id)) return;
  s.lastActivity = Date.now();
  for (const p of s.players.values()) {
    p.visibleIds.delete(player.id);
    p.lastSnapshot.delete(player.id);
    send(p.ws, { type: "player:left", id: player.id, name: player.displayName });
  }
  if (s.players.size === 0) {
    // kept until SESSION_IDLE_MS so rejoiners find the same room; GC sweeps
    s.lastActivity = Date.now();
  }
}

/* ------------------------------- loops ---------------------------------- */

/**
 * Interest-managed delta snapshots. Each client receives only its nearest
 * visible avatars, and only transforms that changed (plus a 1s refresh).
 * This avoids the old full-session N×N broadcast on every tick.
 */
setInterval(() => {
  const now = Date.now();
  for (const s of registry.all()) {
    if (s.players.size === 0) continue;
    const grid = buildSpatialGrid(s);
    for (const p of s.players.values()) {
      if (p.ws.readyState !== WebSocket.OPEN) continue;
      const nearby = nearbyPlayers(p, grid);
      const nextVisible = new Set(nearby.map((other) => other.id));
      const hidden = [...p.visibleIds].filter((id) => !nextVisible.has(id));

      const changed: { id: string; x: number; y: number; z: number; yaw: number }[] = [];
      const sentTransforms: { id: string; x: number; y: number; z: number; yaw: number }[] = [];
      for (const other of nearby) {
        const previous = p.lastSnapshot.get(other.id);
        const dx = previous ? other.pos.x - previous.x : Infinity;
        const dy = previous ? other.pos.y - previous.y : Infinity;
        const dz = previous ? other.pos.z - previous.z : Infinity;
        const moved = !previous || dx * dx + dy * dy + dz * dz >= 0.04 || angleDelta(other.yaw, previous.yaw) >= 0.02;
        const refresh = !previous || now - previous.at >= 1000;
        if (moved || refresh) {
          const transform = {
            id: other.id,
            x: round2(other.pos.x),
            y: round2(other.pos.y),
            z: round2(other.pos.z),
            yaw: round2(other.yaw),
          };
          changed.push(transform);
          sentTransforms.push(transform);
        }
      }
      if (changed.length || hidden.length) {
        const sent = sendSnapshot(p.ws, JSON.stringify({ type: "snapshot", t: now, players: changed, hidden }));
        // Only advance per-client replication state once the frame was queued;
        // otherwise a skipped frame could leave a remote avatar stale forever.
        if (sent) {
          p.visibleIds = nextVisible;
          for (const id of hidden) p.lastSnapshot.delete(id);
          for (const transform of sentTransforms) {
            p.lastSnapshot.set(transform.id, { x: transform.x, y: transform.y, z: transform.z, yaw: transform.yaw, at: now });
          }
        }
      }
    }
  }
}, 1000 / SNAPSHOT_HZ).unref?.();

/** Empty-session GC + dead-connection heartbeat. */
setInterval(() => {
  const now = Date.now();
  for (const s of registry.all()) {
    if (s.players.size === 0 && now - s.lastActivity > SESSION_IDLE_MS) {
      registry.remove(s.id);
      continue;
    }
    for (const p of s.players.values()) {
      if (now - p.strikeWindow > 60_000) {
        p.strikes = 0;
        p.strikeWindow = now;
      }
      if (p.ws.readyState === WebSocket.OPEN) {
        if (!p.alive) {
          p.ws.terminate();
          leaveSession(p);
          continue;
        }
        p.alive = false;
        try {
          p.ws.ping();
        } catch {
          p.ws.terminate();
          leaveSession(p);
        }
      }
    }
  }
}, PING_MS).unref?.();

/* ------------------------------ server ---------------------------------- */

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_FRAME_BYTES,
  perMessageDeflate: false,
  clientTracking: false,
});

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  // CSWSH defense — production requires an exact, non-empty origin allow-list.
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

  let player: Player | null = null;
  let msgCount = 0;
  let messageWindowStart = Date.now();

  // auth timeout — unauthenticated sockets never join a session
  const authTimer = setTimeout(() => {
    if (!player) ws.close(4001, "Authentication timeout");
  }, AUTH_TIMEOUT_MS);
  authTimer.unref?.();

  ws.on("pong", () => {
    if (player) player.alive = true;
  });

  ws.on("message", (raw) => {
    const messageNow = Date.now();
    if (messageNow - messageWindowStart >= 1000) {
      messageWindowStart = messageNow;
      msgCount = 0;
    }
    if (++msgCount > MSG_RATE) return;
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

    /* ------------------------- auth + join ------------------------- */
    if (type === "auth") {
      if (player) return; // already authenticated
      const experienceId = String(packet.experienceId ?? "").slice(0, 80).trim();
      if (!experienceId) {
        send(ws, { type: "error", message: "Missing experience id." });
        ws.close(4002, "Bad auth");
        return;
      }

      let claims: TicketClaims | null = null;
      let username = "";
      let displayName = "";
      let userId = "";
      if (TICKET_SECRET) {
        claims = verifyTicket(packet.ticket);
        if (!claims || claims.e !== experienceId) {
          send(ws, { type: "error", message: "Invalid, expired, or mismatched ticket." });
          ws.close(4001, "Invalid ticket");
          return;
        }
        // Never trust identity fields sent by the browser in signed mode.
        username = claims.u;
        displayName = claims.n;
        userId = claims.sub;
      } else {
        // Unsigned identity is explicitly restricted to local development.
        if (process.env.NODE_ENV === "production") {
          send(ws, { type: "error", message: "Server ticket authentication is not configured." });
          ws.close(4001, "Authentication unavailable");
          return;
        }
        username = String(packet.username ?? "").replace(/[^a-zA-Z0-9_ ]/g, "").slice(0, 20).trim();
        if (!username) {
          send(ws, { type: "error", message: "Missing player name." });
          ws.close(4002, "Bad auth");
          return;
        }
        displayName = String(packet.displayName ?? username).slice(0, 24).trim() || username;
        userId = `dev:${username.toLowerCase()}`;
      }

      // reconnect: kick a previous socket with the same username
      for (const s of registry.all()) {
        for (const p of s.players.values()) {
          if (p.userId === userId && s.experienceId === experienceId) {
            send(p.ws, { type: "kicked", reason: "You signed in from another window." });
            p.ws.close(4000, "Replaced by new connection");
            leaveSession(p);
          }
        }
      }

      const session = registry.findOpen(experienceId) ?? registry.create(experienceId);
      if (session.players.size >= MAX_PLAYERS) {
        send(ws, { type: "error", message: `Session is full (${MAX_PLAYERS} players).` });
        ws.close(4004, "Session full");
        return;
      }

      const id = nextId();
      const now = Date.now();
      player = {
        id,
        userId,
        username,
        displayName,
        color: colorFor(username),
        sessionId: session.id,
        ws,
        pos: { x: num(packet.x, 0), y: num(packet.y, 1), z: num(packet.z, 0) },
        yaw: num(packet.yaw, 0),
        positioned: Number.isFinite(packet.x) && Number.isFinite(packet.y) && Number.isFinite(packet.z),
        strikes: 0,
        strikeWindow: now,
        chatTimes: [],
        alive: true,
        visibleIds: new Set<string>(),
        lastSnapshot: new Map(),
      };
      session.players.set(id, player);
      session.lastActivity = now;

      send(ws, {
        type: "welcome",
        id,
        sessionId: session.id,
        experienceId,
        verified: !!claims,
        maxPlayers: MAX_PLAYERS,
        players: [...session.players.values()].filter((p) => p.id !== id).map((p) => ({
          id: p.id,
          name: p.displayName,
          color: p.color,
          x: round2(p.pos.x),
          y: round2(p.pos.y),
          z: round2(p.pos.z),
          yaw: round2(p.yaw),
        })),
      });
      for (const p of session.players.values()) {
        if (p.id !== id) send(p.ws, { type: "player:joined", player: { id, name: displayName, color: player.color } });
      }
      return;
    }

    if (!player) return; // every other packet requires auth
    const session = registry.get(player.sessionId);
    if (!session) return;

    /* ---------------------------- movement --------------------------- */
    if (type === "state") {
      const x = packet.x;
      const y = packet.y;
      const z = packet.z;
      const yaw = packet.yaw;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(yaw)) return;
      if (Math.abs(x) > WORLD_LIMIT || Math.abs(y) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return; // out of world

      if (!player.positioned) {
        // first report after auth = the client's local spawn point — accept it
        player.pos = { x, y, z };
        player.yaw = yaw;
        player.positioned = true;
        return;
      }

      // speed validation against the canonical position
      const dt = Math.max(0.05, 1 / SNAPSHOT_HZ);
      const dh = Math.hypot(x - player.pos.x, z - player.pos.z);
      const dv = Math.abs(y - player.pos.y);
      if (dh > MAX_SPEED_H * dt * 4 || dv > MAX_SPEED_V * dt * 4) {
        player.strikes++;
        if (player.strikes > 60) {
          send(ws, { type: "kicked", reason: "Movement validation failed too many times." });
          ws.close(4005, "Movement violations");
          return;
        }
        return; // reject: impossible movement — keep last valid transform
      }
      player.pos = { x, y, z };
      player.yaw = yaw;
      return;
    }

    /* ------------------------------ chat ----------------------------- */
    if (type === "chat") {
      const text = String(packet.text ?? "").slice(0, MAX_CHAT_LEN).trim();
      if (!text) return;
      const now = Date.now();
      player.chatTimes = player.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS);
      if (player.chatTimes.length >= CHAT_MAX_IN_WINDOW) {
        send(ws, { type: "error", message: "You are sending chat too fast." });
        return;
      }
      player.chatTimes.push(now);
      // server-attributed identity — packet name/userId fields are ignored
      const raw = JSON.stringify({ type: "chat", name: player.displayName, text });
      for (const p of session.players.values()) {
        if (p.id !== player.id) sendRaw(p.ws, raw);
      }
      return;
    }
    // unknown packet types are ignored (fail-safe)
  });

  ws.on("close", () => {
    clearTimeout(authTimer);
    if (player) leaveSession(player);
  });
  ws.on("error", () => {
    clearTimeout(authTimer);
    if (player) leaveSession(player);
  });
});

function num(v: unknown, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(WORLD_LIMIT, Math.max(-WORLD_LIMIT, n)) : dflt;
}

/* --------------------------- tiny HTTP side ----------------------------- */

import { createServer } from "node:http";
const http = createServer((req, res) => {
  if (req.url === "/health") {
    const sessions = registry.all();
    res.writeHead(200, { "Content-Type": "application/json" });
    const activePlayers = sessions.reduce((n, s) => n + s.players.size, 0);
    let totalBufferedBytes = 0;
    let maxBufferedBytes = 0;
    let openSockets = 0;
    for (const session of sessions) {
      for (const player of session.players.values()) {
        if (player.ws.readyState !== WebSocket.OPEN) continue;
        const buffered = player.ws.bufferedAmount;
        totalBufferedBytes += buffered;
        maxBufferedBytes = Math.max(maxBufferedBytes, buffered);
        openSockets++;
      }
    }
    res.end(
      JSON.stringify({
        ok: true,
        mode: TICKET_SECRET ? "ticket-auth" : "dev",
        sessions: sessions.filter((s) => s.players.size > 0).length,
        players: activePlayers,
        openSockets,
        maxPlayersPerSession: MAX_PLAYERS,
        snapshotHz: SNAPSHOT_HZ,
        viewRadius: VIEW_RADIUS,
        maxVisiblePlayersPerClient: MAX_VISIBLE_PLAYERS,
        snapshotMode: "nearby-delta",
        averageSocketBufferedBytes: openSockets ? Math.round(totalBufferedBytes / openSockets) : 0,
        maxSocketBufferedBytes: maxBufferedBytes,
        processRssBytes: process.memoryUsage().rss,
      }),
    );
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Blockyard game-server (WebSocket). Connect via /?XTransformPort=3004");
});

http.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

http.listen(PORT, () => {
  console.log(
    `[game-server] listening on ws://localhost:${PORT} (max ${MAX_PLAYERS} players/session, ` +
      `${SNAPSHOT_HZ}Hz nearby-delta snapshots, ${VIEW_RADIUS} stud radius, ` +
      `max ${MAX_VISIBLE_PLAYERS} visible/client, ${TICKET_SECRET ? "signed-ticket auth" : "DEV MODE — unsigned identity"})` +
      (ALLOWED_ORIGINS.length ? ` origins: ${ALLOWED_ORIGINS.join(", ")}` : ""),
  );
});
