"use client";

import { useRef, useState } from "react";
import Kanshan from "./Kanshan";
import { KANSHAN_HANDLE, KANSHAN_TITLE } from "@/lib/kanshan";

interface Line {
  role: "user" | "assistant";
  content: string;
  source?: string; // 有 source 且为 mock 系 = 诚实演示回答
}

/**
 * 刘看山对话窗：让"管理员"真的能聊起来（LLM 优先，无凭证诚实降级）。
 * 与固定台词本不同——有凭证时逐句思考作答；任何时候都不泄露帖子作者身份。
 */
export default function KanshanChat({ className = "" }: { className?: string }) {
  const [lines, setLines] = useState<Line[]>([
    {
      role: "assistant",
      content: "你好，我是刘看山。规则和玩法都可以问我，谁是谁我不会说。",
    },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send() {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setLines((prev) => [...prev, { role: "user", content: q }]);
    setText("");
    try {
      const history = [...lines, { role: "user" as const, content: q }];
      const res = await fetch("/api/kanshan/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "刘看山走神了，再试一次");
      setLines((prev) => [...prev, { role: "assistant", content: d.reply, source: d.source }]);
    } catch (e) {
      setLines((prev) => [...prev, { role: "assistant", content: e instanceof Error ? e.message : "刘看山走神了，再试一次。" }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className={`card flex flex-col ${className}`}>
      <div className="flex items-center gap-2 px-4 pt-3">
        <Kanshan variant="wave" size={64} decorative className="!h-8 !w-8" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px]">
            <b className="font-medium text-[color:var(--ink-2)]">{KANSHAN_HANDLE}</b>
            <span className="tag-pill !h-[18px] !px-1.5 !text-[11px]" data-tone="brand">{KANSHAN_TITLE}</span>
          </p>
          <p className="truncate text-[11px] text-[color:var(--time)]">可对话 · 不问身份</p>
        </div>
      </div>

      <div className="mx-4 mt-2 max-h-56 space-y-2 overflow-y-auto px-0.5 py-1">
        {lines.map((l, i) => (
          <p key={i} className={`text-[13px] leading-6 ${l.role === "user" ? "text-right text-[color:var(--ink-2)]" : "text-[color:var(--meta)]"}`}>
            {l.role === "assistant" ? (
              <>
                {l.content}
                {l.source && l.source !== "openai-compatible" && (
                  <span className="ml-1.5 rounded bg-[rgba(255,181,71,.14)] px-1 py-px text-[10px] text-[#b56b00]">演示回答</span>
                )}
              </>
            ) : (
              <>{l.content}</>
            )}
          </p>
        ))}
        {busy && <p className="text-[13px] italic text-[color:var(--time)]">刘看山正在想……</p>}
      </div>

      <div className="flex items-center gap-2 p-3">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          maxLength={200}
          placeholder="问问管理员…"
          className="min-w-0 flex-1 rounded-[3px] border border-[color:var(--line)] bg-[color:var(--frame)] px-3 py-1.5 text-[13px] outline-none focus:border-[color:var(--zhihu)]"
        />
        <button
          onClick={send}
          disabled={busy || !text.trim()}
          className="shrink-0 rounded-full bg-[color:var(--zhihu)] px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
        >
          问
        </button>
      </div>
    </div>
  );
}