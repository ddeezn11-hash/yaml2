"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import {
  Anchor,
  Box,
  ChevronDown,
  Circle,
  ClipboardPaste,
  Copy,
  Cylinder,
  Film,
  FileCode2,
  FolderPlus,
  Grid3x3,
  ImagePlus,
  MapPin,
  Maximize2,
  Monitor,
  MousePointer2,
  Move3d,
  Package,
  PersonStanding,
  Pyramid,
  RotateCw,
  ScrollText,
  Sparkles,
  Square,
  Save,
  Server,
  UserPlus,
  LayoutTemplate,
  Eye,
  Wrench,
  Trash2,
  Triangle,
  Ungroup,
} from "lucide-react";
import { pickImage } from "@/lib/studio/imgupload";
import type { PartShape, ScriptKind } from "@/lib/studio/types";
import { useStudio } from "@/lib/studio/store";
import { useStudioCtx } from "./context";
import { ColorWidget, MaterialWidget } from "./ColorWidget";

const SNAP_MOVE_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Off", value: null },
  { label: "0.25", value: 0.25 },
  { label: "0.5", value: 0.5 },
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "4", value: 4 },
];

const SNAP_ROTATE_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Off", value: null },
  { label: "15°", value: 15 },
  { label: "45°", value: 45 },
  { label: "90°", value: 90 },
];

type IconType = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

export function Toolbar() {
  const { engine, stopPlay, runSeparateTest, testHere, startTestServer, startTestPlayer, stopTestServer } = useStudioCtx();
  const activeTab = useStudio((s) => s.activeTab);
  const tool = useStudio((s) => s.tool);
  const setToolStore = useStudio((s) => s.setTool);
  const snapMove = useStudio((s) => s.snapMove);
  const snapRotate = useStudio((s) => s.snapRotate);
  const setSnapMove = useStudio((s) => s.setSnapMove);
  const setSnapRotate = useStudio((s) => s.setSnapRotate);
  const localSpace = useStudio((s) => s.localSpace);
  const setLocalSpace = useStudio((s) => s.setLocalSpace);
  const selectionVersion = useStudio((s) => s.selectionVersion);
  const partsVersion = useStudio((s) => s.partsVersion);
  const bumpParts = useStudio((s) => s.bumpParts);
  const playing = useStudio((s) => s.playing);
  const testServerActive = useStudio((s) => s.testServerActive);
  const testWindowOpen = useStudio((s) => s.testWindowOpen);
  const testWindowMode = useStudio((s) => s.testWindowMode);
  const testPlayers = useStudio((s) => s.testPlayers);
  void selectionVersion;
  void partsVersion;

  const setTool = (t: typeof tool) => {
    engine?.setTool(t);
    setToolStore(t);
  };

  const applySnap = (move: number | null, rotate: number | null) => {
    setSnapMove(move);
    setSnapRotate(rotate);
    engine?.setSnap(move, rotate, null);
  };

  /** Upload an image and apply it to the selected part — or the baseplate. */
  const uploadImageToSelection = async () => {
    if (!engine) return;
    const img = await pickImage();
    if (!img) return;
    const assetId = engine.registerAsset(img.dataUrl);
    const selPart = engine.selection.find((r) => r.kind === "part");
    if (selPart) {
      engine.setPartTexture((selPart as { kind: "part"; id: string }).id, assetId, 1);
    } else {
      engine.setBaseplateTexture(assetId, 64);
    }
    useStudio.getState().bumpParts();
  };

  return (
    <div className="studio-scroll flex h-[64px] items-stretch overflow-x-auto border-b border-[#34373c] bg-[#242629] shrink-0">
      {activeTab === "Home" && (
        <>
          <RibbonGroup label="Clipboard">
            <ToolbarBtn icon={ClipboardPaste} label="Paste" onClick={() => engine?.pasteClipboard()} shortcut="Ctrl+V" />
            <ToolbarBtn icon={Copy} label="Duplicate" onClick={() => engine?.duplicateSelection()} shortcut="Ctrl+D" />
          </RibbonGroup>
          <RibbonGroup label="Tools">
            <ToolbarBtn icon={MousePointer2} label="Select" active={tool === "select"} onClick={() => setTool("select")} shortcut="Ctrl+1" />
            <ToolbarBtn icon={Move3d} label="Move" active={tool === "move"} onClick={() => setTool("move")} shortcut="Ctrl+2" />
            <ToolbarBtn icon={Maximize2} label="Scale" active={tool === "scale"} onClick={() => setTool("scale")} shortcut="Ctrl+3" />
            <ToolbarBtn icon={RotateCw} label="Rotate" active={tool === "rotate"} onClick={() => setTool("rotate")} shortcut="Ctrl+4" />
          </RibbonGroup>
          <RibbonGroup label="Insert">
            <PartDropdown onPick={(s) => { try { engine?.addPart(s); } catch { /* gate */ } }} />
            <ScriptDropdown onPick={(k) => { try { engine?.addScript(k); useStudio.getState().bumpParts(); } catch { /* gate */ } }} />
            <ToolbarBtn icon={FolderPlus} label="Folder" onClick={() => engine?.addModel("Folder")} title_="Insert an empty Folder under Workspace" />
            <ToolbarBtn icon={Wrench} label="Tool" onClick={() => useStudio.getState().setToolCreatorOpen(true)} title_="Design a game tool (sword, gun, medkit…) and add it to StarterPack" />
            <ToolbarBtn icon={MapPin} label="Spawn" onClick={() => engine?.addSpawnLocation()} title_="Insert a SpawnLocation pad" />
            <ToolbarBtn icon={Sparkles} label="Toolbox" onClick={() => useStudio.getState().setToolboxOpen(true)} title_="Browse models, gear, maps and animations — community + your assets" />
            <ToolbarBtn icon={ImagePlus} label="Image" onClick={uploadImageToSelection} title_="Upload an image and apply it to the selected part (or the baseplate)" />
          </RibbonGroup>
          <RibbonGroup label="Edit">
            <ToolbarBtn icon={Box} label="Group" onClick={() => engine?.groupSelection()} shortcut="Ctrl+G" />
            <ToolbarBtn icon={Ungroup} label="Ungroup" onClick={() => engine?.ungroupSelection()} shortcut="Ctrl+U" />
            <ToolbarBtn
              icon={Anchor}
              label="Anchor"
              active={(() => {
                const parts = engine?.selection.filter((r) => r.kind === "part") ?? [];
                return parts.length > 0 && parts.every((r) => engine?.getPartData(r.id)?.anchored);
              })()}
              onClick={() => {
                if (!engine) return;
                const targets = engine.selection.filter((r) => r.kind === "part");
                if (!targets.length) {
                  engine.log("warn", "Select a part first — Anchor freezes it in place");
                  return;
                }
                const allAnchored = targets.every((r) => engine.getPartData(r.id)?.anchored);
                for (const r of targets) engine.updatePart(r.id, { anchored: !allAnchored }, allAnchored ? "Unanchor" : "Anchor");
                bumpParts();
              }}
            />
          </RibbonGroup>
          <RibbonGroup label="Appearance">
            <ColorWidget />
            <MaterialWidget />
          </RibbonGroup>
          <RibbonGroup label="Object">
            <ToolbarBtn icon={Trash2} label="Delete" danger onClick={() => engine?.deleteSelection()} shortcut="Del" />
          </RibbonGroup>
        </>
      )}

      {activeTab === "Model" && (
        <>
          <RibbonGroup label="Snap">
            <div className="flex flex-col justify-center gap-1.5 py-1">
              <SnapSelect label="Move" options={SNAP_MOVE_OPTIONS} value={snapMove} onChange={(v) => applySnap(v, snapRotate)} />
              <SnapSelect label="Rotate" options={SNAP_ROTATE_OPTIONS} value={snapRotate} onChange={(v) => applySnap(snapMove, v)} />
            </div>
          </RibbonGroup>
          <RibbonGroup label="Coordinates">
            <ToolbarBtn
              icon={Box}
              label={localSpace ? "Local" : "World"}
              active={localSpace}
              onClick={() => {
                engine?.setSpace(!localSpace);
                setLocalSpace(!localSpace);
              }}
              shortcut="Ctrl+L"
            />
            <ToolbarBtn icon={RotateCw} label="Rotate 90°" onClick={() => engine?.rotateSelectionY(90)} shortcut="Ctrl+R" />
          </RibbonGroup>
          <RibbonGroup label="Camera">
            <ToolbarBtn icon={Grid3x3} label="Focus" onClick={() => engine?.focusSelection()} shortcut="F" />
          </RibbonGroup>
          <RibbonGroup label="Workspace">
            <ToolbarBtn icon={Box} label="Select Baseplate" onClick={() => engine?.setSelection([{ kind: "part", id: "baseplate" }])} title_="Select the real Baseplate part so you can move, scale, rotate, or edit its properties" />
          </RibbonGroup>
          <RibbonGroup label="Toolbox">
            <ToolbarBtn icon={Sparkles} label="Toolbox" onClick={() => useStudio.getState().setToolboxOpen(true)} title_="Models, gear, maps and animations — community Creator Store" />
          </RibbonGroup>
        </>
      )}

      {activeTab === "Avatar" && <AvatarTab />}

      {activeTab === "UI" && (
        <>
          <RibbonGroup label="Insert UI">
            {(["Frame", "TextLabel", "TextButton", "TextBox", "ImageLabel", "ImageButton"] as const).map((kind) => (
              <ToolbarBtn key={kind} icon={kind.startsWith("Image") ? ImagePlus : LayoutTemplate} label={kind} onClick={() => {
                try { engine?.addUiObject(kind); useStudio.getState().setUiEditorOpen(true); bumpParts(); }
                catch { engine?.log("warn", "Your role cannot edit UI elements in this shared place."); }
              }} />
            ))}
          </RibbonGroup>
          <RibbonGroup label="Designer">
            <ToolbarBtn icon={Eye} label="Open UI Editor" active={useStudio.getState().uiEditorOpen} onClick={() => useStudio.getState().setUiEditorOpen(true)} />
            <div className="flex flex-col justify-center px-2 text-[10px] text-[#8f9aa7]">Design StarterGui overlays<br/>Preview 16:9 · drag to position</div>
          </RibbonGroup>
        </>
      )}

      {activeTab === "Script" && (
        <ScriptToolbar engine={engine} />
      )}

      {activeTab === "Test" && (
        <>
          <RibbonGroup label="Local Test">
            <ToolbarBtn icon={MapPin} label="Test Here" onClick={testHere} title_="Start a separate play instance at the editor camera's ground position" />
            <ToolbarBtn icon={Play} label="Run" onClick={runSeparateTest} title_="Open a separate local game preview without Team Create networking" />
          </RibbonGroup>
          <RibbonGroup label="Team Test Server">
            <ToolbarBtn icon={Server} label="Start Server" active={testServerActive} disabled={testServerActive} onClick={startTestServer} title_="Start a shared test server for everyone in this Team Create room" />
            <ToolbarBtn icon={UserPlus} label="Start Player" disabled={!testServerActive || (testWindowOpen && testWindowMode === "shared")} onClick={startTestPlayer} title_="Join the shared Studio test server in a separate game window (converts a local preview if one is open)" />
            <ToolbarBtn icon={Square} label="Stop Player" danger disabled={!testWindowOpen} onClick={() => useStudio.getState().setTestWindowOpen(false)} />
            <ToolbarBtn icon={Square} label="Stop Server" danger disabled={!testServerActive} onClick={stopTestServer} title_="Stop the shared Team Create test server" />
          </RibbonGroup>
          <RibbonGroup label="Test Status">
            <div className="flex flex-col justify-center gap-1 px-2 text-[10px] leading-snug text-[#a2acb8]">
              <span>{testServerActive ? `Shared server active · ${testPlayers.length} test player(s)` : "No shared test server"}</span>
              <span>Separate game window · editor remains editable · live changes mirror into the test</span>
            </div>
          </RibbonGroup>
        </>
      )}

      {activeTab === "View" && <ViewTab />}
    </div>
  );
}

function ScriptToolbar({ engine }: { engine: ReturnType<typeof useStudioCtx>["engine"] }) {
  const partsVersion = useStudio((s) => s.partsVersion);
  const openScriptTab = useStudio((s) => s.openScriptTab);
  const scripts = engine?.getScripts() ?? [];
  void partsVersion;
  const create = (kind: ScriptKind, parent = kind === "LocalScript" ? "StarterPlayerScripts" : "ServerScriptService") => {
    if (!engine) return;
    try {
      const script = engine.addScript(kind, parent);
      useStudio.getState().bumpParts();
      openScriptTab(script.id);
    } catch { engine.log("warn", "Your role cannot edit scripts in this shared place."); }
  };
  return (
    <>
      <RibbonGroup label="Create">
        <ToolbarBtn icon={FileCode2} label="Server Script" onClick={() => create("Script")} />
        <ToolbarBtn icon={Monitor} label="LocalScript" onClick={() => create("LocalScript")} />
        <ToolbarBtn icon={Package} label="ModuleScript" onClick={() => create("ModuleScript", "ReplicatedStorage")} />
      </RibbonGroup>
      <RibbonGroup label="Open Script">
        <div className="flex max-w-[420px] items-center gap-1 overflow-x-auto py-1">
          {scripts.slice(0, 8).map((script) => (
            <button key={script.id} type="button" className="studio-btn h-8 shrink-0 px-2 text-[10px]" onClick={() => openScriptTab(script.id)} title={`${script.kind} · ${script.parentId}`}>
              {script.name}
            </button>
          ))}
          {!scripts.length && <span className="px-2 text-[10px] text-[#87919d]">No scripts yet — create one to open the Script Editor.</span>}
        </div>
      </RibbonGroup>
      <RibbonGroup label="Editor">
        <div className="flex flex-col justify-center gap-1 px-2 text-[10px] text-[#a2acb8]">
          <span>Ctrl+S saves the active script</span>
          <span>Scripts are shared live with Team Create editors</span>
        </div>
      </RibbonGroup>
    </>
  );
}

function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="studio-ribbon-group">
      <div className="flex flex-1 items-center gap-1">{children}</div>
      <div className="studio-ribbon-label">{label}</div>
    </div>
  );
}

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
  active,
  danger,
  shortcut,
  disabled,
  title_,
}: {
  icon: IconType;
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  shortcut?: string;
  disabled?: boolean;
  title_?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`studio-btn studio-tool ${active ? "active" : ""} ${danger ? "text-[#ff9b9b]" : ""}`}
      title={shortcut ? `${title_ ?? label} (${shortcut})` : (title_ ?? label)}
    >
      <Icon />
      {label}
    </button>
  );
}

/**
 * Dropdown that renders in a document.body portal with fixed positioning,
 * so it never gets clipped by the ribbon's overflow-x scroll container.
 */
export function PortalDropdown({
  button,
  children,
  width,
  align = "start",
}: {
  button: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setRect({ left: align === "end" ? r.right : r.left, top: r.bottom + 6 });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const closeOnScroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <div onClick={() => setOpen((v) => !v)}>{button}</div>
      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[999] max-h-[70vh] overflow-y-auto rounded-md border border-[#3a3d42] bg-[#1e2023] py-1 shadow-2xl"
            style={{ left: rect.left, top: rect.top, width: width ?? 180, maxHeight: "calc(100vh - 20px)" }}
            onClick={() => setOpen(false)}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  label,
  onClick,
  hint,
  danger,
}: {
  icon?: IconType;
  label: string;
  onClick?: () => void;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] hover:bg-[#2e3136] ${danger ? "text-[#ff9b9b]" : "text-[#c8ccd2]"}`}
    >
      {Icon ? <Icon size={14} className="shrink-0 text-[#b7bcc4]" /> : <span className="w-[14px] shrink-0" />}
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[9.5px] text-[#7a7f88]">{hint}</span>}
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-[#34373c]" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-1 text-[9.5px] font-semibold uppercase tracking-wide text-[#7a7f88]">{children}</div>;
}

const PART_ITEMS: { shape: PartShape; label: string; icon: IconType }[] = [
  { shape: "Block", label: "Part (Block)", icon: Box },
  { shape: "Sphere", label: "Ball", icon: Circle },
  { shape: "Wedge", label: "Wedge", icon: Triangle },
  { shape: "Cylinder", label: "Cylinder", icon: Cylinder },
  { shape: "CornerWedge", label: "Corner Wedge", icon: Pyramid },
];

function PartDropdown({ onPick }: { onPick: (shape: PartShape) => void }) {
  return (
    <PortalDropdown
      width={200}
      button={
        <button type="button" className="studio-btn studio-tool" title="Insert a new part">
          <span className="flex items-center gap-0.5">
            <Box />
            <ChevronDown size={11} className="opacity-70" />
          </span>
          Part
        </button>
      }
    >
      {PART_ITEMS.map((it) => (
        <MenuItem key={it.shape} icon={it.icon} label={it.label} onClick={() => onPick(it.shape)} />
      ))}
    </PortalDropdown>
  );
}

const SCRIPT_ITEMS: { kind: ScriptKind; label: string; icon: IconType }[] = [
  { kind: "Script", label: "Script (server)", icon: ScrollText },
  { kind: "LocalScript", label: "LocalScript (client)", icon: Monitor },
  { kind: "ModuleScript", label: "ModuleScript (library)", icon: Package },
];

function ScriptDropdown({ onPick }: { onPick: (kind: ScriptKind) => void }) {
  return (
    <PortalDropdown
      width={220}
      button={
        <button type="button" className="studio-btn studio-tool" title="Insert a code file (runs when you press Play)">
          <span className="flex items-center gap-0.5">
            <ScrollText />
            <ChevronDown size={11} className="opacity-70" />
          </span>
          Script
        </button>
      }
    >
      {SCRIPT_ITEMS.map((it) => (
        <MenuItem key={it.kind} icon={it.icon} label={it.label} onClick={() => onPick(it.kind)} />
      ))}
    </PortalDropdown>
  );
}

function AvatarTab() {
  const { engine } = useStudioCtx();
  const setAnimationEditorOpen = useStudio((s) => s.setAnimationEditorOpen);
  return (
    <>
      <RibbonGroup label="Rig Builder">
        <ToolbarBtn icon={PersonStanding} label="R6 Dummy" onClick={() => engine?.addRig("R6")} title_="Classic 6-part noob dummy" />
        <ToolbarBtn icon={PersonStanding} label="R15 Block Rig" onClick={() => engine?.addRig("R15")} title_="15-part grey test rig" />
      </RibbonGroup>
      <RibbonGroup label="Animation">
        <ToolbarBtn icon={Film} label="Animation Editor" onClick={() => setAnimationEditorOpen(true)} title_="Pose rig limbs and build keyframe animations" />
      </RibbonGroup>
      <RibbonGroup label="Spawns">
        <ToolbarBtn icon={MapPin} label="Spawn Pad" onClick={() => engine?.addSpawnLocation()} title_="Insert a SpawnLocation where players appear" />
      </RibbonGroup>
      <RibbonGroup label="How to test">
        <div className="flex max-w-[380px] flex-col justify-center gap-0.5 py-1 text-[10px] leading-snug text-[#9aa0a8]">
          <span>Rigs spawn at the camera focus point, anchored, grouped as a Model.</span>
          <span>Use the Move tool to drag them. Press F5 to play-test as your own character.</span>
        </div>
      </RibbonGroup>
    </>
  );
}

function SnapSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: number | null }[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[10.5px] text-[#b7bcc4]">
      <span className="w-11 text-right">{label}</span>
      <select
        className="studio-input h-6 w-[70px] cursor-pointer"
        value={value === null ? "off" : String(value)}
        onChange={(e) => onChange(e.target.value === "off" ? null : Number(e.target.value))}
      >
        {options.map((o) => (
          <option key={o.label} value={o.value === null ? "off" : String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ViewTab() {
  const { engine } = useStudioCtx();
  const showExplorer = useStudio((s) => s.showExplorer);
  const showProperties = useStudio((s) => s.showProperties);
  const showOutput = useStudio((s) => s.showOutput);
  const toggleExplorer = useStudio((s) => s.toggleExplorer);
  const toggleProperties = useStudio((s) => s.toggleProperties);
  const setShowOutput = useStudio((s) => s.setShowOutput);
  const setStartPageOpen = useStudio((s) => s.setStartPageOpen);
  const [gridOn, setGridOn] = useState(true);
  return (
    <>
      <RibbonGroup label="Windows">
        <ToolbarBtn icon={Box} label="Explorer" active={showExplorer} onClick={toggleExplorer} />
        <ToolbarBtn icon={Copy} label="Properties" active={showProperties} onClick={toggleProperties} />
        <ToolbarBtn icon={Square} label="Output" active={showOutput} onClick={() => setShowOutput(!showOutput)} />
        <ToolbarBtn icon={Grid3x3} label="Start Page" onClick={() => setStartPageOpen(true)} title_="Open the template start page" />
      </RibbonGroup>
      <RibbonGroup label="Viewport">
        <ToolbarBtn
          icon={Grid3x3}
          label="Grid"
          active={gridOn}
          onClick={() => {
            const next = !gridOn;
            setGridOn(next);
            engine?.setGridVisible(next);
          }}
        />
        <ToolbarBtn
          icon={Maximize2}
          label="Fullscreen"
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen();
          }}
        />
        <div className="flex flex-col justify-center px-2 text-[9px] leading-tight text-[#9aa4af]">
          <span>Orbit: drag empty sky</span>
          <span>Pan: middle-drag · Zoom: wheel</span>
        </div>
      </RibbonGroup>
    </>
  );
}
