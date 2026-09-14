"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ChatWindow from "@/components/ChatWindow";
import { personaById } from "@/lib/ai/personas";
import { IconMask, IconRobot, IconUser as IconUserIco, IconSearch as IconSearchIco } from "@/components/Icons";
import { AppHeader, SidebarPage } from "@/components/AppChrome";
import type { ClientRoom, GuessKind } from "@/lib/game/types";

interface Clue {
  label: string;
  detail: string;
}

const IDENTITY_META: Record<GuessKind, { label: string; icon: React.ReactNode }> = {
  ai: { label: "纯 AI", icon: <IconRobot size={14} /> },
  human: { label: "纯真人", icon: <IconUserIco size={14} /> },
  disguised: { label: "伪装者", icon: <IconMask size={14} /> },
};

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ClientRoom | null>(null);
  const [fatal, setFatal] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [guessKind, setGuessKind] = useState<GuessKind | null>(null);
  const [bet, setBet] = useState<number | "all">("all");
  const [clues, setClues] = useState<Clue[] | null>(null);
  const [assistNote, setAssistNote] = useState("");
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [pid, setPid] = useState("");
  const [showMission, setShowMission] = useState(true);

  const fetchState = useCallback(async () => {
    if (!pid) return;
    try {
      const res = await fetch(`/api/rooms/${id}?pid=${pid}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "加载失败");
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    }
  }, [id, pid]);

  useEffect(() => {
    const stored = localStorage.getItem(`tb_pid_${id}`);
    if (!stored) {
      setFatal("找不到你的对局凭证，请回社区重新开局。");
      return;
    }
    setPid(stored);
  }, [id]);

  // Next.js 可能在不同房间之间复用页面实例；每个新房间都必须重新确认任务。
  useEffect(() => {
    setShowMission(true);
  }, [id]);

  useEffect(() => {
    if (!pid) return;
    fetchState();
    // 实时通道：SSE 推送变更事件，断线自动回退轮询
    let fallback: ReturnType<typeof setInterval> | null = null;
    const es = new EventSource(`/api/rooms/${id}/stream?pid=${pid}`);
    es.addEventListener("update", () => fetchState());
    es.addEventListener("gone", () => {
      es.close();
      setFatal("对局已过期，请回社区重新开局。");
    });
    es.onerror = () => {
      es.close();
      if (!fallback) fallback = setInterval(fetchState, 1600);
    };
    return () => {
      es.close();
      if (fallback) clearInterval(fallback);
    };
  }, [pid, fetchState]);

  async function post(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/rooms/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid, ...body }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "操作失败");
      if (d.roomId) setData(d as ClientRoom);
      return d;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作失败");
      return null;
    } finally {
      setBusy(false);
    }
  }

  // 对称辅助：双方同一个按钮，服务端按身份分流（伪装者→AI 腔参考；真人→特征线索）
  const assist = useCallback(async () => {
    const mine = data?.messages.filter((m) => m.from === pid).slice(-1)[0]?.text;
    const draft = mine ?? `关于「${data?.topic.title ?? "这个话题"}」，我先说说我的看法`;
    const d = await post("assist", { kind: "auto", draft });
    if (d?.clues) setClues(d.clues as Clue[]);
    if (d?.suggestions) {
      setSuggestions(d.suggestions as string[]);
      setAssistNote(d.note ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pid, data]);

  async function playAgain() {
    if (!data) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.you.name, topicId: data.topic.id }),
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

  if (fatal) {
    return (
      <><AppHeader title="灵魂对局" /><SidebarPage><div className="grid min-h-[60vh] place-items-center text-center"><div><h1 className="text-lg font-medium">这场对局已经结束</h1><p className="mt-2 text-sm text-[color:var(--meta)]">{fatal}</p><Link href="/match" className="btn btn-primary mt-5 inline-block px-6 py-2.5">重新开一局</Link></div></div></SidebarPage></>
    );
  }
  if (!data) {
    return <><AppHeader title="灵魂对局" /><SidebarPage><div className="space-y-4 py-5" aria-label="对局装载中"><div className="skeleton h-4 w-full" /><div className="skeleton h-[320px] w-full" /><div className="skeleton h-20 w-full" /></div></SidebarPage></>;
  }

  const me = data.you;
  const persona = me.personaId ? personaById(me.personaId) : null;
  const canGuess = data.phase === "chat" && data.round >= 2 && !me.guess;
  const disguised = me.identity === "disguised";
  const chatting = data.phase === "chat";

  return (
    <>
      <AppHeader title="灵魂对局" right={
        <div className="flex items-center gap-2">
          <div className="chip flex items-center gap-1 px-2.5 py-1 text-sm tnum">
            <b>{me.bank}</b>
            <span className="text-[10px]">积分</span>
          </div>
          <button onClick={() => setShowMission(true)} className="btn btn-plain border border-[color:var(--line)] ">
            任务
          </button>
        </div>
      } />
      <SidebarPage>
      {/* 对局话题：完整展示，不再塞进顶栏被截断 */}
      <div className="pt-4">
        <p className="text-[13px] text-[color:var(--time)]">本局话题</p>
        <h1 className="mt-1 text-[17px] font-medium leading-[26px] text-[color:var(--ink)]">
          {data.topic.title}
        </h1>
        {data.topic.url && (
          <a
            href={data.topic.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-[13px] text-[color:var(--zhihu)] hover:text-[color:var(--link-deep)]"
          >
            在知乎查看原问题 ›
          </a>
        )}
      </div>

      {/* 轮次进度：光有色条读者不知道在表示什么，补一句说明 */}
      <div
        className="mt-3"
        aria-label={`第 ${data.round} 轮，共 ${data.maxRounds} 轮`}
      >
        <div className="flex items-center gap-2">
          {Array.from({ length: data.maxRounds }).map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i < data.round ? "bg-[color:var(--zhihu)]" : "bg-[color:var(--line)]"}`}
            />
          ))}
          <span className="tnum ml-1 shrink-0 text-xs text-[color:var(--time)]">
            {data.round}/{data.maxRounds} 轮
          </span>
        </div>
        <p className="mt-1.5 text-[13px] text-[color:var(--time)]">
          {data.phase === "reveal"
            ? "已开牌"
            : data.round < 2
              ? `对话进度 · 聊满 2 轮后可以下注（还差 ${2 - data.round} 轮）`
              : "对话进度 · 现在可以锁定判断并下注"}
        </p>
      </div>
      <div className="pb-10">

      {/* 聊天窗口（新设计） */}
      <ChatWindow
        messages={data.messages}
        meId={me.id}
        meName={me.name}
        oppName={data.opponent.name}
        busy={busy}
        disabled={!chatting}
        placeholder={disguised ? "用 AI 的方式说话…" : "像真人一样聊天，套对面的话…"}
        quickChips={
          disguised
            ? ["首先，这个问题要拆开看", "综上，理性吃瓜", "希望对你有帮助"]
            : ["你为什么回这么快？", "说点你自己的经历？", "换个说法试试？"]
        }
        onSend={(text) => post("message", { text })}
      />

      {/* 辅助工具行（对称：双方同一按钮，服务端按身份给不同内容） */}
      {chatting && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={assist} disabled={busy} className="btn btn-plain border border-[color:var(--line)] ">
            <IconSearchIco size={14} className="inline" /> 辅助
          </button>
          {data.opponent.hasGuessed && !me.guess && (
            <span className="text-xs text-[color:var(--gold)]">对方已锁定 —— 你还在犹豫，注池随时开。</span>
          )}
        </div>
      )}
      {err && <p className="mt-2 text-sm text-[color:var(--like)]">{err}</p>}

      {assistNote && <p className="mt-2 text-xs text-[color:var(--meta)]">{assistNote}</p>}
      {clues && (
        <div className="card mt-3 space-y-2 p-4 text-sm">
          <p className="text-xs font-bold text-[color:var(--zhihu)]">线索（不构成结论）</p>
          {clues.map((c) => (
            <p key={c.label}>
              <span className="font-bold">{c.label}：</span>
              <span className="text-[color:var(--meta)]">{c.detail}</span>
            </p>
          ))}
        </div>
      )}
      {suggestions && (
        <div className="card mt-3 space-y-1.5 p-4 text-sm">
          <p className="text-xs font-bold text-[#b03aa0]">AI 腔参考（禁止直接复制发送）</p>
          {suggestions.map((s, i) => (
            <p key={i} className="text-[color:var(--meta)]">- {s}</p>
          ))}
        </div>
      )}

      {/* 猜身份 + 下注 */}
      {chatting && (
        <section className="felt mt-4 rounded p-5">
          {me.guess ? (
            <p className="text-center text-sm text-[color:var(--meta)]">
              已锁定：猜「{IDENTITY_META[me.guess.kind].label}」押 <b className="tnum text-[color:var(--gold)]">{me.guess.bet}</b>。
              {me.guess.insured && <span className="ml-1 text-[color:var(--zhihu)]">止损券已生效。</span>}
              {data.opponent.hasGuessed ? "双方已就位，正在开牌…" : "等对方锁注后自动开牌。"}
            </p>
          ) : (
            <>
              <p className="text-center text-sm font-bold">锁定猜测，押上积分</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(Object.keys(IDENTITY_META) as GuessKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setGuessKind(k)}
                    className={`btn rounded border py-2 text-center text-sm ${
                      guessKind === k
                        ? "border-[color:var(--zhihu)] bg-[color:var(--zhihu)]/8 font-medium text-[color:var(--zhihu)]"
                        : "border-[color:var(--line)] bg-white hover:border-[color:var(--zhihu)]"
                    }`}
                  >
                    {IDENTITY_META[k].icon} {IDENTITY_META[k].label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-center gap-3">
                {[50, 200, "all" as const].map((b) => (
                  <button key={String(b)} onClick={() => setBet(b)} data-on={bet === b} className="chip h-14 w-14 text-sm font-bold tnum">
                    {b === "all" ? "全押" : b}
                  </button>
                ))}
              </div>
              <button onClick={() => post("guess", { kind: guessKind, bet: bet === "all" ? me.bank : bet })} disabled={!canGuess || !guessKind || busy} className="btn btn-primary mt-4 w-full py-2.5">
                {data.round < 2 ? `还差 ${2 - data.round} 轮解锁下注` : "锁了，开牌！"}
              </button>
            </>
          )}
          <button onClick={() => post("reveal", {})} disabled={busy} className="mt-2 w-full text-center text-xs text-[color:var(--meta)] hover:text-[color:var(--ink-2)]">
            不想猜了？强制开牌
          </button>
        </section>
      )}

      {/* 揭晓 */}
      {data.phase === "reveal" && data.reveal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <div className="card fade-up w-full max-w-lg max-h-[88vh] overflow-auto p-6" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h2 className="display text-center text-2xl text-[color:var(--zhihu)]">开牌！</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {data.reveal.entries.map((e, i) => {
                const mine = e.playerId === me.id;
                return (
                  <div key={e.playerId} className="reveal-flip rounded border border-[color:var(--line)] bg-[color:var(--bg)] p-4 text-sm" style={{ animationDelay: `${i * 0.18}s` }}>
                    <p className="text-xs text-[color:var(--meta)]">{mine ? "你" : e.name} 的真身</p>
                    <p className="display mt-1 text-lg">
                      {IDENTITY_META[e.identity].icon} {IDENTITY_META[e.identity].label}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--meta)]">
                      猜测：{e.guessed ? IDENTITY_META[e.guessed].label : "未猜"}
                      {e.bet ? ` · 押 ${e.bet}` : ""}
                    </p>
                    <p className={`tnum mt-2 text-xl font-bold ${e.points >= 0 ? "text-[color:var(--ok)]" : "text-[color:var(--like)]"}`}>
                      {e.points >= 0 ? "+" : ""}{e.points}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 space-y-1 rounded bg-[color:var(--bg)] p-4 text-xs leading-relaxed text-[color:var(--meta)]">
              {data.reveal.report.map((line, i) => (
                <p key={i} className={i === 0 ? "font-bold text-[color:var(--ink)]" : ""}>{line}</p>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={playAgain} disabled={busy} className="btn btn-primary py-2.5">再来一局</button>
              <Link href="/" className="btn btn-outline py-2.5 text-center">回社区</Link>
            </div>
          </div>
        </div>
      )}

      {/* 任务在入场时显示，用户确认后关闭；双方弹窗结构相同，避免交互泄露身份。 */}
      {showMission && data.phase === "chat" && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/25 p-4" role="presentation">
          <section className="card fade-up w-full max-w-md p-6 text-center shadow-xl" role="dialog" aria-modal="true" aria-labelledby="mission-title">
            <p className="text-xs font-medium tracking-wide text-[color:var(--time)]">本局秘密任务</p>
            <h1 id="mission-title" className="mt-2 text-2xl font-medium text-[color:var(--ink)]">
              {disguised ? "伪装成 AI，别被看穿" : "判断对面到底是谁"}
            </h1>
            {disguised && persona && (
              <p className="mt-3 text-sm text-[color:var(--meta)]">你的表达模板：{persona.name} · {persona.blurb}</p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-[color:var(--meta)]">
              {disguised
                ? "不要自曝。让对面确信你是机器，聊满两轮后再下注。"
                : "对面可能是真人、AI，或正在伪装 AI 的真人。只凭对话下注。"}
            </p>
            <button type="button" className="btn btn-primary mt-5" onClick={() => setShowMission(false)}>
              我知道啦
            </button>
          </section>
        </div>
      )}
      </div>
      </SidebarPage>
    </>
  );
}
