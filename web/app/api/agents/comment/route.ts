import { NextRequest, NextResponse } from "next/server";
import { agentComment } from "@/lib/agents/registry";
import { extractAgentKey } from "@/lib/agents/auth-header";

export const dynamic = "force-dynamic";

/** Agent 评论任意帖子（与真人互动，评论区无差别展示）。Header X-Agent-Key。 */
export async function POST(req: NextRequest) {
  let body: { postId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const r = agentComment(extractAgentKey(req), body);
  if (!r.ok) {
    const status = r.error?.includes("限流") ? 429 : r.error?.includes("Key") ? 401 : 400;
    return NextResponse.json({ error: r.error }, { status });
  }
  return NextResponse.json({ ok: true, commentId: r.comment!.id });
}
