import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/game/store";
import { analyzeMessages } from "@/lib/agents/detective-assist";
import { suggestDisguise } from "@/lib/agents/disguise-assist";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** 辅助 Agent：disguise=伪装参考（3条，须手改）；detective=特征线索（不给结论）。 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = store.get(id);
  if (!room) return NextResponse.json({ error: "房间不存在或已过期" }, { status: 404 });

  let body: { pid?: string; kind?: string; draft?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const me = room.players.find((p) => p.id === body.pid);
  if (!me) return NextResponse.json({ error: "身份校验失败" }, { status: 403 });

  // 对称化（game-design-v2 §4.3）：kind=auto 时由服务端按请求者身份分流，
  // 客户端只有同一个「辅助」按钮——按钮的存在不再暴露谁是伪装者。
  const kind =
    body.kind === "auto" || !body.kind ? (me.identity === "disguised" ? "disguise" : "detective") : body.kind;

  if (kind === "detective") {
    const opp = room.players.find((p) => p.id !== me.id)!;
    const msgs = room.messages.filter((m) => m.from === opp.id);
    if (msgs.length === 0) return NextResponse.json({ clues: [], note: "对方还没发言，暂无线索" });
    return NextResponse.json({ clues: analyzeMessages(msgs) });
  }

  if (kind === "disguise") {
    const draft = (body.draft ?? "").trim().slice(0, 300);
    if (!draft) return NextResponse.json({ error: "先写点草稿再请求伪装参考" }, { status: 400 });
    const personaId = me.personaId ?? "answerer";
    const result = await suggestDisguise(draft, room.topic.title, personaId, room.round);
    return NextResponse.json({
      suggestions: result.suggestions,
      note: "仅供参考，必须手动改写后发送（禁止一键复制）",
      source: result.source,
    });
  }

  return NextResponse.json({ error: "未知的辅助类型" }, { status: 400 });
}
