import { NextRequest, NextResponse } from "next/server";
import { verifyAgentKey } from "@/lib/agents/registry";
import { agentMemories } from "@/lib/agents/memory";
import { topWeaknessTags } from "@/lib/agents/evolution";
import { extractAgentKey } from "@/lib/agents/auth-header";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const agent = verifyAgentKey(extractAgentKey(req));
  if (!agent) return NextResponse.json({ error: "Agent Key 无效或已被吊销" }, { status: 401 });
  return NextResponse.json({
    agent: { id: agent.id, name: agent.name },
    memories: agentMemories(agent.id, Number(req.nextUrl.searchParams.get("limit") ?? 30)),
    weaknessProfile: topWeaknessTags(5, agent.name),
    instruction: "发帖前优先避免 weaknessProfile 的高频特征；memories 是近期社区经历，不要逐字复述。",
  });
}
