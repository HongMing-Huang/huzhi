// 知乎站内搜索：真实社区内容作为「真人池」素材。
// 固定官方域名 + env 凭证，30 分钟缓存（接口限额 5000 次/天）。

export interface ZhihuSearchItem {
  title: string;
  excerpt: string;
  url: string;
  authorName: string;
  votes: number;
  comments: number;
}

const ENDPOINT = "https://developer.zhihu.com/api/v1/content/zhihu_search";
const CACHE_MS = 30 * 60 * 1000;

const cache = new Map<string, { at: number; items: ZhihuSearchItem[] }>();

function stripEm(s: string): string {
  return s.replace(/<\/?em>/g, "");
}

export function hasSearchCredential(): boolean {
  return Boolean(process.env.ZHIHU_ACCESS_SECRET);
}

export async function searchZhihu(query: string, count = 5): Promise<ZhihuSearchItem[]> {
  const key = `${query}|${count}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;

  const secret = process.env.ZHIHU_ACCESS_SECRET;
  if (!secret) return [];

  try {
    const url = `${ENDPOINT}?Query=${encodeURIComponent(query)}&Count=${Math.min(20, Math.max(1, count))}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`search http ${res.status}`);
    const data = (await res.json()) as {
      Code?: number;
      Data?: { Items?: Array<{ Title: string; ContentText: string; Url: string; AuthorName: string; VoteUpCount: number; CommentCount: number }> };
    };
    const items = (data.Data?.Items ?? []).map((it) => ({
      title: stripEm(it.Title).replace(/\s*-\s*知乎$/, ""),
      excerpt: stripEm(it.ContentText),
      url: it.Url,
      authorName: it.AuthorName || "知乎用户",
      votes: it.VoteUpCount,
      comments: it.CommentCount,
    }));
    cache.set(key, { at: Date.now(), items });
    return items;
  } catch {
    return [];
  }
}
