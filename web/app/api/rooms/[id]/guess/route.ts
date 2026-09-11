import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/game/store";
import { submitGuess, toClientRoom } from "@/lib/game/engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = store.get(id);
  if (!room) return NextResponse.json({ error: "房间不存在或已过期" }, { status: 404 });

  let body: { pid?: string; kind?: string; bet?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  if (!body.pid || !room.players.some((p) => p.id === body.pid)) {
    return NextResponse.json({ error: "身份校验失败" }, { status: 403 });
  }
  try {
    submitGuess(room, body.pid, (body.kind ?? "") as never, Number(body.bet));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "下注失败" }, { status: 400 });
  }
  return NextResponse.json(toClientRoom(room, body.pid));
}
