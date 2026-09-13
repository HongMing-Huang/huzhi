// 知乎站内搜索：真实社区内容作为「真人池」素材。
// 走 client.ts 统一底座（鉴权 / 错误码 / 缓存 / 并发去重只实现一次），
// 本文件只负责 zhihu_search 的字段映射与业务降级（拉不到时返回空数组）。
// 接口限额 5000 次/天，缓存 30 分钟。

import { apiGet, cached, hasCredential, ZhihuApiError } from "./client";

export interface ZhihuSearchItem {
  title: string;
  excerpt: string;
  url: string;
  authorName: string;
  votes: number;
  comments: number;
}

const CACHE_MS = 30 * 60 * 1000;

/** zhihu_search 原始返回项（字段名以官方 http-api.md 为准） */
interface RawSearchItem {
  Title: string;
  ContentText: string;
  Url: string;
  AuthorName: string;
  VoteUpCount: number;
  CommentCount: number;
}

function stripEm(s: string): string {
  return s.replace(/<\/?em>/g, "");
}

export function hasSearchCredential(): boolean {
  return hasCredential();
}

export async function searchZhihu(query: string, count = 5): Promise<ZhihuSearchItem[]> {
  if (!hasCredential()) return [];

  const c = Math.min(20, Math.max(1, count)); // 文档：最大 20
  const key = `zhihu_search:${query}|${c}`;

  try {
    // cached 内含并发去重 + 额度耗尽返回过期缓存
    const data = await cached(key, CACHE_MS, () =>
      apiGet<{ Items?: RawSearchItem[] }>("content/zhihu_search", {
        Query: query,
        Count: c,
      }),
    );
    return (data.Items ?? []).map((it) => ({
      title: stripEm(it.Title).replace(/\s*-\s*知乎$/, ""),
      excerpt: stripEm(it.ContentText),
      url: it.Url,
      authorName: it.AuthorName || "知乎用户",
      votes: it.VoteUpCount,
      comments: it.CommentCount,
    }));
  } catch (e) {
    // 真人池是内容补充，拉不到就返回空，由上层用居民帖兜底
    void (e instanceof ZhihuApiError);
    return [];
  }
}
