"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Film,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { AnimKeyframe, AnimationData, Vec3 } from "@/lib/studio/types";
import { useStudio } from "@/lib/studio/store";
import { useWeb } from "@/lib/studio/webstore";
import { usePlatform } from "@/lib/studio/platform";
import { ANIM_PRESETS, animationToPortable, presetToAnimation } from "@/lib/studio/animlibrary";
import { useStudioCtx } from "./context";
import { uid } from "@/lib/studio/data";

const PX_PER_SEC = 140;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpolated pose of a track at time t. */
function poseAt(keys: AnimKeyframe[], t: number): { pos: Vec3; rot: Vec3 } | null {
  if (!keys.length) return null;
  if (t <= keys[0].t) return { pos: keys[0].pos, rot: keys[0].rot };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { pos: last.pos, rot: last.rot };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return {
        pos: [lerp(a.pos[0], b.pos[0], f), lerp(a.pos[1], b.pos[1], f), lerp(a.pos[2], b.pos[2], f)],
        rot: [lerp(a.rot[0], b.rot[0], f), lerp(a.rot[1], b.rot[1], f), lerp(a.rot[2], b.rot[2], f)],
      };
    }
  }
  return { pos: last.pos, rot: last.rot };
}

export function AnimationEditor() {
  const open = useStudio((s) => s.animationEditorOpen);
  if (!open) return null;
  return <AnimBody />;
}

function AnimBody() {
  const setOpen = useStudio((s) => s.setAnimationEditorOpen);
  const partsVersion = useStudio((s) => s.partsVersion);
  const bumpParts = useStudio((s) => s.bumpParts);
  const session = useWeb((s) => s.session);
  const { engine } = useStudioCtx();

  const models = useMemo(() => engine?.explorerData().models ?? [], [engine]);
  const [modelId, setModelId] = useState<string | null>(() => {
    if (!engine) return null;
    const selModel = engine.selection.find((r) => r.kind === "model");
    const mid = selModel ? (selModel as { kind: "model"; id: string }).id : models[0]?.id ?? null;
    return mid && models.some((m) => m.id === mid) ? mid : models[0]?.id ?? null;
  });
  const [anim, setAnim] = useState<AnimationData | null>(() => {
    if (!engine || !modelId) return null;
    const saved = engine.getModelAnimations(modelId);
    return saved.length ? (JSON.parse(JSON.stringify(saved[0])) as AnimationData) : { id: uid("anim"), name: "Animation", duration: 2, loop: true, tracks: {} };
  });
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const playheadRef = useRef(0);
  const rafRef = useRef(0);

  const parts = useMemo(() => (modelId && engine ? engine.getModelParts(modelId) : []), [modelId, engine, partsVersion]);

  /* restore the rig's original poses when the editor closes */
  const originals = useRef<Map<string, { pos: Vec3; rot: Vec3 }>>(new Map());
  useEffect(() => {
    if (!engine) return;
    const mparts = engine.explorerData().models.length ? parts : [];
    originals.current = new Map(mparts.map((p) => [p.id, { pos: [...p.position] as Vec3, rot: [...p.rotation] as Vec3 }]));
    return () => {
      for (const [id, pose] of originals.current) engine.setPartPose(id, pose.pos, pose.rot);
      cancelAnimationFrame(rafRef.current);
    };
     
  }, [engine, modelId]);

  const setPlayheadSafe = (t: number) => {
    playheadRef.current = t;
    setPlayhead(t);
  };

  /* playback loop */
  useEffect(() => {
    if (!playing || !engine || !anim) return;
    let cancelled = false;
    let last = performance.now();
    const tick = (now: number) => {
      if (cancelled) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      let next = playheadRef.current + dt;
      if (next >= anim.duration) {
        if (anim.loop) next = 0;
        else {
          next = anim.duration;
          setPlaying(false);
        }
      }
      playheadRef.current = next;
      for (const [partId, keys] of Object.entries(anim.tracks)) {
        const pose = poseAt(keys, next);
        if (pose) engine.setPartPose(partId, pose.pos, pose.rot);
      }
      setPlayhead(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [playing, anim, engine]);

  /* apply interpolated pose while scrubbing (paused) */
  useEffect(() => {
    if (!engine || !anim || playing) return;
    for (const [partId, keys] of Object.entries(anim.tracks)) {
      const pose = poseAt(keys, playhead);
      if (pose) engine.setPartPose(partId, pose.pos, pose.rot);
    }
  }, [playhead, anim, playing, engine]);

  const close = () => {
    setPlaying(false);
    setOpen(false);
  };

  const save = () => {
    if (!engine || !modelId || !anim) return;
    engine.setModelAnimations(modelId, [anim]);
    engine.log("success", `Saved animation "${anim.name}" (${Object.keys(anim.tracks).length} tracks)`);
    bumpParts();
  };

  const applyPreset = (presetId: string) => {
    if (!engine || !modelId) return;
    const preset = ANIM_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const built = presetToAnimation(preset, engine.getModelParts(modelId));
    if (!Object.keys(built.tracks).length) {
      engine.log("warn", `Preset "${preset.name}" needs parts this rig doesn't have`);
      return;
    }
    setPlaying(false);
    setPlayheadSafe(0);
    setAnim(built);
    engine.log("success", `Loaded preset "${preset.name}" — press Play to preview, then tweak keyframes`);
  };

  const publishAnimation = () => {
    if (!engine || !modelId || !anim) return;
    const parts = engine.getModelParts(modelId);
    const portable = animationToPortable(anim, parts);
    usePlatform.getState().publishAsset({
      kind: "animation",
      name: anim.name,
      desc: `${Object.keys(anim.tracks).length}-track keyframe animation (${anim.duration}s${anim.loop ? ", loop" : ""})`,
      creator: session?.username ?? "builder",
      creatorDisplay: session?.displayName ?? session?.username ?? "Builder",
      icon: "🎬",
      gradient: "from-[#8a4bc9] to-[#c94b7a]",
      price: 0,
      anim: portable,
    });
    engine.log("success", `Published animation "${anim.name}" to the Creator Store — it's now in the Toolbox`);
  };

  const switchModel = (mid: string | null) => {
    setModelId(mid);
    setSelectedPartId(null);
    setPlaying(false);
    setPlayheadSafe(0);
    if (engine && mid) {
      const saved = engine.getModelAnimations(mid);
      setAnim(saved.length ? (JSON.parse(JSON.stringify(saved[0])) as AnimationData) : { id: uid("anim"), name: "Animation", duration: 2, loop: true, tracks: {} });
    } else setAnim(null);
  };

  const addKeyframe = (all: boolean) => {
    if (!engine || !anim) return;
    const targets = all ? parts : parts.filter((p) => p.id === selectedPartId);
    if (!targets.length) {
      engine.log("warn", all ? "This model has no parts" : "Select a track first (or a part in the viewport)");
      return;
    }
    const tracks = { ...anim.tracks };
    for (const p of targets) {
      const live = engine.getPartData(p.id);
      if (!live) continue;
      const kf: AnimKeyframe = { t: Number(playheadRef.current.toFixed(2)), pos: [...live.position] as Vec3, rot: [...live.rotation] as Vec3 };
      const existing = (tracks[p.id] ?? []).filter((k) => Math.abs(k.t - kf.t) > 0.04);
      tracks[p.id] = [...existing, kf].sort((a, b) => a.t - b.t);
    }
    setAnim({ ...anim, tracks });
  };

  const deleteKeyframeAtPlayhead = () => {
    if (!anim || !selectedPartId) return;
    const keys = anim.tracks[selectedPartId] ?? [];
    const next = keys.filter((k) => Math.abs(k.t - playheadRef.current) > 0.04);
    if (next.length === keys.length) return;
    setAnim({ ...anim, tracks: { ...anim.tracks, [selectedPartId]: next } });
  };

  const timelineWidth = (anim?.duration ?? 2) * PX_PER_SEC + 24;

  return (
    <div className="fixed inset-0 z-[1040] grid place-items-center bg-black/55 p-4">
      <div className="flex h-[600px] max-h-[90vh] w-full max-w-[980px] flex-col overflow-hidden rounded-lg border border-[#3a3d42] bg-[#1b1d20] shadow-2xl">
        {/* header */}
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-[#34373c] bg-[#17181b] px-4 py-2.5">
          <Film size={16} className="text-[#e8c76a]" />
          <span className="text-[12.5px] font-semibold">Animation Editor</span>

          <select
            className="studio-input h-7 w-44 cursor-pointer text-[11px]"
            value={modelId ?? ""}
            onChange={(e) => switchModel(e.target.value || null)}
          >
            {!models.length && <option value="">no models yet</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          {anim && (
            <>
              <input
                className="studio-input h-7 w-32 text-[11px]"
                value={anim.name}
                onChange={(e) => setAnim({ ...anim, name: e.target.value.slice(0, 30) })}
                title="Animation name"
              />
              <label className="flex items-center gap-1 text-[10.5px] text-[#b7bcc4]">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[#2f6fb4]"
                  checked={anim.loop}
                  onChange={(e) => setAnim({ ...anim, loop: e.target.checked })}
                />
                loop
              </label>
              <label className="flex items-center gap-1 text-[10.5px] text-[#b7bcc4]">
                length
                <input
                  type="number"
                  className="studio-input h-6 w-16"
                  min={0.5}
                  max={20}
                  step={0.5}
                  value={anim.duration}
                  onChange={(e) => setAnim({ ...anim, duration: Math.min(20, Math.max(0.5, Number(e.target.value) || 2)) })}
                />
                s
              </label>
            </>
          )}
          <div className="flex-1" />
          {/* presets dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPresetsOpen((v) => !v)}
              className="studio-btn h-7 gap-1.5 px-3 text-[11px] font-semibold text-[#0e241a] bg-[#e8c76a] hover:bg-[#f0d488]"
              title="Load a ready-made animation preset you can edit"
            >
              <Sparkles size={12} /> Presets
            </button>
            {presetsOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPresetsOpen(false)} />
                <div className="absolute right-0 top-9 z-20 w-[240px] overflow-hidden rounded-md border border-[#3a3d42] bg-[#1e2023] py-1 shadow-2xl">
                  <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-[#7a7f88]">Load a preset</div>
                  {ANIM_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[#c8ccd2] hover:bg-[#2e3136]"
                      onClick={() => {
                        applyPreset(p.id);
                        setPresetsOpen(false);
                      }}
                    >
                      <span className="text-[15px]">{p.icon}</span>
                      <span className="flex-1">
                        <span className="block font-semibold">{p.name}</span>
                        <span className="block text-[9px] text-[#9aa0a8]">{p.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={publishAnimation}
            disabled={!anim || !Object.keys(anim?.tracks ?? {}).length}
            className="studio-btn h-7 gap-1.5 px-3 text-[11px] font-semibold text-[#8ec5ff] border border-[#2c4a5a] bg-[#1b2b33] hover:bg-[#213844] disabled:opacity-40"
            title="Publish this animation to the Creator Store (Toolbox → Animations)"
          >
            <Upload size={12} /> Publish
          </button>
          <button type="button" onClick={save} disabled={!anim} className="studio-btn h-7 gap-1.5 px-3 text-[11px] font-semibold text-[#0e241a] bg-[#75dda4] hover:bg-[#8ce6a5] disabled:opacity-40">
            <Save size={12} /> Save
          </button>
          <button type="button" className="studio-btn h-7 w-7" onClick={close} title="Close">
            <X size={14} />
          </button>
        </div>

        {!anim ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <Film size={40} className="text-[#4a4f57]" />
            <div className="text-[13px] font-semibold text-[#c8ccd2]">No model to animate yet</div>
            <div className="max-w-[380px] text-[11.5px] leading-relaxed text-[#9aa0a8]">
              Spawn a dummy rig from the <span className="text-[#c8ccd2]">Avatar tab → R6 Dummy</span>, then reopen the
              Animation Editor to pose its limbs and build keyframes.
            </div>
            <button
              type="button"
              className="studio-btn h-8 gap-1.5 px-3 text-[11px] font-semibold text-[#0e241a] bg-[#75dda4] hover:bg-[#8ce6a5]"
              onClick={() => {
                engine?.addRig("R6");
                bumpParts();
              }}
            >
              <Plus size={13} /> Spawn R6 Dummy
            </button>
          </div>
        ) : (
          <>
            {/* transport */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[#34373c] bg-[#1b1d20] px-4 py-2">
              <button type="button" className="studio-btn h-7 w-7" title="Back to start" onClick={() => { setPlaying(false); setPlayheadSafe(0); }}>
                <RotateCcw size={13} />
              </button>
              <button
                type="button"
                className={`studio-btn h-7 gap-1.5 px-3 text-[11px] font-semibold ${playing ? "text-[#ff9b9b] border border-[#5a2c2c] bg-[#2b1b1b]" : "text-[#0e241a] bg-[#75dda4] hover:bg-[#8ce6a5]"}`}
                onClick={() => setPlaying((v) => !v)}
                title="Play / pause preview"
              >
                {playing ? <Pause size={12} /> : <Play size={12} />} {playing ? "Pause" : "Play"}
              </button>
              <span className="ml-2 w-24 font-mono text-[11px] text-[#8ce6a5]">{playhead.toFixed(2)}s / {anim.duration}s</span>
              <div className="h-6 w-px bg-[#34373c]" />
              <button type="button" onClick={() => addKeyframe(false)} className="studio-btn h-7 gap-1.5 px-2.5 text-[11px]" title="Capture the selected part's current pose at the playhead">
                <Plus size={12} /> Keyframe part
              </button>
              <button type="button" onClick={() => addKeyframe(true)} className="studio-btn h-7 gap-1.5 px-2.5 text-[11px]" title="Capture every part's pose at the playhead">
                <Square size={10} /> Keyframe all
              </button>
              <button type="button" onClick={deleteKeyframeAtPlayhead} disabled={!selectedPartId} className="studio-btn h-7 gap-1.5 px-2.5 text-[11px] text-[#ff9b9b] disabled:opacity-40" title="Delete keyframe at playhead for the selected track">
                <Trash2 size={12} /> Delete key
              </button>
              <div className="flex-1" />
              <span className="hidden rounded border border-[#2a4a34] bg-[#16211a] px-2 py-0.5 text-[9px] leading-tight text-[#8ce6a5] lg:block">
                ① pick a Preset or pose parts with Move/Rotate → ② capture keyframes → ③ Play to preview → Publish
              </span>
            </div>

            {/* timeline */}
            <div className="studio-scroll flex min-h-0 flex-1 overflow-auto">
              <div className="relative flex min-w-full flex-col">
                {/* time ruler */}
                <div className="sticky top-0 z-10 flex border-b border-[#2a2d31] bg-[#17181b]">
                  <div className="w-[170px] shrink-0 border-r border-[#2a2d31] px-2 py-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-[#7a7f88]">
                    Tracks
                  </div>
                  <div className="relative h-8" style={{ width: timelineWidth }}>
                    {Array.from({ length: Math.floor(anim.duration * 2) + 1 }, (_, i) => i / 2).map((t) => (
                      <div key={t} className="absolute top-0 h-full border-l border-[#2a2d31] pl-1 pt-1 text-[9px] text-[#7a7f88]" style={{ left: t * PX_PER_SEC }}>
                        {t.toFixed(1)}s
                      </div>
                    ))}
                  </div>
                </div>

                {/* track rows */}
                {parts.length === 0 && (
                  <div className="p-4 text-[11px] text-[#9aa0a8]">This model has no parts.</div>
                )}
                {parts.map((p) => {
                  const keys = anim.tracks[p.id] ?? [];
                  const selected = selectedPartId === p.id;
                  return (
                    <div key={p.id} className="flex border-b border-[#222529]">
                      <button
                        type="button"
                        className={`flex w-[170px] shrink-0 items-center gap-1.5 border-r border-[#2a2d31] px-2 py-1.5 text-left text-[11px] ${selected ? "bg-[#233041] text-[#8ec5ff]" : "text-[#c8ccd2] hover:bg-[#22252a]"}`}
                        onClick={() => setSelectedPartId(p.id)}
                      >
                        {selected && <ChevronRight size={11} className="text-[#8ec5ff]" />}
                        <span className="truncate">{p.name}</span>
                        <span className="ml-auto text-[9px] text-[#7a7f88]">{keys.length}</span>
                      </button>
                      <div
                        className={`relative h-8 cursor-pointer ${selected ? "bg-[#1d2631]" : "hover:bg-[#1e2126]"}`}
                        style={{ width: timelineWidth }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const t = Math.min(anim.duration, Math.max(0, (e.clientX - rect.left) / PX_PER_SEC));
                          setPlaying(false);
                          setPlayheadSafe(t);
                        }}
                      >
                        {Array.from({ length: Math.floor(anim.duration * 2) + 1 }, (_, i) => i / 2).map((t) => (
                          <div key={t} className="absolute top-0 h-full border-l border-[#222529]" style={{ left: t * PX_PER_SEC }} />
                        ))}
                        {keys.map((k) => (
                          <div
                            key={k.t}
                            title={`${k.t.toFixed(2)}s`}
                            className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-pointer border border-[#7ec9ff] bg-[#37a4ff] hover:scale-125"
                            style={{ left: k.t * PX_PER_SEC }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPlaying(false);
                              setPlayheadSafe(k.t);
                              setSelectedPartId(p.id);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* playhead */}
                <div
                  className="pointer-events-none absolute top-8 bottom-0 z-20 w-px bg-[#ff5d5d]"
                  style={{ left: 170 + playhead * PX_PER_SEC }}
                >
                  <div className="absolute -left-[5px] top-0 h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-[#ff5d5d]" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
