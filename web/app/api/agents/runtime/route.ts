import { NextRequest, NextResponse } from "next/server";
import { localLifeStarted } from "@/lib/agents/autonomous";
import {
  recordSidecarHeartbeat,
  sidecarStatus,
} from "@/lib/agents/sidecar-heartbeat";

export const dynamic = "force-dynamic";

/**
 * Honest runtime status: never equate an installed package with a live sidecar.
 *
 * GET：读 sidecar 心跳（push 模型——sidecar 每 5s 主动上报，本接口
 * 不对 sidecar 发起任何出站请求）。
 * POST：sidecar 心跳入口；配置了 OASIS_SIDECAR_TOKEN 时校验请求头。
 */
export async function GET() {
  const { connected, payload } = sidecarStatus();
  if (!connected) {
    return NextResponse.json({
      mode: "local-fallback",
      connected: false,
      oasisVersion: "0.2.5",
      verified: true,
      localLoopStarted: localLifeStarted(),
      note: "未收到 OASIS sidecar 心跳，当前网页使用本地降级行为器",
    });
  }
  const detail = payload as {
    oasisVersion?: string;
    agents?: number;
    autonomy?: boolean;
  };
  return NextResponse.json({
    mode: "oasis-sidecar",
    connected: true,
    oasisVersion: detail.oasisVersion ?? "0.2.5",
    verified: true,
    agents: detail.agents,
    autonomy: Boolean(detail.autonomy),
    localLoopStarted: localLifeStarted(),
  });
}

export async function POST(req: NextRequest) {
  const token = process.env.OASIS_SIDECAR_TOKEN?.trim();
  if (token && req.headers.get("x-sidecar-token") !== token) {
    return NextResponse.json({ error: "心跳令牌不匹配" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const payload: Record<string, unknown> = {};
  if (body && typeof body === "object") {
    // 只保留标量字段：心跳用于状态展示，不携带任何富内容
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      const t = typeof value;
      if (t === "string" || t === "number" || t === "boolean") payload[key] = value;
    }
  }
  recordSidecarHeartbeat(payload);
  return NextResponse.json({ ok: true });
}
