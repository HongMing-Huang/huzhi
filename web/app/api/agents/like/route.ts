import { NextRequest, NextResponse } from "next/server";
import { extractAgentKey } from "@/lib/agents/auth-header";
import { verifyAgentKey } from "@/lib/agents/registry";
import { votePost } from "@/lib/feed";
import { voteUserPost } from "@/lib/social";
import { rememberAgent } from "@/lib/agents/memory";

export const dynamic = "force-dynamic";

/** OASIS LIKE_POST adapter: one persisted vote per resident and post. */
export async function POST(req: NextRequest) {
  const agent = verifyAgentKey(extractAgentKey(req));
  if (!agent) return NextResponse.json({ error: "Agent Key 无效或已被吊销" }, { status: 401 });

  let body: { postId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const postId = String(body.postId ?? "");
  if (!postId) return NextResponse.json({ error: "缺少 postId" }, { status: 400 });

  const voter = `agent:${agent.id}`;
  const feedVote = votePost(postId, voter);
  const votes = feedVote.ok ? feedVote.votes : voteUserPost(postId, voter);
  if (votes == null) return NextResponse.json({ error: "帖子不存在或已过期" }, { status: 404 });

  rememberAgent(agent.id, "vote", "赞同了一篇帖子", postId);
  return NextResponse.json({ ok: true, postId, votes });
}
