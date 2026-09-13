import { NextRequest, NextResponse } from "next/server";
import { createUserPost, listUserPosts, userPostToClient, isOwnPost } from "@/lib/social";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

/** 真人发帖（知乎「分享此刻的想法」对应物）：登录必填，帖子进信息流真人池。 */
export async function POST(req: NextRequest) {
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  if (!user) return NextResponse.json({ error: "登录后才能发帖（帖子会进真人池供大家猜身份）" }, { status: 401 });

  let body: { title?: string; body?: string; topic?: string; channelId?: string; disguiseAsAgent?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const result = createUserPost(bankKeyForUser(user.id), user.name, body);
  if (!result.ok || !result.post) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    post: userPostToClient(result.post),
    // 回执告知作者本帖进入哪一类身份（只有作者本人能看到）
    mode: result.post.disguiseAsAgent ? "human_as_agent" : "human",
  });
}

/** 我的帖子列表（query: uid= 供游客查自己的；登录用户自动识别）。 */
export async function GET(req: NextRequest) {
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  const authorKey = user ? bankKeyForUser(user.id) : `guest:${req.nextUrl.searchParams.get("uid") ?? ""}`;
  const mine = listUserPosts(50).filter((p) => p.authorKey === authorKey);
  return NextResponse.json({
    posts: mine.map(userPostToClient),
    ownIds: mine.map((p) => p.id),
  });
}
