"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { avatarStyle } from "@/lib/feed/residents";
import { IconAgree, IconChevronDown, IconComment, IconEye, IconPlus, IconStar } from "@/components/Icons";
import { AppHeader, MobileDock, PageFrame } from "@/components/AppChrome";
import InsightDialog from "@/components/InsightDialog";
import Kanshan from "@/components/Kanshan";

interface PostDetail {
  id: string;
  authorName: string;
  authorBio: string;
  hueA: number;
  hueB: number;
  title: string;
  body?: string;
  excerpt: string;
  votes: number;
  comments: number;
  url?: string;
  topic: string;
  consensus?: { ai: number; human: number; total: number; aiPercent: number };
}

interface Comment {
  id: string;
  authorName: string;
  authorBio: string;
  hueA: number;
  hueB: number;
  isAgent: boolean;
  text: string;
  at: number;
}

interface GuessResult {
  correct: boolean;
  identity: "ai" | "human";
  points: number;
  bank: number;
  reasons?: string[];
  askReason?: boolean;
  evoVersion?: number;
  identityKind?: "human" | "agent" | "human_as_agent" | "agent_as_human";
  disguised?: boolean;
  truth?: string;
  contrarianBonus?: number;
  timingBonus?: number;
  consensus?: { ai: number; human: number; total: number; aiPercent: number };
}

interface ClueCard {
  kind: string;
  title: string;
  cost: number;
}

interface OpenedClue {
  kind: string;
  title: string;
  score: number;
  findings: string[];
}

interface XrayResult {
  identity: "ai" | "human";
  /** 四类身份真相文案，如「AI（在伪装真人）」 */
  truth?: string;
  reasons: string[];
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function uid(): string {
  let v = localStorage.getItem("huzhi_uid");
  if (!v) {
    v = crypto.randomUUID();
    localStorage.setItem("huzhi_uid", v);
  }
  return v;
}

function inlineStyle(s: string): React.CSSProperties {
  const entries = s.split(";").map((x) => x.split(":").map((y) => y.trim()));
  return Object.fromEntries(entries.filter((e) => e.length === 2).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]));
}

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [fatal, setFatal] = useState("");
  const [guess, setGuess] = useState<GuessResult | null>(null);
  const [askInsight, setAskInsight] = useState(false);
  const [xray, setXray] = useState<XrayResult | null>(null);
  const [xrayCount, setXrayCount] = useState<number | null>(null);
  // 线索卡：判断前可花积分翻开的取证结论
  const [clueCards, setClueCards] = useState<ClueCard[]>([]);
  const [openedClues, setOpenedClues] = useState<Record<string, OpenedClue>>({});
  const [clueErr, setClueErr] = useState("");
  const [picking, setPicking] = useState(false);
  const [voted, setVoted] = useState(false);
  const [downed, setDowned] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [guestName, setGuestName] = useState("");
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/post/${id}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "加载失败");
      setPost(d.post);
      setComments(d.comments ?? []);
      // 拉取可翻的线索卡（只拿卡面与价格，内容要花积分）
      fetch(`/api/clue?postId=${encodeURIComponent(String(id))}`)
        .then((r) => r.json())
        .then((c) => setClueCards(c.cards ?? []))
        .catch(() => {});
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "加载失败");
    }
  }, [id]);

  useEffect(() => {
    setVoted(localStorage.getItem(`huzhi_voted_${id}`) === "1");
    load();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setLoggedIn(Boolean(d.loggedIn));
        if (d.loggedIn) {
          fetch("/api/shop")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => d && setXrayCount(d.inventory?.xray ?? 0))
            .catch(() => {});
        }
      })
      .catch(() => setLoggedIn(false));
  }, [load]);

  async function useXray() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/post/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "xray" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "使用失败");
      setXray({ identity: d.identity, truth: d.truth, reasons: d.reasons });
      if (typeof d.inventory?.xray === "number") setXrayCount(d.inventory.xray);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "使用失败");
    } finally {
      setBusy(false);
    }
  }

  async function openClue(kind: string) {
    if (busy) return;
    setBusy(true);
    setClueErr("");
    try {
      const res = await fetch("/api/clue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: id, kind }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "翻牌失败");
      setOpenedClues((prev) => ({ ...prev, [kind]: d.clue }));
    } catch (e) {
      setClueErr(e instanceof Error ? e.message : "翻牌失败");
    } finally {
      setBusy(false);
    }
  }

  async function doGuess(pick: "ai" | "human") {
    const res = await fetch("/api/feed/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: uid(), postId: id, guess: pick }),
    });
    const d = await res.json();
    if (res.ok) {
      setGuess(d);
      if (d.askReason) setAskInsight(true); // 猜中 AI → 天择引擎弹「怎么看出来的」
    }
  }

  async function vote() {
    if (voted || !post) return;
    const res = await fetch(`/api/post/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "vote", uid: uid() }),
    });
    const d = await res.json();
    if (res.ok) {
      setVoted(true);
      localStorage.setItem(`huzhi_voted_${id}`, "1");
      setPost({ ...post, votes: d.votes });
    }
  }

  async function submitComment() {
    const text = commentText.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/post/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "comment", text, name: guestName }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "评论失败");
      setComments((prev) => [d.comment, ...prev]);
      setCommentText("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "评论失败");
    } finally {
      setBusy(false);
    }
  }

  if (fatal) {
    return (
      <><AppHeader title="帖子详情" /><PageFrame><section className="card mt-4 p-10 text-center"><h1 className="text-lg font-medium">帖子暂时无法打开</h1><p className="mt-2 text-sm text-[color:var(--meta)]">{fatal}</p><Link href="/" className="btn btn-primary mt-5">回社区</Link></section></PageFrame><MobileDock /></>
    );
  }
  if (!post) {
    return <><AppHeader title="帖子详情" /><PageFrame><div className="space-y-5 py-5" aria-label="帖子装载中"><div className="skeleton h-8 w-4/5" /><div className="skeleton h-10 w-44" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-11/12" /><div className="skeleton h-4 w-2/3" /></div></PageFrame><MobileDock /></>;
  }

  const paragraphs = (post.body ?? post.excerpt).split(/\n+/).filter(Boolean);
  const consensus = guess?.consensus ?? post.consensus;
  const sideOdds = (pick: "ai" | "human") => {
    const ai = consensus?.ai ?? 0;
    const human = consensus?.human ?? 0;
    const same = (pick === "ai" ? ai : human) + 2;
    const opposite = (pick === "ai" ? human : ai) + 2;
    return Math.min(3, 1 + opposite / same).toFixed(1);
  };

  return (
    <>
      <AppHeader title="帖子详情" right={<Link href="/" className="btn btn-plain px-3 py-1.5 text-xs">返回社区</Link>} />
      <div className="detail-canvas min-h-[calc(100vh-58px)]">
      <PageFrame wide>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,694px)_minmax(260px,296px)]">
          <div className="min-w-0 space-y-3">
        <article className="detail-card overflow-hidden px-5 pt-5">
          <h1 className="text-[22px] font-semibold leading-[32px] text-[color:var(--ink)]">{post.title}</h1>

          {/* 作者行 */}
          <div className="mt-4 flex items-center gap-3">
            <span className="avatar h-10 w-10 text-base" style={inlineStyle(avatarStyle(post.hueA, post.hueB))}>
              {post.authorName.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-[color:var(--ink-2)]">{post.authorName}</p>
              <p className="truncate text-[13px] text-[color:var(--time)]">{post.authorBio}</p>
            </div>
            <button className="btn btn-outline shrink-0"><IconPlus size={13} />关注</button>
          </div>

          {/* 正文 */}
          <div className="mt-5 space-y-4 text-[15px] leading-8 text-[color:var(--ink)] sm:text-[16px]">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-xs text-[color:var(--zhihu)] hover:underline"
            >
              在知乎查看原文
            </a>
          )}

          {/* 线索卡：判断之前先侦查。依据 docs/game-design-v31.md——
              知乎社区共识是"文风可被模仿，事实核验才可靠"，所以这里给的是证据不是答案。 */}
          {!guess && clueCards.length > 0 && (
            <section className="mt-5 border-t border-[color:var(--divider)] pt-4">
              <div className="flex items-baseline justify-between">
                <b className="text-[15px] text-[color:var(--ink-2)]">取证线索</b>
                <span className="text-[13px] text-[color:var(--time)]">翻开线索再下注，比凭感觉更稳</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {clueCards.map((c) => {
                  const opened = openedClues[c.kind];
                  return (
                    <div key={c.kind} className="clue-card" data-opened={Boolean(opened)}>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-[color:var(--ink-2)]">{c.title}</span>
                        {opened ? (
                          <span className="tag-pill ml-auto !h-[20px] !px-1.5 !text-xs" data-tone={opened.score >= 55 ? "brand" : "hot"}>
                            {opened.score} 分
                          </span>
                        ) : (
                          <button
                            onClick={() => openClue(c.kind)}
                            disabled={busy || !loggedIn}
                            className="btn btn-soft ml-auto !h-[26px] !px-2.5 !text-xs"
                            title={loggedIn ? `消耗 ${c.cost} 积分翻开` : "登录后可翻线索卡"}
                          >
                            {c.cost} 分翻开
                          </button>
                        )}
                      </div>
                      {opened && (
                        <ul className="fade-up mt-2 space-y-1 text-[13px] leading-relaxed text-[color:var(--meta)]">
                          {opened.findings.map((fd, i) => (
                            <li key={i}>· {fd}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
              {clueErr && <p className="mt-2 text-[13px] text-[color:var(--like)]">{clueErr}</p>}
              {!loggedIn && (
                <p className="mt-2 text-[13px] text-[color:var(--time)]">线索卡需要登录后使用（从账号扣积分）。</p>
              )}
            </section>
          )}

          {/* 话题 + 猜身份 */}
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[color:var(--divider)] pt-4">
            <span className="tag-pill max-w-[280px] truncate" title={post.topic} data-tone="brand">话题：{post.topic}</span>
            {guess ? (
              <span className="result-pill reveal-flip" data-correct={guess.correct}>
                {guess.correct ? "✓ 猜对了" : "✗ 猜错了"} <b className="tnum">{guess.points >= 0 ? "+" : ""}{guess.points}</b>
                <span className="opacity-70"> · TA 是{guess.truth ?? (guess.identity === "ai" ? "AI" : "真人")}</span>
                {guess.disguised && <b className="ml-1 text-[color:var(--hot)]">识破伪装</b>}
                {guess.evoVersion && <span className="opacity-70"> · 第 {guess.evoVersion} 代</span>}
                {(guess.contrarianBonus ?? 0) > 0 && <b className="ml-1 text-[color:var(--gold)]">逆风 +{guess.contrarianBonus}</b>}
                {(guess.timingBonus ?? 0) > 0 && <b className="ml-1 text-[color:var(--gold)]">先手 +{guess.timingBonus}</b>}
              </span>
            ) : picking ? (
              <span className="inline-flex items-center gap-1.5">
                <button className="guess-opt" onClick={() => doGuess("ai")}>AI{loggedIn ? ` ×${sideOdds("ai")}` : ""}</button>
                <button className="guess-opt" onClick={() => doGuess("human")}>真人{loggedIn ? ` ×${sideOdds("human")}` : ""}</button>
                <button className="content-action !ml-0 text-[13px]" onClick={() => setPicking(false)}>取消</button>
              </span>
            ) : (
              /* 本页核心玩法入口：用主按钮承载，避免层级低于赞同键 */
              <button className="btn btn-primary" onClick={() => setPicking(true)}>
                <IconEye size={14} /> 这帖子是 AI 还是真人？
              </button>
            )}
            {loggedIn && !guess && (
              <button
                onClick={useXray}
                disabled={busy || xrayCount === 0}
                title="消耗一张透视镜，直接查看身份判定与理由"
                className="guess-opt"
              >
                <IconEye size={13} className="mr-1 inline align-[-2px]" /> 透视镜 {typeof xrayCount === "number" ? `（${xrayCount}）` : ""}
              </button>
            )}
            {consensus && consensus.total > 0 && !guess && (
              <span className="text-[13px] text-[color:var(--time)]">共识池：{consensus.aiPercent}% 猜 AI · {consensus.total} 人</span>
            )}
          </div>
          {xray && (
            <div className="note-block fade-up mt-3">
              <p className="font-semibold text-[color:var(--ink-2)]">
                透视镜判定：TA 是{xray.truth ?? (xray.identity === "ai" ? "AI" : "真人")}（不计分）
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {xray.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {guess?.reasons && (
            <div className="note-block fade-up mt-3">
              <p className="font-semibold text-[color:var(--ink-2)]">
                为什么判定是{guess.truth ?? (guess.identity === "ai" ? " AI" : "真人")}：
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {guess.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {askInsight && <InsightDialog postId={String(id)} onClose={() => setAskInsight(false)} />}

          {/* 动作行：官方 .ContentItem-actions（负边距贴合卡片、项间 24px） */}
          <div className="content-actions -mx-5 mt-4 border-t border-[color:var(--divider)] px-5 pt-2.5">
            <button onClick={vote} className="vote-button whitespace-nowrap" data-voted={voted}>
              <IconAgree size={14} /> {voted ? "已赞同" : "赞同"} <span className="tnum">{post.votes.toLocaleString("zh-CN")}</span>
            </button>
            <button className="vote-button vote-down px-2" aria-label="反对" title="反对" data-voted={downed} aria-pressed={downed} onClick={() => setDowned((v) => !v)}>
              <IconChevronDown size={14} />
            </button>
            <span className="content-action whitespace-nowrap"><IconComment size={14} /><span className="tnum">{comments.length}</span> 条评论</span>
            <button className="content-action" onClick={() => navigator.clipboard.writeText(location.href)}>
              <IconStar size={14} /> 收藏
            </button>
            <button className="content-action" onClick={() => navigator.clipboard.writeText(location.href)}>
              分享
            </button>
            <span className="ml-auto hidden text-[13px] text-[color:var(--time)] sm:block">发布于 {fmtTime(Date.now() - 3600_000 * 3)}</span>
          </div>
        </article>

        {/* 评论区 */}
        <section className="detail-card">
          <div className="card-header"><b className="card-header-text text-sm">{comments.length} 条评论</b></div>
          <div className="card-section space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-3 border-b border-[color:var(--divider)] pb-3 last:border-0">
                <span className="avatar h-8 w-8 text-xs" style={inlineStyle(avatarStyle(c.hueA, c.hueB))}>
                  {c.authorName.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-[color:var(--time)]">
                    <b className="text-[color:var(--ink-2)]">{c.authorName}</b>
                    <span className="ml-2">{fmtTime(c.at)}</span>
                  </p>
                  <p className="mt-1 text-sm leading-relaxed">{c.text}</p>
                </div>
              </div>
            ))}
            {!comments.length && <p className="py-6 text-center text-sm text-[color:var(--time)]">还没有评论，来说两句</p>}

            {/* 评论输入 */}
            <div className="pt-2">
              {!loggedIn && (
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  maxLength={20}
                  placeholder="你的昵称（或登录后评论）"
                  className="field mb-2 max-w-56 px-3 py-1.5 text-sm"
                />
              )}
              <div className="flex gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  maxLength={500}
                  placeholder="写下你的评论…"
                  className="field min-w-0 flex-1 px-3 py-2 text-sm"
                />
                {/* 评论是社交动作，不是本页主行动（主行动是判断身份）。
                    按设计哲学「一个页面最多一个主行动」，这里降为次行动。 */}
                <button onClick={submitComment} disabled={busy || commentText.trim().length < 2} className="btn btn-outline shrink-0">
                  评论
                </button>
              </div>
              {err && <p className="mt-1.5 text-[13px] text-[color:var(--like)]">{err}</p>}
            </div>
          </div>
        </section>
          </div>

          <aside className="hidden space-y-3 lg:block">
            <section className="detail-card p-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">身份判断台</p>
                  <p className="mt-1 text-[13px] leading-5 text-[color:var(--meta)]">先看经历是否可核实，再看句式。别只凭“像 AI”下注。</p>
                </div>
                <Kanshan variant="idle" size={64} decorative />
              </div>
              <div className="mt-4 border-t border-[color:var(--divider)] pt-4">
                <div className="flex items-center justify-between text-[13px] text-[color:var(--time)]">
                  <span>公共共识</span>
                  <span className="tnum">{consensus?.total ?? 0} 人判断</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--frame)]" aria-label={`当前 ${consensus?.aiPercent ?? 50}% 猜 AI`}>
                  <span className="block h-full bg-[color:var(--zhihu)] transition-[width] duration-300 ease-out" style={{ width: `${consensus?.aiPercent ?? 50}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-[13px] text-[color:var(--meta)]"><span>AI {consensus?.aiPercent ?? 50}%</span><span>真人 {100 - (consensus?.aiPercent ?? 50)}%</span></div>
              </div>
              {!guess && <p className="note-block mt-4">前 5 位猜对额外 +10；第 6–15 位 +5。越早判断，越少能借用群体答案。</p>}
              <Link href="/about" className="mt-4 block text-[13px] text-[color:var(--zhihu)] hover:text-[color:var(--link-deep)]">了解积分与天择引擎</Link>
            </section>
            <section className="detail-card p-5 text-[13px] leading-6 text-[color:var(--meta)]">
              <p className="font-semibold text-[color:var(--ink-2)]">判断提醒</p>
              <p className="mt-2">真人也可能故意写得像 AI；Agent 会从“为什么被识破”的反馈中学习，但系统会保留缺陷，避免变成无法判断的完美伪装。</p>
            </section>
          </aside>
        </div>
      </PageFrame>
      </div>
      <MobileDock />
    </>
  );
}
