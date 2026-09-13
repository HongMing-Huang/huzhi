"use client";

// 代笔现场 /theater（次元游乐场赛道）
//
// 读一段真实的知乎盐言故事，其中有一段不是原作者写的——找出它。
// 与信息流"整篇猜身份"不同，这里是段落级定位，且有同作者同上下文作对照组。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader, MobileDock, PageFrame } from "@/components/AppChrome";
import KanshanSays from "@/components/KanshanSays";
import { IconEye } from "@/components/Icons";

interface Work {
  workId: string;
  title: string;
  description?: string;
  labels: string[];
}

interface Scene {
  sceneId: string;
  title: string;
  authorName: string;
  authorAvatar?: string;
  labels: string[];
  introduction: string;
  paragraphs: string[];
  sourceNote: string;
}

interface Verdict {
  correct: boolean;
  fakeIndex: number;
  points: number;
  reasons: string[];
  originalHint: string;
  bank?: number;
  counted: boolean;
}

export default function TheaterPage() {
  const [works, setWorks] = useState<Work[]>([]);
  const [scene, setScene] = useState<Scene | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadWorks = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/theater").then((r) => r.json());
      setWorks(d.works ?? []);
      if (d.degraded && d.reason) setErr(d.reason);
    } catch {
      setErr("内容服务暂时没响应");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorks();
  }, [loadWorks]);

  async function start(workId: string) {
    if (busy) return;
    setBusy(true);
    setErr("");
    setVerdict(null);
    setPicked(null);
    try {
      const res = await fetch("/api/theater", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workId, kind: "story" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "开局失败");
      setScene(d.scene);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "开局失败");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (picked === null || !scene || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/theater", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId: scene.sceneId, pick: picked }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "结算失败");
      setVerdict(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "结算失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader title="代笔现场" />
      <PageFrame>
        <section className="page-lead pt-1">
          <p className="page-kicker">次元游乐场 · 取材自知乎盐言故事</p>
          <h1 className="page-title">这段，不是作者写的</h1>
          <p className="page-summary">
            下面是一篇真实故事的连续片段，其中恰好有一段由系统模仿文风续写。找出它。
          </p>
        </section>

        {err && <p className="card mt-3 px-4 py-2.5 text-[13px] text-[color:var(--gold)]">{err}</p>}

        {/* —— 选作品 —— */}
        {!scene && (
          <div className="mt-4">
            <KanshanSays scene="guide" seed="theater-guide" className="card p-4" />
            {loading ? (
              <div className="mt-3 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-20 w-full" />
                ))}
              </div>
            ) : (
              <div className="mt-3 divide-y divide-[color:var(--divider)]">
                {works.map((w) => (
                  <article key={w.workId} className="feed-item">
                    <h2 className="item-title">{w.title}</h2>
                    {w.description && (
                      <p className="clamp-2 mb-[4px] mt-[9px] text-[15px] leading-[25.05px] text-[color:var(--meta)]">
                        {w.description}
                      </p>
                    )}
                    <div className="content-actions">
                      {w.labels.slice(0, 3).map((l) => (
                        <span key={l} className="tag-pill mr-2">{l}</span>
                      ))}
                      <button onClick={() => start(w.workId)} disabled={busy} className="btn btn-primary ml-auto">
                        开一局
                      </button>
                    </div>
                  </article>
                ))}
                {!works.length && (
                  <div className="empty-stage">
                    <p>暂时取不到故事内容。</p>
                    <button onClick={loadWorks} className="btn btn-outline">重试</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* —— 对局 —— */}
        {scene && (
          <div className="mt-4">
            <section className="card">
              <div className="card-section">
                <div className="flex items-center gap-3">
                  {scene.authorAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={scene.authorAvatar} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <span className="avatar h-10 w-10 text-base" style={{ background: "linear-gradient(135deg,#1772f6,#18afff)" }}>
                      {scene.authorName.slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold text-[color:var(--ink)]">{scene.title}</p>
                    <p className="mt-0.5 text-[13px] text-[color:var(--time)]">作者 {scene.authorName} · 知乎盐言故事</p>
                  </div>
                </div>
                {scene.introduction && (
                  <p className="mt-3 text-[13px] leading-relaxed text-[color:var(--meta)]">{scene.introduction}</p>
                )}
              </div>
            </section>

            <p className="mt-4 text-[13px] text-[color:var(--time)]">
              点选你认为是代笔的那一段：
            </p>

            <div className="mt-2 space-y-2">
              {scene.paragraphs.map((p, i) => {
                const isFake = verdict && verdict.fakeIndex === i;
                const isPicked = picked === i;
                return (
                  <button
                    key={i}
                    onClick={() => !verdict && setPicked(i)}
                    disabled={Boolean(verdict)}
                    data-state={verdict ? (isFake ? "fake" : isPicked ? "miss" : "plain") : isPicked ? "picked" : "plain"}
                    className="para-row"
                  >
                    <span className="para-index">{i + 1}</span>
                    <span className="para-text">{p}</span>
                    {isFake && <span className="tag-pill shrink-0" data-tone="hot">代笔</span>}
                  </button>
                );
              })}
            </div>

            {!verdict && (
              <div className="mt-4 flex items-center gap-3">
                <button onClick={submit} disabled={picked === null || busy} className="btn btn-primary">
                  <IconEye size={14} /> 就是这一段
                </button>
                <button onClick={() => { setScene(null); setPicked(null); }} className="btn btn-plain">
                  换一篇
                </button>
              </div>
            )}

            {verdict && (
              <section className="fade-up mt-4 space-y-3">
                <div className="card p-4">
                  <div className="flex items-center gap-2">
                    <span className="result-pill" data-correct={verdict.correct}>
                      {verdict.correct ? "✓ 找到了" : "✗ 没找对"}
                      <b className="tnum">{verdict.points >= 0 ? "+" : ""}{verdict.points}</b>
                    </span>
                    {!verdict.counted && (
                      <span className="text-[13px] text-[color:var(--time)]">游客模式，本局不计入账号积分</span>
                    )}
                  </div>
                  <ul className="note-block mt-3 list-disc space-y-1 pl-4">
                    {verdict.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[13px] leading-relaxed text-[color:var(--time)]">{verdict.originalHint}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setScene(null); setPicked(null); setVerdict(null); }} className="btn btn-primary">
                    再来一篇
                  </button>
                  <Link href="/" className="btn btn-plain">回社区</Link>
                </div>
              </section>
            )}

            <p className="mt-5 border-t border-[color:var(--divider)] pt-3 text-[13px] leading-relaxed text-[color:var(--time)]">
              {scene.sourceNote}
            </p>
          </div>
        )}
      </PageFrame>
      <MobileDock />
    </>
  );
}
