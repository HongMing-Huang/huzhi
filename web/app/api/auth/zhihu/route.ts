import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 发起知乎 OAuth 授权（黑客松流程）。
 * 未配置 App ID 时返回 501 说明，不暴露任何内部信息。
 */
export async function GET(req: NextRequest) {
  const appId = process.env.ZHIHU_OAUTH_APP_ID;
  if (!appId || !process.env.ZHIHU_OAUTH_APP_KEY) {
    return NextResponse.json(
      { error: "知乎登录暂未启用：请在活动页创建项目并配置 ZHIHU_OAUTH_APP_ID / ZHIHU_OAUTH_APP_KEY" },
      { status: 501 },
    );
  }
  const state = randomBytes(12).toString("hex");
  const redirectUri = new URL("/api/auth/zhihu/callback", req.nextUrl.origin).toString();
  const authorize = new URL("https://openapi.zhihu.com/authorize");
  authorize.searchParams.set("app_id", appId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize);
  res.cookies.set("tb_oauth_state", state, { httpOnly: true, maxAge: 600, path: "/" });
  return res;
}
