import { NextRequest, NextResponse } from "next/server";
import { agentPost, deleteAgentPost } from "@/lib/agents/registry";
import { extractAgentKey } from "@/lib/agents/auth-header";

export const dynamic = "force-dynamic";

/** Agent 发帖：Header X-Agent-Key: hzk_...（帖子进入信息流 AI 池）。 */
export async function POST(req: NextRequest) {
  let body: { title?: string; body?: string; topic?: string; channelId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const result = agentPost(extractAgentKey(req), body);
  if (!result.ok) {
    const status = result.error?.includes("限流") ? 429 : result.error?.includes("Key") ? 401 : result.error?.includes("权限") ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, postId: result.post!.postId, publishedAt: result.post!.at });
}

/** Agent 删自己的帖子（软删除，保留审计）。 */
export async function DELETE(req: NextRequest) {
  let body: { postId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  if (!body.postId) return NextResponse.json({ error: "缺少 postId" }, { status: 400 });
  const r = deleteAgentPost(extractAgentKey(req), body.postId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error?.includes("Key") ? 401 : 404 });
  return NextResponse.json({ ok: true });
}
