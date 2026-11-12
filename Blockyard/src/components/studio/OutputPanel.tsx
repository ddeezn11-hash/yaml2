"use client";

import { useEffect, useRef } from "react";
import { Ban, Terminal } from "lucide-react";
import { useStudio } from "@/lib/studio/store";

export function OutputPanel() {
  const logs = useStudio((s) => s.logs);
  const clearLogs = useStudio((s) => s.clearLogs);
  const showOutput = useStudio((s) => s.showOutput);
  const setShowOutput = useStudio((s) => s.setShowOutput);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  if (!showOutput) return null;

  const colorFor = (level: string) =>
    level === "error" ? "text-[#ff8080]" : level === "warn" ? "text-[#ffcf6e]" : level === "success" ? "text-[#8ce6a5]" : "text-[#c2c7ce]";

  return (
    <div className="flex h-[136px] shrink-0 flex-col border-t border-[#34373c] bg-[#1b1d20]">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-[#2a2d31] bg-[#17181b] px-2">
        <Terminal size={12} className="text-[#9aa0a8]" />
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9aa0a8]">Output</span>
        <div className="flex-1" />
        <button type="button" className="studio-btn h-5 w-5" title="Clear output" onClick={clearLogs}>
          <Ban size={11} />
        </button>
        <button type="button" className="studio-btn h-5 w-5" title="Hide output" onClick={() => setShowOutput(false)}>
          <span className="px-0.5 text-[11px] leading-none">✕</span>
        </button>
      </div>
      <div ref={scrollRef} className="studio-scroll flex-1 overflow-y-auto px-2 py-1 font-mono text-[10.5px] leading-[1.55]">
        {logs.length === 0 && <div className="p-1 text-[#7a7f88]">Output is clear.</div>}
        {logs.map((l) => (
          <div key={l.id} className="flex gap-2">
            <span className="shrink-0 text-[#6a6f78]">{l.time}</span>
            <span className={colorFor(l.level)}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
