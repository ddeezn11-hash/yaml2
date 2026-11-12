/**
 * Blockyard 200-player WebSocket load test.
 *
 * Run from mini-services/game-server after `bun install`:
 *   GAME_SERVER_TICKET_SECRET='...' bun run load-test -- 200
 *
 * For a deployed service, also set:
 *   LOAD_TEST_URL=wss://YOUR-GAME-SERVER.onrender.com
 *   LOAD_TEST_ORIGIN=https://YOUR-WEBSITE.onrender.com
 *   LOAD_TEST_DURATION_SECONDS=30
 *
 * This simulates connections and 15Hz movement traffic. It is a capacity
 * check, not proof that 200 real browsers render at a given frame rate.
 */
import { createHmac } from "node:crypto";
import WebSocket from "ws";

const GAME_URL = process.env.LOAD_TEST_URL ?? "ws://localhost:3004";
const ORIGIN = process.env.LOAD_TEST_ORIGIN ?? "http://localhost:3000";
const SECRET = process.env.GAME_SERVER_TICKET_SECRET ?? "";
const EXPERIENCE_ID = process.env.LOAD_TEST_EXPERIENCE_ID ?? "blockyard-load-test";
const TARGET = clamp(Number(process.argv[2] ?? 200), 1, 200);
const DURATION_SECONDS = clamp(Number(process.env.LOAD_TEST_DURATION_SECONDS ?? 30), 5, 300);
const STATE_INTERVAL_MS = 1000 / 15;

if (!SECRET) {
  console.error("Missing GAME_SERVER_TICKET_SECRET. Use the exact secret configured on the game server.");
  process.exit(1);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? Math.floor(value) : min));
}

function makeTicket(index: number) {
  const claims = {
    sub: `load-test-user-${index}`,
    u: `LoadTest${index}`,
    n: `Load Test ${index}`,
    e: EXPERIENCE_ID,
    x: Date.now() + 60 * 60 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

type Client = {
  ws: WebSocket;
  index: number;
  baseX: number;
  baseZ: number;
  phase: number;
  snapshots: number;
  updates: number;
  hidden: number;
  peakBuffered: number;
  welcome: boolean;
};

function connectClient(index: number): Promise<Client> {
  // Spread the crowd over a broad area so AOI filtering is exercised.
  const columns = 20;
  const spacing = 26;
  const baseX = ((index % columns) - columns / 2) * spacing;
  const baseZ = (Math.floor(index / columns) - 5) * spacing;
  const ws = new WebSocket(GAME_URL, { headers: { Origin: ORIGIN } });
  const client: Client = {
    ws, index, baseX, baseZ, phase: index * 0.31,
    snapshots: 0, updates: 0, hidden: 0, peakBuffered: 0, welcome: false,
  };

  return new Promise((resolve, reject) => {
    const connectTimeoutMs = clamp(Number(process.env.LOAD_TEST_CONNECT_TIMEOUT_MS ?? 60_000), 5_000, 120_000);
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Client ${index} timed out during connect/auth`));
    }, connectTimeoutMs);

    ws.once("open", () => {
      ws.send(JSON.stringify({
        type: "auth",
        experienceId: EXPERIENCE_ID,
        ticket: makeTicket(index),
        x: baseX,
        y: 4,
        z: baseZ,
        yaw: 0,
      }));
    });

    ws.on("message", (raw) => {
      let packet: Record<string, unknown>;
      try { packet = JSON.parse(String(raw)) as Record<string, unknown>; }
      catch { return; }
      if (packet.type === "welcome" && !client.welcome) {
        client.welcome = true;
        clearTimeout(timeout);
        resolve(client);
      } else if (packet.type === "snapshot") {
        client.snapshots++;
        if (Array.isArray(packet.players)) client.updates += packet.players.length;
        if (Array.isArray(packet.hidden)) client.hidden += packet.hidden.length;
      } else if (packet.type === "error") {
        if (!client.welcome) {
          clearTimeout(timeout);
          reject(new Error(`Client ${index}: ${String(packet.message ?? "server error")}`));
        }
      }
    });

    ws.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Client ${index}: ${error.message}`));
    });
    ws.once("close", (code, reason) => {
      if (!client.welcome) {
        clearTimeout(timeout);
        reject(new Error(`Client ${index} closed before welcome: ${code} ${String(reason)}`));
      }
    });
  });
}

async function main() {
  console.log(`Connecting ${TARGET} simulated players to ${GAME_URL}`);
  console.log(`Experience: ${EXPERIENCE_ID}; allowed origin: ${ORIGIN}`);
  const connectStarted = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: TARGET }, (_, index) => connectClient(index + 1)),
  );
  const clients = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const failures = results.filter((result) => result.status === "rejected");
  const connectSeconds = (Date.now() - connectStarted) / 1000;
  console.log(`Connected ${clients.length}/${TARGET} in ${connectSeconds.toFixed(1)}s; failed: ${failures.length}`);
  for (const failure of failures.slice(0, 10)) {
    if (failure.status === "rejected") console.log(`  connect error: ${String(failure.reason)}`);
  }
  if (!clients.length) process.exit(1);

  const start = Date.now();
  let ticks = 0;
  const movementTimer = setInterval(() => {
    const elapsed = (Date.now() - start) / 1000;
    for (const client of clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      const a = elapsed * 0.45 + client.phase;
      client.ws.send(JSON.stringify({
        type: "state",
        x: client.baseX + Math.sin(a) * 8,
        y: 4,
        z: client.baseZ + Math.cos(a * 0.8) * 8,
        yaw: a,
      }));
      client.peakBuffered = Math.max(client.peakBuffered, client.ws.bufferedAmount);
    }
    ticks++;
  }, STATE_INTERVAL_MS);

  await new Promise((resolve) => setTimeout(resolve, DURATION_SECONDS * 1000));
  clearInterval(movementTimer);

  const duration = (Date.now() - start) / 1000;
  const stillOpen = clients.filter((client) => client.ws.readyState === WebSocket.OPEN).length;
  const snapshots = clients.reduce((sum, client) => sum + client.snapshots, 0);
  const updates = clients.reduce((sum, client) => sum + client.updates, 0);
  const hidden = clients.reduce((sum, client) => sum + client.hidden, 0);
  const maxBuffered = Math.max(0, ...clients.map((client) => client.peakBuffered));
  console.log("\n--- Load test summary ---");
  console.log(`Target clients: ${TARGET}`);
  console.log(`Still connected: ${stillOpen}/${clients.length}`);
  console.log(`Duration: ${duration.toFixed(1)}s; movement ticks: ${ticks}`);
  console.log(`Average incoming snapshots/client/sec: ${(snapshots / Math.max(1, clients.length) / duration).toFixed(2)}`);
  console.log(`Transform updates received: ${updates}`);
  console.log(`Interest-range exits: ${hidden}`);
  console.log(`Largest load-generator outbound buffer: ${(maxBuffered / 1024).toFixed(1)} KiB`);

  const healthUrl = GAME_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/$/, "") + "/health";
  try {
    const response = await fetch(healthUrl);
    console.log(`Server health (${response.status}): ${JSON.stringify(await response.json())}`);
  } catch (error) {
    console.log(`Could not fetch health endpoint: ${String(error)}`);
  }

  for (const client of clients) {
    try { client.ws.close(1000, "Load test finished"); } catch { client.ws.terminate(); }
  }
  if (stillOpen !== clients.length || clients.length !== TARGET) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
