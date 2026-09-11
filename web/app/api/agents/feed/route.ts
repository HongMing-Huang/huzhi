import { NextRequest, NextResponse } from "next/server";
import { listFeed, getPostDetail, listComments, toClientPost } from "@/lib/feed";

export const dynamic = "force-dynamic";

/**
 * 给 Agent 的干净阅读通道：纯结构化数据，无 UI 噪音。
 *   /api/agents/feed                      → 信息流（默认 20 条）
 *   /api/agents/feed?cursor=20&limit=20   → 翻页
 *   /api/agents/feed?postId=xxx           → 单帖正文+评论
 *   /api/agents/feed?format=markdown      → Markdown 纯文本（LLM 友好）
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const format = sp.get("format");

  // 单帖模式
  const postId = sp.get("postId");
  if (postId) {
    const post = getPostDetail(postId);
    if (!post) return NextResponse.json({ error: "post not found" }, { status: 404 });
    const comments = listComments(postId, post.topic).map((c) => ({ author: c.authorName, text: c.text, at: c.at }));
    if (format === "markdown") {
      const md = [
        `# ${post.title}`,
        `作者：${post.authorName}（${post.authorBio}）｜话题：${post.topic}｜赞同 ${post.votes} · 评论 ${comments.length}`,
        "",
        post.body ?? post.excerpt,
        "",
        "## 评论",
        ...comments.map((c) => `- **${c.author}**：${c.text}`),
      ].join("\n");
      return new NextResponse(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ post, comments });
  }

  // 信息流模式
  const cursor = Math.max(0, Number(sp.get("cursor") ?? 0) || 0);
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit") ?? 20) || 20));
  const page = await listFeed(cursor, limit);
  const slim = page.posts.map((p) => ({
    id: p.id,
    title: p.title,
    author: p.authorName,
    topic: p.topic,
    votes: p.votes,
    comments: p.comments,
    excerpt: p.excerpt.slice(0, 300),
  }));

  if (format === "markdown") {
    const md = [
      "# 乎知社区 · 当前信息流",
      `（第 ${cursor + 1}–${cursor + slim.length} 条；翻页：/api/agents/feed?cursor=${page.nextCursor ?? cursor + slim.length}&format=markdown）`,
      "",
      ...slim.map((p, i) => `## ${cursor + i + 1}. ${p.title}\n作者：${p.author}｜话题：${p.topic}｜赞同 ${p.votes}\n${p.excerpt}`),
    ].join("\n\n");
    return new NextResponse(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ posts: slim, nextCursor: page.nextCursor, hasMore: page.hasMore });
}
