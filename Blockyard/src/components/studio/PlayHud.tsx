"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, Square } from "lucide-react";
import { useStudio } from "@/lib/studio/store";
import { useStudioCtx } from "./context";
import { InventoryHud } from "@/components/game/InventoryHud";
import type { GameHud } from "@/lib/studio/playmode";

/** In-game HUD shown while the play test runs: chat, backpack, hints, stop button. */
export function PlayHud() {
  const { net, stopPlay, play } = useStudioCtx();
  const playing = useStudio((s) => s.playing);
  const pointerLocked = useStudio((s) => s.pointerLocked);
  const chatMessages = useStudio((s) => s.chatMessages);
  const pushChat = useStudio((s) => s.pushChat);
  const clearChat = useStudio((s) => s.clearChat);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [hud, setHud] = useState<GameHud | null>(null);

  // poll the play controller for backpack/health state while playing
  // (stale hud is harmless: the whole HUD unmounts when playing stops)
  useEffect(() => {
    if (!playing) return;
    const tick = () => setHud(play?.getHud() ?? null);
    tick();
    const iv = setInterval(tick, 300);
    return () => clearInterval(iv);
  }, [playing, play]);

  // "/" focuses chat, Enter sends — Roblox style.
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  if (!playing) return null;

  const send = () => {
    const text = draft.trim().slice(0, 180);
    if (!text) {
      inputRef.current?.blur();
      return;
    }
    // ":cmd" / ";cmd" — HD-Admin style owner commands
    if (text.startsWith(":") || text.startsWith(";")) {
      const res = play?.runCommand(text);
      if (res) {
        pushChat("", res.message, true);
        if (res.action === "clear-chat") clearChat("Chat cleared.");
      }
    // "/e name" — chat emotes, available to EVERY player
    } else if (/^\/e\s+\S/i.test(text)) {
      const res = play?.playEmote(text.replace(/^\/e\s+/i, ""));
      if (res) pushChat("", res.message, true);
    } else {
      pushChat("You", text);
      net?.send({ type: "chat", text });
    }
    setDraft("");
    inputRef.current?.blur();
  };

  return (
    <>
      {/* running banner */}
      <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[#3d6ea5] bg-[rgba(21,32,46,.85)] px-3.5 py-1.5 text-[11px] font-semibold text-[#bcdcf7] shadow-lg backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#5ec46a]" />
          PLAY TEST RUNNING
          <span className="font-normal text-[#8fb4d6]">Shift+F5 to stop</span>
          <button
            type="button"
            className="ml-1 flex items-center gap-1 rounded bg-[#7a2e2e] px-2 py-0.5 text-[10.5px] text-[#ffd2d2] hover:bg-[#963a3a]"
            onClick={stopPlay}
          >
            <Square size={9} /> Stop
          </button>
        </div>
      </div>

      {/* health + equipped tool (top-left, like the web game player) */}
      {hud && (
        <div className="absolute left-3 top-3 z-10 w-[210px] select-none">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[rgba(18,20,24,.72)] backdrop-blur">
            <div className="px-2.5 pb-1 pt-1.5 text-[9px] font-bold uppercase tracking-wide text-[#9fb0c3]">
              {hud.god ? "God mode" : "Health"}
            </div>
            <div className="mx-2.5 mb-1 h-2.5 overflow-hidden rounded-full bg-black/50">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${(hud.god ? 1 : Math.max(0, hud.health / hud.maxHealth)) * 100}%`,
                  background: hud.god
                    ? "linear-gradient(90deg,#f1c40f,#fff67b)"
                    : hud.health / hud.maxHealth > 0.5 ? "#2ecc71" : hud.health / hud.maxHealth > 0.25 ? "#f39c12" : "#e74c3c",
                }}
              />
            </div>
            <div className="flex items-center justify-between px-2.5 pb-1.5 text-[9.5px] text-[#9aa0a6]">
              <span>{hud.god ? "∞" : `${Math.round(hud.health)} / ${hud.maxHealth}`}</span>
              {hud.equipped && (
                <span className="font-bold text-[#8fd3ab]">
                  {hud.backpack.find((t) => t.uid === hud.equipped)?.icon} {hud.backpack.find((t) => t.uid === hud.equipped)?.name}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* click-to-capture prompt */}
      {!pointerLocked && (
        <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center">
          <div className="rounded-xl border border-white/20 bg-[rgba(18,20,24,.85)] px-6 py-4 text-center shadow-2xl backdrop-blur">
            <div className="text-[15px] font-bold text-white">Click to play</div>
            <div className="mt-1 text-[11px] text-[#b9c6d7]">
              WASD move · SPACE jump · SHIFT sprint · V camera · R respawn · ESC release
            </div>
          </div>
        </div>
      )}

      {/* chat */}
      <div className="absolute bottom-3 left-3 z-10 w-[min(340px,calc(100%-24px))]">
        <div className="studio-scroll mb-1.5 flex max-h-[168px] flex-col gap-1 overflow-y-auto rounded-lg">
          {chatMessages.map((m) => (
            <div
              key={m.id}
              className={`w-fit max-w-full rounded-md px-2.5 py-1 text-[11.5px] leading-snug backdrop-blur ${
                m.system ? "bg-[rgba(18,20,24,.55)] text-[#aab7c9] italic" : "bg-[rgba(18,20,24,.72)] text-[#e6ecf5]"
              }`}
            >
              {m.system ? m.text : <span><span className="font-bold text-[#8fd3ab]">{m.name}: </span>{m.text}</span>}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <MessageSquare size={13} className="shrink-0 text-[#8fa3bd]" />
          <input
            ref={inputRef}
            className="studio-play-hud-input"
            placeholder="Press / to chat…"
            value={draft}
            maxLength={180}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") send();
              if (e.key === "Escape") inputRef.current?.blur();
            }}
          />
          <button
            type="button"
            className="grid h-[33px] w-[33px] shrink-0 place-items-center rounded-lg bg-[#75dda4] text-[#0b2418] hover:bg-[#93edb9]"
            onClick={send}
            title="Send"
          >
            <Send size={14} />
          </button>
        </div>
      </div>

      {/* controls hint */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-lg border border-white/10 bg-[rgba(18,20,24,.6)] px-3 py-2 text-right text-[10px] leading-relaxed text-[#c4cdd9] backdrop-blur">
        <div><b className="text-white">WASD</b> move · <b className="text-white">SPACE</b> jump</div>
        <div><b className="text-white">SHIFT</b> sprint · <b className="text-white">V</b> camera</div>
        <div><b className="text-white">1-9</b> tools · <b className="text-white">B</b> backpack</div>
        <div><b className="text-white">Backspace</b> drop · <b className="text-white">E</b> pick up</div>
        <div><b className="text-white">R</b> respawn · <b className="text-white">/</b> chat</div>
        <div><b className="text-[#8fd3ab]">:cmds</b> owner commands · <b className="text-[#8fd3ab]">/e dance</b> emote</div>
        <button type="button" className="pointer-events-auto mt-1 text-[#8fd3ab] hover:underline" onClick={() => play?.requestLock()}>
          capture mouse
        </button>
      </div>

      {/* custom inventory (hotbar + BAG grid) replaces the old backpack */}
      {hud && (
        <InventoryHud
          hud={hud}
          equip={(uid) => play?.equipTool(uid)}
          drop={(uid) => play?.dropTool(uid)}
        />
      )}
    </>
  );
}
