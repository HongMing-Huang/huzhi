import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";
import { createHumanRoom, createRoom } from "@/lib/game/engine";
import { completeTicket, completeTickets, createTicket, getTicket, waitingOpponent } from "@/lib/game/matchmaking";
import { FALLBACK_TOPICS, getHotTopics } from "@/lib/zhihu/hot";
import { secureRand } from "@/lib/agents/router";

export const dynamic = "force-dynamic";

function requestUser(req: NextRequest, uid?: string) {
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  return { user, key: user ? bankKeyForUser(user.id) : `guest:${(uid ?? "").slice(0, 40)}` };
}

async function topicFor(topicId?: string) {
  const hot = await getHotTopics(12);
  return (topicId ? hot.topics.find((t) => t.id === topicId) : undefined) ?? hot.topics[Math.floor(secureRand() * hot.topics.length)] ?? FALLBACK_TOPICS[0];
}

export async function POST(req: NextRequest) {
  let body: { action?: "join" | "fallback"; ticketId?: string; uid?: string; name?: string; topicId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求体无效" }, { status: 400 }); }
  const { user, key } = requestUser(req, body.uid);
  if (!user && !body.uid) return NextResponse.json({ error: "缺少用户标识" }, { status: 400 });

  if (body.action === "fallback") {
    const ticket = body.ticketId ? getTicket(body.ticketId, key) : undefined;
    if (!ticket) return NextResponse.json({ error: "匹配凭证已过期" }, { status: 404 });
    if (ticket.status === "matched") return NextResponse.json(ticket);
    const room = createRoom(ticket.name, await topicFor(ticket.topicId), user ? key : undefined);
    completeTicket(ticket.id, room.players[0].id, room.id);
    return NextResponse.json({ status: "matched", roomId: room.id, playerId: room.players[0].id, opponentType: "mystery" });
  }

  const name = (body.name ?? user?.name ?? "").trim().slice(0, 20);
  if (!name) return NextResponse.json({ error: "先给自己起个名号" }, { status: 400 });
  const opponent = waitingOpponent(key, body.topicId);
  const mine = createTicket(key, name, body.topicId);
  if (opponent) {
    const room = createHumanRoom(
      { name: opponent.name, userKey: opponent.userKey.startsWith("user:") ? opponent.userKey : undefined },
      { name, userKey: user ? key : undefined },
      await topicFor(body.topicId ?? opponent.topicId),
    );
    completeTickets(opponent.id, room.players[0].id, mine.id, room.players[1].id, room.id);
    return NextResponse.json({ status: "matched", ticketId: mine.id, roomId: room.id, playerId: room.players[1].id, opponentType: "mystery" });
  }
  return NextResponse.json({ status: "waiting", ticketId: mine.id, startedAt: mine.createdAt });
}

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid") ?? undefined;
  const { key } = requestUser(req, uid);
  const ticket = getTicket(req.nextUrl.searchParams.get("ticketId") ?? "", key);
  if (!ticket) return NextResponse.json({ error: "匹配凭证已过期" }, { status: 404 });
  return NextResponse.json(ticket);
}
