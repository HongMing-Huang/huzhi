"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconBolt, IconDice } from "@/components/Icons";
import { useRouter } from "next/navigation";
import { AppHeader, MobileDock, PageFrame } from "@/components/AppChrome";
import Kanshan from "@/components/Kanshan";

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

const NICKNAME_PREFIXES = ["月下", "摸鱼的", "云端", "晚风里的", "不熬夜的", "半糖", "慢半拍的", "周末限定"];
const NICKNAME_SUFFIXES = ["侦探", "橘猫", "宇航员", "小熊", "观察员", "柯南", "企鹅", "旅人"];

function randomNickname(previous: string): string {
  const names = NICKNAME_PREFIXES.flatMap(prefix => NICKNAME_SUFFIXES.map(suffix => prefix + suffix))
    .filter(candidate => candidate !== previous);
  return names[Math.floor(Math.random() * names.length)];
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

  async function start(selectedTopicId: string | null) {
    if (busy) return;
    const n = name.trim();
    if (!n) return setErr("先给自己起个名号");
    localStorage.setItem("tb_name", n);
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, topicId: selectedTopicId }),
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
      <AppHeader title="灵魂对局" />
      <PageFrame>
        <section className="page-lead pt-1">
          <p className="page-kicker">1v1 无痕身份博弈</p>
          <h1 className="page-title">只凭对话，判断对面到底是谁</h1>
          <p className="page-summary">真人可能在装 AI，AI 也会追问你的经历。按钮、辅助和下注界面对双方完全相同。</p>
        </section>
        <div className="card p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-medium">选择名号与话题</h2>
              <p className="mt-2 text-sm text-[color:var(--meta)]">
                选定热榜话题直接进入神秘对局。对方可能是真人、AI，或正在伪装 AI 的真人。
              </p>
            </div>
            <Kanshan variant="stroll" size={96} alt="刘看山陪你等待对手" className="hidden sm:block" />
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="match-name" className="text-sm font-medium">你的名号</label>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setName(previous => randomNickname(previous));
                  if (err === "先给自己起个名号") setErr("");
                }}
                className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-[color:var(--zhihu)] hover:bg-[rgba(23,114,246,.08)] disabled:opacity-50"
              >
                <IconDice size={15} /> 随机昵称
              </button>
            </div>
            <input
              id="match-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="例：赛博柯南"
              className="field mt-1.5 px-3 py-2.5 text-sm"
            />
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">话题</label>
              <span className={`text-[13px] ${data?.source === "zhihu-hot" ? "text-[color:var(--ok)]" : "text-[color:var(--gold)]"}`}>
                {data?.source === "zhihu-hot" ? "知乎热榜 · 实时" : "演示话题库"}
              </span>
            </div>
            {data?.degraded && data.reason && <p className="mt-1 text-[13px] text-[color:var(--gold)]">{data.reason}</p>}
            <div className="mt-2 max-h-72 space-y-1 overflow-auto pr-1">
              <div className="mb-2 flex items-center gap-2 rounded bg-[rgba(23,114,246,.08)] px-3 py-2 text-[13px] text-[color:var(--zhihu)]">
                <IconBolt size={15} />
                <span><b>双击话题立即开局</b> · 键盘按回车；手机先点选，再点一次</span>
              </div>
              {(data?.topics ?? []).map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (topicId === t.id && window.matchMedia("(pointer: coarse)").matches) {
                      void start(t.id);
                      return;
                    }
                    setTopicId(t.id === topicId ? null : t.id);
                  }}
                  onDoubleClick={() => {
                    setTopicId(t.id);
                    void start(t.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    setTopicId(t.id);
                    void start(t.id);
                  }}
                  title="双击立即开局"
                  aria-label={`${t.title}，双击或按回车开局`}
                  data-picked={topicId === t.id}
                  className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm transition ${
                    topicId === t.id ? "bg-[rgba(23,114,246,.08)] text-[color:var(--zhihu)]" : "hover:bg-[color:var(--frame)]"
                  }`}
                >
                  <span className="hot-rank !w-5 !text-[15px]" data-top={i < 3}>{i + 1}</span>
                  <span className="truncate">{t.title}</span>
                </button>
              ))}
              {!data && <p className="py-4 text-center text-sm text-[color:var(--time)]">加载中…</p>}
            </div>
            <p className="mt-1.5 text-[13px] text-[color:var(--time)]">单击用于确认选择；身份始终由系统随机密封。</p>
          </div>

          {err && <p className="mt-3 text-sm text-[color:var(--like)]">{err}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={() => start(null)} disabled={busy} className="btn btn-primary">
              <IconDice size={15} /> {busy ? "正在开局…" : "随机话题开局"}
            </button>
            <Link href="/" className="btn btn-plain">回社区</Link>
          </div>
        </div>

        <div className="card mt-4 p-5 text-sm text-[color:var(--ink-2)]">
          <b>对局规则</b>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-[color:var(--meta)]">
            <li>双击话题按指定主题开局；也可让系统随机抽取话题。身份始终随机且在开牌前密封。</li>
            <li>真人可能抽到伪装任务：全程装 AI；AI 也会主动提问、追问经历。</li>
            <li>聊满 2 轮后可锁定猜测（猜对方是 AI / 真人 / 伪装者）并押注 50 / 200 / 全押。</li>
            <li>双方锁定后开牌：猜中识破 +80/+30，伪装成功 +50，误判 −20，赢家通吃注池。</li>
          </ol>
        </div>
      </PageFrame>
      <MobileDock />
    </>
  );
}
