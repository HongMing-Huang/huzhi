"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconDice } from "@/components/Icons";
import { useRouter } from "next/navigation";

interface Topic {
  id: string;
  title: string;
  summary?: string;
  source: "zhihu-hot" | "fallback";
}

interface TopicsResp {
  topics: Topic[];
  source: string;
  degraded: boolean;
  reason?: string;
}

export default function Match() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [data, setData] = useState<TopicsResp | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const pre = new URLSearchParams(window.location.search).get("topic");
    // 已登录则预填账号名（开局时筹码自动记到账号）
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: { name: string } | null }) => {
        if (d.user?.name) setName((prev) => prev || d.user!.name);
      })
      .catch(() => {});
    fetch("/api/topics")
      .then((r) => r.json())
      .then((d: TopicsResp) => {
        setData(d);
        if (pre && d.topics.some((t) => t.id === pre)) setTopicId(pre);
      })
      .catch(() => setErr("话题加载失败，稍后再试"));
  }, []);

  async function start(random: boolean) {
    const n = name.trim();
    if (!n) return setErr("先给自己起个名号");
    localStorage.setItem("tb_name", n);
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, topicId: random ? null : topicId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "开局失败");
      localStorage.setItem(`tb_pid_${d.roomId}`, d.playerId);
      router.push(`/room/${d.roomId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "开局失败");
      setBusy(false);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-white">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="logo-script text-[26px] leading-none">乎知</span>
            
          </Link>
          <span className="text-sm text-[color:var(--muted)]">灵魂对局 · 1v1 互猜身份</span>
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-4 py-8">
        <div className="card p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="display text-2xl">开一局灵魂对局</h1>
              <p className="mt-2 text-sm text-[color:var(--muted)]">
                你和对手围绕同一话题聊 3–5 轮，然后互猜对方是 AI 还是真人，押上积分开牌。
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kanshan/stroll.gif" alt="刘看山在散步" className="hidden h-24 w-24 object-contain sm:block" loading="lazy" />
          </div>

          <div className="mt-6">
            <label className="text-sm font-medium">你的名号</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="例：赛博柯南"
              className="mt-1.5 w-full rounded border border-[color:var(--line)] px-3 py-2.5 text-sm outline-none focus:border-[color:var(--zhihu)]"
            />
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">话题</label>
              <span className={`text-xs ${data?.source === "zhihu-hot" ? "text-[color:var(--ok)]" : "text-[color:var(--gold)]"}`}>
                {data?.source === "zhihu-hot" ? "知乎热榜 · 实时" : "演示话题库"}
              </span>
            </div>
            {data?.degraded && data.reason && <p className="mt-1 text-xs text-[color:var(--gold)]">{data.reason}</p>}
            <div className="mt-2 max-h-72 space-y-1 overflow-auto pr-1">
              {(data?.topics ?? []).map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => setTopicId(t.id === topicId ? null : t.id)}
                  className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm transition ${
                    topicId === t.id ? "bg-[color:var(--zhihu)]/8 text-[color:var(--zhihu)]" : "hover:bg-black/[0.03]"
                  }`}
                >
                  <span className={`rank ${i < 3 ? `rank-${i + 1}` : ""} w-5 text-center`}>{i + 1}</span>
                  <span className="truncate">{t.title}</span>
                </button>
              ))}
              {!data && <p className="py-4 text-center text-sm text-[color:var(--muted)]">加载中…</p>}
            </div>
            <p className="mt-1.5 text-xs text-[color:var(--muted)]">不选 = 随机盲盒身份 + 随机话题。</p>
          </div>

          {err && <p className="mt-3 text-sm text-[color:var(--danger)]">{err}</p>}
          <div className="mt-5 flex gap-3">
            <button onClick={() => start(false)} disabled={busy} className="btn btn-primary px-6 py-2.5 text-sm">
              用选中话题开局
            </button>
            <button onClick={() => start(true)} disabled={busy} className="btn btn-outline px-6 py-2.5 text-sm">
              <IconDice size={15} /> 抽盲盒开局
            </button>
            <Link href="/" className="btn btn-plain px-4 py-2.5 text-sm">回社区</Link>
          </div>
        </div>

        <div className="card mt-4 p-5 text-sm text-[color:var(--ink-2)]">
          <b>对局规则</b>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-[color:var(--muted)]">
            <li>开局随机抽身份：伪装者要全程装 AI，纯真人要稳住人味。</li>
            <li>聊满 2 轮后可锁定猜测（猜对方是 AI / 真人 / 伪装者）并押注 50 / 200 / 全押。</li>
            <li>双方锁定后开牌：猜中识破 +80/+30，伪装成功 +50，误判 −20，赢家通吃注池。</li>
          </ol>
        </div>
      </main>
    </>
  );
}
