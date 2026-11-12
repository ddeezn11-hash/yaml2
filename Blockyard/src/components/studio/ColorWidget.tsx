"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BRICK_COLORS,
  brickColorHex,
  materialDef,
  nearestBrickColorName,
} from "@/lib/studio/data";
import { getMaterialThumb } from "@/lib/studio/textures";
import { useStudio } from "@/lib/studio/store";
import { useStudioCtx } from "./context";

export function ColorWidget() {
  const { engine } = useStudioCtx();
  const selectionVersion = useStudio((s) => s.selectionVersion);
  const partsVersion = useStudio((s) => s.partsVersion);
  const bumpParts = useStudio((s) => s.bumpParts);
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  const partData = useMemo(() => {
    const ref = engine?.selection[engine.selection.length - 1];
    if (!engine || !ref || ref.kind !== "part") return null;
    return engine.getPartData(ref.id);
    // engine state changes bump these store counters, re-running this memo
  }, [engine, selectionVersion, partsVersion]);

  const hasSelection = !!engine?.selection.some((r) => r.kind === "part");
  const currentColor = partData?.color ?? "Medium stone grey";
  const hex = hexDraft ?? brickColorHex(currentColor);

  const apply = (name: string) => {
    if (!engine) return;
    let n = 0;
    for (const ref of engine.selection) {
      if (ref.kind !== "part") continue;
      engine.updatePart(ref.id, { color: name }, "Color change");
      n += 1;
    }
    if (n) {
      bumpParts();
      setHexDraft(null);
    } else {
      engine.log("warn", "Select a part first — then pick a color");
    }
  };

  const applyHex = (value: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
    setHexDraft(value);
    if (!engine) return;
    for (const ref of engine.selection) {
      if (ref.kind !== "part") continue;
      engine.updatePart(ref.id, { color: nearestBrickColorName(value) }, "Color change");
    }
    bumpParts();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="studio-btn studio-tool"
          title="Color picker (applies to selection)"
        >
          <span
            className={`h-[19px] w-[19px] rounded-[4px] border border-white/25 ${hasSelection ? "" : "opacity-50"}`}
            style={{ background: hex }}
          />
          Color
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-[264px] border-[#3a3d42] bg-[#1e2023] p-2">
        {!hasSelection && (
          <div className="mb-2 rounded border border-[#5a4a2c] bg-[#2b2318] px-2 py-1.5 text-[10px] text-[#e8c76a]">
            Nothing selected — pick a color after selecting a part.
          </div>
        )}
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9aa0a8]">Palette</span>
          <span className="text-[10px] text-[#9aa0a8]">{currentColor}</span>
        </div>
        <div className="grid grid-cols-8 gap-[3px]">
          {BRICK_COLORS.map(([name, , h]) => (
            <button
              key={`${name}_${h}`}
              type="button"
              className={`studio-swatch ${name === currentColor ? "current" : ""}`}
              style={{ background: h }}
              title={name}
              onClick={() => apply(name)}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="color"
            className="h-7 w-9 cursor-pointer rounded border border-[#3a3d42] bg-[#17181b]"
            value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#a3a2a5"}
            onChange={(e) => applyHex(e.target.value)}
            title="Custom color"
          />
          <input
            className="studio-input h-7"
            value={hex}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={(e) => applyHex(e.target.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && applyHex((e.target as HTMLInputElement).value.trim())}
            placeholder="#RRGGBB"
            spellCheck={false}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function nearestName(hex: string): string {
  return nearestBrickColorName(hex);
}

export function MaterialWidget() {
  const { engine } = useStudioCtx();
  const selectionVersion = useStudio((s) => s.selectionVersion);
  const partsVersion = useStudio((s) => s.partsVersion);
  const bumpParts = useStudio((s) => s.bumpParts);
  const [open, setOpen] = useState(false);

  const partData = useMemo(() => {
    const ref = engine?.selection[engine.selection.length - 1];
    if (!engine || !ref || ref.kind !== "part") return null;
    return engine.getPartData(ref.id);
    // engine state changes bump these store counters, re-running this memo
  }, [engine, selectionVersion, partsVersion]);
  const current = partData?.material ?? "Plastic";
  const hasSelection = !!engine?.selection.some((r) => r.kind === "part");

  const apply = (name: string) => {
    if (!engine) return;
    let n = 0;
    for (const ref of engine.selection) {
      if (ref.kind !== "part") continue;
      engine.updatePart(ref.id, { material: name }, "Material change");
      n += 1;
    }
    if (n) bumpParts();
    else engine.log("warn", "Select a part first — then pick a material");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="studio-btn studio-tool" title="Material picker (applies to selection)">
          <span className={`grid h-[19px] w-[19px] place-items-center rounded-[4px] border border-white/25 bg-[#565a61] text-[9px] font-bold ${hasSelection ? "" : "opacity-50"}`}>
            M
          </span>
          Material
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-[300px] border-[#3a3d42] bg-[#1e2023] p-2">
        {!hasSelection && (
          <div className="mb-2 rounded border border-[#5a4a2c] bg-[#2b2318] px-2 py-1.5 text-[10px] text-[#e8c76a]">
            Nothing selected — pick a material after selecting a part.
          </div>
        )}
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9aa0a8]">Materials</span>
          <span className="text-[10px] text-[#9aa0a8]">{current}</span>
        </div>
        <div className="studio-scroll grid max-h-[280px] grid-cols-4 gap-1.5 overflow-y-auto pr-1">
          {MATERIAL_LIST.map((m) => (
            <MaterialTile key={m} name={m} current={current} onPick={apply} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const MATERIAL_LIST = [
  "Plastic", "SmoothPlastic", "Neon", "Wood", "WoodPlanks", "Marble", "Slate", "Concrete",
  "Granite", "Brick", "Pebble", "Cobblestone", "Rock", "Sandstone", "Limestone", "CorrodedMetal",
  "DiamondPlate", "Foil", "Metal", "Grass", "LeafyGrass", "Sand", "Fabric", "Snow",
  "Mud", "Ground", "Asphalt", "Salt", "Ice", "Glacier", "Glass", "ForceField",
  "Pavement", "CrackedLava", "Plaster", "Cardboard", "Carpet", "CeramicTiles", "ClayRoofTiles", "Leather",
  "Rubber",
];

function MaterialTile({ name, current, onPick }: { name: string; current: string; onPick: (n: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const def = MATERIAL_TEX[name];
    if (def) {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(getMaterialThumb(def, 64), 0, 0, c.width, c.height);
    } else {
      const fills: Record<string, string> = {
        Plastic: "#8f9094",
        SmoothPlastic: "#b9bcc2",
        Neon: "#f4f59a",
        Glass: "#bcd9e8",
      };
      ctx.fillStyle = fills[name] ?? "#8f9094";
      ctx.fillRect(0, 0, c.width, c.height);
    }
  }, [name]);
  return (
    <button
      type="button"
      onClick={() => onPick(name)}
      className={`flex flex-col items-center gap-1 rounded p-1 hover:bg-[#2c2f34] ${current === name ? "outline outline-[#37a4ff]" : ""}`}
      title={name}
    >
      <canvas ref={canvasRef} width={44} height={44} className="rounded border border-black/40" />
      <span className="w-full truncate text-center text-[8.5px] leading-tight text-[#b7bcc4]">{name}</span>
    </button>
  );
}

const MATERIAL_TEX: Record<string, string | null> = Object.fromEntries(
  MATERIAL_LIST.map((m) => [m, materialDef(m).texture]),
);
