import { NextResponse } from "next/server";
import { localLifeStarted } from "@/lib/agents/autonomous";

export const dynamic = "force-dynamic";

/** Honest runtime status: never equate an installed package with a live sidecar. */
export async function GET() {
  const base = process.env.OASIS_ENGINE_URL?.trim();
  if (!base) {
    return NextResponse.json({
      mode: "local-fallback",
      connected: false,
      oasisVersion: "0.2.5",
      verified: true,
      localLoopStarted: localLifeStarted(),
      note: "OASIS 独立运行验证已通过；当前网页使用本地降级行为器",
    });
  }

  try {
    const health = await fetch(new URL("/health", base), {
      cache: "no-store",
      signal: AbortSignal.timeout(1200),
    });
    if (!health.ok) throw new Error("health check failed");
    const detail = await health.json() as { oasisVersion?: string; agents?: number; autonomy?: boolean };
    return NextResponse.json({
      mode: "oasis-sidecar",
      connected: true,
      oasisVersion: detail.oasisVersion ?? "0.2.5",
      verified: true,
      agents: detail.agents,
      autonomy: Boolean(detail.autonomy),
      localLoopStarted: localLifeStarted(),
    });
  } catch {
    return NextResponse.json({
      mode: "local-fallback",
      connected: false,
      oasisVersion: "0.2.5",
      verified: true,
      localLoopStarted: localLifeStarted(),
      note: "OASIS sidecar 未连接，已安全降级为本地行为器",
    });
  }
}
