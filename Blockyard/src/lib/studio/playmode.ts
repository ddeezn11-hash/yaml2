import * as THREE from "three";
import type { StudioEngine } from "./engine";
import type { CustomToolData, PartData, PartShape, ToolBehavior, Vec3 } from "./types";
import { brickColorHex, normalizeToolData } from "./data";
import { createRuntime, type BloxHost, type BloxRuntime } from "./bloxscript";
import { ANIM_PRESETS, type AnimPreset } from "./animlibrary";
import { AvatarAnimator, PartRigAnimator, type AnimTrackHandle, type LoadableAnim, type RelKey, type TrackPlayer } from "./animruntime";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(v, b));
const d2r = Math.PI / 180;

/* Roblox-ish physics */
const WALK_SPEED = 16;
const GRAVITY = 196.2;
const JUMP_POWER = 50;
const PLAYER_HALF_W = 0.95;
const PLAYER_HALF_D = 0.55;
const PLAYER_HEIGHT = 4.62;
const SKIN = 0.04;
const GROUND_Y = 0;
const SWORD_DAMAGE = 34;
const SWORD_REACH = 8;
const FALL_DEATH_Y = -80;

/* ------------------------------------------------------------------ */
/* Classic R6 avatar builder (shared by local + remote characters).   */
/* ------------------------------------------------------------------ */
export interface R6Avatar {
  root: THREE.Group;
  /** Upper-body pivot (torso mesh + arms + head) — animation target. */
  torso: THREE.Group;
  /** Head pivot (skull + face) — animation target. */
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

function mat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
}

// Remote-player avatars share immutable geometry/material assets. With dozens
// of nearby players this avoids allocating hundreds of duplicate geometries
// and materials. Remote parts do not cast shadows; this reduces GPU work.
const remoteAvatarGeometry = new Map<string, THREE.BufferGeometry>();
const remoteAvatarMaterial = new Map<number, THREE.MeshStandardMaterial>();
function remoteBoxGeometry(width: number, height: number, depth: number) {
  const key = `${width}:${height}:${depth}`;
  let geometry = remoteAvatarGeometry.get(key);
  if (!geometry) {
    geometry = new THREE.BoxGeometry(width, height, depth);
    remoteAvatarGeometry.set(key, geometry);
  }
  return geometry;
}
function remoteMaterial(color: number) {
  let material = remoteAvatarMaterial.get(color);
  if (!material) {
    material = mat(color);
    remoteAvatarMaterial.set(color, material);
  }
  return material;
}
let remoteSmileGeometry: THREE.TubeGeometry | null = null;

export function buildR6Avatar(
  shirtHex = 0x1769c2,
  pantsHex = 0x2b9b45,
  skinHex = 0xf5c542,
  shareAssets = false,
): R6Avatar {
  const root = new THREE.Group();
  const skin = shareAssets ? remoteMaterial(skinHex) : mat(skinHex);
  const shirt = shareAssets ? remoteMaterial(shirtHex) : mat(shirtHex);
  const pants = shareAssets ? remoteMaterial(pantsHex) : mat(pantsHex);
  const face = shareAssets ? remoteMaterial(0x171717) : mat(0x171717);
  const box = (w: number, h: number, d: number) => shareAssets
    ? remoteBoxGeometry(w, h, d)
    : new THREE.BoxGeometry(w, h, d);
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, shadow = !shareAssets) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = !shareAssets;
    parent.add(m);
    return m;
  };
  // upper-body pivots so animations can pose the torso and the head
  const torso = new THREE.Group();
  torso.position.set(0, 2.72, 0);
  root.add(torso);
  add(torso, box(1.8, 1.8, 0.9), shirt, 0, 0, 0);
  const head = new THREE.Group();
  head.position.set(0, 1.4, 0);
  torso.add(head);
  add(head, box(1, 1, 1), skin, 0, 0, 0);
  add(head, box(0.115, 0.14, 0.025), face, -0.22, 0.1, -0.513, false);
  add(head, box(0.115, 0.14, 0.025), face, 0.22, 0.1, -0.513, false);
  const smile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.19, 1.28, -0.514),
    new THREE.Vector3(-0.1, 1.23, -0.525),
    new THREE.Vector3(0, 1.22, -0.529),
    new THREE.Vector3(0.1, 1.23, -0.525),
    new THREE.Vector3(0.19, 1.28, -0.514),
  ]);
  if (shareAssets && !remoteSmileGeometry) {
    remoteSmileGeometry = new THREE.TubeGeometry(smile, 16, 0.018, 5, false);
  }
  const smileGeometry = shareAssets
    ? remoteSmileGeometry!
    : new THREE.TubeGeometry(smile, 16, 0.018, 5, false);
  const smileMesh = new THREE.Mesh(smileGeometry, face);
  head.add(smileMesh);

  const leftArm = new THREE.Group();
  leftArm.position.set(-1.35, 0.8, 0);
  torso.add(leftArm);
  add(leftArm, box(0.9, 1.8, 0.9), skin, 0, -0.9, 0);
  const rightArm = new THREE.Group();
  rightArm.position.set(1.35, 0.8, 0);
  torso.add(rightArm);
  add(rightArm, box(0.9, 1.8, 0.9), skin, 0, -0.9, 0);
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.455, 1.82, 0);
  root.add(leftLeg);
  add(leftLeg, box(0.89, 1.82, 0.9), pants, 0, -0.91, 0);
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.455, 1.82, 0);
  root.add(rightLeg);
  add(rightLeg, box(0.89, 1.82, 0.9), pants, 0, -0.91, 0);
  return { root, torso, head, leftArm, rightArm, leftLeg, rightLeg };
}

export function makeNameplate(name: string, color = "#ffffff"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "rgba(17,25,39,.78)";
  c.beginPath();
  c.roundRect(12, 8, 232, 48, 12);
  c.fill();
  c.font = "bold 24px system-ui";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = color;
  c.fillText(String(name || "Player").slice(0, 20), 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(4.2, 1.05, 1);
  sprite.position.set(0, 5.3, 0);
  return sprite;
}

/** Nameplate with a live health bar (used for bots). */
function makeHealthNameplate(name: string): { sprite: THREE.Sprite; redraw: (frac: number) => void; dispose: () => void } {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 88;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  const draw = (frac: number) => {
    ctx.clearRect(0, 0, 256, 88);
    ctx.fillStyle = "rgba(17,25,39,.78)";
    ctx.beginPath();
    ctx.roundRect(12, 4, 232, 38, 10);
    ctx.fill();
    ctx.font = "bold 21px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(name || "Bot").slice(0, 18), 128, 23);
    ctx.fillStyle = "rgba(17,25,39,.8)";
    ctx.beginPath();
    ctx.roundRect(36, 52, 184, 16, 8);
    ctx.fill();
    const f = clamp(frac, 0, 1);
    ctx.fillStyle = f > 0.5 ? "#2ecc71" : f > 0.25 ? "#f39c12" : "#e74c3c";
    ctx.beginPath();
    ctx.roundRect(38, 54, Math.max(3, 180 * f), 12, 6);
    ctx.fill();
    tex.needsUpdate = true;
  };
  draw(1);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(4.6, 1.58, 1);
  sprite.position.set(0, 5.7, 0);
  return {
    sprite,
    redraw: draw,
    dispose: () => {
      tex.dispose();
      sprite.material.dispose();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tools + custom inventory (the Roblox Backpack pattern)             */
/*                                                                    */
/* Mirrors the creator-guide model:                                   */
/*  - Tool *definitions* ("templates") live in StarterPack.           */
/*  - On spawn, copies are granted into the runtime Backpack.         */
/*  - Equipping MOVES a tool from Backpack into the Character;        */
/*    unequipping moves it back (Humanoid:EquipTool semantics).      */
/*  - The visible hotbar/grid (InventoryHud) is only an interface —   */
/*    this controller is the "server" that validates every action    */
/*    (capacity, cooldown, CanBeDropped, pickup distance).           */
/* ------------------------------------------------------------------ */

/** A tool definition as the play engine sees it: defaults + user-created ones. */
export interface RuntimeTool {
  id: string;
  name: string;
  icon: string;
  desc: string;
  behavior: ToolBehavior;
  damage: number;
  reach: number;
  speedMult: number;
  jumpMult: number;
  healAmount: number;
  handleShape: PartShape;
  handleColor: string;
  custom: boolean;
  /* Roblox Tool properties */
  toolTip: string;
  requiresHandle: boolean;
  canBeDropped: boolean;
  /** Seconds between activations — gates Tool.Enabled. */
  cooldown: number;
  /** Uses before the tool breaks; 0 = never breaks. */
  maxDurability: number;
}

const DEFAULT_TOOLS: RuntimeTool[] = [
  { id: "sword", name: "Sword", icon: "⚔️", desc: "Click to slash — damages bots in front of you", behavior: "sword", damage: SWORD_DAMAGE, reach: SWORD_REACH, speedMult: 1, jumpMult: 1, healAmount: 0, handleShape: "Block", handleColor: "Medium stone grey", custom: false, toolTip: "A classic blade. Click to swing.", requiresHandle: true, canBeDropped: true, cooldown: 0.45, maxDurability: 0 },
  { id: "speedcoil", name: "Speed Coil", icon: "🌀", desc: "While equipped: +75% walk speed", behavior: "speed", damage: 0, reach: 0, speedMult: 1.75, jumpMult: 1, healAmount: 0, handleShape: "Cylinder", handleColor: "Toothpaste", custom: false, toolTip: "Hold it to run fast.", requiresHandle: true, canBeDropped: true, cooldown: 0, maxDurability: 0 },
  { id: "gravitycoil", name: "Gravity Coil", icon: "🎈", desc: "While equipped: +35% jump power, slow fall", behavior: "gravity", damage: 0, reach: 0, speedMult: 1, jumpMult: 1.35, healAmount: 0, handleShape: "Cylinder", handleColor: "Magenta", custom: false, toolTip: "Hold it to jump high and fall slowly.", requiresHandle: true, canBeDropped: true, cooldown: 0, maxDurability: 0 },
  { id: "flashlight", name: "Flashlight", icon: "🔦", desc: "Click to toggle the beam", behavior: "flashlight", damage: 0, reach: 0, speedMult: 1, jumpMult: 1, healAmount: 0, handleShape: "Cylinder", handleColor: "New Yeller", custom: false, toolTip: "Click while holding to toggle the light.", requiresHandle: true, canBeDropped: true, cooldown: 0.15, maxDurability: 0 },
];

/** Backpack capacity (grid slots). */
const MAX_BACKPACK = 20;
/** Hotbar slots — number keys 1-9. */
const MAX_HOTBAR = 9;
/** How close you must be to pick a dropped tool up (studs). */
const PICKUP_RANGE = 5;
/** Dropped tools kept in the world at once. */
const WORLD_TOOL_CAP = 12;

/** One owned copy in the runtime backpack — the guide's "owned item record". */
export interface OwnedTool {
  /** Unique instance id (two Swords have different uids). */
  uid: string;
  /** The definition this copy was cloned from. */
  def: RuntimeTool;
  /** Remaining uses; -1 = unlimited. */
  durability: number;
  /** Hotbar slot 0-8; -1 = grid only. */
  slot: number;
}

/** A tool dropped in the world, waiting to be picked up. */
interface WorldTool {
  def: RuntimeTool;
  durability: number;
  mesh: THREE.Group;
  spin: number;
}

/** Default tools + the place's custom StarterPack tools (normalized). */
export function mergeTools(custom: CustomToolData[]): RuntimeTool[] {
  const customs: RuntimeTool[] = custom.map((raw) => {
    const t = normalizeToolData(raw);
    return {
      id: t.id,
      name: t.name,
      icon: t.icon,
      desc: t.desc,
      behavior: t.behavior,
      damage: t.damage,
      reach: t.reach,
      speedMult: t.speedMult,
      jumpMult: t.jumpMult,
      healAmount: t.healAmount,
      handleShape: t.handleShape,
      handleColor: t.handleColor,
      custom: true,
      toolTip: t.toolTip,
      requiresHandle: t.requiresHandle,
      canBeDropped: t.canBeDropped,
      cooldown: t.cooldown,
      maxDurability: t.maxDurability,
    };
  });
  return [...DEFAULT_TOOLS, ...customs];
}

/** Short stat summary shown under tool names in the UI. */
export function toolStats(def: RuntimeTool): string {
  switch (def.behavior) {
    case "sword": return `${def.damage} dmg · ${def.reach} stud reach`;
    case "gun": return `${def.damage} dmg · 150 stud range`;
    case "heal": return `+${def.healAmount} health per use`;
    case "speed": return `WalkSpeed ×${def.speedMult} while held`;
    case "gravity": return `JumpPower ×${def.jumpMult}, slow fall`;
    case "teleport": return `Blink ${Math.max(10, Math.round(def.reach * 5))} studs forward`;
    case "flashlight": return "Click to toggle the beam";
    case "script": return "Fully scriptable — connect Equipped / Activated";
  }
}

/* ------------------------------------------------------------------ */
/* Admin commands (HD-Admin style)                                     */
/* ------------------------------------------------------------------ */

export const ADMIN_COMMANDS: { cmd: string; args: string; desc: string }[] = [
  { cmd: "speed / ws", args: "<n>", desc: "Set your WalkSpeed (16 default, 500 max)" },
  { cmd: "jump / jp", args: "<n>", desc: "Set your JumpPower (50 default)" },
  { cmd: "health / hp", args: "<n>", desc: "Set your Health directly" },
  { cmd: "maxhealth", args: "<n>", desc: "Set your MaxHealth (100 default)" },
  { cmd: "heal", args: "[n]", desc: "Heal yourself (all by default)" },
  { cmd: "damage / dmg", args: "<n>", desc: "Take n damage (test your health bar)" },
  { cmd: "god / ungod", args: "", desc: "Toggle invincibility" },
  { cmd: "kill", args: "[bot]", desc: "Kill yourself, or a named bot" },
  { cmd: "respawn", args: "", desc: "Respawn at the SpawnLocation" },
  { cmd: "tp", args: "<x> <y> <z>", desc: "Teleport to coordinates" },
  { cmd: "goto", args: "<bot>", desc: "Teleport next to a bot" },
  { cmd: "bots", args: "<n>", desc: "Set the number of bots (0-12)" },
  { cmd: "kick", args: "<bot>", desc: "Remove a bot from the server" },
  { cmd: "ban", args: "<bot>", desc: "Ban a bot — it cannot come back" },
  { cmd: "fly / unfly", args: "[speed]", desc: "Toggle fly mode — SPACE up, C/Ctrl down, WASD fly" },
  { cmd: "flyspeed", args: "<n>", desc: "Set fly speed in studs/s (default 60)" },
  { cmd: "emote", args: "<name>", desc: "Play an animation on your character" },
  { cmd: "emotes", args: "", desc: "List emotes — anyone can use /e <name> in chat" },
  { cmd: "stopemote", args: "", desc: "Stop the current emote" },
  { cmd: "give", args: "<tool>", desc: "Grant a tool copy into your Backpack" },
  { cmd: "tools", args: "", desc: "List your Backpack + hotbar slots" },
  { cmd: "drop", args: "", desc: "Drop the equipped tool into the world" },
  { cmd: "clearbackpack", args: "", desc: "Empty your Backpack (respawn refills it)" },
  { cmd: "time", args: "<0-24>", desc: "Set the time of day (lighting)" },
  { cmd: "fog", args: "<n>", desc: "Set fog distance (studs)" },
  { cmd: "clear", args: "", desc: "Clear the chat window" },
  { cmd: "cmds", args: "", desc: "List every command" },
];

const BOT_NAMES = [
  "NoobSlayer42", "xX_Builder_Xx", "PizzaLover99", "EpicGamer2013", "CoolKat",
  "BrickBasher", "ObbyKing", "NeonNinja", "TacoTuesday", "VoltRider",
  "SpookyScary", "MegaMiner", "Sir_Jumps", "ZippyZap", "BlockBandit",
];

const BOT_CHAT_LINES = [
  "anyone else lagging or just me",
  "this map is cool ngl",
  "how do i get the sword??",
  "race u to the spawn",
  "i keep falling off lol",
  "nice build whoever made this",
  "brb my mom is calling",
  "sword fight me. right now.",
  "who touched my part",
  "wdym press ~ for commands??",
  "first time on this game, it slaps",
  "somebody script a door pls",
  "gravity coil is so fun lmaooo",
  "i was HERE first",
  "gg",
];

/* ------------------------------------------------------------------ */
/* Emotes — built-in animation presets mapped to Roblox /e names      */
/* ------------------------------------------------------------------ */

/** Roblox default emote names mapped onto our preset library. */
const EMOTE_ALIASES: Record<string, string> = {
  dance2: "robot",
  dance3: "jacks",
  laugh: "headbang",
  clap: "cheer",
  shout: "point",
};

/** The built-in emotes every player can trigger with /e <name>. */
export function emoteList(): { id: string; name: string; icon: string }[] {
  return ANIM_PRESETS.map((p) => ({ id: p.id, name: p.name, icon: p.icon }));
}

const CANONICAL_LIMB_NAMES = ["Left Arm", "Right Arm", "Left Leg", "Right Leg", "Torso", "Head"];

/** Convert a preset (regex-keyed, relative keys) into a loadable animation. */
function presetToLoadable(preset: AnimPreset): LoadableAnim {
  const tracks: Record<string, RelKey[]> = {};
  for (const spec of preset.tracks) {
    const name = CANONICAL_LIMB_NAMES.find((n) => spec.match.test(n));
    if (!name) continue;
    tracks[name] = spec.keys.map((k) => ({
      t: k.t,
      rot: k.rot ? ([...k.rot] as [number, number, number]) : undefined,
      pos: k.pos ? ([...k.pos] as [number, number, number]) : undefined,
    }));
  }
  return { name: preset.name, duration: preset.duration, loop: preset.loop, tracks };
}

/* ------------------------------------------------------------------ */
/* HUD snapshot — the React layer polls/subscribes to this             */
/* ------------------------------------------------------------------ */

export interface HudPlayerRow {
  name: string;
  kills: number;
  deaths: number;
  health: number;
  isBot: boolean;
}

export interface HudToolSlot {
  uid: string;
  name: string;
  icon: string;
  desc: string;
  /** Roblox Tool.ToolTip — hover text. */
  toolTip: string;
  behavior: ToolBehavior;
  /** Short stat summary, e.g. "34 dmg · 8 stud reach". */
  stats: string;
  /** Hotbar slot 0-8; -1 = grid only. */
  slot: number;
  equipped: boolean;
  canBeDropped: boolean;
  /** Remaining uses; -1 = unlimited. */
  durability: number;
  maxDurability: number;
  /** Cooldown seconds remaining. */
  cooldown: number;
  /** Full cooldown length for the sweep overlay. */
  cooldownMax: number;
}

export interface GameHud {
  health: number;
  maxHealth: number;
  walkSpeed: number;
  jumpPower: number;
  god: boolean;
  dead: boolean;
  /** uid of the equipped tool copy (moved into the Character). */
  equipped: string | null;
  admin: boolean;
  /** HD Admin style fly mode active. */
  flying: boolean;
  /** Name of the emote currently playing, if any. */
  emote: string | null;
  players: HudPlayerRow[];
  /** Everything carried: Backpack + the equipped tool. */
  backpack: HudToolSlot[];
  /** Nearby dropped tool you can pick up with E. */
  pickup: { name: string; icon: string } | null;
  /** Backpack capacity. */
  backpackMax: number;
}

/* ------------------------------------------------------------------ */
/* Play controller                                                     */
/* ------------------------------------------------------------------ */
interface Collider {
  data: PartData;
  obb: boolean;
  center: THREE.Vector3;
  half: THREE.Vector3; // for AABB mode
  yaw: number;
  hx: number; // OBB half extents (XZ)
  hz: number;
  top: number;
  bottom: number;
}

interface RemoteEntry {
  avatar: R6Avatar;
  target: THREE.Vector3;
  targetYaw: number;
  label: THREE.Sprite;
  /** Procedural walk-cycle phase, driven by real movement speed. */
  walkPhase: number;
  /** Position on the previous frame (speed estimate for limb swing). */
  lastPos: THREE.Vector3;
}

interface Bot {
  id: string;
  name: string;
  avatar: R6Avatar;
  plate: { sprite: THREE.Sprite; redraw: (frac: number) => void; dispose: () => void };
  home: THREE.Vector3;
  target: THREE.Vector3;
  retargetIn: number;
  walkPhase: number;
  moving: boolean;
  health: number;
  maxHealth: number;
  dead: boolean;
  deadTimer: number;
  plateFrac: number;
}

export interface PlayCallbacks {
  onLog?: (level: "info" | "warn" | "error" | "success", text: string) => void;
  onPointerLock?: (locked: boolean) => void;
  onHud?: (hud: GameHud) => void;
  onBotChat?: (name: string, text: string) => void;
}

export class PlayController {
  private engine: StudioEngine;
  private cb: PlayCallbacks;
  private avatar: R6Avatar | null = null;
  private label: THREE.Sprite | null = null;
  private keys = new Set<string>();
  private velocityY = 0;
  private grounded = true;
  private walkPhase = 0;
  private firstPerson = false;
  private yaw = 0;
  private camYaw = 0;
  private camPitch = 0.34;
  private colliders: Collider[] = [];
  private dynamic: { mesh: THREE.Mesh; data: PartData; vy: number }[] = [];
  private remotes = new Map<string, RemoteEntry>();
  private savedCamera: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;
  private stateTimer = 0;
  private playerName = "Player";
  private handlersBound = false;

  /* ---------------- humanoid state ---------------- */
  private health = 100;
  private maxHealth = 100;
  private walkSpeed = WALK_SPEED;
  private jumpPower = JUMP_POWER;
  private god = false;
  private dead = false;
  private regenTimer = 0;
  private respawnTimer = 0;

  /* ---------------- tools / custom inventory ---------------- */
  /** Tools currently in the Backpack container (unequipped). */
  private backpack: OwnedTool[] = [];
  /** The Tool currently moved into the Character (equipped), or null. */
  private equipped: OwnedTool | null = null;
  private uidSeq = 1;
  private tools: RuntimeTool[] = mergeTools([]);
  private swordSwing = 0;
  private toolMesh: THREE.Group | null = null;
  private cooldowns = new Map<string, number>(); // uid → seconds left
  private worldTools: WorldTool[] = [];
  private pickupTarget: WorldTool | null = null;
  private flashlight: THREE.SpotLight | null = null;
  private flashOn = false;
  private tracer: { line: THREE.Line; ttl: number } | null = null;

  /* ---------------- animation / fly ---------------- */
  /** Roblox-style Animator driving emotes + scripted animations. */
  private animator: AvatarAnimator | null = null;
  /** One Animator per rig-like MODEL in the Workspace (NPC dummies). */
  private rigAnims = new Map<string, PartRigAnimator>();
  private flying = false;
  private flySpeed = 60;

  /* ---------------- bots ---------------- */
  private bots: Bot[] = [];
  private bannedBots = new Set<string>();
  private botNameIdx = 0;
  private botChatTimer = 9;

  /* ---------------- stats / admin ---------------- */
  kills = 0;
  deaths = 0;
  admin = false;

  /* ---------------- hud emit ---------------- */
  private hudLast = 0;

  /* BloxScript runtime state */
  private scriptRuntimes: BloxRuntime[] = [];
  private touchWatch = new Map<string, boolean>();
  /** id counter for tools created by scripts (Instance.new("Tool")). */
  private scriptToolSeq = 0;
  active = false;

  constructor(engine: StudioEngine, cb: PlayCallbacks = {}) {
    this.engine = engine;
    this.cb = cb;
  }

  private isTyping(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
  }

  start(name: string, opts?: { admin?: boolean; bots?: number; spawnPosition?: Vec3 }) {
    this.playerName = name;
    this.admin = opts?.admin ?? false;
    this.active = true;
    const spawn = opts?.spawnPosition ?? this.engine.spawnPoint();
    this.avatar = buildR6Avatar();
    this.avatar.root.position.set(spawn[0], spawn[1] + 0.05, spawn[2]);
    this.engine.scene.add(this.avatar.root);
    this.label = makeNameplate(name);
    this.avatar.root.add(this.label);
    this.animator = new AvatarAnimator(this.avatar);
    this.animator.onStopped = (token) => this.fireSignalAll((rt) => rt.fireTrackEvent(token, "stopped"));
    this.animator.onLooped = (token) => this.fireSignalAll((rt) => rt.fireTrackEvent(token, "diloop"));
    this.flying = false;
    this.flySpeed = 60;
    this.velocityY = 0;
    this.grounded = true;
    this.yaw = 0;
    this.camYaw = 0;
    this.camPitch = 0.26;
    this.firstPerson = false;

    // reset humanoid
    this.health = 100;
    this.maxHealth = 100;
    this.walkSpeed = WALK_SPEED;
    this.jumpPower = JUMP_POWER;
    this.god = false;
    this.dead = false;
    this.regenTimer = 0;
    this.respawnTimer = 0;
    this.kills = 0;
    this.deaths = 0;
    this.swordSwing = 0;
    this.tools = mergeTools(this.engine.getTools());
    // StarterPack → fresh Backpack copies on spawn (the Roblox pattern)
    this.grantStarterPack();

    this.savedCamera = {
      pos: this.engine.camera.position.clone(),
      quat: this.engine.camera.quaternion.clone(),
    };

    // build collider cache
    this.rebuildColliders();

    // one Animator per rig-like model (NPC dummies) — scripts reach them via
    // workspace.Dummy:FindFirstChild("Animator"):LoadAnimation(...)
    this.buildRigAnimators();

    // bots
    this.clearBots();
    this.clearWorldTools();
    const wantBots = opts?.bots ?? 0;
    for (let i = 0; i < wantBots; i++) this.spawnBot();

    if (!this.handlersBound) {
      window.addEventListener("keydown", this.onKeyDown);
      window.addEventListener("keyup", this.onKeyUp);
      document.addEventListener("mousemove", this.onMouseMove);
      document.addEventListener("mousedown", this.onMouseDown);
      document.addEventListener("mouseup", this.onMouseUp);
      document.addEventListener("pointerlockchange", this.onLockChange);
      this.handlersBound = true;
    }
    this.engine.setPlaying(true);
    this.startScripts();
    this.emitHud(true);
    this.cb.onLog?.("success", "Play started — click the viewport, WASD to move, SPACE jump, / chat, ESC release mouse");
  }

  /** Rebuild the collider cache from the engine's current parts. */
  private rebuildColliders() {
    this.colliders = [];
    this.dynamic = [];
    for (const { data, mesh } of this.engine.collisionParts()) {
      const rot = data.rotation;
      const obb = Math.abs(rot[0]) < 1 && Math.abs(rot[2]) < 1;
      if (obb) {
        const r = rot[1] * d2r;
        this.colliders.push({
          data,
          obb: true,
          center: new THREE.Vector3(...data.position),
          yaw: r,
          hx: data.size[0] / 2,
          hz: data.size[2] / 2,
          half: new THREE.Vector3(),
          top: data.position[1] + data.size[1] / 2,
          bottom: data.position[1] - data.size[1] / 2,
        });
      } else {
        const box = new THREE.Box3().setFromObject(mesh);
        this.colliders.push({
          data,
          obb: false,
          center: box.getCenter(new THREE.Vector3()),
          half: box.getSize(new THREE.Vector3()).multiplyScalar(0.5),
          yaw: 0,
          hx: 0,
          hz: 0,
          top: box.max.y,
          bottom: box.min.y,
        });
      }
      if (!data.anchored) this.dynamic.push({ mesh, data, vy: 0 });
    }
  }

  /* -------------------------- BloxScript glue ------------------------- */

  private startScripts() {
    this.scriptRuntimes = [];
    this.touchWatch.clear();
    const scripts = this.engine.getScripts().filter((s) => s.enabled && s.kind !== "ModuleScript");
    if (!scripts.length) return;
    const host = this.makeHost();
    const ordered = [...scripts.filter((s) => s.kind === "Script"), ...scripts.filter((s) => s.kind === "LocalScript")];
    for (const script of ordered) {
      const rt = createRuntime(host, script);
      this.scriptRuntimes.push(rt);
      rt.start();
    }
    this.cb.onLog?.("info", `Running ${ordered.length} script${ordered.length === 1 ? "" : "s"} (${ordered.filter((s) => s.kind === "LocalScript").length} local)`);
  }

  private makeHost(): BloxHost {
    const engine = this.engine;
    return {
      log: (level, text) => engine.log(level, text),
      getParts: () => engine.getAllParts(),
      getPart: (id) => engine.getPartData(id),
      updatePart: (id, patch) => {
        engine.updatePart(id, patch, "__silent__");
        this.rebuildColliders();
      },
      renamePart: (id, name) => engine.renamePart(id, name),
      createPart: (className) => engine.spawnScriptPart(className),
      createModel: (name) => engine.spawnScriptModel(name),
      deletePart: (id) => {
        engine.deleteScriptPart(id);
        this.rebuildColliders();
      },
      getModels: () => engine.getModelsList(),
      getScripts: () => engine.getScripts(),
      getScript: (id) => engine.getScript(id),
      getPlayer: () => {
        if (!this.avatar) return null;
        const p = this.avatar.root.position;
        return { name: this.playerName, position: [p.x, p.y, p.z] as Vec3 };
      },
      setPlayerPosition: (pos) => {
        this.avatar?.root.position.set(pos[0], pos[1], pos[2]);
      },
      getHumanoid: () => ({
        health: this.health,
        maxHealth: this.maxHealth,
        walkSpeed: this.walkSpeed,
        jumpPower: this.jumpPower,
      }),
      setHumanoid: (patch) => this.setHumanoidState(patch),
      humanoidTakeDamage: (n) => this.takeDamage(n),
      /* Animator / AnimationTrack bridge — Humanoid:LoadAnimation etc. */
      listAnimations: () => this.animationCatalog(),
      modelIsRig: (modelId) => this.rigAnims.has(modelId),
      loadAnimation: (id, rigId) => {
        const h = this.loadAnimationTrack(id, rigId);
        return h ? { ...h } : null;
      },
      trackPlay: (token, fade, weight, speed) => {
        const r = this.trackRoute(token);
        r.player?.play(r.real, fade, weight, speed);
      },
      trackStop: (token, fade) => {
        const r = this.trackRoute(token);
        r.player?.stop(r.real, fade);
      },
      trackAdjust: (token, patch) => {
        const r = this.trackRoute(token);
        r.player?.adjust(r.real, patch);
      },
      trackGet: (token, prop) => {
        const r = this.trackRoute(token);
        return r.player?.getProp(r.real, prop) ?? null;
      },
      trackSet: (token, prop, value) => {
        const r = this.trackRoute(token);
        r.player?.setProp(r.real, prop, value);
      },
      /* Tools (Tool / StarterPack / Backpack) — scriptable tool API */
      createTool: () => {
        const def: RuntimeTool = {
          id: `scripttool${++this.scriptToolSeq}`,
          name: "Tool",
          icon: "🔧",
          desc: "Created by a script",
          behavior: "script",
          damage: 0,
          reach: 0,
          speedMult: 1,
          jumpMult: 1,
          healAmount: 0,
          handleShape: "Block",
          handleColor: "Medium stone grey",
          custom: true,
          toolTip: "",
          requiresHandle: true,
          canBeDropped: true,
          cooldown: 0,
          maxDurability: 0,
        };
        this.tools.push(def);
        return def.id;
      },
      updateToolDef: (id, patch) => {
        const def = this.tools.find((t) => t.id === id);
        if (!def) return;
        if (patch.name !== undefined) def.name = patch.name || def.name;
        if (patch.toolTip !== undefined) def.toolTip = patch.toolTip;
        if (patch.requiresHandle !== undefined) def.requiresHandle = patch.requiresHandle;
        if (patch.canBeDropped !== undefined) def.canBeDropped = patch.canBeDropped;
        this.emitHud(true);
      },
      getToolDefs: () => this.tools.map((t) => ({
        id: t.id,
        name: t.name,
        toolTip: t.toolTip,
        requiresHandle: t.requiresHandle,
        canBeDropped: t.canBeDropped,
      })),
      carriedToolByName: (name) => {
        const lower = name.toLowerCase();
        const carried = this.allOwned().find((o) => o.def.name.toLowerCase() === lower);
        return carried?.def.id ?? null;
      },
      equipToolDef: (id) => {
        const def = this.tools.find((t) => t.id === id);
        if (!def) return false;
        // already holding it? EquipTool is a no-op then (Roblox semantics)
        if (this.equipped?.def === def) return true;
        // carried already? equip that copy. otherwise clone one in first
        const carried = this.allOwned().find((o) => o.def === def);
        const owned = carried ?? this.grantTool(def);
        if (!owned) return false;
        this.equipTool(owned.uid);
        return true;
      },
      unequipTools: () => this.unequipTool(),
      grantToolToBackpack: (id) => {
        const def = this.tools.find((t) => t.id === id);
        if (!def) return false;
        if (this.allOwned().some((o) => o.def === def)) return true; // already carried
        return !!this.grantTool(def);
      },
      setLighting: (patch) => engine.setLighting(patch, "__silent__"),
      getLighting: () => engine.lighting,
      setBaseplateColor: (hex) => engine.setBaseplateColor(hex),
    };
  }

  private scriptTick(dt: number) {
    if (!this.scriptRuntimes.length || !this.avatar) return;
    const playerPos = this.avatar.root.position;

    for (const rt of this.scriptRuntimes) {
      rt.tick();
      rt.fireHeartbeat(dt);
      // collect watched part ids for touch detection
      for (const key of rt.rt.signals.keys()) {
        if (!key.startsWith("touched:")) continue;
        const partId = key.slice(8);
        const d = this.engine.getPartData(partId);
        if (!d) continue;
        // player AABB vs part AABB
        const overlap =
          Math.abs(playerPos.x - d.position[0]) < d.size[0] / 2 + PLAYER_HALF_W &&
          Math.abs(playerPos.z - d.position[2]) < d.size[2] / 2 + PLAYER_HALF_W &&
          playerPos.y < d.position[1] + d.size[1] / 2 + 4.62 &&
          playerPos.y + 4.62 > d.position[1] - d.size[1] / 2;
        const was = this.touchWatch.get(partId) ?? false;
        this.touchWatch.set(partId, overlap);
        if (overlap && !was) rt.fireTouched(partId);
      }
    }
  }

  /* ---------------------------- humanoid ------------------------------ */

  getHumanoidState() {
    return { health: this.health, maxHealth: this.maxHealth, walkSpeed: this.walkSpeed, jumpPower: this.jumpPower };
  }

  setHumanoidState(patch: { health?: number; maxHealth?: number; walkSpeed?: number; jumpPower?: number }) {
    if (patch.maxHealth !== undefined) this.maxHealth = clamp(Math.round(patch.maxHealth), 1, 100000);
    if (patch.walkSpeed !== undefined) this.walkSpeed = clamp(patch.walkSpeed, 0, 500);
    if (patch.jumpPower !== undefined) this.jumpPower = clamp(patch.jumpPower, 0, 1000);
    if (patch.health !== undefined) {
      const h = clamp(patch.health, 0, this.maxHealth);
      if (Math.round(h) !== Math.round(this.health)) this.fireHealthChanged(h);
      this.health = h;
      if (this.health <= 0) this.die();
    }
    this.emitHud(true);
  }

  takeDamage(n: number) {
    if (this.god || this.dead || !this.active) return;
    const before = this.health;
    this.health = Math.max(0, this.health - n);
    this.regenTimer = 0;
    if (Math.round(this.health) !== Math.round(before)) this.fireHealthChanged(this.health);
    this.emitHud(true);
    if (this.health <= 0) this.die();
  }

  private die() {
    if (this.dead) return;
    this.dead = true;
    this.animator?.stopAll(0.15);
    this.flying = false;
    this.deaths++;
    this.respawnTimer = 3.5;
    this.fireSignalAll((rt) => rt.fireDied());
    this.emitHud(true);
    this.cb.onLog?.("info", `${this.playerName} died — respawning in 3.5s (or press R)`);
  }

  respawn() {
    if (!this.avatar) return;
    const spawn = this.engine.spawnPoint();
    this.avatar.root.position.set(spawn[0], spawn[1] + 0.05, spawn[2]);
    this.avatar.root.rotation.set(0, this.yaw, 0);
    this.velocityY = 0;
    this.grounded = true;
    this.dead = false;
    this.health = this.maxHealth;
    this.regenTimer = 0;
    this.animator?.stopAll(0);
    // The runtime Backpack is recreated on death — StarterPack refills it.
    this.grantStarterPack();
    this.emitHud(true);
  }

  /** Roblox menu "Reset Character" — kills you even in god mode. */
  resetCharacter() {
    if (!this.active || this.dead) return;
    const wasGod = this.god;
    this.god = false;
    this.takeDamage(1e9);
    this.god = wasGod;
  }

  private fireHealthChanged(health: number) {
    this.fireSignalAll((rt) => rt.fireHealthChanged(health));
  }

  private fireSignalAll(fn: (rt: BloxRuntime) => void) {
    for (const rt of this.scriptRuntimes) fn(rt);
  }

  /* ------------------------------ tools ------------------------------- */

  /** The definition of the tool currently held, or null. */
  equippedTool(): RuntimeTool | null {
    return this.equipped?.def ?? null;
  }

  /** All owned copies: Backpack contents + the equipped one. */
  private allOwned(): OwnedTool[] {
    return this.equipped ? [this.equipped, ...this.backpack] : this.backpack;
  }

  /** First free hotbar slot (0-8), or -1 when all nine are taken. */
  private firstFreeSlot(): number {
    const used = new Set(this.allOwned().map((o) => o.slot).filter((s) => s >= 0));
    for (let i = 0; i < MAX_HOTBAR; i++) if (!used.has(i)) return i;
    return -1;
  }

  /**
   * StarterPack templates are copied into a fresh Backpack on every spawn
   * (and the Backpack is recreated on death, exactly like Roblox).
   * When the place defines its own tools, the pack is EXACTLY those —
   * the creator decides what players spawn with. The classic default
   * kit (sword, coils, flashlight) only fills an empty StarterPack.
   */
  private grantStarterPack() {
    this.backpack = [];
    this.equipped = null;
    this.removeToolMesh();
    this.removeFlashlight();
    this.cooldowns.clear();
    const customs = this.tools.filter((t) => t.custom);
    const pack = customs.length ? customs : this.tools;
    for (const def of pack) this.grantTool(def, false);
  }

  /**
   * Server-style grant — clone a trusted template into the Backpack
   * (the guide's giveTool: ServerStorage template → player.Backpack).
   */
  grantTool(def: RuntimeTool, announce = true): OwnedTool | null {
    if (this.backpack.length + (this.equipped ? 1 : 0) >= MAX_BACKPACK) {
      if (announce) this.cb.onLog?.("warn", `Backpack full (${MAX_BACKPACK} items) — drop something first`);
      return null;
    }
    const owned: OwnedTool = {
      uid: `t${this.uidSeq++}`,
      def,
      durability: def.maxDurability > 0 ? def.maxDurability : -1,
      slot: this.firstFreeSlot(),
    };
    this.backpack.push(owned);
    if (announce) {
      this.cb.onLog?.("success", `Granted ${def.icon} ${def.name} to your Backpack${owned.slot >= 0 ? ` — press ${owned.slot + 1} to equip` : ""}`);
    }
    // Backpack.ChildAdded → scripts
    this.fireSignalAll((rt) => rt.fireBackpackChild(def.id));
    this.emitHud(true);
    return owned;
  }

  /** Humanoid:EquipTool / UnequipTools — moves the Tool between the
   *  Backpack and Character containers. */
  equipTool(uid: string | null) {
    if (uid === null) {
      this.unequipTool();
      return;
    }
    if (this.equipped?.uid === uid) {
      this.unequipTool();
      return;
    }
    const idx = this.backpack.findIndex((o) => o.uid === uid);
    if (idx < 0) return; // not carried — the "server" rejects unknown items
    if (this.equipped) {
      // single hand: put the held one away first
      this.backpack.push(this.equipped);
      this.fireSignalAll((rt) => rt.fireToolEvent(this.equipped!.def.id, "unequipped"));
    }
    this.equipped = this.backpack.splice(idx, 1)[0];
    this.attachEquippedMesh();
    if (this.equipped.def.behavior !== "flashlight") this.setFlashlight(false);
    // Tool.Equipped → scripts
    this.fireSignalAll((rt) => rt.fireToolEvent(this.equipped!.def.id, "equipped"));
    this.emitHud(true);
  }

  private unequipTool() {
    if (!this.equipped) return;
    this.backpack.push(this.equipped);
    // Tool.Unequipped → scripts
    this.fireSignalAll((rt) => rt.fireToolEvent(this.equipped!.def.id, "unequipped"));
    this.equipped = null;
    this.removeToolMesh();
    this.setFlashlight(false);
    this.emitHud(true);
  }

  private attachEquippedMesh() {
    this.removeToolMesh();
    if (this.avatar && this.equipped) {
      this.toolMesh = buildToolMesh(this.equipped.def.id, this.tools);
      this.avatar.rightArm.add(this.toolMesh);
    }
  }

  private removeToolMesh() {
    if (this.toolMesh && this.avatar) {
      this.avatar.rightArm.remove(this.toolMesh);
      this.toolMesh = null;
    }
  }

  /* ------------------------------ flashlight ---------------------------- */

  private setFlashlight(on: boolean) {
    this.flashOn = on;
    if (on && this.equipped?.def.behavior === "flashlight" && this.avatar) {
      if (!this.flashlight) {
        const light = new THREE.SpotLight(0xfff3c4, 320, 110, 0.46, 0.5, 1.4);
        light.position.set(0, 4.6, 0);
        const target = new THREE.Object3D();
        target.position.set(0, 3.4, -14);
        this.avatar.root.add(target);
        light.target = target;
        this.avatar.root.add(light);
        this.flashlight = light;
      }
      this.flashlight.visible = true;
    } else if (this.flashlight) {
      this.flashlight.visible = false;
    }
  }

  private removeFlashlight() {
    if (!this.flashlight) return;
    this.flashlight.parent?.remove(this.flashlight);
    this.flashlight.target.parent?.remove(this.flashlight.target);
    this.flashlight.dispose();
    this.flashlight = null;
    this.flashOn = false;
  }

  /* ------------------------------ activation ---------------------------- */

  private onMouseDown = (e: MouseEvent) => {
    if (!this.active || this.dead) return;
    if (!document.pointerLockElement) return;
    if (e.button !== 0) return;
    const owned = this.equipped;
    if (!owned) return;
    // Tool.Enabled gate — the cooldown is validated "server"-side, here.
    if ((this.cooldowns.get(owned.uid) ?? 0) > 0) return;
    if (owned.def.cooldown > 0) this.cooldowns.set(owned.uid, owned.def.cooldown);
    switch (owned.def.behavior) {
      case "sword": this.swingSword(owned.def); break;
      case "gun": this.fireGun(owned.def); break;
      case "heal": this.useHeal(owned.def); break;
      case "teleport": this.useTeleport(owned.def); break;
      case "flashlight":
        this.setFlashlight(!this.flashOn);
        this.cb.onLog?.("info", this.flashOn ? "Flashlight ON" : "Flashlight OFF");
        break;
    }
    // Tool.Activated → scripts (fires for every behavior, like Roblox)
    this.fireSignalAll((rt) => rt.fireToolEvent(owned.def.id, "activated"));
    this.wearTool(owned);
  };

  /** Tool.Deactivated — mouse released while a tool is held. */
  private onMouseUp = (e: MouseEvent) => {
    if (!this.active || e.button !== 0) return;
    if (!document.pointerLockElement) return;
    const owned = this.equipped;
    if (!owned) return;
    this.fireSignalAll((rt) => rt.fireToolEvent(owned.def.id, "deactivated"));
  };

  /** Durability: each activation wears the tool; at 0 it breaks. */
  private wearTool(owned: OwnedTool) {
    if (owned.durability < 0 || owned.def.maxDurability <= 0) return;
    owned.durability--;
    if (owned.durability > 0) return;
    const name = owned.def.name;
    if (this.equipped === owned) {
      this.equipped = null;
      this.removeToolMesh();
    } else {
      this.backpack = this.backpack.filter((o) => o !== owned);
    }
    this.cb.onLog?.("warn", `${owned.def.icon} ${name} broke! (${owned.def.maxDurability} uses)`);
    this.emitHud(true);
  }

  /* ------------------------------ drop / pickup ------------------------- */

  /** Backspace / Drop button — drops the equipped Tool into the world. */
  dropEquipped(): boolean {
    const owned = this.equipped;
    if (!owned) return false;
    if (!owned.def.canBeDropped) {
      this.cb.onLog?.("info", `${owned.def.icon} ${owned.def.name} can't be dropped (CanBeDropped = false)`);
      return false;
    }
    this.equipped = null;
    this.removeToolMesh();
    this.setFlashlight(false);
    this.spawnWorldTool(owned.def, owned.durability);
    this.cb.onLog?.("info", `Dropped ${owned.def.icon} ${owned.def.name} — walk over it and press E to pick it up`);
    this.emitHud(true);
    return true;
  }

  /** Drop a specific carried tool from the inventory panel. */
  dropTool(uid: string) {
    if (this.equipped?.uid === uid) {
      this.dropEquipped();
      return;
    }
    const idx = this.backpack.findIndex((o) => o.uid === uid);
    if (idx < 0) return;
    const owned = this.backpack[idx];
    if (!owned.def.canBeDropped) {
      this.cb.onLog?.("info", `${owned.def.icon} ${owned.def.name} can't be dropped`);
      return;
    }
    this.backpack.splice(idx, 1);
    this.spawnWorldTool(owned.def, owned.durability);
    this.cb.onLog?.("info", `Dropped ${owned.def.icon} ${owned.def.name}`);
    this.emitHud(true);
  }

  private spawnWorldTool(def: RuntimeTool, durability: number) {
    if (!this.avatar) return;
    if (this.worldTools.length >= WORLD_TOOL_CAP) {
      const [oldest] = this.worldTools.splice(0, 1);
      this.engine.scene.remove(oldest.mesh);
    }
    const p = this.avatar.root.position;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const x = clamp(p.x + fx * 3.5, -250, 250);
    const z = clamp(p.z + fz * 3.5, -250, 250);
    const holder = new THREE.Group();
    const mesh = buildToolMesh(def.id, this.tools);
    // re-center the hand-held mesh so it spins nicely on the ground
    mesh.position.set(0, 1.75, 0.85);
    holder.add(mesh);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.05, 8, 26),
      new THREE.MeshBasicMaterial({ color: 0x75dda4, transparent: true, opacity: 0.7 }),
    );
    ring.rotation.x = Math.PI / 2;
    holder.add(ring);
    holder.position.set(x, this.groundAt(x, z) + 1.05, z);
    this.engine.scene.add(holder);
    this.worldTools.push({ def, durability, mesh: holder, spin: Math.random() * Math.PI * 2 });
  }

  private clearWorldTools() {
    for (const wt of this.worldTools) this.engine.scene.remove(wt.mesh);
    this.worldTools = [];
    this.pickupTarget = null;
  }

  /** E near a dropped Tool — the "server" validates distance + capacity. */
  pickupTool() {
    const wt = this.pickupTarget;
    if (!wt || !this.active) return;
    if (this.backpack.length + (this.equipped ? 1 : 0) >= MAX_BACKPACK) {
      this.cb.onLog?.("warn", "Backpack full — drop something first");
      return;
    }
    const idx = this.worldTools.indexOf(wt);
    if (idx >= 0) this.worldTools.splice(idx, 1);
    this.engine.scene.remove(wt.mesh);
    this.pickupTarget = null;
    const owned: OwnedTool = {
      uid: `t${this.uidSeq++}`,
      def: wt.def,
      durability: wt.durability,
      slot: this.firstFreeSlot(),
    };
    this.backpack.push(owned);
    this.cb.onLog?.("success", `Picked up ${wt.def.icon} ${wt.def.name}${owned.slot >= 0 ? ` (slot ${owned.slot + 1})` : ""}`);
    this.emitHud(true);
  }

  swingSword(tool?: RuntimeTool) {
    if (this.swordSwing > 0.45) return; // cooldown
    this.swordSwing = 1;
    const damage = tool?.damage ?? SWORD_DAMAGE;
    const reach = tool?.reach ?? SWORD_REACH;
    // hit check: bots within reach in front of the player
    if (!this.avatar) return;
    const pos = this.avatar.root.position;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    let hits = 0;
    for (const bot of this.bots) {
      if (bot.dead) continue;
      const bx = bot.avatar.root.position.x - pos.x;
      const bz = bot.avatar.root.position.z - pos.z;
      const dist = Math.hypot(bx, bz);
      if (dist > reach) continue;
      const dot = (bx * fx + bz * fz) / (dist || 1);
      if (dot < 0.45) continue;
      this.damageBot(bot, damage);
      hits++;
    }
    if (hits === 0) this.cb.onLog?.("info", "Sword: swish! (nothing in range)");
  }

  /** Gun behavior: instant ray hit with a tracer line. */
  private fireGun(tool: RuntimeTool) {
    if (!this.avatar) return;
    const range = 150;
    const dir = new THREE.Vector3(
      -Math.sin(this.camYaw) * Math.cos(this.camPitch),
      Math.sin(this.camPitch),
      -Math.cos(this.camYaw) * Math.cos(this.camPitch),
    ).normalize();
    const origin = new THREE.Vector3(
      this.avatar.root.position.x,
      this.avatar.root.position.y + 4.2,
      this.avatar.root.position.z,
    );
    // find the nearest bot whose capsule the ray passes through
    let best: { bot: Bot; t: number } | null = null;
    for (const bot of this.bots) {
      if (bot.dead) continue;
      const center = new THREE.Vector3(
        bot.avatar.root.position.x,
        bot.avatar.root.position.y + 3,
        bot.avatar.root.position.z,
      );
      const toBot = center.clone().sub(origin);
      const t = toBot.dot(dir);
      if (t < 0 || t > range) continue;
      const perp = toBot.clone().sub(dir.clone().multiplyScalar(t)).length();
      if (perp < 2.6 && (!best || t < best.t)) best = { bot, t };
    }
    const end = best
      ? origin.clone().add(dir.clone().multiplyScalar(best.t))
      : origin.clone().add(dir.clone().multiplyScalar(range));
    if (best) this.damageBot(best.bot, tool.damage);
    // tracer
    if (this.tracer) {
      this.engine.scene.remove(this.tracer.line);
      this.tracer.line.geometry.dispose();
    }
    const geom = new THREE.BufferGeometry().setFromPoints([origin, end]);
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
      color: new THREE.Color(brickColorHex(tool.handleColor)),
      transparent: true,
      opacity: 0.95,
    }));
    this.engine.scene.add(line);
    this.tracer = { line, ttl: 0.09 };
    this.cb.onLog?.(best ? "success" : "info", best ? `Hit ${best.bot.name} for ${tool.damage} damage` : "Pew! (missed)");
  }

  /** Medkit behavior: click to restore health. */
  private useHeal(tool: RuntimeTool) {
    if (this.dead) return;
    if (this.health >= this.maxHealth) {
      this.cb.onLog?.("info", "Already at full health");
      return;
    }
    this.health = Math.min(this.maxHealth, this.health + tool.healAmount);
    this.fireHealthChanged(this.health);
    this.emitHud(true);
    this.cb.onLog?.("success", `Healed +${tool.healAmount} (${Math.round(this.health)}/${this.maxHealth})`);
  }

  /** Teleport wand behavior: blink forward along the camera direction. */
  private useTeleport(tool: RuntimeTool) {
    if (this.dead || !this.avatar) return;
    const dist = Math.max(10, tool.reach * 5);
    const dx = -Math.sin(this.camYaw);
    const dz = -Math.cos(this.camYaw);
    const root = this.avatar.root;
    const nx = root.position.x + dx * dist;
    const nz = root.position.z + dz * dist;
    // don't teleport off the baseplate
    const half = 256 - 4;
    const cx = clamp(nx, -half, half);
    const cz = clamp(nz, -half, half);
    root.position.set(cx, this.groundAt(cx, cz) + 0.05, cz);
    this.velocityY = 0;
    this.grounded = true;
    this.spawnTeleportFlash(root.position.clone());
    this.cb.onLog?.("success", `Teleported ${Math.round(dist)} studs forward`);
  }

  /** Quick particle-ish flash where you land after a teleport. */
  private spawnTeleportFlash(p: THREE.Vector3) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x9b6bff, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(p).setY(p.y + 0.4);
    this.engine.scene.add(ring);
    const t0 = performance.now();
    const fade = () => {
      const k = (performance.now() - t0) / 500;
      if (k >= 1 || !this.active) {
        this.engine.scene.remove(ring);
        ring.geometry.dispose();
        return;
      }
      ring.scale.setScalar(1 + k * 1.6);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      requestAnimationFrame(fade);
    };
    requestAnimationFrame(fade);
  }

  /* ------------------------------- bots -------------------------------- */

  private nextBotName(): string {
    for (let i = 0; i < BOT_NAMES.length; i++) {
      const name = BOT_NAMES[(this.botNameIdx + i) % BOT_NAMES.length];
      if (this.bots.some((b) => b.name === name) || this.bannedBots.has(name)) continue;
      this.botNameIdx = (this.botNameIdx + i + 1) % BOT_NAMES.length;
      return name;
    }
    return `Guest${Math.floor(Math.random() * 9999)}`;
  }

  private spawnBot() {
    if (!this.avatar) return;
    const name = this.nextBotName();
    const color = botColorFromName(name);
    const avatar = buildR6Avatar(color, 0x2d3436);
    const plate = makeHealthNameplate(name);
    avatar.root.add(plate.sprite);
    const spawn = this.engine.spawnPoint();
    const a = Math.random() * Math.PI * 2;
    const r = 10 + Math.random() * 22;
    const x = clamp(spawn[0] + Math.cos(a) * r, -220, 220);
    const z = clamp(spawn[2] + Math.sin(a) * r, -220, 220);
    const y = this.groundAt(x, z);
    avatar.root.position.set(x, y + 0.05, z);
    this.engine.scene.add(avatar.root);
    const home = new THREE.Vector3(x, y, z);
    this.bots.push({
      id: `bot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      avatar,
      plate,
      home,
      target: home.clone(),
      retargetIn: Math.random() * 3,
      walkPhase: 0,
      moving: false,
      health: 100,
      maxHealth: 100,
      dead: false,
      deadTimer: 0,
      plateFrac: 1,
    });
    this.emitHud(true);
  }

  setBotCount(n: number) {
    const want = clamp(Math.round(n), 0, 12);
    while (this.bots.length > want) {
      const bot = this.bots.pop()!;
      this.removeBotVisuals(bot);
    }
    while (this.bots.length < want) this.spawnBot();
    this.emitHud(true);
  }

  private removeBotVisuals(bot: Bot) {
    this.engine.scene.remove(bot.avatar.root);
    bot.avatar.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    bot.plate.dispose();
  }

  private damageBot(bot: Bot, n: number) {
    if (bot.dead) return;
    bot.health = Math.max(0, bot.health - n);
    const frac = bot.health / bot.maxHealth;
    if (Math.abs(frac - bot.plateFrac) > 0.02) {
      bot.plate.redraw(frac);
      bot.plateFrac = frac;
    }
    if (bot.health <= 0) this.killBot(bot, true);
  }

  private killBot(bot: Bot, byPlayer: boolean) {
    if (bot.dead) return;
    bot.dead = true;
    bot.deadTimer = 0;
    if (byPlayer) {
      this.kills++;
      this.cb.onLog?.("success", `You knocked out ${bot.name}! (${this.kills} KO${this.kills === 1 ? "" : "s"})`);
    }
    this.emitHud(true);
  }

  private groundAt(x: number, z: number): number {
    // All solid Workspace parts, including the editable Baseplate, define ground.
    // Fall back to the historical zero plane only when there is no collider below.
    let top = Number.NEGATIVE_INFINITY;
    for (const c of this.colliders) {
      if (!c.data.canCollide) continue;
      let inside: boolean;
      if (c.obb) {
        const dx = x - c.center.x;
        const dz = z - c.center.z;
        const lx = dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw);
        const lz = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw);
        inside = Math.abs(lx) < c.hx + 0.4 && Math.abs(lz) < c.hz + 0.4;
      } else {
        inside = Math.abs(x - c.center.x) < c.half.x + 0.4 && Math.abs(z - c.center.z) < c.half.z + 0.4;
      }
      if (inside && c.top > top) top = c.top;
    }
    return Number.isFinite(top) ? top : GROUND_Y;
  }

  /** Rebuild collisions/rig maps after live Team Create changes are mirrored into a test client. */
  refreshWorld(restartScripts = false) {
    if (!this.active) return;
    this.rebuildColliders();
    this.buildRigAnimators();
    this.tools = mergeTools(this.engine.getTools());
    if (restartScripts) {
      for (const runtime of this.scriptRuntimes) runtime.abort();
      this.scriptRuntimes = [];
      this.startScripts();
    }
  }

  private clearBots() {
    for (const bot of this.bots) this.removeBotVisuals(bot);
    this.bots = [];
  }

  private updateBots(dt: number) {
    for (const bot of this.bots) {
      const root = bot.avatar.root;

      if (bot.dead) {
        bot.deadTimer += dt;
        // fall over
        root.rotation.x = -Math.PI / 2 * Math.min(1, bot.deadTimer * 3);
        if (bot.deadTimer > 2.5) root.visible = false;
        if (bot.deadTimer > 5) {
          // respawn
          bot.dead = false;
          bot.health = bot.maxHealth;
          bot.plateFrac = 1;
          bot.plate.redraw(1);
          root.visible = true;
          root.rotation.x = 0;
          const a = Math.random() * Math.PI * 2;
          const x = clamp(bot.home.x + Math.cos(a) * 8, -220, 220);
          const z = clamp(bot.home.z + Math.sin(a) * 8, -220, 220);
          root.position.set(x, this.groundAt(x, z) + 0.05, z);
          bot.target.set(x, 0, z);
        }
        continue;
      }

      // wander AI
      bot.retargetIn -= dt;
      const dx = bot.target.x - root.position.x;
      const dz = bot.target.z - root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2 || bot.retargetIn <= 0) {
        const a = Math.random() * Math.PI * 2;
        const r = 6 + Math.random() * 38;
        bot.target.set(clamp(bot.home.x + Math.cos(a) * r, -230, 230), 0, clamp(bot.home.z + Math.sin(a) * r, -230, 230));
        bot.retargetIn = 4 + Math.random() * 8;
        bot.moving = Math.random() > 0.25; // sometimes just stand there
      }

      if (bot.moving && dist >= 2) {
        const speed = 8;
        const nx = dx / dist;
        const nz = dz / dist;
        root.position.x += nx * speed * dt;
        root.position.z += nz * speed * dt;
        const targetYaw = Math.atan2(-nx, -nz);
        const delta = Math.atan2(Math.sin(targetYaw - root.rotation.y), Math.cos(targetYaw - root.rotation.y));
        root.rotation.y += delta * Math.min(1, 10 * dt);
        bot.walkPhase += dt * 8;
      } else {
        bot.walkPhase *= Math.max(0, 1 - 10 * dt);
      }

      // stick to ground
      const gy = this.groundAt(root.position.x, root.position.z);
      root.position.y += (gy - root.position.y) * Math.min(1, 10 * dt);

      // limb swing
      const swing = Math.sin(bot.walkPhase) * 0.7;
      bot.avatar.leftArm.rotation.x = swing;
      bot.avatar.rightArm.rotation.x = -swing;
      bot.avatar.leftLeg.rotation.x = -swing;
      bot.avatar.rightLeg.rotation.x = swing;
    }

    // ambient bot chat
    this.botChatTimer -= dt;
    if (this.botChatTimer <= 0) {
      this.botChatTimer = 10 + Math.random() * 14;
      const alive = this.bots.filter((b) => !b.dead);
      if (alive.length) {
        const bot = alive[Math.floor(Math.random() * alive.length)];
        this.cb.onBotChat?.(bot.name, BOT_CHAT_LINES[Math.floor(Math.random() * BOT_CHAT_LINES.length)]);
      }
    }
  }

  /* ---------------------------- animations ----------------------------- */

  /**
   * Give every rig-like MODEL in the Workspace its own Animator, so NPC
   * dummies can be animated from scripts. Tracks write part Position +
   * Rotation patches (silently — edits are restored when play stops).
   */
  private buildRigAnimators() {
    this.rigAnims.clear();
    for (const m of this.engine.getModelsList()) {
      const parts = this.engine.getModelParts(m.id);
      const rig = new PartRigAnimator(parts, (partId, position, rotation) => {
        this.engine.updatePart(partId, { position, rotation }, "__silent__");
      });
      if (rig.limbCount < 2) continue; // not a rig — just a grouped model
      const modelId = m.id;
      // rig tokens are namespaced "<modelId>#<token>" so track ops can route
      rig.onStopped = (token) => this.fireSignalAll((rt) => rt.fireTrackEvent(`${modelId}#${token}`, "stopped"));
      rig.onLooped = (token) => this.fireSignalAll((rt) => rt.fireTrackEvent(`${modelId}#${token}`, "diloop"));
      this.rigAnims.set(modelId, rig);
    }
  }

  /** Resolve a prefixed track token to the Animator that owns it. */
  private trackRoute(token: string): { player: TrackPlayer | null; real: string } {
    const hash = token.indexOf("#");
    if (hash >= 0) {
      const rigId = token.slice(0, hash);
      return { player: this.rigAnims.get(rigId) ?? null, real: token.slice(hash + 1) };
    }
    return { player: this.animator, real: token };
  }

  /** Everything LoadAnimation can resolve: rig animations + built-in emotes. */
  animationCatalog(): { name: string; source: string }[] {
    const out: { name: string; source: string }[] = [];
    for (const m of this.engine.getModelsList()) {
      for (const a of this.engine.getModelAnimations(m.id)) out.push({ name: a.name, source: `rig ${m.name}` });
    }
    for (const p of ANIM_PRESETS) out.push({ name: p.name, source: "built-in emote" });
    return out;
  }

  /**
   * Animator:LoadAnimation — resolve a name (or rbxassetid://name) to a
   * playable track. Animations saved on rigs come first, then the built-in
   * emote presets. With rigId set, the track plays on that NPC dummy model
   * instead of the local character.
   */
  private loadAnimationTrack(idOrName: string, rigId?: string): AnimTrackHandle | null {
    const rig = rigId ? this.rigAnims.get(rigId) : null;
    if (rigId && !rig) return null;
    const target: TrackPlayer | null = rig ?? this.animator;
    if (!target) return null;
    const q = idOrName.trim().replace(/^rbxassetid:\/\//, "");
    if (!q) return null;
    const lower = q.toLowerCase();
    // namespace rig tokens so Play/Stop/etc. route back to the right Animator
    const wrap = (h: AnimTrackHandle): AnimTrackHandle =>
      rig ? { ...h, token: `${rigId}#${h.token}` } : h;
    // 1) animations saved on rigs in the Animation editor
    for (const m of this.engine.getModelsList()) {
      for (const a of this.engine.getModelAnimations(m.id)) {
        if (a.name.toLowerCase() !== lower) continue;
        const nameOf = new Map(this.engine.getModelParts(m.id).map((p) => [p.id, p.name]));
        const tracks: Record<string, RelKey[]> = {};
        for (const [pid, keys] of Object.entries(a.tracks)) {
          const partName = nameOf.get(pid);
          if (!partName) continue;
          tracks[partName] = keys.map((k) => ({
            t: k.t,
            rot: [...k.rot] as [number, number, number],
            pos: [...k.pos] as [number, number, number],
          }));
        }
        return wrap(target.load({ name: a.name, duration: a.duration, loop: a.loop, tracks, absolute: true }));
      }
    }
    // 2) built-in emote presets
    let key = lower;
    if (EMOTE_ALIASES[key]) key = EMOTE_ALIASES[key];
    const preset = ANIM_PRESETS.find((p) => p.id === key || p.name.toLowerCase() === key);
    return preset ? wrap(target.load(presetToLoadable(preset))) : null;
  }

  /**
   * Play a built-in emote — what /e <name> in chat calls, so it works for
   * EVERY player, not just admins (exactly like Roblox chat emotes).
   */
  playEmote(name: string): { ok: boolean; message: string } {
    if (!this.active) return { ok: false, message: "Not playing" };
    if (!this.animator) return { ok: false, message: "No character to animate" };
    const q = name.trim().toLowerCase();
    if (q === "stop" || q === "none" || q === "unemote" || q === "stopemote") {
      this.animator.stopAll(0.15);
      return { ok: true, message: "Emote stopped" };
    }
    if (this.dead) return { ok: false, message: "You can't emote while dead" };
    let key = q.replace(/^rbxassetid:\/\//, "");
    if (EMOTE_ALIASES[key]) key = EMOTE_ALIASES[key];
    const preset = ANIM_PRESETS.find((p) => p.id === key || p.name.toLowerCase() === key);
    if (!preset) return { ok: false, message: `Unknown emote "${name}" — try /e dance, /e wave, /e cheer… (:emotes lists all)` };
    const handle = this.animator.load(presetToLoadable(preset));
    this.animator.play(handle.token, 0.2, 1, 1);
    this.emitHud(true);
    return { ok: true, message: `${preset.icon} ${preset.name}!` };
  }

  /* ---------------------------- admin commands ------------------------- */

  runCommand(raw: string): { ok: boolean; message: string; action?: "clear-chat" } {
    const line = raw.trim().replace(/^[;:]\s*/, "");
    if (!line) return { ok: false, message: "Type a command — try :cmds" };
    if (!this.admin) return { ok: false, message: "You don't have permission — commands belong to the game owner and admins." };
    const [cmdRaw, ...args] = line.split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const num = (i: number, def?: number) => {
      const v = Number(args[i]);
      return isFinite(v) ? v : def;
    };

    switch (cmd) {
      case "speed": case "ws": case "walkspeed": {
        const n = num(0);
        if (n === undefined) return { ok: false, message: "Usage: :speed <n>  (e.g. :speed 60)" };
        this.setHumanoidState({ walkSpeed: clamp(n, 0, 500) });
        return { ok: true, message: `WalkSpeed set to ${this.walkSpeed}` };
      }
      case "jump": case "jp": case "jumppower": {
        const n = num(0);
        if (n === undefined) return { ok: false, message: "Usage: :jump <n>  (e.g. :jump 120)" };
        this.setHumanoidState({ jumpPower: clamp(n, 0, 1000) });
        return { ok: true, message: `JumpPower set to ${this.jumpPower}` };
      }
      case "health": case "hp": {
        const n = num(0);
        if (n === undefined) return { ok: false, message: "Usage: :health <n>" };
        this.setHumanoidState({ health: n });
        return { ok: true, message: `Health set to ${this.health} / ${this.maxHealth}` };
      }
      case "maxhealth": {
        const n = num(0);
        if (n === undefined) return { ok: false, message: "Usage: :maxhealth <n>" };
        this.setHumanoidState({ maxHealth: n, health: n });
        return { ok: true, message: `MaxHealth set to ${this.maxHealth}` };
      }
      case "heal": {
        const n = num(0, this.maxHealth) ?? this.maxHealth;
        this.setHumanoidState({ health: Math.min(this.maxHealth, this.health + n) });
        return { ok: true, message: `Healed — health is now ${Math.round(this.health)}` };
      }
      case "damage": case "dmg": {
        const n = num(0);
        if (n === undefined) return { ok: false, message: "Usage: :damage <n>" };
        this.takeDamage(n);
        return { ok: true, message: `Took ${n} damage — health is now ${Math.round(this.health)}${this.god ? " (god mode blocked it)" : ""}` };
      }
      case "god": {
        this.god = true;
        this.emitHud(true);
        return { ok: true, message: "God mode ON — you take no damage" };
      }
      case "ungod": {
        this.god = false;
        this.emitHud(true);
        return { ok: true, message: "God mode OFF" };
      }
      case "kill": {
        if (args[0]) {
          const bot = this.bots.find((b) => b.name.toLowerCase() === args[0].toLowerCase());
          if (!bot) return { ok: false, message: `No bot named "${args[0]}" — try :bots to see who's here` };
          this.killBot(bot, true);
          return { ok: true, message: `Killed ${bot.name}` };
        }
        this.takeDamage(1e9);
        return { ok: true, message: "You died. Dramatic." };
      }
      case "respawn": {
        this.respawn();
        return { ok: true, message: "Respawned at the SpawnLocation" };
      }
      case "tp": {
        const x = num(0);
        const y = num(1);
        const z = num(2);
        if (x === undefined || y === undefined || z === undefined) return { ok: false, message: "Usage: :tp <x> <y> <z>  (e.g. :tp 0 50 0)" };
        this.avatar?.root.position.set(x, y, z);
        this.velocityY = 0;
        return { ok: true, message: `Teleported to (${x}, ${y}, ${z})` };
      }
      case "goto": {
        if (!args[0]) return { ok: false, message: "Usage: :goto <bot name>" };
        const bot = this.bots.find((b) => b.name.toLowerCase() === args[0].toLowerCase());
        if (!bot) return { ok: false, message: `No bot named "${args[0]}"` };
        const p = bot.avatar.root.position;
        this.avatar?.root.position.set(p.x + 3, p.y + 1, p.z + 3);
        this.velocityY = 0;
        return { ok: true, message: `Teleported to ${bot.name}` };
      }
      case "bots": {
        const n = num(0);
        if (n === undefined) return { ok: false, message: `Usage: :bots <n> — currently ${this.bots.length}` };
        this.setBotCount(n);
        return { ok: true, message: `Bot count set to ${this.bots.length}` };
      }
      case "kick": {
        if (!args[0]) return { ok: false, message: "Usage: :kick <bot name>" };
        const idx = this.bots.findIndex((b) => b.name.toLowerCase() === args[0].toLowerCase());
        if (idx < 0) return { ok: false, message: `No bot named "${args[0]}"` };
        const [bot] = this.bots.splice(idx, 1);
        this.removeBotVisuals(bot);
        this.emitHud(true);
        return { ok: true, message: `${bot.name} was kicked from the server` };
      }
      case "ban": {
        if (!args[0]) return { ok: false, message: "Usage: :ban <bot name>" };
        const idx = this.bots.findIndex((b) => b.name.toLowerCase() === args[0].toLowerCase());
        if (idx < 0) return { ok: false, message: `No bot named "${args[0]}"` };
        const [bot] = this.bots.splice(idx, 1);
        this.bannedBots.add(bot.name);
        this.removeBotVisuals(bot);
        this.emitHud(true);
        return { ok: true, message: `${bot.name} was banned — they can't come back` };
      }
      case "give": {
        const q = (args.join(" ") || "").toLowerCase().trim();
        const def = this.tools.find((t) => t.id === q || t.name.toLowerCase() === q);
        if (!def) return { ok: false, message: `Unknown tool "${args.join(" ")}" — templates: ${this.tools.map((t) => t.name).join(", ")}` };
        const owned = this.grantTool(def);
        return owned
          ? { ok: true, message: `Granted ${def.icon} ${def.name} to your Backpack${owned.slot >= 0 ? ` — press ${owned.slot + 1} to equip` : ""}` }
          : { ok: false, message: `Backpack full (${MAX_BACKPACK} items)` };
      }
      case "tools": {
        const all = [...this.allOwned()].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
        if (!all.length) return { ok: true, message: "Your Backpack is empty — respawn to refill the StarterPack" };
        return {
          ok: true,
          message: `Backpack (${all.length}/${MAX_BACKPACK}): ${all
            .map((o) => `${o.slot >= 0 ? `[${o.slot + 1}] ` : ""}${o.def.icon} ${o.def.name}${this.equipped === o ? " (equipped)" : ""}${o.durability > 0 ? ` · ${o.durability} uses left` : ""}`)
            .join("  ·  ")}`,
        };
      }
      case "drop": {
        const ok = this.dropEquipped();
        return ok ? { ok: true, message: "Dropped the equipped tool into the world" } : { ok: false, message: "Nothing equipped to drop" };
      }
      case "clearbackpack": {
        this.backpack = [];
        this.equipped = null;
        this.removeToolMesh();
        this.setFlashlight(false);
        this.emitHud(true);
        return { ok: true, message: "Backpack cleared — respawn to get the StarterPack back" };
      }
      case "fly": case "flight": {
        const n = num(0);
        if (n !== undefined && Number.isFinite(n) && n > 0) this.flySpeed = clamp(n, 1, 500);
        this.flying = true;
        this.grounded = false;
        this.emitHud(true);
        return { ok: true, message: `Fly mode ON (${this.flySpeed} studs/s) — SPACE up · C or Ctrl down · WASD to fly` };
      }
      case "unfly": {
        this.flying = false;
        this.velocityY = 0;
        this.emitHud(true);
        return { ok: true, message: "Fly mode OFF" };
      }
      case "flyspeed": {
        const n = num(0);
        if (n === undefined || !Number.isFinite(n) || n <= 0) return { ok: false, message: "Usage: :flyspeed <n>  (e.g. :flyspeed 120)" };
        this.flySpeed = clamp(n, 1, 500);
        return { ok: true, message: `Fly speed set to ${this.flySpeed}` };
      }
      case "emote": case "em": {
        // HD Admin style ":dance me" — the target is always you here
        const first = (args[0] ?? "").toLowerCase();
        const q = first === "me" || first === "all" ? (args[1] ?? "") : args.join(" ");
        if (!q) return { ok: false, message: "Usage: :emote <name> — :emotes lists them all" };
        return this.playEmote(q);
      }
      case "emotes": {
        return { ok: true, message: `Emotes: ${emoteList().map((e) => `${e.icon} ${e.id}`).join("  ·  ")} — anyone can /e <name> in chat` };
      }
      case "stopemote": case "unemote":
        return this.playEmote("stop");
      case "wave": case "dance": case "dance2": case "dance3": case "cheer":
      case "laugh": case "point": case "sit": case "robot": case "spin":
      case "headbang": case "zombie": case "jacks": case "clap": case "shout":
        return this.playEmote(cmd);
      case "time": {
        const n = num(0);
        if (n === undefined) return { ok: false, message: "Usage: :time <0-24>  (14 = afternoon, 22 = night)" };
        this.engine.setLighting({ clockTime: clamp(n, 0, 24) }, "Time command");
        return { ok: true, message: `Time of day set to ${n}` };
      }
      case "fog": {
        const n = num(0);
        if (n === undefined) return { ok: false, message: "Usage: :fog <studs>  (default 900)" };
        this.engine.setLighting({ fogEnd: clamp(n, 60, 5000) }, "Fog command");
        return { ok: true, message: `Fog distance set to ${n}` };
      }
      case "clear":
        return { ok: true, message: "Chat cleared", action: "clear-chat" };
      case "cmds": case "help":
        return { ok: true, message: `Commands: ${ADMIN_COMMANDS.map((c) => `:${c.cmd.split(" /")[0]}${c.args ? " " + c.args : ""}`).join("  ·  ")}` };
      default:
        return { ok: false, message: `Unknown command ":${cmd}" — type :cmds to list them all` };
    }
  }

  /* -------------------------------- HUD -------------------------------- */

  getHud(): GameHud {
    const all = this.allOwned();
    return {
      health: this.health,
      maxHealth: this.maxHealth,
      walkSpeed: this.walkSpeed,
      jumpPower: this.jumpPower,
      god: this.god,
      dead: this.dead,
      equipped: this.equipped?.uid ?? null,
      admin: this.admin,
      flying: this.flying,
      emote: this.animator?.activeEmote() ?? null,
      backpack: all.map((o) => ({
        uid: o.uid,
        name: o.def.name,
        icon: o.def.icon,
        desc: o.def.desc,
        toolTip: o.def.toolTip,
        behavior: o.def.behavior,
        stats: toolStats(o.def),
        slot: o.slot,
        equipped: this.equipped === o,
        canBeDropped: o.def.canBeDropped,
        durability: o.durability,
        maxDurability: o.def.maxDurability,
        cooldown: this.cooldowns.get(o.uid) ?? 0,
        cooldownMax: o.def.cooldown,
      })),
      pickup: this.pickupTarget ? { name: this.pickupTarget.def.name, icon: this.pickupTarget.def.icon } : null,
      backpackMax: MAX_BACKPACK,
      players: [
        { name: this.playerName, kills: this.kills, deaths: this.deaths, health: this.health, isBot: false },
        ...this.bots.map((b) => ({ name: b.name, kills: 0, deaths: b.dead ? 1 : 0, health: b.health, isBot: true })),
      ],
    };
  }

  private emitHud(force = false) {
    if (!this.cb.onHud) return;
    const now = performance.now();
    if (!force && now - this.hudLast < 150) return;
    this.hudLast = now;
    this.cb.onHud(this.getHud());
  }

  /* ------------------------------ lifecycle ---------------------------- */

  stop() {
    if (!this.active) return;
    this.active = false;
    for (const rt of this.scriptRuntimes) rt.abort();
    this.scriptRuntimes = [];
    this.touchWatch.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.avatar) {
      this.engine.scene.remove(this.avatar.root);
      this.avatar.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
        }
      });
    }
    if (this.label) {
      this.label.material.map?.dispose();
      this.label.material.dispose();
    }
    this.clearBots();
    this.clearRemotes();
    this.clearWorldTools();
    this.animator = null;
    this.rigAnims.clear();
    this.flying = false;
    this.backpack = [];
    this.equipped = null;
    this.removeToolMesh();
    this.removeFlashlight();
    this.cooldowns.clear();
    if (this.handlersBound) {
      window.removeEventListener("keydown", this.onKeyDown);
      window.removeEventListener("keyup", this.onKeyUp);
      document.removeEventListener("mousemove", this.onMouseMove);
      document.removeEventListener("mousedown", this.onMouseDown);
      document.removeEventListener("mouseup", this.onMouseUp);
      document.removeEventListener("pointerlockchange", this.onLockChange);
      this.handlersBound = false;
    }
    this.keys.clear();
    this.engine.setPlaying(false);
    if (this.savedCamera) {
      this.engine.camera.position.copy(this.savedCamera.pos);
      this.engine.camera.quaternion.copy(this.savedCamera.quat);
    }
    this.cb.onLog?.("info", "Play stopped — edits restored");
  }

  /* ------------------------------ input ------------------------------ */

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.isTyping()) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === "KeyV") {
      this.firstPerson = !this.firstPerson;
      return;
    }
    if (e.code === "KeyR") {
      this.respawn();
      return;
    }
    if (e.code === "KeyE") {
      this.pickupTool();
      return;
    }
    if (e.code === "Backspace") {
      // Roblox behavior: Backspace drops the equipped Tool into the world
      e.preventDefault();
      this.dropEquipped();
      return;
    }
    // tool hotkeys 1..9 — every owned copy has its own hotbar slot
    if (/^Digit[1-9]$/.test(e.code)) {
      const slot = Number(e.code.slice(5)) - 1;
      const owned = this.allOwned().find((o) => o.slot === slot);
      if (owned) this.equipTool(this.equipped === owned ? null : owned.uid);
      return;
    }
    this.keys.add(e.code);
    if (e.code === "Space" && this.grounded && !this.dead && !this.flying) {
      const eq = this.equippedTool();
      this.velocityY = this.jumpPower * (eq?.behavior === "gravity" ? eq.jumpMult : 1);
      this.grounded = false;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!document.pointerLockElement) return;
    this.camYaw -= e.movementX * 0.0032;
    this.camPitch = clamp(this.camPitch - e.movementY * 0.0032, -1.35, 1.35);
  };

  private onLockChange = () => {
    this.cb.onPointerLock?.(!!document.pointerLockElement);
  };

  requestLock() {
    const canvas = this.engine.renderer.domElement;
    if (!document.pointerLockElement) canvas.requestPointerLock();
  }

  /* ---------------------------- collisions --------------------------- */

  private overlapsXZ(px: number, pz: number, playerYaw: number, c: Collider): boolean {
    if (!c.obb) {
      return (
        Math.abs(px - c.center.x) < c.half.x + PLAYER_HALF_W - SKIN &&
        Math.abs(pz - c.center.z) < c.half.z + PLAYER_HALF_W - SKIN
      );
    }
    const pc = Math.cos(playerYaw);
    const ps = Math.sin(playerYaw);
    const bc = Math.cos(c.yaw);
    const bs = Math.sin(c.yaw);
    const pX = [pc, -ps];
    const pZ = [ps, pc];
    const bX = [bc, -bs];
    const bZ = [bs, bc];
    const dx = px - c.center.x;
    const dz = pz - c.center.z;
    for (const axis of [pX, pZ, bX, bZ]) {
      const centerDist = Math.abs(dx * axis[0] + dz * axis[1]);
      const playerRadius =
        PLAYER_HALF_W * Math.abs(axis[0] * pX[0] + axis[1] * pX[1]) +
        PLAYER_HALF_D * Math.abs(axis[0] * pZ[0] + axis[1] * pZ[1]);
      const blockRadius =
        c.hx * Math.abs(axis[0] * bX[0] + axis[1] * bX[1]) +
        c.hz * Math.abs(axis[0] * bZ[0] + axis[1] * bZ[1]);
      if (centerDist >= playerRadius + blockRadius - SKIN) return false;
    }
    return true;
  }

  private collidesAt(x: number, z: number, bottom: number, playerYaw: number): boolean {
    const top = bottom + PLAYER_HEIGHT;
    for (const c of this.colliders) {
      if (!c.data.canCollide) continue;
      const overlapsY = bottom < c.top - SKIN && top > c.bottom + SKIN;
      if (overlapsY && this.overlapsXZ(x, z, playerYaw, c)) return true;
    }
    return false;
  }

  private moveAxis(axis: "x" | "z", distance: number, playerYaw: number, pos: THREE.Vector3) {
    if (!distance) return;
    const steps = Math.max(1, Math.ceil(Math.abs(distance) / 0.35));
    const inc = distance / steps;
    for (let i = 0; i < steps; i++) {
      const nx = axis === "x" ? pos.x + inc : pos.x;
      const nz = axis === "z" ? pos.z + inc : pos.z;
      if (this.collidesAt(nx, nz, pos.y, playerYaw)) break;
      pos[axis] += inc;
    }
  }

  /* ------------------------------ update ----------------------------- */

  update(dt: number) {
    if (!this.avatar) return;
    const root = this.avatar.root;
    const cam = this.engine.camera;

    // --- unanchored part physics (fall until supported)
    for (const dyn of this.dynamic) {
      dyn.vy -= GRAVITY * dt * 0.65;
      const ny = dyn.data.position[1] + dyn.vy * dt;
      const halfY = dyn.data.size[1] / 2;
      let rest: number | null = null;
      if (ny - halfY <= GROUND_Y + 0.01) rest = GROUND_Y + halfY;
      else {
        for (const c of this.colliders) {
          if (c.data.id === dyn.data.id) continue;
          if (
            c.top <= dyn.data.position[1] - halfY + SKIN + 0.01 &&
            c.top >= ny - halfY - 0.05 &&
            Math.abs(c.center.x - dyn.data.position[0]) < c.hx + dyn.data.size[0] / 2 - 0.05 &&
            Math.abs(c.center.z - dyn.data.position[2]) < c.hz + dyn.data.size[2] / 2 - 0.05
          ) {
            rest = c.top + halfY;
            break;
          }
        }
      }
      if (rest !== null) {
        dyn.data.position[1] = rest;
        dyn.vy = 0;
      } else {
        dyn.data.position[1] = ny;
      }
      dyn.mesh.position.y = dyn.data.position[1];
      // refresh collider entry
      const c = this.colliders.find((col) => col.data.id === dyn.data.id);
      if (c) {
        c.center.y = dyn.data.position[1];
        c.top = dyn.data.position[1] + halfY;
        c.bottom = dyn.data.position[1] - halfY;
      }
    }

    // --- death timer / auto respawn
    if (this.dead) {
      root.rotation.x = -Math.PI / 2 * Math.min(1, (3.5 - this.respawnTimer) * 3);
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
    }

    // --- health regen (Roblox default: 1% MaxHealth per second after 5s)
    if (!this.dead) {
      this.regenTimer += dt;
      if (this.regenTimer > 5 && this.health < this.maxHealth) {
        const before = Math.round(this.health);
        this.health = Math.min(this.maxHealth, this.health + this.maxHealth * 0.01 * dt);
        if (Math.round(this.health) !== before) this.fireHealthChanged(this.health);
        this.emitHud();
      }
    }

    // --- fall out of the world = death (flying can't fall)
    if (!this.dead && !this.flying && root.position.y < FALL_DEATH_Y) {
      this.cb.onLog?.("warn", "You fell out of the world!");
      this.takeDamage(1e9);
    }

    // --- movement
    const eq = this.equippedTool();
    const speedMult = eq?.behavior === "speed" ? eq.speedMult : 1;
    const baseSpeed = this.walkSpeed * speedMult;
    const forward = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const move = new THREE.Vector3();
    let moving = false;
    if (this.flying && !this.dead) {
      // --- HD Admin style flight: camera-relative, no gravity
      const fwd3 = new THREE.Vector3(
        -Math.sin(this.camYaw) * Math.cos(this.camPitch),
        Math.sin(this.camPitch),
        -Math.cos(this.camYaw) * Math.cos(this.camPitch),
      );
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) move.add(fwd3);
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) move.sub(fwd3);
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) move.add(right);
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) move.sub(right);
      if (this.keys.has("Space")) move.y += 1;
      if (this.keys.has("KeyC") || this.keys.has("ControlLeft") || this.keys.has("ControlRight")) move.y -= 1;
      moving = move.lengthSq() > 0;
      if (moving) {
        move.normalize();
        this.moveAxis("x", move.x * this.flySpeed * dt, this.yaw, root.position);
        this.moveAxis("z", move.z * this.flySpeed * dt, this.yaw, root.position);
        root.position.y = clamp(root.position.y + move.y * this.flySpeed * dt, 0.05, 900);
        if (Math.hypot(move.x, move.z) > 0.02) {
          const targetYaw = Math.atan2(-move.x, -move.z);
          const delta = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
          this.yaw += delta * Math.min(1, 16 * dt);
          root.rotation.y = this.yaw;
        }
        this.walkPhase += dt * 7;
      } else {
        this.walkPhase *= Math.max(0, 1 - 10 * dt);
      }
      this.velocityY = 0;
      this.grounded = false;
    } else if (!this.dead) {
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) move.add(forward);
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) move.sub(forward);
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) move.add(right);
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) move.sub(right);
      moving = move.lengthSq() > 0;
      if (moving) {
        move.normalize();
        const speed = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) ? baseSpeed * 1.5 : baseSpeed;
        const targetYaw = Math.atan2(-move.x, -move.z);
        const delta = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
        this.yaw += delta * Math.min(1, 16 * dt);
        root.rotation.y = this.yaw;
        this.moveAxis("x", move.x * speed * dt, this.yaw, root.position);
        this.moveAxis("z", move.z * speed * dt, this.yaw, root.position);
        this.walkPhase += dt * (speed > 24 ? 13 : 9);
      } else {
        this.walkPhase *= Math.max(0, 1 - 10 * dt);
      }

      // --- vertical (walking only — flight sets Y directly)
      const gravMult = eq?.behavior === "gravity" && this.velocityY < 0 ? 0.45 : 1;
      const prevBottom = root.position.y;
      this.velocityY -= GRAVITY * gravMult * dt;
      this.velocityY = Math.max(this.velocityY, -160);
      let proposed = prevBottom + this.velocityY * dt;
      let resolved = false;

      if (this.velocityY <= 0) {
        let landing: number | null = null;
        for (const c of this.colliders) {
          const crossed = prevBottom >= c.top - SKIN && proposed <= c.top + SKIN;
          if (crossed && this.overlapsXZ(root.position.x, root.position.z, this.yaw, c)) {
            if (landing === null || c.top > landing) landing = c.top;
          }
        }
        if (proposed <= GROUND_Y) landing = landing === null ? GROUND_Y : Math.max(landing, GROUND_Y);
        if (landing !== null) {
          root.position.y = landing;
          this.velocityY = 0;
          this.grounded = true;
          resolved = true;
        }
      } else {
        const prevTop = prevBottom + PLAYER_HEIGHT;
        const newTop = proposed + PLAYER_HEIGHT;
        let ceiling: number | null = null;
        for (const c of this.colliders) {
          const crossed = prevTop <= c.bottom + SKIN && newTop >= c.bottom - SKIN;
          if (crossed && this.overlapsXZ(root.position.x, root.position.z, this.yaw, c)) {
            if (ceiling === null || c.bottom < ceiling) ceiling = c.bottom;
          }
        }
        if (ceiling !== null) {
          proposed = ceiling - PLAYER_HEIGHT - SKIN;
          this.velocityY = 0;
        }
      }
      if (!resolved) root.position.y = proposed;
    } else {
      // dead — limbs relax
      this.walkPhase *= Math.max(0, 1 - 10 * dt);
    }

    // --- animate limbs (+ sword swing override on right arm)
    const swing = Math.sin(this.walkPhase) * (moving ? 0.85 : 0);
    this.swordSwing = Math.max(0, this.swordSwing - dt * 3.2);
    // cooldowns tick down (Tool.Enabled comes back on)
    for (const [uid, t] of this.cooldowns) {
      const next = t - dt;
      if (next <= 0) this.cooldowns.delete(uid);
      else this.cooldowns.set(uid, next);
    }
    // dropped tools: spin + nearest-within-range pickup target
    this.pickupTarget = null;
    for (const wt of this.worldTools) {
      wt.spin += dt * 1.6;
      wt.mesh.rotation.y = wt.spin;
      wt.mesh.position.y += Math.sin(wt.spin * 2) * 0.004;
      if (!this.pickupTarget && !this.dead) {
        const d = wt.mesh.position.distanceTo(root.position);
        if (d < PICKUP_RANGE) this.pickupTarget = wt;
      }
    }
    if (this.tracer) {
      this.tracer.ttl -= dt;
      const mat = this.tracer.line.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, this.tracer.ttl / 0.09) * 0.95;
      if (this.tracer.ttl <= 0) {
        this.engine.scene.remove(this.tracer.line);
        this.tracer.line.geometry.dispose();
        mat.dispose();
        this.tracer = null;
      }
    }
    this.avatar.leftArm.rotation.x = swing;
    this.avatar.rightArm.rotation.x = -swing - this.swordSwing * this.swordSwing * 3.2;
    this.avatar.leftLeg.rotation.x = -swing;
    this.avatar.rightLeg.rotation.x = swing;

    // --- animation tracks (emotes / script-loaded animations) blend on top
    this.animator?.update(dt);
    // NPC dummies animate their own parts (Workspace models)
    if (this.rigAnims.size) for (const ra of this.rigAnims.values()) ra.update(dt);

    // --- camera
    const camQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.camPitch, this.camYaw, 0, "YXZ"));
    if (this.firstPerson && !this.dead) {
      root.visible = false;
      cam.quaternion.copy(camQuat);
      cam.position.set(root.position.x, root.position.y + 4.5, root.position.z);
    } else {
      root.visible = true;
      cam.quaternion.copy(camQuat);
      const dist = 8.5;
      const dirv = new THREE.Vector3(0, 0, 1).applyQuaternion(camQuat);
      const desired = new THREE.Vector3(root.position.x, root.position.y + 3.4, root.position.z).addScaledVector(dirv, dist);
      // keep camera above ground
      desired.y = Math.max(desired.y, 0.6);
      cam.position.lerp(desired, 1 - Math.exp(-18 * dt));
    }
    if (this.label) this.label.visible = !this.firstPerson;

    // --- bots
    this.updateBots(dt);

    // --- remote avatar interpolation
    for (const entry of this.remotes.values()) {
      entry.avatar.root.position.lerp(entry.target, 1 - Math.exp(-14 * dt));
      const d = Math.atan2(Math.sin(entry.targetYaw - entry.avatar.root.rotation.y), Math.cos(entry.targetYaw - entry.avatar.root.rotation.y));
      entry.avatar.root.rotation.y += d * Math.min(1, 12 * dt);
      // limb swing from real displacement speed (walking remote players animate)
      const speed = entry.lastPos.distanceTo(entry.avatar.root.position) / Math.max(dt, 1e-4);
      entry.lastPos.copy(entry.avatar.root.position);
      entry.walkPhase += Math.min(speed, 26) * dt * 1.7;
      const swing = Math.sin(entry.walkPhase) * Math.min(0.7, (speed / 16) * 0.7);
      if (speed > 1.5) {
        entry.avatar.leftArm.rotation.x = swing;
        entry.avatar.rightArm.rotation.x = -swing;
        entry.avatar.leftLeg.rotation.x = -swing;
        entry.avatar.rightLeg.rotation.x = swing;
      } else {
        const ease = 1 - Math.min(1, 8 * dt);
        entry.avatar.leftArm.rotation.x *= ease;
        entry.avatar.rightArm.rotation.x *= ease;
        entry.avatar.leftLeg.rotation.x *= ease;
        entry.avatar.rightLeg.rotation.x *= ease;
      }
    }

    // --- network state
    this.stateTimer += dt;
    if (this.stateTimer >= 1 / 15) {
      this.stateTimer = 0;
      this.engine.netSend?.({
        type: "state",
        x: root.position.x,
        y: root.position.y,
        z: root.position.z,
        yaw: root.rotation.y,
      });
    }

    // --- BloxScript: resolve waits, fire Heartbeat + Touched
    this.scriptTick(dt);

    // --- HUD
    this.emitHud();
  }

  /* --------------------------- remote players ------------------------ */

  upsertRemote(id: string, name: string, colorHex: number, x: number, y: number, z: number, yaw: number) {
    let entry = this.remotes.get(id);
    if (!entry) {
      const avatar = buildR6Avatar(colorHex, 0x2b9b45, 0xf5c542, true);
      const label = makeNameplate(name);
      avatar.root.add(label);
      avatar.root.position.set(x, y, z);
      avatar.root.rotation.y = yaw;
      this.engine.scene.add(avatar.root);
      entry = { avatar, target: new THREE.Vector3(x, y, z), targetYaw: yaw, label, walkPhase: 0, lastPos: new THREE.Vector3(x, y, z) };
      this.remotes.set(id, entry);
    } else {
      entry.target.set(x, y, z);
      entry.targetYaw = yaw;
    }
  }

  removeRemote(id: string) {
    const entry = this.remotes.get(id);
    if (!entry) return;
    this.engine.scene.remove(entry.avatar.root);
    entry.label.material.map?.dispose();
    entry.label.material.dispose();
    this.remotes.delete(id);
  }

  clearRemotes() {
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
  }

  localState(): { x: number; y: number; z: number; yaw: number } | null {
    if (!this.avatar) return null;
    return {
      x: this.avatar.root.position.x,
      y: this.avatar.root.position.y,
      z: this.avatar.root.position.z,
      yaw: this.avatar.root.rotation.y,
    };
  }
}

export function spawnColorFromName(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const palette = [0xd85a48, 0x1769c2, 0x2b9b45, 0x8e42c8, 0xc2792b, 0x2b8f9c, 0xc42b71, 0x4a5a2b];
  return palette[h % palette.length];
}

function botColorFromName(name: string): number {
  return spawnColorFromName(name);
}

/* ------------------------------------------------------------------ */
/* Tool meshes (held in the right hand)                                */
/* ------------------------------------------------------------------ */

function buildToolMesh(id: string, tools: RuntimeTool[] = []): THREE.Group {
  const g = new THREE.Group();
  const custom = tools.find((t) => t.id === id && t.custom);
  if (custom) {
    buildCustomToolMesh(g, custom);
    return g;
  }
  if (id === "sword") {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 3.4),
      new THREE.MeshStandardMaterial({ color: 0xc8ced6, metalness: 0.85, roughness: 0.25 }),
    );
    blade.position.set(0, -1.8, -1.85);
    blade.castShadow = true;
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.5, 4),
      new THREE.MeshStandardMaterial({ color: 0xc8ced6, metalness: 0.85, roughness: 0.25 }),
    );
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(0, -1.8, -3.65);
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.22, 0.32),
      new THREE.MeshStandardMaterial({ color: 0x8a6d2f, metalness: 0.6, roughness: 0.4 }),
    );
    guard.position.set(0, -1.8, -0.25);
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.9 }),
    );
    grip.rotation.x = Math.PI / 2;
    grip.position.set(0, -1.8, 0.25);
    g.add(blade, tip, guard, grip);
  } else if (id === "flashlight") {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 1.1, 12),
      new THREE.MeshStandardMaterial({ color: 0x2e6bd6, metalness: 0.5, roughness: 0.4 }),
    );
    body.rotation.x = Math.PI / 2;
    body.position.set(0, -1.8, -0.8);
    body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.18, 0.35, 12),
      new THREE.MeshStandardMaterial({ color: 0xd8dee6, metalness: 0.7, roughness: 0.3 }),
    );
    head.rotation.x = Math.PI / 2;
    head.position.set(0, -1.8, -1.45);
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.21, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffe9a8, emissiveIntensity: 2.4 }),
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, -1.8, -1.64);
    g.add(body, head, lens);
  } else if (id === "speedcoil" || id === "gravitycoil") {
    // coil: stacked glowing rings
    const color = id === "speedcoil" ? 0x00d2ff : 0x9b59d0;
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.09, 8, 18),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.4 }),
      );
      ring.position.set(0, -1.55 - i * 0.16, -0.55);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x333a40, roughness: 0.8 }),
    );
    handle.position.set(0, -1.3, -0.2);
    g.add(handle);
  }
  return g;
}

/** Build a user-created tool's handle from its shape + BrickColor, with a per-behavior flourish. */
function buildCustomToolMesh(g: THREE.Group, tool: RuntimeTool) {
  const hex = new THREE.Color(brickColorHex(tool.handleColor));
  const mk = (geom: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = -1.8, z = -0.9) => {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const main = new THREE.MeshStandardMaterial({ color: hex, metalness: 0.45, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x333a40, roughness: 0.8 });
  switch (tool.handleShape) {
    case "Sphere":
      mk(new THREE.SphereGeometry(0.55, 18, 14), main);
      break;
    case "Cylinder":
      mk(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 14), main, 0, -1.8, -0.7).rotation.x = Math.PI / 2;
      break;
    case "Wedge":
      mk(new THREE.CylinderGeometry(0.06, 0.34, 1.6, 3), main, 0, -1.8, -0.8).rotation.x = Math.PI / 2;
      break;
    case "CornerWedge":
      mk(new THREE.CylinderGeometry(0.34, 0.06, 1.6, 3), main, 0, -1.8, -0.8).rotation.x = Math.PI / 2;
      break;
    default:
      mk(new THREE.BoxGeometry(0.55, 0.55, 1.4), main, 0, -1.8, -0.7);
  }
  // grip so every tool looks holdable
  const grip = mk(new THREE.CylinderGeometry(0.13, 0.13, 0.75, 8), dark, 0, -1.35, -0.15);
  grip.rotation.x = Math.PI / 2;
  // behavior flourishes
  if (tool.behavior === "gun") {
    const barrel = mk(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 10), dark, 0, -1.9, -1.9);
    barrel.rotation.x = Math.PI / 2;
    const sight = mk(new THREE.BoxGeometry(0.1, 0.16, 0.34), dark, 0, -2.1, -0.95);
    sight.castShadow = false;
  } else if (tool.behavior === "sword") {
    const blade = mk(new THREE.BoxGeometry(0.26, 0.26, 2.9), new THREE.MeshStandardMaterial({ color: hex, metalness: 0.85, roughness: 0.22 }), 0, -1.8, -2.5);
    blade.castShadow = true;
    const tip = mk(new THREE.ConeGeometry(0.18, 0.45, 4), blade.material as THREE.Material, 0, -1.8, -4.1);
    tip.rotation.x = -Math.PI / 2;
    const guard = mk(new THREE.BoxGeometry(0.85, 0.2, 0.28), new THREE.MeshStandardMaterial({ color: 0x8a6d2f, metalness: 0.6, roughness: 0.4 }), 0, -1.8, -0.95);
    guard.castShadow = false;
  } else if (tool.behavior === "heal") {
    const cross1 = mk(new THREE.BoxGeometry(0.7, 0.18, 0.18), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), 0, -2.2, -1.0);
    const cross2 = mk(new THREE.BoxGeometry(0.18, 0.7, 0.18), cross1.material as THREE.Material, 0, -2.2, -1.0);
    cross1.castShadow = cross2.castShadow = false;
  } else if (tool.behavior === "teleport") {
    const orb = mk(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshStandardMaterial({ color: 0x9b6bff, emissive: 0x9b6bff, emissiveIntensity: 1.2, roughness: 0.3 }), 0, -2.1, -1.2);
    orb.castShadow = false;
  } else if (tool.behavior === "flashlight") {
    const head = mk(new THREE.CylinderGeometry(0.24, 0.17, 0.32, 12), new THREE.MeshStandardMaterial({ color: 0xd8dee6, metalness: 0.7, roughness: 0.3 }), 0, -1.8, -1.5);
    head.rotation.x = Math.PI / 2;
    const lens = mk(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffe9a8, emissiveIntensity: 2.4, roughness: 0.3 }), 0, -1.8, -1.68);
    lens.rotation.x = Math.PI / 2;
    lens.castShadow = false;
  } else {
    // coil-style glowing rings for speed / gravity
    const emissive = tool.behavior === "speed" ? hex.getHex() : 0x9b59d0;
    for (let i = 0; i < 3; i++) {
      const ring = mk(
        new THREE.TorusGeometry(0.42, 0.08, 8, 18),
        new THREE.MeshStandardMaterial({ color: emissive, emissive: emissive, emissiveIntensity: 1.4, roughness: 0.4 }),
        0,
        -1.9 - i * 0.15,
        -0.8,
      );
      ring.rotation.x = Math.PI / 2;
      ring.castShadow = false;
    }
  }
}
