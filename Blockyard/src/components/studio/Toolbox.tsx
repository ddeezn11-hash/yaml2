"use client";

import { useMemo, useState } from "react";
import { Boxes, Film, Map as MapIcon, Package, Sparkles, Swords, Upload, Wrench, X } from "lucide-react";
import { GEAR_CATALOG, PLACE_TEMPLATES, TOOLBOX_TEMPLATES, uid, type GearCatalogItem } from "@/lib/studio/data";
import type { CustomToolData } from "@/lib/studio/types";
import { ANIM_PRESETS, portableToAnimation, presetToAnimation } from "@/lib/studio/animlibrary";
import { platformSnapshot, timeAgo, usePlatform, type PublishedAsset } from "@/lib/studio/platform";
import { useStudio } from "@/lib/studio/store";
import { useWeb } from "@/lib/studio/webstore";
import { useStudioCtx } from "./context";

/* ------------------------------------------------------------------ */
/* Toolbox — the Creator Store inside Studio. Browse models, maps,     */
/* animations and classic gear (seeded + community published + your    */
/* saved ones), insert them into the place, and publish your own.      */
/* ------------------------------------------------------------------ */

type Tab = "models" | "gear" | "maps" | "animations";

/** Short stat summary for a gear catalog card. */
function gearStats(g: Pick<CustomToolData, "behavior" | "damage" | "reach" | "healAmount" | "speedMult" | "jumpMult">): string {
  switch (g.behavior) {
    case "sword": return `${g.damage} dmg · ${g.reach} stud reach`;
    case "gun": return `${g.damage} dmg per shot`;
    case "heal": return `+${g.healAmount} health per use`;
    case "speed": return `WalkSpeed ×${g.speedMult}`;
    case "gravity": return `JumpPower ×${g.jumpMult}, slow fall`;
    case "teleport": return `Blink ${Math.max(10, Math.round(g.reach * 5))} studs forward`;
    case "flashlight": return "Click to toggle the beam";
    case "script": return "Fully scriptable — connect its events in code";
  }
}

const SEED_MODEL_ICONS = ["🌳", "💡", "🏠", "📐", "🏛️", "🛤️"];

export function Toolbox() {
  const open = useStudio((s) => s.toolboxOpen);
  if (!open) return null;
  return <ToolboxBody />;
}

function ToolboxBody() {
  const setOpen = useStudio((s) => s.setToolboxOpen);
  const bumpParts = useStudio((s) => s.bumpParts);
  const session = useWeb((s) => s.session);
  const savedAssets = useWeb((s) => s.savedAssets);
  const platformVersion = usePlatform((s) => s.version);
  const { engine } = useStudioCtx();
  const presetTab = useStudio((s) => s.toolboxTab);
  const [tab, setTabState] = useState<Tab>((presetTab as Tab | null) ?? "models");
  const setTab = (t: Tab) => {
    setTabState(t);
    useStudio.getState().setToolboxTab(t);
  };
  const [q, setQ] = useState("");
  const [toolsVersion, setToolsVersion] = useState(0); // refresh StarterPack list

  const starterTools = useMemo(() => engine?.getTools() ?? [], [engine, toolsVersion]);
  const gearCatalog = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? GEAR_CATALOG.filter((g) => g.name.toLowerCase().includes(needle)) : GEAR_CATALOG;
  }, [q]);

  const addGear = (g: GearCatalogItem) => {
    if (!engine) return;
    try {
      engine.addTool({
        name: g.name,
        icon: g.icon,
        behavior: g.behavior,
        damage: g.damage,
        reach: g.reach,
        speedMult: g.speedMult,
        jumpMult: g.jumpMult,
        healAmount: g.healAmount,
        handleShape: g.handleShape,
        handleColor: g.handleColor,
        desc: g.desc,
        toolTip: g.toolTip,
        requiresHandle: g.requiresHandle,
        canBeDropped: g.canBeDropped,
        cooldown: g.cooldown,
        maxDurability: g.maxDurability,
      });
      bumpParts();
      setToolsVersion((v) => v + 1);
    } catch {
      /* read-only gate already logged a warning */
    }
  };

  const removeTool = (id: string) => {
    engine?.deleteTool(id);
    bumpParts(); // keep the Explorer's StarterPack tree in sync
    setToolsVersion((v) => v + 1);
  };

  const assets = useMemo(() => {
    void platformVersion;
    return platformSnapshot().assets.filter((a) => !a.removed);
  }, [platformVersion]);

  const community = (kind: PublishedAsset["kind"]) =>
    assets.filter((a) => a.kind === kind && a.name.toLowerCase().includes(q.trim().toLowerCase()));
  const isMine = (a: PublishedAsset) => a.creator === session?.username;
  const isSaved = (a: PublishedAsset) => savedAssets.includes(a.id);
  const mine = (kind: PublishedAsset["kind"]) => community(kind).filter((a) => isMine(a) || isSaved(a));

  const insertTemplate = (label: string) => {
    if (!engine) return;
    const tpl = TOOLBOX_TEMPLATES.find((t) => t.label === label);
    if (!tpl) return;
    const at = engine.getCameraGroundPoint();
    engine.addParts(tpl.make(at), `Insert ${label}`);
    bumpParts();
  };

  const insertModelAsset = (a: PublishedAsset) => {
    if (!engine || !a.parts?.length) return;
    const modelId = engine.addModel(a.name).id;
    const at = engine.getCameraGroundPoint();
    // re-center the model on the camera's ground point
    const ox = a.parts[0]?.position[0] ?? 0;
    const oz = a.parts[0]?.position[2] ?? 0;
    engine.addParts(
      a.parts.map((p) => ({
        ...p,
        id: uid("part"),
        parentId: modelId,
        position: [p.position[0] - ox + at[0], p.position[1], p.position[2] - oz + at[2]] as [number, number, number],
      })),
      `Insert ${a.name}`,
    );
    bumpParts();
  };

  const loadMapAsset = (a: PublishedAsset) => {
    if (!engine || !a.place) return;
    if (!window.confirm(`Load the map "${a.name}"? This replaces your current place (undo works).`)) return;
    engine.loadState({ ...a.place, name: a.name }, true);
    bumpParts();
    engine.log("success", `Loaded map "${a.name}" (${a.place.parts.length} parts)`);
  };

  const applyAnimAsset = (a: PublishedAsset) => {
    if (!engine || !a.anim) return;
    const selModel = engine.selection.find((r) => r.kind === "model");
    const models = engine.explorerData().models;
    const modelId = selModel ? (selModel as { kind: "model"; id: string }).id : models[0]?.id;
    if (!modelId) {
      engine.log("warn", "No rig in the place — spawn an R6 Dummy from the Avatar tab first");
      return;
    }
    const parts = engine.getModelParts(modelId);
    const anim = portableToAnimation(a.anim, parts);
    if (!Object.keys(anim.tracks).length) {
      engine.log("warn", `"${a.name}" needs parts the selected rig doesn't have`);
      return;
    }
    engine.setModelAnimations(modelId, [anim]);
    bumpParts();
    engine.log("success", `Applied "${a.name}" — open the Animation Editor to preview`);
  };

  const applyPreset = (presetId: string) => {
    if (!engine) return;
    const preset = ANIM_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const selModel = engine.selection.find((r) => r.kind === "model");
    const models = engine.explorerData().models;
    const modelId = selModel ? (selModel as { kind: "model"; id: string }).id : models[0]?.id;
    if (!modelId) {
      engine.log("warn", "No rig in the place — spawn an R6 Dummy from the Avatar tab first");
      return;
    }
    const anim = presetToAnimation(preset, engine.getModelParts(modelId));
    if (!Object.keys(anim.tracks).length) {
      engine.log("warn", `Preset "${preset.name}" needs parts this rig doesn't have`);
      return;
    }
    engine.setModelAnimations(modelId, [anim]);
    bumpParts();
    engine.log("success", `Applied "${preset.name}" to ${models.find((m) => m.id === modelId)?.name} — open the Animation Editor to preview`);
  };

  /* ---------------------- publish helpers ---------------------- */

  const publishSelectionAsModel = () => {
    if (!engine || !session) return;
    const selParts = engine.selection.filter((r) => r.kind === "part");
    const selModels = engine.selection.filter((r) => r.kind === "model");
    let parts = selParts.map((r) => engine.getPartData(r.id)).filter(Boolean) as import("@/lib/studio/types").PartData[];
    for (const m of selModels) {
      parts = [...parts, ...engine.getModelParts((m as { kind: "model"; id: string }).id)];
    }
    if (!parts.length) {
      engine.log("warn", "Select parts or a model in the Explorer first — that's what gets published");
      return;
    }
    const name = window.prompt("Model name:", parts.length === 1 ? parts[0].name : "My Model");
    if (!name?.trim()) return;
    usePlatform.getState().publishAsset({
      kind: "model",
      name: name.trim(),
      desc: `${parts.length} part${parts.length === 1 ? "" : "s"} · published from Studio`,
      creator: session.username,
      creatorDisplay: session.displayName || session.username,
      icon: "📦",
      gradient: "from-[#4b5a68] to-[#2b343d]",
      price: 0,
      parts,
    });
    engine.log("success", `Published model "${name.trim()}" (${parts.length} parts) to the Creator Store`);
  };

  const publishPlaceAsMap = () => {
    if (!engine || !session) return;
    const name = window.prompt("Map name:", engine.serialize().name);
    if (!name?.trim()) return;
    usePlatform.getState().publishAsset({
      kind: "map",
      name: name.trim(),
      desc: `${engine.getPartCount()} parts · full place snapshot`,
      creator: session.username,
      creatorDisplay: session.displayName || session.username,
      icon: "🗺️",
      gradient: "from-[#3f7a3a] to-[#24501f]",
      price: 0,
      place: engine.serialize(),
    });
    engine.log("success", `Published map "${name.trim()}" to the Creator Store`);
  };

  return (
    <div className="fixed inset-0 z-[1030] grid place-items-center bg-black/55 p-4">
      <div className="flex h-[600px] max-h-[92vh] w-full max-w-[860px] flex-col overflow-hidden rounded-lg border border-[#3a3d42] bg-[#1b1d20] shadow-2xl">
        {/* header */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[#34373c] bg-[#17181b] px-4 py-2.5">
          <Sparkles size={16} className="text-[#e8c76a]" />
          <span className="text-[12.5px] font-semibold">Toolbox</span>
          <span className="text-[10px] text-[#7a7f88]">— the Creator Store: models, gear, maps and animations</span>
          <div className="flex-1" />
          <button type="button" className="studio-btn h-7 gap-1.5 px-2.5 text-[11px] font-semibold text-[#0e241a] bg-[#75dda4] hover:bg-[#8ce6a5]" onClick={publishSelectionAsModel} title="Publish the selected parts/model to the Creator Store">
            <Upload size={12} /> Publish Model
          </button>
          <button type="button" className="studio-btn h-7 gap-1.5 px-2.5 text-[11px] font-semibold text-[#8ec5ff] border border-[#2c4a5a] bg-[#1b2b33] hover:bg-[#213844]" onClick={publishPlaceAsMap} title="Publish this whole place as a reusable map">
            <Upload size={12} /> Publish Map
          </button>
          <button type="button" className="studio-btn h-7 w-7" onClick={() => setOpen(false)} title="Close">
            <X size={14} />
          </button>
        </div>

        {/* tabs + search */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#34373c] px-4 py-2">
          {([
            ["models", "Models", Boxes],
            ["gear", "Gear", Swords],
            ["maps", "Maps", MapIcon],
            ["animations", "Animations", Film],
          ] as [Tab, string, typeof Boxes][]).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`studio-btn h-7 gap-1.5 px-3 text-[11px] font-semibold ${tab === id ? "text-[#0e241a] bg-[#75dda4]" : ""}`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
          <div className="flex-1" />
          <input
            className="studio-input h-7 w-52 text-[11px]"
            placeholder={tab === "gear" ? "Search classic gear…" : "Search community assets…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* body */}
        <div className="studio-scroll min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "models" && (
            <>
              <GroupLabel icon={<Wrench size={11} />} label="Building kit" />
              <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {TOOLBOX_TEMPLATES.map((t, i) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => insertTemplate(t.label)}
                    className="flex items-center gap-2 rounded-lg border border-[#2a2d31] bg-[#17181b] p-2.5 text-left transition-colors hover:border-[#75dda4]"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#23262b] text-[18px]">{SEED_MODEL_ICONS[i % SEED_MODEL_ICONS.length]}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11.5px] font-semibold text-[#c8ccd2]">{t.label}</span>
                      <span className="block text-[9px] text-[#7a7f88]">{t.make([0, 0, 0]).length} parts · insert</span>
                    </span>
                  </button>
                ))}
              </div>

              <AssetGrid
                label="From the community"
                assets={community("model")}
                mine={mine("model")}
                actionLabel="Insert"
                onAction={insertModelAsset}
                emptyText="No community models yet — publish one with the button above!"
              />
            </>
          )}

          {tab === "gear" && (
            <>
              {/* StarterPack strip — what players spawn with */}
              <div className="mb-2 flex items-center gap-2">
                <GroupLabel icon={<Package size={11} />} label={`StarterPack — tools every player spawns with (${starterTools.length})`} />
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    useStudio.getState().setToolCreatorOpen(true);
                  }}
                  className="studio-btn h-7 gap-1.5 px-2.5 text-[11px] font-semibold text-[#8ec5ff] border border-[#2c4a5a] bg-[#1b2b33] hover:bg-[#213844]"
                  title="Design a custom tool from scratch"
                >
                  <Wrench size={12} /> Design your own
                </button>
              </div>
              {starterTools.length === 0 ? (
                <div className="mb-4 rounded-md border border-dashed border-[#2a2d31] px-3 py-2.5 text-[11px] text-[#7a7f88]">
                  Empty — add classic gear from the catalog below, or design a custom tool with the Tool Creator.
                </div>
              ) : (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {starterTools.map((t) => (
                    <span key={t.id} className="flex items-center gap-1.5 rounded-full border border-[#3a3d42] bg-[#141517] py-1 pl-2.5 pr-1.5 text-[11px] text-[#c8ccd2]">
                      <span className="text-[13px] leading-none">{t.icon}</span>
                      {t.name}
                      <button
                        type="button"
                        onClick={() => removeTool(t.id)}
                        className="grid h-4 w-4 place-items-center rounded-full bg-[#2a2d31] text-[#8a96a5] hover:bg-[#5a2e2e] hover:text-[#ff9e9e]"
                        title={`Remove ${t.name} from StarterPack`}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="mb-4 rounded-md border border-[#4a4218] bg-[#2b271b] px-3 py-2 text-[10px] leading-relaxed text-[#e8c76a]">
                Roblox pattern: gear added here is a <b>Tool template</b> in StarterPack. On spawn every player gets a copy in their
                Backpack — press <b>1-9</b> to equip, click to activate, <b>Backspace</b> to drop, <b>E</b> to pick up, <b>B</b> for the full bag.
              </div>

              {/* classic catalog */}
              <GroupLabel icon={<Swords size={11} />} label={`Classic gear catalog (${gearCatalog.length})`} />
              {gearCatalog.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#2a2d31] p-5 text-center text-[11px] text-[#7a7f88]">
                  No gear matches “{q}”. Clear the search to see the full catalog.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {gearCatalog.map((g) => {
                    const added = starterTools.some((t) => t.name === g.name);
                    return (
                      <div key={g.name} className="flex flex-col rounded-lg border border-[#2a2d31] bg-[#17181b] p-2.5">
                        <div className="flex items-start gap-2">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#23262b] text-[18px]">{g.icon}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-[11.5px] font-semibold text-[#c8ccd2]">{g.name}</span>
                            <span className="block truncate text-[9px] text-[#7a8f88]">{g.era}</span>
                          </span>
                        </div>
                        <span className="mt-1.5 block truncate text-[9.5px] text-[#8a96a5]" title={g.desc}>{gearStats(g)}</span>
                        <button
                          type="button"
                          disabled={added}
                          onClick={() => addGear(g)}
                          className={`mt-2 rounded-md px-2 py-1 text-[9.5px] font-bold transition-colors ${
                            added
                              ? "cursor-default bg-[#1f3a2a] text-[#75dda4]"
                              : "bg-[#22252a] text-[#8ce6a5] hover:bg-[#2a3a2f]"
                          }`}
                        >
                          {added ? "In StarterPack" : "Add to StarterPack"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "maps" && (
            <>
              <GroupLabel icon={<MapIcon size={11} />} label="Starter maps" />
              <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {PLACE_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (!engine) return;
                      if (!window.confirm(`Load the "${t.name}" map? This replaces your current place (undo works).`)) return;
                      engine.loadTemplateOnly(t.id, t.name);
                      bumpParts();
                    }}
                    className={`flex items-center gap-2 rounded-lg border border-[#2a2d31] bg-gradient-to-br ${t.accent} p-2.5 text-left transition-transform hover:-translate-y-0.5`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[11.5px] font-bold text-white">{t.name}</span>
                      <span className="block truncate text-[9px] text-white/70">{t.desc}</span>
                    </span>
                  </button>
                ))}
              </div>

              <AssetGrid
                label="From the community"
                assets={community("map")}
                mine={mine("map")}
                actionLabel="Load map"
                onAction={loadMapAsset}
                emptyText="No community maps yet — publish this place as a map!"
              />
            </>
          )}

          {tab === "animations" && (
            <>
              <GroupLabel icon={<Film size={11} />} label="Preset clips" />
              <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {ANIM_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className="flex items-center gap-2 rounded-lg border border-[#2a2d31] bg-[#17181b] p-2.5 text-left transition-colors hover:border-[#e8c76a]"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#23262b] text-[18px]">{p.icon}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11.5px] font-semibold text-[#c8ccd2]">{p.name}</span>
                      <span className="block truncate text-[9px] text-[#7a8f88]">{p.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="mb-4 rounded-md border border-[#4a4218] bg-[#2b271b] px-3 py-2 text-[10px] leading-relaxed text-[#e8c76a]">
                Presets apply to the selected rig (or the first model). Open the Avatar tab → Animation Editor to preview and edit keyframes.
              </div>

              <AssetGrid
                label="From the community"
                assets={community("animation")}
                mine={mine("animation")}
                actionLabel="Apply to rig"
                onAction={applyAnimAsset}
                emptyText="No community animations yet — publish one from the Animation Editor!"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#8b9099]">
      {icon} {label}
    </div>
  );
}

function AssetGrid({
  label,
  assets,
  mine,
  actionLabel,
  onAction,
  emptyText,
}: {
  label: string;
  assets: PublishedAsset[];
  mine: PublishedAsset[];
  actionLabel: string;
  onAction: (a: PublishedAsset) => void;
  emptyText: string;
}) {
  const [onlyMine, setOnlyMine] = useState(false);
  const list = onlyMine ? mine : assets;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#8b9099]">
          <Sparkles size={11} /> {label}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setOnlyMine((v) => !v)}
          className={`rounded-full px-2.5 py-0.5 text-[9.5px] font-semibold ${onlyMine ? "bg-[#75dda4] text-[#0e241a]" : "bg-[#22252a] text-[#9aa0a8] hover:bg-[#2a2d31]"}`}
        >
          My assets ({mine.length})
        </button>
      </div>
      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#2a2d31] p-5 text-center text-[11px] text-[#7a7f88]">{emptyText}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-lg border border-[#2a2d31] bg-[#17181b] p-2.5">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md bg-gradient-to-br ${a.gradient} text-[18px]`}>{a.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] font-semibold text-[#c8ccd2]">{a.name}</span>
                <span className="block truncate text-[9px] text-[#7a8f88]">@{a.creator} · {timeAgo(a.createdAt)}</span>
              </span>
              <button
                type="button"
                onClick={() => onAction(a)}
                className="shrink-0 rounded-md bg-[#22252a] px-2 py-1 text-[9.5px] font-bold text-[#8ce6a5] hover:bg-[#2a2d31]"
              >
                {actionLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
