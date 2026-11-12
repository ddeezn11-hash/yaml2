export type PartShape = "Block" | "Sphere" | "Wedge" | "Cylinder" | "CornerWedge";

export type RigKind = "R6" | "R15";

export type Vec3 = [number, number, number];

/** Script kinds, mirroring Roblox Studio's script classes. */
export type ScriptKind = "Script" | "LocalScript" | "ModuleScript";

/** A code file living in the Explorer tree (like Roblox Script/LocalScript/ModuleScript). */
export interface ScriptData {
  id: string;
  name: string;
  kind: ScriptKind;
  /** Service/container id (for example ServerScriptService, StarterPlayerScripts, StarterCharacterScripts, StarterGui, ReplicatedStorage, Workspace) or a model id. */
  parentId: string;
  source: string;
  enabled: boolean;
}

/** One keyframe of a part track inside an animation. */
export interface AnimKeyframe {
  /** Time in seconds from animation start. */
  t: number;
  pos: Vec3;
  rot: Vec3;
}

/** Keyframe animation attached to a Model (rig). */
export interface AnimationData {
  id: string;
  name: string;
  duration: number;
  loop: boolean;
  /** partId → keyframes sorted by time. */
  tracks: Record<string, AnimKeyframe[]>;
}

/** Serialized, network-safe description of a part (mirrors Roblox BasePart props). */
export interface PartData {
  id: string;
  name: string;
  shape: PartShape;
  /** World position of the part center. */
  position: Vec3;
  /** Rotation in degrees (Euler XYZ order, like Roblox Orientation). */
  rotation: Vec3;
  size: Vec3;
  /** BrickColor name, e.g. "Bright red". */
  color: string;
  material: string;
  transparency: number; // 0..1
  reflectance: number;  // 0..1
  anchored: boolean;
  canCollide: boolean;
  castShadow: boolean;
  /** Model id this part belongs to, or null when directly under Workspace. */
  parentId: string | null;
  /** Marks the SpawnLocation part. */
  isSpawn?: boolean;
  /** Custom texture asset id (key into PlaceState.assets), or null. */
  texture?: string | null;
  /** Texture tiling (repeats across the part's X/Z), default 1. */
  textureTiles?: number;
}

export interface ModelData {
  id: string;
  name: string;
}

/** A custom game tool the creator designed in the Tool Creator (like a Roblox Tool in StarterPack). */
export type ToolBehavior = "sword" | "gun" | "heal" | "speed" | "gravity" | "teleport" | "flashlight" | "script";

export interface CustomToolData {
  id: string;
  name: string;
  /** Emoji shown in the backpack slot. */
  icon: string;
  behavior: ToolBehavior;
  /** Damage per hit (sword / gun). */
  damage: number;
  /** Sword swing reach in studs. */
  reach: number;
  /** WalkSpeed multiplier while equipped (speed / gravity). */
  speedMult: number;
  /** JumpPower multiplier while equipped (gravity). */
  jumpMult: number;
  /** Health restored per click (heal). */
  healAmount: number;
  /** Handle visual shape + BrickColor. */
  handleShape: PartShape;
  handleColor: string;
  /** Player-facing description shown on the backpack slot. */
  desc: string;
  /* ---- Roblox Tool properties (optional: old saves are migrated by
     normalizeToolData in data.ts) ---- */
  /** Hover text — maps to the Roblox Tool.ToolTip property. */
  toolTip?: string;
  /** Whether the tool needs a Handle part (Roblox Tool.RequiresHandle). */
  requiresHandle?: boolean;
  /** Whether Backspace / the Drop button may drop it (Tool.CanBeDropped). */
  canBeDropped?: boolean;
  /** Seconds between activations — gates Tool.Enabled. */
  cooldown?: number;
  /** Uses before the tool breaks; 0 = never breaks (like an Attribute). */
  maxDurability?: number;
}

export type UIElementClass = "Frame" | "TextLabel" | "TextButton" | "TextBox" | "ImageLabel" | "ImageButton";

/** A ScreenGui child edited in the Blockyard UI designer. Coordinates are % of a 800x450 design surface. */
export interface UIObjectData {
  id: string;
  name: string;
  className: UIElementClass;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  visible: boolean;
  zIndex: number;
}

export interface PlaceState {
  version: 1;
  name: string;
  parts: PartData[];
  models: ModelData[];
  lighting: LightingData;
  /** Code files (Scripts, LocalScripts, ModuleScripts). */
  scripts?: ScriptData[];
  /** Texture assets: id → data URL. */
  assets?: Record<string, string>;
  /** Baseplate custom texture asset id (null = classic studs). */
  baseplateTexture?: string | null;
  /** Baseplate texture repeats across the plate (default 64). */
  baseplateTiles?: number;
  /** Model id → saved keyframe animations. */
  animations?: Record<string, AnimationData[]>;
  /** Custom game tools in StarterPack (equippable in play mode). */
  tools?: CustomToolData[];
  /** GUI elements parented to StarterGui and cloned into each player screen. */
  uiObjects?: UIObjectData[];
  /** Custom baseplate color (hex). */
  baseplateColor?: string;
}

export interface LightingData {
  ambient: number;    // 0..1 scalar, tinted blue-grey
  brightness: number; // sun intensity multiplier
  clockTime: number;  // 0..24 hours
  fogEnd: number;     // studs
}

export type ToolId = "select" | "move" | "scale" | "rotate";

export interface HistoryEntry {
  label: string;
  before: PlaceState;
  after: PlaceState;
}

export type LogLevel = "info" | "warn" | "error" | "success";

export interface LogLine {
  id: number;
  time: string;
  level: LogLevel;
  text: string;
}

export interface NetPlayer {
  id: string;
  name: string;
  color: number;
}

/* ---------------------- Team Create access roles ---------------------- */

/** Granular collaborator role on a shared (Team Create) project. */
export type CollabRole = "viewer" | "builder" | "editor";

/** Everything a role may do inside a shared Studio project. */
export interface RolePerms {
  /** See the place and play-test it. */
  viewPlace: boolean;
  /** Open scripts (except ones the owner marked hidden). */
  viewScripts: boolean;
  /** Create / move / delete parts. */
  editParts: boolean;
  /** Edit script source, rename or delete scripts. */
  editScripts: boolean;
  /** Edit the tool list (StarterPack). */
  editTools: boolean;
  /** Edit saved keyframe animations. */
  editAnimations: boolean;
  /** Talk in the Team Chat panel. */
  chat: boolean;
}

export const ROLE_PERMS: Record<CollabRole, RolePerms> = {
  viewer: { viewPlace: true, viewScripts: true, editParts: false, editScripts: false, editTools: false, editAnimations: false, chat: true },
  builder: { viewPlace: true, viewScripts: true, editParts: true, editScripts: false, editTools: false, editAnimations: true, chat: true },
  editor: { viewPlace: true, viewScripts: true, editParts: true, editScripts: true, editTools: true, editAnimations: true, chat: true },
};

export const ROLE_LABEL: Record<CollabRole, string> = {
  viewer: "Viewer",
  builder: "Builder",
  editor: "Editor",
};

export const ROLE_DESC: Record<CollabRole, string> = {
  viewer: "Look around and read code, but change nothing",
  builder: "Build with parts and animations — scripts stay read-only",
  editor: "Full building + scripting access",
};

/** The access level of THIS client inside the current Team Create session. */
export interface StudioAccess {
  role: "owner" | CollabRole;
  /** Published game the shared room belongs to. */
  gameName: string;
  canEditParts: boolean;
  canEditScripts: boolean;
  /** Script names the owner hid from viewers/builders. */
  hiddenScripts: string[];
}

/* -------------------------- Team Create chat -------------------------- */
/** A reference to a file (script) inside the studio project, sent in chat. */
export interface TeamFileRef {
  /** Script id in the sender's project (matched by name on other clients). */
  id: string;
  /** Script name shown on the chip, e.g. "WaveDummy". */
  name: string;
  /** Script kind: "Script" | "LocalScript" | "ModuleScript". */
  kind: string;
  /** First lines of source so readers see the code even before opening. */
  preview?: string;
}

/** A live chat message between builders on the same project (Team Create). */
export interface TeamChatMessage {
  id: number;
  name: string;
  text: string;
  system?: boolean;
  /** Attached image (downscaled data URL). */
  image?: string;
  /** Attached project file reference (opens in the Script Editor). */
  fileRef?: TeamFileRef;
  at: number;
  /** True when sent by the local builder. */
  mine?: boolean;
}
