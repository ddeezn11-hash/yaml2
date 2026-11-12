"use client";

/**
 * Authentication is owned by Supabase Auth. This module only keeps a small
 * in-memory account cache for existing UI helpers and stores non-sensitive
 * preferences locally. Passwords and authentication sessions are never
 * written to application localStorage.
 */
export interface Account {
  id: string;
  email: string;
  username: string;
  displayName: string;
  robux: number;
  isAdmin: boolean;
  createdAt: number;
  banned?: boolean;
  banReason?: string;
}

const LEGACY_ACCOUNTS_KEY = "blockyard-accounts-v1";
const LEGACY_SESSION_KEY = "blockyard-session-v1";
const PROFILE_PREFIX = "blockyard-profile-";

const accountCache = new Map<string, Account>();
let currentAccount: Account | null = null;

export function setCurrentAccount(account: Account | null): void {
  currentAccount = account;
  if (account) accountCache.set(account.username.toLowerCase(), account);
}

export function clearLegacyLocalCredentials(): void {
  if (typeof window === "undefined") return;
  // Old prototype stored plaintext passwords and a forgeable username session.
  // Delete those values instead of attempting to migrate them as credentials.
  localStorage.removeItem(LEGACY_ACCOUNTS_KEY);
  localStorage.removeItem(LEGACY_SESSION_KEY);
}

/** Compatibility helper for older profile/platform UI. Only cached public
 * profile data is returned; it is never used to authenticate anyone. */
export function getAccount(username: string): Account | undefined {
  const cached = accountCache.get(username.toLowerCase());
  if (cached) return cached;
  if (currentAccount?.username.toLowerCase() === username.toLowerCase()) return currentAccount;
  return undefined;
}

/** Account directory/moderation now requires a server-authorized admin API. */
export function listAccounts(): Account[] {
  return currentAccount ? [currentAccount] : [];
}

/** Local preference storage only (favorites, recently played, friend shortcuts). */
export interface WebProfile {
  favorites: string[];
  owned: string[];
  recentlyPlayed: string[];
  friends: string[];
  savedAssets?: string[];
}

const EMPTY_PROFILE: WebProfile = { favorites: [], owned: [], recentlyPlayed: [], friends: [] };

export function loadProfile(username: string): WebProfile {
  if (typeof window === "undefined") return { ...EMPTY_PROFILE };
  try {
    const raw = localStorage.getItem(`${PROFILE_PREFIX}${username}`);
    if (!raw) return { ...EMPTY_PROFILE };
    const p = JSON.parse(raw) as Partial<WebProfile>;
    return {
      favorites: Array.isArray(p.favorites) ? p.favorites : [],
      owned: Array.isArray(p.owned) ? p.owned : [],
      recentlyPlayed: Array.isArray(p.recentlyPlayed) ? p.recentlyPlayed : [],
      friends: Array.isArray(p.friends) ? p.friends : [],
      savedAssets: Array.isArray(p.savedAssets) ? p.savedAssets : [],
    };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

export function saveProfile(username: string, profile: WebProfile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${PROFILE_PREFIX}${username}`, JSON.stringify(profile));
}

// These legacy mutation helpers intentionally do not grant privileges or
// persist balances. Real moderation/economy mutations must use admin-checked
// server routes and database transactions, not browser storage.
export function setAccountBanned(_username: string, _banned: boolean, _reason?: string): void {}
export function setAccountAdmin(_username: string, _admin: boolean): void {}
export function adminSetRobux(_username: string, _robux: number): void {}
export function deleteAccount(_username: string): void {}

/** Keep local demo balances consistent only for the active tab. This is not
 * a cloud wallet and must not be treated as valuable or authoritative. */
export function setRobux(username: string, robux: number): void {
  const acct = getAccount(username);
  if (!acct) return;
  const updated = { ...acct, robux: Math.max(0, Math.round(robux)) };
  setCurrentAccount(updated);
}
