"use client";

import { Cpu, MousePointerClick } from "lucide-react";
import { useStudio } from "@/lib/studio/store";
import { useStudioCtx } from "./context";

export function StatusBar() {
  const { engine } = useStudioCtx();
  const fps = useStudio((s) => s.fps);
  const camPos = useStudio((s) => s.camPos);
  const partsVersion = useStudio((s) => s.partsVersion);
  const selectionVersion = useStudio((s) => s.selectionVersion);
  const netOnline = useStudio((s) => s.netOnline);
  const playing = useStudio((s) => s.playing);
  void partsVersion;
  void selectionVersion;

  const count = engine?.getPartCount() ?? 0;
  const selCount = engine?.selection.length ?? 0;

  return (
    <footer className="flex h-[24px] shrink-0 items-center gap-4 border-t border-[#34373c] bg-[#17181b] px-3 text-[10.5px] text-[#9aa0a8]">
      <span className="flex items-center gap-1.5">
        <MousePointerClick size={11} />
        {selCount ? `${selCount} selected` : playing ? "Play test running" : "Click a part to select · WASD + RMB-drag to fly"}
      </span>
      <span>{count} parts</span>
      <div className="flex-1" />
      {netOnline && <span className="text-[#8ce6a5]">● Team Create online</span>}
      <span className="font-mono">
        cam {camPos.map((v) => Math.round(v)).join(", ")}
      </span>
      <span className="flex items-center gap-1">
        <Cpu size={11} /> {fps} fps
      </span>
    </footer>
  );
}
