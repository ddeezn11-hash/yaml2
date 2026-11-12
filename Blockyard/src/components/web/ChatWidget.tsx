"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, Smile, X } from "lucide-react";
import { SEED_FRIENDS, friendAppearance } from "@/lib/studio/webdata";
import { useWeb } from "@/lib/studio/webstore";
import { usePlatform, type ChatMessage as ConvMessage } from "@/lib/studio/platform";

/* ------------------------------------------------------------------ */
/* Roblox-style floating chat: friend list + conversations with       */
/* bot replies, unread badges and moderation-logged messages.         */
/* ------------------------------------------------------------------ */

function timeShort(at: number): string {
  const d = new Date(at);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ChatWidget() {
  const session = useWeb((s) => s.session);
  const extraFriends = useWeb((s) => s.extraFriends);
  const version = usePlatform((s) => s.version);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const username = session?.username ?? "";

  const friends = useMemo(
    () => [...SEED_FRIENDS, ...extraFriends.map(friendAppearance)],
    [extraFriends],
  );

  const convos = useMemo(() => usePlatform.getState().getConvos(username), [username, version]);
  const unread = useMemo(() => (username ? usePlatform.getState().unreadCount(username) : 0), [username, version]);

  const activeConvo: ConvMessage[] = active ? convos[active] ?? [] : [];

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [activeConvo.length, active]);

  useEffect(() => {
    if (open && active) inputRef.current?.focus();
  }, [open, active]);

  const send = () => {
    const text = draft.trim().slice(0, 300);
    if (!text || !active) return;
    usePlatform.getState().sendFriendMessage(username, active, text);
    setDraft("");
  };

  if (!session) return null;

  return (
    <>
      {/* bubble */}
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) usePlatform.getState().markConvosRead(username);
        }}
        className="fixed bottom-5 right-5 z-[400] grid h-[54px] w-[54px] place-items-center rounded-full bg-[#00b06f] text-white shadow-xl transition-transform hover:scale-105 active:scale-95"
        title="Chat with friends"
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
        {!open && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[20px] min-w-[20px] place-items-center rounded-full border-2 border-white bg-[#ff5d5d] px-1 text-[10.5px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {/* window */}
      {open && (
        <div className="fixed bottom-[86px] right-5 z-[400] flex h-[440px] w-[340px] flex-col overflow-hidden rounded-2xl border border-[#e3e6e8] bg-white shadow-2xl">
          {/* header */}
          <div className="flex shrink-0 items-center gap-2 border-b border-[#e3e6e8] bg-[#111418] px-4 py-3">
            {active ? (
              <>
                <button
                  type="button"
                  className="text-[16px] leading-none text-[#9aa0a6] hover:text-white"
                  onClick={() => setActive(null)}
                  title="Back to friends"
                >
                  ←
                </button>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br ${friendAppearance(active).color} text-[11px] font-extrabold text-white`}>
                  {active.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-white">{active}</div>
                  <div className="text-[10px] text-[#9aa0a6]">
                    {friendAppearance(active).status === "playing" ? "in a game" : friendAppearance(active).status}
                  </div>
                </div>
              </>
            ) : (
              <>
                <MessageCircle size={15} className="text-[#75dda4]" />
                <span className="text-[13px] font-bold text-white">Chat</span>
                <span className="text-[10.5px] text-[#9aa0a6]">{friends.length} friends</span>
              </>
            )}
          </div>

          {/* body */}
          {!active ? (
            <div className="studio-scroll flex-1 overflow-y-auto p-2">
              {friends.map((f) => {
                const convo = convos[f.name] ?? [];
                const last = convo[convo.length - 1];
                const hasUnread = last?.from === "them";
                return (
                  <button
                    key={f.name}
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-[#f5f7f8]"
                    onClick={() => setActive(f.name)}
                  >
                    <span className="relative shrink-0">
                      <span className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br ${f.color} text-[12px] font-extrabold text-white`}>
                        {f.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className={`absolute -bottom-0.5 -right-0.5 h-[12px] w-[12px] rounded-full border-2 border-white ${f.status === "offline" ? "bg-[#b2bec3]" : "bg-[#2ecc71]"}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[12.5px] ${hasUnread ? "font-extrabold text-[#111418]" : "font-semibold text-[#111418]"}`}>
                        {f.name}
                      </span>
                      <span className="block truncate text-[11px] text-[#9aa0a6]">
                        {last ? `${last.from === "me" ? "You: " : ""}${last.text}` : "Say hi!"}
                      </span>
                    </span>
                    {hasUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-[#00b06f]" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div ref={listRef} className="studio-scroll flex-1 space-y-1.5 overflow-y-auto bg-[#f8f9fa] p-3">
                {activeConvo.length === 0 && (
                  <div className="mt-6 text-center text-[11.5px] text-[#9aa0a6]">
                    <Smile size={20} className="mx-auto mb-1 opacity-50" />
                    Start the conversation with {active}
                  </div>
                )}
                {activeConvo.map((m) => (
                  <div key={m.id} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-[12px] leading-snug ${
                        m.from === "me" ? "rounded-br-sm bg-[#00b06f] text-white" : "rounded-bl-sm bg-white text-[#111418] shadow-sm"
                      }`}
                    >
                      {m.text}
                      <div className={`mt-0.5 text-[8.5px] ${m.from === "me" ? "text-white/70" : "text-[#b0b6bd]"}`}>{timeShort(m.at)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 border-t border-[#e3e6e8] p-2.5">
                <input
                  ref={inputRef}
                  className="h-9 min-w-0 flex-1 rounded-full border border-[#d6d9db] bg-[#f5f7f8] px-3.5 text-[12.5px] text-[#111418] outline-none placeholder:text-[#b9bfc4] focus:border-[#00b06f] focus:bg-white"
                  placeholder={`Message ${active}…`}
                  value={draft}
                  maxLength={300}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send();
                    if (e.key === "Escape") setActive(null);
                  }}
                />
                <button
                  type="button"
                  onClick={send}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#00b06f] text-white hover:bg-[#009a61]"
                  title="Send"
                >
                  <Send size={15} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
