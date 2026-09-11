// 服务端知乎热榜接入：固定官方域名 + Bearer（env），失败/无凭证降级到演示话题库。
// 安全约束：唯一出站 URL 是常量 https://developer.zhihu.com/api/v1/content/hot_list，
// 不接受任何用户可控 URL。

import type { Topic } from "@/lib/game/types";

const HOT_ENDPOINT = "https://developer.zhihu.com/api/v1/content/hot_list";
const CACHE_MS = 10 * 60 * 1000;

let cache: { at: number; topics: Topic[] } | null = null;
let inFlight: Promise<HotResult> | null = null;

export const FALLBACK_TOPICS: Topic[] = [
  { id: "fb1", title: "iPhone Duo 和多邻国 Duo 谁更 Duo？", source: "fallback", summary: "演示话题：两只 Duo 的巅峰对决" },
  { id: "fb2", title: "为什么年轻人开始流行把 AI 当搭子？", source: "fallback" },
  { id: "fb3", title: "「已读乱回」是社交礼仪还是态度问题？", source: "fallback" },
  { id: "fb4", title: "第一次参加黑客松是种什么体验？", source: "fallback" },
  { id: "fb5", title: "如何证明你妈不是一台 AI？", source: "fallback" },
  { id: "fb6", title: "打工人的精神状态是否已经领先版本？", source: "fallback" },
  { id: "fb7", title: "如果狼人杀全员换成 AI 会发生什么？", source: "fallback" },
  { id: "fb8", title: "有哪些一眼真、细看假的消息？", source: "fallback" },
];

export interface HotResult {
  topics: Topic[];
  source: "zhihu-hot" | "fallback";
  degraded: boolean;
  reason?: string;
}

export async function getHotTopics(limit = 12): Promise<HotResult> {
  const secret = process.env.ZHIHU_ACCESS_SECRET;
  if (!secret) {
    return { topics: FALLBACK_TOPICS.slice(0, limit), source: "fallback", degraded: true, reason: "未配置知乎凭证，已切换到演示话题库" };
  }
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return { topics: cache.topics.slice(0, limit), source: "zhihu-hot", degraded: false };
  }
  // 并发去重：同一时刻只发一次真实请求（热榜 100 次/天，省着用）
  if (inFlight) return inFlight;
  inFlight = fetchHot(limit).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function fetchHot(limit: number): Promise<HotResult> {
  const secret = process.env.ZHIHU_ACCESS_SECRET!;
  try {
    const url = `${HOT_ENDPOINT}?Limit=${Math.min(30, Math.max(1, limit))}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = (await res.json()) as {
      Code?: number;
      Data?: { Items?: { Title: string; Url: string; Summary?: string }[] };
    };
    const items = data.Data?.Items ?? [];
    if (data.Code !== 0 || items.length === 0) throw new Error("empty");
    const topics: Topic[] = items.map((it, i) => ({
      id: `hot_${i}_${it.Url.length}`,
      title: it.Title,
      summary: it.Summary || undefined,
      url: it.Url || undefined,
      source: "zhihu-hot",
    }));
    cache = { at: Date.now(), topics };
    return { topics: topics.slice(0, limit), source: "zhihu-hot", degraded: false };
  } catch {
    // 拉取失败：有过期缓存就先用旧的（仍是真实数据），否则退到演示话题库
    if (cache) {
      return { topics: cache.topics.slice(0, limit), source: "zhihu-hot", degraded: false };
    }
    return { topics: FALLBACK_TOPICS.slice(0, limit), source: "fallback", degraded: true, reason: "知乎热榜暂时不可用，已切换到演示话题库" };
  }
}
