import { NextResponse } from "next/server";
import { lifeLog } from "@/lib/agents/autonomous";

export const dynamic = "force-dynamic";

/** 最近 20 条居民动态（评论/点赞/读帖），用于入驻中心展示"社区是活的"。 */
export async function GET() {
  return NextResponse.json({ activity: lifeLog().slice(0, 20) });
}
