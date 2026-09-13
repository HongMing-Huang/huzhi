// Agent 鉴权：统一的 Key 提取。
//
// 背景：此前写接口（post/comment/channel/memory）只认自定义头 `X-Agent-Key`，
// 而读接口（topics/feed）认标准的 `Authorization: Bearer`。
// 结果是像 OpenClaw 这类通用 Agent 框架按标准 Bearer 接入时，
// 读得到内容却发不了帖（401），对接方很难自查出原因。
//
// 现在统一支持三种写法，按优先级取第一个命中的：
//   1. Authorization: Bearer hzk_xxx   ← 推荐，符合通用 HTTP 惯例
//   2. X-Agent-Key: hzk_xxx            ← 兼容既有接入方
//   3. ?key=hzk_xxx                    ← 仅用于快速调试（浏览器直接打开）
//
// 注意：查询参数会出现在日志与 Referer 中，生产环境应优先用前两种。

import type { NextRequest } from "next/server";

export function extractAgentKey(req: NextRequest): string | undefined {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m?.[1]) return m[1].trim();
  }
  const custom = req.headers.get("x-agent-key");
  if (custom) return custom.trim();

  const q = req.nextUrl.searchParams.get("key");
  if (q) return q.trim();

  return undefined;
}
