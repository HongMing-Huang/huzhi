import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";
import { store } from "@/lib/game/store";

export const dynamic = "force-dynamic";

/** 我参与的对局会话列表（IM 式管理：每局一条，可回看）。 */
export async function GET(req: NextRequest) {
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  if (!user) return NextResponse.json({ matches: [] });
  const userKey = bankKeyForUser(user.id);

  const matches = store
    .list()
    .filter((r) => r.players.some((p) => (p.userKey ?? `human:${p.name}`) === userKey))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
    .map((r) => {
      const me = r.players.find((p) => (p.userKey ?? `human:${p.name}`) === userKey)!;
      const last = r.messages[r.messages.length - 1];
      return {
        roomId: r.id,
        topic: r.topic.title,
        phase: r.phase,
        round: r.round,
        maxRounds: r.maxRounds,
        myIdentity: me.identity,
        myPoints: r.reveal?.entries.find((e) => e.playerId === me.id)?.points ?? 0,
        lastMessage: last ? { from: last.from === me.id ? "me" : "opp", text: last.text.slice(0, 80) } : null,
        updatedAt: last?.ts ?? r.createdAt,
      };
    });
  return NextResponse.json({ matches });
}
