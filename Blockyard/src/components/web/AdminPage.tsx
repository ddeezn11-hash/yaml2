"use client";

import { useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Coins,
  Crown,
  FileText,
  Flag,
  Gamepad2,
  Package,
  RotateCcw,
  Shield,
  ShieldAlert,
  Trash2,
  Users as UsersIcon,
} from "lucide-react";
import { useWeb } from "@/lib/studio/webstore";
import {
  platformSnapshot,
  timeAgo,
  usePlatform,
} from "@/lib/studio/platform";
import {
  adminSetRobux,
  setAccountAdmin,
  setAccountBanned,
  type Account,
} from "@/lib/studio/auth";
import { formatCount } from "@/lib/studio/webdata";

/* ------------------------------------------------------------------ */
/* Moderation panel — admin accounts only. Users, games, assets,     */
/* chat logs, the word filter and a full audit log.                   */
/* ------------------------------------------------------------------ */

type Tab = "users" | "games" | "assets" | "chat" | "filter" | "audit";

const TABS: { id: Tab; label: string; icon: typeof UsersIcon }[] = [
  { id: "users", label: "Users", icon: UsersIcon },
  { id: "games", label: "Games", icon: Gamepad2 },
  { id: "assets", label: "Creator Store", icon: Package },
  { id: "chat", label: "Chat logs", icon: FileText },
  { id: "filter", label: "Word filter", icon: ShieldAlert },
  { id: "audit", label: "Audit log", icon: Flag },
];

export function AdminPage() {
  const session = useWeb((s) => s.session);
  const version = usePlatform((s) => s.version);
  const [tab, setTab] = useState<Tab>("users");

  const snap = useMemo(() => platformSnapshot(), [version]);
  // Account administration is intentionally not sourced from browser storage.
  // A protected server-side moderation API is required before this tab can list
  // or mutate other cloud users.
  const accounts = useMemo<Account[]>(() => [], [version]);

  if (!session?.isAdmin) {
    return (
      <div className="grid place-items-center rounded-2xl bg-white p-12 text-center shadow-sm">
        <ShieldAlert size={40} className="mb-3 text-[#b9bfc4]" />
        <div className="text-[15px] font-bold text-[#111418]">Moderation is admin-only</div>
        <div className="mt-1 max-w-[380px] text-[12.5px] text-[#9aa0a6]">
          Sign in with an admin account to manage users, published games, the Creator Store and chat logs.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* header */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-gradient-to-r from-[#111418] to-[#2d3436] p-5 text-white shadow-md">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#c0392b]/90">
          <Shield size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-extrabold">Moderation</div>
          <div className="text-[12px] text-white/70">
            {accounts.length} accounts · {snap.games.length} games · {snap.assets.length} assets · {snap.chatLogs.length + snap.inGameChat.length} logged messages
          </div>
        </div>
        <div className="flex gap-2 text-center">
          <div className="rounded-lg bg-white/10 px-3 py-1.5">
            <div className="text-[15px] font-extrabold text-[#ff9b9b]">{accounts.filter((a) => a.banned).length}</div>
            <div className="text-[9.5px] text-white/70">banned</div>
          </div>
          <div className="rounded-lg bg-white/10 px-3 py-1.5">
            <div className="text-[15px] font-extrabold text-[#ffd77a]">
              {snap.chatLogs.filter((c) => c.flagged).length + snap.inGameChat.filter((c) => c.flagged).length}
            </div>
            <div className="text-[9.5px] text-white/70">flagged</div>
          </div>
          <div className="rounded-lg bg-white/10 px-3 py-1.5">
            <div className="text-[15px] font-extrabold text-[#8fd3ab]">{snap.modActions.length}</div>
            <div className="text-[9.5px] text-white/70">actions</div>
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${
                tab === t.id ? "bg-[#111418] text-white" : "bg-white text-[#3f4347] shadow-sm hover:bg-[#eceff1]"
              }`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "users" && <UsersTab accounts={accounts} me={session.username} />}
      {tab === "games" && <GamesTab />}
      {tab === "assets" && <AssetsTab />}
      {tab === "chat" && <ChatTab />}
      {tab === "filter" && <FilterTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

/* -------------------------------- users -------------------------------- */

function UsersTab({ accounts, me }: { accounts: Account[]; me: string }) {
  const [banFor, setBanFor] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [robuxFor, setRobuxFor] = useState<string | null>(null);
  const [robuxValue, setRobuxValue] = useState("");
  const version = usePlatform((s) => s.version);
  void version;

  const mod = usePlatform.getState().logModAction;

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-[#f3d59a] bg-[#fff9e9] p-5 text-[12px] leading-relaxed text-[#806016]">
        Your administrator role is verified by Supabase, but cloud user moderation is not enabled in this build. Blockyard deliberately no longer reads or changes account roles from browser storage. Use the Supabase dashboard for account administration until a server-side moderation API is added.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="grid grid-cols-[1fr_90px_80px_120px_260px] items-center gap-2 border-b border-[#eceff1] bg-[#f8f9fa] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-[#9aa0a6]">
        <span>Account</span>
        <span className="text-right">Robux</span>
        <span className="text-center">Role</span>
        <span className="text-center">Status</span>
        <span className="text-right">Moderation</span>
      </div>
      {accounts.map((a) => (
        <div key={a.username} className="border-b border-[#f2f4f5] last:border-0">
          <div className="grid grid-cols-[1fr_90px_80px_120px_260px] items-center gap-2 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-bold text-[#111418]">{a.displayName}</span>
                {a.isAdmin && <Crown size={12} className="shrink-0 text-[#e6a820]" />}
                {a.username === me && <span className="shrink-0 rounded bg-[#edfaf4] px-1.5 text-[9px] font-bold text-[#008751]">you</span>}
              </div>
              <div className="text-[11px] text-[#9aa0a6]">@{a.username} · joined {timeAgo(a.createdAt)}</div>
            </div>
            <span className="text-right text-[13px] font-bold text-[#111418]">{formatCount(a.robux)}</span>
            <span className="text-center">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${a.isAdmin ? "bg-[#fff4dd] text-[#b7950b]" : "bg-[#f2f4f5] text-[#9aa0a6]"}`}>
                {a.isAdmin ? "admin" : "player"}
              </span>
            </span>
            <span className="text-center">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${a.banned ? "bg-[#fdecec] text-[#c0392b]" : "bg-[#edfaf4] text-[#008751]"}`}>
                {a.banned ? "banned" : "active"}
              </span>
            </span>
            <div className="flex flex-wrap justify-end gap-1.5">
              {a.username !== me && (
                <>
                  <button
                    type="button"
                    className="rounded-lg border border-[#d6d9db] bg-white px-2 py-1 text-[10.5px] font-semibold text-[#5c6166] hover:bg-[#f5f7f8]"
                    onClick={() => {
                      setRobuxFor(robuxFor === a.username ? null : a.username);
                      setRobuxValue(String(a.robux));
                    }}
                  >
                    <Coins size={11} className="mr-0.5 inline" /> Robux
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[#d6d9db] bg-white px-2 py-1 text-[10.5px] font-semibold text-[#5c6166] hover:bg-[#f5f7f8]"
                    onClick={() => {
                      setAccountAdmin(a.username, !a.isAdmin);
                      mod(me, a.isAdmin ? "revoke-admin" : "grant-admin", a.username);
                      usePlatform.setState({ version: usePlatform.getState().version + 1 });
                    }}
                  >
                    {a.isAdmin ? "Demote" : "Promote"}
                  </button>
                  {a.banned ? (
                    <button
                      type="button"
                      className="rounded-lg border border-[#b7e8d2] bg-[#edfaf4] px-2 py-1 text-[10.5px] font-semibold text-[#008751] hover:bg-[#ddf5e9]"
                      onClick={() => {
                        setAccountBanned(a.username, false);
                        mod(me, "unban", a.username);
                        usePlatform.setState({ version: usePlatform.getState().version + 1 });
                      }}
                    >
                      <RotateCcw size={11} className="mr-0.5 inline" /> Unban
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-lg border border-[#f3c2c2] bg-[#fdf1f1] px-2 py-1 text-[10.5px] font-semibold text-[#c0392b] hover:bg-[#fbe3e3]"
                      onClick={() => {
                        setBanFor(banFor === a.username ? null : a.username);
                        setBanReason("");
                      }}
                    >
                      <Ban size={11} className="mr-0.5 inline" /> Ban
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ban reason row */}
          {banFor === a.username && (
            <div className="flex items-center gap-2 bg-[#fdf6f6] px-4 py-2.5">
              <input
                className="h-8 min-w-0 flex-1 rounded-lg border border-[#f3c2c2] bg-white px-3 text-[12px] outline-none focus:border-[#c0392b]"
                placeholder="Ban reason (shown at login)…"
                value={banReason}
                maxLength={120}
                onChange={(e) => setBanReason(e.target.value)}
              />
              <button
                type="button"
                className="h-8 rounded-lg bg-[#c0392b] px-3 text-[11.5px] font-bold text-white hover:bg-[#a93226]"
                onClick={() => {
                  setAccountBanned(a.username, true, banReason.trim() || "Violation of the community rules");
                  mod(me, "ban", `${a.username} — ${banReason.trim() || "rule violation"}`);
                  setBanFor(null);
                  usePlatform.setState({ version: usePlatform.getState().version + 1 });
                }}
              >
                Confirm ban
              </button>
            </div>
          )}

          {/* robux row */}
          {robuxFor === a.username && (
            <div className="flex items-center gap-2 bg-[#f6fbf8] px-4 py-2.5">
              <input
                type="number"
                className="h-8 w-32 rounded-lg border border-[#b7e8d2] bg-white px-3 text-[12px] outline-none focus:border-[#008751]"
                value={robuxValue}
                onChange={(e) => setRobuxValue(e.target.value)}
              />
              <button
                type="button"
                className="h-8 rounded-lg bg-[#00b06f] px-3 text-[11.5px] font-bold text-white hover:bg-[#009a61]"
                onClick={() => {
                  const n = Math.max(0, Math.round(Number(robuxValue) || 0));
                  adminSetRobux(a.username, n);
                  mod(me, "set-robux", `${a.username} → ${formatCount(n)} R$`);
                  setRobuxFor(null);
                  usePlatform.setState({ version: usePlatform.getState().version + 1 });
                }}
              >
                Set balance
              </button>
              <span className="text-[10.5px] text-[#9aa0a6]">current: {formatCount(a.robux)} R$</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- games -------------------------------- */

function GamesTab() {
  const version = usePlatform((s) => s.version);
  void version;
  const snap = useMemo(() => platformSnapshot(), [version]);
  const mod = usePlatform.getState().logModAction;
  const me = useWeb((s) => s.session?.username ?? "");

  if (!snap.games.length) {
    return <div className="rounded-xl bg-white p-10 text-center text-[12.5px] text-[#9aa0a6] shadow-sm">No published games yet — publish one from Studio!</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      {snap.games.map((g) => (
        <div key={g.id} className={`flex flex-wrap items-center gap-3 border-b border-[#f2f4f5] px-4 py-3 last:border-0 ${g.removed ? "opacity-50" : ""}`}>
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${g.gradient} text-[20px]`}>{g.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-bold text-[#111418]">{g.name}</span>
              {g.featured && <span className="shrink-0 rounded bg-[#fff4dd] px-1.5 text-[9px] font-bold text-[#b7950b]">featured</span>}
              {g.removed && <span className="shrink-0 rounded bg-[#fdecec] px-1.5 text-[9px] font-bold text-[#c0392b]">removed</span>}
            </div>
            <div className="text-[11px] text-[#9aa0a6]">
              by @{g.creator} · {g.price > 0 ? `${g.price} R$ paid access` : "free"} · {g.visits} visits · updated {timeAgo(g.updatedAt)}
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              className={`rounded-lg border px-2.5 py-1 text-[10.5px] font-semibold ${
                g.featured ? "border-[#d6d9db] bg-white text-[#5c6166] hover:bg-[#f5f7f8]" : "border-[#ffe9b3] bg-[#fffbec] text-[#b7950b] hover:bg-[#fff4dd]"
              }`}
              onClick={() => {
                usePlatform.getState().featureGame(g.id, !g.featured);
                mod(me, g.featured ? "unfeature" : "feature", g.name);
              }}
            >
              {g.featured ? "Unfeature" : "Feature"}
            </button>
            {g.removed ? (
              <button
                type="button"
                className="rounded-lg border border-[#b7e8d2] bg-[#edfaf4] px-2.5 py-1 text-[10.5px] font-semibold text-[#008751] hover:bg-[#ddf5e9]"
                onClick={() => {
                  usePlatform.getState().restoreGame(g.id);
                  mod(me, "restore-game", g.name);
                }}
              >
                <RotateCcw size={11} className="mr-0.5 inline" /> Restore
              </button>
            ) : (
              <button
                type="button"
                className="rounded-lg border border-[#f3c2c2] bg-[#fdf1f1] px-2.5 py-1 text-[10.5px] font-semibold text-[#c0392b] hover:bg-[#fbe3e3]"
                onClick={() => {
                  usePlatform.getState().removeGame(g.id);
                  mod(me, "remove-game", g.name);
                }}
              >
                <Trash2 size={11} className="mr-0.5 inline" /> Remove
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- assets ------------------------------- */

function AssetsTab() {
  const version = usePlatform((s) => s.version);
  void version;
  const snap = useMemo(() => platformSnapshot(), [version]);
  const mod = usePlatform.getState().logModAction;
  const me = useWeb((s) => s.session?.username ?? "");

  if (!snap.assets.length) {
    return <div className="rounded-xl bg-white p-10 text-center text-[12.5px] text-[#9aa0a6] shadow-sm">No Creator Store assets yet — publish models, maps or animations from Studio.</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      {snap.assets.map((a) => (
        <div key={a.id} className={`flex flex-wrap items-center gap-3 border-b border-[#f2f4f5] px-4 py-3 last:border-0 ${a.removed ? "opacity-50" : ""}`}>
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${a.gradient} text-[20px]`}>{a.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-bold text-[#111418]">{a.name}</span>
              <span className="shrink-0 rounded bg-[#f2f4f5] px-1.5 text-[9px] font-bold uppercase text-[#9aa0a6]">{a.kind}</span>
            </div>
            <div className="text-[11px] text-[#9aa0a6]">by @{a.creator} · {timeAgo(a.createdAt)}</div>
          </div>
          <div className="flex gap-1.5">
            {a.removed ? (
              <button
                type="button"
                className="rounded-lg border border-[#b7e8d2] bg-[#edfaf4] px-2.5 py-1 text-[10.5px] font-semibold text-[#008751] hover:bg-[#ddf5e9]"
                onClick={() => {
                  usePlatform.getState().restoreAsset(a.id);
                  mod(me, "restore-asset", a.name);
                }}
              >
                <RotateCcw size={11} className="mr-0.5 inline" /> Restore
              </button>
            ) : (
              <button
                type="button"
                className="rounded-lg border border-[#f3c2c2] bg-[#fdf1f1] px-2.5 py-1 text-[10.5px] font-semibold text-[#c0392b] hover:bg-[#fbe3e3]"
                onClick={() => {
                  usePlatform.getState().removeAsset(a.id);
                  mod(me, "remove-asset", a.name);
                }}
              >
                <Trash2 size={11} className="mr-0.5 inline" /> Remove
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- chat -------------------------------- */

function ChatTab() {
  const version = usePlatform((s) => s.version);
  void version;
  const snap = useMemo(() => platformSnapshot(), [version]);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const mod = usePlatform.getState().logModAction;
  const me = useWeb((s) => s.session?.username ?? "");

  const webLogs = snap.chatLogs.filter((c) => !onlyFlagged || c.flagged).slice(-60).reverse();
  const gameLogs = snap.inGameChat.filter((c) => !onlyFlagged || c.flagged).slice(-60).reverse();

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#5c6166]">
        <input type="checkbox" className="h-4 w-4 accent-[#c0392b]" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
        Show only messages flagged by the word filter
      </label>

      <div>
        <div className="mb-2 text-[13px] font-bold uppercase tracking-wide text-[#9aa0a6]">Website direct messages</div>
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          {webLogs.length === 0 && <div className="p-6 text-center text-[12px] text-[#9aa0a6]">No web messages logged yet.</div>}
          {webLogs.map((c) => (
            <div key={c.id} className={`flex items-center gap-3 border-b border-[#f2f4f5] px-4 py-2.5 last:border-0 ${c.removed ? "opacity-40" : ""}`}>
              <span className="w-[130px] shrink-0 truncate text-[12px] font-bold text-[#111418]">@{c.user} → @{c.friend}</span>
              <span className={`min-w-0 flex-1 text-[12px] ${c.removed ? "line-through text-[#b0b6bd]" : "text-[#3f4347]"}`}>{c.text}</span>
              {c.flagged && <span className="shrink-0 rounded bg-[#fdecec] px-1.5 py-0.5 text-[9px] font-bold text-[#c0392b]">flagged</span>}
              <span className="w-[64px] shrink-0 text-right text-[10px] text-[#9aa0a6]">{timeAgo(c.at)}</span>
              {!c.removed && (
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-[#f3c2c2] bg-[#fdf1f1] px-2 py-1 text-[10px] font-semibold text-[#c0392b] hover:bg-[#fbe3e3]"
                  onClick={() => {
                    usePlatform.getState().removeChatLog(c.id);
                    mod(me, "remove-message", `web: @${c.user} → @${c.friend}`);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[13px] font-bold uppercase tracking-wide text-[#9aa0a6]">In-game chat</div>
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          {gameLogs.length === 0 && <div className="p-6 text-center text-[12px] text-[#9aa0a6]">No in-game messages logged yet — join a game and chat!</div>}
          {gameLogs.map((c) => (
            <div key={c.id} className={`flex items-center gap-3 border-b border-[#f2f4f5] px-4 py-2.5 last:border-0 ${c.removed ? "opacity-40" : ""}`}>
              <span className="w-[130px] shrink-0 truncate text-[12px] font-bold text-[#111418]">@{c.user} in {c.game}</span>
              <span className={`min-w-0 flex-1 text-[12px] ${c.removed ? "line-through text-[#b0b6bd]" : "text-[#3f4347]"}`}>{c.text}</span>
              {c.flagged && <span className="shrink-0 rounded bg-[#fdecec] px-1.5 py-0.5 text-[9px] font-bold text-[#c0392b]">flagged</span>}
              <span className="w-[64px] shrink-0 text-right text-[10px] text-[#9aa0a6]">{timeAgo(c.at)}</span>
              {!c.removed && (
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-[#f3c2c2] bg-[#fdf1f1] px-2 py-1 text-[10px] font-semibold text-[#c0392b] hover:bg-[#fbe3e3]"
                  onClick={() => {
                    usePlatform.getState().removeInGameMessage(c.id);
                    mod(me, "remove-message", `game: @${c.user}`);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- filter ------------------------------- */

function FilterTab() {
  const version = usePlatform((s) => s.version);
  void version;
  const snap = useMemo(() => platformSnapshot(), [version]);
  const [word, setWord] = useState("");
  const mod = usePlatform.getState().logModAction;
  const me = useWeb((s) => s.session?.username ?? "");

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="mb-1 text-[14px] font-bold text-[#111418]">Blocked words</div>
      <div className="mb-4 text-[12px] text-[#9aa0a6]">
        Messages containing these words are censored with ### in web chat and in-game chat, and the sender is flagged for review.
      </div>
      <div className="mb-4 flex gap-2">
        <input
          className="h-10 min-w-0 flex-1 rounded-full border border-[#d6d9db] bg-[#f5f7f8] px-4 text-[13px] outline-none focus:border-[#c0392b] focus:bg-white"
          placeholder="Add a word to block…"
          value={word}
          maxLength={30}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && word.trim()) {
              usePlatform.getState().addBlockedWord(word.trim());
              mod(me, "add-word", word.trim());
              setWord("");
            }
          }}
        />
        <button
          type="button"
          className="h-10 shrink-0 rounded-full bg-[#111418] px-5 text-[12.5px] font-bold text-white hover:bg-[#2d3436]"
          onClick={() => {
            if (!word.trim()) return;
            usePlatform.getState().addBlockedWord(word.trim());
            mod(me, "add-word", word.trim());
            setWord("");
          }}
        >
          Block word
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {snap.blockedWords.map((w) => (
          <span key={w} className="flex items-center gap-1.5 rounded-full border border-[#f3c2c2] bg-[#fdf1f1] px-3 py-1 text-[12px] font-semibold text-[#c0392b]">
            {w}
            <button
              type="button"
              className="text-[#c0392b]/60 hover:text-[#c0392b]"
              onClick={() => {
                usePlatform.getState().removeBlockedWord(w);
                mod(me, "remove-word", w);
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- audit ------------------------------- */

function AuditTab() {
  const version = usePlatform((s) => s.version);
  void version;
  const snap = useMemo(() => platformSnapshot(), [version]);
  const actions = [...snap.modActions].reverse();

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      {actions.length === 0 && (
        <div className="p-10 text-center text-[12.5px] text-[#9aa0a6]">No moderation actions yet — they all get recorded here.</div>
      )}
      {actions.map((a) => (
        <div key={a.id} className="flex items-center gap-3 border-b border-[#f2f4f5] px-4 py-2.5 last:border-0">
          <CheckCircle2 size={14} className="shrink-0 text-[#00b06f]" />
          <span className="w-[110px] shrink-0 truncate text-[12px] font-bold text-[#111418]">@{a.admin}</span>
          <span className="w-[120px] shrink-0 truncate rounded bg-[#f2f4f5] px-2 py-0.5 text-center text-[10px] font-bold uppercase text-[#5c6166]">{a.action}</span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-[#3f4347]">{a.detail}</span>
          <span className="shrink-0 text-[10px] text-[#9aa0a6]">{timeAgo(a.at)}</span>
        </div>
      ))}
    </div>
  );
}
