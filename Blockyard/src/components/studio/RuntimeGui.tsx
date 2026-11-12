"use client";

import type { UIObjectData } from "@/lib/studio/types";

/** Renders StarterGui elements above the game viewport for local and published play. */
export function RuntimeGui({ objects }: { objects: UIObjectData[] }) {
  const visible = objects.filter((item) => item.visible).sort((a, b) => a.zIndex - b.zIndex);
  if (!visible.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[8] overflow-hidden">
      {visible.map((item) => {
        const style: React.CSSProperties = {
          position: "absolute", left: `${item.x}%`, top: `${item.y}%`, width: `${item.width}%`, height: `${item.height}%`,
          background: item.className === "TextLabel" ? "transparent" : item.backgroundColor,
          color: item.textColor, fontSize: `clamp(9px, ${item.fontSize / 8}vw, ${item.fontSize}px)`,
          zIndex: item.zIndex, display: "grid", placeItems: "center", textAlign: "center", padding: 4,
          borderRadius: item.className === "TextButton" ? 7 : 2, overflow: "hidden",
          border: item.className === "Frame" ? "1px solid rgba(255,255,255,.12)" : "none",
          pointerEvents: item.className === "TextButton" || item.className === "TextBox" ? "auto" : "none",
        };
        if (item.className === "TextBox") return <input key={item.id} style={style} placeholder={item.text} aria-label={item.name} className="outline-none"/>;
        if (item.className === "TextButton") return <button key={item.id} style={style} type="button">{item.text}</button>;
        if (item.className.startsWith("Image")) return <div key={item.id} style={style} aria-label={item.name}>Image</div>;
        return <div key={item.id} style={style}>{item.text}</div>;
      })}
    </div>
  );
}
