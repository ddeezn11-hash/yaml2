"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ImagePlus, SlidersHorizontal, Trash2 } from "lucide-react";
import { brickColorHex } from "@/lib/studio/data";
import { pickImage } from "@/lib/studio/imgupload";
import type { PartData, PartShape, Vec3 } from "@/lib/studio/types";
import { useStudio } from "@/lib/studio/store";
import { useStudioCtx } from "./context";

const SHAPES: PartShape[] = ["Block", "Sphere", "Wedge", "Cylinder", "CornerWedge"];

export function PropertiesPanel() {
  const { engine } = useStudioCtx();
  useStudio((s) => s.selectionVersion); // subscribe → re-render on selection change
  useStudio((s) => s.partsVersion); // subscribe → re-render on part edits
  const bumpParts = useStudio((s) => s.bumpParts);
  const bumpHistory = useStudio((s) => s.bumpHistory);

  const selection = engine?.selection ?? [];
  const sel = selection.map((r) => `${r.kind}:${r.id}`).join(",");
  const parts = selection.filter((r): r is { kind: "part"; id: string } => r.kind === "part");
  const models = selection.filter((r): r is { kind: "model"; id: string } => r.kind === "model");
  const services = selection.filter((r): r is { kind: "service"; id: string } => r.kind === "service");

  const update = (id: string, patch: Partial<PartData>, label: string) => {
    engine?.updatePart(id, patch, label);
    bumpParts();
    bumpHistory();
  };

  const updateAll = (patch: Partial<PartData>, label: string) => {
    for (const p of parts) engine?.updatePart(p.id, patch, label);
    bumpParts();
    bumpHistory();
  };

  const single = parts.length === 1 ? engine?.getPartData(parts[0].id) ?? null : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[#2a2d31] bg-[#17181b] px-2">
        <SlidersHorizontal size={13} className="text-[#9aa0a8]" />
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9aa0a8]">Properties</span>
        <div className="flex-1" />
        <span className="truncate text-[10px] text-[#7a7f88]">
          {single
            ? single.name
            : parts.length
              ? `${parts.length} parts selected`
              : models.length
                ? engine?.getModel(models[0].id)?.name ?? "Model"
                : services.length
                  ? services[0].id
                  : ""}
        </span>
      </div>

      <div className="studio-scroll flex-1 overflow-y-auto" key={sel}>
        {single && (
          <>
            <Section title="Appearance">
              <Row label="BrickColor">
                <span className="flex items-center gap-1.5">
                  <span className="h-4 w-6 rounded-sm border border-white/25" style={{ background: brickColorHex(single.color) }} />
                  <input
                    key={`${single.id}:${single.color}`}
                    className="studio-input h-5 flex-1"
                    defaultValue={single.color}
                    onBlur={(e) => update(single.id, { color: e.target.value }, "Color change")}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                </span>
              </Row>
              <Row label="Material">
                <select
                  className="studio-input h-5 cursor-pointer"
                  value={single.material}
                  onChange={(e) => update(single.id, { material: e.target.value }, "Material change")}
                >
                  {MATERIAL_NAMES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Row>
              <Row label="Reflectance">
                <NumField key={single.reflectance} value={single.reflectance} min={0} max={1} step={0.05} onCommit={(v) => update(single.id, { reflectance: v }, "Reflectance")} />
              </Row>
              <Row label="Transparency">
                <NumField key={single.transparency} value={single.transparency} min={0} max={1} step={0.05} onCommit={(v) => update(single.id, { transparency: v }, "Transparency")} />
              </Row>
            </Section>
            <Section title="Part">
              <Row label="Shape">
                <select
                  className="studio-input h-5 cursor-pointer"
                  value={single.shape}
                  onChange={(e) => update(single.id, { shape: e.target.value as PartShape }, "Shape change")}
                >
                  {SHAPES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Row>
              <Row label="Size">
                <Vec3Field value={single.size} min={0.05} step={0.5} onCommit={(v) => update(single.id, { size: v }, "Resize")} />
              </Row>
              <Row label="Position">
                <Vec3Field value={single.position} step={1} onCommit={(v) => update(single.id, { position: v }, "Move")} />
              </Row>
              <Row label="Orientation">
                <Vec3Field value={single.rotation} step={15} onCommit={(v) => update(single.id, { rotation: v }, "Rotate")} />
              </Row>
            </Section>
            <Section title="Behavior">
              <Row label="Anchored">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[#2f6fb4]"
                  checked={single.anchored}
                  onChange={(e) => update(single.id, { anchored: e.target.checked }, "Anchor")}
                />
              </Row>
              <Row label="CanCollide">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[#2f6fb4]"
                  checked={single.canCollide}
                  onChange={(e) => update(single.id, { canCollide: e.target.checked }, "CanCollide")}
                />
              </Row>
              <Row label="CastShadow">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[#2f6fb4]"
                  checked={single.castShadow}
                  onChange={(e) => update(single.id, { castShadow: e.target.checked }, "CastShadow")}
                />
              </Row>
            </Section>
            <TextureSection
              partId={single.id}
              texture={single.texture ?? null}
              tiles={single.textureTiles ?? 1}
            />
            <Section title="Data">
              <Row label="Name">
                <input
                  className="studio-input h-5"
                  defaultValue={single.name}
                  key={`${single.id}:name`}
                  onBlur={(e) => engine?.renamePart(single.id, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              </Row>
              <Row label="Id">
                <span className="truncate text-[10px] text-[#7a7f88]">{single.id}</span>
              </Row>
            </Section>
          </>
        )}

        {!single && parts.length > 1 && (
          <Section title={`Selection (${parts.length} parts)`}>
            <Row label="Material">
              <select className="studio-input h-5 cursor-pointer" value="" onChange={(e) => updateAll({ material: e.target.value }, "Material change")}>
                <option value="">Apply to all…</option>
                {MATERIAL_NAMES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Row>
            <Row label="Anchored">
              <button
                type="button"
                className="studio-btn h-5 border border-[#3a3d42] px-2 text-[10px]"
                onClick={() => updateAll({ anchored: true }, "Anchor")}
              >
                Anchor all
              </button>
            </Row>
            <Row label="CanCollide">
              <button
                type="button"
                className="studio-btn h-5 border border-[#3a3d42] px-2 text-[10px]"
                onClick={() => updateAll({ canCollide: true }, "CanCollide")}
              >
                Collide all
              </button>
            </Row>
          </Section>
        )}

        {models.length === 1 && engine?.getModel(models[0].id) && (
          <Section title="Data">
            <Row label="Name">
              <input
                className="studio-input h-5"
                defaultValue={engine.getModel(models[0].id)!.name}
                key={`${models[0].id}:name`}
                onBlur={(e) => {
                  engine.renameModel(models[0].id, e.target.value);
                  bumpHistory();
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            </Row>
            <Row label="Parts">
              <span className="text-[11px]">
                {(engine.getAllParts() ?? []).filter((p) => p.parentId === models[0].id).length}
              </span>
            </Row>
          </Section>
        )}

        {services.length === 1 && services[0].id === "Lighting" && engine && (
          <>
            <Section title="Appearance">
              <Row label="Ambient">
                <NumField
                  key={`amb:${engine.lighting.ambient}`}
                  value={engine.lighting.ambient}
                  min={0}
                  max={2}
                  step={0.05}
                  onCommit={(v) => {
                    engine.setLighting({ ambient: v });
                    bumpHistory();
                  }}
                />
              </Row>
              <Row label="Brightness">
                <NumField
                  key={`bri:${engine.lighting.brightness}`}
                  value={engine.lighting.brightness}
                  min={0}
                  max={4}
                  step={0.1}
                  onCommit={(v) => {
                    engine.setLighting({ brightness: v });
                    bumpHistory();
                  }}
                />
              </Row>
            </Section>
            <Section title="Data">
              <Row label="ClockTime">
                <NumField
                  key={`clk:${engine.lighting.clockTime}`}
                  value={engine.lighting.clockTime}
                  min={0}
                  max={24}
                  step={0.5}
                  onCommit={(v) => {
                    engine.setLighting({ clockTime: v });
                    bumpHistory();
                  }}
                />
              </Row>
              <Row label="FogEnd">
                <NumField
                  key={`fog:${engine.lighting.fogEnd}`}
                  value={engine.lighting.fogEnd}
                  min={100}
                  max={4000}
                  step={50}
                  onCommit={(v) => {
                    engine.setLighting({ fogEnd: v });
                    bumpHistory();
                  }}
                />
              </Row>
            </Section>
          </>
        )}

        {services.length === 1 && services[0].id === "Workspace" && (
          <>
            <Section title="Workspace">
              <Row label="Gravity">
                <span className="text-[11px]">196.2 (play mode)</span>
              </Row>
              <Row label="Parts">
                <span className="text-[11px]">{engine?.getPartCount() ?? 0}</span>
              </Row>
            </Section>
            <BaseplateTextureSection />
          </>
        )}

        {!parts.length && !models.length && !services.length && (
          <div className="p-4 text-center text-[11px] leading-relaxed text-[#7a7f88]">
            Nothing selected.
            <br />
            Click a part in the viewport or Explorer.
          </div>
        )}
      </div>
    </div>
  );
}

const MATERIAL_NAMES = [
  "Plastic", "SmoothPlastic", "Neon", "Wood", "WoodPlanks", "Marble", "Slate", "Concrete",
  "Granite", "Brick", "Pebble", "Cobblestone", "Rock", "Sandstone", "Limestone", "CorrodedMetal",
  "DiamondPlate", "Foil", "Metal", "Grass", "LeafyGrass", "Sand", "Fabric", "Snow",
  "Mud", "Ground", "Asphalt", "Salt", "Ice", "Glacier", "Glass", "ForceField",
  "Pavement", "CrackedLava", "Plaster", "Cardboard", "Carpet", "CeramicTiles", "ClayRoofTiles", "Leather",
  "Rubber",
];

const TILE_OPTIONS = [1, 2, 4, 8, 16, 32, 64];

/** Image texture controls for a selected part. */
function TextureSection({ partId, texture, tiles }: { partId: string; texture: string | null; tiles: number }) {
  const { engine } = useStudioCtx();
  const bumpParts = useStudio((s) => s.bumpParts);
  const assets = engine?.getAssets() ?? {};
  const thumb = texture ? assets[texture] : null;
  const busy = useRef(false);

  const upload = async () => {
    if (!engine || busy.current) return;
    busy.current = true;
    const img = await pickImage();
    busy.current = false;
    if (!img) return;
    const assetId = engine.registerAsset(img.dataUrl);
    engine.setPartTexture(partId, assetId, tiles);
    bumpParts();
  };

  return (
    <Section title="Texture">
      <Row label="Image">
        <span className="flex w-full items-center gap-1.5">
          {thumb ? (
            <img src={thumb} alt="part texture" className="h-6 w-6 rounded-sm border border-white/25 object-cover" />
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-sm border border-dashed border-[#4a4f57] text-[#7a7f88]">
              <SlidersHorizontal size={10} />
            </span>
          )}
          <button type="button" onClick={upload} className="studio-btn h-5 flex-1 gap-1 border border-[#3a3d42] px-1.5 text-[10px]">
            <ImagePlus size={11} /> Upload image
          </button>
          {texture && (
            <button
              type="button"
              title="Remove texture"
              className="studio-btn h-5 w-5 border border-[#5a2c2c] text-[#ff9b9b]"
              onClick={() => {
                engine?.setPartTexture(partId, null);
                bumpParts();
              }}
            >
              <Trash2 size={10} />
            </button>
          )}
        </span>
      </Row>
      <Row label="Tiling">
        <select
          className="studio-input h-5 cursor-pointer"
          value={tiles}
          disabled={!texture}
          onChange={(e) => {
            engine?.setPartTexture(partId, texture, Number(e.target.value));
            bumpParts();
          }}
        >
          {TILE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}×{t}</option>
          ))}
        </select>
      </Row>
    </Section>
  );
}

/** Baseplate image controls shown when the Workspace service is selected. */
function BaseplateTextureSection() {
  const { engine } = useStudioCtx();
  const bumpParts = useStudio((s) => s.bumpParts);
  const info = engine?.getBaseplateTexture() ?? { id: null, tiles: 64 };
  const assets = engine?.getAssets() ?? {};
  const thumb = info.id ? assets[info.id] : null;
  const busy = useRef(false);

  const upload = async () => {
    if (!engine || busy.current) return;
    busy.current = true;
    const img = await pickImage();
    busy.current = false;
    if (!img) return;
    const assetId = engine.registerAsset(img.dataUrl);
    engine.setBaseplateTexture(assetId, info.tiles);
    bumpParts();
  };

  return (
    <Section title="Baseplate">
      <Row label="Image">
        <span className="flex w-full items-center gap-1.5">
          {thumb ? (
            <img src={thumb} alt="baseplate texture" className="h-6 w-6 rounded-sm border border-white/25 object-cover" />
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-sm border border-dashed border-[#4a4f57] text-[9px] text-[#7a7f88]">studs</span>
          )}
          <button type="button" onClick={upload} className="studio-btn h-5 flex-1 gap-1 border border-[#3a3d42] px-1.5 text-[10px]">
            <ImagePlus size={11} /> Upload to baseplate
          </button>
          {info.id && (
            <button
              type="button"
              title="Reset to studs"
              className="studio-btn h-5 w-5 border border-[#5a2c2c] text-[#ff9b9b]"
              onClick={() => {
                engine?.setBaseplateTexture(null);
                bumpParts();
              }}
            >
              <Trash2 size={10} />
            </button>
          )}
        </span>
      </Row>
      <Row label="Tiling">
        <select
          className="studio-input h-5 cursor-pointer"
          value={info.tiles}
          disabled={!info.id}
          onChange={(e) => {
            engine?.setBaseplateTexture(info.id, Number(e.target.value));
            bumpParts();
          }}
        >
          {[1, 2, 4, 8, 16, 32, 64, 128].map((t) => (
            <option key={t} value={t}>{t}×{t}</option>
          ))}
        </select>
      </Row>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div className="studio-section" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {title}
      </div>
      {open && children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="studio-row">
      <span className="prop-name" title={label}>
        {label}
      </span>
      <span className="prop-value">{children}</span>
    </div>
  );
}

function NumField({
  value,
  onCommit,
  min,
  max,
  step = 1,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 100) / 100);
  const commit = (raw: string) => {
    setDraft(null);
    const v = Number(raw);
    if (Number.isFinite(v)) {
      const clampedV = min !== undefined && max !== undefined ? Math.max(min, Math.min(max, v)) : v;
      onCommit(clampedV);
    }
  };
  return (
    <input
      className="studio-input h-5"
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
      inputMode="decimal"
    />
  );
}

const AXIS_COLORS = ["#e46a6a", "#7ec46a", "#6a9fe4"];

function Vec3Field({
  value,
  onCommit,
  min,
  step,
}: {
  value: Vec3;
  onCommit: (v: Vec3) => void;
  min?: number;
  step?: number;
}) {
  return (
    <span className="flex w-full items-center gap-1">
      {(["X", "Y", "Z"] as const).map((axis, i) => (
        <span key={axis} className="flex min-w-0 flex-1 items-center gap-1">
          <span className="w-2 text-[9px] font-bold" style={{ color: AXIS_COLORS[i] }}>
            {axis}
          </span>
          <input
            className="studio-input h-5 min-w-0"
            defaultValue={String(Math.round(value[i] * 100) / 100)}
            key={`${axis}:${value[i]}`}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) {
                const next: Vec3 = [...value];
                next[i] = min !== undefined ? Math.max(min, v) : v;
                onCommit(next);
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            inputMode="decimal"
            step={step}
          />
        </span>
      ))}
    </span>
  );
}
