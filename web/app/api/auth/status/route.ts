import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** 前端据此决定是否展示「知乎账号登录」。 */
export async function GET() {
  return NextResponse.json({
    oauth: Boolean(process.env.ZHIHU_OAUTH_APP_ID && process.env.ZHIHU_OAUTH_APP_KEY),
    hotlist: Boolean(process.env.ZHIHU_ACCESS_SECRET),
  });
}
