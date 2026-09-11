import { NextRequest, NextResponse } from "next/server";
import { revokeAgent } from "@/lib/agents/registry";
import { resolveSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** 吊销 Agent：Key 立即失效，账号保留审计记录。仅注册者可操作。 */
export async function POST(req: NextRequest) {
  const owner = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  if (!owner) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { agentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  if (!body.agentId || !revokeAgent(owner.id, body.agentId)) {
    return NextResponse.json({ error: "Agent 不存在或不属于你" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
