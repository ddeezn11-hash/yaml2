"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import { Heart, Hexagon, Lock, Play, ThumbsUp, Users, X } from "lucide-react";
import { formatCount, livePlayers, type WebGame } from "@/lib/studio/webdata";
import { platformSnapshot, usePlatform } from "@/lib/studio/platform";
import { useWeb } from "@/lib/studio/webstore";

/* --------------------------------- card ---------------------------------- */

export function GameCard({ game, onOpen }: { game: WebGame; onOpen: (g: WebGame) => void }) {
  const Icon = game.icon;
  const price = game.price ?? 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(game)}
      className="group w-full text-left"
      title={game.name}
    >
      <div className={`relative aspect-square w-full overflow-hidden rounded-xl bg-gradient-to-br ${game.gradient} shadow-sm transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:shadow-lg`}>
        {game.emoji ? (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[44px] drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
            {game.emoji}
          </span>
        ) : (
          <Icon size="52%" strokeWidth={1.1} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/90 drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]" />
        )}
        {/* subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
        />
        {price > 0 && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-[#ffd77a] backdrop-blur-sm">
            <Hexagon size={9} fill="currentColor" /> {formatCount(price)}
          </span>
        )}
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          {game.rating}% <ThumbsUp size={9} className="mb-[1px] inline" />
        </span>
        {game.publishedId && (
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-[#00b06f]/85 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
            COMMUNITY
          </span>
        )}
      </div>
      <div className="mt-1.5 px-0.5">
        <div className="truncate text-[13px] font-semibold text-[#111418]">{game.name}</div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#5c6166]">
          <span className="inline-block h-[7px] w-[7px] rounded-full bg-[#00b06f]" />
          {formatCount(livePlayers(game.players))}
        </div>
      </div>
    </button>
  );
}

/* ------------------------------ detail modal ----------------------------- */

export function GameDetail({ game, onClose }: { game: WebGame; onOpen?: never; onClose: () => void }) {
  const requestJoin = useWeb((s) => s.requestJoin);
  const pushRecentlyPlayed = useWeb((s) => s.pushRecentlyPlayed);
  const favorites = useWeb((s) => s.favorites);
  const toggleFavorite = useWeb((s) => s.toggleFavorite);
  const session = useWeb((s) => s.session);
  const robux = session?.robux ?? 0;
  const platformVersion = usePlatform((s) => s.version);
  void platformVersion;

  const Icon = game.icon;
  const fav = favorites.includes(game.id);

  const published = game.publishedId
    ? platformSnapshot().games.find((g) => g.id === game.publishedId && !g.removed) ?? null
    : null;
  const price = published?.price ?? game.price ?? 0;
  const owns = published
    ? usePlatform.getState().ownsAccess(published, session?.username ?? "")
    : true;

  const [buyOpen, setBuyOpen] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  const join = () => {
    requestJoin({
      gameId: game.id,
      name: game.name,
      templateId: game.templateId,
      placeData: published?.placeData ?? null,
      price,
      creator: published?.creator ?? game.creator,
      creatorDisplay: published?.creatorDisplay,
      iconEmoji: game.emoji,
      gradient: game.gradient,
      desc: game.desc,
    });
  };

  const play = () => {
    if (GAMES_IDS.has(game.id)) pushRecentlyPlayed(game.id);
    if (published && price > 0 && !owns) {
      setBuyError(null);
      setBuyOpen(true);
      return;
    }
    join();
  };

  const confirmBuy = () => {
    if (!published) return;
    const res = usePlatform.getState().buyAccess(published, session?.username ?? "");
    if (!res.ok) {
      setBuyError(res.error ?? "Purchase failed.");
      return;
    }
    // refresh the robux balance shown in the header
    const acct = session;
    if (acct) useWeb.setState({ session: { ...acct, robux: Math.max(0, acct.robux - published.price) } });
    setBuyOpen(false);
    join();
  };

  const stats: [string, string][] = [
    ["Active", formatCount(livePlayers(game.players))],
    ["Visits", formatCount(game.visits)],
    ["Created", published ? new Date(published.createdAt).toLocaleDateString() : "May 2024"],
    ["Updated", published ? "today" : game.updated],
    ["Genre", game.genre],
    ["Max Players", String(game.serverSize)],
    ["Access", price > 0 ? `${formatCount(price)} R$` : "Free"],
    ["Creator", published?.creatorDisplay ?? game.creator],
  ];

  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-start justify-center overflow-y-auto bg-black/55 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-[720px] overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* hero */}
        <div className={`relative h-[220px] bg-gradient-to-br ${game.gradient}`}>
          {game.emoji ? (
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[110px] drop-shadow-[0_6px_20px_rgba(0,0,0,0.4)]">
              {game.emoji}
            </span>
          ) : (
            <Icon size="120px" strokeWidth={1} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/90 drop-shadow-[0_6px_20px_rgba(0,0,0,0.4)]" />
          )}
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)", backgroundSize: "34px 34px" }}
          />
          {price > 0 && (
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-[11.5px] font-bold text-[#ffd77a] backdrop-blur-sm">
              <Lock size={11} /> Paid access · {formatCount(price)} R$
            </span>
          )}
          <button
            type="button"
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60"
            onClick={onClose}
            title="Close"
          >
            <X size={17} />
          </button>
        </div>

        {/* body */}
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[22px] font-extrabold leading-tight text-[#111418]">{game.name}</h2>
              <div className="mt-1 text-[13px] text-[#5c6166]">
                By <span className="font-semibold text-[#0f6dcf]">{published?.creatorDisplay ?? game.creator}</span>
                {published && <span className="ml-1.5 rounded bg-[#edfaf4] px-1.5 py-0.5 text-[9.5px] font-bold text-[#008751]">published by a creator</span>}
              </div>
              <div className="mt-2 flex items-center gap-3 text-[12px] text-[#5c6166]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#00b06f]" />
                  {formatCount(livePlayers(game.players))} playing
                </span>
                <span className="flex items-center gap-1">
                  <ThumbsUp size={12} /> {game.rating}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => toggleFavorite(game.id)}
                className={`grid h-11 w-11 place-items-center rounded-full border transition-colors ${
                  fav ? "border-[#ff5d5d] bg-[#fff0f0] text-[#ff5d5d]" : "border-[#d6d9db] bg-white text-[#9aa0a6] hover:border-[#ff5d5d] hover:text-[#ff5d5d]"
                }`}
                title={fav ? "Remove from favorites" : "Add to favorites"}
              >
                <Heart size={19} fill={fav ? "currentColor" : "none"} />
              </button>
              <button
                type="button"
                onClick={play}
                className="flex h-11 items-center gap-2 rounded-full bg-[#00b06f] px-8 text-[16px] font-bold text-white shadow-md transition-all hover:bg-[#009a61] hover:shadow-lg active:scale-95"
              >
                {price > 0 && !owns ? (
                  <>
                    <Hexagon size={17} fill="currentColor" /> {formatCount(price)} R$
                  </>
                ) : (
                  <>
                    <Play size={18} fill="currentColor" /> Play
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="mt-4 max-w-[560px] text-[13.5px] leading-relaxed text-[#3f4347]">{game.desc}</p>

          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[#eceff1] pt-4 sm:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9aa0a6]">{label}</div>
                <div className="mt-0.5 line-clamp-1 text-[14px] font-bold text-[#111418]">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#f2f4f5] px-4 py-3 text-[12px] text-[#5c6166]">
            <Users size={14} className="shrink-0 text-[#00b06f]" />
            Pressing Play opens the game full-screen with your character, tools and chat. ESC → Leave Game brings you back here.
          </div>

          {/* purchase confirm */}
          {buyOpen && (
            <div className="mt-4 rounded-2xl border-2 border-[#f1c40f]/60 bg-[#fffbec] p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f1c40f]/25 text-[#b7950b]">
                  <Lock size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-[#111418]">Unlock this experience?</div>
                  <div className="mt-0.5 text-[12px] leading-relaxed text-[#5c6166]">
                    This creator charges <b>{formatCount(price)} R$</b> for entry. Your balance: <b>{formatCount(robux)} R$</b>.
                    You keep access forever, and the creator earns 90%.
                  </div>
                  {buyError && (
                    <div className="mt-2 rounded-lg border border-[#f3c2c2] bg-[#fdf1f1] px-3 py-1.5 text-[11.5px] text-[#c0392b]">{buyError}</div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setBuyOpen(false)} className="h-9 rounded-full border border-[#d6d9db] bg-white px-4 text-[12.5px] font-semibold text-[#5c6166] hover:bg-[#f5f7f8]">
                      Cancel
                    </button>
                    <button type="button" onClick={confirmBuy} className="flex h-9 items-center gap-1.5 rounded-full bg-[#00b06f] px-5 text-[12.5px] font-bold text-white hover:bg-[#009a61]">
                      <Hexagon size={13} fill="currentColor" /> Buy & Play ({formatCount(price)} R$)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* seed game ids (for recently played) — avoids importing GAMES itself (circular) */
const GAMES_IDS = new Set([
  "obby-tower", "pet-tycoon", "natural-disaster", "jailbreak", "murder-mystery",
  "speed-run", "pizza-place", "sword-fight", "haunted-house", "go-kart",
  "castle-siege", "mining-gems", "island-tycoon", "snow-park", "music-hangout",
  "airline", "cat-cafe", "dice-luck", "restaurant", "king-crown",
]);
