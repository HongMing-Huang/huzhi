"use client";

// 站内搜索 /search
//
// 对齐知乎搜索页结构：顶部搜索框 → SubTab 排序切换 → 结果列表（含高亮与来源说明）。
// 玩法上的关键：搜索结果同样不泄露身份，每条都能直接发起判断。
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader, MobileDock, PageFrame } from "@/components/AppChrome";
import KanshanSays from "@/components/KanshanSays";
import { IconAgree, IconComment, IconEye, IconSearch } from "@/components/Icons";

interface Hit {
  post: {
    id: string;
    title: string;
    excerpt: string;
    authorName: string;
    authorBio: string;
    votes: number;
    comments: number;
    topic: string;
    at: number;
  };
  matchedIn: string[];
  score: number;
  judgedCount: number;
}

type Sort = "relevance" | "latest" | "hot";

const SORTS: { key: Sort; label: string }[] = [
  { key: "relevance", label: "综合排序" },
  { key: "latest", label: "最新" },
  { key: "hot", label: "最多赞同" },
];

const MATCH_LABEL: Record<string, string> = {
  title: "标题",
  body: "正文",
  author: "作者",
  topic: "话题",
};

function relTime(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

/** 把命中的关键词高亮出来（知乎搜索页同样做法） */
function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <em className="not-italic font-medium text-[color:var(--zhihu)]">{text.slice(i, i + q.length)}</em>
      {text.slice(i + q.length)}
    </>
  );
}

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";

  const [input, setInput] = useState(initialQ);
  const [query, setQuery] = useState(initialQ);
  const [sort, setSort] = useState<Sort>("relevance");
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const run = useCallback(async (q: string, s: Sort) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const d = await fetch(`/api/search?q=${encodeURIComponent(q)}&sort=${s}`).then((r) => r.json());
      setHits(d.hits ?? []);
      setTotal(d.total ?? 0);
    } catch {
      setHits([]);
      setTotal(0);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  useEffect(() => {
    if (initialQ) run(initialQ, "relevance");
  }, [initialQ, run]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setQuery(q);
    router.replace(`/search?q=${encodeURIComponent(q)}`);
    run(q, sort);
  }

  function changeSort(s: Sort) {
    setSort(s);
    if (query) run(query, s);
  }

  return (
    <>
      <AppHeader title="搜索" />
      <PageFrame>
        {/* 搜索框：官方聚焦渐变描边 */}
        <form onSubmit={submit} className="relative pt-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="搜索社区里的内容、作者或话题…"
            aria-label="站内搜索"
            className="search-input h-11 w-full rounded-full pl-5 pr-24 text-[15px] outline-none placeholder:text-[color:var(--time)]"
          />
          <button type="submit" className="btn btn-primary absolute right-1.5 top-[22px] !h-8 rounded-full">
            <IconSearch size={15} /> 搜索
          </button>
        </form>

        {!searched && (
          <div className="mt-5">
            <KanshanSays scene="guide" seed="search-guide" className="card p-4" />
            <p className="mt-4 text-[13px] leading-relaxed text-[color:var(--meta)]">
              提示：这里能搜到内容、作者和话题，但<b className="text-[color:var(--ink-2)]">搜不出谁是 AI</b>。
              身份只有在你亲自判断之后才会揭晓。
            </p>
          </div>
        )}

        {searched && (
          <>
            {/* 排序 SubTab：官方 .SearchSubTabs 规格 */}
            <div className="mt-4 flex items-center gap-2 border-b border-[color:var(--divider)] pb-3">
              {SORTS.map((s) => (
                <button key={s.key} onClick={() => changeSort(s.key)} data-active={sort === s.key} className="subtab">
                  {s.label}
                </button>
              ))}
              <span className="ml-auto text-[13px] text-[color:var(--time)]">
                找到 <b className="tnum text-[color:var(--ink-2)]">{total}</b> 条结果
              </span>
            </div>

            {loading && (
              <div className="space-y-4 py-6">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="skeleton h-5 w-3/5" />
                    <div className="skeleton h-4 w-full" />
                    <div className="skeleton h-4 w-4/5" />
                  </div>
                ))}
              </div>
            )}

            {!loading && hits.length === 0 && (
              <div className="empty-stage">
                <p>没有找到与「{query}」相关的内容。</p>
                <Link href="/" className="btn btn-outline">回信息流看看</Link>
              </div>
            )}

            {!loading && hits.length > 0 && (
              <div className="divide-y divide-[color:var(--divider)]">
                {hits.map((h) => (
                  <article key={h.post.id} className="feed-item">
                    <div className="item-meta flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-[color:var(--ink-2)]">{h.post.authorName}</span>
                      <span>·</span>
                      <span className="text-[14px] text-[color:var(--time)]">{relTime(h.post.at)}</span>
                      <span className="tag-pill !h-[20px] !px-1.5 !text-xs">{h.post.topic}</span>
                      {/* 只在标题未命中时才提示命中位置——三条标签恒定重复没有信息量 */}
                      {!h.matchedIn.includes("title") && h.matchedIn[0] && (
                        <span className="text-[13px] text-[color:var(--time)]">
                          命中{MATCH_LABEL[h.matchedIn[0]] ?? h.matchedIn[0]}
                        </span>
                      )}
                    </div>
                    <Link href={`/post/${h.post.id}`} className="mt-2 block">
                      <h2 className="item-title">{highlight(h.post.title, query)}</h2>
                    </Link>
                    <p className="clamp-2 mb-[4px] mt-[9px] text-[15px] leading-[25.05px] text-[color:var(--ink)]">
                      {highlight(h.post.excerpt, query)}
                    </p>
                    <div className="content-actions">
                      <span className="vote-button">
                        <IconAgree size={14} /> 赞同 <span className="tnum">{h.post.votes.toLocaleString("zh-CN")}</span>
                      </span>
                      <Link href={`/post/${h.post.id}`} className="content-action">
                        <IconComment size={14} /> <span className="tnum">{h.post.comments}</span> 条评论
                      </Link>
                      <Link href={`/post/${h.post.id}`} className="guess-opt ml-auto">
                        <IconEye size={13} className="mr-1 inline align-[-2px]" />
                        去判断
                        {h.judgedCount > 0 && (
                          <span className="ml-1 text-[color:var(--time)]">（{h.judgedCount} 人判过）</span>
                        )}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </PageFrame>
      <MobileDock />
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<PageFrame><div className="skeleton mt-6 h-11 w-full" /></PageFrame>}>
      <SearchInner />
    </Suspense>
  );
}
