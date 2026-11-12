"use client";

import { create } from "zustand";
import { Blocks } from "lucide-react";
import type { AnimationData, CollabRole, PartData, PlaceState } from "./types";
import type { WebGame } from "./webdata";
import { SEED_FRIENDS } from "./webdata";
import {
  getAccount,
  listAccounts,
  loadProfile,
  setRobux as authSetRobux,
} from "./auth";

/* ------------------------------------------------------------------ */
/* Platform store: published games, Creator-Store assets, chat logs,  */
/* moderation actions and paid-access purchases. Shared across all   */
/* accounts on this browser (like a tiny shared "server").           */
/* ------------------------------------------------------------------ */

export interface PublishedGame {
  id: string;
  name: string;
  desc: string;
  creator: string; // username
  creatorDisplay: string;
  icon: string; // emoji
  gradient: string;
  genre: string;
  /** Robux needed to enter (0 = free). */
  price: number;
  templateId: string;
  placeData: PlaceState | null;
  visits: number;
  likes: number;
  createdAt: number;
  updatedAt: number;
  featured: boolean;
  removed: boolean;
}

export type AssetKind = "model" | "map" | "animation";

export interface PublishedAsset {
  id: string;
  kind: AssetKind;
  name: string;
  desc: string;
  creator: string;
  creatorDisplay: string;
  icon: string;
  gradient: string;
  price: number;
  createdAt: number;
  parts: PartData[] | null; // model
  place: PlaceState | null; // map
  anim: AnimationData | null; // animation
  removed: boolean;
}

export interface ChatLogEntry {
  id: number;
  user: string;
  friend: string;
  text: string;
  at: number;
  scope: "web" | "game";
  removed: boolean;
  flagged: boolean;
}

export interface InGameMessage {
  id: number;
  user: string;
  text: string;
  game: string;
  at: number;
  removed: boolean;
  flagged: boolean;
}

export interface ModAction {
  id: number;
  admin: string;
  action: string;
  detail: string;
  at: number;
}

export interface ChatMessage {
  id: number;
  from: "me" | "them";
  text: string;
  at: number;
}

/* -------------------------- Team Create sharing ------------------------ */

/** A friend asking the place owner for edit access to a published game. */
export interface JoinRequest {
  id: number;
  user: string;
  message: string;
  at: number;
}

/** Edit-permission list attached to a published game (Team Create). */
export interface PlaceCollab {
  owner: string;
  /** Grant every friend on the owner's list edit access. */
  allFriends: boolean;
  /** Usernames with explicit edit permission (legacy — treated as "editor"). */
  editors: string[];
  /** Granular per-friend roles (username → Viewer/Builder/Editor). Wins over the legacy lists. */
  roles?: Record<string, CollabRole>;
  /** Script NAMES hidden from viewers + builders (only Editors/owner see them). */
  hiddenScripts?: string[];
  /** Pending join requests from friends. */
  requests: JoinRequest[];
}

/** A notification routed to one username (join request / access granted). */
export interface UserNotice {
  id: number;
  to: string;
  text: string;
  kind: "request" | "granted" | "info";
  at: number;
}

interface PlatformState {
  version: 1;
  games: PublishedGame[];
  assets: PublishedAsset[];
  chatLogs: ChatLogEntry[];
  inGameChat: InGameMessage[];
  modActions: ModAction[];
  /** username -> purchased game ids */
  purchases: Record<string, string[]>;
  /** `${username}::${friend}` -> conversation */
  convos: Record<string, ChatMessage[]>;
  /** gameId -> Team Create sharing settings. */
  collabs: Record<string, PlaceCollab>;
  /** Routed notifications (join requests, access granted…). */
  notices: UserNotice[];
  blockedWords: string[];
  seq: number;
}

const KEY = "blockyard-platform-v1";

const DEFAULT_BLOCKED = ["badword", "scam", "hackyou", "stupidnoob"];

function loadState(): PlatformState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<PlatformState>;
      return {
        version: 1,
        games: p.games ?? [],
        assets: p.assets ?? [],
        chatLogs: p.chatLogs ?? [],
        inGameChat: p.inGameChat ?? [],
        modActions: p.modActions ?? [],
        purchases: p.purchases ?? {},
        convos: p.convos ?? {},
        collabs: p.collabs ?? {},
        notices: p.notices ?? [],
        blockedWords: p.blockedWords?.length ? p.blockedWords : [...DEFAULT_BLOCKED],
        seq: p.seq ?? 10000,
      };
    }
  } catch {
    /* corrupted — start fresh */
  }
  return {
    version: 1,
    games: [],
    assets: [],
    chatLogs: [],
    inGameChat: [],
    modActions: [],
    purchases: {},
    convos: {},
    collabs: {},
    notices: [],
    blockedWords: [...DEFAULT_BLOCKED],
    seq: 10000,
  };
}

let state: PlatformState = loadState();
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (typeof window === "undefined") return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* localStorage quota exceeded (big textures) — keep working in memory */
      console.warn("[platform] localStorage quota exceeded — data kept in memory only");
    }
  }, 120);
}

export function censorText(text: string, words: string[]): { text: string; flagged: boolean } {
  let flagged = false;
  let out = text;
  for (const w of words) {
    if (!w) continue;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (re.test(out)) {
      flagged = true;
      out = out.replace(re, (m) => "#".repeat(m.length));
    }
  }
  return { text: out, flagged };
}

/* ------------------------------------------------------------------ */
/* Bot friends — personalities for chat auto-replies                   */
/* ------------------------------------------------------------------ */

export const FRIEND_PERSONAS: Record<string, { vibe: string; color: string; lines: string[]; greeting: string }> = {
  PixelPenguin: {
    vibe: "hyper gamer",
    color: "from-[#00b894] to-[#009432]",
    greeting: "yo!! ready to grind some obbys? 😤",
    lines: [
      "did u see the new Tower of Doom update?? floor 87 is IMPOSSIBLE",
      "brb one more obby run. ONE more.",
      "my record is 4:32 on Speed Run Legends. beat that",
      "wanna race to the top of the tower? loser buys pizza 🍕",
    ],
  },
  LunaLava: {
    vibe: "chill",
    color: "from-[#e84393] to-[#b33771]",
    greeting: "heyyy what's up ~",
    lines: [
      "i've just been decorating my cat café all day tbh",
      "someone donated 500 R$ in my tycoon and i screamed",
      "honestly just vibing in Music Hangout rn",
      "we should build something together in studio sometime",
    ],
  },
  TurboTaco: {
    vibe: "chaotic",
    color: "from-[#f39c12] to-[#d35400]",
    greeting: "TACO TIME!! what do u need 😈",
    lines: [
      "i just escaped prison AGAIN. cops never learn 💀",
      "bet u can't catch me in Prison Breakout",
      "spam :speed 100 in ur own game it's SO fun",
      "me and the crew are causing chaos, join us",
    ],
  },
  GhostyGurl: {
    vibe: "spooky-cute",
    color: "from-[#a29bfe] to-[#6c5ce7]",
    greeting: "oooooh a message from beyond... jk hi 👻",
    lines: [
      "the haunted house game is actually scary at 2am don't test me",
      "i main murderer in Murder Mystery X now. fear me.",
      "if u hear knocking... it's just me. probably. 👀",
      "let's play something spooky tonight?",
    ],
  },
  MaxBuilder77: {
    vibe: "builder nerd",
    color: "from-[#0984e3] to-[#074b8f]",
    greeting: "hey! building something cool today?",
    lines: [
      "pro tip: anchor EVERYTHING or ur build will collapse when u hit play",
      "i've been scripting a door with Touched all morning. loops are pain",
      "wait u can PUBLISH models now?? adding my castle to the toolbox",
      "LocalScripts for UI, Scripts for damage. that's the law 📜",
    ],
  },
  NinjaNoodle: {
    vibe: "playful",
    color: "from-[#fd79a8] to-[#e84393]",
    greeting: "hihi!! 🍜",
    lines: [
      "i got the cat ears AND the flame hair. no regrets",
      "obstacle courses with kill bricks = my cardio",
      "did u try the sword in Sword Fighting Arena? i'm SO bad at it",
      "trade u 50 R$ for that golden crown. final offer 😌",
    ],
  },
  SirBlocksALot: {
    vibe: "knightly",
    color: "from-[#2d3436] to-[#0b0f12]",
    greeting: "Greetings, traveler of the Baseplate.",
    lines: ["hark! the arena calls", "my castle shall be published to the toolbox by fortnight's end", "have thee tried the sword? 'tis glorious"],
  },
  CraftyCarly: {
    vibe: "artsy",
    color: "from-[#55efc4] to-[#00cec9]",
    greeting: "hi hi! what are you making today? 🎨",
    lines: ["pixel art with 1x1 parts is painful but worth it", "i recolored my whole map pastel. it's so cute now", "the toolbox presets save me SO much time"],
  },
  DoctorDoomsday: {
    vibe: "villain",
    color: "from-[#d63031] to-[#8e0b0b]",
    greeting: "what do YOU want 😈",
    lines: ["my volcano lair map is almost done. muahaha", "kill bricks everywhere. EVERYWHERE", "the health bar makes betrayal so much easier"],
  },
  ZoeZoom: {
    vibe: "racer",
    color: "from-[#fdcb6e] to-[#e17055]",
    greeting: "vroom vroom!! 🏎️",
    lines: ["new kart track dropping soon trust", "i drift better than i walk", "turbo karts > swords. fight me"],
  },
  BuilderBecky: {
    vibe: "cozy",
    color: "from-[#e17055] to-[#d63031]",
    greeting: "hii! want a cottage? everyone gets a cottage 😊",
    lines: ["adding a fireplace to the village today", "wood planks material is criminally underrated", "my map hit 20 visits i'm famous"],
  },
  OceanOtter: {
    vibe: "collector",
    color: "from-[#00cec9] to-[#0984e3]",
    greeting: "heyhey! lookin for gems? 💎",
    lines: ["found a rainbow gem today!!", "my pickaxe is maxed. fear my mining", "trading 3 commons for 1 rare, hmu"],
  },
  RapidRabbit: {
    vibe: "speedy",
    color: "from-[#fdcb6e] to-[#f39c12]",
    greeting: "zoom zoom!! 🐇",
    lines: ["speed coil equipped. always.", "u set ur walkspeed to 100 yet? do it", "catch me if u can lol"],
  },
  ShadowSniper: {
    vibe: "mysterious",
    color: "from-[#636e72] to-[#2d3436]",
    greeting: "...you pinged me.",
    lines: ["the sheriff never suspects a thing", "behind you. jk. or am i", "murder mystery tonight?"],
  },
  MochaMoose: {
    vibe: "sleepy",
    color: "from-[#a29bfe] to-[#8e44ad]",
    greeting: "oh hey ☕ gimme a sec, coffee",
    lines: ["building slow is still building", "my hotel map is 60% done for 3 months straight", "nap then obby, that's the schedule"],
  },
  PixelPixie: {
    vibe: "bubbly",
    color: "from-[#e84393] to-[#fd79a8]",
    greeting: "HIII ✨",
    lines: ["look at my tiny avatar it's so cute", "sparkle animations everywhere pls", "dance emote spam incoming 💃"],
  },
  TurboTomato: {
    vibe: "chef",
    color: "from-[#ff7675] to-[#c0392b]",
    greeting: "welcome to the pizzeria! 🍕",
    lines: ["today's special: EVERYTHING", "i burnt 12 pizzas learning the oven. worth it", "delivery in 5 mins or it's free*  *not actually"],
  },
  LunarLynx: {
    vibe: "nocturnal",
    color: "from-[#a29bfe] to-[#6c5ce7]",
    greeting: "*emerges from the shadows* oh, hi",
    lines: ["clockTime 22 is the only valid setting", "neon night maps supremacy", "the moon said hi btw"],
  },
  CraftyCaleb: {
    vibe: "neon",
    color: "from-[#55efc4] to-[#00b894]",
    greeting: "sup! neon city update coming 🔥",
    lines: ["neon + glass = the aesthetic", "my map has a working traffic light script!!", "emissive materials are magic i swear"],
  },
  DustyDragon: {
    vibe: "medieval",
    color: "from-[#d35400] to-[#7b241c]",
    greeting: "HAIL, warrior! 🐉",
    lines: ["castle siege tonight. bring swords", "my catapult finally works. mostly", "the crown shall be MINE"],
  },
  MysticMango: {
    vibe: "tropical",
    color: "from-[#f1c40f] to-[#e67e22]",
    greeting: "hey!! 🥭 island vibes only",
    lines: ["added a waterslide to the resort map", "sand material + palm trees = paradise", "tycoon money go brrr"],
  },
  VoltViper: {
    vibe: "electric",
    color: "from-[#00cec9] to-[#00b894]",
    greeting: "⚡ zap! hey!",
    lines: ["electric kart mods are live in my garage", "forcefield material kart paint. u jealous?", "race me. bring the speed coil"],
  },
  ZenZebra: {
    vibe: "zen",
    color: "from-[#dfe6e9] to-[#b2bec3]",
    greeting: "hello friend 🦓 peace and blocks",
    lines: ["just vibing in the hangout map tbh", "no rush, the build will finish itself. it won't. but vibes", "music + building = therapy"],
  },
  QuirkyQuokka: {
    vibe: "cheerful",
    color: "from-[#fd79a8] to-[#e17055]",
    greeting: "hehe hihi!! 😄",
    lines: ["i smiled at a kill brick today. it killed me anyway", "everything is awesome!! 🧱", "wanna see my dumbest build? it's beautiful"],
  },
};

const FALLBACK_REPLIES = [
  "haha fr",
  "no way 😂",
  "same tbh",
  "wait really?",
  "let's play something later!",
  "i'm down 👀",
  "tell me more",
  "lol",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generate a bot reply for a friend message. */
export function friendReply(friend: string, text: string): string {
  const t = text.toLowerCase();
  const persona = FRIEND_PERSONAS[friend];

  if (/\b(hi|hello|hey|yo|sup|hallo)\b/.test(t)) return persona?.greeting ?? pick(["hey!", "yo!", "hii"]);
  if (/\b(how are you|hows it going|how r u|wyd|what's up|whats up)\b/.test(t)) return pick(["good good, just gaming 😄", "tired but fine lol. u?", "bored. play something with me?"]);
  if (/\b(bye|cya|gtg|goodnight|gn)\b/.test(t)) return pick(["cya!! 👋", "bye bye", "later! don't get banned 😈"]);
  if (/\b(thanks|thank you|ty)\b/.test(t)) return pick(["np!!", "anytime 😎", "ur welcome"]);
  if (/\b(sorry|my bad)\b/.test(t)) return pick(["it's fine lol", "all good 👍"]);
  if (/\b(lol|lmao|haha|😂|xd)\b/.test(t)) return pick(["LOL", "😂😂", "right??"]);
  if (/\b(admin|mod|ban|kick)\b/.test(t)) return pick(["the mods here are actually pretty chill", "i heard the admin account has like 10k robux lol", "don't get banned 😳"]);
  if (/\b(robux|r\$|money|currency)\b/.test(t)) return pick(["i'm broke too dw", "buy the 10000 pack it's 'best value' 😩", "someone gift me robux pls"]);
  if (/\b(sword|fight|arena|battle)\b/.test(t)) return pick(["sword fights are 90% jumping around tbh", "1v1 me. right now. 😤", "i keep losing my sword in the void"]);
  if (/\b(obby|tower|jump|parkour|platform)\b/.test(t)) return pick(["i fell off floor 34 like 10 times today", "my fingers hurt from that obby", "checkpoint update when??"]);
  if (/\b(pet|tycoon|cat|cafe)\b/.test(t)) return pick(["MY PETS ARE SO CUTE", "the cat café music is stuck in my head", "i named all 14 of my pets. yes i have a problem"]);
  if (/\b(script|code|luau|studio|build)\b/.test(t)) return pick(["scripts scare me but ok", "i just copy examples from the docs tbh", "if it doesn't work, add more print() 😂", "script types confuse me... server vs local vs module ugh"]);
  if (/\b(play|join|game)\b/.test(t)) return pick(["omw!!", "join me i'm in the arena rn", "after this round ok?", "yess let's go"]);
  if (/\b(help|how)\b/.test(t)) return pick(["hmm good question... idk 😅", "have u tried the API docs in studio? they have examples for everything", "google it lol. jk. sorta."]);
  if (t.includes("?")) return pick(["hmm maybe?", "good question actually", "idk, u tell me 👀"]);

  return persona ? pick([...persona.lines, ...FALLBACK_REPLIES]) : pick(FALLBACK_REPLIES);
}

/* ------------------------------------------------------------------ */
/* Zustand store                                                       */
/* ------------------------------------------------------------------ */

interface PlatformStore {
  hydrated: boolean;
  version: number;
  hydrate: () => void;

  /* games */
  publishGame: (input: {
    id?: string;
    name: string;
    desc: string;
    creator: string;
    creatorDisplay: string;
    icon: string;
    gradient: string;
    genre: string;
    price: number;
    templateId: string;
    placeData: PlaceState;
  }) => PublishedGame;
  unpublishGame: (id: string, username: string) => void;
  recordVisit: (id: string) => void;
  listGames: () => PublishedGame[];
  buyAccess: (game: PublishedGame, username: string) => { ok: boolean; error?: string };
  ownsAccess: (game: PublishedGame, username: string) => boolean;

  /* assets */
  publishAsset: (input: {
    kind: AssetKind;
    name: string;
    desc: string;
    creator: string;
    creatorDisplay: string;
    icon: string;
    gradient: string;
    price: number;
    parts?: PartData[] | null;
    place?: PlaceState | null;
    anim?: AnimationData | null;
  }) => PublishedAsset;

  /* chat */
  sendFriendMessage: (username: string, friend: string, text: string) => void;
  markConvosRead: (username: string) => void;
  unreadCount: (username: string) => number;
  logInGameMessage: (user: string, text: string, game: string) => { flagged: boolean };
  getConvos: (username: string) => Record<string, ChatMessage[]>;

  /* Team Create sharing */
  getCollab: (gameId: string) => PlaceCollab | null;
  setShareAllFriends: (gameId: string, owner: string, on: boolean) => void;
  addEditor: (gameId: string, owner: string, username: string) => void;
  removeEditor: (gameId: string, owner: string, username: string) => void;
  /** Granular access: set (or clear, with null) a friend's role on a game. */
  setCollabRole: (gameId: string, owner: string, username: string, role: CollabRole | null) => void;
  /** Resolve a user's role: "owner" | "viewer"/"builder"/"editor" | null. */
  getCollabRole: (gameId: string, username: string) => "owner" | CollabRole | null;
  /** Hide (or reveal) one script name from viewers/builders. */
  setHiddenScript: (gameId: string, owner: string, scriptName: string, hidden: boolean) => void;
  requestJoin: (gameId: string, username: string, message: string) => { ok: boolean; error?: string };
  respondJoin: (gameId: string, owner: string, requestId: number, accept: boolean) => void;
  canEditGame: (gameId: string, username: string) => boolean;
  myNotices: (username: string) => UserNotice[];
  clearNotices: (username: string) => void;

  /* moderation (admin) */
  logModAction: (admin: string, action: string, detail: string) => void;
  removeGame: (id: string) => void;
  restoreGame: (id: string) => void;
  featureGame: (id: string, featured: boolean) => void;
  removeAsset: (id: string) => void;
  restoreAsset: (id: string) => void;
  removeChatLog: (id: number) => void;
  removeInGameMessage: (id: number) => void;
  addBlockedWord: (word: string) => void;
  removeBlockedWord: (word: string) => void;
}

function seedConvo(username: string, friend: string, msgs: [string, string][]): void {
  const k = `${username}::${friend}`;
  if (state.convos[k]?.length) return;
  state.convos[k] = msgs.map(([from, text], i) => ({
    id: state.seq++,
    from: from === "me" ? "me" : "them",
    text,
    at: Date.now() - (msgs.length - i) * 60_000 * 7,
  }));
}

/** Create (or fetch) the collab entry for a published game. */
function ensureCollab(gameId: string, owner: string): PlaceCollab {
  let c = state.collabs[gameId];
  if (!c) {
    c = { owner, allFriends: false, editors: [], requests: [] };
    state.collabs[gameId] = c;
  }
  return c;
}

/** Everyone on a user's friend list: seeded starters + friends they added. */
export function friendsOf(username: string): string[] {
  return [...SEED_FRIENDS.map((f) => f.name), ...loadProfile(username).friends];
}

export const usePlatform = create<PlatformStore>((set, get) => ({
  hydrated: false,
  version: 0,
  hydrate: () => {
    state = loadState();
    // seed starter conversations for the admin account so chat feels alive
    seedConvo("admin", "PixelPenguin", [
      ["them", "yo admin!! the new platform update is HUGE"],
      ["me", "right?? publish your obby yet?"],
      ["them", "not yet, finishing the kill bricks 😈"],
    ]);
    seedConvo("admin", "LunaLava", [["them", "hey ~ check my cat café later ok? 🐱"]]);
    seedConvo("admin", "MaxBuilder77", [
      ["them", "dude the script docs have like 1000 commands with examples"],
      ["me", "every command documented. even OnTouch 😎"],
    ]);
    persist();
    set({ hydrated: true, version: state.seq });
  },

  publishGame: (input) => {
    const now = Date.now();
    let game: PublishedGame;
    const existing = input.id ? state.games.find((g) => g.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, {
        name: input.name,
        desc: input.desc,
        icon: input.icon,
        gradient: input.gradient,
        genre: input.genre,
        price: input.price,
        placeData: input.placeData,
        templateId: input.templateId,
        updatedAt: now,
      });
      game = existing;
    } else {
      game = {
        id: `pub_${input.creator}_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: input.name,
        desc: input.desc,
        creator: input.creator,
        creatorDisplay: input.creatorDisplay,
        icon: input.icon,
        gradient: input.gradient,
        genre: input.genre,
        price: input.price,
        templateId: input.templateId,
        placeData: input.placeData,
        visits: Math.floor(3 + Math.random() * 40),
        likes: 0,
        createdAt: now,
        updatedAt: now,
        featured: false,
        removed: false,
      };
      state.games.unshift(game);
    }
    persist();
    set({ version: ++state.seq });
    return game;
  },

  unpublishGame: (id, username) => {
    const g = state.games.find((x) => x.id === id);
    if (!g || g.creator !== username) return;
    state.games = state.games.filter((x) => x.id !== id);
    persist();
    set({ version: ++state.seq });
  },

  recordVisit: (id) => {
    const g = state.games.find((x) => x.id === id);
    if (g) {
      g.visits += 1;
      persist();
      set({ version: ++state.seq });
    }
  },

  listGames: () => state.games.filter((g) => !g.removed),

  buyAccess: (game, username) => {
    if (game.price <= 0) return { ok: true };
    const owned = (state.purchases[username] ?? []).includes(game.id);
    if (owned) return { ok: true };
    const acct = getAccount(username);
    if (!acct) return { ok: false, error: "Account not found — sign in again." };
    if (acct.robux < game.price) return { ok: false, error: `Not enough Robux — you need ${game.price} R$ (you have ${acct.robux}).` };
    authSetRobux(username, acct.robux - game.price);
    // creator earns 90% (platform fee, like Roblox marketplace fee)
    const creator = getAccount(game.creator);
    if (creator && creator.username !== username) authSetRobux(game.creator, creator.robux + Math.floor(game.price * 0.9));
    state.purchases[username] = [...(state.purchases[username] ?? []), game.id];
    persist();
    set({ version: ++state.seq });
    return { ok: true };
  },

  ownsAccess: (game, username) => {
    if (game.price <= 0) return true;
    const acct = getAccount(username);
    if (acct?.isAdmin) return true;
    if (game.creator === username) return true;
    return (state.purchases[username] ?? []).includes(game.id);
  },

  publishAsset: (input) => {
    const asset: PublishedAsset = {
      id: `asset_${input.creator}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      kind: input.kind,
      name: input.name,
      desc: input.desc,
      creator: input.creator,
      creatorDisplay: input.creatorDisplay,
      icon: input.icon,
      gradient: input.gradient,
      price: input.price,
      createdAt: Date.now(),
      parts: input.parts ?? null,
      place: input.place ?? null,
      anim: input.anim ?? null,
      removed: false,
    };
    state.assets.unshift(asset);
    persist();
    set({ version: ++state.seq });
    return asset;
  },

  sendFriendMessage: (username, friend, text) => {
    const k = `${username}::${friend}`;
    const clean = text.trim().slice(0, 300);
    if (!clean) return;
    const { text: censored, flagged } = censorText(clean, state.blockedWords);
    const convos = state.convos;
    convos[k] = [
      ...(convos[k] ?? []),
      { id: state.seq, from: "me", text: censored, at: Date.now() },
    ];
    state.chatLogs.push({ id: state.seq++, user: username, friend, text: censored, at: Date.now(), scope: "web", removed: false, flagged });
    // bot reply
    const reply = friendReply(friend, clean);
    const replyDelay = 700 + Math.random() * 1600;
    setTimeout(() => {
      const kk = `${username}::${friend}`;
      state.convos[kk] = [...(state.convos[kk] ?? []), { id: state.seq++, from: "them", text: reply, at: Date.now() }];
      state.chatLogs.push({ id: state.seq++, user: username, friend, text: reply, at: Date.now(), scope: "web", removed: false, flagged: false });
      persist();
      set({ version: ++state.seq });
    }, replyDelay);
    persist();
    set({ version: ++state.seq });
  },

  markConvosRead: (username) => {
    // unread is derived from last message "them" newer than lastRead marker;
    // we store read position inside a special convo entry time
    const k = `__read__${username}`;
    (state.convos as Record<string, ChatMessage[] | number>)[k] = Date.now();
    persist();
    set({ version: ++state.seq });
  },

  unreadCount: (username) => {
    const readAt = (state.convos as Record<string, ChatMessage[] | number>)[`__read__${username}`] ?? 0;
    let n = 0;
    for (const [k, msgs] of Object.entries(state.convos)) {
      if (k.startsWith("__")) continue;
      if (!k.startsWith(`${username}::`)) continue;
      const list = msgs as ChatMessage[];
      if (list.length && list[list.length - 1].from === "them" && list[list.length - 1].at > (readAt as number)) n++;
    }
    return n;
  },

  logInGameMessage: (user, text, game) => {
    const { text: censored, flagged } = censorText(text, state.blockedWords);
    state.inGameChat.push({ id: state.seq++, user, text: censored, game, at: Date.now(), removed: false, flagged });
    if (state.inGameChat.length > 400) state.inGameChat = state.inGameChat.slice(-400);
    if (state.chatLogs.length > 600) state.chatLogs = state.chatLogs.slice(-600);
    persist();
    set({ version: ++state.seq });
    return { flagged };
  },

  getConvos: (username) => {
    const out: Record<string, ChatMessage[]> = {};
    for (const [k, msgs] of Object.entries(state.convos)) {
      if (k.startsWith("__")) continue;
      if (k.startsWith(`${username}::`)) out[k.slice(username.length + 2)] = msgs;
    }
    return out;
  },

  /* ---------------------- Team Create sharing ---------------------- */

  getCollab: (gameId) => state.collabs[gameId] ?? null,

  setShareAllFriends: (gameId, owner, on) => {
    const game = state.games.find((g) => g.id === gameId);
    if (!game || game.creator !== owner) return;
    const c = ensureCollab(gameId, game.creator);
    c.allFriends = on;
    persist();
    set({ version: ++state.seq });
  },

  addEditor: (gameId, owner, username) => {
    const game = state.games.find((g) => g.id === gameId);
    if (!game || game.creator !== owner || !username.trim()) return;
    const c = ensureCollab(gameId, game.creator);
    if (!c.editors.some((e) => e.toLowerCase() === username.toLowerCase())) c.editors.push(username);
    persist();
    set({ version: ++state.seq });
  },

  removeEditor: (gameId, owner, username) => {
    const game = state.games.find((g) => g.id === gameId);
    if (!game || game.creator !== owner) return;
    const c = state.collabs[gameId];
    if (!c) return;
    c.editors = c.editors.filter((e) => e.toLowerCase() !== username.toLowerCase());
    if (c.roles) {
      for (const k of Object.keys(c.roles)) {
        if (k.toLowerCase() === username.toLowerCase()) delete c.roles[k];
      }
    }
    persist();
    set({ version: ++state.seq });
  },

  setCollabRole: (gameId, owner, username, role) => {
    const game = state.games.find((g) => g.id === gameId);
    if (!game || game.creator !== owner || !username.trim()) return;
    const c = ensureCollab(gameId, game.creator);
    if (!c.roles) c.roles = {};
    const key =
      Object.keys(c.roles).find((k) => k.toLowerCase() === username.toLowerCase()) ?? username;
    if (role === null) delete c.roles[key];
    else c.roles[key] = role;
    persist();
    set({ version: ++state.seq });
  },

  getCollabRole: (gameId, username) => {
    if (!username) return null;
    const game = state.games.find((g) => g.id === gameId);
    if (!game) return null;
    if (game.creator === username) return "owner";
    const c = state.collabs[gameId];
    if (!c) return null;
    // explicit granular role wins
    const explicit = Object.entries(c.roles ?? {}).find(
      ([k]) => k.toLowerCase() === username.toLowerCase(),
    );
    if (explicit) return explicit[1];
    // legacy: editors list + all-friends grant full edit access
    if (c.editors.some((e) => e.toLowerCase() === username.toLowerCase())) return "editor";
    if (c.allFriends) return "editor";
    return null;
  },

  setHiddenScript: (gameId, owner, scriptName, hidden) => {
    const game = state.games.find((g) => g.id === gameId);
    if (!game || game.creator !== owner) return;
    const c = ensureCollab(gameId, game.creator);
    if (!c.hiddenScripts) c.hiddenScripts = [];
    const name = scriptName.trim();
    if (!name) return;
    c.hiddenScripts = c.hiddenScripts.filter((s) => s !== name);
    if (hidden) c.hiddenScripts.push(name);
    persist();
    set({ version: ++state.seq });
  },

  requestJoin: (gameId, username, message) => {
    const game = state.games.find((g) => g.id === gameId && !g.removed);
    if (!game) return { ok: false, error: "That game no longer exists." };
    if (game.creator === username) return { ok: false, error: "You already own this place." };
    const c = ensureCollab(gameId, game.creator);
    if (c.editors.some((e) => e.toLowerCase() === username.toLowerCase()))
      return { ok: false, error: "You already have edit access to this place." };
    if (c.requests.some((r) => r.user.toLowerCase() === username.toLowerCase()))
      return { ok: false, error: "Your join request is already pending — the owner will review it." };
    const req: JoinRequest = { id: state.seq++, user: username, message: message.trim().slice(0, 200), at: Date.now() };
    c.requests.push(req);
    state.notices.push({
      id: state.seq++,
      to: game.creator,
      text: `${username} asked to edit "${game.name}" — open Studio \u2192 Team Create to respond.`,
      kind: "request",
      at: Date.now(),
    });
    if (state.notices.length > 120) state.notices = state.notices.slice(-120);
    persist();
    set({ version: ++state.seq });
    return { ok: true };
  },

  respondJoin: (gameId, owner, requestId, accept) => {
    const game = state.games.find((g) => g.id === gameId);
    if (!game || game.creator !== owner) return;
    const c = ensureCollab(gameId, game.creator);
    const req = c.requests.find((r) => r.id === requestId);
    if (!req) return;
    c.requests = c.requests.filter((r) => r.id !== requestId);
    if (accept) {
      if (!c.editors.some((e) => e.toLowerCase() === req.user.toLowerCase())) c.editors.push(req.user);
      state.notices.push({
        id: state.seq++,
        to: req.user,
        text: `${game.creatorDisplay || game.creator} accepted your request — you can now edit "${game.name}" from their profile.`,
        kind: "granted",
        at: Date.now(),
      });
    }
    persist();
    set({ version: ++state.seq });
  },

  canEditGame: (gameId, username) => {
    if (!username) return false;
    const game = state.games.find((g) => g.id === gameId);
    if (!game) return false;
    if (game.creator === username) return true;
    const c = state.collabs[gameId];
    if (!c) return false;
    // explicit granular role wins — any role means the friend can open the
    // project (Viewer opens it read-only, Builder/Editor can change things)
    const explicit = Object.entries(c.roles ?? {}).find(([k]) => k.toLowerCase() === username.toLowerCase());
    if (explicit) return true;
    if (c.editors.some((e) => e.toLowerCase() === username.toLowerCase())) return true;
    if (c.allFriends) {
      // friendship can be one-sided in this demo (A added B) — accept either
      // direction so "friends see Edit on the profile" always matches.
      const viewerHasOwner = friendsOf(username).some((n) => n.toLowerCase() === game.creator.toLowerCase());
      const ownerHasViewer = friendsOf(game.creator).some((n) => n.toLowerCase() === username.toLowerCase());
      if (viewerHasOwner || ownerHasViewer) return true;
    }
    return false;
  },

  myNotices: (username) => state.notices.filter((n) => n.to === username),

  clearNotices: (username) => {
    state.notices = state.notices.filter((n) => n.to !== username);
    persist();
    set({ version: ++state.seq });
  },

  logModAction: (admin, action, detail) => {
    state.modActions.push({ id: state.seq++, admin, action, detail, at: Date.now() });
    persist();
    set({ version: ++state.seq });
  },

  removeGame: (id) => {
    const g = state.games.find((x) => x.id === id);
    if (g) g.removed = true;
    persist();
    set({ version: ++state.seq });
  },
  restoreGame: (id) => {
    const g = state.games.find((x) => x.id === id);
    if (g) g.removed = false;
    persist();
    set({ version: ++state.seq });
  },
  featureGame: (id, featured) => {
    const g = state.games.find((x) => x.id === id);
    if (g) g.featured = featured;
    persist();
    set({ version: ++state.seq });
  },
  removeAsset: (id) => {
    const a = state.assets.find((x) => x.id === id);
    if (a) a.removed = true;
    persist();
    set({ version: ++state.seq });
  },
  restoreAsset: (id) => {
    const a = state.assets.find((x) => x.id === id);
    if (a) a.removed = false;
    persist();
    set({ version: ++state.seq });
  },
  removeChatLog: (id) => {
    const c = state.chatLogs.find((x) => x.id === id);
    if (c) c.removed = true;
    persist();
    set({ version: ++state.seq });
  },
  removeInGameMessage: (id) => {
    const m = state.inGameChat.find((x) => x.id === id);
    if (m) m.removed = true;
    persist();
    set({ version: ++state.seq });
  },
  addBlockedWord: (word) => {
    const w = word.trim().toLowerCase();
    if (w && !state.blockedWords.includes(w)) state.blockedWords.push(w);
    persist();
    set({ version: ++state.seq });
  },
  removeBlockedWord: (word) => {
    state.blockedWords = state.blockedWords.filter((w) => w !== word);
    persist();
    set({ version: ++state.seq });
  },
}));

/** Direct read access for moderation panels (accounts come from auth). */
export function platformSnapshot() {
  return state;
}

/* ------------------------------------------------------------------ */
/* Card conversion — user-published games rendered like seed games    */
/* ------------------------------------------------------------------ */

export function publishedToWebGame(p: PublishedGame): WebGame {
  return {
    id: p.id,
    name: p.name,
    creator: p.creatorDisplay || p.creator,
    players: Math.max(1, Math.round(p.visits / 25) + 1),
    rating: 92,
    favorites: Math.round(p.visits * 1.3),
    visits: p.visits,
    genre: p.genre || "Community",
    icon: Blocks,
    gradient: p.gradient,
    templateId: p.templateId,
    desc: p.desc,
    serverSize: 12,
    updated: "today",
    price: p.price,
    publishedId: p.id,
    emoji: p.icon,
  };
}

export function allAccountsForMod() {
  return listAccounts();
}

export function timeAgo(at: number): string {
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
