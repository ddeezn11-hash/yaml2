"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  ImagePlus,
  MessageSquare,
  Paperclip,
  ScrollText,
  Send,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import type { ScriptData, TeamChatMessage, TeamFileRef } from "@/lib/studio/types";
import { pickImage } from "@/lib/studio/imgupload";
import { useStudio } from "@/lib/studio/store";
import { useStudioCtx } from "./context";
import { SCRIPT_ICONS } from "./Explorer";

/** Deterministic bubble color for a builder name. */
const BUBBLE_COLORS = [
  "from-[#d85a48] to-[#a83e30]",
  "from-[#2b9b45] to-[#1d7031]",
  "from-[#8e42c8] to-[#642e91]",
  "from-[#c2792b] to-[#8f571d]",
  "from-[#2b8f9c] to-[#1d6670]",
  "from-[#c42b71] to-[#8c1e50]",
];
function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BUBBLE_COLORS[h % BUBBLE_COLORS.length];
}

function timeLabel(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** [[ScriptName]] inline reference in typed text. */
function matchScriptRef(token: string, scripts: ScriptData[]): ScriptData | null {
  const inner = token.replace(/^\[\[/, "").replace(/\]\]$/, "").trim().toLowerCase();
  if (!inner) return null;
  return scripts.find((s) => s.name.toLowerCase() === inner) ?? null;
}

/* ------------------------------ file ref chip ----------------------------- */

function FileRefChip({ fileRef }: { fileRef: TeamFileRef }) {
  const { engine } = useStudioCtx();
  const [peek, setPeek] = useState(false);
  const [missing, setMissing] = useState(false);
  const Icon = SCRIPT_ICONS[fileRef.kind] ?? ScrollText;

  const open = () => {
    if (!engine) return;
    const scripts = engine.getScripts();
    const found =
      scripts.find((s) => s.id === fileRef.id) ??
      scripts.find((s) => s.name.toLowerCase() === fileRef.name.toLowerCase());
    if (found) {
      useStudio.getState().openScriptTab(found.id);
      setMissing(false);
    } else {
      setMissing(true);
      engine.log("warn", `Script "${fileRef.name}" is not in this place — showing the preview instead`);
    }
  };

  return (
    <div className="w-full">
      <div
        className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
          missing ? "border-[#5a4a2c] bg-[#2b241b]" : "border-[#2c4a5a] bg-[#1b2b33] hover:bg-[#213844]"
        }`}
      >
        <Icon size={13} className="shrink-0 text-[#8ec5ff]" />
        <button type="button" onClick={open} className="min-w-0 flex-1 text-left" title="Open this file in the Script Editor">
          <span className="block truncate text-[11px] font-semibold text-[#8ec5ff]">{fileRef.name}</span>
          <span className="block text-[9px] text-[#7a8a99]">{fileRef.kind} · click to open in Script Editor</span>
        </button>
        {fileRef.preview && (
          <button
            type="button"
            onClick={() => setPeek((v) => !v)}
            className="studio-btn h-6 w-6 shrink-0"
            title={peek ? "Hide code preview" : "Peek at the code"}
          >
            {peek ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>
      {peek && fileRef.preview && (
        <pre className="studio-scroll mt-1 max-h-40 overflow-auto whitespace-pre rounded-md border border-[#34373c] bg-[#141517] px-2.5 py-2 font-mono text-[10px] leading-relaxed text-[#b7bcc4]">
          {fileRef.preview}
          {fileRef.preview.includes("\n") ? "\n…" : ""}
        </pre>
      )}
      {missing && (
        <div className="mt-1 text-[9.5px] text-[#e8c76a]">Not found in this place — ask your teammate to re-send it after you both load the same project.</div>
      )}
    </div>
  );
}

/* --------------------------------- message -------------------------------- */

function ChatMessage({ msg }: { msg: TeamChatMessage }) {
  const [zoom, setZoom] = useState(false);
  if (msg.system) {
    return <div className="px-2 py-1 text-center text-[10px] text-[#7a7f88]">{msg.text}</div>;
  }
  return (
    <div className={`flex gap-2 ${msg.mine ? "flex-row-reverse" : ""}`}>
      <span
        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br ${colorFor(msg.name)} text-[10px] font-extrabold text-white`}
        title={msg.name}
      >
        {msg.name.slice(0, 2).toUpperCase()}
      </span>
      <div className={`min-w-0 max-w-[85%] ${msg.mine ? "items-end text-right" : ""} flex flex-col gap-1`}>
        <div className="flex items-baseline gap-1.5 text-[9.5px] text-[#7a7f88]">
          <span className="font-semibold text-[#b7bcc4]">{msg.name}</span>
          <span>{timeLabel(msg.at)}</span>
        </div>
        {msg.text && (
          <div
            className={`inline-block rounded-lg px-2.5 py-1.5 text-left text-[11.5px] leading-relaxed ${
              msg.mine ? "bg-[#23412e] text-[#d5f0dd]" : "bg-[#26292d] text-[#d4d8dd]"
            }`}
          >
            {msg.text}
          </div>
        )}
        {msg.image && (
          <button type="button" className="block overflow-hidden rounded-lg border border-[#34373c]" onClick={() => setZoom(true)} title="Click to enlarge">
            <img src={msg.image} alt="shared by teammate" className="max-h-36 max-w-full object-contain" />
          </button>
        )}
        {msg.fileRef && <FileRefChip fileRef={msg.fileRef} />}
      </div>
      {zoom &&
        createPortal(
          <div className="fixed inset-0 z-[1200] grid place-items-center bg-black/75 p-6" onClick={() => setZoom(false)}>
            <img src={msg.image} alt="shared by teammate, enlarged" className="max-h-full max-w-full rounded-lg shadow-2xl" />
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ------------------------------ script picker ----------------------------- */

function ScriptPicker({ onPick, onClose }: { onPick: (s: ScriptData) => void; onClose: () => void }) {
  const { engine } = useStudioCtx();
  const partsVersion = useStudio((s) => s.partsVersion);
  const scripts = useMemo(() => {
    void partsVersion;
    return engine?.getScripts() ?? [];
  }, [engine, partsVersion]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", close);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="absolute bottom-11 left-2 z-30 w-[230px] overflow-hidden rounded-md border border-[#3a3d42] bg-[#1e2023] shadow-2xl">
      <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-[#7a7f88]">Reference a file in this project</div>
      <div className="studio-scroll max-h-56 overflow-y-auto pb-1">
        {scripts.length === 0 && <div className="px-3 py-2 text-[10.5px] text-[#9aa0a8]">No scripts in this place yet.</div>}
        {scripts.map((s) => {
          const Icon = SCRIPT_ICONS[s.kind] ?? ScrollText;
          return (
            <button
              key={s.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[#c8ccd2] hover:bg-[#2e3136]"
              onClick={() => {
                onPick(s);
                onClose();
              }}
            >
              <Icon size={13} className="shrink-0 text-[#8ec5ff]" />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="shrink-0 text-[8.5px] text-[#7a7f88]">{s.kind}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- the panel ------------------------------- */

export function TeamChat() {
  const open = useStudio((s) => s.teamChatOpen);
  if (!open) return null;
  return <TeamChatBody />;
}

function TeamChatBody() {
  const { engine, net } = useStudioCtx();
  const setTeamChatOpen = useStudio((s) => s.setTeamChatOpen);
  const messages = useStudio((s) => s.teamMessages);
  const pushTeamMsg = useStudio((s) => s.pushTeamMsg);
  const netOnline = useStudio((s) => s.netOnline);
  const netStatusText = useStudio((s) => s.netStatusText);
  const netPlayerCount = useStudio((s) => s.netPlayerCount);
  const playerName = useStudio((s) => s.playerName);
  const partsVersion = useStudio((s) => s.partsVersion);

  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const scripts = useMemo(() => {
    void partsVersion;
    return engine?.getScripts() ?? [];
  }, [engine, partsVersion]);

  /* keep the list pinned to the bottom */
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = (payload: { text?: string; image?: string; fileRef?: TeamFileRef }) => {
    if (!net?.connected) return;
    const outText = (payload.text ?? "").slice(0, 500);
    if (!outText.trim() && !payload.image && !payload.fileRef) return;
    const ok = net.send({ type: "teamchat", text: outText, image: payload.image, fileRef: payload.fileRef });
    if (!ok) return;
    pushTeamMsg({ name: playerName || "Builder", text: outText, image: payload.image, fileRef: payload.fileRef, at: Date.now(), mine: true });
  };

  const submit = () => {
    const raw = text.trim();
    if (!raw || !net?.connected) return;
    // [[ScriptName]] → attach a file reference automatically
    const refs = [...raw.matchAll(/\[\[([^\]]{1,60})\]\]/g)];
    let fileRef: TeamFileRef | undefined;
    let clean = raw;
    if (refs.length) {
      for (const r of refs) {
        const s = scripts.find((x) => x.name.toLowerCase() === r[1].trim().toLowerCase());
        if (s && !fileRef) {
          fileRef = {
            id: s.id,
            name: s.name,
            kind: s.kind,
            preview: s.source.split("\n").slice(0, 14).join("\n"),
          };
        }
      }
      clean = raw.replace(/\[\[([^\]]{1,60})\]\]/g, (m) => (matchScriptRef(m, scripts) ? "" : m)).replace(/\s{2,}/g, " ").trim();
    }
    send({ text: clean || "check this file:", fileRef });
    setText("");
    taRef.current?.focus();
  };

  const attachImage = async () => {
    if (!net?.connected || sending) return;
    const img = await pickImage(640);
    if (!img) return;
    setSending(true);
    send({ text: text.trim() || "look at this:", image: img.dataUrl });
    setText("");
    setSending(false);
  };

  const attachScript = (s: ScriptData) => {
    send({
      text: text.trim() || `check ${s.name}:`,
      fileRef: { id: s.id, name: s.name, kind: s.kind, preview: s.source.split("\n").slice(0, 14).join("\n") },
    });
    setText("");
  };

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r border-[#34373c] bg-[#1b1d20]">
      {/* header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[#34373c] px-3 py-2">
        <MessageSquare size={14} className="text-[#75dda4]" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold">Team Chat</div>
          <div className="truncate text-[9.5px] text-[#7a7f88]">
            {netOnline ? (
              <span className="flex items-center gap-1">
                <Users size={9} /> {netPlayerCount} builder{netPlayerCount === 1 ? "" : "s"} · {netStatusText}
              </span>
            ) : (
              "offline"
            )}
          </div>
        </div>
        <button type="button" className="studio-btn h-6 w-6" onClick={() => setTeamChatOpen(false)} title="Close chat">
          <X size={13} />
        </button>
      </div>

      {/* messages */}
      <div ref={listRef} className="studio-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
        {messages.length === 0 && (
          <div className="mt-6 px-3 text-center text-[10.5px] leading-relaxed text-[#7a7f88]">
            <MessageSquare size={22} className="mx-auto mb-2 text-[#3a3d42]" />
            {netOnline
              ? "Say hi to your team. Attach images or reference a script with the paperclip buttons — [[ScriptName]] in text works too."
              : "Connect Team Create (top bar) to chat live with everyone editing this project."}
          </div>
        )}
        {messages.map((m) => (
          <ChatMessage key={m.id} msg={m} />
        ))}
      </div>

      {/* composer */}
      <div className="relative shrink-0 border-t border-[#34373c] p-2">
        {pickerOpen && <ScriptPicker onPick={attachScript} onClose={() => setPickerOpen(false)} />}
        <textarea
          ref={taRef}
          rows={2}
          maxLength={500}
          value={text}
          disabled={!netOnline}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={netOnline ? "Message your team… [[ScriptName]] links a file" : "Team Create is offline"}
          className="studio-input h-[52px] w-full resize-none text-[11.5px] placeholder:text-[#5c6166] disabled:opacity-50"
        />
        <div className="mt-1.5 flex items-center gap-1">
          <button type="button" className="studio-btn h-7 w-7" onClick={attachImage} disabled={!netOnline || sending} title="Attach an image (downscaled for chat)">
            <ImagePlus size={13} />
          </button>
          <button type="button" className="studio-btn h-7 w-7" onClick={() => setPickerOpen((v) => !v)} disabled={!netOnline} title="Reference a script from this project">
            <Paperclip size={13} />
          </button>
          <div className="flex-1" />
          {sending ? (
            <span className="text-[9.5px] text-[#7a7f88]">sending…</span>
          ) : !netOnline ? (
            <span className="flex items-center gap-1 text-[9.5px] text-[#7a7f88]">
              <WifiOff size={10} /> offline
            </span>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim()}
              className="studio-btn h-7 gap-1 px-2.5 text-[10.5px] font-semibold text-[#0e241a] bg-[#75dda4] hover:bg-[#8ce6a5] disabled:opacity-40"
              title="Send (Enter)"
            >
              <Send size={11} /> Send
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[8.5px] text-[#5c6166]">
          <CornerDownLeft size={9} /> Enter to send · Shift+Enter for a new line
        </div>
      </div>
    </aside>
  );
}
