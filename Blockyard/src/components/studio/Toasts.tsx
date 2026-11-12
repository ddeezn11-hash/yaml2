"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonX } from "lucide-react";
import { useStudio } from "@/lib/studio/store";
import type { LogLevel } from "@/lib/studio/types";

interface ToastItem {
  id: number;
  level: LogLevel;
  text: string;
}

const TOAST_STYLE: Record<LogLevel, { border: string; icon: typeof Info; color: string }> = {
  info: { border: "#3d6a9e", icon: Info, color: "#8fc3ee" },
  success: { border: "#3d9e6a", icon: CheckCircle2, color: "#8ce6a5" },
  warn: { border: "#9e7c3d", icon: AlertTriangle, color: "#e8c76a" },
  error: { border: "#9e3d3d", icon: OctagonX, color: "#ff9b9b" },
};

/**
 * Studio-style toast notifications. Every warn/error the engine logs
 * (e.g. "Clipboard is empty — copy a part first") pops up here so no
 * button ever fails silently.
 */
export function Toasts() {
  const logs = useStudio((s) => s.logs);
  const logSeq = useStudio((s) => s.logSeq);
  const lastSeen = useRef(logSeq);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (logSeq === lastSeen.current) return;
    const newLogs = logs.filter((l) => l.id > lastSeen.current && (l.level === "warn" || l.level === "error" || l.level === "success"));
    lastSeen.current = logSeq;
    if (!newLogs.length) return;
    setToasts((prev) => [...prev.slice(-3), ...newLogs.map((l) => ({ id: l.id, level: l.level, text: l.text }))]);
  }, [logSeq, logs]);

  // dismiss the oldest toast a moment after the stack changes
  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((prev) => prev.slice(1)), 3400);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-[64px] left-1/2 z-[900] flex -translate-x-1/2 flex-col items-center gap-1.5">
      {toasts.map((t) => {
        const st = TOAST_STYLE[t.level];
        const Icon = st.icon;
        return (
          <div
            key={t.id}
            className="studio-toast flex max-w-[520px] items-center gap-2 rounded-md border border-[#3a3d42] bg-[#1e2023]/95 px-3 py-2 text-[11.5px] text-[#d7dade] shadow-2xl"
            style={{ borderLeft: `3px solid ${st.border}` }}
          >
            <Icon size={14} style={{ color: st.color }} className="shrink-0" />
            <span className="leading-snug">{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}
