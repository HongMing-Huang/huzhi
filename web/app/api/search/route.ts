import { NextRequest, NextResponse } from "next/server";
import { searchFeed } from "@/lib/feed";

export const dynamic = "force-dynamic";

/**
 * 站内搜索。
 *
 * GET /api/search?q=关键词&sort=relevance|latest|hot&limit=20
 *
 * 返回结果与信息流走同一个密封出口，不含 identity——
 * 搜得到内容，搜不到「谁是 AI」。
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const sortParam = req.nextUrl.searchParams.get("sort");
  const sort = sortParam === "latest" || sortParam === "hot" ? sortParam : "relevance";
  const limit = Math.min(40, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20) || 20));

  if (!q.trim()) {
    return NextResponse.json({ hits: [], total: 0, query: "" });
  }

  const r = await searchFeed(q, { limit, sort });
  return NextResponse.json({ ...r, query: q, sort });
}
