/* Integration test: BloxScript tool + animation scripting API.
 * Runs scripts against a mock BloxHost implementing the exact
 * contract the PlayController provides, then asserts the side effects
 * (tool created, granted, equipped, events fired, track played —
 * on the player AND on an NPC dummy rig). */
import { createRuntime, type BloxHost, type BloxRuntime } from "../src/lib/studio/bloxscript.ts";
import type { PartData, ScriptData } from "../src/lib/studio/types.ts";

/* ------------------------- mock host ------------------------- */
interface MockTool { id: string; name: string; toolTip: string; requiresHandle: boolean; canBeDropped: boolean }

const logs: string[] = [];
const tools: MockTool[] = [];
const granted: string[] = [];      // def ids granted to backpack
const equipped: string[] = [];     // def ids equipped
const trackOps: string[] = [];     // animation track operations
let currentTrack = 0;
const tracks = new Map<string, { name: string; playing: boolean; speed: number }>();
const loadCalls: { name: string; rigId?: string }[] = []; // LoadAnimation(target) calls

/* a Dummy rig model in the Workspace (R6 limb part names) */
const DUMMY_ID = "m_dummy";
const rigPart = (name: string): PartData => ({
  id: `p_${name.replace(/\s+/g, "_").toLowerCase()}`,
  name,
  shape: "Block",
  position: [0, 3, 8],
  rotation: [0, 0, 0],
  size: name === "Torso" ? [2, 2, 1] : [1, 2, 1],
  color: "Bright yellow",
  material: "SmoothPlastic",
  transparency: 0,
  reflectance: 0,
  anchored: true,
  canCollide: true,
  castShadow: true,
  parentId: DUMMY_ID,
});
const dummyParts = ["Torso", "Head", "Left Arm", "Right Arm", "Left Leg", "Right Leg"].map(rigPart);

const host: BloxHost = {
  log: (level, text) => logs.push(`[${level}] ${text}`),
  getParts: (): PartData[] => dummyParts,
  getPart: (id) => dummyParts.find((p) => p.id === id) ?? null,
  updatePart: () => {},
  renamePart: () => {},
  createPart: () => null,
  createModel: () => "model_1",
  deletePart: () => {},
  getModels: () => [{ id: DUMMY_ID, name: "Dummy" }],
  modelIsRig: (id) => id === DUMMY_ID,
  getScripts: () => [],
  getScript: () => null,
  getPlayer: () => ({ name: "TestPlayer", position: [0, 5, 0] }),
  setLighting: () => {},
  getLighting: () => ({ clockTime: 14, fogEnd: 900, brightness: 2 }) as never,
  setBaseplateColor: () => {},
  getHumanoid: () => ({ health: 100, maxHealth: 100, walkSpeed: 16, jumpPower: 50 }),
  setHumanoid: () => {},
  humanoidTakeDamage: () => {},
  /* animation contract — rigId targets the NPC dummy */
  loadAnimation: (name, rigId) => {
    loadCalls.push({ name, rigId });
    const token = rigId ? `${rigId}#trk${++currentTrack}` : `trk${++currentTrack}`;
    tracks.set(token, { name, playing: false, speed: 1 });
    return { token, name, length: 2.5, looped: false };
  },
  trackPlay: (token) => { trackOps.push(`play:${token}`); const t = tracks.get(token); if (t) t.playing = true; },
  trackStop: (token) => { trackOps.push(`stop:${token}`); const t = tracks.get(token); if (t) t.playing = false; },
  trackAdjust: (token, patch) => { const t = tracks.get(token); if (t && patch.speed !== undefined) t.speed = patch.speed; },
  trackGet: (token, prop) => {
    const t = tracks.get(token);
    if (!t) return null;
    if (prop === "IsPlaying") return t.playing;
    if (prop === "Name") return t.name;
    if (prop === "Speed") return t.speed;
    if (prop === "Length") return 2.5;
    return null;
  },
  trackSet: () => {},
  /* tool contract */
  createTool: () => {
    const id = `scripttool${tools.length + 1}`;
    tools.push({ id, name: "Tool", toolTip: "", requiresHandle: true, canBeDropped: true });
    return id;
  },
  updateToolDef: (id, patch) => {
    const t = tools.find((x) => x.id === id);
    if (!t) return;
    if (patch.name !== undefined) t.name = patch.name;
    if (patch.toolTip !== undefined) t.toolTip = patch.toolTip;
    if (patch.requiresHandle !== undefined) t.requiresHandle = patch.requiresHandle;
    if (patch.canBeDropped !== undefined) t.canBeDropped = patch.canBeDropped;
  },
  getToolDefs: () => tools.map((t) => ({ id: t.id, name: t.name, toolTip: t.toolTip, requiresHandle: t.requiresHandle, canBeDropped: t.canBeDropped })),
  carriedToolByName: (name) => tools.find((t) => t.name.toLowerCase() === name.toLowerCase() && granted.includes(t.id))?.id ?? null,
  equipToolDef: (id) => {
    if (!tools.find((t) => t.id === id)) return false;
    if (!granted.includes(id)) granted.push(id);
    equipped.push(id);
    return true;
  },
  unequipTools: () => { if (equipped.length) equipped.pop(); },
  grantToolToBackpack: (id) => {
    if (!tools.find((t) => t.id === id)) return false;
    if (!granted.includes(id)) granted.push(id);
    return true;
  },
};

/* ------------------------- test scripts ------------------------- */
const playerSource = `
local tool = Instance.new("Tool")
tool.Name = "Med Wand"
tool.ToolTip = "+25 HP per click"
tool.RequiresHandle = false
tool.CanBeDropped = false
tool.Parent = game.StarterPack
print("created: " .. tool.Name)

local fired = {}
tool.Equipped:Connect(function() print("EQUIPPED"); fired.equipped = true end)
tool.Unequipped:Connect(function() print("UNEQUIPPED") end)
tool.Activated:Connect(function() print("ACTIVATED") end)

local hum = game.Players.LocalPlayer.Humanoid
hum:EquipTool(tool)

-- StarterPack lookup by name
local found = game.StarterPack:FindFirstChild("Med Wand")
print("found in StarterPack: " .. tostring(found ~= nil) .. " (" .. found.Name .. ")")

-- animation API on the PLAYER
local animator = hum:FindFirstChildOfClass("Animator")
local track = animator:LoadAnimation("Dance")
track:Play(0.2, 1, 1)
print("track: " .. track.Name .. " playing=" .. tostring(track.IsPlaying) .. " len=" .. track.Length)
track:AdjustSpeed(2)
print("speed now " .. track.Speed)
track:Stop()
print("playing after stop: " .. tostring(track.IsPlaying))

-- Backpack lookup
local backpack = game.Players.LocalPlayer.Backpack
print("in backpack: " .. tostring(backpack:FindFirstChild("Med Wand") ~= nil))
`;

const dummySource = `
-- the Wave Dummy template pattern: NPC animation via the rig's Animator
local dummy = workspace:FindFirstChild("Dummy")
print("dummy found: " .. tostring(dummy ~= nil))

local humanoid = dummy:FindFirstChild("Humanoid")
local animator = humanoid:FindFirstChild("Animator")
print("animator parent humanoid: " .. humanoid.Animator.ClassName)

local wave = animator:LoadAnimation("Wave")
wave:Play()
print("dummy track: " .. wave.Name .. " playing=" .. tostring(wave.IsPlaying))
wave:Stop()
print("stopped: " .. tostring(not wave.IsPlaying))

-- clicking the tool makes the dummy wave (the template's Activated body)
local tool2 = Instance.new("Tool")
tool2.Name = "Wave Wand"
tool2.ToolTip = "Click to make the Dummy wave"
tool2.Parent = game.StarterPack
tool2.Activated:Connect(function()
  wave:Play()
end)
`;

const mkScript = (id: string, source: string, kind: ScriptData["kind"] = "LocalScript"): ScriptData => ({
  id, name: id, kind, parentId: kind === "Script" ? "ServerScriptService" : "StarterPlayerScripts", source, enabled: true,
});

const rt: BloxRuntime = createRuntime(host, mkScript("script_player", playerSource));
const rt2: BloxRuntime = createRuntime(host, mkScript("script_dummy", dummySource, "Script"));

async function main() {
await rt.start();
await rt2.start();

/* the equip/activate events are fired by the play controller; simulate */
const toolId = tools[0]?.id ?? "";
rt.fireToolEvent(toolId, "equipped");
rt.fireToolEvent(toolId, "activated");
rt.fireBackpackChild(toolId);
/* simulate a click on the Wave Wand */
const wandId = tools.find((t) => t.name === "Wave Wand")?.id ?? "";
rt2.fireToolEvent(wandId, "activated");

await new Promise((r) => setTimeout(r, 50));

/* ------------------------- assertions ------------------------- */
const expect = (cond: boolean, label: string) => {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    console.error("logs:\n" + logs.join("\n"));
    process.exit(1);
  }
  console.log(`ok: ${label}`);
};

/* --- player tool + track (previous suite) --- */
expect(tools.length === 2, "two tools created via Instance.new(\"Tool\")");
expect(tools[0].name === "Med Wand", "tool renamed via .Name setter");
expect(tools[0].toolTip === "+25 HP per click", "ToolTip set");
expect(tools[0].requiresHandle === false, "RequiresHandle set");
expect(tools[0].canBeDropped === false, "CanBeDropped set");
expect(granted.includes(toolId), "tool granted when parented to StarterPack");
expect(equipped.includes(toolId), "tool equipped via Humanoid:EquipTool");
expect(trackOps.includes("play:trk1") && trackOps.includes("stop:trk1"), "player track Play + Stop called");
const t1 = tracks.get("trk1");
expect(!!t1 && t1.speed === 2, "AdjustSpeed applied");

/* --- NPC dummy rig animation (new suite) --- */
expect(loadCalls.some((c) => c.name === "Dance" && c.rigId === undefined), "player LoadAnimation has no rigId");
const rigCall = loadCalls.find((c) => c.name === "Wave");
expect(!!rigCall && rigCall.rigId === DUMMY_ID, "dummy LoadAnimation routed to the rig (rigId = model id)");
expect(trackOps.includes(`play:${DUMMY_ID}#trk2`), "dummy track Play routed with namespaced token");
expect(trackOps.includes(`stop:${DUMMY_ID}#trk2`), "dummy track Stop routed with namespaced token");
const t2 = tracks.get(`${DUMMY_ID}#trk2`);
expect(!!t2 && t2.name === "Wave", "dummy track resolved by namespaced token");
expect(trackOps.filter((op) => op === `play:${DUMMY_ID}#trk2`).length === 2, "Activated re-plays the dummy wave");

for (const line of logs) console.log(line);
console.log("\nALL TESTS PASSED");
}

main().catch((e) => { console.error(e); process.exit(1); });
