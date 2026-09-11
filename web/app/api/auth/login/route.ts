import { NextRequest, NextResponse } from "next/server";
import { findUserByName } from "@/lib/auth/users";
import { verifyPassword } from "@/lib/auth/passwords";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { name?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const user = findUserByName(body.name ?? "");
  // 统一报错文案，不区分「用户不存在」与「密码错误」
  if (!user || !verifyPassword(body.password ?? "", user.passHash)) {
    return NextResponse.json({ error: "名号或密码不对" }, { status: 401 });
  }
  const { token, maxAge } = createSession(user.id);
  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name } });
  res.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions, maxAge });
  return res;
}
