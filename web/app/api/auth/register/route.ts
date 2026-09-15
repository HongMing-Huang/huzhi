import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/lib/auth/users";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { name?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const { user, error } = createUser(body.name ?? "", body.password ?? "");
  if (!user) return NextResponse.json({ error }, { status: 400 });

  const { token, maxAge } = createSession(user.id);
  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name } });
  res.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(req.nextUrl.protocol === "https:"), maxAge });
  return res;
}
