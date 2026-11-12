"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Frame, Image, MousePointer2, Plus, Trash2, X } from "lucide-react";
import type { UIElementClass, UIObjectData } from "@/lib/studio/types";
import { useStudio } from "@/lib/studio/store";
import { useStudioCtx } from "./context";

const ELEMENTS: { kind: UIElementClass; label: string }[] = [
  { kind: "Frame", label: "Frame" },
  { kind: "TextLabel", label: "Text Label" },
  { kind: "TextButton", label: "Text Button" },
  { kind: "TextBox", label: "Text Box" },
  { kind: "ImageLabel", label: "Image Label" },
  { kind: "ImageButton", label: "Image Button" },
];

export function UIEditor() {
  const { engine } = useStudioCtx();
  const open = useStudio((s) => s.uiEditorOpen);
  const close = () => useStudio.getState().setUiEditorOpen(false);
  const version = useStudio((s) => s.partsVersion);
  const bump = useStudio((s) => s.bumpParts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; x: number; y: number; startX: number; startY: number; rect: DOMRect } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);

  const objects = useMemo(() => {
    void version;
    return engine?.getUiObjects() ?? [];
  }, [engine, version]);
  const selected = objects.find((x) => x.id === selectedId) ?? objects[0] ?? null;

  if (!open || !engine) return null;

  const add = (kind: UIElementClass) => {
    try {
      const item = engine.addUiObject(kind);
      setSelectedId(item.id);
      bump();
    } catch {
      engine.log("warn", "Your Team Create role cannot edit UI objects.");
    }
  };

  const update = (patch: Partial<UIObjectData>) => {
    if (!selected) return;
    engine.updateUiObject(selected.id, patch);
    bump();
  };

  const startMove = (e: React.PointerEvent, item: UIObjectData) => {
    if (!previewRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = previewRef.current.getBoundingClientRect();
    dragRef.current = { id: item.id, x: item.x, y: item.y, startX: e.clientX, startY: e.clientY, rect };
    setSelectedId(item.id);
    let lastPointer = { x: e.clientX, y: e.clientY };
    let lastLiveSend = 0;
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      lastPointer = { x: ev.clientX, y: ev.clientY };
      const x = Math.max(0, Math.min(100 - item.width, d.x + ((ev.clientX - d.startX) / d.rect.width) * 100));
      const y = Math.max(0, Math.min(100 - item.height, d.y + ((ev.clientY - d.startY) / d.rect.height) * 100));
      setDragPos({ id: item.id, x, y });
      const now = performance.now();
      if (now - lastLiveSend >= 75) {
        lastLiveSend = now;
        engine.updateUiObject(item.id, { x, y }, "__live__");
      }
    };
    const up = () => {
      const d = dragRef.current;
      if (d) {
        const x = Math.max(0, Math.min(100 - item.width, d.x + ((lastPointer.x - d.startX) / d.rect.width) * 100));
        const y = Math.max(0, Math.min(100 - item.height, d.y + ((lastPointer.y - d.startY) / d.rect.height) * 100));
        engine.updateUiObject(d.id, { x, y }, "Move UI element");
        setDragPos(null);
        dragRef.current = null;
        bump();
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const deleteSelected = () => {
    if (!selected) return;
    engine.deleteUiObject(selected.id);
    setSelectedId(null);
    bump();
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="flex h-[min(760px,94vh)] w-[min(1180px,96vw)] flex-col overflow-hidden rounded-xl border border-[#3d424a] bg-[#1b1e22] text-[#e8edf4] shadow-2xl">
        <header className="flex h-11 items-center justify-between border-b border-[#333941] bg-[#24282e] px-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Image size={16} className="text-[#8ec5ff]"/> UI Editor <span className="text-[10px] font-normal text-[#8793a2]">StarterGui · 16:9 design surface</span></div>
          <button className="rounded p-1.5 hover:bg-white/10" onClick={close} title="Close UI Editor"><X size={16}/></button>
        </header>
        <div className="flex min-h-0 flex-1">
          <aside className="w-[190px] shrink-0 border-r border-[#333941] bg-[#202329] p-2">
            <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-[#8491a0]">Insert UI</div>
            <div className="grid grid-cols-2 gap-1">
              {ELEMENTS.map((item) => (
                <button key={item.kind} onClick={() => add(item.kind)} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded border border-[#3b4149] bg-[#292e35] px-1 text-[10px] hover:border-[#75dda4] hover:bg-[#303842]">
                  <Plus size={14}/>{item.label}
                </button>
              ))}
            </div>
            <div className="mb-2 mt-5 px-1 text-[10px] font-bold uppercase tracking-wider text-[#8491a0]">Explorer</div>
            <div className="flex flex-col gap-1">
              <div className="rounded px-2 py-1.5 text-[11px] text-[#9fb6ce]">▾ StarterGui</div>
              {objects.map((item) => (
                <button key={item.id} onClick={() => setSelectedId(item.id)} className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] ${selected?.id === item.id ? "bg-[#29435a] text-white" : "text-[#c4ccd6] hover:bg-white/5"}`}>
                  <Frame size={12}/><span className="truncate">{item.name}</span>
                </button>
              ))}
              {!objects.length && <div className="px-2 py-2 text-[10px] text-[#7f8995]">No UI elements yet.</div>}
            </div>
          </aside>
          <main className="flex min-w-0 flex-1 flex-col bg-[#111419] p-4">
            <div className="mb-3 flex items-center justify-between text-[10px] text-[#8995a4]">
              <span>Preview · 800 × 450</span>
              <label className="flex items-center gap-2">Zoom <input type="range" min="0.7" max="1.4" step="0.05" value={previewScale} onChange={(e) => setPreviewScale(Number(e.target.value))}/></label>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
              <div ref={previewRef} className="relative aspect-video w-full max-w-[800px] overflow-hidden rounded-md border border-[#536274] bg-gradient-to-b from-[#8ab9db] to-[#d3e5ef] shadow-xl" style={{ transform: `scale(${previewScale})`, transformOrigin: "center" }}>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] text-slate-600/50">GAME SCREEN PREVIEW</div>
                {objects.filter((item) => item.visible).sort((a,b) => a.zIndex-b.zIndex).map((item) => {
                  const pos = dragPos?.id === item.id ? dragPos : item;
                  const common: React.CSSProperties = {
                    position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, width: `${item.width}%`, height: `${item.height}%`,
                    backgroundColor: item.className === "TextLabel" ? "transparent" : item.backgroundColor,
                    color: item.textColor, fontSize: `${item.fontSize}px`, zIndex: item.zIndex,
                    border: selected?.id === item.id ? "2px solid #f4d35e" : "1px solid rgba(255,255,255,.15)",
                    borderRadius: item.className === "TextButton" ? 7 : 2, display: "grid", placeItems: "center", overflow: "hidden",
                    cursor: "move", userSelect: "none", textAlign: "center", padding: 4,
                  };
                  return <div key={item.id} style={common} onPointerDown={(e) => startMove(e, item)} onClick={() => setSelectedId(item.id)}>
                    {item.className.startsWith("Image") ? <span className="text-[10px] opacity-70">Image</span> : item.text}
                    {selected?.id === item.id && <span className="pointer-events-none absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-black bg-yellow-300"/>}
                  </div>;
                })}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[10px] text-[#8591a0]"><MousePointer2 size={12}/> Drag elements to reposition them. Changes save with the place and sync to Team Create.</div>
          </main>
          <aside className="w-[250px] shrink-0 overflow-y-auto border-l border-[#333941] bg-[#202329] p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#8491a0]">Properties</div>
              <button onClick={deleteSelected} disabled={!selected} title="Delete selected element" className="rounded p-1.5 text-[#ff9b9b] hover:bg-white/5 disabled:opacity-30"><Trash2 size={14}/></button>
            </div>
            {selected ? <div className="flex flex-col gap-3 text-[11px]">
              <Field label="Name" value={selected.name} onCommit={(v) => update({ name: v })}/>
              <Field label="Text" value={selected.text} onCommit={(v) => update({ text: v })}/>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="X %" value={selected.x} onCommit={(v) => update({ x: v })}/>
                <NumberField label="Y %" value={selected.y} onCommit={(v) => update({ y: v })}/>
                <NumberField label="Width %" value={selected.width} onCommit={(v) => update({ width: v })}/>
                <NumberField label="Height %" value={selected.height} onCommit={(v) => update({ height: v })}/>
                <NumberField label="Font size" value={selected.fontSize} onCommit={(v) => update({ fontSize: v })}/>
                <NumberField label="Z index" value={selected.zIndex} onCommit={(v) => update({ zIndex: v })}/>
              </div>
              <ColorField label="Background" value={selected.backgroundColor} onCommit={(v) => update({ backgroundColor: v })}/>
              <ColorField label="Text color" value={selected.textColor} onCommit={(v) => update({ textColor: v })}/>
              <label className="flex items-center gap-2"><input type="checkbox" checked={selected.visible} onChange={(e) => update({ visible: e.target.checked })}/> Visible</label>
              <div className="rounded bg-[#171a1f] p-2 text-[10px] text-[#8995a4]">Class: {selected.className}<br/>Parent: StarterGui</div>
            </div> : <div className="text-[11px] text-[#8b96a4]">Select or insert a UI element to edit its properties.</div>}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label className="flex flex-col gap-1 text-[#9da9b7]">{label}<input className="rounded border border-[#3b424b] bg-[#171a1f] px-2 py-1.5 text-[#e8edf4] outline-none focus:border-[#75dda4]" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => onCommit(draft)}/></label>;
}
function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label className="flex flex-col gap-1 text-[#9da9b7]">{label}<input type="number" min={0} max={100} className="min-w-0 rounded border border-[#3b424b] bg-[#171a1f] px-2 py-1.5 text-[#e8edf4] outline-none focus:border-[#75dda4]" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => onCommit(Number(draft))}/></label>;
}
function ColorField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  return <label className="flex items-center justify-between gap-2 text-[#9da9b7]">{label}<input type="color" value={value} onChange={(e) => onCommit(e.target.value)} className="h-7 w-12 cursor-pointer rounded bg-transparent"/></label>;
}
