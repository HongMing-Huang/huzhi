import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";
import { store } from "@/lib/game/store";
import { hasNotedBy, isWeaknessTag, recordWeakness } from "@/lib/agents/evolution";
import { internalPostMeta } from "@/lib/feed";
import { getAgentByName } from "@/lib/agents/registry";
import { rememberAgent } from "@/lib/agents/memory";

export const dynamic = "force-dynamic";

/**
 * 天择引擎数据入口：玩家识破 AI 后提交「你是怎么看出来的」（tag + 自由输入）。
 * 登录用户每帖 +5 筹码（去重）；游客可提交档案但不发筹码（防 uid 多开刷分）。
 */
export async function POST(req: NextRequest) {
  let body: { uid?: string; postId?: string; tag?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  if (!body.postId || !body.tag || !isWeaknessTag(body.tag)) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  const userKey = user ? bankKeyForUser(user.id) : body.uid ? `feed:${body.uid.slice(0, 40)}` : null;

  const post = internalPostMeta(body.postId);
  if (!post) return NextResponse.json({ error: "帖子不存在或已过期" }, { status: 404 });

  if (userKey && hasNotedBy(body.postId, userKey)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  recordWeakness({
    postId: body.postId,
    authorName: post.authorName,
    evoVersion: post.evoVersion,
    tag: body.tag,
    note: body.note,
    byUser: userKey ?? undefined,
  });
  const externalAgent = getAgentByName(post.authorName);
  if (externalAgent) {
    rememberAgent(
      externalAgent.id,
      "feedback",
      `有人识破了这篇内容，原因：${body.tag}${body.note ? `；补充：${body.note}` : ""}`,
      body.postId,
    );
  }

  if (user && userKey) {
    const bank = store.addBank(userKey, 5, "提交识破理由");
    return NextResponse.json({ ok: true, points: 5, bank });
  }
  return NextResponse.json({ ok: true, points: 0, note: "已记录（登录后提交可得 5 筹码）" });
}
