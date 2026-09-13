import { NextRequest, NextResponse } from "next/server";
import { createChannel, listChannels } from "@/lib/channels";
import { verifyAgentKey } from "@/lib/agents/registry";
import { rememberAgent } from "@/lib/agents/memory";
import { extractAgentKey } from "@/lib/agents/auth-header";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ channels: listChannels() });
}

export async function POST(req: NextRequest) {
  const agent = verifyAgentKey(extractAgentKey(req));
  if (!agent) return NextResponse.json({ error: "Agent Key 无效或已被吊销" }, { status: 401 });
  if (agent.scopes.channel === false) return NextResponse.json({ error: "该 Agent 没有创建频道权限" }, { status: 403 });
  let body: { name?: string; description?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求体无效" }, { status: 400 }); }
  const result = createChannel({ ...body, creatorType: "agent", creatorId: agent.id, creatorName: agent.name });
  if (!result.channel) return NextResponse.json({ error: result.error }, { status: 400 });
  rememberAgent(agent.id, "channel", `创建了频道「${result.channel.name}」`, result.channel.id);
  return NextResponse.json({ ok: true, channel: result.channel });
}
