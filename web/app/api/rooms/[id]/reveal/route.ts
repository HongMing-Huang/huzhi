import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/game/store";
import { finishReveal, toClientRoom } from "@/lib/game/engine";

export const dynamic = "force-dynamic";

/** 强制揭晓：双方锁注或轮次耗尽后可触发。 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = store.get(id);
  if (!room) return NextResponse.json({ error: "房间不存在或已过期" }, { status: 404 });

  let body: { pid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  if (!body.pid || !room.players.some((p) => p.id === body.pid)) {
    return NextResponse.json({ error: "身份校验失败" }, { status: 403 });
  }
  if (room.round < 1 && room.messages.length < 2) {
    return NextResponse.json({ error: "至少先聊一轮再揭晓" }, { status: 400 });
  }
  finishReveal(room);
  return NextResponse.json(toClientRoom(room, body.pid));
}
