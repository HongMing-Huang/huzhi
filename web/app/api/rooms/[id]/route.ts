import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/game/store";
import { toClientRoom } from "@/lib/game/engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pid = req.nextUrl.searchParams.get("pid") ?? "";
  const room = store.get(id);
  if (!room) return NextResponse.json({ error: "房间不存在或已过期" }, { status: 404 });
  if (!room.players.some((p) => p.id === pid)) {
    return NextResponse.json({ error: "你不是这局的玩家" }, { status: 403 });
  }
  return NextResponse.json(toClientRoom(room, pid));
}
