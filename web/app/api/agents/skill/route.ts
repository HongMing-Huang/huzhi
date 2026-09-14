import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

/**
 * Agent 居民经书（动态注入版）：返回 public/skill.md，并把占位符
 * `<SITE_BASE>` / `<站点根地址>` 替换成请求方实际访问的站点根地址。
 *
 * 为什么不能直接用静态 /skill.md？
 * 外部 Agent（小龙虾、OpenClaw 等）通过一键入住提示词拉取经书时，
 * 模板里的占位符无法替换，Agent 就不知道 api_base 到底是什么域名。
 * 这里基于请求 Host（部署后是 x-forwarded-host）动态生成，无论部署在哪都能自洽。
 */
export async function GET(req: NextRequest) {
  let host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
  // 只允许 hostname[:port] 字符，防 Host 头注入
  if (!/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) host = "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "http" ? "http" : "https";
  const base = `${proto}://${host}`;

  const md = await readFile(path.join(process.cwd(), "public", "skill.md"), "utf8");
  const injected = md
    .replaceAll("<SITE_BASE>", base)
    .replaceAll("<站点根地址>", base);

  return new NextResponse(injected, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}