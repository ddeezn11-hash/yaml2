"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, Copy, GripHorizontal, Lock, Monitor, Package, ScrollText, Search, TriangleAlert, X } from "lucide-react";
import { checkSyntax } from "@/lib/studio/bloxscript";
import type { ScriptData } from "@/lib/studio/types";
import { useStudio } from "@/lib/studio/store";
import { useStudioCtx } from "./context";
import { SCRIPT_ICONS } from "./Explorer";
import { DOC_CATEGORIES, DOC_COUNT, LUAU_DOCS, SCRIPT_TYPE_GUIDE, searchDocs, type DocEntry } from "@/lib/studio/luaudocs";

/* --------------------------- syntax highlighting ---------------------------- */

const KEYWORDS = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in",
  "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
]);
const GLOBALS = new Set([
  "game", "workspace", "Workspace", "script", "print", "warn", "task", "math", "string", "table", "os",
  "pairs", "ipairs", "tostring", "tonumber", "type", "typeof", "wait", "tick", "Instance", "Vector3",
  "Color3", "BrickColor", "CFrame", "Enum", "require", "shared", "next", "unpack",
]);

interface Tok { text: string; cls: string }

function tokenizeLine(line: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = line.length;
  const push = (text: string, cls: string) => toks.push({ text, cls });
  while (i < n) {
    const c = line[i];
    // comment
    if (c === "-" && line[i + 1] === "-") {
      push(line.slice(i), "tk-comment");
      break;
    }
    // strings
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && line[j] !== c) {
        if (line[j] === "\\") j++;
        j++;
      }
      push(line.slice(i, Math.min(j + 1, n)), "tk-string");
      i = j + 1;
      continue;
    }
    // numbers
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9a-fA-FxXeE.]/.test(line[j])) j++;
      push(line.slice(i, j), "tk-number");
      i = j;
      continue;
    }
    // names
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (KEYWORDS.has(word)) push(word, "tk-keyword");
      else if (GLOBALS.has(word)) push(word, "tk-global");
      else push(word, "");
      i = j;
      continue;
    }
    // operators
    if ("+-*/%^#<>=(){}[];:,.".includes(c)) {
      push(c, "tk-op");
      i++;
      continue;
    }
    push(c, "");
    i++;
  }
  return toks;
}

function Highlighted({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <>
      {lines.map((line, idx) => (
        <span key={idx}>
          {tokenizeLine(line).map((t, i) => (
            <span key={i} className={t.cls}>{t.text}</span>
          ))}
          {"\n"}
        </span>
      ))}
    </>
  );
}

/* ---------------------------- context badges ------------------------------- */

const CONTEXT_STYLE: Record<string, string> = {
  server: "border-[#2c5a3d] bg-[#1b2b21] text-[#8ce6a5]",
  client: "border-[#4a4218] bg-[#2b271b] text-[#e8c76a]",
  module: "border-[#3d2c5a] bg-[#221b2b] text-[#c39be8]",
  both: "border-[#2c4a5a] bg-[#1b2b33] text-[#8ec5ff]",
};
const CONTEXT_LABEL: Record<string, string> = {
  server: "Server",
  client: "Client",
  module: "Module",
  both: "Any",
};

/** Does this doc conflict with the script kind being edited? */
function contextConflict(doc: DocEntry, kind: ScriptData["kind"]): string | null {
  if (kind === "Script" && doc.context === "client") return "Needs a LocalScript";
  if (kind === "LocalScript" && doc.context === "server") return "Needs a server Script";
  return null;
}

/* --------------------------- tab drafts (module) ---------------------------- */

/** Unsaved buffers, keyed by script id. Lives outside React so switching or
 *  re-opening tabs keeps your typing; cleared when a tab is closed (saved). */
const drafts = new Map<string, string>();

/* ------------------------- floating window shell ---------------------------- */

interface WinGeo { x: number; y: number; w: number; h: number }

function initialGeo(): WinGeo {
  if (typeof window === "undefined") return { x: 40, y: 40, w: 1000, h: 620 };
  const w = Math.min(1060, Math.max(560, window.innerWidth - 120));
  const h = Math.min(660, Math.max(360, window.innerHeight - 140));
  return { x: Math.max(8, (window.innerWidth - w) / 2), y: 52, w, h };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The Roblox Studio-style floating Script Editor: one movable, resizable
 *  document window with a tab strip for every open script. */
export function ScriptEditor() {
  const openScriptIds = useStudio((s) => s.openScriptIds);
  const activeScriptId = useStudio((s) => s.activeScriptId);
  const scriptDirty = useStudio((s) => s.scriptDirty);
  const partsVersion = useStudio((s) => s.partsVersion);
  const myAccess = useStudio((s) => s.myAccess);
  const { engine } = useStudioCtx();

  const [geo, setGeo] = useState<WinGeo>(initialGeo);
  const [showApi, setShowApi] = useState(true);
  const winRef = useRef<HTMLDivElement>(null);

  /* live script objects for the open tabs (prunes tabs whose script vanished) */
  const scripts = useMemo(() => {
    void partsVersion;
    if (!engine) return [];
    return openScriptIds
      .map((id) => engine.getScript(id))
      .filter((s): s is ScriptData => !!s)
      .filter((s) => !(myAccess && myAccess.role !== "owner" && myAccess.hiddenScripts.includes(s.name)));
  }, [openScriptIds, engine, partsVersion, myAccess]);

  useEffect(() => {
    const live = new Set(scripts.map((s) => s.id));
    for (const id of openScriptIds) {
      if (!live.has(id)) {
        drafts.delete(id);
        useStudio.getState().closeScriptTab(id);
      }
    }
  }, [scripts, openScriptIds]);

  const saveTab = (id: string) => {
    if (!engine) return;
    if (!useStudio.getState().scriptDirty[id]) return;
    const src = drafts.get(id);
    if (src !== undefined) engine.setScriptSource(id, src);
    useStudio.getState().markScriptDirty(id, false);
    useStudio.getState().bumpParts();
  };

  const closeTab = (id: string) => {
    saveTab(id);
    drafts.delete(id);
    useStudio.getState().closeScriptTab(id);
  };

  const closeAll = () => {
    for (const s of scripts) closeTab(s.id);
  };

  /* window-level keys: Ctrl+S saves the active tab, Esc closes it when the
   * editor window itself has focus (matches Roblox Studio document windows) */
  useEffect(() => {
    if (scripts.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const active = useStudio.getState().activeScriptId;
      if (!active) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveTab(active);
      } else if (e.key === "Escape") {
        const focused = winRef.current?.contains(document.activeElement) ?? false;
        if (focused) closeTab(active);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scripts.length, engine]);

  if (scripts.length === 0) return null;

  /* ------------------------------ drag / resize ---------------------------- */
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,input,label")) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = geo.x;
    const oy = geo.y;
    const move = (ev: PointerEvent) => {
      setGeo((g) => ({
        ...g,
        x: clamp(ox + ev.clientX - sx, 96 - g.w, window.innerWidth - 96),
        y: clamp(oy + ev.clientY - sy, 0, window.innerHeight - 48),
      }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const ow = geo.w;
    const oh = geo.h;
    const move = (ev: PointerEvent) => {
      setGeo((g) => ({
        ...g,
        w: clamp(ow + ev.clientX - sx, 560, window.innerWidth - 16),
        h: clamp(oh + ev.clientY - sy, 320, window.innerHeight - 16),
      }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={winRef}
      className="fixed z-[1050] flex flex-col overflow-hidden rounded-lg border border-[#3a3d42] bg-[#1b1d20] shadow-[0_18px_60px_rgba(0,0,0,.55)]"
      style={{ left: geo.x, top: geo.y, width: geo.w, height: geo.h }}
    >
      {/* ------------------------- window title bar ------------------------- */}
      <div
        onPointerDown={startDrag}
        className="flex h-9 shrink-0 cursor-grab items-center gap-2 border-b border-[#34373c] bg-[#17181b] px-3 active:cursor-grabbing"
      >
        <GripHorizontal size={13} className="shrink-0 text-[#565b63]" />
        <span className="text-[11.5px] font-bold tracking-wide text-[#c8ccd2]">Script Editor</span>
        <span className="rounded border border-[#2a4a34] bg-[#16211a] px-1.5 py-0.5 text-[9px] font-semibold text-[#8ce6a5]">
          {scripts.length} open
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowApi((v) => !v)}
          className={`studio-btn h-7 gap-1.5 px-2.5 text-[10.5px] ${showApi ? "text-[#8ce6a5]" : "text-[#c8ccd2]"}`}
          title="Toggle the command docs browser"
        >
          <BookOpen size={12} /> Docs · {DOC_COUNT}
        </button>
        <button type="button" className="studio-btn h-7 w-7" onClick={closeAll} title="Close window (saves every tab)">
          <X size={13} />
        </button>
      </div>

      {/* ----------------------------- tab strip ----------------------------- */}
      <div className="studio-scroll flex h-[34px] shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-[#2a2d31] bg-[#14161a] px-1 pt-1">
        {scripts.map((s) => {
          const Icon = SCRIPT_ICONS[s.kind];
          const active = s.id === activeScriptId;
          const dirty = !!scriptDirty[s.id];
          return (
            <div
              key={s.id}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => useStudio.getState().setActiveScriptId(s.id)}
              onAuxClick={(e) => {
                if (e.button === 1) closeTab(s.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") useStudio.getState().setActiveScriptId(s.id);
              }}
              title={`${s.name} (${s.kind})`}
              className={`group flex max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border-x border-t px-2.5 text-[11px] ${
                active
                  ? "border-[#3a3d42] bg-[#1b1d20] font-semibold text-[#e8ebee]"
                  : "border-transparent bg-[#191b1e] text-[#9aa0a8] hover:bg-[#1e2023]"
              }`}
            >
              <Icon size={12} className={`shrink-0 ${s.kind === "Script" ? "text-[#8ce6a5]" : s.kind === "LocalScript" ? "text-[#e8c76a]" : "text-[#c39be8]"}`} />
              <span className="max-w-[130px] truncate">{s.name}</span>
              {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e8c76a]" title="Unsaved changes" />}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(s.id);
                }}
                className="grid h-4 w-4 shrink-0 place-items-center rounded text-[#565b63] opacity-0 hover:bg-[#2a2d31] hover:text-white group-hover:opacity-100"
                title="Close tab"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>

      {/* ------------------------- editors (all mounted) ------------------------- */}
      {scripts.map((s) => (
        <EditorBody
          key={s.id}
          script={s}
          hidden={s.id !== activeScriptId}
          showApi={showApi}
          readOnly={!!myAccess && myAccess.role !== "owner" && !myAccess.canEditScripts}
        />
      ))}

      {/* window resize handle */}
      <div
        onPointerDown={startResize}
        className="absolute bottom-0 right-0 z-40 h-4 w-4 cursor-nwse-resize"
        title="Drag to resize"
      >
        <svg viewBox="0 0 16 16" className="h-full w-full text-[#565b63]">
          <path d="M14 5 L5 14 M14 10 L10 14" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </div>
    </div>
  );
}

/* -------------------------------- editor ---------------------------------- */

function EditorBody({ script, hidden, showApi, readOnly }: { script: ScriptData; hidden: boolean; showApi: boolean; readOnly: boolean }) {
  const bumpParts = useStudio((s) => s.bumpParts);
  const { engine } = useStudioCtx();
  const [source, setSource] = useState(() => drafts.get(script.id) ?? script.source);
  /* single source of truth for the dirty flag lives in the studio store,
   * so the tab dot, the header badge and Ctrl+S always agree */
  const dirty = useStudio((s) => !!s.scriptDirty[script.id]);
  const [savedFlash, setSavedFlash] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  /* docs browser state */
  const [docsQuery, setDocsQuery] = useState("");
  const [docsCat, setDocsCat] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /* autocomplete state */
  const [caret, setCaret] = useState(0);
  const [acSelected, setAcSelected] = useState(0);
  const [acDismissed, setAcDismissed] = useState(false);
  const [acPrefixPrev, setAcPrefixPrev] = useState("");

  const check = useMemo(() => (source.trim() ? checkSyntax(source) : ({ ok: true } as const)), [source]);

  const save = () => {
    if (!engine || !dirty || readOnly) return;
    const ok = engine.setScriptSource(script.id, source);
    if (ok === false) return; // read-only gate
    drafts.delete(script.id);
    useStudio.getState().markScriptDirty(script.id, false);
    bumpParts();
    // tell the room this builder saved a script (stats only — source stays local)
    engine.netSend?.({ type: "script:save", name: script.name });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const edit = (next: string) => {
    if (readOnly) return;
    setSource(next);
    drafts.set(script.id, next);
    useStudio.getState().markScriptDirty(script.id, true);
  };

  const KindIcon = SCRIPT_ICONS[script.kind];
  const lines = source.split("\n").length;

  const syncScroll = () => {
    if (!taRef.current) return;
    const { scrollTop, scrollLeft } = taRef.current;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
  };

  /* ------------------------------ docs search ----------------------------- */
  const docs = useMemo(() => {
    const results = searchDocs(docsQuery, docsCat);
    return results.slice(0, 80);
  }, [docsQuery, docsCat]);

  /* ----------------------------- autocomplete ----------------------------- */
  const acPrefix = useMemo(() => {
    const upToCaret = source.slice(0, caret);
    const m = upToCaret.match(/[A-Za-z0-9_.:]+$/);
    return m ? m[0] : "";
  }, [source, caret]);

  const acLine = useMemo(() => source.slice(0, caret).split("\n").length - 1, [source, caret]);

  const acItems = useMemo(() => {
    if (acDismissed || acPrefix.length < 2) return [];
    const p = acPrefix.toLowerCase();
    const exact = p.includes(".");
    return LUAU_DOCS.filter((d) => {
      if (d.category.startsWith("Recipes") || d.category.startsWith("Game commands") || d.category === "Tools" || d.category === "Hue reference" || d.category === "Color chart" || d.category === "Color palette" || d.category === "BrickColor palette") return false;
      const n = d.name.toLowerCase();
      return exact ? n.includes(p) : n.startsWith(p);
    }).slice(0, 7);
  }, [acPrefix, acDismissed]);

  // reset the highlighted item whenever the typed prefix changes (render-time derived state)
  if (acPrefixPrev !== acPrefix) {
    setAcPrefixPrev(acPrefix);
    setAcSelected(0);
  }

  const insertDocText = (d: DocEntry) => {
    let text: string;
    if (d.name.startsWith('BrickColor "')) {
      text = `BrickColor.new("${d.name.slice(12, -1)}")`;
    } else if (d.name.startsWith("Enum.Material.")) {
      text = d.name;
    } else if (/^(part|humanoid|player|baseplate|script)\./i.test(d.name) && !acPrefix.includes(".")) {
      text = d.name.slice(d.name.indexOf(".") + 1);
    } else {
      text = d.name.replace(/ \(.*\)$/, "");
    }
    insertText(text);
  };

  const insertText = (text: string) => {
    const ta = taRef.current;
    if (!ta || readOnly) return;
    let start = ta.selectionStart;
    let end = ta.selectionEnd;
    // when triggered from the docs sidebar (no selection range focus), append at caret/end
    if (document.activeElement !== ta) {
      start = end = Math.min(source.length, caret || source.length);
    }
    const next = source.slice(0, start) + text + source.slice(end);
    edit(next);
    setAcDismissed(true);
    requestAnimationFrame(() => {
      if (document.activeElement === ta) {
        ta.selectionStart = ta.selectionEnd = start + text.length;
        setCaret(start + text.length);
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    // autocomplete navigation
    if (acItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAcSelected((i) => (i + 1) % acItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAcSelected((i) => (i - 1 + acItems.length) % acItems.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        insertDocText(acItems[acSelected]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setAcDismissed(true);
        return;
      }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart, selectionEnd } = ta;
      const next = `${source.slice(0, selectionStart)}  ${source.slice(selectionEnd)}`;
      edit(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + 2;
      });
    }
  };

  const copyExample = (d: DocEntry) => {
    navigator.clipboard?.writeText(d.example).catch(() => {});
    setCopiedId(d.id);
    setTimeout(() => setCopiedId(null), 1200);
  };

  return (
    <div className={`min-h-0 flex-1 flex-col ${hidden ? "hidden" : "flex"}`}>
      {/* per-script header */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-[#34373c] bg-[#17181b] px-4 py-2">
        <KindIcon size={15} className="text-[#8ce6a5]" />
        <input
          className="studio-input h-7 w-56 text-[12.5px] font-semibold"
          value={script.name}
          readOnly={readOnly}
          title={readOnly ? "Renaming needs Editor access" : "Rename this script"}
          onChange={(e) => {
            engine?.renameScript(script.id, e.target.value);
            bumpParts();
          }}
        />
        <span className={`rounded border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${
          script.kind === "Script" ? "border-[#2c5a3d] bg-[#1b2b21] text-[#8ce6a5]"
          : script.kind === "LocalScript" ? "border-[#4a4218] bg-[#2b271b] text-[#e8c76a]"
          : "border-[#3d2c5a] bg-[#221b2b] text-[#c39be8]"
        }`}>
          {script.kind === "Script" ? "Server" : script.kind === "LocalScript" ? "Client" : "Module"}
        </span>
        {script.parentId && (
          <span className="text-[10px] text-[#7a7f88]">in {script.parentId}</span>
        )}
        {readOnly && (
          <span className="flex items-center gap-1 rounded border border-[#4a4218] bg-[#2b271b] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#e8c76a]" title="The owner limited script editing for your role">
            <Lock size={10} /> Read-only
          </span>
        )}
        <div className="flex-1" />
        {savedFlash && <span className="flex items-center gap-1 text-[10.5px] text-[#8ce6a5]"><Check size={12} /> saved</span>}
        {dirty && <span className="text-[10.5px] text-[#e8c76a]">● unsaved</span>}
        {!readOnly && dirty && (
          <button
            type="button"
            onClick={save}
            className="studio-btn h-7 gap-1.5 px-3 text-[11px] font-semibold text-[#0e241a] bg-[#75dda4] hover:bg-[#8ce6a5]"
            title="Save (Ctrl+S)"
          >
            Save
          </button>
        )}
      </div>

      {/* body */}
      <div className="flex min-h-0 flex-1">
        {/* code area */}
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0 flex">
            {/* gutter */}
            <div
              ref={gutterRef}
              className="studio-scroll w-12 shrink-0 overflow-hidden border-r border-[#2a2d31] bg-[#17181b] pt-3 pb-3 text-right font-mono text-[12.5px] leading-[1.55] text-[#565b63] select-none"
            >
              {Array.from({ length: lines }, (_, i) => (
                <div key={i} className={check.ok !== true && check.line === i + 1 ? "pr-2 text-[#ff9b9b] font-bold" : "pr-2"}>
                  {i + 1}
                </div>
              ))}
            </div>
            {/* editor */}
            <div className="relative min-w-0 flex-1">
              <pre
                ref={preRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre p-3 font-mono text-[12.5px] leading-[1.55] text-[#c8ccd2]"
                style={{ tabSize: 2 }}
              >
                <Highlighted code={source} />
              </pre>
              <textarea
                ref={taRef}
                className="studio-scroll absolute inset-0 resize-none overflow-auto whitespace-pre bg-transparent p-3 font-mono text-[12.5px] leading-[1.55] text-transparent caret-[#8ce6a5] outline-none read-only:text-transparent"
                style={{ tabSize: 2 }}
                spellCheck={false}
                value={source}
                readOnly={readOnly}
                onChange={(e) => {
                  edit(e.target.value);
                  setCaret(e.target.selectionStart);
                  setAcDismissed(false);
                }}
                onScroll={syncScroll}
                onKeyDown={onKeyDown}
                onClick={(e) => {
                  setCaret(e.currentTarget.selectionStart);
                  setAcDismissed(false);
                }}
                onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
              />
              {/* autocomplete popup */}
              {acItems.length > 0 && !acDismissed && !readOnly && (
                <div
                  className="absolute z-30 w-[380px] overflow-hidden rounded-lg border border-[#3a3d42] bg-[#1e2023] shadow-2xl"
                  style={{ top: Math.max(12, acLine * 19.4 + 12), left: 12 }}
                >
                  <div className="border-b border-[#2a2d31] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-[#7a7f88]">
                    Autocomplete · ↑↓ select · Tab insert
                  </div>
                  {acItems.map((d, i) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left ${i === acSelected ? "bg-[#233041]" : "hover:bg-[#22252a]"}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertDocText(d);
                      }}
                      onMouseEnter={() => setAcSelected(i)}
                    >
                      <span className={`shrink-0 rounded border px-1 text-[8.5px] font-bold uppercase ${CONTEXT_STYLE[d.context]}`}>
                        {CONTEXT_LABEL[d.context]}
                      </span>
                      <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#8ec5ff]">{d.name}</code>
                      <span className="max-w-[150px] truncate text-[9.5px] text-[#9aa0a8]">{d.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* docs browser */}
        {showApi && (
          <aside className="flex w-[340px] shrink-0 flex-col border-l border-[#34373c] bg-[#17181b]">
            {/* search */}
            <div className="shrink-0 border-b border-[#2a2d31] p-2.5">
              <div className="flex items-center gap-1.5 rounded-md border border-[#3a3d42] bg-[#1b1d20] px-2">
                <Search size={12} className="shrink-0 text-[#7a7f88]" />
                <input
                  className="h-7 min-w-0 flex-1 bg-transparent text-[11px] text-[#c8ccd2] outline-none placeholder:text-[#565b63]"
                  placeholder={`Search ${DOC_COUNT} commands…`}
                  value={docsQuery}
                  onChange={(e) => setDocsQuery(e.target.value)}
                />
                {docsQuery && (
                  <button type="button" className="text-[#7a7f88] hover:text-white" onClick={() => setDocsQuery("")}>
                    <X size={11} />
                  </button>
                )}
              </div>
              <div className="studio-scroll mt-2 flex gap-1 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setDocsCat(null)}
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${docsCat === null ? "bg-[#75dda4] text-[#0e241a]" : "bg-[#22252a] text-[#9aa0a8] hover:bg-[#2a2d31]"}`}
                >
                  All
                </button>
                {DOC_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDocsCat(docsCat === c ? null : c)}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${docsCat === c ? "bg-[#75dda4] text-[#0e241a]" : "bg-[#22252a] text-[#9aa0a8] hover:bg-[#2a2d31]"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* script type guide (collapsible, pinned) */}
            <div className="shrink-0 border-b border-[#2a2d31]">
              <button
                type="button"
                onClick={() => setGuideOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-[#e8c76a] hover:bg-[#1e2023]"
              >
                <TriangleAlert size={11} /> Script vs LocalScript vs Module — {guideOpen ? "hide" : "show"}
              </button>
              {guideOpen && (
                <div className="space-y-2 px-2.5 pb-2.5">
                  {SCRIPT_TYPE_GUIDE.map((g) => (
                    <div key={g.kind} className="rounded-md border border-[#2a2d31] bg-[#1b1d20] p-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
                        <span className="text-[10.5px] font-bold" style={{ color: g.color }}>{g.kind}</span>
                      </div>
                      <div className="mt-1 grid grid-cols-[52px_1fr] gap-x-2 gap-y-0.5 text-[9px] leading-snug text-[#9aa0a8]">
                        <span className="text-[#7a7f88]">Lives in</span><span>{g.where}</span>
                        <span className="text-[#7a7f88]">Runs</span><span>{g.runs}</span>
                        <span className="text-[#7a7f88]">Sees</span><span>{g.sees}</span>
                        <span className="text-[#7a7f88]">Use for</span><span>{g.useFor}</span>
                      </div>
                      <pre className="studio-scroll mt-1.5 max-h-[110px] overflow-auto rounded bg-[#14161a] p-1.5 font-mono text-[8.5px] leading-[1.4] text-[#a9d5b5]">{g.example}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* results */}
            <div className="studio-scroll min-h-0 flex-1 overflow-y-auto p-2.5">
              <div className="mb-2 text-[9.5px] text-[#7a7f88]">
                {searchDocs(docsQuery, docsCat).length} command{searchDocs(docsQuery, docsCat).length === 1 ? "" : "s"}
                {docsCat ? ` in ${docsCat}` : ""} · every entry has a copy-paste example
              </div>
              {docs.map((d) => {
                const conflict = contextConflict(d, script.kind);
                return (
                  <div key={d.id} className="mb-1.5 rounded-md border border-[#2a2d31] bg-[#1b1d20] p-2">
                    <div className="flex items-center gap-1.5">
                      <code className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-[#8ec5ff]">{d.sig}</code>
                      {conflict && (
                        <span title={conflict} className="shrink-0 text-[#ff9b9b]">
                          <TriangleAlert size={10} />
                        </span>
                      )}
                      <span className={`shrink-0 rounded border px-1 text-[8px] font-bold uppercase ${CONTEXT_STYLE[d.context]}`}>
                        {CONTEXT_LABEL[d.context]}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[9.5px] leading-snug text-[#9aa0a8]">{d.desc}</div>
                    <pre className="studio-scroll mt-1 max-h-[130px] overflow-auto whitespace-pre rounded bg-[#14161a] p-1.5 font-mono text-[9px] leading-[1.45] text-[#a9d5b5]">{d.example}</pre>
                    <div className="mt-1 flex gap-1.5">
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded bg-[#22252a] px-1.5 py-0.5 text-[9px] font-semibold text-[#9aa0a8] hover:bg-[#2a2d31] hover:text-[#c8ccd2]"
                        onClick={() => insertText(d.example)}
                      >
                        <Package size={9} /> Insert
                      </button>
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded bg-[#22252a] px-1.5 py-0.5 text-[9px] font-semibold text-[#9aa0a8] hover:bg-[#2a2d31] hover:text-[#c8ccd2]"
                        onClick={() => copyExample(d)}
                      >
                        {copiedId === d.id ? <Check size={9} className="text-[#8ce6a5]" /> : <Copy size={9} />} {copiedId === d.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {docs.length === 0 && (
                <div className="rounded-md border border-[#2a2d31] bg-[#1b1d20] p-3 text-center text-[10.5px] text-[#7a7f88]">
                  No commands match “{docsQuery}”.
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* status bar */}
      <div className="flex shrink-0 items-center gap-3 border-t border-[#34373c] bg-[#17181b] px-4 py-1.5 text-[10.5px]">
        {check.ok ? (
          <span className="flex items-center gap-1 text-[#8ce6a5]"><Check size={11} /> syntax OK</span>
        ) : (
          <span className="text-[#ff9b9b]">✕ {check.error} (line {check.line})</span>
        )}
        <div className="flex-1" />
        <span className="text-[#7a7f88]">{lines} lines · {source.length} chars</span>
        <span className="flex items-center gap-1 text-[#7a7f88]">
          {script.kind === "Script" ? <ScrollText size={11} /> : script.kind === "LocalScript" ? <Monitor size={11} /> : <Package size={11} />}
          {script.enabled ? "enabled" : "disabled"}
        </span>
      </div>
    </div>
  );
}
