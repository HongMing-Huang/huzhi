import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/game/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 对局实时通道（SSE）：推送消息数/阶段/轮次变化事件，客户端据此拉取最新状态。
 * 事件负载刻意保持轻量，避免泄露密封身份。
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pid = req.nextUrl.searchParams.get("pid") ?? "";
  const room = store.get(id);
  if (!room || !room.players.some((p) => p.id === pid)) {
    return NextResponse.json({ error: "房间不存在" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let lastSig = "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        send("hello", { roomId: id });
        while (!req.signal.aborted) {
          const room = store.get(id);
          if (!room) {
            send("gone", {});
            break;
          }
          const sig = `${room.messages.length}|${room.phase}|${room.round}|${room.players.map((p) => (p.guess ? 1 : 0)).join("")}`;
          if (sig !== lastSig) {
            lastSig = sig;
            send("update", { messages: room.messages.length, phase: room.phase, round: room.round });
          }
          controller.enqueue(encoder.encode(": ping\n\n"));
          await new Promise((r) => setTimeout(r, 900));
        }
      } catch {
        // 客户端断开等异常：静默收尾
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Connection: "keep-alive",
    },
  });
}
