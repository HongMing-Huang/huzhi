"use client";

// 同频匹配 /kindred（灵魂匹配局赛道）
//
// 画像完全来自已发生的行为——判断倾向、话题足迹、表达风格，不需要填任何表单。
// 匹配不只给一个分数，还要给出**可解释的理由**与**可直接用的破冰话题**，
// 因为赛道要求的是"让一次讨论更容易开始、更值得继续"。
import { useCallback, useEffect, useState } from "react";
import { copyText } from "@/lib/client-id";
import Link from "next/link";
import { AppHeader, MobileDock, SidebarPage } from "@/components/AppChrome";
import KanshanSays from "@/components/KanshanSays";
import { IconChat, IconMask, IconUser } from "@/components/Icons";

interface Profile {
  userKey: string;
  displayName: string;
  judged: number;
  suspicion: number;
  accuracy: number;
  topics: string[];
  styleIndex: number | null;
  posts: number;
}

interface Match {
  profile: Profile;
  score: number;
  reasons: string[];
  icebreaker: string;
}

interface RecQuestion {
  Title: string;
  Url: string;
}

function suspicionLabel(s: number): string {
  if (s >= 0.65) return "偏怀疑型";
  if (s <= 0.35) return "偏信任型";
  return "中立型";
}

export default function KindredPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [hint, setHint] = useState("");
  const [unauth, setUnauth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");
  // 来自知乎「问题推荐 API」：匹配之后给一件可以一起做的事
  const [questions, setQuestions] = useState<RecQuestion[]>([]);
  const [questionSeed, setQuestionSeed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kindred");
      if (res.status === 401) {
        setUnauth(true);
        return;
      }
      const d = await res.json();
      setProfile(d.profile ?? null);
      setMatches(d.matches ?? []);
      setQuestions(d.questions ?? []);
      setQuestionSeed(d.questionSeed ?? null);
      setHint(d.hint ?? "");
    } catch {
      setHint("匹配服务暂时没响应");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <AppHeader title="同频匹配" />
      <SidebarPage>
        <section className="page-lead pt-1">
          <p className="page-kicker">灵魂匹配局 · 基于行为而非问卷</p>
          <h1 className="page-title">找到真正同频的人</h1>
          <p className="page-summary">
            不用填标签。你的判断倾向、关注的话题、写东西的节奏，已经说明了你是谁。
          </p>
        </section>

        {loading && (
          <div className="mt-4 space-y-3">
            <div className="skeleton h-28 w-full" />
            <div className="skeleton h-20 w-full" />
          </div>
        )}

        {!loading && unauth && (
          <div className="card mt-4 p-10 text-center">
            <p className="text-sm text-[color:var(--meta)]">
              同频匹配需要登录——画像来自你自己的判断与发帖行为。
            </p>
            <Link href="/login" className="btn btn-primary mt-4">去登录 / 注册</Link>
          </div>
        )}

        {!loading && !unauth && !profile && (
          <div className="mt-4">
            <KanshanSays scene="guide" seed="kindred-empty" className="card p-4" />
            <div className="empty-stage">
              <p>{hint || "还没有足够的行为数据。"}</p>
              <Link href="/" className="btn btn-primary">去信息流判断几篇</Link>
            </div>
          </div>
        )}

        {!loading && profile && (
          <>
            {/* 我的画像 */}
            <section className="card mt-4">
              <div className="card-header">
                <b className="card-header-text flex items-center gap-1.5 text-sm">
                  <IconUser size={16} className="text-[color:var(--zhihu)]" />
                  你的行为画像
                </b>
                <span className="tag-pill" data-tone="brand">{suspicionLabel(profile.suspicion)}</span>
              </div>
              <div className="card-section">
                <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                  <Metric label="判断次数" value={String(profile.judged)} />
                  <Metric label="准确率" value={`${Math.round(profile.accuracy * 100)}%`} tone="brand" />
                  <Metric label="发过内容" value={String(profile.posts)} />
                  <Metric
                    label="表达自然度"
                    value={profile.styleIndex === null ? "—" : String(profile.styleIndex)}
                  />
                </div>
                {profile.topics.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[13px] text-[color:var(--time)]">你的话题足迹</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {profile.topics.slice(0, 8).map((t) => (
                        <span key={t} className="tag-pill">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="note-block mt-4">
                  {profile.suspicion >= 0.65
                    ? "你倾向于把内容判成 AI——警觉度高，但要留意别把写得好的真人也当成机器。"
                    : profile.suspicion <= 0.35
                      ? "你倾向于相信内容是真人写的——这让你不容易误伤，但也可能漏掉伪装者。"
                      : "你的判断比较均衡，两边都不轻易下结论。"}
                </p>
              </div>
            </section>

            {/* 匹配结果 */}
            <h2 className="section-label mt-5">可能同频的人</h2>
            {matches.length === 0 ? (
              <div className="empty-stage">
                <p>社区里还没有足够多有行为记录的居民。</p>
                <Link href="/" className="btn btn-outline">先去判断几篇内容</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {matches.map((m) => (
                  <section key={m.profile.userKey} className="card">
                    <div className="card-section">
                      <div className="flex items-center gap-3">
                        <span
                          className="avatar h-11 w-11 text-base"
                          style={{ background: "linear-gradient(135deg,#1772f6,#18afff)" }}
                        >
                          {m.profile.displayName.slice(0, 1)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium text-[color:var(--ink-2)]">
                            {m.profile.displayName}
                          </p>
                          <p className="mt-0.5 text-[13px] text-[color:var(--time)]">
                            {suspicionLabel(m.profile.suspicion)} · 判断 {m.profile.judged} 次 · 准确率{" "}
                            {Math.round(m.profile.accuracy * 100)}%
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tnum text-[22px] font-semibold leading-none text-[color:var(--zhihu)]">
                            {m.score}
                          </p>
                          <p className="mt-0.5 text-xs text-[color:var(--time)]">同频度</p>
                        </div>
                      </div>

                      <ul className="mt-3 space-y-1 text-[13px] leading-relaxed text-[color:var(--meta)]">
                        {m.reasons.map((r, i) => (
                          <li key={i}>· {r}</li>
                        ))}
                      </ul>

                      {/* 破冰话题：赛道要求"让讨论更容易开始" */}
                      <div className="note-block mt-3">
                        <p className="flex items-center gap-1.5 text-[color:var(--ink-2)]">
                          <IconChat size={14} />
                          <b>可以这样开场</b>
                        </p>
                        <p className="mt-1.5">{m.icebreaker}</p>
                        <button
                          onClick={() => {
                            void copyText(m.icebreaker);
                            setCopied(m.profile.userKey);
                            setTimeout(() => setCopied(""), 1600);
                          }}
                          className="btn btn-soft mt-2 !h-[28px] !px-3 !text-xs"
                        >
                          {copied === m.profile.userKey ? "已复制" : "复制开场白"}
                        </button>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <Link href="/match" className="btn btn-outline">
                          <IconMask size={14} /> 找 TA 开一局
                        </Link>
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* 共同可答的问题：来自知乎开放平台「问题推荐 API」 */}
            {questions.length > 0 && (
              <>
                <h2 className="section-label mt-6">可以一起回答的问题</h2>
                <section className="card">
                  <div className="card-section">
                    <p className="text-[13px] leading-relaxed text-[color:var(--meta)]">
                      {questionSeed
                        ? `围绕你们共同关注的「${questionSeed}」，知乎推荐了这些问题：`
                        : "根据你的画像，知乎推荐了这些适合你回答的问题："}
                    </p>
                    <div className="mt-3 space-y-2">
                      {questions.map((q) => (
                        <a
                          key={q.Url}
                          href={q.Url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 rounded p-2 transition hover:bg-[color:var(--frame)]"
                        >
                          <span className="mt-[3px] shrink-0 text-[color:var(--action)]">
                            <IconChat size={14} />
                          </span>
                          <span className="min-w-0 flex-1 text-[14px] leading-[22px] text-[color:var(--ink)]">
                            {q.Title}
                          </span>
                        </a>
                      ))}
                    </div>
                    <p className="mt-3 text-[13px] text-[color:var(--time)]">
                      内容来自知乎开放平台问题推荐 API，点击可在知乎打开原问题。
                    </p>
                  </div>
                </section>
              </>
            )}

            <p className="mt-5 text-[13px] leading-relaxed text-[color:var(--time)]">
              匹配只看已经发生的行为，不使用任何问卷或自填标签。
              判断倾向相反的人会被适度加权——如果只推荐和你想法一样的人，讨论就没意思了。
            </p>
          </>
        )}
      </SidebarPage>
      <MobileDock />
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "brand" }) {
  return (
    <div>
      <p className="text-xs text-[color:var(--time)]">{label}</p>
      <p className={`tnum mt-1 text-xl font-semibold ${tone === "brand" ? "text-[color:var(--zhihu)]" : ""}`}>
        {value}
      </p>
    </div>
  );
}
