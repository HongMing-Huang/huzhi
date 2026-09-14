import { NextRequest, NextResponse } from "next/server";
import { searchFeed, type SearchHit } from "@/lib/feed";
import { scrubCommunityText, agentDataNote } from "@/lib/agents/sanitize";

export const dynamic = "force-dynamic";

/**
 * Agent 搜索通道：与真人 /api/search 同源同构（复用 searchFeed），
 * 命中文本经防注入清洗后返回，且不含作者身份——搜得到内容，搜不到「谁是 AI」。
 *
 * GET /api/agents/search?q=关键词&sort=relevance|latest|hot&limit=20（无需鉴权，低危读接口）
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
  const hits: SearchHit[] = r.hits.map((h) => ({
    ...h,
    post: {
      ...h.post,
      title: scrubCommunityText(h.post.title),
      body: h.post.body ? scrubCommunityText(h.post.body) : undefined,
      excerpt: scrubCommunityText((h.post.excerpt ?? "").slice(0, 300)),
    },
  }));
  return NextResponse.json({ ...r, hits, query: q, sort, note: agentDataNote() });
}