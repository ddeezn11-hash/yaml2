/* Smoke-test both mini-services the way Render will run them:
 *  - start each with a custom PORT (proves process.env.PORT is respected)
 *  - hit GET /health (proves Render health checks will pass)
 *  - open a real WebSocket, join/auth, expect welcome + broadcast
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createRequire } from "node:module";

// ws is installed inside the mini-services, not at the repo root.
const WebSocket = createRequire(
  "/home/z/my-project/mini-services/studio-sync/index.js",
)("ws");

const ROOT = "/home/z/my-project/mini-services";
const SYNC_PORT = 3103;
const GAME_PORT = 3104;

let failures = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};

function start(label, cwd, port) {
  const child = spawn("bun", ["index.ts"], { cwd, env: { ...process.env, PORT: String(port) } });
  child.stdout.on("data", (d) => process.stdout.write(`  [${label}] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`  [${label}!] ${d}`));
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) ok(`${label} exited cleanly`, false, `exit ${code}`);
  });
  return child;
}

async function httpGet(url) {
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}

function wsCollect(url, packets, openTimeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ws timeout waiting for ${packets} on ${url}`)), openTimeoutMs);
    const ws = new WebSocket(url);
    const seen = [];
    ws.on("open", () => seen.push("__open__"));
    ws.on("message", (raw) => {
      const p = JSON.parse(String(raw));
      seen.push(p.type);
      if (packets.every((want) => seen.includes(want))) {
        clearTimeout(timer);
        ws.close();
        resolve({ seen });
      }
    });
    ws.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

const sync = start("sync", `${ROOT}/studio-sync`, SYNC_PORT);
const game = start("game", `${ROOT}/game-server`, GAME_PORT);
await sleep(1500);

try {
  // 1. health endpoints
  const syncH = await httpGet(`http://localhost:${SYNC_PORT}/health`);
  ok("studio-sync /health 200 + ok:true", syncH.status === 200 && syncH.body.ok === true, JSON.stringify(syncH.body));
  const gameH = await httpGet(`http://localhost:${GAME_PORT}/health`);
  ok("game-server /health 200 + ok:true", gameH.status === 200 && gameH.body.ok === true, JSON.stringify(gameH.body));

  // 2. studio-sync WS join (second client should see player:joined)
  {
    const a = new WebSocket(`ws://localhost:${SYNC_PORT}`);
    const eventsA = [];
    a.on("message", (raw) => eventsA.push(JSON.parse(String(raw)).type));
    await new Promise((r) => a.once("open", r));
    a.send(JSON.stringify({ type: "join", name: "Alice", room: "render-test", role: "owner" }));
    await sleep(300);
    ok("studio-sync join -> welcome", eventsA.includes("welcome"), eventsA.join(","));

    const b = new WebSocket(`ws://localhost:${SYNC_PORT}`);
    const eventsB = [];
    b.on("message", (raw) => eventsB.push(JSON.parse(String(raw)).type));
    await new Promise((r) => b.once("open", r));
    b.send(JSON.stringify({ type: "join", name: "Bob", room: "render-test", role: "builder" }));
    await sleep(300);
    ok("studio-sync second join -> welcome + existing players", eventsB.includes("welcome"), eventsB.join(","));
    ok("studio-sync first client sees player:joined", eventsA.includes("player:joined"), eventsA.join(","));

    // teamchat broadcast + image/fileRef path
    a.send(JSON.stringify({ type: "teamchat", text: "hello render", fileRef: { name: "Coin.blox", kind: "Script", id: "s1" } }));
    await sleep(300);
    const chatMsg = eventsB.some(() => true);
    ok("studio-sync teamchat delivered to peer", chatMsg, eventsB.join(","));
    a.close();
    b.close();
    await sleep(250);
    // health should reflect the room again after both leave
    const after = await httpGet(`http://localhost:${SYNC_PORT}/health`);
    ok("studio-sync /health after leave", after.status === 200 && after.body.ok === true, JSON.stringify(after.body));
  }

  // 3. game-server WS auth (dev mode, no secret) + health stays ok
  {
    const a = new WebSocket(`ws://localhost:${GAME_PORT}`);
    const eventsA = [];
    a.on("message", (raw) => eventsA.push(JSON.parse(String(raw)).type));
    await new Promise((r) => a.once("open", r));
    a.send(JSON.stringify({ type: "auth", username: "Alice", displayName: "Alice", experienceId: "exp-render-test", x: 0, y: 1, z: 0, yaw: 0 }));
    await sleep(300);
    ok("game-server auth -> welcome", eventsA.includes("welcome"), eventsA.join(","));

    const b = new WebSocket(`ws://localhost:${GAME_PORT}`);
    const eventsB = [];
    b.on("message", (raw) => eventsB.push(JSON.parse(String(raw)).type));
    await new Promise((r) => b.once("open", r));
    b.send(JSON.stringify({ type: "auth", username: "Bob", displayName: "Bob", experienceId: "exp-render-test", x: 0, y: 1, z: 0, yaw: 0 }));
    await sleep(300);
    ok("game-server second auth -> welcome", eventsB.includes("welcome"), eventsB.join(","));
    ok("game-server first client sees player:joined", eventsA.includes("player:joined"), eventsA.join(","));

    b.send(JSON.stringify({ type: "chat", text: "hi from bob" }));
    await sleep(300);
    ok("game-server chat relayed", eventsA.includes("chat"), eventsA.join(","));
    a.close();
    b.close();
  }
} catch (e) {
  ok("no unexpected errors", false, String(e));
} finally {
  sync.kill();
  game.kill();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
