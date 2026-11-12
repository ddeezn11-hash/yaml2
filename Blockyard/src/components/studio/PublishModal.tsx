"use client";

import { useMemo, useState } from "react";
import { Check, Globe, Hexagon, X } from "lucide-react";
import { useStudio } from "@/lib/studio/store";
import { useWeb } from "@/lib/studio/webstore";
import { platformSnapshot, usePlatform } from "@/lib/studio/platform";
import { useStudioCtx } from "./context";

/* ------------------------------------------------------------------ */
/* Publish the current place to the Blockyard website. Set a paid     */
/* access price in Robux, pick an icon and genre, and your game      */
/* appears on the homepage with a Play button.                        */
/* ------------------------------------------------------------------ */

const ICONS = ["🎮", "🏰", "🌋", "🏎️", "⚔️", "👻", "🐱", "🍕", "💎", "🏃", "🎯", "🧟", "🌊", "🚀", "🎪", "🏆", "🗼", "🌲", "💰", "🤖", "❄️", "🎵"];
const GENRES = ["Obby", "Tycoon", "Roleplay", "Fighting", "Racing", "Horror", "Simulator", "Survival", "Social", "Casual"];
const GRADIENTS = [
  "from-[#e74c3c] via-[#c0392b] to-[#7b241c]",
  "from-[#f39c12] via-[#e67e22] to-[#d35400]",
  "from-[#00b894] via-[#10ac84] to-[#0e8c6e]",
  "from-[#0984e3] via-[#076fbd] to-[#05568c]",
  "from-[#8e44ad] via-[#6c3483] to-[#4a235a]",
  "from-[#2c3e50] via-[#34495e] to-[#1a252f]",
];

export function PublishModal() {
  const open = useStudio((s) => s.publishOpen);
  const setOpen = useStudio((s) => s.setPublishOpen);
  const placeName = useStudio((s) => s.placeName);
  const session = useWeb((s) => s.session);
  const platformVersion = usePlatform((s) => s.version);
  const { engine } = useStudioCtx();

  const [name, setName] = useState(placeName);
  const [desc, setDesc] = useState("");
  const [icon, setIcon] = useState("🎮");
  const [genre, setGenre] = useState("Obby");
  const [price, setPrice] = useState(0);
  const [published, setPublished] = useState<string | null>(null);

  const existing = useMemo(() => {
    void platformVersion;
    if (!session) return null;
    return platformSnapshot().games.find((g) => g.creator === session.username && g.name === name.trim()) ?? null;
  }, [session, name, platformVersion]);

  if (!open) return null;

  const publish = () => {
    if (!engine || !session) return;
    // never serialize mid-play-test: part poses are animated at that moment
    if (engine.playing) {
      engine.log("warn", "Stop the play test before publishing — the place is mid-animation right now");
      return;
    }
    const trimmed = name.trim() || "Untitled Experience";
    const game = usePlatform.getState().publishGame({
      id: existing?.id,
      name: trimmed,
      desc: desc.trim() || "A brand new Blockyard experience.",
      creator: session.username,
      creatorDisplay: session.displayName || session.username,
      icon,
      gradient: GRADIENTS[ICONS.indexOf(icon) % GRADIENTS.length] ?? GRADIENTS[0],
      genre,
      price: Math.max(0, Math.min(10000, Math.round(price) || 0)),
      templateId: "baseplate",
      placeData: engine.serialize(),
    });
    setPublished(trimmed);
    engine.log("success", existing ? `Updated "${trimmed}" — players keep their access` : `Published "${trimmed}" to Blockyard! It's live on the homepage`);
  };

  return (
    <div className="fixed inset-0 z-[1080] grid place-items-center bg-black/60 p-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-lg border border-[#3a3d42] bg-[#1b1d20] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center gap-2.5 border-b border-[#34373c] bg-[#17181b] px-4 py-3">
          <Globe size={16} className="text-[#8ec5ff]" />
          <span className="text-[13px] font-semibold">{existing ? "Update published game" : "Publish to Blockyard"}</span>
          <span className="text-[10px] text-[#7a7f88]">— your game goes live on the website homepage</span>
          <div className="flex-1" />
          <button type="button" className="studio-btn h-7 w-7" onClick={() => setOpen(false)} title="Close">
            <X size={14} />
          </button>
        </div>

        {published ? (
          <div className="p-8 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-[#1b2b21] text-[#8ce6a5]">
              <Check size={26} strokeWidth={2.6} />
            </div>
            <div className="text-[16px] font-bold text-[#c8ccd2]">“{published}” is live!</div>
            <div className="mx-auto mt-1 max-w-[380px] text-[12px] leading-relaxed text-[#9aa0a8]">
              Players can find it on the homepage under “From the Community”, join it full-screen with their character,
              and pay your entry fee if you set one. Publish again with the same name to update it.
            </div>
            <button
              type="button"
              className="studio-btn mt-5 h-9 px-5 text-[12px] font-semibold text-[#0e241a] bg-[#75dda4] hover:bg-[#8ce6a5]"
              onClick={() => {
                setOpen(false);
                setPublished(null);
                useWeb.getState().exitStudio();
              }}
            >
              <Globe size={13} /> View on the website
            </button>
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto p-4">
            {/* icon picker */}
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#8b9099]">Icon</div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`grid h-9 w-9 place-items-center rounded-lg border text-[18px] transition-colors ${
                    icon === ic ? "border-[#75dda4] bg-[#1b2b21]" : "border-[#2a2d31] bg-[#17181b] hover:border-[#4a4f57]"
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>

            {/* name */}
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#8b9099]">Name</div>
            <input
              className="studio-input mb-3 h-9 w-full text-[12.5px]"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />

            {/* desc */}
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#8b9099]">Description</div>
            <textarea
              className="studio-input mb-3 h-[64px] w-full resize-none text-[12px]"
              placeholder="What makes your game fun?"
              value={desc}
              maxLength={240}
              onChange={(e) => setDesc(e.target.value)}
            />

            {/* genre + price */}
            <div className="flex flex-wrap gap-4">
              <div className="min-w-[180px] flex-1">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#8b9099]">Genre</div>
                <select className="studio-input h-9 w-full cursor-pointer text-[12px]" value={genre} onChange={(e) => setGenre(e.target.value)}>
                  {GENRES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[180px] flex-1">
                <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#8b9099]">
                  <Hexagon size={10} className="text-[#ffd77a]" /> Paid access (Robux)
                </div>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  className="studio-input h-9 w-full text-[12px]"
                  value={price}
                  onChange={(e) => setPrice(Math.max(0, Math.min(10000, Number(e.target.value) || 0)))}
                />
                <div className="mt-1 text-[9.5px] leading-snug text-[#7a7f88]">
                  {price > 0 ? `Players pay ${price} R$ once to enter — you keep 90%.` : "0 = free to play for everyone."}
                </div>
              </div>
            </div>

            {/* publish info */}
            <div className="mt-4 rounded-md border border-[#2c4a5a] bg-[#1b2b33] p-2.5 text-[10.5px] leading-relaxed text-[#8fb4d6]">
              Publishing saves a snapshot of this place ({engine?.getPartCount() ?? 0} parts, scripts, lighting).
              {existing ? " An existing game with this name will be updated in place." : ""}
            </div>

            <button
              type="button"
              onClick={publish}
              disabled={!name.trim()}
              className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#00b06f] text-[13px] font-bold text-[#0e241a] transition-colors hover:bg-[#009a61] disabled:opacity-40"
            >
              <Globe size={15} /> {existing ? "Update game" : "Publish game"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
