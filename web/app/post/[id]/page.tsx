"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { avatarStyle } from "@/lib/feed/residents";
import { IconAgree, IconComment, IconEye } from "@/components/Icons";

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
}

interface XrayResult {
  identity: "ai" | "human";
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
  const [xray, setXray] = useState<XrayResult | null>(null);
  const [xrayCount, setXrayCount] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [voted, setVoted] = useState(false);
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
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "加载失败");
    }
  }, [id]);

  useEffect(() => {
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
      setXray({ identity: d.identity, reasons: d.reasons });
      if (typeof d.inventory?.xray === "number") setXrayCount(d.inventory.xray);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "使用失败");
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
    if (res.ok) setGuess(d);
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
      <main className="mx-auto max-w-[720px] px-4 py-10 text-center">
        <p className="text-[color:var(--muted)]">{fatal}</p>
        <Link href="/" className="btn btn-primary mt-4 inline-block px-6 py-2.5">回社区</Link>
      </main>
    );
  }
  if (!post) {
    return <main className="grid min-h-screen place-items-center text-[color:var(--muted)]">帖子装载中…</main>;
  }

  const paragraphs = (post.body ?? post.excerpt).split(/\n+/).filter(Boolean);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-white">
        <div className="mx-auto flex h-14 max-w-[720px] items-center gap-3 px-4">
          <Link href="/" className="text-sm text-[color:var(--muted)] hover:text-[color:var(--ink)]">‹ 回社区</Link>
          <span className="mx-auto truncate text-sm font-medium">帖子详情</span>
          <span className="w-14" />
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 py-5 pb-16">
        <article className="card p-5 sm:p-7">
          <h1 className="display text-xl sm:text-2xl">{post.title}</h1>

          {/* 作者行 */}
          <div className="mt-4 flex items-center gap-3">
            <span className="avatar h-10 w-10 text-base" style={inlineStyle(avatarStyle(post.hueA, post.hueB))}>
              {post.authorName.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{post.authorName}</p>
              <p className="truncate text-xs text-[color:var(--muted)]">{post.authorBio}</p>
            </div>
            <button className="btn btn-outline px-4 py-1.5 text-xs">+ 关注</button>
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
              原文链接（知乎站内） ↗
            </a>
          )}

          {/* 话题 + 猜身份 */}
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[color:var(--line)] pt-4">
            <span className="rounded-full bg-[color:var(--zhihu)]/8 px-3 py-1 text-xs text-[color:var(--zhihu)]">话题：{post.topic}</span>
            {guess ? (
              <span className={`reveal-flip rounded px-2.5 py-1 text-xs ${guess.correct ? "bg-emerald-50 text-[color:var(--ok)]" : "bg-rose-50 text-[color:var(--danger)]"}`}>
                {guess.correct ? "✓ 猜对了" : "✗ 猜错了"} <b className="tnum">{guess.points >= 0 ? "+" : ""}{guess.points}</b>
                <span className="opacity-70"> · TA 是{guess.identity === "ai" ? "AI" : "真人"}</span>
              </span>
            ) : picking ? (
              <span className="inline-flex items-center gap-1.5">
                <button className="guess-opt px-3 py-1 text-xs" onClick={() => doGuess("ai")}>AI</button>
                <button className="guess-opt px-3 py-1 text-xs" onClick={() => doGuess("human")}>真人</button>
                <button className="btn-plain btn px-1 text-xs" onClick={() => setPicking(false)}>取消</button>
              </span>
            ) : (
              <button className="btn btn-outline px-3 py-1.5 text-xs" onClick={() => setPicking(true)}>
                这帖子是 AI 还是真人？
              </button>
            )}
            {loggedIn && !guess && (
              <button
                onClick={useXray}
                disabled={busy || xrayCount === 0}
                title="消耗一张透视镜，直接查看身份判定与理由"
                className="btn btn-plain border border-[color:var(--line)] px-2.5 py-1 text-xs"
              >
                <IconEye size={13} className="inline" /> 透视镜 {typeof xrayCount === "number" ? `（${xrayCount}）` : ""}
              </button>
            )}
          </div>
          {xray && (
            <div className="fade-up mt-3 rounded bg-[color:var(--bg)] p-3 text-xs leading-relaxed text-[color:var(--muted)]">
              <p className="font-bold text-[color:var(--ink-2)]">
                🔮 透视镜判定：TA 是{xray.identity === "ai" ? "AI" : "真人"}（不计分）
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {xray.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {guess?.reasons && (
            <div className="fade-up mt-3 rounded bg-[color:var(--bg)] p-3 text-xs leading-relaxed text-[color:var(--muted)]">
              <p className="font-bold text-[color:var(--ink-2)]">为什么判定是{guess.identity === "ai" ? " AI" : "真人"}：</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {guess.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 动作行 */}
          <div className="mt-4 flex items-center gap-5 border-t border-[color:var(--line)] pt-3 text-sm text-[color:var(--muted)]">
            <button onClick={vote} className={`transition hover:text-[color:var(--zhihu)] ${voted ? "text-[color:var(--zhihu)]" : ""}`}>
              <IconAgree size={14} className="inline" /> 赞同 <span className="tnum">{post.votes.toLocaleString()}</span>
            </button>
            <span className="inline-flex items-center gap-1"><IconComment size={14} /><span className="tnum">{comments.length}</span> 条评论</span>
            <span className="ml-auto text-xs">发布于 {fmtTime(Date.now() - 3600_000 * 3)}</span>
          </div>
        </article>

        {/* 评论区 */}
        <section className="card mt-4 p-5 sm:p-6">
          <b className="text-sm">{comments.length} 条评论</b>
          <div className="mt-4 space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-3 border-b border-[color:var(--line)] pb-3 last:border-0">
                <span className="avatar h-8 w-8 text-xs" style={inlineStyle(avatarStyle(c.hueA, c.hueB))}>
                  {c.authorName.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[color:var(--muted)]">
                    <b className="text-[color:var(--ink-2)]">{c.authorName}</b>
                    <span className="ml-2">{fmtTime(c.at)}</span>
                  </p>
                  <p className="mt-1 text-sm leading-relaxed">{c.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 评论输入 */}
          <div className="mt-4">
            {!loggedIn && (
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                maxLength={20}
                placeholder="你的昵称（或登录后评论）"
                className="mb-2 w-full max-w-56 rounded border border-[color:var(--line)] px-3 py-1.5 text-sm outline-none focus:border-[color:var(--zhihu)]"
              />
            )}
            <div className="flex gap-2">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                maxLength={500}
                placeholder="写下你的评论…"
                className="min-w-0 flex-1 rounded border border-[color:var(--line)] px-3 py-2 text-sm outline-none focus:border-[color:var(--zhihu)]"
              />
              <button onClick={submitComment} disabled={busy || commentText.trim().length < 2} className="btn btn-primary px-5 text-sm">
                评论
              </button>
            </div>
            {err && <p className="mt-1.5 text-xs text-[color:var(--danger)]">{err}</p>}
          </div>
        </section>
      </main>
    </>
  );
}
