"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Blocks,
  Compass,
  Gamepad2,
  Hammer,
  Hexagon,
  LogOut,
  Search,
  Shield,
  ShoppingBag,
  TrendingUp,
  User,
  Users,
  X,
} from "lucide-react";
import { GAMES, SEED_FRIENDS, formatCount, livePlayers, searchPeople } from "@/lib/studio/webdata";
import { useWeb, type WebPage } from "@/lib/studio/webstore";
import { platformSnapshot, timeAgo, usePlatform } from "@/lib/studio/platform";
import { ChartsPage, CreatePage, DiscoverPage, FriendsPage, HomePage, MarketplacePage, RobuxPage } from "./pages";
import { ProfilePage } from "./ProfilePage";
import { AdminPage } from "./AdminPage";
import { ChatWidget } from "./ChatWidget";
import { GameDetail } from "./GameCard";
import type { WebGame } from "@/lib/studio/webdata";

const SEED_FRIENDS_NAMES = new Set(SEED_FRIENDS.map((f) => f.name));

const NAV: { id: WebPage; label: string; icon: typeof TrendingUp }[] = [
  { id: "home", label: "Charts", icon: TrendingUp },
  { id: "discover", label: "Discover", icon: Compass },
  { id: "marketplace", label: "Marketplace", icon: ShoppingBag },
  { id: "create", label: "Create", icon: Hammer },
  { id: "friends", label: "Friends", icon: Users },
  { id: "robux", label: "Robux", icon: Hexagon },
];

const NOTIFICATIONS = [
  { id: 1, icon: Users, text: "PixelPenguin sent you a friend request", time: "2h ago" },
  { id: 2, icon: Gamepad2, text: "TurboTaco invited you to play Prison Breakout", time: "4h ago" },
  { id: 3, icon: TrendingUp, text: "Tower of Doom Obby just got a huge update", time: "1d ago" },
  { id: 4, icon: Bell, text: "Your place 'Baseplate' was autosaved", time: "2d ago" },
];

const NOTICE_STYLE: Record<string, string> = {
  request: "bg-[#fffbec] text-[#b7950b]",
  granted: "bg-[#edfaf4] text-[#008751]",
  info: "bg-[#f5f7f8] text-[#5c6166]",
};

export default function WebApp() {
  const session = useWeb((s) => s.session);
  const page = useWeb((s) => s.page);
  const setPage = useWeb((s) => s.setPage);
  const logout = useWeb((s) => s.logout);
  const robux = session?.robux ?? 0;
  const notificationsRead = useWeb((s) => s.notificationsRead);
  const markNotificationsRead = useWeb((s) => s.markNotificationsRead);
  const search = useWeb((s) => s.search);
  const setSearch = useWeb((s) => s.setSearch);

  const [openGame, setOpenGame] = useState<WebGame | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!bellRef.current?.contains(e.target as Node)) setBellOpen(false);
      if (!profileRef.current?.contains(e.target as Node)) setProfileOpen(false);
      if (!searchRef.current?.contains(e.target as Node)) setSearchFocus(false);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", close);
    };
  }, []);

  const results = search.trim()
    ? GAMES.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6)
    : [];
  const people = search.trim() ? searchPeople(search, session?.username).slice(0, 4) : [];
  const addFriend = useWeb((s) => s.addFriend);
  const extraFriends = useWeb((s) => s.extraFriends);
  const openProfile = useWeb((s) => s.openProfile);
  const platformVersion = usePlatform((s) => s.version);

  /* live notifications: Team Create join requests + access granted */
  const liveNotices = useMemo(() => {
    void platformVersion;
    if (!session) return [];
    return usePlatform.getState().myNotices(session.username).slice(-8).reverse();
  }, [platformVersion, session]);
  const hasUnread = liveNotices.length > 0 || !notificationsRead;

  return (
    <div className="flex min-h-screen bg-[#f2f4f5] text-[#111418]">
      {/* ------------------------------- sidebar ------------------------------ */}
      <aside className="sticky top-0 hidden h-screen w-[228px] shrink-0 flex-col border-r border-[#e3e6e8] bg-white px-3 py-4 md:flex">
        <button type="button" className="mb-5 flex items-center gap-2 px-2" onClick={() => setPage("home")}>
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#111418] text-white">
            <Blocks size={19} strokeWidth={2.4} />
          </div>
          <span className="text-[17px] font-extrabold tracking-tight">BLOCKYARD</span>
        </button>

        <nav className="flex-1 space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPage(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-semibold transition-colors ${
                  active ? "bg-[#eceff1] text-[#111418]" : "text-[#5c6166] hover:bg-[#f5f7f8]"
                }`}
              >
                <Icon size={19} strokeWidth={active ? 2.4 : 2} className={active ? "text-[#00b06f]" : ""} />
                {item.label}
              </button>
            );
          })}
          {session?.isAdmin && (
            <button
              type="button"
              onClick={() => setPage("admin")}
              className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-semibold transition-colors ${
                page === "admin" ? "bg-[#fdecec] text-[#c0392b]" : "text-[#c0392b] hover:bg-[#fdf1f1]"
              }`}
            >
              <Shield size={19} strokeWidth={page === "admin" ? 2.4 : 2} />
              Moderation
              <span className="ml-auto rounded-full bg-[#c0392b]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase">admin</span>
            </button>
          )}
        </nav>

        <div className="space-y-0.5 border-t border-[#e3e6e8] pt-3">
          <button
            type="button"
            onClick={() => setPage("robux")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold text-[#5c6166] hover:bg-[#f5f7f8]"
          >
            <Hexagon size={15} className="text-[#00b06f]" fill="#d9f4e9" />
            {formatCount(robux)} Robux
          </button>
          <div className="px-3 pb-1 pt-2 text-[10.5px] leading-relaxed text-[#9aa0a6]">
            © 2026 Blockyard Demo
            <br />
            A Roblox-style study project
          </div>
        </div>
      </aside>

      {/* -------------------------------- main -------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-3 border-b border-[#e3e6e8] bg-white/95 px-4 backdrop-blur">
          {/* mobile nav */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="relative min-w-0 max-w-[440px] flex-1" ref={searchRef}>
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9aa0a6]" />
              <input
                className="h-10 w-full rounded-full border border-[#e3e6e8] bg-[#f5f7f8] pl-10 pr-9 text-[13.5px] text-[#111418] outline-none transition-colors placeholder:text-[#9aa0a6] focus:border-[#00b06f] focus:bg-white"
                placeholder="Search experiences…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSearchFocus(true);
                }}
                onFocus={() => setSearchFocus(true)}
              />
              {search && (
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa0a6] hover:text-[#111418]" onClick={() => setSearch("")}>
                  <X size={14} />
                </button>
              )}
              {searchFocus && search.trim() && (
                <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-xl border border-[#e3e6e8] bg-white shadow-xl">
                  {results.length || people.length ? (
                    <>
                      {results.map((g) => {
                        const Icon = g.icon;
                        return (
                          <button
                            key={g.id}
                            type="button"
                            className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-[#f5f7f8]"
                            onClick={() => {
                              setOpenGame(g);
                              setSearchFocus(false);
                            }}
                          >
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${g.gradient}`}>
                              <Icon size={17} className="text-white/90" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold">{g.name}</span>
                              <span className="block text-[11px] text-[#9aa0a6]">{formatCount(livePlayers(g.players))} playing</span>
                            </span>
                          </button>
                        );
                      })}
                      {people.length > 0 && (
                        <div className="border-t border-[#e3e6e8]">
                          <div className="px-3.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[#9aa0a6]">People</div>
                          {people.map((p) => {
                            const isFriend = extraFriends.includes(p.name) || SEED_FRIENDS_NAMES.has(p.name);
                            return (
                              <div key={`p-${p.name}`} className="flex items-center gap-3 px-3.5 py-2 hover:bg-[#f5f7f8]">
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                  onClick={() => {
                                    openProfile(p.name);
                                    setSearchFocus(false);
                                  }}
                                >
                                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br ${p.color} text-[12px] font-extrabold text-white`}>
                                    {p.name.slice(0, 2).toUpperCase()}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-semibold">{p.display}</span>
                                    <span className="block text-[11px] text-[#9aa0a6]">
                                      @{p.name} · {p.status === "playing" ? "in a game" : p.status}
                                    </span>
                                  </span>
                                </button>
                                {!isFriend && (
                                  <button
                                    type="button"
                                    className="shrink-0 rounded-full bg-[#00b06f] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#009a61]"
                                    onClick={() => addFriend(p.name)}
                                  >
                                    Add
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="px-4 py-3 text-[12.5px] text-[#9aa0a6]">No results for “{search}”</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* robux */}
          <button
            type="button"
            onClick={() => setPage("robux")}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-bold text-[#111418] transition-colors hover:bg-[#f5f7f8]"
            title="Your Robux balance"
          >
            <Hexagon size={16} className="text-[#00b06f]" fill="#d9f4e9" />
            {formatCount(robux)}
          </button>

          {/* notifications */}
          <div className="relative shrink-0" ref={bellRef}>
            <button
              type="button"
              className="relative grid h-10 w-10 place-items-center rounded-full text-[#5c6166] transition-colors hover:bg-[#f5f7f8]"
              onClick={() => {
                setBellOpen((v) => !v);
                setProfileOpen(false);
              }}
              title="Notifications"
            >
              <Bell size={19} />
              {hasUnread && <span className="absolute right-1.5 top-1.5 h-[9px] w-[9px] rounded-full border-2 border-white bg-[#ff5d5d]" />}
            </button>
            {bellOpen && (
              <div className="absolute right-0 top-12 w-[320px] overflow-hidden rounded-xl border border-[#e3e6e8] bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-[#e3e6e8] px-4 py-2.5">
                  <span className="text-[13px] font-bold">Notifications</span>
                  <div className="flex items-center gap-2">
                    {liveNotices.length > 0 && (
                      <button
                        type="button"
                        className="text-[11.5px] font-semibold text-[#0f6dcf] hover:underline"
                        onClick={() => usePlatform.getState().clearNotices(session?.username ?? "")}
                      >
                        Clear Team Create
                      </button>
                    )}
                    <button type="button" className="text-[11.5px] font-semibold text-[#0f6dcf] hover:underline" onClick={markNotificationsRead}>
                      Mark all as read
                    </button>
                  </div>
                </div>
                {liveNotices.map((n) => (
                  <div key={`notice-${n.id}`} className="flex items-start gap-3 border-b border-[#f2f4f5] bg-[#fcfdfd] px-4 py-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${NOTICE_STYLE[n.kind] ?? NOTICE_STYLE.info}`}>
                      {n.kind === "granted" ? <Hammer size={15} /> : <Users size={15} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] leading-snug text-[#111418]">{n.text}</span>
                      <span className="mt-0.5 block text-[10.5px] text-[#9aa0a6]">{timeAgo(n.at)}</span>
                    </span>
                  </div>
                ))}
                {NOTIFICATIONS.map((n) => {
                  const NIcon = n.icon;
                  return (
                    <div key={n.id} className="flex items-start gap-3 border-b border-[#f2f4f5] px-4 py-3 last:border-0">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f5f7f8] text-[#5c6166]">
                        <NIcon size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12.5px] leading-snug text-[#111418]">{n.text}</span>
                        <span className="mt-0.5 block text-[10.5px] text-[#9aa0a6]">{n.time}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* profile */}
          <div className="relative shrink-0" ref={profileRef}>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#00b06f] to-[#008751] text-[15px] font-extrabold text-white shadow"
              onClick={() => {
                setProfileOpen((v) => !v);
                setBellOpen(false);
              }}
              title={session?.displayName ?? "Profile"}
            >
              {(session?.displayName ?? session?.username ?? "U").slice(0, 2).toUpperCase()}
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 w-[240px] overflow-hidden rounded-xl border border-[#e3e6e8] bg-white shadow-xl">
                <div className="border-b border-[#e3e6e8] px-4 py-3">
                  <div className="text-[14px] font-bold">{session?.displayName}</div>
                  <div className="text-[11.5px] text-[#9aa0a6]">@{session?.username}{session?.isAdmin ? " · admin" : ""}</div>
                </div>
                <button type="button" className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold text-[#5c6166] hover:bg-[#f5f7f8]" onClick={() => { setProfileOpen(false); openProfile(session?.username ?? ""); }}>
                  <User size={15} /> Profile & creations
                </button>
                <button type="button" className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold text-[#c0392b] hover:bg-[#fdf1f1]" onClick={logout}>
                  <LogOut size={15} /> Log Out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* content */}
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-6">
          {page === "home" && <HomePage onOpen={setOpenGame} />}
          {page === "charts" && <ChartsPage onOpen={setOpenGame} />}
          {page === "discover" && <DiscoverPage onOpen={setOpenGame} />}
          {page === "marketplace" && <MarketplacePage />}
          {page === "create" && <CreatePage />}
          {page === "friends" && <FriendsPage onOpen={setOpenGame} />}
          {page === "robux" && <RobuxPage />}
          {page === "admin" && <AdminPage />}
          {page === "profile" && <ProfilePage />}
        </main>

        <footer className="mt-auto border-t border-[#e3e6e8] bg-white px-6 py-4 pb-20 text-center text-[11px] text-[#9aa0a6] md:pb-4">
          Blockyard — a Roblox-style demo website + studio. Games, friends and catalog items are illustrative demo data.
        </footer>
      </div>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t border-[#e3e6e8] bg-white/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = page === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPage(item.id)}
              className={`flex min-h-[52px] min-w-[48px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 ${active ? "text-[#00b06f]" : "text-[#5c6166]"}`}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[9.5px] font-semibold">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* game detail modal */}
      {openGame && <GameDetail game={openGame} onClose={() => setOpenGame(null)} />}

      {/* floating friends chat */}
      <ChatWidget />
    </div>
  );
}
