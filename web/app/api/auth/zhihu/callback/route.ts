import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * OAuth 回调：黑客松实测主参数为 authorization_code（兼容 code）。
 * 换 token 用表单字段 code + grant_type=authorization_code，固定官方域名，无其他出站请求。
 */
export async function GET(req: NextRequest) {
  const appId = process.env.ZHIHU_OAUTH_APP_ID;
  const appKey = process.env.ZHIHU_OAUTH_APP_KEY;
  const params = req.nextUrl.searchParams;
  const authCode = params.get("authorization_code") ?? params.get("code");
  const state = params.get("state") ?? "";
  const cookieState = req.cookies.get("tb_oauth_state")?.value ?? "";

  if (!appId || !appKey) {
    return NextResponse.json({ error: "知乎登录暂未启用" }, { status: 501 });
  }
  if (!authCode || !state || state !== cookieState) {
    return NextResponse.json({ error: "授权未完成或状态校验失败，请重试" }, { status: 400 });
  }

  const body = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    grant_type: "authorization_code",
    redirect_uri: new URL("/api/auth/zhihu/callback", req.nextUrl.origin).toString(),
    code: authCode,
  });
  try {
    const res = await fetch("https://openapi.zhihu.com/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { access_token?: string };
    if (!res.ok || !data.access_token) throw new Error("token exchange failed");
    const out = NextResponse.redirect(new URL("/?login=ok", req.nextUrl.origin));
    out.cookies.set("tb_oauth_token", data.access_token, {
      httpOnly: true,
      // HTTPS 部署下强制 Secure；IP 直访（HTTP）场景放开，否则浏览器会丢弃会话
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    out.cookies.delete("tb_oauth_state");
    return out;
  } catch {
    return NextResponse.json({ error: "换取知乎凭证失败，请重试" }, { status: 502 });
  }
}
