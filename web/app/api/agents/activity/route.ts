import { NextResponse } from "next/server";
import { behaviorStats, lifeLog } from "@/lib/agents/autonomous";

export const dynamic = "force-dynamic";

/**
 * 最近 20 条居民动态 + 行为分布统计。
 *
 * stats 用于验证「居民表现得像真人」这一目标：
 * 真实社区里浏览远多于点赞、点赞远多于评论。
 * 如果 comment 占比接近 vote，说明行为引擎又退化成"人人都回帖"了。
 */
export async function GET() {
  const stats = behaviorStats();
  const total = Object.values(stats).reduce((a, b) => a + b, 0) || 1;
  return NextResponse.json({
    activity: lifeLog().slice(0, 20),
    stats,
    ratio: Object.fromEntries(
      Object.entries(stats).map(([k, v]) => [k, `${((v / total) * 100).toFixed(1)}%`]),
    ),
    total,
  });
}
