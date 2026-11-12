"use client";

import type { LucideIcon } from "lucide-react";
import { getAccount } from "./auth";
import {
  Blocks,
  Bomb,
  Car,
  Cat,
  Crown,
  Flame,
  Ghost,
  Pizza,
  Rocket,
  Swords,
  TreePine,
  Utensils,
  Skull,
  Dices,
  Gem,
  Music,
  PawPrint,
  Plane,
  Castle,
  Snowflake,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Seed data for the Roblox-style website: games, friends, catalog.   */
/* ------------------------------------------------------------------ */

export interface WebGame {
  id: string;
  name: string;
  creator: string;
  /** Base active-player count shown on cards (jitters a little). */
  players: number;
  rating: number; // 0..100 thumbs-up
  favorites: number;
  visits: number;
  genre: string;
  icon: LucideIcon;
  gradient: string; // tailwind gradient classes for the thumbnail
  /** Studio template used when you press Play. */
  templateId: string;
  desc: string;
  serverSize: number;
  updated: string;
  /* ---- community-published games (Creator publishes from Studio) ---- */
  /** Robux required to enter (paid access). 0/undefined = free. */
  price?: number;
  /** Set when this card is a user-published game (id in the platform store). */
  publishedId?: string;
  /** Emoji thumbnail for published games (overrides icon). */
  emoji?: string;
}

export const GAMES: WebGame[] = [
  {
    id: "obby-tower",
    name: "Tower of Doom Obby",
    creator: "JumpMasterStudios",
    players: 42800,
    rating: 92,
    favorites: 1240000,
    visits: 890000000,
    genre: "Obby",
    icon: Rocket,
    gradient: "from-[#e74c3c] via-[#c0392b] to-[#7b241c]",
    templateId: "obby",
    desc: "Climb 100 floors of rage-inducing platforming. Checkpoints every 10 stages — can you reach the top of the Tower of Doom?",
    serverSize: 12,
    updated: "2 days ago",
  },
  {
    id: "pet-tycoon",
    name: "Pet Tycoon Paradise",
    creator: "FluffyGames",
    players: 38600,
    rating: 88,
    favorites: 980000,
    visits: 640000000,
    genre: "Tycoon",
    icon: PawPrint,
    gradient: "from-[#f39c12] via-[#e67e22] to-[#d35400]",
    templateId: "flatgrass",
    desc: "Hatch eggs, collect ultra-rare pets and build the biggest pet empire in Paradise City. Trade with friends!",
    serverSize: 8,
    updated: "5 hours ago",
  },
  {
    id: "natural-disaster",
    name: "Natural Disaster Survival",
    creator: "Stickmasterluke",
    players: 31500,
    rating: 90,
    favorites: 1400000,
    visits: 1100000000,
    genre: "Survival",
    icon: Flame,
    gradient: "from-[#8e44ad] via-[#6c3483] to-[#4a235a]",
    templateId: "baseplate",
    desc: "Survive earthquakes, floods, tornadoes and meteor showers. The last player standing wins the round.",
    serverSize: 24,
    updated: "1 week ago",
  },
  {
    id: "jailbreak",
    name: "Prison Breakout",
    creator: "asimo3089",
    players: 52900,
    rating: 91,
    favorites: 2100000,
    visits: 1800000000,
    genre: "Roleplay",
    icon: Bomb,
    gradient: "from-[#2c3e50] via-[#34495e] to-[#1a252f]",
    templateId: "city",
    desc: "Play as criminal or police. Rob banks, chase supercars, and plan the ultimate prison breakout with your crew.",
    serverSize: 32,
    updated: "yesterday",
  },
  {
    id: "murder-mystery",
    name: "Murder Mystery X",
    creator: "Nikilis",
    players: 46700,
    rating: 89,
    favorites: 1870000,
    visits: 1500000000,
    genre: "Horror",
    icon: Skull,
    gradient: "from-[#c0392b] via-[#922b21] to-[#641e16]",
    templateId: "neonnight",
    desc: "An innocent, a sheriff and a murderer. Can the sheriff find the killer before everyone is eliminated?",
    serverSize: 12,
    updated: "3 days ago",
  },
  {
    id: "speed-run",
    name: "Speed Run Legends",
    creator: "VelocityDev",
    players: 18400,
    rating: 86,
    favorites: 620000,
    visits: 320000000,
    genre: "Obby",
    icon: Blocks,
    gradient: "from-[#00b894] via-[#10ac84] to-[#0e8c6e]",
    templateId: "obby",
    desc: "Race through neon courses at lightning speed. Unlock new trails and beat your best times on global leaderboards.",
    serverSize: 10,
    updated: "1 month ago",
  },
  {
    id: "pizza-place",
    name: "Work at a Pizza Place",
    creator: "CloneTrooper1019",
    players: 22300,
    rating: 87,
    favorites: 1150000,
    visits: 780000000,
    genre: "Roleplay",
    icon: Pizza,
    gradient: "from-[#e67e22] via-[#d35400] to-[#a04000]",
    templateId: "flatgrass",
    desc: "Cook pizza, deliver orders, upgrade your house and hang out with coworkers in the coziest job on the platform.",
    serverSize: 20,
    updated: "2 weeks ago",
  },
  {
    id: "sword-fight",
    name: "Sword Fighting Arena",
    creator: "BladeMasters",
    players: 15800,
    rating: 84,
    favorites: 410000,
    visits: 210000000,
    genre: "Fighting",
    icon: Swords,
    gradient: "from-[#bdc3c7] via-[#95a5a6] to-[#707b7c]",
    templateId: "arena",
    desc: "Classic 1v1 and team sword duels. Master parries, lunges and ripostes to climb the ranked ladder.",
    serverSize: 16,
    updated: "4 days ago",
  },
  {
    id: "haunted-house",
    name: "The Haunted House",
    creator: "NightfallTeam",
    players: 9800,
    rating: 82,
    favorites: 288000,
    visits: 96000000,
    genre: "Horror",
    icon: Ghost,
    gradient: "from-[#4a235a] via-[#2e1a3a] to-[#1a0f22]",
    templateId: "neonnight",
    desc: "Explore a cursed mansion with up to 4 friends. Solve puzzles, dodge the ghost, and escape before midnight.",
    serverSize: 4,
    updated: "1 week ago",
  },
  {
    id: "go-kart",
    name: "Turbo Go-Kart Racing",
    creator: "ApexInteractive",
    players: 12600,
    rating: 85,
    favorites: 350000,
    visits: 128000000,
    genre: "Racing",
    icon: Car,
    gradient: "from-[#0984e3] via-[#076fbd] to-[#05568c]",
    templateId: "city",
    desc: "Drift around 12 themed tracks, upgrade your kart and challenge friends in ranked Grand Prix seasons.",
    serverSize: 12,
    updated: "6 days ago",
  },
  {
    id: "castle-siege",
    name: "Castle Siege Legends",
    creator: "IronKeep",
    players: 8900,
    rating: 83,
    favorites: 260000,
    visits: 74000000,
    genre: "Fighting",
    icon: Castle,
    gradient: "from-[#935116] via-[#7d480e] to-[#5e360a]",
    templateId: "arena",
    desc: "Command knights, build defenses and storm enemy castles in 40-player medieval battles.",
    serverSize: 40,
    updated: "2 weeks ago",
  },
  {
    id: "mining-gems",
    name: "Gem Miner Simulator",
    creator: "DeepRockDev",
    players: 20100,
    rating: 88,
    favorites: 720000,
    visits: 415000000,
    genre: "Simulator",
    icon: Gem,
    gradient: "from-[#00cec9] via-[#00b3b0] to-[#00908e]",
    templateId: "baseplate",
    desc: "Dig deep, discover rare gems, upgrade your pickaxe and trade crystals in this addictive mining simulator.",
    serverSize: 6,
    updated: "12 hours ago",
  },
  {
    id: "island-tycoon",
    name: "Island Resort Tycoon",
    creator: "SunnySide",
    players: 13400,
    rating: 86,
    favorites: 390000,
    visits: 152000000,
    genre: "Tycoon",
    icon: TreePine,
    gradient: "from-[#2ecc71] via-[#27ae60] to-[#1e8449]",
    templateId: "flatgrass",
    desc: "Build the ultimate tropical resort. Attract tourists, unlock water slides and become a hospitality tycoon.",
    serverSize: 10,
    updated: "1 month ago",
  },
  {
    id: "snow-park",
    name: "Snow Park Freestyle",
    creator: "Frostbyte",
    players: 7600,
    rating: 81,
    favorites: 198000,
    visits: 61000000,
    genre: "Racing",
    icon: Snowflake,
    gradient: "from-[#74b9ff] via-[#5aa0e8] to-[#3f83cf]",
    templateId: "baseplate",
    desc: "Shred powder on skis and snowboards, hit massive jumps and unlock new winter gear in the coziest snow park.",
    serverSize: 8,
    updated: "3 weeks ago",
  },
  {
    id: "music-hangout",
    name: "Music Hangout VIBES",
    creator: "BeatDrop",
    players: 10900,
    rating: 84,
    favorites: 305000,
    visits: 118000000,
    genre: "Social",
    icon: Music,
    gradient: "from-[#e84393] via-[#c3307a] to-[#9b2160]",
    templateId: "neonnight",
    desc: "DJ your own stage, dance with friends and show off emotes in the loudest hangout on the platform.",
    serverSize: 24,
    updated: "4 days ago",
  },
  {
    id: "airline",
    name: "Airline Flight Simulator",
    creator: "SkyWings",
    players: 5400,
    rating: 80,
    favorites: 141000,
    visits: 43000000,
    genre: "Simulator",
    icon: Plane,
    gradient: "from-[#a29bfe] via-[#847ee0] to-[#6c66c4]",
    templateId: "baseplate",
    desc: "Fly realistic routes, manage your fleet and land at detailed airports in the ultimate aviation roleplay.",
    serverSize: 14,
    updated: "2 months ago",
  },
  {
    id: "cat-cafe",
    name: "Cat Café Roleplay",
    creator: "WhiskerWorks",
    players: 16900,
    rating: 90,
    favorites: 510000,
    visits: 197000000,
    genre: "Roleplay",
    icon: Cat,
    gradient: "from-[#fdcb6e] via-[#f0b429] to-[#d99518]",
    templateId: "flatgrass",
    desc: "Run the fluffiest café in town. Adopt cats, serve pastries and make friends in this wholesome roleplay.",
    serverSize: 18,
    updated: "8 hours ago",
  },
  {
    id: "dice-luck",
    name: "Lucky Dice Rollers",
    creator: "ChanceLab",
    players: 6800,
    rating: 79,
    favorites: 120000,
    visits: 38000000,
    genre: "Casual",
    icon: Dices,
    gradient: "from-[#ff7675] via-[#e05552] to-[#c03634]",
    templateId: "baseplate",
    desc: "Roll dice, unlock luck multipliers and climb the jackpot ladder in this fast-paced luck-based showdown.",
    serverSize: 10,
    updated: "5 days ago",
  },
  {
    id: "restaurant",
    name: "Five Star Restaurant",
    creator: "GourmetGuild",
    players: 9200,
    rating: 85,
    favorites: 224000,
    visits: 69000000,
    genre: "Roleplay",
    icon: Utensils,
    gradient: "from-[#55efc4] via-[#3fd0a8] to-[#2cb98d]",
    templateId: "flatgrass",
    desc: "Hire chefs, design your dining room and earn Michelin stars in the most delicious restaurant tycoon.",
    serverSize: 16,
    updated: "1 week ago",
  },
  {
    id: "king-crown",
    name: "Claim the Crown",
    creator: "RoyalGames",
    players: 11400,
    rating: 87,
    favorites: 342000,
    visits: 128000000,
    genre: "Fighting",
    icon: Crown,
    gradient: "from-[#f1c40f] via-[#d4ac0d] to-[#b7950b]",
    templateId: "arena",
    desc: "Hold the crown for 60 seconds to win. Everyone else wants it — team up, betray, and claim the throne.",
    serverSize: 20,
    updated: "3 days ago",
  },
];

export const DISCOVER_CATEGORIES = [
  "Popular",
  "Obby",
  "Tycoon",
  "Roleplay",
  "Fighting",
  "Racing",
  "Horror",
  "Simulator",
  "Survival",
  "Social",
  "Casual",
];

/* ------------------------------- friends ------------------------------ */

export interface WebFriend {
  name: string;
  color: string; // avatar gradient
  status: "playing" | "online" | "offline";
  /** Game id the friend is currently playing. */
  playing?: string;
  lastOnline?: string;
}

/* --------------------------- player directory -------------------------- */
/* The searchable "who exists" list. Friends can only be added from here  */
/* or from real cloud profiles once the public directory is connected.    */
/* ---------------------------------------------------------------------- */

export interface DirectoryUser {
  name: string;
  display: string;
  color: string;
  status: "playing" | "online" | "offline";
  playing?: string;
  lastOnline?: string;
  bio: string;
  /** Part of every account's starter friend list. */
  seedFriend?: boolean;
}

export const USER_DIRECTORY: DirectoryUser[] = [
  { name: "PixelPenguin", display: "PixelPenguin", color: "from-[#00b894] to-[#009432]", status: "playing", playing: "obby-tower", bio: "Obby speedrunner. Floor 87 survivor.", seedFriend: true },
  { name: "LunaLava", display: "LunaLava", color: "from-[#e84393] to-[#b33771]", status: "playing", playing: "pet-tycoon", bio: "Tycoon decorator & pet collector.", seedFriend: true },
  { name: "TurboTaco", display: "TurboTaco", color: "from-[#f39c12] to-[#d35400]", status: "playing", playing: "jailbreak", bio: "Professional prison escapee.", seedFriend: true },
  { name: "GhostyGurl", display: "GhostyGurl", color: "from-[#a29bfe] to-[#6c5ce7]", status: "online", bio: "Horror game enthusiast. Boo.", seedFriend: true },
  { name: "MaxBuilder77", display: "MaxBuilder77", color: "from-[#0984e3] to-[#074b8f]", status: "online", bio: "I build things. Then they fall over.", seedFriend: true },
  { name: "NinjaNoodle", display: "NinjaNoodle", color: "from-[#fd79a8] to-[#e84393]", status: "online", bio: "Fast. Noodle-ish. Fear the sword.", seedFriend: true },
  { name: "SirBlocksALot", display: "SirBlocksALot", color: "from-[#2d3436] to-[#0b0f12]", status: "offline", lastOnline: "3 hours ago", bio: "Knight of the Baseplate realm.", seedFriend: true },
  { name: "CraftyCarly", display: "CraftyCarly", color: "from-[#55efc4] to-[#00cec9]", status: "offline", lastOnline: "yesterday", bio: "Detail builder. Pixel art enjoyer.", seedFriend: true },
  { name: "DoctorDoomsday", display: "DoctorDoomsday", color: "from-[#d63031] to-[#8e0b0b]", status: "offline", lastOnline: "2 days ago", bio: "Villain lair architect.", seedFriend: true },
  { name: "ZoeZoom", display: "ZoeZoom", color: "from-[#fdcb6e] to-[#e17055]", status: "offline", lastOnline: "last week", bio: "Racing karts since 2019.", seedFriend: true },
  { name: "BuilderBecky", display: "BuilderBecky", color: "from-[#e17055] to-[#d63031]", status: "online", bio: "Cozy cottage specialist." },
  { name: "OceanOtter", display: "OceanOtter", color: "from-[#00cec9] to-[#0984e3]", status: "playing", playing: "mining-gems", bio: "Gem hoarder. Will trade for snacks." },
  { name: "RapidRabbit", display: "RapidRabbit", color: "from-[#fdcb6e] to-[#f39c12]", status: "playing", playing: "speed-run", bio: "Zoom zoom. WR attempts daily." },
  { name: "ShadowSniper", display: "ShadowSniper", color: "from-[#636e72] to-[#2d3436]", status: "playing", playing: "murder-mystery", bio: "You won't see me coming." },
  { name: "MochaMoose", display: "MochaMoose", color: "from-[#a29bfe] to-[#8e44ad]", status: "offline", lastOnline: "5 hours ago", bio: "Chill builder. Coffee-powered." },
  { name: "PixelPixie", display: "PixelPixie", color: "from-[#e84393] to-[#fd79a8]", status: "online", bio: "Tiny avatar, huge personality." },
  { name: "TurboTomato", display: "TurboTomato", color: "from-[#ff7675] to-[#c0392b]", status: "playing", playing: "pizza-place", bio: "Pizza chef. Extra basil." },
  { name: "LunarLynx", display: "LunarLynx", color: "from-[#a29bfe] to-[#6c5ce7]", status: "offline", lastOnline: "yesterday", bio: "Night-time explorer." },
  { name: "CraftyCaleb", display: "CraftyCaleb", color: "from-[#55efc4] to-[#00b894]", status: "online", bio: "Neon city builder." },
  { name: "DustyDragon", display: "DustyDragon", color: "from-[#d35400] to-[#7b241c]", status: "playing", playing: "castle-siege", bio: "Castle siege tactician." },
  { name: "MysticMango", display: "MysticMango", color: "from-[#f1c40f] to-[#e67e22]", status: "offline", lastOnline: "2 days ago", bio: "Tropical tycoon queen." },
  { name: "VoltViper", display: "VoltViper", color: "from-[#00cec9] to-[#00b894]", status: "playing", playing: "go-kart", bio: "Electric kart enthusiast." },
  { name: "ZenZebra", display: "ZenZebra", color: "from-[#dfe6e9] to-[#b2bec3]", status: "online", bio: "Just vibing in hangout games." },
  { name: "QuirkyQuokka", display: "QuirkyQuokka", color: "from-[#fd79a8] to-[#e17055]", status: "offline", lastOnline: "last week", bio: "Happiest player on the platform." },
];

export const SEED_FRIENDS: WebFriend[] = USER_DIRECTORY.filter((u) => u.seedFriend).map((u) => ({
  name: u.name,
  color: u.color,
  status: u.status,
  playing: u.playing,
  lastOnline: u.lastOnline,
}));

/** A person you can add as a friend (built-in sample directory entry). */
export interface PersonResult {
  name: string;
  display: string;
  color: string;
  status: "playing" | "online" | "offline";
  playing?: string;
  lastOnline?: string;
  /** true when this is a real account created in this browser */
  real: boolean;
}

const REAL_ACCOUNT_GRADIENTS = [
  "from-[#00b894] to-[#008751]",
  "from-[#e84393] to-[#b33771]",
  "from-[#0984e3] to-[#074b8f]",
  "from-[#6c5ce7] to-[#4834d4]",
  "from-[#f39c12] to-[#d35400]",
  "from-[#2d3436] to-[#0b0f12]",
];

function gradientForName(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return REAL_ACCOUNT_GRADIENTS[h % REAL_ACCOUNT_GRADIENTS.length];
}

export function findDirectoryUser(name: string): DirectoryUser | null {
  const n = name.trim().toLowerCase();
  return USER_DIRECTORY.find((u) => u.name.toLowerCase() === n) ?? null;
}

/** Search the built-in sample directory and the signed-in cloud account.
 * Cloud-wide username search will be connected when the public directory UI lands. */
export function searchPeople(q: string, excludeUsername?: string): PersonResult[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const out: PersonResult[] = [];
  const seen = new Set<string>();
  for (const u of USER_DIRECTORY) {
    if (u.name.toLowerCase().includes(needle) || u.display.toLowerCase().includes(needle)) {
      out.push({ name: u.name, display: u.display, color: u.color, status: u.status, playing: u.playing, lastOnline: u.lastOnline, real: false });
      seen.add(u.name.toLowerCase());
    }
  }
  return out.slice(0, 8);
}

/** Rendering info for any friend name (seeded, added, or real account). */
export function friendAppearance(name: string): WebFriend {
  const dir = findDirectoryUser(name);
  if (dir) return { name: dir.name, color: dir.color, status: dir.status, playing: dir.playing, lastOnline: dir.lastOnline };
  const account = getAccount(name);
  if (account) return { name, color: gradientForName(name), status: "online" };
  return { name, color: "from-[#636e72] to-[#2d3436]", status: "offline", lastOnline: "a while ago" };
}

/* ---------------------------- avatar shop ----------------------------- */

export interface ShopItem {
  id: string;
  name: string;
  creator: string;
  price: number; // robux, 0 = free
  category: "Bundles" | "Heads" | "Faces" | "Hair" | "Gear" | "Accessories" | "Hats";
  icon: LucideIcon;
  gradient: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "noob-bundle", name: "Classic Noob Bundle", creator: "Blockyard", price: 0, category: "Bundles", icon: Blocks, gradient: "from-[#f5c542] to-[#e0a800]" },
  { id: "crown-head", name: "Golden Crown of Legends", creator: "RoyalGames", price: 1500, category: "Accessories", icon: Crown, gradient: "from-[#f1c40f] to-[#b7950b]" },
  { id: "pizza-hat", name: "Pizza Slice Hat", creator: "SnackShop", price: 80, category: "Hats", icon: Pizza, gradient: "from-[#e67e22] to-[#d35400]" },
  { id: "cat-ears", name: "Fluffy Cat Ears", creator: "WhiskerWorks", price: 120, category: "Accessories", icon: Cat, gradient: "from-[#fd79a8] to-[#e84393]" },
  { id: "rocket-gear", name: "Rocket Launcher", creator: "ApexInteractive", price: 950, category: "Gear", icon: Rocket, gradient: "from-[#c0392b] to-[#7b241c]" },
  { id: "snow-head", name: "Frosty Snowman Head", creator: "Frostbyte", price: 250, category: "Heads", icon: Snowflake, gradient: "from-[#74b9ff] to-[#3f83cf]" },
  { id: "flame-hair", name: "Inferno Flame Hair", creator: "NightfallTeam", price: 400, category: "Hair", icon: Flame, gradient: "from-[#d35400] to-[#922b21]" },
  { id: "sword-gear", name: "Blade of the Ancients", creator: "BladeMasters", price: 1200, category: "Gear", icon: Swords, gradient: "from-[#95a5a6] to-[#707b7c]" },
  { id: "ghost-bundle", name: "Spooky Ghost Bundle", creator: "NightfallTeam", price: 600, category: "Bundles", icon: Ghost, gradient: "from-[#b2bec3] to-[#636e72]" },
  { id: "gem-face", name: "Gemstone Smile Face", creator: "DeepRockDev", price: 150, category: "Faces", icon: Gem, gradient: "from-[#00cec9] to-[#00908e]" },
  { id: "music-hair", name: "Neon Beatdrop Hair", creator: "BeatDrop", price: 300, category: "Hair", icon: Music, gradient: "from-[#e84393] to-[#9b2160]" },
  { id: "paw-face", name: "Happy Paws Face", creator: "WhiskerWorks", price: 60, category: "Faces", icon: PawPrint, gradient: "from-[#55efc4] to-[#00b894]" },
];

export const ROBUX_PACKAGES: { amount: number; price: string; bonus?: string }[] = [
  { amount: 80, price: "$0.99" },
  { amount: 400, price: "$4.99" },
  { amount: 800, price: "$9.99" },
  { amount: 1700, price: "$19.99", bonus: "Most Popular" },
  { amount: 4500, price: "$49.99" },
  { amount: 10000, price: "$99.99", bonus: "Best Value" },
];

/* ------------------------------- helpers ------------------------------ */

export function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Live-ish player count: deterministic jitter around the base value. */
export function livePlayers(base: number): number {
  const now = Date.now() / 30000;
  const wave = Math.sin(now + base % 97) * 0.04 + Math.cos(now / 3 + base % 53) * 0.03;
  return Math.max(120, Math.round(base * (1 + wave)));
}
