"use client";

import { create } from "zustand";
import type { PlaceState } from "./types";
import {
  clearLegacyLocalCredentials,
  loadProfile,
  saveProfile,
  setCurrentAccount,
  setRobux,
  type Account,
} from "./auth";
import { getSupabaseBrowserClient, supabaseConfigured } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/* Website state: session, view routing, favorites, owned items.      */
/* ------------------------------------------------------------------ */

export type WebView = "login" | "web" | "studio" | "player";
export type WebPage = "home" | "charts" | "discover" | "marketplace" | "friends" | "robux" | "create" | "admin" | "profile";

export interface LaunchRequest {
  templateId: string;
  name: string;
  autoPlay: boolean;
  gameId?: string;
  /** Full place to load (shared / published place) instead of a fresh template. */
  placeData?: PlaceState | null;
  /** Team Create room to auto-join on launch (usually the published game id). */
  teamRoom?: string;
  /** My Team Create role in that room ("owner" | "editor" | "builder" | "viewer"). */
  teamRole?: "owner" | "editor" | "builder" | "viewer";
}

/** A game the player is joining (seed experience or user-published). */
export interface JoinRequest {
  gameId: string;
  name: string;
  templateId: string;
  placeData: PlaceState | null;
  price: number;
  creator: string;
  creatorDisplay?: string;
  iconEmoji?: string;
  gradient?: string;
  desc?: string;
}

interface WebStore {
  session: Account | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;

  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (email: string, username: string, password: string) => Promise<{ ok: boolean; error?: string; confirmationRequired?: boolean }>;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;

  view: WebView;
  setView: (v: WebView) => void;
  enterStudio: () => void;
  exitStudio: () => void;

  page: WebPage;
  setPage: (p: WebPage) => void;

  /** Whose profile the "profile" page is showing (null = your own). */
  profileView: string | null;
  openProfile: (username: string) => void;
  backFromProfile: () => void;

  /** Consumed by StudioApp when entering the editor (Play from a game card). */
  launchRequest: LaunchRequest | null;
  requestLaunch: (req: LaunchRequest) => void;
  consumeLaunch: () => LaunchRequest | null;

  /** Join a game in the full-screen player (like pressing Play on roblox.com). */
  joinRequest: JoinRequest | null;
  requestJoin: (req: JoinRequest) => void;
  consumeJoin: () => JoinRequest | null;
  leaveGame: () => void;

  /** Creator-Store assets saved to “My Assets” for the Studio toolbox. */
  savedAssets: string[];
  saveAsset: (assetId: string) => void;
  unsaveAsset: (assetId: string) => void;

  favorites: string[];
  toggleFavorite: (gameId: string) => void;

  owned: string[];
  buyItem: (itemId: string, price: number) => { ok: boolean; error?: string };

  recentlyPlayed: string[];
  pushRecentlyPlayed: (gameId: string) => void;

  extraFriends: string[];
  addFriend: (name: string) => void;
  removeFriend: (name: string) => void;

  notificationsRead: boolean;
  markNotificationsRead: () => void;

  search: string;
  setSearch: (q: string) => void;
}

function persist(
  session: Account | null,
  patch: Partial<{ favorites: string[]; owned: string[]; recentlyPlayed: string[]; friends: string[]; savedAssets: string[] }>,
  savedAssetsOverride?: string[],
) {
  if (!session) return;
  const p = loadProfile(session.username);
  const merged = { ...p, ...patch };
  if (savedAssetsOverride) merged.savedAssets = savedAssetsOverride;
  saveProfile(session.username, merged);
}

type CloudProfile = {
  id: string;
  username: string;
  display_name: string;
  robux: number;
  is_admin: boolean;
  banned: boolean;
  ban_reason: string | null;
  created_at: string;
};

function firstProfile(value: unknown): CloudProfile | null {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  const row = rows[0] as Partial<CloudProfile> | undefined;
  if (!row || typeof row.id !== "string" || typeof row.username !== "string") return null;
  return {
    id: row.id,
    username: row.username,
    display_name: typeof row.display_name === "string" ? row.display_name : row.username,
    robux: Number.isFinite(row.robux) ? Number(row.robux) : 0,
    is_admin: row.is_admin === true,
    banned: row.banned === true,
    ban_reason: typeof row.ban_reason === "string" ? row.ban_reason : null,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

async function readCloudAccount(): Promise<Account | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;
  const { data, error } = await supabase.rpc("get_my_profile");
  if (error) throw new Error(`Could not load your Blockyard profile: ${error.message}`);
  const profile = firstProfile(data);
  if (!profile) throw new Error("Your account profile has not been created. Re-run the Supabase database migrations.");
  return {
    id: profile.id,
    email: userData.user.email ?? "",
    username: profile.username,
    displayName: profile.display_name || profile.username,
    robux: profile.robux,
    isAdmin: profile.is_admin,
    createdAt: Date.parse(profile.created_at) || Date.now(),
    banned: profile.banned,
    banReason: profile.ban_reason ?? undefined,
  };
}

function applyAccount(set: (partial: Partial<WebStore>) => void, account: Account | null, view: WebView = "web") {
  setCurrentAccount(account);
  if (!account) {
    set({ session: null, hydrated: true, view: "login" });
    return;
  }
  const p = loadProfile(account.username);
  set({
    session: account,
    hydrated: true,
    view,
    page: "home",
    favorites: p.favorites,
    owned: p.owned,
    recentlyPlayed: p.recentlyPlayed,
    extraFriends: p.friends,
    savedAssets: p.savedAssets ?? [],
    notificationsRead: false,
  });
}

export const useWeb = create<WebStore>((set, get) => ({
  session: null,
  hydrated: false,
  hydrate: async () => {
    clearLegacyLocalCredentials();
    if (!supabaseConfigured()) {
      setCurrentAccount(null);
      set({ session: null, hydrated: true, view: "login" });
      return;
    }
    try {
      const account = await readCloudAccount();
      if (account?.banned) {
        await getSupabaseBrowserClient()?.auth.signOut();
        applyAccount(set, null);
        return;
      }
      applyAccount(set, account, account ? "web" : "login");
    } catch {
      setCurrentAccount(null);
      set({ session: null, hydrated: true, view: "login" });
    }
  },

  login: async (email, password) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { ok: false, error: "Cloud login is not configured. Add your Supabase URL and publishable key in Render Environment." };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: error.message };
    try {
      const account = await readCloudAccount();
      if (!account) return { ok: false, error: "Sign-in succeeded, but your Blockyard profile could not be loaded. Check that the database migrations ran." };
      if (account.banned) {
        await supabase.auth.signOut();
        return { ok: false, error: `Your account is suspended: ${account.banReason || "Contact a Blockyard administrator."}` };
      }
      applyAccount(set, account);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not load your account." };
    }
  },

  signup: async (email, username, password) => {
    const cleanUsername = username.trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 20) return { ok: false, error: "Username must be 3–20 characters." };
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) return { ok: false, error: "Use letters, numbers and underscores only." };
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return { ok: false, error: "Enter a valid email address." };
    if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { ok: false, error: "Cloud sign-up is not configured. Add your Supabase URL and publishable key in Render Environment." };

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { username: cleanUsername, display_name: cleanUsername },
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
      },
    });
    if (error) return { ok: false, error: error.message };
    if (!data.session) {
      return { ok: true, confirmationRequired: true };
    }
    try {
      const account = await readCloudAccount();
      if (!account) return { ok: false, error: "Your account was created, but its profile is not ready. Re-run the Supabase migrations." };
      applyAccount(set, account);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Your account was created but could not be loaded." };
    }
  },


  requestPasswordReset: async (email) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return { ok: false, error: "Enter the email address on your Blockyard account first." };
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { ok: false, error: "Cloud authentication is not configured." };
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback?next=/reset-password` : undefined,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  logout: () => {
    void getSupabaseBrowserClient()?.auth.signOut();
    setCurrentAccount(null);
    set({ session: null, view: "login", page: "home", favorites: [], owned: [], recentlyPlayed: [], extraFriends: [], savedAssets: [], launchRequest: null, joinRequest: null });
  },

  view: "login",
  setView: (v) => set({ view: v }),
  enterStudio: () => set({ view: "studio" }),
  exitStudio: () => set({ view: "web", page: "create" }),

  page: "home",
  setPage: (p) => set({ page: p }),

  profileView: null,
  openProfile: (username) => set({ profileView: username, page: "profile" }),
  backFromProfile: () => set({ page: "home", profileView: null }),

  launchRequest: null,
  requestLaunch: (req) => set({ launchRequest: req, view: "studio" }),
  consumeLaunch: () => {
    const req = get().launchRequest;
    set({ launchRequest: null });
    return req;
  },

  joinRequest: null,
  requestJoin: (req) => set({ joinRequest: req, view: "player" }),
  consumeJoin: () => {
    const req = get().joinRequest;
    set({ joinRequest: null });
    return req;
  },
  leaveGame: () => set({ joinRequest: null, view: "web", page: "home" }),

  savedAssets: [],
  saveAsset: (assetId) => {
    const { savedAssets, session } = get();
    if (savedAssets.includes(assetId)) return;
    const next = [...savedAssets, assetId];
    set({ savedAssets: next });
    persist(session, {} as never, next);
  },
  unsaveAsset: (assetId) => {
    const { savedAssets, session } = get();
    const next = savedAssets.filter((a) => a !== assetId);
    set({ savedAssets: next });
    persist(session, {} as never, next);
  },

  favorites: [],
  toggleFavorite: (gameId) => {
    const { favorites, session } = get();
    const next = favorites.includes(gameId) ? favorites.filter((f) => f !== gameId) : [...favorites, gameId];
    set({ favorites: next });
    persist(session, { favorites: next });
  },

  owned: [],
  buyItem: (itemId, price) => {
    const { owned, session } = get();
    if (owned.includes(itemId)) return { ok: false, error: "You already own this item." };
    if (!session) return { ok: false, error: "Not signed in." };
    if (session.robux < price) return { ok: false, error: "Not enough Robux." };
    setRobux(session.username, session.robux - price);
    const nextOwned = [...owned, itemId];
    set({ session: { ...session, robux: session.robux - price }, owned: nextOwned });
    persist(session, { owned: nextOwned });
    return { ok: true };
  },

  recentlyPlayed: [],
  pushRecentlyPlayed: (gameId) => {
    const { recentlyPlayed, session } = get();
    const next = [gameId, ...recentlyPlayed.filter((g) => g !== gameId)].slice(0, 8);
    set({ recentlyPlayed: next });
    persist(session, { recentlyPlayed: next });
  },

  extraFriends: [],
  addFriend: (name) => {
    const { extraFriends, session } = get();
    const clean = name.trim().slice(0, 24);
    if (!clean || extraFriends.includes(clean)) return;
    const next = [...extraFriends, clean];
    set({ extraFriends: next });
    persist(session, { friends: next });
  },
  removeFriend: (name) => {
    const { extraFriends, session } = get();
    const next = extraFriends.filter((f) => f !== name);
    set({ extraFriends: next });
    persist(session, { friends: next });
  },

  notificationsRead: false,
  markNotificationsRead: () => set({ notificationsRead: true }),

  search: "",
  setSearch: (q) => set({ search: q }),
}));
