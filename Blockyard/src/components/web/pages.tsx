"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Blocks,
  Check,
  ChevronRight,
  Compass,
  Gamepad2,
  Hammer,
  Heart,
  Hexagon,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  Search,
  ShoppingBag,
  ThumbsUp,
  TrendingUp,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import {
  DISCOVER_CATEGORIES,
  GAMES,
  ROBUX_PACKAGES,
  SEED_FRIENDS,
  SHOP_ITEMS,
  formatCount,
  friendAppearance,
  livePlayers,
  searchPeople,
  type PersonResult,
  type WebFriend,
  type WebGame,
} from "@/lib/studio/webdata";
import { StudioEngine, } from "@/lib/studio/engine";
import { PLACE_TEMPLATES } from "@/lib/studio/data";
import { useWeb } from "@/lib/studio/webstore";
import { platformSnapshot, publishedToWebGame, timeAgo, usePlatform } from "@/lib/studio/platform";
import { GameCard, GameDetail } from "./GameCard";

type OpenGame = { game: WebGame; close: () => void } | null;

/* ------------------------------- helpers -------------------------------- */

function useGameOpener() {
  const [open, setOpen] = useState<WebGame | null>(null);
  return {
    openGame: open,
    open: (g: WebGame) => setOpen(g),
    close: () => setOpen(null),
    detail: open ? <GameDetail game={open} onClose={() => setOpen(null)} /> : null,
  };
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="text-[17px] font-extrabold text-[#111418]">{title}</h2>
      {action}
    </div>
  );
}

function CardRow({ games, onOpen }: { games: WebGame[]; onOpen: (g: WebGame) => void }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      {games.map((g) => (
        <GameCard key={g.id} game={g} onOpen={onOpen} />
      ))}
    </div>
  );
}

/* --------------------------------- Home --------------------------------- */

export function HomePage({ onOpen }: { onOpen: (g: WebGame) => void }) {
  const recentlyPlayed = useWeb((s) => s.recentlyPlayed);
  const extraFriends = useWeb((s) => s.extraFriends);
  const session = useWeb((s) => s.session);
  const platformVersion = usePlatform((s) => s.version);

  const communityGames = useMemo(() => {
    void platformVersion;
    return platformSnapshot()
      .games.filter((g) => !g.removed)
      .slice(0, 12)
      .map(publishedToWebGame);
  }, [platformVersion]);

  const picks = useMemo(() => [...GAMES].sort((a, b) => livePlayers(b.players) - livePlayers(a.players)).slice(0, 6), []);
  const recommended = useMemo(() => [...GAMES].sort((a, b) => b.rating - a.rating).slice(0, 12), []);
  const continueGames = recentlyPlayed.map((id) => GAMES.find((g) => g.id === id)).filter(Boolean) as WebGame[];

  const friends: WebFriend[] = [
    ...SEED_FRIENDS,
    ...extraFriends.map((name) => friendAppearance(name)),
  ];
  const onlineFriends = friends.filter((f) => f.status !== "offline");

  return (
    <div className="space-y-8">
      {/* Today's Picks — pinned top */}
      <section>
        <SectionHeader
          title="Today's Picks"
          action={<span className="flex items-center gap-1 text-[12px] font-semibold text-[#00b06f]"><TrendingUp size={13} /> trending now</span>}
        />
        <CardRow games={picks} onOpen={onOpen} />
      </section>

      {/* Continue */}
      {continueGames.length > 0 && (
        <section>
          <SectionHeader title="Continue" />
          <CardRow games={continueGames} onOpen={onOpen} />
        </section>
      )}

      {/* Friends */}
      <section>
        <SectionHeader
          title="Friends"
          action={<span className="text-[12.5px] font-semibold text-[#0f6dcf]">{onlineFriends.length} online</span>}
        />
        <div className="flex flex-wrap gap-6">
          {friends.slice(0, 10).map((f) => {
            const playing = f.playing ? GAMES.find((g) => g.id === f.playing) : undefined;
            return (
              <button
                key={f.name}
                type="button"
                className="group flex w-[86px] flex-col items-center gap-1.5"
                onClick={() => playing && onOpen(playing)}
                title={playing ? `${f.name} is playing ${playing.name}` : f.name}
              >
                <span className="relative">
                  <span className={`grid h-[64px] w-[64px] place-items-center rounded-full bg-gradient-to-br ${f.color} text-[24px] font-extrabold text-white shadow-md transition-transform group-hover:scale-105`}>
                    {f.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-[16px] w-[16px] rounded-full border-2 border-white ${
                      f.status === "playing" ? "bg-[#00b06f]" : f.status === "online" ? "bg-[#2ecc71]" : "bg-[#b2bec3]"
                    }`}
                    title={f.status}
                  />
                </span>
                <span className="w-full truncate text-center text-[11.5px] font-semibold text-[#111418]">{f.name}</span>
                <span className="w-full truncate text-center text-[9.5px] leading-tight text-[#9aa0a6]">
                  {f.status === "playing" && playing ? `▶ ${playing.name}` : f.status === "online" ? "Online" : f.lastOnline ?? "Offline"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Community — games published by creators */}
      {communityGames.length > 0 && (
        <section>
          <SectionHeader
            title="From the Community"
            action={<span className="text-[12px] font-semibold text-[#00b06f]">published by creators like you</span>}
          />
          <CardRow games={communityGames} onOpen={onOpen} />
        </section>
      )}

      {/* Recommended */}
      <section>
        <SectionHeader title={`Recommended For ${session?.displayName ?? "You"}`} />
        <CardRow games={recommended} onOpen={onOpen} />
      </section>
    </div>
  );
}

/* -------------------------------- Charts -------------------------------- */

export function ChartsPage({ onOpen }: { onOpen: (g: WebGame) => void }) {
  const ranked = useMemo(() => [...GAMES].sort((a, b) => livePlayers(b.players) - livePlayers(a.players)), []);
  return (
    <div>
      <SectionHeader title="Top Experiences" action={<span className="text-[12px] text-[#9aa0a6]">by active players · updates live</span>} />
      <div className="space-y-2">
        {ranked.map((g, i) => {
          const Icon = g.icon;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onOpen(g)}
              className="flex w-full items-center gap-4 rounded-xl border border-transparent bg-white p-3 text-left shadow-sm transition-all hover:border-[#00b06f]/40 hover:shadow-md"
            >
              <span className={`w-8 shrink-0 text-center text-[20px] font-extrabold ${i < 3 ? "text-[#00b06f]" : "text-[#b9bfc4]"}`}>
                {i + 1}
              </span>
              <span className={`relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br ${g.gradient}`}>
                <Icon size={32} strokeWidth={1.3} className="text-white/90" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-[#111418]">{g.name}</span>
                <span className="mt-0.5 block text-[12px] text-[#5c6166]">
                  By {g.creator} · {g.genre}
                </span>
                <span className="mt-1 flex items-center gap-1 text-[12px] text-[#5c6166]">
                  <span className="inline-block h-[7px] w-[7px] rounded-full bg-[#00b06f]" />
                  <b className="text-[#111418]">{formatCount(livePlayers(g.players))}</b> playing
                </span>
              </span>
              <span className="hidden shrink-0 items-center gap-3 text-[12px] text-[#9aa0a6] sm:flex">
                <span className="flex items-center gap-1"><Heart size={13} /> {formatCount(g.favorites)}</span>
                <span className="flex items-center gap-1"><ThumbsUp size={13} /> {g.rating}%</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-[#b9bfc4]" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------- Discover ------------------------------- */

export function DiscoverPage({ onOpen }: { onOpen: (g: WebGame) => void }) {
  const [category, setCategory] = useState("Popular");
  const games = useMemo(
    () => (category === "Popular" ? [...GAMES].sort((a, b) => b.rating - a.rating) : GAMES.filter((g) => g.genre === category)),
    [category],
  );
  return (
    <div>
      <SectionHeader title="Discover" />
      <div className="mb-5 flex flex-wrap gap-2">
        {DISCOVER_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
              category === c ? "bg-[#111418] text-white" : "bg-white text-[#3f4347] shadow-sm hover:bg-[#eceff1]"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {games.length ? (
        <CardRow games={games} onOpen={onOpen} />
      ) : (
        <div className="rounded-xl bg-white p-10 text-center text-[13px] text-[#9aa0a6] shadow-sm">
          No experiences in this category yet.
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Avatar Shop ------------------------------ */

const SHOP_CATEGORIES = ["All", "Bundles", "Heads", "Faces", "Hair", "Gear", "Accessories", "Hats"];

export function MarketplacePage() {
  const [category, setCategory] = useState("All");
  const owned = useWeb((s) => s.owned);
  const buyItem = useWeb((s) => s.buyItem);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const items = category === "All" ? SHOP_ITEMS : SHOP_ITEMS.filter((i) => i.category === category);

  return (
    <div>
      <SectionHeader title="Avatar Shop" action={<span className="text-[12px] text-[#9aa0a6]">{owned.length} owned</span>} />
      <div className="mb-5 flex flex-wrap gap-2">
        {SHOP_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
              category === c ? "bg-[#111418] text-white" : "bg-white text-[#3f4347] shadow-sm hover:bg-[#eceff1]"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg border px-4 py-2.5 text-[12.5px] ${msg.ok ? "border-[#b7e8d2] bg-[#edfaf4] text-[#008751]" : "border-[#f3c2c2] bg-[#fdf1f1] text-[#c0392b]"}`}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          const isOwned = owned.includes(item.id);
          return (
            <div key={item.id} className="rounded-xl bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
              <div className={`relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-gradient-to-br ${item.gradient}`}>
                <Icon size="45%" strokeWidth={1.2} className="text-white/90 drop-shadow" />
                {isOwned && (
                  <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-[#00b06f] px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                    <Check size={10} /> Owned
                  </span>
                )}
              </div>
              <div className="mt-2 truncate text-[13px] font-semibold text-[#111418]">{item.name}</div>
              <div className="truncate text-[11px] text-[#9aa0a6]">By {item.creator}</div>
              <div className="mt-2">
                {isOwned ? (
                  <div className="flex h-8 items-center justify-center rounded-lg bg-[#f2f4f5] text-[12px] font-semibold text-[#9aa0a6]">
                    In inventory
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const res = buyItem(item.id, item.price);
                      setMsg(res.ok
                        ? { ok: true, text: `${item.name} added to your inventory!` }
                        : { ok: false, text: res.error ?? "Purchase failed." });
                    }}
                    className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[#00b06f] text-[12.5px] font-bold text-white transition-colors hover:bg-[#009a61]"
                  >
                    {item.price === 0 ? (
                      "Get"
                    ) : (
                      <>
                        <Hexagon size={13} fill="currentColor" /> {formatCount(item.price)}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- Create -------------------------------- */

export function CreatePage() {
  const enterStudio = useWeb((s) => s.enterStudio);
  const requestLaunch = useWeb((s) => s.requestLaunch);
  const session = useWeb((s) => s.session);
  const platformVersion = usePlatform((s) => s.version);
  const peek = typeof window !== "undefined" ? StudioEngine.peekLocal() : null;

  const myGames = useMemo(() => {
    void platformVersion;
    if (!session) return [];
    return platformSnapshot().games.filter((g) => g.creator === session.username && !g.removed);
  }, [platformVersion, session]);

  return (
    <div>
      <SectionHeader title="Create" />
      <div className="mb-6 flex flex-col items-start gap-4 rounded-2xl bg-gradient-to-r from-[#111418] to-[#2d3436] p-6 text-white sm:flex-row sm:items-center">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#00b06f] shadow-lg">
          <Hammer size={26} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[19px] font-extrabold">Blockyard Studio</div>
          <div className="mt-0.5 text-[13px] leading-relaxed text-white/75">
            Build 3D worlds, script them with a Luau-like language, rig characters and animations — then publish your game to the world.
          </div>
        </div>
        <button
          type="button"
          onClick={enterStudio}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#00b06f] px-7 text-[15px] font-bold text-white shadow-lg transition-all hover:bg-[#009a61] active:scale-95"
        >
          <Play size={17} fill="currentColor" /> Start Creating
        </button>
      </div>

      {myGames.length > 0 && (
        <div className="mb-8">
          <SectionHeader
            title="My Published Games"
            action={<span className="text-[12px] text-[#9aa0a6]">manage what you've published from Studio</span>}
          />
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            {myGames.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center gap-3 border-b border-[#f2f4f5] px-4 py-3 last:border-0">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${g.gradient} text-[22px]`}>{g.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-bold text-[#111418]">{g.name}</span>
                    {g.featured && <span className="shrink-0 rounded bg-[#fff4dd] px-1.5 text-[9px] font-bold text-[#b7950b]">featured</span>}
                    {g.price > 0 && <span className="shrink-0 rounded bg-[#edfaf4] px-1.5 text-[9px] font-bold text-[#008751]">{g.price} R$ entry</span>}
                  </div>
                  <div className="text-[11px] text-[#9aa0a6]">
                    {g.visits} visits · updated {timeAgo(g.updatedAt)} · {g.placeData?.parts.length ?? 0} parts
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex h-8 items-center gap-1.5 rounded-full bg-[#111418] px-4 text-[11.5px] font-bold text-white hover:bg-[#2a2e33]"
                    onClick={() =>
                      useWeb.getState().requestLaunch({
                        templateId: g.templateId,
                        name: g.name,
                        autoPlay: false,
                        gameId: g.id,
                        placeData: g.placeData,
                        teamRoom: g.id,
                        teamRole: g.creator === session?.username ? "owner" : (usePlatform.getState().getCollabRole(g.id, session?.username ?? "") ?? "editor"),
                      })
                    }
                    title="Open this place in Studio with a live Team Create room"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    type="button"
                    className="flex h-8 items-center gap-1.5 rounded-full bg-[#00b06f] px-4 text-[11.5px] font-bold text-white hover:bg-[#009a61]"
                    onClick={() =>
                      useWeb.getState().requestJoin({
                        gameId: g.id,
                        name: g.name,
                        templateId: g.templateId,
                        placeData: g.placeData,
                        price: g.price,
                        creator: g.creator,
                        creatorDisplay: g.creatorDisplay,
                        iconEmoji: g.icon,
                        gradient: g.gradient,
                        desc: g.desc,
                      })
                    }
                  >
                    <Play size={12} fill="currentColor" /> Play
                  </button>
                  <button
                    type="button"
                    className="h-8 rounded-full border border-[#d6d9db] bg-white px-4 text-[11.5px] font-semibold text-[#5c6166] hover:bg-[#f5f7f8]"
                    onClick={() => {
                      usePlatform.getState().unpublishGame(g.id, g.creator);
                    }}
                  >
                    Unpublish
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-[#9aa0a6]">
            To update a game, publish it again from Studio with the same name — your players keep their access.
          </div>
        </div>
      )}

      {peek && (
        <div className="mb-6">
          <SectionHeader title="Continue working" />
          <button
            type="button"
            onClick={enterStudio}
            className="flex w-full items-center gap-4 rounded-xl border border-[#b7e8d2] bg-[#edfaf4] p-4 text-left transition-colors hover:border-[#00b06f]"
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#00b06f]/15 text-[#008751]">
              <Gamepad2 size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-bold text-[#111418]">“{peek.name}”</div>
              <div className="text-[12px] text-[#5c6166]">Your autosaved place · {peek.parts} parts · opens in Studio</div>
            </div>
            <ChevronRight size={18} className="text-[#008751]" />
          </button>
        </div>
      )}

      <SectionHeader title="Start from a template" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {PLACE_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => requestLaunch({ templateId: t.id, name: t.name, autoPlay: false })}
            className="group overflow-hidden rounded-xl bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className={`relative grid h-[110px] place-items-center bg-gradient-to-br ${t.accent}`}>
              <Blocks size={42} strokeWidth={1.3} className="text-white/85 drop-shadow" />
              <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Plus size={13} strokeWidth={2.6} />
              </span>
            </div>
            <div className="p-2.5">
              <div className="truncate text-[13px] font-semibold text-[#111418]">{t.name}</div>
              <div className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-[#9aa0a6]">{t.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- Friends ------------------------------- */

function statusLabel(f: { status: string; playing?: string; lastOnline?: string }): string {
  if (f.status === "playing") {
    const g = f.playing ? GAMES.find((x) => x.id === f.playing) : undefined;
    return g ? `Playing ${g.name}` : "In a game";
  }
  if (f.status === "online") return "Online";
  return `Last online ${f.lastOnline ?? "a while ago"}`;
}

function PersonAvatar({ person, size = 54 }: { person: { color: string; name: string }; size?: number }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${person.color} font-extrabold text-white shadow`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.37) }}
    >
      {person.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function FriendsPage({ onOpen }: { onOpen: (g: WebGame) => void }) {
  const extraFriends = useWeb((s) => s.extraFriends);
  const addFriend = useWeb((s) => s.addFriend);
  const removeFriend = useWeb((s) => s.removeFriend);
  const session = useWeb((s) => s.session);
  const openProfile = useWeb((s) => s.openProfile);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [focused, setFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!searchRef.current?.contains(e.target as Node)) setFocused(false);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", close);
    };
  }, []);

  const isFriend = (n: string) =>
    SEED_FRIENDS.some((f) => f.name.toLowerCase() === n.toLowerCase()) ||
    extraFriends.some((f) => f.toLowerCase() === n.toLowerCase());

  const results: PersonResult[] = focused && name.trim() ? searchPeople(name, session?.username) : [];

  const add = (person: PersonResult) => {
    if (person.name.toLowerCase() === session?.username.toLowerCase()) {
      setMsg({ ok: false, text: "That's you! You're already your own best friend." });
      setTimeout(() => setMsg(null), 3000);
      return;
    }
    if (isFriend(person.name)) {
      setMsg({ ok: true, text: `${person.name} is already your friend.` });
      setTimeout(() => setMsg(null), 3000);
      return;
    }
    addFriend(person.name);
    setMsg({ ok: true, text: `${person.name} is now your friend! Open the chat bubble to say hi.` });
    setName("");
    setFocused(false);
    setTimeout(() => setMsg(null), 3500);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = name.trim();
    if (!q) return;
    const exact = searchPeople(q, session?.username).find((p) => p.name.toLowerCase() === q.toLowerCase());
    if (!exact) {
      setMsg({
        ok: false,
        text: `No player named "${q}" exists on Blockyard. You can only add real players — search part of a name to browse people.`,
      });
      setTimeout(() => setMsg(null), 4500);
      return;
    }
    add(exact);
  };

  const friends: (WebFriend & { custom: boolean })[] = [
    ...SEED_FRIENDS.map((f) => ({ ...f, custom: false })),
    ...extraFriends.map((n) => ({ ...friendAppearance(n), custom: true })),
  ];
  const online = friends.filter((f) => f.status !== "offline");
  const offline = friends.filter((f) => f.status === "offline");

  return (
    <div>
      <SectionHeader title="Friends" action={<span className="text-[12.5px] font-semibold text-[#0f6dcf]">{online.length} online · {friends.length} total</span>} />

      <div ref={searchRef} className="relative mb-4">
        <form onSubmit={submit} className="flex gap-2">
          <span className="flex flex-1 items-center gap-2 rounded-full border border-[#d6d9db] bg-white px-4 shadow-sm focus-within:border-[#00b06f]">
            <Search size={16} className="shrink-0 text-[#9aa0a6]" />
            <input
              className="h-10 flex-1 bg-transparent text-[13.5px] text-[#111418] outline-none placeholder:text-[#b9bfc4]"
              placeholder="Search real players by username…"
              value={name}
              maxLength={24}
              onChange={(e) => {
                setName(e.target.value);
                setFocused(true);
              }}
              onFocus={() => setFocused(true)}
            />
          </span>
          <button type="submit" className="h-10 shrink-0 rounded-full bg-[#00b06f] px-5 text-[13.5px] font-bold text-white hover:bg-[#009a61]">
            Add Friend
          </button>
        </form>

        {focused && name.trim() && (
          <div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-xl border border-[#e3e6e8] bg-white shadow-xl">
            {results.length ? (
              results.map((p) => {
                const friend = isFriend(p.name);
                const self = p.name.toLowerCase() === session?.username.toLowerCase();
                return (
                  <div key={p.name} className="flex items-center gap-3 border-b border-[#f2f4f5] px-4 py-2.5 last:border-0">
                    <PersonAvatar person={p} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold text-[#111418]">
                        {p.display} {p.real && <span className="ml-1 rounded bg-[#edfaf4] px-1.5 py-0.5 text-[9px] font-bold text-[#008751]">real account</span>}
                      </div>
                      <div className="truncate text-[11px] text-[#9aa0a6]">
                        @{p.name} · {statusLabel(p)}
                      </div>
                    </div>
                    {self ? (
                      <span className="text-[11px] font-semibold text-[#9aa0a6]">You</span>
                    ) : friend ? (
                      <span className="flex items-center gap-1 text-[11.5px] font-bold text-[#008751]">
                        <Check size={13} /> Friends
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => add(p)}
                        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[#00b06f] px-3.5 text-[11.5px] font-bold text-white hover:bg-[#009a61]"
                      >
                        <UserPlus size={13} /> Add
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-3 text-[12.5px] text-[#9aa0a6]">
                No players found for “{name}” — only real Blockyard players can be added as friends.
              </div>
            )}
          </div>
        )}
      </div>

      {msg && (
        <div
          className={`mb-4 rounded-lg border px-4 py-2.5 text-[12.5px] ${
            msg.ok ? "border-[#b7e8d2] bg-[#edfaf4] text-[#008751]" : "border-[#f3c2c2] bg-[#fdf1f1] text-[#c0392b]"
          }`}
        >
          {msg.text}
        </div>
      )}

      {(["online", "offline"] as const).map((group) => {
        const list = group === "online" ? online : offline;
        if (!list.length) return null;
        return (
          <div key={group} className="mb-7">
            <div className="mb-3 text-[13px] font-bold uppercase tracking-wide text-[#9aa0a6]">
              {group === "online" ? "Online" : `Offline (${list.length})`}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((f) => {
                const playing = f.playing ? GAMES.find((g) => g.id === f.playing) : undefined;
                return (
                  <div key={f.name} className="flex items-center gap-3.5 rounded-xl bg-white p-3.5 shadow-sm">
                    <span className="relative shrink-0">
                      <PersonAvatar person={f} />
                      <span className={`absolute -bottom-0.5 -right-0.5 h-[15px] w-[15px] rounded-full border-2 border-white ${f.status === "playing" ? "bg-[#00b06f]" : f.status === "online" ? "bg-[#2ecc71]" : "bg-[#b2bec3]"}`} />
                    </span>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openProfile(f.name)} title={`View ${f.name}'s profile`}>
                      <div className="truncate text-[14px] font-bold text-[#111418]">{f.name}</div>
                      <div className="truncate text-[11.5px] text-[#9aa0a6]">{statusLabel(f)}</div>
                      <div className="mt-0.5 text-[10.5px] font-semibold text-[#0f6dcf]">View profile →</div>
                      {playing && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(playing);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              onOpen(playing);
                            }
                          }}
                          className="mt-1.5 flex items-center gap-1 text-[11.5px] font-bold text-[#0f6dcf] hover:underline"
                        >
                          <Play size={11} fill="currentColor" /> Join experience
                        </span>
                      )}
                    </button>
                    {f.custom && (
                      <button
                        type="button"
                        onClick={() => removeFriend(f.name)}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#b9bfc4] hover:bg-[#fdf1f1] hover:text-[#c0392b]"
                        title="Remove friend"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="mt-2 flex items-start gap-3 rounded-xl bg-white p-4 text-[12px] leading-relaxed text-[#9aa0a6] shadow-sm">
        <MessageCircle size={16} className="mt-0.5 shrink-0 text-[#00b06f]" />
        <span>
          Friends you add here are real Blockyard players — the search only shows people who exist. Chat with them any time from the
          chat bubble in the bottom-right corner of the site, or join the experience they are playing.
        </span>
      </div>
    </div>
  );
}

/* --------------------------------- Robux -------------------------------- */

export function RobuxPage() {
  const session = useWeb((s) => s.session);
  const robux = session?.robux ?? 0;
  return (
    <div>
      <SectionHeader title="Robux" />
      <div className="mb-6 flex items-center gap-5 rounded-2xl bg-gradient-to-r from-[#00b06f] to-[#008751] p-6 text-white shadow-md">
        <Hexagon size={54} fill="rgba(255,255,255,0.25)" strokeWidth={1.4} />
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-wide text-white/80">Your balance</div>
          <div className="text-[34px] font-extrabold leading-tight">{formatCount(robux)} R$</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {ROBUX_PACKAGES.map((p) => (
          <div key={p.amount} className={`relative rounded-xl bg-white p-4 text-center shadow-sm transition-shadow hover:shadow-md ${p.bonus ? "ring-2 ring-[#00b06f]" : ""}`}>
            {p.bonus && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#111418] px-2.5 py-0.5 text-[9.5px] font-bold text-white">
                {p.bonus}
              </span>
            )}
            <Hexagon size={30} className="mx-auto text-[#00b06f]" fill="#d9f4e9" />
            <div className="mt-2 text-[16px] font-extrabold text-[#111418]">{formatCount(p.amount)}</div>
            <div className="text-[11px] text-[#9aa0a6]">Robux</div>
            <div className="mt-0.5 text-[13px] font-bold text-[#111418]">{p.price}</div>
            <div className="mt-1 text-[9px] text-[#b9bfc4]">demo — no real charge</div>
          </div>
        ))}
      </div>
      <p className="mt-5 rounded-xl bg-white p-4 text-[12px] leading-relaxed text-[#9aa0a6] shadow-sm">
        This is a demo storefront. Purchases use prototype-only Robux and are not real-money transactions.
      </p>
    </div>
  );
}

/* ------------------------------ search view ----------------------------- */

export function SearchResultsPage({ onOpen }: { onOpen: (g: WebGame) => void }) {
  return null;
}
void SearchResultsPage;
