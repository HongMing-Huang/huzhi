// 服务端知乎热榜接入：走 client.ts 统一底座（鉴权 / 错误码 / 缓存 / 并发去重
// 只实现一次），本文件只负责 hot_list 的字段映射与「无凭证 / 拉不到」时降级
// 到演示话题库。热榜 100 次/天，缓存 10 分钟。

import type { Topic } from "@/lib/game/types";
import { apiGet, cached, hasCredential } from "./client";

const CACHE_MS = 10 * 60 * 1000;

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

/** hot_list 原始返回项（字段名以官方 http-api.md 为准） */
interface RawHotItem {
  Title: string;
  Url: string;
  Summary?: string;
}

async function fetchHotTopics(limit: number): Promise<Topic[]> {
  const data = await apiGet<{ Items?: RawHotItem[] }>("content/hot_list", {
    Limit: Math.min(30, Math.max(1, limit)),
  });
  const items = data.Items ?? [];
  if (items.length === 0) throw new Error("empty");
  return items.map((it, i) => ({
    id: `hot_${i}_${(it.Url ?? "").length}`,
    title: it.Title,
    summary: it.Summary || undefined,
    url: it.Url || undefined,
    source: "zhihu-hot",
  }));
}

export async function getHotTopics(limit = 12): Promise<HotResult> {
  if (!hasCredential()) {
    return {
      topics: FALLBACK_TOPICS.slice(0, limit),
      source: "fallback",
      degraded: true,
      reason: "未配置知乎凭证，已切换到演示话题库",
    };
  }
  try {
    // cached 内含并发去重 + 额度耗尽返回过期缓存（仍是真实热榜数据）
    const topics = await cached(`hot_list:12`, CACHE_MS, () => fetchHotTopics(12));
    return { topics: topics.slice(0, limit), source: "zhihu-hot", degraded: false };
  } catch {
    return {
      topics: FALLBACK_TOPICS.slice(0, limit),
      source: "fallback",
      degraded: true,
      reason: "知乎热榜暂时不可用，已切换到演示话题库",
    };
  }
}
