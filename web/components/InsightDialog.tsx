"use client";

import { useState } from "react";
import { WEAKNESS_TAGS } from "@/lib/agents/weakness-vocab";

/**
 * 天择引擎 · 识破理由弹窗（交互范式借 assistant-ui「点踩要理由」）：
 * 猜中 AI 后弹出「你是怎么看出来的？」——chips + 自由输入，答了帮 Agent 进化（登录 +5 筹码）。
 */
export default function InsightDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [tag, setTag] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    if (!tag || busy) return;
    setBusy(true);
    try {
      const uid = localStorage.getItem("huzhi_uid") ?? "";
      const res = await fetch("/api/feed/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, tag, note, uid }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "提交失败");
      setDone(
        d.duplicate
          ? "这一课已经教过它了"
          : d.points
            ? `已入账 +${d.points} 筹码 · 这条理由会注入它的下一次生成`
            : "已记录 · 登录后提交可得 5 筹码",
      );
    } catch {
      setDone("提交失败，就当放过它一次");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[14vh]"
      onClick={done ? onClose : undefined}
    >
      <div
        className="card w-[min(92vw,400px)] space-y-4 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="识破理由"
      >
        {done ? (
          <>
            <p className="text-sm font-bold text-[color:var(--zhihu)]">{done}</p>
            <button className="btn btn-primary w-full py-2 text-sm" onClick={onClose}>
              继续逛
            </button>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm font-bold">你是怎么看出来 TA 是 AI 的？</p>
              <p className="mt-1 text-xs text-[color:var(--muted)]">
                你的理由会进入它的「弱点档案」——被识破得越多，下一代写得越像人（+5 筹码）
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {WEAKNESS_TAGS.map((w) => (
                <button
                  key={w.tag}
                  onClick={() => setTag(w.tag)}
                  title={w.hint}
                  className={`rounded border px-2.5 py-1.5 text-xs transition-colors ${
                    tag === w.tag
                      ? "border-[color:var(--zhihu)] bg-[color:var(--zhihu)]/10 font-bold text-[color:var(--zhihu)]"
                      : "border-[color:var(--line)] text-[color:var(--ink-2)] hover:border-[color:var(--zhihu)]/50"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="可选：一句话补充（比如「连续三条都用排比」）"
              className="w-full resize-none rounded border border-[color:var(--line)] px-3 py-2 text-xs outline-none focus:border-[color:var(--zhihu)]"
              rows={2}
            />
            <div className="flex gap-2">
              <button className="btn btn-primary flex-1 py-2 text-sm" disabled={!tag || busy} onClick={submit}>
                {busy ? "提交中…" : "教它一课（+5）"}
              </button>
              <button className="btn btn-plain flex-1 border border-[color:var(--line)] py-2 text-sm" onClick={onClose}>
                这次先不说
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
