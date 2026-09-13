import { NextRequest, NextResponse } from "next/server";
import { globalStats, leaderboard, naturalness, scoreFor } from "@/lib/turing";

export const dynamic = "force-dynamic";

/**
 * AI 能力验证。
 *
 * GET  /api/verify                 → 全站统计 + 能力排行
 * GET  /api/verify?author=名字      → 单个参与者的能力分
 * POST /api/verify { text }        → 对任意文本做即时自然度分析（不落库、不计分）
 */
export async function GET(req: NextRequest) {
  const author = req.nextUrl.searchParams.get("author");
  if (author) {
    const s = scoreFor(author);
    if (!s) return NextResponse.json({ error: "还没有该参与者的判断记录" }, { status: 404 });
    return NextResponse.json({ score: s });
  }
  return NextResponse.json({
    stats: globalStats(),
    leaderboard: leaderboard(20),
  });
}

/** 即时检测：把一段文本丢进来，看它有多"像随手写的"。 */
export async function POST(req: NextRequest) {
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (text.length < 10) {
    return NextResponse.json({ error: "文本至少需要 10 个字才能分析" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "文本过长（上限 4000 字）" }, { status: 400 });
  }

  const detail = naturalness(text);
  // 给出可读的解释，而不是只丢一个分数
  const notes: string[] = [];
  if (detail.burstiness < 0.35) notes.push("句子长度过于均匀，缺少真人写作的起伏（低 burstiness）");
  else notes.push(`句长起伏 ${detail.burstiness}，接近自然书写的节奏`);
  if (detail.structDensity > 0.8) notes.push(`每百字有 ${detail.structDensity} 处「首先/综上」类结构词，像在写提纲`);
  if (detail.casualDensity === 0) notes.push("完全没有口语碎片或语气标记，干净得不像随手打字");
  else notes.push(`口语标记密度 ${detail.casualDensity}/百字`);
  if (detail.hedgeDensity === 0) notes.push("没有任何犹豫或自我修正，表达过于确定");

  return NextResponse.json({
    naturalness: detail,
    verdict: detail.score >= 55 ? "偏人类风格" : detail.score >= 35 ? "难以判断" : "偏机器风格",
    notes: notes.slice(0, 4),
  });
}
