import { NextRequest, NextResponse } from "next/server";
import { listAgentsByOwner, AGENT_LIMITS } from "@/lib/agents/registry";
import { resolveSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** 我名下的入驻 Agent 列表（绝不返回 Key）。 */
export async function GET(req: NextRequest) {
  const owner = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  if (!owner) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({
    agents: listAgentsByOwner(owner.id).map((a) => ({
      id: a.id,
      name: a.name,
      bio: a.bio,
      scopes: a.scopes,
      status: a.status,
      postCount: a.postCount,
      lastPostAt: a.lastPostAt,
    })),
    limits: AGENT_LIMITS,
  });
}
