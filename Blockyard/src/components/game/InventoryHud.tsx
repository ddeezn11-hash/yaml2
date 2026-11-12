"use client";

import { useEffect, useState } from "react";
import { Backpack, Hand, MousePointerClick, X } from "lucide-react";
import type { GameHud, HudToolSlot } from "@/lib/studio/playmode";

/* ------------------------------------------------------------------ */
/* InventoryHud — the custom inventory interface.                      */
/*                                                                    */
/* Exactly the Roblox pattern from the creator guide: the default      */
/* hotbar is replaced by our own UI. A hotbar (9 numbered slots) sits  */
/* at the bottom, a BAG button (or the B key) opens the full grid,     */
/* and every click asks the "server" (PlayController) to equip / drop  */
/* the tool — the UI itself never decides what's allowed.              */
/* ------------------------------------------------------------------ */

interface Props {
  hud: GameHud;
  /** Equip by uid; null puts the held tool away (Humanoid:EquipTool). */
  equip: (uid: string | null) => void;
  /** Drop a carried tool into the world (respects CanBeDropped). */
  drop: (uid: string) => void;
  /** Distance from the bottom edge, px. */
  bottom?: number;
  /** Render slightly larger slots for the web game player. */
  large?: boolean;
}

export function InventoryHud({ hud, equip, drop, bottom = 12, large = false }: Props) {
  const [open, setOpen] = useState(false);
  const [hoverUid, setHoverUid] = useState<string | null>(null);

  // B opens / closes the backpack window
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
      if (typing) return;
      if (e.code === "KeyB") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hotbar: (HudToolSlot | null)[] = Array.from({ length: 9 }, (_, slot) =>
    hud.backpack.find((t) => t.slot === slot) ?? null,
  );
  const carried = hud.backpack.length;
  const hover = hoverUid ? hud.backpack.find((t) => t.uid === hoverUid) ?? null : null;
  const slotSize = large ? 62 : 56;

  return (
    <>
      {/* ---------------- pickup prompt (E) ---------------- */}
      {hud.pickup && !hud.dead && (
        <div
          className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 animate-pulse"
          style={{ bottom: bottom + slotSize + 26 }}
        >
          <div className="flex items-center gap-2 rounded-full border border-[#75dda4]/60 bg-[rgba(18,32,24,.85)] px-4 py-1.5 text-[12px] font-bold text-[#b9f0cf] shadow-lg backdrop-blur">
            <span className="grid h-5 w-5 place-items-center rounded bg-[#75dda4] text-[11px] font-extrabold text-[#0b2418]">E</span>
            Pick up {hud.pickup.icon} {hud.pickup.name}
          </div>
        </div>
      )}

      {/* ---------------- inventory panel (B) ---------------- */}
      {open && (
        <div
          className="absolute left-1/2 z-30 w-[min(620px,calc(100%-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/15 bg-[rgba(16,18,22,.94)] shadow-2xl backdrop-blur-md"
          style={{ bottom: bottom + slotSize + 14 }}
        >
          {/* header */}
          <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-2.5">
            <Backpack size={15} className="text-[#75dda4]" />
            <span className="text-[13px] font-bold text-white">Backpack</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-[#9fe8bf]">
              {carried} / {hud.backpackMax}
            </span>
            <span className="hidden text-[10px] text-[#8a96a5] sm:inline">
              click to equip · Backspace drops the held tool
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-6 w-6 place-items-center rounded-md bg-white/10 text-[#c6cdd8] hover:bg-white/20 hover:text-white"
              title="Close (B)"
            >
              <X size={13} />
            </button>
          </div>

          {/* grid */}
          <div className="studio-scroll max-h-[300px] overflow-y-auto p-3">
            {carried === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 p-6 text-center text-[12px] text-[#8a96a5]">
                Nothing in your Backpack — respawn to refill the StarterPack,
                or pick up a dropped tool with <b className="text-white">E</b>.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {hud.backpack.map((t) => (
                  <div
                    key={t.uid}
                    className={`relative flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors ${
                      t.equipped
                        ? "border-[#75dda4] bg-[rgba(38,74,53,.45)]"
                        : "border-white/[.12] bg-white/[.04] hover:border-white/30"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => equip(t.equipped ? null : t.uid)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      title={t.toolTip || t.desc}
                    >
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[20px] ${t.equipped ? "bg-[rgba(117,221,164,.2)]" : "bg-white/[.06]"}`}>
                        {t.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12px] font-bold text-white">{t.name}</span>
                          {t.slot >= 0 && (
                            <span className="shrink-0 rounded bg-[#ffd479]/20 px-1 text-[9px] font-bold text-[#ffd479]">{t.slot + 1}</span>
                          )}
                          {t.equipped && (
                            <span className="shrink-0 rounded bg-[#75dda4] px-1 text-[8.5px] font-extrabold text-[#0b2418]">HELD</span>
                          )}
                        </span>
                        <span className="block truncate text-[9.5px] text-[#9aa5b1]">{t.stats}</span>
                        {t.maxDurability > 0 && (
                          <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-black/50">
                            <span
                              className="block h-full rounded-full transition-all"
                              style={{
                                width: `${Math.max(0, (t.durability / t.maxDurability) * 100)}%`,
                                background: t.durability / t.maxDurability > 0.4 ? "#75dda4" : "#e6544f",
                              }}
                            />
                          </span>
                        )}
                      </span>
                    </button>
                    {t.canBeDropped && (
                      <button
                        type="button"
                        onClick={() => drop(t.uid)}
                        className="shrink-0 self-stretch rounded-lg border border-[#a14848]/50 bg-[rgba(90,30,30,.35)] px-2 text-[9.5px] font-bold text-[#ff9e9e] hover:bg-[rgba(120,40,40,.55)]"
                        title={`Drop ${t.name} into the world`}
                      >
                        Drop
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* footer help */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 px-4 py-2 text-[9.5px] text-[#8a96a5]">
            <span><b className="text-[#c6cdd8]">1-9</b> equip hotbar</span>
            <span><b className="text-[#c6cdd8]">B</b> close</span>
            <span><b className="text-[#c6cdd8]">Backspace</b> drop held</span>
            <span><b className="text-[#c6cdd8]">E</b> pick up</span>
            <span className="ml-auto flex items-center gap-1 text-[#7d8896]">
              <MousePointerClick size={10} /> click an item to equip / put away
            </span>
          </div>
        </div>
      )}

      {/* ---------------- hotbar (bottom center) ---------------- */}
      <div className="absolute left-1/2 z-20 -translate-x-1/2" style={{ bottom }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-2xl border border-white/15 bg-[rgba(16,18,22,.72)] p-1.5 shadow-lg backdrop-blur-md">
            {hotbar.map((t, i) => {
              const cdFrac = t && t.cooldownMax > 0 ? Math.min(1, t.cooldown / t.cooldownMax) : 0;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => t && equip(t.equipped ? null : t.uid)}
                  onMouseEnter={() => t && setHoverUid(t.uid)}
                  onMouseLeave={() => setHoverUid(null)}
                  title={t ? t.toolTip || t.desc : `Empty slot ${i + 1}`}
                  className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 transition-all ${
                    t?.equipped
                      ? "border-[#75dda4] bg-[rgba(30,58,42,.85)] shadow-[0_0_16px_rgba(117,221,164,.4)]"
                      : t
                        ? "border-white/15 bg-[rgba(18,20,24,.55)] hover:border-white/40"
                        : "border-white/[.07] bg-[rgba(18,20,24,.35)]"
                  }`}
                  style={{ width: slotSize, height: slotSize }}
                >
                  <span className="absolute -top-1 -left-1 rounded bg-[rgba(12,14,17,.9)] px-1 text-[8.5px] font-bold text-[#ffd479]">{i + 1}</span>
                  {t && (
                    <>
                      <span className="text-[20px] leading-none">{t.icon}</span>
                      <span className={`max-w-full truncate px-0.5 text-[7.5px] font-bold ${t.equipped ? "text-[#8fd3ab]" : "text-[#9aa0a6]"}`}>{t.name}</span>
                      {/* cooldown sweep */}
                      {cdFrac > 0 && (
                        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[10px]">
                          <span
                            className="absolute inset-x-0 bottom-0 bg-[rgba(8,10,14,.65)]"
                            style={{ height: `${cdFrac * 100}%` }}
                          />
                        </span>
                      )}
                      {/* durability bar */}
                      {t.maxDurability > 0 && (
                        <span className="absolute inset-x-1.5 bottom-[3px] block h-[3px] overflow-hidden rounded-full bg-black/60">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${Math.max(0, (t.durability / t.maxDurability) * 100)}%`,
                              background: t.durability / t.maxDurability > 0.4 ? "#75dda4" : "#e6544f",
                            }}
                          />
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* BAG button */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl border px-3 text-[10px] font-bold shadow-lg backdrop-blur-md transition-colors ${
              open
                ? "border-[#75dda4] bg-[rgba(30,58,42,.85)] text-[#8fd3ab]"
                : "border-white/15 bg-[rgba(16,18,22,.72)] text-[#c6cdd8] hover:border-white/40"
            }`}
            title="Open your Backpack (B)"
          >
            <Backpack size={16} />
            <span>BAG {carried > 0 && <span className="text-[#75dda4]">{carried}</span>}</span>
            <span className="rounded bg-white/10 px-1 text-[8px] text-[#9aa5b1]">B</span>
          </button>
        </div>

        {/* hover tooltip (above the hotbar) */}
        {hover && !open && (
          <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-[260px] -translate-x-1/2 rounded-xl border border-white/15 bg-[rgba(13,15,19,.95)] p-3 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="text-[18px]">{hover.icon}</span>
              <span className="text-[13px] font-bold text-white">{hover.name}</span>
              {hover.equipped && <span className="rounded bg-[#75dda4] px-1.5 text-[9px] font-extrabold text-[#0b2418]">HELD</span>}
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-[#9aa5b1]">{hover.toolTip || hover.desc}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9.5px] text-[#7d8896]">
              <span>{hover.stats}</span>
              {hover.cooldownMax > 0 && <span>{hover.cooldownMax}s cooldown</span>}
              {hover.maxDurability > 0 && (
                <span className={hover.durability / hover.maxDurability <= 0.4 ? "text-[#ff9e9e]" : ""}>
                  durability {Math.max(0, hover.durability)}/{hover.maxDurability}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[9px] text-[#6f7a88]">
              <Hand size={9} /> click or press {hover.slot >= 0 ? hover.slot + 1 : "B"} to {hover.equipped ? "put away" : "equip"}
              {!hover.canBeDropped && <span className="ml-1 text-[#a1906a]">· can&apos;t be dropped</span>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
