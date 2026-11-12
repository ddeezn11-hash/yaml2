import type { CustomToolData, LightingData, PartData, PartShape, ScriptData, ToolBehavior, Vec3 } from "./types";

/* ------------------------------------------------------------------ */
/* BrickColor palette — the classic Roblox Studio color widget data.  */
/* [name, palette number, hex]                                         */
/* Source: Roblox BrickColor reference (create.roblox.com / wiki).     */
/* ------------------------------------------------------------------ */
export const BRICK_COLORS: [string, number, string][] = [
  ["White", 1, "#F2F3F3"],
  ["Grey", 2, "#A1A5A2"],
  ["Light yellow", 3, "#F9E999"],
  ["Brick yellow", 5, "#D7C59A"],
  ["Light green (Mint)", 6, "#C2DAB8"],
  ["Light reddish violet", 9, "#E8BAC8"],
  ["Pastel Blue", 11, "#80BBDB"],
  ["Light orange brown", 12, "#CB8442"],
  ["Nougat", 18, "#CC8E69"],
  ["Bright red", 21, "#C4281C"],
  ["Med. reddish violet", 22, "#C470A0"],
  ["Bright blue", 23, "#0D69AC"],
  ["Bright yellow", 24, "#F5CD30"],
  ["Earth orange", 25, "#624732"],
  ["Black", 26, "#1B2A35"],
  ["Dark grey", 27, "#6D6E6C"],
  ["Dark green", 28, "#287F47"],
  ["Medium green", 29, "#A1C48C"],
  ["Lig. Yellowich orange", 36, "#F3CF9B"],
  ["Bright green", 37, "#4B974B"],
  ["Dark orange", 38, "#A05F35"],
  ["Light bluish violet", 39, "#C1CADE"],
  ["Transparent", 40, "#ECECEC"],
  ["Tr. Red", 41, "#CD544B"],
  ["Tr. Lg blue", 42, "#C1DFF0"],
  ["Tr. Blue", 43, "#7BB6E8"],
  ["Tr. Yellow", 44, "#F7F18D"],
  ["Light blue", 45, "#B4D2E4"],
  ["Tr. Flu. Reddish orange", 47, "#D9856C"],
  ["Tr. Green", 48, "#84B68D"],
  ["Tr. Flu. Green", 49, "#F8F184"],
  ["Phosph. White", 50, "#ECE8DE"],
  ["Light red", 100, "#EEC4B6"],
  ["Medium red", 101, "#DA867A"],
  ["Medium blue", 102, "#6E99CA"],
  ["Light grey", 103, "#C7C1B7"],
  ["Bright violet", 104, "#6B327C"],
  ["Br. yellowish orange", 105, "#E29B40"],
  ["Bright orange", 106, "#DA8541"],
  ["Bright bluish green", 107, "#008F9C"],
  ["Earth yellow", 108, "#685C43"],
  ["Bright bluish violet", 110, "#435493"],
  ["Tr. Brown", 111, "#BFB7B1"],
  ["Medium bluish violet", 112, "#6874AC"],
  ["Tr. Medi. reddish violet", 113, "#E5ADC8"],
  ["Med. yellowish green", 115, "#C7D23C"],
  ["Med. bluish green", 116, "#55A5AF"],
  ["Light bluish green", 118, "#B7D7D5"],
  ["Br. yellowish green", 119, "#A4BD47"],
  ["Lig. yellowish green", 120, "#D9E4A7"],
  ["Med. yellowish orange", 121, "#E7AC58"],
  ["Br. reddish orange", 123, "#D36F4C"],
  ["Bright reddish violet", 124, "#923978"],
  ["Light orange", 125, "#EAB892"],
  ["Tr. Bright bluish violet", 126, "#A5A5CB"],
  ["Gold", 127, "#DCBC81"],
  ["Dark nougat", 128, "#AE7A59"],
  ["Silver", 131, "#9CA3A8"],
  ["Neon orange", 133, "#D5733D"],
  ["Neon green", 134, "#D8DD56"],
  ["Sand blue", 135, "#74869D"],
  ["Sand violet", 136, "#877C90"],
  ["Medium orange", 137, "#E09864"],
  ["Sand yellow", 138, "#958A73"],
  ["Earth blue", 140, "#203A56"],
  ["Earth green", 141, "#27462D"],
  ["Tr. Flu. Blue", 143, "#CFE2F7"],
  ["Sand blue metallic", 145, "#7988A1"],
  ["Sand violet metallic", 146, "#958EA3"],
  ["Sand yellow metallic", 147, "#938767"],
  ["Dark grey metallic", 148, "#575857"],
  ["Black metallic", 149, "#161D32"],
  ["Light grey metallic", 150, "#ABADAC"],
  ["Sand green", 151, "#789082"],
  ["Sand red", 153, "#957977"],
  ["Dark red", 154, "#7B2E2F"],
  ["Tr. Flu. Yellow", 157, "#FFF67B"],
  ["Tr. Flu. Red", 158, "#E1A4C2"],
  ["Gun metallic", 168, "#756C62"],
  ["Red flip/flop", 176, "#97695B"],
  ["Yellow flip/flop", 178, "#B48455"],
  ["Silver flip/flop", 179, "#898788"],
  ["Curry", 180, "#D7A94B"],
  ["Fire Yellow", 190, "#F9D62E"],
  ["Flame yellowish orange", 191, "#E8AB2D"],
  ["Reddish brown", 192, "#694028"],
  ["Flame reddish orange", 193, "#CF6024"],
  ["Medium stone grey", 194, "#A3A2A5"],
  ["Royal blue", 195, "#4667A4"],
  ["Dark Royal blue", 196, "#23478B"],
  ["Bright reddish lilac", 198, "#8E4285"],
  ["Dark stone grey", 199, "#635F62"],
  ["Lemon metalic", 200, "#828A5D"],
  ["Light stone grey", 208, "#E5E4DF"],
  ["Dark Curry", 209, "#B08E44"],
  ["Faded green", 210, "#709578"],
  ["Turquoise", 211, "#79B5B5"],
  ["Light Royal blue", 212, "#9FC3E9"],
  ["Medium Royal blue", 213, "#6C81B7"],
  ["Rust", 216, "#904C2A"],
  ["Brown", 217, "#7C5C46"],
  ["Reddish lilac", 218, "#96709F"],
  ["Lilac", 219, "#6B629B"],
  ["Light lilac", 220, "#A7A9CE"],
  ["Bright purple", 221, "#CD6298"],
  ["Light purple", 222, "#E4ADC8"],
  ["Light pink", 223, "#DC9095"],
  ["Light brick yellow", 224, "#F0D5A0"],
  ["Warm yellowish orange", 225, "#EBB87F"],
  ["Cool yellow", 226, "#FDEA8D"],
  ["Dove blue", 232, "#7DBBDD"],
  ["Medium lilac", 268, "#342B75"],
  ["Slime green", 301, "#506D54"],
  ["Smoky grey", 302, "#5B5D69"],
  ["Dark blue", 303, "#0010B0"],
  ["Parsley green", 304, "#2C651D"],
  ["Steel blue", 305, "#527CAE"],
  ["Storm blue", 306, "#335882"],
  ["Lapis", 307, "#102ADC"],
  ["Dark indigo", 308, "#3D1585"],
  ["Sea green", 309, "#348E40"],
  ["Shamrock", 310, "#5B9A4C"],
  ["Fossil", 311, "#9FA1AC"],
  ["Mulberry", 312, "#592259"],
  ["Forest green", 313, "#1F801D"],
  ["Cadet blue", 314, "#9FADC0"],
  ["Electric blue", 315, "#0989CF"],
  ["Eggplant", 316, "#7B007B"],
  ["Moss", 317, "#7C9C6B"],
  ["Artichoke", 318, "#8AAB85"],
  ["Sage green", 319, "#B9C4B1"],
  ["Ghost grey", 320, "#CACBD1"],
  ["Bright lilac", 321, "#A75E9B"],
  ["Plum", 322, "#7B2F7B"],
  ["Olivine", 323, "#94BE81"],
  ["Laurel green", 324, "#A8BD99"],
  ["Quill grey", 325, "#DFDFDE"],
  ["Crimson", 327, "#970000"],
  ["Mint", 328, "#B1E5A6"],
  ["Baby blue", 329, "#98C2DB"],
  ["Carnation pink", 330, "#FF98DC"],
  ["Persimmon", 331, "#FF5959"],
  ["Maroon", 332, "#750000"],
  ["New Yeller", 1009, "#FFFF00"],
  ["Really black", 1003, "#111111"],
  ["Really red", 1004, "#FF0000"],
  ["Really blue", 1010, "#0000FF"],
  ["Deep orange", 1005, "#FFB000"],
  ["Alder", 1006, "#B480FF"],
  ["Dusty Rose", 1007, "#A34B4B"],
  ["Olive", 1008, "#C1BE42"],
  ["Navy blue", 1011, "#002060"],
  ["Deep blue", 1012, "#2154B9"],
  ["Cyan", 1013, "#04AFEC"],
  ["CGA brown", 1014, "#AA5500"],
  ["Magenta", 1015, "#AA00AA"],
  ["Pink", 1016, "#FF66CC"],
  ["Teal", 1018, "#12EED4"],
  ["Toothpaste", 1019, "#00FFFF"],
  ["Lime green", 1020, "#00FF00"],
  ["Camo", 1021, "#3A7D15"],
  ["Grime", 1022, "#7F8E64"],
  ["Lavender", 1023, "#8C5B9F"],
  ["Pastel light blue", 1024, "#AFDDFF"],
  ["Pastel orange", 1025, "#FFC9C9"],
  ["Pastel violet", 1026, "#B1A7FF"],
  ["Pastel blue-green", 1027, "#9FF3E9"],
  ["Pastel green", 1028, "#CCFFCC"],
  ["Pastel yellow", 1029, "#FFFFCC"],
  ["Pastel brown", 1030, "#FFCC99"],
  ["Royal purple", 1031, "#6225D1"],
  ["Hot pink", 1032, "#FF00BF"],
  ["Institutional white", 1001, "#F8F8F8"],
  ["Mid gray", 1002, "#CDCDCD"],
];

const COLOR_MAP = new Map(BRICK_COLORS.map(([name, , hex]) => [name.toLowerCase(), hex]));
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function brickColorHex(name: string): string {
  if (typeof name === "string" && HEX_RE.test(name)) return name; // raw hex from scripts
  return COLOR_MAP.get(String(name).toLowerCase()) ?? "#A3A2A5";
}

export function brickColorNumber(name: string): number {
  return BRICK_COLORS.find(([n]) => n.toLowerCase() === String(name).toLowerCase())?.[1] ?? 194;
}

export function nearestBrickColorName(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  let best = "Medium stone grey";
  let bestDist = Infinity;
  for (const [name, , h] of BRICK_COLORS) {
    const dr = parseInt(h.slice(1, 3), 16) - r;
    const dg = parseInt(h.slice(3, 5), 16) - g;
    const db = parseInt(h.slice(5, 7), 16) - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Materials — browsable Roblox materials mapped to Three.js params.  */
/* ------------------------------------------------------------------ */
export interface MaterialDef {
  name: string;
  /** Roughness for MeshStandardMaterial. */
  roughness: number;
  metalness: number;
  /** Base opacity multiplier (Glass, Ice...). */
  opacity?: number;
  /** Emissive intensity for Neon / ForceField / CrackedLava. */
  emissive?: number;
  /** Procedural grayscale texture recipe id (null = flat). */
  texture: string | null;
  /** Texture tile size in studs. */
  texScale?: number;
}

export const MATERIALS: MaterialDef[] = [
  { name: "Plastic", roughness: 0.8, metalness: 0.02, texture: null },
  { name: "SmoothPlastic", roughness: 0.28, metalness: 0.02, texture: null },
  { name: "Neon", roughness: 0.4, metalness: 0, emissive: 1.9, texture: null },
  { name: "Wood", roughness: 0.86, metalness: 0, texture: "wood", texScale: 4 },
  { name: "WoodPlanks", roughness: 0.9, metalness: 0, texture: "planks", texScale: 4 },
  { name: "Marble", roughness: 0.22, metalness: 0.05, texture: "marble", texScale: 6 },
  { name: "Slate", roughness: 0.85, metalness: 0, texture: "slate", texScale: 5 },
  { name: "Concrete", roughness: 0.95, metalness: 0, texture: "concrete", texScale: 4 },
  { name: "Granite", roughness: 0.8, metalness: 0.05, texture: "granite", texScale: 4 },
  { name: "Brick", roughness: 0.92, metalness: 0, texture: "brick", texScale: 4 },
  { name: "Pebble", roughness: 0.9, metalness: 0, texture: "pebble", texScale: 4 },
  { name: "Cobblestone", roughness: 0.9, metalness: 0, texture: "cobble", texScale: 4 },
  { name: "Rock", roughness: 0.95, metalness: 0, texture: "rock", texScale: 5 },
  { name: "Sandstone", roughness: 0.9, metalness: 0, texture: "sandstone", texScale: 5 },
  { name: "Limestone", roughness: 0.85, metalness: 0, texture: "limestone", texScale: 5 },
  { name: "CorrodedMetal", roughness: 0.95, metalness: 0.45, texture: "corroded", texScale: 4 },
  { name: "DiamondPlate", roughness: 0.4, metalness: 0.85, texture: "diamondplate", texScale: 3 },
  { name: "Foil", roughness: 0.18, metalness: 0.9, texture: "foil", texScale: 4 },
  { name: "Metal", roughness: 0.35, metalness: 0.85, texture: "brushedmetal", texScale: 4 },
  { name: "Grass", roughness: 0.95, metalness: 0, texture: "grass", texScale: 4 },
  { name: "LeafyGrass", roughness: 0.95, metalness: 0, texture: "leafygrass", texScale: 4 },
  { name: "Sand", roughness: 0.98, metalness: 0, texture: "sand", texScale: 3 },
  { name: "Fabric", roughness: 1, metalness: 0, texture: "fabric", texScale: 2 },
  { name: "Snow", roughness: 0.75, metalness: 0, texture: "snow", texScale: 4 },
  { name: "Mud", roughness: 0.98, metalness: 0, texture: "mud", texScale: 4 },
  { name: "Ground", roughness: 0.98, metalness: 0, texture: "ground", texScale: 4 },
  { name: "Asphalt", roughness: 0.95, metalness: 0, texture: "asphalt", texScale: 4 },
  { name: "Salt", roughness: 0.9, metalness: 0, texture: "salt", texScale: 3 },
  { name: "Ice", roughness: 0.12, metalness: 0, opacity: 0.72, texture: "ice", texScale: 4 },
  { name: "Glacier", roughness: 0.15, metalness: 0, opacity: 0.55, texture: "glacier", texScale: 5 },
  { name: "Glass", roughness: 0.05, metalness: 0, opacity: 0.35, texture: null },
  { name: "ForceField", roughness: 0.3, metalness: 0.1, opacity: 0.55, emissive: 0.5, texture: "forcefield", texScale: 3 },
  { name: "Pavement", roughness: 0.9, metalness: 0, texture: "pavement", texScale: 4 },
  { name: "CrackedLava", roughness: 0.9, metalness: 0.05, emissive: 1.2, texture: "crackedlava", texScale: 5 },
  { name: "Plaster", roughness: 0.9, metalness: 0, texture: "plaster", texScale: 4 },
  { name: "Cardboard", roughness: 0.95, metalness: 0, texture: "cardboard", texScale: 4 },
  { name: "Carpet", roughness: 1, metalness: 0, texture: "carpet", texScale: 3 },
  { name: "CeramicTiles", roughness: 0.15, metalness: 0.05, texture: "ceramic", texScale: 3 },
  { name: "ClayRoofTiles", roughness: 0.9, metalness: 0, texture: "claytiles", texScale: 3 },
  { name: "Leather", roughness: 0.75, metalness: 0, texture: "leather", texScale: 3 },
  { name: "Rubber", roughness: 0.98, metalness: 0, texture: "rubber", texScale: 3 },
];

const MATERIAL_MAP = new Map(MATERIALS.map((m) => [m.name.toLowerCase(), m]));

export function materialDef(name: string): MaterialDef {
  return MATERIAL_MAP.get(String(name).toLowerCase()) ?? MATERIALS[0];
}

/* ------------------------------------------------------------------ */
/* Defaults & templates                                               */
/* ------------------------------------------------------------------ */
export const DEFAULT_LIGHTING: LightingData = {
  ambient: 0.5,
  brightness: 1,
  clockTime: 14,
  fogEnd: 900,
};

export const BASEPLATE_SIZE = 512;

export const SHAPE_ORDER: PartShape[] = ["Block", "Sphere", "Wedge", "Cylinder", "CornerWedge"];

export const DEFAULT_PART_SIZE: Vec3 = [4, 4, 4];

export function uid(prefix: string): string {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/* ------------------------------------------------------------------ */
/* Tool definitions — StarterPack templates                            */
/* ------------------------------------------------------------------ */

/** Default activation cooldown per behavior, used when a tool doesn't set one. */
export const BEHAVIOR_COOLDOWN: Record<ToolBehavior, number> = {
  sword: 0.45,
  gun: 0.25,
  heal: 1,
  speed: 0,
  gravity: 0,
  teleport: 0.6,
  flashlight: 0.15,
  script: 0,
};

/**
 * Fill in the Roblox Tool properties every tool carries (ToolTip,
 * RequiresHandle, CanBeDropped, cooldown, durability). Old saved places
 * are migrated through here so the inventory rewrite stays load-compatible.
 */
export function normalizeToolData(t: CustomToolData): Required<CustomToolData> {
  return {
    ...t,
    desc: t.desc ?? "",
    toolTip: t.toolTip ?? "",
    requiresHandle: t.requiresHandle ?? true,
    canBeDropped: t.canBeDropped ?? true,
    cooldown: t.cooldown ?? BEHAVIOR_COOLDOWN[t.behavior] ?? 0,
    maxDurability: t.maxDurability ?? 0,
  };
}

/**
 * The classic Roblox gear catalog, offered in the Toolbox → Gear tab.
 * Every entry is a Tool template: add it to StarterPack and every player
 * gets a copy in their Backpack on spawn (the real Roblox pattern).
 */
export interface GearCatalogItem extends Omit<CustomToolData, "id"> {
  /** Short flavor/era line shown on the catalog card. */
  era: string;
}

export const GEAR_CATALOG: GearCatalogItem[] = [
  {
    name: "Classic Sword", icon: "⚔️", behavior: "sword", damage: 34, reach: 8, speedMult: 1, jumpMult: 1, healAmount: 0,
    handleShape: "Block", handleColor: "Medium stone grey", desc: "Click to slash — damages bots in front of you",
    toolTip: "The 2007 Linked Sword. Click to swing.", requiresHandle: true, canBeDropped: true, cooldown: 0.45, maxDurability: 0,
    era: "2007 classic",
  },
  {
    name: "Katana", icon: "🗡️", behavior: "sword", damage: 30, reach: 9, speedMult: 1, jumpMult: 1, healAmount: 0,
    handleShape: "Block", handleColor: "Black", desc: "Faster, longer blade — less damage per hit",
    toolTip: "Swift strikes, long reach.", requiresHandle: true, canBeDropped: true, cooldown: 0.4, maxDurability: 0,
    era: "Sword fighter's pick",
  },
  {
    name: "Darkheart", icon: "🗡️", behavior: "sword", damage: 42, reach: 8, speedMult: 1, jumpMult: 1, healAmount: 0,
    handleShape: "Block", handleColor: "Really red", desc: "Heavy hits — the legendary blade wears out",
    toolTip: "A legendary blade. Handle with respect.", requiresHandle: true, canBeDropped: true, cooldown: 0.55, maxDurability: 60,
    era: "Legendary",
  },
  {
    name: "Slingshot", icon: "🏹", behavior: "gun", damage: 8, reach: 0, speedMult: 1, jumpMult: 1, healAmount: 0,
    handleShape: "Wedge", handleColor: "Deep orange", desc: "Click to shoot — 8 damage per pellet",
    toolTip: "The original 2007 ranged tool.", requiresHandle: true, canBeDropped: true, cooldown: 0.2, maxDurability: 0,
    era: "2007 classic",
  },
  {
    name: "Superball", icon: "🏀", behavior: "gun", damage: 12, reach: 0, speedMult: 1, jumpMult: 1, healAmount: 0,
    handleShape: "Sphere", handleColor: "Bright blue", desc: "Click to throw — 12 damage per bounce hit",
    toolTip: "Bouncy! It just keeps going.", requiresHandle: true, canBeDropped: true, cooldown: 0.5, maxDurability: 0,
    era: "2007 classic",
  },
  {
    name: "Paintball Gun", icon: "🎨", behavior: "gun", damage: 15, reach: 0, speedMult: 1, jumpMult: 1, healAmount: 0,
    handleShape: "Block", handleColor: "Lime green", desc: "Click to shoot — 15 damage, paint included",
    toolTip: "Leave your mark on the battlefield.", requiresHandle: true, canBeDropped: true, cooldown: 0.3, maxDurability: 0,
    era: "2008 classic",
  },
  {
    name: "Blaster", icon: "🔫", behavior: "gun", damage: 25, reach: 0, speedMult: 1, jumpMult: 1, healAmount: 0,
    handleShape: "Block", handleColor: "Really blue", desc: "Click to shoot — 25 damage per hit",
    toolTip: "Pew pew.", requiresHandle: true, canBeDropped: true, cooldown: 0.25, maxDurability: 0,
    era: "Sci-fi",
  },
  {
    name: "Rocket Launcher", icon: "🚀", behavior: "gun", damage: 75, reach: 0, speedMult: 1, jumpMult: 1, healAmount: 0,
    handleShape: "Cylinder", handleColor: "Really red", desc: "Click to fire — 75 damage, slow reload, wears out",
    toolTip: "Big boom. Slow reload.", requiresHandle: true, canBeDropped: true, cooldown: 1.4, maxDurability: 25,
    era: "2007 classic",
  },
  {
    name: "Medkit", icon: "💉", behavior: "heal", damage: 0, reach: 0, speedMult: 1, jumpMult: 1, healAmount: 40,
    handleShape: "Block", handleColor: "Really red", desc: "Click to heal +40 health",
    toolTip: "Click to patch yourself up.", requiresHandle: true, canBeDropped: true, cooldown: 1, maxDurability: 8,
    era: "Support",
  },
  {
    name: "Speed Coil", icon: "🌀", behavior: "speed", damage: 0, reach: 0, speedMult: 1.75, jumpMult: 1, healAmount: 0,
    handleShape: "Cylinder", handleColor: "Cyan", desc: "While equipped: +75% walk speed",
    toolTip: "Zoom.", requiresHandle: true, canBeDropped: true, cooldown: 0, maxDurability: 0,
    era: "Coil series",
  },
  {
    name: "Gravity Coil", icon: "🎈", behavior: "gravity", damage: 0, reach: 0, speedMult: 1, jumpMult: 1.35, healAmount: 0,
    handleShape: "Cylinder", handleColor: "Magenta", desc: "While equipped: +35% jump power, slow fall",
    toolTip: "Moon jumps.", requiresHandle: true, canBeDropped: true, cooldown: 0, maxDurability: 0,
    era: "Coil series",
  },
  {
    name: "Telewand", icon: "🪄", behavior: "teleport", damage: 0, reach: 6, speedMult: 1, jumpMult: 1, healAmount: 0,
    handleShape: "Cylinder", handleColor: "Lavender", desc: "Click to blink 30 studs forward",
    toolTip: "Blink forward.", requiresHandle: true, canBeDropped: true, cooldown: 0.6, maxDurability: 0,
    era: "Wizardry",
  },
  {
    name: "Flashlight", icon: "🔦", behavior: "flashlight", damage: 0, reach: 0, speedMult: 1, jumpMult: 1, healAmount: 0,
    handleShape: "Cylinder", handleColor: "New Yeller", desc: "Click to toggle the beam",
    toolTip: "Click to toggle the beam.", requiresHandle: true, canBeDropped: true, cooldown: 0.15, maxDurability: 0,
    era: "Utility",
  },
];

/** The default "Baseplate" template place, like Studio's new-baseplate experience. */
export function makeTemplatePlace(templateId = "baseplate"): {
  name: string;
  parts: PartData[];
  models: { id: string; name: string }[];
  lighting: LightingData;
  scripts: ScriptData[];
} {
  const tpl = PLACE_TEMPLATES.find((t) => t.id === templateId) ?? PLACE_TEMPLATES[0];
  return {
    name: tpl.name,
    models: tpl.models ?? [],
    lighting: { ...tpl.lighting },
    parts: tpl.make(),
    scripts: tpl.scripts ?? [],
  };
}

/* ------------------------------------------------------------------ */
/* Place templates — the start page "New" gallery.                     */
/* ------------------------------------------------------------------ */
export interface PlaceTemplate {
  id: string;
  name: string;
  desc: string;
  /** Card gradient. */
  accent: string;
  icon: string;
  lighting: LightingData;
  make: () => PartData[];
  /** Models the template's parts live under (e.g. the Dummy rig). */
  models?: { id: string; name: string }[];
  /** Scripts the template ships with (shown in the Explorer). */
  scripts?: ScriptData[];
  /** Custom tools placed in StarterPack. */
  tools?: CustomToolData[];
}

function spawnAt(x: number, z: number): PartData {
  return {
    id: uid("part"),
    name: "SpawnLocation",
    shape: "Block",
    position: [x, 0.5, z],
    rotation: [0, 0, 0],
    size: [12, 1, 12],
    color: "Medium stone grey",
    material: "Plastic",
    transparency: 0,
    reflectance: 0,
    anchored: true,
    canCollide: true,
    castShadow: true,
    parentId: null,
    isSpawn: true,
  };
}

export const PLACE_TEMPLATES: PlaceTemplate[] = [
  {
    id: "baseplate",
    name: "Baseplate",
    desc: "Classic gray baseplate with a spawn. The default Studio start.",
    accent: "from-[#4b5a68] to-[#2b343d]",
    icon: "grid",
    lighting: { ...DEFAULT_LIGHTING },
    make: () => [spawnAt(0, 0)],
  },
  {
    id: "wavedummy",
    name: "Wave Dummy",
    desc: "Scripted example: spawn holding a Wave Wand, click, and the Dummy waves. Tool + NPC animation starter.",
    accent: "from-[#2f7f9f] to-[#1d4657]",
    icon: "wave",
    lighting: { ...DEFAULT_LIGHTING, clockTime: 10.5 },
    models: [{ id: "model_dummy", name: "Dummy" }],
    scripts: [
      {
        id: "script_wavewand",
        name: "WaveWand",
        kind: "Script",
        parentId: "ServerScriptService",
        enabled: true,
        source: `-- Wave Dummy — Tool + animation on an NPC, all in one script.
-- Press Play: you spawn holding the Wave Wand. Click anywhere
-- and the Dummy waves back at you!

local dummy = workspace:FindFirstChild("Dummy")

-- Dummies are rigs, so like a player character they have a
-- Humanoid with an Animator inside — that's what plays animations.
local humanoid = dummy:FindFirstChild("Humanoid")
local animator = humanoid:FindFirstChild("Animator")

-- Load the built-in Wave emote onto the Dummy (AnimationTrack).
local wave = animator:LoadAnimation("Wave")

-- Build the tool. Parenting to StarterPack means every player
-- spawns with a copy in their Backpack (press 1 to toggle it).
local tool = Instance.new("Tool")
tool.Name = "Wave Wand"
tool.ToolTip = "Click to make the Dummy wave"
tool.Parent = game.StarterPack

-- Tool.Activated fires on every click while the tool is equipped.
tool.Activated:Connect(function()
        print("Wave Wand activated — the Dummy waves 👋")
        wave:Play()
        task.wait(2)
        wave:Stop()
end)

-- Hold the wand from the moment we spawn.
game.Players.LocalPlayer.Humanoid:EquipTool(tool)

-- Greet the player once when the game starts.
wave:Play()
task.wait(1.6)
wave:Stop()
`,
      },
    ],
    make: () => {
      const parts = [spawnAt(0, 0)];
      // the Dummy stands 8 studs from the spawn, rotated to face it
      const ox = 0;
      const oz = 8;
      for (const p of makeRigParts("R6", [ox, 0, oz])) {
        p.parentId = "model_dummy";
        // spin every part 180 degrees around the rig origin (faces the spawn)
        p.position = [2 * ox - p.position[0], p.position[1], 2 * oz - p.position[2]];
        p.rotation = [p.rotation[0], p.rotation[1] + 180, p.rotation[2]];
        parts.push(p);
      }
      return parts;
    },
  },
  {
    id: "flatgrass",
    name: "Flat Grass",
    desc: "A wide grassy field — perfect for towns and landscapes.",
    accent: "from-[#3f7a3a] to-[#24501f]",
    icon: "grass",
    lighting: { ...DEFAULT_LIGHTING, clockTime: 10.5 },
    make: () => [
      part("Ground", "Block", [0, -0.5, 0], [220, 1, 220], "Camo", "Grass"),
      spawnAt(0, 0),
    ],
  },
  {
    id: "obby",
    name: "Obby Starter",
    desc: "Rising rainbow platforms and a checkpoint climb.",
    accent: "from-[#8a4bc9] to-[#c94b7a]",
    icon: "stairs",
    lighting: { ...DEFAULT_LIGHTING, clockTime: 9 },
    make: () => {
      const colors = ["Really red", "Deep orange", "New Yeller", "Lime green", "Cyan", "Really blue"];
      const parts = [part("Start Platform", "Block", [0, 0.5, 0], [24, 1, 24], "Medium stone grey", "Concrete"), spawnAt(0, 0)];
      let z = -20;
      let y = 4;
      colors.forEach((c, i) => {
        parts.push(part(`Platform ${i + 1}`, "Block", [i % 2 === 0 ? -6 : 6, y, z], [10, 1, 10], c, "SmoothPlastic"));
        if (i === 2) parts.push(part("Checkpoint", "Block", [i % 2 === 0 ? -6 : 6, y + 3, z], [2, 4, 2], "New Yeller", "Neon"));
        z -= 14;
        y += 4;
      });
      parts.push(part("Finish", "Block", [0, y, z], [16, 1, 16], "Cyan", "Neon"));
      return parts;
    },
  },
  {
    id: "neonnight",
    name: "Neon Night",
    desc: "Midnight lighting with glowing neon platforms.",
    accent: "from-[#1b2a5e] to-[#0a1030]",
    icon: "moon",
    lighting: { ambient: 0.32, brightness: 1.15, clockTime: 22.5, fogEnd: 620 },
    make: () => [
      part("Neon Floor", "Block", [0, 0.25, 0], [120, 0.5, 120], "Really black", "SmoothPlastic"),
      part("Strip A", "Block", [-30, 0.5, -30], [60, 1, 2], "Cyan", "Neon"),
      part("Strip B", "Block", [30, 0.5, 30], [60, 1, 2], "Magenta", "Neon"),
      part("Tower", "Block", [0, 10, -50], [8, 20, 8], "Really black", "Metal"),
      part("Tower Light", "Block", [0, 21, -50], [8.5, 2, 8.5], "Cyan", "Neon"),
      spawnAt(0, 8),
    ],
  },
  {
    id: "empty",
    name: "Empty",
    desc: "A blank canvas — just a spawn, no ground parts.",
    accent: "from-[#3a3f46] to-[#22262b]",
    icon: "square",
    lighting: { ...DEFAULT_LIGHTING },
    make: () => [spawnAt(0, 0)],
  },
  {
    id: "city",
    name: "City Streets",
    desc: "A small downtown block with roads and buildings.",
    accent: "from-[#57606f] to-[#2f3542]",
    icon: "grid",
    lighting: { ...DEFAULT_LIGHTING, clockTime: 15.5 },
    make: () => {
      const parts = [spawnAt(0, 0)];
      // crossing roads
      parts.push(part("Road A", "Block", [0, 0.05, 0], [220, 0.1, 24], "Really black", "Asphalt"));
      parts.push(part("Road B", "Block", [0, 0.05, 0], [24, 0.1, 220], "Really black", "Asphalt"));
      parts.push(part("Line H", "Block", [0, 0.11, 0], [40, 0.02, 1], "New Yeller", "SmoothPlastic"));
      parts.push(part("Line V", "Block", [0, 0.11, -40], [1, 0.02, 40], "New Yeller", "SmoothPlastic"));
      // buildings
      const buildings: [number, number, number, number, string][] = [
        [-40, -40, 20, 26, "Medium stone grey"],
        [40, -40, 24, 20, "Light stone grey"],
        [-44, 44, 22, 30, "Sand red"],
        [44, 46, 26, 22, "Medium stone grey"],
        [90, -70, 30, 36, "Light stone grey"],
        [-90, 70, 28, 28, "Sand blue"],
      ];
      for (const [x, z, w, h, c] of buildings) {
        parts.push(part("Building", "Block", [x, h / 2, z], [w, h, w], c, "Concrete"));
        parts.push(part("Roof", "Block", [x, h + 0.5, z], [w + 1, 1, w + 1], "Dark stone grey", "Slate"));
      }
      return parts;
    },
  },
  {
    id: "arena",
    name: "Battle Arena",
    desc: "A circular fighting arena with neon edges.",
    accent: "from-[#b33939] to-[#5c1a1a]",
    icon: "square",
    lighting: { ...DEFAULT_LIGHTING, clockTime: 17.5, ambient: 0.42 },
    make: () => {
      const parts = [spawnAt(0, 26)];
      parts.push(part("Arena Floor", "Cylinder", [0, 0.5, 0], [64, 1, 64], "Dark stone grey", "Concrete"));
      parts.push(part("Center", "Cylinder", [0, 1.2, 0], [12, 0.4, 12], "Really red", "Neon"));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        parts.push(part("Pillar", "Block", [Math.cos(a) * 36, 4, Math.sin(a) * 36], [4, 8, 4], "Medium stone grey", "Slate", [0, (a * 180) / Math.PI, 0]));
      }
      parts.push(part("Ring", "Block", [0, 0.9, 0], [66, 0.2, 66], "Cyan", "Neon"));
      return parts;
    },
  },
];

/* ------------------------------------------------------------------ */
/* Rig builders — dummy avatars like Studio's Avatar tab.              */
/* ------------------------------------------------------------------ */
export type RigKind = "R6" | "R15";

export const RIG_LABELS: Record<RigKind, string> = {
  R6: "R6 Dummy",
  R15: "R15 Block Rig",
};

/** Classic noob-colored R6 dummy (6 limbs) or grey R15 test rig (15 parts). */
export function makeRigParts(kind: RigKind, origin: Vec3): PartData[] {
  const [ox, oy, oz] = origin;
  const at = (x: number, y: number, z: number): Vec3 => [x + ox, y + oy, z + oz];
  const rig = (name: string, shape: PartShape, pos: Vec3, size: Vec3, color: string, material = "SmoothPlastic"): PartData =>
    part(name, shape, pos, size, color, material);

  if (kind === "R6") {
    return [
      rig("Torso", "Block", at(0, 3, 0), [2, 2, 1], "Bright blue"),
      rig("Head", "Block", at(0, 4.65, 0), [1.2, 1.2, 1.2], "Bright yellow"),
      rig("Left Arm", "Block", at(-1.5, 3, 0), [1, 2, 1], "Bright yellow"),
      rig("Right Arm", "Block", at(1.5, 3, 0), [1, 2, 1], "Bright yellow"),
      rig("Left Leg", "Block", at(-0.5, 1, 0), [1, 2, 1], "Br. yellowish green"),
      rig("Right Leg", "Block", at(0.5, 1, 0), [1, 2, 1], "Br. yellowish green"),
      rig("Left Eye", "Block", at(-0.24, 4.75, 0.62), [0.2, 0.3, 0.06], "Really black"),
      rig("Right Eye", "Block", at(0.24, 4.75, 0.62), [0.2, 0.3, 0.06], "Really black"),
      rig("Smile", "Block", at(0, 4.42, 0.62), [0.62, 0.12, 0.06], "Really black"),
    ];
  }
  return [
    rig("Head", "Block", at(0, 4.6, 0), [1.2, 1.2, 1.2], "Medium stone grey"),
    rig("UpperTorso", "Block", at(0, 3.35, 0), [2, 1.3, 1], "Medium stone grey"),
    rig("LowerTorso", "Block", at(0, 2.35, 0), [2, 0.7, 1], "Dark stone grey"),
    rig("Left UpperArm", "Block", at(-1.5, 3.35, 0), [1, 1, 1], "Medium stone grey"),
    rig("Right UpperArm", "Block", at(1.5, 3.35, 0), [1, 1, 1], "Medium stone grey"),
    rig("Left LowerArm", "Block", at(-1.5, 2.55, 0), [1, 0.6, 1], "Light stone grey"),
    rig("Right LowerArm", "Block", at(1.5, 2.55, 0), [1, 0.6, 1], "Light stone grey"),
    rig("Left Hand", "Block", at(-1.5, 2.05, 0), [1, 0.4, 1], "Light stone grey"),
    rig("Right Hand", "Block", at(1.5, 2.05, 0), [1, 0.4, 1], "Light stone grey"),
    rig("Left UpperLeg", "Block", at(-0.5, 1.65, 0), [1, 0.7, 1], "Medium stone grey"),
    rig("Right UpperLeg", "Block", at(0.5, 1.65, 0), [1, 0.7, 1], "Medium stone grey"),
    rig("Left LowerLeg", "Block", at(-0.5, 0.95, 0), [1, 0.7, 1], "Dark stone grey"),
    rig("Right LowerLeg", "Block", at(0.5, 0.95, 0), [1, 0.7, 1], "Dark stone grey"),
    rig("Left Foot", "Block", at(-0.5, 0.3, 0), [1, 0.6, 1], "Dark stone grey"),
    rig("Right Foot", "Block", at(0.5, 0.3, 0), [1, 0.6, 1], "Dark stone grey"),
    rig("Left Eye", "Block", at(-0.24, 4.7, 0.62), [0.2, 0.3, 0.06], "Really black"),
    rig("Right Eye", "Block", at(0.24, 4.7, 0.62), [0.2, 0.3, 0.06], "Really black"),
    rig("Smile", "Block", at(0, 4.37, 0.62), [0.62, 0.12, 0.06], "Really black"),
  ];
}

/* Toolbox templates — classic building kit pieces built from parts. */
export interface ToolboxTemplate {
  label: string;
  make: (origin: Vec3) => PartData[];
}

function part(
  name: string,
  shape: PartShape,
  position: Vec3,
  size: Vec3,
  color: string,
  material = "Plastic",
  rotation: Vec3 = [0, 0, 0],
): PartData {
  return {
    id: uid("part"),
    name,
    shape,
    position,
    rotation,
    size,
    color,
    material,
    transparency: 0,
    reflectance: 0,
    anchored: true,
    canCollide: true,
    castShadow: true,
    parentId: null,
  };
}

export const TOOLBOX_TEMPLATES: ToolboxTemplate[] = [
  {
    label: "Tree",
    make: ([x, y, z]) => [
      part("Trunk", "Cylinder", [x, y + 5, z], [2, 10, 2], "Reddish brown", "Wood"),
      part("Leaves", "Sphere", [x, y + 11.5, z], [9, 9, 9], "Camo", "LeafyGrass"),
    ],
  },
  {
    label: "Lamp Post",
    make: ([x, y, z]) => [
      part("Pole", "Cylinder", [x, y + 7, z], [1, 14, 1], "Dark stone grey", "Metal"),
      part("Lamp", "Block", [x, y + 14.4, z], [3, 1.2, 3], "New Yeller", "Neon"),
      part("Cap", "Block", [x, y + 15.2, z], [3.6, 0.6, 3.6], "Dark stone grey", "Metal"),
    ],
  },
  {
    label: "House",
    make: ([x, y, z]) => [
      part("Floor", "Block", [x, y + 0.5, z], [20, 1, 16], "Medium stone grey", "Concrete"),
      part("Wall Back", "Block", [x, y + 5, z - 7.5], [20, 8, 1], "Brick yellow", "Brick"),
      part("Wall Left", "Block", [x - 9.5, y + 5, z], [1, 8, 16], "Brick yellow", "Brick"),
      part("Wall Right", "Block", [x + 9.5, y + 5, z], [1, 8, 16], "Brick yellow", "Brick"),
      part("Wall Front L", "Block", [x - 6, y + 5, z + 7.5], [8, 8, 1], "Brick yellow", "Brick"),
      part("Wall Front R", "Block", [x + 6, y + 5, z + 7.5], [8, 8, 1], "Brick yellow", "Brick"),
      part("Door Top", "Block", [x, y + 7, z + 7.5], [4, 2, 1], "Brick yellow", "Brick"),
      part("Roof L", "Wedge", [x - 5.2, y + 10.5, z], [10.5, 5, 17], "Bright red", "WoodPlanks", [0, 0, 0]),
      part("Roof R", "Wedge", [x + 5.2, y + 10.5, z], [10.5, 5, 17], "Bright red", "WoodPlanks", [0, 180, 0]),
    ],
  },
  {
    label: "Ramp",
    make: ([x, y, z]) => [part("Ramp", "Wedge", [x, y + 2, z], [8, 4, 8], "Medium stone grey", "Concrete")],
  },
  {
    label: "Arch",
    make: ([x, y, z]) => [
      part("Pillar L", "Block", [x - 6, y + 5, z], [2, 10, 4], "Medium stone grey", "Slate"),
      part("Pillar R", "Block", [x + 6, y + 5, z], [2, 10, 4], "Medium stone grey", "Slate"),
      part("Top", "Block", [x, y + 10.5, z], [14, 1.5, 4], "Medium stone grey", "Slate"),
      part("Keystone", "Wedge", [x, y + 8, z], [10, 4, 4], "Medium stone grey", "Slate", [90, 0, 0]),
    ],
  },
  {
    label: "Platform",
    make: ([x, y, z]) => [
      part("Deck", "Block", [x, y + 0.5, z], [16, 1, 16], "Brown", "WoodPlanks"),
      part("Post TL", "Cylinder", [x - 7, y - 3, z - 7], [1, 7, 1], "Brown", "Wood"),
      part("Post TR", "Cylinder", [x + 7, y - 3, z - 7], [1, 7, 1], "Brown", "Wood"),
      part("Post BL", "Cylinder", [x - 7, y - 3, z + 7], [1, 7, 1], "Brown", "Wood"),
      part("Post BR", "Cylinder", [x + 7, y - 3, z + 7], [1, 7, 1], "Brown", "Wood"),
      part("Rail", "Block", [x, y + 1.75, z], [16.5, 0.5, 16.5], "Cyan", "Neon", [0, 0, 0]),
    ],
  },
];
