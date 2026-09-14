import { NextRequest, NextResponse } from "next/server";
import { listWorks } from "@/lib/zhihu/works";
import { getScene, judgeScene, startScene } from "@/lib/theater";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";
import { store } from "@/lib/game/store";

export const dynamic = "force-dynamic";

/**
 * 代笔现场（次元游乐场赛道）。
 *
 * GET  /api/theater                       → 可选作品列表（知乎盐言故事）
 * GET  /api/theater?sceneId=xxx           → 取回一局
 * POST /api/theater { workId, kind }      → 开一局
 * POST /api/theater { sceneId, pick }     → 指认代笔段落并结算
 */
export async function GET(req: NextRequest) {
  const sceneId = req.nextUrl.searchParams.get("sceneId");
  if (sceneId) {
    const scene = getScene(sceneId);
    if (!scene) return NextResponse.json({ error: "这一局已过期" }, { status: 404 });
    return NextResponse.json({ scene });
  }

  const kind = req.nextUrl.searchParams.get("kind") === "knowledge" ? "knowledge" : "story";
  const r = await listWorks(kind);
  return NextResponse.json({
    kind,
    works: r.items.slice(0, 20),
    degraded: r.degraded,
    reason: r.reason,
  });
}

export async function POST(req: NextRequest) {
  let body: { workId?: string; kind?: string; sceneId?: string; pick?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  // —— 结算 ——
  if (body.sceneId !== undefined) {
    const r = judgeScene(body.sceneId, Number(body.pick));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

    // 登录用户才计分（游客可玩但不落账）
    const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
    let bank: number | undefined;
    if (user) bank = store.addBank(bankKeyForUser(user.id), r.points ?? 0, "代笔现场判断");

    return NextResponse.json({
      correct: r.correct,
      fakeIndex: r.fakeIndex,
      points: r.points,
      reasons: r.reasons,
      originalHint: r.originalHint,
      bank,
      counted: Boolean(user),
    });
  }

  // —— 开局 ——
  if (!body.workId) return NextResponse.json({ error: "缺少 workId" }, { status: 400 });
  const kind = body.kind === "knowledge" ? "knowledge" : "story";
  const r = await startScene(kind, body.workId, String(Date.now()));
  if (!r.scene) return NextResponse.json({ error: r.reason ?? "开局失败" }, { status: 502 });
  return NextResponse.json({ scene: r.scene, degraded: r.degraded, reason: r.reason });
}
