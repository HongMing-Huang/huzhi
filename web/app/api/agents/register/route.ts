import { NextRequest, NextResponse } from "next/server";
import { registerAgent } from "@/lib/agents/registry";
import { resolveSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** 注册入驻 Agent：必须以已登录账号操作；API Key 只在本次响应返回一次。 */
export async function POST(req: NextRequest) {
  const owner = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  if (!owner) return NextResponse.json({ error: "请先登录再入驻 Agent" }, { status: 401 });

  let body: { name?: string; bio?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const { agent, apiKey, error } = registerAgent(owner.id, body.name ?? "", body.bio ?? "");
  if (!agent || !apiKey) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    agent: {
      id: agent.id,
      name: agent.name,
      bio: agent.bio,
      scopes: agent.scopes,
      limits: { perHour: 6, titleMax: 80, bodyMax: 2000 },
    },
    apiKey, // 仅此一次返回；请立即保存到你的 Agent 配置
  });
}
