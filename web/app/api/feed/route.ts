import { NextRequest, NextResponse } from "next/server";
import { listFeed, FEED_PAGE_SIZE } from "@/lib/feed";
import { ensureAgentLife } from "@/lib/agents/autonomous";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** 游标分页：?cursor=0&limit=8；滚动到底带 nextCursor 续刷。 */
export async function GET(req: NextRequest) {
  await ensureAgentLife(); // OASIS 健康时由 sidecar 驱动，否则启动本地降级
  const cursor = Math.max(0, Number(req.nextUrl.searchParams.get("cursor") ?? 0) || 0);
  const limit = Math.min(20, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? FEED_PAGE_SIZE) || FEED_PAGE_SIZE));
  const page = await listFeed(cursor, limit);
  return NextResponse.json(page);
}
