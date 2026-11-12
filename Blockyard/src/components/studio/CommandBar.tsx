"use client";

import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useStudio } from "@/lib/studio/store";
import { useStudioCtx } from "./context";
import type { PartShape, ScriptKind } from "@/lib/studio/types";

/* ------------------------------------------------------------------ */
/* Studio command bar — quick live-edit commands (Roblox Studio has   */
/* one right above the Output). Type `help` for the list.             */
/* ------------------------------------------------------------------ */

const HELP: [string, string][] = [
  ["part [block|ball|wedge|cylinder]", "insert a part"],
  ["script [script|local|module]", "insert a code file"],
  ["dummy", "spawn an R6 dummy rig"],
  ["spawn", "insert a SpawnLocation"],
  ["model", "insert an empty model"],
  ["play / stop", "start or stop a play test"],
  ["name <text>", "rename the place"],
  ["time <0-24>", "set the time of day"],
  ["brightness <n>", "sun intensity"],
  ["fog <studs>", "fog distance"],
  ["grid", "toggle the grid"],
  ["publish", "open the publish dialog"],
  ["toolbox", "open the toolbox"],
  ["help", "this list"],
];

const SHAPES: PartShape[] = ["Block", "Sphere", "Wedge", "Cylinder", "CornerWedge"];

export function CommandBar() {
  const { engine, startPlay, stopPlay } = useStudioCtx();
  const playing = useStudio((s) => s.playing);
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [gridOn, setGridOn] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const log = (level: "info" | "warn" | "error" | "success", text: string) => engine?.log(level, text);

  const run = (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    setHistory((h) => [...h.slice(-30), line]);
    setHistIdx(-1);
    const [cmdRaw, ...args] = line.split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const arg = args.join(" ");
    const num = Number(args[0]);

    switch (cmd) {
      case "part": {
        const shape = SHAPES.find((s) => s.toLowerCase() === (args[0] ?? "").toLowerCase()) ?? (args[0] ? null : "Block");
        if (args[0] && !shape) {
          log("warn", `Unknown shape "${args[0]}" — try block, ball, wedge, cylinder`);
          break;
        }
        try {
          engine?.addPart(shape ?? "Block");
        } catch { /* read-only gate */ }
        break;
      }
      case "script": {
        const kinds: ScriptKind[] = ["Script", "LocalScript", "ModuleScript"];
        const kind = kinds.find((k) => k.toLowerCase().startsWith((args[0] ?? "script").toLowerCase())) ?? null;
        if (args[0] && !kind) {
          log("warn", `Unknown script type "${args[0]}" — try script, local or module`);
          break;
        }
        try {
          engine?.addScript(kind ?? "Script");
          useStudio.getState().bumpParts();
        } catch { /* read-only gate */ }
        break;
      }
      case "dummy":
      case "rig":
        engine?.addRig("R6");
        break;
      case "spawn":
        engine?.addSpawnLocation();
        break;
      case "model":
      case "folder":
        engine?.addModel(cmd === "folder" ? "Folder" : "Model");
        break;
      case "play":
        if (!playing) startPlay();
        break;
      case "stop":
        if (playing) stopPlay();
        break;
      case "name":
        if (!arg) log("warn", "Usage: name My Cool Place");
        else {
          engine?.renamePlace(arg);
          useStudio.getState().setPlaceName(arg);
        }
        break;
      case "time":
        if (!isFinite(num)) log("warn", "Usage: time 22 (0-24)");
        else engine?.setLighting({ clockTime: Math.max(0, Math.min(24, num)) }, "Command bar");
        break;
      case "brightness":
        if (!isFinite(num)) log("warn", "Usage: brightness 2");
        else engine?.setLighting({ brightness: Math.max(0, Math.min(5, num)) }, "Command bar");
        break;
      case "fog":
        if (!isFinite(num)) log("warn", "Usage: fog 500");
        else engine?.setLighting({ fogEnd: Math.max(60, Math.min(5000, num)) }, "Command bar");
        break;
      case "grid": {
        const next = !gridOn;
        setGridOn(next);
        engine?.setGridVisible(next);
        break;
      }
      case "publish":
        useStudio.getState().setPublishOpen(true);
        break;
      case "toolbox":
        useStudio.getState().setToolboxOpen(true);
        break;
      case "help":
        log("info", "Command bar — available commands:");
        for (const [c, d] of HELP) log("info", `  ${c.padEnd(34)} ${d}`);
        break;
      default:
        log("error", `Unknown command "${cmd}" — type help for the list`);
    }
  };

  return (
    <div className="flex h-[30px] shrink-0 items-center gap-1.5 border-t border-[#34373c] bg-[#17181b] px-2">
      <ChevronRight size={12} className="shrink-0 text-[#8ce6a5]" />
      <input
        ref={inputRef}
        className="h-[22px] min-w-0 flex-1 bg-transparent font-mono text-[11px] text-[#c8ccd2] outline-none placeholder:text-[#565b63]"
        placeholder="Command bar — try: part · dummy · time 22 · play · publish · help"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            run(value);
            setValue("");
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (!history.length) return;
            const next = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
            setHistIdx(next);
            setValue(history[next]);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (histIdx < 0) return;
            const next = histIdx + 1;
            if (next >= history.length) {
              setHistIdx(-1);
              setValue("");
            } else {
              setHistIdx(next);
              setValue(history[next]);
            }
          }
        }}
      />
      <span className="shrink-0 text-[9px] text-[#565b63]">↑ history · Enter runs · help lists commands</span>
    </div>
  );
}
