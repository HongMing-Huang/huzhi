import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";
import { guessFeedPost } from "@/lib/feed";
import { isOwnPost } from "@/lib/social";
import { store } from "@/lib/game/store";
import { isIdentity } from "@/lib/game/types";
import { takeDoubleIfArmed } from "@/lib/social";

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

  const result = guessFeedPost(body.postId, body.guess as never);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });

  let points = result.points ?? 0;
  const doubled = takeDoubleIfArmed(bankKey);
  if (doubled) points *= 2;

  const bank = store.addBank(bankKey, points);
  return NextResponse.json({
    correct: result.correct,
    identity: result.identity,
    points,
    doubled,
    bank,
    reasons: result.reasons,
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
