"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Gamepad2,
  Hammer,
  Lock,
  MessageCircle,
  Pencil,
  Play,
  Send,
  UserPlus,
  Users,
} from "lucide-react";
import { friendAppearance, findDirectoryUser } from "@/lib/studio/webdata";
import { friendsOf, platformSnapshot, timeAgo, usePlatform, type PublishedGame } from "@/lib/studio/platform";
import { getAccount } from "@/lib/studio/auth";
import { useWeb } from "@/lib/studio/webstore";
import { SEED_FRIENDS } from "@/lib/studio/webdata";

function statusOf(username: string): string {
  const dir = findDirectoryUser(username);
  if (dir) return dir.status === "playing" ? "In a game" : dir.status === "online" ? "Online" : `Last online ${dir.lastOnline ?? "a while ago"}`;
  return getAccount(username) ? "Online" : "Offline";
}

/** One published game row on a profile, with the friend edit-request flow. */
function GameRow({ game, ownerUsername, viewerUsername, isSelf, isFriend, canEdit }: { game: PublishedGame; ownerUsername: string; viewerUsername: string; isSelf: boolean; isFriend: boolean; canEdit: boolean }) {
  const requestJoinGame = useWeb((s) => s.requestJoin);
  const requestLaunch = useWeb((s) => s.requestLaunch);
  const platformVersion = usePlatform((s) => s.version);
  const [askOpen, setAskOpen] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  void platformVersion;

  const editInStudio = () => {
    const role = usePlatform.getState().getCollabRole(game.id, viewerUsername) ?? "viewer";
    requestLaunch({
      templateId: game.templateId,
      name: game.name,
      autoPlay: false,
      gameId: game.id,
      placeData: game.placeData,
      teamRoom: game.id,
      teamRole: isSelf ? "owner" : role,
    });
  };

  const sendRequest = () => {
    const res = usePlatform.getState().requestJoin(game.id, viewerUsername, note);
    setResult(
      res.ok
        ? { ok: true, text: "Request sent! The owner will review it in Studio → Team Create, and you'll get a notification here when accepted." }
        : { ok: false, text: res.error ?? "Could not send the request." },
    );
    if (res.ok) setAskOpen(false);
  };

  return (
    <div className="border-b border-[#f2f4f5] px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${game.gradient} text-[22px]`}>{game.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-bold text-[#111418]">{game.name}</span>
            {game.featured && <span className="shrink-0 rounded bg-[#fff4dd] px-1.5 text-[9px] font-bold text-[#b7950b]">featured</span>}
            {game.price > 0 && <span className="shrink-0 rounded bg-[#edfaf4] px-1.5 text-[9px] font-bold text-[#008751]">{game.price} R$ entry</span>}
          </div>
          <div className="text-[11px] text-[#9aa0a6]">
            {game.visits} visits · updated {timeAgo(game.updatedAt)} · {game.placeData?.parts.length ?? 0} parts
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSelf ? (
            <>
              <button
                type="button"
                onClick={editInStudio}
                className="flex h-8 items-center gap-1.5 rounded-full bg-[#111418] px-4 text-[11.5px] font-bold text-white hover:bg-[#2a2e33]"
                title="Open this place in Studio with a live Team Create room"
              >
                <Pencil size={12} /> Edit in Studio
              </button>
              <button
                type="button"
                onClick={() => useWeb.getState().requestJoin({
                  gameId: game.id,
                  name: game.name,
                  templateId: game.templateId,
                  placeData: game.placeData,
                  price: game.price,
                  creator: game.creator,
                  creatorDisplay: game.creatorDisplay,
                  iconEmoji: game.icon,
                  gradient: game.gradient,
                  desc: game.desc,
                })}
                className="flex h-8 items-center gap-1.5 rounded-full bg-[#00b06f] px-4 text-[11.5px] font-bold text-white hover:bg-[#009a61]"
              >
                <Play size={12} fill="currentColor" /> Play
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() =>
                  requestJoinGame({
                    gameId: game.id,
                    name: game.name,
                    templateId: game.templateId,
                    placeData: game.placeData,
                    price: game.price,
                    creator: game.creator,
                    creatorDisplay: game.creatorDisplay,
                    iconEmoji: game.icon,
                    gradient: game.gradient,
                    desc: game.desc,
                  })
                }
                className="flex h-8 items-center gap-1.5 rounded-full bg-[#00b06f] px-4 text-[11.5px] font-bold text-white hover:bg-[#009a61]"
              >
                <Play size={12} fill="currentColor" /> Play
              </button>
              {isFriend && canEdit && (
                <button
                  type="button"
                  onClick={editInStudio}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-[#111418] px-4 text-[11.5px] font-bold text-white hover:bg-[#2a2e33]"
                  title="You have edit access — open this place in Studio and join the Team Create room"
                >
                  <Pencil size={12} /> Edit
                </button>
              )}
              {isFriend && !canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setAskOpen((v) => !v);
                    setResult(null);
                  }}
                  className="flex h-8 items-center gap-1.5 rounded-full border border-[#d6d9db] bg-white px-4 text-[11.5px] font-semibold text-[#5c6166] hover:bg-[#f5f7f8]"
                  title="Ask the owner for edit access (Team Create)"
                >
                  <Lock size={12} /> Request to Edit
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* request-to-join form */}
      {askOpen && !result && (
        <div className="mt-3 rounded-xl border border-[#e3e6e8] bg-[#f8f9fa] p-3">
          <div className="mb-1.5 text-[12px] font-semibold text-[#111418]">Ask {game.creatorDisplay || ownerUsername} to let you edit “{game.name}”</div>
          <div className="mb-2 text-[11px] leading-relaxed text-[#5c6166]">
            Your friend will see your request in Studio → Team Create. Once accepted, an <b>Edit</b> button appears here and you can build together live.
          </div>
          <div className="flex gap-2">
            <input
              className="h-9 flex-1 rounded-full border border-[#d6d9db] bg-white px-3.5 text-[12.5px] outline-none focus:border-[#00b06f]"
              placeholder="Optional message — e.g. let's build the lobby together"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="button" onClick={sendRequest} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#00b06f] px-4 text-[12px] font-bold text-white hover:bg-[#009a61]">
              <Send size={12} /> Send request
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className={`mt-3 rounded-lg border px-3.5 py-2 text-[11.5px] ${result.ok ? "border-[#b7e8d2] bg-[#edfaf4] text-[#008751]" : "border-[#f3c2c2] bg-[#fdf1f1] text-[#c0392b]"}`}>
          {result.text}
        </div>
      )}
    </div>
  );
}

export function ProfilePage() {
  const profileView = useWeb((s) => s.profileView);
  const session = useWeb((s) => s.session);
  const backFromProfile = useWeb((s) => s.backFromProfile);
  const extraFriends = useWeb((s) => s.extraFriends);
  const addFriend = useWeb((s) => s.addFriend);
  const platformVersion = usePlatform((s) => s.version);
  void platformVersion;

  const username = profileView ?? session?.username ?? "";
  const isSelf = username.toLowerCase() === (session?.username ?? "").toLowerCase();

  const info = useMemo(() => {
    const dir = findDirectoryUser(username);
    const acct = getAccount(username);
    const appearance = friendAppearance(username);
    const games = platformSnapshot().games.filter((g) => g.creator === username && !g.removed);
    const friendNames = friendsOf(username);
    const totalVisits = games.reduce((n, g) => n + g.visits, 0);
    return {
      exists: !!dir || !!acct,
      display: acct?.displayName || dir?.display || username,
      bio: dir?.bio ?? (acct ? "Blockyard builder — creating experiences in Studio." : null),
      appearance,
      games,
      friendNames,
      totalVisits,
      real: !!acct,
    };
  }, [username, platformVersion]);

  const viewerFriends = useMemo(() => [...SEED_FRIENDS.map((f) => f.name), ...extraFriends], [extraFriends]);
  const isFriend = !isSelf && viewerFriends.some((n) => n.toLowerCase() === username.toLowerCase());

  if (!session) return null;

  if (!info.exists) {
    return (
      <div>
        <button type="button" onClick={backFromProfile} className="mb-4 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0f6dcf] hover:underline">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="text-[15px] font-bold text-[#111418]">Player not found</div>
          <div className="mt-1 text-[12.5px] text-[#9aa0a6]">“{username}” doesn't exist on Blockyard.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={backFromProfile} className="mb-4 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0f6dcf] hover:underline">
        <ArrowLeft size={14} /> Back
      </button>

      {/* identity card */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className={`h-[92px] bg-gradient-to-r ${info.appearance.color}`} />
        <div className="flex flex-wrap items-end gap-4 px-5 pb-4">
          <span className={`-mt-9 grid h-[76px] w-[76px] shrink-0 place-items-center rounded-2xl border-4 border-white bg-gradient-to-br ${info.appearance.color} text-[24px] font-extrabold text-white shadow`}>
            {info.display.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[19px] font-extrabold text-[#111418]">{info.display}</span>
              {info.real && <span className="rounded bg-[#edfaf4] px-1.5 py-0.5 text-[9px] font-bold text-[#008751]">real account</span>}
              {isFriend && <span className="flex items-center gap-1 rounded bg-[#edfaf4] px-1.5 py-0.5 text-[9px] font-bold text-[#008751]"><Check size={10} /> friend</span>}
            </div>
            <div className="text-[12px] text-[#9aa0a6]">@{username} · {statusOf(username)}</div>
            {info.bio && <div className="mt-1 max-w-[540px] text-[12.5px] leading-relaxed text-[#3f4347]">{info.bio}</div>}
          </div>
          <div className="flex gap-2 pt-1">
            {!isSelf && !isFriend && (
              <button
                type="button"
                onClick={() => addFriend(username)}
                className="flex h-9 items-center gap-1.5 rounded-full bg-[#00b06f] px-4 text-[12.5px] font-bold text-white hover:bg-[#009a61]"
              >
                <UserPlus size={14} /> Add Friend
              </button>
            )}
            {!isSelf && (
              <button
                type="button"
                className="flex h-9 items-center gap-1.5 rounded-full border border-[#d6d9db] bg-white px-4 text-[12.5px] font-semibold text-[#5c6166] hover:bg-[#f5f7f8]"
                title="Chat from the bubble in the bottom-right corner"
                onClick={() => useWeb.setState({ page: "friends" })}
              >
                <MessageCircle size={14} /> Message
              </button>
            )}
            {isSelf && (
              <button
                type="button"
                onClick={() => useWeb.getState().enterStudio()}
                className="flex h-9 items-center gap-1.5 rounded-full bg-[#111418] px-4 text-[12.5px] font-bold text-white hover:bg-[#2a2e33]"
              >
                <Hammer size={14} /> Open Studio
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-[#f2f4f5] border-t border-[#f2f4f5]">
          {[
            ["Friends", String(info.friendNames.length)],
            ["Experiences", String(info.games.length)],
            ["Total visits", String(info.totalVisits)],
          ].map(([label, value]) => (
            <div key={label} className="py-2.5 text-center">
              <div className="text-[15px] font-extrabold text-[#111418]">{value}</div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9aa0a6]">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* games */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[13px] font-bold uppercase tracking-wide text-[#9aa0a6]">Experiences</div>
          {!isSelf && isFriend && (
            <span className="rounded-full bg-[#edfaf4] px-2.5 py-1 text-[10.5px] font-semibold text-[#008751]">
              you're friends — Edit appears on places {info.display} shared with you
            </span>
          )}
        </div>
        {info.games.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center shadow-sm">
            <Gamepad2 size={26} className="mx-auto mb-2 text-[#b9bfc4]" />
            <div className="text-[13px] font-semibold text-[#111418]">No published experiences yet</div>
            <div className="mt-0.5 text-[12px] text-[#9aa0a6]">{isSelf ? "Publish one from Studio to see it here." : `${info.display} hasn't published a game yet.`}</div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            {info.games.map((g) => {
              const canEdit = usePlatform.getState().canEditGame(g.id, session.username);
              return <GameRow key={g.id} game={g} ownerUsername={username} viewerUsername={session.username} isSelf={isSelf} isFriend={isFriend} canEdit={canEdit} />;
            })}
          </div>
        )}
      </div>

      {/* friends preview */}
      <div>
        <div className="mb-3 text-[13px] font-bold uppercase tracking-wide text-[#9aa0a6]">Friends ({info.friendNames.length})</div>
        <div className="flex flex-wrap gap-2">
          {info.friendNames.slice(0, 14).map((n) => {
            const a = friendAppearance(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => useWeb.getState().openProfile(n)}
                className="flex items-center gap-2 rounded-full border border-[#e3e6e8] bg-white py-1 pl-1 pr-3 shadow-sm transition-colors hover:border-[#00b06f]"
                title={`View ${n}'s profile`}
              >
                <span className={`grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br ${a.color} text-[10px] font-extrabold text-white`}>{n.slice(0, 2).toUpperCase()}</span>
                <span className="text-[12px] font-semibold text-[#111418]">{n}</span>
              </button>
            );
          })}
          {info.friendNames.length > 14 && (
            <span className="flex items-center rounded-full border border-[#e3e6e8] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#9aa0a6]">
              +{info.friendNames.length - 14} more
            </span>
          )}
        </div>
      </div>

      {/* how team create works */}
      {!isSelf && (
        <div className="mt-6 flex items-start gap-3 rounded-xl bg-white p-4 text-[12px] leading-relaxed text-[#9aa0a6] shadow-sm">
          <Users size={16} className="mt-0.5 shrink-0 text-[#00b06f]" />
          <span>
            {isFriend ? (
              <>
                You're friends with <b className="text-[#111418]">{info.display}</b>. Press <b>Edit</b> on a place they shared with you to open it in Studio —
                you'll join the same live room, chat and edit parts together. Not shared yet? <b>Request to Edit</b> sends them a join request.
              </>
            ) : (
              <>
                Add <b className="text-[#111418]">{info.display}</b> as a friend to unlock Team Create — friends can request edit access to each other's
                places and build together in Studio.
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
