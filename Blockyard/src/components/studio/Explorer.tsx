"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import {
  Anchor,
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Cylinder,
  Database,
  Folder,
  FolderTree,
  Globe,
  HardDrive,
  LayoutDashboard,
  MapPin,
  Monitor,
  Moon,
  Package,
  PersonStanding,
  Pyramid,
  ScrollText,
  Search,
  Trash2,
  Triangle,
  Users,
  Wrench,
  ZoomIn,
} from "lucide-react";
import type { PartData, PartShape, ScriptData, ScriptKind } from "@/lib/studio/types";
import { useStudio } from "@/lib/studio/store";
import { useStudioCtx } from "./context";

const SHAPE_ICONS: Record<PartShape, ComponentType<{ size?: number; className?: string }>> = {
  Block: Box,
  Sphere: Circle,
  Wedge: Triangle,
  Cylinder: Cylinder,
  CornerWedge: Pyramid,
};

export const SCRIPT_ICONS: Record<ScriptKind, ComponentType<{ size?: number; className?: string }>> = {
  Script: ScrollText,
  LocalScript: Monitor,
  ModuleScript: Package,
};

type ServiceState = "supported" | "partial" | "comingSoon" | "api";
interface ServiceChildDef {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  note?: string;
}
interface ServiceDef {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  selectable: boolean;
  /** Can hold children shown in Explorer. */
  expandable?: boolean;
  /** Nested script container(s), such as StarterPlayerScripts. */
  children?: ServiceChildDef[];
  /** Honest capability label; comingSoon rows are visible but not editable yet. */
  state?: ServiceState;
  note?: string;
}

// The standard Roblox-style services are listed together. Rows marked
// comingSoon are intentionally visible but disabled until their runtime APIs
// exist; showing them must not imply that their features already work.
const SERVICES: ServiceDef[] = [
  { id: "Workspace", label: "Workspace", icon: Globe, selectable: true, expandable: true, state: "supported" },
  { id: "Players", label: "Players", icon: Users, selectable: true, expandable: true, state: "partial", note: "Player instances appear while Play mode is running" },
  { id: "Lighting", label: "Lighting", icon: Moon, selectable: true, state: "supported" },
  { id: "MaterialService", label: "MaterialService", icon: Box, selectable: false, state: "comingSoon", note: "Material variants are not implemented yet" },
  { id: "ReplicatedFirst", label: "ReplicatedFirst", icon: Globe, selectable: false, state: "comingSoon", note: "Early client replication is not implemented yet" },
  { id: "ReplicatedStorage", label: "ReplicatedStorage", icon: Database, selectable: false, expandable: true, state: "partial", note: "Scripts and ModuleScripts are supported; general shared object storage is not yet implemented" },
  { id: "ServerScriptService", label: "ServerScriptService", icon: ScrollText, selectable: false, expandable: true, state: "supported", note: "empty — right-click to insert a server Script" },
  { id: "ServerStorage", label: "ServerStorage", icon: HardDrive, selectable: false, expandable: true, state: "partial", note: "Script container supported; general object storage is not yet implemented" },
  { id: "StarterGui", label: "StarterGui", icon: LayoutDashboard, selectable: true, expandable: true, state: "supported", note: "Create ScreenGui overlays in the UI toolbar; preview them in Run and Test mode" },
  { id: "StarterPack", label: "StarterPack", icon: Package, selectable: true, expandable: true, state: "supported" },
  {
    id: "StarterPlayer", label: "StarterPlayer", icon: Users, selectable: false, state: "partial",
    children: [
      { id: "StarterPlayerScripts", label: "StarterPlayerScripts", icon: Monitor, note: "empty — right-click to insert a LocalScript" },
      { id: "StarterCharacterScripts", label: "StarterCharacterScripts", icon: PersonStanding, note: "Character scripts are stored here; character-spawn lifecycle is not yet simulated" },
    ],
  },
  { id: "Teams", label: "Teams", icon: Users, selectable: false, state: "comingSoon", note: "Team objects and team assignment are not implemented yet" },
  { id: "SoundService", label: "SoundService", icon: Globe, selectable: false, state: "comingSoon", note: "Sound playback and sound groups are not implemented yet" },
  { id: "TextChatService", label: "TextChatService", icon: ScrollText, selectable: false, state: "comingSoon", note: "TextChatService channels and permissions are not implemented yet" },
  { id: "Chat", label: "Chat", icon: ScrollText, selectable: false, state: "comingSoon", note: "Legacy Chat service is not implemented; use Blockyard's current chat UI" },
  { id: "RunService", label: "RunService", icon: Wrench, selectable: false, state: "api", note: "Scripting API: Heartbeat is supported; not a place-content container" },
];

/* ------------------------- insert object list ------------------------ */
type InsertTarget =
  | { kind: "shape"; shape: PartShape; label: string }
  | { kind: "script"; scriptKind: ScriptKind; label: string }
  | { kind: "action"; action: "spawn" | "model" | "folder" | "rigR6" | "rigR15" | "tool" | "gear"; label: string };

const INSERT_ITEMS: InsertTarget[] = [
  { kind: "shape", shape: "Block", label: "Part" },
  { kind: "shape", shape: "Sphere", label: "Ball" },
  { kind: "shape", shape: "Wedge", label: "Wedge" },
  { kind: "shape", shape: "Cylinder", label: "Cylinder" },
  { kind: "shape", shape: "CornerWedge", label: "Corner Wedge" },
  { kind: "action", action: "spawn", label: "SpawnLocation" },
  { kind: "action", action: "model", label: "Model" },
  { kind: "action", action: "folder", label: "Folder" },
  { kind: "action", action: "tool", label: "Tool… (Tool Creator)" },
  { kind: "action", action: "gear", label: "Gear… (Toolbox)" },
  { kind: "action", action: "rigR6", label: "Dummy (R6 rig)" },
  { kind: "action", action: "rigR15", label: "Block Rig (R15)" },
  { kind: "script", scriptKind: "Script", label: "Script (server)" },
  { kind: "script", scriptKind: "LocalScript", label: "LocalScript (client)" },
  { kind: "script", scriptKind: "ModuleScript", label: "ModuleScript (library)" },
];

function insertItemIcon(it: InsertTarget): ComponentType<{ size?: number; className?: string }> {
  if (it.kind === "shape") return SHAPE_ICONS[it.shape];
  if (it.kind === "script") return SCRIPT_ICONS[it.scriptKind];
  switch (it.action) {
    case "spawn": return MapPin;
    case "model": return Box;
    case "folder": return Folder;
    case "tool": return Wrench;
    default: return PersonStanding;
  }
}

/* --------------------------- context menu ---------------------------- */
interface CtxTarget {
  type: "workspace" | "model" | "part" | "script" | "service";
  id?: string;
}

function ContextMenu({
  pos,
  target,
  onClose,
  onInsert,
  onRename,
}: {
  pos: { x: number; y: number };
  target: CtxTarget;
  onClose: () => void;
  onInsert: (it: InsertTarget, parentModelId: string | null) => void;
  onRename: () => void;
}) {
  const { engine } = useStudioCtx();
  const [insertOpen, setInsertOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // keep the menu on screen without state (avoids cascading renders)
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let { x, y } = pos;
    if (x + r.width > window.innerWidth - 8) x = Math.max(8, window.innerWidth - r.width - 8);
    if (y + r.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - r.height - 8);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  });

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // defer so the opening right-click doesn't immediately close us
    const t = setTimeout(() => document.addEventListener("mousedown", close), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const parentModelId = target.type === "model" || target.type === "service" ? target.id! : null;
  const part = target.type === "part" && engine ? engine.getPartData(target.id!) : null;
  const script = target.type === "script" && engine ? engine.getScript(target.id!) : null;

  const item = (
    icon: ComponentType<{ size?: number; className?: string }>,
    label: string,
    onClick: () => void,
    danger?: boolean,
    hint?: string,
    keepOpen = false,
  ) => {
    const Icon = icon;
    return (
      <button
        key={label}
        type="button"
        onClick={() => {
          onClick();
          if (!keepOpen) onClose();
        }}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] hover:bg-[#2e3136] ${danger ? "text-[#ff9b9b]" : "text-[#c8ccd2]"}`}
      >
        <Icon size={14} className="shrink-0 text-[#b7bcc4]" />
        <span className="flex-1">{label}</span>
        {hint && <span className="text-[9.5px] text-[#7a7f88]">{hint}</span>}
      </button>
    );
  };

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[1001] w-[216px] rounded-md border border-[#3a3d42] bg-[#1e2023] py-1 shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {insertOpen ? (
        <>
          {item(ChevronLeft, "Back", () => setInsertOpen(false), false, undefined, true)}
          <div className="my-1 h-px bg-[#34373c]" />
          {INSERT_ITEMS.map((it) => {
            const Icon = insertItemIcon(it);
            return item(Icon, it.label, () => onInsert(it, parentModelId));
          })}
        </>
      ) : (
        <>
          {target.type === "service" && (
            <>
              <div className="px-3 py-1 text-[9.5px] font-semibold uppercase tracking-wide text-[#7a7f88]">Insert into {target.id}</div>
              {(["Script", "LocalScript", "ModuleScript"] as ScriptKind[]).map((kind) =>
                item(SCRIPT_ICONS[kind], kind, () => onInsert({ kind: "script", scriptKind: kind, label: kind }, target.id ?? null)),
              )}
            </>
          )}
          {(target.type === "workspace" || target.type === "model") && (
            <>
              {item(
                ChevronRight,
                target.type === "model" ? "Insert Object into Model" : "Insert Object",
                () => setInsertOpen(true),
                false,
                "▸",
                true,
              )}
              {target.type === "workspace" && item(Copy, "Paste", () => engine?.pasteClipboard(), false, "Ctrl+V")}
              {target.type === "workspace" && item(Box, "Select All", () => engine?.selectAll(), false, "Ctrl+A")}
              {target.type === "model" && <div className="my-1 h-px bg-[#34373c]" />}
              {target.type === "model" && item(Box, "Ungroup", () => engine?.ungroupSelection(), false, "Ctrl+U")}
              {target.type === "model" && item(ZoomIn, "Zoom To", () => target.id && engine?.focusObject("model", target.id))}
              {target.type === "model" && item(Copy, "Rename", onRename, false, "2×click")}
              {target.type === "model" && item(Trash2, "Delete", () => engine?.deleteSelection(), true, "Del")}
            </>
          )}
          {target.type === "part" && part && (
            <>
              {item(Copy, "Duplicate", () => engine?.duplicateSelection(), false, "Ctrl+D")}
              {item(Copy, "Copy", () => engine?.copySelection(), false, "Ctrl+C")}
              {item(Anchor, part.anchored ? "Unanchor" : "Anchor", () => {
                engine?.updatePart(part.id, { anchored: !part.anchored }, part.anchored ? "Unanchor" : "Anchor");
                useStudio.getState().bumpParts();
              })}
              {item(ZoomIn, "Zoom To", () => engine?.focusObject("part", part.id), false, "F")}
              {item(Copy, "Rename", onRename, false, "2×click")}
              <div className="my-1 h-px bg-[#34373c]" />
              {item(Trash2, "Delete", () => engine?.deleteSelection(), true, "Del")}
            </>
          )}
          {target.type === "script" && script && (
            <>
              {item(ScrollText, "Open Script", () => useStudio.getState().openScriptTab(script.id), false, "2×click")}
              {item(Copy, "Duplicate", () => {
                try {
                  engine?.addScript(script.kind, script.parentId, `${script.name} Copy`);
                  useStudio.getState().bumpParts();
                } catch { /* read-only gate already logged */ }
              })}
              {item(Copy, "Rename", onRename, false, "2×click")}
              {item(script.enabled ? Monitor : ScrollText, script.enabled ? "Disable" : "Enable", () => {
                engine?.setScriptEnabled(script.id, !script.enabled);
                useStudio.getState().bumpParts();
              })}
              <div className="my-1 h-px bg-[#34373c]" />
              {item(Trash2, "Delete", () => {
                engine?.deleteScript(script.id);
                useStudio.getState().bumpParts();
              }, true, "Del")}
            </>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}

/* ------------------------------ explorer ----------------------------- */
export function Explorer() {
  const { engine } = useStudioCtx();
  const partsVersion = useStudio((s) => s.partsVersion);
  const selectionVersion = useStudio((s) => s.selectionVersion);
  const bumpSelection = useStudio((s) => s.bumpSelection);
  const [openServices, setOpenServices] = useState<Set<string>>(new Set(["Workspace", "ServerScriptService", "StarterPack", "StarterPlayer", "StarterPlayerScripts", "StarterCharacterScripts"]));
  const [openModels, setOpenModels] = useState<Set<string>>(new Set());
  const [renameId, setRenameId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [ctx, setCtx] = useState<{ pos: { x: number; y: number }; target: CtxTarget } | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const plusRef = useRef<HTMLDivElement>(null);

  const data = engine?.explorerData();
  const allParts = engine?.getAllParts() ?? [];
  const starterTools = engine?.getTools() ?? [];
  const uiObjects = engine?.getUiObjects() ?? [];
  const myAccess = useStudio((s) => s.myAccess);
  // scripts the owner hid from this collaborator never show up in the tree
  const scripts = (engine?.getScripts() ?? []).filter(
    (sc) => !(myAccess && myAccess.role !== "owner" && myAccess.hiddenScripts.includes(sc.name)),
  );
  void partsVersion;
  void selectionVersion;

  const selectedIds = new Set((engine?.selection ?? []).map((r) => `${r.kind}:${r.id}`));

  const select = (kind: "part" | "model" | "service" | "script", id: string, additive = false) => {
    if (!engine) return;
    const ref = { kind, id } as const;
    if (additive) {
      const key = `${kind}:${id}`;
      const exists = engine.selection.some((s) => `${s.kind}:${s.id}` === key);
      engine.setSelection(exists ? engine.selection.filter((s) => `${s.kind}:${s.id}` !== key) : [...engine.selection, ref]);
    } else {
      engine.setSelection([ref]);
    }
    bumpSelection();
  };

  const startRename = (kind: "part" | "model" | "script", id: string) => setRenameId(`${kind}:${id}`);
  const commitRename = (value: string) => {
    if (!engine || !renameId) return;
    const [kind, id] = renameId.split(":");
    if (kind === "part") engine.renamePart(id, value);
    else if (kind === "model") engine.renameModel(id, value);
    else if (kind === "script") engine.renameScript(id, value);
    setRenameId(null);
    useStudio.getState().bumpParts();
  };

  const runInsert = (it: InsertTarget, parentModelId: string | null) => {
    if (!engine) return;
    try {
      if (it.kind === "shape") {
        engine.addPart(it.shape, undefined, parentModelId ? { parentId: parentModelId } : undefined);
      } else if (it.kind === "script") {
        engine.addScript(it.scriptKind, parentModelId ?? undefined);
      } else if (it.action === "spawn") engine.addSpawnLocation();
      else if (it.action === "model") engine.addModel("Model");
      else if (it.action === "folder") engine.addModel("Folder");
      else if (it.action === "tool") useStudio.getState().setToolCreatorOpen(true);
      else if (it.action === "gear") {
        useStudio.getState().setToolboxTab("gear");
        useStudio.getState().setToolboxOpen(true);
      } else if (it.action === "rigR6") engine.addRig("R6");
      else if (it.action === "rigR15") engine.addRig("R15");
      useStudio.getState().bumpParts();
    } catch {
      /* read-only gate already logged a warning */
    }
  };

  const openCtx = (e: React.MouseEvent, target: CtxTarget) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ pos: { x: e.clientX, y: e.clientY }, target });
  };

  const toggleOpen = (id: string) => {
    setOpenServices((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const scriptsUnder = (parentId: string) =>
    scripts.filter((sc) => sc.parentId === parentId && (!filter || sc.name.toLowerCase().includes(filter.toLowerCase())));

  const renderScripts = (parentId: string) =>
    scriptsUnder(parentId).map((sc) => (
      <ScriptRow
        key={sc.id}
        script={sc}
        selected={selectedIds.has(`script:${sc.id}`)}
        renaming={renameId === `script:${sc.id}`}
        onSelect={(add) => select("script", sc.id, add)}
        onOpen={() => useStudio.getState().openScriptTab(sc.id)}
        onRename={() => startRename("script", sc.id)}
        onCommitRename={commitRename}
        onCancelRename={() => setRenameId(null)}
        onContextMenu={(e) => openCtx(e, { type: "script", id: sc.id })}
      />
    ));

  return (
    <div className="flex min-h-0 flex-1 flex-col border-b border-[#34373c]">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[#2a2d31] bg-[#17181b] px-2">
        <FolderTree size={13} className="text-[#9aa0a8]" />
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9aa0a8]">Explorer</span>
        <div className="flex-1" />
        <div className="relative">
          <Search size={11} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[#7a7f88]" />
          <input
            className="studio-input h-6 w-[92px] pl-6 text-[11px]"
            placeholder="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        {/* quick insert button */}
        <div className="relative" ref={plusRef}>
          <button
            type="button"
            className="studio-btn h-6 w-6 text-[11px] font-bold text-[#8ce6a5]"
            title="Insert object into Workspace"
            onClick={() => setPlusOpen((v) => !v)}
          >
            +
          </button>
          {plusOpen && (
            <QuickInsertMenu
              anchorRef={plusRef}
              onClose={() => setPlusOpen(false)}
              onInsert={(it) => {
                runInsert(it, null);
                setPlusOpen(false);
              }}
            />
          )}
        </div>
      </div>

      <div className="studio-scroll flex-1 overflow-y-auto py-1 text-[#c8ccd2]">
        {SERVICES.map((svc) => (
          <div key={svc.id}>
            <div
              className={`studio-tree-row ${selectedIds.has(`service:${svc.id}`) ? "selected" : ""} ${svc.state === "comingSoon" ? "opacity-45 cursor-not-allowed" : ""}`}
              title={svc.note ?? (svc.state === "api" ? "Runtime API service" : svc.state === "partial" ? "Partially supported service" : "")}
              onClick={(e) => svc.selectable && svc.state !== "comingSoon" && select("service", svc.id, e.ctrlKey || e.metaKey)}
              onContextMenu={(e) => {
                if (svc.id === "Workspace") openCtx(e, { type: "workspace" });
                else if (svc.expandable && svc.state !== "comingSoon" && svc.id !== "StarterPack" && svc.id !== "Players") openCtx(e, { type: "service", id: svc.id });
              }}
            >
              {svc.expandable || svc.children?.length ? (
                <span onClick={() => toggleOpen(svc.id)} className="flex cursor-pointer items-center">
                  {openServices.has(svc.id) ? <ChevronDown size={12} className="text-[#9aa0a8]" /> : <ChevronRight size={12} className="text-[#9aa0a8]" />}
                </span>
              ) : (
                <span className="w-[12px]" />
              )}
              <svc.icon size={13} className={svc.id === "Lighting" ? "text-[#e8c76a]" : "text-[#8fa3bd]"} />
              <span className="truncate">{svc.label}</span>
              {svc.state === "comingSoon" && <span className="ml-auto shrink-0 text-[8px] text-[#777e88]">soon</span>}
              {svc.state === "partial" && <span className="ml-auto shrink-0 text-[8px] text-[#b89a64]">partial</span>}
              {svc.state === "api" && <span className="ml-auto shrink-0 text-[8px] text-[#86a9d5]">API</span>}
            </div>

            {/* Workspace children: models + parts */}
            {svc.id === "Workspace" && openServices.has("Workspace") && (
              <div className="ml-[13px] border-l border-[#2a2d31] pl-1">
                <div className="studio-tree-row cursor-default opacity-60" title="The editor viewport camera; not a place object you can move from Explorer.">
                  <span className="w-[12px]" /><Monitor size={13} className="text-[#8fa3bd]" />
                  <span className="truncate">Camera</span><span className="ml-auto text-[8px] text-[#7a7f88]">viewport</span>
                </div>
                <div className="studio-tree-row cursor-default opacity-40" title="Terrain editing is not implemented in Blockyard yet.">
                  <span className="w-[12px]" /><Globe size={13} className="text-[#8fa3bd]" />
                  <span className="truncate">Terrain</span><span className="ml-auto text-[8px] text-[#7a7f88]">soon</span>
                </div>
                {/* models */}
                {(data?.models ?? [])
                  .filter((m) => !filter || m.name.toLowerCase().includes(filter.toLowerCase()))
                  .map((m) => {
                    const children = allParts.filter((p) => p.parentId === m.id);
                    const modelScripts = scripts.filter((s) => s.parentId === m.id);
                    const open = openModels.has(m.id);
                    return (
                      <div key={m.id}>
                        <div
                          className={`studio-tree-row ${selectedIds.has(`model:${m.id}`) ? "selected" : ""}`}
                          onClick={(e) => select("model", m.id, e.ctrlKey || e.metaKey)}
                          onDoubleClick={() => startRename("model", m.id)}
                          onContextMenu={(e) => openCtx(e, { type: "model", id: m.id })}
                        >
                          <span onClick={(e) => { e.stopPropagation(); setOpenModels((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; }); }} className="flex cursor-pointer items-center">
                            {open ? <ChevronDown size={12} className="text-[#9aa0a8]" /> : <ChevronRight size={12} className="text-[#9aa0a8]" />}
                          </span>
                          <Folder size={13} className="text-[#e0b25a]" />
                          {renameId === `model:${m.id}` ? (
                            <RenameInput initial={m.name} onCommit={commitRename} onCancel={() => setRenameId(null)} />
                          ) : (
                            <span className="truncate">{m.name}</span>
                          )}
                          <span className="ml-auto text-[9px] text-[#7a7f88]">{children.length}</span>
                        </div>
                        {open && (
                          <div className="ml-[14px] border-l border-[#2a2d31] pl-1">
                            {children.map((p) => (
                              <PartRow
                                key={p.id}
                                part={p}
                                selected={selectedIds.has(`part:${p.id}`)}
                                renaming={renameId === `part:${p.id}`}
                                onSelect={(add) => select("part", p.id, add)}
                                onRename={() => startRename("part", p.id)}
                                onCommitRename={commitRename}
                                onCancelRename={() => setRenameId(null)}
                                onContextMenu={(e) => openCtx(e, { type: "part", id: p.id })}
                              />
                            ))}
                            {modelScripts.map((sc) => (
                              <ScriptRow
                                key={sc.id}
                                script={sc}
                                selected={selectedIds.has(`script:${sc.id}`)}
                                renaming={renameId === `script:${sc.id}`}
                                onSelect={(add) => select("script", sc.id, add)}
                                onOpen={() => useStudio.getState().openScriptTab(sc.id)}
                                onRename={() => startRename("script", sc.id)}
                                onCommitRename={commitRename}
                                onCancelRename={() => setRenameId(null)}
                                onContextMenu={(e) => openCtx(e, { type: "script", id: sc.id })}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                {/* root parts */}
                {(data?.parts ?? [])
                  .filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()))
                  .map((p) => (
                    <PartRow
                      key={p.id}
                      part={p}
                      selected={selectedIds.has(`part:${p.id}`)}
                      renaming={renameId === `part:${p.id}`}
                      onSelect={(add) => select("part", p.id, add)}
                      onRename={() => startRename("part", p.id)}
                      onCommitRename={commitRename}
                      onCancelRename={() => setRenameId(null)}
                      onContextMenu={(e) => openCtx(e, { type: "part", id: p.id })}
                    />
                  ))}
              </div>
            )}

            {svc.id === "Players" && openServices.has("Players") && (
              <div className="ml-[13px] border-l border-[#2a2d31] pl-1 px-1 py-1 text-[9.5px] italic text-[#777e88]">
                Player instances appear here during Play mode.
              </div>
            )}

            {/* StarterPack tools — templates copied into each player's Backpack on spawn */}
            {svc.id === "StarterPack" && openServices.has("StarterPack") && (
              <div className="ml-[13px] border-l border-[#2a2d31] pl-1">
                {starterTools.length > 0 ? starterTools.map((tool) => (
                  <div
                    key={tool.id}
                    className="studio-tree-row cursor-default"
                    title={`${tool.name} — ${tool.behavior} Tool; copied into each player's Backpack when they spawn`}
                    onDoubleClick={() => useStudio.getState().setToolCreatorOpen(true)}
                  >
                    <span className="w-[12px]" />
                    <span className="w-[13px] text-center text-[12px] leading-none">{tool.icon || "🧰"}</span>
                    <span className="min-w-0 truncate">{tool.name}</span>
                    <span className="ml-auto shrink-0 text-[9px] text-[#7a7f88]">Tool</span>
                  </div>
                )) : (
                  <div className="px-1 py-1 text-[9.5px] italic text-[#5d636d]">
                    empty — add tools from Toolbox → Gear or Tool Creator
                  </div>
                )}
              </div>
            )}

            {/* StarterGui ScreenGui children created in the visual UI editor. */}
            {svc.id === "StarterGui" && openServices.has("StarterGui") && (
              <div className="ml-[13px] border-l border-[#2a2d31] pl-1">
                {uiObjects.map((object) => (
                  <button
                    key={object.id}
                    type="button"
                    className="studio-tree-row w-full cursor-pointer text-left"
                    title={`${object.className} · double-click to edit in UI Editor`}
                    onClick={() => useStudio.getState().setUiEditorOpen(true)}
                    onDoubleClick={() => useStudio.getState().setUiEditorOpen(true)}
                  >
                    <span className="w-[12px]" />
                    <LayoutDashboard size={13} className="text-[#8ec5ff]" />
                    <span className="min-w-0 truncate">{object.name}</span>
                    <span className="ml-auto shrink-0 text-[9px] text-[#7a7f88]">{object.className}</span>
                  </button>
                ))}
                {!uiObjects.length && <div className="px-1 py-1 text-[9.5px] italic text-[#5d636d]">empty — use the UI tab to add a Frame, label or button</div>}
              </div>
            )}

            {/* script-holding services */}
            {svc.expandable && svc.id !== "Workspace" && svc.id !== "StarterPack" && openServices.has(svc.id) && (
              <div className="ml-[13px] border-l border-[#2a2d31] pl-1">
                {renderScripts(svc.id)}
                {!scriptsUnder(svc.id).length && (
                  <div className="px-1 py-0.5 text-[9.5px] italic text-[#5d636d]">{svc.note ?? "empty — right-click to insert"}</div>
                )}
              </div>
            )}

            {/* StarterPlayer child script containers */}
            {svc.children && openServices.has(svc.id) && (
              <div className="ml-[13px] border-l border-[#2a2d31] pl-1">
                {svc.children.map((child) => (
                  <div key={child.id}>
                    <div
                      className="studio-tree-row"
                      onClick={() => toggleOpen(child.id)}
                      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openCtx(e, { type: "service", id: child.id }); }}
                      title={child.note ?? `Scripts stored in ${child.label}`}
                    >
                      <span className="flex cursor-pointer items-center">
                        {openServices.has(child.id) ? <ChevronDown size={12} className="text-[#9aa0a8]" /> : <ChevronRight size={12} className="text-[#9aa0a8]" />}
                      </span>
                      <child.icon size={13} className="text-[#8fa3bd]" />
                      <span className="truncate">{child.label}</span>
                    </div>
                    {openServices.has(child.id) && (
                      <div className="ml-[14px] border-l border-[#2a2d31] pl-1">
                        {renderScripts(child.id)}
                        {!scriptsUnder(child.id).length && (
                          <div className="px-1 py-0.5 text-[9.5px] italic text-[#5d636d]">{child.note ?? "empty — right-click to insert"}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {ctx && (
        <ContextMenu
          pos={ctx.pos}
          target={ctx.target}
          onClose={() => setCtx(null)}
          onInsert={runInsert}
          onRename={() => {
            const t = ctx.target;
            if (t.id) setRenameId(`${t.type === "part" ? "part" : t.type === "script" ? "script" : "model"}:${t.id}`);
          }}
        />
      )}
    </div>
  );
}

function QuickInsertMenu({
  anchorRef,
  onClose,
  onInsert,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onInsert: (it: InsertTarget) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = menuRef.current;
    const r = anchorRef.current?.getBoundingClientRect();
    if (!el || !r) return;
    el.style.left = `${Math.min(r.left, window.innerWidth - 216)}px`;
    el.style.top = `${r.bottom + 6}px`;
  }, [anchorRef]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", close);
    };
  }, [onClose, anchorRef]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[1001] w-[216px] rounded-md border border-[#3a3d42] bg-[#1e2023] py-1 shadow-2xl studio-scroll"
      style={{ left: -9999, top: -9999, maxHeight: "calc(100vh - 20px)", overflowY: "auto" }}
    >
      <div className="px-3 py-1 text-[9.5px] font-semibold uppercase tracking-wide text-[#7a7f88]">Insert object</div>
      {INSERT_ITEMS.map((it) => {
        const Icon = insertItemIcon(it);
        return (
          <button
            key={it.label}
            type="button"
            onClick={() => onInsert(it)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] text-[#c8ccd2] hover:bg-[#2e3136]"
          >
            <Icon size={14} className="text-[#b7bcc4]" />
            {it.label}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

function PartRow({
  part,
  selected,
  renaming,
  onSelect,
  onRename,
  onCommitRename,
  onCancelRename,
  onContextMenu,
}: {
  part: PartData;
  selected: boolean;
  renaming: boolean;
  onSelect: (additive: boolean) => void;
  onRename: () => void;
  onCommitRename: (value: string) => void;
  onCancelRename: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const Icon = SHAPE_ICONS[part.shape] ?? Box;
  return (
    <div
      className={`studio-tree-row ${selected ? "selected" : ""}`}
      onClick={(e) => onSelect(e.ctrlKey || e.metaKey)}
      onDoubleClick={onRename}
      onContextMenu={onContextMenu}
    >
      {part.isSpawn ? (
        <MapPin size={13} className="text-[#6fb3e8]" />
      ) : (
        <Icon size={13} className="text-[#9aa0a8]" />
      )}
      {renaming ? (
        <RenameInput initial={part.name} onCommit={onCommitRename} onCancel={onCancelRename} />
      ) : (
        <span className="truncate">{part.name}</span>
      )}
      {!part.anchored && <span className="ml-auto text-[9px] text-[#7a7f88]" title="Unanchored">◌</span>}
    </div>
  );
}

function ScriptRow({
  script,
  selected,
  renaming,
  onSelect,
  onOpen,
  onRename,
  onCommitRename,
  onCancelRename,
  onContextMenu,
}: {
  script: ScriptData;
  selected: boolean;
  renaming: boolean;
  onSelect: (additive: boolean) => void;
  onOpen: () => void;
  onRename: () => void;
  onCommitRename: (value: string) => void;
  onCancelRename: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const Icon = SCRIPT_ICONS[script.kind];
  return (
    <div
      className={`studio-tree-row ${selected ? "selected" : ""}`}
      onClick={(e) => onSelect(e.ctrlKey || e.metaKey)}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
      title={`${script.kind} — double-click to edit`}
    >
      <Icon size={13} className={script.enabled ? "text-[#8ce6a5]" : "text-[#7a7f88]"} />
      {renaming ? (
        <RenameInput initial={script.name} onCommit={onCommitRename} onCancel={onCancelRename} />
      ) : (
        <span className={`truncate ${script.enabled ? "" : "italic text-[#7a7f88]"}`}>{script.name}</span>
      )}
      {!script.enabled && <span className="ml-auto text-[9px] text-[#ff9b9b]" title="Disabled">off</span>}
    </div>
  );
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      className="studio-input h-5 w-[130px] text-[11px]"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(value);
        if (e.key === "Escape") onCancel();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
