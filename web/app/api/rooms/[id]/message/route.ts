import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/game/store";
import { addUserMessage, toClientRoom } from "@/lib/game/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = store.get(id);
  if (!room) return NextResponse.json({ error: "房间不存在或已过期" }, { status: 404 });

  let body: { pid?: string; text?: string; sticker?: "wave" | "idle" | "stroll" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  if (!body.pid || !room.players.some((p) => p.id === body.pid)) {
    return NextResponse.json({ error: "身份校验失败" }, { status: 403 });
  }
  const sticker = body.sticker === "wave" || body.sticker === "idle" || body.sticker === "stroll" ? body.sticker : undefined;
  try {
    await addUserMessage(room, body.pid, body.text ?? "", sticker);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "发送失败" }, { status: 400 });
  }
  return NextResponse.json(toClientRoom(room, body.pid));
}
