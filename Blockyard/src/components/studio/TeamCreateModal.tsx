"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Check,
  CircleUserRound,
  Code2,
  Eye,
  Hammer,
  Lock,
  MessageSquare,
  Radio,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { NetClient } from "@/lib/studio/net";
import { friendAppearance, type WebFriend } from "@/lib/studio/webdata";
import { friendsOf, platformSnapshot, timeAgo, usePlatform } from "@/lib/studio/platform";
import { ROLE_DESC, ROLE_LABEL, ROLE_PERMS, type CollabRole } from "@/lib/studio/types";
import { useStudio } from "@/lib/studio/store";
import { useWeb } from "@/lib/studio/webstore";
import { useStudioCtx } from "./context";

type Tab = "sharing" | "permissions" | "live";

/** Same name→color hash the sync server uses, for the activity dot. */
const ACT_PALETTE = [0xd85a48, 0x1769c2, 0x2b9b45, 0x8e42c8, 0xc2792b, 0x2b8f9c, 0xc42b71, 0x4a5a2b];
function colorFor(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACT_PALETTE[h % ACT_PALETTE.length];
}

export function TeamCreateModal() {
  const open = useStudio((s) => s.teamCreateOpen);
  if (!open) return null;
  return <Body />;
}

function Body() {
  const setOpen = useStudio((s) => s.setTeamCreateOpen);
  const [tab, setTab] = useState<Tab>("sharing");
  const session = useWeb((s) => s.session);
  const platformVersion = usePlatform((s) => s.version);
  const setTeamChatOpen = useStudio((s) => s.setTeamChatOpen);

  const myGames = useMemo(() => {
    void platformVersion;
    if (!session) return [];
    return platformSnapshot().games.filter((g) => g.creator === session.username && !g.removed);
  }, [platformVersion, session]);

  const [gameId, setGameId] = useState<string | null>(null);
  const selected = myGames.find((g) => g.id === gameId) ?? myGames[0] ?? null;

  return (
    <div className="fixed inset-0 z-[1060] grid place-items-center bg-black/55 p-4">
      <div className="flex h-[560px] max-h-[92vh] w-full max-w-[860px] flex-col overflow-hidden rounded-lg border border-[#3a3d42] bg-[#1b1d20] shadow-2xl">
        {/* header */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[#34373c] bg-[#17181b] px-4 py-2.5">
          <Users size={16} className="text-[#75dda4]" />
          <span className="text-[13px] font-semibold">Team Create</span>
          <span className="rounded border border-[#2a4a34] bg-[#16211a] px-1.5 py-0.5 text-[9px] leading-tight text-[#8ce6a5]">
            build together
          </span>
          <div className="flex-1" />
          <div className="flex overflow-hidden rounded-md border border-[#34373c]">
            {(["sharing", "permissions", "live"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`h-7 px-3 text-[11px] font-semibold ${tab === t ? "bg-[#2e3136] text-[#e8ebee]" : "text-[#9aa0a8] hover:bg-[#22252a]"}`}
              >
                {t === "sharing" ? "Sharing & requests" : t === "permissions" ? "Permissions" : "Live session"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="studio-btn h-7 w-7"
            onClick={() => {
              setOpen(false);
              setTeamChatOpen(true);
            }}
            title="Open the team chat"
          >
            <MessageSquare size={13} />
          </button>
          <button type="button" className="studio-btn h-7 w-7" onClick={() => setOpen(false)} title="Close">
            <X size={14} />
          </button>
        </div>

        {/* body */}
        {tab === "sharing" ? (
          <SharingTab games={myGames} selected={selected} onSelect={setGameId} />
        ) : tab === "permissions" ? (
          <PermissionsTab games={myGames} selected={selected} onSelect={setGameId} />
        ) : (
          <LiveTab games={myGames} selected={selected} onSelect={setGameId} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------ sharing tab ------------------------------- */

function SharingTab({
  games,
  selected,
  onSelect,
}: {
  games: ReturnType<typeof platformSnapshot>["games"];
  selected: (typeof games)[number] | null;
  onSelect: (id: string) => void;
}) {
  const session = useWeb((s) => s.session);
  const platformVersion = usePlatform((s) => s.version);
  const setShareAllFriends = usePlatform((s) => s.setShareAllFriends);
  const removeEditor = usePlatform((s) => s.removeEditor);
  const respondJoin = usePlatform((s) => s.respondJoin);
  const [msg, setMsg] = useState<string | null>(null);

  void platformVersion;

  const collab = selected ? usePlatform.getState().getCollab(selected.id) : null;
  const friends: (WebFriend & { name: string })[] = useMemo(() => {
    if (!session) return [];
    return friendsOf(session.username).map((n) => friendAppearance(n));
  }, [session]);

  if (!session) {
    return <div className="flex flex-1 items-center justify-center text-[12px] text-[#9aa0a8]">Sign in from the website first.</div>;
  }

  if (!games.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Hammer size={38} className="text-[#4a4f57]" />
        <div className="text-[13px] font-semibold text-[#c8ccd2]">Publish a game first</div>
        <div className="max-w-[380px] text-[11.5px] leading-relaxed text-[#9aa0a8]">
          Team Create sharing is attached to published games. Press <span className="text-[#c8ccd2]">Publish</span> in the top bar, then
          come back to choose which friends can edit it with you.
        </div>
      </div>
    );
  }

  const isEditor = (name: string) => collab?.editors.some((e) => e.toLowerCase() === name.toLowerCase()) ?? false;
  /** effective granular role of one friend (legacy lists count as "editor") */
  const roleOf = (name: string): CollabRole | null => {
    const r = selected ? usePlatform.getState().getCollabRole(selected.id, name) : null;
    if (r === "owner" || r === null) return null;
    if (collab?.roles && Object.entries(collab.roles).some(([k]) => k.toLowerCase() === name.toLowerCase())) return r;
    if (isEditor(name) || collab?.allFriends) return "editor";
    return null;
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* game list */}
      <div className="studio-scroll w-[240px] shrink-0 overflow-y-auto border-r border-[#34373c] py-2">
        <div className="px-3 pb-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-[#7a7f88]">Your published games</div>
        {games.map((g) => {
          const c = usePlatform.getState().getCollab(g.id);
          const active = selected?.id === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelect(g.id)}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${active ? "bg-[#233041]" : "hover:bg-[#22252a]"}`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${g.gradient} text-[18px]`}>{g.icon}</span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[11.5px] font-semibold ${active ? "text-[#8ec5ff]" : "text-[#c8ccd2]"}`}>{g.name}</span>
                <span className="block text-[9px] text-[#7a7f88]">
                  {c?.allFriends ? "all friends" : c?.editors.length ? `${c.editors.length} editor${c.editors.length === 1 ? "" : "s"}` : "private"}
                  {c?.requests.length ? ` · ${c.requests.length} request${c.requests.length === 1 ? "" : "s"}` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* settings */}
      <div className="studio-scroll min-w-0 flex-1 overflow-y-auto p-4">
        {!selected || !collab ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Lock size={30} className="text-[#4a4f57]" />
            <div className="text-[12.5px] font-semibold text-[#c8ccd2]">“{selected?.name ?? "Game"}” is private</div>
            <div className="max-w-[340px] text-[11px] leading-relaxed text-[#9aa0a8]">
              Turn on sharing below — friends who view your profile will see an <span className="text-[#c8ccd2]">Edit</span> button on this
              game and can request to join.
            </div>
            {selected && (
              <button
                type="button"
                onClick={() => setShareAllFriends(selected.id, session.username, true)}
                className="studio-btn mt-1 h-8 gap-1.5 px-4 text-[11.5px] font-semibold text-[#0e241a] bg-[#75dda4] hover:bg-[#8ce6a5]"
              >
                <UserPlus size={13} /> Share with all my friends
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* master toggle */}
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#34373c] bg-[#1e2023] p-3">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#2f9e77]"
                checked={collab.allFriends}
                onChange={(e) => setShareAllFriends(selected.id, session.username, e.target.checked)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-[#e8ebee]">Share edit access with all my friends</span>
                <span className="block text-[10.5px] leading-relaxed text-[#9aa0a8]">
                  Everyone on your friends list can open “{selected.name}” in Studio from your profile.
                </span>
              </span>
              <Users size={18} className="shrink-0 text-[#75dda4]" />
            </label>

            {/* pending requests */}
            {collab.requests.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#e8c76a]">
                  <UserPlus size={12} /> Join requests ({collab.requests.length})
                </div>
                <div className="flex flex-col gap-1.5">
                  {collab.requests.map((r) => (
                    <div key={r.id} className="flex items-center gap-2.5 rounded-lg border border-[#4a4218] bg-[#2b271b] px-3 py-2">
                      <CircleUserRound size={22} className="shrink-0 text-[#e8c76a]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11.5px] font-semibold text-[#e8ebee]">
                          {r.user} <span className="ml-1 font-normal text-[9px] text-[#9aa0a8]">{timeAgo(r.at)}</span>
                        </div>
                        {r.message && <div className="truncate text-[10px] text-[#b7bcc4]">“{r.message}”</div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          respondJoin(selected.id, session.username, r.id, true);
                          setMsg(`${r.user} can now edit this place.`);
                        }}
                        className="studio-btn h-7 gap-1 px-2.5 text-[10.5px] font-semibold text-[#0e241a] bg-[#75dda4] hover:bg-[#8ce6a5]"
                      >
                        <Check size={11} /> Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => respondJoin(selected.id, session.username, r.id, false)}
                        className="studio-btn h-7 gap-1 px-2.5 text-[10.5px] font-semibold text-[#ff9b9b] border border-[#5a2c2c] bg-[#2b1b1b] hover:bg-[#382323]"
                      >
                        <X size={11} /> Deny
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* friends list */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#7a7f88]">
                <ShieldCheck size={12} /> Edit permissions — friends list
              </div>
              <div className="studio-scroll max-h-[240px] overflow-y-auto rounded-lg border border-[#34373c]">
                {friends.map((f, i) => (
                  <div key={f.name} className={`flex items-center gap-2.5 px-3 py-2 ${i % 2 ? "bg-[#1e2023]" : "bg-[#1b1d20]"}`}>
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br ${f.color} text-[10px] font-extrabold text-white`}>
                      {f.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11.5px] font-semibold text-[#c8ccd2]">{f.name}</div>
                      <div className="text-[9px] text-[#7a7f88]">{f.status === "offline" ? `last online ${f.lastOnline ?? "a while ago"}` : f.status}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                          roleOf(f.name) === "editor"
                            ? "border-[#2c5a3d] bg-[#1b2b21] text-[#8ce6a5]"
                            : roleOf(f.name) === "builder"
                              ? "border-[#2c4a5a] bg-[#1b2b33] text-[#8ec5ff]"
                              : roleOf(f.name) === "viewer"
                                ? "border-[#4a4218] bg-[#2b271b] text-[#e8c76a]"
                                : "border-[#34373c] bg-[#1e2023] text-[#7a7f88]"
                        }`}
                      >
                        {roleOf(f.name) ? ROLE_LABEL[roleOf(f.name)!] : "No access"}
                      </span>
                      <select
                        aria-label={`Access for ${f.name}`}
                        className="studio-input h-6 w-[86px] text-[10px]"
                        value={roleOf(f.name) ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") removeEditor(selected.id, session.username, f.name);
                          else usePlatform.getState().setCollabRole(selected.id, session.username, f.name, v as CollabRole);
                        }}
                      >
                        <option value="">None</option>
                        <option value="viewer">Viewer</option>
                        <option value="builder">Builder</option>
                        <option value="editor">Editor</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 text-[10px] leading-relaxed text-[#7a7f88]">
                Pick each friend's access: <span className="text-[#e8c76a]">Viewer</span> reads code only, <span className="text-[#8ec5ff]">Builder</span> edits parts
                and animations, <span className="text-[#8ce6a5]">Editor</span> also edits scripts and tools. Fine-tune per-script visibility on the
                <span className="text-[#c8ccd2]"> Permissions</span> tab. The master toggle above grants everyone <span className="text-[#8ce6a5]">Editor</span>.
              </div>
            </div>

            {msg && <div className="rounded-lg border border-[#2a4a34] bg-[#16211a] px-3 py-2 text-[11px] text-[#8ce6a5]">{msg}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- permissions tab ----------------------------- */

function PermissionsTab({
  games,
  selected,
  onSelect,
}: {
  games: ReturnType<typeof platformSnapshot>["games"];
  selected: (typeof games)[number] | null;
  onSelect: (id: string) => void;
}) {
  const session = useWeb((s) => s.session);
  const platformVersion = usePlatform((s) => s.version);
  const { engine } = useStudioCtx();
  const partsVersion = useStudio((s) => s.partsVersion);
  void platformVersion;
  void partsVersion;

  const friends: (WebFriend & { name: string })[] = useMemo(() => {
    if (!session) return [];
    return friendsOf(session.username).map((n) => friendAppearance(n));
  }, [session]);

  if (!session) {
    return <div className="flex flex-1 items-center justify-center text-[12px] text-[#9aa0a8]">Sign in from the website first.</div>;
  }
  if (!games.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Hammer size={38} className="text-[#4a4f57]" />
        <div className="text-[13px] font-semibold text-[#c8ccd2]">Publish a game first</div>
        <div className="max-w-[380px] text-[11.5px] leading-relaxed text-[#9aa0a8]">
          Permissions are set per published place. Publish your build, then manage exactly what each friend can see and touch.
        </div>
      </div>
    );
  }

  const collab = selected ? usePlatform.getState().getCollab(selected.id) : null;
  const scripts = engine?.getScripts() ?? [];
  const hidden = new Set(collab?.hiddenScripts ?? []);

  const roleOf = (name: string): CollabRole | null => {
    const r = usePlatform.getState().getCollabRole(selected!.id, name);
    if (r === "owner" || r === null) return null;
    if (collab?.roles && Object.entries(collab.roles).some(([k]) => k.toLowerCase() === name.toLowerCase())) return r;
    if (collab?.editors.some((e) => e.toLowerCase() === name.toLowerCase()) || collab?.allFriends) return "editor";
    return null;
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* game list */}
      <div className="studio-scroll w-[240px] shrink-0 overflow-y-auto border-r border-[#34373c] py-2">
        <div className="px-3 pb-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-[#7a7f88]">Your published games</div>
        {games.map((g) => {
          const c = usePlatform.getState().getCollab(g.id);
          const active = selected?.id === g.id;
          const roleCount = Object.keys(c?.roles ?? {}).length;
          const editorCount = c?.editors.length ?? 0;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelect(g.id)}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${active ? "bg-[#233041]" : "hover:bg-[#22252a]"}`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${g.gradient} text-[18px]`}>{g.icon}</span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[11.5px] font-semibold ${active ? "text-[#8ec5ff]" : "text-[#c8ccd2]"}`}>{g.name}</span>
                <span className="block text-[9px] text-[#7a7f88]">
                  {roleCount
                    ? `${roleCount} role${roleCount === 1 ? "" : "s"} set`
                    : c?.allFriends
                      ? "all friends"
                      : editorCount
                        ? `${editorCount} editor${editorCount === 1 ? "" : "s"}`
                        : "private"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* detail */}
      <div className="studio-scroll min-w-0 flex-1 overflow-y-auto p-4">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-[12px] text-[#9aa0a8]">Pick a game on the left.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* role matrix */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#7a7f88]">
                <ShieldCheck size={12} /> What each role can do on “{selected.name}”
              </div>
              <div className="overflow-hidden rounded-lg border border-[#34373c]">
                <div className="grid grid-cols-[150px_repeat(3,1fr)] bg-[#17181b] text-[9.5px] font-bold uppercase tracking-wide text-[#7a7f88]">
                  <div className="border-r border-[#2a2d31] px-3 py-2">Ability</div>
                  {(Object.keys(ROLE_PERMS) as CollabRole[]).map((r) => (
                    <div key={r} className="border-r border-[#2a2d31] px-3 py-2 last:border-r-0">
                      <span className={r === "editor" ? "text-[#8ce6a5]" : r === "builder" ? "text-[#8ec5ff]" : "text-[#e8c76a]"}>{ROLE_LABEL[r]}</span>
                      <div className="mt-0.5 font-normal normal-case text-[8.5px] text-[#565b63]">{ROLE_DESC[r]}</div>
                    </div>
                  ))}
                </div>
                {(
                  [
                    ["View the place + play-test", "viewPlace"],
                    ["Open scripts (read code)", "viewScripts"],
                    ["Create / move / delete parts", "editParts"],
                    ["Edit script source", "editScripts"],
                    ["Edit tools (StarterPack)", "editTools"],
                    ["Edit animations", "editAnimations"],
                    ["Team Chat", "chat"],
                  ] as [string, keyof (typeof ROLE_PERMS)["editor"]][]
                ).map(([label, key]) => (
                  <div key={key} className="grid grid-cols-[150px_repeat(3,1fr)] border-t border-[#2a2d31] text-[10.5px] odd:bg-[#1b1d20] even:bg-[#1e2023]">
                    <div className="border-r border-[#2a2d31] px-3 py-1.5 text-[#b7bcc4]">{label}</div>
                    {(Object.keys(ROLE_PERMS) as CollabRole[]).map((r) => (
                      <div key={r} className="border-r border-[#2a2d31] px-3 py-1.5 last:border-r-0">
                        {ROLE_PERMS[r][key] ? (
                          <Check size={12} className="text-[#8ce6a5]" />
                        ) : (
                          <X size={12} className="text-[#565b63]" />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* hidden scripts */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#e8c76a]">
                <Code2 size={12} /> Secret scripts — hidden from Viewers & Builders
              </div>
              {scripts.length === 0 ? (
                <div className="rounded-lg border border-[#34373c] bg-[#1e2023] px-3 py-2.5 text-[11px] text-[#9aa0a8]">
                  This place has no scripts yet — add one in the Explorer to control its visibility.
                </div>
              ) : (
                <div className="studio-scroll max-h-[190px] overflow-y-auto rounded-lg border border-[#34373c]">
                  {scripts.map((sc, i) => {
                    const isHidden = hidden.has(sc.name);
                    return (
                      <label
                        key={sc.id}
                        className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 ${i % 2 ? "bg-[#1e2023]" : "bg-[#1b1d20]"}`}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[#c29b3f]"
                          checked={isHidden}
                          onChange={(e) =>
                            usePlatform.getState().setHiddenScript(selected.id, session.username, sc.name, e.target.checked)
                          }
                        />
                        <Eye size={13} className={`shrink-0 ${isHidden ? "text-[#565b63]" : "text-[#8ce6a5]"}`} />
                        <div className="min-w-0 flex-1">
                          <div className={`truncate text-[11.5px] font-semibold ${isHidden ? "text-[#7a7f88] line-through" : "text-[#c8ccd2]"}`}>
                            {sc.name}
                          </div>
                          <div className="text-[9px] text-[#7a7f88]">
                            {sc.kind} · {sc.source.split("\n").length} lines {isHidden ? "· only you + Editors can open it" : ""}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="mt-1.5 text-[10px] leading-relaxed text-[#7a7f88]">
                Hidden scripts vanish from the Explorer and chat file-references for anyone below Editor. You (the owner) and Editors always see everything.
              </div>
            </div>

            {/* per-friend current state */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#7a7f88]">
                <Users size={12} /> Effective access — friends list
              </div>
              <div className="studio-scroll max-h-[220px] overflow-y-auto rounded-lg border border-[#34373c]">
                {friends.map((f, i) => {
                  const role = roleOf(f.name);
                  return (
                    <div key={f.name} className={`flex items-center gap-2.5 px-3 py-2 ${i % 2 ? "bg-[#1e2023]" : "bg-[#1b1d20]"}`}>
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br ${f.color} text-[10px] font-extrabold text-white`}>
                        {f.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11.5px] font-semibold text-[#c8ccd2]">{f.name}</div>
                        <div className="text-[9px] text-[#7a7f88]">
                          {role ? ROLE_DESC[role] : "Cannot open this project"}
                        </div>
                      </div>
                      <select
                        aria-label={`Role for ${f.name}`}
                        className="studio-input h-7 w-[92px] text-[10.5px]"
                        value={role ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") usePlatform.getState().removeEditor(selected.id, session.username, f.name);
                          else usePlatform.getState().setCollabRole(selected.id, session.username, f.name, v as CollabRole);
                        }}
                      >
                        <option value="">No access</option>
                        <option value="viewer">Viewer</option>
                        <option value="builder">Builder</option>
                        <option value="editor">Editor</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- live tab -------------------------------- */

function LiveTab({
  games,
  selected,
  onSelect,
}: {
  games: ReturnType<typeof platformSnapshot>["games"];
  selected: (typeof games)[number] | null;
  onSelect: (id: string) => void;
}) {
  const { engine, net } = useStudioCtx();
  const netOnline = useStudio((s) => s.netOnline);
  const netStatusText = useStudio((s) => s.netStatusText);
  const netPlayerCount = useStudio((s) => s.netPlayerCount);
  const playerName = useStudio((s) => s.playerName);
  const roomStats = useStudio((s) => s.roomStats);
  const myAccess = useStudio((s) => s.myAccess);
  const setTeamChatOpen = useStudio((s) => s.setTeamChatOpen);
  const appendLog = useStudio((s) => s.appendLog);

  const startSession = () => {
    if (!net || !selected || !engine) return;
    if (selected.placeData) {
      engine.loadState(selected.placeData, false);
      useStudio.getState().bumpParts();
      useStudio.getState().bumpHistory();
    }
    // the owner starts the room from Studio — full access
    engine.setAccessGate(null);
    useStudio.getState().setMyAccess({ role: "owner", gameName: selected.name, canEditParts: true, canEditScripts: true, hiddenScripts: [] });
    net.connect(NetClient.defaultUrl(), playerName || "Builder", selected.id, "owner");
    setTeamChatOpen(true);
    appendLog("info", `Team Create session started for "${selected.name}" — room ${selected.id}`);
  };

  const onlineFor = (joinedAt: number) => {
    const mins = Math.max(0, Math.round((Date.now() - joinedAt) / 60000));
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="studio-scroll min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-[#34373c] bg-[#1e2023] p-3">
        <Radio size={20} className={netOnline ? "text-[#75dda4]" : "text-[#7a7f88]"} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[#e8ebee]">{netOnline ? netStatusText : "No live session running"}</div>
          <div className="text-[10.5px] text-[#9aa0a8]">
            {netOnline
              ? `${netPlayerCount} builder${netPlayerCount === 1 ? "" : "s"} connected — parts stay in sync, chat in the Team Chat panel.`
              : "Start a session so friends with edit access can build together with you in real time."}
          </div>
        </div>
        {netOnline && (
          <button type="button" onClick={() => net?.disconnect(true)} className="studio-btn h-8 px-3 text-[11px] font-semibold text-[#ff9b9b] border border-[#5a2c2c] bg-[#2b1b1b] hover:bg-[#382323]">
            Disconnect
          </button>
        )}
      </div>

      {/* live activity stats — who edited how much, for how long */}
      {netOnline && roomStats.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#7a7f88]">
            <Activity size={12} /> Builder activity this session
          </div>
          <div className="overflow-hidden rounded-lg border border-[#34373c]">
            <div className="grid grid-cols-[1fr_74px_58px_58px_58px_58px] bg-[#17181b] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide text-[#7a7f88]">
              <span>Builder</span>
              <span className="text-center">Role</span>
              <span className="text-center">Online</span>
              <span className="text-center" title="Part changes broadcast">Part edits</span>
              <span className="text-center" title="Scripts saved">Saves</span>
              <span className="text-center">Chats</span>
            </div>
            {roomStats.map((m, i) => (
              <div key={m.id} className={`grid grid-cols-[1fr_74px_58px_58px_58px_58px] items-center px-3 py-1.5 text-[10.5px] ${i % 2 ? "bg-[#1e2023]" : "bg-[#1b1d20]"}`}>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `#${colorFor(m.name).toString(16).padStart(6, "0")}` }} />
                  <span className="truncate font-semibold text-[#c8ccd2]">{m.name}</span>
                </span>
                <span className="text-center">
                  <span
                    className={`rounded border px-1 py-0.5 text-[8.5px] font-bold uppercase ${
                      m.role === "owner"
                        ? "border-[#5a3a8a] bg-[#241b2b] text-[#c39be8]"
                        : m.role === "editor"
                          ? "border-[#2c5a3d] bg-[#1b2b21] text-[#8ce6a5]"
                          : m.role === "builder"
                            ? "border-[#2c4a5a] bg-[#1b2b33] text-[#8ec5ff]"
                            : "border-[#4a4218] bg-[#2b271b] text-[#e8c76a]"
                    }`}
                  >
                    {m.role}
                  </span>
                </span>
                <span className="text-center text-[#9aa0a8]">{onlineFor(m.joinedAt)}</span>
                <span className="text-center font-semibold text-[#c8ccd2]">{m.partEdits}</span>
                <span className="text-center font-semibold text-[#c8ccd2]">{m.scriptSaves}</span>
                <span className="text-center text-[#9aa0a8]">{m.chatMsgs}</span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] leading-relaxed text-[#7a7f88]">
            Live from the sync room: how long each builder has been online and how many part changes, script saves and chat messages they sent.
            {myAccess && myAccess.role !== "owner" && <> You are in this room as <span className="font-semibold text-[#e8c76a]">{myAccess.role}</span>.</>}
          </div>
        </div>
      )}

      {games.length === 0 ? (
        <div className="rounded-lg border border-[#34373c] p-4 text-center text-[11.5px] text-[#9aa0a8]">
          Publish a game first — live sessions run on your published places.
        </div>
      ) : (
        <>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#7a7f88]">Go live on a place</div>
          <div className="flex flex-col gap-1.5">
            {games.map((g) => {
              const active = selected?.id === g.id;
              return (
                <div key={g.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${active ? "border-[#2c4a5a] bg-[#1b2b33]" : "border-[#34373c] bg-[#1e2023]"}`}>
                  <button type="button" onClick={() => onSelect(g.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${g.gradient} text-[20px]`}>{g.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold text-[#c8ccd2]">{g.name}</span>
                      <span className="block text-[9.5px] text-[#7a7f88]">
                        {g.placeData?.parts.length ?? 0} parts · room {g.id.slice(0, 14)}…
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={startSession}
                    className="studio-btn h-8 shrink-0 gap-1.5 px-3 text-[11px] font-semibold text-[#0e241a] bg-[#75dda4] hover:bg-[#8ce6a5]"
                    title="Load the latest published place and open the shared room"
                  >
                    <Radio size={12} /> Go live
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[10px] leading-relaxed text-[#7a7f88]">
            “Go live” loads the latest published copy of the place and opens a shared room. Friends who press <span className="text-[#c8ccd2]">Edit</span> on your
            profile join the same room — their part edits sync to you instantly. Use Team Chat to talk, share images and reference scripts.
          </div>
        </>
      )}
    </div>
  );
}
