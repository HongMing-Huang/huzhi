"use client";

// 对局消息（IM 式会话管理）：每一局是一条会话，可回看聊天、继续对局。
// 数据源：登录用户走 /api/me/matches；游客读本机 localStorage 里的对局凭证逐个拉取。
import { useEffect, useState } from "react";
import Link from "next/link";
import { IconFlag, IconMask } from "@/components/Icons";

interface MatchRow {
  roomId: string;
  topic: string;
  phase: "chat" | "reveal";
  round: number;
  maxRounds: number;
  myPoints: number;
  lastMessage: { from: string; text: string } | null;
  updatedAt: number;
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MessagesPage() {
  const [rows, setRows] = useState<MatchRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const list = new Map<string, MatchRow>();

      // 1) 登录用户的对局
      try {
        const res = await fetch("/api/me/matches");
        const d = await res.json();
        for (const m of d.matches ?? []) list.set(m.roomId, m);
      } catch {}

      // 2) 本机存续的对局（游客/历史局）
      const pids: { roomId: string; pid: string }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("tb_pid_")) pids.push({ roomId: k.slice(7), pid: localStorage.getItem(k)! });
      }
      await Promise.all(
        pids.map(async ({ roomId, pid }) => {
          if (list.has(roomId)) return;
          try {
            const res = await fetch(`/api/rooms/${roomId}?pid=${pid}`, { cache: "no-store" });
            if (!res.ok) return;
            const d = await res.json();
            const last = d.messages?.[d.messages.length - 1];
            list.set(roomId, {
              roomId,
              topic: d.topic?.title ?? "对局",
              phase: d.phase,
              round: d.round,
              maxRounds: d.maxRounds,
              myPoints: d.reveal?.entries?.find((e: { playerId: string }) => e.playerId === pid)?.points ?? 0,
              lastMessage: last ? { from: last.from === pid ? "me" : "opp", text: String(last.text).slice(0, 80) } : null,
              updatedAt: last?.ts ?? d.createdAt ?? Date.now(),
            });
          } catch {}
        }),
      );

      setRows([...list.values()].sort((a, b) => b.updatedAt - a.updatedAt));
    })();
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-white">
        <div className="mx-auto flex h-14 max-w-[760px] items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="logo-script text-[26px] leading-none">乎知</span>
            
          </Link>
          <span className="text-sm text-[color:var(--muted)]">对局消息</span>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-4 py-5">
        <div className="card divide-y divide-[color:var(--line)]">
          {rows === null && <p className="p-8 text-center text-sm text-[color:var(--muted)]">会话加载中…</p>}
          {rows?.length === 0 && (
            <div className="p-10 text-center">
              <p className="text-sm text-[color:var(--muted)]">还没有对局会话。</p>
              <Link href="/match" className="btn btn-primary mt-4 inline-block px-6 py-2.5 text-sm">开第一局灵魂对局</Link>
            </div>
          )}
          {rows?.map((m) => (
            <Link
              key={m.roomId}
              href={`/room/${m.roomId}`}
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-black/[0.03]"
            >
              <span
                className="avatar h-11 w-11 shrink-0 text-base"
                style={{ background: m.phase === "reveal" ? "linear-gradient(135deg,#22c55e,#0d9488)" : "linear-gradient(135deg,#9a6ae8,#c95aa0)" }}
              >
                {m.phase === "reveal" ? <IconFlag size={18} /> : <IconMask size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">{m.topic}</p>
                  <span className="shrink-0 text-[11px] text-[color:var(--muted)]">{fmt(m.updatedAt)}</span>
                </div>
                <p className="truncate text-xs text-[color:var(--muted)]">
                  {m.lastMessage
                    ? `${m.lastMessage.from === "me" ? "我" : "TA"}：${m.lastMessage.text}`
                    : "还没有发言，由你开场"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-xs font-bold ${m.phase === "reveal" ? (m.myPoints >= 0 ? "text-[color:var(--ok)]" : "text-[color:var(--danger)]") : "text-[color:var(--zhihu)]"}`}>
                  {m.phase === "reveal" ? `${m.myPoints >= 0 ? "+" : ""}${m.myPoints}` : `第 ${m.round}/${m.maxRounds} 轮`}
                </p>
                <p className="mt-0.5 text-[11px] text-[color:var(--muted)]">{m.phase === "reveal" ? "已开牌" : "进行中"}</p>
              </div>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-[color:var(--muted)]">对局房间存于服务端内存：重启或重新部署后历史会话会过期，积分（登录后）不受影响。</p>
      </main>
    </>
  );
}
