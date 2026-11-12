"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Sparkles, Trash2, Wrench, X, Zap } from "lucide-react";
import { useStudio } from "@/lib/studio/store";
import { useStudioCtx } from "./context";
import { BRICK_COLORS, brickColorHex, normalizeToolData } from "@/lib/studio/data";
import type { CustomToolData, PartShape, ToolBehavior } from "@/lib/studio/types";

/* ------------------------------------------------------------------ */
/* Option catalogs                                                     */
/* ------------------------------------------------------------------ */

const ICONS = ["⚔️", "🔫", "💉", "🌀", "🎈", "🔦", "✨", "🔧", "🔨", "⚡", "🔮", "🧪", "🪄", "🛡️", "🪓", "🏏", "🧨"];

interface BehaviorMeta {
  label: string;
  blurb: string;
  activation: string;
}

const BEHAVIORS: Record<ToolBehavior, BehaviorMeta> = {
  sword: {
    label: "Sword / Melee",
    blurb: "Click to swing — damages every bot in front of you. Cooldown gates the swing (Tool.Enabled).",
    activation: "Left-click",
  },
  gun: {
    label: "Gun / Ranged",
    blurb: "Click to shoot an instant ray — the nearest bot on the line takes the damage.",
    activation: "Left-click",
  },
  heal: {
    label: "Medkit / Heal",
    blurb: "Click to restore your own health. Passive regen keeps running too.",
    activation: "Left-click",
  },
  speed: {
    label: "Speed Coil",
    blurb: "While equipped: your WalkSpeed is multiplied. Unequip to go back to normal.",
    activation: "Passive while equipped",
  },
  gravity: {
    label: "Gravity Coil",
    blurb: "While equipped: higher jumps and a slow, floaty fall.",
    activation: "Passive while equipped",
  },
  teleport: {
    label: "Teleport Wand",
    blurb: "Click to blink forward along your camera direction (reach × 5 studs).",
    activation: "Left-click",
  },
  flashlight: {
    label: "Flashlight",
    blurb: "Click to toggle a SpotLight beam attached to your character. Handleless-friendly.",
    activation: "Left-click toggles",
  },
  script: {
    label: "Scripted (advanced)",
    blurb: "No built-in behavior — connect Equipped / Activated / Unequipped in a Script or LocalScript. This is how real Roblox tools work.",
    activation: "Whatever you script",
  },
};

const SHAPES: PartShape[] = ["Block", "Sphere", "Wedge", "Cylinder", "CornerWedge"];

const PALETTE = [
  "Really red", "Deep orange", "New Yeller", "Lime green", "Cyan", "Really blue",
  "Magenta", "Pink", "Teal", "Toothpaste", "Lavender", "Hot pink",
  "Bright red", "Bright blue", "Bright green", "Black", "Medium stone grey", "Institutional white",
].filter((name) => BRICK_COLORS.some(([n]) => n === name));

interface Template {
  name: string;
  icon: string;
  behavior: ToolBehavior;
  damage: number;
  reach: number;
  speedMult: number;
  jumpMult: number;
  healAmount: number;
  handleShape: PartShape;
  handleColor: string;
  toolTip: string;
  requiresHandle: boolean;
  canBeDropped: boolean;
  cooldown: number;
  maxDurability: number;
}

const TEMPLATES: Template[] = [
  { name: "Classic Sword", icon: "⚔️", behavior: "sword", damage: 34, reach: 8, speedMult: 1, jumpMult: 1, healAmount: 0, handleShape: "Block", handleColor: "Medium stone grey", toolTip: "A classic blade. Click to swing.", requiresHandle: true, canBeDropped: true, cooldown: 0.45, maxDurability: 0 },
  { name: "Blaster", icon: "🔫", behavior: "gun", damage: 25, reach: 12, speedMult: 1, jumpMult: 1, healAmount: 0, handleShape: "Block", handleColor: "Really blue", toolTip: "Pew pew.", requiresHandle: true, canBeDropped: true, cooldown: 0.25, maxDurability: 0 },
  { name: "Medkit", icon: "💉", behavior: "heal", damage: 0, reach: 0, speedMult: 1, jumpMult: 1, healAmount: 40, handleShape: "Block", handleColor: "Really red", toolTip: "Click to heal.", requiresHandle: true, canBeDropped: true, cooldown: 1, maxDurability: 8 },
  { name: "Speed Coil", icon: "🌀", behavior: "speed", damage: 0, reach: 0, speedMult: 1.75, jumpMult: 1, healAmount: 0, handleShape: "Cylinder", handleColor: "Cyan", toolTip: "Zoom.", requiresHandle: true, canBeDropped: true, cooldown: 0, maxDurability: 0 },
  { name: "Gravity Coil", icon: "🎈", behavior: "gravity", damage: 0, reach: 0, speedMult: 1, jumpMult: 1.35, healAmount: 0, handleShape: "Cylinder", handleColor: "Magenta", toolTip: "Moon jumps.", requiresHandle: true, canBeDropped: true, cooldown: 0, maxDurability: 0 },
  { name: "Telewand", icon: "🪄", behavior: "teleport", damage: 0, reach: 6, speedMult: 1, jumpMult: 1, healAmount: 0, handleShape: "Cylinder", handleColor: "Lavender", toolTip: "Blink forward.", requiresHandle: true, canBeDropped: true, cooldown: 0.6, maxDurability: 0 },
  { name: "Flashlight", icon: "🔦", behavior: "flashlight", damage: 0, reach: 0, speedMult: 1, jumpMult: 1, healAmount: 0, handleShape: "Cylinder", handleColor: "New Yeller", toolTip: "Click to toggle the beam.", requiresHandle: true, canBeDropped: true, cooldown: 0.15, maxDurability: 0 },
];

/** Full form — every Roblox Tool property the runtime supports. */
type ToolForm = Omit<CustomToolData, "id"> & Required<Pick<CustomToolData, "toolTip" | "requiresHandle" | "canBeDropped" | "cooldown" | "maxDurability">>;

const DEFAULT_FORM: ToolForm = {
  name: "Classic Sword",
  icon: "⚔️",
  behavior: "sword",
  damage: 34,
  reach: 8,
  speedMult: 1.75,
  jumpMult: 1.35,
  healAmount: 40,
  handleShape: "Block",
  handleColor: "Medium stone grey",
  desc: "",
  toolTip: "",
  requiresHandle: true,
  canBeDropped: true,
  cooldown: 0.45,
  maxDurability: 0,
};

/* ------------------------------------------------------------------ */
/* Generated Luau example (educational — matches Roblox's Tool API)    */
/* ------------------------------------------------------------------ */

function luauExample(f: ToolForm): string {
  const b = f.behavior;
  const head = `-- ${f.name} — ${BEHAVIORS[b].label}
-- Build it in Studio: insert a Tool, add a Part named "Handle",
-- then parent the Tool to StarterPack so every player gets a copy.
local tool = script.Parent
local Players = game:GetService("Players")
local player = Players.LocalPlayer

tool.ToolTip = ${JSON.stringify(f.toolTip || f.name)}
tool.CanBeDropped = ${f.canBeDropped ? "true" : "false"}
tool.RequiresHandle = ${f.requiresHandle ? "true" : "false"}
-- Attributes carry the stats (server should own these, not the client):
tool:SetAttribute("Damage", ${Math.max(1, Math.round(f.damage))})
tool:SetAttribute("Cooldown", ${f.cooldown})
${f.maxDurability > 0 ? `tool:SetAttribute("Durability", ${f.maxDurability}) -- uses before it breaks` : "-- no durability: never breaks"}

local canUse = true
local function onActivated()
  if not canUse or not tool.Enabled then return end
  canUse = false
  task.delay(${f.cooldown}, function() canUse = true end)`;

  const body = (() => {
    switch (b) {
      case "sword":
        return `
  local character = tool.Parent
  local humanoid = character:FindFirstChildOfClass("Humanoid")
  for _, other in character.Parent:GetChildren() do
    local enemy = other:FindFirstChildOfClass("Humanoid")
    if enemy and other ~= character then
      enemy:TakeDamage(tool:GetAttribute("Damage"))
    end
  end`;
      case "gun":
        return `
  local mouse = player:GetMouse()
  local ray = Ray.new(tool.Handle.Position, mouse.Hit.lookVector * 150)
  local hit = workspace:FindPartOnRay(ray, tool.Parent)
  if hit then
    local enemy = hit.Parent:FindFirstChildOfClass("Humanoid")
    if enemy then enemy:TakeDamage(tool:GetAttribute("Damage")) end
  end`;
      case "heal":
        return `
  local humanoid = tool.Parent:FindFirstChildOfClass("Humanoid")
  if humanoid and humanoid.Health < humanoid.MaxHealth then
    humanoid.Health = math.min(humanoid.MaxHealth, humanoid.Health + ${Math.max(1, Math.round(f.healAmount))})
  end`;
      case "speed":
        return `
  -- passive tools apply their effect in Equipped/Unequipped instead`;
      case "gravity":
        return `
  -- passive tools apply their effect in Equipped/Unequipped instead`;
      case "teleport":
        return `
  local root = tool.Parent.HumanoidRootPart
  root.CFrame = root.CFrame + root.CFrame.LookVector * ${Math.max(10, Math.round(f.reach * 5))}`;
      case "flashlight":
        return `
  local beam = tool:FindFirstChild("Beam", true)
  if beam then beam.Enabled = not beam.Enabled end`;
    }
  })();

  const passive =
    b === "speed"
      ? `

tool.Equipped:Connect(function()
  local humanoid = tool.Parent:FindFirstChildOfClass("Humanoid")
  humanoid.WalkSpeed = 16 * ${Number(f.speedMult.toFixed(2))} -- your Speed setting
end)

tool.Unequipped:Connect(function()
  local humanoid = tool.Parent:FindFirstChildOfClass("Humanoid")
  humanoid.WalkSpeed = 16 -- back to normal
end)`
      : b === "gravity"
        ? `

tool.Equipped:Connect(function()
  local humanoid = tool.Parent:FindFirstChildOfClass("Humanoid")
  humanoid.UseJumpPower = true
  humanoid.JumpPower = 50 * ${Number(f.jumpMult.toFixed(2))} -- your Jump setting
end)

tool.Unequipped:Connect(function()
  local humanoid = tool.Parent:FindFirstChildOfClass("Humanoid")
  humanoid.JumpPower = 50
end)`
        : `

tool.Equipped:Connect(function()
  print("${f.name} equipped!")
end)

tool.Unequipped:Connect(function()
  print("${f.name} put away")
end)`;

  const tail = `
end

tool.Activated:Connect(onActivated)
${passive}

-- SECURITY: in a real game this LocalScript only *requests* the action;
-- the server validates it (remote.OnServerEvent + tool.Parent == character).`;
  return head + body + tail;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const num = (v: string) => Math.max(0, Number(v) || 0);

export function ToolCreator() {
  const open = useStudio((s) => s.toolCreatorOpen);
  const setOpen = useStudio((s) => s.setToolCreatorOpen);
  const { engine } = useStudioCtx();
  const [form, setForm] = useState<ToolForm>({ ...DEFAULT_FORM });
  const [version, setVersion] = useState(0); // refresh existing-tool list
  const [copied, setCopied] = useState(false);

  const existing = useMemo(
    () => (engine?.getTools() ?? []).map((t) => normalizeToolData(t)),
    [engine, version, open],
  );
  const behavior = BEHAVIORS[form.behavior];
  const hex = brickColorHex(form.handleColor);

  const set = (patch: Partial<ToolForm>) => setForm((f) => ({ ...f, ...patch }));

  const autoDesc = useMemo(() => {
    switch (form.behavior) {
      case "sword": return `Click to slash — ${form.damage} damage, ${form.reach}-stud reach`;
      case "gun": return `Click to shoot — ${form.damage} damage per hit`;
      case "heal": return `Click to heal +${form.healAmount} health`;
      case "speed": return `While equipped: ${Math.round((form.speedMult - 1) * 100)}% ${form.speedMult >= 1 ? "faster" : "slower"} walk speed`;
      case "gravity": return `While equipped: ${Math.round((form.jumpMult - 1) * 100)}% jump power, slow fall`;
      case "teleport": return `Click to blink ${Math.max(10, Math.round(form.reach * 5))} studs forward`;
      case "flashlight": return "Click to toggle the beam";
      case "script": return "Fully scriptable — connect Equipped / Activated in code";
    }
  }, [form.behavior, form.damage, form.reach, form.healAmount, form.speedMult, form.jumpMult]);

  if (!open) return null;

  const applyTemplate = (t: Template) => {
    setForm({
      name: t.name,
      icon: t.icon,
      behavior: t.behavior,
      damage: t.damage,
      reach: t.reach,
      speedMult: t.speedMult,
      jumpMult: t.jumpMult,
      healAmount: t.healAmount,
      handleShape: t.handleShape,
      handleColor: t.handleColor,
      desc: "",
      toolTip: t.toolTip,
      requiresHandle: t.requiresHandle,
      canBeDropped: t.canBeDropped,
      cooldown: t.cooldown,
      maxDurability: t.maxDurability,
    });
  };

  const insert = () => {
    if (!engine) return;
    const name = form.name.trim() || "Tool";
    try {
      engine.addTool({ ...form, name, desc: form.desc.trim() || autoDesc });
      useStudio.getState().bumpParts();
      setVersion((v) => v + 1);
    } catch {
      /* read-only gate already logged a warning */
    }
  };

  const remove = (id: string) => {
    engine?.deleteTool(id);
    useStudio.getState().bumpParts(); // refresh StarterPack in Explorer
    setVersion((v) => v + 1);
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(luauExample({ ...form, name: form.name.trim() || "Tool" }));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable */ }
  };

  const field = "h-7 w-full rounded border border-[#3a3d42] bg-[#141517] px-2 text-[11.5px] text-[#d7dade] outline-none focus:border-[#4a7ec2]";
  const label = "mb-1 block text-[9.5px] font-bold uppercase tracking-wide text-[#7a828e]";

  return createPortal(
    <div className="fixed inset-0 z-[1080] grid place-items-center bg-black/60 p-4" onClick={() => setOpen(false)}>
      <div
        className="studio-scroll max-h-[92vh] w-full max-w-[880px] overflow-y-auto rounded-lg border border-[#3a3d42] bg-[#1b1d20] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-2.5 border-b border-[#34373c] bg-[#17181b] px-4 py-3">
          <Wrench size={16} className="text-[#ffd479]" />
          <span className="text-[13px] font-semibold">Tool Creator</span>
          <span className="text-[10px] text-[#7a7f88]">— design a Roblox Tool and add it to StarterPack</span>
          <div className="flex-1" />
          <button type="button" className="studio-btn h-7 w-7" onClick={() => setOpen(false)} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_310px]">
          {/* ------------------------------ left: form ------------------------------ */}
          <div className="min-w-0">
            {/* templates */}
            <span className={label}>Start from a template</span>
            <div className="mb-4 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                    form.name === t.name
                      ? "border-[#5a97d6] bg-[rgba(58,110,175,.25)] text-white"
                      : "border-[#3a3d42] bg-[#141517] text-[#b7bdc6] hover:border-[#565b63] hover:text-white"
                  }`}
                >
                  <span className="text-[15px] leading-none">{t.icon}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{t.name}</span>
                    <span className="block truncate text-[9px] text-[#7a828e]">{BEHAVIORS[t.behavior].label}</span>
                  </span>
                </button>
              ))}
            </div>

            {/* name + icon */}
            <div className="mb-3 grid grid-cols-[1fr_190px] gap-3">
              <div>
                <label className={label} htmlFor="tc-name">Tool name</label>
                <input id="tc-name" className={field} value={form.name} maxLength={24}
                  onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div>
                <span className={label}>Backpack icon</span>
                <div className="studio-scroll flex h-7 items-center gap-0.5 overflow-x-auto rounded border border-[#3a3d42] bg-[#141517] px-1">
                  {ICONS.map((ic) => (
                    <button key={ic} type="button" onClick={() => set({ icon: ic })}
                      className={`h-5 w-5 shrink-0 rounded text-[13px] leading-none ${form.icon === ic ? "bg-[#3a6ea5]" : "hover:bg-[#2a2d31]"}`}>
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ToolTip */}
            <div className="mb-3">
              <label className={label} htmlFor="tc-tip">ToolTip — hover text shown in the custom inventory</label>
              <input id="tc-tip" className={field} value={form.toolTip} maxLength={60} placeholder="e.g. A trusty blade. Click to swing."
                onChange={(e) => set({ toolTip: e.target.value })} />
            </div>

            {/* behavior */}
            <span className={label}>Behavior — what the tool does</span>
            <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {(Object.keys(BEHAVIORS) as ToolBehavior[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => set({ behavior: b, cooldown: DEFAULT_FORM.cooldown })}
                  className={`rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                    form.behavior === b
                      ? "border-[#75dda4] bg-[rgba(38,74,53,.4)] text-white"
                      : "border-[#3a3d42] bg-[#141517] text-[#b7bdc6] hover:border-[#565b63] hover:text-white"
                  }`}
                >
                  <span className="block font-semibold">{BEHAVIORS[b].label}</span>
                  <span className="block truncate text-[9px] text-[#7a828e]">{BEHAVIORS[b].activation}</span>
                </button>
              ))}
            </div>
            <p className="mb-4 rounded-md border border-[#3a3d42] bg-[#141517] px-2.5 py-1.5 text-[10.5px] leading-relaxed text-[#9aa2ad]">
              {behavior.blurb}
            </p>

            {/* behavior params */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(form.behavior === "sword" || form.behavior === "gun") && (
                <div>
                  <label className={label} htmlFor="tc-dmg">Damage</label>
                  <input id="tc-dmg" type="number" min={1} max={1000} className={field} value={form.damage}
                    onChange={(e) => set({ damage: Math.max(1, num(e.target.value)) })} />
                </div>
              )}
              {(form.behavior === "sword" || form.behavior === "teleport") && (
                <div>
                  <label className={label} htmlFor="tc-reach">{form.behavior === "sword" ? "Reach (studs)" : "Reach (×5 = studs)"}</label>
                  <input id="tc-reach" type="number" min={1} max={40} className={field} value={form.reach}
                    onChange={(e) => set({ reach: Math.max(1, num(e.target.value)) })} />
                </div>
              )}
              {form.behavior === "heal" && (
                <div>
                  <label className={label} htmlFor="tc-heal">Heal amount</label>
                  <input id="tc-heal" type="number" min={1} max={1000} className={field} value={form.healAmount}
                    onChange={(e) => set({ healAmount: Math.max(1, num(e.target.value)) })} />
                </div>
              )}
              {form.behavior === "speed" && (
                <div>
                  <label className={label} htmlFor="tc-speed">Speed ×</label>
                  <input id="tc-speed" type="number" step={0.05} min={0.25} max={10} className={field} value={form.speedMult}
                    onChange={(e) => set({ speedMult: Math.max(0.25, Number(e.target.value) || 1) })} />
                </div>
              )}
              {form.behavior === "gravity" && (
                <div>
                  <label className={label} htmlFor="tc-jump">Jump ×</label>
                  <input id="tc-jump" type="number" step={0.05} min={0.25} max={10} className={field} value={form.jumpMult}
                    onChange={(e) => set({ jumpMult: Math.max(0.25, Number(e.target.value) || 1) })} />
                </div>
              )}
              <div>
                <label className={label} htmlFor="tc-cd">Cooldown (s)</label>
                <input id="tc-cd" type="number" step={0.05} min={0} max={10} className={field} value={form.cooldown}
                  onChange={(e) => set({ cooldown: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div>
                <label className={label} htmlFor="tc-dur">Durability (uses)</label>
                <input id="tc-dur" type="number" min={0} max={9999} className={field} value={form.maxDurability}
                  title="0 = never breaks"
                  onChange={(e) => set({ maxDurability: Math.max(0, Math.round(num(e.target.value))) })} />
              </div>
            </div>

            {/* Tool property toggles */}
            <span className={label}>Roblox Tool properties</span>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set({ requiresHandle: !form.requiresHandle })}
                className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                  form.requiresHandle ? "border-[#75dda4] bg-[rgba(38,74,53,.3)]" : "border-[#3a3d42] bg-[#141517]"
                }`}
              >
                <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px] font-black ${form.requiresHandle ? "border-[#75dda4] bg-[#75dda4] text-[#0b2418]" : "border-[#565b63] text-transparent"}`}>
                  ✓
                </span>
                <span>
                  <span className="block text-[11px] font-bold text-[#d7dade]">RequiresHandle</span>
                  <span className="block text-[9px] leading-snug text-[#7a828e]">Tool needs a child Part named “Handle” (the grip point in the hand)</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => set({ canBeDropped: !form.canBeDropped })}
                className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                  form.canBeDropped ? "border-[#75dda4] bg-[rgba(38,74,53,.3)]" : "border-[#3a3d42] bg-[#141517]"
                }`}
              >
                <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px] font-black ${form.canBeDropped ? "border-[#75dda4] bg-[#75dda4] text-[#0b2418]" : "border-[#565b63] text-transparent"}`}>
                  ✓
                </span>
                <span>
                  <span className="block text-[11px] font-bold text-[#d7dade]">CanBeDropped</span>
                  <span className="block text-[9px] leading-snug text-[#7a828e]">Backspace / the Drop button may drop it into the world (E picks it up)</span>
                </span>
              </button>
            </div>

            {/* handle look */}
            <span className={label}>Handle — the part players hold</span>
            <div className="mb-4 grid grid-cols-[130px_1fr] gap-3">
              <div>
                <span className="mb-1 block text-[9.5px] text-[#7a828e]">Shape</span>
                <select className={field} value={form.handleShape} onChange={(e) => set({ handleShape: e.target.value as PartShape })}>
                  {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <span className="mb-1 block text-[9.5px] text-[#7a828e]">BrickColor</span>
                <div className="studio-scroll flex max-h-[46px] flex-wrap gap-1 overflow-y-auto rounded border border-[#3a3d42] bg-[#141517] p-1">
                  {PALETTE.map((name) => (
                    <button key={name} type="button" title={name} onClick={() => set({ handleColor: name })}
                      className={`h-[18px] w-[18px] rounded-sm border ${form.handleColor === name ? "border-white ring-1 ring-[#5a97d6]" : "border-black/40"}`}
                      style={{ background: brickColorHex(name) }} />
                  ))}
                </div>
              </div>
            </div>

            {/* luau example */}
            <div className="flex items-center justify-between">
              <span className={label}>Luau reference — the Roblox pattern behind this tool</span>
              <button type="button" onClick={copyScript}
                className="studio-btn mb-1 flex h-6 items-center gap-1 px-2 text-[10px]">
                {copied ? <Check size={11} className="text-[#75dda4]" /> : <Copy size={11} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="studio-scroll max-h-[240px] overflow-auto rounded-md border border-[#3a3d42] bg-[#0f1011] p-3 text-[10.5px] leading-relaxed text-[#b9d4a3]">
              {luauExample({ ...form, name: form.name.trim() || "Tool" })}
            </pre>
          </div>

          {/* ------------------------------ right: preview ------------------------------ */}
          <div className="flex min-w-0 flex-col gap-3">
            {/* explorer hierarchy */}
            <div className="rounded-lg border border-[#3a3d42] bg-[#141517] p-3">
              <span className="mb-2 block text-[9.5px] font-bold uppercase tracking-wide text-[#7a828e]">
                Explorer hierarchy
              </span>
              <div className="rounded-md bg-[#0f1011] p-2.5 font-mono text-[10.5px] leading-relaxed text-[#b7bdc6]">
                <div className="text-[#8fb4d6]">StarterPack</div>
                <div className="pl-3">└─ <span className="font-bold text-[#ffd479]">{form.name.trim() || "Tool"}</span> <span className="text-[#5d6672]">(Tool)</span></div>
                {form.requiresHandle ? (
                  <div className="pl-[34px]">├─ <span className="text-[#75dda4]">Handle</span> <span className="text-[#5d6672]">(Part · {form.handleShape} · {form.handleColor})</span></div>
                ) : (
                  <div className="pl-[34px] text-[#5d6672]">├─ <span className="italic">no Handle — RequiresHandle is off</span></div>
                )}
                <div className="pl-[34px]">├─ ToolClient <span className="text-[#5d6672]">(LocalScript — input)</span></div>
                <div className="pl-[34px]">└─ ServerScript <span className="text-[#5d6672]">(Script — validates)</span></div>
              </div>
              <p className="mt-2 text-[9.5px] leading-snug text-[#7a828e]">
                Copied to every player&apos;s Backpack on spawn. Equipping moves it into the Character.
              </p>
            </div>

            {/* backpack slot preview */}
            <div className="rounded-lg border border-[#3a3d42] bg-[#141517] p-3">
              <span className="mb-2 block text-[9.5px] font-bold uppercase tracking-wide text-[#7a828e]">
                Hotbar slot preview
              </span>
              <div className="flex items-center justify-center gap-2 rounded-lg bg-[rgba(11,12,13,.6)] p-3">
                <div className={`relative flex h-[64px] w-[64px] flex-col items-center justify-center gap-0.5 rounded-xl border-2 ${form.behavior === "speed" || form.behavior === "gravity" ? "border-[#8fb4d6] bg-[rgba(26,42,58,.85)]" : "border-[#75dda4] bg-[rgba(30,58,42,.85)]"}`}>
                  <span className="text-[22px] leading-none">{form.icon}</span>
                  <span className="max-w-[56px] truncate text-[8.5px] font-bold text-[#8fd3ab]">{form.name.trim() || "Tool"}</span>
                  <span className="absolute -top-2 -right-2 rounded bg-[rgba(18,20,24,.95)] px-1 text-[9px] font-bold text-white">4</span>
                </div>
              </div>
              <p className="mt-2 text-center text-[10px] leading-snug text-[#9aa2ad]">{autoDesc}</p>
            </div>

            {/* held handle preview */}
            <div className="rounded-lg border border-[#3a3d42] bg-[#141517] p-3">
              <span className="mb-2 block text-[9.5px] font-bold uppercase tracking-wide text-[#7a828e]">
                Handle preview ({form.handleShape})
              </span>
              <div className="flex h-[110px] items-center justify-center rounded-lg bg-gradient-to-b from-[#23262b] to-[#101113] p-3">
                {/* simple CSS stand-in for the 3D handle */}
                <div
                  className="border border-black/40 shadow-[0_6px_16px_rgba(0,0,0,.5)]"
                  style={{
                    background: hex,
                    width: 64,
                    height: 64,
                    borderRadius:
                      form.handleShape === "Sphere" ? "50%" :
                      form.handleShape === "Cylinder" ? "32px / 16px" : "10px",
                    clipPath:
                      form.handleShape === "Wedge" ? "polygon(50% 0, 100% 100%, 0 100%)" :
                      form.handleShape === "CornerWedge" ? "polygon(0 0, 100% 100%, 0 100%)" : undefined,
                  }}
                />
              </div>
              <p className="mt-2 text-[10px] leading-snug text-[#9aa2ad]">
                {form.requiresHandle
                  ? "Equips into the player's right hand. Passive tools glow while held."
                  : "No Handle — an ability-style tool. Still equips and activates."}
              </p>
            </div>

            {/* how to use */}
            <div className="rounded-lg border border-[#3a3d42] bg-[#141517] p-3 text-[10.5px] leading-relaxed text-[#9aa2ad]">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-[#d7dade]">
                <Zap size={12} className="text-[#ffd479]" /> How players use it
              </div>
              <ol className="ml-4 list-decimal space-y-1">
                <li>Press <b className="text-[#d7dade]">Play</b> — a copy lands in the hotbar (Backpack).</li>
                <li>Press its <b className="text-[#d7dade]">number key</b> (1-9) or click the slot to equip.</li>
                <li>{behavior.activation === "Left-click" ? <>Click to use it — <b className="text-[#d7dade]">{behavior.label}</b> behavior runs.</> : <>It works <b className="text-[#d7dade]">while equipped</b> — no click needed.</>}</li>
                <li><b className="text-[#d7dade]">B</b> opens the full Backpack, <b className="text-[#d7dade]">Backspace</b> drops it{form.canBeDropped ? "" : " (disabled — CanBeDropped is off)"}, <b className="text-[#d7dade]">E</b> picks it back up.</li>
                <li>Admins can grant extra copies with <code className="rounded bg-black/40 px-1 text-[#a9d5ff]">:give {form.name.trim() ? form.name.trim().split(" ")[0].toLowerCase() : "name"}</code>.</li>
              </ol>
            </div>

            {/* insert */}
            <button
              type="button"
              onClick={insert}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#2f7d4f] text-[12px] font-bold text-white transition-colors hover:bg-[#37925c]"
            >
              <Sparkles size={14} /> Add to StarterPack
            </button>

            {/* existing tools */}
            {existing.length > 0 && (
              <div className="rounded-lg border border-[#3a3d42] bg-[#141517] p-3">
                <span className="mb-2 block text-[9.5px] font-bold uppercase tracking-wide text-[#7a828e]">
                  StarterPack tools ({existing.length})
                </span>
                <div className="space-y-1">
                  {existing.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 rounded border border-[#2c2f33] bg-[#191b1e] px-2 py-1.5">
                      <span className="text-[14px] leading-none">{t.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold text-[#d7dade]">{t.name}</span>
                        <span className="block truncate text-[9px] text-[#7a828e]">
                          {BEHAVIORS[t.behavior]?.label ?? t.behavior}
                          {t.cooldown > 0 ? ` · ${t.cooldown}s cd` : ""}
                          {t.maxDurability > 0 ? ` · ${t.maxDurability} uses` : " · unbreakable"}
                        </span>
                      </span>
                      <button type="button" onClick={() => remove(t.id)} title="Remove tool"
                        className="rounded p-1 text-[#8a5560] hover:bg-[#3a2a2e] hover:text-[#e08d97]">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
