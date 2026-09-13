import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";
import { guessFeedPost, internalPostMeta } from "@/lib/feed";
import { isOwnPost } from "@/lib/social";
import { store } from "@/lib/game/store";
import { isIdentity } from "@/lib/game/types";
import { takeDoubleIfArmed } from "@/lib/social";
import { consensusFor, hasConsensusGuess, oddsFor, recordConsensusGuess, timingBonusFor } from "@/lib/feed/consensus";
import { recordJudgement } from "@/lib/turing";

export const dynamic = "force-dynamic";

/** feed 猜身份：登录用户记到账号筹码桌；支持双倍卡（下一次猜帖 ×2）；不能猜自己的帖子。 */
export async function POST(req: NextRequest) {
  let body: { uid?: string; postId?: string; guess?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  const bankKey = user ? bankKeyForUser(user.id) : `feed:${(body.uid ?? "").slice(0, 40)}`;
  if (!user && !body.uid) return NextResponse.json({ error: "缺少用户标识" }, { status: 400 });
  if (!body.postId || !isIdentity(body.guess)) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  if (isOwnPost(body.postId, bankKey)) {
    return NextResponse.json({ error: "不能猜自己发的帖子" }, { status: 400 });
  }
  if (hasConsensusGuess(body.postId, bankKey)) {
    return NextResponse.json({ error: "这篇已经判断过了，不能重复下注" }, { status: 409 });
  }

  const result = guessFeedPost(body.postId, body.guess as never);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });

  let points = result.points ?? 0;
  const market = Boolean(user);
  const odds = market ? oddsFor(body.postId, body.guess as "ai" | "human") : 1;
  const contrarianBonus = market && result.correct ? Math.round(10 * (odds - 1)) : 0;
  const timingBonus = market && result.correct ? timingBonusFor(body.postId) : 0;
  points += contrarianBonus + timingBonus;
  const doubled = takeDoubleIfArmed(bankKey);
  if (doubled) points *= 2;

  const meta = internalPostMeta(body.postId);
  recordConsensusGuess({
    postId: body.postId,
    userKey: bankKey,
    pick: body.guess as "ai" | "human",
    correct: result.correct === true,
    authorName: meta?.authorName ?? "未知作者",
    evoVersion: meta?.evoVersion,
    at: Date.now(),
  });

  // 记入能力评估：这条数据支撑 /verify 页面的 Turing Score 与全站识别率
  if (meta?.authorName && result.identityKind) {
    recordJudgement({
      postId: body.postId,
      authorName: meta.authorName,
      actor: result.identityKind === "agent" || result.identityKind === "agent_as_human" ? "agent" : "human",
      verdict: body.guess as "ai" | "human",
      correct: result.correct === true,
      at: Date.now(),
    });
  }

  const bank = store.addBank(bankKey, points);
  return NextResponse.json({
    correct: result.correct,
    identity: result.identity,
    // 四类身份：让前端能展示「真人（在伪装 AI）」这类真相，而不只是二选一
    identityKind: result.identityKind,
    disguised: result.disguised,
    truth: result.truth,
    points,
    doubled,
    bank,
    reasons: result.reasons,
    evoVersion: result.evoVersion,
    market,
    odds,
    contrarianBonus,
    timingBonus,
    consensus: consensusFor(body.postId),
    askReason: result.correct === true && result.identity === "ai", // 猜中 AI → 天择引擎弹「怎么看出来的」
  });
}

export async function GET(req: NextRequest) {
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  const bankKey = user ? bankKeyForUser(user.id) : `feed:${req.nextUrl.searchParams.get("uid")?.slice(0, 40)}`;
  if (!user && !bankKey.startsWith("feed:")) {
    return NextResponse.json({ error: "缺少用户标识" }, { status: 400 });
  }
  return NextResponse.json({ bank: store.bank(bankKey) });
}
