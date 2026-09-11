"use client";

// 现代 AI 聊天窗口（布局参考 vercel/ai-chatbot、lobe-chat 的通行结构）：
// - 对手侧：头像 + 名字/时间小字 + 全宽正文（无气泡，ChatGPT 式排版）
// - 我方：右侧蓝色气泡
// - 底部 sticky composer：圆角输入框 + 圆形发送键 + 快捷追问 chips
// - 打字指示器：头像 + 三点跳动
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/game/types";

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ChatWindow({
  messages,
  meId,
  meName,
  oppName,
  busy,
  disabled,
  placeholder,
  quickChips,
  onSend,
  heightClass = "h-[56vh]",
}: {
  messages: ChatMessage[];
  meId: string;
  meName: string;
  oppName: string;
  busy: boolean;
  disabled?: boolean;
  placeholder: string;
  quickChips?: string[];
  onSend: (text: string) => void;
  heightClass?: string;
}) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  function send() {
    const text = input.trim();
    if (!text || busy || disabled) return;
    setInput("");
    onSend(text);
  }

  return (
    <section className={`card mt-3 flex ${heightClass} flex-col overflow-hidden`}>
      {/* 消息区 */}
      <div className="flex-1 space-y-6 overflow-auto px-5 py-5">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="avatar h-12 w-12 text-lg" style={{ background: "linear-gradient(135deg,#9a6ae8,#c95aa0)" }}>
              {oppName.slice(0, 1)}
            </span>
            <p className="text-sm text-[color:var(--muted)]">和「{oppName}」的第一句话，由你发起。</p>
            <p className="text-xs text-[color:var(--muted)]">提示：破绽藏在标点、句式和回复速度里。</p>
          </div>
        )}

        {messages.map((m) =>
          m.from === meId ? (
            // 我方：右侧气泡
            <div key={m.id} className="fade-up flex justify-end">
              <div className="flex max-w-[76%] flex-col items-end gap-1">
                <span className="text-[11px] text-[color:var(--muted)]">
                  {meName} · {fmtTime(m.ts)}
                </span>
                <div className="bubble-mine px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap">{m.text}</div>
              </div>
            </div>
          ) : (
            // 对手：头像 + 名字/时间 + 全宽正文（无气泡）
            <div key={m.id} className="fade-up flex gap-3">
              <span className="avatar h-9 w-9 text-sm" style={{ background: "linear-gradient(135deg,#9a6ae8,#c95aa0)" }}>
                {oppName.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[color:var(--muted)]">
                  <b className="text-[color:var(--ink-2)]">{oppName}</b> · {fmtTime(m.ts)}
                  <span className="ml-2 tnum opacity-70">{(m.responseMs / 1000).toFixed(1)}s 后回复</span>
                </p>
                <p className="mt-1 text-[15px] leading-7 whitespace-pre-wrap text-[color:var(--ink)]">{m.text}</p>
              </div>
            </div>
          ),
        )}

        {busy && (
          <div className="flex gap-3">
            <span className="avatar h-9 w-9 text-sm" style={{ background: "linear-gradient(135deg,#9a6ae8,#c95aa0)" }}>
              {oppName.slice(0, 1)}
            </span>
            <div className="flex items-center gap-1.5 pt-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="typing-dot h-2 w-2 rounded-full bg-[color:var(--muted)]"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-[color:var(--line)] bg-white px-4 pb-3 pt-3">
        {quickChips && !disabled && messages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {quickChips.map((chip) => (
              <button
                key={chip}
                onClick={() => setInput(chip)}
                className="rounded-full border border-[color:var(--line)] bg-[color:var(--bg)] px-3 py-1 text-xs text-[color:var(--ink-2)] transition hover:border-[color:var(--zhihu)] hover:text-[color:var(--zhihu)]"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            disabled={disabled}
            placeholder={placeholder}
            className="h-11 min-w-0 flex-1 rounded-full border border-[color:var(--line)] bg-[color:var(--bg)] px-4 text-[15px] outline-none placeholder:text-[color:var(--muted)] focus:border-[color:var(--zhihu)] focus:bg-white disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || disabled || !input.trim()}
            aria-label="发送"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color:var(--zhihu)] text-white transition hover:bg-[color:var(--zhihu-deep)] disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2z" fill="currentColor" />
            </svg>
          </button>
        </form>
      </div>
    </section>
  );
}
