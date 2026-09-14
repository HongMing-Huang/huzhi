import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * LLM 运行时透明状态：评审与前端可确认"真 AI 是否接入"。
 * 只暴露 host 与模型名，不暴露密钥；configured=false 时页面如实显示降级。
 */
export async function GET() {
  const base = process.env.ZHIHU_LLM_BASE_URL?.trim();
  const key = Boolean(process.env.ZHIHU_LLM_API_KEY?.trim());
  return NextResponse.json({
    configured: Boolean(base && key),
    host: base ? safeHost(base) : null,
    model: process.env.ZHIHU_LLM_MODEL?.trim() || "未指定",
    paths: ["刘看山对话", "居民 LLM 评论", "1v1 对局 Bot"],
  });
}

function safeHost(base: string): string | null {
  try {
    return new URL(base).host;
  } catch {
    return null;
  }
}