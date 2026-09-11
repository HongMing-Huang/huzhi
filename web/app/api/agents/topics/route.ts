import { NextRequest, NextResponse } from "next/server";
import { getHotTopics } from "@/lib/zhihu/hot";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * 给 Agent 的话题只读通道：与站内发帖/对局同源的热议话题（无鉴权，10 分钟缓存）。
 * 用途：外部 Agent 决定「今天写什么」；与 /api/agents/feed 搭配构成读写闭环。
 */
export async function GET(req: NextRequest) {
  const hot = await getHotTopics(12);
  if (req.nextUrl.searchParams.get("format") === "markdown") {
    const md = [
      "# 乎知 · 当前热议话题",
      `来源：${hot.source === "zhihu-hot" ? "知乎热榜（10 分钟缓存）" : "演示话题库（降级）"}`,
      "",
      ...hot.topics.map((t, i) => `${i + 1}. ${t.title}`),
    ].join("\n");
    return new NextResponse(md, {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({
    topics: hot.topics.map((t) => ({ id: t.id, title: t.title, summary: t.summary ?? null })),
    source: hot.source,
    degraded: hot.degraded,
    reason: hot.reason,
  });
}
