"use client";

import { useEffect, useState } from "react";
import {
  Blocks,
  Box,
  CircleUserRound,
  Clock,
  FilePlus2,
  Globe,
  Hand,
  Keyboard,
  Layers,
  Moon,
  Mountain,
  Play,
  Plus,
  SquareDashed,
  X,
} from "lucide-react";
import { PLACE_TEMPLATES } from "@/lib/studio/data";
import { StudioEngine } from "@/lib/studio/engine";
import { useStudio } from "@/lib/studio/store";
import { useWeb } from "@/lib/studio/webstore";
import { useStudioCtx } from "./context";

const TEMPLATE_ICONS: Record<string, typeof Box> = {
  grid: Layers,
  grass: Mountain,
  stairs: Play,
  moon: Moon,
  square: SquareDashed,
  wave: Hand,
};

/**
 * Roblox Studio-style start page: template gallery + "continue editing"
 * the autosaved place. Shown on launch and reopenable any time.
 */
export function StartPage() {
  const open = useStudio((s) => s.startPageOpen);
  const setStartPageOpen = useStudio((s) => s.setStartPageOpen);
  const autosaveInfo = useStudio((s) => s.autosaveInfo);
  const { engine } = useStudioCtx();
  const [leaving, setLeaving] = useState(false);

  const dismiss = (fn?: () => void) => {
    setLeaving(true);
    fn?.();
    setTimeout(() => {
      setStartPageOpen(false);
      setLeaving(false);
    }, 140);
  };

  const startTemplate = (id: string) => {
    engine?.newPlace(id);
    dismiss();
  };

  /** Keep whatever is already open (first dismiss after launch loads the autosave). */
  const enterEditor = () => {
    dismiss(() => {
      if (!engine) return;
      if (engine.getPartCount() === 0 && !engine.tryLoadLocal()) engine.newPlace();
    });
  };

  const continueEditing = () => {
    if (!engine) return;
    if (engine.getPartCount() === 0 && !engine.tryLoadLocal()) engine.newPlace();
    dismiss();
  };

  // refresh the autosave card every time the page opens
  useEffect(() => {
    if (!open) return;
    const peek = StudioEngine.peekLocal();
    useStudio.getState().setAutosaveInfo(peek ? { name: peek.name, parts: peek.parts } : null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") enterEditor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
     
  }, [open, engine]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[1000] flex flex-col bg-[#141518]/97 backdrop-blur-sm transition-opacity duration-150 ${leaving ? "opacity-0" : "opacity-100"}`}
    >
      {/* top bar */}
      <div className="flex items-center gap-3 border-b border-[#34373c] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-[#75dda4] to-[#2f9e77] text-[#0e241a]">
            <Blocks size={17} strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[14px] font-semibold tracking-wide">Blockyard Studio</div>
            <div className="text-[9.5px] text-[#8b9099]">Roblox-style creation suite</div>
          </div>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => useWeb.getState().exitStudio()}
          className="studio-btn h-8 gap-1.5 px-3 text-[11px] font-semibold text-[#8ec5ff] border border-[#2c4a5a] bg-[#1b2b33] hover:bg-[#213844]"
          title="Back to the website (home, friends, games)"
        >
          <Globe size={13} /> Website
        </button>
        <button
          type="button"
          onClick={enterEditor}
          className="studio-btn h-8 gap-1.5 px-3 text-[11px] font-semibold text-[#c8ccd2]"
          title="Skip to the editor (loads your autosaved place or a Baseplate)"
        >
          <X size={13} /> Skip to editor
        </button>
      </div>

      {/* content */}
      <div className="studio-scroll flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1060px] px-6 pb-10 pt-8">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b9099]">Start page</div>
          <h1 className="mb-1 text-[26px] font-bold leading-tight text-[#e8eaed]">What do you want to build today?</h1>
          <p className="mb-7 max-w-[560px] text-[12.5px] leading-relaxed text-[#9aa0a8]">
            Pick a template to start a new place, or continue where you left off. Everything you build autosaves to this
            browser and can be exported to a <span className="text-[#c8ccd2]">.rbxly.json</span> place file.
          </p>

          {/* continue card */}
          {autosaveInfo && (
            <div className="mb-8">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b9099]">
                <Clock size={12} /> Continue
              </div>
              <button
                type="button"
                onClick={continueEditing}
                className="group flex w-full items-center gap-4 rounded-lg border border-[#2c5a3d] bg-gradient-to-r from-[#1b2b21] to-[#1e2023] p-4 text-left transition-colors hover:border-[#3d9e6a]"
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-[#75dda4]/15 text-[#75dda4]">
                  <CircleUserRound size={24} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-[#e8eaed]">“{autosaveInfo.name}”</div>
                  <div className="text-[11px] text-[#9aa0a8]">
                    Your autosaved place · {autosaveInfo.parts} part{autosaveInfo.parts === 1 ? "" : "s"}
                  </div>
                </div>
                <span className="studio-btn h-8 shrink-0 gap-1.5 px-3 text-[11px] font-semibold text-[#0e241a] bg-[#75dda4] group-hover:bg-[#8ce6a5]">
                  <Play size={12} strokeWidth={2.6} /> Continue editing
                </span>
              </button>
            </div>
          )}

          {/* templates */}
          <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b9099]">
            <FilePlus2 size={12} /> New place
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {PLACE_TEMPLATES.map((t) => {
              const Icon = TEMPLATE_ICONS[t.icon] ?? Box;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => startTemplate(t.id)}
                  className="group overflow-hidden rounded-lg border border-[#34373c] bg-[#1b1d20] text-left transition-all hover:border-[#5a6270] hover:brightness-110"
                >
                  <div className={`relative flex h-[110px] items-center justify-center bg-gradient-to-br ${t.accent}`}>
                    <Icon size={44} strokeWidth={1.4} className="text-white/85 drop-shadow" />
                    <div className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/35 text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
                      <Plus size={13} strokeWidth={2.6} />
                    </div>
                  </div>
                  <div className="p-2.5">
                    <div className="text-[12.5px] font-semibold text-[#e8eaed]">{t.name}</div>
                    <div className="mt-0.5 text-[10px] leading-snug text-[#9aa0a8]">{t.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* hints */}
          <div className="mt-8 grid gap-2 rounded-lg border border-[#2a2d31] bg-[#1b1d20] p-4 text-[11px] leading-relaxed text-[#9aa0a8] md:grid-cols-2">
            <div className="flex items-start gap-2">
              <Keyboard size={14} className="mt-0.5 shrink-0 text-[#8fa3bd]" />
              <span>
                <span className="text-[#c8ccd2]">Shortcuts:</span> Ctrl+1..4 tools · Ctrl+Z undo · Ctrl+D duplicate · Ctrl+G group · F focus · F5 play
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Blocks size={14} className="mt-0.5 shrink-0 text-[#8fa3bd]" />
              <span>
                <span className="text-[#c8ccd2]">Tip:</span> right-click rows in the Explorer to insert Parts, Models,
                Folders, SpawnLocations and dummy avatar rigs.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
