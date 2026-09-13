import { NextRequest, NextResponse } from "next/server";
import { getPostDetail } from "@/lib/feed";
import { analyze, clueOf, type ClueKind } from "@/lib/forensics";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";
import { store } from "@/lib/game/store";

export const dynamic = "force-dynamic";

const VALID: ClueKind[] = ["attribution", "anchor", "timeline", "style"];

/**
 * 线索卡：判断**之前**花积分翻开一条取证线索。
 *
 * GET  /api/clue?postId=xxx          → 列出可翻的线索卡与价格（不含内容）
 * POST /api/clue { postId, kind }    → 花积分翻开一张
 *
 * 与透视镜的区别：透视镜直接给答案（200 分），线索卡只给证据（10–20 分），
 * 判断仍然要玩家自己做。这让"侦查 → 下注"成为一条真正的决策链。
 */
export async function GET(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get("postId") ?? "";
  const post = getPostDetail(postId);
  if (!post) return NextResponse.json({ error: "帖子不存在或已过期" }, { status: 404 });

  const text = post.body ?? post.excerpt;
  // 只返回卡面与价格，不返回 findings（那是要花钱看的）
  const cards = analyze(text).clues.map((c) => ({ kind: c.kind, title: c.title, cost: c.cost }));
  return NextResponse.json({ postId, cards });
}

export async function POST(req: NextRequest) {
  let body: { postId?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  if (!user) {
    return NextResponse.json({ error: "翻线索卡需要登录（要从账号扣积分）" }, { status: 401 });
  }
  if (!body.postId || !VALID.includes(body.kind as ClueKind)) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  const post = getPostDetail(body.postId);
  if (!post) return NextResponse.json({ error: "帖子不存在或已过期" }, { status: 404 });

  const clue = clueOf(post.body ?? post.excerpt, body.kind as ClueKind);
  const bankKey = bankKeyForUser(user.id);
  const balance = store.bank(bankKey);
  if (balance < clue.cost) {
    return NextResponse.json({ error: `积分不足（需要 ${clue.cost}，当前 ${balance}）` }, { status: 400 });
  }

  const bank = store.addBank(bankKey, -clue.cost);
  return NextResponse.json({
    clue: { kind: clue.kind, title: clue.title, score: clue.score, findings: clue.findings },
    cost: clue.cost,
    bank,
  });
}
