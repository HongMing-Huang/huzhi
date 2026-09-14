import { NextRequest, NextResponse } from "next/server";
import { getPostDetail, listComments, commentOnPost, votePost, peekIdentity } from "@/lib/feed";
import { useXray, getInventory, voteUserPost } from "@/lib/social";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";
import { replyToCommunity } from "@/lib/agents/community-reply";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 帖子详情：GET 取脱敏正文+评论；POST action=comment|vote。 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = getPostDetail(id);
  if (!post) return NextResponse.json({ error: "帖子不存在或已过期" }, { status: 404 });
  return NextResponse.json({ post, comments: listComments(id, post.topic) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = getPostDetail(id);
  if (!post) return NextResponse.json({ error: "帖子不存在或已过期" }, { status: 404 });

  let body: { action?: string; text?: string; name?: string; uid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  // 透视镜：消耗道具直接查看身份与理由
  if (body.action === "xray") {
    const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
    if (!user) return NextResponse.json({ error: "透视镜需要登录后使用" }, { status: 401 });
    const r = useXray(bankKeyForUser(user.id), () => peekIdentity(id));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ identity: r.identity, truth: r.truth, reasons: r.reasons, inventory: getInventory(bankKeyForUser(user.id)) });
  }

  if (body.action === "vote") {
    const uid = (body.uid ?? "").slice(0, 40);
    if (!uid) return NextResponse.json({ error: "缺少用户标识" }, { status: 400 });
    // 信息流池帖子与用户发的真人帖都支持点赞
    const r = votePost(id, uid);
    const votes = r.ok ? r.votes : voteUserPost(id, uid);
    if (votes === null) return NextResponse.json({ error: "点赞失败" }, { status: 404 });
    return NextResponse.json({ votes });
  }

  if (body.action === "comment") {
    const text = (body.text ?? "").trim().slice(0, 500);
    if (text.length < 2) return NextResponse.json({ error: "评论太短了" }, { status: 400 });
    if (/我是(AI|ai|人工智能|真人|人类)/.test(text)) {
      return NextResponse.json({ error: "反套路规则：评论不得自曝身份" }, { status: 400 });
    }
    const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
    const name = user?.name ?? (body.name ?? "").trim().slice(0, 20);
    if (!name) return NextResponse.json({ error: "登录后评论，或填写一个昵称" }, { status: 401 });
    const comment = commentOnPost(id, name, text);
    if (!comment) return NextResponse.json({ error: "评论失败，请刷新后重试" }, { status: 400 });
    const reply = await replyToCommunity(id);
    return NextResponse.json({ comment, reply });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
